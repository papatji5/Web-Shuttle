import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const pickup = url.searchParams.get("pickup") ?? url.searchParams.get("start");
    const dropoff = url.searchParams.get("dropoff") ?? url.searchParams.get("end");
    if (!pickup || !dropoff) {
      return NextResponse.json({ error: "missing params" }, { status: 400 });
    }

    const token = process.env.MAPBOX_SERVER_TOKEN ?? process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      return NextResponse.json({ error: "no Mapbox token available" }, { status: 500 });
    }

    const coords = `${pickup};${dropoff}`;
    const apiUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?overview=full&geometries=geojson&steps=false&access_token=${token}`;
    const res = await fetch(apiUrl);
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return NextResponse.json(
        { error: "mapbox directions error", status: res.status, detail },
        { status: 502 }
      );
    }

    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route) {
      return NextResponse.json({ error: "no route" }, { status: 404 });
    }

    return NextResponse.json({
      distance: route.distance,
      duration: route.duration,
      geometry: route.geometry,
      coordinates: route.geometry?.coordinates ?? [],
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
