/**
 * One sheet for every deal move, and the deal where the work is (0008).
 *
 * The deal sheet (legacy components/deal-sheet.jsx) is the only place a deal is created or moved: a new proposal, the
 * proposal edited, a passed one proposed again, a yes, a pass, an end. Everything it says is here -- each mode's
 * title, fields, words and defaults (dealSheetFor), the body the deal route takes (dealSheetBody), the field a refusal
 * names (dealSheetRefusal), and whether the proposal can go now (dealSendOf) -- so the sheet says nothing of its own.
 * So is the person page's deal card (dealCardsOf): its steps, its line, its one next act (dealNextAct) and the quiet
 * line where no deal is open; and the thread's Deal group (dealMenuActs). Pure.
 */
import { foldName } from "../calendar/availability";
import { visitDay } from "../calendar/calendar-people";
import { clockDate, wallClockAt, zoneDayKey } from "../shared/clock";
import { isRealDate } from "../config/workspace-config/config-schema";
import {
  DEAL_ACT_WORDS,
  DEAL_LINE_NONE,
  DEAL_LOST_REASONS,
  DEAL_LOST_REASON_WORDS,
  DEAL_PERS,
  DEAL_PER_WORDS,
  DEAL_REFUSALS,
  DEAL_STAGE_WORDS,
  amountWords,
  consultServiceOf,
  consultationsWithoutProposal,
  noProposalSince,
  parseAmount,
  waitingOnProposal,
  type DealActId,
  type DealPaceVM,
  type DealClearable,
  type DealLostReason,
  type DealPer,
  type DealStage,
  type DealVM,
} from "./deals";
import { normalizeLink, whyNotALink } from "../shared/link";
import { mayReach, proposalAction, proposalMessage, type PersonNoteVM } from "../people/people";
import type { StepDayVM } from "../notes/steps";
import { stateTone, type Tone } from "../shell/tone";
import { followUpWords, type FollowUpStand } from "../playbooks/playbooks";

/** What the sheet is opened to do: a new proposal, the proposal edited, a passed one again, a yes, a pass, an end. */
export const DEAL_SHEET_MODES = ["propose", "edit", "again", "won", "lost", "ended"] as const;
export type DealSheetMode = (typeof DEAL_SHEET_MODES)[number];

export function isDealSheetMode(s: unknown): s is DealSheetMode {
  return typeof s === "string" && (DEAL_SHEET_MODES as readonly string[]).includes(s);
}

/**
 * What the sheet, the card and the thread's Deal group read of a person: the person view model's own fields
 * (people.ts PersonVM), so the page hands over what it already holds.
 */
export interface DealPerson {
  name: string;
  /** Their notes as the page says them (personNotesVM): a step that names a deal is that deal's next step. */
  noteList?: readonly Pick<PersonNoteVM, "id" | "version" | "body" | "step" | "dealId" | "forWho" | "mine">[];
  /** The profile's service names: the sheet asks which only past one. */
  services?: readonly string[];
  /** The deal the page shows (pickCurrentDeal's). */
  deal: DealVM | null;
  /** Every deal on them, newest first. */
  deals?: readonly DealVM[];
  /** The workspace's pace, read with the person (dealPaceOf): when their proposal waits, and what its card says. */
  dealPace: DealPaceVM | null;
  /**
   * Where they stand with the proposal follow-up (0006, playbooks followUpStandOf), from People's row where one runs:
   * their current deal's card says when its run goes, and leads with no nudge of its own. Absent elsewhere.
   */
  followUp?: FollowUpStand | null;
  replyVia: "WhatsApp" | "Text" | "Email" | null;
  replyWindow: { open: boolean; hoursLeft: number } | null;
  consent: { state: string; dnc: boolean };
  /** "inbox/th-…", or null for someone with no conversation. */
  openThread: string | null;
  /** Their proposal (proposalLinkOf): with no deal at all, the link left on the person (00154). */
  proposal?: { url: string; sent?: { at: string; via: string | null } | null } | null;
  /** What they have written, newest first: the messages a yes may be recorded in. */
  ownMessages?: readonly { id: string; words: string; via: string; when: string }[];
  /** When they last wrote or called. */
  askedMs?: number | null;
  /** When their last visit ended, when it was a consultation. */
  consultedMs?: number | null;
  /** Their next or last visit is a consultation. */
  consultationVisit?: boolean;
  /** That consultation's title, as the calendar says it: the service it names draws the Consultation step. */
  consultationTitle?: string | null;
  /** The services that need a consultation first (PersonVM.consultFirst): which one the consultation was for. */
  consultFirst?: readonly string[];
}

/* --------------------------------------------- the send ----------------------------------------------------- */

/** Why the proposal cannot go now, one sentence each (0008). */
export const DEAL_SEND_WHY = {
  window: "Their WhatsApp window has closed. Record it now, and send it from their thread when they write next.",
  stopped: "They asked not to be messaged.",
  none: "There is no conversation with them yet.",
} as const;

/**
 * Whether the proposal can go now (`can`), whether they can be reached at all (`reach`: their thread offers an
 * approved message where free text cannot go), why not, and the switch's words by the wire a reply goes out on.
 */
export interface DealSend {
  can: boolean;
  reach: boolean;
  why: string | null;
  label: string;
}

/**
 * The one rule for sending a proposal from the sheet or the card: someone the page may reach (people.ts mayReach: a
 * conversation, no stop, no do-not-contact), and free text allowed on their wire (proposalAction's `ready`:
 * WhatsApp's window open, or email or a text). Where it cannot go the sheet still records the proposal and says why
 * here.
 */
export function dealSendOf(p: Pick<DealPerson, "consent" | "openThread" | "replyVia" | "replyWindow">): DealSend {
  const on = p.replyVia === "Email" ? "by email" : p.replyVia === "Text" ? "as a text" : "on WhatsApp";
  const label = `Send it now ${on}`;
  const reach = mayReach(p);
  if (!reach) {
    const stopped = p.consent.state === "opted_out" || p.consent.dnc;
    return { can: false, reach, why: stopped ? DEAL_SEND_WHY.stopped : DEAL_SEND_WHY.none, label };
  }
  if (!proposalAction(p.replyVia, p.replyWindow, null).ready)
    return { can: false, reach, why: DEAL_SEND_WHY.window, label };
  return { can: true, reach, why: null, label };
}

/** The words a follow-up carries into the composer, once the proposal waited with nothing back (waitingOnProposal). */
export function proposalFollowUp(url: string): string {
  return `Just checking the proposal reached you. Here it is again: ${url}`;
}

/* --------------------------------------------- the acts ----------------------------------------------------- */

/** What an act does, said on hover where it needs saying. Its label is DEAL_ACT_WORDS' (deals.ts). */
export const DEAL_ACT_HINTS = {
  /** A send where only an approved message can go: it opens their thread, which offers those. */
  approved: "Only an approved message reaches them until they write again; their thread offers those",
} as const;

export interface DealAct {
  id: DealActId;
  label: string;
  /** The sheet's mode it opens; null for a send, which opens the thread, with `text` in the box where it can go. */
  mode: DealSheetMode | null;
  /** The words a send carries into the composer; none where only an approved message can go. */
  text?: string;
  /** What it does, on hover. */
  hint?: string;
  /** A new proposal's service: the one the consultation before it was for. Absent where none is named. */
  service?: string;
}

const MODE_OF: Record<DealActId, DealSheetMode | null> = {
  propose: "propose",
  again: "again",
  edit: "edit",
  won: "won",
  lost: "lost",
  ended: "ended",
  send: null,
  "follow-up": null,
};

const act = (id: DealActId, extra: { text?: string; hint?: string; service?: string | null } = {}): DealAct => ({
  id,
  label: DEAL_ACT_WORDS[id],
  mode: MODE_OF[id],
  ...(extra.text !== undefined ? { text: extra.text } : {}),
  ...(extra.hint !== undefined ? { hint: extra.hint } : {}),
  ...(extra.service ? { service: extra.service } : {}),
});

/**
 * The consult-first service their consultation named: what a proposal started from it is for, by the Calendar's own
 * rule (deals.ts consultServiceOf), so a new proposal opens with it wherever it is started -- the card, the thread,
 * New proposal, a card dropped on the board. Null where the title names none, where no service needs a consultation,
 * and where they have that service open already, which the door would refuse (already_open).
 */
function consultedService(p: DealPerson): string | null {
  if (!p.consultationTitle) return null;
  const named = consultServiceOf(
    p.consultationTitle,
    (p.services ?? []).map((name) => ({ name })),
    { consult_first: p.consultFirst ?? [] },
  );
  const open = (p.deals ?? (p.deal ? [p.deal] : [])).some(
    (d) => d.service === named && (d.stage === "proposed" || d.stage === "won"),
  );
  return named && !open ? named : null;
}

/** Whether a deal's proposal went: the deal's own word for it on a person's page, else the person's for its link. */
function sentOf(p: DealPerson, deal: DealVM): { at: string; via: string | null } | null {
  const url = deal.proposal?.url ?? null;
  if (!url) return null;
  if (deal.proposal && deal.proposal.sent !== undefined) return deal.proposal.sent ?? null;
  return p.proposal && p.proposal.url === url ? (p.proposal.sent ?? null) : null;
}

/**
 * The deal card's one next act, by stage (0008). A proposal with no link: edit it, to give it one. One on its way out
 * (a send still in the seconds it can be undone): the yes, and no second send. A link that never went, to someone
 * the page may reach: send it. Sent, waiting with nothing back (past the workspace's pace, a week without one), to
 * someone it may reach: follow up. Either opens their
 * thread, with the words in the box where free text can go; where only an approved message can (WhatsApp's window
 * shut after a quiet week) it opens the thread with nothing in the box, and says so on hover. Otherwise the yes. A
 * client has none; a pass is proposed again; an end, or no deal at all, starts a proposal. `deal` is the card's (a
 * person may hold one open deal per service); the person's current one by default.
 */
/** The follow-up's standing, where it is of this deal: the person's current one, the one the follow-up names. */
function followUpOn(p: DealPerson, deal: DealVM): FollowUpStand | null {
  return deal === p.deal || (deal.id !== null && deal.id === p.deal?.id) ? (p.followUp ?? null) : null;
}

export function dealNextAct(p: DealPerson, nowMs: number, deal: DealVM | null = p.deal): DealAct | null {
  if (!deal || deal.stage === "ended") return act("propose", { service: consultedService(p) });
  if (deal.stage === "won") return null;
  if (deal.stage === "lost") return act("again");
  const url = deal.proposal?.url ?? null;
  if (!url) return act("edit");
  if (deal.proposal?.sending) return act("won");
  const send = dealSendOf(p);
  const sent = sentOf(p, deal);
  const words = (text: string) => (send.can ? { text } : { hint: DEAL_ACT_HINTS.approved });
  if (!sent && send.reach) return act("send", words(proposalMessage(url)));
  // The proposal follow-up has them in hand (0006): its run nudges them, and a second, by hand, would be two.
  if (
    sent &&
    send.reach &&
    followUpOn(p, deal)?.kind !== "will" &&
    waitingOnProposal({ deal, askedMs: p.askedMs ?? null }, nowMs, p.dealPace ?? null)
  )
    return act("follow-up", words(proposalFollowUp(url)));
  return act("won");
}

/**
 * The thread's Deal group (0008), by the stage of the person's current deal: none or ended, start a proposal; a
 * proposal out, send it, mark them a client, passed, edit it; a client, end the engagement; passed, propose again. The
 * send is the thread's own (its composer), offered only where its link can go.
 */
export function dealMenuActs(deal: Pick<DealVM, "stage"> | null | undefined): DealAct[] {
  if (!deal || deal.stage === "ended") return [act("propose")];
  if (deal.stage === "proposed") return [act("send"), act("won"), act("lost"), act("edit")];
  if (deal.stage === "won") return [act("ended")];
  return [act("again")];
}

/**
 * What an appointment's peek on the Calendar says of its person's deal (0008), from the People row the page holds: the
 * deal's stage beside their name, and, once a consultation is over with no proposal since (deals.ts noProposalSince),
 * the sheet's own act that starts one, for the service its title named. A new proposal always: a consultation after a
 * pass or an end began something new, as the card's quiet line says. Nothing where deals are off (the People surface's
 * `dealsOn`, dealsAreOn), where the appointment matched nobody, or where People does not hold them: a deal the page has
 * not read is not one it can say is missing.
 */
export interface CalendarPeekDealVM {
  /** Their deal's stage, for the one pill beside their name; null without a deal. */
  stage: DealStage | null;
  /** Once a consultation is over with no proposal since: the act (its words, the sheet's mode), whose, and for what. */
  start: { act: DealAct; personId: string; service: string | null } | null;
}

/** The appointment as the Calendar's view model carries it (CalendarBlockVM): who, a consultation or not, its end. */
interface PeekBlock {
  person: { id: string } | null;
  consultation: boolean;
  consultService: string | null;
  end: string;
}

/** The People surface, as far as the peek reads it: whether deals are on here, and each person's deal. */
interface PeekPeople {
  dealsOn?: boolean;
  rows?: ReadonlyArray<{ id: string; deal?: Pick<DealVM, "stage" | "sinceMs"> | null }>;
}

export function calendarPeekDeal(
  block: PeekBlock,
  people: PeekPeople | null | undefined,
  nowMs: number,
): CalendarPeekDealVM {
  const who = block.person;
  const row = who && people && people.dealsOn ? (people.rows ?? []).find((r) => r.id === who.id) : undefined;
  if (!who || !row) return { stage: null, start: null };
  const deal = row.deal ?? null;
  const endMs = Date.parse(block.end);
  const over = block.consultation && Number.isFinite(endMs) && endMs < nowMs;
  return {
    stage: deal ? deal.stage : null,
    start:
      over && noProposalSince(deal, endMs)
        ? { act: act("propose"), personId: who.id, service: block.consultService }
        : null,
  };
}

/* --------------------------------------------- the card ----------------------------------------------------- */

/** The words the person page's Deal section says beside what its view model derives. */
export const DEAL_CARD_WORDS = {
  title: "Deal",
  proposal: "Proposal",
  engagement: "Engagement",
  consultation: "Consultation",
  noLink: "No link",
  notSent: "Not sent yet",
  /** A message carrying the link is queued, in the seconds its send can be undone. */
  sending: "Sending",
  openLink: "Open the proposal in a new tab",
} as const;

/** One of the card's three quiet steps: what it is, the day it happened, and where the deal stands against it. */
export interface DealStepVM {
  key: "consultation" | "proposal" | "client";
  label: string;
  /** "Sep 22", by the business's calendar; null for a step not reached, or one Coming up already dates. */
  day: string | null;
  at: "done" | "current" | "ahead";
  /** The stage's own tone on the step it is at (tone.ts `deal`); null on the others. */
  tone: Tone | null;
}

/** One open deal, as the person page's card says it. */
export interface DealCardVM {
  id: string | null;
  stage: "proposed" | "won";
  /** The service, or "Proposal" / "Engagement" without one. */
  title: string;
  /** Its value in words ("$1,200", "$2,500 a month"); null without one. */
  value: string | null;
  steps: DealStepVM[];
  /** A proposal's link and where it lives; null for a client, or a proposal recorded without one. */
  link: { url: string; host: string } | null;
  /** The line beside the link, plain: whether it went ("No link" where there is none), and the day it stands until. */
  facts: string[];
  /**
   * What wants a look, each a state in its tone (the page draws a StatePill): the day it stood until, once it has
   * passed; "Nothing back in 8 days", once a proposal has waited past the workspace's pace, a week without one
   * (waitingOnProposal).
   */
  flags: { words: string; tone: Tone }[];
  /** The one act the card leads with (dealNextAct); null for a client. */
  next: DealAct | null;
  /** The other moves, quiet. */
  more: DealAct[];
  /** Its next step (0007, amended): the earliest open step that names it; null for none, and the card offers one. */
  step: DealCardStepVM | null;
}

/** A deal's next step, as its card says it: the words, the day, who it is for, and what its Done is sent with. */
export interface DealCardStepVM {
  id: string;
  version: number;
  words: string;
  day: StepDayVM;
  forWho: string | null;
  /** The reader wrote it, so the reader may change it. */
  mine: boolean;
}

/** Where no deal is open: one slim line, and the one act that fits it. */
export interface DealQuietVM {
  /** "No proposal yet", "Passed Sep 20 · Price", "Ended Sep 20". */
  words: string;
  /** "Consultation was Tue, Sep 22", when one ended in the last week with no proposal since. */
  sub: string | null;
  act: DealAct;
  /** The deal its act moves (a pass proposed again); null for a new proposal. */
  dealId: string | null;
  /** Whether the act is the next step nobody has taken: a consultation with no proposal after it. */
  primary: boolean;
}

export interface PersonDealsVM {
  cards: DealCardVM[];
  quiet: DealQuietVM | null;
}

/** "Sent Sep 15 on WhatsApp", "Sent Sep 15 by email", "Sent Sep 15 as a text". */
function sentWords(sent: { at: string; via: string | null }, tz: string, nowMs: number): string {
  const at = Date.parse(sent.at);
  const day = Number.isFinite(at) ? ` ${clockDate(at, tz, nowMs)}` : "";
  const on =
    sent.via === "WhatsApp"
      ? " on WhatsApp"
      : sent.via === "Email"
        ? " by email"
        : sent.via === "Text"
          ? " as a text"
          : "";
  return `Sent${day}${on}`;
}

/** "Consultation was Tue, Sep 22", or "was today", by the business's calendar. */
function consultationWas(atMs: number, tz: string, nowMs: number): string {
  const day = visitDay(atMs, tz, nowMs);
  return `${DEAL_CARD_WORDS.consultation} was ${day === "Today" ? "today" : day}`;
}

/** Whether a consultation's title names a service: the service's words, folded, in a row among the title's. */
function namesService(title: string, service: string): boolean {
  const words = (s: string) =>
    foldName(s)
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean);
  const said = words(title);
  const named = words(service);
  return named.length > 0 && said.some((_, i) => named.every((w, j) => said[i + j] === w));
}

/**
 * The open deal a consultation belongs to, the one card that draws the Consultation step: the deal whose service the
 * consultation's title names, else the newest. Null for someone with no consultation.
 */
function consultedDealOf(p: DealPerson, open: readonly DealVM[]): DealVM | null {
  if ((p.consultedMs ?? null) === null && !p.consultationVisit) return null;
  const title = p.consultationTitle ?? "";
  return (title && open.find((d) => !!d.service && namesService(title, d.service))) || open[0] || null;
}

function stepsOf(p: DealPerson, deal: DealVM, tz: string, nowMs: number, consultation: boolean): DealStepVM[] {
  const day = (ms: number | null) => (ms === null ? null : clockDate(ms, tz, nowMs));
  const won = deal.stage === "won";
  const tone = stateTone("deal", deal.stage);
  const steps: DealStepVM[] = [];
  // A consultation is a step only on the card of the deal it began: done once it ended, ahead while Coming up says
  // when.
  const consulted = p.consultedMs ?? null;
  if (consultation) {
    const done = consulted !== null && consulted <= nowMs;
    steps.push({
      key: "consultation",
      label: DEAL_CARD_WORDS.consultation,
      day: done ? day(consulted) : null,
      at: done ? "done" : "ahead",
      tone: null,
    });
  }
  steps.push({
    key: "proposal",
    label: DEAL_STAGE_WORDS.proposed,
    day: day(deal.proposedMs ?? (won ? null : deal.sinceMs)),
    at: won ? "done" : "current",
    tone: won ? null : tone,
  });
  steps.push({
    key: "client",
    label: DEAL_STAGE_WORDS.won,
    day: won ? day(deal.sinceMs) : null,
    at: won ? "current" : "ahead",
    tone: won ? tone : null,
  });
  return steps;
}

function cardOf(p: DealPerson, deal: DealVM, nowMs: number, tz: string, consultation: boolean): DealCardVM {
  const won = deal.stage === "won";
  const next = dealNextAct(p, nowMs, deal);
  const facts: string[] = [];
  const flags: DealCardVM["flags"] = [];
  if (!won) {
    const sent = sentOf(p, deal);
    facts.push(
      !deal.proposal
        ? DEAL_CARD_WORDS.noLink
        : deal.proposal.sending
          ? DEAL_CARD_WORDS.sending
          : sent
            ? sentWords(sent, tz, nowMs)
            : DEAL_CARD_WORDS.notSent,
    );
    if (deal.validUntil && !deal.validUntil.lapsed) facts.push(deal.validUntil.words);
    // How long this workspace's proposals usually take, once five are decided (0008, amended).
    if (p.dealPace) facts.push(p.dealPace.words);
    if (deal.validUntil?.lapsed) flags.push({ words: deal.validUntil.words, tone: "warn" });
    // Nothing back past the workspace's pace (a week without one): a proposal that went, or one recorded without a
    // link (it went some other way). A link that never went has not waited on anyone.
    if (
      (sent || !deal.proposal) &&
      waitingOnProposal({ deal, askedMs: p.askedMs ?? null }, nowMs, p.dealPace ?? null)
    ) {
      // Where the follow-up has them in hand (0006), the day its run goes, as their row on the Pipeline says it.
      const fu = followUpOn(p, deal);
      flags.push(
        fu?.kind === "will"
          ? { words: followUpWords(fu, tz, nowMs), tone: "info" }
          : { words: `Nothing back in ${deal.waitingDays ?? 0} days`, tone: "warn" },
      );
    }
  }
  const others: DealAct[] = won ? [act("ended")] : [act("won"), act("lost"), act("edit")];
  const nextMode = next ? next.mode : null;
  return {
    id: deal.id,
    stage: won ? "won" : "proposed",
    title: deal.service ?? (won ? DEAL_CARD_WORDS.engagement : DEAL_CARD_WORDS.proposal),
    value: deal.amount,
    steps: stepsOf(p, deal, tz, nowMs, consultation),
    link: !won && deal.proposal ? { url: deal.proposal.url, host: deal.proposal.host } : null,
    facts,
    flags,
    next,
    // Each move once: the one the card leads with is not said again among the quiet ones.
    more: others.filter((o) => o.mode !== nextMode),
    step: dealStepOf(p.noteList, deal.id),
  };
}

/**
 * A deal's next step (0007, amended): the earliest open step that names it, by its day and then as written, as
 * people_list picks a person's. A step that names no deal is the person's, said in their notes, never on a card.
 */
export function dealStepOf(notes: DealPerson["noteList"], dealId: string | null): DealCardStepVM | null {
  if (!dealId) return null;
  // The notes come newest first, so among steps due the same day the one written first sits later in the list.
  const open = (notes ?? [])
    .map((n, i) => ({ n, i, step: n.step }))
    .filter(
      (x): x is typeof x & { step: NonNullable<typeof x.step> } => x.n.dealId === dealId && !!x.step && !x.step.done,
    )
    .sort((a, b) => a.step.day.day.localeCompare(b.step.day.day) || b.i - a.i);
  const first = open[0];
  if (!first) return null;
  return {
    id: first.n.id,
    version: first.n.version,
    words: first.n.body,
    day: first.step.day,
    forWho: first.n.forWho,
    mine: first.n.mine,
  };
}

/** Where no deal is open: the most recent that closed, else none; and the consultation nobody has followed up. */
function quietOf(p: DealPerson, nowMs: number, tz: string): DealQuietVM {
  const deals = p.deals ?? (p.deal ? [p.deal] : []);
  const closed =
    [...deals]
      .filter((d) => d.stage === "lost" || d.stage === "ended")
      .sort((a, b) => (b.sinceMs ?? 0) - (a.sinceMs ?? 0))[0] ?? null;
  const consulted = p.consultedMs ?? null;
  const fresh =
    consulted !== null && consultationsWithoutProposal([{ consultedMs: consulted, deal: p.deal }], nowMs).length > 0;
  const sub = fresh && consulted !== null ? consultationWas(consulted, tz, nowMs) : null;
  if (!closed)
    return {
      words: DEAL_LINE_NONE,
      sub,
      act: act("propose", { service: consultedService(p) }),
      dealId: null,
      primary: fresh,
    };
  const day = closed.sinceMs === null ? null : clockDate(closed.sinceMs, tz, nowMs);
  const said =
    closed.stage === "lost"
      ? [closed.service, day ? `${DEAL_STAGE_WORDS.lost} ${day}` : DEAL_STAGE_WORDS.lost, closed.reason?.words ?? null]
      : [closed.service, day ? `${DEAL_STAGE_WORDS.ended} ${day}` : DEAL_STAGE_WORDS.ended];
  // A consultation since it closed began something new: a new proposal, not the passed one again.
  const again = !fresh && closed.stage === "lost";
  return {
    words: said.filter((x): x is string => !!x).join(" · "),
    sub,
    act: again ? act("again") : act("propose", { service: consultedService(p) }),
    dealId: again ? closed.id : null,
    primary: fresh,
  };
}

/**
 * The person page's Deal section (0008): one card per open deal (a proposal out, a client; one per service), newest
 * first, or, with none open, one quiet line. Say each fact once: an upcoming consultation is Coming up's, so it is
 * never said here, and a consultation is a step on one card only, the deal's it began (consultedDealOf).
 */
export function dealCardsOf(p: DealPerson, nowMs: number, tz: string): PersonDealsVM {
  const deals = p.deals ?? (p.deal ? [p.deal] : []);
  const open = deals.filter((d) => d.stage === "proposed" || d.stage === "won");
  if (!open.length) return { cards: [], quiet: quietOf(p, nowMs, tz) };
  const consulted = consultedDealOf(p, open);
  return { cards: open.map((d) => cardOf(p, d, nowMs, tz, d === consulted)), quiet: null };
}

/* --------------------------------------------- the sheet ---------------------------------------------------- */

/** Every word the sheet says. */
export const DEAL_SHEET_WORDS = {
  titles: {
    // Each move's sheet is titled by its act (DEAL_ACT_WORDS; deal-sheet.test.mjs holds them together). Written out:
    // a title read off another object would keep these words in every package that bundles contracts.
    propose: "New proposal",
    edit: "Edit proposal",
    again: "Propose again",
    won: "Mark as client",
    lost: "Mark as passed",
    ended: "End the engagement",
  } satisfies Record<DealSheetMode, string>,
  save: {
    propose: "Record",
    edit: "Save",
    again: "Record",
    won: "Mark as client",
    lost: "Record",
    ended: "End it",
  } satisfies Record<DealSheetMode, string>,
  withSend: "Record and send",
  saving: "Saving…",
  sending: "Sending…",
  service: { label: "Service", any: "Any service" },
  link: {
    label: "Proposal link",
    hint: "A Google Doc, a PDF or any page you would send them.",
    placeholder: "docs.example.com/proposal",
  },
  value: {
    label: "Value",
    hint: "Optional. Only you see it: the receptionist never says a figure.",
    placeholder: "2,500",
    per: "How often",
  },
  agreed: {
    label: "Agreed amount",
    hint: "Optional.",
    fromProposal: "The proposal's value, unless they agreed another.",
  },
  validUntil: { label: "Valid until", hint: "Optional." },
  when: { won: "When they said yes", lost: "When they passed", ended: "When it ended" },
  reason: { label: "Why they passed" },
  note: { label: "Note", hint: "Optional. Only your team sees it.", placeholder: "In their words, or yours" },
  how: {
    label: "How they said yes",
    none: "Not recorded",
    message: "In their own message",
    form: "Signed elsewhere",
    which: "Their message",
    where: "Where it was signed",
    wherePlaceholder: "DocuSign, Sep 20",
  },
  message: { label: "Message", hint: "Sent as written. It has to carry the link." },
  discard: {
    question: "Discard your changes?",
    detail: "Nothing here has been recorded.",
    yes: "Yes, discard",
    no: "Keep editing",
  },
  reading: "Reading…",
  gone: "This person is not in your workspace.",
  moved: "Their deal has moved on since this was opened. Close this and look again.",
  failed: "Could not record this.",
  /** The stage's word a recorded move is said in. */
  done: {
    propose: "Proposal out",
    edit: "Proposal saved",
    again: "Proposal out",
    won: "Client",
    lost: "Passed",
    ended: "Ended",
  } satisfies Record<DealSheetMode, string>,
  /** The send's own toast, after the name: its Undo stops the message, never the record. */
  sent: "proposal recorded and on its way",
  /** Before the reason a send was refused, after a good record. */
  notSent: "Recorded. It did not send:",
  /** A send refused before anything said why. */
  unsent: "Recorded. It did not send.",
  problems: {
    amount: "An amount is a number, like 2,500.",
    day: "Pick a day.",
    future: "Pick today or a day before it.",
    sendNeedsLink: "Add the link to send it, or turn sending off.",
    messageLink: "The message has to carry the link.",
    tooLong: "At most 200 characters.",
  },
} as const;

/** A field the sheet can draw. */
export type DealSheetField =
  "service" | "link" | "value" | "validUntil" | "when" | "reason" | "note" | "how" | "send" | "message";

/** What a person has typed and chosen in the sheet. */
export interface DealSheetDraft {
  service: string;
  link: string;
  value: string;
  per: DealPer;
  validUntil: string;
  when: string;
  reason: DealLostReason | "";
  note: string;
  how: "" | "customer_message" | "form";
  messageId: string;
  formNote: string;
  send: boolean;
  /** The send's words once the person changed them; null follows the link (proposalMessage). */
  message: string | null;
}

/** Most a note or a signed-elsewhere line may hold: the door's and the route's own cap. */
export const DEAL_NOTE_MAX = 200;

export interface DealSheetVM {
  mode: DealSheetMode;
  title: string;
  /** Who, and which of their deals: "Daniela Reyes · Ad management". */
  sub: string;
  /** The deal a move moves; null for a new proposal. */
  deal: DealVM | null;
  /** Said in place of the fields when the deal is no longer where it was when the sheet was opened for it. */
  blocked: string | null;
  service: { label: string; options: { value: string; label: string }[] } | null;
  link: { label: string; hint: string; placeholder: string } | null;
  value: {
    label: string;
    hint: string;
    placeholder: string;
    perLabel: string;
    pers: { value: DealPer; label: string }[];
  } | null;
  validUntil: { label: string; hint: string } | null;
  when: { label: string; max: string } | null;
  reason: { label: string; options: { value: DealLostReason; label: string }[] } | null;
  note: { label: string; hint: string; placeholder: string; max: number } | null;
  how: {
    label: string;
    options: { value: DealSheetDraft["how"]; label: string }[];
    which: string;
    messages: { value: string; label: string }[];
    where: string;
    wherePlaceholder: string;
    max: number;
  } | null;
  send: (DealSend & { message: { label: string; hint: string } }) | null;
  /** What the sheet opens with. */
  draft: DealSheetDraft;
  save: { label: string; withSend: string | null; saving: string; sending: string };
  /** The word a recorded move is said in. */
  done: string;
}

/** Where each mode may move a deal from: the stage its deal must be at. */
const MOVES_FROM: Record<Exclude<DealSheetMode, "propose">, DealStage> = {
  edit: "proposed",
  again: "lost",
  won: "proposed",
  lost: "proposed",
  ended: "won",
};
const STAGE_OF: Record<DealSheetMode, DealStage> = {
  propose: "proposed",
  edit: "proposed",
  again: "proposed",
  won: "won",
  lost: "lost",
  ended: "ended",
};

const DRAFT_EMPTY: DealSheetDraft = {
  service: "",
  link: "",
  value: "",
  per: "once",
  validUntil: "",
  when: "",
  reason: "",
  note: "",
  how: "",
  messageId: "",
  formNote: "",
  send: false,
  message: null,
};

const capital = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** The deal a move is about: the one it was opened for, else the person's current one. */
function targetOf(mode: DealSheetMode, p: DealPerson, dealId: string | null | undefined): DealVM | null {
  if (mode === "propose") return null;
  const deals = p.deals ?? (p.deal ? [p.deal] : []);
  if (dealId) return deals.find((d) => d.id === dealId) ?? (p.deal && p.deal.id === dealId ? p.deal : null);
  return p.deal;
}

/**
 * The sheet for a mode (0008): its title, the fields it draws with their words, and what it opens with. A new
 * proposal asks which service only where the profile lists two or more, takes the link left on a person with no deal
 * at all, and sends by default where it can; a passed one proposed again keeps its link and value and asks the day
 * again; an edit starts from the proposal as it stands; a yes starts from the proposal's value; a pass, an end and a
 * yes are dated today by the business's calendar. `target` names the deal a move is for (a person may hold one open
 * deal per service) and a new proposal's service.
 */
export function dealSheetFor(
  mode: DealSheetMode,
  p: DealPerson,
  nowMs: number,
  tz: string,
  target: { dealId?: string | null; service?: string | null } = {},
): DealSheetVM {
  const W = DEAL_SHEET_WORDS;
  const deal = targetOf(mode, p, target.dealId);
  const blocked = mode !== "propose" && (!deal || deal.stage !== MOVES_FROM[mode]) ? W.moved : null;
  const today = zoneDayKey(nowMs, tz);
  const proposing = mode === "propose" || mode === "again";
  const shapes = mode === "propose" || mode === "edit" || mode === "again";
  const dated = mode === "won" || mode === "lost" || mode === "ended";
  const send = proposing ? dealSendOf(p) : null;
  const services = p.services ?? [];
  const messages = (p.ownMessages ?? []).map((m) => ({
    value: m.id,
    label: [`“${m.words}”`, m.via, m.when].filter(Boolean).join(" · "),
  }));
  const pers = DEAL_PERS.map((x) => ({ value: x, label: capital(DEAL_PER_WORDS[x]) }));
  // The deal's amount as a box shows it ("$2,500", without how often: the sheet asks that apart); parseAmount reads
  // it back to the same cents.
  const valueOf = (deal && amountWords(deal.amountCents, null, deal.currency)) || "";
  const draft: DealSheetDraft = {
    ...DRAFT_EMPTY,
    ...(mode === "propose"
      ? {
          service: target.service?.trim() || consultedService(p) || "",
          // The link left on the person (00154) is theirs only with no deal at all (proposalLinkOf).
          link: !p.deal && p.proposal ? p.proposal.url : "",
        }
      : {}),
    ...(mode === "again" || mode === "edit"
      ? { link: deal?.proposal?.url ?? "", value: valueOf, per: deal?.per ?? "once" }
      : {}),
    ...(mode === "edit" ? { validUntil: deal?.validUntil?.day ?? "" } : {}),
    ...(mode === "won" ? { value: valueOf, per: deal?.per ?? "once", messageId: p.ownMessages?.[0]?.id ?? "" } : {}),
    ...(dated ? { when: today } : {}),
    ...(send ? { send: send.can } : {}),
  };
  const open = !blocked;
  return {
    mode,
    title: W.titles[mode],
    sub: [p.name, deal?.service ?? null].filter((x): x is string => !!x).join(" · "),
    deal,
    blocked,
    service:
      open && mode === "propose" && services.length > 1
        ? {
            label: W.service.label,
            options: [{ value: "", label: W.service.any }, ...services.map((s) => ({ value: s, label: s }))],
          }
        : null,
    link: open && shapes ? { ...W.link } : null,
    value:
      open && (shapes || mode === "won")
        ? {
            label: mode === "won" ? W.agreed.label : W.value.label,
            hint: mode === "won" ? (valueOf ? W.agreed.fromProposal : W.agreed.hint) : W.value.hint,
            placeholder: W.value.placeholder,
            perLabel: W.value.per,
            pers,
          }
        : null,
    validUntil: open && shapes ? { ...W.validUntil } : null,
    when: open && dated ? { label: W.when[mode as "won" | "lost" | "ended"], max: today } : null,
    reason:
      open && mode === "lost"
        ? {
            label: W.reason.label,
            options: DEAL_LOST_REASONS.map((r) => ({ value: r, label: DEAL_LOST_REASON_WORDS[r] })),
          }
        : null,
    note: open && mode === "lost" ? { ...W.note, max: DEAL_NOTE_MAX } : null,
    how:
      open && mode === "won"
        ? {
            label: W.how.label,
            options: [
              { value: "", label: W.how.none },
              ...(messages.length ? [{ value: "customer_message" as const, label: W.how.message }] : []),
              { value: "form", label: W.how.form },
            ],
            which: W.how.which,
            messages,
            where: W.how.where,
            wherePlaceholder: W.how.wherePlaceholder,
            max: DEAL_NOTE_MAX,
          }
        : null,
    send: open && send ? { ...send, message: { ...W.message } } : null,
    draft,
    save: {
      label: W.save[mode],
      withSend: proposing && send?.can ? W.withSend : null,
      saving: W.saving,
      sending: W.sending,
    },
    done: W.done[mode],
  };
}

/** The words a send carries: the person's own, once they changed them, else the proposal's sentence with the link. */
export function dealSheetMessage(draft: Pick<DealSheetDraft, "link" | "message">): string {
  if (draft.message !== null) return draft.message;
  const typed = draft.link.trim();
  return typed ? proposalMessage(normalizeLink(typed) ?? typed) : "";
}

/** Whether the person has changed anything the sheet opened with: what the registry asks before it is thrown away. */
export function dealSheetDirty(draft: DealSheetDraft, opened: DealSheetDraft): boolean {
  const keys = Object.keys(DRAFT_EMPTY) as (keyof DealSheetDraft)[];
  return (
    keys.some((k) => k !== "message" && draft[k] !== opened[k]) || dealSheetMessage(draft) !== dealSheetMessage(opened)
  );
}

/**
 * The draft once the person was read again with the sheet open (0008): a teammate's move since, or a held copy the
 * page painted first. What was changed here stays; every field left as it opened takes the fresh value, and the fresh
 * draft becomes what the sheet opened with, so a Save changes only what was typed here, and clears only what was
 * emptied here.
 */
export function dealSheetMerge(draft: DealSheetDraft, opened: DealSheetDraft, fresh: DealSheetDraft): DealSheetDraft {
  const keys = Object.keys(DRAFT_EMPTY) as (keyof DealSheetDraft)[];
  return keys.reduce<DealSheetDraft>((out, k) => (draft[k] === opened[k] ? out : { ...out, [k]: draft[k] }), {
    ...fresh,
  });
}

/** The route's body for a move (the deal route and window.__recordDeal's DealBody). */
export interface DealSheetBody {
  stage: DealStage;
  deal_id?: string;
  version?: number;
  service?: string;
  when?: string;
  amount_cents?: number;
  per?: DealPer;
  note?: string;
  message_id?: string;
  form_note?: string;
  proposal_url?: string;
  valid_until?: string;
  lost_reason?: DealLostReason;
  clear?: DealClearable[];
}

/** What is wrong, said under the field it names; null names none, and the sheet says it by its Save. */
export interface DealSheetProblem {
  field: DealSheetField | null;
  words: string;
}

export type DealSheetOutcome = { body: DealSheetBody; send: { text: string } | null } | { problem: DealSheetProblem };

/**
 * The body the deal route takes for what the sheet holds (0008), or what is wrong with it, under the field it names,
 * before a round trip. A new proposal names its service; a move names its row and the version the page saw. A move
 * keeps what it is not told, so `clear` names every field the person emptied: the link, the value, the valid-until
 * day. Amounts are read by parseAmount and links by normalizeLink (whyNotALink says what is wrong with one). A day
 * other than today is noon on it by the business's clock; today is now, so the record keeps the minute it was made.
 * `send` is the words to send once the record lands, when the switch is on and the person can be sent to; the
 * message must still carry the link, or "Sent" could never be read back from the thread.
 */
export function dealSheetBody(
  mode: DealSheetMode,
  draft: DealSheetDraft,
  deal: DealVM | null,
  opts: { tz: string; nowMs: number; canSend: boolean },
): DealSheetOutcome {
  const P = DEAL_SHEET_WORDS.problems;
  const problem = (field: DealSheetField | null, words: string): DealSheetOutcome => ({ problem: { field, words } });
  const moving = mode !== "propose";
  if (moving && !deal?.id) return problem(null, DEAL_SHEET_WORDS.moved);
  const body: DealSheetBody = { stage: STAGE_OF[mode] };
  if (moving && deal?.id) {
    body.deal_id = deal.id;
    if (deal.version !== null && deal.version !== undefined) body.version = deal.version;
  }
  const clear: DealClearable[] = [];

  // The value, where the mode asks for one: an emptied value clears what the deal held.
  const shapes = mode === "propose" || mode === "edit" || mode === "again";
  if (shapes || mode === "won") {
    const typed = draft.value.trim();
    if (typed) {
      const cents = parseAmount(typed);
      if (cents === null) return problem("value", P.amount);
      body.amount_cents = cents;
      body.per = draft.per;
    } else if (moving && deal?.amountCents !== null && deal?.amountCents !== undefined) clear.push("amount");
  }

  if (shapes) {
    const typed = draft.link.trim();
    let url: string | null = null;
    if (typed) {
      url = normalizeLink(typed);
      if (!url) return problem("link", whyNotALink(typed) ?? DEAL_REFUSALS.bad_link);
      body.proposal_url = url;
    } else if (moving && deal?.proposal) clear.push("proposal_url");
    if (draft.validUntil) {
      if (!isRealDate(draft.validUntil)) return problem("validUntil", P.day);
      body.valid_until = draft.validUntil;
    } else if (mode === "edit" && deal?.validUntil) clear.push("valid_until");
    if (mode === "propose" && draft.service.trim()) body.service = draft.service.trim();
    let send: { text: string } | null = null;
    if ((mode === "propose" || mode === "again") && draft.send && opts.canSend) {
      if (!url) return problem("link", P.sendNeedsLink);
      const text = dealSheetMessage(draft).trim();
      if (!text.includes(url)) return problem("message", P.messageLink);
      send = { text };
    }
    return { body: clear.length ? { ...body, clear } : body, send };
  }

  // A yes, a pass, an end: the day it happened, never one still to come.
  const today = zoneDayKey(opts.nowMs, opts.tz);
  if (!isRealDate(draft.when)) return problem("when", P.day);
  if (draft.when > today) return problem("when", P.future);
  if (draft.when !== today) body.when = new Date(wallClockAt(opts.tz, draft.when, 12, 0)).toISOString();
  if (mode === "won") {
    if (draft.how === "customer_message" && draft.messageId) body.message_id = draft.messageId;
    if (draft.how === "form" && draft.formNote.trim()) {
      if (draft.formNote.trim().length > DEAL_NOTE_MAX) return problem("how", P.tooLong);
      body.form_note = draft.formNote.trim();
    }
  }
  if (mode === "lost") {
    if (draft.reason) body.lost_reason = draft.reason;
    if (draft.note.trim()) {
      if (draft.note.trim().length > DEAL_NOTE_MAX) return problem("note", DEAL_REFUSALS.note_too_long);
      body.note = draft.note.trim();
    }
  }
  return { body: clear.length ? { ...body, clear } : body, send: null };
}

/** The field each refusal of the door is about (DEAL_REFUSALS). */
const REFUSAL_FIELD: Record<string, DealSheetField> = {
  bad_link: "link",
  bad_amount: "value",
  bad_per: "value",
  note_too_long: "note",
  service_too_long: "service",
  already_open: "service",
  bad_reason: "reason",
};

/**
 * A refusal the route answered, under the field it names: the route says the door's sentence (DEAL_REFUSALS), so the
 * sentence says which field. One the sheet cannot place (a deal moved since, an ended engagement) names none.
 */
export function dealSheetRefusal(message: string | null | undefined): DealSheetProblem {
  const words = (message ?? "").trim() || DEAL_SHEET_WORDS.failed;
  const code = Object.keys(DEAL_REFUSALS).find((k) => DEAL_REFUSALS[k] === words);
  return { field: (code && REFUSAL_FIELD[code]) || null, words };
}
