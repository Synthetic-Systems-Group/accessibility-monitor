import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { Resend } from "resend";
import { scanUrl, type ScanReport } from "@/lib/scanner";

export const runtime = "nodejs";
export const maxDuration = 300;

function getStripe(): Stripe {
  const key = process.env["STRIPE_SECRET_KEY"];
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(key);
}

function getResend(): Resend {
  const key = process.env["RESEND_API_KEY"];
  if (!key) throw new Error("RESEND_API_KEY not configured");
  return new Resend(key);
}

function severityEmoji(s: string): string {
  return { critical: "🔴", serious: "🟠", moderate: "🟡", minor: "⚪" }[s] ?? "•";
}

function buildEmailHtml(email: string, report: ScanReport): string {
  const hostname = new URL(report.url).hostname;
  const scoreColor = report.score >= 90 ? "#15803d" : report.score >= 70 ? "#a16207" : "#b91c1c";
  const issuesHtml = report.issues.length === 0
    ? "<p>✅ No issues found this week. Nice work.</p>"
    : report.issues.map(i => `
      <div style="border-left:4px solid #e5e7eb;padding:8px 12px;margin:8px 0">
        <strong>${severityEmoji(i.severity)} ${i.title}</strong>
        <span style="color:#6b7280;font-size:12px;margin-left:8px">WCAG ${i.wcag}</span>
        <p style="margin:4px 0;color:#374151">${i.help}</p>
        ${i.sample ? `<pre style="background:#f9fafb;padding:6px;font-size:11px;overflow:auto">${i.sample}</pre>` : ""}
      </div>`).join("");

  return `<!DOCTYPE html>
<html>
<body style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111">
  <h2 style="margin-bottom:4px">Weekly Accessibility Report</h2>
  <p style="color:#6b7280;margin-top:0">${hostname} · ${new Date(report.scannedAt).toDateString()}</p>

  <div style="display:inline-block;border:3px solid ${scoreColor};border-radius:50%;width:72px;height:72px;line-height:72px;text-align:center;font-size:28px;font-weight:700;color:${scoreColor};margin:16px 0">
    ${report.score}
  </div>
  <p style="color:#6b7280;font-size:13px">${report.passed} check${report.passed !== 1 ? "s" : ""} passed · ${report.issues.length} issue type${report.issues.length !== 1 ? "s" : ""} found</p>

  <h3 style="border-top:1px solid #e5e7eb;padding-top:16px">Issues found</h3>
  ${issuesHtml}

  <h3 style="border-top:1px solid #e5e7eb;padding-top:16px">Notes</h3>
  <ul style="color:#6b7280;font-size:13px">
    ${report.notes.map(n => `<li>${n}</li>`).join("")}
  </ul>

  <p style="font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:16px">
    You're receiving this because you subscribed to weekly accessibility monitoring for ${hostname}.
    This is an automated check and an audit aid, not a guarantee of legal compliance.<br><br>
    <a href="https://accessibility-monitor.vercel.app">accessibility-monitor.vercel.app</a>
  </p>
</body>
</html>`;
}

export async function GET(req: NextRequest) {
  // Verify this is a legitimate Vercel cron call (or dev override)
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env["CRON_SECRET"]}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const stripe = getStripe();
  const resend = getResend();
  const fromEmail = process.env["RESEND_FROM_EMAIL"] ?? "reports@accessibility-monitor.vercel.app";

  // Fetch all active subscriptions with a monitored_url in metadata
  const subscriptions = await stripe.subscriptions.list({ status: "active", limit: 100 });
  const results: Array<{ url: string; email: string; score?: number; error?: string }> = [];

  for (const sub of subscriptions.data) {
    const monitoredUrl = sub.metadata?.monitored_url;
    if (!monitoredUrl) continue;

    // Get customer email
    const customer = await stripe.customers.retrieve(sub.customer as string);
    if (!customer || customer.deleted) continue;
    const email = (customer as Stripe.Customer).email;
    if (!email) continue;

    try {
      const report = await scanUrl(monitoredUrl);
      await resend.emails.send({
        from: `Accessibility Monitor <${fromEmail}>`,
        to: email,
        subject: `Weekly accessibility report for ${new URL(monitoredUrl).hostname} — score ${report.score}/100`,
        html: buildEmailHtml(email, report),
      });
      results.push({ url: monitoredUrl, email, score: report.score });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      console.error(`[cron/scan] failed for ${monitoredUrl}:`, msg);
      results.push({ url: monitoredUrl, email, error: msg });
    }
  }

  return NextResponse.json({ scanned: results.length, results });
}
