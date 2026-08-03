"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export default function ProfileMenu({ email, role }: { email?: string | null; role?: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      if (!(e.target instanceof Node)) return;
      if (!ref.current.contains(e.target)) setOpen(false);
    }

    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  const initials = (email || "?")
    .split("@")[0]
    .split(/[._-]/)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setOpen(false);
    router.push("/login");
    router.refresh();
  }

  const menuItemClass =
    "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-slate-300 transition hover:bg-white/10 hover:text-white";

  return (
    <div className="relative" ref={ref}>
      <button
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="group flex h-11 w-11 items-center justify-center rounded-full border border-cyan-300/20 bg-gradient-to-br from-blue-600 to-cyan-400 text-white shadow-lg shadow-cyan-500/20 transition hover:scale-[1.03]"
        title={email ?? "Account"}
      >
        <span className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-sm font-bold uppercase tracking-wide">
          {initials}
        </span>
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+0.75rem)] w-72 overflow-hidden rounded-3xl border border-white/10 bg-slate-950/95 p-2 shadow-2xl shadow-slate-950/60 backdrop-blur-xl">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-400 text-sm font-bold text-white shadow-lg shadow-cyan-500/20">
                {initials}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">{email ?? "Account"}</div>
                <div className="mt-1 inline-flex rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
                  {role ?? "User"}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-2 space-y-1 px-1 pb-1">
            <Link href="/account" className={menuItemClass} onClick={() => setOpen(false)}>
              <span>Account</span>
              <span className="text-slate-500">→</span>
            </Link>

            {role === "DRIVER" ? (
              <Link href="/account/past-offers" className={menuItemClass} onClick={() => setOpen(false)}>
                <span>Past offers</span>
                <span className="text-slate-500">→</span>
              </Link>
            ) : (
              <Link href="/account/recent-rides" className={menuItemClass} onClick={() => setOpen(false)}>
                <span>Recent rides</span>
                <span className="text-slate-500">→</span>
              </Link>
            )}

            {role === "PASSENGER" ? (
              <Link href="/passenger" className={menuItemClass} onClick={() => setOpen(false)}>
                <span>Passenger dashboard</span>
                <span className="text-slate-500">→</span>
              </Link>
            ) : null}
            {role === "DRIVER" ? (
              <Link href="/account/wallet" className={menuItemClass} onClick={() => setOpen(false)}>
                <span>Wallet</span>
                <span className="text-slate-500">→</span>
              </Link>
            ) : null}
            {role === "DRIVER" ? (
              <Link href="/driver" className={menuItemClass} onClick={() => setOpen(false)}>
                <span>Driver dashboard</span>
                <span className="text-slate-500">→</span>
              </Link>
            ) : null}
            {role === "ADMIN" ? (
              <Link href="/admin" className={menuItemClass} onClick={() => setOpen(false)}>
                <span>Admin dashboard</span>
                <span className="text-slate-500">→</span>
              </Link>
            ) : null}

            <button type="button" onClick={handleLogout} className={menuItemClass}>
              <span>Logout</span>
              <span className="text-slate-500">↗</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}


