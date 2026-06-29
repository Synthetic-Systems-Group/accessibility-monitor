import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

function getStripe(): Stripe {
  const key = process.env["STRIPE_SECRET_KEY"];
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(key);
}

function getAppUrl(): string {
  return process.env["NEXT_PUBLIC_APP_URL"] ?? "https://accessibility-monitor.vercel.app";
}

export async function POST(req: NextRequest) {
  let body: { email?: string; url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = (body.email || "").trim();
  const monitoredUrl = (body.url || "").trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }
  if (!monitoredUrl) {
    return NextResponse.json({ error: "A URL to monitor is required." }, { status: 400 });
  }

  const priceId = process.env["STRIPE_PRICE_ID"];
  if (!priceId) {
    return NextResponse.json({ error: "Billing not configured." }, { status: 503 });
  }

  const appUrl = getAppUrl();

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        metadata: { monitored_url: monitoredUrl },
      },
      metadata: { monitored_url: monitoredUrl },
      success_url: `${appUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/?canceled=1`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[stripe/checkout]", err);
    return NextResponse.json({ error: "Failed to create checkout session." }, { status: 500 });
  }
}
