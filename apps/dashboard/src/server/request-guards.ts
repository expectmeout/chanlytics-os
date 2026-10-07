import { AppError, UUID } from "@chanlytics/contracts";

/**
 * The checks every mutating request should pass before anything reads a
 * database, gathered in one place so a new route inherits them.
 *
 * They were spread out or absent: the same-origin test existed only inside the
 * sign-out route, ids went to Postgres unvalidated and came back as 500s, and
 * exactly two of twenty-two routes parsed their body at all.
 */

/**
 * Is this request from our own page?
 *
 * Cookie-authenticated JSON endpoints are only safe from cross-site submission
 * because of two accidents: `@supabase/ssr` defaults its cookies to
 * SameSite=Lax, and `vercel.app` is on the public-suffix list so a sibling
 * deployment cannot set cookies for us. Both stop being true the day this moves
 * to a subdomain shared with a marketing site — which is the ordinary next
 * step for a product with a custom domain. A check that costs one header read
 * should not wait for that.
 *
 * Lifted verbatim from the sign-out route, which has had it since the auth
 * hardening pass, so there is one implementation rather than two.
 *
 * "none" is a direct user action — a typed URL or a bookmark — not an
 * attacker's page. An absent Sec-Fetch-Site (older clients, some proxies)
 * falls back to comparing Origin against Host, and a request carrying neither
 * is refused rather than trusted.
 */
export function isSameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin" || site === "none";

  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * A route parameter that must be an id (contracts' UUID; `isUuid` there is the same test as a boolean).
 *
 * PostgREST answers a malformed uuid with 22P02, which `withRoute` turns into
 * a generic 500 "Something went wrong" — so a typo in a URL read as a server
 * fault. It is a 404: the thing named does not exist, because it cannot.
 *
 * `requireUuid` is for a URL's own parameter, where a malformed id means the
 * thing named cannot exist (404). An id that arrives in a request BODY is a
 * field the caller filled in wrong, which is a 400 with the field's own name --
 * a real difference, unlike the four copies of this pattern that used to state
 * it.
 */
export function requireUuid(value: unknown, what = "record"): string {
  const s = String(value ?? "");
  if (!UUID.test(s)) throw new AppError("not_found", `That ${what} does not exist.`, 404);
  return s;
}

/**
 * Parse a JSON body, or say why it could not be parsed.
 *
 * Every route did `await req.json().catch(() => null)` and then reached into
 * the result, so a malformed body produced a message about a missing field
 * rather than about the body.
 */
export async function jsonBody<T = unknown>(request: Request): Promise<T> {
  const raw = await request.json().catch(() => undefined);
  if (raw === undefined) throw new AppError("validation", "Expected a JSON body.");
  return raw as T;
}
