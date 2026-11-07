/** First run phone: phone. */

import { billingDoorOpen, trialDaysFor } from "../../workspace/billing/dtos";
import { priceWords } from "../../workspace/billing/plans";
import { areaCodeOf } from "../../shared/phone";
import { SETUP_STATE_WORDS, type SetupDto } from "../lines";
import {
  answeringStageOf,
  onItsWayStageOf,
  phoneStepOf,
  showCtaOf,
  type FirstRunPhoneInput,
  type PhoneStep,
} from "./steps";
import { FIRST_RUN_PHONE_WORDS, type FirstRunPhoneVM } from "./vm";

export function firstRunPhoneOf(input: FirstRunPhoneInput): FirstRunPhoneVM {
  const { dto } = input;
  const phoneStep = phoneStepOf(input);
  if (input.at === "channels") return channelsStageOf(phoneStep);
  // Where the receptionist's line stands decides the stage: it answers, it is on its way, or there is none yet.
  if (dto.channels.voice.present) return answeringStageOf(phoneStep);
  if (phoneStep.ownLine) return onItsWayStageOf(phoneStep, phoneStep.ownLine);
  // Not by phone (decision 0091): Go live starts the trial, and there is no number to buy.
  if (input.vm.noCalls) return noCallsStageOf(phoneStep);
  return noLineYetStageOf(phoneStep);
}

/**
 * Go live for a business that takes no calls (decision 0091): the plan the trial starts, pressed with nothing held, and
 * no number bought after it; once it runs, nothing of the phone's is left to draw.
 */
function noCallsStageOf(phoneStep: PhoneStep): FirstRunPhoneVM {
  const plan = phonePlanOf(phoneStep.dto.billing);
  if (!plan) return phoneStep.rows;
  if (phoneStep.returned) return startingStageOf(phoneStep);
  const words = FIRST_RUN_PHONE_WORDS;
  return {
    ...phoneStep.base,
    stage: "go",
    heading: words.chooseHeading,
    lead: words.chooseLead,
    plan: { offer: plan.offer, note: words.planNoteNoCalls(plan.days) },
    boxProblem: null,
    cta: { label: ctaLabelOf("plan"), held: null, act: "plan" },
    status: null,
    questions: null,
    code: null,
    forwardFrom: null,
    saved: null,
    keepCode: null,
  };
}

/**
 * Where it answers (decision 0073): the choosing, with nothing to pay and nothing bought; held while the choice cannot
 * be kept. A line already on its way, no provider here, or a line a person was asked for: Setup's rows say it.
 */
function channelsStageOf(phoneStep: PhoneStep): FirstRunPhoneVM {
  const { dto } = phoneStep;
  if (dto.channels.voice.present || phoneStep.ownLine) return phoneStep.rows;
  if (!dto.lines?.ready || dto.requests.line || dto.requests.port) return phoneStep.rows;
  const boxProblem = boxProblemOf(phoneStep);
  return {
    ...phoneStep.base,
    stage: "choose",
    heading: FIRST_RUN_PHONE_WORDS.calls,
    lead: FIRST_RUN_PHONE_WORDS.chooseLead,
    plan: null,
    boxProblem,
    cta: null,
    held: ctaHeldOf(phoneStep, boxProblem),
    status: null,
    questions: null,
    code: null,
    forwardFrom: null,
    saved: null,
    keepCode: null,
  };
}

/** No line yet, at Go live: Setup's rows, the plan starting, the number being bought, or the press that starts it. */
function noLineYetStageOf(s: PhoneStep): FirstRunPhoneVM {
  const { dto, choice, returned } = s;
  // No provider here, or a person was asked for a line: the row says who has it.
  if (!dto.lines?.ready || dto.requests.line || dto.requests.port) return s.rows;
  const plan = phonePlanOf(dto.billing);
  if (!s.canSpend && !plan) return s.rows;
  if (plan && returned) return startingStageOf(s);
  if (s.canSpend && choice?.pending) return buyingStageOf(s);
  return goStageOf(s, plan);
}

/**
 * The plan the number starts: none yet, so the step's checkout starts the trial (trialDaysFor, the checkout's own rule,
 * over the length the edge said). A trial already running covers the number (decision 0090), so it starts nothing.
 * Anything else that cannot spend (a failed card, a subscription that ended) is Billing's, on the row.
 */
function phonePlanOf(billing: SetupDto["billing"]): (NonNullable<FirstRunPhoneVM["plan"]> & { days: number }) | null {
  const words = FIRST_RUN_PHONE_WORDS;
  if (!billingDoorOpen(billing) || billing.status !== "none") return null;
  const days = trialDaysFor({ hadSubscription: false, deploymentDays: billing.trial_days });
  return { offer: words.planOffer(priceWords(billing.price ?? null), days), note: words.planNote(days), days };
}

/** Back from checkout before the plan lands: starting, until Stripe confirms it. */
function startingStageOf(s: PhoneStep): FirstRunPhoneVM {
  const words = FIRST_RUN_PHONE_WORDS;
  return { ...s.base, ...s.ready, stage: "starting", status: waitingOn(words.starting, words.startingDetail) };
}

/**
 * Pressed, and the workspace may spend: the page buys, once, and this is what it says meanwhile, with the questions
 * for a number kept or moved (canvas R4: the owner answers while the number gets ready).
 */
function buyingStageOf(phoneStep: PhoneStep): FirstRunPhoneVM {
  const words = FIRST_RUN_PHONE_WORDS;
  return {
    ...phoneStep.base,
    ...phoneStep.ready,
    stage: "buying",
    status: waitingOn(
      phoneStep.way === "new" && phoneStep.picked
        ? words.buyingNew(phoneStep.picked)
        : words.buyingIn(phoneStep.forwarded ? phoneStep.area : null),
      words.usually,
    ),
    questions: phoneStep.questions,
    cta: phoneStep.questions ? showCtaOf(phoneStep, false) : null,
  };
}

/** What the step says while we are the ones waited on: the state, its word, the sentence and the line under it. */
function waitingOn(sentence: string, detail: string): NonNullable<FirstRunPhoneVM["status"]> {
  return { state: "waiting_them", words: SETUP_STATE_WORDS.waiting_them, sentence, detail };
}

/**
 * Go live's press (canvas 5A): the plan the number starts, and the one button, held where the choice kept cannot be
 * bought (a tab that lost it, a number no US company forwards: Where it answers says it, and Back goes there).
 */
function goStageOf(phoneStep: PhoneStep, plan: ReturnType<typeof phonePlanOf>): FirstRunPhoneVM {
  const words = FIRST_RUN_PHONE_WORDS;
  const boxProblem = boxProblemOf(phoneStep);
  const act = plan ? "plan" : "buy";
  return {
    ...phoneStep.base,
    stage: "go",
    heading: words.chooseHeading,
    lead: words.chooseLead,
    plan: plan ? { offer: plan.offer, note: plan.note } : null,
    boxProblem,
    cta: {
      label: ctaLabelOf(act),
      held: ctaHeldOf(phoneStep, boxProblem),
      act,
    },
    status: null,
    questions: null,
    code: null,
    forwardFrom: null,
    saved: null,
    keepCode: null,
  };
}

/**
 * A number to keep or move is forwarded from, so it must be one a US phone company forwards: a US number with its
 * area code, which is also where the receptionist's own is bought.
 */
function boxProblemOf(s: PhoneStep): string | null {
  const typedSome = !!s.choice && typeof s.choice.number === "string" && s.choice.number.trim() !== "";
  return s.way !== "new" && typedSome && !(s.number && areaCodeOf(s.number)) ? FIRST_RUN_PHONE_WORDS.held.us : null;
}

/** Why the button cannot go yet: no number picked, or none to keep or move that a US phone company forwards. */
function ctaHeldOf(s: PhoneStep, boxProblem: string | null): string | null {
  const words = FIRST_RUN_PHONE_WORDS;
  if (s.way === "new") return s.pick ? null : words.held.pick;
  return boxProblem ?? (!s.number ? words.held.number : areaCodeOf(s.number) ? null : words.held.us);
}

/** Go live's press, named for what it does: start the trial or the plan by checkout, or buy the number. */
function ctaLabelOf(act: "plan" | "buy"): string {
  return FIRST_RUN_PHONE_WORDS.cta[act];
}
