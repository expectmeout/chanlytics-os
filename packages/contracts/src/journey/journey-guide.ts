/**
 * The journey's guide (spec 2026-10-10 §5.1, Ask the marketing manager): what a business of any trade sends at each touch
 * point of the journey it can run, and why, as Ask reads it beside the stages and their coverage (campaigns.journey). One
 * guide, keyed by the workspace's shape and never by a trade's words, until a second trade's facts differ: its stages are
 * the journey's own (journeyOf), less the appointment moments a workspace with no calendar cannot count, each on the
 * moment that runs it here; then the month's offer, which stands on no stage (journeyStageOf). Every sentence says
 * appointment, the word any trade's customer reads, never one trade's.
 */
import { triggerOf, type PlaybookTrigger } from "../playbooks/playbook-triggers";
import { journeyOf, type JourneyStageId } from "./journey";

/** One touch point: the stage it stands on, the moment a campaign on it starts from, what goes out and why. */
export interface GuideRow {
  /** Null for the month's offer, which stands on no stage of the journey. */
  stage: JourneyStageId | null;
  /** Null for first contact: the receptionist answers it, and no campaign leads it. */
  moment: PlaybookTrigger | null;
  sends: string;
  why: string;
}

/** What each stage sends and why, in any trade's words. */
const STAGE_WORDS: Record<JourneyStageId, Pick<GuideRow, "sends" | "why">> = {
  first_contact: {
    sends: "the first reply, from your receptionist, which asks for the yes to offers",
    why: "a first message answered at once is the one most likely to book, and every offer later needs that yes",
  },
  before: {
    sends: "the day before an appointment, a reminder",
    why: "a reminder keeps an appointment from being missed, and a change comes early enough to fill the time",
  },
  after: {
    sends: "the day after, a thank-you and a review ask",
    why: "the day after is when a customer most often leaves a review and books the next appointment",
  },
  proposal: {
    sends: "a proposal waiting with nothing back, one follow-up with its link",
    why: "a proposal left unanswered is often only waiting for a nudge, and its link makes the answer one tap",
  },
  quiet: {
    sends: "quiet six weeks or more, a win-back",
    why: "a customer who has gone quiet is easier to bring back with one message than a new one is to find",
  },
};

/** The month's offer: a touch point of every journey, on no stage of it. */
const MONTHS_OFFER: GuideRow = {
  stage: null,
  moment: "everyone_monthly",
  sends: "every month, one offer to those who said yes",
  why: "one offer a month keeps the business in mind without wearing out the yes, and it reaches only those who gave it",
};

/**
 * The guide for a workspace's shape: `calendarOn` a calendar connected, `dealsOn` some customers get a proposal first.
 * The stages in the journey's order, those that need a calendar only with one and a proposal's only where deals are on,
 * then the month's offer. Pure and total.
 */
export function journeyGuide(input: { calendarOn: boolean; dealsOn: boolean }): GuideRow[] {
  const stages = journeyOf({ ...input, word: "appointment", held: new Set() }).filter((s) => s.unmet === null);
  return [
    ...stages.map((s) => ({
      stage: s.id,
      moment: s.trigger === null ? null : (triggerOf(s.trigger)?.id ?? null),
      ...STAGE_WORDS[s.id],
    })),
    { ...MONTHS_OFFER },
  ];
}
