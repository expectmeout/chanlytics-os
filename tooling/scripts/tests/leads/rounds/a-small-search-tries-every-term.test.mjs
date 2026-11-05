/**
 * The first real website-only search (5 November 2026, ten hair salons in Austin) stopped at five and said it had found
 * them all. Its $0.77 held the actor's floor for one run, so one term of three ran, and for nine places where the card
 * had priced 25; its main phase then asked that term for three, and the provider answers a term from the top however
 * often it is asked, so it paid for three places it already held and found none. A start now gives the places to the
 * terms it can run, a later start goes to a term not yet asked before one that was, and a term asked again is asked past
 * what it already read. The real runner and the real database adapter over the world in memory, the provider as it is.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { startRound } from "../../../../../packages/core/src/leads/runner/start.ts";
import { collect } from "../../../../../packages/core/src/leads/runner/collect.ts";
import { leadDb } from "../../../../../apps/edge/lib/leads/lead-db.ts";
import { leadWorld, TENANT } from "../../_lead-world.mjs";
import { LABELS, PLAN, mapsItem } from "../../_lead-fixtures.mjs";

const OWNER = "job-1";
const TERMS = ["hair salon", "hair stylist", "barber and hair studio"];

/** `count` places a judge would keep, numbered from `from`. */
function fitting(from, count) {
  return Array.from({ length: count }, (_, i) => {
    const item = mapsItem(from + i);
    LABELS.set(item.title, "fit");
    return item;
  });
}

/** A search on a plan and a reserve, over a provider that answers each term from the top of what it ranks for it. */
function searching(plan, usd, ranked) {
  const w = leadWorld({ plan });
  w.rpcs.lead_search_create({ p_tenant_id: TENANT, p_plan: plan, p_via: "people", p_estimate_usd: usd });
  const start = w.apify.startRun;
  w.apify.startRun = async (actor, input, opts) => {
    const out = await start(actor, input, opts);
    if (!actor.includes("email-verifier"))
      w.apify.state.datasets[out.datasetId] = (ranked[input.searchStringsArray[0]] ?? []).slice(
        0,
        input.maxCrawledPlacesPerSearch,
      );
    return out;
  };
  const db = leadDb(w.db);
  return { w, p: (owner = OWNER) => w.ports(owner, { db }) };
}

/** The runs asked for so far, as the term and how many places. */
const asked = (w) =>
  w.apify.calls
    .filter((c) => c.op === "startRun" && !c.actor.includes("email-verifier"))
    .map((c) => [c.input.searchStringsArray[0], c.input.maxCrawledPlacesPerSearch]);

/** Every run ended and read to its end. */
async function collected(w, p) {
  w.finishRuns();
  for (const r of w.runs().filter((x) => x.read_offset === 0 && !x.finished_at))
    await collect(p(`c-${r.id}`), r.id, "p0", `c-${r.id}`);
}

test("a reserve that holds one run of three gives that run the whole probe, and says the others", async () => {
  const { w, p } = searching({ ...PLAN, terms: TERMS, count: 10 }, 0.77, {});
  const out = await startRound(p(), w.round().id, OWNER);
  assert.deepEqual(asked(w), [["hair salon", 25]], "the 25 places the card priced, not the nine a third of them is");
  assert.deepEqual(out.runs, [
    { term: "hair salon", kind: "started" },
    { term: "hair stylist", kind: "no_room" },
    { term: "barber and hair studio", kind: "no_room" },
  ]);
});

test("a reserve that holds every run spreads the probe across them as it always did", async () => {
  const { w, p } = searching({ ...PLAN, terms: TERMS, count: 10 }, 5, {});
  await startRound(p(), w.round().id, OWNER);
  assert.deepEqual(asked(w), [
    ["hair salon", 9],
    ["hair stylist", 8],
    ["barber and hair studio", 8],
  ]);
});

test("the main phase goes to a term not yet asked, and finds what the probe did not", async () => {
  const { w, p } = searching({ ...PLAN, terms: TERMS, count: 30 }, 0.77, {
    "hair salon": fitting(1, 60),
    "hair stylist": fitting(101, 60),
  });
  await startRound(p(), w.round().id, OWNER);
  await collected(w, p);
  assert.equal(w.round().state, "running", "25 of 30 counted: the round runs on");
  const out = await startRound(p("job-2"), w.round().id, "job-2", true);
  assert.deepEqual(
    asked(w),
    [
      ["hair salon", 25],
      ["hair stylist", 6],
    ],
    "not the top of the term the probe already read",
  );
  assert.deepEqual(out.runs, [
    { term: "hair stylist", kind: "started" },
    { term: "barber and hair studio", kind: "no_room" },
    { term: "hair salon", kind: "no_room" },
  ]);
  await collected(w, p);
  const main = w.runs().find((r) => r.term === "hair stylist");
  assert.equal(main.already_yours, 0, "nothing paid for twice");
  assert.equal(w.members().filter((m) => m.counted).length, 30, "and the count reached");
});

test("a term asked again is asked past what it read: the provider answers from the top", async () => {
  const { w, p } = searching({ ...PLAN, terms: ["hair salon"], count: 30 }, 2, { "hair salon": fitting(1, 60) });
  await startRound(p(), w.round().id, OWNER);
  await collected(w, p);
  await startRound(p("job-2"), w.round().id, "job-2", true);
  assert.deepEqual(asked(w), [
    ["hair salon", 25],
    ["hair salon", 31],
  ]);
  await collected(w, p);
  const again = w.runs().find((r) => r.items_seen === 31);
  assert.equal(again.already_yours, 25, "the 25 it read again are measured");
  assert.equal(w.members().filter((m) => m.counted).length, 30, "and the new ones are found: it found none before");
});

test("a start tried again finds the run it began and starts no other: the reserve is held for one", async () => {
  const { w, p } = searching({ ...PLAN, terms: TERMS, count: 30 }, 0.77, {
    "hair salon": fitting(1, 60),
    "hair stylist": fitting(101, 60),
  });
  await startRound(p(), w.round().id, OWNER);
  await collected(w, p);
  await startRound(p("job-2"), w.round().id, "job-2", true);
  const again = await startRound(p("job-3"), w.round().id, "job-3", true);
  assert.equal(asked(w).length, 2, "still the probe's run and the one main run");
  assert.equal(again.kind, "started", "and the round is left to its run, never ended under it");
  assert.equal(w.round().state, "running");
  w.round().cost_usd = w.round().cost_reserved_usd - 0.1;
  const short = await startRound(p("job-4"), w.round().id, "job-4", true);
  assert.equal(short.kind, "started", "with less left than a floor it is still its run's to finish");
  assert.equal(w.round().state, "running");
});

test("a term that came back short does not say the area is searched while another was never asked", async () => {
  const { w, p } = searching({ ...PLAN, terms: TERMS, count: 30 }, 0.77, {
    "hair salon": fitting(1, 60),
    "hair stylist": fitting(101, 2),
  });
  await startRound(p(), w.round().id, OWNER);
  await collected(w, p);
  await startRound(p("job-2"), w.round().id, "job-2", true);
  await collected(w, p);
  assert.equal(
    w.round().ending_pending ?? w.round().ending,
    "few_new_matches",
    "one term ran dry and one was never asked: that is not searched_everything",
  );
});

test("a later round of a search goes first to a term no round of it asked, and past what the others read", async () => {
  const { w, p } = searching({ ...PLAN, terms: TERMS, count: 10 }, 0.77, {});
  const first = w.round();
  Object.assign(first, { state: "ended", ending: "few_new_matches" });
  for (let i = 0; i < 9; i++) {
    const id = randomUUID();
    w.T.leads.push({ id, tenant_id: TENANT, phone_e164: `+1512555${String(1000 + i)}`, email: null });
    w.T.lead_search_members.push({
      search_id: first.search_id,
      lead_id: id,
      round_id: first.id,
      tenant_id: TENANT,
      class: "qualified",
      counted: true,
      judgment: { term: "hair salon", answer: { criteria: [] } },
    });
  }
  const top = {
    ...first,
    id: randomUUID(),
    seq: 2,
    purpose: "topup",
    state: "queued",
    ending: null,
    target: 5,
    allowance_reserved: 5,
    allowance_used: 0,
    cost_reserved_usd: 0.6,
    cost_usd: 0,
  };
  w.T.lead_rounds.push(top);
  await startRound(p(), top.id, OWNER);
  assert.deepEqual(asked(w), [["hair stylist", 6]], "five wanted, at the yield of a search whose places all qualified");
});

test("a later round whose terms have read all a term may asks the provider nothing, pays nothing, and says so", async () => {
  const { w, p } = searching({ ...PLAN, terms: ["hair salon"], count: 10 }, 5, {});
  const first = w.round();
  Object.assign(first, { state: "ended", ending: "few_new_matches" });
  for (let i = 0; i < 120; i++) {
    const id = randomUUID();
    w.T.leads.push({ id, tenant_id: TENANT, phone_e164: `+1512555${String(1000 + i)}`, email: null });
    w.T.lead_search_members.push({
      search_id: first.search_id,
      lead_id: id,
      round_id: first.id,
      tenant_id: TENANT,
      class: "qualified",
      counted: true,
      judgment: { term: "hair salon", answer: { criteria: [] } },
    });
  }
  const top = {
    ...first,
    id: randomUUID(),
    seq: 2,
    purpose: "topup",
    state: "queued",
    ending: null,
    target: 5,
    allowance_reserved: 5,
    allowance_used: 0,
    cost_reserved_usd: 2,
    cost_usd: 0,
  };
  w.T.lead_rounds.push(top);
  await startRound(p(), top.id, OWNER);
  assert.deepEqual(asked(w), []);
  assert.deepEqual([top.state, top.ending], ["ended", "few_new_matches"], "never left queued for the sweep");
});

test("a probe that leaves no run's room finishes on what it found: no false word, no question, its checks still to come", async () => {
  // The provider's $0.05 leaves $0.49 of $0.54: under the actor's floor.
  const { w, p } = searching({ ...PLAN, terms: TERMS, count: 30 }, 0.54, { "hair salon": fitting(1, 3) });
  await startRound(p(), w.round().id, OWNER);
  await collected(w, p);
  assert.deepEqual(
    [w.round().state, w.round().ending_pending, w.round().question],
    ["checking", "few_new_matches", null],
    "not budget_used: the month's searching is not what ran out, and not searched_everything: two terms were not asked",
  );
  assert.equal(w.jobsOf("lead_round_start").filter((j) => j.payload.resume).length, 0, "no start it could not make");
  assert.equal(w.jobsOf("lead_check").length, 1, "and the emails it found are checked");
});

test("what a page's site reads spend counts toward the room, before they are settled", async () => {
  const plan = {
    ...PLAN,
    terms: TERMS,
    count: 30,
    criteria: [
      ...PLAN.criteria,
      { key: "online", text: "says it takes online bookings", standard: "seen", required: true, on_site: true },
    ],
  };
  // $0.05 of $0.56 leaves $0.51, and three reads at half a cent take it under the floor.
  const { w, p } = searching(plan, 0.56, { "hair salon": fitting(1, 3) });
  for (const n of ["0001", "0002", "0003"]) w.sites[`https://place${n}.example`] = "We take bookings.";
  await startRound(p(), w.round().id, OWNER);
  await collected(w, p);
  assert.deepEqual([w.round().state, w.round().ending_pending], ["checking", "few_new_matches"]);
});
