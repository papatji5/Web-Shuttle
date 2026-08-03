import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/require";

export async function POST(req: Request) {
  try {
    const user = await requireRole("PASSENGER");
    const body = await req.json();
    const rideId = String(body?.rideId ?? "").trim();
    const dropoffAddress = String(body?.dropoff_address ?? "").trim();

    if (!rideId || !dropoffAddress) {
      return NextResponse.json({ error: "Ride ID and destination are required." }, { status: 400 });
    }

    const supabase = await createClient();

    const { data: existingRide, error: fetchError } = await supabase
      .from("rides")
      .select("id,passenger_id,status")
      .eq("id", rideId)
      .single();

    if (fetchError || !existingRide) {
      return NextResponse.json({ error: "Ride not found." }, { status: 404 });
    }

    if (existingRide.passenger_id !== user.id) {
      return NextResponse.json({ error: "Unauthorized to edit this ride." }, { status: 403 });
    }

    if (!["ACCEPTED", "IN_PROGRESS"].includes(existingRide.status)) {
      return NextResponse.json({ error: "Destination can only be updated for active rides." }, { status: 400 });
    }

    const { data: updatedRide, error: updateError } = await supabase
      .from("rides")
      .update({ dropoff_address: dropoffAddress, dropoff_location: null })
      .eq("id", rideId)
      .select("id,pickup_address,dropoff_address,status")
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json(updatedRide);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
