/**
 * Who owes the next move on a thread: one answer for every page (the Inbox review's model, Ruben, 6 Nov 2026).
 *
 * The thread's word was "anything else is Handled": 14 of 31 states read a green Handled and four were true, a customer
 * left with no answer among them, and the Handled tab held 24 of the 31. Each thread now gets a positive reason for its
 * word, first match wins. The head, the row, the tabs, the counts, Conversations and Ask read this, so none of them can
 * say another thing of the same thread. Nothing new is stored: each fact was already on the wire.
 *
 * A move can end by the clock, with no read to say so: a draft sends, a reply being worked out does not come, a wait goes
 * quiet. It says when and what it becomes (`until`), and a page asks `threadMoveNow` at the moment it draws.
 *
 * Pure: a page hands in the thread as the wire holds it, its open hold and the clock.
 */
import { NEVER_CONNECTED_LINES } from "../conversations/call-dto";
import type { EscalationDto } from "../conversations/escalations";
import { isAutomatedSend, messageAuthor } from "../conversations/message-author";
import { draftSendsAtMs, heldDraftOf, lastExchanged, reachedCustomer } from "../conversations/message-words";
import { standingOfThread, type StandingVerdict, type ThreadMoveKey } from "../conversations/standing";
import { isChatMessage, isTheirOwnWords } from "../conversations/thread-channel";
import { isOptedOut, messageAt, type ConversationDto, type MessageDto } from "../conversations/thread-dto";
import { QUIET_AFTER_DAYS } from "../people/person-state";
import { DAY_MS, MIN_MS } from "../shared/time";
import type { WaitingThread } from "./waits";

/** The list a thread stands in: an Inbox tab's id, or `out`, which no tab lists (archived: search and a link still find it). */
export type ThreadList = "escalated" | "waiting" | "done" | "snoozed" | "aside" | "out";

/** Where a thread stands: whose move it is, in the list that says so. Its word and its tone are the tone map's (`thread`). */
export interface ThreadMove {
  move: ThreadMoveKey;
  list: ThreadList;
  /** How long this has stood, from when, epoch ms; said beside the word. Absent where no wait is worth saying. */
  sinceMs?: number;
  /** Who gave the last word, on a thread that was answered: "the receptionist", "your team". */
  by?: string;
  /** When the clock ends this move and what it becomes; `held`, for a draft, is what it becomes if this tab stops it. */
  until?: { atMs: number; then: ThreadMove; held?: ThreadMove };
}

/**
 * How long a reply may still be being worked out: the limit the sweep that finds an unfinished message uses
 * (apps/edge/lib/receptionist/unfinished.ts UNANSWERED_INBOUND_AFTER_MS). Past it, nobody is writing one.
 */
const REPLYING_MS = 3 * MIN_MS;

/** A thread nobody has moved on for this long has gone quiet: People's own number, so it leaves the lists that ask for a move. */
const QUIET_AFTER_MS = QUIET_AFTER_DAYS * DAY_MS;

const atMs = (m: MessageDto): number => Date.parse(messageAt(m));

/** A wait that goes quiet in the end: nobody's next move lasts for ever, so one old thread never sits in a list for good. */
function goesQuiet(move: ThreadMove, sinceMs: number, nowMs: number): ThreadMove {
  const quiet: ThreadMove = { move: "went_quiet", list: "done", sinceMs };
  const at = sinceMs + QUIET_AFTER_MS;
  return nowMs >= at ? quiet : { ...move, until: { atMs: at, then: quiet } };
}

/** What became of what they wrote, as the intake stamped it (00305); nothing while it is still being worked on. */
const handledStamp = (m: MessageDto): unknown => (m.meta ? m.meta.handled : undefined);

/** They wrote last, in their own words: a reply still being worked out, or nobody has answered. */
function theirMove(last: MessageDto, nowMs: number): ThreadMove {
  const sinceMs = atMs(last);
  const unanswered = goesQuiet({ move: "unanswered", list: "escalated", sinceMs }, sinceMs, nowMs);
  // A rule set it aside, or it was held: nothing is coming, whatever the clock says.
  const stamp = handledStamp(last);
  const coming = stamp === undefined || stamp === null || stamp === "ai";
  return coming && nowMs - sinceMs < REPLYING_MS
    ? { move: "replying", list: "waiting", until: { atMs: sinceMs + REPLYING_MS, then: unanswered } }
    : unanswered;
}

/** Whether a call connected after this moment: someone spoke to them since, so that is the last word. A missed call is not. */
const spokenSince = (messages: readonly MessageDto[], sinceMs: number): boolean =>
  messages.some((m) => m.type === "call_summary" && !NEVER_CONNECTED_LINES.includes(m.body ?? "") && atMs(m) > sinceMs);

/**
 * Where a thread nobody holds stands, by who had the last word. `failed` is a campaign's send that failed: its run reports
 * it and nobody here owes it a reply, so it is said only where nothing else asks.
 */
function quietMove(
  dto: ConversationDto,
  last: MessageDto | null,
  failed: MessageDto | null,
  nowMs: number,
): ThreadMove {
  const chat = dto.messages.filter(isChatMessage);
  if (last && spokenSince(dto.messages, atMs(last))) return { move: "call", list: "done" };
  if (last?.direction === "inbound") {
    if (isTheirOwnWords(last)) return theirMove(last, nowMs);
    // A program wrote: an out-of-office over our words waits on the person; a list's mail on its own asks nobody anything.
    const sinceMs = atMs(last);
    return chat.some((m) => m.direction === "outbound" && reachedCustomer(m.status))
      ? goesQuiet({ move: "auto_reply", list: "waiting", sinceMs }, sinceMs, nowMs)
      : { move: "automated", list: "done" };
  }
  if (failed) return { move: "failed", list: "done", sinceMs: atMs(failed) };
  if (!last) {
    return dto.messages.some((m) => m.type === "call_summary")
      ? { move: "call", list: "done" }
      : { move: "nothing", list: "done" };
  }
  const sinceMs = atMs(last);
  if (!dto.last_inbound_at && !chat.some(isTheirOwnWords))
    return goesQuiet({ move: "no_reply", list: "waiting", sinceMs }, sinceMs, nowMs);
  if (isAutomatedSend(last.meta)) return goesQuiet({ move: "sent", list: "waiting", sinceMs }, sinceMs, nowMs);
  const author = messageAuthor(last);
  return { move: "answered", list: "done", ...(author ? { by: author.words } : {}) };
}

/**
 * A reply counting down, over where the thread stands without it: at zero it goes, and is on its way for as long as a
 * reply may be; stopped in this tab, it never was. A draft past its deadline in the read is going out now.
 */
function draftMove(draft: MessageDto, rest: ThreadMove, nowMs: number): ThreadMove {
  const at = draftSendsAtMs(draft);
  const going: ThreadMove =
    nowMs < at + REPLYING_MS
      ? { move: "replying", list: "waiting", until: { atMs: at + REPLYING_MS, then: rest } }
      : rest;
  return nowMs < at ? { move: "sending", list: "escalated", until: { atMs: at, then: going, held: rest } } : going;
}

/**
 * A reply of ours that never reached them: yours to send again, unless a teammate has the thread, who answers for it. Its
 * hold says so where the words are past what the read holds. An open hold stands until someone closes it; a send nobody
 * flagged goes quiet like any wait.
 */
function failedMove(
  standingVerdict: StandingVerdict,
  escalation: EscalationDto | null,
  failed: MessageDto | null,
  nowMs: number,
): ThreadMove | null {
  if (standingVerdict.standing === "theirs") return null;
  if (failed && !isAutomatedSend(failed.meta)) {
    const sinceMs = atMs(failed);
    const move: ThreadMove = { move: "failed", list: "escalated", sinceMs };
    return escalation ? move : goesQuiet(move, sinceMs, nowMs);
  }
  return standingVerdict.standing === "yours" && escalation?.reason === "send_failed"
    ? { move: "failed", list: "escalated", sinceMs: Date.parse(escalation.created_at) }
    : null;
}

/** What a thread somebody flagged asks: a word of the ladder, or null where nobody has it and nothing is open. */
function heldMove(v: StandingVerdict, escalation: EscalationDto | null): ThreadMove | null {
  const since = escalation ? { sinceMs: Date.parse(escalation.created_at) } : {};
  if (v.standing === "yours" && escalation?.reason === "wrote_while_held")
    return { move: "wrote_again", list: "escalated", ...since };
  if (v.standing === "theirs") return { move: "theirs", list: "waiting", ...since };
  if (v.standing === "yours") return { move: "yours", list: "waiting" };
  if (v.standing === "needs_you") return { move: "needs_you", list: "escalated", ...since };
  return null;
}

/**
 * The ladder, first match wins. Snoozed, then filed away (a thread with a hold still open is not), then they asked to
 * stop; then a reply of ours that never reached them; then what a person holds or is asked for; then a reply counting
 * down; then who had the last word.
 */
export function threadMoveOf(dto: ConversationDto, escalation: EscalationDto | null, nowMs: number): ThreadMove {
  const result = standingOfThread(dto, escalation, nowMs);
  if (result.standing === "snoozed") return { move: "snoozed", list: "snoozed" };
  if (dto.state === "archived" && dto.set_aside_at) return { move: "aside", list: "aside" };
  if (dto.state === "archived" && !result.flagged) return { move: "archived", list: "out" };
  if (isOptedOut(dto) && result.standing !== "needs_you") return { move: "stopped", list: "done" };
  const chat = dto.messages.filter(isChatMessage);
  const last = lastExchanged(chat);
  // Our newest words after the last exchange that failed; a reply someone canceled is not a failure.
  const failed =
    [...chat.slice(last ? chat.indexOf(last) + 1 : 0)].reverse().find((m) => m.status === "failed") ?? null;
  const otherFailedMove = failedMove(result, escalation, failed, nowMs) ?? heldMove(result, escalation);
  if (otherFailedMove) return otherFailedMove;
  const rest = quietMove(dto, last, failed, nowMs);
  const draft = heldDraftOf(dto.messages);
  return draft ? draftMove(draft, rest, nowMs) : rest;
}

/** Where a thread stands at this moment: its clock's moves run out, and a reply this tab has held never sends. */
export function threadMoveNow(move: ThreadMove, nowMs: number, held = false): ThreadMove {
  let m = move;
  while (m.until) {
    if (held && m.until.held) m = m.until.held;
    else if (nowMs >= m.until.atMs) m = m.until.then;
    else break;
  }
  return m;
}

/** Whether a move is, or comes to by the clock or a draft held, this one: what a read says ahead of it. */
export function moveComesTo(move: ThreadMove, key: ThreadMoveKey): boolean {
  if (move.move === key) return true;
  if (!move.until) return false;
  return moveComesTo(move.until.then, key) || (!!move.until.held && moveComesTo(move.until.held, key));
}

/** A move as the count of what waits on you reads it (waits.ts threadWait): yours to do, or a reply that can still be stopped. */
export function moveWaits(move: ThreadMove): WaitingThread {
  return move.move === "sending"
    ? { needsYou: false, send: move.until ? { endsAtMs: move.until.atMs } : null }
    : { needsYou: move.list === "escalated", send: null };
}
