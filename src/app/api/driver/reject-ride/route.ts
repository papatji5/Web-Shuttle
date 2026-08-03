import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/require";
import { emitRealtimeEvent } from "@/lib/realtimeEvents";

export async function POST(req: Request) {
  try {
    const user = await requireRole("DRIVER");
    const body = await req.json().catch(() => ({}));
    const rideId = String(body?.rideId ?? "");

    if (!rideId) {
      return NextResponse.json({ error: "rideId required" }, { status: 400 });
    }

    const supabase = await createClient();
    const now = new Date().toISOString();

    // Mark any existing offer for this driver and ride as rejected.
    const { error: offerError } = await supabase
      .from("ride_offers")
      .update({ status: "REJECTED", responded_at: now })
      .eq("ride_id", rideId)
      .eq("driver_id", user.id);

    if (offerError) {
      return NextResponse.json({ error: offerError.message }, { status: 500 });
    }

    // If there is no pre-existing offer row, insert one so the rejection is persisted.
    const { count, error: countError } = await supabase
      .from("ride_offers")
      .select("id", { count: "exact", head: true })
      .eq("ride_id", rideId)
      .eq("driver_id", user.id);

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    if ((count ?? 0) === 0) {
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      const { error: insertError } = await supabase.from("ride_offers").insert({
        ride_id: rideId,
        driver_id: user.id,
        status: "REJECTED",
        sent_at: now,
        responded_at: now,
        expires_at: expiresAt,
      });

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }

    emitRealtimeEvent("rideStatusChanged", {
      rideId,
      status: "DECLINED",
      payload: {
        driverId: user.id,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
