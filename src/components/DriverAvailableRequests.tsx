"use client";

import { useEffect, useState } from "react";
import { emitRideStatusChanged } from "@/lib/rideSocket";

type Ride = {
  id: string;
  pickup_address: string | null;
  dropoff_address: string | null;
  estimated_fare_cents: number | null;
  estimated_distance_km: number | null;
  payment_method?: string | null;
  payment_status?: string | null;
};

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function DriverAvailableRequests() {
  const [rides, setRides] = useState<Ride[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [distances, setDistances] = useState<Record<string, number | null>>({});

  useEffect(() => {
      // Join the global drivers room so this client receives server-side rideRequested broadcasts
      (async () => {
        try {
          const rs = await import("@/lib/rideSocket");
          rs.joinRide("drivers", { role: 'DRIVER' });
        } catch {
          // ignore if sockets not available
        }
      })();

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => setPosition(null),
          { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 },
        );
      }
      void fetchRides();

      return () => {
        try {
          const rs = require("@/lib/rideSocket");
          rs.leaveRide("drivers");
        } catch {
          // ignore
        }
      };
    }, []);

  useEffect(() => {
    if (!rides || !position) return;
    void computeDistances(rides, position);
  }, [rides, position]);

  async function fetchRides() {
    setLoading(true);
    try {
      const res = await fetch("/api/rides/available");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to load rides");
      setRides(data.rides ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function computeDistances(ridesList: Ride[], pos: { lat: number; lng: number }) {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
    const newDistances: Record<string, number | null> = {};

    for (const r of ridesList) {
      newDistances[r.id] = null;
      if (!r.pickup_address) continue;

      try {
        const geoRes = await fetch(`/api/geocode?q=${encodeURIComponent(r.pickup_address ?? "")}`);
        if (!geoRes.ok) {
          newDistances[r.id] = null;
          continue;
        }
        const geo = await geoRes.json().catch(() => null);
        const coords = geo?.center;
        if (coords && coords.length === 2) {
          const [lng, lat] = coords;
          newDistances[r.id] = haversineDistanceKm(pos.lat, pos.lng, lat, lng);
        }
      } catch {
        newDistances[r.id] = null;
      }
    }

    setDistances(newDistances);
  }

  async function acceptRide(ride: Ride) {
    try {
      const res = await fetch("/api/driver/accept-ride", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rideId: ride.id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Failed to accept ride");

      await fetchRides();

      try {
        const url = new URL(window.location.href);
        url.searchParams.set("activeRideId", ride.id);
        window.history.replaceState({}, "", url.toString());
        window.dispatchEvent(
          new CustomEvent("rideAccepted", {
            detail: {
              rideId: ride.id,
              pickupAddress: ride.pickup_address,
            },
          }),
        );
      } catch {
        // ignore
      }

      // Emit socket event so passenger(s) in the ride room are notified in real-time
      try {
        const rs = await import("@/lib/rideSocket");
        rs.emitRideAccepted(ride.id, { driverId: undefined });
        rs.emitRideStatusChanged(ride.id, "ACCEPTED", { driverId: undefined });
        // join the ride room as the driver so further messaging/calls work
        rs.joinRide(ride.id, { role: 'DRIVER' });
      } catch {
        // ignore if sockets not available
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  async function rejectRide(rideId: string) {
    try {
      const res = await fetch("/api/driver/reject-ride", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rideId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Failed to reject ride");

      setRides((prev) => (prev ? prev.filter((r) => r.id !== rideId) : prev));
      setDistances((d) => {
        const copy = { ...d };
        delete copy[rideId];
        return copy;
      });

      try {
        emitRideStatusChanged(rideId, "DECLINED", { driverId: undefined });
      } catch {
        // ignore if sockets not available
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="card stack">
      <h2>Available ride requests</h2>
      {loading ? <div className="muted">Loading...</div> : null}
      {error ? <div className="alert"><strong>Error:</strong> {error}</div> : null}
      {rides && rides.length ? (
        <ul style={{ paddingLeft: 18 }}>
          {rides.map((r) => (
            <li key={r.id} style={{ marginBottom: 12 }}>
              <div>
                <strong>{r.pickup_address ?? "(pickup)"}</strong> → {r.dropoff_address ?? "(dropoff)"}
              </div>
              <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>
                Fare: {r.estimated_fare_cents != null ? `R ${(r.estimated_fare_cents / 100).toFixed(2)}` : "N/A"} • Distance: {r.estimated_distance_km != null ? `${Number(r.estimated_distance_km).toFixed(2)} km` : "N/A"}
              </div>
              <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>
                Distance to pickup: {distances[r.id] != null ? `${distances[r.id]!.toFixed(2)} km` : "Unknown"}
              </div>

              <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>
                Payment: {r.payment_status ?? "UNKNOWN"}
                {r.payment_method ? ` • ${r.payment_method}` : ""}
              </div>

              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn btn-primary" onClick={() => acceptRide(r)}>Accept</button>
                <button className="btn ml-2" onClick={() => void rejectRide(r.id)}>Reject</button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No requested rides right now.</p>
      )}
    </div>
  );
}
