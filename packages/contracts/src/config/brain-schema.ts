/**
 * The receptionist's answer as the model writes it, and how it is read (parseBrainOutput), apart from brain.ts's
 * words. zod is not built into the browser's contracts (decision 0024, the browser's entry): a page that says these
 * words loads none of it.
 */
import { z } from "zod";
import { BRAIN_INTENTS, BRAIN_LANGUAGES } from "./brain";

/** The read side: tolerant of what a model might still do, strict about shape. */
export const BrainOutputSchema = z.object({
  reply: z.string(),
  intent: z.enum(BRAIN_INTENTS).catch("other"),
  escalate: z.boolean().catch(false),
  reason: z
    .string()
    .catch("")
    .transform((s) => s.trim().slice(0, 300)),
  confidence: z
    .number()
    .catch(0)
    .transform((n) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0)),
  facts_used: z
    .array(z.string())
    .catch([])
    .transform((a) =>
      a
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 5)
        .map((s) => s.slice(0, 80)),
    ),
  language: z.enum(BRAIN_LANGUAGES).catch("other"),
});

export type BrainOutput = z.infer<typeof BrainOutputSchema>;

/**
 * Parse what the model returned. With constrained decoding the JSON is well
 * formed unless the answer was cut off by max_tokens; a truncated document
 * fails here and the caller falls back to the holding reply, as it always
 * did for a capped answer.
 */
export function parseBrainOutput(raw: string): { ok: true; value: BrainOutput } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: `not JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  const r = BrainOutputSchema.safeParse(json);
  if (!r.success)
    return { ok: false, error: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  if (!r.data.reply.trim()) return { ok: false, error: "empty reply" };
  return { ok: true, value: r.data };
}
