import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient as createSupabaseBrowserClient } from '@/lib/supabase/browser';

type LocalSocket = {
  id?: string;
  on: (event: string, cb: (payload: any) => void) => void;
  off: (event: string, cb: (payload: any) => void) => void;
  emit: (event: string, payload?: any) => Promise<void>;
};

let adapter: LocalSocket | null = null;

export function getSocket(): LocalSocket {
  if (adapter) return adapter;

  // If we're on the server (SSR / edge), return a no-op adapter so imports
  // don't attempt to create browser Supabase clients or open realtime channels.
  if (typeof window === "undefined") {
    const noop: LocalSocket = {
      id: undefined,
      on: () => undefined,
      off: () => undefined,
      emit: async () => {},
    };
    adapter = noop;
    return adapter;
  }

  // Lightweight in-memory event emitter that forwards to/from a Supabase Realtime channel.
  const supabase: SupabaseClient = (createSupabaseBrowserClient() as unknown) as SupabaseClient;
  // channel name shared by all clients; individual messages include `rideId` to scope recipients
  const channel = supabase.channel('public-broadcast');

  const listeners = new Map<string, Set<(p: any) => void>>();

  const emitLocal = (ev: string, payload: any) => {
    const set = listeners.get(ev);
    if (set) {
      for (const cb of Array.from(set)) {
        try {
          cb(payload);
        } catch (e) {
          console.error('local listener error', e);
        }
      }
    }
  };

  // subscribe once to incoming broadcasts and forward to local listeners
  (channel as any).on('broadcast', { event: '*' }, (msg: any) => {
    try {
      const ev = msg.event as string;
      const payload = msg.payload;
      emitLocal(ev, payload);
    } catch (e) {
      // ignore
    }
  });

  try {
    const subscribeResult = (channel as any).subscribe();
    if (subscribeResult && typeof subscribeResult.catch === 'function') {
      subscribeResult.catch((e: any) => console.error('supabase channel subscribe error', e));
    }
  } catch (subErr) {
    console.error('supabase channel subscribe failed', subErr);
  }

  const clientId = `supabase-${Math.random().toString(36).slice(2,9)}`;

  adapter = {
    id: clientId,
    on(event: string, cb: (payload: any) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(cb);
    },
    off(event: string, cb: (payload: any) => void) {
      const set = listeners.get(event);
      if (!set) return;
      set.delete(cb);
      if (set.size === 0) listeners.delete(event);
    },
    async emit(event: string, payload?: any) {
      try {
        await (channel as any).send({ type: 'broadcast', event, payload: payload ?? {} });
      } catch (e) {
        console.error('supabase channel send error', e);
      }
    },
  };

  return adapter;
}
