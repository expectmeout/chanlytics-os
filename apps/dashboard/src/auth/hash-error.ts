/**
 * Reading a refused sign-in out of the URL fragment.
 *
 * WHY A FRAGMENT AND NOT THE QUERY. Supabase returns a failed provider sign-in
 * by sending the browser to the redirect address with the reason after a `#`.
 * A fragment is never sent to a server, so /auth/callback sees neither a code
 * nor an error, redirects to /login exactly as it should, and the browser
 * carries the fragment through that redirect -- and through the middleware's
 * bounce off /login when the person does have a session. It ends up in
 * window.location.hash, which is where the OS shell reads its route, and the
 * shell drew `No surface at "error=server_error&error_code=..."`: a sign-in
 * failure wearing a routing error's clothes.
 *
 * The callback route's own logging (the query form of this) still matters --
 * some refusals do arrive as query parameters -- but it can never see this
 * one. Only the browser can, which is why this is here and not there.
 *
 * THE RULE: a route always begins "#/". Anything else in the fragment belongs
 * to somebody else. That keeps `#/errors` a route and makes the test for it
 * one line.
 */

/** A provider's refusal, as the fragment spells it. Kept for the log and the page's one sentence. */
interface HashAuthError {
  error: string;
  code: string | null;
  description: string | null;
}

/**
 * The person pressed Cancel on the provider's own screen. Not a failure to
 * apologise for -- saying "that didn't work" to somebody who changed their
 * mind is the wrong sentence.
 */
export const OAUTH_CANCELLED = "access_denied";

/** Clipped and flattened: a fragment is written by whoever built the link, and this ends up in a log line. */
const clip = (s: string | null | undefined): string | null => {
  const t = (s ?? "").replace(/[\r\n]+/g, " ").trim();
  return t ? t.slice(0, 200) : null;
};

export function authErrorInHash(hash: string | null | undefined): HashAuthError | null {
  const h = (hash ?? "").trim();
  // A route, or nothing at all. Both are somebody else's business.
  if (!h.startsWith("#") || h.startsWith("#/")) return null;
  const q = new URLSearchParams(h.slice(1));
  const error = clip(q.get("error"));
  if (!error) return null;
  return { error, code: clip(q.get("error_code")), description: clip(q.get("error_description")) };
}
