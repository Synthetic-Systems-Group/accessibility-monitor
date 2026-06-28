# Deploying the Accessibility Monitor

**Status (2026-06-15): LIVE in production.**
→ https://accessibility-monitor.vercel.app
(team *syntheticnerds-projects*, project `accessibility-monitor`)

The sandbox egress allowlist now includes `api.vercel.com`, so Jasper deploys directly
via the Vercel CLI from this repo. The earlier git-integration workaround is no longer
needed.

## Redeploy (Jasper, from the sandbox)

The project is already linked (`.vercel/` holds the link; gitignored). From
`ventures/accessibility-monitor/`:

```bash
# VERCEL_ORG_ID is set in the env; unset it so the linked project is used cleanly.
env -u VERCEL_ORG_ID npx vercel deploy --prod --yes \
  --scope syntheticnerds-projects --token "$VERCEL_TOKEN"
```

First-time link (already done; here for reference):
```bash
env -u VERCEL_ORG_ID -u VERCEL_PROJECT_ID npx vercel link --yes \
  --project accessibility-monitor --scope syntheticnerds-projects --token "$VERCEL_TOKEN"
```

Team: `syntheticnerds-projects` (`team_qZ3ud5ca7kT8zWuH29dfbnqH`).

## Alternative — Git integration (no sandbox egress needed)

In Vercel → **Add New… → Project** → import the GitHub repo, set **Root Directory** to
`ventures/accessibility-monitor`, framework **Next.js**. Vercel then builds on every push.
Use this if the egress allowlist is ever tightened again.

## Durable waitlist storage — DONE (2026-06-15)

`app/api/waitlist/route.ts` → `lib/waitlist.ts` is **durable-by-configuration** and is now
**live**: signups persist to the team's existing Upstash KV store (connected to this project;
`KV_REST_API_*` injected as env vars), with a structured `[waitlist] {...}` log line as a
backstop. Verified end-to-end. To inspect leads: `LRANGE waitlist:signups 0 -1` (Upstash
console or KV REST). See `waitlist-store/SETUP-WAITLIST.md` for alternatives (dedicated store
or a Google-Sheet sink) if ever needed.
