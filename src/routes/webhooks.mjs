import express from "express";
import { getProductBySlug } from "../catalog.mjs";
import { config } from "../config.mjs";
import { createDownloadToken } from "../services/downloadService.mjs";
import { sendLicenseEmail } from "../services/emailService.mjs";
import { createLicenseRecord } from "../services/licenseService.mjs";
import { findOrderByProviderOrderId, markOrderPaid, saveWebhookEvent, storeDownloadToken, storeLicense } from "../services/orderService.mjs";
import { verifyPayPalWebhook } from "../services/paypalService.mjs";
import { getSumUpCheckout, verifySumUpWebhook } from "../services/sumupService.mjs";

export const webhookRouter = express.Router();

async function fulfillPaidOrder({ provider, payload, providerOrderId, buyerEmail, product, orderId }) {
  const existingOrder = await findOrderByProviderOrderId(providerOrderId);
  const effectiveOrderId = existingOrder?.id || orderId;
  const effectiveBuyerEmail = existingOrder?.buyer_email || buyerEmail;
  const license = createLicenseRecord(product.code);
  const token = createDownloadToken();
  const downloadUrl = `${config.appBaseUrl}/api/download/${token.token}`;

  await markOrderPaid({ providerOrderId });
  await storeLicense({ orderId: effectiveOrderId, productId: product.id, license });
  await storeDownloadToken({ orderId: effectiveOrderId, token });
  await saveWebhookEvent({
    provider,
    eventId: payload.id || providerOrderId,
    payload,
  });
  await sendLicenseEmail({
    buyerEmail: effectiveBuyerEmail,
    productName: product.name,
    serial: license.serial,
    downloadUrl,
  });

  return {
    serialLast4: license.serialLast4,
    downloadUrl,
  };
}

webhookRouter.post("/paypal", async (req, res, next) => {
  try {
    await verifyPayPalWebhook(req);
    const product = getProductBySlug("revverb");

    const result = await fulfillPaidOrder({
      provider: "paypal",
      payload: req.body,
      providerOrderId: req.body.resource?.id || req.body.id || "unknown_paypal_order",
      buyerEmail: req.body.resource?.payer?.email_address || "customer@example.com",
      product,
      orderId: req.body.resource?.custom_id || `paypal_${Date.now()}`,
    });

    res.json({
      received: true,
      fulfillment: result,
    });
  } catch (error) {
    next(error);
  }
});

webhookRouter.post("/sumup", async (req, res, next) => {
  try {
    await verifySumUpWebhook(req);
    const checkout = await getSumUpCheckout(req.body.id);

    if (checkout.status !== "PAID") {
      res.status(202).json({
        received: true,
        ignored: true,
        reason: `Checkout status is ${checkout.status}`,
      });
      return;
    }

    const product = getProductBySlug("revverb");

    const result = await fulfillPaidOrder({
      provider: "sumup",
      payload: req.body,
      providerOrderId: checkout.id || req.body.id || "unknown_sumup_order",
      buyerEmail: checkout.customer_email || "customer@example.com",
      product,
      orderId: checkout.checkout_reference || `sumup_${Date.now()}`,
    });

    res.json({
      received: true,
      fulfillment: result,
    });
  } catch (error) {
    next(error);
  }
});
