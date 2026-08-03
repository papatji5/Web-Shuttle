import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export async function GET(request: Request) {
  // Demo mode: no Supabase configured yet
  if (!isSupabaseConfigured()) {
    const url = new URL(request.url);
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const supabase = await createClient();
  await supabase.auth.signOut();

  const url = new URL(request.url);
  url.pathname = "/";
  url.search = "";

  return NextResponse.redirect(url);
}

