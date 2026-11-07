/**
 * The models that hear for us (decision 0099, stage B, D15 and D16). Claude takes no audio, so a video's words and how it sounds
 * come from models that can listen: Google's Gemini, and ElevenLabs' Scribe where it wins the words' trial. Every call of theirs
 * is written to the same ledger as Anthropic's (00556 widens ai_usage's purpose and port), priced here, so what hearing costs
 * sits beside what looking costs.
 *
 * Which model hears is a setting each (VIDEO_WORDS_MODEL, VIDEO_EAR_MODEL), so the trial's winner is a variable and never a
 * change of code.
 */
import { MODEL_PORTS, MODEL_PURPOSES } from "./models";
import type { AiUsageBody, ModelCallOutcome } from "./usage";

/** Why a hearing model's key is spent: what a clip says, and how it sounds (at its digest, or on a question of Ask's). */
const HEARING_PURPOSES = ["file_words", "file_hear"] as const;
export type HearingPurpose = (typeof HEARING_PURPOSES)[number];

/** The ports a hearing call leaves by. */
const HEARING_PORTS = ["google", "elevenlabs"] as const;
export type HearingPort = (typeof HEARING_PORTS)[number];

/** Every purpose the ledger keeps (ai_usage.purpose): Anthropic's routes, then the hearing models'. */
export const AI_USAGE_PURPOSES = [...MODEL_PURPOSES, ...HEARING_PURPOSES] as const;
export type AiUsagePurpose = (typeof AI_USAGE_PURPOSES)[number];
/** Every port the ledger keeps (ai_usage.port). */
export const AI_USAGE_PORTS = [...MODEL_PORTS, ...HEARING_PORTS] as const;
export type AiUsagePort = (typeof AI_USAGE_PORTS)[number];

/** The hearing models, by their API ids: the only place one is written. */
export const HEARING_MODELS = {
  GEMINI_FLASH_LITE: "gemini-3.5-flash-lite",
  GEMINI_FLASH: "gemini-3.8-flash",
  SCRIBE: "scribe_v2",
} as const;

/**
 * Gemini's list prices, dollars per million tokens (Google's pricing page, read 7 Nov 2026): audio in at the input price, the
 * answer and its thinking out. 3.8 Flash's are its prices to 31 December 2026; from 1 January 2027 they double ($1.50, $7.50).
 */
const GEMINI_PRICES: Readonly<Record<string, { input: number; output: number }>> = {
  [HEARING_MODELS.GEMINI_FLASH_LITE]: { input: 0.3, output: 2.5 },
  [HEARING_MODELS.GEMINI_FLASH]: { input: 0.75, output: 3.75 },
};
/** Scribe's price by the hour of audio, on every plan (ElevenLabs' API pricing page, read 7 Nov 2026). */
const SCRIBE_DOLLARS_PER_HOUR = 0.22;

/** The words' shapes (D8): one Gemini call that answers the words and the note together, or Scribe for the words. */
const VIDEO_WORDS_SHAPES = ["gemini", "scribe"] as const;
export type VideoWordsShape = (typeof VIDEO_WORDS_SHAPES)[number];

/** The words' shape a setting names; unset or unknown is the one-call shape, the cheapest. */
export const videoWordsShapeOf = (value: unknown): VideoWordsShape =>
  typeof value === "string" && (VIDEO_WORDS_SHAPES as readonly string[]).includes(value.trim().toLowerCase())
    ? (value.trim().toLowerCase() as VideoWordsShape)
    : "gemini";

/** The ear's model a setting names: anything that reads as a Gemini model's id, else Flash-Lite. */
export const videoEarModelOf = (value: unknown): string =>
  typeof value === "string" && /^gemini-[a-z0-9][a-z0-9.-]{0,62}$/.test(value.trim())
    ? value.trim()
    : HEARING_MODELS.GEMINI_FLASH_LITE;

/** A hearing call's dollars at list price: tokens for Gemini, seconds of audio for Scribe; null for a model with no price here. */
export function hearingDollars(
  model: string,
  used: { input: number; output: number; seconds?: number },
): number | null {
  if (model === HEARING_MODELS.SCRIBE) {
    const seconds = Math.max(0, used.seconds ?? 0);
    return Math.round((seconds / 3600) * SCRIBE_DOLLARS_PER_HOUR * 1_000_000) / 1_000_000;
  }
  const p = GEMINI_PRICES[model];
  if (!p) return null;
  return Math.round(((used.input * p.input + used.output * p.output) / 1_000_000) * 1_000_000) / 1_000_000;
}

/** One hearing call's row of the ledger. */
export function hearingUsageBodyOf(call: {
  tenantId: string;
  purpose: HearingPurpose;
  port: HearingPort;
  model: string;
  outcome: ModelCallOutcome;
  input: number;
  output: number;
  /** Seconds of audio heard, for a model priced by the hour. */
  seconds?: number;
  userId?: string | null;
  subjectId?: string | null;
  error?: { type: string; message: string } | null;
}): AiUsageBody {
  return {
    tenant_id: call.tenantId,
    purpose: call.purpose,
    model_asked: call.model,
    model: call.model,
    outcome: call.outcome,
    input_tokens: Math.max(0, Math.round(call.input)),
    output_tokens: Math.max(0, Math.round(call.output)),
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    usd: hearingDollars(call.model, { input: call.input, output: call.output, seconds: call.seconds ?? 0 }),
    prompt_hash: null,
    user_id: call.userId ?? null,
    subject_id: call.subjectId ?? null,
    port: call.port,
    ...(call.error
      ? {
          error_type: call.error.type.slice(0, 80) || null,
          error_message: call.error.message.slice(0, 300) || null,
        }
      : {}),
  };
}
