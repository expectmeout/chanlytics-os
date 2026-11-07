/** Person row: row facts. */

import { clockDate, localDaysBetween } from "../../shared/clock";
import { PERSON_CAME_FROM_WORDS, type PersonCameFrom, type PersonChannel, type ReplyVia } from "../person-words";
import { isOptedOutContact } from "../../consent/consent";
import type { FollowUpStand } from "../../campaigns/playbooks/playbooks";
import { visitDateKey, visitDay, visitLine, visitTime, type VisitDto } from "../../calendar/people/visits";
import type { MatchVia } from "../../calendar/people/matching";
import { visitDoor } from "../../calendar/appointment-key";
import { visitTitleWithout } from "../../calendar/visit/service";
import { visitLineOf, type VisitLineVM } from "../../calendar/words/visit";
import { visitMarkOfDto } from "../../calendar/words/labels";
import { nextStepOf, stepIsDue, type PersonNextStepVM } from "../../notes/steps";
import { isEmailStopped } from "../../conversations/thread-contact";
import { emailPreviewOf } from "../../conversations/message-email";
import type { DealVM } from "../../deals/vm";
import type { DealStandingStage } from "../../deals/consultations";
import type { PersonConsent } from "../person-consent";
import { ts } from "../person-helpers";
import type { PersonRowDto } from "../person-dto";
import { replyReachOf, type BookingLinkAction } from "../person-reach";
import type { PersonReceptionist } from "../person-receptionist";
import type { PersonFirstContact, PersonLastContact } from "../person-row-facts";
import type { PersonState } from "../person-state";
import type { WrittenChannel } from "../../conversations/thread-channel";
import { personReachOf, type PersonReach } from "../../campaigns/broadcasts/reach-any";
import type { ChannelsReady } from "../../campaigns/broadcasts/reach-for";
import { asNameSource, PERSON_NAME_WORDS, type NameSource } from "../person-page/words";

/** Where their name came from and the business they work at, as the row says them (0052). */
export function rowNameAndWorkOf(
  person: PersonRowDto,
  tz: string,
  nowMs: number,
): Pick<PersonRowVM, "worksAt" | "nameSource" | "nameSettled" | "standIn" | "signer"> {
  return {
    worksAt: person.lead_id
      ? { leadId: person.lead_id, name: person.lead_name ?? null, gone: !!person.lead_gone }
      : null,
    nameSource: asNameSource(person.name_source),
    nameSettled: !!person.name_settled_at,
    standIn: person.name_source === "lead",
    signer: signerOfRow(person, tz, nowMs),
  };
}

/** Their next step and whether its day has come (00166), the step read once for both. */
export function stepKeysOf(r: PersonRowDto, tz: string, nowMs: number): Pick<PersonRowVM, "nextStep" | "stepDue"> {
  const nextStep = nextStepOf(r, tz, nowMs);
  return { nextStep, stepDue: stepIsDue(nextStep) };
}

/** A reply's signer offered as their name, as the row says it (0052): for a stand-in or someone nobody has named. */
function signerOfRow(person: PersonRowDto, tz: string, nowMs: number): PersonRowVM["signer"] {
  if (!person.signer_message_id || !person.signer_name) return null;
  if (person.name_source !== "lead" && person.display_name) return null;
  const read = person.signer_read_at ? Date.parse(person.signer_read_at) : NaN;
  return {
    messageId: person.signer_message_id,
    name: person.signer_name,
    title: person.signer_title ?? null,
    fact: PERSON_NAME_WORDS.signed(person.signer_name),
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
export function quoteOf(r: PersonRowDto): string | null {
  const text = r.last_inbound_text?.trim();
  if (!text) return null;
  return (r.last_inbound_channel === "email" && emailPreviewOf(text)) || text;
}

export function channelsOf(person: PersonRowDto): PersonChannel[] {
  const set = new Set<string>(person.channels ?? []);
  // Which wires their words travelled (00127). A row read without it has
  // written words and no way to say where, and until email every written word
  // was WhatsApp's or a text's, which share a glyph.
  //
  // A text is its own wire now, not WhatsApp's: they share a glyph and nothing
  // else -- no window, no templates, a different number -- and a person who had
  // only ever texted was introduced as "WhatsApp" at the top of their page.
  const wrote = person.message_channels;
  if (wrote ? wrote.includes("whatsapp") : person.has_chat) set.add("whatsapp");
  if (wrote?.includes("sms")) set.add("sms");
  if (wrote?.includes("email")) set.add("email");
  // An Instagram DM is its own wire (decision 0001, step 8): someone who has only ever DMed has a way in.
  if (wrote?.includes("instagram")) set.add("instagram");
  if ((person.call_count ?? 0) > 0) set.add("voice");
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
  person: Pick<PersonRowDto, "has_chat" | "last_inbound_channel" | "message_channels">,
): WrittenChannel | null {
  if (!person.has_chat) return null;
  const last = lastChannelOf(person.last_inbound_channel);
  if (last) return last;
  const wrote = person.message_channels;
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
export function igClockOfRow(person: Pick<PersonRowDto, "last_inbound_channel" | "last_wrote_at">): string | null {
  return person.last_inbound_channel === "instagram" ? (person.last_wrote_at ?? null) : null;
}

/** A row's came_from in words, or null: nothing known, a row read before 00138, or a value this build does not know. */
export function cameFromOf(row: { came_from?: string | null }): { key: PersonCameFrom; label: string } | null {
  const k = row.came_from;
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
  /** Their conversation, chat or not: what a bell row about it names (today/notifications/feed.ts noteWhose). */
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
   * they have none. Their page's "new since you last looked" reads it beside markAtMs (people/person-page/new-since.ts).
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
   * The next / last visit as the one visit line (calendar/words.ts visitLineOf): its day, time, title, how it stands
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
   * guess (calendar-people.ts MatchVia). What a playbook that writes to them judges the visit by (playbooks/reach.ts); null
   * without a visit.
   */
  nextVisitVia: MatchVia | null;
  lastVisitVia: MatchVia | null;
  /**
   * The calendar days of their visits near today, each with how it was found to be theirs, by start: what a day-keyed
   * playbook asks ("a visit tomorrow", playbooks/reach.ts), which the next visit alone could not answer for a person with
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
 * A visit a person's read carries (VisitDto) as the one visit line every page draws (calendar/words.ts visitLineOf): the
 * row's next and last, the person page's History, Coming up and Next visit. Its title without the person's own name, its
 * day by the business's clock, its mark from the record's row (visitMarkOfDto), and the door that opens it on the Calendar.
 */
export function visitLineForDto(
  visit: VisitDto,
  options: { zone: string; nowMs: number; person: { id: string; name: string } },
): VisitLineVM {
  return visitLineOf(
    {
      id: visit.record_id ?? visit.id,
      mark: visitMarkOfDto(visit),
      startMs: Date.parse(visit.start),
      endMs: Date.parse(visit.end),
      title: visitTitleWithout(visit.title, [options.person.name]),
      day: visitDay(visit.start, options.zone, options.nowMs),
      time: visitTime(visit, options.zone),
      person: options.person,
      via: visit.via,
      to: visitDoor(visitDateKey(visit.start, options.zone), visit.record_id),
    },
    options.nowMs,
  );
}

/**
 * Their next and last visit as the row says them: its day, the line with its title (the person's name taken out), and the
 * one visit line every page draws (visitLineForDto). Nothing for a side with no visit, or a person with no calendar.
 */
export function visitWordsOf(
  visits: PersonRowDto["visits"],
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
  const next = visits ? said(visits.next, visits.timezone) : null;
  const last = visits ? said(visits.last, visits.timezone) : null;
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
 * What a day-keyed playbook reads of a row's visits (playbooks/reach.ts): the calendar's day of the next and the last, how
 * each was found to be theirs (a number and an address are exact, a name is a guess: MatchVia), and the calendar's zone;
 * and the whole days since a visit a member said they missed, by the business's calendar (a list's missed_visit). All
 * null without a calendar read.
 */
export function visitKeysOf(
  visits: PersonRowDto["visits"],
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
  const near = visits ? (visits.near ?? [visits.last, visits.next].filter((x) => x !== null)) : [];
  const missedMs = visits?.missed ? Date.parse(visits.missed.start) : NaN;
  return {
    missedVisitDays: Number.isFinite(missedMs) ? Math.max(0, localDaysBetween(missedMs, nowMs, tz)) : null,
    visitDays: visits ? near.map((x) => ({ date: visitDateKey(x.start, visits.timezone), via: x.via })) : [],
    nextVisitDate: visits?.next ? visitDateKey(visits.next.start, visits.timezone) : null,
    lastVisitDate: visits?.last ? visitDateKey(visits.last.start, visits.timezone) : null,
    nextVisitId: visits?.next?.record_id ?? null,
    lastVisitId: visits?.last?.record_id ?? null,
    nextVisitVia: visits?.next?.via ?? null,
    lastVisitVia: visits?.last?.via ?? null,
    calendarTz: visits?.timezone ?? null,
  };
}

/**
 * What a row's visits say of a consultation (0004, 0008): the next or the last is one, when the last ended and its
 * title, and the one ahead. The Pipeline's group reads them (dealStageOf), and the consultation lists.
 */
export function consultationKeysOf(
  visits: PersonRowDto["visits"],
  nextVisitMs: number | null,
): Pick<PersonRowVM, "consultationVisit" | "consultedMs" | "consultationTitle" | "consultAhead"> {
  return {
    consultationVisit: !!(visits?.next?.consultation || visits?.last?.consultation),
    consultedMs: visits?.last?.consultation ? ts(visits.last.end) : null,
    consultationTitle: visits?.last?.consultation
      ? visits.last.title
      : visits?.next?.consultation
        ? visits.next.title
        : null,
    consultAhead:
      visits?.next?.consultation && nextVisitMs !== null && Number.isFinite(nextVisitMs)
        ? { startMs: nextVisitMs, allDay: !!visits.next.all_day }
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
export function rowReachOf(
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
export function rowReplyOf(
  person: PersonRowDto,
  now: Date,
  emailStopped: boolean,
  personName: string,
): Pick<PersonRowVM, "replyWindow" | "replyVia" | "bookingLinkAction"> {
  return replyReachOf(
    {
      wire: replyChannelOfRow(person),
      waInboundAt: person.latest_wa_inbound_at,
      igInboundAt: igClockOfRow(person),
      emailStopped,
      optedOut: isOptedOutContact({ consent: person.consent, dnc: person.dnc }),
      who: personName,
    },
    now,
  );
}
