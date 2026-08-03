"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { getSocket } from "@/lib/socket";

type Props = {
  rideId: string;
  pickupAddress: string;
  currentDropoffAddress: string;
  isEditMode?: boolean;
  onUpdated: (updated: { dropoff_address: string }) => void;
};

type Point = { lng: number; lat: number };

type Suggestion = { id: string; place_name: string; center: [number, number] };

type FareBreakdown = {
  fare: number;
  breakdown: { base: number; distanceCharge: number; timeCharge: number };
};

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371e3; // metres
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dPhi = toRad(lat2 - lat1);
  const dLambda = toRad(lon2 - lon1);
  const a = Math.sin(dPhi / 2) * Math.sin(dPhi / 2) + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) * Math.sin(dLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const fareConfig = {
  baseFare: 15,
  perKm: 7,
  perMinute: 1.5,
  minFare: 35,
  avgSpeedKmph: 35,
  surge: 1,
};

function computeFare(distanceMeters: number | null, durationSeconds: number | null): FareBreakdown | null {
  if (distanceMeters == null || durationSeconds == null) return null;
  const km = distanceMeters / 1000;
  const minutes = durationSeconds / 60;
  const distanceCharge = fareConfig.perKm * km;
  const timeCharge = fareConfig.perMinute * minutes;
  const fare = Math.max(fareConfig.minFare, (fareConfig.baseFare + distanceCharge + timeCharge) * fareConfig.surge);
  return {
    fare,
    breakdown: {
      base: fareConfig.baseFare,
      distanceCharge: Number(distanceCharge.toFixed(2)),
      timeCharge: Number(timeCharge.toFixed(2)),
    },
  };
}

function formatMeters(value?: number | null) {
  if (value == null) return "N/A";
  if (value >= 1000) return `${(value / 1000).toFixed(2)} km`;
  return `${Math.round(value)} m`;
}

function formatMinutes(value?: number | null) {
  if (value == null) return "N/A";
  return `${Math.round(value)} min`;
}

async function geocodeAddress(address: string): Promise<Point | null> {
  if (!address.trim()) return null;

  const candidates = [
    address,
    address.replace(/\s*,\s*South Africa$/i, ""),
    address.replace(/,\s*Gauteng.*$/i, ""),
  ].filter(Boolean);

  for (const query of candidates) {
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      if (!res.ok) continue;
      const data = await res.json();
      const center = data?.center;
      if (center && center.length === 2) {
        return { lng: center[0], lat: center[1] };
      }
    } catch {
      // ignore
    }
  }

  return null;
}

async function reverseGeocodePoint(point: Point): Promise<string | null> {
  try {
    const res = await fetch(`/api/reverse-geocode?lat=${point.lat}&lng=${point.lng}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.place_name ?? null;
  } catch {
    return null;
  }
}

async function fetchRoute(pickup: Point, dropoff: Point) {
  const pickupPair = `${pickup.lng},${pickup.lat}`;
  const dropoffPair = `${dropoff.lng},${dropoff.lat}`;
  const res = await fetch(`/api/directions?pickup=${pickupPair}&dropoff=${dropoffPair}`);
  const data = await res.json();
  if (!res.ok || !data || typeof data.distance !== "number" || typeof data.duration !== "number") {
    throw new Error(data?.error || "Unable to fetch route");
  }
  return data;
}

function createCarMarker(): HTMLElement {
  const el = document.createElement("div");
  el.style.width = "40px";
  el.style.height = "40px";
  el.style.display = "flex";
  el.style.alignItems = "center";
  el.style.justifyContent = "center";
  el.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#ef4444" width="32" height="32">
      <path d="M5 11l1.5-4.5h11l1.5 4.5m-13 6h10v2H5z" stroke="white" stroke-width="1" fill="#ef4444"/>
    </svg>
  `;
  return el;
}

export default function PassengerDestinationUpdater({ rideId, pickupAddress, currentDropoffAddress, isEditMode, onUpdated }: Props) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const pickupMarker = useRef<mapboxgl.Marker | null>(null);
  const dropoffMarker = useRef<mapboxgl.Marker | null>(null);
  const carMarker = useRef<mapboxgl.Marker | null>(null);
  const suggestTimer = useRef<number | null>(null);

  const [pickupPoint, setPickupPoint] = useState<Point | null>(null);
  const [dropoffPoint, setDropoffPoint] = useState<Point | null>(null);
  const [destinationPoint, setDestinationPoint] = useState<Point | null>(null);
  const [dropoffAddress, setDropoffAddress] = useState<string>(currentDropoffAddress);
  const [query, setQuery] = useState<string>("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [navMode, setNavMode] = useState<'pickup' | 'destination' | null>(null);
  const [lastDriverPayload, setLastDriverPayload] = useState<any>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [routeDistance, setRouteDistance] = useState<number | null>(null);
  const [routeDuration, setRouteDuration] = useState<number | null>(null);
  const [fareEstimate, setFareEstimate] = useState<FareBreakdown | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [pickupRouteDistance, setPickupRouteDistance] = useState<number | null>(null);
  const [pickupRouteDuration, setPickupRouteDuration] = useState<number | null>(null);
  const [driverToDestDistance, setDriverToDestDistance] = useState<number | null>(null);
  const [driverToDestDuration, setDriverToDestDuration] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const lastFitRef = useRef<number | null>(null);
  const lastDriverRef = useRef<{ lat: number; lng: number } | null>(null);

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
        } catch (e) {}
      }
    });
    mapRef.current = map;

    map.on("load", () => {
      setMapLoaded(true);
      if (!map.getSource("route")) {
        map.addSource("route", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } } });
      }
      if (!map.getLayer("route-line")) {
        map.addLayer({
          id: "route-line",
          type: "line",
          source: "route",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#22c55e", "line-width": 5, "line-opacity": 0.9 },
        });
      }
    });

    map.on("click", (e: any) => {
      const point = { lng: e.lngLat.lng, lat: e.lngLat.lat };
      setDropoffPoint(point);
      setDropoffAddress("Resolving address...");
      setStatusMessage("Selected new destination on the map.");
    });

    return () => {
      pickupMarker.current?.remove();
      dropoffMarker.current?.remove();
      carMarker.current?.remove();
      map.remove();
    };
  }, []);

  useEffect(() => {
    if (!pickupAddress) return;
    let canceled = false;
    setMapError(null);
    geocodeAddress(pickupAddress)
      .then((point) => {
        if (canceled) return;
        if (!point) {
          setMapError("Unable to locate pickup address on the map.");
          return;
        }
        setPickupPoint(point);
      })
      .catch(() => setMapError("Unable to geocode pickup address."));
    return () => {
      canceled = true;
    };
  }, [pickupAddress]);

  useEffect(() => {
    if (!currentDropoffAddress) return;
    let canceled = false;
    reverseGeocodeForAddress(currentDropoffAddress);
    async function reverseGeocodeForAddress(address: string) {
      const point = await geocodeAddress(address);
      if (canceled) return;
      if (!point) {
        const trimmed = address.replace(/,?\s*South Africa$/i, "").trim();
        if (trimmed && trimmed !== address) {
          const fallback = await geocodeAddress(trimmed);
          if (!canceled && fallback) {
            setDropoffPoint(fallback);
            return;
          }
        }

        const short = address.replace(/,\s*Gauteng.*$/i, "").trim();
        if (short && short !== address) {
          const fallback2 = await geocodeAddress(short);
          if (!canceled && fallback2) {
            setDropoffPoint(fallback2);
            return;
          }
        }

        setMapError("Unable to locate current destination on the map.");
        return;
      }
      setDropoffPoint(point);
    }
    return () => {
      canceled = true;
    };
  }, [currentDropoffAddress]);

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    if (pickupPoint) {
      pickupMarker.current?.remove();
      pickupMarker.current = new mapboxgl.Marker({ color: "#22c55e" })
        .setLngLat([pickupPoint.lng, pickupPoint.lat])
        .addTo(map);
    }

    if (dropoffPoint) {
      dropoffMarker.current?.remove();
      dropoffMarker.current = new mapboxgl.Marker({ color: "#0ea5e9" })
        .setLngLat([dropoffPoint.lng, dropoffPoint.lat])
        .addTo(map);
    }

    // Fit bounds to include all relevant points, but avoid refitting on every small driver update.
    const bounds = new mapboxgl.LngLatBounds();
    if (driverLocation) bounds.extend([driverLocation.lng, driverLocation.lat]);
    if (pickupPoint) bounds.extend([pickupPoint.lng, pickupPoint.lat]);
    if (dropoffPoint) bounds.extend([dropoffPoint.lng, dropoffPoint.lat]);

    if (!bounds.getNorthEast() || !bounds.getSouthWest()) return;

    // Decide whether to refit: only if enough time passed or driver moved significantly.
    const now = Date.now();
    const MIN_REFIT_MS = 5000; // at least 5s between camera changes
    const DISTANCE_THRESHOLD_METERS = 200; // refit if driver moved >200m

    let shouldFit = false;
    if (!lastFitRef.current) {
      shouldFit = true;
    } else if (now - (lastFitRef.current ?? 0) > MIN_REFIT_MS) {
      shouldFit = true;
    } else if (driverLocation && lastDriverRef.current) {
      const d = haversineDistance(driverLocation.lat, driverLocation.lng, lastDriverRef.current.lat, lastDriverRef.current.lng);
      if (d > DISTANCE_THRESHOLD_METERS) shouldFit = true;
    }

    if (shouldFit) {
      try {
        map.fitBounds(bounds, { padding: 60, maxZoom: 14 });
        lastFitRef.current = now;
        lastDriverRef.current = driverLocation ?? null;
      } catch (e) {
        // Ignore if map unmounted
      }
    }
  }, [pickupPoint, dropoffPoint, driverLocation]);

  useEffect(() => {
    if (!dropoffPoint) return;
    let canceled = false;
    reverseGeocodePoint(dropoffPoint)
      .then((address) => {
        if (canceled) return;
        if (address) setDropoffAddress(address);
      })
      .catch(() => {
        if (!canceled) {
          setDropoffAddress(currentDropoffAddress);
        }
      });
    return () => {
      canceled = true;
    };
  }, [dropoffPoint, currentDropoffAddress]);

  useEffect(() => {
    if (!dropoffPoint || !mapLoaded) return;
    let canceled = false;
    setRouteDistance(null);
    setRouteDuration(null);
    setFareEstimate(null);
    setMapError(null);

    // For fare estimation compute route from pickup -> dropoff
    if (!pickupPoint) return;

    fetchRoute(pickupPoint, dropoffPoint)
      .then((data) => {
        if (canceled) return;
        setRouteDistance(data.distance);
        setRouteDuration(data.duration);
        const fare = computeFare(data.distance, data.duration);
        setFareEstimate(fare);
        if (mapRef.current?.getSource("route")) {
          const source = mapRef.current.getSource("route") as mapboxgl.GeoJSONSource;
          source.setData(data.geometry ?? { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } });
        }
      })
      .catch((error) => {
        if (canceled) return;
        setMapError(error instanceof Error ? error.message : String(error));
      });

    return () => {
      canceled = true;
    };
  }, [driverLocation, dropoffPoint, pickupPoint, mapLoaded]);

  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([]);
      return;
    }

    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    setLoadingSuggestions(true);

    suggestTimer.current = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/places/search?q=${encodeURIComponent(query)}`);
        if (!res.ok) {
          setSuggestions([]);
          return;
        }
        const data = await res.json();
        setSuggestions(data?.features ?? []);
      } catch {
        setSuggestions([]);
      } finally {
        setLoadingSuggestions(false);
      }
    }, 300);

    return () => {
      if (suggestTimer.current) clearTimeout(suggestTimer.current);
    };
  }, [query]);

  useEffect(() => {
    const socket = getSocket();

    const handleDriverLocation = (data: any) => {
      console.debug("PassengerDestinationUpdater driver-location", { data, rideId });
      setLastDriverPayload(data);
      if (String(data.rideId) === String(rideId) && typeof data.lat === "number" && typeof data.lng === "number") {
        setDriverLocation({ lat: data.lat, lng: data.lng });

        try {
          window.dispatchEvent(new CustomEvent('driver-location', { detail: { rideId: String(rideId), lat: data.lat, lng: data.lng } }));
        } catch (e) {}

        const map = mapRef.current;
        if (!map) return;

        if (carMarker.current) {
          console.debug("Updating existing car marker", { lng: data.lng, lat: data.lat });
          carMarker.current.setLngLat([data.lng, data.lat]);
        } else {
          console.debug("Creating car marker on passenger map", { lng: data.lng, lat: data.lat });
          const carEl = createCarMarker();
          carMarker.current = new mapboxgl.Marker(carEl)
            .setLngLat([data.lng, data.lat])
            .addTo(map);
          // If car marker is outside current viewport, pan the map a little so it's visible (one-time)
          try {
            const bounds = map.getBounds();
            if (bounds && !bounds.contains([data.lng, data.lat])) {
              map.easeTo({ center: [data.lng, data.lat], duration: 700 });
            }
          } catch (e) {
            // ignore
          }
        }
      }
    };

    // initialize navMode from localStorage if present
    try {
      const stored = window.localStorage.getItem(`driverNavMode_${rideId}`);
      if (stored === "driveToPickup") setNavMode("pickup");
      else if (stored === "driveToDestination" || stored === "finishRide") setNavMode("destination");
    } catch (e) {}

    socket.on("driver-location", handleDriverLocation);

    // Fetch initial driver location immediately on mount (fallback before socket updates)
    const fetchInitialLocation = async () => {
      try {
        const res = await fetch(`/api/driver/active-ride?rideId=${rideId}`);
        if (res.ok) {
          const data = await res.json();
          if (data?.driver?.driver_lat && data?.driver?.driver_lng) {
            const driverLoc = { lat: data.driver.driver_lat, lng: data.driver.driver_lng };
            handleDriverLocation({
              rideId,
              lat: driverLoc.lat,
              lng: driverLoc.lng,
            });
            
            // Immediately calculate routes after getting initial location
            setTimeout(async () => {
              try {
                if (pickupPoint && mapLoaded) {
                  const r = await fetchRoute(driverLoc, pickupPoint);
                  if (r && typeof r.distance === 'number' && typeof r.duration === 'number') {
                    console.debug("Initial pickup route", { distance: r.distance, duration: r.duration });
                    setPickupRouteDistance(r.distance);
                    setPickupRouteDuration(r.duration);
                  }
                }
                if (dropoffPoint && mapLoaded) {
                  const r2 = await fetchRoute(driverLoc, dropoffPoint);
                  if (r2 && typeof r2.distance === 'number' && typeof r2.duration === 'number') {
                    console.debug("Initial destination route", { distance: r2.distance, duration: r2.duration });
                    setDriverToDestDistance(r2.distance);
                    setDriverToDestDuration(r2.duration);
                  }
                }
              } catch (e) {
                console.debug("Failed to calculate initial routes", e);
              }
            }, 500);
          }
        }
      } catch (e) {
        console.debug("Failed to fetch initial driver location", e);
      }
    };

    fetchInitialLocation();

    // Additionally, when we get a driver-location update, fetch route/ETA to pickup and to selected dropoff
    const extraHandler = async (data: any) => {
      try {
        if (String(data.rideId) !== String(rideId)) return;
        if (typeof data.lat !== 'number' || typeof data.lng !== 'number') return;
        
        const driverLoc = { lat: data.lat, lng: data.lng };
        
        // fetch ETA/distance to pickup
        if (pickupPoint && mapLoaded) {
          try {
            const r = await fetchRoute(driverLoc, pickupPoint);
            if (r && typeof r.distance === 'number' && typeof r.duration === 'number') {
              setPickupRouteDistance(r.distance);
              setPickupRouteDuration(r.duration);
            }
          } catch (e) {
            console.debug("Failed to fetch pickup route", e);
          }
        }

        // fetch ETA/distance from driver to destination (use pre-cached dropoffPoint, NOT geocoding on every update)
        if (dropoffPoint && mapLoaded) {
          try {
            const r2 = await fetchRoute(driverLoc, dropoffPoint);
            if (r2 && typeof r2.distance === 'number' && typeof r2.duration === 'number') {
              setDriverToDestDistance(r2.distance);
              setDriverToDestDuration(r2.duration);
            }
          } catch (e) {
            console.debug("Failed to fetch destination route", e);
          }
        }
      } catch (e) {
        console.debug("Error in extraHandler", e);
      }
    };

    socket.on("driver-location", extraHandler);

    const handleNavTarget = (e: any) => {
      try {
        const d = e?.detail;
        if (!d || String(d.rideId) !== String(rideId)) return;
        if (d.mode === "pickup") setNavMode("pickup");
        else if (d.mode === "destination") setNavMode("destination");
        else setNavMode(null);
      } catch (e) {}
    };

    window.addEventListener("driverNavTarget", handleNavTarget as EventListener);

    return () => {
      socket.off("driver-location", handleDriverLocation);
      socket.off("driver-location", extraHandler);
      window.removeEventListener("driverNavTarget", handleNavTarget as EventListener);
    };
  }, [rideId, pickupPoint, dropoffPoint, mapLoaded]);

  // Debug panel helper
  const markerExists = !!carMarker.current;

  const selectSuggestion = async (suggestion: Suggestion) => {
    const point = { lng: suggestion.center[0], lat: suggestion.center[1] };
    setDropoffPoint(point);
    setDropoffAddress(suggestion.place_name);
    setQuery("");
    setSuggestions([]);
    setStatusMessage("Selected destination from search.");
  };

  const handleSave = async () => {
    if (!dropoffPoint || !dropoffAddress) {
      setStatusMessage("Select a new destination on the map first.");
      return;
    }
    if (!fareEstimate) {
      setStatusMessage("Wait until the new price is calculated.");
      return;
    }

    setSaving(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/passenger/update-destination", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rideId, dropoff_address: dropoffAddress }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Unable to update destination.");
      }
      onUpdated(data);
      setStatusMessage("Destination updated. New price applied.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-4 text-sm text-slate-200">
      <h3 className="mb-3 text-lg font-semibold text-white">Live route map</h3>
      <div className="grid gap-3 lg:grid-cols-[1.25fr_0.9fr]">
        <div className="min-h-[360px] rounded-xl overflow-hidden border border-white/10 bg-slate-900" ref={mapEl} />

        <div className="space-y-3">
          <div className="rounded-xl border border-white/10 bg-slate-950/70 p-3">
            <div className="text-xs uppercase tracking-wide text-slate-400">Pickup</div>
            <div className="mt-2 font-medium text-white">{pickupAddress}</div>
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-950/70 p-3">
            <div className="text-xs uppercase tracking-wide text-slate-400">Your destination</div>
            <div className="mt-2 font-medium text-white">{currentDropoffAddress}</div>
          </div>

          {driverLocation && navMode === 'pickup' ? (
            <div className="rounded-xl border border-white/10 bg-blue-950/70 p-3">
              <div className="text-xs uppercase tracking-wide text-blue-300">Driver heading to pickup</div>
              <div className="mt-2 text-lg font-semibold text-cyan-300">
                {pickupRouteDistance ? formatMeters(pickupRouteDistance) : "Calculating..."}
              </div>
              <div className="mt-1 text-sm text-slate-300">
                Estimated ETA: {pickupRouteDuration ? formatMinutes(pickupRouteDuration) : "Calculating..."}
              </div>
            </div>
          ) : driverLocation && navMode === 'destination' ? (
            <div className="rounded-xl border border-white/10 bg-green-950/70 p-3">
              <div className="text-xs uppercase tracking-wide text-green-300">Driver heading to destination</div>
              <div className="mt-2 text-lg font-semibold text-cyan-300">
                {driverToDestDistance ? formatMeters(driverToDestDistance) : "Calculating..."}
              </div>
              <div className="mt-1 text-sm text-slate-300">
                Estimated ETA: {driverToDestDuration ? formatMinutes(driverToDestDuration) : "Calculating..."}
              </div>
            </div>
          ) : !driverLocation ? (
            <div className="rounded-xl border border-white/10 bg-slate-950/70 p-3">
              <div className="text-xs uppercase tracking-wide text-slate-400">Estimated ETA</div>
              <div className="mt-2 text-sm text-slate-400">Connecting to driver...</div>
            </div>
          ) : null}

          {isEditMode ? (
            <>
              <div className="rounded-xl border border-white/10 bg-slate-950/70 p-3">
                <div className="text-xs uppercase tracking-wide text-slate-400">Search new destination</div>
                <div className="mt-2">
                  <input
                    className="w-full rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                    placeholder="Type an address or place"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label="Search destination"
                  />
                  {loadingSuggestions ? <div className="mt-2 text-xs text-slate-400">Searching...</div> : null}
                  {suggestions.length > 0 ? (
                    <ul className="mt-2 max-h-48 overflow-auto rounded-md border border-white/10 bg-slate-900 p-1 text-sm">
                      {suggestions.map((suggestion) => (
                        <li
                          key={suggestion.id}
                          className="cursor-pointer rounded px-2 py-1 hover:bg-white/5 text-slate-300 hover:text-white"
                          onClick={() => selectSuggestion(suggestion)}
                        >
                          {suggestion.place_name}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-slate-950/70 p-3">
                <div className="text-xs uppercase tracking-wide text-slate-400">New destination</div>
                <div className="mt-2 font-medium text-white">{dropoffAddress || "Click on the map or search for a new destination"}</div>
                <div className="mt-2 text-xs text-slate-400">Click any point on the map or search above to choose a new destination.</div>
              </div>

              <div className="rounded-xl border border-white/10 bg-slate-950/70 p-3">
                <div className="text-xs uppercase tracking-wide text-slate-400">New fare estimate</div>
                <div className="mt-2 text-white text-lg">
                  {fareEstimate ? `R ${fareEstimate.fare.toFixed(2)}` : "Select a destination"}
                </div>
                {fareEstimate ? (
                  <div className="mt-2 text-xs text-slate-400">
                    Distance: {formatMeters(routeDistance)} • ETA: {formatMinutes(routeDuration)}
                  </div>
                ) : null}
              </div>
            </>
          ) : null}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !dropoffPoint || !fareEstimate || !isEditMode}
            className="rounded-full bg-gradient-to-r from-blue-600 to-cyan-400 px-4 py-2 text-sm font-semibold text-white"
            style={{ display: isEditMode ? "block" : "none" }}
          >
            {saving ? "Saving destination..." : "Save new destination"}
          </button>
          {statusMessage && isEditMode ? (
            <div className="text-sm text-slate-300">{statusMessage}</div>
          ) : null}
          {mapError ? <div className="text-sm text-rose-400">{mapError}</div> : null}
          <div className="mt-3 text-xs text-slate-400">
            <div className="mb-1 font-semibold text-white">Debug (temp)</div>
            <div>Last driver payload: {lastDriverPayload ? JSON.stringify(lastDriverPayload) : "(none)"}</div>
            <div>Car marker exists: {markerExists ? "yes" : "no"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
