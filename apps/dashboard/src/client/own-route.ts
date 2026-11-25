/**
 * A page's call to one of the dashboard's own routes that the typed client does not hold. The member's routes go through
 * the API client (client/api.ts, by key, under the session: bridge/api.ts `api()`); these are the rest: the doors a
 * stranger may knock on with no session (sign-up, a lead's own preview) and the deployment's version a tab checks.
 * Same-origin, the answer's JSON read, never thrown: no answer at all is status 0, and the page says what that means.
 * Every call a page makes to its own server goes through one of the two (layer 12, 25 Nov 2026); before it, each of
 * these pages wrote its own fetch and read its answer its own way.
 */

/** What the route answered: its status (0 when no answer came), whether it was a yes, and its JSON (null when none). */
interface OwnRouteAnswer<T> {
  status: number;
  ok: boolean;
  json: T | null;
}

/** What a page sends: a read, or a post with its body. */
interface OwnRouteCall {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  cache?: RequestCache;
}

/**
 * Ask one of the dashboard's own routes, by its path. `T` is what the page reads the JSON as, said where the page
 * reads it, as its own fetch said it before. A test hands in its own fetch.
 */
export async function askOwnRoute<T = unknown>(
  path: `/api/${string}`,
  call: OwnRouteCall = {},
  deps: { fetch?: typeof fetch } = {},
): Promise<OwnRouteAnswer<T>> {
  let res: Response;
  try {
    res = await (deps.fetch ?? globalThis.fetch)(path, call);
  } catch {
    // No answer at all: offline, or the request never left. The page says what that means for it.
    return { status: 0, ok: false, json: null };
  }
  // An answer that is not JSON is none: its status says the rest. What it holds is read as the page says it reads it:
  // the trust each page once wrote at its own read, written here once.
  const json: unknown = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, json: json as T | null };
}
