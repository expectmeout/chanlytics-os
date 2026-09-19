/**
 * The judge's one model call, over a fake client: the request's shape, the
 * fallback and its retry, what is a refusal and what is the provider's
 * trouble, and the answering model recorded.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { leadJudge, LEAD_JUDGE_MAX_TOKENS, LEAD_JUDGE_FALLBACK_BETA } from "../../../packages/channels/src/lead-judge.ts";
import { JUDGE_OUTPUT_SCHEMA } from "@chanlytics/contracts";
import { PLAN } from "./_lead-fixtures.mjs";

const places = [
  { ref: 0, name: "Place 0001", category: "Personal trainer", city: "Austin", state: "TX", host: "place0001.example", rating: 4.8, reviews: 40, emails: ["hello@place0001.example"], phone_matches_site: true },
  { ref: 1, name: "PowerGym Austin #13", category: "Gym", city: "Austin", state: "TX", host: "place0013.example", rating: 4.1, reviews: 900, emails: [], phone_matches_site: false },
];
const good = { places: [
  { ref: 0, criteria: [{ key: "right_kind", answer: "pass", facts: ["category"] }, { key: "independent", answer: "pass", facts: ["name", "reviews"] }, { key: "chains", answer: "pass", facts: ["name"] }], email_index: 0, reason: "Independent studio with its own site" },
  { ref: 1, criteria: [{ key: "right_kind", answer: "pass", facts: ["category"] }, { key: "independent", answer: "fail", facts: ["name"] }, { key: "chains", answer: "fail", facts: ["name"] }], email_index: null, reason: "Part of a gym chain" },
] };
const reply = (json, over = {}) => ({ model: "claude-opus-5-20260301", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(json) }], usage: { input_tokens: 900, output_tokens: 120 }, ...over });
function client(fn) {
  const seen = [];
  return { seen, beta: { messages: { create: async (p) => { seen.push(p); return fn(p, seen.length); } } } };
}

test("one structured call: the model, low effort, the schema, six thousand tokens, the fallback beta; the answer is parsed and the answering model recorded", async () => {
  const c = client(() => reply(good));
  const a = await leadJudge(c, "claude-opus-5", true).judge(PLAN, places);
  assert.equal(c.seen.length, 1);
  const p = c.seen[0];
  assert.deepEqual([p.model, p.max_tokens, p.output_config.effort, p.output_config.format.type, p.betas, p.fallbacks], ["claude-opus-5", LEAD_JUDGE_MAX_TOKENS, "low", "json_schema", [LEAD_JUDGE_FALLBACK_BETA], "default"]);
  assert.equal(p.output_config.format.schema, JUDGE_OUTPUT_SCHEMA);
  assert.equal(p.tools, undefined, "no tools, no web");
  assert.ok(p.messages[0].content.includes("<places>"));
  assert.equal(a.model, "claude-opus-5-20260301", "the model that answered, not the one asked");
  assert.equal(a.tokens, 1020);
  assert.deepEqual(a.answers.map((x) => [x.ref, x.email_index, x.criteria[1].answer]), [[0, 0, "pass"], [1, null, "fail"]]);
  assert.match(a.requestHash, /^[0-9a-f]{64}$/);
});

test("with fallbacks off nothing beta is sent; a 400 that names the beta is asked again once without it", async () => {
  const off = client(() => reply(good));
  await leadJudge(off, "claude-opus-5", false).judge(PLAN, places);
  assert.deepEqual([off.seen[0].betas, off.seen[0].fallbacks], [undefined, undefined]);
  const c = client((p) => { if (p.fallbacks) throw Object.assign(new Error("fallbacks: unknown beta"), { status: 400 }); return reply(good); });
  assert.equal("answers" in (await leadJudge(c, "claude-opus-5", true).judge(PLAN, places)), true);
  assert.deepEqual(c.seen.map((p) => !!p.fallbacks), [true, false]);
});

test("a refusal, a capped answer, text that is not JSON and an answer the parser rejects are refusals with their reason, never a throw", async () => {
  const j = (fn) => leadJudge(client(fn), "claude-opus-5", true).judge(PLAN, places);
  assert.deepEqual(await j(() => reply({}, { stop_reason: "refusal", content: [] })), { refused: true, why: "the judge refused" });
  assert.deepEqual(await j(() => reply({}, { stop_reason: "max_tokens", content: [{ type: "text", text: "{\"places\":[" }] })), { refused: true, why: "max_tokens" });
  assert.deepEqual(await j(() => reply({}, { content: [{ type: "text", text: "not json" }] })), { refused: true, why: "not JSON" });
  const wrongKey = { places: [{ ...good.places[0], criteria: [...good.places[0].criteria, { key: "vibes", answer: "pass", facts: [] }] }, good.places[1]] };
  assert.equal((await j(() => reply(wrongKey))).why, "ref 0: unknown criterion vibes");
  const badIndex = { places: [{ ...good.places[0], email_index: 4 }, good.places[1]] };
  assert.equal((await j(() => reply(badIndex))).why, "ref 0: email_index 4 out of range");
});

test("an overloaded model is the provider's trouble: it propagates for the ledger to wait out", async () => {
  const c = client(() => { throw Object.assign(new Error("overloaded"), { status: 529 }); });
  await assert.rejects(leadJudge(c, "claude-opus-5", true).judge(PLAN, places), /overloaded/);
});
