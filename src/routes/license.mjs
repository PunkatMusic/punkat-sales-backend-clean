import express from "express";
import { HttpError } from "../lib/httpError.mjs";
import { hashSecret } from "../services/licenseService.mjs";

export const licenseRouter = express.Router();

licenseRouter.post("/activate", async (req, res, next) => {
  try {
    const { serial, deviceFingerprint, productSlug } = req.body || {};

    if (!serial || !deviceFingerprint || !productSlug) {
      throw new HttpError(400, "serial, deviceFingerprint, and productSlug are required.");
    }

    res.json({
      accepted: true,
      serialHash: hashSecret(serial),
      deviceFingerprint,
      productSlug,
      note: "Activation storage and conflict checks will be connected in the next step.",
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

    res.json({
      valid: true,
      serialHash: hashSecret(serial),
      productSlug,
      note: "Database-backed validation is scaffolded but not wired yet.",
    });
  } catch (error) {
    next(error);
  }
});
