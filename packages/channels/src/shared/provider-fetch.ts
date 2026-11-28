/**
 * The one way a call leaves for a provider (Meta, Twilio, Retell, Resend, Google, Apify, Expo, Anthropic, TypeSafe, ElevenLabs,
 * Microsoft, Instagram, Firecrawl, Cloudflare, Gemini): bounded, never
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
 *              connection that never opened, or a call this door held (an open breaker, a "too many" still being waited
 *              out, no room among the calls running at once). A send with this outcome provably did not leave. A
 *              service's own "too many" said in a 400 or a 403 (Graph's codes, Google's reasons: provider-rules.ts) keeps
 *              the outcome its status says, as each adapter reads it, and is named by `tooMany`.
 *   unknown    it may have been done: a timeout, a connection dropped after the request left, or a 5xx (a 503 from
 *              a gateway proves nothing about the service behind it). A send with this outcome is never sent again
 *              blind; its receipt may still settle it.
 *
 * Retry by outcome: a call asks again, up to `tries`, only when asking again cannot do the work twice. That is a
 * `retryable` answer always, and an `unknown` one only for an `idempotent` call (a read, or a write the provider
 * dedupes by a key). A try that used its whole bound is not tried again: the time is the caller's. The wait is the
 * provider's Retry-After when it gives one, else a short backoff, all inside `deadlineMs`. Tries add up: a job's later
 * attempt (the request's store says which, packages/log) asks each call once, so a job's retries times a call's never
 * multiply into thousands of requests in a bad hour.
 *
 * A "too many" is honoured (provider-gates.ts): the service's wait holds the calls it names (the workspace's, or the
 * platform's: provider-rules.ts says whose), and lowers how many of them run at once, which answers raise back.
 *
 * The breakers (provider-breakers.ts), one per provider and one per workspace at it, in this instance: after five calls
 * in a row that got no answer or a 5xx, calls are not made for thirty seconds and come back `retryable` with
 * `breaker_open`. A dead provider then costs each caller nothing instead of its whole timeout. One workspace's faults
 * hold only that workspace's calls. After the pause one call is let through and the rest wait for its answer, which
 * closes the breaker or opens it again. A refusal, a 408 or a 429 is the provider answering, never a fault. A call that
 * puts words in front of a person (`breaker: "count"`: a WhatsApp or SMS send, an email, an alert) is always made, and
 * only counts toward the breaker: a reply is never failed on the strength of another call's timeouts. A breaker that
 * opens says so (`breaker_open`), so does one that closes again (`breaker_closed`), and `/api/diag` reads each
 * provider's state (`breakerStates`).
 *
 * Its time, under its name (layer 12, 25 Nov 2026): each call notes how long its caller waited under `out.<provider>` in
 * the request's timings (packages/log noteTiming), beside the database's `db` and each reader's `read.<name>`, so the
 * dashboard's answer says it in Server-Timing and its `route_answered` line, and a call that took half its bound or more
 * says so (`outside_call_slow`). Whose it is and what for (28 Nov): a call to a service outside our two apps is added to
 * the work it serves (noteOutsideCall), whose one `outside_calls` line names the workspace and the purpose, so what a
 * workspace costs can be added up. A call this door held went nowhere and notes nothing.
 */
import { logger, noteOutsideCall, noteTiming, requestAttempt, requestTenant } from "@chanlytics/log";

import { jittered, recordOrEmpty, valueAt } from "@chanlytics/contracts";
import { breakerHears, breakerSays, resetBreakerStates } from "./provider-breakers";
import { PACE_WAIT_CAP_MS, holdLeftOf, holdUntil, paceAfter, resetPace, takeRoom } from "./provider-gates";
import { isOurOwnApp, providerRuleOf, tooManyOf, type Provider, type TooManyScope } from "./provider-rules";

export type { Provider } from "./provider-rules";
export { breakerOf, breakerStates } from "./provider-breakers";

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
  /** How long the provider asked us to wait (Retry-After, or its own "too many"'s wait), in ms, when it said. */
  retryAfterMs: number | null;
  /** Why no answer came: "timeout", "breaker_open", "too_many", "too_many_at_once", or the network's own words. */
  error: string | null;
  /** How many requests left: 0 when this door held the call. */
  tries: number;
  /** The provider's "too many", and whose limit it spent (provider-rules.ts); null for any other answer. */
  tooMany: TooManyScope | null;
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
  /**
   * Whose call this is: the workspace whose limits it spends and whose breaker its faults count under. The workspace the
   * request being served acts on (packages/log requestTenant) when not said; null for a call that is nobody's own.
   */
  workspace?: string | null;
}

/** What a test hands in instead of the network and the clock. */
interface ProviderDeps {
  /** A test's stand-in for the network; the runtime's own fetch where none is given, or it is given as undefined. */
  fetch?: typeof fetch | undefined;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** The draw a backoff is lengthened by (contracts jittered); Math.random when absent. */
  random?: () => number;
}

/** The first retry's wait when the provider named none; each further one doubles it. */
const RETRY_BASE_MS = 250;
/** The longest a call waits before asking again: a longer Retry-After is the caller's to honour, not this call's. */
const RETRY_WAIT_CAP_MS = 2_000;

/** One call as the door makes it: what it is, whose, and how long it has. */
interface Making {
  provider: Provider;
  url: string;
  call: ProviderCall;
  deps: Required<ProviderDeps>;
  started: number;
  workspace: string | null;
}

/** Every breaker closed and every hold and gate let go: for a test, which must not inherit the last test's outage. */
export function resetBreakers(): void {
  resetBreakerStates();
  resetPace();
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
  const cause = err.cause;
  const causeCode = valueAt(cause, "code");
  const code = typeof causeCode === "string" ? causeCode : valueAt(err, "code");
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

/** An answer this door gave without asking: the call did not leave. */
function heldReply(error: string, retryAfterMs: number | null, tries: number): ProviderReply {
  return {
    outcome: "retryable",
    status: 0,
    text: "",
    json: null,
    body: null,
    headers: null,
    retryAfterMs,
    error,
    tries: tries - 1,
    tooMany: null,
  };
}

/** The holders of a call's limits: the platform's, and its workspace's own where its provider limits each workspace. */
function holdersOf(making: Making): { platform: string; own: string | null } {
  const own =
    providerRuleOf(making.provider).limits === "workspace" && making.workspace
      ? `${making.provider}|${making.workspace}`
      : null;
  return { platform: making.provider, own };
}

/** How long the call may still wait before its try, inside its deadline and never past a retry's longest wait. */
function waitLeft(making: Making): number {
  const left =
    making.call.deadlineMs === undefined ? Infinity : making.call.deadlineMs - (making.deps.now() - making.started);
  return Math.max(0, Math.min(PACE_WAIT_CAP_MS, left - making.call.timeoutMs));
}

/** A "too many" still being waited out: waited for when it ends soon enough, else the call is held. */
async function heldByTooMany(making: Making, tries: number): Promise<ProviderReply | null> {
  const { platform, own } = holdersOf(making);
  const now = making.deps.now();
  const held = Math.max(holdLeftOf(platform, now), own ? holdLeftOf(own, now) : 0);
  if (held === 0) return null;
  if (held > waitLeft(making)) return heldReply("too_many", held, tries);
  await making.deps.sleep(held);
  return null;
}

/** What an answer's "too many" holds, and how it paces the calls after it; the answer as the caller reads it. */
function honour(making: Making, gate: string, reply: ProviderReply): ProviderReply {
  const rule = providerRuleOf(making.provider);
  const tooMany = reply.status > 0 ? tooManyOf(making.provider, reply) : null;
  if (!tooMany) {
    if (reply.status > 0) paceAfter(gate, rule.atOnce, false);
    return reply;
  }
  const { platform, own } = holdersOf(making);
  // The outcome stays the one its status says: Graph's and Google's "too many" in a 400 or a 403 is read as not now by
  // each adapter that meets it (whatsapp graphThrottled, the ads' slowed, Gmail's and Drive's pace); `tooMany` is the
  // door's word for all of them, and the wait the service named rides with it.
  const said = { ...reply, retryAfterMs: tooMany.waitMs ?? reply.retryAfterMs, tooMany: tooMany.scope };
  // One person written to too often, or a workspace's "too many" in work that names no workspace: nobody else is paced.
  const holder = tooMany.scope === "platform" ? platform : tooMany.scope === "workspace" ? own : null;
  if (!holder) return said;
  paceAfter(gate, rule.atOnce, true);
  // Held for as long as the service said, and only then: a wait it did not name is the caller's backoff to choose.
  if (tooMany.waitMs !== null) holdUntil(holder, making.deps.now() + tooMany.waitMs);
  return said;
}

async function once(making: Making, tries: number): Promise<ProviderReply> {
  const waited = await heldByTooMany(making, tries);
  if (waited) return waited;
  const { own, platform } = holdersOf(making);
  const gate = own ?? platform;
  const release = await takeRoom(gate, providerRuleOf(making.provider).atOnce, waitLeft(making), making.deps.sleep);
  if (!release) return heldReply("too_many_at_once", PACE_WAIT_CAP_MS, tries);
  try {
    const verdict = breakerSays(making.provider, making.workspace, making.deps.now(), making.call.breaker === "count");
    if (!verdict.go) return heldReply("breaker_open", verdict.retryAfterMs, tries);
    const reply = honour(making, gate, await ask(making, tries));
    breakerHears(making.provider, making.workspace, reply, making.deps.now(), verdict.probes);
    return reply;
  } finally {
    release();
  }
}

/** The request itself, inside its bound: the answer as it came, or what its throw says was done. */
async function ask(making: Making, tries: number): Promise<ProviderReply> {
  const { call } = making;
  const init: RequestInit = {
    method: call.method,
    headers: call.headers,
    body: call.body,
    cache: call.cache,
    redirect: call.redirect,
  };
  const bound = AbortSignal.timeout(call.timeoutMs);
  const answered = { body: null, tooMany: null, tries };
  try {
    const response = await making.deps.fetch(making.url, {
      ...init,
      signal: call.signal ? AbortSignal.any([bound, call.signal]) : bound,
    });
    if (call.stream && response.ok && response.body) {
      const streaming = { status: response.status, text: "", json: null, headers: response.headers };
      return { ...answered, ...streaming, outcome: "ok", body: response.body, retryAfterMs: null, error: null };
    }
    // Read inside the bound: a body that stalls past it is no answer at all, as a request that did.
    const text = await response.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // Not JSON: nothing to read.
      json = null;
    }
    const retryAfterMs = retryAfterOf(response.headers.get("retry-after"), making.deps.now());
    const read = { status: response.status, text, json, headers: response.headers, retryAfterMs, error: null };
    return { ...answered, ...read, outcome: outcomeOfStatus(response.status) };
  } catch (failure) {
    const { outcome, error } = outcomeOfThrow(failure);
    return { ...answered, outcome, status: 0, text: "", json: null, headers: null, retryAfterMs: null, error };
  }
}

/** How much of its bound a call may take before it is said to be slow. */
const SLOW_SHARE = 0.5;

/** Whether the door held a call without asking: it went nowhere, and notes no time. */
const heldByDoor = (r: ProviderReply): boolean =>
  r.status === 0 && (r.error === "breaker_open" || r.error === "too_many" || r.error === "too_many_at_once");

/** A call's time, under its name: the request's share, and a line when it took half its bound or more. */
function sayTime(provider: Provider, call: ProviderCall, providerReply: ProviderReply, ms: number): void {
  if (heldByDoor(providerReply)) return;
  noteTiming(`out.${provider}`, ms);
  if (!isOurOwnApp(provider)) noteOutsideCall(provider, ms);
  if (ms < call.timeoutMs * SLOW_SHARE) return;
  logger().warn("outside_call_slow", {
    provider,
    ms: Math.round(ms),
    timeout_ms: call.timeoutMs,
    status: providerReply.status,
    outcome: providerReply.outcome,
    tries: providerReply.tries,
  });
}

/** One call to a provider, bounded, never thrown, retried only when asking again cannot do the work twice. */
export async function fetchFromProvider(
  provider: Provider,
  url: string,
  call: ProviderCall,
  deps: ProviderDeps = {},
): Promise<ProviderReply> {
  const required: Required<ProviderDeps> = {
    fetch: deps.fetch ?? globalThis.fetch,
    now: deps.now ?? Date.now,
    sleep: deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    random: deps.random ?? Math.random,
  };
  const started = required.now();
  const workspace = call.workspace === undefined ? requestTenant() : call.workspace;
  const providerReply = await askUntilAnswered({ provider, url, call, deps: required, started, workspace });
  sayTime(provider, call, providerReply, required.now() - started);
  return providerReply;
}

/** The tries of one call: asked again while asking again cannot do the work twice, within its deadline. */
async function askUntilAnswered(making: Making): Promise<ProviderReply> {
  // A job's later attempt asks once: its own retry is the ledger's, and the two never multiply.
  const max = (requestAttempt() ?? 1) > 1 ? 1 : Math.max(1, Math.floor(making.call.tries ?? 1));
  for (let count = 1; ; count++) {
    const result = await once(making, count);
    const again = result.outcome === "retryable" || (result.outcome === "unknown" && making.call.idempotent === true);
    if (!again || count >= max || heldByDoor(result) || result.error === "timeout") return result;
    // A provider that asks for longer than a call may wait is asked again by its caller, later, not now.
    if (result.retryAfterMs !== null && result.retryAfterMs > RETRY_WAIT_CAP_MS) return result;
    // The provider's own word when it gave one; else the doubling, drawn a little longer at random so the callers one
    // outage failed together do not all ask again at the same instant.
    const wait = result.retryAfterMs ?? jittered(RETRY_BASE_MS * 2 ** (count - 1), making.deps.random);
    const left =
      making.call.deadlineMs === undefined ? Infinity : making.call.deadlineMs - (making.deps.now() - making.started);
    if (wait + making.call.timeoutMs > left) return result;
    await making.deps.sleep(wait);
  }
}

/** An answer's JSON as an object, or null: what most adapters read. */
export function answerObject(providerReply: ProviderReply): Record<string, unknown> | null {
  return providerReply.json !== null && typeof providerReply.json === "object" && !Array.isArray(providerReply.json)
    ? recordOrEmpty(providerReply.json)
    : null;
}
