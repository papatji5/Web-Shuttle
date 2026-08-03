import Link from "next/link";
import { requireRole } from "@/lib/auth/require";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function WalletPage() {
  const user = await requireRole("DRIVER");
  const supabase = await createClient();

  const { data: driver, error: driverError } = await supabase.from("drivers").select("balance_cents").eq("id", user.id).maybeSingle();

  if (driverError) {
    return (
      <section className="stack">
        <h1>Wallet</h1>
        <div className="alert">
          <strong>Error:</strong> {driverError.message}
        </div>
        <div className="row">
          <Link href="/account/past-offers" className="btn btn-ghost">
            Back
          </Link>
        </div>
      </section>
    );
  }

  const balanceCents = driver?.balance_cents ?? 0;
  const balance = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(balanceCents / 100);

  const { data: rides, error: ridesErr } = await supabase
    .from("rides")
    .select("id,pickup_address,dropoff_address,final_fare_cents,estimated_fare_cents,status,accepted_at")
    .eq("driver_id", user.id)
    .order("accepted_at", { ascending: false })
    .limit(50);

  return (
    <section className="stack">
      <div className="stack">
        <h1>Wallet</h1>
        <p className="muted">Your current driver balance from accepted trips.</p>
      </div>

      <div className="card">
        <h2>Balance</h2>
        <p style={{ fontSize: 20, fontWeight: 700 }}>{balance}</p>
      </div>

      <div className="card stack">
        <h2>Recent accepted rides</h2>
        {ridesErr ? (
          <div className="alert">
            <strong>Error:</strong> {ridesErr.message}
          </div>
        ) : rides && rides.length ? (
          <div className="stack">
            {rides.map((r: any) => {
              const amountCents = r.final_fare_cents ?? r.estimated_fare_cents ?? 0;
              const amt = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(amountCents / 100);
              return (
                <div key={r.id} className="card" style={{ padding: 12 }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <div>
                      <p className="muted">{r.status}</p>
                      <p>
                        <strong>{r.pickup_address ?? "(unknown)"}</strong> → <strong>{r.dropoff_address ?? "(unknown)"}</strong>
                      </p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p className="muted">{r.accepted_at ? new Date(r.accepted_at).toLocaleString() : "-"}</p>
                      <p><strong>{amt}</strong></p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="muted">No accepted rides yet.</p>
        )}
      </div>

      <div className="row">
        <Link href="/account/past-offers" className="btn btn-ghost">
          Back
        </Link>
      </div>
    </section>
  );
}
