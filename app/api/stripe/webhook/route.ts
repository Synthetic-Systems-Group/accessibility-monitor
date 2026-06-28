import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

function getStripe(): Stripe {
  const key = process.env["STRIPE_SECRET_KEY"];
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(key);
}

export async function POST(req: NextRequest) {
  const secret = process.env["STRIPE_WEBHOOK_SECRET"];
  if (!secret) {
    console.error("[stripe/webhook] STRIPE_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header." }, { status: 400 });
  }

  const body = await req.arrayBuffer();
  const stripe = getStripe();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(Buffer.from(body), sig, secret);
  } catch (err) {
    console.error("[stripe/webhook] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const monitoredUrl = session.metadata?.monitored_url;
    const email = session.customer_email ?? session.customer_details?.email;

    // The monitored_url is already set on the subscription via subscription_data.metadata
    // at checkout creation time. No extra write needed — cron reads it from Stripe directly.
    console.log(`[stripe/webhook] new subscription: ${email} → ${monitoredUrl}`);
  }

  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    const monitoredUrl = sub.metadata?.monitored_url;
    console.log(`[stripe/webhook] subscription cancelled: ${monitoredUrl}`);
  }

  return NextResponse.json({ received: true });
}
