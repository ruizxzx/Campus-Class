import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/** Server-only privileged client. Never import this module into a Client Component. */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) throw new Error("Server-side Supabase secret is not configured.");
  return createSupabaseClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
