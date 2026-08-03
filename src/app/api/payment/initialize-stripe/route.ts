import { requireRole } from "@/lib/auth/require";
import { createClient } from "@/lib/supabase/server";
import Stripe from "stripe";

export async function POST(req: Request) {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
    if (!stripeKey) {
      return new Response(
        JSON.stringify({ error: "Stripe not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (stripeKey.startsWith("pk_")) {
      return new Response(
        JSON.stringify({ error: "Stripe secret key is invalid. Use sk_test_... for server-side Stripe requests." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const stripe = new Stripe(stripeKey);
    const user = await requireRole("PASSENGER");
    const supabase = await createClient();

    const { amount_cents, email, ride_id } = await req.json();

    if (!amount_cents || !email || !ride_id) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields: amount_cents, email, ride_id",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verify ride belongs to user
    const { data: ride, error: rideError } = await supabase
      .from("rides")
      .select("id, passenger_id, payment_status")
      .eq("id", ride_id)
      .single();

    if (rideError || !ride || ride.passenger_id !== user.id) {
      return new Response(JSON.stringify({ error: "Ride not found or unauthorized" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (ride.payment_status === "PAID") {
      return new Response(JSON.stringify({ error: "Ride already paid" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Determine base URL for redirects: prefer request Origin, then NEXT_PUBLIC_APP_URL, then localhost
    const originHeader = (req.headers.get("origin") || "").trim();
    const baseUrl = originHeader || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "zar", // South African Rand
            product_data: {
              name: `Ride #${ride_id}`,
              description: "Ride-hailing service payment",
            },
            unit_amount: amount_cents,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${baseUrl}/passenger?payment=success&session={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/passenger?payment=cancelled`,
      customer_email: email,
      metadata: {
        ride_id,
        user_id: user.id,
      },
    });

    // Create a payments row (if table exists) to track the session
    try {
      const { error: insertErr } = await supabase.from("payments").insert({
        ride_id,
        user_id: user.id,
        provider: "stripe",
        provider_reference: session.id,
        amount_cents: amount_cents,
        status: "PENDING",
      });
      if (insertErr) console.warn("payments insert warning:", insertErr.message);
    } catch (e) {
      console.warn("payments table insert attempt failed:", e);
    }

    // Update ride to PENDING
    await supabase
      .from("rides")
      .update({ payment_status: "PENDING" })
      .eq("id", ride_id);

    return new Response(
      JSON.stringify({
        sessionId: session.id,
        clientSecret: session.client_secret,
        url: session.url,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "Unknown error";
    const sanitizedMessage = rawMessage
      .replace(/(sk_(test|live)_[A-Za-z0-9]+)/g, "[REDACTED]")
      .replace(/(pk_(test|live)_[A-Za-z0-9]+)/g, "[REDACTED]");
    const clientMessage = sanitizedMessage.includes("Invalid API Key provided")
      ? "Stripe secret key is invalid or misconfigured. Check STRIPE_SECRET_KEY in .env.local."
      : sanitizedMessage;

    console.error("Stripe initialization error:", error);
    return new Response(
      JSON.stringify({
        error: clientMessage,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
