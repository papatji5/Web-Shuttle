"use client";

import { useEffect, useState } from "react";
import { getSocket } from "@/lib/socket";

type ToastItem = {
  id: number;
  title: string;
  body: string;
};

export default function RealtimeNotifications() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.Notification === "undefined") return;

    if (window.Notification.permission === "default") {
      window.Notification.requestPermission().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    const socket = getSocket();

    const addToast = (title: string, body: string) => {
      const item: ToastItem = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        title,
        body,
      };

      setToasts((prev) => [...prev, item].slice(-4));

      if (typeof window !== "undefined" && typeof window.Notification !== "undefined" && window.Notification.permission === "granted") {
        new window.Notification(title, { body });
      }
    };

    const handleRideRequested = (payload: any) => {
      const pickup = payload?.pickupAddress ?? "A passenger";
      const dropoff = payload?.dropoffAddress ?? "their destination";
      addToast("New ride request", `${pickup} → ${dropoff}`);
    };

    socket.on("rideRequested", handleRideRequested);

    return () => {
      socket.off("rideRequested", handleRideRequested);
    };
  }, []);

  useEffect(() => {
    if (!toasts.length) return;

    const timeout = window.setTimeout(() => {
      setToasts([]);
    }, 5000);

    return () => window.clearTimeout(timeout);
  }, [toasts]);

  if (!toasts.length) return null;

  return (
    <div className="fixed right-4 top-4 z-[60] flex max-w-sm flex-col gap-2">
      {toasts.map((toast) => (
        <div key={toast.id} className="rounded-lg border border-cyan-500/30 bg-slate-900/95 p-3 shadow-xl shadow-slate-950/40">
          <div className="text-sm font-semibold text-cyan-300">{toast.title}</div>
          <div className="mt-1 text-sm text-slate-200">{toast.body}</div>
        </div>
      ))}
    </div>
  );
}
