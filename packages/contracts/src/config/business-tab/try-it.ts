/**
 * Settings › How it answers, Try it: a message an owner writes as a customer would, answered by the receptionist as it
 * stands now, and why. The answer is the edge's eval door's (apps/edge/lib/receptionist/eval.ts), which sends nothing
 * and writes nothing: the live composed prompt, the clock and the open times, the live model, and beside the answer
 * what the live turn would then do with it (`then`: the words layer two leaves, a hand-off to a person and why, the
 * hold). Every sentence the box says is here; the page draws them.
 */
import { replyWhy } from "../brain";
import { reasonLabelOf } from "../../conversations/escalations";
import { POLICY_CLASS_WORDS, POLICY_MODE_WORDS, type PolicyMode } from "../workspace-config/policy-classes";
import { delayWords } from "../../playbooks/playbook-triggers";
import { MIN_MS } from "../../shared/time";
import type { SpendWords } from "../../workspace/billing";

/** The longest message a try may be: the eval door's own bound. */
export const TRY_IT_MAX_CHARS = 500;
/** The exchanges a try keeps before it starts over: twelve turns, the eval door's own bound on a case's history. */
export const TRY_IT_MAX_EXCHANGES = 6;

export const TRY_IT_WORDS = {
  title: "Try it",
  sub: "Before a customer does",
  /** The card's one row at rest, and its act, which opens the box under it (a sheet on a phone). */
  row: { label: "A customer writes", value: "See its answer, and why. Nothing is sent", act: "Try it" },
  label: "A customer writes",
  placeholder: "Are you open on Saturday?",
  ask: "Ask it",
  asking: "Asking…",
  again: "Start over",
  customer: "Customer",
  receptionist: "Your receptionist",
  /** Over the model's own words, where your rules replaced them with the line a customer would get. */
  wrote: "It wrote",
  rows: { readAs: "Read it as", sure: "How sure", leaned: "Leaned on", reason: "Its reason", then: "Then" },
  noFacts: "Nothing it was given",
  full: `That's ${TRY_IT_MAX_EXCHANGES} messages. Start over to try another conversation.`,
  failed: "It could not answer just now. Nothing was sent; try again in a moment.",
  notLive: "Try it answers on the live app only: this one asks no model.",
  noPersona: "There is nothing for it to answer from yet: fill in Details first.",
} as const;

/** What a refusal to spend says a try was for (the route wrapper's requireSpend). */
export const SPEND_TRY: SpendWords = { before: "trying your receptionist", can: "try your receptionist" };

/** What the live turn would do with an answer: the eval door's `then`, as it answers it. */
export interface TryItThen {
  mode: string;
  text: string;
  changed: "price" | "money" | "booking" | "faq" | null;
  escalate: boolean;
  reason: string | null;
  hold_ms: number;
  held_for: "veto_window" | "low_confidence" | null;
  min_confidence: number;
}

/** One answer of the eval door, as Try it reads it. */
export interface TryItAnswer {
  /** The model's own words. */
  text: string;
  /** Its record (contracts brain.ts BrainMeta), or null when the answer could not be read. */
  meta: Record<string, unknown> | null;
  then: TryItThen | null;
  /** A time the customer picked, on a workspace that takes booking requests (decision 0061). */
  booking?: { slot: string; service: string } | null;
}

/** The box after an answer: what a customer would read, what it wrote where that differs, why, and what happens next. */
export interface TryItVM {
  said: string;
  wrote: string | null;
  rows: { key: "readAs" | "sure" | "leaned" | "reason"; label: string; value: string }[];
  /** `sends`: it goes on its own now; `waits`: it waits for you first; `yours`: it stays with a person. */
  then: { words: string; tone: "sends" | "waits" | "yours" };
}

/** A second, for a hold shorter than the minute delayWords counts in. */
const SECOND_MS = MIN_MS / 60;

/** A hold as a sentence says it: "30 seconds", "2 minutes". delayWords counts whole minutes, which a hold is not. */
const tryHoldWords = (ms: number): string => {
  if (ms >= MIN_MS) return delayWords(ms);
  const s = Math.max(1, Math.round(ms / SECOND_MS));
  return `${s} second${s === 1 ? "" : "s"}`;
};

/** Why the thread becomes a person's, as the clause after "Then it is yours:". */
function yoursBecause(then: TryItThen): string {
  if (then.changed === "price") return "your rule never lets it quote a price";
  if (then.changed === "money") return "money is always a person's";
  if (then.changed === "booking" || then.changed === "faq")
    return `${POLICY_CLASS_WORDS[then.changed].name} is set to ${POLICY_MODE_WORDS.ask.head}`;
  // The model's own hand-off: its reason is the row above, and "the customer asked" would not be true of every one.
  if (then.reason === "human_token") return "it hands this to you";
  return then.reason ? reasonLabelOf(then.reason).toLowerCase() : "it hands this to you";
}

/** The sentence under the answer: what happens next, by the reply row's mode, the hold, and a hand-off. */
function thenWords(then: TryItThen, confidence: number | null): TryItVM["then"] {
  if (then.mode === "never" || then.mode === "ask") {
    const head = POLICY_MODE_WORDS[then.mode as PolicyMode].head;
    return {
      words: `Replies are set to ${head}, so it would not answer this: it ${then.mode === "ask" ? "waits for you" : "stays out"}.`,
      tone: "yours",
    };
  }
  const wait = tryHoldWords(then.hold_ms);
  const first =
    then.hold_ms <= 0
      ? "It would send this right away."
      : then.held_for === "low_confidence"
        ? `It is ${confidence ?? 0}% sure, under your ${Math.round(then.min_confidence * 100)}%, so it would wait ${wait} for you, then send this.`
        : `It would wait ${wait} for you to stop it, then send this.`;
  if (!then.escalate) return { words: first, tone: then.hold_ms > 0 ? "waits" : "sends" };
  return { words: `${first} Then the conversation is yours: ${yoursBecause(then)}.`, tone: "yours" };
}

/** What Try it draws for one answer (the eval door's), every word of it from here. */
export function tryItVM(answer: TryItAnswer): TryItVM {
  const why = replyWhy(answer.meta);
  const said = answer.then?.text ?? answer.text;
  const rows: TryItVM["rows"] = [];
  if (why) {
    rows.push({ key: "readAs", label: TRY_IT_WORDS.rows.readAs, value: why.intentLabel });
    if (why.confidence !== null) rows.push({ key: "sure", label: TRY_IT_WORDS.rows.sure, value: `${why.confidence}%` });
    rows.push({
      key: "leaned",
      label: TRY_IT_WORDS.rows.leaned,
      value: why.facts.length ? why.facts.join(", ") : TRY_IT_WORDS.noFacts,
    });
    if (why.reason) rows.push({ key: "reason", label: TRY_IT_WORDS.rows.reason, value: why.reason });
  }
  const then = answer.then
    ? thenWords(answer.then, why?.confidence ?? null)
    : { words: TRY_IT_WORDS.failed, tone: "yours" as const };
  // A picked time is a request a person confirms (decision 0061): the hand-off says so, whatever the mode.
  const booked = answer.booking?.slot
    ? { words: `${then.words} It would ask your team to confirm the time it offered.`, tone: "yours" as const }
    : then;
  return { said, wrote: said === answer.text ? null : answer.text, rows, then: booked };
}
