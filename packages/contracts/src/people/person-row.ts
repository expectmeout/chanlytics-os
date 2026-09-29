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
import { visitAnswersAsk, visitDateKey, visitDay, visitLine } from "../calendar/calendar-people";
import { nextStepOf, stepIsDue, type PersonNextStepVM } from "../notes/steps";
import { initialsOf, isIdentifierName } from "../conversations/thread-contact";
import { dealOf, type DealVM } from "../deals/deal-vm";
import { dealStageOf, type DealStandingStage } from "../deals/deal-consultations";
import { mayReceive, type PersonConsent, saidYesTo } from "./person-consent";
import { MONTH_MS, ts } from "./person-helpers";
import type { PersonRowDto } from "./person-dto";
import { bookingLinkAction } from "./person-reach";
import { receptionistOf, type PersonReceptionist } from "./person-receptionist";
import {
  ago,
  consentOf,
  firstContactOf,
  lastContactOf,
  reasonShort,
  type PersonFirstContact,
  type PersonLastContact,
} from "./person-row-facts";
import { heardAt, PERSON_STATE_LABELS, personStanding, personStateFor, type PersonState } from "./person-state";

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
 * A row knows which wires they have written on and not which one was last, so
 * this is exact for the one case that matters most -- a person reached only by
 * email, whose reply can never be held by WhatsApp's window -- and otherwise
 * reads WhatsApp's window, the strictest there is: a row that cannot tell may
 * say a reply is held when it is not, and never the reverse. The profile, which
 * has every message, answers it exactly (replyChannelOfThreads).
 */
function replyChannelOfRow(r: PersonRowDto): "whatsapp" | "sms" | "email" | null {
  if (!r.has_chat) return null;
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
  /** Said the yes each purpose needs, a number to send to or not (saidYesTo). */
  saidYes: { offers: boolean; messages: boolean };
  /** May be sent each: the yes and a number (mayReceive). */
  canReceive: { offers: boolean; messages: boolean };
  /** Asked to stop, or on the do-not-contact list (consent.ts isOptedOutContact). */
  stopped: boolean;
  /** Their next step's day has come (steps.ts stepIsDue). */
  stepDue: boolean;
  /** "2026-09-08": the day of the next / last visit by the calendar's own clock — what a day-keyed playbook reads. */
  nextVisitDate: string | null;
  lastVisitDate: string | null;
  /** The calendar's zone; null without a calendar. */
  calendarTz: string | null;
  /** Their deal, as the page says it (0004); null where none was recorded. */
  deal: DealVM | null;
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
 * A People row, as it reads at `now` for `viewerId` (the member looking; null for a playbook's run, which has no one):
 * its words, and the facts a list's rule reads (list-rules.ts), each worked out once here in the workspace's own dates.
 */
export function toPersonRowVM(
  r: PersonRowDto,
  tz: string,
  now = new Date(),
  viewerId: string | null = null,
): PersonRowVM {
  const nowMs = now.getTime();
  const name = personName(r);
  const state = personStateFor(r, nowMs, tz, viewerId);
  const last = lastContactOf(r, tz, nowMs);
  const first = firstContactOf(r, tz, nowMs);
  const consent = consentOf(r, tz, nowMs);
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
        ? "you own the thread and they wrote last"
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
    waName: r.wa_profile_name,
    channels: channelsOf(r),
    hasChat: !!r.has_chat,
    state,
    stateLabel: PERSON_STATE_LABELS[state],
    stateDetail,
    lastContact: last,
    receptionist: receptionistOf(r, tz, nowMs),
    firstContact: first,
    cameFrom: cameFromOf(r),
    consent,
    quote: r.last_inbound_text?.trim() || null,
    callSummary: r.last_inbound_call_summary?.trim() || null,
    threads: r.conversation_count ?? 0,
    calls: r.call_count ?? 0,
    escalations: r.escalation_count ?? 0,
    callSeconds: r.call_seconds ?? 0,
    threadId: r.has_chat && r.latest_conversation_id ? `th-${r.latest_conversation_id}` : null,
    needsYouSinceMs: ts(r.open_escalation_since),
    calendar,
    booked,
    nextVisitDay: v?.next ? visitDay(v.next.start, v.timezone, nowMs) : null,
    nextVisit: v?.next ? `${visitLine(v.next, v.timezone, nowMs)} · ${visitTitleFor(v.next.title, name)}` : null,
    lastVisit: v?.last ? `${visitLine(v.last, v.timezone, nowMs)} · ${visitTitleFor(v.last.title, name)}` : null,
    lastVisitDay: v?.last ? visitDay(v.last.start, v.timezone, nowMs) : null,
    // Channel-aware: only WhatsApp has a window (policy replyWindow). This read
    // WhatsApp's for everybody, so a person who had only ever emailed was shown
    // "Closed · template only" -- a template they cannot receive, on a wire
    // they have never used.
    ...(() => {
      const via = replyChannelOfRow(r);
      if (!via) return { replyWindow: null, replyVia: null, bookingLinkAction: bookingLinkAction(null, null) };
      const w = replyWindow(via, r.latest_wa_inbound_at, now);
      const win = {
        open: w.open,
        hoursLeft: w.closesAtIso ? Math.max(0, Math.round((new Date(w.closesAtIso).getTime() - nowMs) / HOUR_MS)) : 0,
      };
      return { replyWindow: win, replyVia: REPLY_VIA[via], bookingLinkAction: bookingLinkAction(REPLY_VIA[via], win) };
    })(),
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
    saidYes: { offers: saidYesTo({ consent }, "marketing"), messages: saidYesTo({ consent }, "conversational") },
    canReceive: {
      offers: mayReceive({ consent, phone: r.phone_e164 }, "marketing"),
      messages: mayReceive({ consent, phone: r.phone_e164 }, "conversational"),
    },
    stopped: isOptedOutContact({ consent: r.consent, dnc: r.dnc }),
    nextVisitDate: v?.next ? visitDateKey(v.next.start, v.timezone) : null,
    lastVisitDate: v?.last ? visitDateKey(v.last.start, v.timezone) : null,
    calendarTz: v?.timezone ?? null,
    deal: dealOf(r, tz, nowMs),
    consultationVisit: !!(v?.next?.consultation || v?.last?.consultation),
    consultedMs: v?.last?.consultation ? ts(v.last.end) : null,
    consultationTitle: v?.last?.consultation ? v.last.title : v?.next?.consultation ? v.next.title : null,
    consultAhead:
      v?.next?.consultation && nextVisitMs !== null && Number.isFinite(nextVisitMs)
        ? { startMs: nextVisitMs, allDay: !!v.next.all_day }
        : null,
    nextStep: nextStepOf(r, tz, nowMs),
    stepDue: stepIsDue(nextStepOf(r, tz, nowMs)),
    dealStage: null,
    followUp: null,
  };
  // The Pipeline's group for them, from the deal and the consultations just read: one rule for both pages.
  vm.dealStage = dealStageOf(vm, nowMs);
  return vm;
}
