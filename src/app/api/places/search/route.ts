import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q");

    if (!q || q.length < 2) {
      return NextResponse.json({ features: [] });
    }

    const googleKey = process.env.GOOGLE_PLACES_API_KEY;
    console.log("Place search query:", q, "Google key available:", !!googleKey);

    // Try Google Places API Text Search (best for South African business search)
    if (googleKey) {
      try {
        // Search with just the query + South Africa region
        const searchQuery = `${q} South Africa`;
        const googleUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&key=${googleKey}&language=en&region=za`;
        
        console.log("Calling Google Places API...");
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        
        const response = await fetch(googleUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        const data = await response.json();
        console.log("Google Places response status:", data.status, "Results:", data.results?.length || 0);
        
        if (data.status === "OK" && data.results && Array.isArray(data.results)) {
          const googleResults = data.results
            .slice(0, 15)
            .map((place: any) => ({
              id: place.place_id,
              place_name: place.formatted_address || place.name,
              text: place.name,
              center: [place.geometry.location.lng, place.geometry.location.lat],
              type: place.types?.[0] || "place",
              source: "google",
            }));
          
          console.log("Returning Google Places results:", googleResults.length);
          return NextResponse.json({ features: googleResults });
        } else if (data.status === "ZERO_RESULTS") {
          console.log("Google Places returned ZERO_RESULTS");
        } else {
          console.log("Google Places status:", data.status, data.error_message);
        }
      } catch (err) {
        console.error("Google Places API error:", err instanceof Error ? err.message : err);
      }
    } else {
      console.warn("No Google API key available");
    }

    // Fallback to Mapbox
    try {
      const mapboxToken = process.env.MAPBOX_SERVER_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      if (mapboxToken) {
        console.log("Falling back to Mapbox...");
        const mapboxUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?limit=15&bbox=16.3,-35,32.8,-22&proximity=28.2293,-25.7461&types=place,poi,address&access_token=${mapboxToken}`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(mapboxUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.json();
          if (data.features && Array.isArray(data.features)) {
            const mapboxResults = data.features
              .map((f: any) => ({
                id: f.id,
                place_name: f.place_name,
                text: f.text,
                center: f.center,
                type: f.type,
                source: "mapbox",
              }));
            
            console.log("Returning Mapbox results:", mapboxResults.length);
            return NextResponse.json({ features: mapboxResults });
          }
        }
      }
    } catch (err) {
      console.error("Mapbox fallback error:", err instanceof Error ? err.message : err);
    }

    // Final fallback to Nominatim
    try {
      console.log("Falling back to Nominatim...");
      const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + " South Africa")}&format=json&limit=15&viewbox=16.3,-35,32.8,-22&bounded=0`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      
      const response = await fetch(nominatimUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          const nomResults = data
            .slice(0, 15)
            .map((item: any) => ({
              id: `nominatim-${item.osm_id}`,
              place_name: item.display_name,
              text: item.name || item.display_name.split(",")[0],
              center: [parseFloat(item.lon), parseFloat(item.lat)],
              type: item.type,
              source: "nominatim",
            }));
          
          console.log("Returning Nominatim results:", nomResults.length);
          return NextResponse.json({ features: nomResults });
        }
      }
    } catch (err) {
      console.error("Nominatim fallback error:", err instanceof Error ? err.message : err);
    }

    console.warn("No results found from any service");
    return NextResponse.json({ features: [] });
  } catch (err) {
    console.error("Places search error:", err);
    return NextResponse.json({ features: [], error: String(err) }, { status: 500 });
  }
}
