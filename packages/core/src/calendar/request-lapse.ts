/**
 * A time a customer asked for that ran out with no answer (decision 0061, as amended 22 Nov 2026): the one verb its job
 * runs. The request and its conversation are read as they stand, one rule says whether the customer may be told, AI is
 * asked for the words, and one door closes the request: with the message queued, the hold resolved and the conversation
 * back with AI, or with the hold turned into a reply for a person, as Can't leaves it.
 *
 * Safe to run twice. The door closes a request once, under its row's lock, and queues the message in the same
 * statement, so a second run finds it closed and says so. A writer that throws is thrown on, so the job tries again;
 * on the job's last try the request is closed for a person rather than left open for a run that will never come.
 *
 * Nothing leaves from here: the message is a queued row, and the send door re-reads the customer's consent, the
 * workspace's stop and whether a person spoke since as it leaves (deliver.ts).
 */
import {
  REQUEST_LAPSE_WORDS,
  REQUEST_TOLD_WITHIN_MS,
  isOneOf,
  LAPSE_WIRES,
  replyWindow,
  requestLapseInstruction,
  slotShort,
  windowClockOf,
  type ContactId,
  type LapseHold,
  type TenantId,
} from "@chanlytics/contracts";
import type { ReplyDraftAsk, ReplyWritten } from "../conversations/reply-draft";
import { speaksUnattended } from "../inbound/reply-posture";

/** A wire a run-out is told on. */
type LapseWire = (typeof LAPSE_WIRES)[number];

/** The request as its row says it. */
interface LapsedRequest {
  id: string;
  source: string;
  /** `proposed` while it waits on its owner; anything else is answered, replaced or closed. */
  status: string;
  conversationId: string | null;
  contactId: ContactId | null;
  /** ISO instants. */
  startsAt: string;
  endsAt: string;
  service: string | null;
  timezone: string;
  expiresAt: string | null;
  /** When the customer asked (the row's created_at). */
  askedAt: string;
  /** The number they asked from, kept on the row when the request was opened. */
  phone: string | null;
}

/** The request's conversation as the rule reads it. */
interface LapseThread {
  /** The open hold's reason, or null with none. */
  holdReason: string | null;
  /** The wire a reply goes by (contracts answerWireOf). */
  wire: string | null;
  clocks: { whatsapp: string | null; instagram: string | null };
  optedOut: boolean;
  /** Their newest message and its words: what the writer answers. */
  forMessageId: string | null;
  theirWords: string | null;
  /** A person typed a reply on the conversation since the customer asked. */
  personSpoke: boolean;
  /** The customer wrote again since they asked: what they wrote has had no answer. */
  wroteAgain: boolean;
  /** A person took the conversation over, or a call is in progress on it (deliver/hold.ts liveHoldOf), right now. */
  liveHold: boolean;
}

/** What the door is handed: the request, the hold's line should it wait on a reply, and the message, if one may go. */
interface LapseCommand {
  tenantId: TenantId;
  appointmentId: string;
  replyWords: string;
  told: {
    conversationId: string;
    contactId: ContactId | null;
    channel: LapseWire;
    to: string;
    body: string;
    /** When it may leave: now, or after the workspace's hold window. */
    dueAt: Date;
    /** Past this it is too late to leave by itself (the job's stale_after). */
    staleAfter: Date;
  } | null;
  /** Why nothing is sent, where nothing is. */
  why?: LapseHold;
}

/**
 * What the door did (00679 booking_request_lapse): told (the message queued, the hold resolved), reply (the hold turned
 * into a reply for a person), closed (the request closed and a hold of another reason left as it stood), or answered
 * (the request was not waiting any more: nothing moved), or early (its time has not come by the database's clock).
 */
type LapseDone = { outcome: "told"; messageId: string | null } | { outcome: "reply" | "closed" | "answered" | "early" };

export interface RequestLapsePorts {
  /** The request, or null where the record no longer holds it. */
  request(tenantId: TenantId, appointmentId: string): Promise<LapsedRequest | null>;
  /** Its conversation, with whether a person typed a reply after `since`; null where it is gone. */
  thread(tenantId: TenantId, conversationId: string, since: string): Promise<LapseThread | null>;
  /**
   * The reply setting in force for this person (the workspace's, their own where set, "ask" while everything is
   * stopped: inbound effectiveReplyMode), how long a reply waits under it, and whether billing paused the workspace.
   */
  posture(tenantId: TenantId, contactId: ContactId | null): Promise<{ mode: string; delayMs: number; paused: boolean }>;
  /** AI's words, through the one writer of a reply (edge drafts/writer.ts). Throws when it failed. */
  write(tenantId: TenantId, ask: ReplyDraftAsk): Promise<ReplyWritten>;
  /** The door. */
  lapse(cmd: LapseCommand): Promise<LapseDone>;
}

/** What the rule reads: the clock, the conversation, the workspace and the wire. */
interface LapseFacts {
  nowMs: number;
  expiresAtMs: number;
  holdReason: string | null;
  personSpoke: boolean;
  optedOut: boolean;
  wroteAgain: boolean;
  liveHold: boolean;
  paused: boolean;
  mode: string;
  wire: string | null;
  clocks: { whatsapp: string | null; instagram: string | null };
  phone: string | null;
  /** How long the message would wait before it leaves (the workspace's hold window): the window is asked of that moment. */
  delayMs?: number;
}

/**
 * Why a request that ran out is not told to the customer, or null when it may be (contracts LapseHold, in that order).
 * THE statement of it: what the job asks before it asks the model, so words that cannot go are never written.
 */
export function lapseHoldOf(facts: LapseFacts): LapseHold | null {
  if (facts.holdReason !== "booking_request") return "hold_moved";
  if (facts.nowMs > facts.expiresAtMs + REQUEST_TOLD_WITHIN_MS) return "late";
  if (facts.personSpoke) return "person_answered";
  if (facts.optedOut) return "opted_out";
  if (facts.wroteAgain) return "wrote_again";
  if (facts.liveHold) return "person_has_it";
  if (facts.paused) return "paused";
  if (!speaksUnattended(facts.mode)) return "asks_first";
  if (!isOneOf(LAPSE_WIRES, facts.wire) || !facts.phone) return "no_wire";
  const leaves = new Date(facts.nowMs + (facts.delayMs ?? 0));
  const window = replyWindow(facts.wire, windowClockOf(facts.wire, facts.clocks), leaves);
  return window.open ? null : "window_closed";
}

type LapseOutcome = "told" | "reply" | "closed" | "answered" | "gone" | "early";

interface SettleLapsedRequest {
  tenantId: TenantId;
  appointmentId: string;
  now: Date;
  /** When the writer must have answered by (epoch ms): the job's own deadline. */
  deadline: number;
  /** The job's last try: a writer that throws now leaves the request for a person instead of throwing on. */
  lastTry?: boolean;
}

export async function settleLapsedRequest(ports: RequestLapsePorts, cmd: SettleLapsedRequest): Promise<LapseOutcome> {
  const { tenantId, appointmentId, now } = cmd;
  const row = await ports.request(tenantId, appointmentId);
  if (!row) return "gone";
  if (row.source !== "receptionist" || row.status !== "proposed") return "answered";
  const expiresAtMs = row.expiresAt ? Date.parse(row.expiresAt) : Number.NaN;
  // A request with no end, or one whose end is still ahead, is not this verb's: a clock that ran fast changes nothing.
  if (!Number.isFinite(expiresAtMs) || now.getTime() < expiresAtMs) return "early";
  const when = slotShort(Date.parse(row.startsAt), row.timezone);
  const replyWords = REQUEST_LAPSE_WORDS.reply(when, row.service);
  const close = async (reason: LapseHold): Promise<LapseOutcome> =>
    (await ports.lapse({ tenantId, appointmentId, replyWords, told: null, why: reason })).outcome;
  // A request with no conversation has nobody to tell and no hold to turn: closed, and that is all.
  if (!row.conversationId) return close("no_wire");
  const thread = await ports.thread(tenantId, row.conversationId, row.askedAt);
  if (!thread) return close("hold_moved");
  const posture = await ports.posture(tenantId, row.contactId);
  const hold = lapseHoldOf({
    nowMs: now.getTime(),
    expiresAtMs,
    holdReason: thread.holdReason,
    personSpoke: thread.personSpoke,
    optedOut: thread.optedOut,
    wroteAgain: thread.wroteAgain,
    liveHold: thread.liveHold,
    paused: posture.paused,
    mode: posture.mode,
    wire: thread.wire,
    clocks: thread.clocks,
    phone: row.phone,
    delayMs: posture.delayMs,
  });
  // The rule passed only a wire a request is told on and a number to tell: said again here so the types hold them.
  const wire = isOneOf(LAPSE_WIRES, thread.wire) ? thread.wire : null;
  if (hold || !wire || !row.phone) return close(hold ?? "no_wire");
  let written: ReplyWritten;
  try {
    written = await ports.write(tenantId, {
      conversationId: row.conversationId,
      contactId: row.contactId,
      forMessageId: thread.forMessageId,
      // Written ahead for nobody waiting at a screen: it stops at the day's headroom, as a hold's draft does.
      source: "hold",
      wire,
      theirWords: thread.theirWords,
      theirSubject: null,
      // Nothing of the hold is handed on: the instruction says what happened, and nobody is being written for.
      holdReason: null,
      holdDetails: null,
      instruction: requestLapseInstruction(when, row.service),
      given: null,
      deadline: cmd.deadline,
    });
  } catch (error) {
    if (!cmd.lastTry) throw error;
    return close("not_written");
  }
  if ("why" in written || !written.text.trim()) return close("not_written");
  const done = await ports.lapse({
    tenantId,
    appointmentId,
    replyWords,
    told: {
      conversationId: row.conversationId,
      contactId: row.contactId,
      channel: wire,
      to: row.phone,
      body: written.text,
      dueAt: new Date(now.getTime() + posture.delayMs),
      staleAfter: new Date(expiresAtMs + REQUEST_TOLD_WITHIN_MS),
    },
  });
  return done.outcome;
}
