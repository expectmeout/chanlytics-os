/** Person profile: person vm. */

import { clockDate, clockTime } from "../../shared/clock";
import { plural } from "../../shared/words";
import type { DealVM } from "../../deals/vm";
import { dealPaceOf } from "../../deals/waits";
import type { PersonDetailDto } from "../person-dto";
import { personName } from "../person-name";
import type { HolderNames } from "../person-receptionist";
import { proposalAction } from "../person-reach";
import { campaignsOf, inSequencesOf, ts } from "../person-helpers";
import { personNotesVM } from "../../notes/person-notes";
import { sinceWords } from "../person-words";
import { signupAskOf } from "../doors/signup-confirm";
import type { ChannelsReady } from "../../campaigns/broadcasts/reach-for";
import { writeWaysOf } from "../../new-conversation/write-ways";
import type { MessageDto } from "../../conversations/thread-dto";
import { draftSendsAtMs, heldDraftOf } from "../../conversations/message-words";
import { replyWaitsOnYou } from "../../conversations/standing";
import { isIdentifierName, shortName } from "../../conversations/thread-contact";
import {
  aboutOf,
  personFactsOf,
  personLeadOf,
  receptionistModeOf,
  replyFields,
  smartListsOf,
} from "../person-cards/facts";
import { lastExchangeOf, personCardContext, rightNowOf } from "../person-cards/right-now";
import { comingUpOf, timelineOf } from "../person-timeline";
import { dealCardsOf } from "../../deals/sheet/deal-card";
import { LEAD_CONSENT_REFUSAL } from "../../leads/words/refusals";
import { LEAD_STAGE_WORDS } from "../../leads/words/lists";
import {
  businessRecordOf,
  personHeadOf,
  worksAtOf,
  type BusinessRecordVM,
  type PersonHeadVM,
} from "../person-page/business";
import { personFiguresOf } from "../person-page/figures";
import { personNextOf, type UpNextVM } from "../person-page/next";
import { lastWordsOf } from "../person-page/last-words";
import { personNoticesOf, type NoticeVM } from "../person-page/notices";
import { personTabsOf } from "../person-page/route";
import { personVisitsOf } from "../person-page/visits";
import { callBackWaits } from "../person-page/call";
import { holderOf } from "../person-state";
import { callFactsOf } from "../person-page/call-facts";
import { contactEvidenceOf, personBeforeOf, personOriginOf, reachRowsOf } from "../person-page/origin";
import { doubtsOf, ownMessagesOf, personActs, type PersonPageKeys, type PersonVM } from "./timeline";

/**
 * The whole page: the row view model, made exact by the profile's own rows, and every card over it
 * (person-cards.ts, person-timeline.ts). The keys keep the order the page and Ask have always read them in.
 */
export function toPersonVM(
  personDetail: PersonDetailDto,
  tz: string,
  now = new Date(),
  /** The member looking (toPersonRowVM's viewer). */
  viewerId: string | null = null,
  /**
   * What the page holds beside the person: the roster, where it has read it (a teammate's thread says whose it is,
   * person-receptionist.ts heldThreadOf), and the workspace's lines as People read them (ChannelsReady), which More's
   * sends are judged against; null for either is not read (a server's reader, Ask).
   */
  page: { names?: HolderNames | null; ready?: ChannelsReady | null } | null = {},
): PersonVM {
  const ctx = personCardContext(personDetail, tz, now, viewerId, page?.names ?? null);
  const { base, nowMs, word, reply } = ctx;
  const vm: Omit<PersonVM, "proposal" | "proposalAction" | "acts" | PersonPageKeys> = {
    ...base,
    ...(reply ? replyFields(reply, base.emailSuppressed, { optedOut: base.stopped, who: base.name }) : {}),
    since: sinceWords(base),
    metaLine: `${plural(base.threads, "conversation")} · ${plural(base.calls, "call")}`,
    lastExchange: lastExchangeOf(ctx),
    facts: personFactsOf(ctx),
    rightNow: rightNowOf(ctx),
    timeline: timelineOf(ctx),
    comingUp: comingUpOf(ctx),
    visitTab: personVisitsOf(ctx),
    about: aboutOf(ctx),
    noteList: personNotesVM(personDetail.person_notes, tz, nowMs),
    noteTeam: personDetail.note_team ?? [],
    bookingLink: personDetail.booking_link?.trim() || null,
    openThread: base.threadId ? `inbox/${base.threadId}` : null,
    receptionistMode: receptionistModeOf(personDetail),
    ownMessages: ownMessagesOf(personDetail, ctx.stamp),
    smartLists: smartListsOf(personDetail, base),
    campaigns: campaignsOf(personDetail, tz, nowMs),
    inSequences: inSequencesOf(personDetail, tz, nowMs),
    lead: personLeadOf(personDetail, base, tz, nowMs),
    // The doors' own test, as far as the page can see it: a lead names them, or they work at one.
    yesLocked: personDetail.lead || base.worksAt ? LEAD_CONSENT_REFUSAL : null,
    signupAsk: signupAskOf(
      personDetail.conversations.flatMap((c) => c.messages),
      {
        emailOffers: base.consent.emailMarketing,
        fromWebsite: personDetail.row.came_from === "website",
        email: base.email,
        suppressed: base.emailSuppressed,
        stopped: base.stopped,
      },
      tz,
      nowMs,
    ),
    callBackOpen: callBackWaits(personDetail.escalations, holderOf(ctx.row, nowMs, viewerId) === "theirs"),
    doubts: doubtsOf(personDetail),
    deal: ctx.current,
    deals: ctx.deals,
    word,
    dealPace: dealPaceOf(personDetail.deal_pace),
    services: personDetail.services ?? [],
    consultFirst: personDetail.consult_first ?? [],
    // The one rule's answer, wire by wire, over People's own row for them (the sheet asks the same of the same row).
    ways: writeWaysOf(ctx.row, page?.ready ?? null, now),
  };
  // The send's words follow the wire the page has settled on, exact window included.
  const whole = {
    ...vm,
    proposal: ctx.proposal,
    proposalAction: proposalAction(
      { via: vm.replyVia ?? null, window: vm.replyWindow ?? null, emailStopped: vm.emailSuppressed },
      ctx.sentWords,
    ),
  };
  const withActs = { ...whole, acts: personActs(whole) };
  return { ...withActs, ...personPageOf(withActs, personDetail, tz, now) };
}

/** "3 min" or "45 s": a call's length said as the figures say it. */
function callLength(seconds: number): string {
  return seconds >= 60 ? `${Math.round(seconds / 60)} min` : `${seconds} s`;
}

/** What their open deals add up to, recorded: one deal's amount, or a count; null with no amount on any. */
function recordedOf(deals: readonly DealVM[]): string | null {
  const open = deals.filter((x) => x.stage === "proposed" || x.stage === "won");
  const amounts = open.map((x) => x.amount).filter((x): x is string => !!x);
  if (!amounts.length) return null;
  return amounts.length === 1 ? `${amounts[0]} recorded` : `${amounts.length} amounts recorded`;
}

/**
 * Up next for a person (personNextOf), over the deal cards the page draws: `dealP` is the person with People's row's
 * follow-up laid on where one runs (0006), so a deal whose follow-up is in hand offers no Follow up of its own.
 */
export function personNextFor(
  person: Pick<
    PersonVM,
    "noteList" | "lastVisitLine" | "comingUp" | "visitTab" | "business" | "nextStep" | "consent" | "name" | "phone"
  >,
  dealP: Parameters<typeof dealCardsOf>[0],
  tz: string,
  nowMs: number,
): UpNextVM {
  return personNextOf({
    notes: person.noteList,
    // The newest visit that ended with nobody saying (the Visits tab's To mark), else the calendar's last: the calendar's
    // last may be one the record holds no row for, which cannot be asked, while an older one waits.
    lastVisit: person.visitTab.toMark[0]?.visit ?? person.lastVisitLine,
    ahead: person.comingUp,
    deals: dealCardsOf(dealP, nowMs, tz),
    // A business you are talking to (the lead's stage converted, said "Talking"): with no deal, a proposal is next.
    talking: !!person.business && person.business.stage.word === LEAD_STAGE_WORDS.converted,
    step: person.nextStep,
    // Not asked, with a visit ahead and a number its reminder goes to: it would be held for want of a yes (canvas A), so
    // the yes is the next thing. With no number there is no reminder to hold.
    visitYesHeld: person.consent.state === "unknown" && person.comingUp.length > 0 && !!person.phone,
    who: isIdentifierName(person.name) ? "they" : shortName(person.name),
  });
}

/**
 * The business's stage among the figures, without "changed on Leads" (its sheet says where it changes); none for a lead's
 * stand-in, whose head already says how they met and whose pill is its one state (the phone pass, 3 Nov 2026: "New"
 * beside "Lead: Contacted").
 */
const leadFigureOf = (business: BusinessRecordVM | null, head: PersonHeadVM) =>
  business && !head.standIn ? { stage: business.stage.word, since: "" } : null;

/** The person page's own parts (decision 0052, canvas A), over the page's view model and what was read for it. */
function personPageOf(
  person: Omit<PersonVM, PersonPageKeys>,
  personDetail: PersonDetailDto,
  tz: string,
  now: Date,
): Pick<PersonVM, PersonPageKeys> {
  const nowMs = now.getTime();
  const reachOut = personDetail.lead?.reach_out ?? null;
  const firstCall = personDetail.calls
    .map((c) => ts(c.started_at))
    .filter((x): x is number => x !== null)
    .sort((a, b) => a - b)[0];
  const saidNo = reachOut?.readings.find((r) => r.said_no && !r.undone) ?? null;
  const head = personHeadOf(
    {
      name: person.name,
      initials: person.initials,
      givenName: person.givenName,
      nameSource: person.nameSource,
      worksAt: person.worksAt,
      business: personDetail.business ?? null,
      signers: personDetail.signers ?? [],
      addedMs: ts(personDetail.added?.at ?? null),
      calledMs: firstCall ?? null,
      saidNoMs: saidNo ? ts(saidNo.read_at) : null,
    },
    tz,
    nowMs,
  );
  const business = personDetail.business
    ? businessRecordOf(personDetail.business, { personId: person.id, reachOut }, tz, now)
    : null;
  const past = person.timeline.filter((t) => !t.ahead);
  const thin = person.threads === 0 && person.deals.length === 0 && past.length < 6;
  const visitsSeen = person.timeline.filter((t) => t.kind === "visit").length;
  // The record's visits of theirs from before the season, said kept or missed (R7): a regular has a Visits tab still.
  const earlier = personDetail.visits?.earlier;
  const earlierSaid = (earlier?.kept ?? 0) + (earlier?.missed ?? 0);
  const sent = reachOut ? reachOut.sends.filter((x) => !!x.sent_at).length : 0;
  const figures = personFiguresOf({
    thin,
    last:
      person.lastContact.ts !== null
        ? { value: clockDate(person.lastContact.ts, tz, nowMs), sub: person.lastContact.by }
        : null,
    lead: leadFigureOf(business, head),
    deals: { count: person.openDeals.length, recorded: recordedOf(person.openDeals) },
    step: person.nextStep ? { day: person.nextStep.day.near, words: person.nextStep.words } : null,
    calls: { count: person.calls, minutes: callLength(person.callSeconds) },
    visits: {
      ahead: person.comingUp.length,
      kept: person.visitTab.head.kept,
      toMark: person.visitTab.head.toMark,
      any: person.calendar === "ok" && (person.comingUp.length > 0 || visitsSeen > 0 || earlierSaid > 0),
    },
    emails: reachOut ? { out: sent, back: reachOut.readings.filter((r) => !r.undone).length } : null,
    word: person.word,
  });
  const tabFacts = {
    id: person.id,
    history: past.length,
    visits: visitsSeen,
    marked: earlierSaid,
    deals: person.deals.length,
    campaigns: person.campaigns.length + person.inSequences.length,
    thin,
    word: person.word,
  };
  const evidence = contactEvidenceOf(personDetail, { ...person.firstContact, cameFrom: person.cameFrom?.key ?? null });
  return {
    head,
    worksAtRow: worksAtOf(person.worksAt, personDetail.business ?? null, tz, nowMs),
    business,
    thin,
    figures,
    next: personNextFor({ ...person, business }, person, tz, nowMs),
    notices: pageNoticesOf({ p: person, d: personDetail, head, business, messages: evidence.messages, tz, nowMs }),
    lastWords: lastWordsOf(past),
    tabs: { desk: personTabsOf(tabFacts, false), phone: personTabsOf(tabFacts, true) },
    reach: reachRowsOf(evidence, tz, nowMs),
    origin: personOriginOf(evidence, tz, nowMs),
    before: personBeforeOf(personDetail.before, nowMs),
  };
}

/**
 * The page's notices (personNoticesOf) over what was read: the signer and Combine, the doubts, what their calls left (a
 * name passes the gate the business's and the team's names are kept out of), and a reply held in its veto window.
 */
function pageNoticesOf(fields: {
  p: Omit<PersonVM, PersonPageKeys>;
  d: PersonDetailDto;
  head: PersonHeadVM;
  business: BusinessRecordVM | null;
  messages: readonly MessageDto[];
  tz: string;
  nowMs: number;
}): NoticeVM[] {
  const { p, d, head, business, tz, nowMs } = fields;
  const notNames = [d.business?.lead.business_name ?? null, ...(d.note_team ?? []).map((t) => t.name)];
  const calls = callFactsOf(d.calls, notNames, tz, nowMs);
  const stepAt = calls.step?.atMs ?? null;
  return personNoticesOf({
    head,
    business,
    doubts: p.doubts,
    email: p.email,
    phone: d.row.phone_e164,
    named: !!p.givenName,
    heardFrom: p.askedMs !== null,
    peopleHere: (d.business?.people ?? [])
      .filter((x) => x.id !== p.id)
      .map((x) => ({
        id: x.id,
        name: personName(x),
        email: x.email,
        nameSource: x.name_source,
        phone: x.phone_e164,
        named: !!x.display_name,
      })),
    calls,
    givenName: p.givenName,
    openStep: p.nextStep !== null,
    stepNoted:
      stepAt !== null && (d.person_notes ?? []).some((n) => n.source === "call" && (ts(n.created_at) ?? 0) >= stepAt),
    draft: heldDraftWaiting(fields.messages, p.openThread, tz, nowMs),
  });
}

/** A reply the receptionist holds in its veto window (heldDraftOf, the Inbox's own pick), while it still waits. */
function heldDraftWaiting(
  messages: readonly MessageDto[],
  thread: string | null,
  tz: string,
  nowMs: number,
): { to: string; sends: string } | null {
  const held = heldDraftOf(messages);
  if (!held || !thread) return null;
  const at = draftSendsAtMs(held);
  return replyWaitsOnYou({ endsAtMs: at }, nowMs) ? { to: thread, sends: clockTime(at, tz) } : null;
}
