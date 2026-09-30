import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { namedFetch, type Database } from "@chanlytics/db";

/**
 * Session-scoped server client — the ONLY client /api/v1 handlers and server
 * components use, so RLS is the enforcement (Blueprint P6/§8). The service-role
 * client is never imported from app-plane code. Every call it makes names the request it is made for
 * (packages/db observe.ts), so a row a SQL function writes to the ledger for a member's click says which click.
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
      global: { fetch: namedFetch() },
    },
  );
}

/**
 * The client for a request that carries the session's access token as a bearer instead of the cookie (server/bearer.ts,
 * decision 0011): no cookie is read or written, and every read runs under RLS as that token. The token's own
 * verification is the route's (getClaims over it), never assumed from the header.
 */
export function createBearerClient(token: string) {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          /* a bearer request has no cookie to refresh */
        },
      },
      global: { headers: { Authorization: `Bearer ${token}` }, fetch: namedFetch() },
    },
  );
}
