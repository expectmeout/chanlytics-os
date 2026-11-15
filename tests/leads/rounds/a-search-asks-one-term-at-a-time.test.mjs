/**
 * The first real search under decision 0133 (15 November 2026: 300 med spas in New York with a checked email) stopped at
 * 41 of 267 after eleven minutes, at 21 cents a lead. Three things in the engine made it so, and each is held here over
 * the real runner and the real database adapter, the provider as it is:
 *
 *   - its three terms were asked side by side for 341 places each and returned 1,025, of which 472 were different: the
 *     source charges for every place it returns. The main phase now asks one term at a time, the widest first, and the
 *     next only once the one before came back short; and a synonym that mostly returned places the workspace already
 *     held is passed over by the search's later rounds;
 *   - the round passed what it had reserved and ended "this month's searching budget is used", with $24 of the month's
 *     $40 unspent, and opened no nearby area. A round's own reserve is now never the month's: it ends on what its area
 *     did, and names where the search looks next;
 *   - the judge read 183 places with no email to check. Past its probe, a search made for email now settles such a place
 *     by code, as the judge's read would.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { startRound } from "../../../packages/core/src/leads/runner/start.ts";
import { collect } from "../../../packages/core/src/leads/runner/collect/collect.ts";
import { wasWeighed } from "../../../packages/core/src/leads/runner/weighed.ts";
import { nextRung } from "../../../packages/core/src/leads/ladder.ts";
import { leadDb } from "../../../apps/edge/lib/leads/db.ts";
import { leadWorld, TENANT } from "../../_lead-world.mjs";
import { LABELS, PLAN, mapsItem } from "../../_lead-fixtures.mjs";

const OWNER = "job-1";
const TERMS = ["hair salon", "hair stylist", "barber and hair studio"];
const AUSTIN = { lat: 30.2672, lng: -97.7431 };

/** `count` places a judge would keep, numbered from `from`, each dressed by `over`. */
function fitting(from, count, over = () => ({})) {
  return Array.from({ length: count }, (_, i) => {
    const item = mapsItem(from + i, over(from + i));
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

/** Every run still out ended, and read to its end, a page at a time. */
async function collected(w, p) {
  w.finishRuns();
  const row = (id) => w.runs().find((x) => x.id === id);
  for (const r of w.runs().filter((x) => !x.finished_at))
    for (let page = 0; page < 20 && !row(r.id).finished_at; page++) {
      const from = row(r.id).read_offset;
      await collect(p(`c-${r.id}-${from}`), r.id, `p${from}`, `c-${r.id}-${from}`);
    }
}

/** The probe run and read, and the main phase's first start made: what that start said. */
async function probedAndStarted(w, p) {
  await startRound(p(), w.round().id, OWNER);
  await collected(w, p);
  return startRound(p("main-0"), w.round().id, "main-0", true);
}

/** The main phase from its first run's end to its own: each next term's start as the run before it hands it on. */
async function mainPhaseOut(w, p) {
  for (let turn = 1; turn < 8; turn++) {
    await collected(w, p);
    if (w.round().state !== "running") return;
    await startRound(p(`main-${turn}`), w.round().id, `main-${turn}`, true);
  }
}

test("the main phase asks the widest term alone, for all it wants; it came back whole and found the count, so no other is asked", async () => {
  // Synonyms: every term returns the same places.
  const places = fitting(1, 200);
  const { w, p } = searching({ ...PLAN, terms: TERMS, count: 30 }, 5, {
    "hair salon": places,
    "hair stylist": places,
    "barber and hair studio": places,
  });
  const out = await probedAndStarted(w, p);
  assert.deepEqual(
    out.runs,
    [
      { term: "hair salon", kind: "started" },
      { term: "hair stylist", kind: "later" },
      { term: "barber and hair studio", kind: "later" },
    ],
    "one run, and the others wait their turn",
  );
  await mainPhaseOut(w, p);
  assert.deepEqual(
    asked(w).slice(3),
    [["hair salon", 35]],
    "the 21 still wanted with room, past the nine its probe read: side by side, three terms paid for the same places three times",
  );
  assert.equal(w.members().filter((m) => m.counted).length, 30, "and the count is found");
});

test("a term that came back whole leaves the next unasked: the round ends at its limit, and its area is not said to be searched", async () => {
  // Twenty that fit, then places the judge cannot place (numbered past every place another case here calls a fit): the
  // count stays short however many the term returns.
  const salon = [...fitting(1, 20), ...Array.from({ length: 380 }, (_, i) => mapsItem(1001 + i))];
  const { w, p } = searching({ ...PLAN, terms: TERMS, count: 200 }, 9, { "hair salon": salon });
  await probedAndStarted(w, p);
  const [, places] = asked(w).at(-1);
  await mainPhaseOut(w, p);
  assert.equal(asked(w).length, 4, "the probe's three and the one main run");
  assert.equal(w.runs().find((r) => r.items_seen === places)?.term, "hair salon", `all ${places} it was asked for`);
  assert.deepEqual(
    [w.round().state, w.round().ending_pending],
    ["checking", "few_new_matches"],
    "its area holds more for that term, so no synonym is paid for; two terms unasked is not searched everything",
  );
});

test("a term that came back short hands its turn on, and a synonym that returned what the search held is passed over by its next round", async () => {
  // "hair stylist" returns the very places "hair salon" does; "barber and hair studio" ten of its own.
  const salon = fitting(1, 50);
  const { w, p } = searching({ ...PLAN, terms: TERMS, count: 200 }, 9, {
    "hair salon": salon,
    "hair stylist": salon,
    "barber and hair studio": fitting(301, 10),
  });
  await probedAndStarted(w, p);
  await mainPhaseOut(w, p);
  assert.deepEqual(
    asked(w)
      .slice(3)
      .map(([term]) => term),
    TERMS,
    "each term in its turn, once the one before it came back under its ask",
  );
  const first = w.round();
  assert.deepEqual(
    [first.state, first.ending_pending],
    ["checking", "searched_everything"],
    "every term asked and every one short: the area is read",
  );
  const stylist = w.runs().filter((r) => r.term === "hair stylist");
  assert.deepEqual(
    [stylist.reduce((n, r) => n + r.items_seen, 0), stylist.reduce((n, r) => n + (r.already_yours ?? 0), 0)],
    [58, 58],
    "all 58 places the synonym returned were held already, and paid for",
  );

  // The search's next round, on the nearest area past its own: a leg (decision 0133).
  Object.assign(first, { state: "ended", ending: "searched_everything", ending_pending: null });
  const area = nextRung({ plan: PLAN, center: AUSTIN, areaRadiusM: PLAN.area.radius_m, read: [] })[0];
  const leg = {
    ...first,
    id: randomUUID(),
    seq: 2,
    purpose: "widen",
    plan: { ...first.plan, area },
    target: 140,
    state: "queued",
    ending: null,
    allowance_reserved: 140,
    allowance_used: 0,
    cost_reserved_usd: 9,
    cost_usd: 0,
    nearby: [],
  };
  w.T.lead_rounds.push(leg);
  const before = asked(w).length;
  const out = await startRound(p("leg-0"), leg.id, "leg-0");
  assert.deepEqual(
    out.runs,
    [
      { term: "hair salon", kind: "started" },
      { term: "barber and hair studio", kind: "later" },
    ],
    "the synonym is not among the terms the leg asks",
  );
  for (let turn = 1; turn < 6; turn++) {
    await collected(w, p);
    if (w.T.lead_rounds.find((r) => r.id === leg.id).state !== "running") break;
    await startRound(p(`leg-${turn}`), leg.id, `leg-${turn}`, true);
  }
  assert.deepEqual(
    asked(w)
      .slice(before)
      .map(([term]) => term),
    ["hair salon", "barber and hair studio"],
    "the widest term, always, and the synonym that found places of its own",
  );
});

test("a round past what it reserved ends on what its area did and names where the search looks next: never on the month's searching", async () => {
  const { w, p } = searching({ ...PLAN, terms: TERMS, count: 200 }, 9, { "hair salon": fitting(1, 50) });
  await probedAndStarted(w, p);
  // Its sites read for their marks, its judge and its checks took it past its own estimate (15 Nov 2026: $6.85 of $5.95).
  w.round().cost_usd = w.round().cost_reserved_usd + 1;
  await collected(w, p);
  const round = w.round();
  assert.deepEqual(
    [round.state, round.ending_pending],
    ["checking", "few_new_matches"],
    "not budget_used: the month's searching is said by the door that refuses the next reserve, where it is true",
  );
  assert.equal(asked(w).length, 4, "and no next term is started on money the round does not hold");
  assert.ok(round.nearby.length > 0, "its end has the next area to open");
});

test("past its probe, a search made for email shows the judge only a place with an address, and settles the others as the judge would", async () => {
  // Of every four places: one with no email, one with no email and no phone, two with both.
  const bare = (n) =>
    n % 4 === 0 ? { emails: [] } : n % 4 === 1 ? { emails: [], phone: null, phoneUnformatted: null, phones: [] } : {};
  const plan = { ...PLAN, terms: ["hair salon"], contact: "email", count: 60, exclusions: [] };
  const { w, p } = searching(plan, 9, { "hair salon": fitting(1, 65, bare) });
  await startRound(p(), w.round().id, OWNER);
  await collected(w, p);
  const probe = w.members().length;
  assert.equal(
    w.judge.calls.flat().length,
    probe,
    "the probe's places are all the judge's: the question after it is about fit",
  );
  await startRound(p("main-0"), w.round().id, "main-0", true);
  await collected(w, p);
  const main = w.members().slice(probe);
  const lead = (m) => w.T.leads.find((l) => l.id === m.lead_id);
  const judged = main.filter((m) => m.judgment.answer !== null);
  assert.equal(main.length, 40, "the forty places past the probe's");
  assert.equal(w.judge.calls.flat().length, probe + judged.length, "the judge was paid for those it read, no other");
  assert.ok(judged.length === 20 && judged.every((m) => lead(m).email), "the twenty with an address");
  const noEmail = main.filter((m) => m.judgment.answer === null && m.class === "review");
  assert.equal(noEmail.length, 10);
  assert.deepEqual(
    [noEmail[0].judgment.reasons, noEmail[0].reason, noEmail[0].fit, noEmail[0].excluded_by],
    [["email:none"], "no email found", null, null],
    "one with a phone and no email waits in review for having no email, as the judge's read leaves it",
  );
  const unreachable = main.filter((m) => m.class === "excluded");
  assert.deepEqual(
    [unreachable.length, unreachable[0].excluded_by, unreachable[0].reason],
    [10, "unreachable", "no phone or email found"],
    "one with neither is left out",
  );
  assert.ok(
    [...noEmail, ...unreachable].every((m) => wasWeighed({ ...m, judgment: m.judgment })),
    "each counts as looked at when a later ask is sized: it was read and paid for",
  );
});
