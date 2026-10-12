/**
 * A person's page: the timeline's filters, the acts, their own messages, the runs that named them, and the whole
 * page's view model (toPersonVM), composed one card at a time from person-cards.ts (the context computed once, and a
 * builder per card) and person-timeline.ts (a builder per source). Moved whole from people.ts (Reach out Part 2.5);
 * exported from index.ts directly, since it reads people.ts's row view model.
 */
import { clockDate } from "../shared/clock";
import { appointmentWordWhere, appointmentWords } from "../journey/appointment-word";
import { plural } from "../shared/words";
import { DEAL_ACT_WORDS } from "../deals/deal-words";
import type { DealVM } from "../deals/deal-vm";
import { dealPaceOf, type DealPaceVM } from "../deals/deal-waits";
import type { PersonCampaignVM, PersonDetailDto } from "./person-dto";
import { MERGE_WORDS } from "./person-merge";
import { DOUBT_WORDS, type DoubtSeen } from "./person-doubts";
import { personName } from "./person-name";
import { formatPhoneDisplay } from "../shared/phone";
import type { HolderNames, PersonMode } from "./person-receptionist";
import { mayReach, type PersonProposalVM, proposalAction } from "./person-reach";
import type { PersonRowVM } from "./person-row";
import { ts } from "./person-helpers";
import { personNotesVM, type PersonNoteTeamDto, type PersonNoteVM } from "../notes/person-notes";
import { PERSON_CHANNEL_WORDS, type PersonChannel } from "./person-words";
import { addressOf } from "../activity/record-address";
import { HELD_REASONS, isReplyTo } from "../broadcasts/run-words";
import { messageAt } from "../conversations/thread-dto";
import { THREAD_CHANNEL_WORDS, isTheirOwnWords, writtenChannelOf } from "../conversations/thread-channel";
import {
  aboutOf,
  personFactsOf,
  lastExchangeOf,
  leadOf,
  type PersonAboutFact,
  type PersonFact,
  type PersonLastExchange,
  type PersonRightNow,
  personCardContext,
  receptionistModeOf,
  replyFields,
  rightNowOf,
  sinceWords,
  smartListsOf,
} from "./person-cards";
import {
  comingUpOf,
  type PersonTimelineItemVM,
  type PersonVisitAheadVM,
  type TimelineKind,
  timelineOf,
} from "./person-timeline";
import { dealCardsOf } from "../deals/sheet/deal-card";
import { LEAD_CONSENT_REFUSAL, LEAD_STAGE_WORDS } from "../leads/lead-words";
import {
  businessRecordOf,
  personHeadOf,
  worksAtOf,
  type BusinessRecordVM,
  type PersonHeadVM,
  type WorksAtVM,
} from "../person-page/business";
import { personFiguresOf, type PersonFigureVM } from "../person-page/figures";
import { personNextOf, type UpNextVM } from "../person-page/next";
import { lastWordsOf, type LastWordVM } from "../person-page/last-words";
import { personNoticesOf, type NoticeVM } from "../person-page/notices";
import { personTabsOf, type PersonTabVM } from "../person-page/route";

/* -------------------------------- profile -------------------------------- */

/**
 * How a profile's timeline narrows: everything, or one kind of record. "Messages" is the thread itself --
 * what was said, and the escalations and decisions in it; only "All" keeps the system lines.
 */
export type TimelineFilterId = "all" | "messages" | "calls" | "visits" | "consent" | "deals";

export const TIMELINE_FILTERS: readonly {
  id: TimelineFilterId;
  label: string;
  kinds: readonly TimelineKind[] | null;
}[] = [
  { id: "all", label: "All", kinds: null },
  { id: "messages", label: "Messages", kinds: ["customer", "receptionist", "team", "escalation", "decision"] },
  { id: "calls", label: "Calls", kinds: ["call"] },
  { id: "visits", label: "Appointments", kinds: ["visit"] },
  { id: "consent", label: "Consent", kinds: ["consent"] },
  { id: "deals", label: "Deals", kinds: ["deal"] },
];

/**
 * A filter's heading in the workspace's words: the appointments' is the workspace's word for one ("Meetings" where some
 * customers get a proposal first, as Campaigns says it: decision 0041), the others their own.
 */
export function timelineFilterLabel(f: { id: TimelineFilterId; label: string }, dealsOn: boolean): string {
  return f.id === "visits" ? appointmentWords(appointmentWordWhere(dealsOn)).Many : f.label;
}

/** The items a filter shows, in the order they came; an unknown filter shows everything. */
export function filterTimeline<T extends { kind: TimelineKind }>(items: readonly T[], id: string): T[] {
  const kinds = TIMELINE_FILTERS.find((f) => f.id === id)?.kinds ?? null;
  return kinds ? items.filter((i) => kinds.includes(i.kind)) : [...items];
}

export interface PersonVM extends PersonRowVM {
  /** "Since Jul 14" / "Since before Aug 27" / "" */
  since: string;
  /** "3 conversations · 2 calls" */
  metaLine: string;
  lastExchange: PersonLastExchange;
  facts: PersonFact[];
  rightNow: PersonRightNow;
  timeline: PersonTimelineItemVM[];
  /** Their visits that have not ended, soonest first: the page's Coming up. Each is in `timeline` too, marked `ahead`. */
  comingUp: PersonVisitAheadVM[];
  about: PersonAboutFact[];
  /** Their notes (0007): the receptionist's suggestions first, then newest first. */
  noteList: PersonNoteVM[];
  /** The team a note can be for; empty where the team could not be read. */
  noteTeam: PersonNoteTeamDto[];
  /** The workspace's booking link, or null when none is on file. */
  bookingLink: string | null;
  /**
   * Their proposal (proposalLinkOf, 0008): the link on their deal while it is a proposal out; for any other deal, none;
   * with no deal at all, the one on the person (00154) while it is still read. Null where deals are off, and when none
   * is on file.
   */
  proposal: PersonProposalVM | null;
  /** The send-the-proposal button's words for the wire a reply goes out on (proposalAction); `ready` false hides it. */
  proposalAction: { label: string; title: string; ready: boolean };
  /** Their deals, newest first, as the page says them (0004). */
  deals: DealVM[];
  /** Whether deals are on here (dealsAreOn): the page draws its Deal section, and offers the proposal's send, only then. */
  dealsOn: boolean;
  /** The workspace's pace (dealPaceOf): when their proposal waits, and what its card says; none until five are decided. */
  dealPace: DealPaceVM | null;
  /** The profile's service names; the picker appears only past one. */
  services: string[];
  /** The services that need a consultation first: a proposal started from one names it (deal-sheet.ts). */
  consultFirst: string[];
  /** "inbox/th-…" or null for a phone-only person. */
  openThread: string | null;
  /** The person's own setting (null = following the workspace) and the
   *  workspace's mode, so the rail can say which is in force. 'veto' at the
   *  workspace level still answers, after a hold, so it reads as "Answer". */
  receptionistMode: { person: PersonMode | null; workspace: PersonMode | null };
  /** What they have written to you, newest first: the messages an answer "in their own message" may name (00137). */
  ownMessages: OwnMessageVM[];
  /**
   * The People lists that keep themselves current and have them on today, by the rail's own tests (PEOPLE_LISTS): the
   * ones this page does not already say another way, and a calendar's only with a calendar. Each says why it has them,
   * in the rule's own words (listRuleWhy): the facts they meet today.
   */
  smartLists: { id: string; label: string; why: string }[];
  /** The runs that named them, newest first, each with what became of it. */
  campaigns: PersonCampaignVM[];
  /** The lead they were found as, with the door to it on Leads; null when they were never one. */
  lead: { id: string; name: string; found: string; to: string } | null;
  /**
   * Why a member may not record their yes (decision 19, widened by 0052): they came from a lead, or work at one, and both
   * consent doors refuse a yes a member records for them; the sentence is the doors' own (LEAD_CONSENT_REFUSAL), the
   * disabled Yes's caption. Null for anyone else.
   */
  yesLocked: string | null;
  /** What the page's More menu offers for them, in order (personActs): the page keeps those its reader's role allows. */
  acts: PersonActVM[];
  /** The open doubts naming them (0034 step 4, doubtsOf): another record one identity could belong to, each with its sentence. */
  doubts: PersonDoubtVM[];
  /** The head (0052): their face and name, or the business's tile and name while they are a stand-in, and the line under it. */
  head: PersonHeadVM;
  /** The Works at row: one row, the door to the business sheet; null for someone who works nowhere. */
  worksAtRow: WorksAtVM | null;
  /** The business sheet, the one home of the business's details; null for someone who works nowhere it can read. */
  business: BusinessRecordVM | null;
  /** No thread, no deal and fewer than six rows of history: one scroll, no figures and no tabs. */
  thin: boolean;
  /** The figures at the top of the work column, four at most (personFiguresOf). */
  figures: PersonFigureVM[];
  /** Up next (personNextOf), as the page reads it before People's row lays the follow-up on (personNextFor). */
  next: UpNextVM;
  /** The notices (personNoticesOf), each with its one home. */
  notices: NoticeVM[];
  /** Their last words: their newest message and our newest, the doors to the thread (lastWordsOf). */
  lastWords: LastWordVM[];
  /** The tabs as addresses, a desk's and a phone's (personTabsOf). */
  tabs: { desk: PersonTabVM[]; phone: PersonTabVM[] };
}

/**
 * One "same person?" row (decision 0034, step 4): the other record as People names them, with the number and the
 * address the merge box tells two names apart by, what the door saw, and the row's sentence (DOUBT_WORDS).
 */
export interface PersonDoubtVM {
  id: string;
  otherId: string;
  other: string;
  phone: string | null;
  email: string | null;
  seen: DoubtSeen;
  sentence: string;
}

/** The open doubts the reader brought, oldest first, each said in the page's words; none from a server before the table. */
function doubtsOf(d: PersonDetailDto): PersonDoubtVM[] {
  return (d.doubts ?? []).map((x) => {
    const other = personName(x.other);
    return {
      id: x.id,
      otherId: x.other.id,
      other,
      phone: x.other.phone_e164 ? formatPhoneDisplay(x.other.phone_e164) : null,
      email: x.other.email,
      seen: x.seen,
      sentence: DOUBT_WORDS.seen[x.seen](other),
    };
  });
}

/**
 * One act in a person's More menu: a few words, the line said on hover where the act needs explaining, the group it
 * sits in (a send, a way to reach them, the delete: a line between groups), and who may press it ("any" reader, one
 * who may "record", or the "owner"). The page draws them; which exist, and their words, are here.
 */
export interface PersonActVM {
  id: "booking" | "proposal" | "call" | "copy-phone" | "copy-email" | "merge" | "delete";
  label: string;
  hint: string | null;
  group: "send" | "reach" | "delete";
  needs: "any" | "record" | "owner";
  danger?: boolean;
}

/**
 * What can be done for a person from their page, besides opening their thread (the page's one primary act).
 *
 * A send opens their thread with the words ready; nothing is sent from the page. So it says so, in the wire it goes
 * on, and never names a template or a window: where WhatsApp takes only an approved message the thread offers it,
 * which is what its hover says. The labels are a few words each: with a sentence beside every one the menu was a
 * block of wrapped words cut off at its edge. No send reaches someone who said stop or is on do-not-contact, nor by
 * email an address that stopped accepting mail (mayReach), and no call reaches someone on do-not-contact. A call is the member's own phone ringing them (a tel: link), never the receptionist.
 */
export function personActs(p: Omit<PersonVM, "acts" | PersonPageKeys>): PersonActVM[] {
  const acts: PersonActVM[] = [];
  const reach = mayReach(p);
  const on =
    p.replyVia === "Email" ? " by email" : p.replyVia === "Text" ? " as a text" : p.replyVia ? " on WhatsApp" : "";
  const ready = `Opens their thread with it ready to send${on}`;
  if (reach && p.bookingLink && p.bookingLinkAction.offered)
    acts.push({
      id: "booking",
      label: "Send booking link",
      hint: p.bookingLinkAction.ready ? ready : p.bookingLinkAction.title,
      group: "send",
      needs: "record",
    });
  // A proposal is a deal's (0008): a workspace whose customers book is never offered one to send. Its first send is
  // the deal card's next act (deal-sheet.ts dealNextAct), and no send is offered while one is on its way, so the menu
  // offers only a send the card does not: the link again once it went, or a link left on someone with no deal.
  const cardSends = p.deal?.stage === "proposed" && (!p.proposal?.sent || !!p.deal.proposal?.sending);
  if (reach && p.dealsOn && p.proposal && p.proposalAction.ready && !cardSends)
    acts.push({
      id: "proposal",
      label: p.proposal.sent ? `${DEAL_ACT_WORDS.send} again` : DEAL_ACT_WORDS.send,
      hint: ready,
      group: "send",
      needs: "record",
    });
  if (p.phone && !p.consent.dnc) {
    acts.push({ id: "call", label: "Call", hint: "From your own phone", group: "reach", needs: "any" });
    acts.push({ id: "copy-phone", label: "Copy number", hint: null, group: "reach", needs: "any" });
  }
  if (p.email) acts.push({ id: "copy-email", label: "Copy email", hint: null, group: "reach", needs: "any" });
  // Two records of one person become one (0028): the owner's, as Delete is, and beside it.
  acts.push({ id: "merge", label: MERGE_WORDS.act, hint: MERGE_WORDS.actHint, group: "delete", needs: "owner" });
  acts.push({ id: "delete", label: "Delete person…", hint: null, group: "delete", needs: "owner", danger: true });
  return acts;
}

/** One message a person wrote to the business, as the desk chooses it for an answer given in it. */
export interface OwnMessageVM {
  /** The message's own id: what the door is handed, and what the evidence names. */
  id: string;
  /** What they wrote, on one line: the eighty characters the evidence keeps, and an ellipsis when there were more. */
  words: string;
  /** The wire it came on, in the page's word for it. */
  via: string;
  /** When they sent it, by the business's clock. */
  when: string;
}

/** How many of a person's messages their page offers to choose from: the recent ones. */
const OWN_MESSAGE_CHOICES = 10;

/** How much of their words the evidence keeps (00110, 00137). */
const EVIDENCE_WORDS = 80;

/**
 * What a person wrote to you, newest first, judged the way the door judges it
 * (00137): an inbound message from the customer on a written wire, with words
 * in it -- its text, or a photo's caption. So nothing offered here is one the
 * door refuses. The words are said on one line and cut where the evidence
 * cuts them, so the owner chooses what will be kept.
 */
function ownMessagesOf(d: PersonDetailDto, stamp: (t: number) => { time: string; day: string }): OwnMessageVM[] {
  const found: { t: number; vm: OwnMessageVM }[] = [];
  for (const c of d.conversations) {
    for (const m of c.messages) {
      if (m.direction !== "inbound" || m.sender !== "customer" || m.channel === "voice" || m.channel === "system")
        continue;
      const said = [m.body, m.media?.caption].map((s) => (s ?? "").replace(/\s+/g, " ").trim()).find(Boolean);
      const t = ts(messageAt(m));
      if (!said || t === null) continue;
      const chars = Array.from(said);
      const at = stamp(t);
      found.push({
        t,
        vm: {
          id: m.id,
          words: chars.length > EVIDENCE_WORDS ? `${chars.slice(0, EVIDENCE_WORDS).join("")}…` : said,
          via: PERSON_CHANNEL_WORDS[m.channel as PersonChannel] ?? "",
          when: `${at.day}, ${at.time}`,
        },
      });
    }
  }
  return found
    .sort((a, b) => b.t - a.t)
    .slice(0, OWN_MESSAGE_CHOICES)
    .map((f) => f.vm);
}

/**
 * The whole page: the row view model, made exact by the profile's own rows, and every card over it
 * (person-cards.ts, person-timeline.ts). The keys keep the order the page and Ask have always read them in.
 */
export function toPersonVM(
  d: PersonDetailDto,
  tz: string,
  now = new Date(),
  /** The member looking (toPersonRowVM's viewer). */
  viewerId: string | null = null,
  /** The roster, where the page has read it: a teammate's thread says whose it is (person-receptionist.ts heldThreadOf). */
  names: HolderNames | null = null,
): PersonVM {
  const ctx = personCardContext(d, tz, now, viewerId, names);
  const { base, nowMs, dealsOn, reply } = ctx;
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
    about: aboutOf(ctx),
    noteList: personNotesVM(d.person_notes, tz, nowMs),
    noteTeam: d.note_team ?? [],
    bookingLink: d.booking_link?.trim() || null,
    openThread: base.threadId ? `inbox/${base.threadId}` : null,
    receptionistMode: receptionistModeOf(d),
    ownMessages: ownMessagesOf(d, ctx.stamp),
    smartLists: smartListsOf(d, base),
    campaigns: campaignsOf(d, tz, nowMs),
    lead: leadOf(d, base, tz, nowMs),
    // The doors' own test, as far as the page can see it: a lead names them, or they work at one.
    yesLocked: d.lead || base.worksAt ? LEAD_CONSENT_REFUSAL : null,
    doubts: doubtsOf(d),
    deal: ctx.current,
    deals: ctx.deals,
    dealsOn,
    dealPace: dealsOn ? dealPaceOf(d.deal_pace) : null,
    services: d.services ?? [],
    consultFirst: d.consult_first ?? [],
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
  return { ...withActs, ...personPageOf(withActs, d, tz, now) };
}

/** The keys the person page's own parts add (decision 0052, canvas A), built last over the rest. */
type PersonPageKeys =
  "head" | "worksAtRow" | "business" | "thin" | "figures" | "next" | "notices" | "lastWords" | "tabs";

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
  p: Pick<
    PersonVM,
    "noteList" | "lastVisitLine" | "comingUp" | "dealsOn" | "business" | "nextStep" | "consent" | "campaigns"
  >,
  dealP: Parameters<typeof dealCardsOf>[0],
  tz: string,
  nowMs: number,
): UpNextVM {
  return personNextOf({
    notes: p.noteList,
    lastVisit: p.lastVisitLine,
    ahead: p.comingUp,
    deals: dealCardsOf(dealP, nowMs, tz),
    dealsOn: p.dealsOn,
    // A business you are talking to (the lead's stage converted, said "Talking"): with no deal, a proposal is next.
    talking: !!p.business && p.business.stage.word === LEAD_STAGE_WORDS.converted,
    step: p.nextStep,
    visitYesHeld: p.consent.state === "unknown" && p.campaigns.some((c) => c.outcome.startsWith("Held")),
  });
}

/** The person page's own parts (decision 0052, canvas A), over the page's view model and what was read for it. */
function personPageOf(
  p: Omit<PersonVM, PersonPageKeys>,
  d: PersonDetailDto,
  tz: string,
  now: Date,
): Pick<PersonVM, PersonPageKeys> {
  const nowMs = now.getTime();
  const reachOut = d.lead?.reach_out ?? null;
  const firstCall = d.calls
    .map((c) => ts(c.started_at))
    .filter((x): x is number => x !== null)
    .sort((a, b) => a - b)[0];
  const saidNo = reachOut?.readings.find((r) => r.said_no && !r.undone) ?? null;
  const head = personHeadOf(
    {
      name: p.name,
      initials: p.initials,
      givenName: p.givenName,
      nameSource: p.nameSource,
      worksAt: p.worksAt,
      business: d.business ?? null,
      signers: d.signers ?? [],
      addedMs: ts(d.added?.at ?? null),
      calledMs: firstCall ?? null,
      saidNoMs: saidNo ? ts(saidNo.read_at) : null,
    },
    tz,
    nowMs,
  );
  const business = d.business ? businessRecordOf(d.business, { personId: p.id, reachOut }, tz, now) : null;
  const past = p.timeline.filter((t) => !t.ahead);
  const thin = p.threads === 0 && p.deals.length === 0 && past.length < 6;
  const visitsSeen = p.timeline.filter((t) => t.kind === "visit").length;
  const sent = reachOut ? reachOut.sends.filter((x) => !!x.sent_at).length : 0;
  const figures = personFiguresOf({
    thin,
    last: p.lastContact.ts !== null ? { value: clockDate(p.lastContact.ts, tz, nowMs), sub: p.lastContact.by } : null,
    lead: business ? { stage: business.stage.word, since: business.stage.note } : null,
    deals: {
      count: p.openDeals.length,
      recorded: recordedOf(p.openDeals),
    },
    step: p.nextStep ? { day: p.nextStep.day.near, words: p.nextStep.words } : null,
    calls: { count: p.calls, minutes: callLength(p.callSeconds) },
    visits: {
      ahead: p.comingUp.length,
      marked: 0,
      any: p.calendar === "ok" && (p.comingUp.length > 0 || visitsSeen > 0),
    },
    emails: reachOut ? { out: sent, back: reachOut.readings.filter((r) => !r.undone).length } : null,
  });
  const tabFacts = {
    id: p.id,
    history: past.length,
    visits: visitsSeen,
    deals: p.deals.length,
    campaigns: p.campaigns.length,
    thin,
  };
  return {
    head,
    worksAtRow: worksAtOf(p.worksAt, d.business ?? null, tz, nowMs),
    business,
    thin,
    figures,
    next: personNextFor({ ...p, business }, p, tz, nowMs),
    notices: personNoticesOf({
      head,
      business,
      doubts: p.doubts,
      email: p.email,
      heardFrom: p.askedMs !== null,
      peopleHere: (d.business?.people ?? [])
        .filter((x) => x.id !== p.id)
        .map((x) => ({ id: x.id, name: personName(x), email: x.email, nameSource: x.name_source })),
    }),
    lastWords: lastWordsOf(past),
    tabs: { desk: personTabsOf(tabFacts, false), phone: personTabsOf(tabFacts, true) },
  };
}

/**
 * The runs that named a person, newest first, each with what became of it: sent, and answered by the run report's own
 * rule (isReplyTo) in the thread the message went to; held back, in the owner's words for why (HELD_REASONS); or not
 * sent. A person's page said nothing about what a playbook or a broadcast had sent them.
 */
function campaignsOf(d: PersonDetailDto, tz: string, nowMs: number): PersonCampaignVM[] {
  const threadOf = new Map<string, string>();
  const repliesIn = new Map<string, string[]>();
  for (const c of d.conversations) {
    for (const m of c.messages) {
      threadOf.set(m.id, c.id);
      // A reply is their own words, as a run's page counts it (isTheirOwnWords): not a call's note, not their mailbox.
      if (isTheirOwnWords(m)) repliesIn.set(c.id, [...(repliesIn.get(c.id) ?? []), m.created_at]);
    }
  }
  return (d.campaigns ?? []).map((c) => {
    const at = ts(c.sent_at ?? c.scheduled_for);
    const thread = c.message_id ? threadOf.get(c.message_id) : undefined;
    const sentAt = c.sent_at;
    const replied =
      c.state === "sent" && !!sentAt && !!thread && (repliesIn.get(thread) ?? []).some((x) => isReplyTo(sentAt, x));
    const why = c.reason ? HELD_REASONS[c.reason] : undefined;
    const outcome =
      c.state === "sent"
        ? replied
          ? "Replied"
          : "Sent"
        : c.state === "skipped"
          ? `Held — ${why ?? "held back"}`
          : c.state === "failed"
            ? why
              ? `Didn't send — ${why}`
              : "Didn't send"
            : "Waiting to send";
    return {
      id: c.broadcast_id,
      kind: c.playbook_id ? "playbook" : "broadcast",
      title: c.playbook_id ? c.playbook_name || c.name : c.name,
      when: at !== null ? clockDate(at, tz, nowMs) : "—",
      outcome,
      // Which wire it went by, or would have: a person on three channels is not told "Sent" with nowhere to look.
      line: `${c.playbook_id ? "Campaign" : "Broadcast"} · ${THREAD_CHANNEL_WORDS[writtenChannelOf(c.channel)]} · ${outcome}`,
      tone: replied ? "ok" : c.state === "skipped" || c.state === "failed" ? "warn" : "plain",
      to: addressOf({ kind: "send", id: c.broadcast_id }),
    };
  });
}
