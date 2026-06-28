/**
 * Google Apps Script — Accessibility Monitor waitlist sink.
 *
 * Receives waitlist signups POSTed by the app's /api/waitlist route and appends
 * them to the "Accessibility Monitor — Waitlist" Google Sheet. Free, durable, and
 * owned entirely by Andrew's Google account — no third-party service, no API key
 * stored in the app (the deployment URL is the only thing the app holds, and it
 * only accepts appends).
 *
 * Deploy steps are in SETUP-WAITLIST.md. After deploying as a Web App, copy the
 * /exec URL into the Vercel env var WAITLIST_WEBHOOK_URL.
 */

// The "Accessibility Monitor — Waitlist" sheet (created 2026-06-15).
const SHEET_ID = '1yANw6_EiPE8Bj4QBpQlPMa8QJZRnj6k5wQEiZNiPqNI';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheets()[0];
    sheet.appendRow([
      data.ts || new Date().toISOString(),
      data.email || '',
      data.url || '',
      data.scannedScore === 0 || data.scannedScore ? data.scannedScore : '',
      data.source || '',
      data.ua || '',
    ]);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
