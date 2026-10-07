/**
 * A second model port in shadow (scorecard move 10, step 12; decision 0023): what a shadow answer is compared with, and
 * the ledger row it becomes.
 *
 * A purpose whose answer is a closed set may name a shadow port in the registry (models.ts `shadow`): while the switch
 * is on, the same question is put to the second model beside the primary, its answer is compared with the primary's and
 * written, and nothing else happens: the answer is never used, and a shadow that fails is logged and costs nobody
 * anything. The rows are how Ruben reads a week of agreement per purpose (00275 ai_shadow_agreement) before any switch.
 *
 * A question's answer is read as a label the primary also gives: a choice is its option, a noul is "true" or "false"
 * (a probability of yes at or over a half). Its confidence is the choice's own, or how far the noul is from a coin.
 * `confident` is the row's mark that the shadow cleared SHADOW_CONFIDENT, so "the share right when it was sure" is one
 * read of the ledger; the pilot of 29 September (decision 0023) found every decided answer right.
 */
import type { AiUsageBody } from "./usage";
import type { ModelPurpose, ShadowPort } from "./models";
import {
  SYSTEM_ONE_MODEL,
  systemOneDollars,
  systemOneState,
  type SystemOneAnswer,
  type SystemOneQuestion,
} from "./system-one";
import { injectionQuestion, fenceActed } from "./fence";
import { policyClassLabel, policyClassQuestion } from "../config/workspace-config/policy-classes";
import { stopRequestQuestion } from "../consent/consent";
import { isReplyIntent, replyIntentQuestion } from "../reach-out/reach-out-replies";
import { judgeShadowCalls, type PlaceFacts } from "../leads/lead-judge";
import type { LeadSearchPlan } from "../leads/search/plan";

/** The confidence at which a shadow answer counts as decided: the line the pilot was read at. */
export const SHADOW_CONFIDENT = 0.8;
/** How long one shadow call may take (the adapter's bound). */
export const SHADOW_TIMEOUT_MS = 6_000;
/** How long the primary waits for its shadow once the primary is done: a slow shadow is left behind, never waited on. */
export const SHADOW_GRACE_MS = 1_500;
/** How long the ledger write of a shadow's rows may take before it is left behind: the customer's reply never waits on it longer. */
export const SHADOW_WRITE_MS = 1_500;
/** The question a row names when its call never answered: one row per failed call, with no answer to compare. */
export const SHADOW_CALL = "call";

/**
 * Whether the switch is on for a workspace. '1' is every workspace; a comma-separated list of workspace ids is a pilot
 * on those alone (Ruben's own first); anything else, blank included, is off.
 */
export function shadowSwitchOn(value: string | undefined, tenantId: string): boolean {
  const v = value?.trim();
  if (!v) return false;
  if (v === "1") return true;
  return v
    .split(",")
    .map((id) => id.trim().toLowerCase())
    .includes(tenantId.toLowerCase());
}

/** What a shadow said, as a label the primary can also give, and how sure it was. */
export interface ShadowRead {
  answer: string;
  confidence: number;
  confident: boolean;
}

/** An answer read as a label; null when it is not the kind the question asked, or names an option it was not offered (a shadow that answers wrongly says nothing). */
export function shadowRead(question: SystemOneQuestion, answer: SystemOneAnswer | undefined): ShadowRead | null {
  if (!answer || answer.type !== question.type) return null;
  let label: string;
  let confidence: number;
  if (answer.type === "noul") {
    label = answer.noul >= 0.5 ? "true" : "false";
    confidence = Math.max(answer.noul, 1 - answer.noul);
  } else if (answer.type === "choice") {
    // An option the question did not offer is not an answer to it, and a label the ledger's column would refuse would lose its whole batch.
    if (question.type !== "choice" || !Object.hasOwn(question.criteria, answer.choice)) return null;
    label = answer.choice;
    confidence = answer.confidence;
  } else return null;
  const rounded = Math.round(confidence * 1000) / 1000;
  return { answer: label, confidence: rounded, confident: rounded >= SHADOW_CONFIDENT };
}

/** What became of one shadow call, as the ledger keeps it. */
export type ShadowCallOutcome =
  | { outcome: "ok"; model: string; inputTokens: number; answers: Record<string, SystemOneAnswer> }
  | { outcome: "rejected" | "unreachable"; model: string };

/** One shadow call for one purpose: who it is for, the questions put, the primary's label for each. */
export interface ShadowCallFor {
  tenantId: string;
  purpose: ModelPurpose;
  port: ShadowPort;
  subjectId: string | null;
  questions: Record<string, SystemOneQuestion>;
  /** The primary's answer to each question, as a label; null when the primary gave none (nothing to compare). */
  primary: Record<string, string | null>;
}

/**
 * The ledger's rows for one call. An answered call is one row per question, its input tokens and dollars on the first
 * (a call's cost counted once, so a sum of the rows is what was spent); a call that got no answer is one row that says
 * so and compares nothing. The shadow's answer is never a customer's: rows carry labels and numbers, no text.
 */
export function shadowBodies(call: ShadowCallFor, result: ShadowCallOutcome): AiUsageBody[] {
  const base = {
    tenant_id: call.tenantId,
    purpose: call.purpose,
    model_asked: SYSTEM_ONE_MODEL,
    model: result.model,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    output_tokens: 0,
    prompt_hash: null,
    user_id: null,
    subject_id: call.subjectId,
    port: call.port,
    shadow: true,
  } as const;
  if (result.outcome !== "ok") {
    return [{ ...base, outcome: result.outcome, question: SHADOW_CALL, input_tokens: 0, usd: 0 }];
  }
  const usd = systemOneDollars(result.inputTokens);
  return Object.entries(call.questions).map(([name, question], i) => {
    const read = shadowRead(question, result.answers[name]);
    const primary = call.primary[name] ?? null;
    return {
      ...base,
      // An answer the shadow gave that is not the kind asked is an answer that could not be read.
      outcome: read ? ("answered" as const) : ("unreadable" as const),
      question: name,
      input_tokens: i === 0 ? result.inputTokens : 0,
      usd: i === 0 ? usd : 0,
      primary_answer: primary,
      shadow_answer: read?.answer ?? null,
      shadow_confidence: read?.confidence ?? null,
      confident: read ? read.confident : null,
      agrees: read && primary !== null ? read.answer === primary : null,
    };
  });
}

/* ---------------------------------------------------------- what is asked -- */

/** One shadow call to make: its name (a place's ref, a message), the state put to the model and the questions. */
export interface ShadowCallSpec {
  ref: string;
  state: string;
  questions: Record<string, SystemOneQuestion>;
}

/** The names a question goes by in the ledger (ai_usage.question). Each purpose's are here; the judge's are its rubric's keys. */
const SHADOW_QUESTIONS = {
  receptionist: { moneyClass: "money_class", injection: "injection", stop: "stop_request" },
  reply_read: { intent: "reply_intent" },
} as const;

/**
 * The receptionist's turn as three questions put to the customer's words alone (never the business's prompt or facts):
 * which class the message falls under (the money charter's), whether it carries an instruction for the assistant (the
 * fence's), and whether it asks to stop (consent's). The state is the message, as the receptionist was handed it.
 */
export function receptionistShadowCall(customerText: string): ShadowCallSpec {
  const q = SHADOW_QUESTIONS.receptionist;
  return {
    ref: "message",
    state: systemOneState(customerText),
    questions: {
      [q.moneyClass]: policyClassQuestion(),
      [q.injection]: injectionQuestion(),
      [q.stop]: stopRequestQuestion(),
    },
  };
}

/**
 * The words a second model is put for a receptionist turn: the customer's own text; for a photo, its caption, and none
 * when it has none (the framing the primary is given around a photo, and the placeholder a captionless one leaves as its
 * text, are not words the customer wrote). Undefined asks the shadow nothing.
 */
export function shadowWordsOf(x: { text: string; photo: boolean; caption?: string | null }): string | undefined {
  if (!x.photo) return x.text;
  return x.caption?.trim() || undefined;
}

/** The primary's answer to each of those: its intent's class; the fence's verdict; and no stop, or the door would have held it. */
export function receptionistPrimary(intent: string | null, customerText: string): Record<string, string | null> {
  const q = SHADOW_QUESTIONS.receptionist;
  return {
    [q.moneyClass]: intent === null ? null : policyClassLabel(intent),
    [q.injection]: String(fenceActed(customerText)),
    [q.stop]: "false",
  };
}

/** The reply reader's question: the reply as the reader is shown it, and the seven intents. */
export function replyReadShadowCall(readerUserContent: string): ShadowCallSpec {
  return {
    ref: "reply",
    state: systemOneState(readerUserContent),
    questions: { [SHADOW_QUESTIONS.reply_read.intent]: replyIntentQuestion() },
  };
}

/** The reader's answer as a label: its intent, or null when the answer named none the reader may give. */
export function replyReadPrimary(answer: unknown): Record<string, string | null> {
  const intent = answer && typeof answer === "object" ? (answer as { intent?: unknown }).intent : null;
  return { [SHADOW_QUESTIONS.reply_read.intent]: isReplyIntent(intent) ? intent : null };
}

/** The judge's batch as one call per place, its criteria the questions. */
export function judgeShadowSpecs(plan: LeadSearchPlan, places: PlaceFacts[]): ShadowCallSpec[] {
  return judgeShadowCalls(plan, places).map((c) => ({ ...c, ref: String(c.ref) }));
}
