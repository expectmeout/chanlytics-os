/**
 * ACCEPTANCE: a whole search replays in CI, from the recorded-shape fixtures
 * through the real handlers, the real database adapter and the real doors,
 * over the world in memory: create, the probe, the question, the answer, the
 * main phase, the checks, the ending; the webhook's final collect once; a
 * killed collect resumed by the sweep; the judge paid once per batch when a
 * page is delivered again.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { dispatchJob } from "../../../../../packages/jobs/src/handlers.ts";
import { leadWorld, drain, ctxFor as ctxOver, TENANT, webhookToken } from "../../_lead-world.mjs";
import { at, knock, answer } from "../../_cron-doors-world.mjs";
import { PLAN, LABELS } from "../../_lead-fixtures.mjs";

for (const k of ["APIFY_TOKEN", "ANTHROPIC_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"])
  delete process.env[k];
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const webhook = await import(at("apps/edge/api/apify-webhook.ts"));
const sweep = await import(at("apps/edge/api/cron/leads.ts"));
after(() => setPg(null));

const EMAIL_PLAN = { ...PLAN, contact: "email", count: 20 };
const { leadPipelineOver } = await import(at("apps/edge/lib/leads/lead-pipeline.ts"));
const ctxFor = (w) => ctxOver(w, leadPipelineOver(w.wires));

test("ACCEPTANCE: a search runs end to end: create, probe, the question, Keep going, the main phase, the checks, an ending; one judge call per batch; nothing failed", async () => {
  const w = leadWorld({ plan: EMAIL_PLAN });
  const made = w.rpcs.lead_search_create({
    p_tenant_id: TENANT,
    p_plan: EMAIL_PLAN,
    p_via: "people",
    p_estimate_usd: 2,
  });
  await drain(w, dispatchJob, ctxFor(w));
  assert.equal(w.round().state, "waiting_on_owner");
  // A1's review: the question names an exclusion of the plan, never a required criterion (the chains chip, not "independent").
  assert.equal(w.round().question.criterionKey, "chains");
  assert.match(
    w.round().question.sentence,
    /^Some of the first 24 are chain gyms and other kinds of places, which I'm leaving out\./,
  );
  assert.equal(w.members().length, 25, "the first 25 are kept and shown under the question");
  assert.equal(
    w.apify.calls.filter((c) => c.op === "startRun").length,
    2,
    "nothing more is started until it is answered",
  );
  assert.deepEqual(
    w.judge.calls.map((c) => c.length),
    [13, 11],
    "one call per batch; the closed place never reaches the judge",
  );

  w.rpcs.lead_round_answer({ p_round_id: made.round_id, p_answer: "keep" });
  await drain(w, dispatchJob, ctxFor(w));
  const round = w.round();
  assert.equal(round.state, "ended");
  assert.ok(["target_reached", "searched_everything", "few_new_matches"].includes(round.ending), round.ending);
  assert.equal(
    w.round().question.dropTerm,
    "strength coach",
    "the term that returned mostly chains was dropped by the question (P4)",
  );
  assert.equal(
    w.apify.calls.filter((c) => c.op === "startRun").length,
    4,
    "a probe of two, a main phase of one (the other term dropped), one checker",
  );
  assert.equal(w.members().length, 45, "25 from the probe, 20 from the main phase's one term");
  const labelled = w.members().map((m) => LABELS.get(w.T.leads.find((l) => l.id === m.lead_id).business_name));
  const qualified = w.members().filter((m) => m.class === "qualified");
  assert.ok(
    qualified.every((m) => LABELS.get(w.T.leads.find((l) => l.id === m.lead_id).business_name) === "fit"),
    "nothing but a fit qualifies",
  );
  // A1's review: an exclusion is named before a criterion, so a chain gym is left out "by" the chains chip, not by the independent criterion it also fails - checked member by member, so a chain excluded "by" something else and a non-chain excluded "by" chains cannot cancel out in a count.
  w.members().forEach((m, i) => {
    assert.equal(
      m.excluded_by === "chains",
      labelled[i] === "chain",
      `member ${i} (${labelled[i] ?? "unlabelled"}): excluded_by ${m.excluded_by}`,
    );
  });
  assert.ok(
    w.T.leads.filter((l) => l.email).every((l) => l.email_state === "ok"),
    "every found address was checked",
  );
  assert.equal(
    qualified.length,
    31,
    "every fit place whose mailbox answered ok: 12 of the probe's, 19 of the main phase's (the twentieth is outside the area)",
  );
  // 00140's lead_check_commit counts a member the email standard alone held back only through the ROUND'S reservation (the plan's count, reserved at create): past the room it is Qualified and uncounted, and no counter moves.
  assert.equal(
    w.members().filter((m) => m.counted).length,
    EMAIL_PLAN.count,
    "twenty were asked for and twenty counted; the eleven over the reservation are qualified and uncounted",
  );
  assert.equal(w.round().allowance_used, EMAIL_PLAN.count, "and the round used exactly what it reserved");
  assert.equal(w.T.lead_judgments.length, w.judge.calls.length, "every batch's answer kept by operation id");
  assert.deepEqual(
    w.T.jobs.filter((j) => j.state === "failed"),
    [],
  );
  assert.ok(w.round().cost_usd > 0);
});

test("the webhook's final collect: delivered three times, scheduled once, and the judge is paid nothing for a page already committed", async () => {
  const w = leadWorld({ plan: EMAIL_PLAN });
  w.rpcs.lead_search_create({ p_tenant_id: TENANT, p_plan: EMAIL_PLAN, p_via: "people", p_estimate_usd: 2 });
  await drain(w, dispatchJob, ctxFor(w));
  const calls = w.judge.calls.length;
  setPg(w.db);
  const run = w.runs()[0];
  const deliver = async () =>
    (
      await webhook.POST(
        new Request(`https://edge.example/api/apify-webhook?run=${run.id}&token=${await webhookToken(run.id)}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            eventType: "ACTOR.RUN.SUCCEEDED",
            eventData: { actorRunId: run.apify_run_id },
            resource: { id: run.apify_run_id, status: "SUCCEEDED" },
          }),
        }),
        { waitUntil: () => {} },
      )
    ).status;
  assert.deepEqual([await deliver(), await deliver(), await deliver()], [200, 200, 200]);
  assert.equal(w.jobsOf("lead_collect").filter((j) => j.payload.seq === "final").length, 1);
  await drain(w, dispatchJob, ctxFor(w));
  assert.equal(
    w.judge.calls.length,
    calls,
    "the page was committed once; a replay reads from the committed offset and finds nothing new",
  );
  assert.equal(w.members().length, 25);
});

test("a killed collect is resumed by the sweep: with its next job lost, the run's collect is scheduled once per minute key and the search goes on", async () => {
  const w = leadWorld({ plan: EMAIL_PLAN });
  Object.assign(w.rpcs, { get_cron_sweep_key: () => "sweep-key-for-this-file" });
  w.rpcs.lead_search_create({ p_tenant_id: TENANT, p_plan: EMAIL_PLAN, p_via: "people", p_estimate_usd: 2 });
  // The start runs; the first collects it scheduled are lost (a killed function between the claim and the row).
  const start = w.T.jobs.find((j) => j.kind === "lead_round_start");
  start.state = "fired";
  await dispatchJob(ctxFor(w)({ id: start.id, tenant_id: TENANT, kind: start.kind, payload: start.payload }), {
    id: start.id,
    tenant_id: TENANT,
    kind: start.kind,
    payload: start.payload,
  });
  start.state = "done";
  for (const j of w.jobsOf("lead_collect")) j.state = "canceled";
  w.finishRuns();
  setPg(w.db);
  const [status, body] = await answer(await knock(sweep.POST, "leads"));
  assert.equal(status, 200);
  assert.equal(body.collected, 2, "both running runs had no collect coming");
  assert.equal(
    (await answer(await knock(sweep.POST, "leads")))[1].collected,
    0,
    "and a second sweep in the same minute schedules nothing twice",
  );
  await drain(w, dispatchJob, ctxFor(w));
  assert.equal(w.round().state, "waiting_on_owner", "the search got to its question");
});
