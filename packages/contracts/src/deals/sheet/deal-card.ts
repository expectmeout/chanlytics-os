/**
 * The person page's Deal section (0008): one card per open deal, with its three quiet steps, its line, its flags
 * and its one next act (deal-acts.ts dealNextAct), or, with none open, one quiet line; and a deal's next step
 * (dealStepOf), which its card says.
 */
import { foldName } from "../../calendar/service-offer";
import { visitDay } from "../../calendar/calendar-people";
import { clockDate } from "../../shared/clock";
import { DEAL_LINE_NONE, DEAL_STAGE_WORDS } from "../deal-words";
import type { DealVM } from "../deal-vm";
import { waitingOnProposal } from "../deal-waits";
import { consultationsWithoutProposal } from "../deal-consultations";
import type { StepDayVM } from "../../notes/steps";
import { stateTone, type Tone } from "../../shell/tone";
import { followUpWords } from "../../playbooks/playbooks";
import { act, consultedService, dealNextAct, followUpOn, sentOf, type DealAct, type DealPerson } from "./deal-acts";

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
