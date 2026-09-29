/**
 * TypeSafe's System One API, as this platform speaks it, in shadow (scorecard move 10, step 12; decision 0023).
 *
 * A System One model (Jev) makes calibrated decisions rather than text: it is handed a state and typed questions and
 * answers each with a probability. `POST https://api.typesafe.ai/v1/systemone`, a bearer key, a body of
 * `{ state, model, questions }` where `questions` is a map of named questions, and an answer of
 * `{ model, answers, usage }` with one answer per question under the same name. Three kinds of question:
 *
 *   noul    a yes or a no: answered with the probability of yes (0 to 1);
 *   choice  one of a set of options: answered with the choice, every option's probability and its confidence;
 *   score   a place on an ordered rubric: answered with a score, the legend, the probabilities and the confidence.
 *
 * The shapes are written here once: channels' adapter (models/typesafe.ts) sends and reads them, and the edge's shadow
 * (lib/shadow.ts) compares the answers with the primary's. The model is pinned to a version, never an alias, so a week
 * of agreement data is about one model. Text only, English-best; a request is bounded at 64,000 tokens, 32,000 of them
 * for the state and the longest question. The price is on input tokens alone: output is free.
 */
import { z } from "zod";

/** The one model asked, by its versioned id. An alias would change under a week of data. */
export const SYSTEM_ONE_MODEL = "jev-1.13.0";
/** Dollars per million input tokens (TypeSafe's list, read 29 September 2026); output tokens are free. */
export const SYSTEM_ONE_INPUT_USD_PER_MILLION = 0.042;
/** How much of a state is sent: well inside the 32,000 tokens a state and its longest question may share. */
export const SYSTEM_ONE_STATE_MAX_CHARS = 20_000;

/** A question, as the API takes it. */
export type SystemOneQuestion =
  | { type: "noul"; instructions: string; criteria?: { true: string; false: string } }
  | { type: "choice"; instructions: string; criteria: Record<string, string | null> }
  | { type: "score"; instructions: string; criteria: string[] };

/** A request: the state, the pinned model and the named questions. */
export interface SystemOneRequest {
  state: string;
  model: string;
  questions: Record<string, SystemOneQuestion>;
}

const Probability = z.number().min(0).max(1);

const SystemOneAnswerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("noul"), noul: Probability }),
  z.object({
    type: z.literal("choice"),
    choice: z.string(),
    probabilities: z.record(z.string(), Probability),
    confidence: Probability,
  }),
  z.object({
    type: z.literal("score"),
    score: z.number(),
    legend: z.record(z.string(), z.unknown()),
    probabilities: z.record(z.string(), Probability),
    confidence: Probability,
  }),
]);
/** One question's answer, by its kind. */
export type SystemOneAnswer = z.infer<typeof SystemOneAnswerSchema>;

const SystemOneResponseSchema = z.object({
  /** The versioned id of the model that answered. */
  model: z.string().min(1),
  answers: z.record(z.string(), SystemOneAnswerSchema),
  usage: z.object({ input_tokens: z.number().int().min(0), output_tokens: z.number().int().min(0).optional() }),
});
export type SystemOneResponse = z.infer<typeof SystemOneResponseSchema>;

/** The API's answer read into its shape; a body that is not one is said, never half-read. */
export function parseSystemOneResponse(
  raw: unknown,
): { ok: true; value: SystemOneResponse } | { ok: false; error: string } {
  const r = SystemOneResponseSchema.safeParse(raw);
  if (r.success) return { ok: true, value: r.data };
  return { ok: false, error: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
}

/** The dollars a call's input tokens came to, to a millionth of a dollar (the ledger's precision). */
export function systemOneDollars(inputTokens: number): number {
  return Math.round(inputTokens * SYSTEM_ONE_INPUT_USD_PER_MILLION) / 1_000_000;
}

/** A state as it is sent: the text, trimmed, and no more than the limit. */
export function systemOneState(text: string): string {
  return text.trim().slice(0, SYSTEM_ONE_STATE_MAX_CHARS);
}
