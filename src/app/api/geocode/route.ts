import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim();
    if (!q) return NextResponse.json({ error: "missing query" }, { status: 400 });

    const token = process.env.MAPBOX_SERVER_TOKEN ?? process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      return NextResponse.json({ error: "no Mapbox token available" }, { status: 500 });
    }

    const mapboxUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${token}&limit=1&country=za`;
    const res = await fetch(mapboxUrl);
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return NextResponse.json({ error: "mapbox geocode error", status: res.status, detail }, { status: 502 });
    }

    const data = await res.json();
    const feature = data?.features?.[0];
    if (!feature?.center) {
      return NextResponse.json({ error: "no location found" }, { status: 404 });
    }

    return NextResponse.json({ center: feature.center, place_name: feature.place_name });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
