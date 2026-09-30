/**
 * The model Ask runs on, as a profile.
 *
 * Ask is built model-agnostic (the spec, 5.11): the turn, the tools, the
 * prompt and the store know nothing of the model but its name and the effort
 * it is asked at. What differs between the models Ask may name lives here,
 * once, so a switch is one environment variable and a redeploy, never a code
 * change. The dashboard picks the profile (server/ask/model.ts: ASK_MODEL in
 * its environment, this list's default when unset or unknown) and names it in
 * every request; the edge gateway allows the same names (GATEWAY_MODELS is
 * built from this list), so the two cannot drift apart. A request that names
 * no model gets the edge's own fallback (GATEWAY_FALLBACK_MODEL), for a
 * dashboard older than this profile, never this list's default.
 *
 * Opus 5.5 is the default by Ruben's decision at approval (25 Sep 2026). On
 * the Line's gate (23 Sep, spec 8.3: three runs each, low effort on both) it
 * wrote its first words a second sooner (2.3 s against 3.2 s median) and
 * answered in one round far more often (25 of 28 against 14), at $0.012 a
 * turn against $0.010; it lost that gate on grounding (24, 23, 22 of 28
 * against Sonnet 5's 27 every run: a read skipped and an unread row cited, a
 * card claimed twice that it had not proposed). The rewire addresses exactly
 * those conditions, and the gate re-runs on both models at every phase as a
 * confirmation; a must-never case that fails here and passes on Sonnet 5 is
 * reported the day it is seen, never reverted in silence.
 *
 * What the loop guarantees for every profile: tool_choice is auto or none and
 * never any or a named tool (a 400 on Opus 5.5); thinking blocks go back
 * exactly as they came (round.ts replayBlocks); the effort is the same on
 * every round; no sampling parameter is sent; the round ceiling is one number
 * the edge also clamps to (ASK_MAX_TOKENS).
 */
import { MODELS, MODEL_ROUTES } from "../ai/models";

export const ASK_MODELS = [MODEL_ROUTES.ask.model, MODEL_ROUTES.ask.fallback] as const;
export type AskModelId = (typeof ASK_MODELS)[number];

export interface AskModelProfile {
  id: AskModelId;
  /** The effort every round is asked at, identical on every round of a thread: a change mid-thread misses the cache. */
  effort: "low" | "medium";
  /**
   * Whether the model takes a forced tool choice (`any` or a named tool). Ask
   * sends `auto` and `none` only, which every model here accepts; recorded so
   * a change to the loop's choices is checked against the list, not found as
   * a 400 on production.
   */
  forcedToolChoice: boolean;
  /**
   * "always": the model thinks on every round and cannot be told not to;
   * "adaptive": it decides. Either way its blocks go back unmodified.
   */
  thinking: "always" | "adaptive";
}

export const ASK_MODEL_PROFILES: Record<AskModelId, AskModelProfile> = {
  [MODELS.OPUS_5_5]: { id: MODELS.OPUS_5_5, effort: "low", forcedToolChoice: false, thinking: "always" },
  [MODELS.SONNET_5]: { id: MODELS.SONNET_5, effort: "low", forcedToolChoice: true, thinking: "adaptive" },
};

/** The default: the profile a deployment runs when its environment names none (the registry's, ai/models.ts). */
export const ASK_MODEL: AskModelId = MODEL_ROUTES.ask.model;

/** The profile a name picks: one of the list, else the default. Never a throw: a misspelt variable runs the default. */
export function askModelProfile(name: string | null | undefined): AskModelProfile {
  const id = (ASK_MODELS as readonly string[]).includes(name ?? "") ? (name as AskModelId) : ASK_MODEL;
  return ASK_MODEL_PROFILES[id];
}
