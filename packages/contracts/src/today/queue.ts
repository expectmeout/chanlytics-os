/**
 * Today's queue: everything that asks for a person (a handoff, a call-back, a closing window, a call worth an
 * ear, a search waiting on its owner) in one row grammar, in Need you's order (need-you/groups.ts needYouOrder: a near
 * clock, then what each is worth, the longest wait among equals). The facts are today/facts.ts's; the calls worth an
 * ear are today/rows.ts's.
 */
import { addressOf } from "../activity/record-address";
import { HOLD_ACT_WORDS, holdActOf, reasonLabelOf, reasonShort } from "../conversations/escalations";
import {
  draftSendsAtMs,
  heldDraftOf,
  messageText,
  messageWords,
  clipAtWord,
  sendFailureWords,
} from "../conversations/message-words";
import { threadChannelWords } from "../conversations/thread-channel";
import { formatWaited } from "../conversations/thread-clock";
import { contactName, initialsOf } from "../conversations/thread-contact";
import type { ConversationDto } from "../conversations/thread-dto";
import { waWindow } from "../config/policy/prices";
import { leadQuestionRoute, type LeadSearchDto } from "../leads/leads";
import { previewSaidOf, previewTriedWords, type PreviewTriedDto } from "../previews/tried";
import { NEED_YOU_CAPS, needYouGroupsOf, needYouOrder } from "../need-you/groups";
import { NEED_YOU_WORDS } from "../need-you/words";
import { MIN_MS, HOUR_MS } from "../shared/time";
import { tzClock } from "./clock";
import { QUOTE_MAX, type EscalationRecord, type OwedThread, type TodayFacts } from "./facts";
import { say } from "./rows";
import type { TodayCallRowVM, TodayQueueEmptyVM, TodayQueueRowVM, TodayVM } from "./vm";

/** The reasons of a hold that is someone asking to book: a time they picked by text (0061), or an ask for one. */
const BOOKING_REASONS: ReadonlySet<string> = new Set(["booking_request", "booking_reply"]);

/** The kinds of row that are a person waiting on one; a search and a call worth a listen wait elsewhere and are said apart. */
const PEOPLE_KINDS: ReadonlySet<TodayQueueRowVM["kind"]> = new Set(["handoff", "callback", "window", "reply"]);

/**
 * Whether a row is a person, as the queue's rows go: the people past Need you's caps, which its foot says. Who needs you
 * is isHoldRow: a closing window is a person, and nobody waiting on you (the wiring's second audit, S7-8).
 */
export function isPersonRow(todayQueue: Pick<TodayQueueRowVM, "kind">): boolean {
  return PEOPLE_KINDS.has(todayQueue.kind);
}

/** The kinds of row that are a hold: a person who asked for a person (a handoff, a call-back, a reach-out's reply read). */
const HOLD_KINDS: ReadonlySet<TodayQueueRowVM["kind"]> = new Set(["handoff", "callback", "reply"]);

/**
 * Whether a row is someone who needs you: a hold. The brief names these as needing you and the phone's widget names the
 * first; a closing window is said as a window, never as someone who needs you (the wiring's second audit, S7-8).
 */
export function isHoldRow(todayQueue: Pick<TodayQueueRowVM, "kind">): boolean {
  return HOLD_KINDS.has(todayQueue.kind);
}

/**
 * Whether a row names a person, so it wears a person's face (the kit's Face, over personFaceOf): every row but a search
 * waiting on its owner (a lead search's name) and the rows for the steps and the visits not named (a count). A step, a
 * visit to mark and a call worth a listen name a person without being one waiting on you, which isPersonRow keeps apart.
 */
export function namesAPerson(todayQueue: Pick<TodayQueueRowVM, "kind">): boolean {
  return (
    todayQueue.kind !== "search" &&
    todayQueue.kind !== "steps" &&
    todayQueue.kind !== "visits" &&
    todayQueue.kind !== "tried"
  );
}

/** A question waited this long is warned: the sweep stops it after a day. */
const SEARCH_WARN_MS = 12 * HOUR_MS;

/* ---- the queue: everything that asks for a person, in one row grammar.
   The longest wait first; a closing window by how soon it closes; a call
   worth an ear last. Need you groups and caps them (need-you/groups.ts). ---- */

/**
 * What a row's reply is written for and goes by (decision 0071): their newest message, the thread's wire in words, and
 * WhatsApp's free window where the wire is WhatsApp. A thread the page did not read has no message to answer, and its
 * draft waits for the thread.
 */
function writesOf(
  conv: ConversationDto | undefined,
  todayFacts: Pick<TodayFacts, "tz" | "now">,
): TodayQueueRowVM["writes"] {
  if (!conv) return undefined;
  const last = [...conv.messages].reverse().find((x) => x.sender === "customer");
  const wire = threadChannelWords(conv.messages);
  const item = wire === "WhatsApp" ? waWindow(conv.last_wa_inbound_at, todayFacts.now) : null;
  return {
    for_message_id: last?.id ?? null,
    for_message_at_ms: last ? Date.parse(last.created_at) : null,
    wire,
    window_open: item ? item.open : null,
    window_closes: item?.open ? tzClock(item.closesAtIso, todayFacts.tz, todayFacts.now) : null,
  };
}

/**
 * How long until a thread's WhatsApp window shuts, while it is open: the row's clock (need-you/groups.ts), which puts a
 * reply that must go before it shuts ahead of every wait. Null on another wire, or a window already shut.
 */
function windowLeftMs(conv: ConversationDto | undefined, now: Date): number | null {
  if (!conv || threadChannelWords(conv.messages) !== "WhatsApp") return null;
  const w = waWindow(conv.last_wa_inbound_at, now);
  return w.open && w.closesAtIso ? Math.max(0, new Date(w.closesAtIso).getTime() - now.getTime()) : null;
}

/**
 * A reply the receptionist wrote and holds out its veto window, as a row (decision 0071, E5): it sends on its own unless
 * someone stops it, so it stands first. Its words are the sentence's draft; their words are the sentence. Null for a
 * thread with no reply counting down, or one whose deadline has passed: that one is going out, not waiting.
 */
function heldRow(conversation: ConversationDto, todayFacts: TodayFacts): TodayQueueRowVM | null {
  const draft = heldDraftOf(conversation.messages);
  if (!draft) return null;
  const sendsAtMs = draftSendsAtMs(draft);
  if (sendsAtMs <= todayFacts.now.getTime()) return null;
  const last = [...conversation.messages].reverse().find((x) => x.sender === "customer");
  const personName = contactName(conversation);
  return {
    id: `q-h-${conversation.id}`,
    kind: "held",
    conversationId: conversation.id,
    callId: null,
    person_id: conversation.contact.id,
    who: personName,
    initials: initialsOf(personName),
    channel: threadChannelWords(conversation.messages),
    when: "",
    sentence: last ? clipAtWord(messageWords(last), QUOTE_MAX) : "",
    quoted: !!last,
    status: [NEED_YOU_WORDS.held.goesAlone],
    tone: "warn",
    warn: false,
    cta: { label: NEED_YOU_WORDS.openThread, to: addressOf({ kind: "conversation", id: conversation.id }) },
    also: null,
    writes: writesOf(conversation, todayFacts),
    held: { message_id: draft.id, text: messageText(draft), sends_at_ms: sendsAtMs },
    // Before everyone waiting: it goes on its own in seconds.
    waitedMs: Number.MAX_SAFE_INTEGER,
    clock_ms: sendsAtMs - todayFacts.now.getTime(),
  };
}

/** The ask a call's to-do ends with (unansweredCallTodo), which the row's state line and its Call already say. */
const CALL_BACK_ASK = ` ${HOLD_ACT_WORDS.call_back.notice}`;

/**
 * A call-back: the phone receptionist could not finish it. What happened is the sentence, without the ask its to-do ends
 * with ("Hung up after 39 sec without a word."): "Needs a call back" under it and Call beside it say that (his look on a
 * phone, 29 Oct 2026). The call itself is where the verb goes, Done resolves it.
 */
function callbackRow(escalation: EscalationRecord, todayFacts: TodayFacts): TodayQueueRowVM {
  const error = escalation.e;
  const todo = say(error.details);
  const since = `since ${escalation.since}`;
  return {
    id: `q-${error.id}`,
    kind: "callback",
    conversationId: error.conversation_id,
    callId: escalation.call ? escalation.call.id : null,
    person_id: escalation.conv?.contact.id ?? escalation.call?.contact_id ?? null,
    who: escalation.who,
    initials: initialsOf(escalation.who),
    channel: "Phone",
    when: `waited ${formatWaited(escalation.waitedMs)}`,
    sentence:
      (todo.endsWith(CALL_BACK_ASK) ? todo.slice(0, -CALL_BACK_ASK.length) : todo) || "The caller needs a call back.",
    quoted: false,
    status: ["Needs a call back", since],
    since,
    tone: "escalated",
    warn: escalation.warn,
    cta: {
      label: HOLD_ACT_WORDS.call_back.cta,
      to: escalation.call
        ? addressOf({ kind: "call", id: escalation.call.id })
        : addressOf({ kind: "hold", conversationId: error.conversation_id }),
    },
    also: { label: "Done", verb: "resolve", conversationId: error.conversation_id, escalationId: error.id },
    writes: writesOf(escalation.conv, todayFacts),
    phone: escalation.conv?.contact.phone_e164 ?? escalation.call?.contact?.phone_e164 ?? null,
    reason: say(error.details) || null,
    waitedMs: escalation.waitedMs,
  };
}

/**
 * The words of the newest reply on a thread that never reached them, and why, where the thread was read and holds it: what
 * Try again sends again as written (Today in three zones, 2 Nov 2026). Null where the read holds no failed reply.
 */
function failedReplyOf(conv: ConversationDto | undefined): TodayQueueRowVM["failed"] {
  const m = conv
    ? [...conv.messages].reverse().find((x) => x.direction === "outbound" && x.status === "failed" && !!x.body)
    : undefined;
  if (!m) return undefined;
  return { text: messageText(m), said: sendFailureWords(m.error, m.channel) ?? NEED_YOU_WORDS.failed.wire };
}

/** A handoff: the receptionist stopped and asked for a person; her words are the sentence, Snooze puts it aside. */
function handoffRow(escalation: EscalationRecord, todayFacts: TodayFacts): TodayQueueRowVM {
  const error = escalation.e;
  // A time the customer picked by text: what they asked for is the sentence, and the row answers it (decision 0061).
  if (error.reason === "booking_request")
    return {
      ...handoffOf(escalation, todayFacts),
      sentence: say(error.details) || reasonLabelOf(error.reason),
      quoted: false,
      request: { conversationId: error.conversation_id },
    };
  // A reply that never reached them: what failed and why is the sentence, and the row's words are those that failed, to
  // send again as written with Try again, first among those waiting (needYouOrder). Their own last words stay in the thread.
  if (error.reason === "send_failed") {
    const failed = failedReplyOf(escalation.conv);
    return {
      ...handoffOf(escalation, todayFacts),
      sentence: [NEED_YOU_WORDS.failed.sentence, failed?.said ?? ""].filter(Boolean).join(" "),
      quoted: false,
      ...(failed ? { failed, prepared: failed.text } : {}),
      why: NEED_YOU_WORDS.failed.why,
    };
  }
  return handoffOf(escalation, todayFacts);
}

/** The handoff's row as every reason draws it. */
function handoffOf(escalation: EscalationRecord, todayFacts: TodayFacts): TodayQueueRowVM {
  const error = escalation.e;
  const since = `since ${escalation.since}`;
  return {
    id: `q-${error.id}`,
    kind: "handoff",
    conversationId: error.conversation_id,
    callId: null,
    person_id: escalation.conv?.contact.id ?? null,
    who: escalation.who,
    initials: initialsOf(escalation.who),
    channel: escalation.conv ? threadChannelWords(escalation.conv.messages) : "WhatsApp",
    when: `waited ${formatWaited(escalation.waitedMs)}`,
    sentence: escalation.quote || reasonLabelOf(error.reason),
    quoted: !!escalation.quote,
    // An email says what it is about before its words: "test need you — “needs you test”".
    ...(escalation.quote && escalation.subject ? { lead: escalation.subject } : {}),
    status: [
      "Escalated",
      reasonShort(error.reason) || error.reason,
      since,
      ...(escalation.closes ? [`reply window closes ${escalation.closes}`] : []),
    ],
    since,
    tone: "escalated",
    warn: escalation.warn,
    // The verb follows the reason's act (escalations.ts): a reply to write, a call to return, or nothing that may be sent.
    cta: {
      label: HOLD_ACT_WORDS[holdActOf(error.reason)].cta,
      to: addressOf({ kind: "hold", conversationId: error.conversation_id }),
    },
    also: { label: "Snooze", verb: "snooze", conversationId: error.conversation_id, escalationId: error.id },
    writes: writesOf(escalation.conv, todayFacts),
    reason: reasonLabelOf(error.reason),
    waitedMs: escalation.waitedMs,
    act: holdActOf(error.reason),
    clock_ms: windowLeftMs(escalation.conv, todayFacts.now),
    // Someone asking to book, a time they picked or an ask for one: worth the most of anyone waiting (needYouOrder).
    ...(BOOKING_REASONS.has(error.reason) ? { booking: true } : {}),
    // Why it was handed over, in a few words, for the open card's name line; never "wrote by email" beside the mail glyph
    // an address's face is, over a subject that wears it too (the phone pass, 3 Nov 2026: "email" three times a card).
    ...(reasonShort(error.reason) && !(error.reason === "email_review" && escalation.who.includes("@"))
      ? { why: reasonShort(error.reason) }
      : {}),
  };
}

/**
 * A closing window. "WhatsApp" is right here even when the last written message came by
 * email: the row is about WhatsApp's window (waWindow on the thread's
 * last WhatsApp inbound), which is the one wire that has one. The
 * handoff row above names the wire the reply would go out on instead.
 */
function windowRow(conversation: ConversationDto, todayFacts: TodayFacts): TodayQueueRowVM {
  const { tz, now } = todayFacts;
  const result = waWindow(conversation.last_wa_inbound_at, now);
  const leftMs = result.closesAtIso ? Math.max(MIN_MS, new Date(result.closesAtIso).getTime() - now.getTime()) : 0;
  const last = [...conversation.messages].reverse().find((x) => x.sender === "customer");
  const personName = contactName(conversation);
  return {
    id: `q-w-${conversation.id}`,
    kind: "window",
    conversationId: conversation.id,
    callId: null,
    person_id: conversation.contact.id,
    who: personName,
    initials: initialsOf(personName),
    channel: "WhatsApp",
    when: `closes ${tzClock(result.closesAtIso, tz, now) ?? "soon"} · in ${formatWaited(leftMs)}`,
    sentence: last
      ? clipAtWord(messageWords(last), QUOTE_MAX)
      : "They wrote last, and the free reply window is closing.",
    quoted: !!last,
    status: ["Reply window closing", "they wrote last"],
    tone: "warn",
    warn: leftMs < 2 * HOUR_MS,
    cta: { label: "Open thread", to: addressOf({ kind: "conversation", id: conversation.id }) },
    also: null,
    writes: writesOf(conversation, todayFacts),
    // After every escalation (which waited ≥ 0), the soonest to close first.
    waitedMs: -leftMs,
    clock_ms: leftMs,
  };
}

/**
 * What the rule owes, as a row (today/facts.ts OwedThread). With no hold to give back, letting it go archives the thread, as
 * the thread's own No reply needed does: a new message brings it back.
 */
function owedRow({ conv: c, move, who, waitedMs, word, quote }: OwedThread, todayFacts: TodayFacts): TodayQueueRowVM {
  const failed = move.move === "failed" ? failedReplyOf(c) : undefined;
  return {
    id: `q-o-${c.id}`,
    kind: "handoff",
    conversationId: c.id,
    callId: null,
    person_id: c.contact.id,
    who,
    initials: initialsOf(who),
    channel: threadChannelWords(c.messages),
    when: `waited ${formatWaited(waitedMs)}`,
    sentence: failed ? [NEED_YOU_WORDS.failed.sentence, failed.said].filter(Boolean).join(" ") : quote || word,
    quoted: !failed && !!quote,
    status: [word],
    tone: "escalated",
    warn: waitedMs > 30 * MIN_MS,
    cta: { label: HOLD_ACT_WORDS.reply.cta, to: addressOf({ kind: "conversation", id: c.id }) },
    also: null,
    writes: writesOf(c, todayFacts),
    reason: word,
    waitedMs,
    act: "reply",
    clock_ms: windowLeftMs(c, todayFacts.now),
    closes: "archive",
    ...(failed ? { failed, prepared: failed.text, why: NEED_YOU_WORDS.failed.why } : {}),
  };
}

/** A call worth an ear, as a queue row: after everyone waiting, what the caller wanted as the sentence. */
function earRow(todayCall: TodayCallRowVM, todayFacts: TodayFacts): TodayQueueRowVM {
  const found = todayFacts.callsInWindow.find((k) => k.id === todayCall.id);
  const wanted = say(found?.wanted);
  return {
    id: `q-c-${todayCall.id}`,
    kind: "call",
    conversationId: found?.conversation_id ?? null,
    callId: todayCall.id,
    person_id: found?.contact_id ?? null,
    who: todayCall.who,
    initials: initialsOf(todayCall.who),
    channel: "Phone",
    when: `${todayCall.at}${todayCall.duration ? ` · ${todayCall.duration}` : ""}`,
    sentence: wanted || todayCall.note,
    quoted: false,
    status: [wanted ? todayCall.note : "Worth a listen"],
    tone: "warn",
    warn: false,
    cta: { label: "Open the call", to: todayCall.to },
    also: null,
    waitedMs: Number.NEGATIVE_INFINITY,
  };
}

/**
 * A search that stopped to ask waits on the owner like a person does (spec G6): its name, its question, one
 * button to answer it. Null for a search that is not waiting.
 */
function searchRow(leadSearch: LeadSearchDto, now: Date): TodayQueueRowVM | null {
  const round = leadSearch.round;
  if (!round || round.state !== "waiting_on_owner" || !round.question) return null;
  const since = round.waiting_since ? new Date(round.waiting_since).getTime() : now.getTime();
  const waitedMs = Math.max(0, now.getTime() - since);
  return {
    id: `q-s-${leadSearch.id}`,
    kind: "search",
    conversationId: null,
    callId: null,
    person_id: null,
    who: leadSearch.name,
    initials: initialsOf(leadSearch.name),
    channel: "Leads",
    when: `waited ${formatWaited(waitedMs)}`,
    sentence: round.question.sentence,
    quoted: false,
    status: ["Waiting for your answer", "nothing is spent while it waits"],
    tone: "escalated",
    warn: waitedMs > SEARCH_WARN_MS,
    cta: { label: "Answer", to: leadQuestionRoute(leadSearch.id) },
    also: null,
    waitedMs,
  };
}

/**
 * A lead who tried their own receptionist (decision 0079): the business, what came of it and the first thing they said
 * is not right, and one button to open the lead. A hot lead, never a person waiting, so it sorts after everyone who is.
 */
function triedRow(previewTried: PreviewTriedDto, todayFacts: TodayFacts): TodayQueueRowVM {
  const text = previewTried.business?.trim() || NEED_YOU_WORDS.tried.someone;
  const [said] = previewSaidOf(previewTried.not_right);
  return {
    id: `q-t-${previewTried.id}`,
    kind: "tried",
    conversationId: null,
    callId: null,
    person_id: null,
    who: text,
    initials: initialsOf(text),
    channel: "Leads",
    when: tzClock(previewTried.tried_at, todayFacts.tz, todayFacts.now) ?? "",
    sentence: [previewTriedWords(previewTried), said].filter(Boolean).join(" · ") || NEED_YOU_WORDS.tried.sentence,
    quoted: false,
    status: [NEED_YOU_WORDS.tried.status, ...(previewTried.state === "claimed" ? [NEED_YOU_WORDS.tried.claimed] : [])],
    tone: "warn",
    warn: false,
    cta: { label: NEED_YOU_WORDS.tried.open, to: addressOf({ kind: "lead", id: previewTried.lead_id }) },
    also: null,
    waitedMs: Number.NEGATIVE_INFINITY,
  };
}

/** The queue: the rows in order, the rest as a count, what the rows hold in words, and how many people are waiting on you. */
export function todayQueue(
  todayFacts: TodayFacts,
  callRows: TodayCallRowVM[],
  empty: TodayQueueEmptyVM,
): TodayVM["queue"] {
  const { escRecords, closingConvs, searches, now } = todayFacts;
  const queueAll: TodayQueueRowVM[] = [];
  // The receptionist's replies counting down, first: each sends on its own in seconds unless stopped (decision 0071).
  const held = new Set<string>();
  for (const c of todayFacts.conversations) {
    if (todayFacts.escSet.has(c.id)) continue;
    const row = heldRow(c, todayFacts);
    if (!row) continue;
    queueAll.push(row);
    held.add(c.id);
  }
  for (const r of escRecords) {
    queueAll.push(r.e.reason === "callback" ? callbackRow(r, todayFacts) : handoffRow(r, todayFacts));
  }
  // A thread whose reply is counting down is its held row, which says when its window closes: one row for one person.
  for (const c of closingConvs) {
    if (!held.has(c.id)) queueAll.push(windowRow(c, todayFacts));
  }
  // What the rule owes with no row above: each thread once, a reply counting down its held row.
  for (const o of todayFacts.owed) {
    if (!held.has(o.conv.id)) queueAll.push(owedRow(o, todayFacts));
  }
  for (const r of callRows) {
    if (r.to === "live") continue;
    queueAll.push(earRow(r, todayFacts));
  }
  // Null: the searches were not read; the queue says nothing about them.
  for (const s of searches ?? []) {
    const row = searchRow(s, now);
    if (row) queueAll.push(row);
  }
  // The leads who tried their preview, newest first, after everyone waiting (decision 0079).
  for (const t of todayFacts.previewsTried) queueAll.push(triedRow(t, todayFacts));
  // Need you's order (need-you/groups.ts needYouOrder): a clock near enough first (a reply that goes on its own in
  // seconds, then a window that shuts within two hours), since a window that shuts cannot be answered later and an old wait
  // still can; then the waits under a week by what each is worth, a reply that never reached them first, then a booking,
  // the longest wait among equals. Every row is kept: each group draws its own few (NEED_YOU_CAPS) and the foot says the
  // rest, so a week's old mail never takes the seats of the new asks.
  queueAll.sort(needYouOrder);
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
  // What each group draws past its cap: the people past those waiting on you, and the searches past those to decide.
  const groups = needYouGroupsOf(queueAll);
  const morePeople = Math.max(0, groups.waiting.length - NEED_YOU_CAPS.waiting);
  return {
    rows: queueAll,
    more: morePeople + Math.max(0, groups.ok.length - NEED_YOU_CAPS.ok),
    // The PEOPLE past the rows drawn, apart from the rest: the brief said "and 20 more need you" over sixteen people,
    // counting the calls and the search that sort after them.
    more_people: morePeople,
    // Every call worth a listen and every search waiting for an answer, drawn or not: the brief counted only those
    // among the six rows, so it said nothing of four calls the head had just counted.
    calls: earN,
    searches: searchN,
    windows: winN,
    parts,
    empty,
  };
}
