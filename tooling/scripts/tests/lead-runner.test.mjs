/**
 * The runner, run: the real core verbs over the real database adapter
 * (packages/jobs leads-db.ts) on the world in memory, the provider and the
 * judge faked. Each case is one rule of PRD §0.5 or §12.5.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  startRound,
  collect,
  check,
  reconcileUnknownRuns,
  LeadRetry,
  INPUT_MARKER,
  OUT_OF_AREA_REASON,
  CLOSED_REASON,
  JUDGE_MARGIN_MS,
  rejudgeProbe,
} from "../../../packages/core/src/leads/runner.ts";
import { JUDGE_REFUSED_REASON, JUDGE_TIMEOUT_MS } from "../../../packages/core/src/leads/judge.ts";
import { runIdFor } from "../../../packages/core/src/leads/ids.ts";
import { ApifyRefused, ApifyRetryable } from "../../../packages/channels/src/apify.ts";
import { leadDb } from "../../../apps/edge/lib/leads/lead-db.ts";
import { leadWorld, sha256, webhookToken, TENANT } from "./_lead-world.mjs";
import { PLAN, actorRun, mapsItem } from "./_lead-fixtures.mjs";
import { MARK_MAX_BYTES } from "../../../packages/core/src/leads/mark-image.ts";
import { notAnImage, png } from "./_mark-images.mjs";

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
  assert.deepEqual(out, {
    kind: "started",
    phase: "probe",
    runs: [
      { term: "personal trainer", kind: "started" },
      { term: "strength coach", kind: "started" },
    ],
  });
  const runs = w.runs();
  assert.equal(runs.length, 2);
  assert.equal(runs[0].id, await runIdFor(w.round().id, "probe", "personal trainer"));
  assert.equal(runs[0].webhook_token_hash, sha256(await webhookToken(runs[0].id)));
  assert.deepEqual([runs[0].state, runs[0].claimed_by, !!runs[0].apify_run_id], ["running", OWNER, true]);
  const starts = w.apify.calls.filter((c) => c.op === "startRun");
  assert.equal(starts.length, 2);
  assert.equal(starts[0].input[INPUT_MARKER], runs[0].id);
  assert.deepEqual(
    [starts[0].input.maxCrawledPlacesPerSearch, starts[1].input.maxCrawledPlacesPerSearch],
    [13, 12],
    "25 across the terms",
  );
  assert.equal(starts[0].opts.maxTotalChargeUsd, 0.5, "the actor's floor");
  const u = new URL(starts[0].opts.webhooks[0].requestUrl);
  assert.deepEqual(
    [u.origin + u.pathname, u.searchParams.get("run"), u.searchParams.get("token")],
    ["https://edge.example/api/apify-webhook", runs[0].id, await webhookToken(runs[0].id)],
  );
  assert.deepEqual(
    w.jobsOf("lead_collect").map((j) => [j.payload.seq, Date.parse(j.due_at) - w.clock.ms]),
    [
      ["p0", 20_000],
      ["p0", 20_000],
    ],
  );
  // A second start of the same round, by another job: the rows are already there and started; nothing reaches the provider.
  const again = await startRound(p("job-2"), w.round().id, "job-2");
  assert.deepEqual(
    again.runs.map((r) => r.kind),
    ["already", "already"],
  );
  assert.equal(w.apify.calls.filter((c) => c.op === "startRun").length, 2);
  assert.equal((await db.runsOfRound(w.round().id)).length, 2, "no second set of rows");
});

test("a refused start fails the run through the reconcile door; every term refused ends the round 'the source failed'", async () => {
  const { w, p } = world();
  w.apify.faults.startRun = new ApifyRefused(402, "the provider refused: not-enough-usage");
  const out = await startRound(p(), w.round().id, OWNER);
  assert.deepEqual(
    out.runs.map((r) => r.kind),
    ["refused", "started"],
  );
  assert.deepEqual([w.runs()[0].state, w.runs()[1].state], ["failed", "running"]);
  const { w: w2, p: p2 } = world();
  w2.apify.startRun = async () => {
    throw new ApifyRefused(400, "the provider refused: invalid-input");
  };
  await startRound(p2(), w2.round().id, OWNER);
  assert.deepEqual([w2.round().state, w2.round().ending], ["ended", "source_failed"]);
});

test("a start whose answer was lost stays unknown and is never started again; the sweep reconciles it by our row id in the provider's list, or fails it after ten minutes", async () => {
  const { w, p } = world();
  const real = w.apify.startRun;
  let n = 0;
  w.apify.startRun = async (...a) => {
    n += 1;
    if (n === 1) {
      await real(...a);
      throw new ApifyRetryable(null, "the provider did not answer");
    }
    return real(...a);
  };
  const out = await startRound(p(), w.round().id, OWNER);
  assert.deepEqual(
    out.runs.map((r) => r.kind),
    ["unknown", "started"],
  );
  assert.deepEqual([w.runs()[0].state, w.runs()[0].apify_run_id], ["unknown", null]);
  const again = await startRound(p("job-2"), w.round().id, "job-2");
  assert.deepEqual(
    again.runs.map((r) => r.kind),
    ["already", "already"],
    "never started again blindly",
  );
  const done = await reconcileUnknownRuns(p("sweep"), [w.runs()[0]]);
  assert.deepEqual(done, [{ runId: w.runs()[0].id, kind: "reconciled" }]);
  assert.deepEqual(
    [w.runs()[0].state, w.runs()[0].apify_run_id],
    ["running", "RunFake0001"],
    "the run the provider held for this row",
  );
  assert.ok(w.jobsOf("lead_collect").some((j) => j.payload.run_id === w.runs()[0].id && /^s\d+$/.test(j.payload.seq)));
  // A row with no run at the provider: waited on, then failed.
  const { w: w3, p: p3 } = world();
  w3.apify.startRun = async () => {
    throw new ApifyRetryable(null, "lost");
  };
  await startRound(p3(), w3.round().id, OWNER);
  assert.deepEqual(
    (await reconcileUnknownRuns(p3("sweep"), w3.runs())).map((d) => d.kind),
    ["waiting", "waiting"],
  );
  w3.clock.advance(11 * 60_000);
  assert.deepEqual(
    (await reconcileUnknownRuns(p3("sweep"), w3.runs())).map((d) => d.kind),
    ["failed", "failed"],
  );
});

test("an unknown start is looked for in the provider's whole list: a run pushed past the newest twenty by a round's other terms, or another search on the same account, is still found", async () => {
  const { w, p } = world();
  const real = w.apify.startRun;
  let n = 0;
  w.apify.startRun = async (...a) => {
    n += 1;
    if (n === 1) {
      await real(...a);
      throw new ApifyRetryable(null, "the provider did not answer");
    }
    return real(...a);
  };
  assert.deepEqual(
    (await startRound(p(), w.round().id, OWNER)).runs.map((r) => r.kind),
    ["unknown", "started"],
  );
  const ours = w.runs()[0];
  // Thirty runs of somebody else's on the same account, all newer: ours is thirtieth in the list.
  const mine = w.apify.state.runs;
  const others = {};
  for (let i = 0; i < 30; i++)
    others[`RunOther${i}`] = actorRun({ id: `RunOther${i}`, startedAt: "2026-09-19T12:00:30.000Z" });
  w.apify.state.runs = { ...others, ...mine };
  assert.deepEqual(await reconcileUnknownRuns(p("sweep"), [ours]), [{ runId: ours.id, kind: "reconciled" }]);
  assert.deepEqual(
    [w.runs()[0].state, w.runs()[0].apify_run_id],
    ["running", "RunFake0001"],
    "a run the provider is charging for is never left unsettled",
  );
});

test("a busy provider throws for the ledger; the job tried again finds its own claim and starts the rows it left, looking at the provider first", async () => {
  const { w, p } = world();
  const real = w.apify.startRun;
  let n = 0;
  w.apify.startRun = async (...a) => {
    n += 1;
    if (n === 2) throw new ApifyRetryable(503, "busy");
    return real(...a);
  };
  await assert.rejects(startRound(p(), w.round().id, OWNER), ApifyRetryable);
  assert.deepEqual([w.runs()[0].state, w.runs()[1].state, w.runs()[1].claimed_by], ["running", "starting", OWNER]);
  const again = await startRound(p(), w.round().id, OWNER);
  assert.deepEqual(
    again.runs.map((r) => r.kind),
    ["already", "started"],
  );
  assert.ok(
    w.apify.calls.some((c) => c.op === "listActorRuns"),
    "looked for its own run before starting again",
  );
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
  assert.deepEqual(
    [w.apify.calls.length, w.runs().length],
    [0, 0],
    "the actor's cap floor is a floor on a cap, not a licence to spend what was never reserved",
  );
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
  assert.deepEqual(
    w.judge.calls.map((c) => c.length),
    [13, 11],
    "one call per batch: the first term's 13, then the second's 12 with the closed one left out by rule",
  );
  assert.equal(w.T.lead_judgments.length, 2);
  const q = w.round().question;
  assert.equal(
    q.criterionKey,
    "chains",
    "only an exclusion's own tally can be the topic: Include lifts a chip, never a required criterion",
  );
  assert.match(q.sentence, /^Some of the first 24 are chain gyms and other kinds of places, which I'm leaving out\./);
  assert.equal(q.dropTerm, "strength coach", "the term that returned mostly chains is dropped first (P4)");
  assert.equal(w.jobsOf("lead_round_start").length, 1, "nothing more is started until it is answered");
  const members = w.members();
  assert.equal(members.length, 25);
  const byClass = (c) => members.filter((m) => m.class === c).length;
  assert.deepEqual(
    [byClass("qualified"), byClass("review"), byClass("excluded")],
    [11, 1, 13],
    "a fit place with a placeholder phone is Needs review: no phone that dials",
  );
  assert.deepEqual(
    members.find((m) => m.class === "review").judgment.reasons,
    ["email:checking"],
    "its email is the one way left (decision 0010), so the check can still make it count",
  );
  // "Ideally both": this plan asks for a phone, and every email it found is still sent to the mailbox check
  // (0.09 cents each), so most leads arrive with both, each with its own state. Pinned so it cannot be
  // "optimised" away as spend the standard did not ask for.
  const withEmail = w.T.leads.filter((l) => l.email);
  assert.ok(withEmail.length > 0);
  assert.ok(
    withEmail.every((l) => l.email_state === "checking"),
    "a found email is checked whatever the standard asked for",
  );
  assert.equal(members.find((m) => m.excluded_by === "closed").reason, CLOSED_REASON);
  const closed = members.find((m) => m.excluded_by === "closed");
  const closedLead = w.T.leads.find((l) => l.id === closed.lead_id);
  assert.equal(closedLead.email, null, "a left-out place never stores its candidate email");
  // D2: what the listing shows rides the commit for a lead, and a left-out place carries none of it (§0.4).
  const kept = w.T.leads.find((l) => l.id === members.find((m) => m.class === "qualified").lead_id);
  assert.deepEqual(
    [kept.about, kept.claimed, kept.rank !== null, kept.hours.length, !!kept.image_url],
    ["Independent strength studio in South Austin.", true, true, 2, true],
    "what the listing shows rides the commit",
  );
  assert.deepEqual(
    [closedLead.about, closedLead.image_url, closedLead.hours, closedLead.claimed],
    [null, null, [], null],
    "a left-out place carries none of it",
  );
  const chain = members.find((m) => m.excluded_by === "chains");
  assert.equal(w.T.leads.find((l) => l.id === chain.lead_id).email, null);
  assert.equal(members.filter((m) => m.counted).length, 11, "eleven qualified count, under the phone standard");
  const shared = members.filter((m) => m.judgment.shares.length);
  assert.equal(shared.length, 1, "the second of two places sharing a number is marked, never merged");
  assert.deepEqual(shared[0].judgment.shares, [{ kind: "phone", place_id: "ChIJfixture0004" }]);
  assert.equal(
    w.T.leads.find((l) => l.id === shared[0].lead_id).place_id,
    "ChIJfixture0005",
    "a lead of its own, with the number it shares",
  );
});

// The question says "I'm dropping X: it mostly returned those", and a yes accepts that. An answer that changed the
// plan (Include, or Change what I asked) is a new plan whose terms are the owner's: the dropped term is the one that
// finds the kind just included. And the owner is told once, when the round stops to ask, not on every page.
test("an answer that changed the plan keeps every term, a yes drops the one the question named, and asking tells the owner once", async () => {
  for (const [answer, dropped] of [
    ["keep", true],
    ["include", false],
  ]) {
    const told = [];
    const tell = async (e) => {
      told.push(e);
    };
    const { w, p } = await probed();
    const [r1, r2] = w.runs();
    await collect(p("c1", { tell }), r1.id, "p0", "c1");
    assert.deepEqual(told, [], "not while the probe is still coming in");
    await collect(p("c2", { tell }), r2.id, "p0", "c2");
    assert.deepEqual(told, [{ kind: "question", roundId: w.round().id }], "told once, when it asks");
    // The webhook's `final` collect arrives after the poll that already decided (apify-webhook.ts): the round is
    // waiting, so it decides nothing -- no second email, the question and its day untouched.
    const asked = w.round().question;
    const since = w.round().waiting_since;
    await collect(p("c3", { tell }), r2.id, "final", "c3");
    assert.equal(told.length, 1, "a late collect of the finished probe does not ask again");
    assert.deepEqual([w.round().question, w.round().waiting_since], [asked, since]);
    const plan = answer === "include" ? { ...w.round().plan, version: 2, exclusions: [] } : undefined;
    w.rpcs.lead_round_answer({ p_round_id: w.round().id, p_answer: answer, p_plan: plan });
    await startRound(p("job-3"), w.round().id, "job-3", true);
    const terms = w.apify.calls
      .filter((c) => c.op === "startRun")
      .slice(2)
      .map((c) => c.input.searchStringsArray[0]);
    assert.equal(!terms.includes("strength coach"), dropped, `${answer}: ${terms.join(", ")}`);
  }
});

/* --------------------------------------- an answer re-judges the probe -- */

/** The fixture probe, asked about: 24 judged, 11 counted, 9 chains and 3 other kinds left out. */
async function asked() {
  const x = await probed();
  const [r1, r2] = x.w.runs();
  await collect(x.p("c1"), r1.id, "p0", "c1");
  await collect(x.p("c2"), r2.id, "p0", "c2");
  assert.equal(x.w.round().state, "waiting_on_owner");
  return x;
}
const chainsOf = (w) =>
  w.members().filter((m) => w.T.leads.find((l) => l.id === m.lead_id)?.business_name.startsWith("PowerGym"));

// "Include large studio chains" left every one of them out: the main phase skips a place the workspace already holds,
// and the places the probe judged kept the verdicts of the plan the owner had just said was wrong.
test("an Include re-classes the first places from what the judge already said: they come back whole and counted, the judge is not asked again, and the owner's own decision stands", async () => {
  const { w, p } = await asked();
  const paid = w.judge.calls.length;
  const kept = chainsOf(w)[0];
  kept.kept_at = "2026-09-24T05:00:00Z"; // the owner decided this one while the question waited
  const plan = w.round().plan;
  const lifted = {
    ...plan,
    version: 2,
    criteria: plan.criteria.filter((c) => c.key !== "independent"),
    exclusions: [],
  };
  w.rpcs.lead_round_answer({ p_round_id: w.round().id, p_answer: "include", p_plan: lifted });
  await startRound(p("job-3"), w.round().id, "job-3", true);
  assert.equal(
    w.judge.calls.length - paid,
    0,
    "every key the new plan asks was answered already: nobody is paid again",
  );
  const back = chainsOf(w).filter((m) => m !== kept);
  assert.equal(back.length, 8);
  assert.ok(
    back.every((m) => m.class === "qualified" && m.excluded_by === null && m.judgment.plan_version === 2),
    JSON.stringify(back.map((m) => [m.class, m.excluded_by, m.judgment.plan_version])),
  );
  assert.deepEqual([kept.class, kept.judgment.plan_version], ["excluded", undefined], "the owner's decision stands");
  assert.equal(back.filter((m) => m.counted).length, 8, "counted from the round's own reservation");
  assert.equal(w.round().allowance_used, 19);
  const lead = w.T.leads.find((l) => l.id === back[0].lead_id);
  assert.ok(lead.email && lead.email.endsWith(".example"), "whole: the address a left-out place never kept");
  assert.equal(lead.email_state, "checking", "waiting on the round's checks, like any lead's");
  assert.equal(lead.neighborhood, "Zilker", "and what its listing shows");
  const again = await rejudgeProbe(p("job-4"), w.round());
  assert.deepEqual([again.changed, again.judged], [0, 0], "a second pass changes nothing");
});

test("a change that asks something new judges the first places once under it, a batch at a time", async () => {
  const { w, p } = await asked();
  const paid = w.judge.calls.length;
  const plan = w.round().plan;
  const added = {
    ...plan,
    version: 2,
    exclusions: [...plan.exclusions, { key: "big_boxes", text: "big box gyms", origin: "you_said" }],
  };
  w.rpcs.lead_round_answer({ p_round_id: w.round().id, p_answer: "include", p_plan: added });
  const out = await rejudgeProbe(p("job-3"), w.round());
  assert.deepEqual(
    w.judge.calls.slice(paid).map((c) => c.length),
    [24],
    "the 24 the probe judged, in one batch: no stored answer says anything about big box gyms",
  );
  assert.deepEqual([out.judged, out.reused, out.unread], [24, 0, 0]);
  assert.equal(w.T.lead_judgments.length, 3, "the answer kept once, beside the probe's two");
  assert.ok(
    w
      .members()
      .filter((m) => m.judgment.answer)
      .every((m) => m.judgment.plan_version === 2),
    "every place the judge answered is judged under the new plan",
  );
  const before = w.judge.calls.length;
  await rejudgeProbe(p("job-4"), w.round());
  assert.equal(w.judge.calls.length, before, "and never again");
});

test("a dataset the source no longer has leaves its places as they were, said, and the round runs on", async () => {
  const { w, p } = await asked();
  const plan = w.round().plan;
  w.rpcs.lead_round_answer({
    p_round_id: w.round().id,
    p_answer: "include",
    p_plan: { ...plan, version: 2, exclusions: [] },
  });
  // The first term's dataset expired: the provider refuses the read, as it does for a 404.
  w.apify.faults.listItems = new ApifyRefused(404, "the provider refused: record-not-found");
  const out = await startRound(p("job-3"), w.round().id, "job-3", true);
  assert.equal(out.kind, "started", "the main phase starts all the same");
  // It stays gone: the next pass is refused the same read.
  w.apify.faults.listItems = new ApifyRefused(404, "the provider refused: record-not-found");
  const again = await rejudgeProbe(p("job-4"), w.round());
  assert.equal(again.changed, 0, "what the second dataset listed was already re-judged");
  assert.equal(again.unread, 13, "and the first term's thirteen, which nobody could read, are said, not decided");
  const unreadChains = chainsOf(w).filter((m) => m.judgment.term === "personal trainer");
  assert.deepEqual(
    unreadChains.map((m) => m.class),
    ["excluded"],
    "the one chain the first term listed is left as it was",
  );
});

// "Change what I asked" can keep every key and change what the search is for: an answer to "is this one of the
// personal trainers?" is not an answer to "is this one of the wedding planners?".
test("a change that keeps the keys but not the questions judges again", async () => {
  const { w, p } = await asked();
  const paid = w.judge.calls.length;
  const plan = w.round().plan;
  w.rpcs.lead_round_answer({
    p_round_id: w.round().id,
    p_answer: "include",
    p_plan: { ...plan, version: 2, name: "Strength coaches in Austin" },
  });
  const out = await rejudgeProbe(p("job-3"), w.round());
  assert.deepEqual([out.reused, out.judged], [0, 24], "every key, but a different question under the kind");
  assert.equal(w.judge.calls.length - paid, 1);
});

// A city ask has no centre while it probes, so no probe place was ever out of its area; the answer must not invent one.
test("an Include measures the first places as the probe did: a city ask's far place is not sent to review", async () => {
  const x = await probed();
  const [r1, r2] = x.w.runs();
  x.w.apify.state.datasets[r1.dataset_id][0].location = { lat: 30.62, lng: -97.74 }; // 40 km north
  await collect(x.p("c1"), r1.id, "p0", "c1");
  await collect(x.p("c2"), r2.id, "p0", "c2");
  const far = x.w.members().find((m) => x.w.T.leads.find((l) => l.id === m.lead_id)?.lat === 30.62);
  assert.equal(far.class, "qualified", "the probe judged it, and it passed");
  const plan = x.w.round().plan;
  x.w.rpcs.lead_round_answer({
    p_round_id: x.w.round().id,
    p_answer: "include",
    p_plan: { ...plan, version: 2, exclusions: [] },
  });
  await rejudgeProbe(x.p("job-3"), x.w.round());
  assert.deepEqual([far.class, far.counted], ["qualified", true], "still a counted lead");
});

test("a probe that fits well goes on: the round runs and the main phase is scheduled as a resume of the same round, sized from the yield", async () => {
  const { w, p } = await probed({
    plan: {
      ...PLAN,
      count: 60,
      criteria: [{ key: "right_kind", text: "a place", standard: "likely", required: false }],
      exclusions: [],
    },
  });
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
  assert.ok(
    askedFor >= Math.ceil(remaining * 1.2) && askedFor <= remaining * 4,
    `the remainder (${remaining}) over the yield, within 1.2x and 4x: ${askedFor}`,
  );
});

test("a term the sizing gives nothing to is never started: no row, no provider call, no charge", async () => {
  const { w, p } = await probed({
    plan: {
      ...PLAN,
      count: 60,
      criteria: [{ key: "right_kind", text: "a place", standard: "likely", required: false }],
      exclusions: [],
    },
  });
  for (const r of w.runs()) await collect(p(`c-${r.id}`), r.id, "p0", `c-${r.id}`);
  const round = w.round();
  // Three terms, and one lead still wanted: the sizing has two places to give away and three terms to give them to.
  round.plan = {
    ...round.plan,
    terms: [...PLAN.terms, "kettlebell class"],
    count: w.members().filter((m) => m.counted).length + 1,
  };
  const before = w.apify.calls.filter((c) => c.op === "startRun").length;
  const out = await startRound(p("job-3"), round.id, "job-3", true);
  assert.deepEqual([out.phase, out.runs.map((r) => r.term)], ["main", ["personal trainer", "strength coach"]]);
  assert.equal(
    w.apify.calls.filter((c) => c.op === "startRun").length,
    before + 2,
    "the third term reached the provider not at all",
  );
  assert.equal(
    w.runs().filter((r) => r.term === "kettlebell class").length,
    0,
    "and it has no row to claim, lease or collect",
  );
});

test("a probe that already reaches the count asks for nothing more: the round goes to its checks with 'target reached' pending", async () => {
  const { w, p } = await probed({
    plan: {
      ...PLAN,
      count: 10,
      criteria: [{ key: "right_kind", text: "a place", standard: "likely", required: false }],
      exclusions: [],
    },
  });
  for (const r of w.runs()) await collect(p(`c-${r.id}`), r.id, "p0", `c-${r.id}`);
  assert.deepEqual(
    [
      w.round().state,
      w.round().ending_pending,
      w.jobsOf("lead_round_start").filter((j) => j.payload.resume).length,
      w.jobsOf("lead_check").length,
    ],
    ["checking", "target_reached", 0, 1],
  );
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
  assert.ok(
    JUDGE_MARGIN_MS >= JUDGE_TIMEOUT_MS,
    `the margin (${JUDGE_MARGIN_MS}) must cover the call it guards (${JUDGE_TIMEOUT_MS})`,
  );
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
  w.rpcs.lead_collect_commit = (a) => {
    pairs.push([a.p_from_offset, a.p_to_offset]);
    return realCommit(a);
  };
  const out = await collect(p("c1"), r1.id, "p0", "c1");
  assert.deepEqual([out.kind, out.commits, out.toOffset], ["committed", 3, 60]);
  assert.deepEqual(
    pairs,
    [
      [0, 25],
      [25, 50],
      [50, 60],
    ],
    "the offset is the page's own, never the running one added to itself",
  );
  assert.deepEqual(
    [w.runs()[0].read_offset, w.runs()[0].items_seen],
    [60, 60],
    "what was read and what was seen are one number",
  );
  assert.equal(w.members().length, 60, "and no place is lost between the batches");
  const next = w.jobsOf("lead_collect").find((j) => j.payload.run_id === r1.id && j.payload.seq !== "p0");
  assert.equal(next.payload.seq, "p60", "the poll that rides the commit names the offset it stopped at");
  await collect(p("c2"), r1.id, next.payload.seq, "c2");
  assert.deepEqual(
    w.apify.calls.filter((c) => c.op === "listItems" && c.datasetId === r1.dataset_id).map((c) => c.offset),
    [0, 60],
    "the second poll reads on from sixty, not past it",
  );
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
  const { w, p } = await probed({
    plan: { ...PLAN, area: { ...PLAN.area, kind: "zip", zip: "78704", center: null, radius_m: 8000 } },
  });
  w.judge.judge = async () => ({ refused: true, why: "max_tokens" });
  const r1 = w.runs()[0];
  await collect(p("c1"), r1.id, "p0", "c1");
  const reasons = new Set(w.members().map((m) => m.reason));
  assert.ok(reasons.has(JUDGE_REFUSED_REASON));
  assert.ok(w.members().filter((m) => m.class === "review").length >= 11);
  const far = mapsItem(50, { location: { lat: 32.7767, lng: -96.797 }, city: "Dallas" });
  w.apify.state.datasets[w.runs()[1].dataset_id] = [far];
  w.judge.judge = async () => {
    throw new Error("must not be asked about a place outside the area");
  };
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
  assert.deepEqual(
    w.apify.calls.filter((c) => c.op === "abortRun").map((c) => c.id),
    [r2.apify_run_id],
  );
  assert.deepEqual([w.round().state, w.round().ending_pending, w.runs()[1].state], ["checking", "stopped", "aborted"]);
  assert.equal(w.jobsOf("lead_check").length, 1);
  const c = await check(p("k1"), w.round().id, 0, "k1");
  assert.equal(c.kind, "started");
  const checkRun = w.runs().find((r) => r.purpose === "check");
  const startCall = w.apify.calls.filter((x) => x.op === "startRun").at(-1);
  assert.deepEqual(
    [startCall.actor, startCall.input.emails.length, startCall.input[INPUT_MARKER]],
    ["bounceverify/bounceverify-email-verifier", c.emails, checkRun.id],
  );
  w.finishRuns();
  const done = await collect(p("c3"), checkRun.id, "final", "c3");
  assert.deepEqual([done.kind, done.last], ["checked", true]);
  assert.deepEqual([w.round().state, w.round().ending], ["ended", "stopped"]);
  assert.ok(w.T.leads.filter((l) => l.email).every((l) => l.email_state === "ok"));
});

test("Check again: after the round ended, a re-check runs under it with a run id of its own and commits; a mailbox that now answers makes the member Qualified and counted; the round's own check stays closed", async () => {
  const { w, p } = await probed({ plan: { ...PLAN, contact: "email" } });
  const [r1, r2] = w.runs();
  await collect(p("c1"), r1.id, "p0", "c1");
  w.rpcs.lead_round_stop({ p_search_id: w.search().id });
  await collect(p("s1"), r2.id, "stop", "s1");
  await check(p("k1"), w.round().id, 0, "k1");
  w.finishRuns();
  const first = w.runs().find((r) => r.purpose === "check");
  await collect(p("c3"), first.id, "final", "c3");
  assert.deepEqual([w.round().state, w.round().ending], ["ended", "stopped"]);
  // One mailbox did not answer. The door (00145) leaves the lead checking, with the email reason still on its member.
  const lead = w.T.leads.find((l) => l.email);
  const m = w.members().find((x) => x.lead_id === lead.id);
  Object.assign(lead, { email_state: "checking" });
  Object.assign(m, {
    class: "review",
    counted: false,
    counted_month: null,
    judgment: { ...m.judgment, reasons: ["email:checking"] },
  });
  assert.deepEqual(
    await check(p("k2"), w.round().id, 0, "k2"),
    { kind: "not_open" },
    "the round's own check is closed",
  );
  const c = await check(p("k3"), w.round().id, 0, "k3", { nonce: "n1", leadIds: [lead.id] });
  assert.deepEqual([c.kind, c.emails, c.more], ["started", 1, false]);
  const run = w.runs().find((r) => r.purpose === "check" && r.id !== first.id);
  assert.equal(run.term, "again:n1:0");
  assert.equal(run.id, await runIdFor(w.round().id, "check", "again:n1:0"), "an id of its own, from the nonce");
  w.finishRuns();
  const done = await collect(p("c4"), run.id, "final", "c4");
  assert.deepEqual([done.kind, done.results, done.last], ["checked", 1, false]);
  assert.equal(lead.email_state, "ok");
  assert.deepEqual(
    [m.class, m.counted, m.judgment.reasons],
    ["qualified", true, []],
    "Qualified, and counted through the month",
  );
  assert.deepEqual([w.round().state, w.round().ending], ["ended", "stopped"], "neither ended twice nor reopened");
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
  assert.equal(
    w.T.leads.filter((l) => l.email_state === "unknown").length,
    waiting,
    "every address that was waiting says it could not be checked",
  );
});

test("a poll the door never cancelled, arriving after Stop: it decides nothing, the round stays stopped, and no new money reaches the provider", async () => {
  const good = {
    ...PLAN,
    count: 60,
    criteria: [{ key: "right_kind", text: "a place", standard: "likely", required: false }],
    exclusions: [],
  };
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
  assert.deepEqual(
    [w.round().state, w.round().ending_pending],
    ["checking", "stopped"],
    "a round on its way out is never sent back to running",
  );
  assert.equal(w.jobsOf("lead_round_start").filter((j) => j.payload.resume).length, 0, "and nothing of it is resumed");
  assert.equal(w.members().length, members, "the stale page commits nothing");
  for (const j of w.jobsOf("lead_round_start"))
    await startRound(p("j9"), j.payload.round_id, "j9", j.payload.resume === true);
  assert.equal(
    w.apify.calls.filter((c) => c.op === "startRun").length,
    started,
    "Stop is the last word: nothing is started again",
  );
});

/** Every place the provider returns, with no phone: only its email can make it count (decision 0010). */
const noPhones = (w) => {
  for (const items of Object.values(w.apify.state.datasets))
    for (const it of items) Object.assign(it, { phone: null, phoneUnformatted: null, phones: [] });
};

test("under a search that prefers email, a place whose phone dials counts at collect (decision 0010) -- and its email is still checked, for the owner who wants to write", async () => {
  const { w, p } = await probed({
    plan: {
      ...PLAN,
      contact: "email",
      criteria: [{ key: "right_kind", text: "a place", standard: "likely", required: false }],
      exclusions: [],
    },
  });
  for (const r of w.runs()) await collect(p(`c-${r.id}`), r.id, "p0", `c-${r.id}`);
  const qualified = w.members().filter((m) => m.class === "qualified");
  assert.ok(qualified.length > 0, "a phone that dials is a lead, whichever the search prefers");
  assert.ok(
    qualified.every((m) => m.counted),
    "and it counts now, not after the checks",
  );
  const lead = (m) => w.T.leads.find((l) => l.id === m.lead_id);
  assert.ok(
    qualified.some((m) => lead(m).email && lead(m).email_state === "checking"),
    "its email still goes to the mailbox check",
  );
});

test("a place with no phone that dials waits for its email: the checks decide it, and it counts when the mailbox answers ok", async () => {
  const { w, p } = await probed({
    plan: {
      ...PLAN,
      contact: "email",
      criteria: [{ key: "right_kind", text: "a place", standard: "likely", required: false }],
      exclusions: [],
    },
  });
  noPhones(w);
  for (const r of w.runs()) await collect(p(`c-${r.id}`), r.id, "p0", `c-${r.id}`);
  assert.equal(
    w.members().filter((m) => m.class === "qualified").length,
    0,
    "nothing qualifies before its email is checked",
  );
  await startRound(p("j2"), w.round().id, "j2", true);
  noPhones(w);
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
  assert.deepEqual(
    [member(1).class, member(2).class, member(3).class, member(3).counted],
    ["review", "review", "qualified", true],
  );
  assert.equal(w.round().state, "ended");
});

// D6: the lead wears its own mark, read off its own home page as the collect decides about it.
test("the mark: a lead keeps the logo its own site declares, a left-out place keeps none, and a collect short of time simply commits leads without one", async () => {
  const { w, p } = await probed();
  const [r1] = w.runs();
  // Two of the fixture's sites answer: one declares a logo, one only an icon. The rest answer nothing at all.
  w.pages["https://place0001.example"] =
    `<head><script type="application/ld+json">{"@type":"Organization","logo":"https://cdn.example/one.png"}</script></head>`;
  w.pages["https://place0002.example"] = `<head><link rel="apple-touch-icon" sizes="180x180" href="/mark.png"></head>`;
  const out = await collect(p("c1"), r1.id, "p0", "c1");
  assert.equal(out.kind, "committed", JSON.stringify(out));
  const markOf = (n) => (w.T.leads.find((l) => l.place_id === `ChIJfixture000${n}`) || {}).logo_url;
  assert.equal(markOf(1), "https://cdn.example/one.png", "what the site says is its logo");
  assert.equal(
    markOf(2),
    "https://place0002.example/mark.png",
    "else the icon it made for a home screen, resolved against its own site",
  );
  assert.equal(markOf(3), null, "a site that declared none keeps none");
  const leftOut = w.T.leads.filter((l) => w.members().some((m) => m.lead_id === l.id && m.class === "excluded"));
  assert.ok(leftOut.length > 0, "the fixture leaves places out");
  assert.deepEqual(
    [...new Set(leftOut.map((l) => l.logo_url))],
    [null],
    "a left-out place is never marked, as it stores none of the rest",
  );

  // A collect with no time left marks nothing, and commits everything else just the same.
  const { w: w2, p: p2 } = await probed();
  w2.pages["https://place0001.example"] = `<head><link rel="icon" href="/i.svg"></head>`;
  // Enough time for the page and the judge, and none for the marks: the last thing the collect does is the first it gives up.
  const tight = { ...p2("c2"), deadline: w2.clock.ms + JUDGE_MARGIN_MS + 100 };
  const done = await collect(tight, w2.runs()[0].id, "p0", "c2");
  assert.equal(done.kind, "committed", JSON.stringify(done));
  assert.equal(
    (w2.T.leads.find((l) => l.place_id === "ChIJfixture0001") || {}).logo_url,
    null,
    "no time for a mark is a lead without one, never a lead that did not land",
  );
  assert.ok(w2.T.leads.length > 0, "and the page committed");
});

test("the mark: a page that does not answer, or answers something that is not a page, leaves the lead unmarked", async () => {
  const { w, p } = await probed();
  w.pages["https://place0001.example"] = "<html><body>no head here</body></html>";
  w.wires.fetchText = async (url) => {
    if (url === "https://place0002.example") throw new Error("refused");
    return w.pages[url] ?? null;
  };
  const ports = { ...p("c1"), fetchText: w.wires.fetchText };
  const out = await collect(ports, w.runs()[0].id, "p0", "c1");
  assert.equal(out.kind, "committed", JSON.stringify(out));
  const markOf = (n) => (w.T.leads.find((l) => l.place_id === `ChIJfixture000${n}`) || {}).logo_url;
  assert.deepEqual(
    [markOf(1), markOf(2)],
    [null, null],
    "neither a page with nothing in it nor a site that refused us leaves a mark",
  );
});

// 00161: the mark the site declares never drew (the content policy blocks every site), so the collect keeps a copy.
test("the mark we keep: the first candidate whose bytes pass is stored, a wordmark gives way to the icon, and a copy that cannot be kept leaves only the address", async () => {
  const { w, p } = await probed();
  const O1 = "https://place0001.example";
  w.pages[O1] =
    `<head><script type="application/ld+json">{"@type":"Organization","logo":"https://cdn.example/wordmark.png"}</script>` +
    `<link rel="apple-touch-icon" sizes="180x180" href="/touch.png"></head>`;
  w.pages["https://place0002.example"] = `<head><link rel="icon" type="image/png" href="/icon.png"></head>`;
  w.pages["https://place0004.example"] = `<head><link rel="apple-touch-icon" href="/t.png"></head>`;
  w.pages["https://place0005.example"] = `<head><link rel="apple-touch-icon" href="/t.png"></head>`;
  // An SVG icon outranks the home-screen icon as an address to record, and is never asked for as bytes to keep.
  w.pages["https://place0006.example"] =
    `<head><link rel="icon" type="image/svg+xml" href="/i.svg"><link rel="apple-touch-icon" sizes="180x180" href="/t.png"></head>`;
  const refused = png(180, 180);
  const images = {
    "https://cdn.example/wordmark.png": png(400, 100), // four times as wide as tall
    [`${O1}/touch.png`]: png(180, 180),
    "https://place0002.example/icon.png": notAnImage, // the site's error page where its icon should be
    "https://place0004.example/t.png": refused,
    "https://place0005.example/t.png": png(192, 192),
    "https://place0006.example/t.png": png(180, 180),
  };
  const asked = [];
  const kept = [];
  const ports = {
    ...p("c1"),
    fetchBytes: async (url, ms, max) => {
      asked.push({ url, max, ms });
      return images[url] ?? null;
    },
    storeMark: async (bytes, image) => {
      if (bytes === refused) return null; // storage said no
      kept.push(image);
      // Named by what it is, as the real store names it by its hash: the leads are marked side by side.
      return `${(image.width === 180 ? "a" : "b").repeat(64)}.${image.kind}`;
    },
  };
  const out = await collect(ports, w.runs()[0].id, "p0", "c1");
  assert.equal(out.kind, "committed", JSON.stringify(out));
  const lead = (n) => w.T.leads.find((l) => l.place_id === `ChIJfixture000${n}`) || {};

  assert.deepEqual(
    asked.filter((a) => a.url.startsWith("https://cdn.example") || a.url.startsWith(O1)).map((a) => a.url),
    ["https://cdn.example/wordmark.png", `${O1}/touch.png`],
    "the said logo is asked for first, and the home-screen icon only when the logo will not do",
  );
  assert.ok(
    asked.every((a) => a.max === MARK_MAX_BYTES && a.ms > 250),
    "never more than a logo's bytes, and never without time to read them",
  );
  assert.deepEqual(
    [lead(1).mark_path, lead(1).logo_url],
    [`${"a".repeat(64)}.png`, `${O1}/touch.png`],
    "the copy of the icon is kept, and the address it came from is the one stored beside it",
  );
  assert.deepEqual(
    [lead(2).mark_path, lead(2).logo_url],
    [null, "https://place0002.example/icon.png"],
    "an error page is no copy; the address the site declared is still recorded",
  );
  assert.deepEqual(
    [lead(4).mark_path, lead(4).logo_url],
    [null, "https://place0004.example/t.png"],
    "a copy storage would not take leaves the lead as it was before 00161",
  );
  assert.equal(lead(5).mark_path, `${"b".repeat(64)}.png`, "one refusal does not stop the next lead's copy");
  assert.equal(
    asked.some((a) => a.url.endsWith(".svg")),
    false,
    "an SVG is never asked for, so it spends none of the lead's tries",
  );
  assert.deepEqual(
    [lead(6).mark_path, lead(6).logo_url],
    [`${"a".repeat(64)}.png`, "https://place0006.example/t.png"],
    "and the icon after it is the copy",
  );
  assert.deepEqual(
    kept.map((i) => [i.kind, i.width, i.height]).sort((x, y) => x[1] - y[1]),
    [
      ["png", 180, 180],
      ["png", 180, 180],
      ["png", 192, 192],
    ],
    "only what passed the check reached storage",
  );
  assert.equal(lead(3).mark_path ?? null, null, "a site that declared nothing is not asked for bytes");
});

test("the mark we keep: without the image wires (a runtime that stores nothing) the address is still read, and no copy is claimed", async () => {
  const { w, p } = await probed();
  w.pages["https://place0001.example"] = `<head><link rel="apple-touch-icon" href="/t.png"></head>`;
  const out = await collect(p("c1"), w.runs()[0].id, "p0", "c1");
  assert.equal(out.kind, "committed", JSON.stringify(out));
  const one = w.T.leads.find((l) => l.place_id === "ChIJfixture0001");
  assert.deepEqual([one.logo_url, one.mark_path], ["https://place0001.example/t.png", null]);
});

// A person at a free-mail address who said stop (00174's unsubscribe) is never offered again by a later search. A
// share key leaves gmail.com out because it names no business, so the never-again list is asked about every address
// a place carries, not only its share keys.
test("an address that said stop is never offered again, free mail included", async () => {
  const GMAIL = "joesplumbing@gmail.com";
  const carry = (w) => {
    for (const items of Object.values(w.apify.state.datasets))
      for (const item of items)
        if (item.placeId === "ChIJfixture0001") item.emails = [GMAIL, "hello@place0001.example"];
  };
  const seen = (w) => JSON.stringify([w.T.leads, w.T.lead_search_members]).includes(GMAIL);

  // Without a stop, the fixture does carry the address through: the test below is about the list, not the fixture.
  const free = await probed();
  carry(free.w);
  assert.equal((await collect(free.p("c1"), free.w.runs()[0].id, "p0", "c1")).kind, "committed");
  assert.ok(seen(free.w), "a free-mail address a listing shows is kept on its lead");

  const stopped = await probed();
  carry(stopped.w);
  await stopped.w.suppress("email", GMAIL, "email_opt_out");
  assert.equal((await collect(stopped.p("c1"), stopped.w.runs()[0].id, "p0", "c1")).kind, "committed");
  assert.ok(!seen(stopped.w), "the address that said stop is on no lead and no member");
  const lead = stopped.w.T.leads.find((l) => l.place_id === "ChIJfixture0001");
  assert.equal(lead.email, "hello@place0001.example", "the place itself is still found, with its other address");
});
