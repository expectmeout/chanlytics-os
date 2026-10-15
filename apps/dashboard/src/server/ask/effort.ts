import "server-only";
import {
  EFFORT_MESSAGE_BETA,
  askRoundCap,
  effortInForce,
  effortMessage,
  isEffortMessage,
  type AskModelProfile,
  type ModelEffort,
} from "@chanlytics/contracts";
import { draftAsked } from "./cross-page";
import { argsOf, type RoundBlock } from "./round";
import { calledName } from "./tools";
import type { Msg, TurnInput } from "./loop";
import type { turnMeter } from "./turn-end";

/**
 * The effort a turn is asked at (Ruben, 15 Oct 2026: "for crafting generating big things like campaigns etc we should
 * use the maximum effort level whereas for other things low or medium").
 *
 * Every round's request asks the profile's own effort (ASK_EFFORT, low) in its output_config, the same bytes on every
 * round of every turn, which the cache is keyed by. A draft -- campaigns set up, an offer made, a message, a sequence or
 * a plan written -- is asked at the profile's draft effort (ASK_DRAFT_EFFORT) by an effort message after its question
 * (contracts ai/effort.ts), which leaves the prefix the cache holds as it was, and the next turn that is no draft sets
 * the effort back the same way, after its own question: a replay only appends (memory.ts). A round at a raised effort
 * may write ASK_DRAFT_MAX_TOKENS, since its thinking counts toward its ceiling (contracts askRoundCap; the edge clamps by
 * the same rule).
 *
 * A draft is found two ways: the question's words, as the planner reads them (cross-page.ts draftAsked: a setup, an
 * offer, a draft named), before the first round; and a round at the turn's own effort that begins one anyway (a call in
 * DRAFT_CALLS), which is set aside unrun and asked again at the draft's effort, at the cost of the round it took. A
 * spoken turn is never raised: a listener waits on silence, and the voice door's budget is a typed turn's.
 */

/**
 * The calls that write a draft: an offer's or a setup's plan, a plan across pages, a sequence made whole, a standing
 * rule, a new message, a cold email sequence, a lead search's plan. A change to one that is there (its words, a step,
 * its clock) is no draft.
 */
const DRAFT_CALLS: ReadonlySet<string> = new Set([
  "propose_plan.offer",
  "propose_plan.steps",
  "propose_sequence.make",
  "propose_sequence.moment",
  "propose_sequence.message",
  "propose_sequence.cold_email",
  "propose_lead_search",
]);

const isDraftCall = (b: RoundBlock): boolean => b.type === "tool_use" && DRAFT_CALLS.has(calledName(b.name, argsOf(b)));

/** What a round's request carries for its effort: the ceiling the effort in force earns, and the beta its messages need. */
interface RoundEffort {
  max_tokens: number;
  betas?: string[];
}

export function turnEffort(
  model: AskModelProfile,
  input: Pick<TurnInput, "text" | "spoken">,
  meter: ReturnType<typeof turnMeter>,
) {
  const draft: ModelEffort | null = input.spoken ? null : model.draft;
  if (draft && draftAsked(input.text)) meter.draft = { effort: draft, by: "question" };
  const wanted = (): ModelEffort => (meter.draft ? draft : null) ?? model.effort;
  return {
    /**
     * The turn's first request's messages, the question last, given the effort the turn is asked at: an effort message
     * after the question where the one in force there is another (a replayed draft before a turn that is none, or a
     * draft after one that was none); appended, never an edit of what was sent.
     */
    open(messages: Msg[]): void {
      const at = wanted();
      if (effortInForce(messages, model.effort) !== at) messages.push(effortMessage(at));
    },
    /** What a round's request carries for its effort, from its messages as they stand. */
    of(messages: readonly Msg[]): RoundEffort {
      return {
        max_tokens: askRoundCap(effortInForce(messages, model.effort)),
        ...(messages.some(isEffortMessage) ? { betas: [EFFORT_MESSAGE_BETA] } : {}),
      };
    },
    /**
     * A round at the turn's own effort that began a draft: the effort is raised after the turn's last message and the
     * round is to be asked again, its calls unrun (true). Once a turn: a raised turn's rounds are its draft.
     */
    redraft(calls: readonly RoundBlock[], messages: Msg[]): boolean {
      if (!draft || meter.draft || !calls.some(isDraftCall)) return false;
      meter.draft = { effort: draft, by: "call" };
      messages.push(effortMessage(draft));
      return true;
    },
  };
}
