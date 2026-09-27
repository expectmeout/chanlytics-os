/**
 * The ZIP table: the generator reads the gazetteer's three columns and
 * nothing else, rounds to a center, sorts by zip; and the bundled table is
 * the whole country, sorted, with a known row where it should be.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { centroidsOf, OUT } from "../../../gen-zcta-centroids.mjs";

const SAMPLE = [
  "GEOID\tALAND\tAWATER\tALAND_SQMI\tAWATER_SQMI\tINTPTLAT\tINTPTLONG   ",
  "78704\t7965245\t231176\t3.075\t0.089\t30.243014\t-97.765110",
  "00601\t166659744\t799292\t64.348\t0.309\t18.180555\t-66.749961",
  "10016\t1329127\t0\t0.513\t0.000\t40.745221\t-73.978294",
].join("\n");

test("three rows of the gazetteer become three sorted, rounded centroids; a file without the three columns is refused", () => {
  assert.deepEqual(centroidsOf(SAMPLE), [
    ["00601", 18.1806, -66.75],
    ["10016", 40.7452, -73.9783],
    ["78704", 30.243, -97.7651],
  ]);
  assert.throws(() => centroidsOf("ZIP\tLAT\tLNG\n78704\t1\t2"), /GEOID, INTPTLAT and INTPTLONG/);
  assert.throws(() => centroidsOf(`${SAMPLE}\nabcde\t0\t0\t0\t0\t1\t2`), /not a ZCTA/);
});

test("the bundled table is the whole country: about 33,000 rows, sorted by zip, keys and coordinates only", () => {
  const table = JSON.parse(fs.readFileSync(OUT, "utf8"));
  assert.ok(table.length > 33_000 && table.length < 34_000, String(table.length));
  assert.ok(
    table.every((r) => r.length === 3 && /^\d{5}$/.test(r[0]) && typeof r[1] === "number" && typeof r[2] === "number"),
  );
  for (let i = 1; i < table.length; i++) assert.ok(table[i - 1][0] < table[i][0], `sorted at ${i}`);
  assert.deepEqual(
    table.find((r) => r[0] === "78704"),
    ["78704", 30.243, -97.7651],
  );
});
