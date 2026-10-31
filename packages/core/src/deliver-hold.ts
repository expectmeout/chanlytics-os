/**
 * Whether somebody holds the thread, or its pause stands, for one send (deliver.ts): what a draft, a system message, an
 * answer and a broadcast each meet; and whether the receptionist's draft is too late to send, which holds it for a
 * person too. Pure, so the door reads one answer and its length stays its own.
 */
import { passesHandoverPause, type DeliveryRefusal } from "@chanlytics/contracts";
import type { SendKind } from "./deliver";
import { pastReplyHorizon } from "./inbound/steps";

/**
 * The thread's live hold (00132) and its pause, as the door read them at the wire. The inbound path reads the hold in
 * this shape too (inbound/thread.ts ThreadState.control), so it can ask the question below before the model is asked.
 */
export interface HoldFacts {
  /** Who is speaking on the thread now, the call's own id when a call holds it (control_ref), and until when. */
  control: { kind: string; ref: string | null; until: string } | null;
  pausedUntil: string | null;
}

/**
 * The live hold a conversation row carries (00132), or null: a kind with no end is none. THE one reading of those
 * columns: the send door reads them off the wire's row (deliver.ts wireFacts), the receptionist's memory off the hold's
 * own read (db readLiveHold, the edge's pgThread), so the two can never disagree about who holds a thread.
 */
export function liveHoldOf(row: {
  control_kind?: string | null;
  control_ref?: string | null;
  control_until?: string | null;
}): HoldFacts["control"] {
  return row.control_kind && row.control_until
    ? { kind: row.control_kind, ref: row.control_ref ?? null, until: row.control_until }
    : null;
}

/** What of the send the hold asks: the playbook moment it was made for, and the call it is made on, if any. */
interface Held {
  trigger: string | null;
  onCall?: string | null;
}

export function heldByThread(d: Held, f: HoldFacts, nowMs: number, kind: SendKind): DeliveryRefusal | null {
  // Is somebody speaking on this thread right now (00132)? A person who took it over, or a call in progress. It is asked
  // as a LIVE fact with an expiry, never as "does a column name somebody": the assignee it used to read is never cleared,
  // so a thread taken over one Tuesday refused every draft after it for the life of the workspace.
  //
  // A call's hold is not held against the call itself. The phone receptionist texting the caller the booking link they
  // just asked for is the call speaking, not a second agent talking over it: it met its own hold, refused as though a
  // person had the thread, and told the caller "a person is on it" when nobody was. Only that same call passes; a
  // person's hold, and another call's, still hold it.
  const ownCall = f.control?.kind === "call" && !!d.onCall && f.control.ref === d.onCall;
  const held = !!f.control && nowMs < new Date(f.control.until).getTime() && !ownCall;
  // A thread somebody holds does not take the receptionist's draft. Taking over withdraws the drafts written before it;
  // this is the same promise kept at the wire, for the withdrawal that failed or the draft written in the same second.
  // Only the draft: an answer meets the hold below, a system message is owed whoever holds the thread.
  if (kind === "draft" && held) return "human_has_it";
  // The thread's pause holds the receptionist answering now, and a broadcast.
  // It does not hold a queued draft, written before the pause it now meets --
  // the receptionist's own escalation pauses the thread and queues its holding
  // message in the same breath -- so for a draft the question is not "is the
  // thread paused" but "did a person speak since", which the door's
  // overtakenByHuman answers; and every pause writer withdraws the drafts that came
  // before it (pauseConversation, withdrawDrafts) besides. Nor does it hold a
  // system message: an opt-in confirmation is owed the moment the yes was
  // given, whoever holds the thread.
  //
  // A live hold stops them too, and that is what keeps two of our own agents off one person: while a call is in progress
  // the thread is held, so the text receptionist stores what the customer writes and answers none of it, rather than
  // talking over the call the same customer is on.
  //
  // The day-before reminder alone passes the thread's 24-hour pause (contracts passesHandoverPause, decision D4): it is
  // about their own booking. The live hold above still holds it, and the batch waits for that rather than skipping.
  const paused = !!f.pausedUntil && nowMs < new Date(f.pausedUntil).getTime() && !passesHandoverPause(d.trigger);
  if (kind !== "draft" && kind !== "system" && (held || paused)) return "human_has_it";
  return null;
}

/**
 * The receptionist's draft that would reach them past the reply horizon after the message it answers (`answeredAt`,
 * epoch ms, as the door read it): a person's to send now, exactly as that message would be had it come in this late
 * (inbound steps.ts pastReplyHorizon, the one statement of the horizon). A reply held through an outage used to go out
 * hours late, "3pm is free today" at the end of the day. Asked once nothing else holds the draft and no person has
 * spoken since; the job hands its thread over (messages/send.ts). A person's own reply, a system message and a
 * broadcast never meet it: a person chose those words, and the rules require the rest. A steered draft (the owner's
 * line, the receptionist's rewrite, edge steer.ts) meets it, measured from the message it still answers: it waits its
 * own window like the draft it replaced, and no person chose its words.
 */
export function lateDraft(
  d: { sender: string },
  answeredAt: number | null,
  nowMs: number,
  kind: SendKind,
): DeliveryRefusal | null {
  return kind === "draft" && d.sender === "ai" && pastReplyHorizon(answeredAt, nowMs) ? "too_late" : null;
}
