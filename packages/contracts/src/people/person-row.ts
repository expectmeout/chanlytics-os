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
import { HOUR_MS } from "../shared/time";
import { inLocalWeek, localDaysBetween } from "../shared/clock";
import { formatPhoneDisplay } from "../shared/phone";
import { personName } from "./person-name";
import {
  PERSON_CAME_FROM_WORDS,
  PERSON_CHANNEL_WORDS,
  REPLY_VIA,
  type PersonCameFrom,
  type PersonChannel,
} from "./person-words";
import { isOptedOutContact } from "../consent/consent";
import { replyWindow } from "../config/policy";
import type { FollowUpStand } from "../playbooks/playbooks";
import { visitAnswersAsk, visitDateKey, visitDay, visitLine, type MatchVia } from "../calendar/calendar-people";
import { nextStepOf, stepIsDue, type PersonNextStepVM } from "../notes/steps";
import { initialsOf, isEmailStopped, isIdentifierName } from "../conversations/thread-contact";
import { dealOf, openDealsOf, type DealVM } from "../deals/deal-vm";
import { dealStageOf, dealStagesOf, type DealStandingStage } from "../deals/deal-consultations";
import type { PersonConsent } from "./person-consent";
import { MONTH_MS, ts } from "./person-helpers";
import type { PersonRowDto } from "./person-dto";
import { bookingLinkAction } from "./person-reach";
import { receptionistOf, type PersonReceptionist } from "./person-receptionist";
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
import { HELD_WORDS, readingOf } from "../conversations/standing";
import { heardAt, PERSON_STATE_LABELS, personStanding, personStateFor, type PersonState } from "./person-state";
import type { ConsentChannel } from "../consent/consent-channels";
import { personReachOf, type PersonReach } from "../broadcasts/reach-any";
import type { ChannelsReady } from "../broadcasts/reach-for";

/**
 * Channels are what actually happened, not only what identities record.
 * Production has a backfilled contact whose only identity row is 'voice'
 * and whose WhatsApp transcript is right there in messages; the glyphs must
 * not say "phone only" about them.
 */
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
  if ((r.call_count ?? 0) > 0) set.add("voice");
  const order: PersonChannel[] = ["whatsapp", "sms", "voice", "email"];
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
 * column was kept) knows only which wires words have travelled. That is exact for a person reached only by email,
 * whose reply can never be held by WhatsApp's window, and otherwise it reads WhatsApp's window, the strictest there
 * is: a row that cannot tell may say a reply is held when it is not, and never the reverse. The profile, which has
 * every message, answers it exactly (replyChannelOfThreads).
 */
function replyChannelOfRow(r: PersonRowDto): "whatsapp" | "sms" | "email" | null {
  if (!r.has_chat) return null;
  const last = lastChannelOf(r.last_inbound_channel);
  if (last) return last;
  const wrote = r.message_channels;
  if (wrote && wrote.includes("email") && !wrote.some((c) => c === "whatsapp" || c === "sms")) return "email";
  return "whatsapp";
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
  lastChannel: ConsentChannel | null;
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
  /** The customer's last words, verbatim. */
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
  /** WhatsApp's 24-hour window for a free reply: open, and how long is left. Null without a chat. */
  replyWindow: { open: boolean; hoursLeft: number } | null;
  /** The wire a reply goes out on, in words ("Email", "WhatsApp", "Text"); null for a person who has only phoned. */
  replyVia: "WhatsApp" | "Text" | "Email" | null;
  /** Their channels in words, in the order the page shows them: "WhatsApp · Phone", "Email". */
  channelWords: string;
  /** The booking-link button's words for the wire a reply goes out on (bookingLinkAction). */
  bookingLinkAction: { label: string; title: string; ready: boolean };
  /** When they last wrote or called, whichever is later. */
  askedMs: number | null;
  /**
   * Wrote or called in the last 30 days, and nothing on the calendar answers it: a visit ahead, or one since they
   * asked (calendar-people.ts visitAnswersAsk, Reports' rule too).
   */
  askedNotBooked: boolean;
  nextVisitMs: number | null;
  lastVisitMs: number | null;
  /** The workspace's days until the next appointment (0 = today); null without one. */
  nextVisitDays: number | null;
  /** The workspace's days since the last visit; null without one. */
  lastVisitDays: number | null;
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
}

/**
 * A visit's title as a calendar wrote it, without the person's own name at its end: a booking app titles an
 * appointment "Consultation · Tom Baker", and on Tom's page and his row the name is said already. Only the whole name,
 * next to a separator, at either end, goes; a title that is the name alone, or says anything else, is the calendar's.
 */
export function visitTitleFor(title: string, name: string): string {
  const n = name.trim().toLowerCase();
  if (!n || isIdentifierName(name)) return title;
  const t = title.trim();
  const low = t.toLowerCase();
  // At its end: what comes before the name ends in a separator, so the name is a part of its own.
  if (low.endsWith(n)) {
    const m = t.slice(0, t.length - n.length).match(/^(.*\S)\s*[·•|:,\-–—]\s*$/);
    if (m) return m[1].trim();
  }
  // Or at its start ("Maria Lopez - Balayage"), with a separator after it.
  if (low.startsWith(n)) {
    const m = t.slice(n.length).match(/^\s*[·•|:,\-–—]\s*(\S.*)$/);
    if (m) return m[1].trim();
  }
  return title;
}

/**
 * What a day-keyed playbook reads of a row's visits (playbook-reach.ts): the calendar's day of the next and the last, how
 * each was found to be theirs (a number and an address are exact, a name is a guess: MatchVia), and the calendar's zone.
 * All null without a calendar read.
 */
function visitKeysOf(
  v: PersonRowDto["visits"],
): Pick<PersonRowVM, "nextVisitDate" | "lastVisitDate" | "nextVisitVia" | "lastVisitVia" | "visitDays" | "calendarTz"> {
  const near = v ? (v.near ?? [v.last, v.next].filter((x) => x !== null)) : [];
  return {
    visitDays: v ? near.map((x) => ({ date: visitDateKey(x.start, v.timezone), via: x.via })) : [],
    nextVisitDate: v?.next ? visitDateKey(v.next.start, v.timezone) : null,
    lastVisitDate: v?.last ? visitDateKey(v.last.start, v.timezone) : null,
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
function lastChannelOf(c: string | null | undefined): ConsentChannel | null {
  return c === "whatsapp" || c === "sms" || c === "email" ? c : null;
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
 * Where a reply to them goes, its window, and the booking link's words for that wire. Channel-aware: only WhatsApp has a
 * window (policy replyWindow). This read WhatsApp's for everybody, so a person who had only ever emailed was shown
 * "Closed · template only" -- a template they cannot receive, on a wire they have never used. `emailStopped` is whether
 * mail to their address has stopped (rowReachOf's flag): the booking link is not offered by email then.
 */
function rowReplyOf(
  r: PersonRowDto,
  now: Date,
  emailStopped: boolean,
): Pick<PersonRowVM, "replyWindow" | "replyVia" | "bookingLinkAction"> {
  const via = replyChannelOfRow(r);
  if (!via)
    return {
      replyWindow: null,
      replyVia: null,
      bookingLinkAction: bookingLinkAction({ via: null, window: null, emailStopped }),
    };
  const w = replyWindow(via, r.latest_wa_inbound_at, now);
  const win = {
    open: w.open,
    hoursLeft: w.closesAtIso
      ? Math.max(0, Math.round((new Date(w.closesAtIso).getTime() - now.getTime()) / HOUR_MS))
      : 0,
  };
  return {
    replyWindow: win,
    replyVia: REPLY_VIA[via],
    bookingLinkAction: bookingLinkAction({ via: REPLY_VIA[via], window: win, emailStopped }),
  };
}

/** Their thread, their conversation, and whether they are new to the reader, judged against when they last wrote or called. */
function rowThreadOf(r: PersonRowDto, askedMs: number | null) {
  const reading = readingOf(askedMs, r);
  return {
    threadId: r.has_chat && r.latest_conversation_id ? `th-${r.latest_conversation_id}` : null,
    conversationId: r.latest_conversation_id,
    unseen: reading.unseen,
    markAtMs: reading.markAtMs,
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
  const v = r.visits ?? null;
  const calendar = v ? v.state : "none";
  // Their message, or the call they placed. A call the owner made is not them asking.
  const askedMs = heardAt(r);
  const booked = !!v?.next;
  const nextVisitMs = v?.next ? Date.parse(v.next.start) : null;
  const lastVisitMs = v?.last ? Date.parse(v.last.start) : null;
  const askedNotBooked =
    calendar === "ok" &&
    askedMs !== null &&
    nowMs - askedMs <= MONTH_MS &&
    !visitAnswersAsk(
      nextVisitMs !== null && Number.isFinite(nextVisitMs) ? nextVisitMs : null,
      lastVisitMs !== null && Number.isFinite(lastVisitMs) ? lastVisitMs : null,
      askedMs,
    );
  const stateDetail =
    state === "needs_you"
      ? r.open_escalation_reason
        ? reasonShort(r.open_escalation_reason)
        : r.queued_reply_at && personStanding(r, nowMs).standing !== "needs_you"
          ? "a reply is about to send — you can still stop it"
          : "waiting for a person"
      : state === "waiting_on_you"
        ? [HELD_WORDS.yours.pill.toLowerCase(), theirTurnWords(last)].filter(Boolean).join(", and ")
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
    receptionist: receptionistOf(r, tz, nowMs, viewerId),
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
    nextVisitDay: v?.next ? visitDay(v.next.start, v.timezone, nowMs) : null,
    nextVisit: v?.next ? `${visitLine(v.next, v.timezone, nowMs)} · ${visitTitleFor(v.next.title, name)}` : null,
    lastVisit: v?.last ? `${visitLine(v.last, v.timezone, nowMs)} · ${visitTitleFor(v.last.title, name)}` : null,
    lastVisitDay: v?.last ? visitDay(v.last.start, v.timezone, nowMs) : null,
    ...rowReplyOf(r, now, reach.emailSuppressed),
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
    ...visitKeysOf(v),
    deal: dealOf(r, tz, nowMs),
    openDeals: openDealsOf(r, tz, nowMs),
    ...consultationKeysOf(v, nextVisitMs),
    nextStep: nextStepOf(r, tz, nowMs),
    stepDue: stepIsDue(nextStepOf(r, tz, nowMs)),
    dealStage: null,
    dealStages: [],
    followUp: null,
  };
  // The Pipeline's group for them, from the deal and the consultations just read: one rule for both pages.
  vm.dealStage = dealStageOf(vm, nowMs);
  vm.dealStages = dealStagesOf(vm.dealStage, vm.openDeals);
  return vm;
}
