"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { sendDriverLocation, joinRide, leaveRide } from "@/lib/rideSocket";

function formatTime(value: Date | null) {
  return value ? value.toLocaleTimeString() : "Never";
}

function decodePolyline(str: string) {
  let index = 0;
  const coordinates: [number, number][] = [];
  let lat = 0;
  let lng = 0;

  while (index < str.length) {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    result = 0;
    shift = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    coordinates.push([lng / 1e6, lat / 1e6]);
  }

  return coordinates;
}

export default function DriverLocationAutoTracker() {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const targetMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const routeIdRef = useRef<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastCenterRef = useRef<{ lat: number; lng: number; ts: number } | null>(null);
  const initialMarkerPlacedRef = useRef(false);
  const routeSourceId = "driver-nav-route";
  const lastSentRef = useRef<string>("");
  const lastPushTimeRef = useRef<number>(0);
  const lastUiUpdateRef = useRef<number>(0);
  const lastFocusRef = useRef<{ address: string | null; mode: "pickup" | "destination" | null; ts: number } | null>(null);
  const pendingFocusRef = useRef<{ address: string; mode: "pickup" | "destination" } | null>(null);
  const shouldFitRouteRef = useRef(false);
  const UI_UPDATE_INTERVAL_ACTIVE = 60_000; // when driving, update UI at most once per minute
  const UI_UPDATE_INTERVAL_IDLE = 2_000; // when idle, update UI at most once per 2s
  const [activeRideId, setActiveRideId] = useState<string | null>(null);
  const [hasActiveNavigation, setHasActiveNavigation] = useState(false);
  const [suppressActiveState, setSuppressActiveState] = useState(false);
  const [navTarget, setNavTarget] = useState<{ mode: "pickup" | "destination"; address: string } | null>(null);
  const [targetCoords, setTargetCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("Location detection is off.");
  const [error, setError] = useState<string | null>(null);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const latRef = useRef<number | null>(null);
  const lngRef = useRef<number | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ distanceKm: number; durationMin: number } | null>(null);
  const lastRouteFromRef = useRef<{ lat: number; lng: number; ts: number } | null>(null);
  const latestPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const saveIntervalRef = useRef<number | null>(null);

  async function pushLocation(nextLat: number, nextLng: number) {
    const now = Date.now();
    // Throttle pushes to reduce network churn (min 2s)
    if (now - lastPushTimeRef.current < 2000) return;
    lastPushTimeRef.current = now;

    const signature = `${nextLat.toFixed(6)},${nextLng.toFixed(6)}`;
    if (lastSentRef.current === signature) return;
    lastSentRef.current = signature;

    // Send the location in background - do not update UI on every save to avoid jitter
    try {
      void fetch("/api/driver/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: nextLat, lng: nextLng }),
        keepalive: true,
      })
        .then(async (res) => {
          const data = await res.json().catch(() => null);
          console.debug("pushLocation response", { ok: res.ok, status: res.status, data });
          if (!res.ok) console.debug("Background location save failed", data?.error ?? res.status);
        })
        .catch((e) => console.debug("Background location save error", e));
    } catch (e) {
      console.debug("Background location send failed", e);
    }

    // Emit via socket (still immediate)
    if (routeIdRef.current) {
      sendDriverLocation(routeIdRef.current, nextLat, nextLng);
    }

    // Only update UI state when not suppressing active navigation state
    if (!suppressActiveState && now - lastUiUpdateRef.current > 15000) {
      lastUiUpdateRef.current = now;
      try {
        setUpdatedAt(new Date());
        setStatus("Location saved.");
      } catch {}

      // Keep updating the driver location without refocusing map on the target.
      // The live marker already follows the driver, so repeated focus calls can cause unwanted destination jumps.
    }
  }

  function renderLocation(nextLat: number, nextLng: number) {
    const now = Date.now();
    const threshold = routeIdRef.current ? UI_UPDATE_INTERVAL_ACTIVE : UI_UPDATE_INTERVAL_IDLE;
    // Update internal marker immediately, but only update React state (which affects UI layout)
    // at most once per `threshold` to avoid UI jitter on mobile while driving.
    if (!suppressActiveState && now - lastUiUpdateRef.current > threshold) {
      try {
        setLat(nextLat);
        setLng(nextLng);
        lastUiUpdateRef.current = now;
      } catch {}
    }
    latRef.current = nextLat;
    lngRef.current = nextLng;
    const map = mapRef.current;
    if (map) {
      if (markerRef.current) {
        markerRef.current.setLngLat([nextLng, nextLat]);
      } else {
        const carEl = document.createElement("div");
        carEl.style.display = "flex";
        carEl.style.alignItems = "center";
        carEl.style.justifyContent = "center";
        carEl.style.width = "34px";
        carEl.style.height = "34px";
        carEl.style.backgroundColor = "#22c55e";
        carEl.style.border = "2px solid rgba(255,255,255,0.9)";
        carEl.style.boxShadow = "0 0 12px rgba(34,197,94,0.35)";
        carEl.style.borderRadius = "50%";
        carEl.style.fontSize = "18px";
        carEl.style.color = "#ffffff";
        carEl.textContent = "🚗";

        markerRef.current = new mapboxgl.Marker({ element: carEl, anchor: "center" })
          .setLngLat([nextLng, nextLat])
          .addTo(map);
        // Only set initial view on first marker placement
        map.easeTo({ center: [nextLng, nextLat], zoom: Math.max(map.getZoom(), 15), duration: 1000 });
        initialMarkerPlacedRef.current = true;
        lastCenterRef.current = { lat: nextLat, lng: nextLng, ts: Date.now() };
      }

      const currentBounds = map.getBounds();
      const isDriverInView = currentBounds?.contains([nextLng, nextLat]) ?? false;
      const lastCenter = lastCenterRef.current;
      const centerThreshold = 0.02; // degrees ~ 2km, avoid small jitter recentering
      const needsRecentering = !lastCenter || Math.abs(lastCenter.lat - nextLat) > centerThreshold || Math.abs(lastCenter.lng - nextLng) > centerThreshold;
      if (!isDriverInView && !shouldFitRouteRef.current && needsRecentering) {
        map.easeTo({ center: [nextLng, nextLat], duration: 1000 });
        lastCenterRef.current = { lat: nextLat, lng: nextLng, ts: Date.now() };
      }

      if (targetCoords) {
        void drawRoute({ lat: nextLat, lng: nextLng }, targetCoords);
      }
    }
  }

  useEffect(() => {
    if (!mapEl.current) return;
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
    if (token) {
      mapboxgl.accessToken = token;
    }
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

    const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const forceOsm = urlParams?.get("force_osm") === "1";
    const mapStyle = forceOsm ? fallbackStyle : (token ? "mapbox://styles/mapbox/streets-v11" : fallbackStyle);
    if (forceOsm) console.warn("Driver map: forcing OpenStreetMap raster fallback (force_osm=1)");
    const map = new mapboxgl.Map({
      container: mapEl.current,
      style: mapStyle,
      center: [28.0473, -26.2041],
      zoom: 12,
    });

    map.on("error", (event) => {
      if (event && event.error && typeof event.error.message === "string" && event.error.message.includes("style")) {
        map.setStyle(fallbackStyle);
      }
    });
    mapRef.current = map;

    map.on("load", () => {
      map.resize();
    });

    return () => {
      markerRef.current?.remove();
      targetMarkerRef.current?.remove();
      if (map.getLayer("driver-nav-route-line")) map.removeLayer("driver-nav-route-line");
      if (map.getSource(routeSourceId)) map.removeSource(routeSourceId);
      map.remove();
    };
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError("Browser geolocation is not available.");
      return;
    }

    const id = navigator.geolocation.watchPosition(
      (position) => {
        const nextLat = position.coords.latitude;
        const nextLng = position.coords.longitude;
        latRef.current = nextLat;
        lngRef.current = nextLng;
        renderLocation(nextLat, nextLng);
        setError(null);
        const now = Date.now();
        const threshold = routeIdRef.current ? UI_UPDATE_INTERVAL_ACTIVE : UI_UPDATE_INTERVAL_IDLE;
        if (!suppressActiveState && now - lastUiUpdateRef.current > threshold) {
          setStatus(
            position.coords.accuracy
              ? `Location detected (accuracy ~${Math.round(position.coords.accuracy)}m)`
              : "Location detected",
          );
          lastUiUpdateRef.current = now;
        }

        if (routeIdRef.current) {
          // Emit immediate socket updates for live tracking
          sendDriverLocation(routeIdRef.current, nextLat, nextLng);
          // Buffer latest position for background save
          latestPosRef.current = { lat: nextLat, lng: nextLng };
        }
      },
      (err) => {
        setError(err.message || "Unable to detect location.");
        if (err.code === 1) setStatus("Location permission denied.");
        else if (err.code === 2) setStatus("Location unavailable.");
        else if (err.code === 3) setStatus("Location request timed out.");
        else setStatus("Location detection failed.");
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );

    watchIdRef.current = id;
    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  // Background saver: periodically send the latest buffered position to the server
  useEffect(() => {
    // Run every 5s when a route is active
    function startInterval() {
      if (saveIntervalRef.current != null) return;
      saveIntervalRef.current = window.setInterval(() => {
        const pos = latestPosRef.current;
        if (!pos) return;
        if (!routeIdRef.current) return;
        void pushLocation(pos.lat, pos.lng);
      }, 5000) as unknown as number;
    }

    function stopInterval() {
      if (saveIntervalRef.current != null) {
        window.clearInterval(saveIntervalRef.current as unknown as number);
        saveIntervalRef.current = null;
      }
    }

    // Start when there's an active ride
    const checkActive = setInterval(() => {
      if (routeIdRef.current) startInterval();
      else stopInterval();
    }, 1000);

    return () => {
      clearInterval(checkActive);
      stopInterval();
    };
  }, []);

  useEffect(() => {
    let canceled = false;

    const fetchActiveRide = async () => {
      try {
        const res = await fetch("/api/driver/active-ride");
        const data = await res.json().catch(() => null);
        if (canceled) return;

        if (res.ok) {
          if (data?.id) {
            setHasActiveNavigation(true);
            setSuppressActiveState(true);
            const needsRestore = routeIdRef.current !== data.id || !navTarget;
            if (routeIdRef.current !== data.id) {
              routeIdRef.current = data.id;
              setActiveRideId(data.id);
              joinRide(data.id, { role: "DRIVER" });
            }

            if (needsRestore) {
              // Restore saved explicit nav target (preferred) or saved nav mode
              try {
                const tkey = `driverNavTarget_${data.id}`;
                const savedTarget = typeof window !== "undefined" ? window.localStorage.getItem(tkey) : null;
                if (savedTarget) {
                  try {
                    const parsed = JSON.parse(savedTarget);
                    if (parsed?.mode && parsed?.address) {
                      setNavTarget({ mode: parsed.mode === 'destination' ? 'destination' : 'pickup', address: parsed.address });
                      void focusOnRide(data.id, parsed.mode === 'destination' ? 'destination' : 'pickup', parsed.address, latRef.current, lngRef.current);
                    }
                  } catch (e) {}
                } else {
                  const key = `driverNavMode_${data.id}`;
                  const saved = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
                  if (saved === "driveToDestination" || saved === "finishRide") {
                    setNavTarget({ mode: 'destination', address: data?.dropoff_address ?? '' });
                    void focusOnRide(data.id, "destination", data?.dropoff_address ?? null, latRef.current, lngRef.current);
                  } else if (saved === "driveToPickup") {
                    setNavTarget({ mode: 'pickup', address: data?.pickup_address ?? '' });
                    void focusOnRide(data.id, "pickup", data?.pickup_address ?? null, latRef.current, lngRef.current);
                  }
                }
              } catch (e) {
                // ignore
              }
            }
          } else if (routeIdRef.current) {
            leaveRide(routeIdRef.current);
            routeIdRef.current = null;
            setActiveRideId(null);
            setHasActiveNavigation(false);
            setSuppressActiveState(false);
          }
        }
      } catch (err) {
        console.error("Unable to fetch active ride for driver location tracker", err);
      }
    };

    fetchActiveRide();
    const interval = window.setInterval(fetchActiveRide, 5000);
    return () => {
      canceled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (activeRideId) {
        leaveRide(activeRideId);
      }
    };
  }, [activeRideId]);

  async function geocodeAddress(address: string) {
    if (!address.trim()) return null;

    const responses = [address, address.replace(/\s*,\s*South Africa$/i, "")].filter(Boolean);
    for (const query of responses) {
      try {
        const geoRes = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
        if (!geoRes.ok) continue;
        const geo = await geoRes.json().catch(() => null);
        const coords = geo?.center;
        if (coords && coords.length === 2) {
          return { lng: coords[0] as number, lat: coords[1] as number };
        }
      } catch {
        // ignore and continue
      }
    }

    return null;
  }

  async function drawRoute(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
    const now = Date.now();
    const last = lastRouteFromRef.current;
    // Avoid re-requesting the route too frequently — require 15s or >30m move
    if (last) {
      const dLat = from.lat - last.lat;
      const dLng = from.lng - last.lng;
      const moved = Math.sqrt(dLat * dLat + dLng * dLng) * 111000; // approx meters
      if (now - last.ts < 15000 && moved < 30) {
        return;
      }
    }
    const res = await fetch(
      `/api/directions?start=${from.lng},${from.lat}&end=${to.lng},${to.lat}`,
    );
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      console.error("Driver directions API error", json);
      return;
    }
    const coords = json?.coordinates ?? json?.geometry?.coordinates;
    if (!coords || !Array.isArray(coords) || coords.length === 0) {
      console.error("Driver route missing geometry", json);
      return;
    }
    const map = mapRef.current;
    if (!map) return;

    const geojson = {
      type: "Feature",
      geometry: { type: "LineString", coordinates: coords },
      properties: {},
    } as const;

    if (map.getLayer("driver-nav-route-line")) {
      map.removeLayer("driver-nav-route-line");
    }
    if (map.getSource(routeSourceId)) {
      map.removeSource(routeSourceId);
    }

    map.addSource(routeSourceId, {
      type: "geojson",
      data: geojson,
    });
    map.addLayer({
      id: "driver-nav-route-line",
      type: "line",
      source: routeSourceId,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": "#3b82f6", "line-width": 5, "line-opacity": 0.9 },
    });

    if (shouldFitRouteRef.current) {
      map.easeTo({ center: [from.lng, from.lat], zoom: 15, duration: 1000 });
    }

    setRouteInfo({
      distanceKm: Math.round(((json?.distance ?? 0) / 1000) * 10) / 10,
      durationMin: Math.round(((json?.duration ?? 0) / 60) * 10) / 10,
    });
    lastRouteFromRef.current = { lat: from.lat, lng: from.lng, ts: now };
  }

  async function getCurrentLocation(): Promise<{ lat: number; lng: number } | null> {
    if (!navigator.geolocation) return null;

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({ lat: position.coords.latitude, lng: position.coords.longitude });
        },
        () => resolve(null),
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
      );
    });
  }

  async function focusOnRide(
    rideId: string | null,
    type: "pickup" | "destination",
    address?: string | null,
    driverLat?: number | null,
    driverLng?: number | null,
  ) {
    if (!rideId) return;
    const targetKey = `${type}:${address ?? ''}`;
    const last = lastFocusRef.current;
    if (last && last.address === address && last.mode === type) {
      return;
    }
    const pending = pendingFocusRef.current;
    if (pending && pending.address === address && pending.mode === type) {
      return;
    }

    pendingFocusRef.current = { address: address ?? '', mode: type };
    routeIdRef.current = rideId;
    setHasActiveNavigation(true);
    setSuppressActiveState(true);
    joinRide(rideId, { role: 'DRIVER' });
    try {
      let targetAddress = address ?? new URLSearchParams(window.location.search).get(type === "pickup" ? "pickupAddress" : "destinationAddress");
      // If no address provided via event or URL, try to fetch active ride details from API
      if (!targetAddress) {
        try {
          const r = await fetch('/api/driver/active-ride');
          const d = await r.json().catch(() => null);
          if (r.ok && d) {
            targetAddress = type === 'pickup' ? d.pickup_address : d.dropoff_address;
          }
        } catch {}
      }
      if (!targetAddress) return;

      const target = await geocodeAddress(targetAddress);
      if (!target) return;

      const map = mapRef.current;
      if (!map) return;

      targetMarkerRef.current?.remove();
      targetMarkerRef.current = new mapboxgl.Marker({ color: type === "pickup" ? "#1E40AF" : "#10B981" })
        .setLngLat([target.lng, target.lat])
        .addTo(map);

      setTargetCoords(target);

      if (driverLat == null || driverLng == null) {
        const currentLocation = await getCurrentLocation();
        if (currentLocation) {
          driverLat = currentLocation.lat;
          driverLng = currentLocation.lng;
        }
      }

      if (driverLat != null && driverLng != null) {
        renderLocation(driverLat, driverLng);
        shouldFitRouteRef.current = true;
        try {
          await drawRoute({ lat: driverLat, lng: driverLng }, target);
        } finally {
          shouldFitRouteRef.current = false;
        }
      } else {
        map.easeTo({ center: [target.lng, target.lat], zoom: 15, duration: 1000 });
      }
      setHasActiveNavigation(true);

      // Only update visible status when not actively driving, or if enough time elapsed
      try {
        const now = Date.now();
        if (!routeIdRef.current || now - lastUiUpdateRef.current > UI_UPDATE_INTERVAL_ACTIVE) {
          setStatus(`${type === "pickup" ? "Pickup" : "Destination"} loaded: ${targetAddress}`);
          lastUiUpdateRef.current = now;
        }
      } catch {}
      // record last focused target to avoid re-focusing repeatedly
      try {
        lastFocusRef.current = { address: targetAddress, mode: type, ts: Date.now() };
      } catch {}
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Error focusing on ride target", err);
    } finally {
      const pendingClear = pendingFocusRef.current;
      if (pendingClear && pendingClear.address === address && pendingClear.mode === type) {
        pendingFocusRef.current = null;
      }
    }
  }

  useEffect(() => {
    function onRideAccepted(e: any) {
      const rideId = e?.detail?.rideId ?? new URLSearchParams(window.location.search).get("activeRideId");
      const mode = e?.detail?.mode ?? "pickup";
      const targetAddress = e?.detail?.address ?? new URLSearchParams(window.location.search).get("pickupAddress");
      if (rideId) void focusOnRide(rideId, mode, targetAddress, latRef.current, lngRef.current);
    }

    function onNavTarget(e: any) {
      const rideId = e?.detail?.rideId;
      const mode = e?.detail?.mode;
      const targetAddress = e?.detail?.address;
      if (rideId && mode && targetAddress) {
        const currentNav = navTarget;
        if (routeIdRef.current === rideId && currentNav && currentNav.mode === mode && currentNav.address === targetAddress && targetCoords) {
          return;
        }
        setNavTarget({ mode, address: targetAddress });
        setTargetCoords(null);
        lastFocusRef.current = null;
        if (mode === 'destination') {
          shouldFitRouteRef.current = true;
          setHasActiveNavigation(true);
          setSuppressActiveState(true);
        }
        const ensureLocationAndFocus = async () => {
          let currentLat = latRef.current;
          let currentLng = lngRef.current;
          if (currentLat == null || currentLng == null) {
            const currentLocation = await getCurrentLocation();
            if (currentLocation) {
              currentLat = currentLocation.lat;
              currentLng = currentLocation.lng;
              renderLocation(currentLat, currentLng);
            }
          }
          void focusOnRide(rideId, mode, targetAddress, currentLat, currentLng);
        };
        void ensureLocationAndFocus();
      }
    }

    window.addEventListener("rideAccepted", onRideAccepted);
    window.addEventListener("driverNavTarget", onNavTarget);

    const initialId = new URLSearchParams(window.location.search).get("activeRideId");
    if (initialId) {
      try {
        const tkey = `driverNavTarget_${initialId}`;
        const savedTarget = window.localStorage.getItem(tkey);
        if (savedTarget) {
          try {
            const parsed = JSON.parse(savedTarget);
            if (parsed?.mode && parsed?.address) {
              setNavTarget({ mode: parsed.mode, address: parsed.address });
              void focusOnRide(initialId, parsed.mode === 'destination' ? 'destination' : 'pickup', parsed.address, latRef.current, lngRef.current);
            }
          } catch (e) {}
        } else {
          const saved = window.localStorage.getItem(`driverNavMode_${initialId}`);
          if (saved === "driveToDestination" || saved === "finishRide") {
            setNavTarget({ mode: 'destination', address: new URLSearchParams(window.location.search).get("dropoffAddress") ?? '' });
            void focusOnRide(initialId, "destination", null, latRef.current, lngRef.current);
          } else {
            const initialPickup = new URLSearchParams(window.location.search).get("pickupAddress");
            if (initialPickup) {
              setNavTarget({ mode: 'pickup', address: initialPickup });
              void focusOnRide(initialId, "pickup", initialPickup, latRef.current, lngRef.current);
            }
          }
        }
      } catch (e) {}
    }

    return () => {
      window.removeEventListener("rideAccepted", onRideAccepted);
      window.removeEventListener("driverNavTarget", onNavTarget);
    };
  }, []);

  useEffect(() => {
    if (!navTarget || !routeIdRef.current) return;
    if (lat == null || lng == null) return;
    const last = lastFocusRef.current;
    const pending = pendingFocusRef.current;
    if (last?.address === navTarget.address && last.mode === navTarget.mode) return;
    if (pending?.address === navTarget.address && pending.mode === navTarget.mode) return;

    pendingFocusRef.current = { address: navTarget.address, mode: navTarget.mode };
    void focusOnRide(routeIdRef.current, navTarget.mode, navTarget.address, lat, lng).finally(() => {
      const currentPending = pendingFocusRef.current;
      if (currentPending?.address === navTarget.address && currentPending.mode === navTarget.mode) {
        pendingFocusRef.current = null;
      }
    });
  }, [navTarget, lat, lng]);

  useEffect(() => {
    if (lat == null || lng == null || !targetCoords) return;
    void drawRoute({ lat, lng }, targetCoords);
  }, [lat, lng, targetCoords]);

  useEffect(() => {
    return () => {
      if (routeIdRef.current) {
        leaveRide(routeIdRef.current);
      }
    };
  }, []);

  function detectAndSaveLocation() {
    // Keep this function for compatibility, but automatic tracking is now enabled.
    setStatus("Automatic GPS tracking is active.");
  }

  function recenterToDriver() {
    const map = mapRef.current;
    const curLat = latRef.current ?? lat;
    const curLng = lngRef.current ?? lng;
    if (!map || curLat == null || curLng == null) {
      try {
        setStatus("Unable to recenter: driver location unknown.");
      } catch {}
      return;
    }
    try {
      map.easeTo({ center: [curLng, curLat], zoom: Math.max(map.getZoom(), 15), duration: 800 });
      lastCenterRef.current = { lat: curLat, lng: curLng, ts: Date.now() };
      setStatus("Map centered on driver.");
    } catch (e) {
      try {
        setStatus("Recenter failed.");
      } catch {}
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
      <div className="overflow-hidden rounded-xl border border-white/10 bg-slate-900">
        <div ref={mapEl} className="h-[420px] w-full" />
      </div>

      <div className="rounded-xl border border-white/10 bg-white/3 p-4">
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Driver location</h2>
            <p className="text-sm text-slate-400">Automatic GPS tracking is enabled. Your location and route update live while driving.</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-200">
            {hasActiveNavigation ? (
              // Compact, non-updating banner while on active navigation to avoid layout shifts
              <div className="flex flex-col gap-1 min-h-[72px]">
                <div className="text-sm text-emerald-300">Driving — GPS tracking active</div>
                <div className="text-xs text-cyan-300">
                  {routeInfo ? `Route: ${routeInfo.distanceKm.toFixed(1)} km • ETA ${Math.max(1, Math.round(routeInfo.durationMin))} min` : "Route information loading..."}
                </div>
              </div>
            ) : (
              <>
                <div>{status}</div>
                <div className="text-xs text-slate-400">
                  {lat != null && lng != null ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : "Waiting for GPS..."}
                </div>
                {routeInfo ? (
                  <div className="text-xs text-cyan-300">
                    Route: {routeInfo.distanceKm.toFixed(1)} km • ETA {Math.max(1, Math.round(routeInfo.durationMin))} min
                  </div>
                ) : null}
                <div className="text-xs text-emerald-300">Last saved: {formatTime(updatedAt)}</div>
                {saving ? <div className="text-xs text-cyan-300">Saving...</div> : null}
                {error ? <div className="text-xs text-rose-400">{error}</div> : null}
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={recenterToDriver}
              className="btn btn-secondary px-4 py-1 text-sm rounded-full h-9 shadow-sm border-gray-700 hover:translate-y-0.5 transition-transform"
            >
              Recenter to driver
            </button>
            <button
              type="button"
              className="btn btn-primary px-5 py-1 text-sm rounded-full h-9 shadow-md disabled:opacity-80 disabled:cursor-not-allowed"
              disabled
            >
              Automatic GPS tracking enabled
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
