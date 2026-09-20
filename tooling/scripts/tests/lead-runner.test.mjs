/**
 * The runner, run: the real core verbs over the real database adapter
 * (packages/jobs leads-db.ts) on the world in memory, the provider and the
 * judge faked. Each case is one rule of PRD §0.5 or §12.5.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { startRound, collect, check, reconcileUnknownRuns, LeadRetry, INPUT_MARKER, OUT_OF_AREA_REASON, CLOSED_REASON, JUDGE_MARGIN_MS } from "../../../packages/core/src/leads/runner.ts";
import { JUDGE_REFUSED_REASON, JUDGE_TIMEOUT_MS } from "../../../packages/core/src/leads/judge.ts";
import { runIdFor } from "../../../packages/core/src/leads/ids.ts";
import { ApifyRefused, ApifyRetryable } from "../../../packages/channels/src/apify.ts";
import { leadDb } from "../../../apps/edge/lib/lead-db.ts";
import { leadWorld, sha256, webhookToken, TENANT } from "./_lead-world.mjs";
import { PLAN, actorRun, mapsItem } from "./_lead-fixtures.mjs";

const OWNER = "job-1";
function world(over = {}) {
  const w = leadWorld(over);
  const plan = over.plan ?? PLAN;
  w.rpcs.lead_search_create({ p_tenant_id: TENANT, p_plan: plan, p_via: "people", p_estimate_usd: 2 });
  const db = leadDb(w.db);
  return { w, db, p: (owner = OWNER, o = {}) => w.ports(owner, { db, ...o }) };
}

test("the start: a run row per term by its deterministic id with its token's hash, claimed, then started with our row id in the input and a webhook that names the row; the first collect twenty seconds out", async () => {
  const { w, db, p } = world();
  const out = await startRound(p(), w.round().id, OWNER);
  assert.deepEqual(out, { kind: "started", phase: "probe", runs: [{ term: "personal trainer", kind: "started" }, { term: "strength coach", kind: "started" }] });
  const runs = w.runs();
  assert.equal(runs.length, 2);
  assert.equal(runs[0].id, await runIdFor(w.round().id, "probe", "personal trainer"));
  assert.equal(runs[0].webhook_token_hash, sha256(await webhookToken(runs[0].id)));
  assert.deepEqual([runs[0].state, runs[0].claimed_by, !!runs[0].apify_run_id], ["running", OWNER, true]);
  const starts = w.apify.calls.filter((c) => c.op === "startRun");
  assert.equal(starts.length, 2);
  assert.equal(starts[0].input[INPUT_MARKER], runs[0].id);
  assert.deepEqual([starts[0].input.maxCrawledPlacesPerSearch, starts[1].input.maxCrawledPlacesPerSearch], [13, 12], "25 across the terms");
  assert.equal(starts[0].opts.maxTotalChargeUsd, 0.5, "the actor's floor");
  const u = new URL(starts[0].opts.webhooks[0].requestUrl);
  assert.deepEqual([u.origin + u.pathname, u.searchParams.get("run"), u.searchParams.get("token")], ["https://edge.example/api/apify-webhook", runs[0].id, await webhookToken(runs[0].id)]);
  assert.deepEqual(w.jobsOf("lead_collect").map((j) => [j.payload.seq, Date.parse(j.due_at) - w.clock.ms]), [["p0", 20_000], ["p0", 20_000]]);
  // A second start of the same round, by another job: the rows are already there and started; nothing reaches the provider.
  const again = await startRound(p("job-2"), w.round().id, "job-2");
  assert.deepEqual(again.runs.map((r) => r.kind), ["already", "already"]);
  assert.equal(w.apify.calls.filter((c) => c.op === "startRun").length, 2);
  assert.equal((await db.runsOfRound(w.round().id)).length, 2, "no second set of rows");
});

test("a refused start fails the run through the reconcile door; every term refused ends the round 'the source failed'", async () => {
  const { w, p } = world();
  w.apify.faults.startRun = new ApifyRefused(402, "the provider refused: not-enough-usage");
  const out = await startRound(p(), w.round().id, OWNER);
  assert.deepEqual(out.runs.map((r) => r.kind), ["refused", "started"]);
  assert.deepEqual([w.runs()[0].state, w.runs()[1].state], ["failed", "running"]);
  const { w: w2, p: p2 } = world();
  w2.apify.startRun = async () => { throw new ApifyRefused(400, "the provider refused: invalid-input"); };
  await startRound(p2(), w2.round().id, OWNER);
  assert.deepEqual([w2.round().state, w2.round().ending], ["ended", "source_failed"]);
});

test("a start whose answer was lost stays unknown and is never started again; the sweep reconciles it by our row id in the provider's list, or fails it after ten minutes", async () => {
  const { w, p } = world();
  const real = w.apify.startRun;
  let n = 0;
  w.apify.startRun = async (...a) => { n += 1; if (n === 1) { await real(...a); throw new ApifyRetryable(null, "the provider did not answer"); } return real(...a); };
  const out = await startRound(p(), w.round().id, OWNER);
  assert.deepEqual(out.runs.map((r) => r.kind), ["unknown", "started"]);
  assert.deepEqual([w.runs()[0].state, w.runs()[0].apify_run_id], ["unknown", null]);
  const again = await startRound(p("job-2"), w.round().id, "job-2");
  assert.deepEqual(again.runs.map((r) => r.kind), ["already", "already"], "never started again blindly");
  const done = await reconcileUnknownRuns(p("sweep"), [w.runs()[0]]);
  assert.deepEqual(done, [{ runId: w.runs()[0].id, kind: "reconciled" }]);
  assert.deepEqual([w.runs()[0].state, w.runs()[0].apify_run_id], ["running", "RunFake0001"], "the run the provider held for this row");
  assert.ok(w.jobsOf("lead_collect").some((j) => j.payload.run_id === w.runs()[0].id && /^s\d+$/.test(j.payload.seq)));
  // A row with no run at the provider: waited on, then failed.
  const { w: w3, p: p3 } = world();
  w3.apify.startRun = async () => { throw new ApifyRetryable(null, "lost"); };
  await startRound(p3(), w3.round().id, OWNER);
  assert.deepEqual((await reconcileUnknownRuns(p3("sweep"), w3.runs())).map((d) => d.kind), ["waiting", "waiting"]);
  w3.clock.advance(11 * 60_000);
  assert.deepEqual((await reconcileUnknownRuns(p3("sweep"), w3.runs())).map((d) => d.kind), ["failed", "failed"]);
});

test("an unknown start is looked for in the provider's whole list: a run pushed past the newest twenty by a round's other terms, or another search on the same account, is still found", async () => {
  const { w, p } = world();
  const real = w.apify.startRun;
  let n = 0;
  w.apify.startRun = async (...a) => { n += 1; if (n === 1) { await real(...a); throw new ApifyRetryable(null, "the provider did not answer"); } return real(...a); };
  assert.deepEqual((await startRound(p(), w.round().id, OWNER)).runs.map((r) => r.kind), ["unknown", "started"]);
  const ours = w.runs()[0];
  // Thirty runs of somebody else's on the same account, all newer: ours is thirtieth in the list.
  const mine = w.apify.state.runs;
  const others = {};
  for (let i = 0; i < 30; i++) others[`RunOther${i}`] = actorRun({ id: `RunOther${i}`, startedAt: "2026-09-19T12:00:30.000Z" });
  w.apify.state.runs = { ...others, ...mine };
  assert.deepEqual(await reconcileUnknownRuns(p("sweep"), [ours]), [{ runId: ours.id, kind: "reconciled" }]);
  assert.deepEqual([w.runs()[0].state, w.runs()[0].apify_run_id], ["running", "RunFake0001"], "a run the provider is charging for is never left unsettled");
});

test("a busy provider throws for the ledger; the job tried again finds its own claim and starts the rows it left, looking at the provider first", async () => {
  const { w, p } = world();
  const real = w.apify.startRun;
  let n = 0;
  w.apify.startRun = async (...a) => { n += 1; if (n === 2) throw new ApifyRetryable(503, "busy"); return real(...a); };
  await assert.rejects(startRound(p(), w.round().id, OWNER), ApifyRetryable);
  assert.deepEqual([w.runs()[0].state, w.runs()[1].state, w.runs()[1].claimed_by], ["running", "starting", OWNER]);
  const again = await startRound(p(), w.round().id, OWNER);
  assert.deepEqual(again.runs.map((r) => r.kind), ["already", "started"]);
  assert.ok(w.apify.calls.some((c) => c.op === "listActorRuns"), "looked for its own run before starting again");
  assert.equal(w.runs()[1].state, "running");
});

test("the switch: a workspace no longer listed while searches are off is 'paused' before anything is spent", async () => {
  const { w, p } = world();
  w.T.lead_platform[0].tenants_on = [];
  assert.deepEqual(await startRound(p(), w.round().id, OWNER), { kind: "paused" });
  assert.deepEqual([w.round().state, w.round().ending, w.apify.calls.length], ["ended", "paused", 0]);
});

test("nothing left of what the round reserved: nothing is started, and the round says the budget is used", async () => {
  const { w, p } = world();
  const round = w.round();
  round.cost_usd = round.cost_reserved_usd;
  assert.deepEqual(await startRound(p(), round.id, OWNER), { kind: "spent" });
  assert.deepEqual([w.round().state, w.round().ending], ["ended", "budget_used"]);
  assert.deepEqual([w.apify.calls.length, w.runs().length], [0, 0], "the actor's cap floor is a floor on a cap, not a licence to spend what was never reserved");
});

async function probed(over = {}) {
  const x = world(over);
  await startRound(x.p(), x.w.round().id, OWNER);
  x.w.finishRuns();
  return x;
}

test("ACCEPTANCE: the probe fixture, 12 of 24 fitting, stops to ask from the most common exclusion; the judge was paid once per batch; the closed place is left out by rule; a left-out place stores no email", async () => {
  const { w, p } = await probed();
  const [r1, r2] = w.runs();
  const a = await collect(p("c1"), r1.id, "p0", "c1");
  assert.deepEqual([a.kind, a.commits, a.toOffset, a.runState], ["committed", 1, 13, "succeeded"]);
  assert.equal(w.round().state, "probing", "the first term is in; the second is not");
  const b = await collect(p("c2"), r2.id, "p0", "c2");
  assert.deepEqual([b.kind, b.runState, b.roundState], ["committed", "succeeded", "waiting_on_owner"]);
  assert.deepEqual(w.judge.calls.map((c) => c.length), [13, 11], "one call per batch: the first term's 13, then the second's 12 with the closed one left out by rule");
  assert.equal(w.T.lead_judgments.length, 2);
  const q = w.round().question;
  assert.equal(q.criterionKey, "chains", "only an exclusion's own tally can be the topic: Include lifts a chip, never a required criterion");
  assert.match(q.sentence, /^Some of the first 24 are chain gyms and other kinds of places, which I'm leaving out\./);
  assert.equal(q.dropTerm, "strength coach", "the term that returned mostly chains is dropped first (P4)");
  assert.equal(w.jobsOf("lead_round_start").length, 1, "nothing more is started until it is answered");
  const members = w.members();
  assert.equal(members.length, 25);
  const byClass = (c) => members.filter((m) => m.class === c).length;
  assert.deepEqual([byClass("qualified"), byClass("review"), byClass("excluded")], [11, 1, 13], "a fit place with a placeholder phone is Needs review under a phone standard");
  assert.deepEqual(members.find((m) => m.class === "review").judgment.reasons, ["phone:none"], "the reason token contracts' classify spells");
  // "Ideally both": this plan asks for a phone, and every email it found is still sent to the mailbox check
  // (0.09 cents each), so most leads arrive with both, each with its own state. Pinned so it cannot be
  // "optimised" away as spend the standard did not ask for.
  const withEmail = w.T.leads.filter((l) => l.email);
  assert.ok(withEmail.length > 0);
  assert.ok(withEmail.every((l) => l.email_state === "checking"), "a found email is checked whatever the standard asked for");
  assert.equal(members.find((m) => m.excluded_by === "closed").reason, CLOSED_REASON);
  const closed = members.find((m) => m.excluded_by === "closed");
  const closedLead = w.T.leads.find((l) => l.id === closed.lead_id);
  assert.equal(closedLead.email, null, "a left-out place never stores its candidate email");
  // D2: what the listing shows rides the commit for a lead, and a left-out place carries none of it (§0.4).
  const kept = w.T.leads.find((l) => l.id === members.find((m) => m.class === "qualified").lead_id);
  assert.deepEqual([kept.about, kept.claimed, kept.rank !== null, kept.hours.length, !!kept.image_url], ["Independent strength studio in South Austin.", true, true, 2, true], "what the listing shows rides the commit");
  assert.deepEqual([closedLead.about, closedLead.image_url, closedLead.hours, closedLead.claimed], [null, null, [], null], "a left-out place carries none of it");
  const chain = members.find((m) => m.excluded_by === "chains");
  assert.equal(w.T.leads.find((l) => l.id === chain.lead_id).email, null);
  assert.equal(members.filter((m) => m.counted).length, 11, "eleven qualified count, under the phone standard");
  const shared = members.filter((m) => m.judgment.shares.length);
  assert.equal(shared.length, 1, "the second of two places sharing a number is marked, never merged");
  assert.deepEqual(shared[0].judgment.shares, [{ kind: "phone", place_id: "ChIJfixture0004" }]);
  assert.equal(w.T.leads.find((l) => l.id === shared[0].lead_id).place_id, "ChIJfixture0005", "a lead of its own, with the number it shares");
});

test("a probe that fits well goes on: the round runs and the main phase is scheduled as a resume of the same round, sized from the yield", async () => {
  const { w, p } = await probed({ plan: { ...PLAN, count: 60, criteria: [{ key: "right_kind", text: "a place", standard: "likely", required: false }], exclusions: [] } });
  for (const r of w.runs()) await collect(p(`c-${r.id}`), r.id, "p0", `c-${r.id}`);
  assert.equal(w.round().state, "running");
  const resume = w.jobsOf("lead_round_start").filter((j) => j.payload.resume);
  assert.equal(resume.length, 1);
  const out = await startRound(p("job-3"), w.round().id, "job-3", true);
  assert.equal(out.phase, "main");
  assert.equal(w.runs().length, 4, "two more rows, by their main-phase ids");
  const starts = w.apify.calls.filter((c) => c.op === "startRun").slice(2);
  const askedFor = starts.reduce((s, c) => s + c.input.maxCrawledPlacesPerSearch, 0);
  const remaining = 60 - w.members().filter((m) => m.counted).length;
  assert.ok(askedFor >= Math.ceil(remaining * 1.2) && askedFor <= remaining * 4, `the remainder (${remaining}) over the yield, within 1.2x and 4x: ${askedFor}`);
});

test("a term the sizing gives nothing to is never started: no row, no provider call, no charge", async () => {
  const { w, p } = await probed({ plan: { ...PLAN, count: 60, criteria: [{ key: "right_kind", text: "a place", standard: "likely", required: false }], exclusions: [] } });
  for (const r of w.runs()) await collect(p(`c-${r.id}`), r.id, "p0", `c-${r.id}`);
  const round = w.round();
  // Three terms, and one lead still wanted: the sizing has two places to give away and three terms to give them to.
  round.plan = { ...round.plan, terms: [...PLAN.terms, "kettlebell class"], count: w.members().filter((m) => m.counted).length + 1 };
  const before = w.apify.calls.filter((c) => c.op === "startRun").length;
  const out = await startRound(p("job-3"), round.id, "job-3", true);
  assert.deepEqual([out.phase, out.runs.map((r) => r.term)], ["main", ["personal trainer", "strength coach"]]);
  assert.equal(w.apify.calls.filter((c) => c.op === "startRun").length, before + 2, "the third term reached the provider not at all");
  assert.equal(w.runs().filter((r) => r.term === "kettlebell class").length, 0, "and it has no row to claim, lease or collect");
});

test("a probe that already reaches the count asks for nothing more: the round goes to its checks with 'target reached' pending", async () => {
  const { w, p } = await probed({ plan: { ...PLAN, count: 10, criteria: [{ key: "right_kind", text: "a place", standard: "likely", required: false }], exclusions: [] } });
  for (const r of w.runs()) await collect(p(`c-${r.id}`), r.id, "p0", `c-${r.id}`);
  assert.deepEqual([w.round().state, w.round().ending_pending, w.jobsOf("lead_round_start").filter((j) => j.payload.resume).length, w.jobsOf("lead_check").length], ["checking", "target_reached", 0, 1]);
  assert.equal(w.members().filter((m) => m.counted).length, 10, "ten asked, more qualified, ten count");
});

test("out of time before the judge is a retry for the ledger, with nothing committed; a lease held by another is 'busy' with a collect scheduled after it", async () => {
  const { w, p } = await probed();
  const r1 = w.runs()[0];
  await assert.rejects(collect(p("c1", { deadline: w.clock.ms }), r1.id, "p0", "c1"), LeadRetry);
  assert.equal(w.members().length, 0);
  assert.equal(w.judge.calls.length, 0);
  // The judge's margin covers the judge's own timeout: a call that may take
  // forty seconds is never started with twenty left, or the function is killed
  // mid-call and the batch is paid for twice.
  assert.ok(JUDGE_MARGIN_MS >= JUDGE_TIMEOUT_MS, `the margin (${JUDGE_MARGIN_MS}) must cover the call it guards (${JUDGE_TIMEOUT_MS})`);
  const reads = w.apify.calls.length;
  await assert.rejects(collect(p("c1b", { deadline: w.clock.ms + 20_000 }), r1.id, "p0", "c1b"), LeadRetry);
  assert.ok(w.apify.calls.length > reads, "twenty seconds is room enough to read the run and its items");
  assert.equal(w.judge.calls.length, 0, "and not room enough to ask the judge");
  assert.equal(w.members().length, 0, "nothing is committed");
  w.rpcs.lead_run_lease({ p_run_id: r1.id, p_owner: "somebody", p_seconds: 90 });
  assert.deepEqual(await collect(p("c1"), r1.id, "p0", "c1"), { kind: "busy" });
  assert.ok(w.jobsOf("lead_collect").some((j) => j.payload.seq === "p0.b"));
});

test("a page bigger than one judge batch: every batch is committed where the last one ended, and the next poll reads on from there without skipping a place the owner paid for", async () => {
  const { w, p } = world();
  await startRound(p(), w.round().id, OWNER);
  const r1 = w.runs()[0];
  // Sixty places in one dataset, the run still going: three batches of the judge's twenty-five.
  w.apify.state.datasets[r1.dataset_id] = Array.from({ length: 60 }, (_, i) => mapsItem(200 + i));
  const pairs = [];
  const realCommit = w.rpcs.lead_collect_commit;
  w.rpcs.lead_collect_commit = (a) => { pairs.push([a.p_from_offset, a.p_to_offset]); return realCommit(a); };
  const out = await collect(p("c1"), r1.id, "p0", "c1");
  assert.deepEqual([out.kind, out.commits, out.toOffset], ["committed", 3, 60]);
  assert.deepEqual(pairs, [[0, 25], [25, 50], [50, 60]], "the offset is the page's own, never the running one added to itself");
  assert.deepEqual([w.runs()[0].read_offset, w.runs()[0].items_seen], [60, 60], "what was read and what was seen are one number");
  assert.equal(w.members().length, 60, "and no place is lost between the batches");
  const next = w.jobsOf("lead_collect").find((j) => j.payload.run_id === r1.id && j.payload.seq !== "p0");
  assert.equal(next.payload.seq, "p60", "the poll that rides the commit names the offset it stopped at");
  await collect(p("c2"), r1.id, next.payload.seq, "c2");
  assert.deepEqual(w.apify.calls.filter((c) => c.op === "listItems" && c.datasetId === r1.dataset_id).map((c) => c.offset), [0, 60], "the second poll reads on from sixty, not past it");
});

test("the commit is one call guarded by the lease's generation and the offset: a stale generation and a stale offset are refused, and Stop moves the generation", async () => {
  const { w, db } = await probed();
  const r1 = w.runs()[0];
  const gen = await db.runLease(r1.id, "c1", 90);
  assert.equal(gen, 0);
  w.rpcs.lead_round_stop({ p_search_id: w.search().id });
  const page = { judgment: null, places: [], usage_usd: 0, items_seen: 0, run_state: null, next: null, round: null };
  assert.deepEqual(await db.collectCommit(r1.id, "c1", gen, 0, 0, page), { ok: false, why: "lease" });
  const gen2 = await db.runLease(r1.id, "c1", 90);
  assert.equal(gen2, 1);
  assert.deepEqual(await db.collectCommit(r1.id, "c1", gen2, 7, 8, page), { ok: false, why: "offset" });
  assert.equal((await db.collectCommit(r1.id, "c1", gen2, 0, 0, page)).ok, true);
});

test("a judge that refuses twice leaves the batch Needs review with its reason; the judge's answer never reaches the class when the place is out of the area", async () => {
  const { w, p } = await probed({ plan: { ...PLAN, area: { ...PLAN.area, kind: "zip", zip: "78704", center: null, radius_m: 8000 } } });
  w.judge.judge = async () => ({ refused: true, why: "max_tokens" });
  const r1 = w.runs()[0];
  await collect(p("c1"), r1.id, "p0", "c1");
  const reasons = new Set(w.members().map((m) => m.reason));
  assert.ok(reasons.has(JUDGE_REFUSED_REASON));
  assert.ok(w.members().filter((m) => m.class === "review").length >= 11);
  const far = mapsItem(50, { location: { lat: 32.7767, lng: -96.797 }, city: "Dallas" });
  w.apify.state.datasets[w.runs()[1].dataset_id] = [far];
  w.judge.judge = async () => { throw new Error("must not be asked about a place outside the area"); };
  await collect(p("c2"), w.runs()[1].id, "p0", "c2");
  const m = w.members().find((x) => w.T.leads.find((l) => l.id === x.lead_id).city === "Dallas");
  assert.deepEqual([m.class, m.reason, m.distance_m > 250_000], ["review", OUT_OF_AREA_REASON, true]);
});

test("Stop: the run is aborted at the provider and the round goes to its checks with 'stopped' pending; the checker takes the found addresses and the last answer ends the round 'stopped'", async () => {
  const { w, p } = await probed({ plan: { ...PLAN, contact: "email" } });
  const [r1, r2] = w.runs();
  await collect(p("c1"), r1.id, "p0", "c1");
  w.apify.state.runs[r2.apify_run_id].status = "RUNNING";
  w.rpcs.lead_round_stop({ p_search_id: w.search().id });
  const stop = w.jobsOf("lead_collect").find((j) => j.payload.seq === "stop");
  assert.ok(stop, "the door scheduled a stop collect for the running run");
  assert.deepEqual(await collect(p("s1"), r2.id, "stop", "s1"), { kind: "stopped" });
  assert.deepEqual(w.apify.calls.filter((c) => c.op === "abortRun").map((c) => c.id), [r2.apify_run_id]);
  assert.deepEqual([w.round().state, w.round().ending_pending, w.runs()[1].state], ["checking", "stopped", "aborted"]);
  assert.equal(w.jobsOf("lead_check").length, 1);
  const c = await check(p("k1"), w.round().id, 0, "k1");
  assert.equal(c.kind, "started");
  const checkRun = w.runs().find((r) => r.purpose === "check");
  const startCall = w.apify.calls.filter((x) => x.op === "startRun").at(-1);
  assert.deepEqual([startCall.actor, startCall.input.emails.length, startCall.input[INPUT_MARKER]], ["bounceverify/bounceverify-email-verifier", c.emails, checkRun.id]);
  w.finishRuns();
  const done = await collect(p("c3"), checkRun.id, "final", "c3");
  assert.deepEqual([done.kind, done.last], ["checked", true]);
  assert.deepEqual([w.round().state, w.round().ending], ["ended", "stopped"]);
  assert.ok(w.T.leads.filter((l) => l.email).every((l) => l.email_state === "ok"));
});

test("the switch, read before the checker too: with searches off nothing is started, the addresses still waiting say they could not be checked, and the round ends paused", async () => {
  const { w, p } = await probed({ plan: { ...PLAN, contact: "email" } });
  const [r1, r2] = w.runs();
  await collect(p("c1"), r1.id, "p0", "c1");
  w.rpcs.lead_round_stop({ p_search_id: w.search().id });
  await collect(p("s1"), r2.id, "stop", "s1");
  assert.equal(w.round().state, "checking");
  const started = w.apify.calls.filter((c) => c.op === "startRun").length;
  const waiting = w.T.leads.filter((l) => l.email_state === "checking").length;
  assert.ok(waiting > 0, "there are addresses to check");
  w.T.lead_platform[0].tenants_on = [];
  assert.deepEqual(await check(p("k1"), w.round().id, 0, "k1"), { kind: "paused" });
  assert.equal(w.apify.calls.filter((c) => c.op === "startRun").length, started, "no checker run is started");
  assert.equal(w.runs().filter((r) => r.purpose === "check").length, 0, "and no row to claim, lease or collect");
  assert.deepEqual([w.round().state, w.round().ending], ["ended", "paused"]);
  assert.equal(w.T.leads.filter((l) => l.email_state === "unknown").length, waiting, "every address that was waiting says it could not be checked");
});

test("a poll the door never cancelled, arriving after Stop: it decides nothing, the round stays stopped, and no new money reaches the provider", async () => {
  const good = { ...PLAN, count: 60, criteria: [{ key: "right_kind", text: "a place", standard: "likely", required: false }], exclusions: [] };
  const { w, p } = await probed({ plan: good });
  const [r1, r2] = w.runs();
  await collect(p("c1"), r1.id, "p0", "c1");
  w.rpcs.lead_round_stop({ p_search_id: w.search().id });
  assert.deepEqual(await collect(p("s1"), r2.id, "stop", "s1"), { kind: "stopped" });
  assert.deepEqual([w.round().state, w.round().ending_pending], ["checking", "stopped"]);
  const started = w.apify.calls.filter((c) => c.op === "startRun").length;
  const members = w.members().length;
  // The first run's own poll, scheduled before the Stop and never cancelled.
  assert.deepEqual(await collect(p("c9"), r1.id, "p0", "c9"), { kind: "round_closing" });
  assert.deepEqual([w.round().state, w.round().ending_pending], ["checking", "stopped"], "a round on its way out is never sent back to running");
  assert.equal(w.jobsOf("lead_round_start").filter((j) => j.payload.resume).length, 0, "and nothing of it is resumed");
  assert.equal(w.members().length, members, "the stale page commits nothing");
  for (const j of w.jobsOf("lead_round_start")) await startRound(p("j9"), j.payload.round_id, "j9", j.payload.resume === true);
  assert.equal(w.apify.calls.filter((c) => c.op === "startRun").length, started, "Stop is the last word: nothing is started again");
});

test("the checks decide the email standard: a review held only for its email becomes qualified and counts when the mailbox answers ok", async () => {
  const { w, p } = await probed({ plan: { ...PLAN, contact: "email", criteria: [{ key: "right_kind", text: "a place", standard: "likely", required: false }], exclusions: [] } });
  for (const r of w.runs()) await collect(p(`c-${r.id}`), r.id, "p0", `c-${r.id}`);
  assert.equal(w.members().filter((m) => m.class === "qualified").length, 0, "nothing qualifies before its email is checked");
  await startRound(p("j2"), w.round().id, "j2", true);
  w.finishRuns();
  for (const r of w.runs().filter((x) => x.state === "running")) await collect(p(`m-${r.id}`), r.id, "p0", `m-${r.id}`);
  assert.equal(w.round().state, "checking");
  w.checkerAnswers = { "hello@place0001.example": "invalid", "hello@place0002.example": "risky" };
  await check(p("k1"), w.round().id, 0, "k1");
  w.finishRuns();
  const cr = w.runs().find((r) => r.purpose === "check");
  await collect(p("kc"), cr.id, "final", "kc");
  const lead = (n) => w.T.leads.find((l) => l.place_id === `ChIJfixture${String(n).padStart(4, "0")}`);
  assert.deepEqual([lead(1).email_state, lead(2).email_state, lead(3).email_state], ["invalid", "catch_all", "ok"]);
  const member = (n) => w.members().find((m) => m.lead_id === lead(n).id);
  assert.deepEqual([member(1).class, member(2).class, member(3).class, member(3).counted], ["review", "review", "qualified", true]);
  assert.equal(w.round().state, "ended");
});
