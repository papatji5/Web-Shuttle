import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/require";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireRole("DRIVER");
    const supabase = await createClient();

    const { data: rejectedOffers, error: rejectedError } = await supabase
      .from("ride_offers")
      .select("ride_id")
      .eq("driver_id", user.id)
      .eq("status", "REJECTED");

    if (rejectedError) {
      return NextResponse.json({ error: rejectedError.message }, { status: 500 });
    }

    const rejectedRideIds = (rejectedOffers ?? []).map((offer: any) => offer.ride_id).filter(Boolean);

    const { data, error } = await supabase
      .from("rides")
      .select("id,pickup_address,dropoff_address,estimated_fare_cents,estimated_distance_km,payment_method,payment_status")
      .eq("status", "REQUESTED")
      .in("payment_status", ["UNPAID", "PENDING", "PAID"])
      .order("requested_at", { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rides = (data ?? []).filter((ride: any) => !rejectedRideIds.includes(ride.id));
    return NextResponse.json({ rides });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
