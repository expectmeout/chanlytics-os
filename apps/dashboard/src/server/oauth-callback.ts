/**
 * The provider's return, decided without a network: what to exchange, and
 * where to land. Pure, so the route stays a thin door and the decisions run in
 * a test.
 *
 * `next` is where the page that started the sign-in asked to land -- the
 * app's own hash route, usually. It is taken only as a path on this site: a
 * value that could send the browser elsewhere (a scheme, a `//host`, a
 * newline) is replaced with the root rather than trusted, because the query
 * string of a callback is exactly the place a link in an email would put one.
 */
export const OAUTH_FAILED = "/login?error=oauth";

export function safeNext(next: string | null | undefined): string {
  const n = (next ?? "").trim();
  if (!n.startsWith("/") || n.startsWith("//") || n.startsWith("/\\") || /[\r\n]/.test(n)) return "/";
  return n;
}

export interface CallbackPlan {
  /** The code to exchange for a session, or null when there is nothing to exchange. */
  exchange: string | null;
  /** Where the browser goes: the asked-for page after a code; sign-in when there was none, saying why when the provider said. */
  to: string;
}

export function callbackPlan(q: { code: string | null; next: string | null; error: string | null }): CallbackPlan {
  if (q.error) return { exchange: null, to: OAUTH_FAILED };
  if (!q.code) return { exchange: null, to: "/login" };
  return { exchange: q.code, to: safeNext(q.next) };
}
