/**
 * The lead sources' prices, watched once a day (apps/edge/lib/leads/lead-sources.ts watchLeadPrices, 00506). The cards'
 * prices and the SQL ceiling are written by hand, and the provider's price reader existed with nothing calling it (PRD
 * §0.3 says the prices are checked): a rise would only have shown as searches finding fewer leads than asked. Executed
 * over the in-memory database (lead_platform and the pager's memory) and a provider whose prices the test moves.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";
import { leadPins } from "../../../packages/core/src/leads/cards.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { watchLeadPrices, PRICE_RISE_PAGED } = await import(
  pathToFileURL(path.join(ROOT, "apps/edge/lib/leads/lead-sources.ts")).href
);

process.env.LEAD_TO = "ops@example.test";
process.env.LEAD_FROM = "pager@example.test";

const NOON = Date.parse("2026-11-03T12:13:00.000Z");
const DAY = 86_400_000;
const MAPS = "compass/crawler-google-places";

function world() {
  const T = {
    lead_platform: [
      { id: true, searches_on: false, tenants_on: [], cards_on: [], note: null, prices: {}, prices_checked_at: null },
    ],
    operator_pages: [],
  };
  const prices = Object.fromEntries(
    [...new Set(leadPins().map((p) => p.actor))].map((a) => [a, { "apify-actor-start": 0.00005 }]),
  );
  prices[MAPS] = { "place-scraped": 0.003, "apify-actor-start": 0.00005 };
  const asked = [];
  const apify = {
    async eventPrices(actor) {
      asked.push(actor);
      if (!prices[actor]) throw new Error("unreadable");
      return { ...prices[actor] };
    },
  };
  const sent = [];
  const send = async (_from, _to, subject, body) => (sent.push({ subject, body }), true);
  return { T, db: fakeDb(T), apify, prices, asked, sent, send };
}

test("the first read is the baseline: every pinned actor read once, kept with its moment, nothing paged", async () => {
  const w = world();
  assert.equal(await watchLeadPrices(w.db, w.apify, NOON, { send: w.send, now: () => NOON }), 0);
  assert.deepEqual(w.asked.sort(), [...new Set(leadPins().map((p) => p.actor))].sort(), "each actor once");
  assert.deepEqual(w.T.lead_platform[0].prices[MAPS], { "place-scraped": 0.003, "apify-actor-start": 0.00005 });
  assert.equal(w.T.lead_platform[0].prices_checked_at, new Date(NOON).toISOString());
  assert.equal(w.sent.length, 0);
});

test("once a day: a read within the day asks the provider nothing", async () => {
  const w = world();
  await watchLeadPrices(w.db, w.apify, NOON, { send: w.send, now: () => NOON });
  w.asked.length = 0;
  assert.equal(await watchLeadPrices(w.db, w.apify, NOON + DAY - 60_000, { send: w.send, now: () => NOON }), 0);
  assert.deepEqual(w.asked, []);
});

test("a price that rose past a tenth, or a charge that is new, pages the platform once, naming what changed; a rise inside a tenth says nothing", async () => {
  assert.equal(PRICE_RISE_PAGED, 0.1);
  const w = world();
  await watchLeadPrices(w.db, w.apify, NOON, { send: w.send, now: () => NOON });
  w.prices[MAPS]["apify-actor-start"] = 0.000054; // within a tenth
  assert.equal(await watchLeadPrices(w.db, w.apify, NOON + DAY, { send: w.send, now: () => NOON + DAY }), 0);
  w.prices[MAPS]["place-scraped"] = 0.004;
  w.prices[MAPS]["contact-details"] = 0.002;
  assert.equal(await watchLeadPrices(w.db, w.apify, NOON + 2 * DAY, { send: w.send, now: () => NOON + 2 * DAY }), 1);
  assert.equal(w.sent.length, 1);
  assert.equal(w.sent[0].subject, `[Chanlytics] A lead source's prices changed: ${MAPS}`);
  assert.match(
    w.sent[0].body,
    /^place-scraped rose from \$0\.003 to \$0\.004\ncontact-details is a new charge: \$0\.002\n/,
  );
  assert.match(w.sent[0].body, /lead_estimate_ceiling, lead_check_estimate/);
  assert.equal(w.T.lead_platform[0].prices[MAPS]["place-scraped"], 0.004, "the new price is the next read's baseline");
});

test("an actor the provider will not answer keeps its last prices and pages nothing; the others are still read", async () => {
  const w = world();
  await watchLeadPrices(w.db, w.apify, NOON, { send: w.send, now: () => NOON });
  const before = w.T.lead_platform[0].prices[MAPS];
  delete w.prices[MAPS];
  assert.equal(await watchLeadPrices(w.db, w.apify, NOON + DAY, { send: w.send, now: () => NOON + DAY }), 0);
  assert.deepEqual(w.T.lead_platform[0].prices[MAPS], before);
  assert.ok(w.asked.length > 1);
});

test("a deployment without the provider's key reads nothing", async () => {
  const w = world();
  assert.equal(await watchLeadPrices(w.db, null, NOON), 0);
  assert.equal(w.T.lead_platform[0].prices_checked_at, null);
});
