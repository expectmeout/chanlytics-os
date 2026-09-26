/**
 * The shell's own calls to /api/v1 (decision 0011): the page in front hands over the session's access token on
 * request, the call carries it as a bearer, and the site's envelope becomes data or a refusal in the site's words.
 * The token lives in the shell's state only, for as long as the page said it would; a call that finds it stale, or
 * that the site answers 401, asks the page once more. The pure parts (staleness, the route's id, the envelope) are
 * apart from the wire so a test runs them.
 */
import { getState, setState } from "./state";
import { front } from "./front";
import { SITE_ORIGIN } from "@/site";
import { ApiRefusal, isFresh, TOKEN_WAIT_MS, unwrap, type Access } from "./api-pure";

export { ApiRefusal, isFresh, threadIdOf, unwrap, TOKEN_MARGIN_S, TOKEN_WAIT_MS, type Access } from "./api-pure";

const waiters = new Set<(a: Access | null) => void>();

/** Called by the Surface when the page answers a token ask. */
export function tokenArrived(access: Access | null): void {
  waiters.forEach((w) => w(access));
  waiters.clear();
}

function askPageForToken(): Promise<Access | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      waiters.delete(done);
      resolve(null);
    }, TOKEN_WAIT_MS);
    const done = (a: Access | null) => {
      clearTimeout(timer);
      resolve(a);
    };
    waiters.add(done);
    front.ask({ t: "token" });
  });
}

async function accessToken(force = false): Promise<string | null> {
  const held = getState().access;
  if (!force && isFresh(held, Date.now())) return held!.token;
  const fresh = await askPageForToken();
  if (fresh) setState({ access: fresh });
  return fresh?.token ?? null;
}

export interface ApiInit {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, string | undefined>;
  body?: unknown;
  idempotencyKey?: string;
}

/** One call to /api/v1/<path>, as the person signed in. Throws ApiRefusal in the site's words. */
export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  const url = new URL(`${SITE_ORIGIN}/api/v1/${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) if (v !== undefined) url.searchParams.set(k, v);
  const once = async (token: string) => {
    const headers: Record<string, string> = { accept: "application/json", authorization: `Bearer ${token}` };
    if (init.body !== undefined) headers["content-type"] = "application/json";
    if (init.idempotencyKey) headers["idempotency-key"] = init.idempotencyKey;
    const r = await fetch(url.toString(), {
      method: init.method ?? "GET",
      headers,
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      cache: "no-store",
    });
    let body: unknown = null;
    try {
      body = await r.json();
    } catch {
      /* an empty or non-JSON answer is a refusal below */
    }
    return { status: r.status, body };
  };
  let token = await accessToken();
  if (!token) throw new ApiRefusal("unauthorized", "Sign in required.", 401);
  let answer = await once(token);
  if (answer.status === 401) {
    // The page may hold a newer token than it last said: once more, then the refusal stands.
    token = await accessToken(true);
    if (token) answer = await once(token);
  }
  return unwrap<T>(answer.status, answer.body);
}
