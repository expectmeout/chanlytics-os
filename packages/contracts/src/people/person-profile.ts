/**
 * A person's page: the timeline's filters, the acts, their own messages, the runs that named them, and the whole
 * page's view model (toPersonVM), composed one card at a time from person-cards.ts (the context computed once, and a
 * builder per card) and person-timeline.ts (a builder per source). Moved whole from people.ts (Reach out Part 2.5);
 * exported from index.ts directly, since it reads people.ts's row view model.
 */
import { clockDate } from "../shared/clock";
import { plural } from "../shared/words";
import { DEAL_ACT_WORDS, dealPaceOf, type DealPaceVM, type DealVM } from "../deals/deals";
import {
  mayReach,
  type PersonCampaignVM,
  type PersonDetailDto,
  type PersonMode,
  type PersonProposalVM,
  type PersonRowVM,
  proposalAction,
} from "./people";
import { ts } from "./person-helpers";
import { personNotesVM, type PersonNoteTeamDto, type PersonNoteVM } from "../notes/person-notes";
import { PERSON_CHANNEL_WORDS, type PersonChannel } from "./person-words";
import { HELD_REASONS, isReplyTo } from "../broadcasts/run-words";
import { messageAt } from "../conversations/thread-dto";
import {
  aboutOf,
  personFactsOf,
  lastExchangeOf,
  leadOf,
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
  { id: "messages", label: "Messages", kinds: ["customer", "receptionist", "you", "escalation", "decision"] },
  { id: "calls", label: "Calls", kinds: ["call"] },
  { id: "visits", label: "Visits", kinds: ["visit"] },
  { id: "consent", label: "Consent", kinds: ["consent"] },
  { id: "deals", label: "Deals", kinds: ["deal"] },
];

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
  about: { k: string; v: string }[];
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
  /** What the page's More menu offers for them, in order (personActs): the page keeps those its reader's role allows. */
  acts: PersonActVM[];
}

/**
 * One act in a person's More menu: a few words, the line said on hover where the act needs explaining, the group it
 * sits in (a send, a way to reach them, the delete: a line between groups), and who may press it ("any" reader, one
 * who may "record", or the "owner"). The page draws them; which exist, and their words, are here.
 */
export interface PersonActVM {
  id: "booking" | "proposal" | "call" | "copy-phone" | "copy-email" | "delete";
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
 * block of wrapped words cut off at its edge. No send reaches someone who said stop or is on do-not-contact, and no call reaches
 * someone on do-not-contact. A call is the member's own phone ringing them (a tel: link), never the receptionist.
 */
export function personActs(p: Omit<PersonVM, "acts">): PersonActVM[] {
  const acts: PersonActVM[] = [];
  const reach = mayReach(p);
  const on =
    p.replyVia === "Email" ? " by email" : p.replyVia === "Text" ? " as a text" : p.replyVia ? " on WhatsApp" : "";
  const ready = `Opens their thread with it ready to send${on}`;
  if (reach && p.bookingLink)
    acts.push({
      id: "booking",
      label: "Send booking link",
      hint: p.bookingLinkAction.ready
        ? ready
        : "Only an approved message reaches them until they write again; their thread offers the one with the link",
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
): PersonVM {
  const ctx = personCardContext(d, tz, now, viewerId);
  const { base, nowMs, dealsOn, reply } = ctx;
  const vm: Omit<PersonVM, "proposal" | "proposalAction" | "acts"> = {
    ...base,
    ...(reply ? replyFields(reply) : {}),
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
    proposalAction: proposalAction(vm.replyVia ?? null, vm.replyWindow ?? null, ctx.sentWords),
  };
  return { ...whole, acts: personActs(whole) };
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
      if (m.direction === "inbound") repliesIn.set(c.id, [...(repliesIn.get(c.id) ?? []), m.created_at]);
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
      line: `${c.playbook_id ? "Playbook" : "Broadcast"} · ${outcome}`,
      tone: replied ? "ok" : c.state === "skipped" || c.state === "failed" ? "warn" : "plain",
      to: `broadcasts/run:${c.broadcast_id}`,
    };
  });
}
