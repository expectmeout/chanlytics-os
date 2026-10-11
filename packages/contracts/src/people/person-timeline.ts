/**
 * A person's timeline (PersonVM.timeline and comingUp): what happened, from every source the profile reads -- their
 * messages, calls, escalations, the decisions on their threads, every change to either consent answer, their visits,
 * each move of a deal, and how they were added -- one builder per source over the page's context (person-cards.ts
 * PersonCardContext), merged newest first. Decomposed from toPersonVM (Phase 2 of the organization plan), proven equal
 * by value. index.ts names the item types and consentChangeWords; the builders are internal.
 */
import { visitDateKey, visitDay, visitTime } from "../calendar/calendar-people";
import { callNoteLines, callNotesOf, tidyCallSummary } from "../voice/call-words";
import type { ConsentChange } from "../consent/consent";
import { DEAL_LOST_REASON_WORDS, DEAL_STAGE_WORDS, isDealLostReason } from "../deals/deal-words";
import { amountWords } from "../deals/deal-amount";
import type { PersonCampaignDto } from "./person-dto";
import { reasonShort } from "../conversations/escalations";
import { visitTitleFor } from "./person-row";
import {
  CARRIER_CONSENT_SOURCE,
  CONSENT_RESET_SOURCE,
  consentSourceLabel,
  STOP_ENDED_OFFERS_SOURCE,
  WHATSAPP_CONSENT_SOURCE,
} from "./person-consent";
import { addedBy, ts } from "./person-helpers";
import { MERGE_CONSENT_SOURCE } from "./person-merge";
import { capitalize } from "../shared/words";
import { callLength } from "../shared/clock";
import { shortName } from "../conversations/thread-contact";
import { callAttemptWords, neverConnected, reachedVoicemail, recordingStateOf } from "../conversations/call-dto";
import { type MessageAuthor, messageAuthor } from "../conversations/message-author";
import { messageAt, type MessageDto } from "../conversations/thread-dto";
import { clipAtWord, messageWords } from "../conversations/message-words";
import type { PersonCardContext } from "./person-cards";
import { reachOutPersonOf, type ReachOutPersonVM } from "../reach-out/reach-out-leads";
import { leadsRoute } from "../leads/lead-plan";
import { dateFormat } from "../shared/time";

export type TimelineKind =
  "customer" | "receptionist" | "you" | "system" | "call" | "escalation" | "decision" | "visit" | "consent" | "deal";

export interface PersonTimelineItemVM {
  id: string;
  ts: number;
  time: string;
  day: string;
  kind: TimelineKind;
  who: string;
  text: string;
  sub?: string;
  /** More lines under the row's text, each said once: what a call's analysis left (its to-do, what the caller gave). */
  notes?: string[];
  link?: { label: string; to: string };
  /** A visit that has not ended yet: the page says it under Coming up (comingUp), not in what has happened. */
  ahead?: boolean;
}

/**
 * A visit that has not ended, as the page's Coming up draws it: a small leaf with the month and the day of the month,
 * what it is, and when. `day` is "Today", "Tomorrow" or the weekday, by the business's clock.
 */
export interface PersonVisitAheadVM {
  id: string;
  month: string;
  date: string;
  day: string;
  title: string;
  time: string;
  /** Matched to them by their name alone, which the page says, as the Next visit fact does. */
  byName: boolean;
  to: string;
}

/** How we know an answer: their own words and where, the carrier's or WhatsApp's report, or a member's record and note. */
function howKnown(c: ConsentChange): string {
  if (c.source === "customer_message") {
    const where =
      c.channel === "sms"
        ? "by text"
        : c.channel === "whatsapp"
          ? "on WhatsApp"
          : c.channel === "email"
            ? "by email"
            : "in their own message";
    return `In their own words ${where}${c.words ? `: “${c.words}”` : ""}`;
  }
  if (c.source === CONSENT_RESET_SOURCE || !c.source) {
    return "Reset by staff";
  }
  if (c.source === CARRIER_CONSENT_SOURCE) {
    // The carrier's report of a STOP we never heard (a text refused with Twilio 21610): the person's own no, said
    // by the carrier -- neither their words to us nor a member's record.
    return "Reported by the carrier: they had texted STOP to your number, so a text to them was not sent";
  }
  if (c.source === WHATSAPP_CONSENT_SOURCE) {
    // WhatsApp's report of a no to offers we never heard (131050 on a message Meta counts as marketing): their own
    // choice, made in WhatsApp, said by WhatsApp. Neither their words to us nor a member's record.
    return "Reported by WhatsApp: they chose there to stop marketing messages from your business, so a message to them was not delivered";
  }
  if (c.source === MERGE_CONSENT_SOURCE) {
    // Two records of this person were merged, and the more careful of their two answers stands (00326). Nobody on the
    // team recorded an answer, and the person said nothing new.
    return "Two records of this person were merged, and the more careful answer stands";
  }
  return `${consentSourceLabel(c.source) ?? c.source}, recorded by staff${c.note ? ` · ${c.note}` : ""}`;
}

/**
 * A consent change, in the words the timeline uses: what was answered, and
 * how we know. An answer the customer texted quotes them; one taken at the
 * desk names the way and the recorder's note. The words here are the only
 * ones the page has, so an owner reads "how do we know" without a database.
 */
export function consentChangeWords(c: ConsentChange): { who: string; text: string; sub?: string } {
  // A stop to every message ended a yes to offers (00323): the database's own entry, beside the stop's. Either yes:
  // the one for offers, or email's own.
  if (c.source === STOP_ENDED_OFFERS_SOURCE && c.purpose !== "conversational")
    return {
      who: c.purpose === "email_marketing" ? "Email" : "Offers",
      text: c.purpose === "email_marketing" ? "Their yes to offers by email ended" : "Their yes to offers ended",
      sub: "They said stop, which ends it. Offers start again only on a new yes of their own",
    };
  // Marketing email is its own answer (00174), and the one thing a person says to it is no: a press of the
  // Unsubscribe link in a campaign email, a complaint, or a reply to a reach-out read as no (00220). A reply's no is
  // the one a member may take back ("read as no · undo"), to the answer it had. Texting and WhatsApp are untouched.
  if (c.purpose === "email_marketing")
    return {
      who: "Email",
      text:
        c.consent === "opted_out"
          ? c.source === "reply"
            ? "Said no in a reply to your reach-out"
            : "Unsubscribed from your emails"
          : c.consent === "opted_in"
            ? c.source === "reply_undone"
              ? "Marketing email: back to yes"
              : "Asked for offers by email"
            : "Marketing email: back to not asked",
      ...(c.source === "unsubscribe"
        ? { sub: c.words ? `Wrote “${c.words}” in reply to an email` : "Pressed Unsubscribe in an email" }
        : c.source === "reply_undone"
          ? { sub: "A reply read as no, undone" }
          : c.consent === "opted_in" && c.source === "customer_message"
            ? { sub: `In their own words by email${c.words ? `: “${c.words}”` : ""}` }
            : {}),
    };
  const offers = c.purpose === "marketing";
  const text =
    c.consent === "opted_in"
      ? offers
        ? "Said yes to offers and news"
        : "Said yes to messages about their visit"
      : c.consent === "opted_out"
        ? offers
          ? "Said no to offers"
          : "Said stop — nothing goes out to them"
        : offers
          ? "Offers: back to not asked"
          : "Back to not asked";
  return { who: offers ? "Offers" : "Consent", text, sub: howKnown(c) };
}

const DECISION_LABELS: Record<string, { who: string; text: string }> = {
  take_over: { who: "Took over", text: "You paused the receptionist on this thread" },
  hand_back: { who: "Handed back", text: "You returned the thread to the receptionist" },
  snooze: { who: "Snoozed", text: "You snoozed the thread" },
  wake: { who: "Woke", text: "You brought the thread back" },
  resolve: { who: "Resolved", text: "You marked the escalation resolved" },
  archive: { who: "Archived", text: "You archived the thread" },
  cancel_send: { who: "Canceled a reply", text: "You stopped a reply before it sent" },
  pause_agent: { who: "Paused the receptionist", text: "You paused automatic replies" },
  resume_agent: { who: "Resumed the receptionist", text: "You resumed automatic replies" },
};

/** A message's kind on the timeline, by who sent it. */
function timelineKindOf(sender: MessageDto["sender"]): TimelineKind {
  return sender === "customer" ? "customer" : sender === "human" ? "you" : sender === "ai" ? "receptionist" : "system";
}

/**
 * A message a run sent is the run's, by its meta or by the recipient row that names it (broadcast_recipients
 * message_id): a run's row is the ledger of what it sent, whatever the message kept.
 */
function asRunMessage(m: MessageDto, run: PersonCampaignDto | undefined): MessageDto {
  if (!run || m.meta?.source === "broadcast") return m;
  return {
    ...m,
    meta: {
      ...m.meta,
      source: "broadcast",
      broadcast_name: run.name,
      ...(run.playbook_id ? { playbook_name: run.playbook_name || run.name } : {}),
    },
  };
}

/**
 * Who sent one of ours, in the words the Inbox uses (messageAuthor): a person's reply is the team's, since the row
 * does not say which member sent it, and a run's message is its playbook's or its broadcast's. Every one of ours read
 * "You", a playbook's run among them.
 */
function speakerOf(author: MessageAuthor | null): string {
  return !author
    ? "System"
    : author.kind === "receptionist"
      ? "Receptionist"
      : author.kind === "team"
        ? "Your team"
        : capitalize(author.words);
}

/** What the reach-out that found them wrote and read (Part 6, H11), when the lead they came from has one. */
const reachOutOf = ({ profile, nowMs, tz }: PersonCardContext): ReachOutPersonVM | null =>
  profile.lead?.reach_out ? reachOutPersonOf(profile.lead.reach_out, nowMs, tz) : null;

/** Their messages and ours, from every thread: what was said, by whom, and whether it reached them. */
function messageItems(ctx: PersonCardContext): PersonTimelineItemVM[] {
  const { profile, base, stamp } = ctx;
  // A reach-out's email is named for its chain and step, and a reply it read says how it was read (Part 6, H11).
  const reach = reachOutOf(ctx);
  // A person we know only by number or address keeps the whole identifier: "+1" as a speaker label is nobody.
  const first = shortName(base.name);
  const runOf = new Map((profile.campaigns ?? []).filter((c) => c.message_id).map((c) => [c.message_id!, c]));
  const items: PersonTimelineItemVM[] = [];
  for (const c of profile.conversations) {
    for (const m of c.messages) {
      if (m.type === "call_summary") continue; // the call carries its own item
      if (m.status === "canceled") continue; // never reached them
      const t = ts(messageAt(m));
      if (t === null) continue;
      const kind = timelineKindOf(m.sender);
      const author = messageAuthor(asRunMessage(m, runOf.get(m.id)));
      const cold = reach?.emails.get(m.id);
      const read = reach?.readings.get(m.id);
      const sub =
        cold?.sub ?? read ?? (m.status === "failed" ? "Not delivered" : m.status === "queued" ? "Sending" : undefined);
      items.push({
        id: `m-${m.id}`,
        ts: t,
        ...stamp(t),
        kind,
        who: kind === "customer" ? first : (cold?.who ?? speakerOf(author)),
        text: messageWords(m),
        ...(sub ? { sub } : {}),
        link: { label: "Open the thread", to: `inbox/th-${c.id}` },
      });
    }
  }
  return items;
}

/** Their calls: what they wanted, else the summary's first sentence, and where the recording is. */
function callItems({ profile, stamp }: PersonCardContext): PersonTimelineItemVM[] {
  const items: PersonTimelineItemVM[] = [];
  for (const k of profile.calls) {
    const t = ts(k.started_at);
    if (t === null) continue;
    const dur = callLength(k.duration_ms);
    const wanted = (k.wanted || "").trim();
    const summary = tidyCallSummary(k.summary) ?? "";
    const missed = neverConnected(k);
    // What the call's own row holds beyond what they wanted: the to-do the receptionist noted, what they gave about
    // themselves. A dial that never connected has no analysis, and so nothing here.
    const notes = callNoteLines(callNotesOf(k));
    const sentence = missed
      ? "The call never connected."
      : wanted ||
        (summary
          ? (summary.split(/(?<=[.!?])\s/)[0] ?? summary)
          : reachedVoicemail(k)
            ? "Reached voicemail."
            : "No summary from this call.");
    items.push({
      id: `k-${k.id}`,
      ts: t,
      ...stamp(t),
      kind: "call",
      who: missed
        ? callAttemptWords(k.direction)
        : `${k.direction === "inbound" ? "Inbound" : "Outbound"} call${dur ? ` · ${dur}` : ""}`,
      text: sentence,
      ...(notes.length ? { notes } : {}),
      sub: missed
        ? "Never connected"
        : recordingStateOf(k) === "ready"
          ? "Recording and transcript in Conversations"
          : "Transcript in Conversations",
      link: { label: "Open", to: `conversations/cv-${k.id}` },
    });
  }
  return items;
}

/** Each time the receptionist stopped for them, and whether that is over. */
function escalationItems({ profile, stamp }: PersonCardContext): PersonTimelineItemVM[] {
  const items: PersonTimelineItemVM[] = [];
  for (const e of profile.escalations) {
    const t = ts(e.created_at);
    if (t === null) continue;
    // The details say more (a call back's to-do, why a send failed): the page dropped them, and said "Resolved" with
    // no when (the 2 Oct 2026 audit). A call back's details are its whole sentence, so they are not repeated as a quote.
    // Details that only repeat the reason's own words ("asked for a person") say nothing more, and are left out.
    const said = e.details?.trim();
    const details = said && said.toLowerCase() !== reasonShort(e.reason).toLowerCase() ? clipAtWord(said, 120) : null;
    const resolvedAt = e.state === "resolved" ? ts(e.updated_at) : null;
    items.push({
      id: `e-${e.id}`,
      ts: t,
      ...stamp(t),
      kind: "escalation",
      who: "Escalated",
      text:
        e.reason === "callback" && details
          ? details
          : `${capitalize(reasonShort(e.reason)) || "The receptionist stopped"}${details ? ` · “${details}”` : ""}`,
      // "Open" beside a row that opens something read as the verb; the state is what it says.
      sub:
        e.state === "resolved"
          ? `Resolved${resolvedAt !== null ? ` · ${stamp(resolvedAt).time} ${stamp(resolvedAt).day}` : ""}${e.resolved_by_user_id ? " · by a person" : ""}`
          : "Still open",
      link: { label: "Open the thread", to: `inbox/th-${e.conversation_id}` },
    });
  }
  return items;
}

/** The decisions on their threads and on them (DECISION_LABELS): what a person did, in the ledger's words. */
function decisionItems({ profile, row, stamp }: PersonCardContext): PersonTimelineItemVM[] {
  const convIds = new Set(profile.conversations.map((c) => c.id));
  const items: PersonTimelineItemVM[] = [];
  for (const dec of profile.decisions) {
    const label = DECISION_LABELS[dec.verb];
    if (!label) continue;
    const mine =
      (dec.subject_type === "conversation" && convIds.has(dec.subject_id)) ||
      (dec.subject_type === "contact" && dec.subject_id === row.id);
    if (!mine) continue;
    const t = ts(dec.created_at);
    if (t === null) continue;
    items.push({ id: `d-${dec.id}`, ts: t, ...stamp(t), kind: "decision", who: label.who, text: label.text });
  }
  return items;
}

/**
 * Every change to either answer, from the ledger: the evidence, on the
 * same line as what was said. The decisions ledger has no label for these
 * (DECISION_LABELS), so nothing is said twice.
 */
function consentItems({ profile, stamp }: PersonCardContext): PersonTimelineItemVM[] {
  const items: PersonTimelineItemVM[] = [];
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
      ...(w.sub ? { sub: w.sub } : {}),
    });
  }
  return items;
}

/**
 * Their visits, from the calendar: what happened in the chair belongs on
 * the same line as what was said. A visit ahead reads as booked, one behind as past.
 */
function visitItems({ profile, nowMs, base, stamp }: PersonCardContext): PersonTimelineItemVM[] {
  const items: PersonTimelineItemVM[] = [];
  if (profile.visits?.all?.length) {
    const zone = profile.visits.timezone;
    for (const v of profile.visits.all) {
      const t = Date.parse(v.start);
      if (!Number.isFinite(t)) continue;
      const ahead = Date.parse(v.end) >= nowMs;
      items.push({
        ...(ahead ? { ahead: true } : {}),
        id: `v-${v.id}`,
        ts: t,
        ...stamp(t),
        kind: "visit",
        who: "Calendar",
        // Past, never "visited": the calendar says when, not that they came (decision 0002's answer 3). A member's word on
        // it is said instead (step 8): kept, or missed.
        text: `${ahead ? "Booked" : v.said === "missed" ? "Missed" : v.said === "kept" ? "Kept" : "Past visit"} · ${visitTitleFor(v.title, base.name)}`,
        sub: `${visitTime(v, zone)} · from ${profile.visits.source}${v.via === "name" ? " · matched by name" : ""}`,
        link: { label: "Open the day", to: `calendar/${visitDateKey(v.start, zone)}` },
      });
    }
  }
  return items;
}

/**
 * Each move of a deal, on the same line as what was said: what a person recorded, when (0004). The amount is the
 * proposal's value until they say yes, and then the client's, so it is said on the line it belongs to (0008); a pass
 * says why.
 */
function dealItems({ profile, dealsOn, stamp }: PersonCardContext): PersonTimelineItemVM[] {
  const items: PersonTimelineItemVM[] = [];
  for (const x of dealsOn ? (profile.deals ?? []) : []) {
    const svc = x.service ? ` · ${x.service}` : "";
    const put = (id: string, at: string | null, text: string) => {
      const t = ts(at);
      if (t === null) return;
      items.push({ id, ts: t, ...stamp(t), kind: "deal", who: "You", text });
    };
    const value = amountWords(x.amount_cents, x.per, x.currency);
    const client = x.stage === "won" || x.stage === "ended";
    put(`dl-${x.id}-p`, x.proposed_at, `${DEAL_STAGE_WORDS.proposed}${svc}${value && !client ? ` · ${value}` : ""}`);
    if (client) put(`dl-${x.id}-w`, x.decided_at, `Became a client${svc}${value ? ` · ${value}` : ""}`);
    const why = isDealLostReason(x.lost_reason) ? ` · ${DEAL_LOST_REASON_WORDS[x.lost_reason]}` : "";
    if (x.stage === "lost") put(`dl-${x.id}-l`, x.decided_at, `Passed${svc}${why}`);
    if (x.stage === "ended") put(`dl-${x.id}-e`, x.ended_at, `Ended${svc}`);
  }
  return items;
}

/** How they came to be in People, when a door other than their own words added them (addedBy); an ad that did is a door to it. */
function addedItems({ profile, stamp }: PersonCardContext): PersonTimelineItemVM[] {
  if (!profile.added) return [];
  const t = ts(profile.added.at);
  const by = addedBy(profile.added);
  const door = by.to ? { link: { label: "Open the ad", to: by.to } } : {};
  return t !== null
    ? [{ id: "added", ts: t, ...stamp(t), kind: "system", who: by.who, text: `Added ${by.how}`, ...door }]
    : [];
}

/** Where the reach-out's lead was found, with the door to it on Leads (Part 6, H11). */
function foundItems(ctx: PersonCardContext): PersonTimelineItemVM[] {
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
      link: { label: "Open the lead", to: leadsRoute({ peek: lead.id }) },
    },
  ];
}

/** What has happened, newest first, from every source; a visit that has not ended is in it too, marked `ahead`. */
export function timelineOf(ctx: PersonCardContext): PersonTimelineItemVM[] {
  const items = [
    ...messageItems(ctx),
    ...callItems(ctx),
    ...escalationItems(ctx),
    ...decisionItems(ctx),
    ...consentItems(ctx),
    ...visitItems(ctx),
    ...dealItems(ctx),
    ...addedItems(ctx),
    ...foundItems(ctx),
  ];
  items.sort((a, b) => b.ts - a.ts);
  return items;
}

/** Their visits that have not ended, soonest first: the page's Coming up. */
export function comingUpOf({ profile, nowMs, base }: PersonCardContext): PersonVisitAheadVM[] {
  const found: { t: number; vm: PersonVisitAheadVM }[] = [];
  if (profile.visits?.all?.length) {
    const zone = profile.visits.timezone;
    for (const v of profile.visits.all) {
      const t = Date.parse(v.start);
      if (!Number.isFinite(t)) continue;
      const ahead = Date.parse(v.end) >= nowMs;
      if (!ahead) continue;
      const on = visitDay(t, zone, nowMs);
      found.push({
        t,
        vm: {
          id: `v-${v.id}`,
          month: dateFormat("en-US", { timeZone: zone, month: "short" }).format(new Date(t)),
          date: dateFormat("en-US", { timeZone: zone, day: "numeric" }).format(new Date(t)),
          day:
            on === "Today" || on === "Tomorrow"
              ? on
              : dateFormat("en-US", { timeZone: zone, weekday: "short" }).format(new Date(t)),
          title: visitTitleFor(v.title, base.name),
          time: visitTime(v, zone),
          byName: v.via === "name",
          to: `calendar/${visitDateKey(v.start, zone)}`,
        },
      });
    }
  }
  return found.sort((a, b) => a.t - b.t).map((c) => c.vm);
}
