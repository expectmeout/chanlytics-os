/** Person row: row vm. */

import { inLocalWeek, localDaysBetween } from "../../shared/clock";
import { formatPhoneDisplay } from "../../shared/phone";
import { personName } from "../person-name";
import { PERSON_CHANNEL_WORDS } from "../person-words";
import { isOptedOutContact } from "../../consent/consent";
import { visitsAt } from "../../calendar/people/visits";
import { bookedAfterAsk } from "../../calendar/visit/booked-after-ask";
import { appointmentWords, type AppointmentWord } from "../../journey/appointment-word";
import { plural } from "../../shared/words";
import { initialsOf } from "../../conversations/thread-contact";
import { dealOf, openDealsOf } from "../../deals/vm";
import { dealStageOf, dealStagesOf } from "../../deals/consultations";
import { MONTH_MS, ts } from "../person-helpers";
import type { PersonRowDto } from "../person-dto";
import { personReceptionistOf, type HolderNames } from "../person-receptionist";
import { ago, consentOf, firstContactOf, lastContactOf, theirTurnWords } from "../person-row-facts";
import { reasonShort } from "../../conversations/escalations";
import { readingOf } from "../../conversations/standing";
import { heardAt, PERSON_STATE_LABELS, personStanding, personStateFor } from "../person-state";
import type { ChannelsReady } from "../../campaigns/broadcasts/reach-for";
import {
  cameFromOf,
  channelsOf,
  consultationKeysOf,
  quoteOf,
  rowNameAndWorkOf,
  rowReachOf,
  rowReplyOf,
  stepKeysOf,
  type PersonRowVM,
  visitKeysOf,
  visitWordsOf,
} from "./row-facts";

/** Their thread, their conversation, and whether they are new to the reader, judged against when they last wrote or called. */
function rowThreadOf(r: PersonRowDto, askedMs: number | null) {
  const reading = readingOf(askedMs, r);
  return {
    threadId: r.has_chat && r.latest_conversation_id ? `th-${r.latest_conversation_id}` : null,
    conversationId: r.latest_conversation_id,
    unseen: reading.unseen,
    markAtMs: reading.markAtMs,
    seenAtMs: r.seen_at && Number.isFinite(Date.parse(r.seen_at)) ? Date.parse(r.seen_at) : 0,
  };
}

/**
 * A People row, as it reads at `now` for `viewerId` (the member looking; null for a playbook's run, which has no one):
 * its words, and the facts a list's rule reads (lists/rules.ts), each worked out once here in the workspace's own dates.
 * `ready` is what the workspace can send on now, which their reach is judged against (reach-any.ts): required, since a
 * row says who can be sent what; null where it could not be read, counted as before the channels were, by WhatsApp alone.
 */
export function toPersonRowVM(
  person: PersonRowDto,
  tz: string,
  now = new Date(),
  viewerId: string | null = null,
  ready: ChannelsReady | null,
  /** The roster, where the page has read it: a teammate's thread says whose it is (person-receptionist.ts heldThreadOf). */
  names: HolderNames | null = null,
): PersonRowVM {
  const nowMs = now.getTime();
  const name = personName(person);
  const state = personStateFor(person, nowMs, tz, viewerId);
  const last = lastContactOf(person, tz, nowMs);
  const first = firstContactOf(person, tz, nowMs);
  const consent = consentOf(person, tz, nowMs);
  const reach = rowReachOf(person, consent, ready);
  // Booked is a fact from the calendar, not a stage: an appointment ahead.
  // Asked-not-booked is the gap the owner can act on — they reached out
  // this month and the calendar has never had them.
  const visits = visitsAt(person.visits ?? null, nowMs); // as they stand now: a next visit that has ended is their last
  const calendar = visits ? visits.state : "none";
  // Their message, or the call they placed. A call the owner made is not them asking.
  const askedMs = heardAt(person);
  const booked = !!visits?.next;
  const nextVisitMs = visits?.next ? Date.parse(visits.next.start) : null;
  const lastVisitMs = visits?.last ? Date.parse(visits.last.start) : null;
  const askedNotBooked =
    calendar === "ok" && askedMs !== null && nowMs - askedMs <= MONTH_MS && !bookedAfterAsk(visits, askedMs);
  const stateDetail =
    state === "needs_you"
      ? person.open_escalation_reason
        ? reasonShort(person.open_escalation_reason)
        : person.queued_reply_at && personStanding(person, nowMs).standing !== "needs_you"
          ? "a reply is about to send — you can still stop it"
          : "waiting for a person"
      : state === "waiting_on_you"
        ? // The pill says "You have it" (HELD_WORDS), so the detail adds only whose turn it is.
          (theirTurnWords(last) ?? "")
        : state === "opted_out"
          ? consent.sub
          : state === "new"
            ? `first contact ${first.label}`
            : state === "quiet"
              ? `last heard from ${ago(askedMs as number, tz, nowMs)}`
              : state === "unheard"
                ? last.ts === null
                  ? "no contact recorded"
                  : "they have not written or called"
                : "";
  const vm: PersonRowVM = {
    id: person.id,
    real: true,
    name,
    givenName: person.display_name?.trim() || null,
    initials: initialsOf(name),
    phone: formatPhoneDisplay(person.phone_e164),
    email: person.email ?? null,
    ...reach,
    waName: person.wa_profile_name,
    channels: channelsOf(person),
    hasChat: !!person.has_chat,
    state,
    stateLabel: PERSON_STATE_LABELS[state],
    stateDetail,
    lastContact: last,
    receptionist: personReceptionistOf(person, tz, nowMs, viewerId, names),
    firstContact: first,
    cameFrom: cameFromOf(person),
    consent,
    quote: quoteOf(person),
    callSummary: person.last_inbound_call_summary?.trim() || null,
    threads: person.conversation_count ?? 0,
    calls: person.call_count ?? 0,
    escalations: person.escalation_count ?? 0,
    callSeconds: person.call_seconds ?? 0,
    ...rowThreadOf(person, askedMs),
    needsYouSinceMs: ts(person.open_escalation_since),
    calendar,
    booked,
    ...visitWordsOf(visits, nowMs, { id: person.id, name }),
    ...rowReplyOf(person, now, reach.emailSuppressed, name),
    channelWords: channelsOf(person)
      .map((c) => PERSON_CHANNEL_WORDS[c])
      .join(" · "),
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
    assigned: !person.latest_assignee_user_id
      ? "nobody"
      : !viewerId
        ? "someone"
        : person.latest_assignee_user_id === viewerId
          ? "me"
          : "teammate",
    stopped: isOptedOutContact({ consent: person.consent, dnc: person.dnc }),
    ...visitKeysOf(visits, nowMs, tz),
    deal: dealOf(person, tz, nowMs),
    openDeals: openDealsOf(person, tz, nowMs),
    ...consultationKeysOf(visits, nextVisitMs),
    ...stepKeysOf(person, tz, nowMs),
    dealStage: null,
    dealStages: [],
    followUp: null,
    ...rowNameAndWorkOf(person, tz, nowMs),
  };
  // The Pipeline's group for them, from the deal and the consultations just read: one rule for both pages.
  vm.dealStage = dealStageOf(vm, nowMs);
  vm.dealStages = dealStagesOf(vm.dealStage, vm.openDeals);
  return vm;
}

/** One fact of a person beside their thread (threadPersonFactsOf): what it is, and what People's row says of it. */
export interface ThreadPersonFact {
  /** Its key; "waiting" and "why" are the thread's own, which the rail puts at its head while the thread needs you. */
  key: "waiting" | "why" | "receptionist" | "first" | "last" | "history" | "visit" | "deal" | "step" | "consent";
  label: string;
  value: string;
  /** Nothing there yet, said in the dim ink: a zero is shown, never left out. */
  none?: boolean;
}

/** The one fact a thread's head says of the person, and which of their row's facts it is. */
export interface ThreadHeadFact {
  of: "deal" | "visit" | "works" | "came";
  words: string;
}

/**
 * The one fact a thread's head says after where it stands (the thread canvas, 1 Nov 2026: "Needs you 2h · Northwind
 * Media", "Handled · Visit kept Thu"): their deal, else their next visit, else their last and how it went, else where
 * they work, else where they came from. Null where their row says none of these: a head says nothing it cannot read.
 * Which one it is lets a head with a door to the same fact beside it say it once.
 */
export function threadHeadFactOf(row: PersonRowVM, word: AppointmentWord): ThreadHeadFact | null {
  if (row.deal && row.deal.brief) return { of: "deal", words: row.deal.brief };
  const words = appointmentWords(word);
  const ahead = row.nextVisitLine;
  if (ahead) return { of: "visit", words: `${words.next} ${ahead.day}${ahead.time ? ` ${ahead.time}` : ""}` };
  // A member's word on it ("Visit kept Thu"); one that has only ended is the last one ("Last visit Thu"), never "past".
  const behind = row.lastVisitLine;
  if (behind)
    return {
      of: "visit",
      words:
        behind.state && behind.state.tone !== "past"
          ? `${words.Title} ${behind.state.text.toLowerCase()} ${behind.day}`
          : `${words.last} ${behind.day}`,
    };
  if (row.worksAt && !row.worksAt.gone && !row.standIn && row.worksAt.name)
    return { of: "works", words: row.worksAt.name };
  return row.cameFrom ? { of: "came", words: row.cameFrom.label } : null;
}

/**
 * Who someone is, beside their conversation on a desk (the Inbox's rail; the thread canvas, 1 Nov 2026), in People's own
 * words for their row: how the receptionist stands with them, when and how they first came, the last contact, how much
 * has passed between you, their visit (only where a calendar is read, so "None yet" is true), their deal, their next step,
 * and what they agreed to. It was a page away, behind the header's door. Every value is the row's, never a guess.
 */
export function threadPersonFactsOf(row: PersonRowVM, word: AppointmentWord): ThreadPersonFact[] {
  const facts: ThreadPersonFact[] = [{ key: "receptionist", label: "Receptionist", value: row.receptionist.label }];
  const arrived = row.cameFrom ? ` · ${row.cameFrom.label}` : "";
  facts.push({ key: "first", label: "First contact", value: `${row.firstContact.label}${arrived}` });
  if (row.lastContact.when)
    facts.push({ key: "last", label: "Last contact", value: `${row.lastContact.by} · ${row.lastContact.when}` });
  facts.push({
    key: "history",
    label: "History",
    value: `${plural(row.threads, "conversation")} · ${plural(row.calls, "call")}`,
  });
  if (row.calendar === "ok") {
    // The workspace's word for it (contracts appointmentWords): a studio's meeting, a clinic's appointment.
    const label = appointmentWords(word).Title;
    const ahead = row.nextVisitLine;
    const behind = row.lastVisitLine;
    const visit = ahead
      ? `${ahead.day}${ahead.time ? ` · ${ahead.time}` : ""}`
      : behind
        ? `Last · ${behind.day}${behind.state ? ` · ${behind.state.text}` : ""}`
        : null;
    facts.push(visit ? { key: "visit", label, value: visit } : { key: "visit", label, value: "None yet", none: true });
  }
  facts.push(
    row.deal && row.deal.brief
      ? { key: "deal", label: "Deal", value: row.deal.brief }
      : { key: "deal", label: "Deal", value: "None", none: true },
  );
  facts.push(
    row.nextStep
      ? { key: "step", label: "Next step", value: `${row.nextStep.words} · ${row.nextStep.day.words}` }
      : { key: "step", label: "Next step", value: "None", none: true },
  );
  facts.push({ key: "consent", label: "Consent", value: row.consent.label });
  return facts;
}
