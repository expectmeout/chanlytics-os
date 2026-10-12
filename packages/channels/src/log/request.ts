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
 * A request is named by `withRequestId`, which runs the work inside the name (AsyncLocalStorage.run): the name holds
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
}

/** One name's share of a request's time: how long all of it took, and how many there were. */
export interface RequestTiming {
  ms: number;
  n: number;
}

const REQUEST_SLOT: unique symbol = Symbol.for("chanlytics.request");
const requestHolder = globalThis as { [REQUEST_SLOT]?: AsyncLocalStorage<Serving> };
const serving: AsyncLocalStorage<Serving> = (requestHolder[REQUEST_SLOT] ??= new AsyncLocalStorage<Serving>());

/** Run `fn` as the request named `id`: every line it logs, every job it schedules and every event it writes carries the name. */
export function withRequestId<T>(id: string, fn: () => T): T {
  return serving.run({ id }, fn);
}

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

/** How many names one request keeps the time of. */
const TIMINGS_HELD = 32;

/**
 * A share of the request's time, said where it was spent: the database client after each call, a reader after each read.
 * Durations add up under one name and are counted, so `db` is every call and how many. Outside a request it does
 * nothing, and it never holds more than a few dozen names: past that a new name is not kept.
 */
export function noteTiming(name: string, ms: number): void {
  const store = serving.getStore();
  if (!store || !Number.isFinite(ms) || ms < 0) return;
  const timings = (store.timings ??= new Map<string, RequestTiming>());
  const had = timings.get(name);
  if (had) {
    had.ms += ms;
    had.n += 1;
  } else if (timings.size < TIMINGS_HELD) timings.set(name, { ms, n: 1 });
}

/** Where the request running now has spent its time so far, by name; none outside a request. */
export function requestTimings(): ReadonlyMap<string, RequestTiming> {
  return serving.getStore()?.timings ?? new Map();
}
