import express from "express";
import { BOOKING_HOLD_MINUTES, getBookingClosures } from "../bookingConfig.mjs";
import { config } from "../config.mjs";
import {
  cancelBookingHold,
  confirmBookingRequest,
  createAdminBooking,
  createBookingRequest,
  createStudioClosures,
  deleteStudioClosure,
  formatBookingSummary,
  listApprovalPendingBookings,
  getPublicBookingServices,
  listStudioClosures,
  listAvailabilityForDate,
  validateBookingRequest,
} from "../services/bookingService.mjs";
import { HttpError } from "../lib/httpError.mjs";
import {
  sendBookingAdminNotificationEmail,
  sendBookingConfirmationEmail,
  sendOtherServiceRequestEmails,
  sendBookingRequestCancellationEmail,
  sendBookingRequestEmails,
} from "../services/emailService.mjs";

export const bookingRouter = express.Router();

function formatBookingDate(value) {
  if (!value) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const text = String(value);
  return text.length >= 10 ? text.slice(0, 10) : text;
}

async function deliverBookingConfirmation(booking) {
  const payload = {
    buyerEmail: booking.customer_email,
    customerName: booking.customer_name,
    serviceName: booking.service_name,
    bookingDate: booking.booking_date,
    startLabel: `${String(booking.start_hour).padStart(2, "0")}:00`,
    endLabel: `${String(booking.end_hour).padStart(2, "0")}:00`,
    durationHours: booking.duration_hours,
    participants: booking.participants,
    amount: Number(booking.amount),
    currency: booking.currency,
    customerPhone: booking.customer_phone,
    customerLanguage: booking.customer_language,
    notes: booking.notes,
    paymentProvider: booking.payment_provider,
  };

  await sendBookingConfirmationEmail(payload);
  await sendBookingAdminNotificationEmail(payload);
}

function buildBookingRequestEmailPayload(booking) {
  return {
    buyerEmail: booking.customer_email,
    customerName: booking.customer_name,
    serviceName: booking.service_name,
    bookingDate: booking.booking_date,
    startLabel: `${String(booking.start_hour).padStart(2, "0")}:00`,
    endLabel: `${String(booking.end_hour).padStart(2, "0")}:00`,
    durationHours: booking.duration_hours,
    participants: booking.participants,
    amount: Number(booking.amount),
    currency: booking.currency,
    customerPhone: booking.customer_phone,
    customerLanguage: booking.customer_language,
    notes: booking.notes,
    bookingReference: booking.payment_reference,
  };
}

function ensureAdminPassword(adminPassword) {
  if (!config.adminBookingPassword) {
    throw new HttpError(503, "Admin booking password is not configured.");
  }

  if (!adminPassword || adminPassword !== config.adminBookingPassword) {
    throw new HttpError(403, "Admin booking password is invalid.");
  }
}

bookingRouter.get("/config", (_req, res) => {
  res.json({
    timezone: "Europe/Luxembourg",
    holdMinutes: BOOKING_HOLD_MINUTES,
    services: getPublicBookingServices(),
    closures: getBookingClosures(),
  });
});

bookingRouter.get("/availability", async (req, res, next) => {
  try {
    const { serviceSlug, date } = req.query;
    const availability = await listAvailabilityForDate({
      serviceSlug: String(serviceSlug || ""),
      bookingDate: String(date || ""),
    });

    res.json(availability);
  } catch (error) {
    next(error);
  }
});

bookingRouter.post("/other-services-request", async (req, res, next) => {
  try {
    const request = validateBookingRequest(req.body);

    if (request.service.slug !== "other-services") {
      throw new HttpError(400, "This endpoint is only for Other Services requests.");
    }

    if (!request.notes) {
      throw new HttpError(400, "Please tell us which service you need.");
    }

    await sendOtherServiceRequestEmails(request);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

bookingRouter.post("/request/create", async (req, res, next) => {
  try {
    const booking = await createBookingRequest(req.body);

    try {
      await sendBookingRequestEmails(buildBookingRequestEmailPayload(booking));
    } catch (emailError) {
      console.error("Booking request emails could not be delivered", emailError);
    }

    res.json({
      bookingToken: booking.booking_token,
      booking: formatBookingSummary(booking),
    });
  } catch (error) {
    next(error);
  }
});

bookingRouter.post("/admin/create", async (req, res, next) => {
  try {
    const { adminPassword } = req.body || {};
    ensureAdminPassword(adminPassword);

    const booking = await createAdminBooking(req.body);
    await deliverBookingConfirmation(booking);

    res.json({
      ok: true,
      booking: formatBookingSummary(booking),
    });
  } catch (error) {
    next(error);
  }
});

bookingRouter.post("/admin/requests/list", async (req, res, next) => {
  try {
    ensureAdminPassword(req.body?.adminPassword);
    const bookings = await listApprovalPendingBookings();
    res.json({ ok: true, bookings: bookings.map((booking) => formatBookingSummary(booking)) });
  } catch (error) {
    next(error);
  }
});

bookingRouter.post("/admin/requests/confirm", async (req, res, next) => {
  try {
    const { adminPassword, bookingToken } = req.body || {};
    ensureAdminPassword(adminPassword);
    const booking = await confirmBookingRequest({ bookingToken });
    await deliverBookingConfirmation(booking);

    res.json({ ok: true, booking: formatBookingSummary(booking) });
  } catch (error) {
    next(error);
  }
});

bookingRouter.post("/admin/requests/cancel", async (req, res, next) => {
  try {
    const { adminPassword, bookingToken } = req.body || {};
    ensureAdminPassword(adminPassword);
    const booking = await cancelBookingHold({ bookingToken });

    if (!booking) {
      throw new HttpError(404, "Booking request was not found.");
    }

    await sendBookingRequestCancellationEmail({
      buyerEmail: booking.customer_email,
      customerName: booking.customer_name,
      customerLanguage: booking.customer_language,
      serviceName: booking.service_name,
      bookingDate: booking.booking_date,
      startLabel: `${String(booking.start_hour).padStart(2, "0")}:00`,
      endLabel: `${String(booking.end_hour).padStart(2, "0")}:00`,
    });

    res.json({ ok: true, booking: formatBookingSummary(booking) });
  } catch (error) {
    next(error);
  }
});

bookingRouter.post("/admin/closures/list", async (req, res, next) => {
  try {
    const { adminPassword, fromDate, toDate } = req.body || {};
    ensureAdminPassword(adminPassword);

    const closures = await listStudioClosures({
      fromDate: String(fromDate || ""),
      toDate: String(toDate || ""),
    });

    res.json({
      ok: true,
      closures: closures.map((booking) => formatBookingSummary(booking)),
    });
  } catch (error) {
    next(error);
  }
});

bookingRouter.post("/admin/closures/create", async (req, res, next) => {
  try {
    const { adminPassword, startDate, endDate, availableStartHour, availableEndHour, note } = req.body || {};
    ensureAdminPassword(adminPassword);

    const closures = await createStudioClosures({
      startDate: String(startDate || ""),
      endDate: String(endDate || startDate || ""),
      availableStartHour,
      availableEndHour,
      note: String(note || ""),
    });

    res.json({
      ok: true,
      closures: closures.map((booking) => formatBookingSummary(booking)),
    });
  } catch (error) {
    next(error);
  }
});

bookingRouter.post("/admin/closures/delete", async (req, res, next) => {
  try {
    const { adminPassword, bookingToken } = req.body || {};
    ensureAdminPassword(adminPassword);

    const deleted = await deleteStudioClosure({ bookingToken: String(bookingToken || "") });

    if (!deleted) {
      throw new HttpError(404, "Closure was not found.");
    }

    res.json({
      ok: true,
      closure: formatBookingSummary(deleted),
    });
  } catch (error) {
    next(error);
  }
});
