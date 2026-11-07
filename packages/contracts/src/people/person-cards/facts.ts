/** Person cards: facts. */

import { visitDay, visitLine } from "../../calendar/people/visits";
import { appointmentWords } from "../../journey/appointment-word";
import { clockDate, clockDateYear } from "../../shared/clock";
import { leadsRoute } from "../../leads/leads";
import { reachOutPersonOf } from "../../campaigns/reach-out/leads/standing";
import { listRuleWhy } from "../lists/rules";
import { PEOPLE_LISTS } from "../lists/builtin-lists";
import type { PersonDetailDto } from "../person-dto";
import { asPersonMode, type PersonMode, type ReceptionistTone } from "../person-receptionist";
import { ago } from "../person-row-facts";
import { bookingLinkAction, emailFactWords, repliesWords } from "../person-reach";
import { type PersonRowVM } from "../person-row/row-facts";
import { visitTitleWithout } from "../../calendar/visit/service";
import { addedBy, ts } from "../person-helpers";
import { PERSON_CHANNEL_WORDS, REPLY_VIA } from "../person-words";
import { neverConnected } from "../../conversations/call-dto";
import { type PersonAboutFact, type PersonCardContext, type PersonFact, type PersonReply } from "./right-now";

/**
 * "Held for you" is the word the People row puts beside the state, for a thread you have or a mode that holds. A
 * teammate's is paused (the standing pill's own word), and the line under it says whose.
 */
const TONE_WORD: Record<ReceptionistTone, string> = {
  answering: "Answering",
  escalated: "Waiting",
  queued: "Queued",
  snoozed: "Snoozed",
  paused: "Held for you",
  yours: "Held for you",
  theirs: "Paused",
  silent: "Silent",
};

/**
 * Under the word, what the label says after it ("set to Never", "a person owns the thread"), not the label again. A
 * teammate's name keeps its capital ("Ruben has it"); only "A teammate" is said in lower case. A snoozed thread's is when
 * it wakes and what it still asks (the word before it is "Snoozed").
 */
const receptionistMeta = (label: string, tone: ReceptionistTone) =>
  tone === "snoozed"
    ? label.replace(/^Snoozed\s*/, "") || label.toLowerCase()
    : label.includes(", ")
      ? label.slice(label.indexOf(", ") + 2)
      : tone === "theirs" && !label.startsWith("A teammate")
        ? label
        : label.toLowerCase();

/** Facts strip: first and last contact, conversations, calls, the receptionist's standing, the deal, the next appointment. */
export function personFactsOf({
  profile,
  tz,
  nowMs,
  base,
  current,
  firstChannel,
  word,
}: PersonCardContext): PersonFact[] {
  const lc = base.lastContact;
  const attempts = profile.calls.filter(neverConnected).length;
  const lastMeta =
    lc.who === "they"
      ? lc.kind === "call"
        ? "they phoned"
        : "they wrote"
      : lc.who === "team"
        ? "your team replied"
        : lc.who === "receptionist"
          ? "receptionist replied"
          : lc.who === "system"
            ? "we sent"
            : "";
  const facts: PersonFact[] = [
    { label: "First contact", value: base.firstContact.label, meta: firstChannel },
    { label: "Last contact", value: lc.ts !== null ? ago(lc.ts, tz, nowMs) : "—", meta: lastMeta },
    {
      label: "Conversations",
      value: base.threads,
      meta: base.escalations ? `${base.escalations} needed you` : "none needed you",
    },
    {
      label: "Calls",
      value: base.calls,
      // A dial that never connected is not a call (people_list's rule), but it is in the history below: the strip said
      // "0 calls" over a "Missed call" row (the 2 Oct 2026 audit). Said as what it is.
      meta: `${base.calls ? `${Math.max(1, Math.round(base.callSeconds / 60))} min total` : "no calls"}${
        attempts ? `, ${attempts} didn't connect` : ""
      }`,
    },
    // Consent is the two asks on the rail, each with how it was given. A fact, an About row and a pill said it
    // again, five times on one profile.
    {
      label: "Receptionist",
      value: TONE_WORD[base.receptionist.tone],
      meta:
        base.receptionist.tone === "escalated"
          ? "for you"
          : receptionistMeta(base.receptionist.label, base.receptionist.tone),
    },
    // The deal they are deciding on or took (0004): the stage word, and its line with the service and the amount.
    ...(current ? [{ label: "Deal", value: current.word, meta: current.line, tone: "" as const }] : []),
  ];
  // Their appointments, when the workspace's calendar is connected: the next
  // one is the fact an owner asks for first, and the one the receptionist
  // is given when they call.
  if (profile.visits) {
    const visits = profile.visits;
    facts.push({
      // In the workspace's word for an appointment, as Campaigns says it (decision 0041).
      label: appointmentWords(word).next,
      value: visits.next ? visitDay(visits.next.start, visits.timezone, nowMs) : "—",
      // The cell is narrow: the time here, then how it stands if a word has been said of it and how it was matched if that
      // was a guess (the visit line's own words, person-row.ts), the service in About.
      meta: base.nextVisitLine
        ? [
            base.nextVisitLine.time,
            base.nextVisitLine.state?.text,
            base.nextVisitLine.guess ? base.nextVisitLine.match : null,
          ]
            .filter(Boolean)
            .join(" · ")
        : visits.state === "ok"
          ? "none booked"
          : "could not be read",
    });
  }
  return facts;
}

/** About rail: the wires, the proposal's host, first contact, channels, where a reply may go, their visits, when they were added. */
export function aboutOf({
  profile,
  tz,
  nowMs,
  base,
  firstChannel,
  reply,
  proposal,
  word,
}: PersonCardContext): PersonAboutFact[] {
  const about: PersonAboutFact[] = [];
  if (base.phone) about.push({ k: "Phone", v: base.phone });
  if (base.email) about.push({ k: "Email", v: emailFactWords(base.email, base.emailSuppressed) });
  if (proposal) about.push({ k: "Proposal", v: proposal.host });
  if (base.waName) about.push({ k: "WhatsApp name", v: base.waName });
  about.push({
    k: "First contact",
    v:
      base.firstContact.ts !== null
        ? `${base.firstContact.estimate ? "Before " : ""}${clockDateYear(base.firstContact.ts, tz)} · ${firstChannel}`
        : "—",
  });
  about.push({ k: "Channels", v: base.channels.map((c) => PERSON_CHANNEL_WORDS[c]).join(" · ") || "—" });
  if (base.hasChat && reply) {
    const v = repliesWords(REPLY_VIA[reply.via], reply.window, {
      optedOut: base.stopped,
      who: base.name,
      emailStopped: base.emailSuppressed,
    });
    if (v) about.push({ k: "Replies", v });
  }
  if (profile.visits) {
    const visits = profile.visits;
    const nextLine = visits.next
      ? `${visitLine(visits.next, visits.timezone, nowMs)} · ${visitTitleWithout(visits.next.title, [base.name])}`
      : visits.state === "ok"
        ? "Nothing on the calendar"
        : "Calendar could not be read";
    const words = appointmentWords(word);
    about.push({ k: words.next, v: nextLine, next: true });
    if (visits.last)
      about.push({
        k: words.last,
        v: `${visitLine(visits.last, visits.timezone, nowMs)} · ${visitTitleWithout(visits.last.title, [base.name])}`,
      });
  }
  if (profile.added) {
    const at = ts(profile.added.at);
    about.push({
      k: "Added",
      v: `${at !== null ? clockDateYear(at, tz) : "—"} · ${addedBy(profile.added).how}`,
    });
  } else if (profile.lead) {
    // Found as a lead, with no row saying when they were added: the lead's own day says it.
    const found = ts(profile.lead.found_at);
    about.push({
      k: "Added",
      v: `${found !== null ? clockDateYear(found, tz) : "—"} · ${addedBy({ source: "lead", title: null }).how}`,
    });
  }
  // The reach-out that found them, and where they stand in it (Reach out Part 6, H11).
  const reach = profile.lead?.reach_out ? reachOutPersonOf(profile.lead.reach_out, nowMs, tz).about : null;
  if (reach) about.push({ k: "Sequence", v: reach });
  return about;
}

/**
 * The row's reply fields made exact by the profile: the wire in words, its window, and the booking link's act for it
 * (which says an address that stopped accepting mail cannot be emailed: `emailStopped`, the row's own flag; and offers
 * nothing to someone who asked to stop: `stop`, the row's own `stopped` and name). The same function the row asks.
 */
export function replyFields(
  reply: PersonReply,
  emailStopped: boolean,
  stop: { optedOut: boolean; who: string },
): Pick<PersonRowVM, "replyVia" | "replyWindow" | "bookingLinkAction"> {
  return {
    replyVia: REPLY_VIA[reply.via],
    replyWindow: reply.window,
    bookingLinkAction: bookingLinkAction({ via: REPLY_VIA[reply.via], window: reply.window, emailStopped }, stop),
  };
}

/**
 * The person's own setting (null = following the workspace) and the workspace's mode, so the rail can say which is
 * in force. 'veto' at the workspace level still answers, after a hold, so it reads as "Answer".
 */
export function receptionistModeOf(personDetail: PersonDetailDto): {
  person: PersonMode | null;
  workspace: PersonMode | null;
} {
  return {
    person: asPersonMode(personDetail.receptionist_mode),
    workspace: personDetail.workspace_reply_mode === "veto" ? "auto" : asPersonMode(personDetail.workspace_reply_mode),
  };
}

/**
 * The People lists that keep themselves current and have them on today, by the rail's own tests (PEOPLE_LISTS): the
 * ones this page does not already say another way, and a calendar's only with a calendar. Each says why it has them,
 * in the rule's own words (listRuleWhy): the facts they meet today.
 */
export function smartListsOf(
  personDetail: PersonDetailDto,
  base: PersonRowVM,
): { id: string; label: string; why: string }[] {
  return PEOPLE_LISTS.filter(
    (l) => l.onProfile !== false && (!l.needsCalendar || personDetail.visits?.state === "ok") && l.test(base),
  ).map((l) => ({ id: l.id, label: l.label, why: listRuleWhy(l.rule, base) }));
}

/** The lead they were found as, with the door to it on Leads; null when they were never one. */
export function personLeadOf(
  personDetail: PersonDetailDto,
  base: PersonRowVM,
  tz: string,
  nowMs: number,
): { id: string; name: string; found: string; to: string } | null {
  return personDetail.lead
    ? {
        id: personDetail.lead.id,
        name: personDetail.lead.business_name || base.name,
        found: ts(personDetail.lead.found_at) !== null ? clockDate(ts(personDetail.lead.found_at)!, tz, nowMs) : "—",
        to: leadsRoute({ peek: personDetail.lead.id }),
      }
    : null;
}
