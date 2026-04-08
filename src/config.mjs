import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 8787),
  appBaseUrl: process.env.APP_BASE_URL || "http://localhost:8787",
  frontendOrigin: process.env.FRONTEND_ORIGIN || "http://localhost:3000",
  successUrl: process.env.SUCCESS_URL || "http://localhost:3000/paypal-success.html",
  cancelUrl: process.env.CANCEL_URL || "http://localhost:3000/paypal-cancel.html",
  databaseUrl: process.env.DATABASE_URL || "",
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.MAIL_FROM || "Punkat Music <sales@punkatmusic.com>",
  },
  paypal: {
    clientId: process.env.PAYPAL_CLIENT_ID || "",
    clientSecret: process.env.PAYPAL_CLIENT_SECRET || "",
    webhookId: process.env.PAYPAL_WEBHOOK_ID || "",
    apiBase: process.env.PAYPAL_API_BASE || "https://api-m.sandbox.paypal.com",
  },
  sumup: {
    apiKey: process.env.SUMUP_API_KEY || "",
    merchantCode: process.env.SUMUP_MERCHANT_CODE || "",
    apiBase: process.env.SUMUP_API_BASE || "https://api.sumup.com",
  },
  downloadRoot: process.env.DOWNLOAD_ROOT || "",
};
