"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import RideChat from "./RideChat";
import { emitRideStatusChanged, joinRide, leaveRide } from "@/lib/rideSocket";

export default function DriverActiveRide() {
  const router = useRouter();
  const [activeRide, setActiveRide] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [navMode, setNavMode] = useState<"driveToPickup" | "driveToDestination" | "finishRide">("driveToPickup");
  const [showArrivalButton, setShowArrivalButton] = useState(false);
  const [arrivalNotified, setArrivalNotified] = useState(false);
  const activeRideIdRef = useRef<string | null>(null);
  const lastDispatchedNavTargetRef = useRef<{ rideId: string; mode: string; address: string } | null>(null);

  useEffect(() => {
    const fetchActiveRide = async () => {
      try {
        setError(null);
        const res = await fetch("/api/driver/active-ride");
        const data = await res.json().catch(() => null);
        
        if (res.ok) {
          setActiveRide(data);
        } else {
          const errMsg = data?.error || res.statusText;
          console.error("API error:", errMsg);
          setError(errMsg);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("Fetch error:", msg);
        setError(msg);
      } finally {
        setLoading(false);
      }
    };
    fetchActiveRide();
    
    // Polling: re-fetch every 3 seconds to catch newly accepted rides
    const interval = setInterval(fetchActiveRide, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!activeRide?.id) return;
    joinRide(activeRide.id, { role: 'DRIVER' });
    return () => {
      if (activeRide?.id) {
        leaveRide(activeRide.id);
      }
    };
  }, [activeRide]);

  useEffect(() => {
    if (!activeRide?.id) return;
    if (activeRideIdRef.current !== activeRide.id) {
      activeRideIdRef.current = activeRide.id;
      // Restore saved nav mode for this ride so refresh doesn't reset the driver flow
      try {
        const key = `driverNavMode_${activeRide.id}`;
        const saved = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
        if (saved === "driveToPickup" || saved === "driveToDestination" || saved === "finishRide") {
          setNavMode(saved as any);
          setShowArrivalButton(saved === "driveToPickup");
          setArrivalNotified(saved !== "driveToPickup");
        } else {
          setNavMode("driveToPickup");
          setShowArrivalButton(false);
          setArrivalNotified(false);
        }
      } catch (e) {
        setNavMode("driveToPickup");
        setShowArrivalButton(false);
        setArrivalNotified(false);
      }
    }
  }, [activeRide]);

  useEffect(() => {
    if (!activeRide?.id || activeRide?.status !== "ACCEPTED") return;
    const target = {
      rideId: activeRide.id,
      mode: navMode === "driveToPickup" ? "pickup" : "destination",
      address: navMode === "driveToPickup" ? activeRide.pickup_address : activeRide.dropoff_address,
    };
    const last = lastDispatchedNavTargetRef.current;
    if (last && last.rideId === target.rideId && last.mode === target.mode && last.address === target.address) {
      return;
    }

    lastDispatchedNavTargetRef.current = target;
    window.dispatchEvent(
      new CustomEvent("driverNavTarget", {
        detail: target,
      }),
    );
  }, [activeRide, navMode]);

  if (error) {
    return (
      <div className="card stack" style={{ borderColor: "#ef4444", borderWidth: "2px" }}>
        <h2>Active Ride</h2>
        <div className="alert"><strong>Error:</strong> {error}</div>
      </div>
    );
  }

  if (!activeRide) {
    return null;
  }

  const finishRide = async () => {
    if (!activeRide?.id) return;
    setFinishing(true);
    try {
      const res = await fetch("/api/driver/finish-ride", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rideId: activeRide.id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Failed to finish ride");
      
      // Clear active ride
      try {
        const key = `driverNavMode_${activeRide.id}`;
        window.localStorage.removeItem(key);
        try {
          const tkey = `driverNavTarget_${activeRide.id}`;
          window.localStorage.removeItem(tkey);
        } catch {}
      } catch {}
      try {
        const chatKey = `rideChat_${activeRide.id}`;
        window.sessionStorage.removeItem(chatKey);
      } catch {}
      setActiveRide(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setFinishing(false);
    }
  };

  return (
    <div className="card stack" style={{ borderColor: "#10b981", borderWidth: "2px" }}>
      <h2>Active Ride</h2>

      {activeRide && (
        <>
          <div style={{ fontSize: "14px" }}>
            <p>
              <strong>Pickup:</strong> {activeRide.pickup_address || "(unknown)"}
            </p>
            <p>
              <strong>Dropoff:</strong> {activeRide.dropoff_address || "(unknown)"}
            </p>
            <p>
              <strong>Status:</strong> {activeRide.status}
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <button
              onClick={async () => {
                if (!activeRide?.id) return;

                if (navMode === "driveToPickup") {
                  window.dispatchEvent(
                    new CustomEvent("driverNavTarget", {
                      detail: {
                        mode: "pickup",
                        address: activeRide.pickup_address,
                        rideId: activeRide.id,
                      },
                    }),
                  );
                  setShowArrivalButton(true);
                  try {
                    const key = `driverNavMode_${activeRide.id}`;
                    window.localStorage.setItem(key, "driveToPickup");
                    try {
                      const tkey = `driverNavTarget_${activeRide.id}`;
                      window.localStorage.setItem(tkey, JSON.stringify({ mode: 'pickup', address: activeRide.pickup_address }));
                    } catch {}
                  } catch {}
                  return;
                }
                if (navMode === "driveToDestination") {
                  window.dispatchEvent(
                    new CustomEvent("driverNavTarget", {
                      detail: {
                        mode: "destination",
                        address: activeRide.dropoff_address,
                        rideId: activeRide.id,
                      },
                    }),
                  );
                  setShowArrivalButton(false);
                  setNavMode("finishRide");
                  try {
                    const key = `driverNavMode_${activeRide.id}`;
                    window.localStorage.setItem(key, "finishRide");
                    try {
                      const tkey = `driverNavTarget_${activeRide.id}`;
                      window.localStorage.setItem(tkey, JSON.stringify({ mode: 'destination', address: activeRide.dropoff_address }));
                    } catch {}
                  } catch {}
                  return;
                }
                if (navMode === "finishRide") {
                  await finishRide();
                }
              }}
              disabled={finishing}
              className="btn btn-primary"
              style={{ alignSelf: "flex-start" }}
            >
              {finishing
                ? "Finishing..."
                : navMode === "driveToPickup"
                ? "Drive to pickup point"
                : navMode === "driveToDestination"
                ? "Drive to destination"
                : "Finish Ride"}
            </button>

            {showArrivalButton && navMode === "driveToPickup" ? (
              <button
                type="button"
                onClick={() => {
                  if (!activeRide?.id) return;
                  emitRideStatusChanged(activeRide.id, "ARRIVED", {
                    message: "Your driver has arrived at the pickup point.",
                  });
                  setArrivalNotified(true);
                  setShowArrivalButton(false);
                  setNavMode("driveToDestination");
                  try {
                    const key = `driverNavMode_${activeRide.id}`;
                    window.localStorage.setItem(key, "driveToDestination");
                  } catch {}
                  try {
                    const tkey = `driverNavTarget_${activeRide.id}`;
                    window.localStorage.setItem(tkey, JSON.stringify({ mode: 'destination', address: activeRide.dropoff_address }));
                  } catch {}
                  window.dispatchEvent(
                    new CustomEvent("driverNavTarget", {
                      detail: {
                        mode: "destination",
                        address: activeRide.dropoff_address,
                        rideId: activeRide.id,
                      },
                    }),
                  );
                }}
                className="btn btn-secondary"
                style={{ alignSelf: "flex-start" }}
              >
                Arrived at pickup point
              </button>
            ) : null}

            {arrivalNotified ? (
              <div className="text-sm text-slate-300">Passenger notified of arrival.</div>
            ) : null}
          </div>
        </>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "15px" }}>
        <RideChat rideId={activeRide.id} />
      </div>
    </div>
  );
}
