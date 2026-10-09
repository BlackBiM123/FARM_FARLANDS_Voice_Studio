import { createClient } from "@supabase/supabase-js";
export function cloudClient() {
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_SECRET_KEY;
  return url && key
    ? createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: (url, options) =>
            fetch(url, { ...options, signal: AbortSignal.timeout(25000) }),
        },
      })
    : null;
}
