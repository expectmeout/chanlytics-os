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
import { refusalOf, type Refusal } from "@chanlytics/contracts";
import type { InputOf, OutputOf } from "../server/route";
import { ROUTES, type Routes } from "./routes.generated";

export type RouteKey = keyof Routes;
type ParamNames<S extends string> = S extends `${string}[${infer P}]${infer Rest}` ? P | ParamNames<Rest> : never;
export type Params<K extends RouteKey> = Record<ParamNames<K>, string>;
/** What a route takes and answers, by key: for a courier that types its own parameters by the route's. */
export type Input<K extends RouteKey> = InputOf<Routes[K]>;
export type Output<K extends RouteKey> = OutputOf<Routes[K]>;
type MethodOf<K extends RouteKey> = (typeof ROUTES)[K]["method"];
/** A read's query, as its schema declares it; a write has none. */
type QueryOf<K extends RouteKey> = MethodOf<K> extends "GET" ? InputOf<Routes[K]> : never;
/** A write's body: the declared schema, or anything JSON for a route that reads its own. */
type BodyOf<K extends RouteKey> =
  MethodOf<K> extends "GET" ? never : InputOf<Routes[K]> extends undefined ? unknown : InputOf<Routes[K]>;

export interface ApiOptions<K extends RouteKey> {
  params?: Params<K>;
  query?: QueryOf<K>;
  body?: BodyOf<K>;
  /** For the reply: the same key on a retry means the same message, never a second one. */
  idempotencyKey?: string;
  /** The Ask palette commits through the same routes a button does; the ledger keeps that a card was tapped. */
  via?: "ask";
  /** An undo names the decision it reverses (its id, from the commit's receipt); the ledger links the two rows. */
  undoOf?: string;
  timeoutMs?: number;
  /**
   * After a 2xx: re-read the surfaces the map names, and answer once they have landed (the default); a bulk verb
   * passes false and re-reads once at its end. "behind" re-reads them all the same but answers when the server
   * accepts: for an act in a list somebody is working down, where the row has already shown what happened and the
   * next press should not wait for two reads. A re-read that fails behind a write is the surface's own to say.
   */
  refresh?: boolean | "behind";
  /**
   * Fired the moment the server accepts, before the surfaces are re-read, with what it answered: a form can say
   * "saved", and an approve what it scheduled, without waiting for every re-read.
   */
  onAccepted?: (data: OutputOf<Routes[K]>) => void;
}

/**
 * A refusal as a page reads it: the code and status, a title that says what
 * kind of no it is, the sentence in the owner's words, the wait the server
 * counted and a form's fields (contracts refusalOf).
 */
export type ApiRefusal = { ok: false } & Refusal;
export type ApiResult<O> = { ok: true; data: O } | ApiRefusal;
type Envelope =
  { ok: true; data: unknown } | { ok: false; error?: { code?: string; message?: string; details?: unknown } };

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
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
  /**
   * A choose_workspace: the server could not tell which workspace this request
   * meant — the tab named none, or one this account no longer belongs to. The
   * bridge forgets its choice and boots again, asking /workspaces first.
   */
  onChooseWorkspace?: () => void;
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
  // `kept`: settled, answered, and held (holdAnswers) -- shared whatever its age until the hold is let go.
  const inFlight = new Map<string, { p: Promise<unknown>; at: number; kept?: boolean }>();
  let holds = 0;

  function urlFor<K extends RouteKey>(key: K, opts: ApiOptions<K> = {} as ApiOptions<K>): string {
    const params = (opts.params ?? {}) as Record<string, string>;
    const url = ROUTES[key].path.replace(/\[(\w+)\]/g, (_m, name: string) => encodeURIComponent(params[name] ?? ""));
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries((opts.query ?? {}) as Record<string, unknown>))
      if (v !== undefined && v !== null) qs.set(k, String(v));
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
    if (opts.undoOf) headers["x-undo-of"] = opts.undoOf;
    return {
      method,
      headers,
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
      signal: AbortSignal.timeout(opts.timeoutMs ?? (method === "GET" ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS)),
    };
  }

  async function send<K extends RouteKey>(
    key: K,
    opts: ApiOptions<K> = {} as ApiOptions<K>,
  ): Promise<ApiResult<OutputOf<Routes[K]>>> {
    const isRead = ROUTES[key].method === "GET";
    const url = urlFor(key, opts);
    if (isRead) {
      const hit = inFlight.get(url);
      if (hit && (hit.kept || now() - hit.at < INFLIGHT_MS)) return hit.p as Promise<ApiResult<OutputOf<Routes[K]>>>;
    }
    const p = (async (): Promise<ApiResult<OutputOf<Routes[K]>>> => {
      let res: Response;
      try {
        res = await deps.fetch(url, initFor(key, opts));
      } catch (e) {
        // A request that never left changed nothing; one that timed out may
        // still be doing its work on the server, and a write must not be told
        // otherwise.
        const name = (e as { name?: unknown } | null)?.name;
        const timedOut = name === "TimeoutError" || name === "AbortError";
        return { ok: false, ...refusalOf({ code: timedOut ? "timeout" : "network", status: 0, write: !isRead }) };
      }
      if (res.status === 401) {
        deps.onSignedOut();
        return { ok: false, ...refusalOf({ code: "unauthorized", status: 401, write: !isRead }) };
      }
      const j = (await res.json().catch(() => null)) as Envelope | null;
      if (!j || !j.ok) {
        const e = j && !j.ok ? j.error : undefined;
        if (e?.code === "choose_workspace") deps.onChooseWorkspace?.();
        // The server's code, sentence and details, and the header a limit sets:
        // what a page shows and when it may try again, in the owner's words.
        return {
          ok: false,
          ...refusalOf({
            code: e?.code,
            status: res.status,
            message: e?.message,
            details: e?.details,
            retryAfter: res.headers.get("retry-after"),
            write: !isRead,
            nowMs: now(),
          }),
        };
      }
      if (!isRead) {
        opts.onAccepted?.(j.data as OutputOf<Routes[K]>);
        // Something changed. A read still in flight was issued before that
        // change and cannot describe the world the operator is now in; sharing
        // it with the refresh that follows would repaint the thread as it was.
        forget();
        if (opts.refresh === "behind") void deps.refresh(key).catch(() => {});
        else if (opts.refresh !== false) await deps.refresh(key);
      }
      return { ok: true, data: j.data as OutputOf<Routes[K]> };
    })();
    if (isRead) {
      // A refusal must not be shared beyond its burst, and neither is an answer unless answers are held: drop the
      // entry as it settles, or keep it for whoever asks next while the hold lasts.
      const entry: { p: Promise<unknown>; at: number; kept?: boolean } = { p, at: now() };
      inFlight.set(url, entry);
      p.then(
        (r) => {
          if (inFlight.get(url) !== entry) return;
          if (holds > 0 && r.ok) entry.kept = true;
          else inFlight.delete(url);
        },
        () => {
          if (inFlight.get(url) === entry) inFlight.delete(url);
        },
      );
    }
    return p;
  }

  /**
   * Hold every answer until the returned release: a read that asks after an identical one has settled shares its
   * answer rather than asking again. The boot, where the surfaces read the same lists in turn -- the runner holds
   * from its first read to its last, before the live feed is joined, so no change can land inside the hold unheard.
   * A write still forgets everything held. Releasing twice is releasing once.
   */
  function holdAnswers(): () => void {
    holds += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      holds -= 1;
      if (holds === 0) for (const [url, e] of inFlight) if (e.kept) inFlight.delete(url);
    };
  }

  /** The Response itself: the two Google redirects and the Ask stream answer no envelope. */
  async function raw<K extends RouteKey>(key: K, opts: ApiOptions<K> = {} as ApiOptions<K>): Promise<Response> {
    const res = await deps.fetch(urlFor(key, opts), initFor(key, opts));
    if (res.status === 401) deps.onSignedOut();
    return res;
  }

  /** Forget every read in flight: after a write, or when a courier that has not moved yet made one. */
  function forget(): void {
    inFlight.clear();
  }

  return Object.assign(send, { raw, url: urlFor, forget, holdAnswers });
}

export type Api = ReturnType<typeof createApi>;
