/**
 * What a model call cost: its tokens by kind, and their price at the models' list prices (scorecard move 10; category
 * 39, metering). Every model call the platform makes is written once, through one writer (packages/db ai-usage.ts
 * recordModelUsage), as one row of the kept ledger (00273 ai_usage); this module is the row's shape and its dollars.
 *
 * Tokens come in four kinds and each has its own price: uncached input, output, a five-minute cache write and a cache
 * read. A budget that counted only input and output missed the writes (the scorecard, 29 September); the ledger keeps
 * all four and the dollars they came to.
 */
import { MODELS, type ModelId, type ModelPort, type ModelPurpose, type ModelSpeed } from "./models";

/**
 * One call's tokens, as the API counts them, and the speed it ran at when that was fast mode (the API's own
 * `usage.speed`): fast tokens have their own price (FAST_MODE_PRICES). A call at standard speed carries no `speed`.
 */
export interface ModelUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  speed?: "fast";
}

export const NO_USAGE: ModelUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

/** Dollars per million tokens of each kind. */
export interface ModelPrice {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

/**
 * The list prices (Anthropic's model table, read 29 September 2026; Sonnet 5 and Opus 5.5 as ops/ask-day.mjs has
 * carried them since 23 September; Sonnet 5.5 at Sonnet 5's, 5 October; Haiku 5.5 read 15 October). A cache write is
 * 1.25 times the input price, a read a tenth of it, but where the table names a read price (Opus 5.5 and Sonnet 5.5,
 * a twentieth) that price is kept. Haiku 5.5's row is its price for a prompt of up to 100,000 tokens, five times less
 * than above it; no route asks it a longer one. A model a variable names that has no row here is run all the same,
 * and its dollars are left unsaid (priceOf).
 */
export const MODEL_PRICES: Record<ModelId, ModelPrice> = {
  [MODELS.OPUS_5_5]: { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  [MODELS.OPUS_5]: { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  [MODELS.SONNET_5_5]: { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  [MODELS.SONNET_5]: { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  [MODELS.HAIKU_5_5]: { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
  [MODELS.HAIKU_4_5]: { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
};

/**
 * Fast mode's own prices (models.ts MODEL_SPEEDS), for the models that run it: twice the standard row, the cache's
 * multiples applied on top as the table says (Anthropic's pricing page, read 15 October 2026: Opus 5.5 fast $8 / $40,
 * Opus 5 fast $10 / $50).
 */
export const FAST_MODE_PRICES: Partial<Record<ModelId, ModelPrice>> = {
  [MODELS.OPUS_5_5]: { input: 8, output: 40, cacheWrite: 10, cacheRead: 0.4 },
  [MODELS.OPUS_5]: { input: 10, output: 50, cacheWrite: 12.5, cacheRead: 1 },
};

const PER_TOKEN = 1_000_000;

/** A price list's row for a model the API names: its own, or the row of the id it is a dated or undated form of. */
function priceRowOf(prices: Partial<Record<string, ModelPrice>>, model: string): ModelPrice | null {
  const own = prices[model];
  if (own) return own;
  const bare = model.replace(/-\d{8}$/, "");
  for (const [id, price] of Object.entries(prices)) {
    if (price && id.replace(/-\d{8}$/, "") === bare) return price;
  }
  return null;
}

/**
 * The price of a model the API names in its answer, at the speed it ran: its own row, or the row of the id it is a
 * dated or undated form of (the API may answer `claude-haiku-4-5` for a request that named its dated id, and the
 * reverse); a fast call's from FAST_MODE_PRICES, and a model with no fast price at its standard one, which is what a
 * model without fast mode runs. Null when the platform has no price for it: the ledger then says so rather than guess.
 */
export function priceOf(model: string, speed: ModelSpeed = "standard"): ModelPrice | null {
  return (speed === "fast" ? priceRowOf(FAST_MODE_PRICES, model) : null) ?? priceRowOf(MODEL_PRICES, model);
}

/**
 * The dollars one call came to at list price, at the speed it ran, to a hundredth of a cent's hundredth; null when
 * the model has no price.
 */
export function usageDollars(model: string, u: ModelUsage): number | null {
  const p = priceOf(model, u.speed ?? "standard");
  if (!p) return null;
  const d =
    (u.input * p.input + u.output * p.output + u.cacheWrite * p.cacheWrite + u.cacheRead * p.cacheRead) / PER_TOKEN;
  return Math.round(d * 1_000_000) / 1_000_000;
}

/** Every token of a call, whatever its kind: what a day's cap counts. */
export function usageTokens(u: ModelUsage): number {
  return u.input + u.output + u.cacheRead + u.cacheWrite;
}

/** The API's own usage object read into the four kinds, and its speed when it says fast; a missing count is zero. */
export function usageOf(raw: unknown): ModelUsage {
  const u = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);
  return {
    input: n(u.input_tokens),
    output: n(u.output_tokens),
    cacheRead: n(u.cache_read_input_tokens),
    cacheWrite: n(u.cache_creation_input_tokens),
    ...(u.speed === "fast" ? { speed: "fast" as const } : {}),
  };
}

/**
 * What became of a call: answered; answered by the fallback; the model declined (its own refusal); the API refused
 * the request; no answer came; or an answer came that could not be read (cut at its cap, out of its shape). The last
 * four are what the health sweep counts per workspace (00273 ai_failures_hour).
 */
export const MODEL_CALL_OUTCOMES = [
  "answered",
  "fell_back",
  "refused",
  "rejected",
  "unreachable",
  "unreadable",
] as const;
export type ModelCallOutcome = (typeof MODEL_CALL_OUTCOMES)[number];

/** One row of the ledger, as the writer takes it (the wire: snake_case, as the table). */
export interface AiUsageBody {
  tenant_id: string;
  purpose: ModelPurpose;
  /** The model the purpose asked first. */
  model_asked: string;
  /** The model that answered: the fallback's when it answered, the API's own name for it. */
  model: string;
  outcome: ModelCallOutcome;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  /** List-price dollars; null when the model has no price here. */
  usd: number | null;
  /** The sha256 of what the model was told (its system and tools), when the caller keeps one. */
  prompt_hash: string | null;
  /** Who asked, when a person did (Ask, the drafts). */
  user_id: string | null;
  /** What the call was about: a conversation, a call, a send, a review. */
  subject_id: string | null;
  /**
   * A shadow call's own columns (00275; shadow.ts): the port it left by, and, for a question it answered, the label the
   * primary gave, the label the shadow gave, how sure it was, whether that cleared the line, and whether they agree.
   * A row the model port writes for the primary carries none of them.
   */
  port?: ModelPort;
  shadow?: boolean;
  question?: string | null;
  primary_answer?: string | null;
  shadow_answer?: string | null;
  shadow_confidence?: number | null;
  confident?: boolean | null;
  agrees?: boolean | null;
  /**
   * For a call that got no answer (rejected, unreachable): the API's error type and the first words of what it said
   * (00469, decision 0068), so the reason outlives the log that held it. Null for an answer.
   */
  error_type?: string | null;
  error_message?: string | null;
}

/** How much of a failed call's words the ledger keeps (the column's own bound, 00469). */
export const AI_USAGE_ERROR_CHARS = 300;

/** The ledger's row for one call, its dollars priced here. */
export function aiUsageBodyOf(call: {
  tenantId: string;
  purpose: ModelPurpose;
  asked: string;
  answered: string;
  outcome: ModelCallOutcome;
  usage: ModelUsage;
  promptHash?: string | null;
  userId?: string | null;
  subjectId?: string | null;
  /** What the API said of a call that got no answer; absent for an answer. */
  error?: { type: string; message: string } | null;
}): AiUsageBody {
  return {
    tenant_id: call.tenantId,
    purpose: call.purpose,
    model_asked: call.asked,
    model: call.answered,
    outcome: call.outcome,
    input_tokens: call.usage.input,
    output_tokens: call.usage.output,
    cache_read_tokens: call.usage.cacheRead,
    cache_write_tokens: call.usage.cacheWrite,
    usd: usageDollars(call.answered, call.usage),
    prompt_hash: call.promptHash ?? null,
    user_id: call.userId ?? null,
    subject_id: call.subjectId ?? null,
    ...(call.error
      ? {
          error_type: call.error.type.slice(0, 80) || null,
          error_message: call.error.message.slice(0, AI_USAGE_ERROR_CHARS) || null,
        }
      : {}),
  };
}

/**
 * Whether a refused call says the platform's key has run out of credit: every model call stops until it is topped up,
 * so the platform is paged once (the model port, decision 0068), never an owner left to find it.
 */
export function creditRanOut(error: { type: string; message: string } | null | undefined): boolean {
  return !!error && /credit balance/i.test(error.message);
}
