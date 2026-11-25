/**
 * A read that failed is asked once more, and not at all while the database is failing (25 Nov 2026).
 *
 * PostgREST's client asked a failed read again by itself: three more times, one, two and four seconds apart, for a
 * request that did not arrive or was answered 503 or 520. On the night of 24 Nov 2026 the database was failing because
 * it was asked too much, and every read it refused was asked of it three more times within seven seconds, by every
 * request of every page that was open (1,553 answers of 520 and 102 of 503 in the worst ten minutes, Supabase's gateway
 * log). The clients this package makes turn that off (`db.retry: false`), and their transport asks here instead
 * (observe.ts namedFetch):
 *
 *  - Only a read of a table (GET, HEAD), as before: a write or a function's call is sent once.
 *  - Asked again for what the client asked again for: a request that did not arrive, or an answer of 503 or 520. Never
 *    one given up on (an abort: the caller's own, or a bound's), which has already waited as long as it may.
 *  - Once, after a pause that is not the same for every call (AGAIN_AFTER_MS and up to as much again), or the pause the
 *    answer names where that is shorter than AGAIN_WAIT_MAX_MS.
 *  - And not at all while the database is failing: when FAILING_AT of this process's calls have failed in the last
 *    FAILING_WINDOW_MS (any 5xx, a request that did not arrive, a bound reached), a failed read is its caller's to hear
 *    at once. A second ask then is one more call to a database that is not answering the first.
 *
 * What this process has seen fail lives on globalThis under a registered symbol, as the observer does (observe.ts): core
 * and jobs inline their own copy of db, and each copy would otherwise count its own.
 */
import { globalSlot, SECOND_MS } from "@chanlytics/contracts";

/** The pause before a failed read is asked again, at the least; up to as much again is added, so calls do not return as one. */
const AGAIN_AFTER_MS = SECOND_MS / 2;
/** The longest pause an answer may name (`Retry-After`): PostgREST names one while it loads its schema again. */
const AGAIN_WAIT_MAX_MS = 2 * SECOND_MS;
/** This many failed calls inside the window, and the database is failing as this process sees it. */
const FAILING_AT = 3;
/** How long a failed call counts toward that. */
const FAILING_WINDOW_MS = 30 * SECOND_MS;

/** The answers PostgREST's own client asked a read again for: Cloudflare's 520, and 503 while the schema loads. */
const ASKED_AGAIN_FOR = new Set([503, 520]);

/** When this process's database calls last failed, newest last, FAILING_AT of them at most. */
const failedAt = globalSlot<number[]>("chanlytics.db.failed-at");

/** One call as the transport is handed it, with how it touches the database (observe.ts touchOfCall). */
interface AskedCall {
  init: RequestInit | undefined;
  how: string | null;
}

/** What a caller may stand in for the clock, the pause and the chance: a test's. */
export interface AgainWith {
  now?: () => number;
  pause?: (ms: number) => Promise<void>;
  chance?: () => number;
}

const pauseFor = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function noteFailed(at: number): void {
  const times = failedAt.keep(() => []);
  times.push(at);
  if (times.length > FAILING_AT) times.shift();
}

/** Whether the database is failing, as this process has seen it: FAILING_AT of its calls failed inside the window. */
export function databaseFailing(now: number = Date.now()): boolean {
  const times = failedAt.get() ?? [];
  return times.length >= FAILING_AT && now - (times[0] ?? 0) < FAILING_WINDOW_MS;
}

/** Tests only: forget what has failed. */
export function forgetDatabaseFailures(): void {
  failedAt.set([]);
}

/** The pause an answer names in whole seconds (`Retry-After`), in ms; null where it names none. */
function pauseNamed(answer: Response): number | null {
  const seconds = Number.parseInt(answer.headers.get("retry-after") ?? "", 10);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * SECOND_MS : null;
}

/** What one send came to: its answer, or the failure it was rejected with. */
type Sent = { answer: Response } | { failure: unknown };

const nameOf = (failure: unknown): string =>
  typeof failure === "object" && failure !== null && "name" in failure ? String(failure.name) : "";

/**
 * One send, counted: a 5xx, a request that did not arrive and a bound reached are the database failing. A call its
 * caller called off is not: nothing of the database's.
 */
async function sentOnce(call: AskedCall, send: () => Promise<Response>, at: () => number): Promise<Sent> {
  try {
    const answer = await send();
    if (answer.status >= 500) noteFailed(at());
    return { answer };
  } catch (failure) {
    const calledOff = call.init?.signal?.aborted === true && nameOf(failure) === "AbortError";
    if (!calledOff) noteFailed(at());
    return { failure };
  }
}

/**
 * How long to wait before a failed send is asked again, or null where it is not asked again: only a read, only for what
 * the client asked again for, never one given up on (an abort, a bound), and never while the database is failing.
 */
function pauseBeforeAgain(call: AskedCall, sent: Sent, at: number, chance: () => number): number | null {
  if (call.how !== "read" || databaseFailing(at)) return null;
  const ours = AGAIN_AFTER_MS * (1 + chance());
  if ("failure" in sent) {
    const givenUp = call.init?.signal?.aborted === true || /^(Abort|Timeout)Error$/.test(nameOf(sent.failure));
    return givenUp ? null : ours;
  }
  if (!ASKED_AGAIN_FOR.has(sent.answer.status)) return null;
  const named = pauseNamed(sent.answer);
  return named !== null && named <= AGAIN_WAIT_MAX_MS ? named : ours;
}

/**
 * The call's answer, sent by `send`: a read that failed is sent once more where the database is not failing (above).
 * Every failure is counted toward that, whatever the call was.
 */
export async function askedAgain(
  call: AskedCall,
  send: () => Promise<Response>,
  using: AgainWith = {},
): Promise<Response> {
  const now = using.now ?? (() => Date.now());
  let sent = await sentOnce(call, send, now);
  const failed = "failure" in sent || sent.answer.status >= 500;
  const pause = failed ? pauseBeforeAgain(call, sent, now(), using.chance ?? Math.random) : null;
  if (pause !== null) {
    // The first answer is let go of before the second is asked for: its body would hold its connection otherwise.
    if ("answer" in sent) await sent.answer.body?.cancel().catch(() => undefined);
    await (using.pause ?? pauseFor)(pause);
    sent = await sentOnce(call, send, now);
  }
  if ("failure" in sent) throw sent.failure;
  return sent.answer;
}
