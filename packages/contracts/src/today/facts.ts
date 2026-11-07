/**
 * The facts Today's brief reads, computed once over its six inputs: the clock, the wires, the open escalations
 * each read once, the closing windows and the day's calls. today/bands.ts, today/rows.ts and today/queue.ts
 * build the bands from them; today/brief.ts composes the view model.
 */
import { NEEDS_YOU_WORD, standingOfThread, THREAD_MOVE_WORDS } from "../conversations/standing";
import { threadMoveOf, type ThreadMove } from "../waits/thread-move";
import type { CallDto } from "../conversations/call-dto";
import { toCallVM } from "../conversations/call-vm";
import { waitsOnAPerson, YOURS_STILL_WAIT, type EscalationDto } from "../conversations/escalations";
import { threadWaitsOf } from "../conversations/inbox-thread/waits";
import { lastExchanged, messageWords, clipAtWord } from "../conversations/message-words";
import { emailTopicOf } from "../conversations/message-email";
import { contactName } from "../conversations/thread-contact";
import { isOptedOut, type ConversationDto } from "../conversations/thread-dto";
import { waWindow } from "../config/policy/prices";
import { channelKindWords } from "../lines/channels";
import { formatPhoneDisplay } from "../shared/phone";
import type { LeadSearchDto } from "../leads/leads";
import type { PreviewTriedDto } from "../previews/tried";
import { MIN_MS, HOUR_MS } from "../shared/time";
import { tzClock, tzSince } from "./clock";
import type { ReplySpeed } from "../reports/speed";
import { todayReplySpeed, type MetricsSummaryDto } from "./metrics";

/**
 * How much of a customer's own words a queue row carries.
 *
 * It was a bare `.slice(0, 110)`: a hard cut mid-word, with nothing to say a
 * cut had happened, at a length the row could not have shown anyway. The row's
 * line is the only thing that knows how wide it is, so it does the truncating
 * now -- two lines with a real ellipsis -- and this is only a ceiling on what
 * the view model carries, set well past what two lines can draw.
 */
export const QUOTE_MAX = 240;

/** What `toTodayVM` reads: its six inputs as one record, so the facts and every band take one thing. */
interface TodayInput {
  metrics: MetricsSummaryDto;
  conversations: ConversationDto[];
  escalations: Array<EscalationDto & { conversation_id: string }>;
  /** Null: the calls read failed. The card says so rather than counting none. */
  calls: CallDto[] | null;
  now: Date;
  /** Null: the searches were not read; the queue says nothing about them. */
  searches: LeadSearchDto[] | null;
  /**
   * The threads of open holds past the newest page, read by their ids (inbox-thread.ts heldThreadIds), so a hold whose
   * thread is older than the page is judged by its own standing and named, as the Inbox judges it. Empty where none was
   * read; a hold whose thread is in neither list is counted as waiting (unknown is not handled).
   */
  heldThreads: ConversationDto[];
  /** The leads who tried their own receptionist lately (decision 0079), newest first; empty where none was read. */
  previewsTried: PreviewTriedDto[];
}

/**
 * One wire, normalised once for the five things Today says about it: the chips, the count above the work, the
 * alert, the empty queue and the quiet day's proof. The label is channels.ts's, so "sms" cannot reach a page.
 */
interface TodayWire {
  kind: string;
  label: string;
  on: boolean;
  /** Where customers reach it, as a person reads it ("+1 (212) 555-0142", or the address); null with nothing to name it by. */
  where: string | null;
}

/**
 * ONE reading of an open escalation. Ask's rows (needsYou) and the queue's handoff and call-back rows were two
 * derivations of the same list, and they disagreed on a call-back: Ask never saw the to-do the phone receptionist
 * left, and named a caller with no thread "Unknown" where the queue named the call.
 */
export interface EscalationRecord {
  e: EscalationDto & { conversation_id: string };
  conv: ConversationDto | undefined;
  /** A call-back's newest call, when the thread holds one. */
  call: CallDto | null;
  waitedMs: number;
  warn: boolean;
  since: string;
  /** Her own words, never a generated characterization of them. */
  quote: string;
  /** What her email was about, when the words came by email: its subject without "Re:" (emailTopicOf). */
  subject: string | null;
  who: string;
  /** When the free reply window closes, while it is open. */
  closes: string | null;
}

/** The facts every band reads, computed once over the input (today/bands.ts says what each band makes of them). */
export interface TodayFacts extends TodayInput {
  tz: string;
  period: MetricsSummaryDto["period"];
  live: MetricsSummaryDto["now"];
  /** How fast the receptionist replied: the median, or where most replies waited the owner's hold, against it (todayReplySpeed). */
  speed: ReplySpeed | null;
  /** Whether the calls read succeeded; false means the rows omit the phone, and the card says so. */
  callsRead: boolean;
  wires: TodayWire[];
  /**
   * The threads' part of the one count every surface says for "need you" (inbox-thread.ts threadWaitsOf; waits.ts
   * needsYouCount adds the runs): the holds, and the replies counting down that can still be stopped, which have no row.
   */
  waits: { holds: number; sends: number };
  /** How many conversations wait on you: the holds and the held sends. The headline says conversations, so it says this. */
  needsYouCount: number;
  /** The open escalations nobody has taken over, oldest waiting first, each read once. */
  escRecords: EscalationRecord[];
  /** Their threads: the queue's, so nothing on this page is said twice. */
  escSet: Set<string>;
  /** Threads where the customer spoke last and the free-reply window is running out. */
  closingConvs: ConversationDto[];
  /** What the rule owes that no hold's row or closing window says (OwedThread). */
  owed: OwedThread[];
  sinceMs: number;
  callsInWindow: CallDto[];
  callMinutes: number;
  traffic: number;
  /** When the oldest open handoff began, in the salon's words, for the headline's detail. */
  oldest: string | null;
}

/** One normalisation of the wires, for the five things Today says about them. */
function todayWires(m: MetricsSummaryDto): TodayWire[] {
  return m.channels.map((c) => ({
    kind: c.kind,
    label: channelKindWords(c.kind),
    on: c.status === "active",
    // A number as a person reads it, "+1 (212) 555-0142": the quiet day's proof
    // said the column's "+12125550142".
    where: c.address ?? formatPhoneDisplay(c.number),
  }));
}

/**
 * A thread the rule puts in Needs you with no hold's row or closing window's to say so (thread-move.ts): nobody answered what
 * they wrote, a reply of ours never reached them, or the thread itself asks for a person. Today counted only the holds, and
 * the Inbox's tab said more than the badge beside it.
 */
export interface OwedThread {
  conv: ConversationDto;
  move: ThreadMove;
  who: string;
  /** Since the rule says it stood; nothing where it does not say. */
  waitedMs: number;
  /** Why, in the pill's word. */
  word: string;
  /** Their last words, clipped as a row quotes them; none where they never wrote. */
  quote: string;
}

/** What the rule owes, each thread once and the longest wait first; each thread's open hold as the Inbox picks it. */
function owedThreads(
  threads: readonly ConversationDto[],
  escalations: TodayInput["escalations"],
  taken: ReadonlySet<string>,
  now: Date,
): OwedThread[] {
  const holds = new Map(escalations.filter((e) => e.state === "open").map((e) => [e.conversation_id, e]));
  const nowMs = now.getTime();
  return threads
    .filter((c) => !taken.has(c.id))
    .flatMap((conv): OwedThread[] => {
      const move = threadMoveOf(conv, holds.get(conv.id) ?? null, nowMs);
      if (move.list !== "escalated" || move.move === "sending") return [];
      const words = [...conv.messages].reverse().find((m) => m.sender === "customer");
      return [
        {
          conv,
          move,
          who: contactName(conv),
          waitedMs: move.sinceMs === undefined ? 0 : Math.max(0, nowMs - move.sinceMs),
          word: move.move === "unanswered" || move.move === "failed" ? THREAD_MOVE_WORDS[move.move] : NEEDS_YOU_WORD,
          quote: words ? clipAtWord(messageWords(words), QUOTE_MAX) : "",
        },
      ];
    })
    .sort((a, b) => b.waitedMs - a.waitedMs);
}

/**
 * The open escalations the queue holds, oldest waiting first. One rule (standing.ts): a handoff a person has
 * already taken over is theirs, not the queue's, save the two that ask the one holding it for something more
 * (YOURS_STILL_WAIT), which are yours to answer. An escalation whose thread the page did not load keeps its
 * place — unknown is not "handled". A hold that waits on nobody (a customer who asked to stop, opened before decision
 * 0048) is no row: it was told once on the bell, and there is nothing to be done.
 */
function openEscalations(
  escalations: TodayInput["escalations"],
  byConv: Map<string, ConversationDto>,
  now: Date,
): TodayInput["escalations"] {
  return escalations
    .filter((e) => e.state === "open" && waitsOnAPerson(e.reason))
    .filter((e) => {
      const conv = byConv.get(e.conversation_id);
      if (!conv) return true;
      const standing = standingOfThread(conv, e, now.getTime()).standing;
      return standing === "needs_you" || (standing === "yours" && YOURS_STILL_WAIT.has(e.reason));
    })
    .sort((a, b) => a.created_at.localeCompare(b.created_at)); // oldest waiting first
}

/** The newest call a thread holds: a call-back's row opens it, and a call-back with no thread is named by it. */
function newestCallByThread(callDtos: CallDto[]): Map<string, CallDto> {
  const callByConv = new Map<string, CallDto>();
  for (const c of callDtos) {
    if (!c.conversation_id) continue;
    const prev = callByConv.get(c.conversation_id);
    if (!prev || String(c.started_at ?? "") > String(prev.started_at ?? "")) callByConv.set(c.conversation_id, c);
  }
  return callByConv;
}

/** Each open escalation, read once (see EscalationRecord). */
function escalationRecords(
  openEsc: TodayInput["escalations"],
  byConv: Map<string, ConversationDto>,
  callByConv: Map<string, CallDto>,
  tz: string,
  now: Date,
): EscalationRecord[] {
  return openEsc.map((row) => {
    const conv = byConv.get(row.conversation_id);
    const call = row.reason === "callback" ? (callByConv.get(row.conversation_id) ?? null) : null;
    const lastCustomer = conv ? [...conv.messages].reverse().find((x) => x.sender === "customer") : undefined;
    const waitedMs = now.getTime() - new Date(row.created_at).getTime();
    const win = conv ? waWindow(conv.last_wa_inbound_at, now) : null;
    return {
      e: row,
      conv,
      call,
      waitedMs,
      warn: waitedMs > 30 * MIN_MS,
      since: tzSince(row.created_at, tz, now) ?? "",
      // her own words, never a generated characterization of them
      quote: lastCustomer ? clipAtWord(messageWords(lastCustomer), QUOTE_MAX) : "",
      subject: lastCustomer ? emailTopicOf(lastCustomer) : null,
      who: conv
        ? contactName(conv)
        : call
          ? toCallVM(call, tz, now).who
          : row.reason === "callback"
            ? "Unknown caller"
            : "Unknown",
      closes: win?.open ? tzClock(win.closesAtIso, tz, now) : null,
    };
  });
}

/**
 * Threads where the customer spoke last and the free-reply window is running
 * out. Rendered ONLY when at least one qualifies — an empty deadline board
 * manufactures anxiety on a calm day. Never a person who asked to stop: the window is a WhatsApp fact and the row offers a
 * reply, which the box refuses to them (isOptedOut, the one predicate every send path asks). The gate raises a hold only on
 * the STOP message itself, so a later message from the same person reaches here with no hold of its own to keep it out.
 */
function closingConversations(conversations: ConversationDto[], escSet: Set<string>, now: Date): ConversationDto[] {
  return conversations.filter((c) => {
    // Nor a thread put away: an archived thread is nobody's to answer, whatever its window says (the wiring's second
    // audit, S7-8). A snoozed thread, or a teammate's, keeps its row: its window really is closing.
    if (escSet.has(c.id) || isOptedOut(c) || c.state === "archived") return false;
    const last = lastExchanged(c.messages);
    if (!last || last.sender !== "customer") return false;
    const w = waWindow(c.last_wa_inbound_at, now);
    return w.open && w.closesAtIso ? new Date(w.closesAtIso).getTime() - now.getTime() < 6 * HOUR_MS : false;
  });
}

/** The facts, once: what every band below and in today/bands.ts reads. */
export function todayFacts(input: TodayInput): TodayFacts {
  const { metrics, conversations, escalations, calls, now } = input;
  const tz = metrics.workspace.timezone;
  const period = metrics.period;
  const callDtos = calls ?? [];
  // The newest page and the held threads past it: every open hold is judged by its own thread where one was read.
  const threads = [...conversations, ...input.heldThreads];
  const byConv = new Map(threads.map((c) => [c.id, c]));
  const waits = threadWaitsOf(threads, escalations, now);
  const openEsc = openEscalations(escalations, byConv, now);
  const escSet = new Set(openEsc.map((e) => e.conversation_id));
  const closingConvs = closingConversations(conversations, escSet, now);
  const sinceMs = new Date(metrics.window.since).getTime();
  return {
    ...input,
    tz,
    period,
    live: metrics.now,
    speed: todayReplySpeed(metrics),
    // Null: the calls read failed. The card says so rather than counting none.
    callsRead: calls !== null,
    wires: todayWires(metrics),
    waits,
    needsYouCount: waits.holds + waits.sends,
    escRecords: escalationRecords(openEsc, byConv, newestCallByThread(callDtos), tz, now),
    escSet,
    closingConvs,
    owed: owedThreads(threads, escalations, new Set([...escSet, ...closingConvs.map((c) => c.id)]), now),
    sinceMs,
    callsInWindow: callDtos.filter((c) => c.started_at && new Date(c.started_at).getTime() >= sinceMs),
    callMinutes: Math.round(period.call_seconds / 60),
    traffic: period.messages_in + period.calls + period.messages_out_you,
    // The oldest wait among the threads WAITING ON YOU: openEsc is the list the headline's count and its one name are
    // read from, oldest first. The metric's oldest open escalation counts the ones you or a teammate hold and the
    // snoozed too, so the headline paired one person's name with another thread's time ("Ana has been waiting since
    // Aug 29"; the 2 Oct 2026 audit).
    oldest: tzSince(openEsc[0]?.created_at, tz, now),
  };
}
