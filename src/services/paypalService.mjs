import crypto from "crypto";
import { config } from "../config.mjs";
import { HttpError } from "../lib/httpError.mjs";

function encodeCustomData(data) {
  return Buffer.from(JSON.stringify(data)).toString("base64url");
}

export function decodePayPalCustomData(customId) {
  if (!customId) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(customId, "base64url").toString("utf8"));
  } catch (_error) {
    return null;
  }
}

async function getAccessToken() {
  const credentials = Buffer.from(`${config.paypal.clientId}:${config.paypal.clientSecret}`).toString("base64");
  const response = await fetch(`${config.paypal.apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const payload = await response.json();

  if (!response.ok || !payload.access_token) {
    throw new HttpError(502, "Failed to get PayPal access token.", payload);
  }

  return payload.access_token;
}

async function paypalFetch(path, { method = "GET", body, accessToken }) {
  const response = await fetch(`${config.paypal.apiBase}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new HttpError(502, "PayPal API request failed.", payload);
  }

  return payload;
}

export async function createPayPalCheckout({ product, buyerEmail }) {
  const accessToken = await getAccessToken();
  const customId = encodeCustomData({
    productSlug: product.slug,
    buyerEmail,
    nonce: crypto.randomUUID(),
  });
  const payload = await paypalFetch("/v2/checkout/orders", {
    method: "POST",
    accessToken,
    body: {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: product.slug,
          custom_id: customId,
          description: product.name,
          amount: {
            currency_code: product.currency,
            value: product.price.toFixed(2),
          },
        },
      ],
      payer: {
        email_address: buyerEmail,
      },
      application_context: {
        brand_name: "Punkat Music",
        user_action: "PAY_NOW",
        return_url: config.successUrl,
        cancel_url: config.cancelUrl,
      },
    },
  });

  const approveUrl = payload.links?.find((link) => link.rel === "approve")?.href;

  if (!approveUrl) {
    throw new HttpError(502, "PayPal approval URL was not returned.", payload);
  }

  return {
    provider: "paypal",
    checkoutUrl: approveUrl,
    externalId: payload.id,
    customId,
  };
}

export async function capturePayPalOrder(orderId) {
  const accessToken = await getAccessToken();
  return paypalFetch(`/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    accessToken,
    body: {},
  });
}

export async function verifyPayPalWebhook(req) {
  const accessToken = await getAccessToken();
  const payload = await paypalFetch("/v1/notifications/verify-webhook-signature", {
    method: "POST",
    accessToken,
    body: {
      auth_algo: req.get("PAYPAL-AUTH-ALGO"),
      cert_url: req.get("PAYPAL-CERT-URL"),
      transmission_id: req.get("PAYPAL-TRANSMISSION-ID"),
      transmission_sig: req.get("PAYPAL-TRANSMISSION-SIG"),
      transmission_time: req.get("PAYPAL-TRANSMISSION-TIME"),
      webhook_id: config.paypal.webhookId,
      webhook_event: req.body,
    },
  });

  if (payload.verification_status !== "SUCCESS") {
    throw new HttpError(400, "PayPal webhook signature verification failed.", payload);
  }

  return {
    verified: true,
  };
}
