import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData.user) {
      console.error("Auth error:", authError);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = authData.user.id;
    console.log("Active ride fetch for user:", userId);

    // Fetch all ACCEPTED rides for this driver
    const { data: allRides, error } = await supabase
      .from("rides")
      .select("id,pickup_address,dropoff_address,status,driver_id,passenger_id,accepted_at")
      .eq("driver_id", userId)
      .eq("status", "ACCEPTED");

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json({ error: `Database error: ${error.message}` }, { status: 500 });
    }

    // Get the most recent ACCEPTED ride by accepted_at timestamp
    const activeRide = (allRides || []).sort((a: any, b: any) => {
      const aTime = new Date(a.accepted_at || 0).getTime();
      const bTime = new Date(b.accepted_at || 0).getTime();
      return bTime - aTime; // Most recent first
    })[0];

    if (!activeRide) {
      console.log("No active ride found for user:", userId, "Total ACCEPTED rides:", allRides?.length);
      return NextResponse.json(null);
    }

    console.log("Found active ride:", activeRide.id, "accepted at:", activeRide.accepted_at);
    return NextResponse.json(activeRide);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Active ride API error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
