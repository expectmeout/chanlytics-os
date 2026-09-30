/**
 * Service-role client factory — ingestion, jobs, and platform-admin paths ONLY.
 * App-plane (/api/v1) handlers must use the session-scoped client so RLS is
 * the enforcement (Blueprint P6/§8); the dashboard wraps this behind a
 * server-only module. Framework-agnostic: env is passed in, never read here.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * How long a request to the database waits before it gives up: the service role's statements end at 30 s (00281),
 * and ten more are the network's and the pool's. Without it a request that never answered held its caller, a webhook
 * or a tick, until the function itself was killed.
 */
const SERVICE_FETCH_TIMEOUT_MS = 40_000;

export interface ServiceClientConfig {
  url: string;
  serviceRoleKey: string;
  /** A test's bound; SERVICE_FETCH_TIMEOUT_MS otherwise. */
  fetchTimeoutMs?: number;
  /** A test's transport; the runtime's fetch otherwise. */
  fetch?: typeof fetch;
}

/**
 * The runtime's fetch, bounded for the database's requests. Storage's are left alone: a file takes as long as its
 * size, and its caller bounds it. A caller's own signal still aborts first when it is sooner.
 *
 * A request given up on is said as an abort, which PostgREST's client never retries: it retries a read that failed,
 * three times over seven seconds, and three more waits of the bound would outlast every function that calls it.
 */
function boundedFetch(ms: number, base: typeof fetch): typeof fetch {
  return async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes("/rest/v1/")) return base(input, init);
    const bound = AbortSignal.timeout(ms);
    try {
      return await base(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, bound]) : bound });
    } catch (e) {
      if (!bound.aborted || init?.signal?.aborted) throw e;
      const said = new Error(`the database did not answer within ${ms} ms (timeout)`, { cause: e });
      said.name = "AbortError";
      throw said;
    }
  };
}

export function createServiceClient(cfg: ServiceClientConfig): SupabaseClient<Database> {
  return createClient<Database>(cfg.url, cfg.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: boundedFetch(cfg.fetchTimeoutMs ?? SERVICE_FETCH_TIMEOUT_MS, cfg.fetch ?? ((i, n) => fetch(i, n))),
    },
  });
}
