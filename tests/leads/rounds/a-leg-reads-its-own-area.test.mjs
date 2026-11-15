/**
 * A count is delivered (decision 0133): a search short of its count opens a leg on the next nearby area, a round of
 * purpose `widen` with the search's plan on that area. A leg reads ground of its own, so what the search's terms read
 * in the area on its card says nothing of how far into the leg's area to ask; it sizes from what the earlier rounds
 * delivered, every one of them checked; and once it runs dry it names the next area past every area read, its own too.
 * The real runner and the real database adapter over the world in memory, the provider as it is.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { startRound } from "../../../packages/core/src/leads/runner/start.ts";
import { collect } from "../../../packages/core/src/leads/runner/collect/collect.ts";
import { haversineM } from "../../../packages/core/src/leads/geo.ts";
import { nextRung } from "../../../packages/core/src/leads/ladder.ts";
import { leadDb } from "../../../apps/edge/lib/leads/db.ts";
import { leadWorld, TENANT } from "../../_lead-world.mjs";
import { LABELS, PLAN, mapsItem } from "../../_lead-fixtures.mjs";

const OWNER = "job-1";
const AUSTIN = { lat: 30.2672, lng: -97.7431 };
/** A circle on the card, so the search measures from its own centre: it reaches 20 km, twice its radius. */
const CARD = {
  ...PLAN,
  terms: ["hair salon"],
  count: 100,
  area: {
    kind: "radius",
    label: "within 10 km of Austin",
    state: "TX",
    center: AUSTIN,
    radius_m: 10_000,
    query: "Austin, TX, USA",
  },
};
/** The leg's area: the ladder's first rung past the card's circle. */
const LEG_AREA = nextRung({ plan: CARD, center: AUSTIN, areaRadiusM: 10_000, read: [] })[0];

/** A search on the card, over a provider that answers each term from the top of what it ranks for it. */
function searching(ranked) {
  const w = leadWorld({ plan: CARD });
  w.rpcs.lead_search_create({ p_tenant_id: TENANT, p_plan: CARD, p_via: "people", p_estimate_usd: 5 });
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

/** The card's round ended, having read `read` places for its one term, `counted` of them counted. */
function cardRoundRead(w, read, counted) {
  const card = w.round();
  Object.assign(card, { state: "ended", ending: "searched_everything" });
  for (let i = 0; i < read; i++) {
    const id = randomUUID();
    w.T.leads.push({ id, tenant_id: TENANT, phone_e164: `+1512555${String(1000 + i)}`, email: null });
    w.T.lead_search_members.push({
      search_id: card.search_id,
      lead_id: id,
      round_id: card.id,
      tenant_id: TENANT,
      class: i < counted ? "qualified" : "excluded",
      counted: i < counted,
      judgment: { term: "hair salon", answer: { criteria: [] } },
    });
  }
  return card;
}

/** The leg the card round's end opened: the search's plan on the leg's area, for what the count still wants. */
function legOpened(w, card, wanted) {
  const leg = {
    ...card,
    id: randomUUID(),
    seq: card.seq + 1,
    purpose: "widen",
    plan: { ...card.plan, area: LEG_AREA },
    target: wanted,
    state: "queued",
    ending: null,
    ending_pending: null,
    allowance_reserved: wanted,
    allowance_used: 0,
    cost_reserved_usd: 5,
    cost_usd: 0,
    nearby: [],
  };
  w.T.lead_rounds.push(leg);
  return leg;
}

/** The runs asked for so far, as the term and how many places. */
const asked = (w) =>
  w.apify.calls
    .filter((c) => c.op === "startRun" && !c.actor.includes("email-verifier"))
    .map((c) => [c.input.searchStringsArray[0], c.input.maxCrawledPlacesPerSearch]);

test("a leg asks its own area for the most a term may, though the term read 600 places on the card's: none of them is in the leg's", async () => {
  const { w, p } = searching({});
  const card = cardRoundRead(w, 600, 30);
  const leg = legOpened(w, card, 70);
  await startRound(p(), leg.id, OWNER);
  // 70 wanted at what counted, 30 of 600 (the yield's floor of a twentieth): 1,400, held to four times, and to the 120 a
  // ZIP's term may ask. Counted as read, the 600 asked the ZIP for nothing.
  assert.deepEqual(asked(w), [["hair salon", 120]]);
  const run = w.runs().find((r) => r.round_id === leg.id);
  assert.ok(run, "the leg's run is its own");
});

test("a leg sizes from what counted, never from a candidate email that may not check out", async () => {
  const { w, p } = searching({});
  const card = cardRoundRead(w, 100, 50);
  const leg = legOpened(w, card, 20);
  await startRound(p(), leg.id, OWNER);
  // Half counted: 20 wanted at a half is 40, never under 1.2 times the 20.
  assert.deepEqual(asked(w), [["hair salon", 40]]);
});

test("a leg that runs dry names the next area past every area read, its own too, and none overlapping it", async () => {
  const fitting = Array.from({ length: 5 }, (_, i) => {
    const item = mapsItem(1 + i);
    LABELS.set(item.title, "fit");
    return item;
  });
  const { w, p } = searching({ "hair salon": fitting });
  const card = cardRoundRead(w, 50, 10);
  const leg = legOpened(w, card, 90);
  await startRound(p(), leg.id, OWNER);
  w.finishRuns();
  for (const r of w.runs().filter((x) => x.round_id === leg.id && !x.finished_at))
    await collect(p(`c-${r.id}`), r.id, "p0", `c-${r.id}`);
  const after = w.T.lead_rounds.find((r) => r.id === leg.id);
  assert.ok(after.nearby.length > 0, `the leg names where to look next (${after.state}, ${after.ending_pending})`);
  for (const area of after.nearby) {
    assert.notEqual(area.zip, LEG_AREA.zip, "never the leg's own area");
    assert.ok(haversineM(area.center, LEG_AREA.center) >= area.radius_m, `${area.zip} reads no ground the leg read`);
    assert.ok(haversineM(area.center, AUSTIN) <= 20_000, `${area.zip} stays within the card's reach`);
  }
});

test("a leg with nothing left within its reach names the areas past it, each marked, so its end opens none by itself (decision 0133)", async () => {
  const fitting = Array.from({ length: 3 }, (_, i) => {
    const item = mapsItem(40 + i);
    LABELS.set(item.title, "fit");
    return item;
  });
  const { w, p } = searching({ "hair salon": fitting });
  const card = cardRoundRead(w, 50, 10);
  const leg = legOpened(w, card, 90);
  leg.plan = { ...leg.plan, reach_m: 0 };
  await startRound(p(), leg.id, OWNER);
  w.finishRuns();
  for (const r of w.runs().filter((x) => x.round_id === leg.id && !x.finished_at))
    await collect(p(`c-${r.id}`), r.id, "p0", `c-${r.id}`);
  const after = w.T.lead_rounds.find((r) => r.id === leg.id);
  assert.ok(after.nearby.length > 0, "the areas past its reach are named");
  for (const area of after.nearby) {
    assert.equal(area.beyond_m, 50 * 1_609, `${area.zip} is marked with the reach it was found at`);
    assert.ok(haversineM(area.center, AUSTIN) <= 50 * 1_609, `${area.zip} stays within the farthest an owner may ask`);
  }
});

/** A top-up the owner pressed (Carry on, Find more, the rest when the leads renew): the search's plan on `area`. */
function topupOpened(w, card, area, wanted) {
  const leg = legOpened(w, card, wanted);
  return Object.assign(leg, { purpose: "topup", plan: { ...card.plan, area } });
}

test("a top-up in a fresh area asks it whole, though its term read the card's area to its limit (decision 0133)", async () => {
  const { w, p } = searching({});
  const card = cardRoundRead(w, 600, 30);
  const topup = topupOpened(w, card, LEG_AREA, 70);
  await startRound(p(), topup.id, OWNER);
  assert.deepEqual(asked(w), [["hair salon", 120]], "what the term read in the city says nothing of the ZIP");
});

test("a top-up with nothing left to ask in its area names where the search looks next, and ends, so its next area opens", async () => {
  const { w, p } = searching({});
  const card = cardRoundRead(w, 50, 10);
  const topup = topupOpened(w, card, card.plan.area, 90);
  await startRound(p(), topup.id, OWNER);
  assert.deepEqual(asked(w), [], "the card's area was searched to its end: nothing past it is paid for");
  const after = w.T.lead_rounds.find((r) => r.id === topup.id);
  assert.equal(after.ending, "few_new_matches");
  assert.ok(after.nearby.length > 0, "it names the next area, which the round's end opens where the search widens");
  for (const area of after.nearby) assert.notEqual(area.label, card.plan.area.label);
});

test("a search of more places than one answer holds is read whole: the count, the checks and the next area all read it", async () => {
  const { w } = searching({});
  // One answer of the database holds a thousand rows (PostgREST's max_rows, which the world in memory keeps too).
  const card = cardRoundRead(w, 1_003, 40);
  const db = leadDb(w.db);
  const ofRound = await db.membersOfRound(card.id);
  assert.equal(ofRound.length, 1_003, "every member of the round, past the thousandth");
  assert.equal(ofRound.filter((m) => m.counted).length, 40);
  assert.equal(new Set(ofRound.map((m) => m.lead_id)).size, 1_003, "each read once: no page repeats or skips one");
  assert.equal((await db.membersOfSearch(card.search_id)).length, 1_003, "and of the search");
});
