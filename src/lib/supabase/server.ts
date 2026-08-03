import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export async function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components can't set cookies directly.
          // This is expected; middleware/route handlers handle refresh.
        }
      },
    },
  });
}

export function createServiceRoleClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
      "Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.",
    );
  }

  // Basic sanity checks to help catch using the anon/public key by mistake.
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (supabaseAnonKey && supabaseServiceRoleKey === supabaseAnonKey) {
    throw new Error(
      "Invalid SUPABASE_SERVICE_ROLE_KEY: the value matches the public anon key. Use your service role / secret key instead.",
    );
  }

  // Supabase historically exposed service role keys prefixed with `service_role.`.
  // Newer projects may show JWT-formatted secret keys (they start with 'eyJ').
  // Accept either format, but fail if it clearly doesn't look like one of them.
  const looksLikeJwt = supabaseServiceRoleKey.startsWith('eyJ');
  const looksLikeLegacy = supabaseServiceRoleKey.startsWith('service_role.');

  if (!looksLikeJwt && !looksLikeLegacy) {
    throw new Error(
      "Invalid SUPABASE_SERVICE_ROLE_KEY: it does not look like a service role or secret key. Ensure you set the project's service/secret API key (not the anon/public key).",
    );
  }

  // Use the standard supabase-js client with the service role key for server-side admin queries.
  // This avoids the SSR cookie API requirement from createServerClient.
  return createSupabaseClient(supabaseUrl, supabaseServiceRoleKey);
}