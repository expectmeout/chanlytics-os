/**
 * The provider client, run over a fake fetch: each call's documented shape,
 * what is retryable and what is an answer, and the two things it must never
 * send (a token in a URL; clean or skipEmpty on an items read).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { apifyClient, ApifyRefused, ApifyRetryable, APIFY_RUN_END_EVENTS } from "../../../packages/channels/src/apify.ts";
import { actorRun } from "./_lead-fixtures.mjs";

function http(answers) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), init });
    const a = answers.shift();
    if (a instanceof Error) throw a;
    return new Response(a.body ?? "", { status: a.status, headers: a.headers ?? {} });
  };
  return { fn, calls };
}
const ok = (status, data, headers) => ({ status, body: JSON.stringify(data), headers });

test("a run is started on the actor's path with a pinned build, a timeout, a cap and the webhooks as base64 JSON; the token is a header", async () => {
  const h = http([ok(201, { data: actorRun() })]);
  const c = apifyClient(h.fn, "tok");
  const run = await c.startRun("compass/crawler-google-places", { searchStringsArray: ["personal trainer"] }, {
    build: "0.14.757", timeoutSecs: 2700, maxTotalChargeUsd: 0.5, webhooks: [{ eventTypes: [...APIFY_RUN_END_EVENTS], requestUrl: "https://edge.example/api/apify-webhook?run=r1&token=t1" }],
  });
  const u = new URL(h.calls[0].url);
  assert.equal(`${u.origin}${u.pathname}`, "https://api.apify.com/v2/actors/compass~crawler-google-places/runs");
  assert.deepEqual([u.searchParams.get("build"), u.searchParams.get("timeout"), u.searchParams.get("maxTotalChargeUsd")], ["0.14.757", "2700", "0.5"]);
  assert.deepEqual(JSON.parse(Buffer.from(u.searchParams.get("webhooks"), "base64").toString("utf8")), [{ eventTypes: [...APIFY_RUN_END_EVENTS], requestUrl: "https://edge.example/api/apify-webhook?run=r1&token=t1" }]);
  assert.equal(h.calls[0].init.headers.Authorization, "Bearer tok");
  assert.equal(h.calls[0].url.includes("tok"), false, "never in a URL");
  assert.deepEqual(JSON.parse(h.calls[0].init.body), { searchStringsArray: ["personal trainer"] });
  assert.deepEqual(run, { id: "RunFixture0001", datasetId: "DsFixture0001" });
});

test("429 and 5xx, or no answer, are retryable; any other 4xx is an answer", async () => {
  for (const [status, retryable] of [[429, true], [503, true], [500, true], [402, false], [400, false], [404, false]]) {
    const e = await apifyClient(http([ok(status, { error: { type: "x" } })]).fn, "tok").getRun("r1").catch((x) => x);
    assert.equal(e instanceof (retryable ? ApifyRetryable : ApifyRefused), true, String(status));
    assert.equal(e.status, status);
  }
  const lost = await apifyClient(http([new TypeError("fetch failed")]).fn, "tok").getRun("r1").catch((x) => x);
  assert.ok(lost instanceof ApifyRetryable);
  assert.equal(lost.status, null, "no answer is a null status: for a start, nobody knows whether it runs");
});

test("a run is read into its six facts", async () => {
  const c = apifyClient(http([ok(200, { data: actorRun({ status: "SUCCEEDED", finishedAt: "2026-09-19T12:03:00.000Z", usageTotalUsd: 0.12 }) })]).fn, "tok");
  assert.deepEqual(await c.getRun("RunFixture0001"), { id: "RunFixture0001", status: "SUCCEEDED", datasetId: "DsFixture0001", usageTotalUsd: 0.12, startedAt: "2026-09-19T12:00:00.000Z", finishedAt: "2026-09-19T12:03:00.000Z" });
});

test("items are read from an offset with a field projection and never clean or skipEmpty, so an offset always means the same item; the total rides a header", async () => {
  const h = http([ok(200, [{ title: "A" }, { title: "B" }], { "x-apify-pagination-total": "57" })]);
  const out = await apifyClient(h.fn, "tok").listItems("DsFixture0001", 100, 100, ["title", "placeId"]);
  const u = new URL(h.calls[0].url);
  assert.equal(u.pathname, "/v2/datasets/DsFixture0001/items");
  assert.deepEqual(Object.fromEntries(u.searchParams), { offset: "100", limit: "100", fields: "title,placeId", format: "json" });
  assert.deepEqual(out, { items: [{ title: "A" }, { title: "B" }], total: 57 });
});

test("the actor's recent runs are listed since a moment, and a run's input is read from its own store", async () => {
  const runs = { data: { items: [actorRun({ id: "RunNew", startedAt: "2026-09-19T12:10:00.000Z" }), actorRun({ id: "RunOld", startedAt: "2026-09-19T11:00:00.000Z" })] } };
  const h = http([ok(200, runs), ok(200, { data: actorRun({ id: "RunNew", defaultKeyValueStoreId: "Kv9" }) }), ok(200, { searchStringsArray: ["x"], chanlyticsRunId: "row-1" })]);
  const c = apifyClient(h.fn, "tok");
  assert.deepEqual(await c.listActorRuns("compass/crawler-google-places", "2026-09-19T12:00:00.000Z"), [{ id: "RunNew", status: "RUNNING", startedAt: "2026-09-19T12:10:00.000Z", datasetId: "DsFixture0001" }]);
  assert.equal(new URL(h.calls[0].url).pathname, "/v2/actors/compass~crawler-google-places/runs");
  assert.deepEqual(await c.runInput("RunNew"), { searchStringsArray: ["x"], chanlyticsRunId: "row-1" });
  assert.equal(new URL(h.calls[2].url).pathname, "/v2/key-value-stores/Kv9/records/INPUT");
});

test("abort is safe to repeat: a run already finished is not an error", async () => {
  const c = apifyClient(http([ok(200, { data: actorRun({ status: "ABORTED" }) }), ok(400, { error: { type: "run-already-finished" } })]).fn, "tok");
  await c.abortRun("RunFixture0001");
  await c.abortRun("RunFixture0001");
});

test("an actor's event prices are read at Bronze, by event name", async () => {
  const data = { pricingInfos: [{ pricingModel: "PAY_PER_EVENT", pricingPerEvent: { actorChargeEvents: {
    "place-scraped": { eventTieredPricingUsd: { BRONZE: { tieredEventPriceUsd: 0.003 } } },
    "apify-actor-start": { eventPriceUsd: 0.00005 },
  } } }] };
  assert.deepEqual(await apifyClient(http([ok(200, { data })]).fn, "tok").eventPrices("compass/crawler-google-places"), { "place-scraped": 0.003, "apify-actor-start": 0.00005 });
});
