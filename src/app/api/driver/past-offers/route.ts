import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/require";

export const dynamic = "force-dynamic";

type RideSummary = {
  id: string;
  pickup_address: string | null;
  dropoff_address: string | null;
  status: string;
  estimated_fare_cents: number | null;
  final_fare_cents: number | null;
  completed_at?: string | null;
};

type RideOfferSummary = {
  id: string;
  ride_id: string | null;
  status: string;
  sent_at: string | null;
  responded_at: string | null;
  expires_at: string | null;
};

export async function GET(req: Request) {
  try {
    const user = await requireRole("DRIVER");
    const supabase = await createClient();
    const url = new URL(req.url);
    const filter = (url.searchParams.get("filter") ?? "all").toLowerCase();

    if (filter === "completed") {
      const { data, error } = await supabase
        .from("rides")
        .select("id,pickup_address,dropoff_address,status,estimated_fare_cents,final_fare_cents,completed_at")
        .eq("driver_id", user.id)
        .eq("status", "COMPLETED")
        .order("completed_at", { ascending: false })
        .limit(20);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ filter: "completed", rides: data ?? [] });
    }

    const offersQuery = supabase
      .from("ride_offers")
      .select("id,ride_id,status,sent_at,responded_at,expires_at")
      .eq("driver_id", user.id)
      .order("sent_at", { ascending: false })
      .limit(20);

    if (filter === "rejected") {
      offersQuery.eq("status", "REJECTED");
    }

    const { data: offers, error: offersError } = await offersQuery;
    if (offersError) {
      return NextResponse.json({ error: offersError.message }, { status: 500 });
    }

    const rideIds = Array.from(
      new Set(
        (offers ?? [])
          .map((offer: RideOfferSummary) => offer.ride_id)
          .filter((rideId): rideId is string => Boolean(rideId)),
      ),
    );

    let rides: RideSummary[] = [];
    if (rideIds.length > 0) {
      const { data: ridesData, error: ridesError } = await supabase
        .from("rides")
        .select("id,pickup_address,dropoff_address,status,estimated_fare_cents,final_fare_cents")
        .in("id", rideIds);

      if (ridesError) {
        return NextResponse.json({ error: ridesError.message }, { status: 500 });
      }

      rides = ridesData ?? [];
    }

    return NextResponse.json({ filter: filter === "rejected" ? "rejected" : "all", offers: offers ?? [], rides });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
