/**
 * The pipeline bound for the ledger (apps/edge/lib/leads/lead-pipeline.ts), over
 * the world in memory: each handler reaches its verb through the real
 * dispatch with the job's own id as the owner, a payload that is not the
 * ledger's shape is a bug, and a deployment without the keys binds nothing.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { dispatchJob } from "../../../packages/jobs/src/handlers.ts";
import { leadWorld, ctxFor, TENANT } from "./_lead-world.mjs";
import { at, withEnv } from "./_cron-doors-world.mjs";
import { PLAN } from "./_lead-fixtures.mjs";

for (const k of ["APIFY_TOKEN", "ANTHROPIC_API_KEY"]) delete process.env[k];
const { leadPipelineOver, leadPipeline } = await import(at("apps/edge/lib/leads/lead-pipeline.ts"));
after(() => {});

const R = "33333333-3333-4333-8333-333333333333";
const job = (kind, payload, id = "job-1") => ({ id, tenant_id: TENANT, kind, payload });

test("a deployment without the provider's token or the model's key binds no pipeline; with both, it binds the three verbs", async () => {
  assert.equal(leadPipeline(), undefined);
  await withEnv(
    {
      APIFY_TOKEN: "apify-token-for-this-file",
      ANTHROPIC_API_KEY: "anthropic-key-for-this-file",
      SUPABASE_SERVICE_ROLE_KEY: "service-key-for-this-file",
    },
    async () => {
      const p = leadPipeline();
      assert.deepEqual(Object.keys(p).sort(), ["check", "collect", "roundStart"]);
    },
  );
});

test("a payload that is not the ledger's shape is a bug, and says so", async () => {
  const w = leadWorld();
  const ctx = ctxFor(w, leadPipelineOver(w.wires));
  await assert.rejects(dispatchJob(ctx(), job("lead_collect", { run_id: "not-a-uuid", seq: "p0" })), /payload\.run_id/);
  await assert.rejects(dispatchJob(ctx(), job("lead_collect", { run_id: R, seq: "not valid!" })), /payload\.seq/);
  await assert.rejects(dispatchJob(ctx(), job("lead_check", { round_id: R, batch: -1 })), /payload\.batch/);
  await assert.rejects(dispatchJob(ctx(), job("lead_round_start", {})), /payload\.round_id/);
});

test("lead_round_start through the dispatch: the rows, the claims, the provider, the first collects; the job's id is the owner", async () => {
  const w = leadWorld();
  const ctx = ctxFor(w, leadPipelineOver(w.wires));
  const made = w.rpcs.lead_search_create({ p_tenant_id: TENANT, p_plan: PLAN, p_via: "people", p_estimate_usd: 2 });
  await dispatchJob(ctx(), job("lead_round_start", { round_id: made.round_id }, "job-start"));
  assert.equal(w.runs().length, 2);
  assert.ok(w.runs().every((r) => r.claimed_by === "job-start" && r.state === "running"));
  assert.equal(w.apify.calls.filter((c) => c.op === "startRun").length, 2);
  assert.equal(w.jobsOf("lead_collect").length, 2);
});

/** Every place the provider returns, with no phone: only its email can make it count (decision 0010). */
const noPhones = (w) => {
  for (const items of Object.values(w.apify.state.datasets))
    for (const it of items) Object.assign(it, { phone: null, phoneUnformatted: null, phones: [] });
};

test("lead_collect through the dispatch commits a batch; lead_check starts the checker with the addresses still waiting", async () => {
  const plan = {
    ...PLAN,
    contact: "email",
    criteria: [{ key: "right_kind", text: "a place", standard: "likely", required: false }],
    exclusions: [],
  };
  const w = leadWorld({ plan });
  const ctx = ctxFor(w, leadPipelineOver(w.wires));
  const made = w.rpcs.lead_search_create({ p_tenant_id: TENANT, p_plan: plan, p_via: "people", p_estimate_usd: 2 });
  await dispatchJob(ctx(), job("lead_round_start", { round_id: made.round_id }, "job-start"));
  // No phones: only the emails can make these count, so the round goes the whole way to its checks (decision 0010).
  noPhones(w);
  w.finishRuns();
  for (const r of w.runs()) await dispatchJob(ctx(), job("lead_collect", { run_id: r.id, seq: "p0" }, `job-c-${r.id}`));
  assert.ok(w.members().length >= 24);
  assert.equal(w.round().state, "running", "a probe that fits goes on");
  assert.equal(w.round().target, plan.count, "the target is the plan's count once the probe passed");
  await dispatchJob(ctx(), job("lead_round_start", { round_id: made.round_id, resume: true }, "job-resume"));
  noPhones(w);
  w.finishRuns();
  for (const r of w.runs().filter((x) => x.state === "running"))
    await dispatchJob(ctx(), job("lead_collect", { run_id: r.id, seq: "p0" }, `job-m-${r.id}`));
  assert.equal(w.round().state, "checking");
  await dispatchJob(ctx(), job("lead_check", { round_id: made.round_id, batch: 0 }, "job-check"));
  const checker = w.apify.calls.filter((c) => c.op === "startRun").at(-1);
  assert.equal(checker.actor, "bounceverify/bounceverify-email-verifier");
  assert.ok(checker.input.emails.length > 20);
  assert.equal(w.runs().filter((r) => r.purpose === "check").length, 1);
});
