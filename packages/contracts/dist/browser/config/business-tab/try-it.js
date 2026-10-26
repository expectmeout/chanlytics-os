import { replyWhy } from "../brain.js";
import { reasonLabelOf } from "../../conversations/escalations.js";
import { POLICY_CLASS_WORDS, POLICY_MODE_WORDS } from "../workspace-config/policy-classes.js";
import { delayWords } from "../../playbooks/playbook-triggers.js";
import { MIN_MS, SECOND_MS } from "../../shared/time.js";
export const TRY_IT_MAX_CHARS = 500;
export const TRY_IT_MAX_EXCHANGES = 6;
export const TRY_IT_WORDS = {
  title: "Try it",
  sub: "Before a customer does",
  /** The card's one row at rest, and its act, which opens the box under it (a sheet on a phone). */
  row: { label: "A customer writes", value: "See its answer, and why. Nothing is sent", act: "Try it" },
  label: "A customer writes",
  placeholder: "Are you open on Saturday?",
  ask: "Ask it",
  asking: "Asking\u2026",
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
  noPersona: "There is nothing for it to answer from yet: fill in Details first."
};
export const SPEND_TRY = { before: "trying your receptionist", can: "try your receptionist" };
const tryHoldWords = (ms) => {
  if (ms >= MIN_MS) return delayWords(ms);
  const s = Math.max(1, Math.round(ms / SECOND_MS));
  return `${s} second${s === 1 ? "" : "s"}`;
};
function yoursBecause(then) {
  if (then.changed === "price") return "your rule never lets it quote a price";
  if (then.changed === "money") return "money is always a person's";
  if (then.changed === "booking" || then.changed === "faq")
    return `${POLICY_CLASS_WORDS[then.changed].name} is set to ${POLICY_MODE_WORDS.ask.head}`;
  if (then.reason === "human_token") return "it hands this to you";
  return then.reason ? reasonLabelOf(then.reason).toLowerCase() : "it hands this to you";
}
function thenWords(then, confidence) {
  if (then.mode === "never" || then.mode === "ask") {
    const head = POLICY_MODE_WORDS[then.mode].head;
    return {
      words: `Replies are set to ${head}, so it would not answer this: it ${then.mode === "ask" ? "waits for you" : "stays out"}.`,
      tone: "yours"
    };
  }
  const wait = tryHoldWords(then.hold_ms);
  const first = then.hold_ms <= 0 ? "It would send this right away." : then.held_for === "low_confidence" ? `It is ${confidence ?? 0}% sure, under your ${Math.round(then.min_confidence * 100)}%, so it would wait ${wait} for you, then send this.` : `It would wait ${wait} for you to stop it, then send this.`;
  if (!then.escalate) return { words: first, tone: then.hold_ms > 0 ? "waits" : "sends" };
  return { words: `${first} Then the conversation is yours: ${yoursBecause(then)}.`, tone: "yours" };
}
export function tryItVM(answer) {
  const why = replyWhy(answer.meta);
  const said = answer.then?.text ?? answer.text;
  const rows = [];
  if (why) {
    rows.push({ key: "readAs", label: TRY_IT_WORDS.rows.readAs, value: why.intentLabel });
    if (why.confidence !== null) rows.push({ key: "sure", label: TRY_IT_WORDS.rows.sure, value: `${why.confidence}%` });
    rows.push({
      key: "leaned",
      label: TRY_IT_WORDS.rows.leaned,
      value: why.facts.length ? why.facts.join(", ") : TRY_IT_WORDS.noFacts
    });
    if (why.reason) rows.push({ key: "reason", label: TRY_IT_WORDS.rows.reason, value: why.reason });
  }
  const then = answer.then ? thenWords(answer.then, why?.confidence ?? null) : { words: TRY_IT_WORDS.failed, tone: "yours" };
  const booked = answer.booking?.slot ? { words: `${then.words} It would ask your team to confirm the time it offered.`, tone: "yours" } : then;
  return { said, wrote: said === answer.text ? null : answer.text, rows, then: booked };
}
