ONTHEWAY LOGISTICS - AUTOMATIC EXCEL PAYMENTS FIX

This version supports the supplied "On going sheet.xlsx" format.

Supported wide-format workbook:
- Sheet can use any tab name (including Sheet1 or a custom name); the importer detects the header row from sheet contents.
- Header row is detected automatically.
- NAME column is detected automatically.
- Date columns such as 24/8/2026, 25/8/2026, ... 30/8/2026 are detected automatically.
- Daily values such as 28/24 are read as LM=28, Primary=24, Club=4.
- "payment completed" is read as the weekly completed payment amount.
- "Amount payment" notes are not treated as daily payment amounts.
- Daily Work is updated/created by Rider + Date.
- Weekly Payments are updated by Rider + Week.
- Re-importing the same or edited Excel updates existing records instead of creating duplicates.
- Rider names with location text in parentheses are matched to existing riders where possible.

How to use:
1. Open index.html.
2. Login as admin.
3. Open Payments.
4. Click Import Excel.
5. Select the Excel file.
6. The Payments page will show the weekly payment from "payment completed" and Daily Work will update from the date columns.

The browser needs internet access to load the SheetJS Excel reader from the CDN in index.html.


PAYMENT MANAGEMENT + AUTOPAY
=============================
Payments now includes a Payment Dashboard, AutoPay controls, recurring frequency (daily/weekly/monthly), consent capture, pause/resume/cancel controls, retry policy, gateway configuration, payment history filters, CSV/Excel-compatible report export, and payment audit logging.

Razorpay integration is included as a secure backend scaffold under backend/. The website is sandbox-ready but does not perform simulated or live money movement from the browser. Live processing requires Razorpay onboarding/KYC, server-side credentials, HTTPS, configured subscription plans, and verified webhooks.

See backend/README.md for setup.

PAYMENTS AUTOMATION UPDATE
==========================
The importer now scans all workbook tabs when a tab is not named Weekly Summary or All Riders Daily Settlement. For wide-format workbooks it detects a header row containing NAME/Rider Name and date columns, so custom tab names no longer cause an immediate "Required sheet not found" error. It continues to upsert daily records by Rider + Date and refreshes the table after import.
