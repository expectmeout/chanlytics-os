import { MODELS } from "./models.js";
export const NO_USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
export const MODEL_PRICES = {
  [MODELS.OPUS_5_5]: { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  [MODELS.OPUS_5]: { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  [MODELS.SONNET_5_5]: { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  [MODELS.SONNET_5]: { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  [MODELS.HAIKU_5_5]: { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
  [MODELS.HAIKU_4_5]: { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 }
};
export const FAST_MODE_PRICES = {
  [MODELS.OPUS_5_5]: { input: 8, output: 40, cacheWrite: 10, cacheRead: 0.4 },
  [MODELS.OPUS_5]: { input: 10, output: 50, cacheWrite: 12.5, cacheRead: 1 }
};
const PER_TOKEN = 1e6;
function priceRowOf(prices, model) {
  const own = prices[model];
  if (own) return own;
  const bare = model.replace(/-\d{8}$/, "");
  for (const [id, price] of Object.entries(prices)) {
    if (price && id.replace(/-\d{8}$/, "") === bare) return price;
  }
  return null;
}
export function priceOf(model, speed = "standard") {
  return (speed === "fast" ? priceRowOf(FAST_MODE_PRICES, model) : null) ?? priceRowOf(MODEL_PRICES, model);
}
export function usageDollars(model, u) {
  const p = priceOf(model, u.speed ?? "standard");
  if (!p) return null;
  const d = (u.input * p.input + u.output * p.output + u.cacheWrite * p.cacheWrite + u.cacheRead * p.cacheRead) / PER_TOKEN;
  return Math.round(d * 1e6) / 1e6;
}
export function usageTokens(u) {
  return u.input + u.output + u.cacheRead + u.cacheWrite;
}
export function usageOf(raw) {
  const u = raw && typeof raw === "object" ? raw : {};
  const n = (v) => typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
  return {
    input: n(u.input_tokens),
    output: n(u.output_tokens),
    cacheRead: n(u.cache_read_input_tokens),
    cacheWrite: n(u.cache_creation_input_tokens),
    ...u.speed === "fast" ? { speed: "fast" } : {}
  };
}
export const MODEL_CALL_OUTCOMES = [
  "answered",
  "fell_back",
  "refused",
  "rejected",
  "unreachable",
  "unreadable"
];
export function aiUsageBodyOf(call) {
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
    subject_id: call.subjectId ?? null
  };
}
