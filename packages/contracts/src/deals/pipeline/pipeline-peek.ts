/**
 * The deal sheet over the Pipeline's rows (0008; the canvas "Pipeline deal sheet", 20 Oct 2026): what it says of a row
 * before the person is read (pipelinePeekOf: who, the deal's service and value, and the facts the row carries), how to
 * reach them once they are (pipelinePeekDetail), and the row's own deal as the sheet says it (pipelineSheetOf): its
 * steps in the row's tones, where it stands, the one act its foot leads with, the moves its caret holds, the question a
 * proposal waiting asks, and their other open deals. Every word is the deal card's, the person page's or
 * pipeline-words.ts's.
 */
import { isIdentifierName, shortName } from "../../conversations/thread-contact";
import { dealIsOpen } from "../deal-vm";
import type { DealVM } from "../deal-vm";
import { DEAL_STAGE_WORDS } from "../deal-words";
import { clockDate } from "../../shared/clock";
import { EMAIL_CANT_REACH, EMAIL_STOPPED_LINE, repliesWords } from "../../people/person-reach";
import type { PersonVM } from "../../people/person-profile";
import { act, consultedService, type DealAct, type DealPerson } from "../sheet/deal-acts";
import { DEAL_CARD_WORDS, consultationStepOf, dealCardsOf, type DealCardVM, type DealStepVM } from "../sheet/deal-card";
import type { PipelineChip, PipelineGroupKey, PipelineRowVM, PipelineStep } from "./pipeline-vm";
import { GROUP_WORDS, PIPELINE_WORDS } from "./pipeline-words";

/** One quiet fact under the deal: what is coming up, or a step of theirs no deal's card says. */
export interface PipelinePeekFact {
  id: "next" | "step";
  words: string;
}

/** The sheet's head and the facts the row carries: there the moment it opens, before the person is read. */
export interface PipelinePeekVM {
  id: string;
  name: string;
  initials: string;
  /** Whether the name is a number or an address, drawn in figures (isIdentifierName, the one test; the face is the kit's, by the same). */
  numeric: boolean;
  /** They asked to stop, or are on do-not-contact (the People row's `stopped`): the head says it beside the name. */
  stopped: boolean;
  /**
   * The deal under the name: its service and value ("Growth plan · $797 a month"), or "Consultation" for a row with no
   * deal yet. Where it stands is the steps' and the stand's to say, under it.
   */
  sub: string;
  /** The group the row is drawn in, which says what its sheet offers. */
  group: PipelineGroupKey;
  facts: PipelinePeekFact[];
  /** The deal the row stands for (0029: a person's each open deal is a row), what its acts move; null for a consultation. */
  dealId: string | null;
}

/**
 * What the sheet says of a row before the person is read: the head from the row alone, and the facts People's row
 * already carries, so the sheet stands the moment it opens and the deal fills in as the person lands. `deals` are the
 * person's own once they are read, which say which step a deal of theirs carries.
 */
export function pipelinePeekOf(
  row: PipelineRowVM,
  group: PipelineGroupKey,
  deals: readonly { id: string; stage: string }[] | null = null,
): PipelinePeekVM {
  const p = row.person;
  const facts: PipelinePeekFact[] = [];
  if (p.nextVisit) facts.push({ id: "next", words: `Coming up · ${p.nextVisit}` });
  // Their next step, said once. One that names an open deal of theirs is that deal's: the sheet draws its row's deal,
  // whose card says its earliest open step (dealStepOf), and this is theirs. A step about the person, or about a deal
  // that has closed, has no card to say it, so it is said here. Until the person is read, the row's own deal is the
  // one known.
  const n = row.next;
  const known = deals ?? (p.deal ? [p.deal] : []);
  const onCard = !!n?.dealId && known.some((d) => d.id === n.dealId && dealIsOpen(d));
  if (n && !onCard) facts.push({ id: "step", words: `${PIPELINE_WORDS.columns.next} · ${n.words} · ${n.when}` });
  const deal = [row.service, row.value].filter(Boolean).join(" · ");
  return {
    id: row.id,
    dealId: row.deal?.id ?? null,
    name: row.name,
    initials: p.initials,
    numeric: isIdentifierName(row.name),
    stopped: p.stopped,
    sub: deal || (group === "consultations" ? DEAL_CARD_WORDS.consultation : GROUP_WORDS[group]),
    group,
    facts,
  };
}

/** One way to reach them: what it is, the thing itself, and what a copy puts on the clipboard (null for nothing). */
export interface PipelinePeekReachVM {
  id: "phone" | "email" | "replies";
  label: string;
  words: string;
  /** A line under it in the warn ink: an address that stopped accepting mail. */
  warn: string | null;
  copy: string | null;
}

export interface PipelinePeekDetailVM {
  reach: PipelinePeekReachVM[];
}

/**
 * How to reach them once they are read (0008, "the row carries the deal"): the number and the address, each with its
 * Copy, and what a reply may be now (repliesWords, the person page's own sentence). Calling them is the foot's (the
 * person page's Call, which rings and asks how it went), never a link here. Each fact once: an address that stopped
 * accepting mail says so under itself, in the warn ink, and Replies says it again for nobody.
 */
export function pipelinePeekDetail(p: PersonVM): PipelinePeekDetailVM {
  const W = PIPELINE_WORDS.peek.reach;
  const reach: PipelinePeekReachVM[] = [];
  // Not for someone on do-not-contact: the person page's own menu offers neither the call nor the copy (personActs).
  if (p.phone && !(p.consent && p.consent.dnc))
    reach.push({ id: "phone", label: W.phone, words: p.phone, warn: null, copy: p.phone });
  if (p.email)
    reach.push({
      id: "email",
      label: W.email,
      words: p.email,
      warn: p.emailSuppressed ? EMAIL_STOPPED_LINE : null,
      copy: p.email,
    });
  const replies = p.hasChat
    ? repliesWords(p.replyVia, p.replyWindow, { optedOut: p.stopped, who: p.name, emailStopped: p.emailSuppressed })
    : null;
  if (replies && !(p.email && replies === EMAIL_CANT_REACH))
    reach.push({ id: "replies", label: W.replies, words: replies, warn: null, copy: null });
  return { reach };
}

/** An act of the sheet and the deal it moves (a pass proposed again names its deal; a new proposal names none). */
export interface PipelineSheetAct {
  act: DealAct;
  dealId: string | null;
}

/** The row's own deal, as the sheet says it once the person is read; before, its steps and its stand from the row alone. */
export interface PipelineSheetVM {
  /** The head's line once the person is read, where it says more than the row could: a consultation's service. */
  sub: string | null;
  /** The row's steps (its own track, in the one rule's tones), each with its day and word once the person is read. */
  steps: DealStepVM[];
  /** The row's deal as the person page's card says it: its line, its flags, its step; null without an open deal. */
  card: DealCardVM | null;
  /** Where a row without a card stands, in its chip's words and tone: a consultation, a pass or an end. */
  stand: PipelineChip | null;
  /**
   * "Did Sol say yes?": asked while a proposal waits with nothing back and Follow up leads, its two answers the yes and
   * the pass, which the caret then does not offer again.
   */
  ask: { question: string; yes: DealAct; no: DealAct } | null;
  /** The foot's one act, by how the deal stands (dealNextAct); null for a client, whose foot leads with Message. */
  lead: PipelineSheetAct | null;
  /** The caret's: the card's other moves, and Start another proposal on an open deal. */
  more: PipelineSheetAct[];
  /** Their other open deals, each a row of its own: what it is and how it stands, in the deal's own words. */
  others: { dealId: string; title: string; words: string }[];
}

/** A row's steps in their words: the row's own track (who it waits on is its tone), each day the card's once read. */
function stepsOf(
  track: readonly PipelineStep[],
  card: DealCardVM | null,
  held: { day: string; word: string | null } | null,
): DealStepVM[] {
  const label = {
    consultation: DEAL_CARD_WORDS.consultation,
    proposal: DEAL_STAGE_WORDS.proposed,
    client: DEAL_STAGE_WORDS.won,
  };
  return track.map((s) => {
    const said = card ? card.steps.find((c) => c.key === s.key) : null;
    const own = !said && s.key === "consultation" && s.at === "done" ? held : null;
    return {
      key: s.key,
      label: label[s.key],
      day: said ? said.day : own ? own.day : null,
      word: said ? said.word : own ? own.word : null,
      at: s.at,
      tone: s.tone === "plain" ? null : s.tone,
    };
  });
}

/** A deal that closed, said as its sheet stands: when, then why ("Passed Sep 30 · Price", "Ended Oct 2"). */
function closedStand(d: DealVM, chip: PipelineChip | null, tz: string, nowMs: number): PipelineChip | null {
  if (!chip) return null;
  const when = d.sinceMs === null ? d.word : `${d.word} ${clockDate(d.sinceMs, tz, nowMs)}`;
  return { words: d.reason ? `${when} · ${d.reason.words}` : when, tone: chip.tone };
}

/**
 * The row's own deal as the sheet says it. Before the person is read (`p` null) it is the row's steps and its chip, and
 * no act: the acts are the card's, which reads them. A proposal out or a client is the card of that deal (dealCardsOf,
 * the person page's own), its next act the foot's and its other moves the caret's; a consultation leads with a new
 * proposal for the service it named (consultedService); a pass is proposed again, and an end starts a new one.
 */
export function pipelineSheetOf(row: PipelineRowVM, p: DealPerson | null, nowMs: number, tz: string): PipelineSheetVM {
  const d = row.deal;
  const held = p ? consultationStepOf(p, nowMs, tz) : null;
  const card = p && d && dealIsOpen(d) ? (dealCardsOf(p, nowMs, tz).cards.find((c) => c.id === d.id) ?? null) : null;
  const others =
    p && p.deals
      ? p.deals
          .filter((o) => o.id && o.id !== (d?.id ?? null) && dealIsOpen(o))
          .map((o) => ({ dealId: o.id as string, title: o.service ?? o.word, words: o.said }))
      : [];
  // A consultation's head names the service it was for, once the person read says which (consultedService).
  const consulted = !d && p ? consultedService(p) : null;
  const sub = consulted ? `${DEAL_CARD_WORDS.consultation} · ${consulted}` : null;
  const base = { sub, steps: stepsOf(row.track, card, held), others };
  if (card) {
    const asks = card.next?.id === "follow-up";
    const another: PipelineSheetAct = { act: { ...act("propose"), label: DEAL_CARD_WORDS.another }, dealId: null };
    return {
      ...base,
      card,
      stand: null,
      ask: asks ? { question: PIPELINE_WORDS.sheet.ask(shortName(row.name)), yes: act("won"), no: act("lost") } : null,
      lead: card.next ? { act: card.next, dealId: card.id } : null,
      more: [
        ...card.more
          .filter((m) => !asks || (m.id !== "won" && m.id !== "lost"))
          .map((m) => ({ act: m, dealId: card.id })),
        another,
      ],
    };
  }
  // A consultation is said once. Still ahead, by the fact under the deal ("Coming up · Thu, Oct 22 · 2:00 PM"): its chip,
  // the same time again, stands for nothing here. Over, by its step once the person is read ("Past · Oct 19"): the chip
  // keeps only the step not taken.
  const ahead = !d && row.track[0]?.key === "consultation" && row.track[0].at === "current";
  const over = !d && held && row.chip ? { words: PIPELINE_WORDS.sheet.noProposal, tone: row.chip.tone } : null;
  const stand = ahead ? null : (over ?? (d && !dealIsOpen(d) ? closedStand(d, row.chip, tz, nowMs) : row.chip));
  // Not read yet, or an open deal their read does not hold (it moved meanwhile): the row's words, and no act to press.
  if (!p || (d && dealIsOpen(d))) return { ...base, card: null, stand, ask: null, lead: null, more: [] };
  // A pass is proposed again (the same deal, back to a proposal); an end, a consultation or a deal not read starts one.
  const lead: PipelineSheetAct =
    d && d.stage === "lost"
      ? { act: act("again"), dealId: d.id }
      : { act: act("propose", { service: consulted }), dealId: null };
  return { ...base, card: null, stand, ask: null, lead, more: [] };
}
