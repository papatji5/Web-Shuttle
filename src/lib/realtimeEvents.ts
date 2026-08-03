import { EventEmitter } from "events";
import { createServiceRoleClient } from "@/lib/supabase/server";

const realtimeEventBus = new EventEmitter();

export async function publishToSupabaseChannel(event: string, payload: unknown) {
  try {
    const supabase = createServiceRoleClient();
    const channel = supabase.channel("public-broadcast");
    await channel.send({ type: "broadcast", event, payload: payload ?? {} });
  } catch (e) {
    // Do not block main flow on publish errors
    // eslint-disable-next-line no-console
    console.error("publishToSupabaseChannel error", e);
  }
}

export function emitRealtimeEvent(event: string, payload: unknown) {
  // Local in-process emission
  realtimeEventBus.emit(event, payload);
  // Also publish to Supabase so other processes/clients receive it
  void publishToSupabaseChannel(event, payload);
}

export function onRealtimeEvent(event: string, handler: (payload: any) => void) {
  realtimeEventBus.on(event, handler);
  return () => realtimeEventBus.off(event, handler);
}

export default realtimeEventBus;
