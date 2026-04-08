# Live Setup Checklist

This checklist is for moving Punkat Music plugin sales from manual fulfillment to a fully automated payment, license, and download flow.

## Goal

After a successful payment:

- verify the payment automatically
- generate a one-time serial number
- create a protected download link
- send the buyer an email automatically

## 1. Infrastructure

- [ ] Decide where the backend will run
  - example: VPS, Render, Railway, Fly.io, other Node-capable hosting
- [ ] Confirm Node.js 20+ is available on the backend host
- [ ] Create a production domain or subdomain for the API
  - example: `api.punkatmusic.com`
- [ ] Confirm HTTPS is active for the API domain

## 2. Database

- [ ] Create a PostgreSQL database
- [ ] Save the production connection string
- [ ] Run the schema in [src/db/schema.sql](/Volumes/PunkatStudioExternal/Documents%202026%2003/002%20-%20punkatmusic.com%20backup/Punkatyeni/backend/src/db/schema.sql)
- [ ] Confirm the `products` seed row exists for `surgeq-l5`

## 3. PayPal

- [ ] Confirm the live PayPal Business account that will receive money
- [ ] Create a PayPal developer app for live checkout
- [ ] Collect `PAYPAL_CLIENT_ID`
- [ ] Collect `PAYPAL_CLIENT_SECRET`
- [ ] Create the production PayPal webhook
- [ ] Point the webhook to:
  - `https://api.punkatmusic.com/api/webhooks/paypal`
- [ ] Collect `PAYPAL_WEBHOOK_ID`

## 4. SumUp

- [ ] Confirm the live SumUp merchant account that will receive card payments
- [ ] Collect `SUMUP_API_KEY`
- [ ] Collect `SUMUP_MERCHANT_CODE`
- [ ] Confirm whether SumUp webhook signing will be used in production
- [ ] If yes, confirm the final production webhook endpoint:
  - `https://api.punkatmusic.com/api/webhooks/sumup`

## 5. Email Delivery

- [ ] Choose SMTP provider
  - example: hosting SMTP, Postmark, Mailgun, Resend SMTP
- [ ] Collect `SMTP_HOST`
- [ ] Collect `SMTP_PORT`
- [ ] Collect `SMTP_USER`
- [ ] Collect `SMTP_PASS`
- [ ] Decide the sender address
  - example: `sales@punkatmusic.com`
- [ ] Set `MAIL_FROM`

## 6. Protected Downloads

- [ ] Decide where paid product files will live
  - example: protected server folder, object storage, private bucket
- [ ] Create the protected downloads directory
- [ ] Set `DOWNLOAD_ROOT`
- [ ] Upload the actual product archive
  - example: `SurgEQ-L5-macOS.zip`
- [ ] Decide the final reVVerb archive filename if reVVerb will also move to automatic delivery

## 7. URLs

- [ ] Set `APP_BASE_URL`
  - example: `https://api.punkatmusic.com`
- [ ] Set `FRONTEND_ORIGIN`
  - example: `https://www.punkatmusic.com`
- [ ] Set `SUCCESS_URL`
  - example: `https://www.punkatmusic.com/paypal-success.html`
- [ ] Set `CANCEL_URL`
  - example: `https://www.punkatmusic.com/paypal-cancel.html`

## 8. Product Decisions

- [ ] Confirm which product goes live first with full automation
  - recommended first product: `SurgEQ-L5`
- [ ] Confirm launch price
- [ ] Confirm currency
- [ ] Confirm the exact archive filename used for delivery
- [ ] Confirm how many activations are allowed per license
  - current scaffold default: `1`

## 9. License Rules

- [ ] Confirm serial format is acceptable
  - current scaffold: `PM-SL5-XXXX-XXXX-XXXX`
- [ ] Confirm whether one license equals one device
- [ ] Confirm whether re-installing on the same device should be allowed
- [ ] Confirm whether support can manually reset activations

## 10. Pre-Launch Tests

- [ ] Test PayPal sandbox checkout
- [ ] Test SumUp test or live-safe checkout path
- [ ] Confirm order row is created
- [ ] Confirm webhook reaches the backend
- [ ] Confirm serial is generated
- [ ] Confirm download token is generated
- [ ] Confirm email arrives correctly
- [ ] Confirm download link works
- [ ] Confirm activation endpoint accepts the first activation
- [ ] Confirm repeated activation is blocked or handled by the chosen rule

## 11. Go-Live

- [ ] Set production environment variables
- [ ] Deploy the backend
- [ ] Restart the service
- [ ] Point frontend checkout traffic to production API
- [ ] Run one real purchase end-to-end
- [ ] Confirm buyer receives:
  - payment success
  - download link
  - serial number

## Current Blocking Items

As of 2026-04-07, full automation is still blocked by missing live operational inputs:

- backend hosting target
- production PostgreSQL
- PayPal live API credentials
- SumUp live API credentials
- SMTP credentials
- protected download storage path
