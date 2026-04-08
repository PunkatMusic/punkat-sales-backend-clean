import express from "express";
import { config } from "./config.mjs";
import { checkoutRouter } from "./routes/checkout.mjs";
import { downloadRouter } from "./routes/download.mjs";
import { licenseRouter } from "./routes/license.mjs";
import { webhookRouter } from "./routes/webhooks.mjs";

const app = express();
const allowedOrigins = new Set([
  config.frontendOrigin,
  "https://www.punkatmusic.com",
  "https://punkatmusic.com",
  "http://localhost:3000",
]);

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (!origin) {
    next();
    return;
  }

  if (!allowedOrigins.has(origin)) {
    next(new Error(`Origin not allowed by CORS: ${origin}`));
    return;
  }

  res.header("Access-Control-Allow-Origin", origin);
  res.header("Vary", "Origin");
  res.header("Access-Control-Allow-Methods", "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
});
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "punkat-sales-backend",
    version: "cors-fix-2",
  });
});

app.use("/api/checkout", checkoutRouter);
app.use("/api/webhooks", webhookRouter);
app.use("/api/download", downloadRouter);
app.use("/api/license", licenseRouter);

app.use((error, _req, res, _next) => {
  const statusCode = error.statusCode || 500;

  res.status(statusCode).json({
    error: error.message || "Unexpected server error.",
    details: error.details || null,
  });
});

app.listen(config.port, () => {
  console.log(`punkat-sales-backend listening on :${config.port}`);
});
