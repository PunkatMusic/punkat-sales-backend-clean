import express from "express";
import { config } from "../config.mjs";
import { createPayPalPayment, capturePayPalOrder } from "../services/paypalService.mjs";
import { createSumUpPayment, getSumUpCheckout } from "../services/sumupService.mjs";
import {
  attachPaymentReference,
  cancelBookingHold,
  confirmBookingPayment,
  createAdminBooking,
  createBookingHold,
  formatBookingSummary,
  getBookingByToken,
  getLatestActiveHoldByEmail,
  getPublicBookingServices,
  listAvailabilityForDate,
} from "../services/bookingService.mjs";
import { HttpError } from "../lib/httpError.mjs";
import { sendBookingAdminNotificationEmail, sendBookingConfirmationEmail } from "../services/emailService.mjs";

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

function buildCheckoutDescription(booking) {
  const formattedDate = formatBookingDate(booking.booking_date);
  const startLabel = `${String(booking.start_hour).padStart(2, "0")}:00`;
  const endLabel = `${String(booking.end_hour).padStart(2, "0")}:00`;

  return `${booking.service_name} | ${formattedDate} | ${startLabel} - ${endLabel}`;
}

function buildBookingSuccessUrl(bookingToken, provider) {
  const url = new URL(config.bookingSuccessUrl);
  url.searchParams.set("bookingToken", bookingToken);
  url.searchParams.set("provider", provider);
  return url.toString();
}

function buildBookingCancelUrl(bookingToken, provider) {
  const url = new URL(config.bookingCancelUrl);
  url.searchParams.set("bookingToken", bookingToken);
  url.searchParams.set("provider", provider);
  return url.toString();
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
    notes: booking.notes,
    paymentProvider: booking.payment_provider,
  };

  await sendBookingConfirmationEmail(payload);
  await sendBookingAdminNotificationEmail(payload);
}

bookingRouter.get("/config", (_req, res) => {
  res.json({
    timezone: "Europe/Luxembourg",
    holdMinutes: 20,
    services: getPublicBookingServices(),
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

bookingRouter.get("/summary/:bookingToken", async (req, res, next) => {
  try {
    const booking = await getBookingByToken(req.params.bookingToken);

    if (!booking) {
      throw new HttpError(404, "Booking was not found.");
    }

    res.json({
      booking: formatBookingSummary(booking),
    });
  } catch (error) {
    next(error);
  }
});

bookingRouter.post("/cancel", async (req, res, next) => {
  try {
    const { bookingToken } = req.body || {};

    if (!bookingToken) {
      throw new HttpError(400, "bookingToken is required.");
    }

    const cancelled = await cancelBookingHold({ bookingToken });

    res.json({
      ok: true,
      released: Boolean(cancelled),
      booking: cancelled ? formatBookingSummary(cancelled) : null,
    });
  } catch (error) {
    next(error);
  }
});

bookingRouter.post("/pending-lookup", async (req, res, next) => {
  try {
    const { customerEmail } = req.body || {};
    const booking = await getLatestActiveHoldByEmail(customerEmail);

    if (!booking) {
      throw new HttpError(404, "No pending booking was found for this email.");
    }

    res.json({
      booking: formatBookingSummary(booking),
    });
  } catch (error) {
    next(error);
  }
});

bookingRouter.post("/resume", async (req, res, next) => {
  try {
    const { bookingToken, provider } = req.body || {};

    if (!bookingToken) {
      throw new HttpError(400, "bookingToken is required.");
    }

    const booking = await getBookingByToken(bookingToken);

    if (!booking) {
      throw new HttpError(404, "Booking was not found.");
    }

    if (booking.status !== "hold" || !booking.hold_expires_at || new Date(booking.hold_expires_at) <= new Date()) {
      throw new HttpError(409, "Booking hold has already expired.");
    }

    const selectedProvider = String(provider || booking.payment_provider || "").trim().toLowerCase();

    if (!selectedProvider || (selectedProvider !== "paypal" && selectedProvider !== "sumup")) {
      throw new HttpError(400, "A valid payment provider is required to resume checkout.");
    }

    if (selectedProvider === "paypal") {
      const checkout = await createPayPalPayment({
        amount: Number(booking.amount),
        currency: booking.currency,
        description: buildCheckoutDescription(booking),
        buyerEmail: booking.customer_email,
        customData: {
          bookingToken: booking.booking_token,
          referenceId: "booking",
        },
        returnUrl: buildBookingSuccessUrl(booking.booking_token, "paypal"),
        cancelUrl: buildBookingCancelUrl(booking.booking_token, "paypal"),
      });

      await attachPaymentReference({
        bookingToken: booking.booking_token,
        provider: "paypal",
        paymentReference: checkout.externalId,
      });

      res.json({
        bookingToken: booking.booking_token,
        provider: "paypal",
        checkoutUrl: checkout.checkoutUrl,
      });
      return;
    }

    const checkout = await createSumUpPayment({
      amount: Number(booking.amount),
      currency: booking.currency,
      description: buildCheckoutDescription(booking),
      buyerEmail: booking.customer_email,
      customData: {
        bookingToken: booking.booking_token,
      },
      redirectUrl: buildBookingSuccessUrl(booking.booking_token, "sumup"),
    });

    await attachPaymentReference({
      bookingToken: booking.booking_token,
      provider: "sumup",
      paymentReference: checkout.checkoutId,
    });

    res.json({
      bookingToken: booking.booking_token,
      provider: "sumup",
      checkoutId: checkout.checkoutId,
      checkoutUrl: checkout.checkoutUrl,
    });
  } catch (error) {
    next(error);
  }
});

bookingRouter.post("/paypal/create", async (req, res, next) => {
  try {
    const booking = await createBookingHold(req.body);
    const successUrl = buildBookingSuccessUrl(booking.booking_token, "paypal");
    const cancelUrl = buildBookingCancelUrl(booking.booking_token, "paypal");
    const checkout = await createPayPalPayment({
      amount: Number(booking.amount),
      currency: booking.currency,
      description: buildCheckoutDescription(booking),
      buyerEmail: booking.customer_email,
      customData: {
        bookingToken: booking.booking_token,
        referenceId: "booking",
      },
      returnUrl: successUrl,
      cancelUrl,
    });

    await attachPaymentReference({
      bookingToken: booking.booking_token,
      provider: "paypal",
      paymentReference: checkout.externalId,
    });

    res.json({
      bookingToken: booking.booking_token,
      checkoutUrl: checkout.checkoutUrl,
    });
  } catch (error) {
    next(error);
  }
});

bookingRouter.post("/paypal/capture", async (req, res, next) => {
  try {
    const { orderId, bookingToken } = req.body || {};

    if (!orderId) {
      throw new HttpError(400, "orderId is required.");
    }

    await capturePayPalOrder(orderId);
    const booking = await confirmBookingPayment({
      bookingToken,
      paymentReference: orderId,
      provider: "paypal",
    });

    if (!booking.already_confirmed) {
      await deliverBookingConfirmation(booking);
    }

    res.json({
      ok: true,
      booking: formatBookingSummary(booking),
    });
  } catch (error) {
    next(error);
  }
});

bookingRouter.post("/sumup/create", async (req, res, next) => {
  try {
    const booking = await createBookingHold(req.body);
    const redirectUrl = buildBookingSuccessUrl(booking.booking_token, "sumup");
    const checkout = await createSumUpPayment({
      amount: Number(booking.amount),
      currency: booking.currency,
      description: buildCheckoutDescription(booking),
      buyerEmail: booking.customer_email,
      customData: {
        bookingToken: booking.booking_token,
      },
      redirectUrl,
    });

    await attachPaymentReference({
      bookingToken: booking.booking_token,
      provider: "sumup",
      paymentReference: checkout.checkoutId,
    });

    res.json({
      bookingToken: booking.booking_token,
      checkoutId: checkout.checkoutId,
      checkoutUrl: checkout.checkoutUrl,
    });
  } catch (error) {
    next(error);
  }
});

bookingRouter.post("/sumup/confirm", async (req, res, next) => {
  try {
    const { bookingToken, checkoutId } = req.body || {};

    if (!checkoutId && !bookingToken) {
      throw new HttpError(400, "checkoutId or bookingToken is required.");
    }

    const existingBooking = bookingToken ? await getBookingByToken(bookingToken) : null;
    const paymentReference = checkoutId || existingBooking?.payment_reference || null;

    if (!paymentReference) {
      throw new HttpError(400, "SumUp checkout ID could not be determined.");
    }

    const checkout = await getSumUpCheckout(paymentReference);

    if (checkout.status !== "PAID") {
      throw new HttpError(409, "SumUp checkout is not marked as paid yet.", checkout);
    }

    const booking = await confirmBookingPayment({
      bookingToken,
      paymentReference,
      provider: "sumup",
    });

    if (!booking.already_confirmed) {
      await deliverBookingConfirmation(booking);
    }

    res.json({
      ok: true,
      booking: formatBookingSummary(booking),
    });
  } catch (error) {
    next(error);
  }
});

bookingRouter.post("/admin/create", async (req, res, next) => {
  try {
    const { adminPassword } = req.body || {};

    if (!config.adminBookingPassword) {
      throw new HttpError(503, "Admin booking password is not configured.");
    }

    if (!adminPassword || adminPassword !== config.adminBookingPassword) {
      throw new HttpError(403, "Admin booking password is invalid.");
    }

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
