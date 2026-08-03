import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/require";

export async function POST(req: Request) {
  try {
    const user = await requireRole("DRIVER");
    const body = await req.json().catch(() => ({}));
    const rideId = String(body?.rideId ?? "");

    if (!rideId) return NextResponse.json({ error: "rideId required" }, { status: 400 });

    const supabase = await createClient();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const { error: offerError } = await supabase.from("ride_offers").insert({
      ride_id: rideId,
      driver_id: user.id,
      status: "SENT",
      expires_at: expiresAt,
    });

    if (offerError) return NextResponse.json({ error: offerError.message }, { status: 500 });

    const { error: rideError } = await supabase.from("rides").update({ status: "DISPATCHING" }).eq("id", rideId);
    if (rideError) return NextResponse.json({ error: rideError.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
