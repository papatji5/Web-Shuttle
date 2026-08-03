"use client";

import { useEffect, useRef, useState } from "react";
import { getSocket } from "@/lib/socket";
import { useRouter } from "next/navigation";
import Image from "next/image";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import MapboxPlaceSearch from "./MapboxPlaceSearch";
import PassengerRideSockets from "./PassengerRideSockets";

type Suggestion = { id: string; place_name: string; center: [number, number] };
type RouteFeature = GeoJSON.Feature<GeoJSON.LineString>;

type FeaturedDriver = {
  name: string;
  phone: string;
  car: string;
  plate: string;
  driverPhotoSrc: string;
  driverPhotoAlt: string;
  carPhotoSrc: string;
  carPhotoAlt: string;
  notes: string;
};

const featuredDriver: FeaturedDriver = {
  name: "austine",
  phone: "0735163121",
  car: "2023 Mercedes-Benz C-Class C200 Avantgarde",
  plate: "LG35FX GP",
  driverPhotoSrc: "/professional_portrait.png",
  driverPhotoAlt: "Austine driver profile photo",
  carPhotoSrc: "/Mercedes_Benz_C200_Clean.png",
  carPhotoAlt: "Mercedes-Benz C200 clean car image",
  notes: "Available for Johannesburg and Pretoria trips during the MVP pilot.",
};

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const radiusMeters = 6371e3;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaPhi = toRad(lat2 - lat1);
  const deltaLambda = toRad(lon2 - lon1);

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return radiusMeters * c;
}

export default function PassengerRidePlanner() {
  const router = useRouter();
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapFormEl = useRef<HTMLDivElement | null>(null);
  const mapFormRef = useRef<mapboxgl.Map | null>(null);
  const pickupMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const dropoffMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const carMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const suggestTimer = useRef<number | null>(null);

  const [pickup, setPickup] = useState<{ lng: number; lat: number } | null>(null);
  const [dropoff, setDropoff] = useState<{ lng: number; lat: number } | null>(null);
  const [pickupAddress, setPickupAddress] = useState<string | null>(null);
  const [dropoffAddress, setDropoffAddress] = useState<string | null>(null);
  const [geoStatus, setGeoStatus] = useState<string>("idle");
  const [geoError, setGeoError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD">("CASH");
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [scheduledError, setScheduledError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [pendingRideId, setPendingRideId] = useState<string | null>(null);
  const [waitingForDriver, setWaitingForDriver] = useState(false);

  const [straightDistance, setStraightDistance] = useState<number | null>(null);
  const [routeDistance, setRouteDistance] = useState<number | null>(null);
  const [routeDuration, setRouteDuration] = useState<number | null>(null);
  const [fetchingRoute, setFetchingRoute] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeFeature, setRouteFeature] = useState<RouteFeature | null>(null);

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
    if (!token) return;
    mapboxgl.accessToken = token;

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

    // Initialize the compact form map when the compact map element is present
    if (mapFormEl.current) {
      const fm = new mapboxgl.Map({
        container: mapFormEl.current,
        style: "mapbox://styles/mapbox/streets-v11",
        center: [28.0473, -26.2041],
        zoom: 12,
      });
      fm.on("error", (event) => {
        if (event && event.error && typeof event.error.message === "string" && event.error.message.includes("style")) {
          try {
            fm.setStyle(fallbackStyle);
          } catch (e) {}
        }
      });
      mapFormRef.current = fm;

      fm.on("load", () => {
        if (!fm.getSource("route")) {
          fm.addSource("route", {
            type: "geojson",
            data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } },
          });
        }

        if (!fm.getLayer("route-line")) {
          fm.addLayer({
            id: "route-line",
            type: "line",
            source: "route",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": "#22c55e", "line-width": 5, "line-opacity": 0.9 },
          });
        }
      });

      fm.on("click", (e: any) => {
        const { lng, lat } = e.lngLat;
        setDropoff({ lng, lat });
      });

      return () => fm.remove();
    }

    // Otherwise initialize the larger desktop map (only if compact map element not present)
    if (mapEl.current) {
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
        if (!map.getSource("route")) {
          map.addSource("route", {
            type: "geojson",
            data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } },
          });
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
        const { lng, lat } = e.lngLat;
        setDropoff({ lng, lat });
      });

      return () => map.remove();
    }
  }, []);

  // Listen for driver-location events via Socket.IO and update the main map car marker
  useEffect(() => {
    const socket = getSocket();

    const handle = (data: any) => {
      try {
        if (!data || data.lat == null || data.lng == null) return;
        const map = mapFormRef.current ?? mapRef.current;
        if (!map) return;

        if (!carMarkerRef.current) {
          const el = document.createElement('div');
          el.style.width = '28px';
          el.style.height = '28px';
          el.style.borderRadius = '50%';
          el.style.backgroundColor = '#0369a1';
          el.style.border = '2px solid white';
          el.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
          carMarkerRef.current = new mapboxgl.Marker(el).setLngLat([data.lng, data.lat]).addTo(map);
        } else {
          carMarkerRef.current.setLngLat([data.lng, data.lat]);
        }

        try {
          map.easeTo({ center: [data.lng, data.lat], duration: 1000 });
        } catch (e) {}
      } catch (e) {}
    };

    if (socket && socket.on) {
      socket.on('driver-location', handle);
    }

    return () => {
      try {
        if (socket && socket.off) socket.off('driver-location', handle);
      } catch (e) {}
    };
  }, []);



  async function reverseGeocode(lng: number, lat: number) {
    try {
      const res = await fetch(`/api/reverse-geocode?lat=${lat}&lng=${lng}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data?.place_name ?? null;
    } catch {
      return null;
    }
  }

  async function detectPickup() {
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
        setGeoStatus("granted");
        const activeMap = mapFormRef.current ?? mapRef.current;
        if (activeMap) activeMap.flyTo({ center: [lng, lat], zoom: 14 });
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
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  }

  useEffect(() => {
    detectPickup();
  }, []);

  useEffect(() => {
    const map = mapFormRef.current ?? mapRef.current;
    if (!map) return;

    pickupMarkerRef.current?.remove();
    if (pickup) {
      pickupMarkerRef.current = new mapboxgl.Marker({ color: "#06b6d4" })
        .setLngLat([pickup.lng, pickup.lat])
        .addTo(map);
    }

    dropoffMarkerRef.current?.remove();
    if (dropoff) {
      dropoffMarkerRef.current = new mapboxgl.Marker({ color: "#06d65f" })
        .setLngLat([dropoff.lng, dropoff.lat])
        .addTo(map);
    }
  }, [pickup, dropoff]);

  useEffect(() => {
    (async () => {
      if (pickup) {
        setPickupAddress("Resolving address...");
        const resolved = await reverseGeocode(pickup.lng, pickup.lat);
        setPickupAddress(resolved ?? "(address not found)");
      }
      if (dropoff) {
        setDropoffAddress("Resolving address...");
        const resolved = await reverseGeocode(dropoff.lng, dropoff.lat);
        setDropoffAddress(resolved ?? "(address not found)");
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
        const res = await fetch(
          `/api/directions?pickup=${pickup.lng},${pickup.lat}&dropoff=${dropoff.lng},${dropoff.lat}`,
        );
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          setRouteError(data?.detail ?? data?.error ?? "Route request failed");
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
    const map = mapFormRef.current ?? mapRef.current;
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
        const res = await fetch(`/api/places/search?q=${encodeURIComponent(query)}`);
        if (!res.ok) {
          setSuggestions([]);
          return;
        }

        const data = await res.json();
        const items: Suggestion[] = (data.features || []).map((feature: any) => ({
          id: feature.id,
          place_name: feature.place_name,
          center: feature.center,
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

  function selectSuggestion(suggestion: Suggestion) {
    const [lng, lat] = suggestion.center;
    setDropoff({ lng, lat });
    setDropoffAddress(suggestion.place_name);
    setQuery(suggestion.place_name);
    setSuggestions([]);
    const map = mapFormRef.current ?? mapRef.current;
    if (map) map.flyTo({ center: [lng, lat], zoom: 15 });
  }

  async function handleFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    async function parseResponse(res: Response) {
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        return { error: text };
      }
    }

    if (scheduledAt) {
      const proposedDate = new Date(scheduledAt);
      if (isNaN(proposedDate.getTime())) {
        setScheduledError("Scheduled pickup time is invalid.");
        return;
      }
      if (proposedDate.getTime() < Date.now()) {
        setScheduledError("Scheduled pickup time must be in the future.");
        return;
      }
    }

    if (paymentMethod === "CASH") {
      // Direct cash payment: submit ride request through the API and wait for a driver to accept.
      setPaymentError(null);
      try {
        const createRideRes = await fetch("/api/rides/create-pending", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            pickup_address: pickupAddressValue,
            dropoff_address: dropoffAddressValue,
            scheduled_at: scheduledAt || null,
            estimated_distance_km: effectiveDistance ? effectiveDistance / 1000 : null,
            estimated_duration_min: effectiveDuration ? effectiveDuration / 60 : null,
            estimated_fare_cents: fareEstimate ? Math.round(fareEstimate.fare * 100) : null,
            payment_method: "CASH",
          }),
        });

        const rideData = await parseResponse(createRideRes);
        if (!createRideRes.ok || !rideData?.rideId) {
          setWaitingForDriver(false);
          setPaymentError(rideData?.error || rideData?.message || "Failed to request ride.");
          return;
        }

        setPendingRideId(String(rideData.rideId));
        setWaitingForDriver(true);
        setStatusMessage("Ride requested successfully. Waiting for a driver to accept your request.");
        setPickup(null);
        setDropoff(null);
        setPickupAddress(null);
        setDropoffAddress(null);
        setQuery("");
        setSuggestions([]);
        setRouteDistance(null);
        setRouteDuration(null);
        setRouteError(null);
        setRouteFeature(null);
        setPaymentMethod("CASH");
      } catch (err) {
        setWaitingForDriver(false);
        setPaymentError(err instanceof Error ? err.message : String(err));
      }
      return;
    } else if (paymentMethod === "CARD") {
      // Card payment: create ride + redirect to Stripe checkout
      if (!fareEstimate || !pickupAddressValue || !dropoffAddressValue) {
        setPaymentError("Cannot calculate fare or missing location. Please try again.");
        return;
      }

      setPaymentProcessing(true);
      try {
        // Fetch user email for Stripe
        const emailRes = await fetch("/api/auth/user");
        const emailData = await parseResponse(emailRes);
        const email = emailData?.email || "passenger@example.com";

        // Create a pending ride on the server
        const createRideRes = await fetch("/api/rides/create-pending", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pickup_address: pickupAddressValue,
            dropoff_address: dropoffAddressValue,
            scheduled_at: scheduledAt || null,
            estimated_distance_km: effectiveDistance ? effectiveDistance / 1000 : null,
            estimated_duration_min: effectiveDuration ? effectiveDuration / 60 : null,
            estimated_fare_cents: fareEstimate ? Math.round(fareEstimate.fare * 100) : null,
            payment_method: "CARD",
          }),
        });

        const rideData = await parseResponse(createRideRes);
        if (!createRideRes.ok || !rideData?.rideId) {
          setPaymentError(rideData?.error || rideData?.message || "Failed to create ride before payment");
          setPaymentProcessing(false);
          return;
        }

        const rideId = String(rideData.rideId);
        const amount = fareEstimate ? Math.round(fareEstimate.fare * 100) : 0;

        // Initialize Stripe checkout
        const stripeRes = await fetch("/api/payment/initialize-stripe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            amount_cents: amount,
            ride_id: rideId,
          }),
        });

        const stripeData = await parseResponse(stripeRes);
        if (!stripeRes.ok || !stripeData?.url) {
          setPaymentError(stripeData?.error || stripeData?.message || "Failed to initialize payment");
          setPaymentProcessing(false);
          return;
        }

        // Redirect to Stripe checkout
        window.location.href = stripeData.url;
      } catch (err) {
        setPaymentError(err instanceof Error ? err.message : "Payment initialization failed");
        setPaymentProcessing(false);
      }
    }
  }


  const fareConfig = {
    // Uber Black Premium Pricing
    baseFare: 32, // Higher base for premium service
    perKm: 20, // Premium per-km rate
    perMinute: 2.8, // Premium per-minute rate
    minFare: 65, // Higher minimum for premium rides
    surge: 1, // 1x = no surge (can be adjusted for peak times)
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

  function formatMeters(value?: number | null) {
    if (value == null) return "N/A";
    if (value >= 1000) return `${(value / 1000).toFixed(2)} km`;
    return `${Math.round(value)} m`;
  }

  function formatMinutes(value?: number | null) {
    if (value == null) return "N/A";
    return `${Math.max(1, Math.round(value / 60))} min`;
  }

  const effectiveDistance = routeDistance ?? straightDistance;
  const fallbackEtaSeconds = straightDistance != null ? straightDistance / (fareConfig.avgSpeedKmph * 1000 / 3600) : null;
  const effectiveDuration = routeDuration ?? fallbackEtaSeconds;
  const fareEstimate = computeFare(effectiveDistance, effectiveDuration);

  const pickupAddressValue = pickupAddress && pickupAddress !== "Resolving address..." ? pickupAddress : "";
  const dropoffAddressValue = dropoffAddress && dropoffAddress !== "Resolving address..." ? dropoffAddress : "";
  const canRequestRide = Boolean(pickup && dropoff && pickupAddressValue && dropoffAddressValue);

  return (
    <section className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(360px,1fr)]">

      {/* Map column: shown above form on mobile, left column on desktop (wider) */}
      <div className="rounded-xl border border-white/10 bg-slate-900 p-2 mb-3 lg:mb-0">
        <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">Live ride map</div>
        <div
          ref={mapFormEl}
          style={{ width: "100%", height: "520px", borderRadius: 8, overflow: "hidden" }}
        />
      </div>

      <form onSubmit={handleFormSubmit} className="space-y-4 rounded-xl border border-white/10 bg-white/3 p-4">
        <div>
          <p className="text-sm text-slate-300">Passenger ride request</p>
          <h2 className="mt-1 text-xl font-semibold text-white">Pick a dropoff and request a ride</h2>
          <p className="mt-1 text-sm text-slate-400">Your pickup can be detected automatically or moved to the map center.</p>
        </div>

        <div className="overflow-hidden rounded-[32px] border border-cyan-400/15 bg-gradient-to-br from-slate-950/95 via-slate-900/95 to-slate-950/90 shadow-[0_30px_90px_rgba(14,165,233,0.15)]">
          <div className="flex flex-col gap-5 p-6 md:flex-row md:items-center md:gap-7">
            <div className="relative h-40 w-40 shrink-0 overflow-hidden rounded-[30px] border border-cyan-400/10 bg-slate-900 shadow-[0_30px_80px_rgba(15,23,42,0.4)]">
              <Image src={featuredDriver.driverPhotoSrc} alt={featuredDriver.driverPhotoAlt} fill className="object-cover" sizes="160px" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200 shadow-sm shadow-cyan-500/10">
                  Featured driver
                </span>
                <span className="rounded-full border border-slate-700/70 bg-slate-900/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-300">
                  Premium service
                </span>
              </div>
              <div className="mt-4">
                <h3 className="truncate text-3xl font-semibold text-white">{featuredDriver.name}</h3>
                <a
                  href={`tel:${featuredDriver.phone.replace(/\s+/g, "")}`}
                  className="mt-3 inline-flex text-sm font-semibold uppercase tracking-[0.22em] text-cyan-300 transition hover:text-cyan-100"
                >
                  {featuredDriver.phone}
                </a>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400">{featuredDriver.notes}</p>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-700/60 bg-slate-950/85 p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Premium vehicle</div>
                <div className="mt-3 text-xl font-semibold text-white">{featuredDriver.car}</div>
              </div>
              <div className="rounded-3xl bg-slate-900/90 px-4 py-3 text-sm text-slate-300 border border-slate-700/80">
                Registration
                <div className="mt-1 text-base font-semibold text-white">{featuredDriver.plate}</div>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-slate-700/70 bg-slate-900/90 p-4 text-sm text-slate-300 shadow-[0_10px_30px_rgba(15,23,42,0.25)]">
                <div className="text-xs uppercase tracking-[0.18em] text-cyan-300/80">Driver quality</div>
                <div className="mt-2 text-base font-semibold text-white">Fully verified, professional service</div>
              </div>
              <div className="rounded-3xl border border-slate-700/70 bg-slate-900/90 p-4 text-sm text-slate-300 shadow-[0_10px_30px_rgba(15,23,42,0.25)]">
                <div className="text-xs uppercase tracking-[0.18em] text-cyan-300/80">Comfort status</div>
                <div className="mt-2 text-base font-semibold text-white">Luxury sedan with climate control</div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-700/70 bg-slate-900/90 p-5 text-sm text-slate-200 shadow-[0_25px_80px_rgba(15,23,42,0.3)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Pickup</div>
              <div className="mt-3 text-base font-semibold text-white">
                {pickup ? `${pickup.lat.toFixed(6)}, ${pickup.lng.toFixed(6)}` : geoStatus === "requesting" ? "Detecting..." : "Not detected"}
              </div>
            </div>
            <span className="inline-flex rounded-full bg-cyan-500/10 px-3 py-1 text-xs uppercase tracking-[0.18em] text-cyan-200 ring-1 ring-cyan-500/20">Live pickup</span>
          </div>
          <div className="mt-3 text-xs leading-6 text-slate-400">{pickupAddress ?? (geoStatus === "requesting" ? "Resolving address..." : "Allow location or use map center.")}</div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              className="rounded-3xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition hover:brightness-110"
              onClick={() => detectPickup()}
            >
              Retry pickup
            </button>
            <button
              type="button"
              className="rounded-3xl border border-slate-700/80 bg-slate-950/90 px-5 py-3 text-sm font-semibold text-white transition hover:border-cyan-400/50"
              onClick={() => {
                const activeMap = mapFormRef.current ?? mapRef.current;
                if (activeMap) {
                  const center = activeMap.getCenter();
                  setPickup({ lng: center.lng, lat: center.lat });
                  setPickupAddress(null);
                }
              }}
            >
              Use center
            </button>
          </div>
          {geoError ? <div className="mt-4 rounded-3xl bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{geoError}</div> : null}
        </div>

        {/* Map moved to left column on larger screens */}

        <div className="rounded-[28px] border border-slate-700/70 bg-slate-900/90 p-5 text-sm text-slate-200 shadow-[0_25px_75px_rgba(15,23,42,0.28)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Dropoff</div>
              <div className="mt-2 text-sm text-slate-300">Choose where you want the driver to take you.</div>
            </div>
            <span className="inline-flex rounded-full bg-slate-800/90 px-3 py-1 text-xs uppercase tracking-[0.18em] text-slate-300 ring-1 ring-slate-700/80">Map-enabled</span>
          </div>
            <div className="mt-4">
              <MapboxPlaceSearch
                placeholder="Search destination (e.g. Mall of Africa)"
                onSelect={(place) => {
                  const [lng, lat] = place.center;
                  setDropoff({ lng, lat });
                  setDropoffAddress(place.place_name);
                  setQuery(place.place_name);
                  setSuggestions([]);
                  const map = mapFormRef.current ?? mapRef.current;
                  if (map) map.flyTo({ center: [lng, lat], zoom: 15 });
                }}
              />
            </div>
          <div className="mt-5 rounded-[28px] border border-slate-700/70 bg-slate-950/90 px-5 py-4 text-sm text-slate-300 shadow-[0_10px_30px_rgba(15,23,42,0.25)]">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Selected destination</div>
            <div className="mt-3 text-base font-semibold text-white">
              {dropoffAddress ?? (dropoff ? `${dropoff.lat.toFixed(6)}, ${dropoff.lng.toFixed(6)}` : "Click map or pick suggestion")}
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-700/70 bg-slate-900/90 p-5 text-sm text-slate-200 shadow-[0_25px_75px_rgba(15,23,42,0.28)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Schedule pickup</div>
              <div className="mt-2 text-sm text-slate-300">Leave blank for ASAP or choose a future pickup time.</div>
            </div>
            <span className="inline-flex rounded-full bg-slate-800/90 px-3 py-1 text-xs uppercase tracking-[0.18em] text-slate-300 ring-1 ring-slate-700/80">
              {scheduledAt ? "Scheduled" : "ASAP"}
            </span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
            <input
              type="datetime-local"
              name="scheduled_at"
              value={scheduledAt}
              min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
                .toISOString()
                .slice(0, 16)}
              onChange={(event) => {
                setScheduledError(null);
                setScheduledAt(event.target.value);
              }}
              className="w-full rounded-[28px] border border-slate-700/80 bg-slate-950/95 px-5 py-3 text-sm text-white outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
            />
            <button
              type="button"
              className="rounded-full border border-slate-700/80 bg-slate-900/95 px-4 py-3 text-sm text-slate-200 transition hover:border-cyan-400"
              onClick={() => {
                setScheduledAt("");
                setScheduledError(null);
              }}
            >
              Clear
            </button>
          </div>
          {scheduledError ? (
            <div className="mt-3 rounded-2xl bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{scheduledError}</div>
          ) : (
            <div className="mt-3 text-xs text-slate-400">If you choose a future time, the ride will be scheduled for that pickup.</div>
          )}
        </div>

        <div className="rounded-lg border border-white/10 bg-slate-900/80 p-3 text-sm text-slate-200">
          <div className="text-xs uppercase tracking-wide text-slate-400">Estimate</div>
          <div className="mt-2 font-medium text-white">Straight: {formatMeters(straightDistance)}</div>
          <div className="text-sm text-slate-400">Route: {routeDistance ? formatMeters(routeDistance) : "N/A"} - ETA: {formatMinutes(routeDuration ?? fallbackEtaSeconds)}</div>
          {fetchingRoute ? <div className="mt-1 text-xs text-slate-400">Fetching route...</div> : null}
          {routeError ? <div className="mt-1 text-xs text-rose-400">{routeError}</div> : null}
          {!routeError && !routeDistance && pickup && dropoff ? <div className="mt-1 text-xs text-amber-300">Using straight-line ETA until Mapbox route is available.</div> : null}
          <div className="mt-3 text-xs uppercase tracking-wide text-slate-400">Estimated fare</div>
          <div className="mt-1 text-xl font-semibold text-white">{fareEstimate ? `R ${fareEstimate.fare.toFixed(2)}` : "N/A"}</div>
          {fareEstimate ? (
            <div className="mt-1 text-sm text-slate-400">
              Breakdown: Base R{fareEstimate.breakdown.base} + Distance R{fareEstimate.breakdown.distanceCharge} + Time R{fareEstimate.breakdown.timeCharge}
            </div>
          ) : null}
        </div>

        <div className="rounded-lg border border-white/10 bg-slate-900/80 p-3 text-sm text-slate-200">
          <div className="text-xs uppercase tracking-wide text-slate-400">Payment method</div>
          <div className="mt-3 grid gap-3">
            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950 px-3 py-3 cursor-pointer">
              <input
                type="radio"
                name="payment_method"
                value="CASH"
                checked={paymentMethod === "CASH"}
                onChange={() => setPaymentMethod("CASH")}
                className="h-4 w-4 text-cyan-400"
              />
              <div>
                <div className="font-medium text-white">Cash</div>
                <div className="text-xs text-slate-400">Pay the driver in cash on arrival.</div>
              </div>
            </label>

            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950 px-3 py-3 cursor-pointer">
              <input
                type="radio"
                name="payment_method"
                value="CARD"
                checked={paymentMethod === "CARD"}
                onChange={() => setPaymentMethod("CARD")}
                className="h-4 w-4 text-cyan-400"
              />
              <div>
                <div className="font-medium text-white">Card</div>
                <div className="text-xs text-slate-400">Pay by card via Stripe (test mode).</div>
              </div>
            </label>
          </div>
          {paymentError ? (
            <div className="mt-3 rounded-lg border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs text-rose-300">
              {paymentError}
            </div>
          ) : null}
        </div>

        <input type="hidden" name="payment_method" value={paymentMethod} />
        <input type="hidden" name="pickup_address" value={pickupAddressValue} />
        <input type="hidden" name="dropoff_address" value={dropoffAddressValue} />
        <input type="hidden" name="pickup_lng" value={pickup?.lng?.toString() ?? ""} />
        <input type="hidden" name="pickup_lat" value={pickup?.lat?.toString() ?? ""} />
        <input type="hidden" name="dropoff_lng" value={dropoff?.lng?.toString() ?? ""} />
        <input type="hidden" name="dropoff_lat" value={dropoff?.lat?.toString() ?? ""} />
        <input type="hidden" name="scheduled_at" value={scheduledAt} />
        <input type="hidden" name="estimated_distance_km" value={effectiveDistance != null ? (effectiveDistance / 1000).toFixed(3) : ""} />
        <input type="hidden" name="estimated_duration_min" value={effectiveDuration != null ? (effectiveDuration / 60).toFixed(2) : ""} />
        <input type="hidden" name="estimated_fare_cents" value={fareEstimate ? Math.round(fareEstimate.fare * 100).toString() : ""} />

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="submit"
            className="rounded-full bg-gradient-to-r from-blue-600 to-cyan-400 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!canRequestRide || paymentProcessing || waitingForDriver}
          >
            {paymentProcessing ? "Redirecting to payment..." : waitingForDriver ? "Waiting for driver..." : "Request ride"}
          </button>
          <button
            type="button"
            className="rounded-full border border-white/10 px-4 py-2 text-sm text-white"
            onClick={() => {
              setQuery("");
              setSuggestions([]);
              setDropoff(null);
              setDropoffAddress(null);
              setRouteDistance(null);
              setRouteDuration(null);
              setRouteError(null);
              setRouteFeature(null);
            }}
          >
            Clear dropoff
          </button>
        </div>
        {paymentProcessing && paymentMethod === "CARD" ? (
          <div className="mt-2 rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-sm text-cyan-100">
            Redirecting to Stripe payment...
          </div>
        ) : null}
        {statusMessage ? (
          <div className={`mt-3 rounded-lg px-3 py-2 text-sm ${waitingForDriver ? "border border-cyan-400/20 bg-cyan-400/10 text-cyan-900" : "border border-emerald-400/20 bg-emerald-400/10 text-emerald-900"}`}>
            {statusMessage}
          </div>
        ) : null}
      </form>
      {pendingRideId ? <PassengerRideSockets rideIds={[pendingRideId]} /> : null}


    </section>
  );
}
