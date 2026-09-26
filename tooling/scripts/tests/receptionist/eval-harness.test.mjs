/**
 * The evaluation harness, the reply-quality signal, and the token budget.
 *
 * A prompt or config change used to be proven on the live line by the next
 * customer. Now an internal edge endpoint runs the brain on a case set with
 * the workspace's real composed prompt, sends nothing, writes nothing, and
 * hands the record back; the judge here is executed on fixtures. Every reply
 * also leaves a usage event that says how sure and how fast it was, and a
 * workspace can cap its day's tokens the way it caps its day's replies.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ESCALATION_REASONS, ESCALATION_REASON_LABELS, PolicyLimitsSchema } from "@chanlytics/contracts";
import { ROOT, readCode, readRaw } from "../_source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const judge = await import(pathToFileURL(path.join(here, "../../eval-judge.mjs")).href);
const cases = JSON.parse(readFileSync(path.join(ROOT, "tooling/evals/whatsapp-cases.json"), "utf8"));

const ok = (over) => ({
  id: "x",
  ok: true,
  text: "We open at 10 tomorrow!",
  escalate: false,
  reason: null,
  meta: { intent: "hours", confidence: 0.9, language: "en", facts_used: ["Tue–Sat 10:00"] },
  usage: { input_tokens: 1200, output_tokens: 80 },
  ms: 2100,
  ...over,
});

test("the judge: a price always fails, and each expectation names what it wanted", () => {
  assert.deepEqual(
    judge.judgeCase({ id: "x", text: "hours?", expect: { intent: "hours", language: "en", escalate: false } }, ok({})),
    { pass: true, failures: [] },
  );
  const priced = judge.judgeCase({ id: "x", text: "price?" }, ok({ text: "A balayage is $180." }));
  assert.deepEqual(priced.failures, ["quoted a price"]);
  const wrong = judge.judgeCase(
    {
      id: "x",
      text: "?",
      expect: {
        intent: ["pricing", "services"],
        escalate: true,
        language: "es",
        includes: ["Maple"],
        excludes: ["open at"],
        min_confidence: 0.95,
      },
    },
    ok({}),
  );
  assert.deepEqual(wrong.failures, [
    "intent hours, wanted pricing|services",
    "escalate false, wanted true",
    "language en, wanted es",
    "missing /Maple/",
    "must not say /open at/",
    "confidence 0.9 < 0.95",
  ]);
  assert.deepEqual(judge.judgeCase({ id: "x", text: "?" }, { id: "x", ok: false, error: "timeout" }), {
    pass: false,
    failures: ["no answer: timeout"],
  });
  assert.deepEqual(judge.judgeCase({ id: "x", text: "?" }, undefined).failures, ["no answer: missing result"]);
  assert.ok(
    judge
      .judgeCase({ id: "x", text: "?" }, ok({ meta: null }))
      .failures.includes("no record (intent/confidence) came back"),
    "a legacy answer is a failure: the record is the point",
  );
});

test("the case set is well formed, covers both languages, the handoff, the price rule and the booking rule", () => {
  assert.deepEqual(judge.validateCases(cases), []);
  assert.deepEqual(
    judge.validateCases([
      { id: "a", text: "" },
      { id: "a", text: "x", expect: { includes: ["("] } },
    ]),
    ["a: text is empty or over 500 chars", "duplicate id a", "a: bad pattern ("],
  );
  assert.ok(cases.some((c) => c.expect?.language === "es") && cases.some((c) => c.expect?.language === "en"));
  assert.ok(
    cases.some((c) => c.expect?.escalate === true),
    "a handoff is expected somewhere",
  );
  assert.ok(
    cases.some((c) => c.id.startsWith("price_")),
    "the price rule is exercised",
  );
  assert.ok(
    cases.some((c) => c.expect?.intent === "booking" && (c.expect.excludes ?? []).length),
    "a booking is offered, never confirmed",
  );
  assert.ok(cases.length >= 12 && cases.length <= 24, "small enough to run on purpose, big enough to mean something");
});

test("the report reads at a glance and counts what passed", () => {
  const two = [
    { id: "a", text: "?", expect: { intent: "hours" } },
    { id: "b", text: "?", expect: { intent: "pricing" } },
  ];
  const r = judge.formatReport(two, [ok({ id: "a" }), ok({ id: "b" })]);
  assert.equal(r.passed, 1);
  assert.equal(r.total, 2);
  assert.ok(r.text.includes(" ok  a") && r.text.includes("FAIL b"));
  assert.ok(r.text.includes("1/2 passed · 2,560 tokens"));
});

test("the runner knocks with the key and saves the exchange where git ignores it", () => {
  // The endpoint itself -- the door, the case set's limits, the real composed
  // prompt handed to the model per case, nothing sent and nothing written --
  // is run in eval-door.test.mjs.
  const runner = readRaw("tooling/scripts/eval-brain.mjs");
  assert.ok(runner.includes('"x-diag-key": KEY'));
  assert.ok(runner.includes("tooling/backups/eval-"), "the exchange is saved where git ignores it");
});

test("every reply leaves a quality signal on its usage event, and the diagnostics read the day back", () => {
  const wa = readCode("packages/core/src/inbound/answer.ts");
  assert.ok(wa.includes("const tBrain = Date.now();") && wa.includes("brainMs = Date.now() - tBrain;"));
  assert.ok(
    wa.includes("intent: brainMeta?.intent ?? null,") &&
      wa.includes("confidence: brainMeta?.confidence ?? null,") &&
      wa.includes("latency_ms: brainMs,"),
  );
  assert.equal(
    (wa.match(/sink\.usage\(\{ \.\.\.usage, \.\.\.replyQuality \}\)/g) ?? []).length,
    2,
    "the held path and the sent path",
  );
  assert.ok(readCode("apps/edge/lib/whatsapp/persist.ts").includes("usage: (u: Record<string, unknown>) =>"));
  // The diagnostic reading the day back (brainSummary) is run in diag-door.test.mjs.
  const b = readCode("apps/edge/lib/receptionist/budget.ts");
  assert.ok(b.includes('.eq("kind", "usage.llm_tokens")'));
  assert.ok(b.includes("return 0;"), "a failed read never silences the receptionist");
});

test("the token budget: a policy limit, a check before the brain, a labelled reason with its CHECK", () => {
  assert.ok(PolicyLimitsSchema.safeParse({ max_llm_tokens_day: 200000 }).success);
  assert.ok(!PolicyLimitsSchema.safeParse({ max_llm_tokens_day: 10 }).success, "below a sensible floor");
  assert.ok(ESCALATION_REASONS.includes("budget"));
  assert.ok(ESCALATION_REASON_LABELS.budget.includes("budget"));
  const wa = readCode("packages/core/src/inbound/answer.ts");
  assert.ok(
    wa.includes("const used = await ports.budget.tokensLast24h(db, tenantId, tokenCap);"),
    "the cap is handed to the read, which stops at it",
  );
  assert.ok(/sink\.escalate\(\s*"budget",/.test(wa));
  assert.ok(wa.includes('"(no reply sent — the day\'s model budget is used up)"'));
  const sql = readRaw("supabase/migrations/00039_budget_reason.sql");
  assert.ok(sql.includes("'budget'"), "the CHECK admits the reason");
  const route = readCode("apps/dashboard/app/api/v1/policies/route.ts");
  assert.ok(route.includes("limits.max_llm_tokens_day = Math.round(t);"));
});
