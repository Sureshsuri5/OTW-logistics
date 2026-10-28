# ONTHEWAY LOGISTICS Payment Backend

This backend is the secure integration layer for the Payments → AutoPay page.

## Test mode first
1. Create a Razorpay account and use **Test/Sandbox** API credentials.
2. Create one Razorpay Subscription Plan for each frequency you want to offer and put the plan IDs in `.env`.
3. Copy `.env.example` to `.env` and fill only the server-side credentials.
4. Install Node.js 20+.
5. Run `npm install` then `npm start`.
6. Open `http://localhost:8080/`.
7. For webhooks, deploy the backend to a public **HTTPS** URL; Razorpay webhooks cannot use a private localhost URL for production delivery.
8. In Razorpay Dashboard, configure the webhook URL as `/api/razorpay/webhook` and use the same webhook secret as `RAZORPAY_WEBHOOK_SECRET`.

## Security
- API secrets remain in `.env` on the server; never put them in `index.html` or `app.js`.
- Webhook signatures are checked with HMAC SHA-256 before updating transaction state.
- The frontend never marks a gateway payment successful by itself.
- No UPI PIN, CVV or raw card credentials are stored.
- The four authorized admin emails are enforced by the backend API as an additional layer; production authentication should be moved to a real server-side session/identity provider before public launch.
- Use HTTPS, secure server sessions, database backups and a secrets manager for production.

## Important
The supplied website remains usable as a browser/localStorage admin demo. Until this backend is deployed and configured, AutoPay records are **authorization requests/configuration only**; no real money is moved. Live payments must not be enabled until Razorpay onboarding/KYC, HTTPS, webhook verification and end-to-end sandbox testing are complete.


## Shared Franchise/Vendor Applications
The public website posts new applications to `POST /api/partner-applications`. The admin dashboard loads them from `GET /api/partner-applications` after opening **Partner Applications**. The API stores applications in the same SQLite database file as the backend (`payments.sqlite`). Keep the backend running while testing both pages.

For local testing, start the backend from this folder with `npm install` and `npm start` (port 8080 by default). The public site uses `http://localhost:8080`; change `PARTNER_API_BASE` in the dashboard `app.js` and the URL in the public website submit handler if your deployed backend has a different address. Set `ALLOWED_ORIGIN` to your deployed website origin before production use.
