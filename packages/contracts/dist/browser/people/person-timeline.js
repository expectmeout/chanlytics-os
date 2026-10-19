import { visitDateKey, visitDay } from "../calendar/calendar-people.js";
import { visitDoor, visitLinkWords } from "../calendar/appointment-key.js";
import { callNoteLines, callNotesOf, tidyCallSummary } from "../voice/call-words.js";
import { STOP_WORDS } from "../consent/consent.js";
import { DEAL_LOST_REASON_WORDS, DEAL_STAGE_WORDS, isDealLostReason } from "../deals/deal-words.js";
import { amountWords } from "../deals/deal-amount.js";
import { reasonShort } from "../conversations/escalations.js";
import { visitLineForDto } from "./person-row.js";
import {
  CARRIER_CONSENT_SOURCE,
  CONSENT_RESET_SOURCE,
  consentSourceLabel,
  STOP_ENDED_OFFERS_SOURCE,
  WHATSAPP_CONSENT_SOURCE
} from "./person-consent.js";
import { addedBy, ts } from "./person-helpers.js";
import { MERGE_CONSENT_SOURCE } from "./person-merge.js";
import { capitalize } from "../shared/words.js";
import { callLength, clockHistoryDay } from "../shared/clock.js";
import { shortName } from "../conversations/thread-contact.js";
import {
  CALL_OUTCOME_WORDS,
  callAttemptWords,
  neverConnected,
  reachedVoicemail,
  recordingStateOf
} from "../conversations/call-dto.js";
import { callOutcomeFor } from "../conversations/call-vm.js";
import { isLiveCall } from "../config/policy.js";
import { messageAuthor } from "../conversations/message-author.js";
import { messageAt } from "../conversations/thread-dto.js";
import { clipAtWord, messageStatusLabel, messageWords, reachedCustomer } from "../conversations/message-words.js";
import { reachOutPersonOf } from "../reach-out/reach-out-leads.js";
import { addressOf } from "../activity/record-address.js";
import { dateFormat } from "../shared/time.js";
function howKnown(c) {
  if (c.source === "customer_message") {
    const where = c.channel === "sms" ? "by text" : c.channel === "whatsapp" ? "on WhatsApp" : c.channel === "email" ? "by email" : "in their own message";
    return `In their own words ${where}${c.words ? `: \u201C${c.words}\u201D` : ""}`;
  }
  if (c.source === CONSENT_RESET_SOURCE || !c.source) {
    return "Reset by staff";
  }
  if (c.source === CARRIER_CONSENT_SOURCE) {
    return "Reported by the carrier: they had texted STOP to your number, so a text to them was not sent";
  }
  if (c.source === WHATSAPP_CONSENT_SOURCE) {
    return "Reported by WhatsApp: they chose there to stop marketing messages from your business, so a message to them was not delivered";
  }
  if (c.source === MERGE_CONSENT_SOURCE) {
    return "Two records of this person were merged, and the more careful answer stands";
  }
  return `${consentSourceLabel(c.source) ?? c.source}, recorded by staff${c.note ? ` \xB7 ${c.note}` : ""}`;
}
export function consentChangeWords(c) {
  if (c.source === STOP_ENDED_OFFERS_SOURCE && c.purpose !== "conversational")
    return {
      who: c.purpose === "email_marketing" ? "Email" : "Offers",
      text: c.purpose === "email_marketing" ? "Their yes to offers by email ended" : "Their yes to offers ended",
      sub: "They said stop, which ends it. Offers start again only on a new yes of their own"
    };
  if (c.purpose === "email_marketing")
    return {
      who: "Email",
      text: c.consent === "opted_out" ? c.source === "reply" ? "Said no in a reply to your email" : "Unsubscribed from your emails" : c.consent === "opted_in" ? c.source === "reply_undone" ? "Marketing email: back to yes" : "Asked for offers by email" : "Marketing email: back to not asked",
      ...c.source === "unsubscribe" ? { sub: c.words ? `Wrote \u201C${c.words}\u201D in reply to an email` : "Pressed Unsubscribe in an email" } : c.source === "reply_undone" ? { sub: "A reply read as no, undone" } : c.consent === "opted_in" && c.source === "customer_message" ? { sub: `In their own words by email${c.words ? `: \u201C${c.words}\u201D` : ""}` } : {}
    };
  const offers = c.purpose === "marketing";
  const text = c.consent === "opted_in" ? offers ? "Said yes to offers and news" : "Said yes to messages" : c.consent === "opted_out" ? offers ? "Said no to offers" : `${STOP_WORDS.said()} \u2014 nothing goes out to them` : offers ? "Offers: back to not asked" : "Back to not asked";
  return { who: offers ? "Offers" : "Consent", text, sub: howKnown(c) };
}
const DECISION_LABELS = {
  take_over: { who: "Took over", did: "paused the receptionist on this thread" },
  hand_back: { who: "Handed back", did: "returned the thread to the receptionist" },
  snooze: { who: "Snoozed", did: "snoozed the thread" },
  wake: { who: "Woke", did: "brought the thread back" },
  resolve: { who: "Resolved", did: "marked the escalation resolved" },
  archive: { who: "Archived", did: "archived the thread" },
  cancel_send: { who: "Canceled a reply", did: "stopped a reply before it sent" },
  pause_agent: { who: "Paused the receptionist", did: "paused automatic replies" },
  resume_agent: { who: "Resumed the receptionist", did: "resumed automatic replies" }
};
const EXPORTED_THEIR_RECORDS = { who: "Downloaded their records", did: "downloaded their records" };
function decisionLabel(dec) {
  if (dec.verb === "export") return dec.payload?.what === "person" ? EXPORTED_THEIR_RECORDS : void 0;
  return DECISION_LABELS[dec.verb];
}
function decidedBy(dec, viewerId, names) {
  if (dec.actor_type === "ai") return "The receptionist";
  if (dec.actor_type === "system") return "The system";
  if (dec.actor_user_id && dec.actor_user_id === viewerId) return "You";
  return (dec.actor_user_id ? names?.(dec.actor_user_id) : null) || "Your team";
}
function timelineKindOf(sender) {
  return sender === "customer" ? "customer" : sender === "human" ? "team" : sender === "ai" ? "receptionist" : "system";
}
function asRunMessage(m, run) {
  if (!run || m.meta?.source === "broadcast") return m;
  return {
    ...m,
    meta: {
      ...m.meta,
      source: "broadcast",
      broadcast_name: run.name,
      ...run.playbook_id ? { playbook_name: run.playbook_name || run.name } : {}
    }
  };
}
function speakerOf(author) {
  return !author ? "System" : author.kind === "receptionist" ? "Receptionist" : author.kind === "team" ? "Your team" : capitalize(author.words);
}
const reachOutOf = ({ profile, nowMs, tz }) => profile.lead?.reach_out ? reachOutPersonOf(profile.lead.reach_out, nowMs, tz) : null;
function messageItems(ctx) {
  const { profile, base, stamp } = ctx;
  const reach = reachOutOf(ctx);
  const first = base.standIn ? base.name : shortName(base.name);
  const runOf = new Map((profile.campaigns ?? []).filter((c) => c.message_id).map((c) => [c.message_id, c]));
  const items = [];
  for (const c of profile.conversations) {
    for (const m of c.messages) {
      if (m.type === "call_summary") continue;
      const t = ts(messageAt(m));
      if (t === null) continue;
      const kind = timelineKindOf(m.sender);
      const author = messageAuthor(asRunMessage(m, runOf.get(m.id)));
      const cold = reach?.emails.get(m.id);
      const read = reach?.readings.get(m.id);
      const unsent = reachedCustomer(m.status) ? void 0 : messageStatusLabel(m.status, m.channel);
      const sub = [unsent, cold?.sub ?? read].filter(Boolean).join(" \xB7 ") || void 0;
      items.push({
        id: `m-${m.id}`,
        ts: t,
        ...stamp(t),
        kind,
        who: kind === "customer" ? first : cold?.who ?? speakerOf(author),
        text: messageWords(m),
        ...sub ? { sub } : {},
        ...unsent ? { unsent: true } : {},
        link: { label: "Open the thread", to: addressOf({ kind: "conversation", id: c.id }) }
      });
    }
  }
  return items;
}
function callItems({ profile, stamp, now }) {
  const items = [];
  for (const k of profile.calls) {
    const t = ts(k.started_at);
    if (t === null) continue;
    const outcome = CALL_OUTCOME_WORDS[callOutcomeFor(k, isLiveCall(k, now))];
    const dur = callLength(k.duration_ms);
    const wanted = (k.wanted || "").trim();
    const summary = tidyCallSummary(k.summary) ?? "";
    const missed = neverConnected(k);
    const notes = callNoteLines(callNotesOf(k));
    const sentence = missed ? "The call never connected." : wanted || (summary ? summary.split(/(?<=[.!?])\s/)[0] ?? summary : reachedVoicemail(k) ? "Reached voicemail." : "No summary from this call.");
    items.push({
      id: `k-${k.id}`,
      ts: t,
      ...stamp(t),
      kind: "call",
      who: missed ? callAttemptWords(k.direction) : `${k.direction === "inbound" ? "Inbound" : "Outbound"} call${dur ? ` \xB7 ${dur}` : ""}`,
      text: sentence,
      ...notes.length ? { notes } : {},
      // The outcome's word, then where the call is kept; not said twice where the sentence is the word ("Reached voicemail.").
      sub: [
        sentence.replace(/\.$/, "") === outcome ? null : outcome,
        missed ? null : recordingStateOf(k) === "ready" ? "Recording and transcript in Conversations" : "Transcript in Conversations"
      ].filter(Boolean).join(" \xB7 "),
      link: { label: "Open", to: addressOf({ kind: "call", id: k.id }) }
    });
  }
  return items;
}
function escalationItems({ profile, stamp }) {
  const items = [];
  for (const e of profile.escalations) {
    const t = ts(e.created_at);
    if (t === null) continue;
    const said = e.details?.trim();
    const details = said && said.toLowerCase() !== reasonShort(e.reason).toLowerCase() ? clipAtWord(said, 120) : null;
    const resolvedAt = e.state === "resolved" ? ts(e.updated_at) : null;
    items.push({
      id: `e-${e.id}`,
      ts: t,
      ...stamp(t),
      kind: "escalation",
      who: "Escalated",
      text: e.reason === "callback" && details ? details : `${capitalize(reasonShort(e.reason)) || "The receptionist stopped"}${details ? ` \xB7 \u201C${details}\u201D` : ""}`,
      // "Open" beside a row that opens something read as the verb; the state is what it says.
      sub: e.state === "resolved" ? `Resolved${resolvedAt !== null ? ` \xB7 ${stamp(resolvedAt).time} ${stamp(resolvedAt).day}` : ""}${e.resolved_by_user_id ? " \xB7 by a person" : ""}` : "Still open",
      link: { label: "Open the thread", to: addressOf({ kind: "hold", conversationId: e.conversation_id }) }
    });
  }
  return items;
}
function decisionItems({ profile, row, stamp, viewerId, names }) {
  const convIds = new Set(profile.conversations.map((c) => c.id));
  const items = [];
  for (const dec of profile.decisions) {
    const label = decisionLabel(dec);
    if (!label) continue;
    const mine = dec.subject_type === "conversation" && convIds.has(dec.subject_id) || dec.subject_type === "contact" && dec.subject_id === row.id;
    if (!mine) continue;
    const t = ts(dec.created_at);
    if (t === null) continue;
    items.push({
      id: `d-${dec.id}`,
      ts: t,
      ...stamp(t),
      kind: "decision",
      who: label.who,
      text: `${decidedBy(dec, viewerId, names)} ${label.did}`
    });
  }
  return items;
}
function consentItems({ profile, stamp }) {
  const items = [];
  for (const c of profile.consent_history ?? []) {
    const t = ts(c.at);
    if (t === null) continue;
    const w = consentChangeWords(c);
    items.push({
      id: `c-${c.id}`,
      ts: t,
      ...stamp(t),
      kind: "consent",
      who: w.who,
      text: w.text,
      ...w.sub ? { sub: w.sub } : {}
    });
  }
  return items;
}
function visitItems({ profile, nowMs, base, stamp, word }) {
  const items = [];
  if (profile.visits?.all?.length) {
    const zone = profile.visits.timezone;
    for (const v of profile.visits.all) {
      const t = Date.parse(v.start);
      if (!Number.isFinite(t)) continue;
      const line = visitLineForDto(v, { zone, nowMs, person: { id: base.id, name: base.name } });
      const ahead = line.state === null;
      items.push({
        ...ahead ? { ahead: true } : {},
        id: `v-${v.id}`,
        ts: t,
        ...stamp(t),
        kind: "visit",
        who: "Calendar",
        text: `${line.state ? line.state.text : "Booked"} \xB7 ${line.title}`,
        sub: `${line.time} \xB7 from ${profile.visits.source}${line.guess && line.match ? ` \xB7 ${line.match}` : ""}`,
        visit: line,
        // The visit itself when the record has a row for it (the Calendar opens its panel), else its day.
        link: { label: visitLinkWords(v.record_id, word), to: visitDoor(visitDateKey(v.start, zone), v.record_id) }
      });
    }
  }
  return items;
}
function dealItems({ profile, stamp }) {
  const items = [];
  for (const x of profile.deals ?? []) {
    const svc = x.service ? ` \xB7 ${x.service}` : "";
    const put = (id, at, text) => {
      const t = ts(at);
      if (t === null) return;
      items.push({ id, ts: t, ...stamp(t), kind: "deal", who: "You", text });
    };
    const value = amountWords(x.amount_cents, x.per, x.currency);
    const client = x.stage === "won" || x.stage === "ended";
    put(`dl-${x.id}-p`, x.proposed_at, `${DEAL_STAGE_WORDS.proposed}${svc}${value && !client ? ` \xB7 ${value}` : ""}`);
    if (client) put(`dl-${x.id}-w`, x.decided_at, `Became a client${svc}${value ? ` \xB7 ${value}` : ""}`);
    const why = isDealLostReason(x.lost_reason) ? ` \xB7 ${DEAL_LOST_REASON_WORDS[x.lost_reason]}` : "";
    if (x.stage === "lost") put(`dl-${x.id}-l`, x.decided_at, `Passed${svc}${why}`);
    if (x.stage === "ended") put(`dl-${x.id}-e`, x.ended_at, `Ended${svc}`);
  }
  return items;
}
function addedItems({ profile, stamp }) {
  if (!profile.added) return [];
  const t = ts(profile.added.at);
  const by = addedBy(profile.added);
  const door = by.to ? { link: { label: "Open the ad", to: by.to } } : {};
  return t !== null ? [{ id: "added", ts: t, ...stamp(t), kind: "system", who: by.who, text: `Added ${by.how}`, ...door }] : [];
}
function foundItems(ctx) {
  const found = reachOutOf(ctx)?.found;
  const lead = ctx.profile.lead;
  if (!found || !lead) return [];
  return [
    {
      id: "found",
      ts: found.at,
      ...ctx.stamp(found.at),
      kind: "system",
      who: "Leads",
      text: found.text,
      link: { label: "Open the lead", to: addressOf({ kind: "lead", id: lead.id }) }
    }
  ];
}
export function timelineOf(ctx) {
  const items = [
    ...messageItems(ctx),
    ...callItems(ctx),
    ...escalationItems(ctx),
    ...decisionItems(ctx),
    ...consentItems(ctx),
    ...visitItems(ctx),
    ...dealItems(ctx),
    ...addedItems(ctx),
    ...foundItems(ctx)
  ];
  items.sort((a, b) => b.ts - a.ts);
  return items.map((i) => ({ ...i, dayHead: clockHistoryDay(i.ts, ctx.tz, ctx.nowMs) }));
}
export function comingUpOf({ profile, nowMs, base }) {
  const found = [];
  if (profile.visits?.all?.length) {
    const zone = profile.visits.timezone;
    for (const v of profile.visits.all) {
      const t = Date.parse(v.start);
      if (!Number.isFinite(t)) continue;
      const line = visitLineForDto(v, { zone, nowMs, person: { id: base.id, name: base.name } });
      if (line.state !== null) continue;
      const on = visitDay(t, zone, nowMs);
      found.push({
        t,
        vm: {
          id: `v-${v.id}`,
          month: dateFormat("en-US", { timeZone: zone, month: "short" }).format(new Date(t)),
          date: dateFormat("en-US", { timeZone: zone, day: "numeric" }).format(new Date(t)),
          day: on === "Today" || on === "Tomorrow" ? on : dateFormat("en-US", { timeZone: zone, weekday: "short" }).format(new Date(t)),
          title: line.title,
          time: line.time,
          match: line.guess ? line.match : null,
          visit: line,
          to: visitDoor(visitDateKey(v.start, zone), v.record_id)
        }
      });
    }
  }
  return found.sort((a, b) => a.t - b.t).map((c) => c.vm);
}
