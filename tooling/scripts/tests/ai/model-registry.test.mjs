/**
 * One registry by purpose (contracts ai/models.ts; scorecard move 10, defect 54): every model id the platform names is
 * written there and nowhere else in the source, every purpose has a whole route, every model has a list price, and
 * the dollars a call came to are the prices times its four kinds of tokens.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import {
  MODELS,
  MODEL_IDS,
  MODEL_PURPOSES,
  MODEL_ROUTES,
  MODEL_PRICES,
  RETELL_MODELS,
  ASK_MODELS,
  ASK_MODEL,
  NOTE_SUGGEST_MODEL,
  REACH_OUT_MODEL,
  fallbackModel,
  isModelId,
  priceOf,
  usageDollars,
  usageOf,
  usageTokens,
  aiUsageBodyOf,
  usageMonthOf,
} from "@chanlytics/contracts";
import { repoFiles, parse } from "../_ast.mjs";

const REGISTRY = "packages/contracts/src/ai/models.ts";
const MODEL_ID = /^(claude-[a-z0-9.-]+|gpt-[a-z0-9.-]+)$/;

/** Every string literal (and template head) in a source file that reads as a model id, with its line. */
function modelLiterals(file) {
  const sf = parse(file);
  const out = [];
  const visit = (n) => {
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && MODEL_ID.test(n.text)) {
      out.push(`${file}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1} ${n.text}`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

test("a model id is written in the registry and nowhere else in the apps and packages", () => {
  const files = repoFiles(["apps", "packages"]).filter((f) => !/\.(test|type-test)\.|\/test\//.test(f));
  const elsewhere = files.filter((f) => f !== REGISTRY).flatMap(modelLiterals);
  assert.deepEqual(elsewhere, [], "name the model through contracts' MODELS or MODEL_ROUTES");
  assert.ok(modelLiterals(REGISTRY).length >= MODEL_IDS.length, "the registry itself holds them");
});

test("every purpose has a whole route, on a model the registry knows, with a price", () => {
  assert.deepEqual(Object.keys(MODEL_ROUTES).sort(), [...MODEL_PURPOSES].sort());
  for (const p of MODEL_PURPOSES) {
    const r = MODEL_ROUTES[p];
    assert.ok(isModelId(r.model), `${p}: ${r.model}`);
    assert.ok(r.fallback === null || (isModelId(r.fallback) && r.fallback !== r.model), `${p}'s fallback`);
    assert.ok(Number.isInteger(r.timeoutMs) && r.timeoutMs >= 1_000 && r.timeoutMs <= 55_000, `${p}'s bound`);
    assert.ok(Number.isInteger(r.retries) && r.retries >= 0 && r.retries <= 2, `${p}'s retries`);
    assert.ok(Number.isInteger(r.maxTokens) && r.maxTokens > 0, `${p}'s cap`);
  }
  for (const id of MODEL_IDS) assert.ok(MODEL_PRICES[id], `${id} has a list price`);
  assert.deepEqual(Object.values(MODELS).sort(), [...MODEL_IDS].sort());
});

test("the old names read the registry: Ask's profiles, the notes' and the reach-out's model are one id each", () => {
  assert.deepEqual([...ASK_MODELS], [MODEL_ROUTES.ask.model, MODEL_ROUTES.ask.fallback]);
  assert.equal(ASK_MODEL, MODEL_ROUTES.ask.model);
  // Defect 54: the reach-out's model repeated the notes' literal. Both are the registry's small-read model now.
  assert.equal(REACH_OUT_MODEL, MODEL_ROUTES.reach_out_check.model);
  assert.equal(NOTE_SUGGEST_MODEL, MODEL_ROUTES.note_suggest.model);
  assert.equal(REACH_OUT_MODEL, NOTE_SUGGEST_MODEL);
  assert.equal(typeof RETELL_MODELS.llm, "string");
});

test("the fallback is the route's, Ask's pair swaps, and a purpose with none waits", () => {
  const r = MODEL_ROUTES.receptionist;
  assert.equal(fallbackModel("receptionist", r.model), r.fallback);
  assert.equal(fallbackModel("ask", MODEL_ROUTES.ask.model), MODEL_ROUTES.ask.fallback);
  assert.equal(fallbackModel("ask", MODEL_ROUTES.ask.fallback), MODEL_ROUTES.ask.model);
  assert.equal(fallbackModel("lead_judge", MODEL_ROUTES.lead_judge.model), null);
});

test("a call's dollars are its four kinds of tokens at the model's list price, and a dated id is priced as its model", () => {
  const u = { input: 1_000_000, output: 1_000_000, cacheRead: 1_000_000, cacheWrite: 1_000_000 };
  const p = MODEL_PRICES[MODELS.SONNET_5];
  assert.equal(usageDollars(MODELS.SONNET_5, u), p.input + p.output + p.cacheRead + p.cacheWrite);
  assert.equal(usageDollars(MODELS.OPUS_5, { input: 2_000, output: 500, cacheRead: 10_000, cacheWrite: 0 }), 0.0275);
  assert.equal(priceOf("claude-haiku-4-5"), MODEL_PRICES[MODELS.HAIKU_4_5], "the undated name of a dated id");
  assert.equal(usageDollars("a-model-with-no-price", u), null, "an unpriced model says so, never zero");
  assert.deepEqual(usageOf({ input_tokens: 5, output_tokens: 2, cache_read_input_tokens: 7 }), {
    input: 5,
    output: 2,
    cacheRead: 7,
    cacheWrite: 0,
  });
  assert.equal(usageTokens({ input: 1, output: 2, cacheRead: 3, cacheWrite: 4 }), 10);
});

test("a ledger row carries the model asked, the one that answered, the outcome and its priced dollars", () => {
  const row = aiUsageBodyOf({
    tenantId: "t-1",
    purpose: "receptionist",
    asked: MODELS.OPUS_5,
    answered: MODELS.SONNET_5,
    outcome: "fell_back",
    usage: { input: 1_000, output: 100, cacheRead: 0, cacheWrite: 0 },
    promptHash: "0123456789abcdef",
  });
  assert.deepEqual(row, {
    tenant_id: "t-1",
    purpose: "receptionist",
    model_asked: MODELS.OPUS_5,
    model: MODELS.SONNET_5,
    outcome: "fell_back",
    input_tokens: 1_000,
    output_tokens: 100,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    usd: 0.003,
    prompt_hash: "0123456789abcdef",
    user_id: null,
    subject_id: null,
  });
});

test("a month's usage totals the model calls, their dollars, the call seconds and the conversations", () => {
  const line = (over) => ({
    meter: "model",
    purpose: "ask",
    model: MODELS.OPUS_5_5,
    uses: 1,
    quantity: 0,
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    usd: null,
    ...over,
  });
  const m = usageMonthOf("2026-09", [
    line({ uses: 3, quantity: 900, usd: 0.012 }),
    line({ purpose: "receptionist", uses: 2, quantity: 400, usd: 0.0031 }),
    line({ meter: "voice_seconds", purpose: null, model: null, uses: 2, quantity: 190 }),
    line({ meter: "wa_conversation", purpose: null, model: null, uses: 4, quantity: 4 }),
  ]);
  assert.deepEqual(
    [m.model_calls, m.model_tokens, m.model_usd, m.voice_seconds, m.wa_conversations],
    [5, 1_300, 0.0151, 190, 4],
  );
  assert.equal(usageMonthOf("2026-09", []).model_usd, null, "nothing priced is not zero dollars");
});
