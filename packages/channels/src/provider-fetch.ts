/**
 * The one way a call leaves for a provider (Meta, Twilio, Retell, Resend, Google, Apify, Expo, Anthropic, TypeSafe): bounded, never
 * throwing, and said as one of four outcomes a caller can act on without reading the provider's answer itself.
 *
 * Before it, each adapter had its own fetch. Sixteen calls had no bound at all, and one hung connection held a
 * webhook's whole invocation. A network fault surfaced three ways: thrown (Twilio, Retell's writes), returned as
 * status 0 (WhatsApp), or read as "timeout" (email). And only email's timeout was ever marked as a send whose outcome
 * nobody knows (the scorecard, 26 and 28 September 2026).
 *
 * SendOutcome, what the call came to:
 *   ok         a 2xx.
 *   refused    the provider answered no (a 4xx but 408 and 429): asking again gets the same answer.
 *   retryable  nothing was done, and asking again later may work: 408 and 429 (the provider said "not now"), a
 *              connection that never opened, or this provider's breaker open. A send with this outcome provably did
 *              not leave.
 *   unknown    it may have been done: a timeout, a connection dropped after the request left, or a 5xx (a 503 from
 *              a gateway proves nothing about the service behind it). A send with this outcome is never sent again
 *              blind; its receipt may still settle it.
 *
 * Retry by outcome: a call asks again, up to `tries`, only when asking again cannot do the work twice. That is a
 * `retryable` answer always, and an `unknown` one only for an `idempotent` call (a read, or a write the provider
 * dedupes by a key). A try that used its whole bound is not tried again: the time is the caller's. The wait is the
 * provider's Retry-After when it gives one, else a short backoff, all inside `deadlineMs`.
 *
 * The breaker, one per provider in this instance: after BREAKER_FAILURES calls in a row that got no answer or a 5xx,
 * calls to that provider are not made for BREAKER_OPEN_MS and come back `retryable` with `breaker_open`. A dead
 * provider then costs each caller nothing instead of its whole timeout. The first call after the pause is let
 * through (and whatever else asks at that moment); its answer closes the breaker, or opens it again. A refusal, a
 * 408 or a 429 is the provider answering, never a fault. The state lives in the instance: each serverless instance
 * learns an outage for itself. A call that puts words in front of a person (`breaker: "count"`: a WhatsApp or SMS
 * send, an email, an alert) is always made, and only counts toward the breaker: a reply is never failed on the
 * strength of another call's timeouts.
 *
 * A breaker that opens says so (`breaker_open`, with the provider and the faults that opened it) and so does one
 * that closes again (`breaker_closed`), and `/api/diag` reads each provider's state (`breakerStates`). It opened in
 * silence before: during an outage the only trace was each caller's own failure words. The state is one per process,
 * however many copies of this module the builds inlined (core's, jobs', the edge's own), so what the diagnostic reads
 * is what a send was held by.
 */
import { logger } from "./log/logger";

/** Every provider a call leaves for: the breaker keeps one state per name. */
export const PROVIDER_NAMES = [
  "meta",
  "twilio",
  "retell",
  "resend",
  "google",
  "apify",
  "expo",
  "anthropic",
  "typesafe",
] as const;
export type Provider = (typeof PROVIDER_NAMES)[number];

/** What a call to a provider came to (the header says each). */
export type SendOutcome = "ok" | "refused" | "retryable" | "unknown";

export interface ProviderReply {
  outcome: SendOutcome;
  /** The HTTP status, or 0 when no answer came. */
  status: number;
  /** The answer's body as text ("" when none). */
  text: string;
  /** The body parsed as JSON, or null. */
  json: unknown;
  /** A 2xx answer's body, unread, when the call asked for it (`stream`); null otherwise. */
  body: ReadableStream<Uint8Array> | null;
  headers: Headers | null;
  /** How long the provider asked us to wait (Retry-After), in ms, when it said. */
  retryAfterMs: number | null;
  /** Why no answer came: "timeout", "breaker_open", or the network's own words. Null when one came. */
  error: string | null;
  /** How many requests left: 0 when the breaker held the call. */
  tries: number;
}

export interface ProviderCall extends Omit<RequestInit, "signal"> {
  /** Each try's bound. Required: a call to a provider without one is the fault this module ends. */
  timeoutMs: number;
  /** Tries in all, the first included (1, no retry, unless said). */
  tries?: number;
  /** Asking again cannot do the work twice: a read, or a write under the provider's idempotency key. */
  idempotent?: boolean;
  /** The longest the whole call may take, its retries and waits included. */
  deadlineMs?: number;
  /** "count": always made, its faults counted, never held by an open breaker (a send to a person). Default "hold". */
  breaker?: "hold" | "count";
  /** The caller's own end, beside each try's bound: a call it abandons ends as a timeout does. */
  signal?: AbortSignal;
  /**
   * Hand a 2xx answer's body back unread (`body`), for a caller that forwards it as it arrives (a model's event
   * stream). Each try's bound still ends the body; any other answer is read as usual.
   */
  stream?: boolean;
}

/** What a test hands in instead of the network and the clock. */
interface ProviderDeps {
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/** Calls in a row with no answer or a 5xx that open a provider's breaker. */
const BREAKER_FAILURES = 5;
/** How long an open breaker holds a provider's calls before one is let through. */
const BREAKER_OPEN_MS = 30_000;
/** The first retry's wait when the provider named none; each further one doubles it. */
const RETRY_BASE_MS = 250;
/** The longest a call waits before asking again: a longer Retry-After is the caller's to honour, not this call's. */
const RETRY_WAIT_CAP_MS = 2_000;

interface Breaker {
  failures: number;
  openUntil: number;
}
/** One state for the process: a registered symbol, so every inlined copy of this module reads and writes the same. */
const BREAKER_SLOT: unique symbol = Symbol.for("chanlytics.provider-breakers");
interface Breakers {
  held: Map<Provider, Breaker>;
  /** How many times each provider's breaker has opened in this instance, kept when it closes: the outage's count. */
  opened: Map<Provider, number>;
}
const breakerHolder = globalThis as { [BREAKER_SLOT]?: Breakers };
const breakers: Breakers = (breakerHolder[BREAKER_SLOT] ??= { held: new Map(), opened: new Map() });
const breakerMap = breakers.held;
const breakerLog = logger();

/** A provider's breaker as it stands: what a report of the platform's health, or a test, reads. */
export function breakerOf(provider: Provider, now = Date.now()): { open: boolean; failures: number } {
  const b = breakerMap.get(provider);
  return { open: !!b && b.openUntil > now, failures: b?.failures ?? 0 };
}

/** Every provider's breaker as it stands in this instance, and until when an open one holds: what /api/diag says. */
export function breakerStates(
  now = Date.now(),
): { provider: Provider; open: boolean; failures: number; opened: number; open_until: string | null }[] {
  return PROVIDER_NAMES.map((provider) => {
    const b = breakerMap.get(provider);
    const open = !!b && b.openUntil > now;
    return {
      provider,
      open,
      failures: b?.failures ?? 0,
      opened: breakers.opened.get(provider) ?? 0,
      open_until: open ? new Date(b.openUntil).toISOString() : null,
    };
  });
}

/** Every breaker closed: for a test, which must not inherit the last test's outage. */
export function resetBreakers(): void {
  breakerMap.clear();
  breakers.opened.clear();
}

/** The network's codes for a connection that never opened: the request never left, so nothing was done. */
const NEVER_LEFT = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
]);

/** What a status says was done: the header's table. */
function outcomeOfStatus(status: number): SendOutcome {
  if (status >= 200 && status < 300) return "ok";
  if (status === 408 || status === 429) return "retryable";
  if (status >= 500) return "unknown";
  return "refused";
}

/** What a thrown fetch says was done: a timeout or a dropped connection may have been taken; a refused one was not. */
function outcomeOfThrow(e: unknown): { outcome: SendOutcome; error: string } {
  const err = e instanceof Error ? e : new Error(String(e));
  if (err.name === "TimeoutError" || err.name === "AbortError") return { outcome: "unknown", error: "timeout" };
  const cause = (err as { cause?: { code?: unknown } }).cause;
  const code = typeof cause?.code === "string" ? cause.code : (err as { code?: unknown }).code;
  const words =
    typeof cause === "object" && cause && "message" in cause ? `${err.message}: ${String(cause.message)}` : err.message;
  return { outcome: typeof code === "string" && NEVER_LEFT.has(code) ? "retryable" : "unknown", error: words };
}

/** A Retry-After header, in seconds or as a date, as ms from now; null when absent or unreadable. */
function retryAfterOf(header: string | null, now = Date.now()): number | null {
  if (!header) return null;
  const secs = Number(header);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(header);
  return Number.isFinite(at) ? Math.max(0, at - now) : null;
}

/** Whether an answer is the provider's fault (it opens the breaker), rather than its word. */
const isFault = (a: { status: number; error: string | null }): boolean =>
  (a.status === 0 && a.error !== "breaker_open") || a.status >= 500;

function note(provider: Provider, a: ProviderReply, now: number): void {
  if (a.error === "breaker_open") return;
  const b = breakerMap.get(provider);
  if (!isFault(a)) {
    // An answer closes the breaker. One that had opened says so: the outage it held calls through is over.
    if (b && b.openUntil > 0) breakerLog.info("breaker_closed", { provider, failures: b.failures });
    breakerMap.delete(provider);
    return;
  }
  const next = b ?? { failures: 0, openUntil: 0 };
  const wasOpen = next.openUntil > now;
  next.failures += 1;
  if (next.failures >= BREAKER_FAILURES) {
    next.openUntil = now + BREAKER_OPEN_MS;
    // Opened, or opened again after the pause's first call faulted too: either way calls are held from now.
    if (!wasOpen) {
      breakers.opened.set(provider, (breakers.opened.get(provider) ?? 0) + 1);
      breakerLog.warn("breaker_open", {
        provider,
        failures: next.failures,
        status: a.status,
        error: a.error,
        open_ms: BREAKER_OPEN_MS,
      });
    }
  }
  breakerMap.set(provider, next);
}

async function once(provider: Provider, url: string, call: ProviderCall, deps: Required<ProviderDeps>, tries: number) {
  const now = deps.now();
  const b = breakerMap.get(provider);
  if (b && b.openUntil > now && call.breaker !== "count") {
    const held: ProviderReply = {
      outcome: "retryable",
      status: 0,
      text: "",
      json: null,
      body: null,
      headers: null,
      retryAfterMs: b.openUntil - now,
      error: "breaker_open",
      tries: tries - 1,
    };
    return held;
  }
  const init: RequestInit = {
    method: call.method,
    headers: call.headers,
    body: call.body,
    cache: call.cache,
    redirect: call.redirect,
  };
  let a: ProviderReply;
  const bound = AbortSignal.timeout(call.timeoutMs);
  try {
    const r = await deps.fetch(url, { ...init, signal: call.signal ? AbortSignal.any([bound, call.signal]) : bound });
    if (call.stream && r.ok && r.body) {
      a = {
        outcome: "ok",
        status: r.status,
        text: "",
        json: null,
        body: r.body,
        headers: r.headers,
        retryAfterMs: null,
        error: null,
        tries,
      };
      note(provider, a, deps.now());
      return a;
    }
    // Read inside the bound: a body that stalls past it is no answer at all, as a request that did.
    const text = await r.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    a = {
      outcome: outcomeOfStatus(r.status),
      status: r.status,
      text,
      json,
      body: null,
      headers: r.headers,
      retryAfterMs: retryAfterOf(r.headers.get("retry-after"), deps.now()),
      error: null,
      tries,
    };
  } catch (e) {
    const { outcome, error } = outcomeOfThrow(e);
    a = { outcome, status: 0, text: "", json: null, body: null, headers: null, retryAfterMs: null, error, tries };
  }
  note(provider, a, deps.now());
  return a;
}

/** One call to a provider, bounded, never thrown, retried only when asking again cannot do the work twice. */
export async function providerFetch(
  provider: Provider,
  url: string,
  call: ProviderCall,
  deps: ProviderDeps = {},
): Promise<ProviderReply> {
  const d: Required<ProviderDeps> = {
    fetch: deps.fetch ?? globalThis.fetch,
    now: deps.now ?? Date.now,
    sleep: deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
  };
  const started = d.now();
  const max = Math.max(1, Math.floor(call.tries ?? 1));
  for (let n = 1; ; n++) {
    const a = await once(provider, url, call, d, n);
    const again = a.outcome === "retryable" || (a.outcome === "unknown" && call.idempotent === true);
    if (!again || n >= max || a.error === "breaker_open" || a.error === "timeout") return a;
    // A provider that asks for longer than a call may wait is asked again by its caller, later, not now.
    if (a.retryAfterMs !== null && a.retryAfterMs > RETRY_WAIT_CAP_MS) return a;
    const wait = a.retryAfterMs ?? RETRY_BASE_MS * 2 ** (n - 1);
    const left = call.deadlineMs === undefined ? Infinity : call.deadlineMs - (d.now() - started);
    if (wait + call.timeoutMs > left) return a;
    await d.sleep(wait);
  }
}

/** An answer's JSON as an object, or null: what most adapters read. */
export function answerObject(a: ProviderReply): Record<string, unknown> | null {
  return a.json !== null && typeof a.json === "object" && !Array.isArray(a.json)
    ? (a.json as Record<string, unknown>)
    : null;
}
