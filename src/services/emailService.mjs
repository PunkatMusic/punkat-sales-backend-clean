import nodemailer from "nodemailer";
import { config } from "../config.mjs";

function createTransporter() {
  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    requireTLS: config.smtp.port === 587,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
  });
}

async function sendMailWithTimeout(message) {
  const transporter = createTransporter();

  await Promise.race([
    transporter.sendMail(message),
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error("SMTP delivery timed out."));
      }, 15000);
    }),
  ]);
}

export async function sendPurchaseLinkEmail({ buyerEmail, productName, checkoutUrl }) {
  if (!config.smtp.host || !config.smtp.user || !config.smtp.pass) {
    return {
      delivered: false,
      reason: "SMTP is not configured yet.",
    };
  }

  const subject = `${productName} purchase link`;
  const text = [
    `Your private purchase link for ${productName} is ready.`,
    "",
    `Open checkout: ${checkoutUrl}`,
    "",
    "This link was requested for the email address that will receive the download link and serial after payment.",
  ].join("\n");

  await sendMailWithTimeout({
    from: config.smtp.from,
    to: buyerEmail,
    subject,
    text,
  });

  return {
    delivered: true,
  };
}

export async function sendLicenseEmail({ buyerEmail, productName, serial, downloadUrl }) {
  if (!config.smtp.host || !config.smtp.user || !config.smtp.pass) {
    return {
      delivered: false,
      reason: "SMTP is not configured yet.",
    };
  }

  const subject = `${productName} download and license`;
  const text = [
    `Thank you for purchasing ${productName}.`,
    "",
    `Download link: ${downloadUrl}`,
    `Serial number: ${serial}`,
    "",
    "Keep this email for your records.",
  ].join("\n");

  await sendMailWithTimeout({
    from: config.smtp.from,
    to: buyerEmail,
    subject,
    text,
  });

  return {
    delivered: true,
  };
}
