/** Models: ids. */

/**
 * Which model each purpose asks, said once (scorecard move 10; defect 54).
 *
 * Before this, six model ids sat in ten files, each with its own timeout and retries, and one of them (the reach-out
 * reads) repeated another's literal. A purpose is a reason the platform spends its model key: the receptionist's
 * answer, Ask's round, a review's reply, the lead judge, a note, a reach-out's opening and its reading. Each has one
 * route: the model it asks, the model it asks once more when that one is overloaded or down, how long a try may take,
 * how many tries a "not now" earns, and how many tokens an answer may write. The model port
 * (packages/channels/src/ai/anthropic.ts) reads the route; nothing else names a model.
 *
 * A fallback is asked only for an answer that never came (a 529, a 5xx or a try that ran out of time) or for a model
 * the API does not know (a 404: a variable's misspelt name, an id since retired). A refusal, a bad request or a 429 is
 * the answer. Ask's model is whatever its deployment names (ASK_MODEL: any Claude model, ask/model.ts), and a model that
 * is not the route's own falls back to the route's: a deployment that runs Ask on Sonnet falls back to Opus 5.5.
 *
 * A purpose whose answer is a closed set may also name a shadow port (`shadow`): a second model that is put the same
 * question beside the primary while its switch is on, in shadow (shadow.ts; decision 0023). It changes nothing a
 * customer receives.
 *
 * Retell's models are Retell's names for the models behind a call (voice-provision.ts): the provider's words, kept
 * here so every model the platform pays for is in one list.
 */

/**
 * The models the platform asks, by their API ids: the only place an id is written (model-registry.test.mjs). Haiku 5.5
 * (15 Oct 2026, the speed plan's step 1) asks the small reads since 30 Oct 2026; Haiku 4.5 and Opus 5 are asked by no
 * route since, and Sonnet 5 is a fallback alone. Each stays listed so a model a variable names is still priced.
 */
export const MODELS = {
  OPUS_5_5: "claude-opus-5-5",
  OPUS_5: "claude-opus-5",
  SONNET_5_5: "claude-sonnet-5-5",
  SONNET_5: "claude-sonnet-5",
  HAIKU_5_5: "claude-haiku-5-5",
  HAIKU_4_5: "claude-haiku-4-5-20251001",
} as const;

/** The same ids as a closed set: a new one is added above, with its price (usage.ts MODEL_PRICES). */
export const MODEL_IDS = [
  MODELS.OPUS_5_5,
  MODELS.OPUS_5,
  MODELS.SONNET_5_5,
  MODELS.SONNET_5,
  MODELS.HAIKU_5_5,
  MODELS.HAIKU_4_5,
] as const;

export type ModelId = (typeof MODEL_IDS)[number];

/**
 * How fast a model writes: at its standard speed, or in fast mode (Anthropic's research preview, the Claude API only:
 * up to 2.5 times the output tokens a second, at twice the price; usage.ts FAST_MODE_PRICES). A request asks for fast
 * mode with `speed: "fast"` in its body and FAST_MODE_BETA in its anthropic-beta header; standard is the request
 * that names no speed. Fast mode has its own rate limit, apart from the model's: the port asks a fast request that
 * limit refuses (a 429) once more at standard speed (channels ai/anthropic.ts).
 */
export const MODEL_SPEEDS = ["standard", "fast"] as const;

export type ModelSpeed = (typeof MODEL_SPEEDS)[number];

/** The beta a fast request names (Anthropic's fast mode page, read 15 Oct 2026). */
export const FAST_MODE_BETA = "fast-mode-2026-02-01";

/**
 * A thinking setting a request may name (`thinking.type`): adaptive (the model decides how much, the default of every
 * model here that thinks), between_tools (Sonnet 5.5's lowest: no thinking but between tool calls), or disabled.
 */
export const THINKING_TYPES = ["adaptive", "between_tools", "disabled"] as const;

export type ThinkingType = (typeof THINKING_TYPES)[number];

/**
 * What each model takes of the settings the gateway lets a request name (Anthropic's model pages and migration guide,
 * read 15 Oct 2026): the thinking types it accepts, whether it runs fast mode, and whether it takes an effort said in
 * its messages (ai/effort.ts). The port sends a model only what it takes (channels ai/anthropic.ts), so a fallback
 * asked with a request written for another model still answers: Opus 5.5's fast request falls back to Sonnet 5 at
 * standard speed, Sonnet 5.5's `between_tools` to Opus 5.5 thinking as it does, and Opus 5.5's effort messages to
 * Sonnet 5 as the request's own effort.
 *
 * Haiku 5.5 also refuses three things no route sends it: a server-side `fallbacks` list (its refusals have no fallback;
 * the lead judge's `fallbacks: "default"` is taken and does nothing), an assistant prefill (Ask's requests end on the
 * person's turn), and a temperature other than its default (Ask sends none, ask/model.ts). Our routes fall back in our
 * own code (MODEL_ROUTES), so none of them changes anything here.
 */
export interface ModelTakes {
  thinking: readonly ThinkingType[];
  fast: boolean;
  /** An effort message (ai/effort.ts, per-message effort): the API refuses one to a model without ("per-turn effort"). */
  effortMessages: boolean;
  /**
   * A words message (ai/words-message.ts, a mid-conversation system message): the models the API's guide names, read
   * 16 Oct 2026; another is refused one ("role 'system' is not supported on this model") and is sent the words in the
   * person's turn instead.
   */
  systemMessages: boolean;
}

export const { OPUS_5_5, OPUS_5, SONNET_5_5, SONNET_5, HAIKU_5_5, HAIKU_4_5 } = MODELS;

export const MODEL_TAKES: Record<ModelId, ModelTakes> = {
  // Thinking can't be turned off on Opus 5.5: effort is its only control.
  [OPUS_5_5]: { thinking: ["adaptive"], fast: true, effortMessages: true, systemMessages: true },
  [OPUS_5]: { thinking: ["adaptive", "disabled"], fast: true, effortMessages: true, systemMessages: true },
  // Sonnet 5.5 takes an effort message only while it thinks: never beside `between_tools`, which no route sends.
  [SONNET_5_5]: { thinking: ["adaptive", "between_tools"], fast: false, effortMessages: true, systemMessages: true },
  [SONNET_5]: { thinking: ["adaptive", "disabled"], fast: false, effortMessages: false, systemMessages: false },
  // Haiku 5.5 takes `disabled` at effort high or below: what a route with its thinking off sends it (routeThinkingFor).
  [HAIKU_5_5]: { thinking: ["adaptive", "disabled"], fast: false, effortMessages: true, systemMessages: false },
  // Haiku 4.5 thinks only on a token budget, which no route sends: it runs without.
  [HAIKU_4_5]: { thinking: ["disabled"], fast: false, effortMessages: false, systemMessages: false },
};

/** What a model takes; null for one the registry does not list (a variable's), which is sent what it is asked. */
export function modelTakes(model: string): ModelTakes | null {
  return (MODEL_TAKES as Record<string, ModelTakes>)[model] ?? null;
}

/** Whether a model runs fast mode: the registry's word, and no for a model it does not list. */
export function hasFastMode(model: string): boolean {
  return modelTakes(model)?.fast === true;
}
