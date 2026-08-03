"use client";

import React, { useEffect, useRef, useState } from "react";
import { createClient as createBrowserClient } from "@/lib/supabase/browser";

type ChatMessage = {
  id: string;
  text: string;
  sender_name: string | null;
  sender_role: string | null;
  sender_id?: string | null;
  created_at: string;
  display_time?: string;
};

function normalizeMessage(raw: any, index: number): ChatMessage | null {
  if (!raw) return null;

  const text = String(raw.text ?? raw.message ?? raw.body ?? "").trim();
  if (!text) return null;

  const senderName = raw.sender_name ?? raw.fromLabel ?? raw.from ?? null;
  const senderRole = raw.sender_role ?? (raw.from === "you" || raw.fromLabel === "You" ? "YOU" : null);
  const senderId = raw.sender_id ?? raw.fromId ?? null;
  const rawTime = raw.created_at ?? raw.timestamp;
  const createdAt = typeof rawTime === "string" && !Number.isNaN(Date.parse(rawTime)) ? rawTime : new Date().toISOString();

  return {
    id: String(raw.id ?? `${createdAt}-${index}`),
    text,
    sender_name: senderName,
    sender_role: senderRole,
    sender_id: senderId,
    created_at: createdAt,
    display_time: typeof raw.timestamp === "string" ? raw.timestamp : undefined,
  };
}

async function fetchRideMessages(rideId: string): Promise<ChatMessage[]> {
  const response = await fetch(`/api/rides/${rideId}/messages`, { credentials: "include" });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error ?? "Unable to load messages");
  }

  return Array.isArray(data?.messages) ? data.messages : [];
}

async function sendRideMessage(rideId: string, text: string) {
  const response = await fetch(`/api/rides/${rideId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ text }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error ?? "Unable to send message");
  }

  return data as { message?: ChatMessage };
}

export default function RideChat({ rideId }: { rideId: string }) {
  const DEBUG_DIAG = true; // toggle temporary diagnostics
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const prevMessagesRef = useRef<ChatMessage[] | null>(null);

  useEffect(() => {
    if (!rideId) return;

    let canceled = false;

    try {
      const key = `rideChat_${rideId}`;
      const raw = window.sessionStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const normalized = parsed.map((item, index) => normalizeMessage(item, index)).filter(Boolean) as ChatMessage[];
          if (normalized.length > 0) {
            setMessages(normalized);
          }
        }
      }
    } catch {
      // ignore
    }

    const sync = async () => {
      try {
        const serverMessages = await fetchRideMessages(rideId);
        if (canceled) return;

        setMessages(serverMessages.map((message, index) => normalizeMessage(message, index)).filter(Boolean) as ChatMessage[]);
        setError(null);
        setLastSyncedAt(new Date());
      } catch (syncError) {
        if (canceled) return;
        setError(syncError instanceof Error ? syncError.message : String(syncError));
      } finally {
        if (!canceled) setLoading(false);
      }
    };

    void sync();
    const interval = window.setInterval(() => void sync(), 3000);

    return () => {
      canceled = true;
      window.clearInterval(interval);
    };
  }, [rideId]);

  // Diagnostics: capture active element and scroll positions to help debug automatic jumps
  useEffect(() => {
    if (!DEBUG_DIAG) return;

    const dump = () => {
      try {
        const a = document.activeElement as HTMLElement | null;
        const info = {
          time: new Date().toISOString(),
          activeTag: a?.tagName ?? null,
          activeId: a?.id ?? null,
          activeClass: a?.className ?? null,
          scrollX: window.scrollX,
          scrollY: window.scrollY,
        };
        // console and localStorage for post-refresh inspection
        // eslint-disable-next-line no-console
        console.log("RideChat DEBUG:", info);
        try {
          const key = "rideChat_debug";
          const prev = JSON.parse(window.localStorage.getItem(key) || "[]");
          prev.push(info);
          window.localStorage.setItem(key, JSON.stringify(prev.slice(-200)));
        } catch {}
      } catch {}
    };

    dump();

    const onFocus = () => dump();
    const onScroll = () => dump();

    window.addEventListener("focus", onFocus, true);
    window.addEventListener("scroll", onScroll, true);

    const observer = new MutationObserver(() => dump());
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });

    return () => {
      window.removeEventListener("focus", onFocus, true);
      window.removeEventListener("scroll", onScroll, true);
      observer.disconnect();
    };
  }, [rideId]);

  useEffect(() => {
    if (!DEBUG_DIAG) return;
    try {
      // log on messages change too
      const a = document.activeElement as HTMLElement | null;
      // eslint-disable-next-line no-console
      console.log("RideChat DEBUG messages changed. active:", a?.tagName, "id:", a?.id, "scrollY:", window.scrollY);
    } catch {}
  }, [messages]);

  // Notify passenger when a new DRIVER message indicates arrival
  useEffect(() => {
    try {
      const prev = prevMessagesRef.current || [];
      if (!prev) {
        prevMessagesRef.current = messages;
        return;
      }

      if (messages.length > prev.length) {
        const newMessages = messages.slice(prev.length);
        for (const m of newMessages) {
          const isDriver = m.sender_role === "DRIVER" || (m.sender_name && m.sender_name.toLowerCase().includes("driver"));
          const text = String(m.text ?? "").toLowerCase();
          if (isDriver && text.includes("arrived")) {
            if (typeof Notification !== "undefined" && Notification.permission === "granted") {
              try {
                new Notification("Driver arrived", { body: m.text });
              } catch {}
            }
          }
        }
      }
      prevMessagesRef.current = messages;
    } catch {}
  }, [messages]);

  // Mitigation: if an element inside the chat is focused on load/refresh,
  // blur it to prevent the browser from scrolling to that element.
  useEffect(() => {
    try {
      const a = document.activeElement as HTMLElement | null;
      if (a && containerRef.current && containerRef.current.contains(a)) {
        try {
          a.blur();
          // eslint-disable-next-line no-console
          console.log("RideChat DEBUG: blurred focused element to prevent jump", a.tagName, a.id);
        } catch {}
      }
    } catch {}
  }, [rideId]);

  // Stronger mitigation: capture focus events and prevent any focus landing
  // inside the chat container (runs during capture phase so it fires early).
  useEffect(() => {
    const handler = (e: FocusEvent) => {
      try {
        const target = e.target as Node | null;
        if (containerRef.current && target && containerRef.current.contains(target)) {
          try {
            // prevent focus and blur the element immediately
            (target as HTMLElement).blur?.();
            e.stopImmediatePropagation?.();
            e.preventDefault?.();
            // eslint-disable-next-line no-console
            console.log('RideChat DEBUG: intercepted focusin and blurred target', (target as HTMLElement).tagName, (target as HTMLElement).id);
          } catch {}
        }
      } catch {}
    };

    window.addEventListener('focusin', handler, true);
    return () => window.removeEventListener('focusin', handler, true);
  }, [rideId]);

  // Scroll mitigation: if the browser restored scroll into the chat area on refresh,
  // move the viewport back to the top shortly after mount. Runs once per mount.
  useEffect(() => {
    try {
      const el = containerRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const inViewport = rect.top >= 0 && rect.top < window.innerHeight;

      if (inViewport) {
        // If the chat is currently visible at top of viewport after refresh,
        // reset scroll to top after a short delay so browser finishes its restore first.
        const t1 = window.setTimeout(() => {
          try {
            window.scrollTo({ top: 0, left: 0, behavior: "auto" });
            // eslint-disable-next-line no-console
            console.log("RideChat DEBUG: restored scroll to top to avoid jump");
          } catch {}
        }, 80);

        // safety retry in case of late mutations
        const t2 = window.setTimeout(() => {
          try {
            if (containerRef.current) {
              const r2 = containerRef.current.getBoundingClientRect();
              if (r2.top >= 0 && r2.top < window.innerHeight) {
                window.scrollTo({ top: 0, left: 0, behavior: "auto" });
                // eslint-disable-next-line no-console
                console.log("RideChat DEBUG: restored scroll to top (retry)");
              }
            }
          } catch {}
        }, 400);

        return () => {
          window.clearTimeout(t1);
          window.clearTimeout(t2);
        };
      }
    } catch {}
  }, [rideId]);

  useEffect(() => {
    // Get current user id for proper "you" detection
    try {
      const supabase = createBrowserClient();
      void supabase.auth.getUser().then((res) => {
        const user = (res as any)?.data?.user;
        if (user?.id) setCurrentUserId(String(user.id));
      }).catch(() => {});
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(`rideChat_${rideId}`, JSON.stringify(messages));
    } catch {
      // ignore
    }
  }, [messages, rideId]);


  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;

    const optimisticMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      text,
      sender_name: "You",
      sender_role: "YOU",
      created_at: new Date().toISOString(),
    };

    setSending(true);
    setMessages((prev) => [...prev, optimisticMessage]);
    setInput("");
    setError(null);

    try {
      await sendRideMessage(rideId, text);
      const refreshedMessages = await fetchRideMessages(rideId);
      setMessages(refreshedMessages.map((message, index) => normalizeMessage(message, index)).filter(Boolean) as ChatMessage[]);
      setLastSyncedAt(new Date());
    } catch (sendError) {
      setMessages((prev) => prev.filter((message) => message.id !== optimisticMessage.id));
      setInput(text);
      setError(sendError instanceof Error ? sendError.message : String(sendError));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-lg bg-slate-900/70 p-4 shadow-sm w-full max-w-full" style={{ maxHeight: 'calc(100vh - 180px)' }}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
        <h3 className="text-lg font-semibold text-white">Chat</h3>
        <div className="text-sm text-slate-400">
          Status: <span className="ml-1 text-emerald-400">●</span>
          <span className="ml-2 text-slate-400">Live sync{lastSyncedAt ? ` • ${lastSyncedAt.toLocaleTimeString()}` : ""}</span>
        </div>
      </div>

      {error ? (
        <div className="mb-3 rounded-lg border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs text-rose-300">
          {error}
        </div>
      ) : null}

      <div ref={containerRef} className="flex-1 overflow-y-auto space-y-3 mb-3 px-0" style={{ maxHeight: '35vh', minHeight: '250px' }}>
        {loading && messages.length === 0 ? (
          <div className="text-sm text-slate-400">Loading messages...</div>
        ) : messages.length === 0 ? (
          <div className="text-sm text-slate-400">No messages yet</div>
        ) : (
          messages.map((message) => {
            const isYou =
              message.sender_role === "YOU" ||
              message.sender_name === "You" ||
              (currentUserId && message.sender_id && String(message.sender_id) === String(currentUserId));
            const label = isYou ? "You" : message.sender_name ?? message.sender_role ?? "Other";
            const timeLabel = message.display_time ?? new Date(message.created_at).toLocaleTimeString();
            return (
              <div key={message.id} className={`flex ${isYou ? "justify-end" : "justify-start"}`}>
                <div className="w-full max-w-full min-w-0">
                  <div className={`inline-flex w-full items-end ${isYou ? "justify-end" : "justify-start"} gap-2`}>
                    <div className={`rounded-full w-8 h-8 flex items-center justify-center text-xs font-medium ${isYou ? "bg-gradient-to-r from-cyan-500 to-blue-500 text-white" : "bg-slate-700 text-slate-200"}`}>
                      {isYou ? "You" : label.charAt(0).toUpperCase()}
                    </div>
                    <div className="w-full min-w-0">
                      <div className={`${isYou ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white" : "bg-slate-800 text-slate-200"} px-3 py-2 rounded-2xl shadow break-words w-full`}>
                        <div className="whitespace-pre-wrap break-words text-sm">{message.text}</div>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        {label} • {timeLabel}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="text"
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !sending ? void handleSend() : undefined}
          className="w-full flex-1 min-w-0 px-4 py-3 rounded-full bg-slate-800 text-slate-100 placeholder:text-slate-400 border border-slate-700 focus:outline-none"
        />
        <button
          onClick={() => void handleSend()}
          disabled={sending || !input.trim()}
          className="w-full sm:w-auto inline-flex justify-center items-center px-4 py-3 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow disabled:cursor-not-allowed disabled:opacity-60"
        >
          Send
        </button>
      </div>
    </div>
  );
}

