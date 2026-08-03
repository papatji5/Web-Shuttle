import { requireRole } from "@/lib/auth/require";
import { emitRealtimeEvent } from "@/lib/realtimeEvents";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const user = await requireRole("PASSENGER");
    const supabase = await createClient();

    const {
      pickup_address,
      dropoff_address,
      scheduled_at,
      estimated_distance_km,
      estimated_duration_min,
      estimated_fare_cents,
      payment_method,
    } = await req.json();

    if (!pickup_address || !dropoff_address) {
      return new Response(
        JSON.stringify({ error: "Missing pickup or dropoff address" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const paymentMethod = String(payment_method ?? "CASH").toUpperCase() === "CARD" ? "CARD" : "CASH";
    const paymentStatus = paymentMethod === "CARD" ? "PENDING" : "UNPAID";

    let scheduledAtValue: string | null = null;
    if (scheduled_at) {
      const scheduledDate = new Date(String(scheduled_at));
      if (isNaN(scheduledDate.getTime())) {
        return new Response(
          JSON.stringify({ error: "Scheduled pickup time is invalid." }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
      if (scheduledDate.getTime() < Date.now()) {
        return new Response(
          JSON.stringify({ error: "Scheduled pickup time must be in the future." }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
      scheduledAtValue = scheduledDate.toISOString();
    }

    const { data, error } = await supabase
      .from("rides")
      .insert({
        passenger_id: user.id,
        status: "REQUESTED",
        pickup_address,
        dropoff_address,
        scheduled_at: scheduledAtValue,
        pickup_location: null,
        dropoff_location: null,
        estimated_distance_km: estimated_distance_km ?? null,
        estimated_duration_min: estimated_duration_min ?? null,
        estimated_fare_cents: estimated_fare_cents ?? null,
        payment_method: paymentMethod,
        payment_status: paymentStatus,
      })
      .select("id")
      .single();

    if (error || !data) {
      console.error("Failed to create pending ride:", error);
      return new Response(
        JSON.stringify({ error: error?.message || "Failed to create ride" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (paymentMethod === "CASH") {
      emitRealtimeEvent("rideRequested", {
        rideId: data.id,
        pickupAddress: pickup_address,
        dropoffAddress: dropoff_address,
        passengerEmail: user.email ?? null,
        estimatedFareCents: estimated_fare_cents ?? null,
      });
    }

    return new Response(JSON.stringify({ rideId: data.id }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Create pending ride error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
