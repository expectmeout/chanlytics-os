/**
 * The one way the browser talks to /api/v1.
 *
 * Every request names a route key from the generated registry, and the
 * compiler knows from it what the route takes (`InputOf`) and answers
 * (`OutputOf`), so a site that hand-typed the server's answer, or sent a body
 * the route never read, stops compiling. Eleven couriers used to each own the
 * envelope, the 401, the timeout and their own list of surfaces to refresh;
 * this owns them once. Pure: no `window`, so it runs under node with a fake
 * fetch, and the bridge instantiates it with the real one.
 */
import type { InputOf, OutputOf } from "../server/route";
import { ROUTES, type Routes } from "./routes.generated";

export type RouteKey = keyof Routes;
type ParamNames<S extends string> = S extends `${string}[${infer P}]${infer Rest}` ? P | ParamNames<Rest> : never;
export type Params<K extends RouteKey> = Record<ParamNames<K>, string>;
type MethodOf<K extends RouteKey> = (typeof ROUTES)[K]["method"];
/** A read's query, as its schema declares it; a write has none. */
type QueryOf<K extends RouteKey> = MethodOf<K> extends "GET" ? InputOf<Routes[K]> : never;
/** A write's body: the declared schema, or anything JSON for a route that reads its own. */
type BodyOf<K extends RouteKey> = MethodOf<K> extends "GET" ? never : InputOf<Routes[K]> extends undefined ? unknown : InputOf<Routes[K]>;

export interface ApiOptions<K extends RouteKey> {
  params?: Params<K>;
  query?: QueryOf<K>;
  body?: BodyOf<K>;
  /** For the reply: the same key on a retry means the same message, never a second one. */
  idempotencyKey?: string;
  /** The Ask palette commits through the same routes a button does; the ledger keeps that a card was tapped. */
  via?: "ask";
  timeoutMs?: number;
}

export type ApiResult<O> = { ok: true; data: O } | { ok: false; code: string; status: number; message: string };
type Envelope = { ok: true; data: unknown } | { ok: false; error?: { code?: string; message?: string } };

export class ApiError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

/** The data, or the refusal thrown: for the overrides, whose failure is "stay seeded". */
export function unwrap<O>(r: ApiResult<O>): O {
  if (r.ok) return r.data;
  throw new ApiError(r.code, r.status, r.message);
}

export interface ApiDeps {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  /** The workspace this tab holds; appended as ?workspace= unless the caller named one. */
  workspace: () => string | null;
  /** A 401: the session is gone. The bridge clears the cache and goes to /login. */
  onSignedOut: () => void;
  /** After a 2xx write, before the refresh: nothing in flight can describe the world any more. */
  invalidate: () => void;
  /** After a 2xx write: which surfaces to re-read, by the refresh map. */
  refresh: (key: RouteKey) => Promise<void>;
  now?: () => number;
}

/** Identical reads inside this window share one request: three overrides asking for the same list at boot. */
const INFLIGHT_MS = 2_000;
const READ_TIMEOUT_MS = 15_000;
const WRITE_TIMEOUT_MS = 30_000;

export function createApi(deps: ApiDeps) {
  const now = deps.now ?? (() => Date.now());
  const inFlight = new Map<string, { p: Promise<unknown>; at: number }>();

  function urlFor<K extends RouteKey>(key: K, opts: ApiOptions<K>): string {
    const params = (opts.params ?? {}) as Record<string, string>;
    const url = ROUTES[key].path.replace(/\[(\w+)\]/g, (_m, name: string) => encodeURIComponent(params[name] ?? ""));
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries((opts.query ?? {}) as Record<string, unknown>)) if (v !== undefined && v !== null) qs.set(k, String(v));
    const ws = deps.workspace();
    if (ws && !qs.has("workspace")) qs.set("workspace", ws);
    const q = qs.toString();
    return q ? `${url}?${q}` : url;
  }

  function initFor<K extends RouteKey>(key: K, opts: ApiOptions<K>): RequestInit {
    const { method } = ROUTES[key];
    const headers: Record<string, string> = {};
    if (opts.body !== undefined) headers["content-type"] = "application/json";
    if (opts.idempotencyKey) headers["idempotency-key"] = opts.idempotencyKey;
    if (opts.via) headers["x-via"] = opts.via;
    return {
      method,
      headers,
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
      signal: AbortSignal.timeout(opts.timeoutMs ?? (method === "GET" ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS)),
    };
  }

  async function send<K extends RouteKey>(key: K, opts: ApiOptions<K> = {} as ApiOptions<K>): Promise<ApiResult<OutputOf<Routes[K]>>> {
    const isRead = ROUTES[key].method === "GET";
    const url = urlFor(key, opts);
    if (isRead) {
      const hit = inFlight.get(url);
      if (hit && now() - hit.at < INFLIGHT_MS) return hit.p as Promise<ApiResult<OutputOf<Routes[K]>>>;
    }
    const p = (async (): Promise<ApiResult<OutputOf<Routes[K]>>> => {
      let res: Response;
      try {
        res = await deps.fetch(url, initFor(key, opts));
      } catch {
        return { ok: false, code: "network", status: 0, message: isRead ? "Chanlytics could not be reached." : "Network error — nothing was changed." };
      }
      if (res.status === 401) {
        deps.onSignedOut();
        return { ok: false, code: "unauthorized", status: 401, message: "Signed out." };
      }
      const j = (await res.json().catch(() => null)) as Envelope | null;
      if (!j || !j.ok) {
        const e = j && !j.ok ? j.error : undefined;
        return { ok: false, code: e?.code ?? "internal", status: res.status, message: e?.message ?? `Request failed (${res.status}).` };
      }
      if (!isRead) {
        deps.invalidate();
        await deps.refresh(key);
      }
      return { ok: true, data: j.data as OutputOf<Routes[K]> };
    })();
    if (isRead) {
      // A rejection must not be shared beyond its burst: drop the entry as it settles.
      inFlight.set(url, { p, at: now() });
      p.finally(() => { if (inFlight.get(url)?.p === p) inFlight.delete(url); }).catch(() => {});
    }
    return p;
  }

  /** The Response itself: the two Google redirects and the Ask stream answer no envelope. */
  async function raw<K extends RouteKey>(key: K, opts: ApiOptions<K> = {} as ApiOptions<K>): Promise<Response> {
    const res = await deps.fetch(urlFor(key, opts), initFor(key, opts));
    if (res.status === 401) deps.onSignedOut();
    return res;
  }

  return Object.assign(send, { raw, url: urlFor });
}

export type Api = ReturnType<typeof createApi>;
