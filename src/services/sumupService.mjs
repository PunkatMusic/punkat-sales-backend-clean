import crypto from "crypto";
import { createHmac } from "crypto";
import { config } from "../config.mjs";
import { HttpError } from "../lib/httpError.mjs";

function encodeCheckoutReference(data) {
  return Buffer.from(JSON.stringify(data)).toString("base64url");
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
  const response = await fetch(`${config.sumup.apiBase}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.sumup.apiKey}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new HttpError(502, "SumUp API request failed.", payload);
  }

  return payload;
}

export async function createSumUpCheckout({ product, buyerEmail }) {
  const checkoutReference = encodeCheckoutReference({
    productSlug: product.slug,
    buyerEmail,
    nonce: crypto.randomUUID(),
  });
  const payload = await sumupFetch("/v0.1/checkouts", {
    method: "POST",
    body: {
      checkout_reference: checkoutReference,
      amount: product.price,
      currency: product.currency,
      merchant_code: config.sumup.merchantCode,
      description: product.name,
      pay_to_email: "sales@punkatmusic.com",
      redirect_url: config.successUrl,
    },
  });

  return {
    provider: "sumup",
    externalId: payload.id,
    checkoutId: payload.id,
    checkoutReference,
  };
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
