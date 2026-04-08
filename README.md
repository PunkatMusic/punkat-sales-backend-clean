# Punkat Sales Backend

This folder contains the first backend scaffold for selling Punkat Music plugins and apps with:

- PayPal checkout
- SumUp card checkout
- automated license generation
- secure download tokens
- email fulfillment

## Status

This is a scaffold, not a finished production integration yet.

Included:

- route structure
- environment variable template
- PostgreSQL schema
- checkout creation endpoints
- PayPal create/capture scaffold against Orders v2
- SumUp checkout creation scaffold for Card Widget
- webhook fulfillment skeleton
- license and download token generators

Still to complete:

- end-to-end test runs with real credentials
- protected file streaming from `DOWNLOAD_ROOT`
- database-backed license validation and activation enforcement
- production-safe idempotency guards for repeated webhook/capture callbacks

## Run

1. Install Node.js 20+.
2. From `backend/`, run `npm install`.
3. Copy `.env.example` to `.env` and fill in the secrets.
4. Create the PostgreSQL database and run `src/db/schema.sql`.
5. Start the API with:

```bash
npm run dev
```

The API will listen on `PORT` and expose:

- `POST /api/checkout/paypal/create`
- `POST /api/checkout/paypal/capture`
- `POST /api/checkout/sumup/create`
- `POST /api/checkout/sumup/confirm`
- `POST /api/webhooks/paypal`
- `POST /api/webhooks/sumup`
- `GET /api/download/:token`
- `POST /api/license/activate`
- `POST /api/license/validate`

## Frontend wiring

The static product page currently prepared for the first paid product is:

- `public/surgeql5.html`

It posts checkout requests to:

- `/api/checkout/paypal/create`
- `/api/checkout/paypal/capture`
- `/api/checkout/sumup/create`
- `/api/checkout/sumup/confirm`

If the API is deployed on a separate domain, update the frontend fetch base or proxy `/api/*` to the backend.

## Production Rollout

Use these files before going live:

- live checklist: [LIVE_SETUP_CHECKLIST.md](/Volumes/PunkatStudioExternal/Documents%202026%2003/002%20-%20punkatmusic.com%20backup/Punkatyeni/backend/LIVE_SETUP_CHECKLIST.md)
- production env template: [.env.production.template](/Volumes/PunkatStudioExternal/Documents%202026%2003/002%20-%20punkatmusic.com%20backup/Punkatyeni/backend/.env.production.template)

The checklist is the main source of truth for what is still missing before fully automated delivery can be switched on.
