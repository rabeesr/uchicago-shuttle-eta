"use client";

import { useAuth } from "@clerk/nextjs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useMemo } from "react";

// Supabase native Clerk integration: every Supabase request is authorized with
// the Clerk-issued session JWT. Supabase verifies it against Clerk's JWKS via
// the third-party auth provider configured in the Supabase dashboard.
//
// We hand Supabase an `accessToken` factory instead of a persisted session,
// so the token always comes fresh from Clerk.
export function useSupabaseBrowser(): SupabaseClient {
  const { getToken, isSignedIn } = useAuth();

  return useMemo(() => {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        accessToken: async () => {
          if (!isSignedIn) return null;
          return (await getToken()) ?? null;
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );
  }, [getToken, isSignedIn]);
}

/**
 * Anonymous client for client components that don't have a Clerk context
 * (or want to read public data without auth). Public read policies cover
 * routes/stops/vehicles/stop_etas/alerts.
 */
let anonClient: SupabaseClient | null = null;
export function getSupabaseAnon(): SupabaseClient {
  if (!anonClient) {
    anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );
  }
  return anonClient;
}
