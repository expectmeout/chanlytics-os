/**
 * Today's queue: everything that asks for a person (a handoff, a call-back, a closing window, a call worth an
 * ear, a search waiting on its owner) in one row grammar, longest wait first. The facts are today-facts.ts's; the
 * calls worth an ear are today-rows.ts's.
 */
import { ESCALATION_REASON_LABELS } from "../conversations/escalations";
import { messageWords, clipAtWord } from "../conversations/message-words";
import { threadChannelWords } from "../conversations/thread-channel";
import { formatWaited } from "../conversations/thread-clock";
import { contactName, initialsOf } from "../conversations/thread-contact";
import type { ConversationDto } from "../conversations/thread-dto";
import { waWindow } from "../config/policy";
import { reasonShort } from "../people/person-row-facts";
import { leadQuestionRoute, type LeadSearchDto } from "../leads/leads";
import { MIN_MS, HOUR_MS } from "../shared/time";
import { tzClock } from "./today-clock";
import { QUOTE_MAX, type EscalationRecord, type TodayFacts } from "./today-facts";
import { say } from "./today-rows";
import type { TodayCallRowVM, TodayQueueEmptyVM, TodayQueueRowVM, TodayVM } from "./today-vm";

/** Six rows on Today; the rest is a count for the Inbox link. */
export const TODAY_QUEUE_MAX = 6;
/** A question waited this long is warned: the sweep stops it after a day. */
const SEARCH_WARN_MS = 12 * HOUR_MS;

/* ---- the queue: everything that asks for a person, in one row grammar.
   The longest wait first; a closing window by how soon it closes; a call
   worth an ear last. Six on Today, the rest a count for the Inbox link. ---- */

/**
 * A call-back: the phone receptionist could not finish it. The to-do it left is the
 * sentence, the call itself is where the verb goes, Done resolves it.
 */
function callbackRow(r: EscalationRecord): TodayQueueRowVM {
  const e = r.e;
  return {
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
  };
}

/** A handoff: the receptionist stopped and asked for a person; her words are the sentence, Snooze puts it aside. */
function handoffRow(r: EscalationRecord): TodayQueueRowVM {
  const e = r.e;
  return {
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
  };
}

/**
 * A closing window. "WhatsApp" is right here even when the last written message came by
 * email: the row is about WhatsApp's window (waWindow on the thread's
 * last WhatsApp inbound), which is the one wire that has one. The
 * handoff row above names the wire the reply would go out on instead.
 */
function windowRow(c: ConversationDto, f: TodayFacts): TodayQueueRowVM {
  const { tz, now } = f;
  const w = waWindow(c.last_wa_inbound_at, now);
  const leftMs = w.closesAtIso ? Math.max(MIN_MS, new Date(w.closesAtIso).getTime() - now.getTime()) : 0;
  const last = [...c.messages].reverse().find((x) => x.sender === "customer");
  const who = contactName(c);
  return {
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
    warn: leftMs < 2 * HOUR_MS,
    cta: { label: "Open thread", to: `inbox/th-${c.id}` },
    also: null,
    // After every escalation (which waited ≥ 0), the soonest to close first.
    waitedMs: -leftMs,
  };
}

/** A call worth an ear, as a queue row: after everyone waiting, what the caller wanted as the sentence. */
function earRow(r: TodayCallRowVM, f: TodayFacts): TodayQueueRowVM {
  const c = f.callsInWindow.find((k) => k.id === r.id);
  const wanted = say(c?.wanted);
  return {
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
  };
}

/**
 * A search that stopped to ask waits on the owner like a person does (spec G6): its name, its question, one
 * button to answer it. Null for a search that is not waiting.
 */
function searchRow(s: LeadSearchDto, now: Date): TodayQueueRowVM | null {
  const r = s.round;
  if (!r || r.state !== "waiting_on_owner" || !r.question) return null;
  const since = r.waiting_since ? new Date(r.waiting_since).getTime() : now.getTime();
  const waitedMs = Math.max(0, now.getTime() - since);
  return {
    id: `q-s-${s.id}`,
    kind: "search",
    conversationId: null,
    callId: null,
    who: s.name,
    initials: initialsOf(s.name),
    channel: "Leads",
    when: `waited ${formatWaited(waitedMs)}`,
    sentence: r.question.sentence,
    quoted: false,
    status: ["Waiting for your answer", "nothing is spent while it waits"],
    tone: "escalated",
    warn: waitedMs > SEARCH_WARN_MS,
    cta: { label: "Answer", to: leadQuestionRoute(s.id) },
    also: null,
    waitedMs,
  };
}

/** The queue: the rows in order, the rest as a count, what the rows hold in words, and how many people are waiting on you. */
export function todayQueue(f: TodayFacts, callRows: TodayCallRowVM[], empty: TodayQueueEmptyVM): TodayVM["queue"] {
  const { escRecords, closingConvs, searches, now } = f;
  const queueAll: TodayQueueRowVM[] = [];
  for (const r of escRecords) {
    queueAll.push(r.e.reason === "callback" ? callbackRow(r) : handoffRow(r));
  }
  for (const c of closingConvs) {
    queueAll.push(windowRow(c, f));
  }
  for (const r of callRows) {
    if (r.to === "live") continue;
    queueAll.push(earRow(r, f));
  }
  // Null: the searches were not read; the queue says nothing about them.
  for (const s of searches ?? []) {
    const row = searchRow(s, now);
    if (row) queueAll.push(row);
  }
  queueAll.sort((a, b) => b.waitedMs - a.waitedMs);
  const countOf = (...kinds: TodayQueueRowVM["kind"][]) => queueAll.filter((r) => kinds.includes(r.kind)).length;
  const needN = countOf("handoff", "callback");
  const winN = countOf("window");
  const earN = countOf("call");
  const searchN = countOf("search");
  const parts = [
    needN ? `${needN} need you` : "",
    searchN ? `${searchN} ${searchN === 1 ? "search" : "searches"} waiting for your answer` : "",
    winN ? `${winN} reply window${winN === 1 ? "" : "s"} closing` : "",
    earN ? `${earN} call${earN === 1 ? "" : "s"} worth a listen` : "",
  ].filter(Boolean);
  return {
    rows: queueAll.slice(0, TODAY_QUEUE_MAX),
    more: Math.max(0, queueAll.length - TODAY_QUEUE_MAX),
    parts,
    empty,
    waiting: needN + winN + searchN,
  };
}
