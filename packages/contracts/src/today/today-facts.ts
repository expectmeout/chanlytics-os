/**
 * The facts Today's brief reads, computed once over its six inputs: the clock, the wires, the open escalations
 * each read once, the closing windows and the day's calls. today-bands.ts, today-rows.ts and today-queue.ts
 * build the bands from them; today-brief.ts composes the view model.
 */
import { standingOf } from "../conversations/standing";
import {
  toCallVM,
  contactName,
  messageWords,
  clipAtWord,
  type ConversationDto,
  type EscalationDto,
  type CallDto,
} from "../conversations/viewmodels";
import { waWindow } from "../config/policy";
import { channelKindWords } from "../lines/channels";
import { formatPhoneDisplay } from "../shared/phone";
import type { LeadSearchDto } from "../leads/leads";
import { MIN_MS, HOUR_MS } from "../shared/time";
import { tzClock, tzSince } from "./today-clock";
import type { MetricsSummaryDto } from "./today-metrics";

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
  who: string;
  /** When the free reply window closes, while it is open. */
  closes: string | null;
}

/** The facts every band reads, computed once over the input (today-bands.ts says what each band makes of them). */
export interface TodayFacts extends TodayInput {
  tz: string;
  period: MetricsSummaryDto["period"];
  live: MetricsSummaryDto["now"];
  /** Whether the calls read succeeded; false means the rows omit the phone, and the card says so. */
  callsRead: boolean;
  /** The salon's own wall clock and calendar day, from `now_local`; empty when it could not be parsed. */
  clock: string;
  datePart: string;
  wires: TodayWire[];
  /** The one number every surface shows for "need you": the Inbox badge counts the same threads by the same rule. */
  needsYouCount: number;
  /** The open escalations nobody has taken over, oldest waiting first, each read once. */
  escRecords: EscalationRecord[];
  /** Their threads: the queue's, so nothing on this page is said twice. */
  escSet: Set<string>;
  /** Threads where the customer spoke last and the free-reply window is running out. */
  closingConvs: ConversationDto[];
  sinceMs: number;
  callsInWindow: CallDto[];
  callMinutes: number;
  traffic: number;
  /** When the oldest open handoff began, in the salon's words, for the headline's detail. */
  oldest: string | null;
}

/**
 * now_local is a naive tenant-local wall clock ("2026-08-27T11:00:19"), so
 * parsing it as a local Date yields the salon's own hour and weekday.
 */
function todayClock(m: MetricsSummaryDto): { clock: string; datePart: string } {
  const localNow = new Date(m.window.now_local);
  const valid = !Number.isNaN(localNow.getTime());
  const clock = valid ? localNow.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
  const datePart = valid
    ? `${localNow.toLocaleDateString("en-US", { weekday: "long" })} · ${localNow.toLocaleDateString("en-US", { month: "long", day: "numeric" })}`
    : "";
  return { clock, datePart };
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
 * The open escalations the queue holds, oldest waiting first. One rule (standing.ts): a handoff a person has
 * already taken over is theirs, not the queue's. An escalation whose thread the page did not load keeps its
 * place — unknown is not "handled".
 */
function openEscalations(
  escalations: TodayInput["escalations"],
  byConv: Map<string, ConversationDto>,
  now: Date,
): TodayInput["escalations"] {
  return escalations
    .filter((e) => e.state === "open")
    .filter((e) => {
      const conv = byConv.get(e.conversation_id);
      if (!conv) return true;
      return (
        standingOf(
          {
            state: conv.state,
            paused_until: conv.paused_until,
            assignee_user_id: conv.assignee_user_id,
            assignee_is_me: conv.assignee_is_me,
            open_escalation: true,
          },
          now.getTime(),
        ).standing === "needs_you"
      );
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
  return openEsc.map((e) => {
    const conv = byConv.get(e.conversation_id);
    const call = e.reason === "callback" ? (callByConv.get(e.conversation_id) ?? null) : null;
    const lastCustomer = conv ? [...conv.messages].reverse().find((x) => x.sender === "customer") : undefined;
    const waitedMs = now.getTime() - new Date(e.created_at).getTime();
    const win = conv ? waWindow(conv.last_wa_inbound_at, now) : null;
    return {
      e,
      conv,
      call,
      waitedMs,
      warn: waitedMs > 30 * MIN_MS,
      since: tzSince(e.created_at, tz, now) ?? "",
      // her own words, never a generated characterization of them
      quote: lastCustomer ? clipAtWord(messageWords(lastCustomer), QUOTE_MAX) : "",
      who: conv
        ? contactName(conv)
        : call
          ? toCallVM(call, tz, now).who
          : e.reason === "callback"
            ? "Unknown caller"
            : "Unknown",
      closes: win?.open ? tzClock(win.closesAtIso, tz, now) : null,
    };
  });
}

/**
 * Threads where the customer spoke last and the free-reply window is running
 * out. Rendered ONLY when at least one qualifies — an empty deadline board
 * manufactures anxiety on a calm day.
 */
function closingConversations(conversations: ConversationDto[], escSet: Set<string>, now: Date): ConversationDto[] {
  return conversations.filter((c) => {
    if (escSet.has(c.id)) return false;
    const last = c.messages[c.messages.length - 1];
    if (!last || last.sender !== "customer") return false;
    const w = waWindow(c.last_wa_inbound_at, now);
    return w.open && w.closesAtIso ? new Date(w.closesAtIso).getTime() - now.getTime() < 6 * HOUR_MS : false;
  });
}

/** The facts, once: what every band below and in today-bands.ts reads. */
export function todayFacts(input: TodayInput): TodayFacts {
  const { metrics, conversations, escalations, calls, now } = input;
  const tz = metrics.workspace.timezone;
  const period = metrics.period;
  const callDtos = calls ?? [];
  const byConv = new Map(conversations.map((c) => [c.id, c]));
  const openEsc = openEscalations(escalations, byConv, now);
  const escSet = new Set(openEsc.map((e) => e.conversation_id));
  const sinceMs = new Date(metrics.window.since).getTime();
  return {
    ...input,
    tz,
    period,
    live: metrics.now,
    // Null: the calls read failed. The card says so rather than counting none.
    callsRead: calls !== null,
    ...todayClock(metrics),
    wires: todayWires(metrics),
    needsYouCount: openEsc.length,
    escRecords: escalationRecords(openEsc, byConv, newestCallByThread(callDtos), tz, now),
    escSet,
    closingConvs: closingConversations(conversations, escSet, now),
    sinceMs,
    callsInWindow: callDtos.filter((c) => c.started_at && new Date(c.started_at).getTime() >= sinceMs),
    callMinutes: Math.round(period.call_seconds / 60),
    traffic: period.messages_in + period.calls + period.messages_out_you,
    oldest: tzSince(metrics.now.oldest_open_escalation_at, tz, now),
  };
}
