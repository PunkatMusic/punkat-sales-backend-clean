import crypto from "crypto";
import { pool } from "../db/client.mjs";
import {
  BOOKING_HOLD_MINUTES,
  bookingServices,
  getBookingDateOverride,
  getBookingServiceBySlug,
  isStudioClosedOnDate,
  STUDIO_TIMEZONE,
} from "../bookingConfig.mjs";
import { HttpError } from "../lib/httpError.mjs";
import { config } from "../config.mjs";

function ensureDatabaseConfigured() {
  if (!config.databaseUrl) {
    throw new HttpError(503, "Booking database is not configured.");
  }
}

function getLuxembourgNowParts() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: STUDIO_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date()).map((part) => [part.type, part.value])
  );

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function getDayType(date) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return weekday === 0 || weekday === 6 ? "weekend" : "weekday";
}

function parseInteger(value, fallback = null) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function formatHourLabel(hour) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function getEffectiveServiceHours(service, bookingDate) {
  const baseHours = service.hours[getDayType(bookingDate)];
  const override = getBookingDateOverride(bookingDate);

  if (!baseHours) {
    return null;
  }

  let start = baseHours.start;
  let end = baseHours.end;

  if (override?.availableStartHour != null) {
    start = Math.max(start, override.availableStartHour);
  }

  if (override?.availableEndHour != null) {
    end = Math.min(end, override.availableEndHour);
  }

  if (start >= end) {
    return null;
  }

  return { start, end };
}

export function serializeBookingService(service) {
  return {
    slug: service.slug,
    name: service.name,
    rate: service.rate,
    currency: service.currency,
    minimumHours: service.minimumHours,
    maximumHours: service.maximumHours ?? null,
    pricingModel: service.pricingModel,
    participants: service.participants || null,
    bookable: service.bookable,
    contactOnly: service.contactOnly || false,
    hours: service.hours || null,
    description: service.description,
  };
}

export function calculateBookingAmount(service, durationHours, participants) {
  if (service.pricingModel === "per_person_hour") {
    return service.rate * durationHours * participants;
  }

  return service.rate * durationHours;
}

export function validateBookingRequest(input) {
  const service = getBookingServiceBySlug(input?.serviceSlug);

  if (!service) {
    throw new HttpError(404, "Booking service was not found.");
  }

  if (!service.bookable) {
    throw new HttpError(400, "This service is not bookable online.");
  }

  const customerName = String(input?.customerName || "").trim();
  const customerEmail = String(input?.customerEmail || "").trim().toLowerCase();
  const customerPhone = String(input?.customerPhone || "").trim();
  const notes = String(input?.notes || "").trim();
  const bookingDate = String(input?.bookingDate || "").trim();
  const startHour = parseInteger(input?.startHour);
  const durationHours = parseInteger(input?.durationHours);
  const participants = parseInteger(input?.participants, 1);

  if (!customerName || !customerEmail) {
    throw new HttpError(400, "Customer name and email are required.");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) {
    throw new HttpError(400, "Booking date must be provided as YYYY-MM-DD.");
  }

  if (isStudioClosedOnDate(bookingDate)) {
    throw new HttpError(400, "The studio is unavailable on the selected date.");
  }

  if (!Number.isInteger(startHour) || !Number.isInteger(durationHours)) {
    throw new HttpError(400, "Start hour and duration must be whole hours.");
  }

  if (durationHours < service.minimumHours) {
    throw new HttpError(400, `Minimum booking duration is ${service.minimumHours} hour(s).`);
  }

  if (service.maximumHours && durationHours > service.maximumHours) {
    throw new HttpError(400, `Maximum booking duration is ${service.maximumHours} hour(s).`);
  }

  if (service.participants) {
    if (participants < service.participants.min || participants > service.participants.max) {
      throw new HttpError(
        400,
        `Participant count must be between ${service.participants.min} and ${service.participants.max}.`
      );
    }
  }

  const hours = getEffectiveServiceHours(service, bookingDate);
  const endHour = startHour + durationHours;

  if (!hours) {
    throw new HttpError(400, "The studio is unavailable on the selected date.");
  }

  if (startHour < hours.start || endHour > hours.end) {
    throw new HttpError(400, "Selected time is outside the service availability window.");
  }

  const now = getLuxembourgNowParts();

  if (bookingDate < now.date) {
    throw new HttpError(400, "Past dates cannot be booked.");
  }

  if (bookingDate === now.date) {
    const latestUnavailableHour = now.minute > 0 ? now.hour : now.hour - 1;

    if (startHour <= latestUnavailableHour) {
      throw new HttpError(400, "Selected time is already in the past.");
    }
  }

  const normalizedParticipants = service.participants ? participants : 1;

  return {
    service,
    customerName,
    customerEmail,
    customerPhone,
    notes,
    bookingDate,
    startHour,
    endHour,
    durationHours,
    participants: normalizedParticipants,
    amount: calculateBookingAmount(service, durationHours, normalizedParticipants),
    currency: service.currency,
  };
}

async function withStudioLock(client, callback) {
  await client.query("select pg_advisory_xact_lock($1)", [424242]);
  return callback();
}

async function findConflictingBooking(client, bookingDate, startHour, endHour) {
  const result = await client.query(
    `select id
     from studio_bookings
     where booking_date = $1
       and status in ('hold', 'confirmed')
       and (status <> 'hold' or hold_expires_at > now())
       and start_hour < $3
       and end_hour > $2
     limit 1`,
    [bookingDate, startHour, endHour]
  );

  return result.rows[0] || null;
}

export async function listAvailabilityForDate({ serviceSlug, bookingDate }) {
  ensureDatabaseConfigured();

  const service = getBookingServiceBySlug(serviceSlug);

  if (!service || !service.bookable) {
    throw new HttpError(404, "Bookable service was not found.");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) {
    throw new HttpError(400, "Date must be provided as YYYY-MM-DD.");
  }

  if (isStudioClosedOnDate(bookingDate)) {
    return {
      service: serializeBookingService(service),
      bookingDate,
      slots: [],
    };
  }

  const now = getLuxembourgNowParts();
  const hours = getEffectiveServiceHours(service, bookingDate);

  if (!hours) {
    return {
      service: serializeBookingService(service),
      bookingDate,
      slots: [],
    };
  }

  const result = await pool.query(
    `select start_hour, end_hour
     from studio_bookings
     where booking_date = $1
       and status in ('hold', 'confirmed')
       and (status <> 'hold' or hold_expires_at > now())
     order by start_hour asc`,
    [bookingDate]
  );

  const busyRanges = result.rows.map((row) => ({
    startHour: row.start_hour,
    endHour: row.end_hour,
  }));
  const slots = [];

  for (let startHour = hours.start; startHour < hours.end; startHour += 1) {
    const sameDay = bookingDate === now.date;
    const latestUnavailableHour = now.minute > 0 ? now.hour : now.hour - 1;

    if (sameDay && startHour <= latestUnavailableHour) {
      continue;
    }

    const overlapAtStart = busyRanges.some(
      (range) => startHour < range.endHour && startHour >= range.startHour
    );

    if (overlapAtStart) {
      continue;
    }

    let maxDurationHours = 0;

    for (let endHour = startHour + 1; endHour <= hours.end; endHour += 1) {
      const overlaps = busyRanges.some(
        (range) => startHour < range.endHour && endHour > range.startHour
      );

      if (overlaps) {
        break;
      }

      maxDurationHours = endHour - startHour;
    }

    if (maxDurationHours >= service.minimumHours) {
      slots.push({
        startHour,
        label: formatHourLabel(startHour),
        maxDurationHours,
      });
    }
  }

  return {
    service: serializeBookingService(service),
    bookingDate,
    slots,
  };
}

export async function createBookingHold(payload) {
  ensureDatabaseConfigured();

  const booking = validateBookingRequest(payload);
  const client = await pool.connect();

  try {
    await client.query("begin");

    const created = await withStudioLock(client, async () => {
      const conflict = await findConflictingBooking(
        client,
        booking.bookingDate,
        booking.startHour,
        booking.endHour
      );

      if (conflict) {
        throw new HttpError(409, "Selected slot is no longer available.");
      }

      const bookingToken = crypto.randomUUID();
      const result = await client.query(
        `insert into studio_bookings (
           booking_token,
           service_slug,
           service_name,
           customer_name,
           customer_email,
           customer_phone,
           participants,
           notes,
           booking_date,
           start_hour,
           end_hour,
           duration_hours,
           amount,
           currency,
           status,
           hold_expires_at
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'hold', now() + ($15 || ' minutes')::interval)
         returning *`,
        [
          bookingToken,
          booking.service.slug,
          booking.service.name,
          booking.customerName,
          booking.customerEmail,
          booking.customerPhone || null,
          booking.participants,
          booking.notes || null,
          booking.bookingDate,
          booking.startHour,
          booking.endHour,
          booking.durationHours,
          booking.amount,
          booking.currency,
          String(BOOKING_HOLD_MINUTES),
        ]
      );

      return result.rows[0];
    });

    await client.query("commit");
    return created;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function attachPaymentReference({ bookingToken, provider, paymentReference }) {
  ensureDatabaseConfigured();

  const result = await pool.query(
    `update studio_bookings
     set payment_provider = $2,
         payment_reference = $3,
         updated_at = now()
     where booking_token = $1
       and status = 'hold'
       and hold_expires_at > now()
     returning *`,
    [bookingToken, provider, paymentReference]
  );

  if (!result.rows[0]) {
    throw new HttpError(409, "Booking hold expired before payment could start.");
  }

  return result.rows[0];
}

export async function getBookingByToken(bookingToken) {
  ensureDatabaseConfigured();

  const result = await pool.query(
    `select *
     from studio_bookings
     where booking_token = $1
     limit 1`,
    [bookingToken]
  );

  return result.rows[0] || null;
}

export async function getLatestActiveHoldByEmail(customerEmail) {
  ensureDatabaseConfigured();

  const normalizedEmail = String(customerEmail || "").trim().toLowerCase();

  if (!normalizedEmail) {
    throw new HttpError(400, "Customer email is required.");
  }

  const result = await pool.query(
    `select *
     from studio_bookings
     where customer_email = $1
       and status = 'hold'
       and hold_expires_at > now()
     order by created_at desc
     limit 1`,
    [normalizedEmail]
  );

  return result.rows[0] || null;
}

export async function cancelBookingHold({ bookingToken }) {
  ensureDatabaseConfigured();

  const result = await pool.query(
    `update studio_bookings
     set status = 'cancelled',
         hold_expires_at = null,
         updated_at = now()
     where booking_token = $1
       and status = 'hold'
     returning *`,
    [bookingToken]
  );

  return result.rows[0] || null;
}

export async function createAdminBooking(payload) {
  ensureDatabaseConfigured();

  const booking = validateBookingRequest(payload);
  const client = await pool.connect();

  try {
    await client.query("begin");

    const created = await withStudioLock(client, async () => {
      const conflict = await findConflictingBooking(
        client,
        booking.bookingDate,
        booking.startHour,
        booking.endHour
      );

      if (conflict) {
        throw new HttpError(409, "Selected slot is no longer available.");
      }

      const bookingToken = crypto.randomUUID();
      const result = await client.query(
        `insert into studio_bookings (
           booking_token,
           service_slug,
           service_name,
           customer_name,
           customer_email,
           customer_phone,
           participants,
           notes,
           booking_date,
           start_hour,
           end_hour,
           duration_hours,
           amount,
           currency,
           status,
           payment_provider,
           payment_reference,
           paid_at,
           hold_expires_at
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'confirmed', 'manual', $15, now(), null)
         returning *`,
        [
          bookingToken,
          booking.service.slug,
          booking.service.name,
          booking.customerName,
          booking.customerEmail,
          booking.customerPhone || null,
          booking.participants,
          booking.notes || null,
          booking.bookingDate,
          booking.startHour,
          booking.endHour,
          booking.durationHours,
          booking.amount,
          booking.currency,
          `manual_${Date.now()}`,
        ]
      );

      return result.rows[0];
    });

    await client.query("commit");
    return created;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function confirmBookingPayment({ bookingToken, paymentReference, provider }) {
  ensureDatabaseConfigured();

  const client = await pool.connect();

  try {
    await client.query("begin");

    const confirmed = await withStudioLock(client, async () => {
      let booking = null;

      if (bookingToken) {
        const byToken = await client.query(
          `select *
           from studio_bookings
           where booking_token = $1
           limit 1`,
          [bookingToken]
        );
        booking = byToken.rows[0] || null;
      }

      if (!booking && paymentReference) {
        const byReference = await client.query(
          `select *
           from studio_bookings
           where payment_reference = $1
           limit 1`,
          [paymentReference]
        );
        booking = byReference.rows[0] || null;
      }

      if (!booking) {
        throw new HttpError(404, "Booking was not found.");
      }

      if (booking.status === "confirmed") {
        return {
          ...booking,
          already_confirmed: true,
        };
      }

      if (booking.status !== "hold" || !booking.hold_expires_at || new Date(booking.hold_expires_at) <= new Date()) {
        throw new HttpError(409, "Booking hold expired before payment confirmation.");
      }

      const conflict = await client.query(
        `select id
         from studio_bookings
         where booking_date = $1
           and id <> $2
           and status = 'confirmed'
           and start_hour < $4
           and end_hour > $3
         limit 1`,
        [booking.booking_date, booking.id, booking.start_hour, booking.end_hour]
      );

      if (conflict.rows[0]) {
        throw new HttpError(409, "This time slot has already been confirmed by another booking.");
      }

      const result = await client.query(
        `update studio_bookings
         set status = 'confirmed',
             payment_provider = coalesce($2, payment_provider),
             payment_reference = coalesce($3, payment_reference),
             paid_at = now(),
             hold_expires_at = null,
             updated_at = now()
         where id = $1
         returning *`,
        [booking.id, provider || null, paymentReference || null]
      );

      return result.rows[0];
    });

    await client.query("commit");
    return confirmed;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export function formatBookingSummary(booking) {
  return {
    bookingToken: booking.booking_token,
    serviceSlug: booking.service_slug,
    serviceName: booking.service_name,
    customerName: booking.customer_name,
    customerEmail: booking.customer_email,
    customerPhone: booking.customer_phone,
    participants: booking.participants,
    notes: booking.notes,
    bookingDate: booking.booking_date,
    startHour: booking.start_hour,
    endHour: booking.end_hour,
    startLabel: formatHourLabel(booking.start_hour),
    endLabel: formatHourLabel(booking.end_hour),
    durationHours: booking.duration_hours,
    amount: Number(booking.amount),
    currency: booking.currency,
    status: booking.status,
    paymentProvider: booking.payment_provider,
    paidAt: booking.paid_at,
    holdExpiresAt: booking.hold_expires_at,
  };
}

export function getPublicBookingServices() {
  return bookingServices.map(serializeBookingService);
}
