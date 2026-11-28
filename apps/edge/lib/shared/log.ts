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
  logAndGoOn,
  withRequestId,
  requestId,
  type Logger as OneLogger,
  type LogFields,
} from "@chanlytics/log";
import { noteAnswerAtCap, noteDoorRefusing } from "@chanlytics/db/ops";
import { observeDb } from "@chanlytics/db/shared";
import { DbFailure, textOrEmpty, valueAt } from "@chanlytics/contracts";
import { env } from "./env.js";
import { pg } from "./pg.js";
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

// packages/db writes its lines through this logger and names the request it writes for from this store, and a read that
// stopped at the row cap is noted in the pager's memory, which Health shows and the health sweep pages (ops/cap-watch.ts).
observeDb({ log: oneLogger(), requestId, atCap: noteAtCap });

/** A read that stopped at PostgREST's row cap, noted in the pager's memory (layer 12); nothing where there is no database. */
function noteAtCap(table: string): void {
  const db = pg();
  if (!db) return;
  void noteAnswerAtCap(db, table, new Date().toISOString())
    .then(({ error }) => {
      if (error) throw new DbFailure(error, "note a read at the row cap");
    })
    .catch(logAndGoOn("note a read at the row cap"));
}

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
async function answerCaught(request: Request | undefined, answer: () => Promise<Response>): Promise<Response> {
  try {
    return await answer();
  } catch (failure) {
    oneLogger<LogEvent>().error("door_failed", {
      door: request?.url ? new URL(request.url).pathname : undefined,
      error: failure,
    });
    return refuse(500, "door_failed");
  }
}

/**
 * A door that refuses signed knocks tells somebody (lane 8 of the "prove it works" plan, on lane 16's design, 28 Nov 2026).
 * WhatsApp's door and Instagram's answered a knock whose signature failed with a 401 and wrote nothing: if the signing
 * secret stopped matching (rotated at Meta, or changed here), every customer's message would be refused, Meta would
 * retry and then stop delivering, and nothing anywhere would say so. Now each door's refusals of knocks that carried a
 * credential are counted in this instance, in a row; an answer that lets one in sets its count back to nothing; at
 * three, the door is noted in the pager's memory (packages/db noteDoorRefusing), which Health shows and the health sweep
 * pages once a window (ops/cap-watch.ts). The logger cannot page itself: the pager logs through it. A stranger's knock
 * with no credential is never counted, so a scanner cannot trip it, and a door's answer about the act itself (an ad
 * account that is not the owner's, a paused AI) is not a refused credential.
 */
const CREDENTIAL_HEADERS = [
  "x-hub-signature-256",
  "x-twilio-signature",
  "svix-signature",
  "stripe-signature",
  "x-retell-signature",
  "webhook-signature",
  "x-goog-channel-token",
  "x-edge-token",
] as const;
/** The codes a door refuses a knock's credential itself with (`refuse`): its signature, its token, its key. */
const CREDENTIAL_REFUSALS: ReadonlySet<string> = new Set([
  "bad_signature",
  "unauthorized",
  "token_signature",
  "token_malformed",
  "token_expired",
]);
/** Refused signed knocks in a row, with none let in, that note a door for the pager. */
const REFUSALS_NOTED = 3;
const refusedInARow = new Map<string, number>();

/** A refusal's code where its answer is the edge's own JSON (`refuse`); null for any other body (TwiML, none). */
async function readRefusalCode(res: Response): Promise<string | null> {
  try {
    const code = valueAt(JSON.parse(await res.clone().text()), "error");
    return typeof code === "string" ? code : null;
  } catch {
    // Not the edge's JSON: a provider's own shape (Twilio's TwiML), or no body.
    return null;
  }
}

/** Whether an answer refused the knock's credential itself: Stripe's is a 400 `signature`, the rest a 401 or a 403. */
async function hasRefusedTheCredential(res: Response): Promise<boolean> {
  if (res.status !== 400 && res.status !== 401 && res.status !== 403) return false;
  const code = await readRefusalCode(res);
  if (res.status === 400) return code === "signature";
  return code === null || CREDENTIAL_REFUSALS.has(code);
}

/** One knock's answer, counted for its door when it carried a credential; the third refusal in a row is noted. */
async function heardKnock(request: Request | undefined, res: Response): Promise<void> {
  if (!request?.headers || !CREDENTIAL_HEADERS.some((header) => request.headers.has(header))) return;
  const path = URL.canParse(request.url) ? new URL(request.url).pathname : "";
  if (!(await hasRefusedTheCredential(res))) {
    refusedInARow.delete(path);
    return;
  }
  const refused = (refusedInARow.get(path) ?? 0) + 1;
  refusedInARow.set(path, refused);
  if (refused !== REFUSALS_NOTED) return;
  oneLogger<LogEvent>().error("door_refuses_signed_knocks", { door: path, refused, status: res.status });
  const db = pg();
  if (!db) return;
  await noteDoorRefusing(db, path, new Date().toISOString())
    .then(({ error }) => {
      if (error) throw new DbFailure(error, "note a door that refuses signed knocks");
    })
    .catch(logAndGoOn("note a door that refuses signed knocks"));
}

/**
 * A door: `handler` runs as the request it serves, named once as it enters. Every line it logs, every job it
 * schedules and every event it writes carries the name, and the answer carries it back. `trustCaller` is the admin
 * doors': the dashboard names the request it calls with (src/server/shared/edge.ts), signed into its token, so a click's lines
 * in both apps are one search and a header cannot rename a call whose token verified; a name on a knock that carries no
 * verified token (a refusal's, or the platform key's) is the header's, and only labels that call's own lines. Every
 * other door is named by the platform (x-vercel-id), or freshly: a webhook's delivery is its own request.
 *
 * The handler is handed the request alone. The platform calls a door with an argument of its own after the request
 * (Vercel's Node launcher hands each GET and POST a FetchEvent, `{ waitUntil }`), and a handler's parameter after the
 * request is a test's: on 20 November 2026 that argument stood in the key door's sync, and every real clip's key was
 * refused ("sync.open is not a function"). A test hands a handler what it takes after the request with `with`.
 */
export function door<A extends unknown[] = []>(
  handler: (request: Request, ...ports: A | []) => Promise<Response>,
  opts: { trustCaller?: boolean } = {},
): DoorAddress<A> {
  const trust = opts.trustCaller === true;
  const answer = (request: Request | undefined, call: () => Promise<Response>): Promise<Response> => {
    // A door a test calls with no request at all (the health door's GET()) is still named, freshly.
    const id = request?.headers
      ? ((trust ? signedName(request) : null) ?? requestIdOf(request.headers, { trustCaller: trust }))
      : globalThis.crypto.randomUUID();
    // What it is for is the door's path: its outside calls are said under it once it has answered (packages/log).
    const purpose = request?.url && URL.canParse(request.url) ? new URL(request.url).pathname : undefined;
    return withRequestId(
      id,
      async () => {
        const res = await answerCaught(request, call);
        await heardKnock(request, res);
        return named(res, id);
      },
      purpose ? { purpose } : {},
    );
  };
  return Object.assign((request: Request) => answer(request, () => handler(request)), {
    with:
      (...ports: A) =>
      (request: Request) =>
        answer(request, () => handler(request, ...ports)),
  });
}

/**
 * A door's address: what the platform calls, with the request (and its own argument, which the handler never sees),
 * and `with(...ports)`, the same door with what a test hands its handler after the request (the eval and steer doors'
 * model), named and caught as the address is.
 */
interface DoorAddress<A extends unknown[]> {
  (request: Request): Promise<Response>;
  with(...ports: A): (request: Request) => Promise<Response>;
}

/** An admin door: named by the dashboard's request when it says one (door, trustCaller). */
export function adminDoor<A extends unknown[] = []>(
  handler: (request: Request, ...ports: A | []) => Promise<Response>,
): DoorAddress<A> {
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
      failure instanceof Error
        ? failure
        : textOrEmpty(valueAt(failure, "message")) || (typeof failure === "string" ? failure : "no answer"),
  });
  return FAILURE_WORDS[kind];
}

/** A read, a write or a run that failed, refused with its code: the text logged, the plain words in `detail`. */
export function refuseFailure(status: number, code: keyof typeof FAILURE_KINDS, failure: unknown): Response {
  return refuse(status, code, logFailure(FAILURE_KINDS[code], failure));
}
