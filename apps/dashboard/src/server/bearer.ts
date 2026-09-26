/**
 * A bearer token beside the cookie (docs/decisions/0011-a-bearer-token-beside-the-cookie.md).
 *
 * The phone app's native screens call /api/v1 from outside the WebView, where the cookie is not. They send the
 * session's own access token, the one the page holds, as `Authorization: Bearer`; the route verifies it exactly as it
 * verifies the cookie's (getClaims over the token's signature) and runs its reads under RLS with it. A request that
 * carries a bearer never reads the cookie: there is no ambient credential in it, so the same-origin rule, which
 * exists for the cookie, does not apply to it.
 *
 * Relative imports only (with-route.ts says why). The verifier is injectable so the path is executed in a test
 * without an Auth server.
 */
import { createBearerClient } from "../lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@chanlytics/db";

const JWT = /^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/;

/** The token in `Authorization: Bearer <jwt>`, or null when the header is absent or is not a JWT's shape. */
export function bearerOf(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (!h) return null;
  const m = /^Bearer\s+(\S+)\s*$/i.exec(h);
  return m && JWT.test(m[1]) ? m[1] : null;
}

export interface BearerVerdict {
  supabase: SupabaseClient<Database>;
  claims: Record<string, unknown> | null;
  error: { status?: number; name?: string; message?: string } | null;
}

export type BearerVerifier = (token: string) => Promise<BearerVerdict>;

const real: BearerVerifier = async (token) => {
  const supabase = createBearerClient(token);
  const { data, error } = await supabase.auth.getClaims(token);
  return { supabase, claims: (data?.claims as Record<string, unknown> | undefined) ?? null, error: error ?? null };
};

let verifier: BearerVerifier = real;

/** The verifier every bearer request goes through: the real one, or a test's. */
export function verifyBearer(token: string): Promise<BearerVerdict> {
  return verifier(token);
}

/** For tests only: stand in for the Auth server. Returns the real one to put back. */
export function setBearerVerifier(v: BearerVerifier | null): BearerVerifier {
  const prev = verifier;
  verifier = v ?? real;
  return prev;
}
