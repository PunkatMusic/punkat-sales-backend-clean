import crypto from "crypto";
import { createHmac } from "crypto";
import { config } from "../config.mjs";
import { HttpError } from "../lib/httpError.mjs";

function encodeCheckoutReference(data) {
  return Buffer.from(JSON.stringify(data)).toString("base64url");
}

function createShortCheckoutReference() {
  // SumUp limits checkout_reference to fewer than 90 characters.
  // The payment/order ID remains the authoritative lookup key in our database.
  return `pm_${crypto.randomBytes(16).toString("hex")}`;
}

function serializeSumUpRequest(body) {
  const serialized = JSON.stringify(body);

  // Keep EUR amounts explicitly at two decimal places in the outgoing JSON.
  // SumUp defines amount as a JSON number, so 5.00 remains numeric (not a string).
  if (typeof body?.amount !== "number") {
    return serialized;
  }

  return serialized.replace(
    /"amount":-?\d+(?:\.\d+)?/,
    `"amount":${body.amount.toFixed(2)}`
  );
}

export function decodeCheckoutReference(reference) {
  if (!reference) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(reference, "base64url").toString("utf8"));
  } catch (_error) {
    return null;
  }
}

async function sumupFetch(path, { method = "GET", body }) {
  const url = `${config.sumup.apiBase}${path}`;
  const requestBody = body ? serializeSumUpRequest(body) : undefined;

  if (config.sumup.debugLogging) {
    console.log("SUMUP_DEBUG_REQUEST", {
      url,
      method,
      accessTokenLast3: config.sumup.apiKey.slice(-3),
      payload: body || null,
      serializedPayload: requestBody || null,
    });
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${config.sumup.apiKey}`,
      "Content-Type": "application/json",
    },
    body: requestBody,
  });

  const rawResponse = await response.text();
  let payload;

  try {
    payload = rawResponse ? JSON.parse(rawResponse) : null;
  } catch (_error) {
    payload = { rawResponse };
  }

  if (config.sumup.debugLogging) {
    console.log("SUMUP_DEBUG_RESPONSE", {
      url,
      status: response.status,
      ok: response.ok,
      payload,
    });
  }

  if (!response.ok) {
    throw new HttpError(502, "SumUp API request failed.", payload);
  }

  return payload;
}

export async function createSumUpPayment({
  amount,
  currency,
  description,
  buyerEmail,
  customData,
  redirectUrl,
}) {
  const checkoutReference = createShortCheckoutReference();
  const payload = await sumupFetch("/v0.1/checkouts", {
    method: "POST",
    body: {
      checkout_reference: checkoutReference,
      amount,
      currency,
      merchant_code: config.sumup.merchantCode,
      description,
      redirect_url: redirectUrl || config.successUrl,
      // SumUp notifies this server directly after the hosted payment finishes.
      return_url: `${config.appBaseUrl}/api/webhooks/sumup`,
      hosted_checkout: {
        enabled: true,
      },
    },
  });

  return {
    provider: "sumup",
    externalId: payload.id,
    checkoutId: payload.id,
    checkoutReference,
    checkoutUrl: payload.hosted_checkout_url || null,
  };
}

export async function createSumUpCheckout({ product, buyerEmail }) {
  return createSumUpPayment({
    amount: product.price,
    currency: product.currency,
    description: product.name,
    buyerEmail,
    customData: {
      productSlug: product.slug,
    },
    redirectUrl: config.successUrl,
  });
}

export async function getSumUpCheckout(checkoutId) {
  return sumupFetch(`/v0.1/checkouts/${checkoutId}`, {
    method: "GET",
  });
}

export async function verifySumUpWebhook(req) {
  const signature = req.get("x-payload-signature");

  if (!signature || !config.sumup.apiKey) {
    return { verified: true, skipped: true };
  }

  const rawPayload = JSON.stringify(req.body);
  const digest = createHmac("sha256", config.sumup.apiKey).update(rawPayload).digest("hex");

  if (digest !== signature) {
    throw new HttpError(400, "SumUp webhook signature verification failed.");
  }

  return {
    verified: true,
  };
}
