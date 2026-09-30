/**
 * The attributes of the session's cookies, said once for the three clients that write them (the request client, the
 * proxy's, the browser's).
 *
 * `@supabase/ssr` defaults to SameSite=Lax and sets no Secure. Lax stays, said out loud so a library default cannot
 * move it, and Secure is set wherever the site is served over https (production and previews; a laptop's http keeps
 * working). `httpOnly` is NOT set and cannot be while the browser client reads the session from the cookie, which the
 * shell's realtime and Ask do: the plan (docs/plans/2026-09-29-s10-secure.md, section 4) records that, and the token a
 * script could read is one a revoked session refuses, on the acts that ask the Auth server (with-route.ts, `fresh`).
 */
export function sessionCookieOptions(secure: boolean): { sameSite: "lax"; secure: boolean } {
  return { sameSite: "lax", secure };
}
