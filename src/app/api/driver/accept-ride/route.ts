import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/require";
import { emitRealtimeEvent } from "@/lib/realtimeEvents";

export async function POST(req: Request) {
  try {
    const user = await requireRole("DRIVER");
    const body = await req.json().catch(() => ({}));
    const rideId = String(body?.rideId ?? "");

    if (!rideId) return NextResponse.json({ error: "rideId required" }, { status: 400 });

    const supabase = await createClient();

    // Claim the ride (only when unassigned)
    const { error } = await supabase
      .from("rides")
      .update({ driver_id: user.id, status: "ACCEPTED", accepted_at: new Date().toISOString() })
      .eq("id", rideId)
      .is("driver_id", null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Ensure there is a ride_offers row for this driver+ride (so the offers UI shows it)
    const now = new Date().toISOString();
    const { data: updatedOffers, error: updateOfferErr } = await supabase
      .from("ride_offers")
      .update({ status: "ACCEPTED", responded_at: now })
      .eq("ride_id", rideId)
      .eq("driver_id", user.id)
      .select();

    if (updateOfferErr) {
      return NextResponse.json({ error: updateOfferErr.message }, { status: 500 });
    }

    if (!updatedOffers || updatedOffers.length === 0) {
      // insert a new offer row (expires_at set to 24h from now)
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      const { error: insertErr } = await supabase
        .from("ride_offers")
        .insert([{ ride_id: rideId, driver_id: user.id, status: "ACCEPTED", sent_at: now, responded_at: now, expires_at: expiresAt }]);

      if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 500 });
      }
    }

      // Add the ride amount to the driver's wallet balance (use final fare if available, otherwise estimated)
      const { data: rideRow, error: rideFetchErr } = await supabase
        .from("rides")
        .select("id,final_fare_cents,estimated_fare_cents")
        .eq("id", rideId)
        .maybeSingle();

      if (rideFetchErr) {
        return NextResponse.json({ error: rideFetchErr.message }, { status: 500 });
      }

      const amountCents = (rideRow?.final_fare_cents ?? rideRow?.estimated_fare_cents ?? 0) as number;

      if (amountCents > 0) {
        // Apply commission: driver receives 80%, platform keeps 20%
        const driverShare = Math.round(amountCents * 0.8);

        // read current balance then update (simple upsert-style increment)
        const { data: driverRow, error: driverFetchErr } = await supabase.from("drivers").select("balance_cents").eq("id", user.id).maybeSingle();

        if (driverFetchErr) {
          return NextResponse.json({ error: driverFetchErr.message }, { status: 500 });
        }

        const current = (driverRow?.balance_cents ?? 0) as number;
        const { error: balanceUpdateErr } = await supabase.from("drivers").update({ balance_cents: current + driverShare }).eq("id", user.id);

        if (balanceUpdateErr) {
          return NextResponse.json({ error: balanceUpdateErr.message }, { status: 500 });
        }
      }

    emitRealtimeEvent("rideStatusChanged", {
      rideId,
      status: "ACCEPTED",
      payload: {
        driverEmail: user.email ?? null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
