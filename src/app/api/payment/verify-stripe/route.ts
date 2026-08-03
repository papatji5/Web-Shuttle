import { createServiceRoleClient } from "@/lib/supabase/server";
import { emitRealtimeEvent } from "@/lib/realtimeEvents";
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
    const supabase = createServiceRoleClient();

    const { sessionId, rideId: requestRideId } = await req.json();

    if (!sessionId) {
      return new Response(
        JSON.stringify({ error: "Missing sessionId" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Retrieve the session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    const rideId = requestRideId || session?.metadata?.ride_id;
    const passengerUserId = session?.metadata?.user_id ?? null;
    const passengerEmail = session?.customer_details?.email ?? session?.metadata?.user_email ?? null;

    if (!rideId) {
      return new Response(
        JSON.stringify({ error: "Missing rideId and Stripe session metadata did not contain ride_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!passengerUserId) {
      return new Response(
        JSON.stringify({ error: "Stripe session did not include a passenger user id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!session || session.payment_status !== "paid") {
      // Mark payment as FAILED
      try {
        const { error: payUpdateErr } = await supabase
          .from("payments")
          .update({ status: "FAILED" })
          .eq("provider_reference", sessionId);
        if (payUpdateErr) console.warn("payments update warning:", payUpdateErr.message);
      } catch (e) {
        console.warn("payments update attempt failed:", e);
      }

      await supabase
        .from("rides")
        .update({ payment_status: "FAILED" })
        .eq("id", rideId)
        .eq("passenger_id", passengerUserId);

      return new Response(
        JSON.stringify({
          success: false,
          message: "Payment not completed",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Payment successful - mark payment record as PAID and calculate commission split.
    let amountCents = 0;
    if (typeof session.amount_total === "number") {
      amountCents = session.amount_total;
    }

    const platformFeeCents = Math.round(amountCents * 0.2);
    const driverPayoutCents = amountCents - platformFeeCents;

    try {
      const { error: payUpdateErr } = await supabase
        .from("payments")
        .update({ status: "PAID", paid_at: new Date().toISOString(), amount_cents: amountCents })
        .eq("provider_reference", sessionId);

      if (payUpdateErr) {
        console.warn("payments update warning:", payUpdateErr.message);
        // Fallback: insert if row doesn't exist
        try {
          const insertPayload: any = {
            ride_id: rideId,
            user_id: passengerUserId,
            provider: "stripe",
            provider_reference: sessionId,
            status: "PAID",
            paid_at: new Date().toISOString(),
            amount_cents: amountCents,
          };
          await supabase.from("payments").insert(insertPayload);
        } catch (e) {
          console.warn("payments insert fallback failed:", e);
        }
      }
    } catch (e) {
      console.warn("payments update attempt failed:", e);
    }

    // Update ride with payment and commission details
    const { data: ride, error: rideUpdateError } = await supabase
      .from("rides")
      .update({
        payment_status: "PAID",
        final_fare_cents: amountCents,
        platform_fee_cents: platformFeeCents,
        driver_payout_cents: driverPayoutCents,
      })
      .eq("id", rideId)
      .eq("passenger_id", passengerUserId)
      .select("id,pickup_address,dropoff_address,estimated_fare_cents")
      .single();

    if (rideUpdateError || !ride) {
      console.error("Failed to update ride payment status:", rideUpdateError);
      return new Response(
        JSON.stringify({
          success: false,
          message: "Payment verified but ride update failed",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    emitRealtimeEvent("rideRequested", {
      rideId: ride.id,
      pickupAddress: ride.pickup_address,
      dropoffAddress: ride.dropoff_address,
      passengerEmail,
      estimatedFareCents: ride.estimated_fare_cents ?? amountCents,
    });

    emitRealtimeEvent("rideRequested", {
      rideId,
      pickupAddress: session?.metadata?.pickup_address ?? null,
      dropoffAddress: session?.metadata?.dropoff_address ?? null,
      passengerEmail,
      estimatedFareCents: amountCents,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: "Payment verified and ride updated",
        data: {
          sessionId: session.id,
          paymentStatus: session.payment_status,
        },
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

    console.error("Stripe verification error:", error);
    return new Response(
      JSON.stringify({
        error: clientMessage,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
