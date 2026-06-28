// Durable waitlist persistence.
//
// The app is "durable-by-configuration": set ONE env var and signups are
// stored durably; with none set, every signup is still written as a
// structured log line (recoverable from Vercel runtime logs) so a lead is
// never silently dropped. Adapters, in priority order:
//
//   1. Vercel KV / Upstash Redis REST  — set KV_REST_API_URL + KV_REST_API_TOKEN
//      (Vercel dashboard → Storage → KV auto-injects these). Durable list + de-dupe set.
//   2. Generic webhook                 — set WAITLIST_WEBHOOK_URL
//      (e.g. a Google Apps Script bound to a Sheet, Zapier, Make). POSTs the signup JSON.
//   3. Structured log backstop         — always runs. `[waitlist] {json}`.
//
// recordSignup never throws: a storage outage must not break the signup UX.

export interface Signup {
  email: string;
  url?: string;
  scannedScore?: number;
  source: string;
  ts: string; // ISO 8601
  ua?: string;
}

export interface RecordResult {
  ok: boolean;
  /** which durable adapter accepted the signup, if any */
  storedVia: "kv" | "webhook" | null;
  /** non-fatal problems worth surfacing in logs */
  warnings: string[];
}

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const WEBHOOK_URL = process.env.WAITLIST_WEBHOOK_URL;

const KV_LIST_KEY = "waitlist:signups"; // RPUSH log of every signup (JSON)
const KV_SET_KEY = "waitlist:emails"; // SADD for de-dupe / quick count

function withTimeout(ms: number): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(t) };
}

/** Append to a Vercel KV / Upstash Redis list (+ de-dupe set) via the REST API. */
async function persistToKv(signup: Signup): Promise<void> {
  // Upstash REST pipeline: array of command arrays.
  const body = JSON.stringify([
    ["RPUSH", KV_LIST_KEY, JSON.stringify(signup)],
    ["SADD", KV_SET_KEY, signup.email.toLowerCase()],
  ]);
  const { signal, done } = withTimeout(5000);
  try {
    const res = await fetch(`${KV_URL!.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KV_TOKEN}`,
        "Content-Type": "application/json",
      },
      body,
      signal,
    });
    if (!res.ok) {
      throw new Error(`KV responded ${res.status}: ${await res.text().catch(() => "")}`);
    }
  } finally {
    done();
  }
}

/** POST the signup to a generic webhook (Apps Script / Zapier / Make / etc.). */
async function persistToWebhook(signup: Signup): Promise<void> {
  const { signal, done } = withTimeout(5000);
  try {
    const res = await fetch(WEBHOOK_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(signup),
      signal,
    });
    if (!res.ok) {
      throw new Error(`Webhook responded ${res.status}: ${await res.text().catch(() => "")}`);
    }
  } finally {
    done();
  }
}

export async function recordSignup(signup: Signup): Promise<RecordResult> {
  const warnings: string[] = [];

  // Always emit the structured backstop first — durable adapters can fail,
  // this line cannot be lost as long as the request reached the function.
  console.log(`[waitlist] ${JSON.stringify(signup)}`);

  // First configured adapter that succeeds wins — we do not double-write. Webhook
  // is only attempted if KV is unconfigured or fails (see header priority order).
  if (KV_URL && KV_TOKEN) {
    try {
      await persistToKv(signup);
      return { ok: true, storedVia: "kv", warnings };
    } catch (err) {
      warnings.push(`kv failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (WEBHOOK_URL) {
    try {
      await persistToWebhook(signup);
      return { ok: true, storedVia: "webhook", warnings };
    } catch (err) {
      warnings.push(`webhook failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // No durable adapter configured (or all failed) — the log backstop above
  // is the record of last resort. Surface a warning so it is visible in logs.
  if (warnings.length) for (const w of warnings) console.warn(`[waitlist] ${w}`);
  else console.warn("[waitlist] no durable store configured — relying on log backstop only");

  return { ok: true, storedVia: null, warnings };
}

/** True when at least one durable adapter is configured. */
export function hasDurableStore(): boolean {
  return Boolean((KV_URL && KV_TOKEN) || WEBHOOK_URL);
}
