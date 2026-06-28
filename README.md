# Accessibility Monitor

Venture **INIT-004**. A free static accessibility scan (lead magnet) + continuous EU
Accessibility Act (EAA) compliance monitoring. Built to validate demand at ~$0.

> **Positioning guardrail:** this is automated checking + audit support, **not legal advice**
> and **not a guarantee of compliance**. Keep all copy consistent with that.

## What v1 does

- **Landing page** explaining the EAA-driven value proposition.
- **Free scan** (`POST /api/scan`): fetches one public page and runs static, HTML-only WCAG
  checks (missing alt text, unlabeled form fields, empty links/buttons, missing lang/title,
  heading order, disabled zoom, missing main landmark, vague link text). Returns a 0–100
  score and a prioritized, plain-English report.
- **Waitlist capture** (`POST /api/waitlist`) for the monitoring offer.

Static scanning needs no headless browser, so it deploys to any free serverless tier with
zero infra. Rendered checks (color contrast, focus, keyboard order) are the v2 upgrade via
axe-core + a headless browser.

## Run locally

```bash
npm install
npm run dev          # http://localhost:3000
npm run scan -- https://example.com   # quick CLI test of the scanner
```

## Deploy

Deploys as a standard Next.js app (Vercel free tier). Set the project root to
`ventures/accessibility-monitor`. No environment variables needed for v1.

## Roadmap (see INIT-004)

- **v2:** persist waitlist to an email provider; scheduled re-scans (cron) + emailed dated report.
- **v3:** rendered axe-core scan; Stripe paywall on monitoring ($19–49/mo per domain).
  *Stripe access is wired only at this step.*

## Tech

Next.js 14 (App Router) · TypeScript · cheerio. No database in v1.
