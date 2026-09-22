/**
 * What the receptionist says back, as a record and not just a string.
 *
 * The brain used to return text with a handoff token hidden in it, and
 * nothing else: no reading of what the customer wanted, no sense of how sure
 * it was, no trace of which fact it leaned on. Every "why did it say that?"
 * had to be guessed from the words. This is the shape it answers in now,
 * constrained by the API (output_config.format), validated here, carried on
 * the message row's meta, and read by the Inbox.
 *
 * Kept to what a salon owner can act on: the intent names the class of
 * question, the confidence drives the hold-for-review dial, the reason is one
 * sentence for the rail, the facts are what to check when the answer is
 * wrong.
 */
import { z } from "zod";

export const BRAIN_INTENTS = [
  "booking",
  "pricing",
  "hours",
  "services",
  "location",
  "complaint",
  "smalltalk",
  "other",
] as const;
export type BrainIntent = (typeof BRAIN_INTENTS)[number];

export const INTENT_LABELS: Record<BrainIntent, string> = {
  booking: "Booking",
  pricing: "Pricing question",
  hours: "Hours",
  services: "Services",
  location: "Location",
  complaint: "Complaint",
  smalltalk: "Small talk",
  other: "Other",
};

export const BRAIN_LANGUAGES = ["en", "es", "other"] as const;

/**
 * The JSON Schema the API constrains decoding to. Only what the API supports:
 * no numeric ranges, no length limits, no nullable unions — those are checked
 * by the zod schema below after the fact, and clamped rather than refused.
 */
export const BRAIN_OUTPUT_JSON_SCHEMA = {
  type: "object",
  properties: {
    reply: {
      type: "string",
      description:
        "Exactly what the customer receives, in their language, in the receptionist's voice. Nothing else goes here.",
    },
    intent: {
      type: "string",
      enum: [...BRAIN_INTENTS],
      description: "What the customer is after.",
    },
    escalate: {
      type: "boolean",
      description:
        "True when a person should take over now: they asked for one, you cannot help, or a rule you were given says so.",
    },
    reason: {
      type: "string",
      description:
        "One short sentence: why a person is needed, or why this answer might be wrong. Empty when neither applies.",
    },
    confidence: {
      type: "number",
      description: "How sure you are that this reply is right and complete for this customer, from 0 to 1.",
    },
    facts_used: {
      type: "array",
      items: { type: "string" },
      description:
        "The business facts this reply relied on, each in a few words (an hour, a service, a note). Empty when none.",
    },
    language: {
      type: "string",
      enum: [...BRAIN_LANGUAGES],
      description: "The language the reply is written in.",
    },
  },
  required: ["reply", "intent", "escalate", "reason", "confidence", "facts_used", "language"],
  additionalProperties: false,
} as const;

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

/**
 * What a message row remembers about its own reasoning. Written by the edge
 * beside source/delay_ms; read back by the Inbox through the meta the DTO
 * already carries.
 */
export interface BrainMeta {
  intent: BrainIntent;
  confidence: number;
  reason: string;
  facts_used: string[];
  language: (typeof BRAIN_LANGUAGES)[number];
  model: string;
}

export function brainMetaOf(out: BrainOutput, model: string): BrainMeta {
  return {
    intent: out.intent,
    confidence: Math.round(out.confidence * 100) / 100,
    reason: out.reason,
    facts_used: out.facts_used,
    language: out.language,
    model,
  };
}

/** The rail beside a reply: why it said what it said. */
export interface ReplyWhyVM {
  intent: BrainIntent;
  intentLabel: string;
  /** 0–100, or null when the row predates this. */
  confidence: number | null;
  reason: string | null;
  facts: string[];
  /** Why the draft is waiting, when it is. */
  heldFor: "low_confidence" | "veto_window" | null;
  /** One line for a chip: "Pricing question · 62% sure". */
  summary: string;
}

/** From a message row's meta; null when the row carries no reasoning. */
export function replyWhy(meta: Record<string, unknown> | null | undefined): ReplyWhyVM | null {
  if (!meta || typeof meta !== "object") return null;
  const intent = (BRAIN_INTENTS as readonly string[]).includes(String(meta.intent))
    ? (meta.intent as BrainIntent)
    : null;
  const conf =
    typeof meta.confidence === "number" && Number.isFinite(meta.confidence)
      ? Math.round(Math.min(1, Math.max(0, meta.confidence)) * 100)
      : null;
  if (intent === null && conf === null) return null;
  const facts = Array.isArray(meta.facts_used)
    ? (meta.facts_used as unknown[]).filter((f): f is string => typeof f === "string" && !!f.trim())
    : [];
  const reason = typeof meta.reason === "string" && meta.reason.trim() ? meta.reason.trim() : null;
  const source = typeof meta.source === "string" ? meta.source : null;
  const heldFor = source === "low_confidence" ? "low_confidence" : source === "veto_window" ? "veto_window" : null;
  const label = intent ? INTENT_LABELS[intent] : "Reply";
  return {
    intent: intent ?? "other",
    intentLabel: label,
    confidence: conf,
    reason,
    facts,
    heldFor,
    summary: conf === null ? label : `${label} · ${conf}% sure`,
  };
}

/** The confidence dial, as the Autonomy pane offers it. 0 means off. */
export const CONFIDENCE_STEPS = [0, 0.6, 0.75, 0.9] as const;
