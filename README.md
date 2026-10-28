# ON THE WAY LOGISTICS - Website + Admin Panel (linked)

```
OTW_Website_and_Dashboard/
  START-WINDOWS.bat     Double-click to start everything on Windows
  start-mac-linux.sh    Same, for Mac / Linux
  backend/              Node/Express + SQLite server (stores applications, payments/AutoPay)
  website/              Public site with Franchise & Vendor application forms
  dashboard/            Admin panel (Client > Franchise / Vendor, Partner Applications)
```

## Start it (easy way)
1. Install **Node.js LTS** from https://nodejs.org (one time).
2. Windows: double-click **START-WINDOWS.bat**. Mac/Linux: run `./start-mac-linux.sh`.
3. Keep that window open. It is the server; if it is closed, applications cannot be received.
   - Website:      http://localhost:8080/
   - Admin panel:  http://localhost:8080/dashboard/  (also linked in the website footer: "Staff / Admin Login")

Manual way: `cd backend`, `cp .env.example .env`, `npm install`, `npm start`.

## How Franchise / Vendor applications reach the admin panel
1. A visitor fills the **Franchise** or **Vendor** form on the website (home page *or* Services page,
   both use the same `website/partner-forms.js`).
2. The form is sent to the server (`POST /api/partner-applications`). The server gives it an ID
   (FP-000001 for Franchise, VN-000001 for Vendor) and saves every field in `backend/payments.sqlite`.
3. The visitor sees a confirmation page with their ID and details.
4. In the admin panel the application appears automatically:
   - **Partner Applications**: all applications, with status (New, Contacted, Under Review, Documents Pending, Accepted, Rejected).
   - **Client > Franchise** and **Client > Vendor**: the same records split by type.
   - **View form** shows everything the applicant typed. **Edit** changes details or status; changes are saved on the server, so all admins see them.
   - The panel checks for new applications every 30 seconds, shows a pop-up when one arrives, and an orange counter in the sidebar of applications still waiting for Accept / Reject.

## Accept / Reject
- Every application that is still pending has **✓ Accept** and **✕ Reject** buttons, in Partner Applications, in Client > Franchise / Vendor, and inside **View form**.
- Clicking one asks you to confirm and lets you add a note (for Reject: the reason). The decision, the note, which admin decided and when are saved on the server and shown to every admin
  (in View form, and when you hover over the status badge).
- Made a mistake? Open **View form** and click **↺ Undo decision**; the application goes back to *Under Review*.
- Use the **All statuses / Pending / Accepted / Rejected** filter next to the search box to work through applications.
- Older records with the status "Approved" are shown as "Accepted" automatically.

If the server is not running, the website shows an error and keeps the applicant's typing; nothing is silently lost.

## Putting it online
The website and admin panel must be served by this backend (or point to it). If you host the website
somewhere else, add this line before `partner-forms.js` in `index.html` and `services.html`:
`<script>window.OTW_API_BASE='https://your-backend-address';</script>`, do the same in `dashboard/index.html`
before `app.js`, and set `ALLOWED_ORIGIN` in `backend/.env` to the website address. Use HTTPS.

## Before going live (important)
- Admin passwords are still written inside `dashboard/app.js`, which every visitor can download, and the server
  trusts a plain `X-Admin-Email` header. Anyone who reads that file can view all applicants' personal details.
  Move admin login to the server (hashed passwords + sessions) before putting this online, and change the current passwords.
- Back up `backend/payments.sqlite` regularly; it holds all applications.

## Changes in this version
- Accept / Reject buttons for Franchise and Vendor applications, with optional note, undo, decision history and status filter.
- Services page forms now send applications to the server (before, they only saved in the visitor's own browser and never reached the admin panel).
- Home and Services pages share one submit script, so they cannot drift apart again. The Services page also gained the missing Vendor "Full Address" field and "Staff / Admin Login" link.
- Phone number check works again (the old pattern was ignored by current browsers, so any text was accepted).
- If the postal PIN lookup fails, applicants can type their PIN code instead of leaving it blank.
- Admin panel: "+ New Vendor" / "+ New Franchise" on the Client page now actually save; admin edits and status changes are saved on the server (before, they were undone on the next refresh); counts update correctly; real status shown instead of always "Active"; auto-refresh, new-application pop-up and sidebar counter.
