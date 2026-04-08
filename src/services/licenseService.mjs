import crypto from "crypto";

function chunk(input) {
  return input.match(/.{1,4}/g)?.join("-") || input;
}

export function generatePlainSerial(productCode) {
  const random = crypto.randomBytes(8).toString("hex").toUpperCase();
  return `PM-${productCode}-${chunk(random)}`;
}

export function hashSecret(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function createLicenseRecord(productCode) {
  const serial = generatePlainSerial(productCode);

  return {
    serial,
    serialHash: hashSecret(serial),
    serialLast4: serial.slice(-4),
    status: "issued",
    activationLimit: 1,
  };
}
