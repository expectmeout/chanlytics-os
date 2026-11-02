/**
 * People — the relationship record for a business whose receptionist is an AI.
 *
 * A sales CRM's contact is a form: name, company, title, owner. Here the
 * customer record is a timeline: what they said, what the receptionist
 * answered, when a human stepped in, whether they phoned. Every field on
 * these view models is a column fact or a count over columns, never a score.
 *
 * The six states are the product's vocabulary for "where do I matter",
 * evaluated in a fixed order so a person is in exactly one. Each is a fact:
 * an open escalation, who owns the thread and who spoke last, a STOP, the
 * evidence-based first contact, recency.
 *
 * This module holds the row: its view model and its one builder (toPersonRowVM), with the row's channels, where
 * they came from and a visit's title. The wire is person-dto.ts; the states and their rule, person-state.ts; the
 * row's facts, person-row-facts.ts; the receptionist's line, person-receptionist.ts; how a person may be reached,
 * person-reach.ts.
 */
import { clockDate, inLocalWeek, localDaysBetween } from "../shared/clock";
import { formatPhoneDisplay } from "../shared/phone";
import { personName } from "./person-name";
import {
  PERSON_CAME_FROM_WORDS,
  PERSON_CHANNEL_WORDS,
  type PersonCameFrom,
  type PersonChannel,
  type ReplyVia,
} from "./person-words";
import { isOptedOutContact } from "../consent/consent";
import type { FollowUpStand } from "../playbooks/playbooks";
import {
  visitDateKey,
  visitDay,
  visitLine,
  visitTime,
  visitsAt,
  type MatchVia,
  type VisitDto,
} from "../calendar/calendar-people";
import { bookedAfterAsk } from "../calendar/visit/booked-after-ask";
import { visitDoor } from "../calendar/appointment-key";
import { appointmentWords, type AppointmentWord } from "../journey/appointment-word";
import { plural } from "../shared/words";
import { visitTitleWithout } from "../calendar/visit/visit-service";
import { visitLineOf, visitMarkOfDto, type VisitLineVM } from "../calendar/calendar-words";
import { nextStepOf, stepIsDue, type PersonNextStepVM } from "../notes/steps";
import { initialsOf, isEmailStopped } from "../conversations/thread-contact";
import { emailPreviewOf } from "../conversations/message-email";
import { dealOf, openDealsOf, type DealVM } from "../deals/deal-vm";
import { dealStageOf, dealStagesOf, type DealStandingStage } from "../deals/deal-consultations";
import type { PersonConsent } from "./person-consent";
import { MONTH_MS, ts } from "./person-helpers";
import type { PersonRowDto } from "./person-dto";
import { replyReachOf, type BookingLinkAction } from "./person-reach";
import { receptionistOf, type HolderNames, type PersonReceptionist } from "./person-receptionist";
import {
  ago,
  consentOf,
  firstContactOf,
  lastContactOf,
  theirTurnWords,
  type PersonFirstContact,
  type PersonLastContact,
} from "./person-row-facts";
import { reasonShort } from "../conversations/escalations";
import { readingOf } from "../conversations/standing";
import { heardAt, PERSON_STATE_LABELS, personStanding, personStateFor, type PersonState } from "./person-state";
import type { WrittenChannel } from "../conversations/thread-channel";
import { personReachOf, type PersonReach } from "../broadcasts/reach-any";
import type { ChannelsReady } from "../broadcasts/reach-for";
import { asNameSource, PERSON_NAME_WORDS, type NameSource } from "../person-page/words";

/** Where their name came from and the business they work at, as the row says them (0052). */
function rowNameAndWorkOf(
  r: PersonRowDto,
  tz: string,
  nowMs: number,
): Pick<PersonRowVM, "worksAt" | "nameSource" | "nameSettled" | "standIn" | "signer"> {
  return {
    worksAt: r.lead_id ? { leadId: r.lead_id, name: r.lead_name ?? null, gone: !!r.lead_gone } : null,
    nameSource: asNameSource(r.name_source),
    nameSettled: !!r.name_settled_at,
    standIn: r.name_source === "lead",
    signer: signerOfRow(r, tz, nowMs),
  };
}

/** Their next step and whether its day has come (00166), the step read once for both. */
function stepKeysOf(r: PersonRowDto, tz: string, nowMs: number): Pick<PersonRowVM, "nextStep" | "stepDue"> {
  const nextStep = nextStepOf(r, tz, nowMs);
  return { nextStep, stepDue: stepIsDue(nextStep) };
}

/** A reply's signer offered as their name, as the row says it (0052): for a stand-in or someone nobody has named. */
function signerOfRow(r: PersonRowDto, tz: string, nowMs: number): PersonRowVM["signer"] {
  if (!r.signer_message_id || !r.signer_name) return null;
  if (r.name_source !== "lead" && r.display_name) return null;
  const read = r.signer_read_at ? Date.parse(r.signer_read_at) : NaN;
  return {
    messageId: r.signer_message_id,
    name: r.signer_name,
    title: r.signer_title ?? null,
    fact: PERSON_NAME_WORDS.signed(r.signer_name),
    day: Number.isFinite(read) ? clockDate(read, tz, nowMs) : "",
  };
}

/**
 * Channels are what actually happened, not only what identities record.
 * Production has a backfilled contact whose only identity row is 'voice'
 * and whose WhatsApp transcript is right there in messages; the glyphs must
 * not say "phone only" about them.
 */
/**
 * Their last words as the row says them: an email's own words, without the chain it quoted, its signature or a list's
 * plain-text links (emailPreviewOf); any other wire's as they wrote them. Nothing but an email is touched, and an email
 * whose every word looks like the rest of it keeps them.
 */
function quoteOf(r: PersonRowDto): string | null {
  const text = r.last_inbound_text?.trim();
  if (!text) return null;
  return (r.last_inbound_channel === "email" && emailPreviewOf(text)) || text;
}

function channelsOf(r: PersonRowDto): PersonChannel[] {
  const set = new Set<string>(r.channels ?? []);
  // Which wires their words travelled (00127). A row read without it has
  // written words and no way to say where, and until email every written word
  // was WhatsApp's or a text's, which share a glyph.
  //
  // A text is its own wire now, not WhatsApp's: they share a glyph and nothing
  // else -- no window, no templates, a different number -- and a person who had
  // only ever texted was introduced as "WhatsApp" at the top of their page.
  const wrote = r.message_channels;
  if (wrote ? wrote.includes("whatsapp") : r.has_chat) set.add("whatsapp");
  if (wrote?.includes("sms")) set.add("sms");
  if (wrote?.includes("email")) set.add("email");
  // An Instagram DM is its own wire (decision 0001, step 8): someone who has only ever DMed has a way in.
  if (wrote?.includes("instagram")) set.add("instagram");
  if ((r.call_count ?? 0) > 0) set.add("voice");
  const order: PersonChannel[] = ["whatsapp", "sms", "voice", "email", "instagram"];
  return order.filter((c) => set.has(c));
}

/**
 * The wire a reply to this row's person goes out on, as far as a ROW can say.
 *
 * Where they last wrote is the wire (`last_inbound_channel`, 00320: people_list's twin of lastWroteOn), by the reply
 * route's own rule (the dashboard's replyChannelOf) and their page's (replyChannelOfThreads). The row did not read it:
 * anyone who had written and was not email-only read WhatsApp, so a person who had only ever texted was held to a
 * window a text does not have, and their row's booking-link button said only an approved message could reach them
 * (found on production, 8 Oct 2026).
 *
 * A row that does not say where they last wrote (they have written nothing themselves, or it was read before the
 * column was kept) knows only which wires words have travelled between them (`message_channels`, either way). Where
 * that is one wire alone the answer is exact, whoever wrote: the reply route answers such a thread where the last
 * thing from their side came by, else where our own words last went (the dashboard's replyChannelOf, since a member
 * may write first), and on one wire both are that wire. A person a member texted first read WhatsApp here, held by
 * its window, while their thread's box and their page said Text. A person reached only by email was always read so.
 * On more than one wire the row cannot tell which was last and reads WhatsApp's window, the strictest there is: a row
 * that cannot tell may say a reply is held when it is not, and never the reverse. The profile, which has every
 * message, answers it exactly (replyChannelOfThreads, ourWireOfThreads).
 */
export function replyChannelOfRow(
  r: Pick<PersonRowDto, "has_chat" | "last_inbound_channel" | "message_channels">,
): WrittenChannel | null {
  if (!r.has_chat) return null;
  const last = lastChannelOf(r.last_inbound_channel);
  if (last) return last;
  const wrote = r.message_channels;
  const only = wrote && wrote.length === 1 ? lastChannelOf(wrote[0]) : null;
  if (only) return only;
  if (wrote && wrote.includes("email") && !wrote.some((c) => c === "whatsapp" || c === "sms")) return "email";
  return "whatsapp";
}

/**
 * When they last wrote by Instagram DM, as a row can say it (Instagram's window's clock, windowClockOf): where they last
 * wrote is Instagram, so their last own words are that DM and `last_wrote_at` is its time; on any other wire the row holds
 * none. The thread's own accessor (conversations.last_inbound_on_instagram) says the same where a thread is read.
 */
export function igClockOfRow(r: Pick<PersonRowDto, "last_inbound_channel" | "last_wrote_at">): string | null {
  return r.last_inbound_channel === "instagram" ? (r.last_wrote_at ?? null) : null;
}

/** A row's came_from in words, or null: nothing known, a row read before 00138, or a value this build does not know. */
export function cameFromOf(r: { came_from?: string | null }): { key: PersonCameFrom; label: string } | null {
  const k = r.came_from;
  if (!k || !Object.prototype.hasOwnProperty.call(PERSON_CAME_FROM_WORDS, k)) return null;
  return { key: k as PersonCameFrom, label: PERSON_CAME_FROM_WORDS[k as PersonCameFrom] };
}

/* ------------------------------- row VM ---------------------------------- */

export interface PersonRowVM {
  id: string;
  real: true;
  name: string;
  /** The name a human typed, or null — what a rename field starts from. */
  givenName: string | null;
  initials: string;
  phone: string | null;
  email: string | null;
  /** Their address has bounced or complained and is no longer sent to: for a campaign it is no address (whyNotReceive). */
  emailSuppressed: boolean;
  /** The channel they last wrote on (step 3): a campaign reaches them there first when it may (reachFor). */
  lastChannel: WrittenChannel | null;
  waName: string | null;
  channels: PersonChannel[];
  hasChat: boolean;
  state: PersonState;
  stateLabel: string;
  /** The reason behind the state, in a few words. Empty for "active". */
  stateDetail: string;
  lastContact: PersonLastContact;
  receptionist: PersonReceptionist;
  firstContact: PersonFirstContact;
  /** Where they first came from, in words (cameFromOf); null when nothing says. */
  cameFrom: { key: PersonCameFrom; label: string } | null;
  consent: PersonConsent;
  /** The customer's last words: verbatim, but for an email, which is said as its own words (quoteOf). */
  quote: string | null;
  /** The last call they placed, summarised by the receptionist; null without one. */
  callSummary: string | null;
  threads: number;
  calls: number;
  escalations: number;
  callSeconds: number;
  /** The Inbox route id (`th-<conversation>`); null without a chat. */
  threadId: string | null;
  /** Their conversation, chat or not: what a bell row about it names (today/notifications.ts noteWhose). */
  conversationId: string | null;
  /**
   * New to the reader: they wrote or called after the reader last opened them, or the reader put them back as unread
   * (conversations/standing.ts isUnseen, the Inbox's own rule, over askedMs). A person with something unread read the
   * same as everyone else on the list (Ruben, 7 Oct 2026).
   */
  unseen: boolean;
  /** The stamp of the reader's own mark as this read carried it, epoch ms; 0 where they have none (surfaces/seen.ts). */
  markAtMs: number;
  /**
   * How far the reader had seen their own words and calls as this read carried it (the mark's seen_at), epoch ms; 0 where
   * they have none. Their page's "new since you last looked" reads it beside markAtMs (person-page/new-since.ts).
   */
  seenAtMs: number;
  needsYouSinceMs: number | null;
  /** The calendar's state for this workspace: the outcome lists exist only when it is "ok". */
  calendar: "ok" | "unavailable" | "none";
  /** An appointment ahead on the calendar. */
  booked: boolean;
  /** "Tue, Sep 8" — the day of the next appointment, for the chip. */
  nextVisitDay: string | null;
  /** "Tue, Sep 8 · 2:00 – 5:00 PM · Balayage" */
  nextVisit: string | null;
  lastVisit: string | null;
  /** "Thu, Aug 20" — the day of the last visit, for the row when nothing is ahead. */
  lastVisitDay: string | null;
  /**
   * The next / last visit as the one visit line (calendar-words.ts visitLineOf): its day, time, title, how it stands
   * (Kept, Missed, Past once it has ended), how it was matched and what can be said of it. People's Visits cell and the
   * Inbox's chip draw these; the flat fields above stay what a list, a sort and a playbook read. Null without a visit.
   */
  nextVisitLine: VisitLineVM | null;
  lastVisitLine: VisitLineVM | null;
  /** WhatsApp's 24-hour window for a free reply: open, and how long is left. Null without a chat. */
  replyWindow: { open: boolean; hoursLeft: number } | null;
  /** The wire a reply goes out on, in words ("Email", "WhatsApp", "Text"); null for a person who has only phoned. */
  replyVia: ReplyVia | null;
  /** Their channels in words, in the order the page shows them: "WhatsApp · Phone", "Email". */
  channelWords: string;
  /** The booking-link act for them: its words for the wire a reply goes out on, and whether it is offered at all (bookingLinkAction). */
  bookingLinkAction: BookingLinkAction;
  /** When they last wrote or called, whichever is later. */
  askedMs: number | null;
  /**
   * Wrote or called in the last 30 days, and nothing on the calendar answers it: a visit ahead, or one since they
   * asked (visit/booked-after-ask.ts visitAnswersAsk, Reports' rule too).
   */
  askedNotBooked: boolean;
  nextVisitMs: number | null;
  lastVisitMs: number | null;
  /** The workspace's days until the next appointment (0 = today); null without one. */
  nextVisitDays: number | null;
  /** The workspace's days since the last visit; null without one. */
  lastVisitDays: number | null;
  /** Whole days since the latest visit a member said they missed (PersonVisitsDto.missed), by the business's calendar; null for none. */
  missedVisitDays: number | null;
  /** The next visit falls in this week, Monday to Sunday, by the workspace's clock. */
  nextVisitThisWeek: boolean;
  /** The workspace's days since they last wrote or called (askedMs); null when they never have. */
  heardDays: number | null;
  /** The workspace's days since first contact; null without one. `firstContact.evidence` says it is a real date. */
  firstDays: number | null;
  /** Whose attention their latest thread asks for, judged for the viewer the row was built for (attentionOf). */
  standing: "needs_you" | "waiting_on_you" | null;
  /**
   * Who has their latest thread: the viewer, a teammate, or nobody; "someone" when it has an assignee and the row was
   * built for no one looking, so "me" cannot be said.
   */
  assigned: "me" | "teammate" | "nobody" | "someone";
  /** Where they stand on the way to a deal, as the Pipeline groups them (deals.ts dealStageOf); null for none. */
  dealStage: DealStandingStage | null;
  /**
   * Every stage they stand at (0029): `dealStage` and the stage of each open deal, once each. A client with a proposal
   * out for another service stands at both, and People's deal lists hold them in both.
   */
  dealStages: DealStandingStage[];
  /**
   * Gave the answer each kind of message asks (yes to messages, yes to offers), a way to reach them or not: what they
   * said, whatever channel it was for and whether the workspace can send on it (reach-any.ts answeredYes).
   */
  saidYes: PersonReach["saidYes"];
  /**
   * May be sent each, on any channel the workspace can send on now: the yes and a way to reach them there, a number or
   * an address that has not bounced (reach-any.ts personReachOf, which reachFor answers). Offers wait on WhatsApp.
   */
  canReceive: PersonReach["canReceive"];
  /** Why they cannot, where they cannot (the strictest refusal reachFor gave, or no channel to send it on); null where they can. */
  whyNot: PersonReach["whyNot"];
  /** The channel a message about their visit would reach them on now (reach-any.ts): Campaigns' home counts each person once by it. */
  reachedOn: PersonReach["reachedOn"];
  /** Asked to stop, or on the do-not-contact list (consent.ts isOptedOutContact). */
  stopped: boolean;
  /** Their next step's day has come (steps.ts stepIsDue). */
  stepDue: boolean;
  /** "2026-09-08": the day of the next / last visit by the calendar's own clock — what a day-keyed playbook reads. */
  nextVisitDate: string | null;
  lastVisitDate: string | null;
  /** The id of the record's row for the next / last visit (VisitDto.record_id), which the Calendar opens it by; null where the record has none. */
  nextVisitId: string | null;
  lastVisitId: string | null;
  /**
   * How the calendar found the next / last visit to be theirs, surest first: a number or an address is exact, a name is a
   * guess (calendar-people.ts MatchVia). What a playbook that writes to them judges the visit by (playbook-reach.ts); null
   * without a visit.
   */
  nextVisitVia: MatchVia | null;
  lastVisitVia: MatchVia | null;
  /**
   * The calendar days of their visits near today, each with how it was found to be theirs, by start: what a day-keyed
   * playbook asks ("a visit tomorrow", playbook-reach.ts), which the next visit alone could not answer for a person with
   * one later today. A read made before the calendar kept them gives the next and the last. Empty without a calendar.
   */
  visitDays: { date: string; via: MatchVia }[];
  /** The calendar's zone; null without a calendar. */
  calendarTz: string | null;
  /** Their deal, as the page says it (0004); null where none was recorded. */
  deal: DealVM | null;
  /**
   * Every open deal, newest first (0029: contracts openDealsOf): a proposal out or a client, one per service. `deal` is
   * the one the row shows; the Pipeline, the deal lists and the proposal follow-up read them all.
   */
  openDeals: DealVM[];
  /** The next or the last visit was a consultation (0004): the "Consultation booked" list. */
  consultationVisit: boolean;
  /** When their last visit ended, when it was a consultation (0008): the next step is a proposal. Null otherwise. */
  consultedMs: number | null;
  /**
   * That consultation's title as the calendar wrote it: the last visit's when it was one, else the next's; null
   * otherwise. The service it names says which of their deals it began (the deal card's Consultation step, 0008).
   */
  consultationTitle: string | null;
  /** Their next visit, when it is a consultation (0008): when it starts, and whether it takes the day. Null otherwise. */
  consultAhead: { startMs: number; allDay: boolean } | null;
  /** Their next step (0007, amended): the earliest open note with a day; null without one. */
  nextStep: PersonNextStepVM | null;
  /**
   * Where they stand with the proposal follow-up (0006, playbooks.ts followUpStandOf): laid on by the People surface
   * from the follow-up's facts, where one runs; null otherwise, and on a row read anywhere else.
   */
  followUp: FollowUpStand | null;
  /**
   * The business they work at (0052): the lead, its name while it stands, and whether it was erased or blanked since
   * (its rows then say "Their business details were removed."). Null when they work nowhere, or on a row read before 00413.
   */
  worksAt: { leadId: string; name: string | null; gone: boolean } | null;
  /** Where their name came from (0052), null when nobody set it or it was set before it was kept. */
  nameSource: NameSource | null;
  /** A member settled their name: nothing the engine finds moves it. */
  nameSettled: boolean;
  /** Named for the business they work at (nameSource lead): never greeted by a first name, and offered a signer's name. */
  standIn: boolean;
  /**
   * A reply's signer offered as their name (0052): the notice "Priya Nair signed the reply · Oct 6 · Use this name", said
   * on their page, the Inbox's header, the Leads peek and the bell. Only for a stand-in or someone nobody has named, never
   * over a name of their own (personHeadOf's rule); null otherwise.
   */
  signer: { messageId: string; name: string; title: string | null; fact: string; day: string } | null;
}

/**
 * A visit a person's read carries (VisitDto) as the one visit line every page draws (calendar-words.ts visitLineOf): the
 * row's next and last, the person page's History, Coming up and Next visit. Its title without the person's own name, its
 * day by the business's clock, its mark from the record's row (visitMarkOfDto), and the door that opens it on the Calendar.
 */
export function visitLineForDto(
  v: VisitDto,
  o: { zone: string; nowMs: number; person: { id: string; name: string } },
): VisitLineVM {
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
      to: visitDoor(visitDateKey(v.start, o.zone), v.record_id),
    },
    o.nowMs,
  );
}

/**
 * Their next and last visit as the row says them: its day, the line with its title (the person's name taken out), and the
 * one visit line every page draws (visitLineForDto). Nothing for a side with no visit, or a person with no calendar.
 */
function visitWordsOf(
  v: PersonRowDto["visits"],
  nowMs: number,
  person: { id: string; name: string },
): Pick<PersonRowVM, "nextVisitDay" | "nextVisit" | "nextVisitLine" | "lastVisitDay" | "lastVisit" | "lastVisitLine"> {
  const said = (d: VisitDto | null | undefined, zone: string) =>
    d
      ? {
          day: visitDay(d.start, zone, nowMs),
          line: `${visitLine(d, zone, nowMs)} · ${visitTitleWithout(d.title, [person.name])}`,
          vm: visitLineForDto(d, { zone, nowMs, person }),
        }
      : null;
  const next = v ? said(v.next, v.timezone) : null;
  const last = v ? said(v.last, v.timezone) : null;
  return {
    nextVisitDay: next?.day ?? null,
    nextVisit: next?.line ?? null,
    nextVisitLine: next?.vm ?? null,
    lastVisitDay: last?.day ?? null,
    lastVisit: last?.line ?? null,
    lastVisitLine: last?.vm ?? null,
  };
}

/**
 * What a day-keyed playbook reads of a row's visits (playbook-reach.ts): the calendar's day of the next and the last, how
 * each was found to be theirs (a number and an address are exact, a name is a guess: MatchVia), and the calendar's zone;
 * and the whole days since a visit a member said they missed, by the business's calendar (a list's missed_visit). All
 * null without a calendar read.
 */
function visitKeysOf(
  v: PersonRowDto["visits"],
  nowMs: number,
  tz: string,
): Pick<
  PersonRowVM,
  | "nextVisitDate"
  | "lastVisitDate"
  | "nextVisitId"
  | "lastVisitId"
  | "nextVisitVia"
  | "lastVisitVia"
  | "visitDays"
  | "calendarTz"
  | "missedVisitDays"
> {
  const near = v ? (v.near ?? [v.last, v.next].filter((x) => x !== null)) : [];
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
    calendarTz: v?.timezone ?? null,
  };
}

/**
 * What a row's visits say of a consultation (0004, 0008): the next or the last is one, when the last ended and its
 * title, and the one ahead. The Pipeline's group reads them (dealStageOf), and the consultation lists.
 */
function consultationKeysOf(
  v: PersonRowDto["visits"],
  nextVisitMs: number | null,
): Pick<PersonRowVM, "consultationVisit" | "consultedMs" | "consultationTitle" | "consultAhead"> {
  return {
    consultationVisit: !!(v?.next?.consultation || v?.last?.consultation),
    consultedMs: v?.last?.consultation ? ts(v.last.end) : null,
    consultationTitle: v?.last?.consultation ? v.last.title : v?.next?.consultation ? v.next.title : null,
    consultAhead:
      v?.next?.consultation && nextVisitMs !== null && Number.isFinite(nextVisitMs)
        ? { startMs: nextVisitMs, allDay: !!v.next.all_day }
        : null,
  };
}

/** A channel a message was written on, as a campaign may reach them on it; null for a call or nothing. */
function lastChannelOf(c: string | null | undefined): WrittenChannel | null {
  return c === "whatsapp" || c === "sms" || c === "email" || c === "instagram" ? c : null;
}

/**
 * What a row says of reaching them: what the pick reads beside their answers (reachFor: where they last wrote, whether
 * their address is dead), and what comes of them on the channels the workspace can send on now (reach-any.ts). `ready`
 * is those channels, or null where they could not be read: counted as before the channels were, by WhatsApp alone.
 */
function rowReachOf(
  r: PersonRowDto,
  consent: PersonConsent,
  ready: ChannelsReady | null,
): Pick<PersonRowVM, "lastChannel" | "emailSuppressed" | "saidYes" | "canReceive" | "whyNot" | "reachedOn"> {
  const facts = { lastChannel: lastChannelOf(r.last_inbound_channel), emailSuppressed: isEmailStopped(r) };
  return { ...facts, ...personReachOf({ consent, phone: r.phone_e164, email: r.email ?? null, ...facts }, ready) };
}

/**
 * Where a reply to them goes, its window, and the booking link's act for that wire (person-reach.ts replyReachOf, which the
 * Calendar's block asks too). Channel-aware: only WhatsApp has a window (policy replyWindow). This read WhatsApp's for
 * everybody, so a person who had only ever emailed was shown "Closed · template only" -- a template they cannot receive, on
 * a wire they have never used. `emailStopped` is whether mail to their address has stopped (rowReachOf's flag): the booking
 * link is not offered by email then. A person who asked to stop, or is on do-not-contact (isOptedOutContact), is offered it
 * on no wire: the row said "Text the booking link", ready, over a STOP.
 */
function rowReplyOf(
  r: PersonRowDto,
  now: Date,
  emailStopped: boolean,
  who: string,
): Pick<PersonRowVM, "replyWindow" | "replyVia" | "bookingLinkAction"> {
  return replyReachOf(
    {
      wire: replyChannelOfRow(r),
      waInboundAt: r.latest_wa_inbound_at,
      igInboundAt: igClockOfRow(r),
      emailStopped,
      optedOut: isOptedOutContact({ consent: r.consent, dnc: r.dnc }),
      who,
    },
    now,
  );
}

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
 * its words, and the facts a list's rule reads (list-rules.ts), each worked out once here in the workspace's own dates.
 * `ready` is what the workspace can send on now, which their reach is judged against (reach-any.ts): required, since a
 * row says who can be sent what; null where it could not be read, counted as before the channels were, by WhatsApp alone.
 */
export function toPersonRowVM(
  r: PersonRowDto,
  tz: string,
  now = new Date(),
  viewerId: string | null = null,
  ready: ChannelsReady | null,
  /** The roster, where the page has read it: a teammate's thread says whose it is (person-receptionist.ts heldThreadOf). */
  names: HolderNames | null = null,
): PersonRowVM {
  const nowMs = now.getTime();
  const name = personName(r);
  const state = personStateFor(r, nowMs, tz, viewerId);
  const last = lastContactOf(r, tz, nowMs);
  const first = firstContactOf(r, tz, nowMs);
  const consent = consentOf(r, tz, nowMs);
  const reach = rowReachOf(r, consent, ready);
  // Booked is a fact from the calendar, not a stage: an appointment ahead.
  // Asked-not-booked is the gap the owner can act on — they reached out
  // this month and the calendar has never had them.
  const v = visitsAt(r.visits ?? null, nowMs); // as they stand now: a next visit that has ended is their last
  const calendar = v ? v.state : "none";
  // Their message, or the call they placed. A call the owner made is not them asking.
  const askedMs = heardAt(r);
  const booked = !!v?.next;
  const nextVisitMs = v?.next ? Date.parse(v.next.start) : null;
  const lastVisitMs = v?.last ? Date.parse(v.last.start) : null;
  const askedNotBooked =
    calendar === "ok" && askedMs !== null && nowMs - askedMs <= MONTH_MS && !bookedAfterAsk(v, askedMs);
  const stateDetail =
    state === "needs_you"
      ? r.open_escalation_reason
        ? reasonShort(r.open_escalation_reason)
        : r.queued_reply_at && personStanding(r, nowMs).standing !== "needs_you"
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
    quote: quoteOf(r),
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
    channelWords: channelsOf(r)
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
    assigned: !r.latest_assignee_user_id
      ? "nobody"
      : !viewerId
        ? "someone"
        : r.latest_assignee_user_id === viewerId
          ? "me"
          : "teammate",
    stopped: isOptedOutContact({ consent: r.consent, dnc: r.dnc }),
    ...visitKeysOf(v, nowMs, tz),
    deal: dealOf(r, tz, nowMs),
    openDeals: openDealsOf(r, tz, nowMs),
    ...consultationKeysOf(v, nextVisitMs),
    ...stepKeysOf(r, tz, nowMs),
    dealStage: null,
    dealStages: [],
    followUp: null,
    ...rowNameAndWorkOf(r, tz, nowMs),
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

/**
 * The one fact a thread's head says after where it stands (the thread canvas, 1 Nov 2026: "Needs you 2h · Northwind
 * Media", "Handled · Visit kept Thu"): their deal, else their next visit, else their last and how it went, else where
 * they work, else where they came from. Null where their row says none of these: a head says nothing it cannot read.
 */
export function threadHeadFactOf(row: PersonRowVM, word: AppointmentWord): string | null {
  if (row.deal && row.deal.brief) return row.deal.brief;
  const W = appointmentWords(word);
  const ahead = row.nextVisitLine;
  if (ahead) return `${W.next} ${ahead.day}${ahead.time ? ` ${ahead.time}` : ""}`;
  const behind = row.lastVisitLine;
  if (behind)
    return behind.state ? `${W.Title} ${behind.state.text.toLowerCase()} ${behind.day}` : `${W.last} ${behind.day}`;
  if (row.worksAt && !row.worksAt.gone && !row.standIn && row.worksAt.name) return row.worksAt.name;
  return row.cameFrom ? row.cameFrom.label : null;
}

/**
 * Who someone is, beside their conversation on a desk (the Inbox's rail; the thread canvas, 1 Nov 2026), in People's own
 * words for their row: how the receptionist stands with them, when and how they first came, the last contact, how much
 * has passed between you, their visit (only where a calendar is read, so "None yet" is true), their deal, their next step,
 * and what they agreed to. It was a page away, behind the header's door. Every value is the row's, never a guess.
 */
export function threadPersonFactsOf(row: PersonRowVM, word: AppointmentWord): ThreadPersonFact[] {
  const facts: ThreadPersonFact[] = [{ key: "receptionist", label: "Receptionist", value: row.receptionist.label }];
  const came = row.cameFrom ? ` · ${row.cameFrom.label}` : "";
  facts.push({ key: "first", label: "First contact", value: `${row.firstContact.label}${came}` });
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
