import { auth } from "@clerk/nextjs/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client for server components and route handlers. Uses the Clerk
 * native integration: Supabase attaches the Clerk-issued session token to
 * every request and enforces RLS via auth.jwt()->>'sub'.
 *
 * Must be created per-request — Clerk's auth() reads from request-scoped
 * storage. Do not cache the client.
 */
export async function getSupabaseServer(): Promise<SupabaseClient> {
  const { getToken } = await auth();

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      accessToken: async () => (await getToken()) ?? null,
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
