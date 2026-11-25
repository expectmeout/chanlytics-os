import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { boundedFetch, namedFetch } from "@chanlytics/db/shared";
import { SECOND_MS } from "@chanlytics/contracts";
import type { Database } from "@chanlytics/db/types";
import { env, servedOverHttps } from "@/server/shared/env";
import { supabaseProject } from "@/lib/public-env";
import { sessionCookieOptions } from "./cookie-options";

/**
 * How long a member's request to the database waits before it gives up: a member's statements end at 8 s, and the longest
 * door they call at 25 (00547), with ten more for the network and the pool, as the service client's bound has. Without
 * one, a request the database never answered held its function until the platform killed it: on the night of 24 Nov 2026
 * calls waited one to four minutes each (Supabase's gateway log), long after the browser that asked had given up at 15 s.
 */
const MEMBER_FETCH_TIMEOUT_MS = 35 * SECOND_MS;

/**
 * What both clients here send their calls through: named for the request and counted (packages/db observe.ts), a failed
 * read asked once more at most (read-again.ts), so the client's own three more asks are off, and each call that is sent
 * bounded. The bound is beneath the naming, never around it: a request that answers several reads as one shares a read
 * only where the call carries no signal of its own (read-once.ts), and a bound around it put one on every call, so an
 * opening asked the database every question again (the nightly's own stack, 25 Nov 2026: seventeen more calls a load).
 * The process's fetch as it is at the call, so a test that stubs it later is heard.
 */
const memberTransport = () => ({
  db: { retry: false },
  global: {
    fetch: namedFetch(boundedFetch(MEMBER_FETCH_TIMEOUT_MS)),
  },
});

/**
 * Session-scoped server client — the ONLY client /api/v1 handlers and server
 * components use, so RLS is the enforcement (Blueprint P6/§8). The service-role
 * client is never imported from app-plane code. Every call it makes names the request it is made for
 * (packages/db observe.ts), so a row a SQL function writes to the ledger for a member's click says which click.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const project = supabaseProject(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  return createServerClient<Database>(project.url, project.anonKey, {
    cookieOptions: sessionCookieOptions(servedOverHttps()),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component with no response — middleware
          // refreshes sessions, so this is safe to ignore.
        }
      },
    },
    ...memberTransport(),
  });
}

/**
 * The client for a request that carries the session's access token as a bearer instead of the cookie (server/shared/auth/bearer.ts,
 * decision 0011): no cookie is read or written, and every read runs under RLS as that token. The token's own
 * verification is the route's (getClaims over it), never assumed from the header.
 */
export function createBearerClient(token: string) {
  const project = supabaseProject(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  return createServerClient<Database>(project.url, project.anonKey, {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
        /* a bearer request has no cookie to refresh */
      },
    },
    db: memberTransport().db,
    global: { headers: { Authorization: `Bearer ${token}` }, fetch: memberTransport().global.fetch },
  });
}
