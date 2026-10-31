/**
 * Today's queue: everything that asks for a person (a handoff, a call-back, a closing window, a call worth an
 * ear, a search waiting on its owner) in one row grammar, longest wait first. The facts are today-facts.ts's; the
 * calls worth an ear are today-rows.ts's.
 */
import { addressOf } from "../activity/record-address";
import { HOLD_ACT_WORDS, holdActOf, reasonLabelOf, reasonShort } from "../conversations/escalations";
import { draftSendsAtMs, heldDraftOf, messageText, messageWords, clipAtWord } from "../conversations/message-words";
import { threadChannelWords } from "../conversations/thread-channel";
import { formatWaited } from "../conversations/thread-clock";
import { contactName, initialsOf } from "../conversations/thread-contact";
import type { ConversationDto } from "../conversations/thread-dto";
import { waWindow } from "../config/policy";
import { leadQuestionRoute, type LeadSearchDto } from "../leads/leads";
import { previewSaidOf, previewTriedWords, type PreviewTriedDto } from "../previews/preview-line";
import { NEED_YOU_WORDS } from "../need-you/need-you-words";
import { MIN_MS, HOUR_MS } from "../shared/time";
import { tzClock } from "./today-clock";
import { QUOTE_MAX, type EscalationRecord, type TodayFacts } from "./today-facts";
import { say } from "./today-rows";
import type { TodayCallRowVM, TodayQueueEmptyVM, TodayQueueRowVM, TodayVM } from "./today-vm";

/** Six rows on Today; the rest is a count for the Inbox link. */
const TODAY_QUEUE_MAX = 6;

/** The kinds of row that are a person waiting on one; a search and a call worth a listen wait elsewhere and are said apart. */
const PEOPLE_KINDS: ReadonlySet<TodayQueueRowVM["kind"]> = new Set(["handoff", "callback", "window", "reply"]);

/**
 * Whether a row is a person, as the queue's rows go: the foot's "more in the Inbox" and the people past the six. Who
 * needs you is isHoldRow: a closing window is a person, and nobody waiting on you (the wiring's second audit, S7-8).
 */
export function isPersonRow(r: Pick<TodayQueueRowVM, "kind">): boolean {
  return PEOPLE_KINDS.has(r.kind);
}

/** The kinds of row that are a hold: a person who asked for a person (a handoff, a call-back, a reach-out's reply read). */
const HOLD_KINDS: ReadonlySet<TodayQueueRowVM["kind"]> = new Set(["handoff", "callback", "reply"]);

/**
 * Whether a row is someone who needs you: a hold. The brief names these as needing you and the phone's widget names the
 * first; a closing window is said as a window, never as someone who needs you (the wiring's second audit, S7-8).
 */
export function isHoldRow(r: Pick<TodayQueueRowVM, "kind">): boolean {
  return HOLD_KINDS.has(r.kind);
}

/**
 * Whether a row names a person, so it wears a person's face (the kit's Face, over personFaceOf): every row but a search
 * waiting on its owner (a lead search's name) and the rows for the steps and the visits not named (a count). A step, a
 * visit to mark and a call worth a listen name a person without being one waiting on you, which isPersonRow keeps apart.
 */
export function namesAPerson(r: Pick<TodayQueueRowVM, "kind">): boolean {
  return r.kind !== "search" && r.kind !== "steps" && r.kind !== "visits" && r.kind !== "tried";
}

/** A question waited this long is warned: the sweep stops it after a day. */
const SEARCH_WARN_MS = 12 * HOUR_MS;

/* ---- the queue: everything that asks for a person, in one row grammar.
   The longest wait first; a closing window by how soon it closes; a call
   worth an ear last. Six on Today, the rest a count for the Inbox link. ---- */

/**
 * What a row's reply is written for and goes by (decision 0071): their newest message, the thread's wire in words, and
 * WhatsApp's free window where the wire is WhatsApp. A thread the page did not read has no message to answer, and its
 * draft waits for the thread.
 */
function writesOf(conv: ConversationDto | undefined, f: Pick<TodayFacts, "tz" | "now">): TodayQueueRowVM["writes"] {
  if (!conv) return undefined;
  const last = [...conv.messages].reverse().find((x) => x.sender === "customer");
  const wire = threadChannelWords(conv.messages);
  const w = wire === "WhatsApp" ? waWindow(conv.last_wa_inbound_at, f.now) : null;
  return {
    for_message_id: last?.id ?? null,
    wire,
    window_open: w ? w.open : null,
    window_closes: w?.open ? tzClock(w.closesAtIso, f.tz, f.now) : null,
  };
}

/**
 * A reply the receptionist wrote and holds out its veto window, as a row (decision 0071, E5): it sends on its own unless
 * someone stops it, so it stands first. Its words are the sentence's draft; their words are the sentence. Null for a
 * thread with no reply counting down, or one whose deadline has passed: that one is going out, not waiting.
 */
function heldRow(c: ConversationDto, f: TodayFacts): TodayQueueRowVM | null {
  const draft = heldDraftOf(c.messages);
  if (!draft) return null;
  const sendsAtMs = draftSendsAtMs(draft);
  if (sendsAtMs <= f.now.getTime()) return null;
  const last = [...c.messages].reverse().find((x) => x.sender === "customer");
  const who = contactName(c);
  return {
    id: `q-h-${c.id}`,
    kind: "held",
    conversationId: c.id,
    callId: null,
    person_id: c.contact.id,
    who,
    initials: initialsOf(who),
    channel: threadChannelWords(c.messages),
    when: "",
    sentence: last ? clipAtWord(messageWords(last), QUOTE_MAX) : "",
    quoted: !!last,
    status: [NEED_YOU_WORDS.held.goesAlone],
    tone: "warn",
    warn: false,
    cta: { label: NEED_YOU_WORDS.openThread, to: addressOf({ kind: "conversation", id: c.id }) },
    also: null,
    writes: writesOf(c, f),
    held: { message_id: draft.id, text: messageText(draft), sends_at_ms: sendsAtMs },
    // Before everyone waiting: it goes on its own in seconds.
    waitedMs: Number.MAX_SAFE_INTEGER,
  };
}

/** The ask a call's to-do ends with (unansweredCallTodo), which the row's state line and its Call already say. */
const CALL_BACK_ASK = ` ${HOLD_ACT_WORDS.call_back.notice}`;

/**
 * A call-back: the phone receptionist could not finish it. What happened is the sentence, without the ask its to-do ends
 * with ("Hung up after 39 sec without a word."): "Needs a call back" under it and Call beside it say that (his look on a
 * phone, 29 Oct 2026). The call itself is where the verb goes, Done resolves it.
 */
function callbackRow(r: EscalationRecord, f: TodayFacts): TodayQueueRowVM {
  const e = r.e;
  const todo = say(e.details);
  const since = `since ${r.since}`;
  return {
    id: `q-${e.id}`,
    kind: "callback",
    conversationId: e.conversation_id,
    callId: r.call ? r.call.id : null,
    person_id: r.conv?.contact.id ?? r.call?.contact_id ?? null,
    who: r.who,
    initials: initialsOf(r.who),
    channel: "Phone",
    when: `waited ${formatWaited(r.waitedMs)}`,
    sentence:
      (todo.endsWith(CALL_BACK_ASK) ? todo.slice(0, -CALL_BACK_ASK.length) : todo) || "The caller needs a call back.",
    quoted: false,
    status: ["Needs a call back", since],
    since,
    tone: "escalated",
    warn: r.warn,
    cta: {
      label: HOLD_ACT_WORDS.call_back.cta,
      to: r.call
        ? addressOf({ kind: "call", id: r.call.id })
        : addressOf({ kind: "hold", conversationId: e.conversation_id }),
    },
    also: { label: "Done", verb: "resolve", conversationId: e.conversation_id, escalationId: e.id },
    writes: writesOf(r.conv, f),
    phone: r.conv?.contact.phone_e164 ?? r.call?.contact?.phone_e164 ?? null,
    reason: say(e.details) || null,
    waitedMs: r.waitedMs,
  };
}

/** A handoff: the receptionist stopped and asked for a person; her words are the sentence, Snooze puts it aside. */
function handoffRow(r: EscalationRecord, f: TodayFacts): TodayQueueRowVM {
  const e = r.e;
  // A time the customer picked by text: what they asked for is the sentence, and the row answers it (decision 0061).
  if (e.reason === "booking_request")
    return {
      ...handoffOf(r, f),
      sentence: say(e.details) || reasonLabelOf(e.reason),
      quoted: false,
      request: { conversationId: e.conversation_id },
    };
  return handoffOf(r, f);
}

/** The handoff's row as every reason draws it. */
function handoffOf(r: EscalationRecord, f: TodayFacts): TodayQueueRowVM {
  const e = r.e;
  const since = `since ${r.since}`;
  return {
    id: `q-${e.id}`,
    kind: "handoff",
    conversationId: e.conversation_id,
    callId: null,
    person_id: r.conv?.contact.id ?? null,
    who: r.who,
    initials: initialsOf(r.who),
    channel: r.conv ? threadChannelWords(r.conv.messages) : "WhatsApp",
    when: `waited ${formatWaited(r.waitedMs)}`,
    sentence: r.quote || reasonLabelOf(e.reason),
    quoted: !!r.quote,
    // An email says what it is about before its words: "test need you — “needs you test”".
    ...(r.quote && r.subject ? { lead: r.subject } : {}),
    status: [
      "Escalated",
      reasonShort(e.reason) || e.reason,
      since,
      ...(r.closes ? [`reply window closes ${r.closes}`] : []),
    ],
    since,
    tone: "escalated",
    warn: r.warn,
    // The verb follows the reason's act (escalations.ts): a reply to write, a call to return, or nothing that may be sent.
    cta: {
      label: HOLD_ACT_WORDS[holdActOf(e.reason)].cta,
      to: addressOf({ kind: "hold", conversationId: e.conversation_id }),
    },
    also: { label: "Snooze", verb: "snooze", conversationId: e.conversation_id, escalationId: e.id },
    writes: writesOf(r.conv, f),
    reason: reasonLabelOf(e.reason),
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
    person_id: c.contact.id,
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
    cta: { label: "Open thread", to: addressOf({ kind: "conversation", id: c.id }) },
    also: null,
    writes: writesOf(c, f),
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
    person_id: c?.contact_id ?? null,
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
    person_id: null,
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

/**
 * A lead who tried their own receptionist (decision 0079): the business, what came of it and the first thing they said
 * is not right, and one button to open the lead. A hot lead, never a person waiting, so it sorts after everyone who is.
 */
function triedRow(t: PreviewTriedDto, f: TodayFacts): TodayQueueRowVM {
  const who = t.business?.trim() || NEED_YOU_WORDS.tried.someone;
  const [said] = previewSaidOf(t.not_right);
  return {
    id: `q-t-${t.id}`,
    kind: "tried",
    conversationId: null,
    callId: null,
    person_id: null,
    who,
    initials: initialsOf(who),
    channel: "Leads",
    when: tzClock(t.tried_at, f.tz, f.now) ?? "",
    sentence: [previewTriedWords(t), said].filter(Boolean).join(" · ") || NEED_YOU_WORDS.tried.sentence,
    quoted: false,
    status: [NEED_YOU_WORDS.tried.status, ...(t.state === "claimed" ? [NEED_YOU_WORDS.tried.claimed] : [])],
    tone: "warn",
    warn: false,
    cta: { label: NEED_YOU_WORDS.tried.open, to: addressOf({ kind: "lead", id: t.lead_id }) },
    also: null,
    waitedMs: Number.NEGATIVE_INFINITY,
  };
}

/** The queue: the rows in order, the rest as a count, what the rows hold in words, and how many people are waiting on you. */
export function todayQueue(f: TodayFacts, callRows: TodayCallRowVM[], empty: TodayQueueEmptyVM): TodayVM["queue"] {
  const { escRecords, closingConvs, searches, now } = f;
  const queueAll: TodayQueueRowVM[] = [];
  // The receptionist's replies counting down, first: each sends on its own in seconds unless stopped (decision 0071).
  const held = new Set<string>();
  for (const c of f.conversations) {
    if (f.escSet.has(c.id)) continue;
    const row = heldRow(c, f);
    if (!row) continue;
    queueAll.push(row);
    held.add(c.id);
  }
  for (const r of escRecords) {
    queueAll.push(r.e.reason === "callback" ? callbackRow(r, f) : handoffRow(r, f));
  }
  // A thread whose reply is counting down is its held row, which says when its window closes: one row for one person.
  for (const c of closingConvs) {
    if (!held.has(c.id)) queueAll.push(windowRow(c, f));
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
  // The leads who tried their preview, newest first, after everyone waiting (decision 0079).
  for (const t of f.previewsTried) queueAll.push(triedRow(t, f));
  queueAll.sort((a, b) => b.waitedMs - a.waitedMs);
  const countOf = (...kinds: TodayQueueRowVM["kind"][]) => queueAll.filter((r) => kinds.includes(r.kind)).length;
  const needN = countOf("handoff", "callback");
  const winN = countOf("window");
  const earN = countOf("call");
  const searchN = countOf("search");
  const triedN = countOf("tried");
  // The people waiting are said as people: the head's count beside this line is every one of them and every run
  // waiting for a word (needs-you.ts), and "25 need you" beside a 28 read as two answers to one question (Ruben's
  // screenshot, 18 Oct 2026); "25 people" and "3 runs waiting" add up to it.
  const parts = [
    needN ? `${needN} ${needN === 1 ? "person" : "people"}` : "",
    searchN ? `${searchN} ${searchN === 1 ? "search" : "searches"} waiting for your answer` : "",
    winN ? `${winN} reply window${winN === 1 ? "" : "s"} closing` : "",
    earN ? `${earN} call${earN === 1 ? "" : "s"} worth a listen` : "",
    triedN ? NEED_YOU_WORDS.tried.part(triedN) : "",
  ].filter(Boolean);
  return {
    rows: queueAll.slice(0, TODAY_QUEUE_MAX),
    more: Math.max(0, queueAll.length - TODAY_QUEUE_MAX),
    // The PEOPLE past the six, apart from the rest: the brief said "and 20 more need you" over sixteen people, counting
    // the calls and the search that sort after them.
    more_people: queueAll.slice(TODAY_QUEUE_MAX).filter(isPersonRow).length,
    // Every call worth a listen and every search waiting for an answer, drawn or not: the brief counted only those
    // among the six rows, so it said nothing of four calls the head had just counted.
    calls: earN,
    searches: searchN,
    windows: winN,
    parts,
    empty,
  };
}
