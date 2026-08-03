import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import ProfileMenu from "@/components/ProfileMenu";
import HideOnHome from "@/components/HideOnHome";
import RealtimeNotifications from "@/components/RealtimeNotifications";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Web Shuttle",
  description:
    "Web-first ride-sharing platform for passengers, drivers, and admins built with Next.js + Supabase.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const configured = isSupabaseConfigured();

  let signedInEmail: string | null = null;
  let role: string | null = null;

  if (configured) {
    try {
      const supabase = await createClient();
      const { data } = await supabase.auth.getUser();

      if (data.user) {
        signedInEmail = data.user.email ?? null;
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", data.user.id)
          .maybeSingle();
        role = (profile as { role?: string } | null)?.role ?? null;
      }
    } catch {
      // Keep the shell resilient if auth lookup fails.
    }
  }

  const linkClass =
    "rounded-full px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white";
  const buttonClass =
    "inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10";
  const primaryButtonClass =
    "inline-flex items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-cyan-400 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition hover:brightness-110";

  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 font-sans text-slate-50 antialiased selection:bg-cyan-300/30 selection:text-slate-950">
        <div className="relative isolate flex min-h-screen flex-col overflow-hidden">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.22),transparent_28%),radial-gradient(circle_at_80%_10%,rgba(0,212,255,0.14),transparent_22%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.12),transparent_24%)]" />
          <div className="pointer-events-none absolute left-[-10rem] top-24 -z-10 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl animate-float" />
          <div className="pointer-events-none absolute right-[-8rem] top-1/2 -z-10 h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl animate-glow" />

          <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
            <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
              <Link href="/" className="group flex items-center gap-3 rounded-full pr-2">
                <img
                  className="h-11 w-11 rounded-2xl border border-white/10 object-cover shadow-lg shadow-cyan-500/10 transition duration-300 group-hover:scale-[1.03]"
                  src="/logo.jpeg"
                  alt="Swift"
                  width={44}
                  height={44}
                />
                <span className="flex flex-col leading-tight">
                  <span className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-300">
                    Swift
                  </span>
                  <span className="text-xs text-slate-400">Johannesburg / Pretoria</span>
                </span>
              </Link>

                            <nav className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 p-1 md:flex">
                {!signedInEmail ? (
                  <>
                    <HideOnHome>
                      <Link href="/login" className={linkClass}>
                        Login
                      </Link>
                      <Link href="/signup" className={linkClass}>
                        Sign up
                      </Link>
                    </HideOnHome>
                  </>
                ) : null}
              </nav>

              <div className="ml-auto flex items-center gap-2">
                {configured ? (
                  signedInEmail ? (
                    <>
                      <span className="hidden rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200 sm:inline-flex">
                        {role ?? "User"}
                      </span>
                      <ProfileMenu email={signedInEmail} role={role} />
                    </>
                  ) : (
                    <>
                      <HideOnHome>
<Link href="/login" className={buttonClass}>
                        Login
                      </Link>
                      <Link href="/signup" className={primaryButtonClass}>
                        Sign up
                      </Link>
</HideOnHome>
                    </>
                  )
                ) : (
                  <Link href="/login" className={primaryButtonClass}>
                    Demo login
                  </Link>
                )}
              </div>
            </div>
          </header>

          <RealtimeNotifications />

          <main className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
            {children}
          </main>

          <footer className="relative z-10 border-t border-white/10 bg-slate-950/70 backdrop-blur-xl">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-5 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}






