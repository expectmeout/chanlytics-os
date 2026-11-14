/**
 * The distance ladder (decision 0133): where a search looks once its area is read. Rungs of three ZIP areas, nearest
 * first, past the area, inside the card's reach, never one read before, each in its own state; none past the reach,
 * and none at all when the reach is "only this area".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { haversineM } from "../../../packages/core/src/leads/geo.ts";
import { LEAD_REACH_MILE_M } from "../../../packages/contracts/src/leads/search/caps.ts";
import { reachOf } from "../../../packages/contracts/src/leads/search/plan.ts";
import { nextRung } from "../../../packages/core/src/leads/ladder.ts";

const BROOKLYN = { lat: 40.6782, lng: -73.9442 };
const city = {
  kind: "city",
  label: "in Brooklyn, NY",
  state: "NY",
  center: null,
  radius_m: 12_000,
  query: "Brooklyn, NY, USA",
};
const zip = {
  kind: "zip",
  label: "near 11211",
  state: "NY",
  center: { lat: 40.7128, lng: -73.9536 },
  radius_m: 8_000,
  zip: "11211",
  query: "11211, NY, USA",
};
const circle = {
  kind: "radius",
  label: "within 5 km",
  state: "NY",
  center: BROOKLYN,
  radius_m: 5_000,
  query: "Brooklyn, NY, USA",
};

test("the reach: 25 miles for a city, 15 for a ZIP, twice the radius for a circle, or what the owner chose (0 is only this area)", () => {
  assert.equal(LEAD_REACH_MILE_M, 1_609);
  assert.equal(reachOf(city, undefined), 25 * 1_609);
  assert.equal(reachOf(zip, null), 15 * 1_609);
  assert.equal(reachOf(circle, undefined), 10_000);
  assert.equal(reachOf(city, 10 * 1_609), 10 * 1_609, "the owner's own reach wins");
  assert.equal(reachOf(city, 0), 0, "only this area");
});

test("a rung is the three nearest ZIP areas past the area and inside the reach, nearest first, each in its own state", () => {
  const rung = nextRung({ plan: { area: city }, center: BROOKLYN, areaRadiusM: 12_000, read: [] });
  assert.equal(rung.length, 3);
  const ds = rung.map((a) => haversineM(BROOKLYN, a.center));
  assert.ok(
    ds.every((d) => d >= 12_000 && d <= 25 * 1_609),
    `past the area and inside the reach: ${ds.join(", ")}`,
  );
  assert.deepEqual(
    ds,
    [...ds].sort((a, b) => a - b),
    "nearest first",
  );
  for (const a of rung) {
    assert.equal(a.kind, "zip");
    assert.match(a.zip, /^\d{5}$/);
    assert.ok(a.query.endsWith(`${a.state}, USA`), `${a.query} says its own state`);
  }
});

test("each rung skips every area read before, so the ladder walks outward and never reads a ZIP twice", () => {
  const read = [];
  const seen = new Set();
  let last = 0;
  for (let i = 0; i < 4; i += 1) {
    const rung = nextRung({ plan: { area: city }, center: BROOKLYN, areaRadiusM: 12_000, read });
    assert.equal(rung.length, 3, `rung ${i + 1} has three areas`);
    for (const a of rung) {
      assert.ok(!seen.has(a.zip), `${a.zip} is new`);
      seen.add(a.zip);
      read.push(a.zip);
    }
    const nearest = Math.min(...rung.map((a) => haversineM(BROOKLYN, a.center)));
    assert.ok(nearest >= last, "each rung starts no nearer than the last one's nearest");
    last = nearest;
  }
});

test("no rung past the reach, none for only this area, and none without a centre to measure from", () => {
  assert.deepEqual(nextRung({ plan: { area: city, reach_m: 0 }, center: BROOKLYN, areaRadiusM: 12_000, read: [] }), []);
  assert.deepEqual(
    nextRung({ plan: { area: city, reach_m: 10_000 }, center: BROOKLYN, areaRadiusM: 12_000, read: [] }),
    [],
    "a reach inside the area itself leaves nowhere to go",
  );
  assert.deepEqual(nextRung({ plan: { area: city }, center: null, areaRadiusM: 12_000, read: [] }), []);
  const small = nextRung({ plan: { area: circle }, center: BROOKLYN, areaRadiusM: 5_000, read: [] });
  assert.ok(
    small.every((a) => haversineM(BROOKLYN, a.center) <= 10_000),
    "a circle's rungs stay within twice its radius",
  );
});

test("the ladder runs out: once every ZIP inside the reach is read, the next rung is empty", () => {
  const read = [];
  for (let i = 0; i < 200; i += 1) {
    const rung = nextRung({ plan: { area: circle }, center: BROOKLYN, areaRadiusM: 5_000, read });
    if (!rung.length) break;
    read.push(...rung.map((a) => a.zip));
  }
  assert.ok(read.length > 0, "the circle's ring holds ZIPs");
  assert.deepEqual(nextRung({ plan: { area: circle }, center: BROOKLYN, areaRadiusM: 5_000, read }), []);
});
