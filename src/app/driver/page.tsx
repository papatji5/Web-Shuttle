import Link from "next/link";
import { redirect } from "next/navigation";
import DriverLocationAutoTracker from "@/components/DriverLocationAutoTracker";
import DriverAvailableRequests from "@/components/DriverAvailableRequests";
import DriverActiveRide from "@/components/DriverActiveRide";
import { requireRole } from "@/lib/auth/require";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type DriverPageProps = {
  searchParams?: Promise<{ msg?: string; error?: string; tab?: string }>;
};

async function initDriverAction() {
  "use server";

  const user = await requireRole("DRIVER");
  const supabase = await createClient();

  const { error } = await supabase.from("drivers").insert({ id: user.id });

  if (error && !/duplicate|already exists/i.test(error.message)) {
    redirect("/driver?error=" + encodeURIComponent(error.message));
  }

  redirect("/driver?msg=" + encodeURIComponent("Driver profile initialized."));
}

async function acceptOfferAction(formData: FormData) {
  "use server";

  const user = await requireRole("DRIVER");
  const supabase = await createClient();

  const offerId = String(formData.get("offerId") ?? "");
  const rideId = String(formData.get("rideId") ?? "");

  if (!offerId || !rideId) {
    redirect("/driver?error=" + encodeURIComponent("Missing offer/ride id."));
  }

  const { error: rideError } = await supabase
    .from("rides")
    .update({
      driver_id: user.id,
      status: "ACCEPTED",
      accepted_at: new Date().toISOString(),
    })
    .eq("id", rideId)
    .is("driver_id", null);

  if (rideError) {
    redirect("/driver?error=" + encodeURIComponent(rideError.message));
  }

  const { error: offerError } = await supabase
    .from("ride_offers")
    .update({ status: "ACCEPTED", responded_at: new Date().toISOString() })
    .eq("id", offerId)
    .eq("driver_id", user.id);

  if (offerError) {
    redirect("/driver?error=" + encodeURIComponent(offerError.message));
  }

  // Add fare to driver's balance (use final fare if available, otherwise estimated)
  const { data: rideRow, error: rideFetchErr } = await supabase.from("rides").select("id,final_fare_cents,estimated_fare_cents").eq("id", rideId).maybeSingle();

  if (rideFetchErr) {
    redirect("/driver?error=" + encodeURIComponent(rideFetchErr.message));
  }

  const amountCents = (rideRow?.final_fare_cents ?? rideRow?.estimated_fare_cents ?? 0) as number;
  if (amountCents > 0) {
    // Apply commission: driver receives 80%, platform keeps 20%
    const driverShare = Math.round(amountCents * 0.8);

    const { data: driverRow, error: driverFetchErr } = await supabase.from("drivers").select("balance_cents").eq("id", user.id).maybeSingle();
    if (driverFetchErr) {
      redirect("/driver?error=" + encodeURIComponent(driverFetchErr.message));
    }
    const current = (driverRow?.balance_cents ?? 0) as number;
    const { error: balanceUpdateErr } = await supabase.from("drivers").update({ balance_cents: current + driverShare }).eq("id", user.id);
    if (balanceUpdateErr) {
      redirect("/driver?error=" + encodeURIComponent(balanceUpdateErr.message));
    }
  }

  redirect("/driver?msg=" + encodeURIComponent("Offer accepted."));
}

async function rejectOfferAction(formData: FormData) {
  "use server";

  const user = await requireRole("DRIVER");
  const supabase = await createClient();

  const offerId = String(formData.get("offerId") ?? "");
  if (!offerId) {
    redirect("/driver?error=" + encodeURIComponent("Missing offer id."));
  }

  const { error } = await supabase
    .from("ride_offers")
    .update({ status: "REJECTED", responded_at: new Date().toISOString() })
    .eq("id", offerId)
    .eq("driver_id", user.id);

  if (error) {
    redirect("/driver?error=" + encodeURIComponent(error.message));
  }

  redirect("/driver?msg=" + encodeURIComponent("Offer rejected."));
}

export default async function DriverPage(props: DriverPageProps) {
  const sp = props.searchParams ? await props.searchParams : {};
  const showPastOffers = sp?.tab === "past-offers";

  if (!isSupabaseConfigured()) {
    return (
      <section className="stack">
        <div className="stack">
          <h1>Driver (Demo)</h1>
          <p className="muted">Supabase isn't configured yet. Add your Supabase env vars and create a Supabase project to enable login and driver features.</p>
        </div>
        <div className="row">
          <Link className="btn" href="/">
            Home
          </Link>
        </div>
      </section>
    );
  }

  const user = await requireRole("DRIVER");
  const supabase = await createClient();

  const { data: offers, error: offersError } = await supabase
    .from("ride_offers")
    .select("id,ride_id,status,sent_at,expires_at")
    .eq("driver_id", user.id)
    .order("sent_at", { ascending: false })
    .limit(10);

  let ridesErrorMsg: string | null = null;
  const rideById: Record<string, any> = {};

  if (!offersError && offers && offers.length) {
    const rideIds = Array.from(new Set((offers as any[]).map((o) => o.ride_id).filter(Boolean)));

    const { data: rides, error: ridesError } = await supabase
      .from("rides")
      .select("id,pickup_address,dropoff_address,status")
      .in("id", rideIds);

    if (ridesError) {
      ridesErrorMsg = ridesError.message;
    } else {
      for (const r of rides ?? []) {
        rideById[(r as any).id] = r;
      }
    }
  }

  const missingRideDetails = (offers ?? []).some((o: any) => !rideById[o.ride_id]);

  return (
    <section className="stack">
      <div className="stack">
        <h1>Driver</h1>
      </div>

      {sp?.msg ? (
        <div className="alert">
          <strong>OK:</strong> {sp.msg}
        </div>
      ) : null}
      {sp?.error ? (
        <div className="alert">
          <strong>Error:</strong> {sp.error}
        </div>
      ) : null}

      <DriverLocationAutoTracker />

      <DriverAvailableRequests />

      <DriverActiveRide />

      
    </section>
  );
}
