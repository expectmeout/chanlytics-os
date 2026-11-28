/**
 * The request the code running now serves: its name, the workspace once the request has said which, and where its time
 * has gone (decision 0053: what a route answers in Server-Timing, beside the session check and the handler).
 *
 * One store for the whole process, whichever copy of this module asks. Each package's build inlined channels until its
 * dist imported its siblings' (#1382), and a test that loads source beside a dist still holds two copies; a store made
 * by the module itself would be one per copy, and a name bound by the edge's door unseen by a line core writes beneath
 * it. The store lives on globalThis under a registered symbol, the way AppError's brand is recognised by every copy of
 * contracts.
 *
 * A request is named by `withRequestId` (logger.ts, over `runNamed`), which runs the work inside the name (AsyncLocalStorage.run): the name holds
 * for what that work awaits and ends when it returns. Nothing here enters a name for the rest of an execution
 * (enterWith), so a request can never lend its name to the next one an instance serves.
 */
import { AsyncLocalStorage } from "node:async_hooks";

interface Serving {
  readonly id: string;
  /** The workspace this request acts on, once it is known (`noteTenant`): every line after carries it. */
  tenantId?: string;
  /** What its time went on, by name (`noteTiming`): its database calls, each reader it read through. */
  timings?: Map<string, RequestTiming>;
  /** The tables and SQL functions its database calls touched, each with how (`noteTouch`). */
  touched?: Map<string, Set<string>>;
  /** What stands for it where its identical reads share one answer (`shareReads`): it lives as long as the request does. */
  reads?: object;
  /** What the work is for, said where it is named (`withRequestId`'s `about`): a door's path, a job's kind. */
  purpose?: string;
  /** Which try of its work this is (a job's attempt, 1 on its first run): an outside call asks once on a later one. */
  attempt?: number;
  /** Its calls to services outside our own two apps, by provider (`noteTiming`'s `outside`): what its one line says (logger.ts). */
  calls?: Map<string, RequestTiming>;
}

/** What a unit of work says of itself as it is named: whose it is, what it is for, and which try. */
export interface ServingAbout {
  tenantId?: string;
  purpose?: string;
  attempt?: number;
}

/** One name's share of a request's time: how long all of it took, and how many there were. */
interface RequestTiming {
  ms: number;
  n: number;
}

const REQUEST_SLOT: unique symbol = Symbol.for("chanlytics.request");
const requestHolder = globalThis as { [REQUEST_SLOT]?: AsyncLocalStorage<Serving> };
const serving: AsyncLocalStorage<Serving> = (requestHolder[REQUEST_SLOT] ??= new AsyncLocalStorage<Serving>());

/**
 * Run `fn` as the unit of work named `id`, with what it says of itself: the store it runs in, handed to `ended` once
 * the work has settled, its answer or failure unchanged. logger.ts's `withRequestId` is the one caller.
 */
export async function runNamed<T>(
  id: string,
  about: ServingAbout,
  fn: () => Promise<T>,
  ended: (store: ServedStore) => void,
): Promise<T> {
  const store: Serving = {
    id,
    ...(about.tenantId ? { tenantId: about.tenantId } : {}),
    ...(about.purpose ? { purpose: about.purpose } : {}),
    ...(about.attempt !== undefined && Number.isFinite(about.attempt) ? { attempt: about.attempt } : {}),
  };
  // The end is said inside the name too, so its line carries the request it closes.
  return serving.run(store, async () => {
    try {
      return await fn();
    } finally {
      ended(store);
    }
  });
}

/** What a unit of work's end reads of it: its name, whose and what for, and its outside calls. */
export type ServedStore = Readonly<Pick<Serving, "id" | "tenantId" | "purpose" | "attempt" | "calls">>;

/** The name of the request the code running now serves, or null outside one (a script, a test, a clock's own SQL). */
export function requestId(): string | null {
  return serving.getStore()?.id ?? null;
}

/**
 * The workspace this request acts on, said once where it is resolved (the dashboard's route pipeline): the lines
 * logged after it carry `tenant_id` without each call site passing it. Outside a request it does nothing.
 */
export function noteTenant(tenantId: string): void {
  const store = serving.getStore();
  if (store) store.tenantId = tenantId;
}

/** The workspace the request running now acts on, when it has said. */
export function requestTenant(): string | null {
  return serving.getStore()?.tenantId ?? null;
}

/** Which try of its work the code running now is (a job's attempt), or null where nothing said: a first try. */
export function requestAttempt(): number | null {
  return serving.getStore()?.attempt ?? null;
}

/** How many providers one unit of work keeps the calls of. */
const CALLS_HELD = 24;
/** How many names one request keeps the time of. */
const TIMINGS_HELD = 32;

/** One more share under a name, added up and counted; past `held` names a new one is not kept. */
function addShare(shares: Map<string, RequestTiming>, name: string, ms: number, held: number): void {
  const had = shares.get(name);
  if (had) {
    had.ms += ms;
    had.n += 1;
  } else if (shares.size < held) shares.set(name, { ms, n: 1 });
}

/**
 * A share of the request's time, said where it was spent: the database client after each call, a reader after each read,
 * the provider door after each call out. Durations add up under one name and are counted, so `db` is every call and how
 * many. A call to a service outside our own two apps names its provider too (`outside`): the work's one line adds them
 * up by provider, under its workspace and purpose (`outside_calls`, logger.ts). Outside a request it does nothing, and it
 * never holds more than a few dozen names: past that a new name is not kept.
 */
export function noteTiming(name: string, ms: number, outside?: string): void {
  const store = serving.getStore();
  if (!store || !Number.isFinite(ms) || ms < 0) return;
  addShare((store.timings ??= new Map<string, RequestTiming>()), name, ms, TIMINGS_HELD);
  if (outside) addShare((store.calls ??= new Map<string, RequestTiming>()), outside, ms, CALLS_HELD);
}

/** Where the request running now has spent its time so far, by name; none outside a request. */
export function requestTimings(): ReadonlyMap<string, RequestTiming> {
  return serving.getStore()?.timings ?? new Map();
}

/** How many tables and functions one request keeps the touch of. */
const TOUCHES_HELD = 64;

/**
 * A table one of the request's database calls touched, and how (`read`, `INSERT`, `UPDATE`, `DELETE`), or a SQL function it
 * called (`rpc:<name>`, `call`): said by the database client after each call (packages/db observe.ts namedFetch). A sample of
 * production's requests says them in their answered line, and what the trace of a route says it reads and writes
 * (tooling/scripts/trace-routes.mjs) is held to them (decision 0058, the wiring's second audit, lane R7). Outside a request it
 * does nothing, and it holds a few dozen at most: past that a new one is not kept.
 */
export function noteTouch(table: string, how: string): void {
  const store = serving.getStore();
  if (!store || !table) return;
  const touched = (store.touched ??= new Map<string, Set<string>>());
  const had = touched.get(table);
  if (had) had.add(how);
  else if (touched.size < TOUCHES_HELD) touched.set(table, new Set([how]));
}

/** The tables and functions the request running now has touched so far, each with how; none outside a request. */
export function requestTouches(): ReadonlyMap<string, ReadonlySet<string>> {
  return serving.getStore()?.touched ?? new Map();
}

/**
 * The request running now answers several reads as one, and they may ask the database the same thing (the dashboard's
 * GET open): from here its identical reads share one answer, which the database client keeps for it (packages/db
 * read-once.ts). Said by the request itself, never for it; outside a request it does nothing.
 */
export function shareReads(): void {
  const store = serving.getStore();
  if (store) store.reads ??= {};
}

/**
 * What stands for the request running now where it shares its reads: an object that lives exactly as long as the
 * request, which the database client keeps the request's answers against. Null outside a request, and in one that
 * shares none.
 */
export function sharedReads(): object | null {
  return serving.getStore()?.reads ?? null;
}
