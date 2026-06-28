import { NextRequest, NextResponse } from "next/server";
import { recordSignup, type Signup } from "@/lib/waitlist";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { email?: string; url?: string; scannedScore?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = (body.email || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });
  }

  const signup: Signup = {
    email,
    url: typeof body.url === "string" ? body.url.trim() || undefined : undefined,
    scannedScore: typeof body.scannedScore === "number" ? body.scannedScore : undefined,
    source: "accessibility-monitor-web",
    ts: new Date().toISOString(),
    ua: req.headers.get("user-agent") || undefined,
  };

  // recordSignup never throws and always keeps a backstop record; we report ok
  // to the user as long as validation passed.
  await recordSignup(signup);
  return NextResponse.json({ ok: true });
}
