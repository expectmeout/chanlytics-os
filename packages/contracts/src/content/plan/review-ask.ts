/**
 * The plan proposes asking every client for a review (the content loop's pass 6; the PRD's 10.5; the content canvas's
 * Loop4, approved by Ruben on 24 Nov 2026). The ask is Campaigns' own, live since #2521: the message the day after a
 * kept visit, with the business's review link, to every client, so nobody is picked for being happy (Google forbids
 * asking only the satisfied). The plan never turns it on: it proposes it, once, where more reviews is a goal the owner
 * set or no new review has come on Google in 30 days, and only where the business has a review link and no campaign that
 * asks for one is running. Not now rests the proposal for 30 days. A review itself never becomes a post or an ad here
 * (Ruben, 24 Nov 2026).
 *
 * Pure: the facts in, the proposal out.
 */
import { appointmentWords, type AppointmentWord } from "../../journey/appointment-word";
import { DAY_MS } from "../../shared/time";

/** How long without a new review on Google before the plan proposes the ask. */
const REVIEW_ASK_QUIET_DAYS = 30;
/** How long Not now rests the proposal. */
export const REVIEW_ASK_REST_DAYS = 30;

/** Why the plan proposes it: a goal the owner set, or reviews that stopped coming. */
export type ReviewAskWhy = "goal" | "quiet";

/** The proposal, where there is one. */
export interface ReviewAskDto {
  why: ReviewAskWhy;
  /** What the workspace calls an appointment (tenants.appointment_word), which its words say. */
  word: AppointmentWord;
}

/** What the proposal is worked out from. */
export interface ReviewAskFacts {
  /** Whether more reviews is an active goal of the owner's. */
  goal: boolean;
  /** The newest review on Google, of any stars; null where there has been none. */
  newestReviewAt: string | null;
  /** Whether the business has a review link a message can carry. */
  reviewLink: boolean;
  /** Whether a campaign that asks for a review is running. */
  askOn: boolean;
  /** When the owner last said Not now to it; null where never. */
  restedAt: string | null;
  /** What the workspace calls an appointment. */
  word: AppointmentWord;
}

/** The plan's proposal of the review ask, or none (where it could not run, is on, rests, or has no reason). */
export function reviewAskOf(facts: ReviewAskFacts, nowMs: number): ReviewAskDto | null {
  if (!facts.reviewLink || facts.askOn) return null;
  if (facts.restedAt && nowMs - Date.parse(facts.restedAt) < REVIEW_ASK_REST_DAYS * DAY_MS) return null;
  if (facts.goal) return { why: "goal", word: facts.word };
  const quiet =
    facts.newestReviewAt === null || nowMs - Date.parse(facts.newestReviewAt) >= REVIEW_ASK_QUIET_DAYS * DAY_MS;
  return quiet ? { why: "quiet", word: facts.word } : null;
}

/** The proposal's words: its row on the Week and Today, and the card it opens (the canvas's Loop4). */
export const REVIEW_ASK_WORDS = {
  title: "Ask every client for a review",
  why: { goal: "More reviews is a goal you set", quiet: "No new review on Google in 30 days" },
  open: "Open",
  card: {
    title: "Ask for a review",
    approve: "Approve",
    notNow: "Not now",
    close: "Close",
  },
} as const;

/** The words that say the workspace's own appointment word: when it asks, the card's head, AI's line and its facts. */
export function reviewAskWordsOf(word: AppointmentWord) {
  const { one, a } = appointmentWords(word);
  const asks = `This asks every client the day after a kept ${one}, with your review link.`;
  return {
    when: `the day after each ${one}`,
    head: `The day after ${a}`,
    says: { goal: `${REVIEW_ASK_WORDS.why.goal}. ${asks}`, quiet: `${REVIEW_ASK_WORDS.why.quiet}. ${asks}` },
    facts: [
      "Every client, never only the happy ones",
      `On WhatsApp, once for each ${one}`,
      "Asks you before it first sends",
    ],
  } as const;
}

/** The row's line under its title: why, then when it asks. */
export const reviewAskLineOf = (ask: ReviewAskDto): string =>
  `${REVIEW_ASK_WORDS.why[ask.why]} · ${reviewAskWordsOf(ask.word).when}`;

/**
 * What the card's Approve starts, as POST playbooks takes it: the after-visit review ask by its starter, on the visited
 * moment, its three slots the client's first name, the business's name and its review link.
 */
export const REVIEW_ASK_START = {
  name: null,
  trigger: "visited",
  starter_key: "after_visit_review",
  params: [{ kind: "first_name" }, { kind: "business_name" }, { kind: "review_link" }],
} as const;
