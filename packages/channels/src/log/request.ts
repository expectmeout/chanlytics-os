/**
 * The request the code running now serves: its name, and the workspace once the request has said which.
 *
 * One store for the whole process, whichever copy of this module asks. Each package's build inlines channels (core,
 * jobs and the edge's own import each carry a copy), so a store made by the module itself would be one per copy: a
 * name bound by the edge's door would be unseen by a line core writes beneath it. The store lives on globalThis under
 * a registered symbol, the way AppError's brand is recognised by every copy of contracts.
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
