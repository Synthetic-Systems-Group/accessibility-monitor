# Wire durable waitlist storage (one-time, ~3 min, free)

> **STATUS — DONE (2026-06-15): durable storage is LIVE.** The app now persists every
> signup to the team's existing Upstash KV store (`upstash-kv-bistre-plank`), connected to
> the `accessibility-monitor` project; `KV_REST_API_URL`/`KV_REST_API_TOKEN` are injected as
> project env vars. Verified end-to-end (write via live `/api/waitlist` → record present in
> `waitlist:signups`, de-dupe in `waitlist:emails`). The options below are kept for reference
> / if you ever want a dedicated store or a Google-Sheet sink instead.

The app is **durable-by-configuration**: `lib/waitlist.ts` writes every signup to a
durable store *if one is configured*, and always writes a structured `[waitlist] {...}`
log line as a backstop so a lead is never silently dropped. To flip durable storage on,
set **one** environment variable. Two options — pick one.

## Option A — Google Sheet via Apps Script (recommended: $0, no marketplace, Andrew owns the data)

Destination sheet already exists:
**Accessibility Monitor — Waitlist** →
https://docs.google.com/spreadsheets/d/1yANw6_EiPE8Bj4QBpQlPMa8QJZRnj6k5wQEiZNiPqNI/edit
(headers: `timestamp, email, url, scannedScore, source, userAgent`)

1. Open the sheet → **Extensions → Apps Script**.
2. Replace the default code with the contents of [`Code.gs`](./Code.gs). Save.
3. **Deploy → New deployment → Web app.** Set *Execute as* **Me**, *Who has access*
   **Anyone**. Deploy and authorize. Copy the **Web app URL** (ends in `/exec`).
4. Add it to Vercel:
   ```bash
   cd ventures/accessibility-monitor
   echo "PASTE_THE_EXEC_URL" | npx vercel env add WAITLIST_WEBHOOK_URL production \
     --scope syntheticnerds-projects --token "$VERCEL_TOKEN"
   npx vercel deploy --prod --yes --scope syntheticnerds-projects --token "$VERCEL_TOKEN"
   ```
   (Or paste the URL in Vercel → Project → Settings → Environment Variables, then redeploy.)

The deployment URL only accepts appends to this one sheet, so it is safe to hold in env.

## Option B — Vercel KV (Upstash) — fewest clicks, stays inside Vercel

In Vercel → project **accessibility-monitor** → **Storage → Create → KV**. Vercel
auto-injects `KV_REST_API_URL` and `KV_REST_API_TOKEN`; `lib/waitlist.ts` already reads
them (RPUSH to `waitlist:signups`, SADD to `waitlist:emails`). Redeploy. **Note:** KV is a
marketplace add-on — free tier exists, but on a Pro team it attaches to billing, so confirm
the free allotment is acceptable before enabling (governance: spending/subscriptions).

## Verify after wiring
```bash
curl -s -X POST https://accessibility-monitor.vercel.app/api/waitlist \
  -H 'Content-Type: application/json' \
  -d '{"email":"verify@example.com","url":"https://example.com","scannedScore":95}'
```
Option A → a new row appears in the sheet. Option B → `redis-cli LRANGE waitlist:signups 0 -1`
(or the Upstash console) shows the entry.
