/** Person profile: timeline. */

import { appointmentWords, type AppointmentWord } from "../../journey/appointment-word";
import { DEAL_ACT_WORDS } from "../../deals/words";
import type { DealVM } from "../../deals/vm";
import { type DealPaceVM } from "../../deals/waits";
import type { PersonCampaignVM, PersonDetailDto, PersonSequenceVM } from "../person-dto";
import { MERGE_WORDS } from "../person-merge";
import { DOUBT_WORDS, type DoubtSeen } from "../person-doubts";
import { personName } from "../person-name";
import { MAILBOX_SENDERS_WORDS } from "../../email/mailbox-senders";
import { formatPhoneDisplay } from "../../shared/phone";
import type { PersonMode } from "../person-receptionist";
import { DM_CLOSED, mayReach, type PersonProposalVM } from "../person-reach";
import type { PersonRowVM } from "../person-row/row-facts";
import { ts } from "../person-helpers";
import { type PersonNoteTeamDto, type PersonNoteVM } from "../../notes/person-notes";
import { PERSON_CHANNEL_WORDS, REPLY_WIRE, type PersonChannel } from "../person-words";
import { signupAskOf } from "../doors/signup-confirm";
import { wayOff, type WriteWay } from "../../new-conversation/write-ways";
import { messageAt } from "../../conversations/thread-dto";
import {
  type PersonAboutFact,
  type PersonFact,
  type PersonLastExchange,
  type PersonRightNow,
} from "../person-cards/right-now";
import { type PersonTimelineItemVM, type PersonVisitAheadVM, type TimelineKind } from "../person-timeline";
import { type BusinessRecordVM, type PersonHeadVM, type WorksAtVM } from "../person-page/business";
import { type PersonFigureVM } from "../person-page/figures";
import { type UpNextVM } from "../person-page/next";
import { type LastWordVM } from "../person-page/last-words";
import { type NoticeVM } from "../person-page/notices";
import { type PersonTabVM } from "../person-page/route";
import { type PersonVisitsVM } from "../person-page/visits";
import { WORKS_AT_WORDS } from "../person-page/words";

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
 * A filter's heading in the workspace's words: the appointments' is the workspace's word for one ("Meetings",
 * "Sessions", as Campaigns says it: decision 0041), the others their own.
 */
export function timelineFilterLabel(fields: { id: TimelineFilterId; label: string }, word: AppointmentWord): string {
  return fields.id === "visits" ? appointmentWords(word).Many : fields.label;
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
  /**
   * Their visits as the Visits tab draws them: kept, missed, how often, to mark, ahead and past, each from the calendar
   * and the record (never a count the schema does not hold).
   */
  visitTab: PersonVisitsVM;
  about: PersonAboutFact[];
  /** Their notes (0007): the receptionist's suggestions first, then newest first. */
  noteList: PersonNoteVM[];
  /** The team a note can be for; empty where the team could not be read. */
  noteTeam: PersonNoteTeamDto[];
  /** The workspace's booking link, or null when none is on file. */
  bookingLink: string | null;
  /**
   * Their proposal (proposalLinkOf, 0008): the link on their deal while it is a proposal out; for any other deal, none;
   * with no deal at all, the one on the person (00154) while it is still read. Null when none is on file.
   */
  proposal: PersonProposalVM | null;
  /** The send-the-proposal button's words for the wire a reply goes out on (proposalAction); `ready` false hides it. */
  proposalAction: { label: string; title: string; ready: boolean };
  /** Their deals, newest first, as the page says them (0004). */
  deals: DealVM[];
  /** What the workspace calls an appointment (the person's read's appointment_word): every part of the page says it. */
  word: AppointmentWord;
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
  /** The runs that named them, newest first, each with what became of it; and the sequences they are in now (0060). */
  campaigns: PersonCampaignVM[];
  inSequences: PersonSequenceVM[];
  /** The lead they were found as, with the door to it on Leads; null when they were never one. */
  lead: { id: string; name: string; found: string; to: string } | null;
  /**
   * Why a member may not record their yes (decision 19, widened by 0052): they came from a lead, or work at one, and both
   * consent doors refuse a yes a member records for them; the sentence is the doors' own (LEAD_CONSENT_REFUSAL), the
   * disabled Yes's caption. Null for anyone else.
   */
  yesLocked: string | null;
  /**
   * Their website sign-up's confirmation while offers by email wait on it, and whether a member may ask (again)
   * (signup-confirm.ts signupAskOf); null with nothing to say.
   */
  signupAsk: ReturnType<typeof signupAskOf>;
  /** They asked for a call back and it is still open (callBackWaits): the call sheet asks whether a call was it (X3-1). */
  callBackOpen: boolean;
  /**
   * How a message can go to them now, wire by wire (writeWaysOf): the New conversation sheet's own answer, drawn on More
   * before anything opens. The workspace's lines are judged only where the page read them (People's ChannelsReady).
   */
  ways: WriteWay[];
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
  /** Reach them's lines under the number and the address: what each is and where it came from (reachRowsOf). */
  reach: { phone: string; email: string };
  /** Where they came from, in one line (personOriginOf); null where nothing says. */
  origin: string | null;
  /** What another system said of them before Chanlytics, in one line (personBeforeOf); null where none did. */
  before: string | null;
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
export function doubtsOf(personDetail: PersonDetailDto): PersonDoubtVM[] {
  return (personDetail.doubts ?? []).map((item) => {
    const other = personName(item.other);
    return {
      id: item.id,
      otherId: item.other.id,
      other,
      phone: item.other.phone_e164 ? formatPhoneDisplay(item.other.phone_e164) : null,
      email: item.other.email,
      seen: item.seen,
      sentence: DOUBT_WORDS.seen[item.seen](other),
    };
  });
}

/**
 * One act in a person's More menu: a few words, the line said on hover where the act needs explaining, the group it
 * sits in (a way to reach them, a thing to record, the ends: a line between groups), who may press it ("any" reader, one
 * who may "record", or the "owner"), and why it cannot go now (`off`), so it is drawn and said, never hidden. The page
 * draws them; which exist, and their words, are here.
 */
export interface PersonActVM {
  id:
    | "call"
    | "text"
    | "email"
    | "booking"
    | "proposal"
    | "start-proposal"
    | "add-to-list"
    | "copy-phone"
    | "copy-email"
    | "leave-business"
    | "download"
    | "merge"
    | "not-a-person"
    | "delete";
  label: string;
  hint: string | null;
  group: "reach" | "record" | "delete";
  needs: "any" | "record" | "owner";
  /** Why it cannot go: drawn disabled with this as its line, and said once under its group. Null when it can. */
  off: string | null;
  danger?: boolean;
}

/** The words of More's own acts (canvas A, 3422-3434). */
export const PERSON_ACT_WORDS = {
  call: "Call",
  callHint: "From your own phone",
  text: "Text them",
  email: "Email them",
  booking: "Send booking link",
  startProposal: "Start a proposal",
  addToList: "Add to a list",
  copyPhone: "Copy the number",
  copyEmail: "Copy the address",
  deletePerson: "Delete person…",
  /**
   * A sender of automated mail made a person (00483): the act of its own, where it rode Delete person alone and the live
   * walk never found it (27 Oct 2026). It opens the same question with the switch on.
   */
  notAPerson: MAILBOX_SENDERS_WORDS.act,
  notAPersonHint: MAILBOX_SENDERS_WORDS.actHint,
  /** Their own copy (R14 X5): everything kept about them, for when they ask what the business holds. */
  download: "Download their records",
  downloadHint: "Everything kept about them, in one file: for when they ask what you hold",
  /** Why a send into their thread cannot go: there is none (a wire's own reasons are the sheet's, writeWaysOf). */
  noThread: "No conversation with them yet.",
  ready: (on: string) => `Opens their thread with it ready to send${on}`,
} as const;

/**
 * Delete person… (owner only): the sheet's name, what it does, its question with the typed name that gates it, and the
 * toast after. The database's door erases; nothing here can be undone.
 */
export const PERSON_DELETE_WORDS = {
  title: "Delete person",
  detail:
    "Removes their messages, media and recordings from Chanlytics and stops any reply still queued. This cannot be undone.",
  // The foot's question: the sheet's title asks what is done (title), so the foot asks only for the name.
  typed: (name: string) => `Type ${name} to confirm.`,
  yes: "Delete this person",
  busy: "Deleting…",
  cancel: "Cancel",
  failed: "Could not delete this person.",
  done: (name: string) => `${name} deleted: their messages, media and recordings are gone`,
} as const;

/**
 * Why a send into their thread cannot go now: there is no thread, else the reply wire's own reason (writeWaysOf, the
 * sheet's words); null when it can. Text them and Email them ask their wire's way directly (wayOff).
 */
function threadOff(p: Omit<PersonVM, "acts" | PersonPageKeys>): string | null {
  if (!p.openThread) return PERSON_ACT_WORDS.noThread;
  // A DM is no way a conversation begins: it goes into their thread while Instagram's day is open, and nothing goes after.
  if (p.replyVia === "Instagram") return p.replyWindow && !p.replyWindow.open ? DM_CLOSED : null;
  return p.replyVia ? wayOff(p.ways, REPLY_WIRE[p.replyVia]) : null;
}

/**
 * What can be done for a person from their page, besides opening their thread (the page's one primary act), in three
 * groups (canvas A, 3422-3434): reach them (Call where the head has none, Text them, Email them, the booking link and the
 * proposal's send), record (Start a proposal, Add to a list, the copies), and the ends (Not at this business, Merge,
 * Delete).
 *
 * A send opens their thread with the words ready; nothing is sent from the page. So it says so, in the wire it goes
 * on, and never names a template or a window: where WhatsApp takes only an approved message the thread offers it,
 * which is what its hover says. The labels are a few words each: with a sentence beside every one the menu was a
 * block of wrapped words cut off at its edge. A send that cannot reach them (they said stop, do-not-contact, an address
 * that stopped accepting mail: mayReach) is drawn and says why (`off`), and no call reaches someone on do-not-contact. A
 * call is the member's own phone ringing them (a tel: link), never the receptionist.
 */
export function personActs(person: Omit<PersonVM, "acts" | PersonPageKeys>): PersonActVM[] {
  const words = PERSON_ACT_WORDS;
  const acts: PersonActVM[] = [];
  const reach = mayReach(person);
  const off = threadOff(person);
  const on =
    person.replyVia === "Email"
      ? " by email"
      : person.replyVia === "Text"
        ? " as a text"
        : person.replyVia
          ? " on WhatsApp"
          : "";
  if (person.phone && !person.consent.dnc)
    acts.push({ id: "call", label: words.call, hint: words.callHint, group: "reach", needs: "any", off: null });
  // Text them and Email them are judged as the New conversation sheet judges them (writeWaysOf): its words, up front.
  if (person.phone)
    acts.push({
      id: "text",
      label: words.text,
      hint: null,
      group: "reach",
      needs: "record",
      off: wayOff(person.ways, "sms"),
    });
  if (person.email)
    acts.push({
      id: "email",
      label: words.email,
      hint: null,
      group: "reach",
      needs: "record",
      off: wayOff(person.ways, "email"),
    });
  if (person.bookingLink && person.bookingLinkAction.offered)
    acts.push({
      id: "booking",
      label: words.booking,
      hint: reach && person.bookingLinkAction.ready ? words.ready(on) : person.bookingLinkAction.title,
      group: "reach",
      needs: "record",
      off,
    });
  // A proposal is a deal's (0008). Its first send is the deal card's next act (deal-sheet.ts dealNextAct), and no send
  // is offered while one is on its way, so the menu offers only a send the card does not: the link again once it went,
  // or a link left on someone with no deal.
  const cardSends = person.deal?.stage === "proposed" && (!person.proposal?.sent || !!person.deal.proposal?.sending);
  if (reach && person.proposal && person.proposalAction.ready && !cardSends)
    acts.push({
      id: "proposal",
      label: person.proposal.sent ? `${DEAL_ACT_WORDS.send} again` : DEAL_ACT_WORDS.send,
      hint: words.ready(on),
      group: "reach",
      needs: "record",
      off,
    });
  // Every workspace may start one (0008, amended 18 Oct 2026): the act is in the menu, never a nudge on the page.
  acts.push({
    id: "start-proposal",
    label: words.startProposal,
    hint: null,
    group: "record",
    needs: "record",
    off: null,
  });
  acts.push({ id: "add-to-list", label: words.addToList, hint: null, group: "record", needs: "record", off: null });
  if (person.phone)
    acts.push({ id: "copy-phone", label: words.copyPhone, hint: null, group: "record", needs: "any", off: null });
  if (person.email)
    acts.push({ id: "copy-email", label: words.copyEmail, hint: null, group: "record", needs: "any", off: null });
  // The business they work at, while it stands: the link undone, the business keeping its history (0052).
  if (person.worksAt && !person.worksAt.gone)
    acts.push({
      id: "leave-business",
      label: WORKS_AT_WORDS.leave,
      hint: WORKS_AT_WORDS.leaveHint,
      group: "delete",
      needs: "record",
      off: null,
    });
  // Their own copy (R14 X5): the owner's, as the workspace's is, and with Delete, as Settings keeps the two together.
  acts.push({
    id: "download",
    label: words.download,
    hint: words.downloadHint,
    group: "delete",
    needs: "owner",
    off: null,
  });
  // Two records of one person become one (0028): the owner's, as Delete is, and beside it.
  acts.push({
    id: "merge",
    label: MERGE_WORDS.act,
    hint: MERGE_WORDS.actHint,
    group: "delete",
    needs: "owner",
    off: null,
  });
  // An address that writes automated mail: said so, and deleted (00483). Only where there is an address to sort.
  if (person.email)
    acts.push({
      id: "not-a-person",
      label: words.notAPerson,
      hint: words.notAPersonHint,
      group: "delete",
      needs: "owner",
      off: null,
      danger: true,
    });
  acts.push({
    id: "delete",
    label: words.deletePerson,
    hint: null,
    group: "delete",
    needs: "owner",
    off: null,
    danger: true,
  });
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
export function ownMessagesOf(
  personDetail: PersonDetailDto,
  stamp: (t: number) => { time: string; day: string },
): OwnMessageVM[] {
  const found: { t: number; vm: OwnMessageVM }[] = [];
  for (const conversation of personDetail.conversations) {
    for (const message of conversation.messages) {
      if (
        message.direction !== "inbound" ||
        message.sender !== "customer" ||
        message.channel === "voice" ||
        message.channel === "system"
      )
        continue;
      const sentence = [message.body, message.media?.caption]
        .map((s) => (s ?? "").replace(/\s+/g, " ").trim())
        .find(Boolean);
      const result = ts(messageAt(message));
      if (!sentence || result === null) continue;
      const chars = Array.from(sentence);
      const at = stamp(result);
      found.push({
        t: result,
        vm: {
          id: message.id,
          words: chars.length > EVIDENCE_WORDS ? `${chars.slice(0, EVIDENCE_WORDS).join("")}…` : sentence,
          via: PERSON_CHANNEL_WORDS[message.channel as PersonChannel] ?? "",
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

/** The keys the person page's own parts add (decision 0052, canvas A), built last over the rest. */
export type PersonPageKeys =
  | "head"
  | "worksAtRow"
  | "business"
  | "thin"
  | "figures"
  | "next"
  | "notices"
  | "lastWords"
  | "tabs"
  | "reach"
  | "origin"
  | "before";
