"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import InvoiceDownloadButton from "@/components/InvoiceDownloadButton";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "rejected", label: "Rejected" },
  { value: "completed", label: "Completed" },
];

export default function PastOffersPage() {
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offers, setOffers] = useState<any[]>([]);
  const [rides, setRides] = useState<any[]>([]);

  const ridesById = useMemo(() => {
    const map: Record<string, any> = {};
    for (const ride of rides) {
      map[ride.id] = ride;
    }
    return map;
  }, [rides]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const selected = params.get("filter") ?? "all";
    if (["all", "rejected", "completed"].includes(selected)) {
      setFilter(selected);
    }
  }, []);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/driver/past-offers?filter=${filter}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Failed to load past offers");

        if (data.filter === "completed") {
          setOffers([]);
          setRides(data.rides ?? []);
        } else {
          setOffers(data.offers ?? []);
          setRides(data.rides ?? []);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    window.history.replaceState({}, "", `/account/past-offers?filter=${filter}`);
  }, [filter]);

  const handleFilterClick = (value: string) => {
    if (filter === value) return;
    setFilter(value);
  };

  return (
    <section className="stack">
      <div className="stack">
        <h1>Past offers</h1>
        <p className="muted">Filter your driver history by rejected offers or completed rides.</p>
      </div>

      <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
        {FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => handleFilterClick(item.value)}
            className={filter === item.value ? "btn btn-primary" : "btn btn-ghost"}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="card stack">
        {loading ? (
          <div className="muted">Loading...</div>
        ) : error ? (
          <div className="alert">
            <strong>Error:</strong> {error}
          </div>
        ) : filter === "completed" ? (
          rides.length ? (
            <div className="stack">
              {rides.map((ride) => {
                const amountCents = ride.final_fare_cents ?? ride.estimated_fare_cents ?? 0;
                const amount = new Intl.NumberFormat("en-ZA", {
                  style: "currency",
                  currency: "ZAR",
                }).format(amountCents / 100);

                return (
                  <div key={ride.id} className="card" style={{ padding: 16 }}>
                    <div className="row" style={{ justifyContent: "space-between", gap: 12 }}>
                      <div>
                        <p className="muted">{ride.status}</p>
                        <p>
                          <strong>{ride.pickup_address ?? "Pickup unknown"}</strong> → <strong>{ride.dropoff_address ?? "Dropoff unknown"}</strong>
                        </p>
                        <p className="muted">{amount}</p>
                      </div>
                      {ride.status === "COMPLETED" ? <InvoiceDownloadButton rideId={ride.id} /> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="muted">No completed rides yet.</p>
          )
        ) : offers.length ? (
          <div className="stack">
            {offers.map((offer) => {
              const ride = ridesById[offer.ride_id];
              const pickup = ride?.pickup_address ?? "(pickup not available)";
              const dropoff = ride?.dropoff_address ?? "(dropoff not available)";
              const amountCents = ride?.final_fare_cents ?? ride?.estimated_fare_cents ?? 0;
              const amount = new Intl.NumberFormat("en-ZA", {
                style: "currency",
                currency: "ZAR",
              }).format(amountCents / 100);

              return (
                <div key={offer.id} className="card" style={{ padding: 16 }}>
                  <div className="row" style={{ justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <p className="muted">{offer.status}</p>
                      <p>
                        <strong>{pickup}</strong> → <strong>{dropoff}</strong>
                      </p>
                      <p className="muted">{amount}</p>
                    </div>
                    {ride?.status === "COMPLETED" ? <InvoiceDownloadButton rideId={ride.id} /> : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="muted">No past offers yet.</p>
        )}
      </div>

      <div className="row" style={{ justifyContent: "flex-start" }}>
        <Link href="/" className="btn btn-ghost">
          Home
        </Link>
      </div>
    </section>
  );
}
