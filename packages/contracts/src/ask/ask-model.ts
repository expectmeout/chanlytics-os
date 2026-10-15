/**
 * The model Ask runs on, as a profile.
 *
 * Ask is built model-agnostic (the spec, 5.11): the turn, the tools, the
 * prompt and the store know nothing of the model but its name and the effort
 * it is asked at. Neither is written in the code. The dashboard reads both
 * from its environment (server/ask/model.ts): ASK_MODEL, any Claude model's
 * id, and ASK_EFFORT, one of MODEL_EFFORTS; unset, or reading as neither, is
 * the default below. So trying a model is one variable and a redeploy, never
 * a change to a list (opened 5 Oct 2026, Ruben: "we should be model agnostic
 * so that I can quickly try different models"; until then the name was one of
 * two). The edge gateway lets Ask name any model that reads as one
 * (ask-gateway.ts), and a name the API does not know is asked of the route's
 * own model instead (ai/models.ts fallbackModel; the port's 404 rule), so a
 * misspelt variable costs a round trip and a warning, never Ask. A request
 * that names no model gets the edge's own fallback (GATEWAY_FALLBACK_MODEL),
 * for a dashboard older than the profile, never this default.
 *
 * Fast mode is on by default (Ruben, 15 Oct 2026: "lets never focus on cost
 * rather then efficiency"): every round of a model that runs it (ai/models.ts
 * hasFastMode: Opus 5.5 and Opus 5) is asked at `speed: "fast"`, typed and
 * spoken alike, at twice the price (ai/usage.ts FAST_MODE_PRICES). ASK_SPEED
 * =standard turns it off without a code change; a model without fast mode runs
 * at standard whatever it says. The warm asks at the turn's speed, since a
 * cache written at one speed is not read at the other.
 *
 * The answer may be written through a tool (ASK_ANSWER_TOOL=on, off by default
 * until its eval arm says on; 15 Oct 2026): an `answer` tool whose input is the
 * answer's format, its input streamed as it is written (server/ask/tools
 * answer.ts). On Opus 5.5 text written after a tool result arrives in one burst
 * at the end of the round, so a turn that read before answering never streamed
 * its Say; a tool's input streams. The format stays on beside it, so an answer
 * written as text is read as it always was.
 *
 * A model the registry prices (ai/usage.ts MODEL_PRICES) has its dollars in
 * the ledger; one it does not is run all the same and its dollars are left
 * unsaid, never guessed. The day's cap counts tokens, so it holds either way.
 *
 * Opus 5.5 is the default by Ruben's decision at approval (25 Sep 2026). On
 * the Line's gate (23 Sep, spec 8.3: three runs each, low effort on both) it
 * wrote its first words a second sooner than Sonnet 5 (2.3 s against 3.2 s
 * median) and answered in one round far more often (25 of 28 against 14), at
 * $0.012 a turn against $0.010; it lost that gate on grounding (24, 23, 22 of
 * 28 against Sonnet 5's 27 every run: a read skipped and an unread row cited,
 * a card claimed twice that it had not proposed). The rewire addresses
 * exactly those conditions; a must-never case that fails on one model and
 * passes on another is reported the day it is seen, never reverted in silence.
 *
 * What the loop guarantees, so that any current Claude model takes its
 * requests: tool_choice is auto or none and never any or a named tool (a 400
 * on Opus 5.5 and Sonnet 5.5); no `thinking` field is sent, so each model
 * thinks as it does by default, and its thinking blocks go back exactly as
 * they came (round.ts replayBlocks); the effort is the same on every round;
 * no sampling parameter is sent; the round ceiling is one number the edge
 * also clamps to (ASK_MAX_TOKENS). A thread whose earlier turns ran on
 * another model is replayed as words, never as that model's blocks
 * (memory.ts replayFor).
 */
import {
  MODEL_EFFORTS,
  MODEL_ROUTES,
  hasFastMode,
  readsAsModel,
  type ModelEffort,
  type ModelSpeed,
} from "../ai/models";

export interface AskModelProfile {
  /** The model's id as the API takes it: the registry's, or any other a deployment names. */
  id: string;
  /** The effort every round is asked at, identical on every round of a thread: a change mid-thread misses the cache. */
  effort: ModelEffort;
  /** The speed every round is asked at: fast mode where the model runs it and ASK_SPEED does not say standard. */
  speed: ModelSpeed;
  /** The answer is written through the answer tool, its input streamed (ASK_ANSWER_TOOL on), else as text in its format. */
  answerTool: boolean;
}

/** The default model: the one a deployment runs when its environment names none (the registry's, ai/models.ts). */
export const ASK_MODEL = MODEL_ROUTES.ask.model;
/** The default effort: low, what the gate was run at and production has answered at since. */
export const ASK_EFFORT: ModelEffort = "low";
/** The default speed: fast, on a model that runs it (Ruben, 15 Oct 2026). ASK_SPEED=standard is the switch off. */
export const ASK_SPEED: ModelSpeed = "fast";
/** The answer tool's switch, as ASK_ANSWER_TOOL says it: on writes the answer through the tool; anything else is off. */
const ANSWER_TOOL_ON = "on";

/**
 * The profile four variables pick: the model `name` reads as, else the default; the effort `effort` is, else the
 * default; fast mode unless `speed` says standard, on a model that runs it; the answer tool where `answer` says on.
 * Never a throw: a variable that reads as nothing runs the default, and the caller says so.
 */
export function askModelProfile(
  name: string | null | undefined,
  effort?: string | null,
  speed?: string | null,
  answer?: string | null,
): AskModelProfile {
  const named = (name ?? "").trim();
  const id = readsAsModel(named) ? named : ASK_MODEL;
  const asked = (effort ?? "").trim();
  const wanted: ModelSpeed = (speed ?? "").trim() === "standard" ? "standard" : ASK_SPEED;
  return {
    id,
    effort: (MODEL_EFFORTS as readonly string[]).includes(asked) ? (asked as ModelEffort) : ASK_EFFORT,
    speed: wanted === "fast" && hasFastMode(id) ? "fast" : "standard",
    answerTool: (answer ?? "").trim() === ANSWER_TOOL_ON,
  };
}
