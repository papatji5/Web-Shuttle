import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function Home() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();

    if (data?.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();

      const role = profile?.role;
      if (role === "PASSENGER") redirect("/passenger");
      if (role === "DRIVER") redirect("/driver");
      if (role === "ADMIN") redirect("/admin");
      redirect("/passenger");
    }
  }

  const primaryButtonClass =
    "inline-flex items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-cyan-400 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition hover:brightness-110";
  const secondaryButtonClass =
    "inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10";
  const cardClass =
    "rounded-[1.75rem] border border-white/10 bg-white/5 p-6 shadow-2xl shadow-slate-950/40 backdrop-blur-xl";

  return (
    <section className="space-y-12">
      <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl shadow-slate-950/40 backdrop-blur-xl sm:p-8 lg:p-10">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(15,23,42,0.85),transparent_30%,rgba(14,165,233,0.12))]" />
        <div className="pointer-events-none absolute -right-8 top-4 h-40 w-40 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -left-10 bottom-0 h-52 w-52 rounded-full bg-slate-700/20 blur-3xl" />

        <div className="relative grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">
                Launch-ready operations
              </span>
              <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                Passenger & driver workflows
              </span>
              <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                Secure dispatch pipeline
              </span>
            </div>

            <div className="space-y-3">
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
                Web Shuttle for modern urban ride-sharing.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                Web Shuttle is a polished landing experience for drivers, passengers, and operations staff. It keeps the homepage focused on the service, not technical details.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link className={primaryButtonClass} href="/signup">
                Create account
              </Link>
              <Link className={secondaryButtonClass} href="/login">
                Login
              </Link>
            </div>
          </div>

          <div className={`${cardClass} space-y-5`}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Live pilot overview</p>
                <h2 className="mt-2 text-xl font-semibold text-white">Designed for growth</h2>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <img src="/logo.jpeg" alt="Swift logo" className="h-12 w-12 rounded-2xl object-cover" width={48} height={48} />
              </div>
            </div>
            <p className="text-sm leading-6 text-slate-300">
              A professional, secure homepage experience that leads visitors to account creation and platform login without exposing internal infrastructure or sensitive details.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className={cardClass}>
          <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Passenger experience</p>
          <h2 className="mt-2 text-lg font-semibold text-white">Fast bookings, clear routes</h2>
          <p className="mt-2 text-sm text-slate-300">A simplified rider workflow with clean destination planning and a streamlined journey from request to pickup.</p>
        </div>

        <div className={cardClass}>
          <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Driver operations</p>
          <h2 className="mt-2 text-lg font-semibold text-white">Reliable dispatch and offers</h2>
          <p className="mt-2 text-sm text-slate-300">Driver dashboards make it easy to accept rides, track progress, and manage active journeys with a polished interface.</p>
        </div>

        <div className={cardClass}>
          <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Launch readiness</p>
          <h2 className="mt-2 text-lg font-semibold text-white">Secure, production-focused</h2>
          <p className="mt-2 text-sm text-slate-300">The homepage is intentionally clean and secure, keeping all implementation details off the public landing experience.</p>
        </div>
      </div>
    </section>
  );
}

