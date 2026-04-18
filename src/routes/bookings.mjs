import express from "express";
import { config } from "../config.mjs";
import { createPayPalPayment, capturePayPalOrder } from "../services/paypalService.mjs";
import { createSumUpPayment, getSumUpCheckout } from "../services/sumupService.mjs";
import {
  attachPaymentReference,
  confirmBookingPayment,
  createBookingHold,
  formatBookingSummary,
  getBookingByToken,
  getPublicBookingServices,
  listAvailabilityForDate,
} from "../services/bookingService.mjs";
import { HttpError } from "../lib/httpError.mjs";
import { sendBookingConfirmationEmail } from "../services/emailService.mjs";

export const bookingRouter = express.Router();

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
  await sendBookingConfirmationEmail({
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
  });
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

bookingRouter.post("/paypal/create", async (req, res, next) => {
  try {
    const booking = await createBookingHold(req.body);
    const successUrl = buildBookingSuccessUrl(booking.booking_token, "paypal");
    const cancelUrl = buildBookingCancelUrl(booking.booking_token, "paypal");
    const checkout = await createPayPalPayment({
      amount: Number(booking.amount),
      currency: booking.currency,
      description: `${booking.service_name} on ${booking.booking_date} at ${String(booking.start_hour).padStart(2, "0")}:00`,
      buyerEmail: booking.customer_email,
      customData: {
        bookingToken: booking.booking_token,
        serviceSlug: booking.service_slug,
        referenceId: booking.service_slug,
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
      description: `${booking.service_name} on ${booking.booking_date} at ${String(booking.start_hour).padStart(2, "0")}:00`,
      buyerEmail: booking.customer_email,
      customData: {
        bookingToken: booking.booking_token,
        serviceSlug: booking.service_slug,
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
