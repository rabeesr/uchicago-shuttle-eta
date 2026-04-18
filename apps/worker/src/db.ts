import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

export const db = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
