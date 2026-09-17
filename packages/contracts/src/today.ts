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
  messageText,
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
import { reasonShort } from "./people";
import { conversationOfNeedsKey } from "./notifications";

export interface MetricsSummaryDto {
  workspace: { name: string; timezone: string; status: string };
  channels: Array<{ kind: string; status: string; number: string | null }>;
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
  who: string;
  initials: string;
  channel: "WhatsApp" | "Phone";
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

export interface TodayVM {
  standing: {
    eyebrow: string;
    chips: Array<{ text: string; ok: boolean }>;
    alert: string | null;
    greeting: string;
    headline: string;
    detail: string | null;
    tone: "needs" | "calm" | "alert";
  };
  needsYou: { count: number; hint: string; rows: TodayNeedsRowVM[]; empty: string | null } | null;
  windowClosing: { label: string; hint: string; rows: Array<{ id: string; text: string; to: string }> } | null;
  recap: {
    label: string;
    /** The day's numbers in one sentence. They were six stat cards over two sentences that said them again. */
    line: string;
    sentences: TodaySentenceVM[];
    facts: TodayFactVM[];
    receipts: Array<{ at: string; text: string; to: string }>;
  } | null;
  /** Answered-by-AI ratio for the hero arc — null when nothing came in
   *  (an arc of 0/0 is a gauge with no needle). */
  pulse: { num: number; den: number } | null;
  calls: { line: string; rows: TodayCallRowVM[] } | null;
  /** Whether the calls read succeeded; false means the rows above omit the phone, and the brief says so. */
  callsRead: boolean;
  /** Everything that asks for a person, in one row grammar, longest wait first. */
  /** The rows, the rest as a count, and what the rows hold in words: "2 need you", "1 reply window closing", "1 call worth a listen". */
  queue: { rows: TodayQueueRowVM[]; more: number; parts: string[] };
  launchpad: Array<{ label: string; to: string }>;
  updatedAt: string;
  quiet: {
    headline: string;
    sub: string;
    proof: Array<{ label: string; value: string }>;
    launchpad: { label: string; to: string } | null;
  } | null;
}

const CHANNEL_LABEL: Record<string, string> = { whatsapp: "WhatsApp", voice: "Phone line" };

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
    try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d); } catch { return d.toDateString(); }
  };
  const day = key(new Date(iso));
  if (day === key(now)) return t;
  if (day === key(new Date(now.getTime() + 86_400_000))) return `tomorrow ${t}`;
  try { return `${new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: tz }).format(new Date(iso))} ${t}`; } catch { return t; }
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
      const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d).split("-").map(Number);
      return Date.UTC(parts[0] ?? 1970, (parts[1] ?? 1) - 1, parts[2] ?? 1) / 86_400_000;
    } catch {
      return Math.floor(d.getTime() / 86_400_000);
    }
  };
  const days = dayNumber(now) - dayNumber(new Date(iso));
  if (days <= 0) return t;
  if (days === 1) return `yesterday ${t}`;
  try {
    const within: Intl.DateTimeFormatOptions = days < 7 ? { weekday: "short", timeZone: tz } : { month: "short", day: "numeric", timeZone: tz };
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
  const key = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
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

/** "41s" / "1m 12s". Seconds are exact here — this is a measured median. */
function secondsPhrase(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
}

const SENT = ["sent", "delivered", "read"];

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
  // Null: the calls read failed. The brief says so rather than counting none.
  const callsRead = calls !== null;
  const callDtos = calls ?? [];

  // now_local is a naive tenant-local wall clock ("2026-08-27T11:00:19"), so
  // parsing it as a local Date yields the salon's own hour and weekday.
  const localNow = new Date(m.window.now_local);
  const valid = !Number.isNaN(localNow.getTime());
  const hour = valid ? localNow.getHours() : now.getHours();
  const clock = valid ? localNow.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
  // The mockup's eyebrow rhythm: "Saturday · April 26 · 12:04"
  const datePart = valid
    ? `${localNow.toLocaleDateString("en-US", { weekday: "long" })} · ${localNow.toLocaleDateString("en-US", { month: "long", day: "numeric" })}`
    : "";
  const greeting = hour < 12 ? "Good morning." : hour < 17 ? "Good afternoon." : "Good evening.";

  const chips = m.channels.map((c) => ({
    text: `${CHANNEL_LABEL[c.kind] ?? c.kind} ${c.status === "active" ? "connected" : "disconnected"}`,
    ok: c.status === "active",
  }));

  // The alert is the one place Today raises its voice, and it SUPPRESSES every
  // reassuring line — "nothing needs you" is a lie while the number is dark.
  const down = m.channels.filter((c) => c.status !== "active");
  const alert =
    m.workspace.status === "paused"
      ? "This workspace is paused — the receptionist is not answering anything."
      : down.length
        ? `${down.map((c) => CHANNEL_LABEL[c.kind] ?? c.kind).join(" and ")} ${
            down.length > 1 ? "are" : "is"
          } disconnected — messages coming in are not being answered.`
        : null;

  const byConv = new Map(conversations.map((c) => [c.id, c]));
  const openEsc = escalations
    .filter((e) => e.state === "open")
    // One rule (standing.ts): a handoff a person has already taken over is
    // theirs, not the queue's. An escalation whose thread the page did not
    // load keeps its place — unknown is not "handled".
    .filter((e) => {
      const conv = byConv.get(e.conversation_id);
      if (!conv) return true;
      return standingOf({
        state: conv.state, paused_until: conv.paused_until, assignee_user_id: conv.assignee_user_id,
        assignee_is_me: conv.assignee_is_me, open_escalation: true,
      }, now.getTime()).standing === "needs_you";
    })
    .sort((a, b) => a.created_at.localeCompare(b.created_at)); // oldest waiting first
  // The one number every surface shows for "need you": the Inbox badge counts
  // the same threads by the same rule.
  const needsYouCount = openEsc.length;

  const needsRows: TodayNeedsRowVM[] = openEsc.map((e) => {
    const conv = byConv.get(e.conversation_id);

    const lastCustomer = conv ? [...conv.messages].reverse().find((x) => x.sender === "customer") : undefined;
    const waitedMs = now.getTime() - new Date(e.created_at).getTime();
    const win = conv ? waWindow(conv.last_wa_inbound_at, now) : null;
    const closes = win?.open ? tzClock(win.closesAtIso, tz, now) : null;
    return {
      id: `th-${e.conversation_id}`,
      conversationId: e.conversation_id,
      escalationId: e.id,
      who: conv ? contactName(conv) : "Unknown",
      reason: ESCALATION_REASON_LABELS[e.reason] ?? e.reason,
      waited: formatWaited(waitedMs),
      warn: waitedMs > 30 * 60000,
      // her own words, never a generated characterization of them
      quote: lastCustomer ? messageText(lastCustomer).slice(0, 110) : "",
      meta: conv ? contactMeta(conv) : "WhatsApp",
      windowNote: closes ? `Reply window closes ${closes}` : null,
      to: `inbox/th-${e.conversation_id}`,
    };
  });

  // Threads where the customer spoke last and the free-reply window is running
  // out. Rendered ONLY when at least one qualifies — an empty deadline board
  // manufactures anxiety on a calm day.
  const escSet = new Set(openEsc.map((e) => e.conversation_id));
  const closingConvs = conversations
    .filter((c) => {
      if (escSet.has(c.id)) return false;
      const last = c.messages[c.messages.length - 1];
      if (!last || last.sender !== "customer") return false;
      const w = waWindow(c.last_wa_inbound_at, now);
      return w.open && w.closesAtIso
        ? new Date(w.closesAtIso).getTime() - now.getTime() < 6 * 3600 * 1000
        : false;
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

  const sinceMs = new Date(m.window.since).getTime();
  const callsInWindow = callDtos.filter(
    (c) => c.started_at && new Date(c.started_at).getTime() >= sinceMs,
  );
  const callMinutes = Math.round(p.call_seconds / 60);

  const traffic = p.messages_in + p.calls + p.messages_out_you;
  const isQuiet = traffic === 0 && needsYouCount === 0 && !alert;

  // The hero's stat strip is part of the design and always renders — a zero
  // is a real measurement, and "—" is a real "not enough data yet". What
  // never appears is a delta, a percentage, or a sparkline: a jump from 1
  // message to 3 is not "+200%", and the mockup's own delta logic painted a
  // FASTER reply time red.
  const facts: TodayFactVM[] = [
    { label: "Messages in", value: String(p.messages_in) },
    { label: "Answered by the receptionist", value: `${p.answered_by_ai} of ${p.messages_in}` },
    p.median_reply_seconds_ai === null
      ? { label: "Typical reply time", value: "—", hint: "Not enough replies yet" }
      : { label: "Typical reply time", value: secondsPhrase(p.median_reply_seconds_ai) },
    { label: "Calls", value: p.calls ? `${p.calls}${callMinutes ? ` · ${callMinutes} min` : ""}` : "0" },
  ];
  const pulse = p.messages_in > 0 ? { num: p.answered_by_ai, den: p.messages_in } : null;
  // The day's traffic as one sentence, for the line under the work. The hero said these numbers three times: a strip
  // of stat cards, two of the sentences beneath it, and the arc's own ratio.
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
    const lastIn = tzDayAndTime(live.last_inbound_at, tz, now);
    const gap =
      live.last_outbound_at && live.last_inbound_at &&
      new Date(live.last_outbound_at) > new Date(live.last_inbound_at)
        ? Math.round(
            (new Date(live.last_outbound_at).getTime() - new Date(live.last_inbound_at).getTime()) / 1000,
          )
        : null;
    const names = m.channels.map((c) => CHANNEL_LABEL[c.kind] ?? c.kind).join(" and ");
    const plural = m.channels.length > 1 ? "are" : "is";
    // A workspace with no channel yet is a new owner's first Today — it must
    // not read " is connected." with nothing in front of it.
    const sub = m.channels.length === 0
      ? "No phone line or WhatsApp number is connected yet, so nothing can come in."
      : lastIn
        ? `${names} ${plural} connected. The last message arrived ${lastIn}${
            gap !== null && gap > 0 && gap < 3600
              ? `, and the receptionist answered ${secondsPhrase(gap)} later.`
              : "."
          }`
        : `${names} ${plural} connected. No messages have arrived yet.`;
    return {
      standing: {
        eyebrow: `${datePart} · ${clock} · ${m.workspace.name}`,
        chips,
        alert: null,
        greeting,
        headline: "Nothing has come in yet today.",
        detail: null,
        tone: "calm",
      },
      needsYou: null,
      windowClosing: null,
      recap: { label: "Today so far", line: "Nothing has come in yet today.", sentences: [], facts, receipts: [] },
      pulse: null,
      calls: null,
      callsRead,
      queue: { rows: [], more: 0, parts: [] },
      launchpad: [{ label: "Conversations", to: "conversations" }],
      updatedAt: clock,
      quiet: {
        headline: "Nothing has come in yet today.",
        sub,
        proof: [
          ...(m.channels.length === 0 ? [{ label: "Channels", value: "none connected yet" }] : []),
          ...m.channels.map((c) => ({
            label: CHANNEL_LABEL[c.kind] ?? c.kind,
            // "on" / "off" in the owner's words, never the column's value.
            value: `${c.number ?? "connected"} · ${c.status === "active" ? "on" : "off"}`,
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

  /* ---- recap: four facts, no deltas, no sparklines ----
     A jump from 1 message yesterday to 3 today is not "+200%", and the
     mockup's own delta logic painted a FASTER reply time red.

     Sentences carry only what the HEADLINE does not already say. When nothing
     needs you, the headline is "The receptionist handled everything — N
     messages and M calls", so repeating those counts here would be the brief
     reading its own first line back. When something DOES need you, the
     headline is spent on that, and the narrative belongs here instead. */
  const sentences: TodaySentenceVM[] = [];
  const headlineCoversTraffic = tone === "calm" && !alert;
  if (p.answered_by_ai && !headlineCoversTraffic) {
    sentences.push({
      text: `The WhatsApp receptionist answered ${p.answered_by_ai} message${p.answered_by_ai === 1 ? "" : "s"}${
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
  // A reply that never reached the customer is the one recap line that must
  // never be quiet — the send already escalated, but the brief saying
  // "handled everything" while a message died in transit would be a lie of
  // omission.
  if (p.send_failures) {
    // The thread of the newest reply that failed, when the conversations read holds it: "See the thread"
    // opened the Inbox list, where the owner had to go looking.
    const lastFailed = conversations
      .flatMap((c) =>
        c.messages
          .filter((x) => x.direction === "outbound" && x.status === "failed" && x.meta?.backfill !== true && new Date(x.created_at).getTime() >= sinceMs)
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
            // BEFORE the summary branches, deliberately. A caller gone in six
            // seconds has no summary and never will have much of one, so the
            // chain below would have said "summary on its way" and buried the
            // only fact worth acting on.
            : abandonedCall(c)
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
  const callByConv = new Map<string, CallDto>();
  for (const c of callDtos) {
    if (!c.conversation_id) continue;
    const prev = callByConv.get(c.conversation_id);
    if (!prev || String(c.started_at ?? "") > String(prev.started_at ?? "")) callByConv.set(c.conversation_id, c);
  }
  const say = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "");
  const queueAll: TodayQueueRowVM[] = [];
  for (const e of openEsc) {
    const conv = byConv.get(e.conversation_id);
    const waitedMs = now.getTime() - new Date(e.created_at).getTime();
    const since = tzSince(e.created_at, tz, now) ?? "";
    const warn = waitedMs > 30 * 60000;
    if (e.reason === "callback") {
      // The phone receptionist could not finish it: the to-do it left is the
      // sentence, the call itself is where the verb goes, Done resolves it.
      const call = callByConv.get(e.conversation_id) ?? null;
      const who = conv ? contactName(conv) : call ? toCallVM(call, tz, now).who : "Unknown caller";
      queueAll.push({
        id: `q-${e.id}`, kind: "callback", who, initials: initialsOf(who), channel: "Phone",
        when: `waited ${formatWaited(waitedMs)}`,
        sentence: say(e.details) || "The caller needs a call back.", quoted: false,
        status: ["Needs a call back", `since ${since}`], tone: "escalated", warn,
        cta: { label: "Open the call", to: call ? `conversations/cv-${call.id}` : `inbox/th-${e.conversation_id}` },
        also: { label: "Done", verb: "resolve", conversationId: e.conversation_id, escalationId: e.id },
        waitedMs,
      });
      continue;
    }
    const lastCustomer = conv ? [...conv.messages].reverse().find((x) => x.sender === "customer") : undefined;
    const quote = lastCustomer ? messageText(lastCustomer).slice(0, 110) : "";
    const who = conv ? contactName(conv) : "Unknown";
    const win = conv ? waWindow(conv.last_wa_inbound_at, now) : null;
    const closes = win?.open ? tzClock(win.closesAtIso, tz, now) : null;
    queueAll.push({
      id: `q-${e.id}`, kind: "handoff", who, initials: initialsOf(who), channel: "WhatsApp",
      when: `waited ${formatWaited(waitedMs)}`,
      sentence: quote || (ESCALATION_REASON_LABELS[e.reason] ?? e.reason), quoted: !!quote,
      status: ["Escalated", reasonShort(e.reason) || e.reason, `since ${since}`, ...(closes ? [`reply window closes ${closes}`] : [])],
      tone: "escalated", warn,
      cta: { label: "Open and reply", to: `inbox/th-${e.conversation_id}` },
      also: { label: "Snooze", verb: "snooze", conversationId: e.conversation_id, escalationId: e.id },
      waitedMs,
    });
  }
  for (const c of closingConvs) {
    const w = waWindow(c.last_wa_inbound_at, now);
    const leftMs = w.closesAtIso ? Math.max(60000, new Date(w.closesAtIso).getTime() - now.getTime()) : 0;
    const last = [...c.messages].reverse().find((x) => x.sender === "customer");
    const who = contactName(c);
    queueAll.push({
      id: `q-w-${c.id}`, kind: "window", who, initials: initialsOf(who), channel: "WhatsApp",
      when: `closes ${tzClock(w.closesAtIso, tz, now) ?? "soon"} · in ${formatWaited(leftMs)}`,
      sentence: last ? messageText(last).slice(0, 110) : "They wrote last, and the free reply window is closing.", quoted: !!last,
      status: ["Reply window closing", "they wrote last"], tone: "warn", warn: leftMs < 2 * 3600000,
      cta: { label: "Open thread", to: `inbox/th-${c.id}` }, also: null,
      // After every escalation (which waited ≥ 0), the soonest to close first.
      waitedMs: -leftMs,
    });
  }
  for (const r of callRows) {
    if (r.to === "live") continue;
    const c = callsInWindow.find((k) => k.id === r.id);
    const wanted = say(c?.wanted);
    queueAll.push({
      id: `q-c-${r.id}`, kind: "call", who: r.who, initials: initialsOf(r.who), channel: "Phone",
      when: `${r.at}${r.duration ? ` · ${r.duration}` : ""}`,
      sentence: wanted || r.note, quoted: false,
      status: [wanted ? r.note : "Worth a listen"], tone: "warn", warn: false,
      cta: { label: "Open the call", to: r.to }, also: null,
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
  const queue = { rows: queueAll.slice(0, TODAY_QUEUE_MAX), more: Math.max(0, queueAll.length - TODAY_QUEUE_MAX), parts };

  return {
    standing: {
      eyebrow: `${datePart} · ${clock} · ${m.workspace.name}`,
      chips,
      alert,
      greeting,
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
    pulse,
    callsRead,
    calls: p.calls
      ? {
          line: `${p.calls} call${p.calls === 1 ? "" : "s"} today${
            callMinutes ? ` · ${callMinutes} minute${callMinutes === 1 ? "" : "s"}` : ""
          }.`,
          rows: callRows,
        }
      : null,
    launchpad: [
      { label: `Inbox — ${needsYouCount} need you`, to: "inbox" },
      { label: "Conversations", to: "conversations" },
      ...(p.calls ? [{ label: `Calls — ${p.calls} today`, to: "conversations/phone" }] : []),
    ],
    queue,
    updatedAt: clock,
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
  blocks: Array<{ id: string; t: number; dur: number; time: string; title: string; person: { id: string; name: string } | null }>;
  allDay: Array<{ id: string; t: number; dur: number; time: string; title: string; person: { id: string; name: string } | null }>;
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
}

/** "45m" · "1h" · "1h 30m" */
export function durationLabel(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

const FLAG_WORDS: Record<string, string> = { needs_you: "Needs you — in Inbox", waiting_on_you: "Waiting on you — in Inbox" };

export interface TodayDayVM {
  feed: "ok" | "unavailable" | "none";
  frames: TodayDayFrameVM[];
  nextOpening: string | null;
  /** The visit playbooks' line — what goes out and when — or the offer to start one. */
  reminders: { text: string; to: string } | null;
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
): TodayDayVM {
  if (!cal) return { feed: "none", frames: [], nextOpening: null, reminders: null };
  const feed = cal.feed.state;
  const idx = cal.days.findIndex((d) => d.today);
  const picked = idx >= 0 ? cal.days.slice(idx, idx + 2) : [];
  const stateOf = new Map((people?.rows ?? []).map((r) => [r.id, r.state]));
  const item = (b: DayFrameLike["blocks"][number], allDay: boolean, phase: TodayDayItemVM["phase"]): TodayDayItemVM => ({
    id: b.id,
    start: allDay ? "All day" : clockLabel(b.t),
    time: b.time,
    dur: allDay ? "" : durationLabel(b.dur),
    title: b.title,
    person: b.person ? { id: b.person.id, name: b.person.name } : null,
    allDay,
    phase,
    flag: b.person ? FLAG_WORDS[stateOf.get(b.person.id) ?? ""] ?? null : null,
  });
  const frames: TodayDayFrameVM[] = picked.map((d) => {
    // Against the clock, today only: what is over, what is on now, the one
    // coming next. Tomorrow is all "later"; an all-day entry has no place on
    // the rail.
    let nextTaken = false;
    const timed = [...d.blocks].sort((a, b) => a.t - b.t).map((b) => {
      let phase: TodayDayItemVM["phase"] = "later";
      if (d.today) {
        const end = b.t + b.dur / 60;
        if (end <= cal.now) phase = "past";
        else if (b.t <= cal.now) phase = "now";
        else if (!nextTaken) { phase = "next"; nextTaken = true; }
      }
      return item(b, false, phase);
    });
    const items = [...d.allDay.map((b) => item(b, true, "later")), ...timed];
    const flagged = items.filter((i) => i.flag).length;
    return {
      key: d.key,
      label: `${d.today ? "Today" : "Tomorrow"} · ${d.long}`,
      today: d.today,
      past: d.past,
      closed: d.closed,
      items,
      summary: items.length ? { booked: `${items.length} booked`, flagged: flagged ? `${flagged} need${flagged === 1 ? "s" : ""} you` : null } : null,
      open: d.closed.yes || d.past ? [] : d.windows.map((w) => w.label),
    };
  });
  let reminders: TodayDayVM["reminders"] = null;
  if (feed === "ok") {
    const visit = (playbooks ?? []).filter((p) => (p.trigger === "visit_tomorrow" || p.trigger === "visited") && p.state === "running");
    reminders = visit.length === 0
      ? { text: "No visit reminders yet — a playbook can text the day before an appointment and the day after a visit.", to: "outbound" }
      : { text: visit.map((p) => `${p.trigger === "visit_tomorrow" ? "Visit reminder" : "After the visit"}: ${p.candidates} ${p.candidates === 1 ? "person" : "people"} · next run ${p.next}`).join(" · "), to: "outbound" };
  }
  return { feed, frames, nextOpening: feed === "ok" && cal.stats.next !== "—" ? cal.stats.next : null, reminders };
}

/** Two facts beside the recap's, only with a calendar: appointments today, and what is booked ahead. */
export function todayDayFacts(cal: CalendarLike | null, agg: { booked: number; reachedWeek: number } | null): TodayFactVM[] {
  if (!cal || cal.feed.state !== "ok") return [];
  const out: TodayFactVM[] = [];
  const today = cal.days.find((d) => d.today);
  if (today) {
    const n = today.blocks.length + today.allDay.length;
    const hint = today.closed.yes
      ? `closed today${today.closed.note ? ` · ${today.closed.note}` : ""}`
      : cal.stats.next !== "—" ? `next open time ${cal.stats.next}` : undefined;
    out.push(hint ? { label: "Appointments today", value: String(n), hint } : { label: "Appointments today", value: String(n) });
  }
  if (agg) out.push({ label: "Booked ahead", value: String(agg.booked), hint: `${agg.reachedWeek} reached this week` });
  return out;
}

/** The day's own numbers as one sentence, beside the recap's: they were stat cards in the hero, over the work. */
export function todayDayLine(cal: CalendarLike | null, agg: { booked: number; reachedWeek: number } | null): string | null {
  const facts = todayDayFacts(cal, agg);
  if (!facts.length) return null;
  const said = facts.map((f) => {
    const what = f.label === "Appointments today"
      ? `${f.value} appointment${f.value === "1" ? "" : "s"} today`
      : `${f.value} booked ahead`;
    return f.hint ? `${what}, ${f.hint}` : what;
  });
  return `${said.join(". ")}.`;
}

/* ------------------------- the period, the journey, away ------------------ */

/** A Reports tile as Reports builds it; the page draws it with Reports' own component. */
export interface WeekTileLike {
  id: string;
  label: string;
  value: string;
  meta: string;
  delta: { text: string; tone: "pos" | "neg" | "" } | null;
  spark: number[];
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
    answered?: { totals: { in: number; ai: number; you: number; none: number } };
    /** Why the receptionist stopped, most common first — the period's "driven by". */
    reasons?: Array<{ id: string; label: string; value: number }>;
  };
  campaigns: { tiles: WeekTileLike[]; empty: boolean };
  booking: { present: boolean; headline: string; sub: string; pct: number | null; asked?: number; booked?: number };
}

/** One of the three ways to read the period, behind the card's own control. */
export interface TodayWeekViewVM {
  id: "conversations" | "campaigns" | "booking";
  /** The control's word. */
  label: string;
  tiles: WeekTileLike[];
  /** Under the tiles: what drove the headline number, in the period's own counts. */
  chips: Array<{ label: string; value: string }>;
  /** Said when there is nothing to draw, or what the numbers mean when there is. */
  note: string | null;
  /** Where the full version of this view lives. */
  to: string;
}

export interface TodayWeekVM {
  /** "Last 7 days" — the range the owner chose on Reports. */
  label: string;
  /** "Aug 31 – Sep 6" — the range itself; the comparison it is drawn against lives on Reports, with the charts. */
  sub: string;
  views: TodayWeekViewVM[];
  /** The view to open on: the first one with something in it. */
  initial: TodayWeekViewVM["id"];
}

/**
 * The period as Reports counts it, in three reads behind one control:
 * the conversations (its own six tiles, and what made the receptionist stop),
 * the campaigns (what went out and what came back), and the booking (who
 * wrote or called, and who ended up on the calendar).
 *
 * It was six tiles and two grey lines underneath, and the two lines carried
 * the numbers that matter most to a business: what the offers earned, and how
 * many of the people who asked ever booked. "Asked -> booked: 0 of 18 · 0%"
 * is not a footnote. Each read is now a first-class view with its own tiles;
 * none of them is a second count — every number is the one Reports prints.
 */
export function todayWeek(r: ReportsLike | null): TodayWeekVM | null {
  if (!r) return null;
  const find = (id: string) => r.campaigns.tiles.find((t) => t.id === id);
  const sent = find("sent");
  const noCampaign = r.campaigns.empty || !sent || sent.value === "0";

  // Why the receptionist stopped: the period's escalation reasons, as Reports
  // counts them. The chips say what the "Needed you" tile above them is made of.
  const reasons = (r.vm.reasons ?? []).filter((x) => x.value > 0).slice(0, 5);
  const conversations: TodayWeekViewVM = {
    id: "conversations",
    label: "Conversations",
    tiles: r.vm.tiles,
    chips: reasons.map((x) => ({ label: x.label, value: String(x.value) })),
    // No "N never got an answer" line here: the Receptionist answered tile
    // already carries "4 unanswered" in its own meta, and todayLeaks says it in
    // words above. A third printing on one page is what this pass is removing.
    note: r.vm.empty ? "Nobody wrote or called in this period." : null,
    to: "reports",
  };

  const campaigns: TodayWeekViewVM = {
    id: "campaigns",
    label: "Campaigns",
    tiles: noCampaign ? [] : r.campaigns.tiles,
    chips: [],
    note: noCampaign ? "No campaign message went out in this period." : null,
    to: "broadcasts",
  };

  const b = r.booking;
  const bookingTiles: WeekTileLike[] = !b.present || b.pct === null
    ? []
    : [
        { id: "asked", label: "Wrote or called", value: String(b.asked ?? 0), meta: `in the last ${r.vm.rangeLabel}`, delta: null, spark: [] },
        { id: "booked", label: "On the calendar", value: String(b.booked ?? 0), meta: "have an appointment ahead", delta: null, spark: [] },
        { id: "rate", label: "Asked → booked", value: `${b.pct}%`, meta: b.headline, delta: null, spark: [] },
      ];
  const booking: TodayWeekViewVM = {
    id: "booking",
    label: "Booking",
    tiles: bookingTiles,
    chips: [],
    note: bookingTiles.length ? null : b.present ? "Nobody wrote or called, so there was nothing to book." : b.sub,
    to: b.present ? "reports" : "calendar",
  };

  const views = [conversations, campaigns, booking];
  const full = views.find((v) => v.tiles.length > 0);
  return {
    label: `Last ${r.vm.rangeLabel}`,
    sub: `${r.vm.since} – ${r.vm.until}`,
    views,
    initial: full ? full.id : "conversations",
  };
}

/** A People list as the People surface publishes it. */
export interface JourneyListLike {
  id: string;
  label: string;
  group: string;
  count: number;
  action: { text: string; cta: string; to: string; enabled: boolean } | null;
}
export interface TodayJourneyRowVM {
  id: string;
  label: string;
  count: number;
  to: string;
  act: { label: string; to: string } | null;
}

export interface TodayJourneyVM {
  /** On the way to a booking. */
  rows: TodayJourneyRowVM[];
  /** Who can still be reached, and how -- the same lists People groups under Reach. */
  reach: TodayJourneyRowVM[];
  /** Said once when the calendar is not connected: which lists are missing and why. */
  note: string | null;
}

/** Where people are on the way to a booking: People's journey lists, their counts, and the step each has when it has one. */
export function todayJourney(people: { lists: JourneyListLike[]; calendar: { state: string } } | null): TodayJourneyVM | null {
  if (!people) return null;
  const group = (name: string): TodayJourneyRowVM[] => people.lists
    .filter((l) => l.group === name)
    .map((l) => ({ id: l.id, label: l.label, count: l.count, to: `clients/seg:${l.id}`, act: l.count > 0 && l.action && l.action.enabled ? { label: l.action.cta, to: l.action.to } : null }));
  return { rows: group("journey"), reach: group("reach"), note: people.calendar.state === "ok" ? null : "Booked, asked-never-booked and lapsed appear once the calendar is connected." };
}

/** While you were away: the bell's unread rows in the bell's order, capped, the rest counted. */
export function todayAway<T extends { unread: boolean }>(rows: T[], max = 5): { rows: T[]; more: number } {
  const fresh = rows.filter((r) => r.unread);
  return { rows: fresh.slice(0, max), more: Math.max(0, fresh.length - max) };
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
export type TodayLeakId = "never-booked" | "unanswered" | "unreachable" | "quiet";

export interface TodayLeakVM {
  id: TodayLeakId;
  tone: "danger" | "warn" | "info";
  /** The problem, in one sentence, with the number in it. */
  text: string;
  /** The arithmetic behind the sentence, so nobody has to take it on faith. */
  math: string;
  /** The door. */
  cta: { label: string; to: string };
  /** The act, when the list this is about has one it can actually run. */
  also: { label: string; to: string } | null;
}

/** What People publishes, as far as this reads it. */
export interface PeopleListsLike {
  lists: JourneyListLike[];
  aggregates?: { total: number };
}

/** At most this many; the rest is not an insight, it is a list. */
export const TODAY_LEAK_MAX = 2;

/**
 * In this order, and the order is the point: the first two both cost a
 * customer, and the one that costs more of them comes first. A person who
 * asked and never got onto the calendar is the business's whole purpose
 * missed; a message nobody answered is one conversation. Then the two that
 * cost a chance rather than a customer.
 */
const LEAK_ORDER: readonly TodayLeakId[] = ["never-booked", "unanswered", "unreachable", "quiet"];

export function todayLeaks(
  reports: ReportsLike | null,
  people: PeopleListsLike | null,
  max = TODAY_LEAK_MAX,
): TodayLeakVM[] {
  const found = new Map<TodayLeakId, TodayLeakVM>();
  const list = (id: string) => (people ? people.lists.find((l) => l.id === id) ?? null : null);
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
    found.set("never-booked", {
      id: "never-booked",
      tone: "danger",
      text: booked === 0
        ? `${asked} people wrote or called in the last ${reports.vm.rangeLabel}. Not one of them is on the calendar.`
        : `Only ${booked} of the ${asked} people who wrote or called in the last ${reports.vm.rangeLabel} got onto the calendar.`,
      math: never ? `${b.headline} · ${never.count} on Asked, never booked` : b.headline,
      cta: { label: "See who", to: never ? `clients/seg:${never.id}` : "clients" },
      also: step("asked_never_booked"),
    });
  }

  const a = reports && reports.vm.answered ? reports.vm.answered.totals : null;
  // Two, not one: a single message nobody answered can be a wrong number or a
  // STOP, and this rule has no act to offer, only a door to Reports where the
  // tile already prints the figure. Two is a pattern.
  if (reports && a && a.none >= 2) {
    found.set("unanswered", {
      id: "unanswered",
      tone: "danger",
      text: `${a.none} customer message${a.none === 1 ? "" : "s"} never got an answer at all.`,
      math: `of ${a.in} in the last ${reports.vm.rangeLabel} · the receptionist answered ${a.ai}, you answered ${a.you}`,
      cta: { label: "Open Reports", to: "reports" },
      also: null,
    });
  }

  // A yes to hearing from the business is not a yes to an offer, and a list
  // nobody can be mailed reads as a broken composer one screen later.
  const yes = list("opted_in");
  const offers = list("offers_ok");
  // Three, for the same reason: one person who said yes is not yet a list.
  if (yes && offers && yes.count >= 3 && offers.count === 0) {
    found.set("unreachable", {
      id: "unreachable",
      tone: "warn",
      text: `${yes.count} ${yes.count === 1 ? "person has" : "people have"} said yes to messages, but nobody has said yes to offers.`,
      math: "a broadcast reaches only the second yes · 0 can receive one",
      cta: { label: "Open People", to: `clients/seg:${yes.id}` },
      also: yes.action && yes.action.enabled ? { label: yes.action.cta, to: yes.action.to } : null,
    });
  }

  const quiet = list("quiet");
  if (quiet && quiet.count >= 5) {
    found.set("quiet", {
      id: "quiet",
      tone: "info",
      text: `${quiet.count} people have not heard from you in 30 days.`,
      math: people && people.aggregates ? `of ${people.aggregates.total} in People` : "on the Quiet 30+ days list",
      cta: { label: "See who", to: `clients/seg:${quiet.id}` },
      also: step("quiet"),
    });
  }

  return LEAK_ORDER.map((id) => found.get(id)).filter((x): x is TodayLeakVM => !!x).slice(0, max);
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
}

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
};

/** A warning outranks good news, whatever their clocks say. */
const AWAY_TONE_RANK: Record<string, number> = { warn: 0, "": 1, ok: 2 };

/** Two of a kind is already a pattern; one is news. */
const AWAY_GROUP_MIN = 2;

/**
 * What happened while the owner was away, as Today reads it rather than as
 * the bell lists it.
 *
 * Three rules, and each one was a real page: a conversation already sitting
 * in the queue at the top of this page is NOT repeated here; twelve calls
 * from the same line become one row that says twelve, because five identical
 * "No conversation happened" cards pushed a WhatsApp quality downgrade and
 * three failed jobs off the bottom; and a warning sorts above good news, so
 * the downgrade is not outranked by a five-star rating that landed later.
 */
export function todayAwayGrouped<T extends AwayRowLike>(
  rows: readonly T[],
  inQueue: readonly string[] = [],
  max = 5,
): { groups: Array<AwayGroupVM<T>>; more: number; total: number } {
  const covered = new Set(inQueue);
  const idOf = (r: T) => r.id ?? r.key ?? "";
  // A row about a conversation says so in two different ways, and only one of
  // them is `about`. A KEPT row (the edge wrote it) carries the subject; a
  // DERIVED one is computed from the Inbox this browser holds and carries
  // nothing but its key. On a real workspace the derived row is the one that
  // survives -- dedupeFeed drops the kept row while it stands -- so reading
  // `about` alone found none of them, and Today printed the three
  // conversations at the top of the page again, here, as three more rows.
  const aboutQueued = (r: T) => {
    if (r.about && r.about.type === "conversation" && covered.has(r.about.id)) return true;
    const cv = conversationOfNeedsKey(idOf(r));
    return cv !== null && covered.has(cv);
  };
  const fresh = rows.filter((r) => r.unread && !aboutQueued(r));

  const order: string[] = [];
  const byKind = new Map<string, T[]>();
  for (const r of fresh) {
    const k = r.kind && AWAY_NOUN[r.kind] ? r.kind : `@${idOf(r)}`;
    let bucket = byKind.get(k);
    if (!bucket) { bucket = []; byKind.set(k, bucket); order.push(k); }
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
    groups.push({ row: members[0], count: members.length, title: `${members.length} ${noun[1]}`, ids: members.map(idOf) });
  }

  const rank = (g: AwayGroupVM<T>) => AWAY_TONE_RANK[g.row.tone] ?? 1;
  const sorted = groups
    .map((g, i) => ({ g, i }))
    .sort((x, y) => (rank(x.g) - rank(y.g)) || (x.i - y.i))
    .map((x) => x.g);
  // The head says how many unread things there are and the foot how many are
  // not on screen, so the two must add up: a group of twelve stands for twelve,
  // not for one. Counting groups here read as "22 ... and 2 more".
  const shown = sorted.slice(0, max);
  const stoodFor = shown.reduce((n, g) => n + g.count, 0);
  return { groups: shown, more: Math.max(0, fresh.length - stoodFor), total: fresh.length };
}
