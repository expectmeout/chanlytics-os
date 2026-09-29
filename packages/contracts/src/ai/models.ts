/**
 * Which model each purpose asks, said once (scorecard move 10; defect 54).
 *
 * Before this, six model ids sat in ten files, each with its own timeout and retries, and one of them (the reach-out
 * reads) repeated another's literal. A purpose is a reason the platform spends its model key: the receptionist's
 * answer, Ask's round, a review's reply, the lead judge, a note, a reach-out's opening and its reading. Each has one
 * route: the model it asks, the model it asks once more when that one is overloaded or down, how long a try may take,
 * how many tries a "not now" earns, and how many tokens an answer may write. The model port
 * (packages/channels/src/anthropic.ts) reads the route; nothing else names a model.
 *
 * A fallback is asked only for an answer that never came: a 529, a 5xx or a try that ran out of time. A refusal, a
 * bad request or a 429 is the answer. Ask's pair swaps: a deployment that runs Ask on Sonnet 5 (ASK_MODEL) falls back
 * to Opus 5.5.
 *
 * Retell's models are Retell's names for the models behind a call (voice-provision.ts): the provider's words, kept
 * here so every model the platform pays for is in one list.
 */

/** The models the platform asks, by their API ids: the only place an id is written (model-registry.test.mjs). */
export const MODELS = {
  OPUS_5_5: "claude-opus-5-5",
  OPUS_5: "claude-opus-5",
  SONNET_5: "claude-sonnet-5",
  HAIKU_4_5: "claude-haiku-4-5-20251001",
} as const;
/** The same ids as a closed set: a new one is added above, with its price (usage.ts MODEL_PRICES). */
export const MODEL_IDS = [MODELS.OPUS_5_5, MODELS.OPUS_5, MODELS.SONNET_5, MODELS.HAIKU_4_5] as const;
export type ModelId = (typeof MODEL_IDS)[number];

const { OPUS_5_5, OPUS_5, SONNET_5, HAIKU_4_5 } = MODELS;

/** Why the platform spends its model key. The usage ledger (ai_usage.purpose) keeps these words. */
export const MODEL_PURPOSES = [
  "receptionist",
  "reply_draft",
  "ask",
  "lead_json",
  "template_draft",
  "review_reply",
  "lead_judge",
  "note_suggest",
  "reach_out_check",
  "reply_read",
] as const;
export type ModelPurpose = (typeof MODEL_PURPOSES)[number];

export interface ModelRoute {
  model: ModelId;
  /** Asked once when the model's answer never came (529, 5xx, a timeout); null when the purpose waits instead. */
  fallback: ModelId | null;
  /** One try's bound. */
  timeoutMs: number;
  /** Tries after the first on a "not now" (408, 429, a connection that never opened). */
  retries: number;
  /** The most one answer may write. */
  maxTokens: number;
}

/**
 * The receptionist's try: inside a sixty-second webhook that must still persist, send and escalate. The first try and
 * the fallback's together stay at forty seconds, the two SDK attempts it had before.
 */
const RECEPTIONIST_TRY_MS = 20_000;
/** Ask's round: the edge's door stops at sixty seconds (vercel.json). */
const ASK_TRY_MS = 55_000;
/** The dashboard's small drafts: the edge's door stops at a minute. */
const DRAFT_TRY_MS = 55_000;
/** A Google review's reply: a person may be waiting in Reports. */
const REVIEW_TRY_MS = 15_000;
/** The lead judge: inside a job whose margin core keeps (core/leads/judge.ts JUDGE_TIMEOUT_MS reads this). */
const JUDGE_TRY_MS = 28_000;
/** A note's look: a sweep, nobody waiting. */
const NOTE_TRY_MS = 20_000;
/** A reach-out's opening check and a reply's reading: each inside a tick or a job with its own deadline. */
const READ_TRY_MS = 8_000;

export const MODEL_ROUTES = {
  receptionist: { model: OPUS_5, fallback: SONNET_5, timeoutMs: RECEPTIONIST_TRY_MS, retries: 1, maxTokens: 900 },
  reply_draft: { model: OPUS_5, fallback: SONNET_5, timeoutMs: RECEPTIONIST_TRY_MS, retries: 1, maxTokens: 900 },
  ask: { model: OPUS_5_5, fallback: SONNET_5, timeoutMs: ASK_TRY_MS, retries: 0, maxTokens: 4000 },
  lead_json: { model: SONNET_5, fallback: OPUS_5, timeoutMs: DRAFT_TRY_MS, retries: 0, maxTokens: 2000 },
  template_draft: { model: SONNET_5, fallback: OPUS_5, timeoutMs: DRAFT_TRY_MS, retries: 0, maxTokens: 900 },
  review_reply: { model: SONNET_5, fallback: OPUS_5, timeoutMs: REVIEW_TRY_MS, retries: 1, maxTokens: 300 },
  // The judge's own rescue is the API's server-side fallback (decision 14); an overload is the jobs ledger's retry.
  lead_judge: { model: OPUS_5, fallback: null, timeoutMs: JUDGE_TRY_MS, retries: 0, maxTokens: 6000 },
  note_suggest: { model: HAIKU_4_5, fallback: SONNET_5, timeoutMs: NOTE_TRY_MS, retries: 1, maxTokens: 300 },
  reach_out_check: { model: HAIKU_4_5, fallback: SONNET_5, timeoutMs: READ_TRY_MS, retries: 0, maxTokens: 400 },
  reply_read: { model: HAIKU_4_5, fallback: SONNET_5, timeoutMs: READ_TRY_MS, retries: 0, maxTokens: 400 },
} as const satisfies Record<ModelPurpose, ModelRoute>;

/** A purpose's route. */
export function modelRoute(purpose: ModelPurpose): ModelRoute {
  return MODEL_ROUTES[purpose] as ModelRoute;
}

/**
 * The model asked once more when `asked` gave no answer, for this purpose: the route's fallback, or its model when
 * the fallback is what was asked (Ask's pair swaps). Null when there is none, or it is the model that just failed.
 */
export function fallbackModel(purpose: ModelPurpose, asked: string): ModelId | null {
  const r = modelRoute(purpose);
  if (!r.fallback) return null;
  const next = asked === r.fallback ? r.model : r.fallback;
  return next === asked ? null : next;
}

/** Whether a string is one of the platform's model ids. */
export function isModelId(v: unknown): v is ModelId {
  return typeof v === "string" && (MODEL_IDS as readonly string[]).includes(v);
}

/** The models behind a phone call, in Retell's own names (voice-provision.ts): its language model and its analysis. */
export const RETELL_MODELS = { llm: "claude-4.5-haiku", analysis: "gpt-4.1" } as const;
