/**
 * How the dashboard reaches the edge: where it is, and what a call carries.
 *
 * The address was a literal in five files; it is one variable now, EDGE_URL.
 * Production must name it (env.ts: it refuses to boot without), so a
 * production deployment never quietly calls an address it was not given; a
 * preview or a laptop keeps the old literal as its default, and a preview
 * pointed at a staging edge is one variable away. The
 * credential was one shared key in a header; a call now carries a token
 * minted for the door it opens (packages/channels edge-token), bound to the
 * workspace and the person, valid for a minute, when EDGE_CALL_SECRET is set
 * -- and then nothing else. The key rode beside the token on every call, so a
 * token the edge verified bought nothing while a static key that opened every
 * door travelled with it. The shared key rides only while there is no secret
 * to sign with, and the edge must hold the same secret: without it, it reads
 * no token (apps/edge/lib/admin-auth.ts), so the two projects hold it together
 * or not at all.
 */
import { REQUEST_ID_HEADER, signEdgeToken } from "@chanlytics/channels/tokens";
import {
  MIN_MS,
  LLM_DOOR,
  CALENDAR_FEED_DOOR,
  FREED_TIME_DOOR,
  PLAYBOOK_RUN_DOOR,
  REACH_OUT_PREVIEW_DOOR,
  REACH_OUT_CHECK_DOOR,
  WHATSAPP_TEMPLATES_CREATE_DOOR,
  WHATSAPP_TEMPLATES_DELETE_DOOR,
  WHATSAPP_TEMPLATES_SYNC_DOOR,
  SUPPORT_REPORT_DOOR,
  DRAFT_DOOR,
  STEER_DOOR,
  EMAIL_WIRE_DOOR,
  ALERT_TEST_DOOR,
  SIGNUP_CONFIRM_DOOR,
  TEST_TO_SELF_DOOR,
  MAILBOXES_DOOR,
  FILE_COPIES_DOOR,
  FILE_LISTEN_DOOR,
  FILE_PLAY_DOOR,
  FILE_VIDEO_START_DOOR,
  GOOGLE_DOOR,
  IMPORT_AGAIN_DOOR,
  LOGO_LOOKUP_DOOR,
  WEBSITE_READ_DOOR,
  LINES_DOOR,
  LINE_CODES_DOOR,
  PREVIEW_MAKE_DOOR,
  EVAL_DOOR,
  REHEARSAL_AGENT_DOOR,
  REHEARSAL_CALL_DOOR,
  REHEARSAL_FIX_DOOR,
  REHEARSAL_REVIEW_DOOR,
  WHATSAPP_CONNECT_DOOR,
  WHATSAPP_STANDING_DOOR,
  WHATSAPP_SIGNUP_CONFIG_DOOR,
  INSTAGRAM_ACCOUNT_DOOR,
  HAND_OVER_DOOR,
  STOP_CALL_DOOR,
  WHISPER_DOOR,
  VOICE_SESSION_DOOR,
  VOICE_SPEECH_DOOR,
  ERASE_CALLS_DOOR,
  BILLING_DOOR,
  HANDOVER_INVITE_DOOR,
  PARTNER_INVITE_DOOR,
  SIGNUP_NOTIFY_DOOR,
  SETUP_REQUEST_DOOR,
  YOU_ARE_LIVE_DOOR,
  type DoorAnswer,
  type DoorBody,
  type EdgeAnswerBody,
  type EdgeAnswerCode,
  unheldByDoor,
} from "@chanlytics/contracts";
import type { z } from "zod";
import { env, isProduction } from "./env";
import { log, requestId } from "./log";

/** Where a preview or a laptop calls when EDGE_URL is unset: the edge's production address, as it always was. */
const NOT_PRODUCTION_EDGE_URL = "https://chanlytics-messaging.vercel.app";

/**
 * How long a lambda keeps what the edge said this deployment can do (Google's, billing's, mailboxes'): five
 * minutes, since the answer changes when an operator sets a key, not between two page loads.
 */
export const READY_TTL_MS = 5 * MIN_MS;

/**
 * The edge's origin, no trailing slash (env.ts strips it). A production deployment without EDGE_URL never starts
 * (instrumentation.ts), and one that somehow runs without it throws here rather than call an address nobody set.
 */
export function edgeUrl(): string {
  const set = env.EDGE_URL;
  if (set) return set;
  if (isProduction()) throw new Error("env_invalid: EDGE_URL is required in production");
  return NOT_PRODUCTION_EDGE_URL;
}

/**
 * Every door the dashboard knocks on, as contracts declares it (decision 0109): a call names a declared path and sends
 * that door's body, or it does not compile. The path stays a string at each call, where the reads trace follows it.
 */
const EDGE_DOORS = [
  LLM_DOOR,
  CALENDAR_FEED_DOOR,
  FREED_TIME_DOOR,
  PLAYBOOK_RUN_DOOR,
  REACH_OUT_PREVIEW_DOOR,
  REACH_OUT_CHECK_DOOR,
  WHATSAPP_TEMPLATES_CREATE_DOOR,
  WHATSAPP_TEMPLATES_DELETE_DOOR,
  WHATSAPP_TEMPLATES_SYNC_DOOR,
  SUPPORT_REPORT_DOOR,
  DRAFT_DOOR,
  STEER_DOOR,
  EMAIL_WIRE_DOOR,
  ALERT_TEST_DOOR,
  SIGNUP_CONFIRM_DOOR,
  TEST_TO_SELF_DOOR,
  MAILBOXES_DOOR,
  FILE_COPIES_DOOR,
  FILE_VIDEO_START_DOOR,
  FILE_PLAY_DOOR,
  FILE_LISTEN_DOOR,
  GOOGLE_DOOR,
  IMPORT_AGAIN_DOOR,
  LOGO_LOOKUP_DOOR,
  WEBSITE_READ_DOOR,
  LINES_DOOR,
  LINE_CODES_DOOR,
  PREVIEW_MAKE_DOOR,
  EVAL_DOOR,
  REHEARSAL_AGENT_DOOR,
  REHEARSAL_CALL_DOOR,
  REHEARSAL_FIX_DOOR,
  REHEARSAL_REVIEW_DOOR,
  WHATSAPP_CONNECT_DOOR,
  WHATSAPP_STANDING_DOOR,
  WHATSAPP_SIGNUP_CONFIG_DOOR,
  INSTAGRAM_ACCOUNT_DOOR,
  HAND_OVER_DOOR,
  STOP_CALL_DOOR,
  WHISPER_DOOR,
  VOICE_SESSION_DOOR,
  VOICE_SPEECH_DOOR,
  ERASE_CALLS_DOOR,
  BILLING_DOOR,
  HANDOVER_INVITE_DOOR,
  PARTNER_INVITE_DOOR,
  SIGNUP_NOTIFY_DOOR,
  SETUP_REQUEST_DOOR,
  YOU_ARE_LIVE_DOOR,
] as const;

type EdgeDoors = (typeof EDGE_DOORS)[number];

/** A declared door's path. */
export type EdgeDoorPath = EdgeDoors["aud"];

/** What the door at a path takes. */
export type EdgeBody<A extends EdgeDoorPath> = DoorBody<Extract<EdgeDoors, { aud: A }>>;

/** What a caller reads of the answer of the door at a path. */
export type EdgeRead<A extends EdgeDoorPath> = DoorAnswer<Extract<EdgeDoors, { aud: A }>>;

const ANSWER_OF = new Map<string, z.ZodType>(EDGE_DOORS.map((door) => [door.aud, door.answer]));

/** Whether this deployment holds any credential the edge would honour. */
export function edgeConfigured(): boolean {
  return !!(env.EDGE_CALL_SECRET || env.DIAG_KEY);
}

/**
 * What an edge refusal says, for a route that shows it as it is: its words (`detail`) when it carries some, else its
 * code (`error`), else null. The edge's `error` is a code (contracts' EDGE_ERROR_CODES) and the sentence a person or
 * support reads rides in `detail`; a refusal with no words, or blank ones, falls back to its code, as the platform's
 * page reads one (bridge/platform.ts).
 */
export function edgeRefusalWords(body: EdgeAnswerBody | null | undefined): string | null {
  const detail = typeof body?.detail === "string" ? body.detail.trim() : "";
  if (detail) return detail;
  return typeof body?.error === "string" ? body.error : null;
}

/**
 * The headers a call to the door at `aud` carries, and the name of the request it is made for (log.ts). A call with a
 * body names it (`body`, the exact text sent): the token then opens the door for that body only, and once.
 */
export function edgeHeaders(
  aud: string,
  ctx: { workspace?: string | null; user?: string | null; body?: string } = {},
): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  const id = requestId();
  if (id) h[REQUEST_ID_HEADER] = id;
  const secret = env.EDGE_CALL_SECRET;
  const key = env.DIAG_KEY;
  if (secret) h["x-edge-token"] = signEdgeToken(secret, aud, { ...ctx, request: id });
  else if (key) h["x-diag-key"] = key;
  return h;
}

/**
 * What an edge door answered: its status and its JSON body, or the status this side gave a call that got none. The
 * body's `error` is read as a code of contracts' union (EdgeAnswerBody), never as any string, and its other fields as the
 * door declares them.
 */
export interface EdgeAnswer<B extends EdgeAnswerBody = EdgeAnswerBody> {
  status: number;
  body: B | null;
}

/** How long a call to the edge waits unless its caller says: a door that calls a provider bounds its own calls under it. */
const EDGE_CALL_TIMEOUT_MS = 20_000;

/**
 * Why an edge call did not do its work, as a caller carries it on: the answer's code, or its status when it gave none
 * (a door that answered no JSON). A caller that compares one compares codes a set names, or it does not compile.
 */
export type EdgeReason = EdgeAnswerCode | `edge ${number}`;

/** The reason an answer carries: its code, else its status. */
export function edgeReasonOf(edgeAnswer: EdgeAnswer): EdgeReason {
  return typeof edgeAnswer.body?.error === "string" ? edgeAnswer.body.error : `edge ${edgeAnswer.status}`;
}

/** Whether the door said yes on the wire: a 2xx. What it said inside is the caller's to read. */
export const edgeAnswered = (edgeAnswer: EdgeAnswer): boolean => edgeAnswer.status >= 200 && edgeAnswer.status < 300;

/**
 * What a door sent, read as its declaration says. Report-only, as a door's body began (decision 0109): an answer its
 * schema does not hold is said, by door and field and never by value, and is read as it came, so the trust each caller
 * once wrote at its read is written here once, under the line that checks it. A body that is no object is no body.
 */
export function answerAsItCame<A extends EdgeDoorPath>(aud: A, status: number, came: unknown): EdgeRead<A> | null {
  if (came === null || typeof came !== "object" || Array.isArray(came)) return null;
  const held = ANSWER_OF.get(aud)?.safeParse(came);
  if (held && !held.success)
    log.warn("edge_answer_unexpected", { door: aud, status, fields: unheldByDoor(held.error) });
  return came;
}

/**
 * One call to an edge door: the token for that door (`aud`, its path), a JSON body, and a bound on the wait. Every
 * JSON call the dashboard makes to the edge goes through here (Ask's streamed gateway aside, shared/model/gateway.ts), so none
 * waits for ever: nine did, and one hung connection held a member's request until the platform killed it. Never
 * throws: a door that did not answer in time, or could not be reached, is a 503 as it always was, named
 * `edge_timeout` or `edge_unreachable`, with the network's words in `detail`, read by the caller like any refusal.
 */
export async function callEdge<A extends EdgeDoorPath>(
  aud: A,
  body: EdgeBody<A>,
  opts: {
    /** The workspace the call is for, or null said out loud for a call about none (a readiness probe, a search). */
    workspace: string | null;
    /** The person behind the call, or null said out loud for a call nobody is behind (a webhook's follow-up). */
    user: string | null;
    timeoutMs?: number;
    method?: "GET" | "POST";
    fetch?: typeof fetch;
  },
): Promise<EdgeAnswer<EdgeRead<A>>> {
  const method = opts.method ?? "POST";
  const sent = method === "POST" ? JSON.stringify(body ?? {}) : undefined;
  try {
    const result = await (opts.fetch ?? fetch)(`${edgeUrl()}${aud}`, {
      method,
      headers: edgeHeaders(aud, { workspace: opts.workspace, user: opts.user, body: sent }),
      ...(sent === undefined ? {} : { body: sent }),
      cache: "no-store",
      signal: AbortSignal.timeout(opts.timeoutMs ?? EDGE_CALL_TIMEOUT_MS),
    });
    // An answer that is not JSON is none: its status says the rest.
    const parsed: unknown = await result.json().catch(() => null);
    return { status: result.status, body: answerAsItCame(aud, result.status, parsed) };
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    const refused: EdgeAnswerBody = {
      ok: false,
      error: timedOut ? "edge_timeout" : "edge_unreachable",
      detail: error instanceof Error ? error.message : String(error),
    };
    return { status: 503, body: answerAsItCame(aud, 503, refused) };
  }
}
