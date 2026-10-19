import { addressOf } from "../activity/record-address.js";
import { HOLD_ACT_WORDS, holdActOf, reasonLabelOf, reasonShort } from "../conversations/escalations.js";
import { messageWords, clipAtWord } from "../conversations/message-words.js";
import { threadChannelWords } from "../conversations/thread-channel.js";
import { formatWaited } from "../conversations/thread-clock.js";
import { contactName, initialsOf } from "../conversations/thread-contact.js";
import { waWindow } from "../config/policy.js";
import { leadQuestionRoute } from "../leads/leads.js";
import { MIN_MS, HOUR_MS } from "../shared/time.js";
import { tzClock } from "./today-clock.js";
import { QUOTE_MAX } from "./today-facts.js";
import { say } from "./today-rows.js";
const TODAY_QUEUE_MAX = 6;
const PEOPLE_KINDS = /* @__PURE__ */ new Set(["handoff", "callback", "window", "reply"]);
export function isPersonRow(r) {
  return PEOPLE_KINDS.has(r.kind);
}
const HOLD_KINDS = /* @__PURE__ */ new Set(["handoff", "callback", "reply"]);
export function isHoldRow(r) {
  return HOLD_KINDS.has(r.kind);
}
export function namesAPerson(r) {
  return r.kind !== "search" && r.kind !== "steps" && r.kind !== "visits";
}
const SEARCH_WARN_MS = 12 * HOUR_MS;
function callbackRow(r) {
  const e = r.e;
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
    sentence: say(e.details) || "The caller needs a call back.",
    quoted: false,
    status: ["Needs a call back", `since ${r.since}`],
    tone: "escalated",
    warn: r.warn,
    cta: {
      label: HOLD_ACT_WORDS.call_back.cta,
      to: r.call ? addressOf({ kind: "call", id: r.call.id }) : addressOf({ kind: "hold", conversationId: e.conversation_id })
    },
    also: { label: "Done", verb: "resolve", conversationId: e.conversation_id, escalationId: e.id },
    waitedMs: r.waitedMs
  };
}
function handoffRow(r) {
  const e = r.e;
  if (e.reason === "booking_request")
    return {
      ...handoffOf(r),
      sentence: say(e.details) || reasonLabelOf(e.reason),
      quoted: false,
      request: { conversationId: e.conversation_id }
    };
  return handoffOf(r);
}
function handoffOf(r) {
  const e = r.e;
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
    status: [
      "Escalated",
      reasonShort(e.reason) || e.reason,
      `since ${r.since}`,
      ...r.closes ? [`reply window closes ${r.closes}`] : []
    ],
    tone: "escalated",
    warn: r.warn,
    // The verb follows the reason's act (escalations.ts): a reply to write, a call to return, or nothing that may be sent.
    cta: {
      label: HOLD_ACT_WORDS[holdActOf(e.reason)].cta,
      to: addressOf({ kind: "hold", conversationId: e.conversation_id })
    },
    also: { label: "Snooze", verb: "snooze", conversationId: e.conversation_id, escalationId: e.id },
    waitedMs: r.waitedMs
  };
}
function windowRow(c, f) {
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
    when: `closes ${tzClock(w.closesAtIso, tz, now) ?? "soon"} \xB7 in ${formatWaited(leftMs)}`,
    sentence: last ? clipAtWord(messageWords(last), QUOTE_MAX) : "They wrote last, and the free reply window is closing.",
    quoted: !!last,
    status: ["Reply window closing", "they wrote last"],
    tone: "warn",
    warn: leftMs < 2 * HOUR_MS,
    cta: { label: "Open thread", to: addressOf({ kind: "conversation", id: c.id }) },
    also: null,
    // After every escalation (which waited ≥ 0), the soonest to close first.
    waitedMs: -leftMs
  };
}
function earRow(r, f) {
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
    when: `${r.at}${r.duration ? ` \xB7 ${r.duration}` : ""}`,
    sentence: wanted || r.note,
    quoted: false,
    status: [wanted ? r.note : "Worth a listen"],
    tone: "warn",
    warn: false,
    cta: { label: "Open the call", to: r.to },
    also: null,
    waitedMs: Number.NEGATIVE_INFINITY
  };
}
function searchRow(s, now) {
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
    waitedMs
  };
}
export function todayQueue(f, callRows, empty) {
  const { escRecords, closingConvs, searches, now } = f;
  const queueAll = [];
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
  for (const s of searches ?? []) {
    const row = searchRow(s, now);
    if (row) queueAll.push(row);
  }
  queueAll.sort((a, b) => b.waitedMs - a.waitedMs);
  const countOf = (...kinds) => queueAll.filter((r) => kinds.includes(r.kind)).length;
  const needN = countOf("handoff", "callback");
  const winN = countOf("window");
  const earN = countOf("call");
  const searchN = countOf("search");
  const parts = [
    needN ? `${needN} ${needN === 1 ? "person" : "people"}` : "",
    searchN ? `${searchN} ${searchN === 1 ? "search" : "searches"} waiting for your answer` : "",
    winN ? `${winN} reply window${winN === 1 ? "" : "s"} closing` : "",
    earN ? `${earN} call${earN === 1 ? "" : "s"} worth a listen` : ""
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
    empty
  };
}
