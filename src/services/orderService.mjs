import { pool } from "../db/client.mjs";

export async function saveWebhookEvent({ provider, eventId, payload }) {
  if (!process.env.DATABASE_URL) {
    return;
  }

  await pool.query(
    `insert into webhook_events (provider, event_id, payload)
     values ($1, $2, $3::jsonb)
     on conflict (provider, event_id) do nothing`,
    [provider, eventId, JSON.stringify(payload)]
  );
}

export async function createOrderRecord({ provider, externalId, product, buyerEmail }) {
  if (!process.env.DATABASE_URL) {
    return {
      id: `local_${Date.now()}`,
      provider,
      providerOrderId: externalId,
      productId: product.id,
      buyerEmail,
    };
  }

  const result = await pool.query(
    `insert into orders (provider, provider_order_id, product_id, buyer_email, amount, currency, status)
     values ($1, $2, $3, $4, $5, $6, 'pending')
     on conflict (provider_order_id) do update
     set buyer_email = excluded.buyer_email
     returning id, provider, provider_order_id, product_id, buyer_email`,
    [provider, externalId, product.id, buyerEmail, product.price, product.currency]
  );

  return {
    id: result.rows[0].id,
    provider: result.rows[0].provider,
    providerOrderId: result.rows[0].provider_order_id,
    productId: result.rows[0].product_id,
    buyerEmail: result.rows[0].buyer_email,
  };
}

export async function findOrderByProviderOrderId(providerOrderId) {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  const result = await pool.query(
    `select id, provider, provider_order_id, product_id, buyer_email
     from orders
     where provider_order_id = $1
     limit 1`,
    [providerOrderId]
  );

  return result.rows[0] || null;
}

export async function markOrderPaid({ providerOrderId }) {
  if (!process.env.DATABASE_URL) {
    return;
  }

  const result = await pool.query(
    `update orders
     set status = 'paid', paid_at = now()
     where provider_order_id = $1
     returning id, product_id, buyer_email`,
    [providerOrderId]
  );

  return result.rows[0] || null;
}

export async function storeLicense({ orderId, productId, license }) {
  if (!process.env.DATABASE_URL) {
    return;
  }

  await pool.query(
    `insert into licenses (order_id, product_id, serial_hash, serial_last4, status, activation_limit)
     values ($1, $2, $3, $4, $5, $6)`,
    [orderId, productId, license.serialHash, license.serialLast4, license.status, license.activationLimit]
  );
}

export async function storeDownloadToken({ orderId, token }) {
  if (!process.env.DATABASE_URL) {
    return;
  }

  await pool.query(
    `insert into download_tokens (order_id, token_hash, expires_at, max_downloads, download_count)
     values ($1, $2, $3, $4, 0)`,
    [orderId, token.tokenHash, token.expiresAt, token.maxDownloads]
  );
}
