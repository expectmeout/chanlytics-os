/**
 * What can be done with a person's deal (0008): the modes the deal sheet opens in, what the sheet, the card and
 * the thread read of a person (DealPerson), whether the proposal can go now (dealSendOf), and each act with its
 * label: the card's next act, the thread's Deal group and the Calendar peek's. The card is deal-card.ts; the
 * sheet is deal-sheet.ts.
 */
import { DEAL_ACT_WORDS, type DealActId, type DealStage } from "../deal-words";
import type { DealVM } from "../deal-vm";
import { waitingOnProposal, type DealPaceVM } from "../deal-waits";
import { consultServiceOf, noProposalSince } from "../deal-consultations";
import { mayReach, proposalAction, proposalMessage } from "../../people/person-reach";
import type { PersonNoteVM } from "../../notes/person-notes";
import type { FollowUpStand } from "../../playbooks/playbooks";

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

export const act = (id: DealActId, extra: { text?: string; hint?: string; service?: string | null } = {}): DealAct => ({
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
export function consultedService(p: DealPerson): string | null {
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
export function sentOf(p: DealPerson, deal: DealVM): { at: string; via: string | null } | null {
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
export function followUpOn(p: DealPerson, deal: DealVM): FollowUpStand | null {
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
