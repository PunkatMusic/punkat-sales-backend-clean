import express from "express";
import { getProductBySlug } from "../catalog.mjs";
import { HttpError } from "../lib/httpError.mjs";
import { createOrderRecord, findOrderByProviderOrderId, markOrderPaid, storeDownloadToken, storeLicense } from "../services/orderService.mjs";
import { capturePayPalOrder, createPayPalCheckout, decodePayPalCustomData } from "../services/paypalService.mjs";
import { createSumUpCheckout, decodeCheckoutReference, getSumUpCheckout } from "../services/sumupService.mjs";
import { createLicenseRecord } from "../services/licenseService.mjs";
import { createDownloadToken } from "../services/downloadService.mjs";
import { sendLicenseEmail, sendPurchaseLinkEmail } from "../services/emailService.mjs";
import { config } from "../config.mjs";

export const checkoutRouter = express.Router();

function resolveDownloadUrl(product, token) {
  if (product.deliveryMode === "direct_link" && product.downloadUrl) {
    return product.downloadUrl;
  }

  return `${config.appBaseUrl}/api/download/${token.token}`;
}

function validateBody(body) {
  if (!body?.buyerEmail || !body?.productSlug) {
    throw new HttpError(400, "buyerEmail and productSlug are required.");
  }

  const product = getProductBySlug(body.productSlug);

  if (!product) {
    throw new HttpError(404, "Product not found.");
  }

  return product;
}

function createCheckoutAccessToken(data) {
  return Buffer.from(JSON.stringify(data)).toString("base64url");
}

export function decodeCheckoutAccessToken(token) {
  if (!token) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
  } catch (_error) {
    return null;
  }
}

function buildCheckoutPageUrl(product, buyerEmail) {
  const pageByProduct = {
    revverb: "revverb-buy.html",
  };
  const access = createCheckoutAccessToken({
    productSlug: product.slug,
    buyerEmail,
  });
  const page = pageByProduct[product.slug] || `${product.slug}-buy.html`;

  return `${config.frontendOrigin}/${page}?access=${encodeURIComponent(access)}`;
}

checkoutRouter.post("/access-link/send", async (req, res, next) => {
  try {
    const product = validateBody(req.body);
    const checkoutUrl = buildCheckoutPageUrl(product, req.body.buyerEmail);

    await sendPurchaseLinkEmail({
      buyerEmail: req.body.buyerEmail,
      productName: product.name,
      checkoutUrl,
    });

    res.json({
      ok: true,
      checkoutUrl,
      message: "Purchase link email sent.",
    });
  } catch (error) {
    next(error);
  }
});

checkoutRouter.post("/paypal/create", async (req, res, next) => {
  try {
    const product = validateBody(req.body);
    const checkout = await createPayPalCheckout({
      product,
      buyerEmail: req.body.buyerEmail,
    });

    const order = await createOrderRecord({
      provider: checkout.provider,
      externalId: checkout.externalId,
      product,
      buyerEmail: req.body.buyerEmail,
    });

    res.json({
      checkoutUrl: checkout.checkoutUrl,
      orderId: order.id,
    });
  } catch (error) {
    next(error);
  }
});

checkoutRouter.post("/sumup/create", async (req, res, next) => {
  try {
    const product = validateBody(req.body);
    const checkout = await createSumUpCheckout({
      product,
      buyerEmail: req.body.buyerEmail,
    });

    const order = await createOrderRecord({
      provider: checkout.provider,
      externalId: checkout.externalId,
      product,
      buyerEmail: req.body.buyerEmail,
    });

    res.json({
      checkoutId: checkout.checkoutId,
      checkoutReference: checkout.checkoutReference,
      checkoutUrl: checkout.checkoutUrl,
      orderId: order.id,
    });
  } catch (error) {
    next(error);
  }
});

checkoutRouter.post("/promo/redeem", async (req, res, next) => {
  try {
    const product = validateBody(req.body);
    const promoCode = req.body?.promoCode?.trim();

    if (!promoCode) {
      throw new HttpError(400, "promoCode is required.");
    }

    if (promoCode !== config.promo.testCode) {
      throw new HttpError(403, "Promo code is invalid.");
    }

    const license = createLicenseRecord(product.code);
    const token = createDownloadToken();
    const downloadUrl = resolveDownloadUrl(product, token);

    await sendLicenseEmail({
      buyerEmail: req.body.buyerEmail,
      productName: product.name,
      serial: license.serial,
      downloadUrl,
    });

    res.json({
      ok: true,
      serialLast4: license.serialLast4,
      downloadUrl,
      message: "Promo fulfillment email sent.",
    });
  } catch (error) {
    next(error);
  }
});

checkoutRouter.post("/paypal/capture", async (req, res, next) => {
  try {
    const { orderId, productSlug } = req.body || {};

    if (!orderId || !productSlug) {
      throw new HttpError(400, "orderId and productSlug are required.");
    }

    const product = getProductBySlug(productSlug);

    if (!product) {
      throw new HttpError(404, "Product not found.");
    }

    const capture = await capturePayPalOrder(orderId);
    const order = await findOrderByProviderOrderId(orderId);
    const purchaseUnit = capture.purchase_units?.[0] || null;
    const customData = decodePayPalCustomData(purchaseUnit?.payments?.captures?.[0]?.custom_id || purchaseUnit?.custom_id);
    const buyerEmail =
      order?.buyer_email ||
      customData?.buyerEmail ||
      capture.payer?.email_address ||
      null;

    if (!buyerEmail) {
      throw new HttpError(400, "Buyer email could not be determined from the PayPal capture.");
    }

    if (order) {
      await markOrderPaid({ providerOrderId: orderId });
    }

    const license = createLicenseRecord(product.code);
    const token = createDownloadToken();
    const downloadUrl = resolveDownloadUrl(product, token);

    if (order) {
      await storeLicense({ orderId: order.id, productId: product.id, license });
      await storeDownloadToken({ orderId: order.id, token });
    }
    await sendLicenseEmail({
      buyerEmail,
      productName: product.name,
      serial: license.serial,
      downloadUrl,
    });

    res.json({
      ok: true,
      captureId: capture.purchase_units?.[0]?.payments?.captures?.[0]?.id || null,
      serialLast4: license.serialLast4,
      downloadUrl,
    });
  } catch (error) {
    next(error);
  }
});

checkoutRouter.post("/sumup/confirm", async (req, res, next) => {
  try {
    const { checkoutId, productSlug } = req.body || {};

    if (!checkoutId || !productSlug) {
      throw new HttpError(400, "checkoutId and productSlug are required.");
    }

    const product = getProductBySlug(productSlug);

    if (!product) {
      throw new HttpError(404, "Product not found.");
    }

    const checkout = await getSumUpCheckout(checkoutId);

    if (checkout.status !== "PAID") {
      throw new HttpError(409, "SumUp checkout is not marked as paid yet.", checkout);
    }

    const order = await findOrderByProviderOrderId(checkoutId);
    const referenceData = decodeCheckoutReference(checkout.checkout_reference);
    const buyerEmail = checkout.customer_email || req.body.buyerEmail || referenceData?.buyerEmail || null;

    if (!buyerEmail) {
      throw new HttpError(400, "Buyer email could not be determined from the SumUp checkout.");
    }

    if (order) {
      await markOrderPaid({ providerOrderId: checkoutId });
    }

    const license = createLicenseRecord(product.code);
    const token = createDownloadToken();
    const downloadUrl = resolveDownloadUrl(product, token);

    if (order) {
      await storeLicense({ orderId: order.id, productId: product.id, license });
      await storeDownloadToken({ orderId: order.id, token });
    }
    await sendLicenseEmail({
      buyerEmail,
      productName: product.name,
      serial: license.serial,
      downloadUrl,
    });

    res.json({
      ok: true,
      checkoutId,
      serialLast4: license.serialLast4,
      downloadUrl,
    });
  } catch (error) {
    next(error);
  }
});
