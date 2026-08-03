"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

type Suggestion = { id: string; place_name: string; center: [number, number] };
type RouteFeature = GeoJSON.Feature<GeoJSON.LineString>;

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371e3;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function MapboxTest() {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const pickupRef = useRef<mapboxgl.Marker | null>(null);
  const dropRef = useRef<mapboxgl.Marker | null>(null);
  const [pickup, setPickup] = useState<{ lng: number; lat: number } | null>(null);
  const [dropoff, setDropoff] = useState<{ lng: number; lat: number } | null>(null);
  const [pickupAddr, setPickupAddr] = useState<string | null>(null);
  const [dropAddr, setDropAddr] = useState<string | null>(null);
  const [geoStatus, setGeoStatus] = useState<string>("idle");
  const [geoError, setGeoError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const suggestTimer = useRef<number | null>(null);

  const [straightDistance, setStraightDistance] = useState<number | null>(null);
  const [routeDistance, setRouteDistance] = useState<number | null>(null);
  const [routeDuration, setRouteDuration] = useState<number | null>(null);
  const [fetchingRoute, setFetchingRoute] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeFeature, setRouteFeature] = useState<RouteFeature | null>(null);

  useEffect(() => {
    if (!mapEl.current) return;
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
    const fallbackStyle = {
      version: 8,
      name: "OpenStreetMap",
      sources: {
        osm: {
          type: "raster",
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution: "© OpenStreetMap contributors",
        },
      },
      layers: [
        {
          id: "osm-tiles",
          type: "raster",
          source: "osm",
          minzoom: 0,
          maxzoom: 19,
        },
      ],
    } as any;

    const map = new mapboxgl.Map({
      container: mapEl.current,
      style: "mapbox://styles/mapbox/streets-v11",
      center: [28.0473, -26.2041],
      zoom: 12,
    });

    map.on("error", (event) => {
      if (event && event.error && typeof event.error.message === "string" && event.error.message.includes("style")) {
        try {
          map.setStyle(fallbackStyle);
        } catch (e) {
          // ignore
        }
      }
    });
    mapRef.current = map;

    map.on("load", () => {
      if (!map.getSource("route")) {
        map.addSource("route", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: [] },
          },
        });
      }
      if (!map.getLayer("route-line")) {
        map.addLayer({
          id: "route-line",
          type: "line",
          source: "route",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#22c55e",
            "line-width": 5,
            "line-opacity": 0.9,
          },
        });
      }
    });

    map.on("click", (e: any) => {
      const { lng, lat } = e.lngLat;
      setDropoff({ lng, lat });
    });

    return () => map.remove();
  }, []);

  async function doDetectPickup() {
    if (!navigator.geolocation) {
      setGeoStatus("unsupported");
      setGeoError("Geolocation API not available in this browser.");
      return;
    }

    setGeoStatus("requesting");
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setPickup({ lng, lat });
        const map = mapRef.current;
        if (map) map.flyTo({ center: [lng, lat], zoom: 14 });
        setGeoStatus("granted");
      },
      (err) => {
        setGeoStatus("error");
        if (err && err.code === 1) {
          setGeoError("Permission denied. Allow location access in the browser.");
        } else if (err && err.code === 3) {
          setGeoError("Position unavailable or timeout. Try again.");
        } else {
          setGeoError(err?.message ?? "Unknown geolocation error.");
        }
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }

  useEffect(() => {
    doDetectPickup();
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    pickupRef.current?.remove();
    if (pickup) {
      pickupRef.current = new mapboxgl.Marker({ color: "#06b6d4" }).setLngLat([pickup.lng, pickup.lat]).addTo(map);
    }

    dropRef.current?.remove();
    if (dropoff) {
      dropRef.current = new mapboxgl.Marker({ color: "#06d65f" }).setLngLat([dropoff.lng, dropoff.lat]).addTo(map);
    }
  }, [pickup, dropoff]);

  async function reverseGeocode(lng: number, lat: number) {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
    if (!token) return null;
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&limit=1`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      return data.features?.[0]?.place_name ?? null;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    (async () => {
      if (pickup) {
        setPickupAddr("Resolving address...");
        const a = await reverseGeocode(pickup.lng, pickup.lat);
        setPickupAddr(a ?? "(address not found)");
      }
      if (dropoff) {
        setDropAddr("Resolving address...");
        const a = await reverseGeocode(dropoff.lng, dropoff.lat);
        setDropAddr(a ?? "(address not found)");
      }
    })();
  }, [pickup, dropoff]);

  useEffect(() => {
    setRouteDistance(null);
    setRouteDuration(null);
    setRouteError(null);
    setRouteFeature(null);

    if (!pickup || !dropoff) {
      setStraightDistance(null);
      return;
    }

    const meters = haversineDistance(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng);
    setStraightDistance(meters);

    (async () => {
      try {
        setFetchingRoute(true);
        const res = await fetch(`/api/directions?pickup=${pickup.lng},${pickup.lat}&dropoff=${dropoff.lng},${dropoff.lat}`);
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          setRouteError(data?.error ?? "Route request failed");
          return;
        }

        const data = await res.json();
        if (data?.distance != null) setRouteDistance(data.distance);
        if (data?.duration != null) setRouteDuration(data.duration);
        if (data?.geometry?.coordinates) {
          setRouteFeature({
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: data.geometry.coordinates,
            },
          });
        } else {
          setRouteError("No route geometry returned");
        }
      } catch {
        setRouteError("Unable to load route from Mapbox");
      } finally {
        setFetchingRoute(false);
      }
    })();
  }, [pickup, dropoff]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !routeFeature) return;
    const source = map.getSource("route") as mapboxgl.GeoJSONSource | undefined;
    source?.setData(routeFeature as GeoJSON.Feature);
  }, [routeFeature]);

  useEffect(() => {
    if (suggestTimer.current) {
      window.clearTimeout(suggestTimer.current);
      suggestTimer.current = null;
    }
    if (!query || query.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    setLoadingSuggestions(true);
    suggestTimer.current = window.setTimeout(async () => {
      try {
        const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&autocomplete=true&limit=6&country=za`;
        const res = await fetch(url);
        const data = await res.json();
        const items: Suggestion[] = (data.features || []).map((f: any) => ({
          id: f.id,
          place_name: f.place_name,
          center: f.center,
        }));
        setSuggestions(items);
      } catch {
        setSuggestions([]);
      } finally {
        setLoadingSuggestions(false);
      }
    }, 300);

    return () => {
      if (suggestTimer.current) window.clearTimeout(suggestTimer.current);
    };
  }, [query]);

  function selectSuggestion(s: Suggestion) {
    const [lng, lat] = s.center;
    setDropoff({ lng, lat });
    setDropAddr(s.place_name);
    setSuggestions([]);
    setQuery(s.place_name);
    const map = mapRef.current;
    if (map) map.flyTo({ center: [lng, lat], zoom: 15 });
  }

  const fareConfig = {
    baseFare: 10.0,
    perKm: 6.0,
    perMinute: 1.0,
    minFare: 20.0,
    surge: 1.0,
    avgSpeedKmph: 30,
  };

  function computeFare(distanceMeters: number | null, durationSeconds: number | null) {
    if (distanceMeters == null) return null;
    const km = distanceMeters / 1000;
    const minutes = durationSeconds != null ? durationSeconds / 60 : (km / fareConfig.avgSpeedKmph) * 60;
    const distanceCharge = fareConfig.perKm * km;
    const timeCharge = fareConfig.perMinute * minutes;
    const fare = Math.max(fareConfig.minFare, (fareConfig.baseFare + distanceCharge + timeCharge) * fareConfig.surge);
    return {
      fare: Math.round(fare * 100) / 100,
      breakdown: {
        base: fareConfig.baseFare,
        distanceCharge: Math.round(distanceCharge * 100) / 100,
        timeCharge: Math.round(timeCharge * 100) / 100,
      },
    };
  }

  function formatMeters(m?: number | null) {
    if (m == null) return "—";
    if (m >= 1000) return `${(m / 1000).toFixed(2)} km`;
    return `${Math.round(m)} m`;
  }

  function formatSeconds(s?: number | null) {
    if (s == null) return "—";
    return `${Math.max(1, Math.round(s / 60))} min`;
  }

  const effectiveDistance = routeDistance ?? straightDistance;
  const straightEtaSeconds = straightDistance != null ? straightDistance / (fareConfig.avgSpeedKmph * 1000 / 3600) : null;
  const effectiveDuration = routeDuration ?? straightEtaSeconds;
  const fareEstimate = computeFare(effectiveDistance, effectiveDuration);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-slate-900 p-3">
        <div ref={mapEl} className="h-96 w-full rounded-md" />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="flex-1 rounded-xl border border-white/10 bg-white/3 p-3">
          <div className="text-sm text-slate-300">Pickup</div>
          <div className="mt-1 font-medium text-white">
            {pickup ? `${pickup.lat.toFixed(6)}, ${pickup.lng.toFixed(6)}` : geoStatus === "requesting" ? "Detecting..." : "Not detected"}
          </div>
          <div className="text-xs text-slate-400">
            {pickupAddr ?? (geoStatus === "requesting" ? "Resolving address..." : "")}
          </div>
          <div className="mt-2 flex gap-2">
            <button
              className="rounded-full bg-gradient-to-r from-blue-600 to-cyan-400 px-3 py-1 text-sm font-semibold text-white"
              onClick={() => doDetectPickup()}
            >
              Retry detect pickup
            </button>
            <button
              className="rounded-full border border-white/10 px-3 py-1 text-sm text-white"
              onClick={() => {
                if (mapRef.current) {
                  const c = mapRef.current.getCenter();
                  setPickup({ lng: c.lng, lat: c.lat });
                  setPickupAddr(null);
                }
              }}
            >
              Use map center as pickup
            </button>
          </div>
          {geoError ? <div className="mt-2 text-xs text-rose-400">{geoError}</div> : null}
        </div>

        <div className="flex-1 rounded-xl border border-white/10 bg-white/3 p-3">
          <div className="text-sm text-slate-300">Dropoff (search or click map)</div>
          <div className="mt-2">
            <input
              className="w-full rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500"
              placeholder="Type an address or place"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search dropoff location"
            />
            {loadingSuggestions ? <div className="mt-2 text-xs text-slate-400">Searching...</div> : null}
            {suggestions.length > 0 ? (
              <ul className="mt-2 max-h-48 overflow-auto rounded-md border border-white/10 bg-slate-950 p-1 text-sm">
                {suggestions.map((s) => (
                  <li
                    key={s.id}
                    className="cursor-pointer rounded px-2 py-1 hover:bg-white/5"
                    onClick={() => selectSuggestion(s)}
                  >
                    {s.place_name}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="mt-3 text-xs text-slate-400">Selected:</div>
          <div className="mt-1 font-medium text-white">
            {dropAddr ?? (dropoff ? `${dropoff.lat.toFixed(6)}, ${dropoff.lng.toFixed(6)}` : "Click map or pick suggestion")}
          </div>

          <div className="mt-3 text-xs text-slate-300">Distance</div>
          <div className="mt-1 font-medium text-white">
            Straight: {formatMeters(straightDistance)}
            {fetchingRoute ? <span className="ml-2 text-sm text-slate-400">(fetching route...)</span> : null}
          </div>
          <div className="text-sm text-slate-400">
            Route: {routeDistance ? formatMeters(routeDistance) : "—"} • ETA: {formatSeconds(routeDuration ?? straightEtaSeconds)}
          </div>
          {routeError ? <div className="mt-1 text-xs text-rose-400">{routeError}</div> : null}
          {!routeError && !routeDistance && pickup && dropoff ? <div className="mt-1 text-xs text-amber-300">Using straight-line ETA until Mapbox route is available.</div> : null}

          <div className="mt-3 text-xs text-slate-300">Estimated fare</div>
          <div className="mt-1 font-medium text-white">{fareEstimate ? `R ${fareEstimate.fare.toFixed(2)}` : "—"}</div>
          {fareEstimate ? (
            <div className="mt-1 text-sm text-slate-400">
              Breakdown: Base R{fareEstimate.breakdown.base} + Distance R{fareEstimate.breakdown.distanceCharge} + Time R{fareEstimate.breakdown.timeCharge}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          className="rounded-full bg-gradient-to-r from-blue-600 to-cyan-400 px-4 py-2 text-sm font-semibold text-white"
          onClick={async () => {
            if (!mapRef.current) return;
            const center = mapRef.current.getCenter();
            setDropoff({ lng: center.lng, lat: center.lat });
            const a = await reverseGeocode(center.lng, center.lat);
            setDropAddr(a);
          }}
        >
          Set dropoff to map center
        </button>

        <button
          className="rounded-full border border-white/10 px-4 py-2 text-sm text-white"
          onClick={() => {
            setPickup(null);
            setDropoff(null);
            setPickupAddr(null);
            setDropAddr(null);
            setGeoStatus("idle");
            setGeoError(null);
            setQuery("");
            setSuggestions([]);
            setStraightDistance(null);
            setRouteDistance(null);
            setRouteDuration(null);
            setRouteError(null);
            setRouteFeature(null);
          }}
        >
          Clear
        </button>
      </div>
    </div>
  );
}



