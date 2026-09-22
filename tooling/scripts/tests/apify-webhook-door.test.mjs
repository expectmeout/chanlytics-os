/**
 * The provider's webhook door, run as Vercel runs it, over the world in
 * memory: the token proven, the body a pointer, a foreign run aborted, one
 * final collect however often it is delivered, and a lost start filled in.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { leadWorld, TENANT, webhookToken, sha256 } from "./_lead-world.mjs";
import { planApifyIngress, tokenMatches } from "../../../apps/edge/lib/leads/apify-ingress.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
// The abort path builds the provider client from the env; every other path never touches it.
process.env.APIFY_TOKEN = "apify-token-for-this-file";
process.env.ANTHROPIC_API_KEY = "anthropic-key-for-this-file";
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const door = await import(at("apps/edge/api/apify-webhook.ts"));
const realFetch = globalThis.fetch;
after(() => {
  setPg(null);
  globalThis.fetch = realFetch;
  delete process.env.APIFY_TOKEN;
  delete process.env.ANTHROPIC_API_KEY;
});

const RUN_ROW = "44444444-4444-4444-8444-444444444444";
const ROUND = "55555555-5555-4555-8555-555555555555";
let w;
let fetched;
beforeEach(async () => {
  w = leadWorld();
  w.T.lead_runs.push({
    id: RUN_ROW,
    tenant_id: TENANT,
    round_id: ROUND,
    purpose: "discover",
    term: "personal trainer",
    actor: "compass/crawler-google-places",
    build: "0.14.757",
    apify_run_id: "RunFixture0001",
    dataset_id: "DsFixture0001",
    state: "running",
    claimed_by: "job-1",
    claimed_at: null,
    webhook_token_hash: sha256(await webhookToken(RUN_ROW)),
    lease_owner: null,
    lease_gen: 0,
    lease_until: null,
    read_offset: 0,
    items_seen: 0,
    cap_usd: 0.5,
    usage_usd: 0,
    created_at: new Date().toISOString(),
    finished_at: null,
  });
  setPg(w.db);
  fetched = [];
  globalThis.fetch = async (url, init) => {
    fetched.push({ url: String(url), init });
    return new Response("{}", { status: 200 });
  };
});
const post = async (body, { run = RUN_ROW, token } = {}) => {
  const t = token ?? (await webhookToken(RUN_ROW));
  const res = await door.POST(
    new Request(`https://edge.example/api/apify-webhook?run=${run}&token=${t}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { waitUntil: () => {} },
  );
  return res.status;
};
const payload = (runId = "RunFixture0001", eventType = "ACTOR.RUN.SUCCEEDED") => ({
  eventType,
  eventData: { actorId: "nwua9Gu5YrADL7ZDj", actorRunId: runId },
  resource: { id: runId, status: "SUCCEEDED", defaultDatasetId: "DsFixture0001" },
});
const jobs = () => w.T.jobs.map((j) => [j.kind, j.payload]);

test("ACCEPTANCE: a wrong token is refused in constant time and writes nothing, whatever the body says; the provider is not even asked", async () => {
  assert.equal(await post(payload(), { token: await webhookToken("66666666-6666-4666-8666-666666666666") }), 401);
  assert.equal(await post(payload(), { token: "short" }), 401);
  assert.equal(await post(payload(), { run: "not-a-uuid" }), 401);
  assert.deepEqual([jobs(), fetched], [[], []]);
  assert.equal(tokenMatches(await webhookToken(RUN_ROW), sha256(await webhookToken(RUN_ROW))), true);
  assert.equal(tokenMatches(await webhookToken(RUN_ROW), "not-hex"), false);
});

test("ACCEPTANCE: a replayed run id, a good token with another run's pointer, aborts that run and schedules nothing", async () => {
  assert.equal(await post(payload("RunSomebodyElse")), 200);
  assert.deepEqual(jobs(), []);
  assert.equal(fetched.length, 1);
  assert.equal(new URL(fetched[0].url).pathname, "/v2/actor-runs/RunSomebodyElse/abort");
  assert.equal(fetched[0].init.headers.Authorization, "Bearer apify-token-for-this-file");
});

test("the body is a pointer: one final collect is scheduled however often it is delivered, and the provider is not read here", async () => {
  assert.equal(await post(payload()), 200);
  assert.equal(await post(payload()), 200, "already on the ledger");
  assert.equal(await post(payload("RunFixture0001", "ACTOR.RUN.FAILED")), 200);
  assert.deepEqual(jobs(), [["lead_collect", { run_id: RUN_ROW, seq: "final" }]]);
  assert.deepEqual(fetched, [], "the collect re-reads the run; the door reads nothing from the provider");
});

test("a run the ledger never recorded is answered and ignored; an event that is not an ending is ignored; a body that is not JSON is refused", async () => {
  assert.equal(
    await post(payload(), {
      run: "77777777-7777-4777-8777-777777777777",
      token: await webhookToken("77777777-7777-4777-8777-777777777777"),
    }),
    200,
  );
  assert.equal(await post(payload("RunFixture0001", "ACTOR.RUN.CREATED")), 200);
  assert.equal(await post("not json"), 400);
  assert.equal(await post({ eventType: "ACTOR.RUN.SUCCEEDED" }), 400, "no pointer");
  assert.deepEqual(jobs(), []);
});

test("a start whose answer was lost learns its run id from the webhook, through the reconcile door, and only while it is unknown", async () => {
  Object.assign(w.T.lead_runs[0], { apify_run_id: null, dataset_id: null, state: "unknown" });
  assert.equal(await post(payload()), 200);
  assert.deepEqual(
    [w.T.lead_runs[0].apify_run_id, w.T.lead_runs[0].dataset_id, w.T.lead_runs[0].state],
    ["RunFixture0001", "DsFixture0001", "running"],
  );
  assert.deepEqual(jobs(), [["lead_collect", { run_id: RUN_ROW, seq: "final" }]]);
});

test("the planner, alone: every verdict from the row, the token and the body", () => {
  const row = { id: RUN_ROW, tenant_id: TENANT, apify_run_id: "RunA", state: "running", webhook_token_hash: "x" };
  assert.equal(planApifyIngress({ runRow: null, tokenOk: true, body: payload("RunA") }).action, "ignore");
  assert.equal(planApifyIngress({ runRow: row, tokenOk: false, body: payload("RunA") }).action, "refuse");
  assert.deepEqual(planApifyIngress({ runRow: row, tokenOk: true, body: payload("RunB") }), {
    action: "abort_foreign",
    apifyRunId: "RunB",
    log: "apify_webhook_other_run",
  });
  assert.deepEqual(planApifyIngress({ runRow: row, tokenOk: true, body: payload("RunA") }), {
    action: "schedule_final",
    runRowId: RUN_ROW,
    tenantId: TENANT,
    apifyRunId: "RunA",
    fill: null,
  });
  assert.deepEqual(
    planApifyIngress({ runRow: { ...row, apify_run_id: null, state: "unknown" }, tokenOk: true, body: payload("RunA") })
      .fill,
    { datasetId: "DsFixture0001" },
  );
  assert.equal(planApifyIngress({ runRow: row, tokenOk: true, body: null }).status, 400);
});
