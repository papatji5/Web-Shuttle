import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/require";

function isMissingRpcError(message: string) {
  const lower = message.toLowerCase();
  return lower.includes("could not find the function") && lower.includes("save_driver_location");
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const lat = Number(body?.lat);
    const lng = Number(body?.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: "invalid lat/lng" }, { status: 400 });
    }

    const user = await requireRole("DRIVER");
    const supabase = await createClient();

    const rpcResult = await supabase.rpc("save_driver_location", {
      p_lat: lat,
      p_lng: lng,
    });

    if (!rpcResult.error) {
      return NextResponse.json({ ok: true, via: "rpc" });
    }

    if (!isMissingRpcError(rpcResult.error.message)) {
      return NextResponse.json({ error: rpcResult.error.message }, { status: 500 });
    }

    const ewkt = `SRID=4326;POINT(${lng} ${lat})`;
    const fallback = await supabase.from("driver_locations").upsert({
      driver_id: user.id,
      location: ewkt,
      recorded_at: new Date().toISOString(),
    });

    if (fallback.error) {
      return NextResponse.json({ error: fallback.error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, via: "fallback-upsert" });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}