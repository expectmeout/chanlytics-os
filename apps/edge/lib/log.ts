/**
 * Structured logging for the edge: the platform's one logger (packages/channels log/), typed by the edge's names.
 *
 * There were 75 console call sites across the edge and the packages it bundles, and FIVE of them mentioned a tenant.
 * The shapes were ad hoc too, so the log was not queryable even in principle, and "what happened to this business's
 * line yesterday?" could not be answered, which is the question every incident starts with. This module's first
 * version (21 September) gave every line one envelope; the implementation now lives in channels, so the dashboard's
 * server and the packages write the same line (level, event, request_id, tenant_id, fields redacted by key).
 *
 * The design constraint that shaped this: EVENT NAMES DO NOT CHANGE. They are the stable identifier anything
 * downstream greps for. The names are a closed set, LOG_EVENTS (log-events.ts): a line names its event with one of
 * them or it does not compile. The workspace is `tenant_id`, one spelling (repo/log-events.test.mjs holds it).
 *
 * Every door names the request it serves (`door`): the platform's id for the invocation (x-vercel-id), or the
 * dashboard's own for a door it calls (an admin door trusts the caller's x-request-id), and answers it back in
 * x-request-id. The name is run, never entered (AsyncLocalStorage.run): it holds for what the door awaits and ends
 * with it, so a request can never lend its name to the next one the instance serves (edge/request-id-doors.test.mjs).
 * packages/db logs through the same logger: this module hands it in as it loads.
 */
import {
  logger as oneLogger,
  errField,
  withRequestId,
  requestId,
  requestIdOf,
  REQUEST_ID_HEADER,
  type Logger as OneLogger,
  type LogFields,
} from "./packages/channels.js";
import { observeDb } from "./packages/db.js";
import type { LogEvent } from "./log-events.js";

export type { LogEvent };
export { errField, withRequestId, requestId };

/**
 * Fields carried by every line from one logical unit of work. Anything JSON can carry: a provider's error list or a
 * usage object rides as it is, rather than being flattened by hand at every site.
 */
export type LogContext = LogFields;

export type Logger = OneLogger<LogEvent>;

/**
 * A logger with context bound to it. Pass the workspace once, as `tenant_id`, at the point where it becomes known,
 * and every line beneath it carries it: the only way this stays true as code moves around.
 */
export function logger(base: LogContext = {}): Logger {
  return oneLogger<LogEvent>(base);
}

// packages/db writes its lines through this logger and names the request it writes for from this store.
observeDb({ log: oneLogger(), requestId });

/** The answer, carrying the request's name. A response whose headers are fixed (a redirect) is copied to carry it. */
function named(res: Response, id: string): Response {
  try {
    res.headers.set(REQUEST_ID_HEADER, id);
    return res;
  } catch {
    const copy = new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers });
    copy.headers.set(REQUEST_ID_HEADER, id);
    return copy;
  }
}

/**
 * A door: `handler` runs as the request it serves, named once as it enters. Every line it logs, every job it
 * schedules and every event it writes carries the name, and the answer carries it back. `trustCaller` is the admin
 * doors': the dashboard names the request it calls with (src/server/edge.ts), so a click's lines in both apps are one
 * search; a forged name on a knock the door refuses only labels the refusal's own line. Every other door is named by
 * the platform (x-vercel-id), or freshly: a webhook's delivery is its own request.
 */
export function door<A extends unknown[]>(
  handler: (request: Request, ...rest: A) => Promise<Response>,
  opts: { trustCaller?: boolean } = {},
): (request: Request, ...rest: A) => Promise<Response> {
  return (request, ...rest) => {
    // A door a test calls with no request at all (the health door's GET()) is still named, freshly.
    const id = request?.headers
      ? requestIdOf(request.headers, { trustCaller: opts.trustCaller === true })
      : globalThis.crypto.randomUUID();
    return withRequestId(id, async () => named(await handler(request, ...rest), id));
  };
}

/** An admin door: named by the dashboard's request when it says one (door, trustCaller). */
export function adminDoor<A extends unknown[]>(
  handler: (request: Request, ...rest: A) => Promise<Response>,
): (request: Request, ...rest: A) => Promise<Response> {
  return door(handler, { trustCaller: true });
}
