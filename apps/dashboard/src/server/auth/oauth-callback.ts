import { SECOND_FACTOR_PATH, factorStepNeeded, type AssuranceLevels, lineOrNull } from "@chanlytics/contracts";
import { signInReturnOf } from "@/auth/sign-in-return";

/**
 * The provider's return, decided without a network: what to exchange, and
 * where to land. Pure, so the route stays a thin door and the decisions run in
 * a test.
 *
 * `next` is where the page that started the sign-in asked to land -- the
 * app's own hash route, usually. It is taken only as a path on this site: a
 * value that could send the browser elsewhere (a scheme, a `//host`, a
 * backslash, which browsers read as a slash, or a control character, which URL
 * parsing drops so that `/<tab>/host` becomes `//host`) is replaced with the
 * root rather than trusted, because the query string of a callback is exactly
 * the place a link in an email would put one. Then the path is resolved against
 * a stand-in origin and must still be on it.
 */
export const OAUTH_FAILED = "/login?error=oauth";

const HERE = "https://this.invalid";

export function safeNext(next: string | null | undefined): string {
  const n = (next ?? "").trim();
  // eslint-disable-next-line no-control-regex -- the control characters are the point
  if (!n.startsWith("/") || n.startsWith("//") || /[\u0000-\u001f\u007f\\]/.test(n)) return "/";
  try {
    if (new URL(n, HERE).origin !== HERE) return "/";
  } catch {
    return "/";
  }
  return n;
}

/**
 * What came back instead of a code, kept FOR THE LOG and never for the page.
 *
 * Supabase returns a refusal as three query fields -- `error`, `error_code`
 * and `error_description` -- and the last two are the only place the reason
 * is ever said: "Unable to exchange external code" is a wrong client secret,
 * "Signups not allowed" is a console switch, `access_denied` is a person who
 * pressed Cancel. This used to read `error` alone and drop the rest, so seven
 * sign-ins failed in production inside a week and nothing on this side could
 * say why. The page still says one neutral sentence; the log says which.
 *
 * Clipped, because a query string is written by whoever builds the link.
 */
interface CallbackRefusal {
  error: string;
  code: string | null;
  description: string | null;
}

interface CallbackPlan {
  /** The code to exchange for a session, or null when there is nothing to exchange. */
  exchange: string | null;
  /** Where the browser goes: the asked-for page after a code; sign-in when there was none, saying why when the provider said. */
  to: string;
  /** The provider's refusal, when there was one: what the route logs. */
  refused: CallbackRefusal | null;
}

export function callbackPlan(q: {
  code: string | null;
  next: string | null;
  error: string | null;
  errorCode?: string | null;
  errorDescription?: string | null;
}): CallbackPlan {
  if (q.error)
    return {
      exchange: null,
      to: OAUTH_FAILED,
      refused: {
        error: lineOrNull(q.error) ?? "unknown",
        code: lineOrNull(q.errorCode),
        description: lineOrNull(q.errorDescription),
      },
    };
  if (!q.code) return { exchange: null, to: "/login", refused: null };
  return { exchange: q.code, to: safeNext(q.next), refused: null };
}

/**
 * Where a browser whose code exchanged lands: where the plan said, unless the account has an authenticator its new
 * session has not shown (decision 0013). Google is the first factor, never the second, so that session shows its code
 * on the second step's page before it lands anywhere, and goes on from there with what the plan carried: the workspace
 * the link named and its route (`/verify?w=acme#/inbox/th-1`), read back from the plan's landing by the one reader the
 * password's and the code's landing use on the sign-in page's address (sign-in-return.ts signInReturnOf), so the
 * workspace is checked as a workspace's name and nothing else of the query rides on. It used to go to the second step
 * alone, and the member landed on the home of the workspace this browser used last, not on the link they followed. An
 * assurance level that could not be read lands as planned: the partner door asks again.
 */
export function landingAfter(to: string, aal: AssuranceLevels | null | undefined): string {
  if (!factorStepNeeded(aal)) return to;
  // safeNext again, since anyone may call this: a path on this site, which a URL always parses.
  return SECOND_FACTOR_PATH + signInReturnOf(new URL(safeNext(to), HERE));
}
