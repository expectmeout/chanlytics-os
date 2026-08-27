import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@chanlytics/db";

/**
 * Session-scoped server client — the ONLY client /api/v1 handlers and server
 * components use, so RLS is the enforcement (Blueprint P6/§8). The service-role
 * client is never imported from app-plane code.
 */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component with no response — middleware
            // refreshes sessions, so this is safe to ignore.
          }
        },
      },
    },
  );
}
