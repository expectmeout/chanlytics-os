/**
 * "We could not ask" is not "you are not signed in".
 *
 * Supabase's getUser() returns no user for BOTH a missing session and a
 * network or 5xx failure against the auth server. Every client treats a 401 as
 * a sign-out — it wipes the surface cache (real customer transcripts) and
 * hard-redirects to /login — so answering 401 for the second case logged every
 * operator out during a blip and discarded whatever they were typing.
 *
 * One predicate, used by the middleware AND by withRoute. It lived in
 * withRoute alone, and the middleware answered 401 for API paths before the
 * wrapper ever ran, so the 503 branch was unreachable in exactly the outage it
 * was written for.
 */
export function isRetryableAuthError(err: { status?: number; name?: string } | null | undefined): boolean {
  if (!err) return false;
  return err.status === undefined || err.status >= 500 || err.name === "AuthRetryableFetchError";
}
