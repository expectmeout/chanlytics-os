import { standingOfThread } from "../conversations/standing.js";
import { toCallVM } from "../conversations/call-vm.js";
import { waitsOnAPerson } from "../conversations/escalations.js";
import { threadWaitsOf } from "../conversations/inbox-thread.js";
import { lastExchanged, messageWords, clipAtWord } from "../conversations/message-words.js";
import { contactName } from "../conversations/thread-contact.js";
import { isOptedOut } from "../conversations/thread-dto.js";
import { waWindow } from "../config/policy.js";
import { channelKindWords } from "../lines/channels.js";
import { formatPhoneDisplay } from "../shared/phone.js";
import { MIN_MS, HOUR_MS } from "../shared/time.js";
import { tzClock, tzSince } from "./today-clock.js";
import { todayReplySpeed } from "./today-metrics.js";
export const QUOTE_MAX = 240;
function todayWires(m) {
  return m.channels.map((c) => ({
    kind: c.kind,
    label: channelKindWords(c.kind),
    on: c.status === "active",
    // A number as a person reads it, "+1 (212) 555-0142": the quiet day's proof
    // said the column's "+12125550142".
    where: c.address ?? formatPhoneDisplay(c.number)
  }));
}
function openEscalations(escalations, byConv, now) {
  return escalations.filter((e) => e.state === "open" && waitsOnAPerson(e.reason)).filter((e) => {
    const conv = byConv.get(e.conversation_id);
    if (!conv) return true;
    return standingOfThread(conv, e, now.getTime()).standing === "needs_you";
  }).sort((a, b) => a.created_at.localeCompare(b.created_at));
}
function newestCallByThread(callDtos) {
  const callByConv = /* @__PURE__ */ new Map();
  for (const c of callDtos) {
    if (!c.conversation_id) continue;
    const prev = callByConv.get(c.conversation_id);
    if (!prev || String(c.started_at ?? "") > String(prev.started_at ?? "")) callByConv.set(c.conversation_id, c);
  }
  return callByConv;
}
function escalationRecords(openEsc, byConv, callByConv, tz, now) {
  return openEsc.map((e) => {
    const conv = byConv.get(e.conversation_id);
    const call = e.reason === "callback" ? callByConv.get(e.conversation_id) ?? null : null;
    const lastCustomer = conv ? [...conv.messages].reverse().find((x) => x.sender === "customer") : void 0;
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
      who: conv ? contactName(conv) : call ? toCallVM(call, tz, now).who : e.reason === "callback" ? "Unknown caller" : "Unknown",
      closes: win?.open ? tzClock(win.closesAtIso, tz, now) : null
    };
  });
}
function closingConversations(conversations, escSet, now) {
  return conversations.filter((c) => {
    if (escSet.has(c.id) || isOptedOut(c) || c.state === "archived") return false;
    const last = lastExchanged(c.messages);
    if (!last || last.sender !== "customer") return false;
    const w = waWindow(c.last_wa_inbound_at, now);
    return w.open && w.closesAtIso ? new Date(w.closesAtIso).getTime() - now.getTime() < 6 * HOUR_MS : false;
  });
}
export function todayFacts(input) {
  const { metrics, conversations, escalations, calls, now } = input;
  const tz = metrics.workspace.timezone;
  const period = metrics.period;
  const callDtos = calls ?? [];
  const threads = [...conversations, ...input.heldThreads];
  const byConv = new Map(threads.map((c) => [c.id, c]));
  const waits = threadWaitsOf(threads, escalations, now);
  const openEsc = openEscalations(escalations, byConv, now);
  const escSet = new Set(openEsc.map((e) => e.conversation_id));
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
    closingConvs: closingConversations(conversations, escSet, now),
    sinceMs,
    callsInWindow: callDtos.filter((c) => c.started_at && new Date(c.started_at).getTime() >= sinceMs),
    callMinutes: Math.round(period.call_seconds / 60),
    traffic: period.messages_in + period.calls + period.messages_out_you,
    // The oldest wait among the threads WAITING ON YOU: openEsc is the list the headline's count and its one name are
    // read from, oldest first. The metric's oldest open escalation counts the ones you or a teammate hold and the
    // snoozed too, so the headline paired one person's name with another thread's time ("Ana has been waiting since
    // Aug 29"; the 2 Oct 2026 audit).
    oldest: tzSince(openEsc[0]?.created_at, tz, now)
  };
}
