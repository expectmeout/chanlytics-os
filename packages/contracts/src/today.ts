import { clockLabel } from "./calendar";
import { standingOf } from "./standing";
/**
 * Today (Slice 4): the morning brief.
 *
 * The rule that shapes every line below: a number that cannot be traced to a
 * row does not appear, and a region with nothing true to say is not rendered
 * at all rather than rendered empty. Zero traffic stated positively — with a
 * timestamp and a channel status — is reassurance; the same morning rendered
 * as four zeroes and a flat sparkline reads as a product that died overnight.
 *
 * Every clock value comes from the SERVER's tenant-local time, never the
 * browser's: the owner of a New York salon checking from Madrid must still be
 * told what time it is at the salon.
 */
import {
  toCallVM,
  abandonedCall,
  spokenDuration,
  contactName,
  contactMeta,
  threadChannelWords,
  messageText,
  messageWords,
  ESCALATION_REASON_LABELS,
  DISCONNECTION_LABELS,
  formatWaited,
  initialsOf,
  type ConversationDto,
  type EscalationDto,
  type CallDto,
} from "./viewmodels";
import { waWindow } from "./policy";
import { ANALYSIS_GRACE_MS } from "./live";
import { NO_NUMBER_REACH, NOTE_WORDS, reasonShort, saidYesTo, type PersonRowVM } from "./people";
import { todayStepsDue, type StepDue } from "./steps";
import { consultationsWithoutProposal, consultsHeldWords, proposalsWaiting, type DealVM } from "./deals";
import { clipAtWord } from "./viewmodels";
import { conversationOfNeedsKey, callOfKey, unreadCount } from "./notifications";
import { channelKindWords, CHANNEL_ANSWERED } from "./channels";
import { EMAIL_NOT_ANSWERED_SENTENCE, type EmailSetupDto } from "./mailbox";

/**
 * One wire a workspace can be reached on.
 *
 * `metrics_summary` answers the ROUTING rows (tenant_channels, 00087). Email
 * is not one of them: a workspace's email line is its `mailboxes` row plus the
 * deployment's mail domain (mailbox.ts), and the domain lives in EMAIL_DOMAIN,
 * which the database cannot see. `emailWires` below puts it in the same list,
 * from the same read Setup and Connections use, so the three cannot disagree.
 */
export interface MetricsChannelDto {
  kind: string;
  /** `tenant_channels.status`: "active" or "disabled"; "active" for a mailbox that exists. */
  status: string;
  /** The phone number customers reach this wire on; null on a wire that is not a number. */
  number: string | null;
  /** Where customers reach a wire that is not a number: the workspace's email address. */
  address?: string | null;
}

/**
 * The email wire, for that list.
 *
 * A workspace HAS email when this deployment has it and the owner has made the
 * mailbox (00129), the judgement `emailSetupFor` already makes for Setup and
 * Connections. Nothing switches a mailbox off, so a mailbox that exists is a
 * wire that is connected: `last_error` is an intake that failed, which
 * Connections tells as "Waiting on us", and a failed intake is not a wire that
 * is down.
 */
export function emailWires(email: EmailSetupDto | null | undefined): MetricsChannelDto[] {
  return email?.ready && email.mailbox
    ? [{ kind: "email", status: "active", number: null, address: email.mailbox.address }]
    : [];
}

export interface MetricsSummaryDto {
  workspace: { name: string; timezone: string; status: string };
  channels: MetricsChannelDto[];
  /**
   * False when the workspace's email line could not be read (server/metrics.ts
   * caught the mailbox read): the count above the work is short by a wire it
   * cannot name, and says so rather than printing a smaller whole. Absent is
   * true, as every payload the database answers is.
   */
  linesRead?: boolean;
  window: { days: number; since: string; since_local: string; now_local: string };
  now: {
    escalations_open: number;
    oldest_open_escalation_at: string | null;
    threads_needing_human: number;
    threads_snoozed: number;
    threads_awaiting_reply: number;
    last_inbound_at: string | null;
    last_outbound_at: string | null;
  };
  period: {
    messages_in: number;
    messages_out_ai: number;
    messages_out_you: number;
    conversations_active: number;
    answered_by_ai: number;
    answered_by_you: number;
    unanswered_in_window: number;
    median_reply_seconds_ai: number | null;
    send_failures: number;
    escalations_new: number;
    escalation_reasons: Record<string, number>;
    calls: number;
    call_seconds: number;
    call_sentiments: Record<string, number>;
    calls_voicemail: number;
    new_contacts: number;
  };
}

export interface TodayNeedsRowVM {
  id: string;
  conversationId: string;
  escalationId: string;
  who: string;
  reason: string;
  waited: string;
  warn: boolean;
  quote: string;
  meta: string;
  windowNote: string | null;
  to: string;
}

export interface TodayCallRowVM {
  id: string;
  who: string;
  at: string;
  duration: string;
  note: string;
  to: string;
}

export interface TodayFactVM {
  label: string;
  value: string;
  hint?: string;
}

export interface TodaySentenceVM {
  text: string;
  /** The day's traffic, which the recap's one line already says. The page prints the line and skips these; Ask still
   *  reads every sentence. */
  traffic?: true;
  /** True for the one line that must never read as calm: a reply that
   *  failed to deliver. */
  warn?: boolean;
  /** The record the sentence is about, when the read holds it: the thread of the newest reply that failed. */
  to?: string;
}

/**
 * One row of the queue on Today, in the strip's grammar (people.ts
 * attentionRow): who, where and when, one sentence, one state line, one
 * verb — and, where the state asks a second thing of you, a second.
 */
export interface TodayQueueRowVM {
  id: string;
  kind: "handoff" | "callback" | "window" | "call";
  /** The thread this row is about; null for a call with no thread. The away card drops a bell row about the same thread. */
  conversationId: string | null;
  /** The call this row is about: a call-back's newest call, a call worth a listen; null otherwise. */
  callId: string | null;
  who: string;
  initials: string;
  /** The wire, in the words a row shows. It was `"WhatsApp" | "Phone"`, which is
   *  what let every escalation row be hard-coded to WhatsApp: the type could
   *  not have held an email even if the code had tried to put one there. */
  channel: "WhatsApp" | "Phone" | "Text" | "Email";
  /** "waited 2h" · "closes 5:10 PM · in 40m" · "2:14 PM · 1:35". */
  when: string;
  sentence: string;
  quoted: boolean;
  status: string[];
  tone: "escalated" | "warn";
  warn: boolean;
  cta: { label: string; to: string };
  also: { label: string; verb: "snooze" | "resolve"; conversationId: string; escalationId: string } | null;
  /** For the order: the longest wait first; a window by how soon it closes; a call last. */
  waitedMs: number;
}

/** Six rows on Today; the rest is a count for the Inbox link. */
export const TODAY_QUEUE_MAX = 6;

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

/** What an empty queue MEANS for this workspace: the colour rides with a glyph and the words. */
export interface TodayQueueEmptyVM {
  title: string;
  /** The queue heading's own words when nothing is waiting: "nothing needs you" only where the receptionist is holding the floor. */
  sub: "nothing in the queue" | "nothing needs you";
  glyph: "alert" | "phone" | "mail" | "check";
  tone: "warn" | "ok" | "";
  testid: string;
}

export type TodayFigureId = "messages" | "answered" | "calls" | "new";

/**
 * One of the day's four figures: the number, its word, the clause always drawn under it, and the why behind it with
 * one door. A receipt adds to its figure and never repeats its number or its clause, so nothing is said twice and
 * nothing an owner needs lives only behind a hover.
 */
export interface TodayFigureVM {
  id: TodayFigureId;
  label: string;
  value: number;
  meta: string;
  receipt: { text: string; door: { label: string; to: string } | null } | null;
}

/** A thread where the customer wrote last and nothing went back for an hour or more, and nobody was handed it. */
export interface TodayNoReplyVM {
  conversationId: string;
  who: string;
  sinceMs: number;
  to: string;
}

/** A message with nothing back for this long is one nobody answered; the receptionist answers in seconds. */
export const NO_REPLY_AFTER_MS = 3_600_000;

export interface TodayVM {
  standing: {
    eyebrow: string;
    chips: Array<{ text: string; ok: boolean }>;
    /**
     * The wires, counted, in one sentence: "2 of 3 lines connected", "no lines
     * connected yet". `down` is true when one of them is off, the dot beside
     * it. The PAGE counted the chips, so the count could not be told about a
     * wire that is not a tenant_channels row, and email was invisible in it.
     */
    lines: { text: string; down: boolean };
    alert: string | null;
    /** Ask reads these three; the page draws none of them. */
    headline: string;
    detail: string | null;
    tone: "needs" | "calm" | "alert";
  };
  /** Ask's rows: the same escalations the queue draws, read once. */
  needsYou: { count: number; hint: string; rows: TodayNeedsRowVM[]; empty: string | null } | null;
  windowClosing: { label: string; hint: string; rows: Array<{ id: string; text: string; to: string }> } | null;
  /** Ask reads the sentences and the facts; the page draws the sentences that are not numbers and the receipts. */
  recap: {
    label: string;
    line: string;
    sentences: TodaySentenceVM[];
    facts: TodayFactVM[];
    receipts: Array<{ at: string; text: string; to: string }>;
  } | null;
  /** The day's own figures, in order: customer messages, answered by the receptionist, calls, new people. Null on a day with nothing at all. */
  figures: TodayFigureVM[] | null;
  /** When the last message arrived and how long the answer took. Always said: on a day with traffic it is the messages figure's clause, on a quiet day the card's line. */
  proof: string;
  /** Who is waiting with nothing back, oldest first, for Worth a look to name. */
  noReply: TodayNoReplyVM[];
  calls: { line: string; rows: TodayCallRowVM[] } | null;
  /** Whether the calls read succeeded; false means the rows above omit the phone, and the card says so. */
  callsRead: boolean;
  /**
   * Everything that asks for a person, in one row grammar, longest wait first: the rows, the rest as a count, what the
   * rows hold in words, and how many people are waiting on you across the whole queue (a handoff, a call-back or a
   * closing window; a call worth a listen is nobody waiting), which Ask's Right now says.
   */
  queue: { rows: TodayQueueRowVM[]; more: number; parts: string[]; empty: TodayQueueEmptyVM; waiting: number };
  quiet: {
    headline: string;
    sub: string;
    proof: Array<{ label: string; value: string }>;
    launchpad: { label: string; to: string } | null;
  } | null;
}

/** "Email", "WhatsApp and Email", "WhatsApp, Texting and Email". (calendar.ts, config.ts and
 *  reports.ts each hold their own copy of this join; one home for it is a tidy of its own.) */
const andList = (xs: readonly string[]): string =>
  xs.length < 3 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

/** Wall-clock time AT THE SALON, whatever clock the reader is holding. */
/**
 * A clock time that says which day when it is not today: "3:30 PM",
 * "tomorrow 6:46 PM", "Wed 9:00 AM". A closing window printed as "6:46 PM"
 * beside "since 6:46 PM" read as the same moment.
 */
export function tzClock(iso: string | null | undefined, tz: string, now: Date): string | null {
  const t = tzTime(iso, tz);
  if (!iso || !t) return t;
  const key = (d: Date) => {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d);
    } catch {
      return d.toDateString();
    }
  };
  const day = key(new Date(iso));
  if (day === key(now)) return t;
  if (day === key(new Date(now.getTime() + 86_400_000))) return `tomorrow ${t}`;
  try {
    return `${new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: tz }).format(new Date(iso))} ${t}`;
  } catch {
    return t;
  }
}

/**
 * When a wait began, said with its day, in the workspace's zone: "8:00 AM"
 * today, "yesterday 8:00 AM", "Fri 8:00 AM" inside a week, "Aug 29, 8:00 AM"
 * beyond it. A bare time on a wait from an earlier day read as last night:
 * Today said "waiting since 6:51 PM" of a customer who had waited eight days.
 */
function tzSince(iso: string | null | undefined, tz: string, now: Date): string | null {
  const t = tzTime(iso, tz);
  if (!iso || !t) return t;
  const dayNumber = (d: Date): number => {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
        .format(d)
        .split("-")
        .map(Number);
      return Date.UTC(parts[0] ?? 1970, (parts[1] ?? 1) - 1, parts[2] ?? 1) / 86_400_000;
    } catch {
      return Math.floor(d.getTime() / 86_400_000);
    }
  };
  const days = dayNumber(now) - dayNumber(new Date(iso));
  if (days <= 0) return t;
  if (days === 1) return `yesterday ${t}`;
  try {
    const within: Intl.DateTimeFormatOptions =
      days < 7 ? { weekday: "short", timeZone: tz } : { month: "short", day: "numeric", timeZone: tz };
    const day = new Intl.DateTimeFormat("en-US", within).format(new Date(iso));
    return days < 7 ? `${day} ${t}` : `${day}, ${t}`;
  } catch {
    return t;
  }
}

function tzTime(iso: string | null | undefined, tz: string): string | null {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: tz,
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

function tzDayAndTime(iso: string | null, tz: string, now: Date): string | null {
  if (!iso) return null;
  const t = tzTime(iso, tz);
  if (!t) return null;
  // The tenant's calendar day, not a 24-hour multiple: at 8 AM, a message
  // from 9:15 AM yesterday is "yesterday", however few hours ago it was.
  const key = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const toUtc = (k: string) => Date.UTC(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10)));
  const days = Math.round((toUtc(key(now)) - toUtc(key(new Date(iso)))) / 86400000);
  if (days < 1) return t;
  if (days === 1) return `yesterday at ${t}`;
  try {
    const d = new Date(iso);
    if (days < 7) {
      const day = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: tz }).format(d);
      return `${day} at ${t}`;
    }
    const md = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: tz }).format(d);
    return `${md} at ${t}`;
  } catch {
    return t;
  }
}

/** "41s" / "1m 12s". Seconds are exact here: this is a measured median. */
function secondsPhrase(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
}

/** "once", "twice", "3 times". */
/** Small counts as words, so a receipt can never repeat its figure's digit: "three times", "Two are already resolved." */
const COUNT_WORDS: Record<number, string> = {
  1: "one",
  2: "two",
  3: "three",
  4: "four",
  5: "five",
  6: "six",
  7: "seven",
  8: "eight",
  9: "nine",
};
const countWord = (n: number): string => COUNT_WORDS[n] ?? String(n);
const timesWords = (n: number): string => (n === 1 ? "once" : n === 2 ? "twice" : `${countWord(n)} times`);

/**
 * Why the receptionist handed a thread over, as the tail of "Handed over once, ...": each reason with the word that
 * joins it. Never more than the data knows: non_text is "something it can't read", not a photo, because it may have
 * been audio, a sticker or a document. A reason with no words here falls back to People's short form.
 */
const REASON_WHY: Record<string, string> = {
  human_token: "because a customer asked for a person",
  non_text: "for something it can't read",
  refusal: "because it declined to answer",
  rate_cap: "because the reply limit was reached",
  policy_block: "because your reply setting held it",
  policy_ask: "for a booking or a question set to Ask me first",
  person_hold: "because it was held for you",
  carriers: "while waiting on carriers",
  email_review: "because they wrote by email",
  send_failed: "because a reply failed to send",
  deadman: "because no answer came in time",
  brain_error: "because it hit an error",
  manual: "because you flagged it",
  opt_out: "because they asked to stop",
  callback: "because they need a call back",
};
const reasonWhy = (r: string): string => REASON_WHY[r] ?? reasonShort(r) ?? r;

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

const capitalize = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** A wire's word inside a sentence: "by WhatsApp", "by email", "by text". */
const wireWord = (w: string): string => (w === "WhatsApp" ? w : w.toLowerCase());

/** Counts by key, most first, then by name; a count that is not a positive number is nothing. */
const counted = (o: Record<string, unknown> | null | undefined): Array<[string, number]> =>
  Object.entries(o ?? {})
    .map(([k, v]): [string, number] => [k, Math.max(0, Math.round(Number(v) || 0))])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

const tally = (xs: readonly string[]): Array<[string, number]> =>
  counted(xs.reduce<Record<string, number>>((o, x) => ({ ...o, [x]: (o[x] ?? 0) + 1 }), {}));

/** A caller the voice provider could not name is counted in the clause, never named in the receipt by these words. */
const UNNAMED_CALLER = new Set(["Caller ID withheld", "Unknown caller", "Unknown"]);

/** How long after the last message the last reply went out, when it did within the hour; null otherwise. */
function replyGapSeconds(live: { last_inbound_at: string | null; last_outbound_at: string | null }): number | null {
  if (!live.last_outbound_at || !live.last_inbound_at) return null;
  const gap = Math.round((new Date(live.last_outbound_at).getTime() - new Date(live.last_inbound_at).getTime()) / 1000);
  return gap > 0 && gap < 3600 ? gap : null;
}

/**
 * The proof the lines are listening: when the last message arrived and how long the receptionist took to answer it.
 * Always said, never gated on the queue: on this workspace (no traffic, three open escalations) it was suppressed
 * exactly when an owner needed it. On a day with traffic it is the messages figure's clause; on a quiet day the
 * card's line, and the quiet card's own sentence ends with it, so the two cannot drift.
 */
export function todayProof(
  live: { last_inbound_at: string | null; last_outbound_at: string | null },
  tz: string,
  now: Date,
): string {
  const lastIn = tzDayAndTime(live.last_inbound_at, tz, now);
  if (!lastIn) return "No messages have arrived yet.";
  const gap = replyGapSeconds(live);
  return `The last message arrived ${lastIn}${gap !== null ? `, and the receptionist answered ${secondsPhrase(gap)} later` : ""}.`;
}

const SENT = ["sent", "delivered", "read"];

/**
 * The day's four figures, from the fields Today has fetched on every load and never read (period.new_contacts,
 * call_sentiments, calls_voicemail, messages_out_ai) and from the threads, calls and escalations the page holds.
 * Null on a day with nothing at all: a row of zeros is a product that died overnight, not a fact.
 *
 * A figure is the SQL's count over the whole day; the page holds the newest hundred threads and the open
 * escalations. So a receipt makes an absolute claim ("All by WhatsApp.", "both on WhatsApp") only when what the page
 * holds accounts for the figure's own total, and otherwise says what it is counting ("Of the 4 in the Inbox: ...").
 */
function figuresOf(
  m: MetricsSummaryDto,
  conversations: ConversationDto[],
  callsInWindow: CallDto[],
  /** The escalations read as it came (state=open): not `openEsc`, which drops the ones a person has taken over. */
  escalations: ReadonlyArray<EscalationDto & { conversation_id: string }>,
  tz: string,
  now: Date,
): TodayFigureVM[] | null {
  const p = m.period;
  const live = m.now;
  if (p.messages_in + p.calls + p.new_contacts === 0) return null;
  const windowMs = new Date(m.window.since).getTime();
  const fresh = (x: { created_at: string; meta: Record<string, unknown> | null }) =>
    x.meta?.backfill !== true && new Date(x.created_at).getTime() >= windowMs;

  // Customer messages: the proof as the clause, the wires as the why. A message with no wire named is WhatsApp, which
  // is what every row was before the column said (viewmodels.ts writtenChannelOf). The receipt says nothing when the
  // read holds none of today's messages, and says what it counted when the read holds fewer than the figure.
  const gap = replyGapSeconds(live);
  const lastAt = tzClock(live.last_inbound_at, tz, now);
  const wires = tally(
    conversations.flatMap((c) =>
      c.messages
        .filter((x) => x.direction === "inbound" && x.sender === "customer" && fresh(x))
        .map((x) => threadChannelWords([x])),
    ),
  );
  const held = wires.reduce((s, [, n]) => s + n, 0);
  const split = andList(wires.map(([w, n]) => `${n} by ${wireWord(w)}`));
  const messages: TodayFigureVM = {
    id: "messages",
    label: "customer messages",
    value: p.messages_in,
    meta: lastAt ? `last at ${lastAt}${gap !== null ? `, answered in ${secondsPhrase(gap)}` : ""}` : "none yet",
    receipt: wires.length
      ? {
          // What the page holds, said once: never "Of the 4 in the Inbox: 4 by WhatsApp."
          text:
            held !== p.messages_in
              ? held === 1
                ? `The one the Inbox holds came by ${wireWord(wires[0][0])}.`
                : wires.length === 1
                  ? `The ${held} the Inbox holds ${held === 2 ? "both" : "all"} came by ${wireWord(wires[0][0])}.`
                  : `Of the ${held} in the Inbox: ${split}.`
              : wires.length === 1
                ? `All by ${wireWord(wires[0][0])}.`
                : `${split}.`,
          door: { label: "Open the Inbox", to: "inbox" },
        }
      : null,
  };

  // Answered by the receptionist: how fast and how often it stopped as the clause; why it stopped and what it sent as
  // the why. The clause is the SQL's count of handovers opened today; the reasons are today's escalations as the page
  // holds them (the open ones: the read is state=open), so a handover already resolved is counted, not named.
  // period.escalation_reasons is every OPEN escalation whatever its age (00037_hygiene.sql), so it is not read here:
  // a clause about today with a breakdown about all time contradicted itself on the first workspace that opened it.
  // The raw read, not the queue's list: a handover a teammate has taken over is still open, not resolved.
  const todays = escalations.filter((e) => e.state === "open" && new Date(e.created_at).getTime() >= windowMs);
  const reasons = tally(todays.map((e) => e.reason));
  const resolved = Math.max(0, p.escalations_new - todays.length);
  const answeredMeta =
    [
      p.median_reply_seconds_ai !== null ? `typically in ${secondsPhrase(p.median_reply_seconds_ai)}` : "",
      p.escalations_new ? `${p.escalations_new} handed over` : p.answered_by_ai ? "none handed over" : "",
    ]
      .filter(Boolean)
      .join(", ") || (p.messages_in ? "none answered yet" : "nothing to answer yet");
  // The why as a person would say it: how many times it handed over, why each time, and that the rest it answered
  // itself. It was a ledger ("Asked for a person: once; sent something the receptionist can't read: once."); the
  // canvas wrote the same facts as a sentence, and a sentence is what an owner reads. Counts are words, so the
  // receipt can never repeat the figure's digit; the handovers are the SQL's count, the reasons are today's open ones.
  const handedOver = p.escalations_new;
  let handovers = "";
  if (handedOver) {
    const lead = `Handed over ${timesWords(handedOver)}`;
    if (!reasons.length) {
      // Every one already resolved: nothing open to give a reason for.
      handovers = `${lead}, ${handedOver === 1 ? "already resolved" : handedOver === 2 ? "both already resolved" : "all already resolved"}.`;
    } else if (reasons.length === 1 && reasons[0][1] === handedOver) {
      // One reason for all of them: "once, because ...", "twice, both times because ...", "three times, each time ...".
      const [r, n] = reasons[0];
      handovers = `${lead}, ${n === 1 ? "" : n === 2 ? "both times " : "each time "}${reasonWhy(r)}.`;
    } else {
      // The breakdown, most common first; what is already resolved is not in the list, so it is said after.
      const parts = reasons.map(([r, n]) => `${timesWords(n)} ${reasonWhy(r)}`).join(", ");
      const done = resolved
        ? ` ${capitalize(countWord(resolved))} ${resolved === 1 ? "is" : "are"} already resolved.`
        : "";
      handovers = `${lead}: ${parts}.${done}`;
    }
  }
  // answered_by_ai is the asks it answered on its own, so with a handover on the day those are "the rest".
  const answeredItself = handedOver && p.answered_by_ai ? "The rest it answered itself." : "";
  // answered_by_ai counts the asks it answered and messages_out_ai the messages it sent: more is more than one thing
  // said, worth a sentence; equal is one reply each, worth saying only when there is nothing else to say; fewer means
  // one reply answered several asks, which is not worth a sentence.
  const sentMore =
    p.messages_out_ai > p.answered_by_ai ? `It sent ${plural(p.messages_out_ai, "message")} in all.` : "";
  const sentEach = p.messages_out_ai && p.messages_out_ai === p.answered_by_ai ? "One reply each." : "";
  const answeredWhy = (handedOver ? [handovers, answeredItself, sentMore] : [sentMore || sentEach]).filter(Boolean);
  const answered: TodayFigureVM = {
    id: "answered",
    label: "answered by the receptionist",
    value: p.answered_by_ai,
    meta: answeredMeta,
    receipt: answeredWhy.length
      ? { text: answeredWhy.join(" "), door: p.escalations_new ? { label: "See the handovers", to: "inbox" } : null }
      : null,
  };

  // Calls: the time and the voicemails as the clause; the moods and who reached voicemail as the why. A caller is
  // named once, by name or number; a withheld or unknown caller is in the clause's count and never in the sentence.
  const moods = counted(p.call_sentiments);
  const moodOf = ([mood, n]: [string, number]) =>
    n === p.calls
      ? p.calls === 1
        ? `it as ${mood.toLowerCase()}`
        : `all of them as ${mood.toLowerCase()}`
      : `${n} as ${mood.toLowerCase()}`;
  const moodWords = moods.length ? `The voice provider read ${andList(moods.map(moodOf))}.` : "";
  const voicemail = [
    ...new Map(
      callsInWindow
        .filter((c) => c.in_voicemail)
        .map((c) => [c.contact_id ?? c.from_e164 ?? c.id, toCallVM(c, tz, now).who]),
    ).values(),
  ].filter((who) => !UNNAMED_CALLER.has(who));
  const voicemailWords = voicemail.length
    ? `${andList(voicemail.length > 3 ? [...voicemail.slice(0, 3), `${voicemail.length - 3} more`] : voicemail)} reached voicemail.`
    : "";
  const callsMeta =
    [
      p.call_seconds > 0
        ? p.call_seconds < 60
          ? "under a minute on the phone"
          : `${Math.round(p.call_seconds / 60)} min on the phone`
        : "",
      p.calls_voicemail ? `${p.calls_voicemail} to voicemail` : "",
    ]
      .filter(Boolean)
      .join(", ") || (p.calls ? "none connected" : "none yet");
  const calls: TodayFigureVM = {
    id: "calls",
    label: "calls",
    value: p.calls,
    meta: callsMeta,
    receipt:
      moodWords || voicemailWords
        ? {
            text: [moodWords, voicemailWords].filter(Boolean).join(" "),
            door: { label: "Open the calls", to: "conversations/phone" },
          }
        : null,
  };

  // New people: the threads whose first real message is the customer's and today. The figure is the SQL's count of
  // contacts created today; the threads the page holds may be fewer (a name is said only for a person the figure
  // counts) or more (someone who existed before and wrote for the first time today is not new), so a wire or a name
  // is said only when the two agree.
  const newThreads = conversations.filter((c) => {
    const first = [...c.messages]
      .filter((x) => x.meta?.backfill !== true)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
    return !!first && first.sender === "customer" && fresh(first);
  });
  const agree = p.new_contacts > 0 && newThreads.length === p.new_contacts;
  const newWires = tally(newThreads.map((c) => threadChannelWords(c.messages)));
  const names = agree ? newThreads.map((c) => contactName(c)) : [];
  const said = names.slice(0, 3);
  const newPeople: TodayFigureVM = {
    id: "new",
    label: "new people",
    value: p.new_contacts,
    meta: !p.new_contacts
      ? "nobody new yet"
      : !agree
        ? "first contact today"
        : newWires.length === 1
          ? `${p.new_contacts === 1 ? "on" : p.new_contacts === 2 ? "both on" : "all on"} ${wireWord(newWires[0][0])}`
          : `on ${andList(newWires.map(([w]) => wireWord(w)))}`,
    // Named when the two counts agree. When they do not, the figure still opens: the reason they disagree IS
    // the answer to what an owner is asking -- the count is every way somebody new reaches you, and the page
    // only holds the ones who wrote. Without this the fourth figure was the one stat on the card with nothing
    // under it, so a hover that worked three times in a row did nothing on the fourth.
    receipt: said.length
      ? {
          text: `${andList(names.length > 3 ? [...said, `${names.length - 3} more`] : said)} wrote for the first time today.`,
          door: { label: "Open People", to: "clients/seg:new_week" },
        }
      : p.new_contacts > 0
        ? {
            text: `Counted however they reached you — a message, a call, or a booking${newThreads.length < p.new_contacts ? ", so not everyone here has a thread to open yet" : ""}.`,
            door: { label: "Open People", to: "clients/seg:new_week" },
          }
        : null,
  };
  return [messages, answered, calls, newPeople];
}

export function toTodayVM(
  m: MetricsSummaryDto,
  conversations: ConversationDto[],
  escalations: Array<EscalationDto & { conversation_id: string }>,
  calls: CallDto[] | null,
  now = new Date(),
): TodayVM {
  const tz = m.workspace.timezone;
  const p = m.period;
  const live = m.now;
  // Null: the calls read failed. The card says so rather than counting none.
  const callsRead = calls !== null;
  const callDtos = calls ?? [];

  // now_local is a naive tenant-local wall clock ("2026-08-27T11:00:19"), so
  // parsing it as a local Date yields the salon's own hour and weekday.
  const localNow = new Date(m.window.now_local);
  const valid = !Number.isNaN(localNow.getTime());
  const clock = valid ? localNow.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
  const datePart = valid
    ? `${localNow.toLocaleDateString("en-US", { weekday: "long" })} · ${localNow.toLocaleDateString("en-US", { month: "long", day: "numeric" })}`
    : "";

  // One normalisation of the wires for the five things Today says about them:
  // the chips, the count above the work, the alert, the empty queue and the
  // quiet day's proof. The label is channels.ts's, so "sms" cannot reach a page.
  const wires = m.channels.map((c) => ({
    kind: c.kind,
    label: channelKindWords(c.kind),
    on: c.status === "active",
    where: c.address ?? c.number ?? null,
  }));
  const chips = wires.map((w) => ({ text: `${w.label} ${w.on ? "connected" : "disconnected"}`, ok: w.on }));
  const down = wires.filter((w) => !w.on);
  const on = wires.filter((w) => w.on);
  const up = on.length;
  // The count lives here because the sentence has a number in it. The page
  // counted its own chips, which is why "2 of 2 lines connected" was said on a
  // workspace with three. A wire that could not be read is not a smaller
  // whole: the line says so instead of a count that is short by one.
  const lines = {
    text:
      m.linesRead === false
        ? "the email line could not be counted"
        : wires.length
          ? `${up} of ${wires.length} ${wires.length === 1 ? "line" : "lines"} connected`
          : "no lines connected yet",
    down: down.length > 0,
  };

  // The alert is the one place Today raises its voice, and it SUPPRESSES every
  // reassuring line — "nothing needs you" is a lie while the number is dark.
  const alert =
    m.workspace.status === "paused"
      ? "This workspace is paused — the receptionist is not answering anything."
      : down.length
        ? `${andList(down.map((w) => w.label))} ${down.length > 1 ? "are" : "is"} disconnected — messages coming in are not being answered.`
        : null;

  // What an empty queue means HERE. The page chose between three of these by
  // counting chips: an email-only workspace was told nothing could come in,
  // and counting email would have told it the receptionist was answering on
  // its own, which it does not do for email. The heading's own words ride
  // with it, so the two are decided once.
  const answered = on.filter((w) => CHANNEL_ANSWERED.has(w.kind));
  const queueEmpty: TodayQueueEmptyVM =
    m.workspace.status === "paused"
      ? {
          title: "Nothing in the queue — the workspace is paused, so nothing is being answered.",
          sub: "nothing in the queue",
          glyph: "alert",
          tone: "warn",
          testid: "today-queue-empty-paused",
        }
      : down.length
        ? {
            title: "Nothing in the queue — new messages go unanswered until the line is back.",
            sub: "nothing in the queue",
            glyph: "alert",
            tone: "warn",
            testid: "today-queue-empty-down",
          }
        : wires.length === 0
          ? {
              title: "Nothing in the queue — nothing can come in until a line is connected.",
              sub: "nothing in the queue",
              glyph: "phone",
              tone: "",
              testid: "today-queue-empty-unconnected",
            }
          : answered.length === 0
            ? on.every((w) => w.kind === "email")
              ? {
                  title: `Nothing in the queue. ${EMAIL_NOT_ANSWERED_SENTENCE}`,
                  sub: "nothing in the queue",
                  glyph: "mail",
                  tone: "",
                  testid: "today-queue-empty-unanswered",
                }
              : {
                  title: "Nothing in the queue — no line the receptionist answers is connected.",
                  sub: "nothing in the queue",
                  glyph: "phone",
                  tone: "",
                  testid: "today-queue-empty-unanswered",
                }
            : {
                title: "All caught up — the receptionist is answering on its own.",
                sub: "nothing needs you",
                glyph: "check",
                tone: "ok",
                testid: "today-queue-empty-ok",
              };

  const byConv = new Map(conversations.map((c) => [c.id, c]));
  const openEsc = escalations
    .filter((e) => e.state === "open")
    // One rule (standing.ts): a handoff a person has already taken over is
    // theirs, not the queue's. An escalation whose thread the page did not
    // load keeps its place — unknown is not "handled".
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
  // The one number every surface shows for "need you": the Inbox badge counts
  // the same threads by the same rule.
  const needsYouCount = openEsc.length;

  const sinceMs = new Date(m.window.since).getTime();
  const callsInWindow = callDtos.filter((c) => c.started_at && new Date(c.started_at).getTime() >= sinceMs);
  const callMinutes = Math.round(p.call_seconds / 60);

  // The newest call a thread holds: a call-back's row opens it, and a call-back with no thread is named by it.
  const callByConv = new Map<string, CallDto>();
  for (const c of callDtos) {
    if (!c.conversation_id) continue;
    const prev = callByConv.get(c.conversation_id);
    if (!prev || String(c.started_at ?? "") > String(prev.started_at ?? "")) callByConv.set(c.conversation_id, c);
  }
  const say = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "");

  // ONE reading of each open escalation. Ask's rows (needsYou) and the queue's handoff and call-back rows were two
  // derivations of the same list, and they disagreed on a call-back: Ask never saw the to-do the phone receptionist
  // left, and named a caller with no thread "Unknown" where the queue named the call.
  const escRecords = openEsc.map((e) => {
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
      warn: waitedMs > 30 * 60000,
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

  const needsRows: TodayNeedsRowVM[] = escRecords.map((r) => ({
    id: `th-${r.e.conversation_id}`,
    conversationId: r.e.conversation_id,
    escalationId: r.e.id,
    who: r.who,
    reason: ESCALATION_REASON_LABELS[r.e.reason] ?? r.e.reason,
    waited: formatWaited(r.waitedMs),
    warn: r.warn,
    // The customer's words; for a call-back with none, the to-do the phone receptionist left.
    quote: r.quote || (r.e.reason === "callback" ? say(r.e.details) : ""),
    // A call-back is the phone's, whatever wire the thread's words travelled; the queue's row says "Phone" too.
    meta:
      r.e.reason === "callback"
        ? r.conv
          ? contactMeta(r.conv, "Phone")
          : "Phone"
        : r.conv
          ? contactMeta(r.conv, threadChannelWords(r.conv.messages))
          : "WhatsApp",
    windowNote: r.closes ? `Reply window closes ${r.closes}` : null,
    to: `inbox/th-${r.e.conversation_id}`,
  }));

  // Threads where the customer spoke last and the free-reply window is running
  // out. Rendered ONLY when at least one qualifies — an empty deadline board
  // manufactures anxiety on a calm day.
  const escSet = new Set(openEsc.map((e) => e.conversation_id));
  const closingConvs = conversations.filter((c) => {
    if (escSet.has(c.id)) return false;
    const last = c.messages[c.messages.length - 1];
    if (!last || last.sender !== "customer") return false;
    const w = waWindow(c.last_wa_inbound_at, now);
    return w.open && w.closesAtIso ? new Date(w.closesAtIso).getTime() - now.getTime() < 6 * 3600 * 1000 : false;
  });
  const closingRows = closingConvs.map((c) => {
    const w = waWindow(c.last_wa_inbound_at, now);
    const mins = w.closesAtIso
      ? Math.max(1, Math.round((new Date(w.closesAtIso).getTime() - now.getTime()) / 60000))
      : 0;
    return {
      id: `wc-${c.id}`,
      text: `${contactName(c)} — window closes ${tzClock(w.closesAtIso, tz, now) ?? "soon"} (in ${formatWaited(mins * 60000)})`,
      to: `inbox/th-${c.id}`,
    };
  });

  // Who is waiting with nothing back: the customer wrote last an hour ago or more, nobody replied, nobody holds the
  // thread (the one rule, standing.ts: a thread a person paused or claimed is not waiting on nobody), and no queue
  // row is about it (an escalation's thread and a closing window's thread are the queue's; nothing on this page is
  // said twice). The identity was in the conversations read all along and only the count survived into the view model.
  const closingSet = new Set(closingConvs.map((c) => c.id));
  const noReply: TodayNoReplyVM[] = conversations
    .flatMap((c) => {
      // Archived is filed away, which standingOf reads as quiet; it is not waiting on anybody.
      if (escSet.has(c.id) || closingSet.has(c.id) || c.state === "archived") return [];
      const { standing } = standingOf(
        {
          state: c.state,
          paused_until: c.paused_until,
          assignee_user_id: c.assignee_user_id,
          assignee_is_me: c.assignee_is_me,
          open_escalation: false,
        },
        now.getTime(),
      );
      if (standing !== "quiet" && standing !== "needs_you") return [];
      const last = c.messages[c.messages.length - 1];
      if (!last || last.sender !== "customer") return [];
      const lastMs = new Date(last.created_at).getTime();
      if (now.getTime() - lastMs < NO_REPLY_AFTER_MS) return [];
      return [{ conversationId: c.id, who: contactName(c), sinceMs: lastMs, to: `inbox/th-${c.id}` }];
    })
    .sort((a, b) => a.sinceMs - b.sinceMs);

  const proof = todayProof(live, tz, now);
  const figures = figuresOf(m, conversations, callsInWindow, escalations, tz, now);

  const traffic = p.messages_in + p.calls + p.messages_out_you;
  const isQuiet = traffic === 0 && needsYouCount === 0 && !alert;

  // Ask's four facts. A zero is a real measurement, and "—" is a real "not enough data yet"; never a delta, a
  // percentage or a sparkline: a jump from 1 message to 3 is not "+200%".
  const facts: TodayFactVM[] = [
    { label: "Messages in", value: String(p.messages_in) },
    { label: "Answered by the receptionist", value: `${p.answered_by_ai} of ${p.messages_in}` },
    p.median_reply_seconds_ai === null
      ? { label: "Typical reply time", value: "—", hint: "Not enough replies yet" }
      : { label: "Typical reply time", value: secondsPhrase(p.median_reply_seconds_ai) },
    { label: "Calls", value: p.calls ? `${p.calls}${callMinutes ? ` · ${callMinutes} min` : ""}` : "0" },
  ];
  // The day's traffic as one sentence, for Ask; the page draws the figures instead.
  const trafficParts: string[] = [];
  if (p.messages_in > 0) {
    trafficParts.push(
      `${p.messages_in} message${p.messages_in === 1 ? "" : "s"} in, ${p.answered_by_ai} answered by the receptionist${
        p.median_reply_seconds_ai === null ? "" : `, typically in ${secondsPhrase(p.median_reply_seconds_ai)}`
      }`,
    );
  }
  if (p.calls) {
    trafficParts.push(
      `${p.calls} call${p.calls === 1 ? "" : "s"}${callMinutes ? `, ${callMinutes} minute${callMinutes === 1 ? "" : "s"}` : ""}`,
    );
  }
  const trafficLine = trafficParts.length ? `${trafficParts.join(". ")}.` : "Nothing has come in yet today.";

  /* ---- the quiet day: prove we are listening, don't show a row of zeroes ---- */
  if (isQuiet) {
    const names = andList(wires.map((w) => w.label));
    const pluralVerb = wires.length > 1 ? "are" : "is";
    // A workspace with no wire yet is a new owner's first Today — it must not
    // read " is connected." with nothing in front of it, and it must not name
    // the only two wires this sentence used to know about.
    const sub =
      wires.length === 0
        ? "No line is connected yet, so nothing can come in."
        : `${names} ${pluralVerb} connected. ${proof}`;
    return {
      standing: {
        eyebrow: `${datePart} · ${clock} · ${m.workspace.name}`,
        chips,
        lines,
        alert: null,
        headline: "Nothing has come in yet today.",
        detail: null,
        tone: "calm",
      },
      needsYou: null,
      windowClosing: null,
      recap: { label: "Today so far", line: "Nothing has come in yet today.", sentences: [], facts, receipts: [] },
      figures: null,
      proof,
      noReply,
      calls: null,
      callsRead,
      queue: { rows: [], more: 0, parts: [], empty: queueEmpty, waiting: 0 },
      quiet: {
        headline: "Nothing has come in yet today.",
        sub,
        proof: [
          ...(wires.length === 0 ? [{ label: "Lines", value: "none connected yet" }] : []),
          ...wires.map((w) => ({
            label: w.label,
            // "on" / "off" in the owner's words, never the column's value. A
            // wire with nothing to name it by says only that: "connected · on"
            // was two words for one fact.
            value: w.where ? `${w.where} · ${w.on ? "on" : "off"}` : w.on ? "on" : "off",
          })),
          { label: "Checked", value: "just now" },
        ],
        launchpad: conversations.length
          ? {
              label: `Nothing waiting. ${conversations.length} earlier conversation${
                conversations.length === 1 ? "" : "s"
              } →`,
              to: "conversations",
            }
          : null,
      },
    };
  }

  /* ---- headline ladder: first match wins ---- */
  const oldest = tzSince(live.oldest_open_escalation_at, tz, now);
  let headline: string;
  let detail: string | null = null;
  let tone: "needs" | "calm" | "alert" = "calm";

  if (alert) {
    headline = "Check your connection before anything else.";
    tone = "alert";
  } else if (needsYouCount > 1) {
    headline = `${needsYouCount} conversations need you.`;
    if (oldest) detail = `The oldest has been waiting since ${oldest}.`;
    tone = "needs";
  } else if (needsYouCount === 1) {
    headline = "One conversation needs you";
    const who = needsRows[0]?.who;
    if (who && oldest) detail = `${who} has been waiting since ${oldest}.`;
    tone = "needs";
  } else {
    const bits: string[] = [];
    if (p.messages_in) {
      bits.push(
        `${p.messages_in} message${p.messages_in === 1 ? "" : "s"}${
          p.conversations_active
            ? ` from ${p.conversations_active} ${p.conversations_active === 1 ? "person" : "people"}`
            : ""
        }`,
      );
    }
    if (p.calls) bits.push(`${p.calls} call${p.calls === 1 ? "" : "s"}`);
    // "Handled everything" only when the receptionist did: a message you
    // answered yourself, or one nobody answered, is not the receptionist's.
    const allByReceptionist = p.unanswered_in_window === 0 && p.messages_out_you === 0;
    headline = bits.length
      ? allByReceptionist
        ? `The receptionist handled everything — ${bits.join(" and ")} today. Nothing needs you.`
        : `${bits.join(" and ")} today. Nothing needs you right now.`
      : "Nothing needs you.";
    if (p.median_reply_seconds_ai !== null && p.messages_in > 0) {
      detail = `It answered ${p.answered_by_ai} of the ${p.messages_in} on its own, typically in about ${secondsPhrase(
        p.median_reply_seconds_ai,
      )}.`;
    }
  }

  /* ---- Ask's recap sentences: only what the HEADLINE does not already say. When nothing needs you, the headline
     is "The receptionist handled everything — N messages and M calls", so repeating those counts here would be the
     brief reading its own first line back. When something DOES need you, the headline is spent on that. ---- */
  const sentences: TodaySentenceVM[] = [];
  const headlineCoversTraffic = tone === "calm" && !alert;
  if (p.answered_by_ai && !headlineCoversTraffic) {
    sentences.push({
      // Not "the WhatsApp receptionist": answered_by_ai is first_replies with
      // no channel predicate (00037_hygiene.sql), so an email it answered is
      // in this count. Every other sentence in this file already says just
      // "the receptionist".
      text: `The receptionist answered ${p.answered_by_ai} message${p.answered_by_ai === 1 ? "" : "s"}${
        p.conversations_active
          ? ` from ${p.conversations_active} ${p.conversations_active === 1 ? "person" : "people"}`
          : ""
      }.`,
      traffic: true,
    });
  }
  if (p.calls && !headlineCoversTraffic) {
    sentences.push({
      text: `${p.calls} caller${p.calls === 1 ? "" : "s"} reached the phone line${
        callMinutes ? ` — ${callMinutes} minute${callMinutes === 1 ? "" : "s"} total` : ""
      }.`,
      traffic: true,
    });
  }
  if (p.messages_out_you) {
    sentences.push({ text: `You sent ${p.messages_out_you} repl${p.messages_out_you === 1 ? "y" : "ies"} yourself.` });
  }
  // A reply that never reached the customer is the one line that must never be
  // quiet — the send already escalated, but a card saying "handled everything"
  // while a message died in transit would be a lie of omission.
  if (p.send_failures) {
    // The thread of the newest reply that failed, when the conversations read holds it: "See the thread"
    // opened the Inbox list, where the owner had to go looking.
    const lastFailed = conversations
      .flatMap((c) =>
        c.messages
          .filter(
            (x) =>
              x.direction === "outbound" &&
              x.status === "failed" &&
              x.meta?.backfill !== true &&
              new Date(x.created_at).getTime() >= sinceMs,
          )
          .map((x) => ({ conv: c, at: x.created_at })),
      )
      .sort((a, b) => b.at.localeCompare(a.at))[0];
    sentences.push({
      text: `${p.send_failures} repl${p.send_failures === 1 ? "y" : "ies"} failed to deliver — the customer got no answer.`,
      warn: true,
      ...(lastFailed ? { to: `inbox/th-${lastFailed.conv.id}` } : {}),
    });
  }

  // Receipts quote the message that actually went out. She is spot-checking
  // tone, not reading a report — a summary of the reply defeats the purpose.
  //
  // Backfilled rows are excluded for the same reason the SQL excludes them:
  // their created_at is the moment the IMPORT ran, so the first live load
  // rendered weeks-old replies as "sent at 1:59 AM today". A receipt whose
  // timestamp is wrong is worse than no receipt.
  const receipts = conversations
    .flatMap((c) =>
      c.messages
        .filter(
          (x) =>
            x.direction === "outbound" &&
            SENT.includes(String(x.status)) &&
            x.meta?.backfill !== true &&
            new Date(x.created_at).getTime() >= sinceMs,
        )
        .map((x) => ({ conv: c, msg: x })),
    )
    .sort((a, b) => b.msg.created_at.localeCompare(a.msg.created_at))
    .slice(0, 3)
    .map(({ conv, msg }) => ({
      at: tzTime(msg.created_at, tz) ?? "",
      text: `replied to ${contactName(conv)}: “${messageText(msg).slice(0, 90)}”`,
      to: `inbox/th-${conv.id}`,
    }));

  /* ---- calls worth an ear: rows ONLY for the ones that need one.
     A call that went fine is a line in the aggregate, not a row demanding
     attention — the whole point of the region is that it stays short. ---- */
  const NEEDS_EAR = ["dial_no_answer", "inactivity", "concurrency_limit_reached", "marked_as_spam"];
  const callRows: TodayCallRowVM[] = callsInWindow
    // A dial that never connected is not a call, so it is not a call worth an ear.
    .filter((c) => c.status !== "not_connected")
    .map((c) => ({ c, vm: toCallVM(c, tz, now) }))
    .filter(
      ({ c, vm }) =>
        vm.live ||
        c.in_voicemail ||
        c.sentiment === "Negative" ||
        !c.summary ||
        // Somebody rang and left with nothing. Measured before writing this:
        // with a provider summary the row was not worth an ear at all, since
        // `user_hangup` is not in NEEDS_EAR and rightly so — every ordinary
        // call ends that way. Without one it did arrive, as "No summary from
        // the voice provider", which reads as our glitch rather than as the
        // day's one lost customer whose number the business already has.
        abandonedCall(c) ||
        (c.disconnection_reason ? NEEDS_EAR.includes(c.disconnection_reason) : false),
    )
    .map(({ c, vm }) => {
      const endedMs = c.ended_at ? new Date(c.ended_at).getTime() : NaN;
      const analysisDue = !c.summary && Number.isFinite(endedMs) && now.getTime() - endedMs < ANALYSIS_GRACE_MS;
      return {
        id: c.id,
        who: vm.who,
        at: tzTime(c.started_at, tz) ?? "",
        duration: vm.duration ?? "",
        note: vm.live
          ? "In progress right now"
          : c.in_voicemail
            ? "Reached voicemail"
            : // BEFORE the summary branches, deliberately. A caller gone in six
              // seconds has no summary and never will have much of one, so the
              // chain below would have said "summary on its way" and buried the
              // only fact worth acting on.
              abandonedCall(c)
              ? `Hung up after ${spokenDuration(c.duration_ms)} — they left with nothing`
              : c.sentiment === "Negative"
                ? "Caller sentiment: Negative — the voice provider's own read"
                : analysisDue
                  ? "Summary on its way from the voice provider"
                  : !c.summary
                    ? "No summary from the voice provider"
                    : (DISCONNECTION_LABELS[c.disconnection_reason ?? ""] ?? "Ended early"),
        to: vm.live ? "live" : `conversations/cv-${c.id}`,
      };
    });

  /* ---- the queue: everything that asks for a person, in one row grammar.
     The longest wait first; a closing window by how soon it closes; a call
     worth an ear last. Six on Today, the rest a count for the Inbox link. ---- */
  const queueAll: TodayQueueRowVM[] = [];
  for (const r of escRecords) {
    const e = r.e;
    if (e.reason === "callback") {
      // The phone receptionist could not finish it: the to-do it left is the
      // sentence, the call itself is where the verb goes, Done resolves it.
      queueAll.push({
        id: `q-${e.id}`,
        kind: "callback",
        conversationId: e.conversation_id,
        callId: r.call ? r.call.id : null,
        who: r.who,
        initials: initialsOf(r.who),
        channel: "Phone",
        when: `waited ${formatWaited(r.waitedMs)}`,
        sentence: say(e.details) || "The caller needs a call back.",
        quoted: false,
        status: ["Needs a call back", `since ${r.since}`],
        tone: "escalated",
        warn: r.warn,
        cta: { label: "Open the call", to: r.call ? `conversations/cv-${r.call.id}` : `inbox/th-${e.conversation_id}` },
        also: { label: "Done", verb: "resolve", conversationId: e.conversation_id, escalationId: e.id },
        waitedMs: r.waitedMs,
      });
      continue;
    }
    queueAll.push({
      id: `q-${e.id}`,
      kind: "handoff",
      conversationId: e.conversation_id,
      callId: null,
      who: r.who,
      initials: initialsOf(r.who),
      channel: r.conv ? threadChannelWords(r.conv.messages) : "WhatsApp",
      when: `waited ${formatWaited(r.waitedMs)}`,
      sentence: r.quote || (ESCALATION_REASON_LABELS[e.reason] ?? e.reason),
      quoted: !!r.quote,
      status: [
        "Escalated",
        reasonShort(e.reason) || e.reason,
        `since ${r.since}`,
        ...(r.closes ? [`reply window closes ${r.closes}`] : []),
      ],
      tone: "escalated",
      warn: r.warn,
      cta: { label: "Open and reply", to: `inbox/th-${e.conversation_id}` },
      also: { label: "Snooze", verb: "snooze", conversationId: e.conversation_id, escalationId: e.id },
      waitedMs: r.waitedMs,
    });
  }
  for (const c of closingConvs) {
    const w = waWindow(c.last_wa_inbound_at, now);
    const leftMs = w.closesAtIso ? Math.max(60000, new Date(w.closesAtIso).getTime() - now.getTime()) : 0;
    const last = [...c.messages].reverse().find((x) => x.sender === "customer");
    const who = contactName(c);
    queueAll.push({
      // "WhatsApp" is right here even when the last written message came by
      // email: the row is about WhatsApp's window (waWindow on the thread's
      // last WhatsApp inbound), which is the one wire that has one. The
      // handoff row above names the wire the reply would go out on instead.
      id: `q-w-${c.id}`,
      kind: "window",
      conversationId: c.id,
      callId: null,
      who,
      initials: initialsOf(who),
      channel: "WhatsApp",
      when: `closes ${tzClock(w.closesAtIso, tz, now) ?? "soon"} · in ${formatWaited(leftMs)}`,
      sentence: last
        ? clipAtWord(messageWords(last), QUOTE_MAX)
        : "They wrote last, and the free reply window is closing.",
      quoted: !!last,
      status: ["Reply window closing", "they wrote last"],
      tone: "warn",
      warn: leftMs < 2 * 3600000,
      cta: { label: "Open thread", to: `inbox/th-${c.id}` },
      also: null,
      // After every escalation (which waited ≥ 0), the soonest to close first.
      waitedMs: -leftMs,
    });
  }
  for (const r of callRows) {
    if (r.to === "live") continue;
    const c = callsInWindow.find((k) => k.id === r.id);
    const wanted = say(c?.wanted);
    queueAll.push({
      id: `q-c-${r.id}`,
      kind: "call",
      conversationId: c?.conversation_id ?? null,
      callId: r.id,
      who: r.who,
      initials: initialsOf(r.who),
      channel: "Phone",
      when: `${r.at}${r.duration ? ` · ${r.duration}` : ""}`,
      sentence: wanted || r.note,
      quoted: false,
      status: [wanted ? r.note : "Worth a listen"],
      tone: "warn",
      warn: false,
      cta: { label: "Open the call", to: r.to },
      also: null,
      waitedMs: Number.NEGATIVE_INFINITY,
    });
  }
  queueAll.sort((a, b) => b.waitedMs - a.waitedMs);
  const countOf = (...kinds: TodayQueueRowVM["kind"][]) => queueAll.filter((r) => kinds.includes(r.kind)).length;
  const needN = countOf("handoff", "callback");
  const winN = countOf("window");
  const earN = countOf("call");
  const parts = [
    needN ? `${needN} need you` : "",
    winN ? `${winN} reply window${winN === 1 ? "" : "s"} closing` : "",
    earN ? `${earN} call${earN === 1 ? "" : "s"} worth a listen` : "",
  ].filter(Boolean);
  const queue = {
    rows: queueAll.slice(0, TODAY_QUEUE_MAX),
    more: Math.max(0, queueAll.length - TODAY_QUEUE_MAX),
    parts,
    empty: queueEmpty,
    waiting: needN + winN,
  };

  return {
    standing: {
      eyebrow: `${datePart} · ${clock} · ${m.workspace.name}`,
      chips,
      lines,
      alert,
      headline,
      detail,
      tone,
    },
    needsYou: {
      count: needsYouCount,
      hint: "The receptionist stopped and asked for a human.",
      rows: needsRows,
      empty: needsRows.length
        ? null
        : p.unanswered_in_window === 0 && p.messages_out_you === 0
          ? "Nothing needs you. The receptionist answered every message that came in, and nobody asked for a person."
          : "Nothing needs you right now — nobody asked for a person.",
    },
    windowClosing: closingRows.length
      ? {
          label: "Reply window closing",
          hint: "WhatsApp only lets you write freely for 24 hours after someone messages you. After that it's an approved template.",
          rows: closingRows,
        }
      : null,
    recap: { label: "Today so far", line: trafficLine, sentences, facts, receipts },
    figures,
    proof,
    noReply,
    callsRead,
    calls: p.calls
      ? {
          line: `${p.calls} call${p.calls === 1 ? "" : "s"} today${
            callMinutes ? ` · ${callMinutes} minute${callMinutes === 1 ? "" : "s"}` : ""
          }.`,
          rows: callRows,
        }
      : null,
    queue,
    quiet: null,
  };
}

/* ------------------------------ the day ---------------------------------- */

/** What the day module reads, as the calendar surface publishes it. Minimal on purpose: the page hands the surface in. */
export interface DayFrameLike {
  key: string;
  long: string;
  today: boolean;
  past: boolean;
  closed: { yes: boolean; note: string | null };
  blocks: Array<{
    id: string;
    t: number;
    dur: number;
    time: string;
    title: string;
    /** The title with the person's name taken out of it (calendar.ts serviceOf). */
    service: string;
    person: { id: string; name: string } | null;
  }>;
  allDay: Array<{
    id: string;
    t: number;
    dur: number;
    time: string;
    title: string;
    /** The title with the person's name taken out of it (calendar.ts serviceOf). */
    service: string;
    person: { id: string; name: string } | null;
  }>;
  windows: Array<{ label: string }>;
}
export interface CalendarLike {
  days: DayFrameLike[];
  /** The clock now, as hours in the business's zone (14.5 is 2:30 PM). */
  now: number;
  feed: { state: "ok" | "unavailable" | "none" };
  stats: { next: string };
}
/** A playbook card as the playbooks surface publishes it. */
export interface PlaybookCardLike {
  trigger: string;
  state: string;
  candidates: number;
  next: string;
}

export interface TodayDayItemVM {
  id: string;
  /** "2 PM" · "10:15 AM" · "All day" — the column. */
  start: string;
  /** "2 – 5 PM" — the whole span, for the hover. */
  time: string;
  /** "3h" · "1h 30m" · "45m"; empty for all-day. */
  dur: string;
  title: string;
  /** What it is FOR, with the person's name taken out of the title (calendar.ts serviceOf): the row names them
   *  once. "Gloss" from "Gloss · Emily Chen". */
  service: string;
  person: { id: string; name: string } | null;
  allDay: boolean;
  /** Where it sits against the clock, today only: past · now · next · later. */
  phase: "past" | "now" | "next" | "later";
  /** The person's open thread, when they have one: "Needs you — in Inbox". */
  flag: string | null;
}

export interface TodayDayFrameVM {
  key: string;
  /** "Today · Sunday, September 6" */
  label: string;
  today: boolean;
  past: boolean;
  closed: { yes: boolean; note: string | null };
  items: TodayDayItemVM[];
  /** "2 booked", and "1 needs you" when a person on the day has an open thread. */
  summary: { booked: string; flagged: string | null } | null;
  /** The windows the receptionist would offer, as labels; none on a closed or past day. */
  open: string[];
  /** How many of the day's entries the cap left out, and the line that says so ("2 more on the Calendar"). */
  more: number;
  moreLine: string | null;
}

/** "45m" · "1h" · "1h 30m" */
export function durationLabel(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

const FLAG_WORDS: Record<string, string> = {
  needs_you: "Needs you — in Inbox",
  waiting_on_you: "Waiting on you — in Inbox",
};

export interface TodayDayVM {
  feed: "ok" | "unavailable" | "none";
  frames: TodayDayFrameVM[];
  nextOpening: string | null;
  /** The visit playbooks' line — what goes out and when — or the offer to start one. */
  reminders: { text: string; to: string } | null;
}

/** Rows on Today's day card; the Calendar has the rest. */
export const TODAY_DAY_MAX = 5;

/**
 * The `max` entries worth the card: everything still to come first, then what is over, most recent first, back in the
 * day's order. At ten with seven appointments the eight o'clock goes before anything ahead does.
 */
function capDay(items: TodayDayItemVM[], max: number): TodayDayItemVM[] {
  if (items.length <= max) return items;
  const keep = new Set<string>();
  for (const i of items) if (i.phase !== "past" && keep.size < max) keep.add(i.id);
  for (const i of [...items].reverse()) if (i.phase === "past" && keep.size < max) keep.add(i.id);
  return items.filter((i) => keep.has(i.id));
}

/**
 * Today and tomorrow, as the calendar reads them: who is coming and when,
 * what is open, what is closed — and the visit playbooks' line. Nothing here
 * is derived from a message; the calendar is the source, the playbooks say
 * what they will do about it.
 */
export function todayDay(
  cal: CalendarLike | null,
  playbooks: PlaybookCardLike[] | null,
  /** People's rows, for the red line: a person on the day whose thread needs someone. */
  people: { rows: Array<{ id: string; state: string }> } | null = null,
  max = TODAY_DAY_MAX,
): TodayDayVM {
  if (!cal) return { feed: "none", frames: [], nextOpening: null, reminders: null };
  const feed = cal.feed.state;
  const idx = cal.days.findIndex((d) => d.today);
  const picked = idx >= 0 ? cal.days.slice(idx, idx + 2) : [];
  const stateOf = new Map((people?.rows ?? []).map((r) => [r.id, r.state]));
  const item = (
    b: DayFrameLike["blocks"][number],
    allDay: boolean,
    phase: TodayDayItemVM["phase"],
  ): TodayDayItemVM => ({
    id: b.id,
    start: allDay ? "All day" : clockLabel(b.t),
    time: b.time,
    dur: allDay ? "" : durationLabel(b.dur),
    title: b.title,
    service: b.service,
    person: b.person ? { id: b.person.id, name: b.person.name } : null,
    allDay,
    phase,
    flag: b.person ? (FLAG_WORDS[stateOf.get(b.person.id) ?? ""] ?? null) : null,
  });
  const frames: TodayDayFrameVM[] = picked.map((d) => {
    // Against the clock, today only: what is over, what is on now, the one
    // coming next. Tomorrow is all "later"; an all-day entry has no place on
    // the rail.
    let nextTaken = false;
    const timed = [...d.blocks]
      .sort((a, b) => a.t - b.t)
      .map((b) => {
        let phase: TodayDayItemVM["phase"] = "later";
        if (d.today) {
          const end = b.t + b.dur / 60;
          if (end <= cal.now) phase = "past";
          else if (b.t <= cal.now) phase = "now";
          else if (!nextTaken) {
            phase = "next";
            nextTaken = true;
          }
        }
        return item(b, false, phase);
      });
    const items = [...d.allDay.map((b) => item(b, true, "later")), ...timed];
    const flagged = items.filter((i) => i.flag).length;
    const shown = capDay(items, max);
    const more = items.length - shown.length;
    return {
      key: d.key,
      label: `${d.today ? "Today" : "Tomorrow"} · ${d.long}`,
      today: d.today,
      past: d.past,
      closed: d.closed,
      items: shown,
      more,
      moreLine: more ? `${more} more on the Calendar` : null,
      summary: items.length
        ? {
            booked: `${items.length} booked`,
            flagged: flagged ? `${flagged} need${flagged === 1 ? "s" : ""} you` : null,
          }
        : null,
      open: d.closed.yes || d.past ? [] : d.windows.map((w) => w.label),
    };
  });
  let reminders: TodayDayVM["reminders"] = null;
  if (feed === "ok") {
    const visit = (playbooks ?? []).filter(
      (p) => (p.trigger === "visit_tomorrow" || p.trigger === "visited") && p.state === "running",
    );
    reminders =
      visit.length === 0
        ? {
            text: "No visit reminders yet — a playbook can text the day before an appointment and the day after a visit.",
            to: "outbound",
          }
        : {
            text: visit
              .map(
                (p) =>
                  `${p.trigger === "visit_tomorrow" ? "Visit reminder" : "After the visit"}: ${p.candidates} ${p.candidates === 1 ? "person" : "people"} · next run ${p.next}`,
              )
              .join(" · "),
            to: "outbound",
          };
  }
  return { feed, frames, nextOpening: feed === "ok" && cal.stats.next !== "—" ? cal.stats.next : null, reminders };
}

/* -------------------------------- the period ------------------------------ */

/** A Reports tile as Reports builds it; the page draws it with Reports' own component. */
export interface WeekTileLike {
  id: string;
  label: string;
  value: string;
  meta: string;
  delta: { text: string; tone: "pos" | "neg" | "" } | null;
  spark: number[];
  /** The period before, in counts ("up from 99"), as Reports says it; null with nothing to compare. */
  compare?: string | null;
}
/** What the Reports surface publishes, as far as Today reads it. */
export interface ReportsLike {
  vm: {
    days: number;
    rangeLabel: string;
    since: string;
    until: string;
    empty: boolean;
    tiles: WeekTileLike[];
    /** Who answered the period's customer messages: `none` is the number nobody ever answered. */
    answered?: { totals: { in: number; ai: number; you: number; none: number }; share?: number | null };
    /** Why the receptionist stopped, most common first — the period's "driven by". */
    reasons?: Array<{ id: string; label: string; value: number }>;
    /** The reply time as Reports computes it; the period line says the median once. */
    replyTime?: { count: number; medianLabel: string };
    /** Reports' own words for the period ("Last 7 days"), so the foot line never spells them a second time. */
    period?: { now: string };
    /** Reports' own count of the period's calls: a number, never a tile's formatted value. */
    calls?: { total: number };
  };
  /** Null: the offers' read failed on its own and the receptionist's own numbers still stand (the bridge's D9 catch). */
  campaigns: { tiles: WeekTileLike[]; empty: boolean } | null;
  booking: { present: boolean; headline: string; sub: string; pct: number | null; asked?: number; booked?: number };
}

/**
 * The last seven (or thirty, or ninety) days in one sentence at the foot of the day's card, with a door to Reports,
 * which was rebuilt on 19 September to carry exactly this material. Every number is one Reports prints, read from the
 * view model Reports itself draws and never derived a second time here: its period words (`period.now`), the messages
 * tile's comparison in counts, its `answered.share` rounded as its tile rounds it, its `calls.total`. Not its median
 * reply: that is Reports' own figure, and with it the foot ran three lines on a phone (22 Sep). "Messages", not
 * "customer messages": the card's figure above already says whose. It never reads `campaigns`: that read fails on its
 * own (#686), and a period line that dereferenced it took the whole page down.
 */
export function todayPeriodLine(r: ReportsLike | null): { text: string; to: "reports" } | null {
  if (!r || !r.vm) return null;
  const v = r.vm;
  const lead = v.period?.now ?? `Last ${v.rangeLabel}`;
  if (v.empty) return { text: `${lead}: nobody wrote or called.`, to: "reports" };
  const a = v.answered;
  if (!a) return null;
  const messages = v.tiles.find((t) => t.id === "messages");
  const parts = [
    `${a.totals.in} message${a.totals.in === 1 ? "" : "s"}${messages?.compare ? ` (${messages.compare})` : ""}`,
  ];
  if (a.share !== undefined && a.share !== null)
    parts.push(`${Math.round(a.share * 100)}% answered by the receptionist`);
  const callCount = v.calls ? v.calls.total : 0;
  if (callCount) parts.push(`${callCount} call${callCount === 1 ? "" : "s"}`);
  return { text: `${lead}: ${parts.join(", ")}.`, to: "reports" };
}

/* ------------------------------ the runs' words ------------------------------ */

/** A broadcast or a playbook's run as the broadcasts surface publishes it (toBroadcastVM), as far as the words read it. */
export interface RunLike {
  state: string;
  recipient_count: number;
  /** "today 9:00 AM" / "Sep 12 · 10:00 AM", by the business's clock (toBroadcastVM). */
  when: string;
  counts: { sent: number; replied: number };
}

export interface TodayRunWordsVM {
  /** "3 people" */
  people: string;
  /** A run waiting for a word. */
  waiting: { sentence: string; status: string[] };
  /** A run under the veto window: scheduled, not yet sending. */
  soon: { meta: string; sentence: string; status: string[] };
  /** A run that went out today: what it earned so far, and whether it is still sending. */
  done: { counts: string; still: boolean };
}

/**
 * Every sentence with a number the queue and the day's card say about a playbook's run. The page kept seven of
 * them (dashboard-a-command.jsx, dashboard-a-brief.jsx); the rule that a number's sentence lives in contracts was
 * stated in this file's own header and enforced next door on Reports. The page keeps deciding WHICH rows wait, are
 * scheduled or went out today; it composes none of their words. The words are sentences now ("3 people. Nothing
 * sends until you say so."), where the page had a middle dot and no capital.
 */
export function todayRunWords(r: RunLike): TodayRunWordsVM {
  const people = `${r.recipient_count} ${r.recipient_count === 1 ? "person" : "people"}`;
  const sent = `${r.counts.sent} sent`;
  return {
    people,
    waiting: { sentence: `${people}. Nothing sends until you say so.`, status: ["Waiting for your approval"] },
    soon: {
      meta: `Playbook · sends ${r.when}`,
      sentence: `${people}. Stop it if you'd rather not.`,
      status: ["Scheduled", `sends ${r.when}`],
    },
    done: { counts: r.counts.replied ? `${sent}, ${r.counts.replied} replied` : sent, still: r.state === "sending" },
  };
}

/** "2 runs waiting" beside the queue's own parts; null when none waits. */
export function todayRunsSub(n: number): string | null {
  return n ? `${n} run${n === 1 ? "" : "s"} waiting` : null;
}

/**
 * The toast when a waiting run is approved: the audience's name, which the page sets in bold, then who it reaches
 * and when it really goes (bcWhenWords). Two parts, so the page keeps its typography without composing the number.
 */
export function todayRunApproved(label: string, n: number, when: string): { lead: string; rest: string } {
  return { lead: label, rest: `approved: ${n} ${n === 1 ? "person" : "people"}, ${when}` };
}

/** A People list as the People surface publishes it. */
export interface JourneyListLike {
  id: string;
  label: string;
  group: string;
  count: number;
  action: { text: string; cta: string; to: string; enabled: boolean } | null;
}
/* ------------------------------ worth a look ----------------------------- */

/**
 * The few things this page holds that no row on it says on its own.
 *
 * Every one of them is a RE-PRINT: the numbers are the ones Reports and
 * People already publish, said together so the shape shows. "18 wrote or
 * called" sits on Reports and "17 asked, never booked" sits on People, and
 * neither page can tell you they are the same eighteen people. Nothing here
 * is counted twice, and nothing here is a trend -- a period over a period is
 * noise at these counts (reports.ts dropped tile deltas for exactly that).
 */
export type TodayLeakId =
  "never-booked" | "unanswered" | "consults-waiting" | "proposals-waiting" | "unreachable" | "quiet";

export interface TodayLeakVM {
  id: TodayLeakId;
  /** A look, never a failure: amber where a person should look, blue for what waits on someone else. */
  tone: "warn" | "info";
  /** The tone as a word, so severity never rides on colour alone: "Booking gap", "No reply", "Reach", "Gone quiet". */
  tag: string;
  /** The tone's icon (the legacy Icon set). */
  icon: "calendar" | "alert" | "users" | "clock";
  /** The problem, in one sentence, with the number in it. */
  text: string;
  /** The arithmetic behind the sentence, so nobody has to take it on faith. */
  math: string;
  /**
   * Who the row names, up to two, each with where a press goes and the words it says on hover. The unanswered row
   * names who is waiting NOW with nothing back, the threads Today holds: not the count's own subjects (the count is
   * Reports' over its period), so its lead says "Waiting now" and never draws them as the people the sentence counts.
   * The consultations row names the count's own people, the first two the Pipeline lists, each to their page.
   */
  people: Array<{ id: string; name: string; to: string; title: string }>;
  /** The words in front of `people`, which say who they are; null on a row that names nobody. */
  peopleLead: string | null;
  /** What "Ask why" asks: the row's own sentence and its arithmetic. Ask grounds every citation in what it read. */
  ask: string;
  /** The door. */
  cta: { label: string; to: string };
  /** The act, when the list this is about has one it can actually run. */
  also: { label: string; to: string } | null;
}

/** The rows that made the cut, how many qualified past the cap, and the line that says so ("and 2 more"). */
export interface TodayLeaksVM {
  rows: TodayLeakVM[];
  more: number;
  moreLine: string | null;
}

/** What People publishes, as far as this reads it. */
export interface PeopleListsLike {
  lists: JourneyListLike[];
  aggregates?: { total: number };
  /**
   * Everyone the lists are counted from: whether anybody said yes to offers is theirs to say, a number or not; their
   * deal and when they last wrote, for the proposals waiting (0004); and who they are and when their last
   * consultation ended, for the consultations with no proposal yet (0008), where the surface carries them.
   */
  rows: ReadonlyArray<
    Pick<PersonRowVM, "consent"> & Partial<Pick<PersonRowVM, "id" | "name" | "deal" | "askedMs" | "consultedMs">>
  >;
  /** Whether deals are on here (dealsAreOn, 0008): the consultations and the proposals waiting are rows only then. */
  dealsOn?: boolean;
  /**
   * When People was read and its rows worked out: the deal rows are counted at that moment, as the Pipeline counts
   * the same rows (pipeline-scope.jsx), so the two pages never say two numbers for one list.
   */
  fetchedAt?: number;
}

/** At most this many; the rest is not an insight, it is a list. */
export const TODAY_LEAK_MAX = 2;

/**
 * In this order, and the order is the point: the first four all cost a
 * customer, and the one that costs more of them comes first. A person who
 * asked and never got onto the calendar is the business's whole purpose
 * missed; a message nobody answered is one conversation; a consultation with
 * no proposal after it is a step the business has not taken (0008), and a
 * proposal waiting past a week is one the customer has not answered (0004),
 * so the business's own step comes first. Then the two that cost a chance
 * rather than a customer.
 */
const LEAK_ORDER: readonly TodayLeakId[] = [
  "never-booked",
  "unanswered",
  "consults-waiting",
  "proposals-waiting",
  "unreachable",
  "quiet",
];

// The arithmetic was written to sit under the sentence ("of 21 in the last 30 days"); as a sentence of its own it takes a capital.
const askWhy = (text: string, math: string): string => `${text} ${capitalize(math)}. Why is that?`;

export function todayLeaks(
  reports: ReportsLike | null,
  people: PeopleListsLike | null,
  /** Who is waiting with nothing back, from the day's view model (`noReply`); the unanswered row names two of them. */
  noReply: readonly TodayNoReplyVM[] = [],
  max = TODAY_LEAK_MAX,
  nowMs = Date.now(),
): TodayLeaksVM {
  const found = new Map<TodayLeakId, TodayLeakVM>();
  const list = (id: string) => (people ? (people.lists.find((l) => l.id === id) ?? null) : null);
  const step = (id: string) => {
    const l = list(id);
    return l && l.action && l.action.enabled && l.count > 0 ? { label: l.action.cta, to: l.action.to } : null;
  };

  const b = reports ? reports.booking : null;
  // Five is the floor: two people who did not book is a quiet week, not a leak.
  if (reports && b && b.present && b.pct !== null && (b.asked ?? 0) >= 5 && b.pct <= 25) {
    const asked = b.asked ?? 0;
    const booked = b.booked ?? 0;
    const never = list("asked_never_booked");
    const text =
      booked === 0
        ? `${asked} people wrote or called in the last ${reports.vm.rangeLabel}. Not one of them is on the calendar.`
        : `Only ${booked} of the ${asked} people who wrote or called in the last ${reports.vm.rangeLabel} got onto the calendar.`;
    const math = never ? `${b.headline} · ${never.count} on Asked, never booked` : b.headline;
    found.set("never-booked", {
      id: "never-booked",
      tone: "warn",
      tag: "Booking gap",
      icon: "calendar",
      text,
      math,
      people: [],
      peopleLead: null,
      ask: askWhy(text, math),
      cta: { label: "See who", to: never ? `clients/seg:${never.id}` : "clients" },
      also: step("asked_never_booked"),
    });
  }

  const a = reports && reports.vm.answered ? reports.vm.answered.totals : null;
  // Two, not one: a single message nobody answered can be a wrong number or a
  // STOP, and this rule has no act to offer, only a door to Reports where the
  // tile already prints the figure. Two is a pattern. The count is Reports'
  // over its period; the names are the threads waiting right now.
  if (reports && a && a.none >= 2) {
    const text = `${a.none} customer message${a.none === 1 ? "" : "s"} never got an answer at all.`;
    const math = `of ${a.in} in the last ${reports.vm.rangeLabel} · the receptionist answered ${a.ai}, you answered ${a.you}`;
    found.set("unanswered", {
      id: "unanswered",
      tone: "warn",
      tag: "No reply",
      icon: "alert",
      text,
      math,
      people: noReply
        .slice(0, 2)
        .map((r) => ({ id: r.conversationId, name: r.who, to: r.to, title: `Open ${r.who}'s thread` })),
      peopleLead: "Waiting now",
      ask: askWhy(text, math),
      cta: { label: "Open Reports", to: "reports" },
      also: null,
    });
  }

  // The deal rows are counted at the moment People's rows were worked out, as the Pipeline counts the same rows: one
  // clock, so the two pages say one number.
  const dealsAt = (people && people.fetchedAt) || nowMs;

  // A consultation that ended in the last week with no proposal after it is the next step nobody has taken (0008). One
  // is enough, as a proposal waiting is. The rule is contracts' consultationsWithoutProposal over the rows People
  // holds, the rows, the rule and the clock the Pipeline counts its Consultations by, so the number is the Pipeline's,
  // re-printed in its own sentence (consultsHeldWords). The names are the count's own people, the first two the rule
  // gives, as the Pipeline lists them, each to their page. Amber, as a person should look (#928). Only where deals are
  // on (0008).
  const consultRows = (people?.rows ?? []).filter(
    (r): r is typeof r & Pick<PersonRowVM, "id" | "name" | "deal" | "consultedMs"> =>
      typeof r.id === "string" && typeof r.name === "string" && "deal" in r && "consultedMs" in r,
  );
  const held = consultationsWithoutProposal(consultRows, dealsAt);
  if (people && people.dealsOn && held.length >= 1) {
    const n = held.length;
    const text = `${n} consultation${n === 1 ? "" : "s"} in the last week ended with no proposal yet.`;
    const math = `${consultsHeldWords(n)} · on Pipeline`;
    found.set("consults-waiting", {
      id: "consults-waiting",
      tone: "warn",
      tag: "Next step",
      icon: "calendar",
      text,
      math,
      people: held
        .slice(0, 2)
        .map((r) => ({ id: r.id, name: r.name, to: `clients/${r.id}`, title: `Open ${r.name} in People` })),
      peopleLead: "Held with",
      ask: askWhy(text, math),
      cta: { label: "See who", to: "clients/pipeline" },
      also: null,
    });
  }

  // A proposal out past a week with nothing back costs a customer who was one step from yes (0004). One is enough: an
  // agency sends a few a month. The rule is contracts' proposalsWaiting; the count is over the rows People holds. Only
  // where deals are on (0008): a workspace whose customers book keeps whatever deals it has out of sight.
  const dealRows = (people?.rows ?? []).filter(
    (r): r is typeof r & { deal: DealVM | null; askedMs: number | null } => "deal" in r && "askedMs" in r,
  );
  const waiting = proposalsWaiting(dealRows, dealsAt);
  const po = list("proposal_out");
  if (people && people.dealsOn && waiting.length >= 1) {
    const text = `${waiting.length} proposal${waiting.length === 1 ? "" : "s"} went out more than a week ago with nothing back.`;
    const math = po ? `${po.count} on Proposal out · nothing heard since it went` : "nothing heard since it went";
    found.set("proposals-waiting", {
      id: "proposals-waiting",
      tone: "warn",
      tag: "Waiting",
      icon: "clock",
      text,
      math,
      people: [],
      peopleLead: null,
      ask: askWhy(text, math),
      cta: { label: "See who", to: po ? `clients/seg:${po.id}` : "clients" },
      also: null,
    });
  }

  // A yes to hearing from the business is not a yes to an offer, and a list
  // nobody can be mailed reads as a broken composer one screen later.
  const yes = list("opted_in");
  const offers = list("offers_ok");
  // Three, for the same reason: one person who said yes is not yet a list.
  if (people && yes && offers && yes.count >= 3 && offers.count === 0) {
    // Nobody can be sent an offer, and that has two causes (#663): nobody said yes to offers, or the ones who did --
    // anyone in the workspace, as a broadcast to everyone counts them (#811) -- have no number to send one to. Only
    // the first is a yes to go and get; the second is said with People's reason, and with no door to the QR, which
    // would ask them for an answer they gave.
    const noNumber = people.rows.some((r) => saidYesTo(r, "marketing"));
    const text = `${yes.count} ${yes.count === 1 ? "person has" : "people have"} said yes to messages, but ${noNumber ? "nobody can be sent an offer yet" : "nobody has said yes to offers"}.`;
    const math = `${noNumber ? NO_NUMBER_REACH : "a broadcast reaches only the second yes"} · 0 can receive one`;
    found.set("unreachable", {
      id: "unreachable",
      tone: "warn",
      tag: "Reach",
      icon: "users",
      text,
      math,
      people: [],
      peopleLead: null,
      ask: askWhy(text, math),
      cta: { label: "Open People", to: `clients/seg:${yes.id}` },
      also: !noNumber && yes.action && yes.action.enabled ? { label: yes.action.cta, to: yes.action.to } : null,
    });
  }

  const quiet = list("quiet");
  if (quiet && quiet.count >= 5) {
    const text = `${quiet.count} people have not heard from you in 30 days.`;
    const math = people && people.aggregates ? `of ${people.aggregates.total} in People` : "on the Quiet 30+ days list";
    found.set("quiet", {
      id: "quiet",
      tone: "info",
      tag: "Gone quiet",
      icon: "clock",
      text,
      math,
      people: [],
      peopleLead: null,
      ask: askWhy(text, math),
      cta: { label: "See who", to: `clients/seg:${quiet.id}` },
      also: step("quiet"),
    });
  }

  const all = LEAK_ORDER.map((id) => found.get(id)).filter((x): x is TodayLeakVM => !!x);
  const more = Math.max(0, all.length - max);
  // A third problem is counted, never dropped in silence; the page draws this line, it does not compose it.
  return { rows: all.slice(0, max), more, moreLine: more ? `and ${more} more` : null };
}

/* --------------------------- while you were away ------------------------- */

/** A bell row as the bell publishes it, as far as this reads it. */
export interface AwayRowLike {
  id?: string;
  key?: string;
  kind?: string;
  unread: boolean;
  title: string;
  message: string;
  tone: "" | "ok" | "warn";
  icon: string;
  about?: { type: string; id: string } | null;
  /** Where the row's button goes (the bell's rows carry it as actions[0].to): a held draft is keyed by its message and names its thread only here. */
  to?: string;
  actions?: Array<{ to: string }>;
}

/** What a queue row is about, for the away card's dedupe: its thread, its call, or both. A bare string is a thread. */
export type AwayQueueRef =
  string | { conversationId?: string | null; callId?: string | null; runLabel?: string | null };

/**
 * The title the edge gives a run held for a word: `Playbook “Win-back · quiet 30 days” is ready: 1 person`
 * (core run-playbook.ts). The row carries no `about` and its door is `outbound`, so the run's own name is
 * the only thing it shares with the queue's row about the same run.
 */
const readyRunTitle = (label: string) => `Playbook “${label}” is ready`;

export interface AwayGroupVM<T extends AwayRowLike> {
  /** The row itself when it stands alone; the newest of the group otherwise. */
  row: T;
  /** How many rows this stands for. 1 is an ordinary row. */
  count: number;
  /** The group's words when it stands for more than one. */
  title: string | null;
  /** Every row it swallowed, so read and dismiss reach all of them. */
  ids: string[];
}

/**
 * One noun per kind: a group of like rows says how many, and links where all
 * of them live. A kind with no noun here never groups, so a new kind of alert
 * shows itself rather than being counted into a total nobody can read. Never
 * derived from the kind's spelling.
 */
const AWAY_NOUN: Record<string, [one: string, many: string]> = {
  call: ["call", "calls"],
  job_failed: ["job did not finish", "jobs did not finish"],
  review: ["new rating on Google", "new ratings on Google"],
  calendar_people: ["person added from your calendar", "people added from your calendar"],
  handoff: ["conversation needs you", "conversations need you"],
  playbook: ["playbook is ready", "playbooks are ready"],
  // One sync can approve several at once, and several rejections read as one
  // problem with the wording, not as five separate pieces of news.
  template_ready: ["template is ready to send", "templates are ready to send"],
  template_blocked: ["template cannot be sent", "templates cannot be sent"],
  // "A broadcast finished" is already this repo's word for the event
  // (activity.ts, kind broadcast.sent), so the bell and the Activity log say
  // the same thing about the same fact.
  broadcast_sent: ["broadcast finished", "broadcasts finished"],
  broadcast_stopped: ["broadcast did not go out", "broadcasts did not go out"],
  note_for_you: ["note left for you", "notes left for you"],
  // A search that stopped to ask: it waits a day for the answer, then stops and keeps what it found.
  leads_question: ["search is waiting for your answer", "searches are waiting for your answer"],
};

/** A warning outranks good news, whatever their clocks say. */
const AWAY_TONE_RANK: Record<string, number> = { warn: 0, "": 1, ok: 2 };

/** Two of a kind is already a pattern; one is news. */
const AWAY_GROUP_MIN = 2;

/** Nothing unread anywhere: the one state this card may congratulate. */
const AWAY_EMPTY_CLEAR = "All caught up.";

/**
 * Nothing to draw, but the bell is not empty: every unread row is a
 * conversation the queue at the top of this page is already showing.
 *
 * Beside a bell of 4 this card printed a green check and "All caught up."
 * -- a congratulation over four unread things, and the plainest untrue
 * sentence on the page.
 */
const AWAY_EMPTY_QUEUED = "Everything new is already in the queue above.";

/**
 * The foot.
 *
 * Every row it counts IS in the bell -- the ones under the cap and the ones
 * this card dropped because the queue above already has them -- which is
 * what makes the sentence true. It used to count only the first kind and say
 * "in the bell" about it, so a card showing five of seven unread rows, two of
 * them queued, drew no foot at all while the bell held two more.
 *
 * The number comes first in every wording: the head is this number plus what
 * is on screen, and that is what a reader (and e2e/signals.ts) adds up. With
 * no row drawn there is no foot: the head has said the number and the empty
 * line has said where they are, and a card says each number once.
 */
function awayFoot(more: number, queued: number, drew: boolean): string | null {
  if (more <= 0 || !drew) return null;
  const head = `${more} more in the bell`;
  if (queued <= 0) return head;
  return queued === more
    ? `${head}, already in the queue above`
    : `${head}, ${queued} of them already in the queue above`;
}

/** The away card: the rows it draws, the numbers beside them, and every sentence it says. */
export interface TodayAwayVM<T extends AwayRowLike> {
  /** What it draws, grouped and capped. */
  groups: Array<AwayGroupVM<T>>;
  /**
   * The head's number: EVERY unread row the bell holds, including the ones
   * this card does not draw. The card and the badge are two readings of one
   * set, and a head counting only what survived the queue rule read 0 beside
   * a bell of 4. "Mark all read" sits against this number and clears exactly
   * this set.
   */
  total: number;
  /** Of `total`, how many are not on screen: under the cap, or in the queue above. */
  more: number;
  /** Of `more`, the ones dropped because the queue above already holds what they are about: their thread or their call. */
  queued: number;
  /** The foot, when a row is drawn and something unread is not on screen. */
  foot: string | null;
  /** What the card says when it draws no row, and the glyph beside it. */
  empty: { icon: string; text: string } | null;
}

/**
 * What happened while the owner was away, as Today reads it rather than as
 * the bell lists it.
 *
 * Three rules, and each one was a real page: a row about anything already sitting
 * in the queue at the top of this page (its thread or its call) is NOT repeated here; twelve calls
 * from the same line become one row that says twelve, because five identical
 * "No conversation happened" cards pushed a WhatsApp quality downgrade and
 * three failed jobs off the bottom; and a warning sorts above good news, so
 * the downgrade is not outranked by a five-star rating that landed later.
 */
export function todayAwayGrouped<T extends AwayRowLike>(
  rows: readonly T[],
  inQueue: readonly AwayQueueRef[] = [],
  max = 5,
): TodayAwayVM<T> {
  const convs = new Set(
    inQueue.flatMap((q) => {
      const id = typeof q === "string" ? q : q.conversationId;
      return id ? [id] : [];
    }),
  );
  const callsQueued = new Set(inQueue.flatMap((q) => (typeof q === "string" || !q.callId ? [] : [q.callId])));
  const runsQueued = inQueue.flatMap((q) => (typeof q === "string" || !q.runLabel ? [] : [readyRunTitle(q.runLabel)]));
  const idOf = (r: T) => r.id ?? r.key ?? "";
  // A row about a conversation says so in three different ways, and only one of
  // them is `about`. A KEPT row (the edge wrote it) carries the subject; a
  // DERIVED "needs you" row is computed from the Inbox this browser holds and
  // carries nothing but its key; a DERIVED held draft is keyed by its message
  // and names its thread only through its door. A call is a kept row's subject
  // or a derived missed call's key. Reading `about` alone printed the three
  // conversations at the top of the page again, here; reading the thread key
  // alone covered two of the queue's four kinds, so a closing window's thread
  // printed again and a call's row never could be covered.
  const door = (r: T) => r.to ?? (r.actions && r.actions[0] ? r.actions[0].to : undefined);
  const aboutQueued = (r: T) => {
    // A run waiting for a word is a row of the queue; the bell's "is ready" about the same run says it again.
    if (r.kind === "playbook" && runsQueued.some((title) => r.title.startsWith(title))) return true;
    if (r.about && r.about.type === "conversation" && convs.has(r.about.id)) return true;
    if (r.about && r.about.type === "call" && callsQueued.has(r.about.id)) return true;
    const cv = conversationOfNeedsKey(idOf(r));
    if (cv !== null && convs.has(cv)) return true;
    const call = callOfKey(idOf(r));
    if (call !== null && callsQueued.has(call)) return true;
    const to = door(r);
    return !!to && to.startsWith("inbox/th-") && convs.has(to.slice("inbox/th-".length));
  };
  const fresh = rows.filter((r) => r.unread && !aboutQueued(r));

  const order: string[] = [];
  const byKind = new Map<string, T[]>();
  for (const r of fresh) {
    const k = r.kind && AWAY_NOUN[r.kind] ? r.kind : `@${idOf(r)}`;
    let bucket = byKind.get(k);
    if (!bucket) {
      bucket = [];
      byKind.set(k, bucket);
      order.push(k);
    }
    bucket.push(r);
  }

  const groups: Array<AwayGroupVM<T>> = [];
  for (const k of order) {
    const members = byKind.get(k) ?? [];
    const noun = AWAY_NOUN[k];
    if (!noun || members.length < AWAY_GROUP_MIN) {
      for (const r of members) groups.push({ row: r, count: 1, title: null, ids: [idOf(r)] });
      continue;
    }
    groups.push({
      row: members[0],
      count: members.length,
      title: `${members.length} ${noun[1]}`,
      ids: members.map(idOf),
    });
  }

  const rank = (g: AwayGroupVM<T>) => AWAY_TONE_RANK[g.row.tone] ?? 1;
  const sorted = groups
    .map((g, i) => ({ g, i }))
    .sort((x, y) => rank(x.g) - rank(y.g) || x.i - y.i)
    .map((x) => x.g);
  // The head says how many unread things the BELL holds and the foot how many
  // of them are not on screen, so the two add up: a group of twelve stands for
  // twelve, not for one (counting groups read as "22 ... and 2 more").
  //
  // The head is the bell's own number, not what is left after the queue rule.
  // A row this card drops because the queue above already shows it is still a
  // row in the bell, so it is counted in BOTH numbers rather than in neither:
  // the card said 0 and "All caught up." while the badge two inches away said
  // 4, and no foot was drawn at all while the bell held four.
  const shown = sorted.slice(0, max);
  const stoodFor = shown.reduce((n, g) => n + g.count, 0);
  const total = unreadCount(rows);
  const queued = total - fresh.length;
  const more = Math.max(0, total - stoodFor);
  // Keyed on `fresh`, not on what the cap left: a card with nothing to draw is
  // empty because the queue holds everything, and that is only true of `fresh`.
  const empty = fresh.length
    ? null
    : total === 0
      ? { icon: "check", text: AWAY_EMPTY_CLEAR }
      : { icon: "arrow-up", text: AWAY_EMPTY_QUEUED };
  return { groups: shown, total, more, queued, foot: awayFoot(more, queued, shown.length > 0), empty };
}

/* ------------------------------------------------ the steps due (0007, amended) */

/** How many steps due Today names at the head of the day, the rest a line to People's Steps due. */
export const TODAY_STEPS_MAX = 3;

/** One step due as Today names it: who, what, and when it was due, the oldest first. */
export interface TodayStepVM {
  personId: string;
  name: string;
  words: string;
  /** "Due today", "Overdue since Mon". */
  when: string;
  due: StepDue;
  forWho: string | null;
}

export interface TodayStepsVM {
  title: string;
  items: TodayStepVM[];
  /** "and 2 more", to People's Steps due; null when every one is named. */
  more: { words: string; to: string } | null;
}

/**
 * The steps due at the head of the day (0007, amended), in every workspace, calendar or not: whose next step's day has
 * come or gone, the oldest first, three at most, and a line to People's Steps due for the rest. Null with none due.
 * Each day is judged again at `nowMs`, so a list read yesterday says today's.
 */
export function todaySteps(
  rows: readonly Pick<PersonRowVM, "id" | "name" | "nextStep">[] | null | undefined,
  nowMs: number,
  tz: string,
  max = TODAY_STEPS_MAX,
): TodayStepsVM | null {
  const due = todayStepsDue(rows ?? [], nowMs, tz, max);
  if (!due.count) return null;
  return {
    title: NOTE_WORDS.stepsDue,
    items: due.rows.map(({ row, step }) => ({
      personId: row.id,
      name: row.name,
      words: step.words,
      when: step.day.words,
      due: step.due,
      forWho: step.forWho,
    })),
    more: due.more ? { words: due.more, to: "clients/seg:steps_due" } : null,
  };
}
