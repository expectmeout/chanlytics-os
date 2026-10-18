/**
 * The journey's guide (spec 2026-10-10 §5.1, Ask the marketing manager): what each touch point of the journey a workspace
 * can run sends, and when, as Ask reads it beside the stages and their coverage (campaigns.journey). One guide, keyed by
 * the workspace's shape and never by a trade's words, until a second trade's facts differ: its stages are the journey's
 * own (journeyOf), less the appointment moments a workspace with no calendar cannot count, each on the moment that runs it
 * here and said when that moment says it is (triggerWords' hint: a win-back's own days); then the month's offer, which
 * stands on no stage (journeyStageOf). It states what the product does and no outcome it cannot vouch for, so it says no
 * why (12 Oct 2026): the day after names a review ask only where the Google listing keeps a review link, since Ask's plan
 * proposes one only there (plan.ts stageInput: the review ask the Library holds, else its starter, starter-templates.ts
 * after_visit_review, filed at Approve), naming the check that asks how it went over a review ask the Library holds where
 * there is none, and its campaign card files the review starter only there (checkStarterPlaybook). Every sentence says
 * the workspace's own word for an appointment (triggerWords, from appointmentWords), the word its customers read, never
 * one trade's.
 */
import { triggerOf, triggerWords, type PlaybookTrigger } from "../playbooks/playbook-triggers";
import type { AppointmentWord } from "./appointment-word";
import { journeyOf, type JourneyStageId } from "./journey";

/** One touch point: the stage it stands on, the moment a campaign on it starts from, and what goes out when. */
export interface GuideRow {
  /** Null for the month's offer, which stands on no stage of the journey. */
  stage: JourneyStageId | null;
  /** Null for first contact: the receptionist answers it, and no campaign leads it. */
  moment: PlaybookTrigger | null;
  sends: string;
}

/**
 * What each stage sends, in any trade's words: first contact whole, since no moment leads it (the receptionist asks once,
 * on WhatsApp alone: contracts offers-ask.ts), and every other stage's what alone, said after its moment's when. The yes
 * it asks for is the one an offer on WhatsApp needs (consent.ts mayMessageFor: a yes covers the channels it was given
 * for, consent-channels.ts yesCovers); an offer by email needs none of it.
 */
const STAGE_SENDS: Record<JourneyStageId, string> = {
  first_contact:
    "your receptionist's answers, which ask once on WhatsApp for the yes to offers, the yes an offer on WhatsApp needs",
  before: "a reminder",
  after: "a thank-you and how it went, with a review ask where your Google listing keeps a review link",
  proposal: "one follow-up with its link",
  quiet: "a win-back",
};

/**
 * The month's offer: a touch point of every journey, on no stage of it. Said by the channels it reaches people on, each
 * person once (reach-for.ts reachFor), since a new campaign ticks every channel open to it: on WhatsApp the yes to
 * offers, by email a yes there or a dealing with the business on record and no no (consent.ts mayMessageFor), and never
 * by text, which carries no offers.
 */
const MONTHS_OFFER: GuideRow = {
  stage: null,
  moment: "everyone_monthly",
  sends:
    "every month, one offer on the channels it goes by: on WhatsApp to those who said yes to offers, and by email to those who said yes by email or have dealt with you, unless they said no",
};

/**
 * The guide for a workspace's shape: `calendarOn` a calendar connected, `hasDeals` a deal recorded here, `word` what it
 * calls an appointment (contracts appointmentWordOf: "appointment" where it never picked). The stages in the journey's
 * order, those that need a calendar only with one and a proposal's only where a deal was recorded, each moment's
 * said when its moment says it is (its hint in the word, lowercased as winBackWords says it), then the month's offer. Pure
 * and total.
 */
export function journeyGuide(input: { calendarOn: boolean; hasDeals: boolean; word: AppointmentWord }): GuideRow[] {
  const stages = journeyOf({ ...input, held: new Set() }).filter((s) => s.unmet === null);
  return [
    ...stages.map((s) => {
      const t = s.trigger === null ? undefined : triggerOf(s.trigger);
      return {
        stage: s.id,
        moment: t?.id ?? null,
        sends: t ? `${triggerWords(t, input.word).hint.toLowerCase()}: ${STAGE_SENDS[s.id]}` : STAGE_SENDS[s.id],
      };
    }),
    { ...MONTHS_OFFER },
  ];
}
