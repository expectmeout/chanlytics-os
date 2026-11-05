/**
 * A plan that must see a business's own website, over places that list none (5 November 2026: 33 of 48 salons in one
 * city left out, most for that, each paid to the judge, and five of them told "no website listed" whose listing named
 * the page they book on). A place with nothing to read cannot show what the plan asks, so code leaves it out and no model
 * is paid for it; a listing whose website is its booking page tells the judge so, at no credit. The real runner and the
 * real database adapter over the world in memory, the provider and the judge faked.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { startRound } from "../../../../../packages/core/src/leads/runner/start.ts";
import { collect } from "../../../../../packages/core/src/leads/runner/collect.ts";
import { rejudgeProbe } from "../../../../../packages/core/src/leads/runner/rejudge.ts";
import { cleanPlace } from "../../../../../packages/core/src/leads/clean.ts";
import { CARDS } from "../../../../../packages/core/src/leads/cards.ts";
import { planNeedsASite, planReadsSites } from "../../../../../packages/contracts/src/leads/search/plan.ts";
import { LEAD_NO_SITE_KEY } from "../../../../../packages/contracts/src/leads/search/class.ts";
import { leadExclusionWord } from "../../../../../packages/contracts/src/leads/lead-facts.ts";
import { leadDb } from "../../../../../apps/edge/lib/leads/lead-db.ts";
import { leadWorld, TENANT } from "../../_lead-world.mjs";
import { LABELS, PLAN, mapsItem } from "../../_lead-fixtures.mjs";

const OWNER = "job-1";
const ON_SITE = {
  key: "online",
  text: "says it takes online bookings",
  standard: "seen",
  required: true,
  on_site: true,
};
const READING = { ...PLAN, terms: ["hair salon"], count: 30, criteria: [...PLAN.criteria, ON_SITE] };

/** A place a judge would keep, its website as given. */
function place(n, website) {
  const item = mapsItem(n, { website, ...(website ? {} : { domain: null }) });
  LABELS.set(item.title, "fit");
  return item;
}

/** A search over these places, its judge kept so what it was shown can be read. */
function searching(plan, items, usd = 5) {
  const w = leadWorld({ plan });
  w.rpcs.lead_search_create({ p_tenant_id: TENANT, p_plan: plan, p_via: "people", p_estimate_usd: usd });
  const start = w.apify.startRun;
  w.apify.startRun = async (actor, input, opts) => {
    const out = await start(actor, input, opts);
    if (!actor.includes("email-verifier")) w.apify.state.datasets[out.datasetId] = items;
    return out;
  };
  const shown = [];
  const asked = w.judge.judge;
  w.judge.judge = async (...a) => {
    shown.push(...a[1]);
    return asked.apply(w.judge, a);
  };
  const db = leadDb(w.db);
  const read = [];
  const readSite = async (host) => {
    read.push(host);
    return w.wires.readSite(host);
  };
  return { w, shown, read, p: (owner = OWNER) => w.ports(owner, { db, readSite }) };
}

async function collected(w, p) {
  w.finishRuns();
  for (const r of w.runs().filter((x) => x.read_offset === 0)) await collect(p(`c-${r.id}`), r.id, "p0", `c-${r.id}`);
}

const memberCalled = (w, title) => {
  const lead = w.T.leads.find((l) => l.business_name === title);
  return w.T.lead_search_members.find((m) => m.lead_id === lead.id);
};

test("a plan needs a site only where a required criterion says so", () => {
  assert.equal(planNeedsASite(READING), true);
  assert.equal(planNeedsASite(PLAN), false);
  const preferred = { ...PLAN, criteria: [...PLAN.criteria, { ...ON_SITE, required: false }] };
  assert.equal(planReadsSites(preferred), true, "it still reads sites");
  assert.equal(planNeedsASite(preferred), false, "and a place without one can still qualify");
});

test("a listing's booking page is kept apart from its own site, and a social page is neither", () => {
  const card = CARDS.local_businesses;
  const clean = (website) => cleanPlace(card.mapItem(mapsItem(1, { website })));
  assert.deepEqual(
    [clean("https://www.vagaro.com/example-studio").host, clean("https://www.vagaro.com/example-studio").bookingPage],
    [null, "https://www.vagaro.com/example-studio"],
  );
  assert.equal(clean("https://example-studio.glossgenius.com/").bookingPage, "https://example-studio.glossgenius.com/");
  assert.equal(clean("http://instagram.com/example_studio").bookingPage, null);
  assert.equal(clean("https://www.example-studio.example/").bookingPage, null, "its own site is its host's");
  assert.equal(clean(null).bookingPage, null);
});

test("a place with nothing to read is left out by code: no model paid, no credit spent, and it says why", async () => {
  const items = [
    place(1, "https://www.place0001.example/"),
    place(2, null),
    place(3, "http://instagram.com/place3"),
    place(4, "https://www.vagaro.com/place-four"),
  ];
  const { w, p, shown, read } = searching(READING, items);
  w.sites["https://place0001.example"] = "We take bookings.";
  await startRound(p(), w.round().id, OWNER);
  await collected(w, p);
  assert.deepEqual(
    shown.map((f) => f.name).sort(),
    ["Place 0001", "Place 0004"],
    "the judge sees those with something to read",
  );
  assert.deepEqual(read, ["place0001.example"], "and only a site of its own is read");
  for (const title of ["Place 0002", "Place 0003"]) {
    const m = memberCalled(w, title);
    assert.deepEqual([m.class, m.excluded_by], ["excluded", LEAD_NO_SITE_KEY], title);
    assert.match(m.reason, /no website of its own/i, "true of a listing with none and of one with a social page");
  }
  assert.equal(leadExclusionWord(null, LEAD_NO_SITE_KEY), "No website of its own");
});

test("a listing whose website is its booking page tells the judge so, as what the site fact says, at no credit", async () => {
  const items = [place(4, "https://www.vagaro.com/place-four")];
  const { w, p, shown, read } = searching(READING, items);
  await startRound(p(), w.round().id, OWNER);
  await collected(w, p);
  assert.equal(shown[0].site, "This listing's website is its booking page: https://www.vagaro.com/place-four");
  assert.deepEqual(read, []);
});

test("a plan that does not need a site judges a place without one as it always did", async () => {
  const preferred = { ...READING, criteria: [...PLAN.criteria, { ...ON_SITE, required: false }] };
  const { w, p, shown } = searching(preferred, [place(2, null)]);
  await startRound(p(), w.round().id, OWNER);
  await collected(w, p);
  assert.equal(shown.length, 1);
  assert.notEqual(memberCalled(w, "Place 0002").excluded_by, LEAD_NO_SITE_KEY);
});

test("a place left out for no site counts in the yield that sizes the next pass: read 25 for 5 is a fifth, not all of them", async () => {
  const items = [
    ...Array.from({ length: 5 }, (_, i) => place(i + 1, `https://www.place000${i + 1}.example/`)),
    ...Array.from({ length: 20 }, (_, i) => place(i + 6, null)),
  ];
  const { w, p } = searching(READING, items);
  for (let n = 1; n <= 5; n++) w.sites[`https://place000${n}.example`] = "We take bookings.";
  await startRound(p(), w.round().id, OWNER);
  await collected(w, p);
  assert.equal(w.round().state, "running");
  assert.equal(w.round().question, null, "and it is no question for the owner: it is what the plan asked");
  await startRound(p("job-2"), w.round().id, "job-2", true);
  const again = w.apify.calls.filter((c) => c.op === "startRun").at(-1).input.maxCrawledPlacesPerSearch;
  assert.equal(
    again,
    120,
    "30 wanted at a fifth, held to four times and to what a term can return; 61 if it read the five alone",
  );
});

test("an answer that takes the need for a site away gives a place left out for it its judging back", async () => {
  const items = [place(2, null)];
  const { w, p, shown } = searching(READING, items);
  await startRound(p(), w.round().id, OWNER);
  await collected(w, p);
  assert.equal(shown.length, 0);
  const round = w.round();
  round.plan = { ...READING, criteria: PLAN.criteria };
  round.plan_version += 1;
  await rejudgeProbe(p(), round);
  assert.deepEqual(
    shown.map((f) => f.name),
    ["Place 0002"],
  );
  assert.notEqual(memberCalled(w, "Place 0002").excluded_by, LEAD_NO_SITE_KEY);
});

test("while it still needs one, an answer leaves that place as it was", async () => {
  const { w, p, shown } = searching(READING, [place(2, null)]);
  await startRound(p(), w.round().id, OWNER);
  await collected(w, p);
  const round = w.round();
  round.plan_version += 1;
  await rejudgeProbe(p(), round);
  assert.equal(shown.length, 0, "no model paid to be told again");
  assert.equal(memberCalled(w, "Place 0002").excluded_by, LEAD_NO_SITE_KEY);
});
