import express from "express";
import { getProductBySlug } from "../catalog.mjs";
import { pool } from "../db/client.mjs";
import { HttpError } from "../lib/httpError.mjs";
import { hashSecret } from "../services/licenseService.mjs";
import { config } from "../config.mjs";

export const licenseRouter = express.Router();

licenseRouter.post("/activate", async (req, res, next) => {
  try {
    const { serial, deviceFingerprint, productSlug } = req.body || {};

    if (!serial || !deviceFingerprint || !productSlug) {
      throw new HttpError(400, "serial, deviceFingerprint, and productSlug are required.");
    }

    if (!config.databaseUrl) {
      throw new HttpError(503, "Activation database is not configured yet.");
    }

    const product = getProductBySlug(productSlug);

    if (!product) {
      throw new HttpError(404, "Product not found.");
    }

    const serialHash = hashSecret(serial);
    const licenseResult = await pool.query(
      `select id, serial_last4, status, activation_limit
       from licenses
       where serial_hash = $1 and product_id = $2
       limit 1`,
      [serialHash, product.id]
    );

    const license = licenseResult.rows[0];

    if (!license) {
      res.json({
        accepted: false,
        reason: "invalid_serial",
      });
      return;
    }

    const activationResult = await pool.query(
      `select id, device_fingerprint, activated_at
       from license_activations
       where license_id = $1
       order by activated_at asc`,
      [license.id]
    );

    const existingActivation = activationResult.rows.find(
      (activation) => activation.device_fingerprint === deviceFingerprint
    );

    if (existingActivation) {
      res.json({
        accepted: true,
        alreadyActivated: true,
        serialLast4: license.serial_last4,
        productSlug,
      });
      return;
    }

    if (activationResult.rows.length >= license.activation_limit) {
      res.json({
        accepted: false,
        reason: "activation_limit_reached",
        serialLast4: license.serial_last4,
      });
      return;
    }

    await pool.query(
      `insert into license_activations (license_id, device_fingerprint)
       values ($1, $2)`,
      [license.id, deviceFingerprint]
    );

    await pool.query(
      `update licenses
       set status = 'active'
       where id = $1`,
      [license.id]
    );

    res.json({
      accepted: true,
      serialHash,
      deviceFingerprint,
      productSlug,
      serialLast4: license.serial_last4,
    });
  } catch (error) {
    next(error);
  }
});

licenseRouter.post("/validate", async (req, res, next) => {
  try {
    const { serial, productSlug } = req.body || {};

    if (!serial || !productSlug) {
      throw new HttpError(400, "serial and productSlug are required.");
    }

    if (!config.databaseUrl) {
      throw new HttpError(503, "Activation database is not configured yet.");
    }

    const product = getProductBySlug(productSlug);

    if (!product) {
      throw new HttpError(404, "Product not found.");
    }

    const serialHash = hashSecret(serial);
    const licenseResult = await pool.query(
      `select id, serial_last4, status
       from licenses
       where serial_hash = $1 and product_id = $2
       limit 1`,
      [serialHash, product.id]
    );

    const license = licenseResult.rows[0];

    if (!license) {
      res.json({
        valid: false,
        reason: "invalid_serial",
      });
      return;
    }

    res.json({
      valid: true,
      serialHash,
      productSlug,
      serialLast4: license.serial_last4,
      status: license.status,
    });
  } catch (error) {
    next(error);
  }
});
