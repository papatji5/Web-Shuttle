import { requireUser } from "@/lib/auth/require";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import InvoiceDownloadButton from "@/components/InvoiceDownloadButton";

export const dynamic = "force-dynamic";

export default async function RecentRidesPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: ridesData, error: ridesError } = await supabase
    .from("rides")
    .select("id,status,pickup_address,dropoff_address,completed_at,final_fare_cents,estimated_fare_cents")
    .eq("passenger_id", user.id)
    .eq("status", "COMPLETED")
    .order("completed_at", { ascending: false })
    .limit(10);

  const rides = ridesData ?? [];

  return (
    <section className="stack">
      <div className="stack">
        <h1>Recent rides</h1>
        <p className="muted">Your completed rides with invoice downloads.</p>
      </div>

      <div className="card stack">
        {ridesError ? (
          <div className="alert">
            <strong>Ride history error:</strong> {ridesError.message}
          </div>
        ) : rides.length ? (
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
                    {ride.status === "COMPLETED" && <InvoiceDownloadButton rideId={ride.id} />}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="muted">No completed rides yet. Once you finish a ride, your invoice will be available for download here.</p>
        )}
      </div>

      <div className="row" style={{ justifyContent: "flex-start" }}>
        <Link href="/account" className="btn btn-ghost">
          Back to account
        </Link>
      </div>
    </section>
  );
}
