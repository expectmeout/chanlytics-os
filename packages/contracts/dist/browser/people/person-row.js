import { clockDate, inLocalWeek, localDaysBetween } from "../shared/clock.js";
import { formatPhoneDisplay } from "../shared/phone.js";
import { personName } from "./person-name.js";
import {
  PERSON_CAME_FROM_WORDS,
  PERSON_CHANNEL_WORDS
} from "./person-words.js";
import { isOptedOutContact } from "../consent/consent.js";
import {
  visitDateKey,
  visitDay,
  visitLine,
  visitTime,
  visitsAt
} from "../calendar/calendar-people.js";
import { bookedAfterAsk } from "../calendar/visit/booked-after-ask.js";
import { visitDoor } from "../calendar/appointment-key.js";
import { visitTitleWithout } from "../calendar/visit/visit-service.js";
import { visitLineOf, visitMarkOfDto } from "../calendar/calendar-words.js";
import { nextStepOf, stepIsDue } from "../notes/steps.js";
import { initialsOf, isEmailStopped } from "../conversations/thread-contact.js";
import { dealOf, openDealsOf } from "../deals/deal-vm.js";
import { dealStageOf, dealStagesOf } from "../deals/deal-consultations.js";
import { MONTH_MS, ts } from "./person-helpers.js";
import { replyReachOf } from "./person-reach.js";
import { receptionistOf } from "./person-receptionist.js";
import {
  ago,
  consentOf,
  firstContactOf,
  lastContactOf,
  theirTurnWords
} from "./person-row-facts.js";
import { reasonShort } from "../conversations/escalations.js";
import { readingOf } from "../conversations/standing.js";
import { heardAt, PERSON_STATE_LABELS, personStanding, personStateFor } from "./person-state.js";
import { personReachOf } from "../broadcasts/reach-any.js";
import { asNameSource, PERSON_NAME_WORDS } from "../person-page/words.js";
function rowNameAndWorkOf(r, tz, nowMs) {
  return {
    worksAt: r.lead_id ? { leadId: r.lead_id, name: r.lead_name ?? null, gone: !!r.lead_gone } : null,
    nameSource: asNameSource(r.name_source),
    nameSettled: !!r.name_settled_at,
    standIn: r.name_source === "lead",
    signer: signerOfRow(r, tz, nowMs)
  };
}
function stepKeysOf(r, tz, nowMs) {
  const nextStep = nextStepOf(r, tz, nowMs);
  return { nextStep, stepDue: stepIsDue(nextStep) };
}
function signerOfRow(r, tz, nowMs) {
  if (!r.signer_message_id || !r.signer_name) return null;
  if (r.name_source !== "lead" && r.display_name) return null;
  const read = r.signer_read_at ? Date.parse(r.signer_read_at) : NaN;
  return {
    messageId: r.signer_message_id,
    name: r.signer_name,
    title: r.signer_title ?? null,
    fact: PERSON_NAME_WORDS.signed(r.signer_name),
    day: Number.isFinite(read) ? clockDate(read, tz, nowMs) : ""
  };
}
function channelsOf(r) {
  const set = new Set(r.channels ?? []);
  const wrote = r.message_channels;
  if (wrote ? wrote.includes("whatsapp") : r.has_chat) set.add("whatsapp");
  if (wrote?.includes("sms")) set.add("sms");
  if (wrote?.includes("email")) set.add("email");
  if (wrote?.includes("instagram")) set.add("instagram");
  if ((r.call_count ?? 0) > 0) set.add("voice");
  const order = ["whatsapp", "sms", "voice", "email", "instagram"];
  return order.filter((c) => set.has(c));
}
export function replyChannelOfRow(r) {
  if (!r.has_chat) return null;
  const last = lastChannelOf(r.last_inbound_channel);
  if (last) return last;
  const wrote = r.message_channels;
  const only = wrote && wrote.length === 1 ? lastChannelOf(wrote[0]) : null;
  if (only) return only;
  if (wrote && wrote.includes("email") && !wrote.some((c) => c === "whatsapp" || c === "sms")) return "email";
  return "whatsapp";
}
export function igClockOfRow(r) {
  return r.last_inbound_channel === "instagram" ? r.last_wrote_at ?? null : null;
}
export function cameFromOf(r) {
  const k = r.came_from;
  if (!k || !Object.prototype.hasOwnProperty.call(PERSON_CAME_FROM_WORDS, k)) return null;
  return { key: k, label: PERSON_CAME_FROM_WORDS[k] };
}
export function visitLineForDto(v, o) {
  return visitLineOf(
    {
      id: v.record_id ?? v.id,
      mark: visitMarkOfDto(v),
      startMs: Date.parse(v.start),
      endMs: Date.parse(v.end),
      title: visitTitleWithout(v.title, [o.person.name]),
      day: visitDay(v.start, o.zone, o.nowMs),
      time: visitTime(v, o.zone),
      person: o.person,
      via: v.via,
      to: visitDoor(visitDateKey(v.start, o.zone), v.record_id)
    },
    o.nowMs
  );
}
function visitWordsOf(v, nowMs, person) {
  const said = (d, zone) => d ? {
    day: visitDay(d.start, zone, nowMs),
    line: `${visitLine(d, zone, nowMs)} \xB7 ${visitTitleWithout(d.title, [person.name])}`,
    vm: visitLineForDto(d, { zone, nowMs, person })
  } : null;
  const next = v ? said(v.next, v.timezone) : null;
  const last = v ? said(v.last, v.timezone) : null;
  return {
    nextVisitDay: next?.day ?? null,
    nextVisit: next?.line ?? null,
    nextVisitLine: next?.vm ?? null,
    lastVisitDay: last?.day ?? null,
    lastVisit: last?.line ?? null,
    lastVisitLine: last?.vm ?? null
  };
}
function visitKeysOf(v, nowMs, tz) {
  const near = v ? v.near ?? [v.last, v.next].filter((x) => x !== null) : [];
  const missedMs = v?.missed ? Date.parse(v.missed.start) : NaN;
  return {
    missedVisitDays: Number.isFinite(missedMs) ? Math.max(0, localDaysBetween(missedMs, nowMs, tz)) : null,
    visitDays: v ? near.map((x) => ({ date: visitDateKey(x.start, v.timezone), via: x.via })) : [],
    nextVisitDate: v?.next ? visitDateKey(v.next.start, v.timezone) : null,
    lastVisitDate: v?.last ? visitDateKey(v.last.start, v.timezone) : null,
    nextVisitId: v?.next?.record_id ?? null,
    lastVisitId: v?.last?.record_id ?? null,
    nextVisitVia: v?.next?.via ?? null,
    lastVisitVia: v?.last?.via ?? null,
    calendarTz: v?.timezone ?? null
  };
}
function consultationKeysOf(v, nextVisitMs) {
  return {
    consultationVisit: !!(v?.next?.consultation || v?.last?.consultation),
    consultedMs: v?.last?.consultation ? ts(v.last.end) : null,
    consultationTitle: v?.last?.consultation ? v.last.title : v?.next?.consultation ? v.next.title : null,
    consultAhead: v?.next?.consultation && nextVisitMs !== null && Number.isFinite(nextVisitMs) ? { startMs: nextVisitMs, allDay: !!v.next.all_day } : null
  };
}
function lastChannelOf(c) {
  return c === "whatsapp" || c === "sms" || c === "email" || c === "instagram" ? c : null;
}
function rowReachOf(r, consent, ready) {
  const facts = { lastChannel: lastChannelOf(r.last_inbound_channel), emailSuppressed: isEmailStopped(r) };
  return { ...facts, ...personReachOf({ consent, phone: r.phone_e164, email: r.email ?? null, ...facts }, ready) };
}
function rowReplyOf(r, now, emailStopped, who) {
  return replyReachOf(
    {
      wire: replyChannelOfRow(r),
      waInboundAt: r.latest_wa_inbound_at,
      igInboundAt: igClockOfRow(r),
      emailStopped,
      optedOut: isOptedOutContact({ consent: r.consent, dnc: r.dnc }),
      who
    },
    now
  );
}
function rowThreadOf(r, askedMs) {
  const reading = readingOf(askedMs, r);
  return {
    threadId: r.has_chat && r.latest_conversation_id ? `th-${r.latest_conversation_id}` : null,
    conversationId: r.latest_conversation_id,
    unseen: reading.unseen,
    markAtMs: reading.markAtMs,
    seenAtMs: r.seen_at && Number.isFinite(Date.parse(r.seen_at)) ? Date.parse(r.seen_at) : 0
  };
}
export function toPersonRowVM(r, tz, now = /* @__PURE__ */ new Date(), viewerId = null, ready, names = null) {
  const nowMs = now.getTime();
  const name = personName(r);
  const state = personStateFor(r, nowMs, tz, viewerId);
  const last = lastContactOf(r, tz, nowMs);
  const first = firstContactOf(r, tz, nowMs);
  const consent = consentOf(r, tz, nowMs);
  const reach = rowReachOf(r, consent, ready);
  const v = visitsAt(r.visits ?? null, nowMs);
  const calendar = v ? v.state : "none";
  const askedMs = heardAt(r);
  const booked = !!v?.next;
  const nextVisitMs = v?.next ? Date.parse(v.next.start) : null;
  const lastVisitMs = v?.last ? Date.parse(v.last.start) : null;
  const askedNotBooked = calendar === "ok" && askedMs !== null && nowMs - askedMs <= MONTH_MS && !bookedAfterAsk(v, askedMs);
  const stateDetail = state === "needs_you" ? r.open_escalation_reason ? reasonShort(r.open_escalation_reason) : r.queued_reply_at && personStanding(r, nowMs).standing !== "needs_you" ? "a reply is about to send \u2014 you can still stop it" : "waiting for a person" : state === "waiting_on_you" ? (
    // The pill says "You have it" (HELD_WORDS), so the detail adds only whose turn it is.
    theirTurnWords(last) ?? ""
  ) : state === "opted_out" ? consent.sub : state === "new" ? `first contact ${first.label}` : state === "quiet" ? `last heard from ${ago(askedMs, tz, nowMs)}` : state === "unheard" ? last.ts === null ? "no contact recorded" : "they have not written or called" : "";
  const vm = {
    id: r.id,
    real: true,
    name,
    givenName: r.display_name?.trim() || null,
    initials: initialsOf(name),
    phone: formatPhoneDisplay(r.phone_e164),
    email: r.email ?? null,
    ...reach,
    waName: r.wa_profile_name,
    channels: channelsOf(r),
    hasChat: !!r.has_chat,
    state,
    stateLabel: PERSON_STATE_LABELS[state],
    stateDetail,
    lastContact: last,
    receptionist: receptionistOf(r, tz, nowMs, viewerId, names),
    firstContact: first,
    cameFrom: cameFromOf(r),
    consent,
    quote: r.last_inbound_text?.trim() || null,
    callSummary: r.last_inbound_call_summary?.trim() || null,
    threads: r.conversation_count ?? 0,
    calls: r.call_count ?? 0,
    escalations: r.escalation_count ?? 0,
    callSeconds: r.call_seconds ?? 0,
    ...rowThreadOf(r, askedMs),
    needsYouSinceMs: ts(r.open_escalation_since),
    calendar,
    booked,
    ...visitWordsOf(v, nowMs, { id: r.id, name }),
    ...rowReplyOf(r, now, reach.emailSuppressed, name),
    channelWords: channelsOf(r).map((c) => PERSON_CHANNEL_WORDS[c]).join(" \xB7 "),
    askedMs,
    askedNotBooked,
    nextVisitMs,
    lastVisitMs,
    nextVisitDays: nextVisitMs !== null ? Math.max(0, localDaysBetween(nowMs, nextVisitMs, tz)) : null,
    lastVisitDays: lastVisitMs !== null ? Math.max(0, localDaysBetween(lastVisitMs, nowMs, tz)) : null,
    nextVisitThisWeek: nextVisitMs !== null && Number.isFinite(nextVisitMs) && inLocalWeek(nextVisitMs, tz, nowMs),
    heardDays: askedMs !== null ? Math.max(0, localDaysBetween(askedMs, nowMs, tz)) : null,
    firstDays: first.ts !== null ? Math.max(0, localDaysBetween(first.ts, nowMs, tz)) : null,
    standing: state === "needs_you" || state === "waiting_on_you" ? state : null,
    assigned: !r.latest_assignee_user_id ? "nobody" : !viewerId ? "someone" : r.latest_assignee_user_id === viewerId ? "me" : "teammate",
    stopped: isOptedOutContact({ consent: r.consent, dnc: r.dnc }),
    ...visitKeysOf(v, nowMs, tz),
    deal: dealOf(r, tz, nowMs),
    openDeals: openDealsOf(r, tz, nowMs),
    ...consultationKeysOf(v, nextVisitMs),
    ...stepKeysOf(r, tz, nowMs),
    dealStage: null,
    dealStages: [],
    followUp: null,
    ...rowNameAndWorkOf(r, tz, nowMs)
  };
  vm.dealStage = dealStageOf(vm, nowMs);
  vm.dealStages = dealStagesOf(vm.dealStage, vm.openDeals);
  return vm;
}
