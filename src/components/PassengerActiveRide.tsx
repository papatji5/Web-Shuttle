"use client";

import { useEffect, useState } from "react";
import RideChat from "./RideChat";
import PassengerDestinationUpdater from "./PassengerDestinationUpdater";
import { joinRide, leaveRide } from "@/lib/rideSocket";

type PassengerActiveRideProps = {
  rides: Array<{
    id: string;
    driver_id?: string | null;
    status: string;
    pickup_address: string | null;
    dropoff_address: string | null;
    payment_method?: string | null;
    estimated_fare_cents?: number | null;
  }>;
  driver?: {
    full_name?: string | null;
    phone?: string | null;
  } | null;
  vehicle?: {
    make?: string | null;
    model?: string | null;
    color?: string | null;
    plate_number?: string | null;
  } | null;
};

const defaultDriver = {
  full_name: "austine",
  phone: "0735163121",
  driverPhotoSrc: "/professional_portrait.png",
  driverPhotoAlt: "Austine driver profile photo",
};

const defaultVehicle = {
  make: "Mercedes-Benz",
  model: "2023 C200 Avantgarde",
  color: "Silver",
  plate_number: "LG35FX GP",
  carPhotoSrc: "/Mercedes_Benz_C200_Clean.png",
  carPhotoAlt: "Silver Mercedes-Benz 2023 C200",
};

export default function PassengerActiveRide({ rides, driver, vehicle }: PassengerActiveRideProps) {
  const [activeRide, setActiveRide] = useState<any>(null);
  const [showUpdater, setShowUpdater] = useState<boolean>(false);

  useEffect(() => {
    // Find an accepted or active ride
    const active = rides?.find((r) => r.status === "ACCEPTED" || r.status === "IN_PROGRESS");
    setActiveRide(active || null);
  }, [rides]);

  useEffect(() => {
    if (!activeRide?.id) return;
    joinRide(activeRide.id, { role: 'PASSENGER' });
    return () => {
      if (activeRide?.id) {
        leaveRide(activeRide.id);
      }
    };
  }, [activeRide]);

  if (!activeRide) {
    return null;
  }

  return (
    <div className="card stack" style={{ borderColor: "#10b981", borderWidth: "2px" }}>
      <h2>Active Ride</h2>
      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-3" style={{ fontSize: "14px" }}>
          <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-4">
            <p className="text-slate-300">
              <strong>Pickup:</strong> {activeRide.pickup_address || "(unknown)"}
            </p>
            <p className="text-slate-300">
              <strong>Dropoff:</strong> {activeRide.dropoff_address || "(unknown)"}
            </p>
            <p className="text-slate-300">
              <strong>Status:</strong> {activeRide.status}
            </p>
            {activeRide.payment_method ? (
              <p className="text-slate-300">
                <strong>Payment:</strong> {activeRide.payment_method}
              </p>
            ) : null}
            {activeRide.estimated_fare_cents != null ? (
              <p className="text-slate-300">
                <strong>Estimated fare:</strong> R {(activeRide.estimated_fare_cents / 100).toFixed(2)}
              </p>
            ) : null}
          </div>

          <div className="mb-3">
            <button
              type="button"
              className="rounded-full bg-gradient-to-r from-blue-600 to-cyan-400 px-4 py-2 text-sm font-semibold text-white"
              onClick={() => setShowUpdater((s) => !s)}
            >
              {showUpdater ? "Close update" : "Update destination"}
            </button>
          </div>

          <PassengerDestinationUpdater
            rideId={activeRide.id}
            pickupAddress={activeRide.pickup_address || ""}
            currentDropoffAddress={activeRide.dropoff_address || ""}
            isEditMode={showUpdater}
            onUpdated={(updated) => {
              setActiveRide((prev: any) => ({ ...prev, ...updated }));
            }}
          />
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-4 shadow-xl shadow-slate-950/20">
            <div className="grid gap-4">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 overflow-hidden rounded-3xl border border-white/10 bg-slate-800">
                  <img
                    src={defaultDriver.driverPhotoSrc}
                    alt={defaultDriver.driverPhotoAlt}
                    width={64}
                    height={64}
                    className="object-cover h-full w-full"
                  />
                </div>
                <div>
                  <div className="text-sm uppercase tracking-[0.22em] text-cyan-300">Your Driver</div>
                  <div className="mt-2 text-lg font-semibold text-white">{driver?.full_name ?? defaultDriver.full_name}</div>
                  <div className="text-sm text-slate-400">{driver?.phone ?? defaultDriver.phone}</div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-3">
                    <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Vehicle</div>
                    <div className="mt-2 text-base font-semibold text-white">
                      {vehicle?.make || defaultVehicle.make} {vehicle?.model || defaultVehicle.model}
                    </div>
                    <div className="mt-3 text-sm text-slate-400">
                      {(vehicle?.color || defaultVehicle.color) ? `${vehicle?.color || defaultVehicle.color} • ` : ""}{vehicle?.plate_number || defaultVehicle.plate_number}
                    </div>
                    <div className="mt-4">{/* ETA/info moved to Update Destination panel */}</div>
                  </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "15px" }}>
            <RideChat rideId={activeRide.id} />
          </div>
        </div>
      </div>
    </div>
  );
}
