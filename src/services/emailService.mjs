import nodemailer from "nodemailer";
import { config } from "../config.mjs";

export async function sendLicenseEmail({ buyerEmail, productName, serial, downloadUrl }) {
  if (!config.smtp.host || !config.smtp.user || !config.smtp.pass) {
    return {
      delivered: false,
      reason: "SMTP is not configured yet.",
    };
  }

  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
  });

  const subject = `${productName} download and license`;
  const text = [
    `Thank you for purchasing ${productName}.`,
    "",
    `Download link: ${downloadUrl}`,
    `Serial number: ${serial}`,
    "",
    "Keep this email for your records.",
  ].join("\n");

  await transporter.sendMail({
    from: config.smtp.from,
    to: buyerEmail,
    subject,
    text,
  });

  return {
    delivered: true,
  };
}
