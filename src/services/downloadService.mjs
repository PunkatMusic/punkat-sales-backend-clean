import crypto from "crypto";
import { hashSecret } from "./licenseService.mjs";

export function createDownloadToken() {
  const token = crypto.randomBytes(24).toString("hex");

  return {
    token,
    tokenHash: hashSecret(token),
    expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
    maxDownloads: 3,
  };
}
