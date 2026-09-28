/**
 * The one way the browser talks to /api/v1.
 *
 * Every request names a route key from the generated registry, and the
 * compiler knows from it what the route takes (`InputOf`) and answers
 * (`OutputOf`), so a site that hand-typed the server's answer, sent a body
 * the route never read, or left out the path's parameters or the body the
 * route declares, stops compiling. Eleven couriers used to each own the
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
/**
 * What a request may not leave out: its path's parameters, when it has any (without them it would ask for
 * `conversations//snooze`), and the body its write's schema declares, even one whose every field is optional (the
 * route reads a missing body as `{}`, which a schema that needs a field refuses).
 */
type Needs<K extends RouteKey> = ([ParamNames<K>] extends [never] ? unknown : { params: Params<K> }) &
  (unknown extends BodyOf<K> ? unknown : [BodyOf<K>] extends [never] ? unknown : { body: BodyOf<K> });
export type ApiOptions<K extends RouteKey> = Options<K> & Needs<K>;
/**
 * The options argument: optional for a route that needs neither, and written for one that needs either. A courier
 * that takes options optionally and hands them on (the shell's `read`) may hand on `undefined`: its own signature
 * is then what holds its callers.
 */
type OptionsOf<K extends RouteKey> =
  Record<never, never> extends Needs<K> ? [opts?: ApiOptions<K>] : [opts: ApiOptions<K> | undefined];

/** What a request may carry. A link (`url`) takes it as it is given: the shell's `href` hands on a page's. */
interface Options<K extends RouteKey> {
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
   * "saved", and an approve what it scheduled, without waiting for every re-read; and a write that follows can build
   * on the answer (the settings save's `{ config, version }`) instead of on a read that is about to be replaced.
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

interface ApiDeps {
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
  /**
   * An mfa_required (0013): the request acted from a partner's seat, or as the partner account, on a session that has
   * not shown its second factor. The bridge sends the tab to the second step.
   */
  onSecondFactor?: () => void;
  /** After a 2xx write: which surfaces to re-read, by the refresh map. */
  refresh: (key: RouteKey) => Promise<void>;
  now?: () => number;
  /**
   * A response the document head started for this exact URL (contracts routePrefetchScript), handed over once: the
   * read takes it in place of its own fetch. Null for a URL the head did not start.
   */
  prefetched?: (url: string) => Promise<Response> | null;
}

/** Identical reads inside this window share one request: three overrides asking for the same list at boot. */
const INFLIGHT_MS = 2_000;
/**
 * A read the document head started (`prefetched`) is shared this long from when it was taken: the page it was
 * started for mounts a second or two later on a fast desktop and longer on a phone, and its own read of the same
 * URL should find the head's answer, not ask again. Short enough that nothing a person does in the meantime is
 * answered from it; a write clears every held read anyway (forget).
 */
const PREFETCH_SHARE_MS = 10_000;
const READ_TIMEOUT_MS = 15_000;
const WRITE_TIMEOUT_MS = 30_000;

/** A refusal whose fix is somewhere else in the app: which workspace (choose_workspace), or the second step. */
function heard(deps: ApiDeps, code: string | undefined): void {
  if (code === "choose_workspace") deps.onChooseWorkspace?.();
  if (code === "mfa_required") deps.onSecondFactor?.();
}

export function createApi(deps: ApiDeps) {
  const now = deps.now ?? (() => Date.now());
  // `kept`: settled, answered, and held (holdAnswers) -- shared whatever its age until the hold is let go.
  const inFlight = new Map<string, { p: Promise<unknown>; at: number; kept?: boolean; early?: boolean }>();
  let holds = 0;

  function urlFor<K extends RouteKey>(key: K, opts: Options<K> = {}): string {
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
    ...[opts = {} as ApiOptions<K>]: OptionsOf<K>
  ): Promise<ApiResult<OutputOf<Routes[K]>>> {
    const isRead = ROUTES[key].method === "GET";
    const url = urlFor(key, opts);
    if (isRead) {
      const hit = inFlight.get(url);
      if (hit && (hit.kept || now() - hit.at < (hit.early ? PREFETCH_SHARE_MS : INFLIGHT_MS)))
        return hit.p as Promise<ApiResult<OutputOf<Routes[K]>>>;
    }
    // What the head started for this URL, else the read's own fetch; a prefetch that failed is asked again.
    const early = isRead ? (deps.prefetched?.(url) ?? null) : null;
    const p = (async (): Promise<ApiResult<OutputOf<Routes[K]>>> => {
      let res: Response;
      try {
        res = early
          ? await early.catch(() => deps.fetch(url, initFor(key, opts)))
          : await deps.fetch(url, initFor(key, opts));
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
        heard(deps, e?.code);
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
      const entry: { p: Promise<unknown>; at: number; kept?: boolean; early?: boolean } = {
        p,
        at: now(),
        early: !!early,
      };
      inFlight.set(url, entry);
      p.then(
        (r) => {
          if (inFlight.get(url) !== entry) return;
          if (holds > 0 && r.ok) entry.kept = true;
          else if (!(entry.early && r.ok)) inFlight.delete(url);
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
  async function raw<K extends RouteKey>(key: K, ...[opts = {} as ApiOptions<K>]: OptionsOf<K>): Promise<Response> {
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
