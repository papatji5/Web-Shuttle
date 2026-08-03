import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, context: any) {
  try {
    // Next may provide `context.params` as either a plain object or a Promise.
    const rawParams = context?.params;
    const params = typeof rawParams?.then === "function" ? await rawParams : rawParams;
    const rideId = params?.rideId;
    const supabase = await createClient();

    if (!rideId) {
      return new Response("Ride ID is required", { status: 400 });
    }

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const user = authData.user;

    const { data: ride, error } = await supabase
      .from("rides")
      .select(
        "id, passenger_id, driver_id, status, pickup_address, dropoff_address, estimated_fare_cents, final_fare_cents, estimated_duration_min, final_duration_min, estimated_distance_km, final_distance_km, requested_at, completed_at"
      )
      .eq("id", rideId)
      .single();

    if (error || !ride || ride.passenger_id !== user.id) {
      return new Response("Not found", { status: 404 });
    }

    let driverName = "Unassigned driver";
    if (ride.driver_id) {
      const { data: driverProfile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", ride.driver_id)
        .single();

      if (driverProfile?.full_name) {
        driverName = driverProfile.full_name;
      }
    }

    const fareCents = Number(ride.final_fare_cents ?? ride.estimated_fare_cents ?? 0);
    const estimatedFareCents = Number(ride.estimated_fare_cents ?? 0);
    const fare = new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
    }).format(fareCents / 100);

    const completedAt = ride.completed_at ?? ride.requested_at;
    const completedDate = completedAt
      ? new Date(completedAt).toLocaleString("en-ZA", {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "N/A";

    const durationRaw = ride.final_duration_min ?? ride.estimated_duration_min;
    const distanceRaw = ride.final_distance_km ?? ride.estimated_distance_km;
    const duration = typeof durationRaw === "number" ? durationRaw : durationRaw ? Number(durationRaw) : null;
    const distance = typeof distanceRaw === "number" ? distanceRaw : distanceRaw ? Number(distanceRaw) : null;

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4 size in points
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const headingColor = rgb(0.0588, 0.4039, 0.902);
    const textColor = rgb(0.067, 0.086, 0.149);
    const secondaryColor = rgb(0.42, 0.46, 0.51);
    const margin = 50;
    let cursorY = page.getHeight() - margin;

    page.drawText("Swift", {
      x: margin,
      y: cursorY,
      size: 24,
      font: helveticaFont,
      color: headingColor,
    });
    page.drawText(" Ride-Hailing", {
      x: margin + 72,
      y: cursorY,
      size: 24,
      font: helveticaFont,
      color: textColor,
    });
    cursorY -= 40;

    page.drawText("Invoice", {
      x: margin,
      y: cursorY,
      size: 18,
      font: helveticaFont,
      color: textColor,
    });
    cursorY -= 28;

    page.drawText(`Invoice ID: INV-${ride.id}`, {
      x: margin,
      y: cursorY,
      size: 11,
      font: helveticaFont,
      color: secondaryColor,
    });
    cursorY -= 18;
    page.drawText(`Date: ${completedDate}`, {
      x: margin,
      y: cursorY,
      size: 11,
      font: helveticaFont,
      color: secondaryColor,
    });
    cursorY -= 18;
    page.drawText(`Passenger: ${user.email ?? "Unknown"}`, {
      x: margin,
      y: cursorY,
      size: 11,
      font: helveticaFont,
      color: secondaryColor,
    });
    cursorY -= 18;
    page.drawText(`Driver: ${driverName}`, {
      x: margin,
      y: cursorY,
      size: 11,
      font: helveticaFont,
      color: secondaryColor,
    });
    cursorY -= 18;
    page.drawText(`Ride status: ${ride.status}`, {
      x: margin,
      y: cursorY,
      size: 11,
      font: helveticaFont,
      color: secondaryColor,
    });
    cursorY -= 28;

    page.drawText("Trip details", {
      x: margin,
      y: cursorY,
      size: 12,
      font: helveticaFont,
      color: textColor,
    });
    cursorY -= 20;

    page.drawText(`Pickup address: ${ride.pickup_address ?? "N/A"}`, {
      x: margin,
      y: cursorY,
      size: 11,
      font: helveticaFont,
      color: secondaryColor,
      maxWidth: page.getWidth() - margin * 2,
    });
    cursorY -= 16;
    page.drawText(`Dropoff address: ${ride.dropoff_address ?? "N/A"}`, {
      x: margin,
      y: cursorY,
      size: 11,
      font: helveticaFont,
      color: secondaryColor,
      maxWidth: page.getWidth() - margin * 2,
    });
    cursorY -= 16;
    page.drawText(`Distance: ${distance != null ? `${distance.toFixed(2)} km` : "N/A"}`, {
      x: margin,
      y: cursorY,
      size: 11,
      font: helveticaFont,
      color: secondaryColor,
    });
    cursorY -= 16;
    page.drawText(`Duration: ${duration != null ? `${duration.toFixed(0)} min` : "N/A"}`, {
      x: margin,
      y: cursorY,
      size: 11,
      font: helveticaFont,
      color: secondaryColor,
    });
    cursorY -= 28;

    page.drawText("Payment summary", {
      x: margin,
      y: cursorY,
      size: 12,
      font: helveticaFont,
      color: textColor,
    });
    cursorY -= 20;

    page.drawText(`Estimated fare: ${new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(estimatedFareCents / 100)}`, {
      x: margin,
      y: cursorY,
      size: 11,
      font: helveticaFont,
      color: secondaryColor,
    });
    cursorY -= 16;
    page.drawText(`Final fare: ${fare}`, {
      x: margin,
      y: cursorY,
      size: 11,
      font: helveticaFont,
      color: secondaryColor,
    });
    cursorY -= 40;

    page.drawText("Thank you for riding with Swift.", {
      x: margin,
      y: cursorY,
      size: 12,
      font: helveticaFont,
      color: textColor,
    });
    cursorY -= 18;

    page.drawText("This invoice is generated for the completed ride. Please keep it for your records.", {
      x: margin,
      y: cursorY,
      size: 10,
      font: helveticaFont,
      color: secondaryColor,
      maxWidth: page.getWidth() - margin * 2,
    });

    const pdfBytes = await pdfDoc.save();
    const pdfBuffer = Buffer.from(pdfBytes);

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=invoice-${ride.id}.pdf`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(`Invoice generation error: ${message}`, { status: 500 });
  }
}
