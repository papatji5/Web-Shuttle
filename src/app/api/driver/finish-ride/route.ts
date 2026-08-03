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

    // Update ride status to COMPLETED
    const { error } = await supabase
      .from("rides")
      .update({ 
        status: "COMPLETED", 
        completed_at: new Date().toISOString() 
      })
      .eq("id", rideId)
      .eq("driver_id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
