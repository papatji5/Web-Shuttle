import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const lat = url.searchParams.get("lat");
    const lng = url.searchParams.get("lng");
    if (!lat || !lng) {
      return NextResponse.json({ error: "missing lat/lng" }, { status: 400 });
    }

    const token = process.env.MAPBOX_SERVER_TOKEN ?? process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      return NextResponse.json({ error: "no Mapbox token available" }, { status: 500 });
    }

    const apiUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(lng)},${encodeURIComponent(lat)}.json?access_token=${token}&limit=1&country=za`;
    const res = await fetch(apiUrl);
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return NextResponse.json({ error: "mapbox reverse geocode error", status: res.status, detail }, { status: 502 });
    }

    const data = await res.json();
    const feature = data?.features?.[0];
    if (!feature?.place_name) {
      return NextResponse.json({ error: "no place name found" }, { status: 404 });
    }

    return NextResponse.json({ place_name: feature.place_name });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
