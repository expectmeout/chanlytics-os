/**
 * Structured logging for the edge: the platform's one logger (packages/log), typed by the edge's names.
 *
 * There were 75 console call sites across the edge and the packages it bundles, and FIVE of them mentioned a tenant.
 * The shapes were ad hoc too, so the log was not queryable even in principle, and "what happened to this business's
 * line yesterday?" could not be answered, which is the question every incident starts with. This module's first
 * version (21 September) gave every line one envelope; the implementation now lives in packages/log, so the dashboard's
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
import { requestIdOf, verifyEdgeToken, REQUEST_ID_HEADER } from "@chanlytics/channels/tokens";
import {
  logger as oneLogger,
  errField,
  withRequestId,
  requestId,
  type Logger as OneLogger,
  type LogFields,
} from "@chanlytics/log";
import { observeDb } from "@chanlytics/db/shared";
import { textOrEmpty, valueAt } from "@chanlytics/contracts";
import { env } from "./env.js";
import { refuse } from "./http.js";
import type { LogEvent } from "./log-events.js";

export type { LogEvent };
export { errField };

/**
 * Fields carried by every line from one logical unit of work. Anything JSON can carry: a provider's error list or a
 * usage object rides as it is, rather than being flattened by hand at every site.
 */
type LogContext = LogFields;

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
 * The name a knock's token carries (edge-token.ts `rid`), when the token verifies for the door it was sent to: what the
 * dashboard signed for this call. Null for no token, no secret, a token for another door or one that does not verify,
 * and a token minted outside a request.
 */
function signedName(request: Request): string | null {
  const token = request.headers.get("x-edge-token");
  const secret = env.EDGE_CALL_SECRET;
  if (!token || !secret) return null;
  try {
    const verdict = verifyEdgeToken(secret, token, new URL(request.url).pathname);
    return verdict.ok ? (verdict.claims.rid ?? null) : null;
  } catch {
    // A token that does not verify names nothing.
    return null;
  }
}

/**
 * What a door answers when its handler throws, the one place a failure no door caught lands (decision 0114). It crashed
 * the function: the platform answered with a page of its own and an unstructured stack, with no request name to find it
 * by. Now one line says which door, what failed and where, and the caller reads a code. The status is still a failure's,
 * so a provider still redelivers and a clock still counts a failed tick.
 */
async function answerOf<A extends unknown[]>(
  handler: (request: Request, ...rest: A) => Promise<Response>,
  request: Request,
  rest: A,
): Promise<Response> {
  try {
    return await handler(request, ...rest);
  } catch (failure) {
    oneLogger<LogEvent>().error("door_failed", {
      door: request?.url ? new URL(request.url).pathname : undefined,
      error: failure,
    });
    return refuse(500, "door_failed");
  }
}

/**
 * A door: `handler` runs as the request it serves, named once as it enters. Every line it logs, every job it
 * schedules and every event it writes carries the name, and the answer carries it back. `trustCaller` is the admin
 * doors': the dashboard names the request it calls with (src/server/shared/edge.ts), signed into its token, so a click's lines
 * in both apps are one search and a header cannot rename a call whose token verified; a name on a knock that carries no
 * verified token (a refusal's, or the platform key's) is the header's, and only labels that call's own lines. Every
 * other door is named by the platform (x-vercel-id), or freshly: a webhook's delivery is its own request.
 */
export function door<A extends unknown[]>(
  handler: (request: Request, ...rest: A) => Promise<Response>,
  opts: { trustCaller?: boolean } = {},
): (request: Request, ...rest: A) => Promise<Response> {
  return (request, ...rest) => {
    // A door a test calls with no request at all (the health door's GET()) is still named, freshly.
    const trust = opts.trustCaller === true;
    const id = request?.headers
      ? ((trust ? signedName(request) : null) ?? requestIdOf(request.headers, { trustCaller: trust }))
      : globalThis.crypto.randomUUID();
    return withRequestId(id, async () => named(await answerOf(handler, request, rest), id));
  };
}

/** An admin door: named by the dashboard's request when it says one (door, trustCaller). */
export function adminDoor<A extends unknown[]>(
  handler: (request: Request, ...rest: A) => Promise<Response>,
): (request: Request, ...rest: A) => Promise<Response> {
  return door(handler, { trustCaller: true });
}

/** What a caller reads of a read, a write or a run that failed: a try-again, never the database's or a library's text. */
const FAILURE_WORDS = {
  read: "Could not read that just now. Try again in a moment.",
  write: "Could not save that just now. Try again in a moment.",
  run: "Could not run that just now. Try again in a moment.",
} as const;

/** The codes a door refuses a failure of its own with, each said in the words of what it was doing. */
const FAILURE_KINDS = { read_failed: "read", query_failed: "read", write_failed: "write", run_failed: "run" } as const;

/**
 * A failure's text goes in the log, and the caller gets the words it may read (decision 0114). `detail` is shown as it
 * is (the dashboard's edgeRefusalWords), so a database's sentence put there reached a person. For a door's own result;
 * `refuseFailure` when the door answers it straight away.
 */
export function logFailure(kind: keyof typeof FAILURE_WORDS, failure: unknown): string {
  const code = valueAt(failure, "code");
  oneLogger<LogEvent>().error("door_reply_failed", {
    kind,
    ...(typeof code === "string" ? { db_code: code } : {}),
    error:
      failure instanceof Error ? failure : textOrEmpty(valueAt(failure, "message")) || String(failure ?? "no answer"),
  });
  return FAILURE_WORDS[kind];
}

/** A read, a write or a run that failed, refused with its code: the text logged, the plain words in `detail`. */
export function refuseFailure(status: number, code: keyof typeof FAILURE_KINDS, failure: unknown): Response {
  return refuse(status, code, logFailure(FAILURE_KINDS[code], failure));
}
