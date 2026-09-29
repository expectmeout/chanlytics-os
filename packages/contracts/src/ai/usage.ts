/**
 * What a model call cost: its tokens by kind, and their price at the models' list prices (scorecard move 10; category
 * 39, metering). Every model call the platform makes is written once, through one writer (packages/db ai-usage.ts
 * recordModelUsage), as one row of the kept ledger (00276 ai_usage); this module is the row's shape and its dollars.
 *
 * Tokens come in four kinds and each has its own price: uncached input, output, a five-minute cache write and a cache
 * read. A budget that counted only input and output missed the writes (the scorecard, 29 September); the ledger keeps
 * all four and the dollars they came to.
 */
import { MODELS, type ModelId, type ModelPort, type ModelPurpose } from "./models";

/** One call's tokens, as the API counts them. */
export interface ModelUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
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
 * carried them since 23 September). A cache write is 1.25 times the input price, a read a tenth of it, but where the
 * table names a read price (Opus 5.5) that price is kept.
 */
export const MODEL_PRICES: Record<ModelId, ModelPrice> = {
  [MODELS.OPUS_5_5]: { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  [MODELS.OPUS_5]: { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  [MODELS.SONNET_5]: { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  [MODELS.HAIKU_4_5]: { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
};

const PER_TOKEN = 1_000_000;

/**
 * The price of a model the API names in its answer: its own row, or the row of the id it is a dated or undated form
 * of (the API may answer `claude-haiku-4-5` for a request that named its dated id, and the reverse). Null when the
 * platform has no price for it: the ledger then says so rather than guess.
 */
export function priceOf(model: string): ModelPrice | null {
  const own = (MODEL_PRICES as Record<string, ModelPrice>)[model];
  if (own) return own;
  const bare = model.replace(/-\d{8}$/, "");
  for (const [id, price] of Object.entries(MODEL_PRICES)) {
    if (id.replace(/-\d{8}$/, "") === bare) return price;
  }
  return null;
}

/** The dollars one call came to at list price, to a hundredth of a cent's hundredth; null when the model has no price. */
export function usageDollars(model: string, u: ModelUsage): number | null {
  const p = priceOf(model);
  if (!p) return null;
  const d =
    (u.input * p.input + u.output * p.output + u.cacheWrite * p.cacheWrite + u.cacheRead * p.cacheRead) / PER_TOKEN;
  return Math.round(d * 1_000_000) / 1_000_000;
}

/** Every token of a call, whatever its kind: what a day's cap counts. */
export function usageTokens(u: ModelUsage): number {
  return u.input + u.output + u.cacheRead + u.cacheWrite;
}

/** The API's own usage object read into the four kinds; a missing count is zero. */
export function usageOf(raw: unknown): ModelUsage {
  const u = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);
  return {
    input: n(u.input_tokens),
    output: n(u.output_tokens),
    cacheRead: n(u.cache_read_input_tokens),
    cacheWrite: n(u.cache_creation_input_tokens),
  };
}

/**
 * What became of a call: answered; answered by the fallback; the model declined (its own refusal); the API refused
 * the request; no answer came; or an answer came that could not be read (cut at its cap, out of its shape). The last
 * four are what the health sweep counts per workspace (00276 ai_failures_hour).
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
   * A shadow call's own columns (00278; shadow.ts): the port it left by, and, for a question it answered, the label the
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
}

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
  };
}

/** A workspace's month of metered use as the Usage read answers it (GET usage): each meter's lines and the totals. */
export interface UsageMonthDto {
  /** YYYY-MM. */
  month: string;
  /** One line per meter, purpose and model (ai_usage_month, 00276). */
  lines: Array<{
    meter: "model" | "voice_seconds" | "wa_conversation";
    purpose: string | null;
    model: string | null;
    uses: number;
    quantity: number;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_write_tokens: number;
    usd: number | null;
  }>;
  /** The model calls' list-price dollars, summed; null when none was priced. */
  model_usd: number | null;
  model_calls: number;
  model_tokens: number;
  voice_seconds: number;
  wa_conversations: number;
}

/** The month's totals from its lines: what an owner reads first. */
export function usageMonthOf(month: string, lines: UsageMonthDto["lines"]): UsageMonthDto {
  const models = lines.filter((l) => l.meter === "model");
  const priced = models.filter((l) => l.usd !== null);
  const sum = (xs: typeof lines, f: (l: UsageMonthDto["lines"][number]) => number) => xs.reduce((n, l) => n + f(l), 0);
  return {
    month,
    lines,
    model_usd: priced.length ? Math.round(sum(priced, (l) => l.usd ?? 0) * 10_000) / 10_000 : null,
    model_calls: sum(models, (l) => l.uses),
    model_tokens: sum(models, (l) => l.quantity),
    voice_seconds: sum(
      lines.filter((l) => l.meter === "voice_seconds"),
      (l) => l.quantity,
    ),
    wa_conversations: sum(
      lines.filter((l) => l.meter === "wa_conversation"),
      (l) => l.uses,
    ),
  };
}
