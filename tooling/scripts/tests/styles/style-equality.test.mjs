/**
 * The comparison the style-equality tool makes (tooling/scripts/checks/style-equality.mjs), on recordings written for
 * it. Recording needs a browser and the harness, so it is a tool a person runs; what decides "moved nothing" is this
 * comparison, and it is held here (docs/plans/2026-09-28-the-interface-kit-and-its-looks.md, §3.5).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareRecordings } from "../../checks/style-equality.mjs";

const properties = ["color", "border-top-left-radius"];
const recording = (pages) => ({ meta: { properties }, pages });
const PAGE = "salon desk dark #/today";
const button = ["body:1>div:1>button:1", [10, 20, 80, 30], ["rgb(0, 0, 0)", "8px"]];
const label = ["body:1>div:1>span:1", [100, 20, 40, 16], ["rgb(0, 0, 0)", "0px"]];

test("one recording against a copy of itself is equal, and says how much it compared", () => {
  const a = recording({ [PAGE]: [button, label] });
  const b = structuredClone(a);
  assert.deepEqual(compareRecordings(a, b), { equal: true, pages: 1, elements: 2, count: 0, differences: [] });
});

test("a property that moved is a difference that names its page, its element and the property", () => {
  const a = recording({ [PAGE]: [button, label] });
  const b = recording({ [PAGE]: [[button[0], button[1], ["rgb(0, 0, 0)", "9px"]], label] });
  const result = compareRecordings(a, b);
  assert.equal(result.equal, false);
  assert.deepEqual(result.differences, [
    { page: PAGE, element: button[0], what: "border-top-left-radius", before: "8px", after: "9px" },
  ]);
});

test("a box that moved, an element gone or new, and a page missing are each a difference", () => {
  const a = recording({ [PAGE]: [button, label], "salon phone dark #/today": [button] });
  const b = recording({
    [PAGE]: [
      [button[0], [10, 20, 81, 30], button[2]],
      ["body:1>i:1", null, label[2]],
    ],
  });
  const whats = compareRecordings(a, b).differences.map((d) => d.what);
  assert.deepEqual(whats.sort(), [
    "box",
    "the element is gone after",
    "the element is new after",
    "the page is missing after",
  ]);
});

test("a box within half a pixel of where it was is the same box; one further off is not", () => {
  const nudged = (w) => recording({ [PAGE]: [[button[0], [10, 20, w, 30], button[2]]] });
  assert.equal(compareRecordings(nudged(80), nudged(80.1)).equal, true);
  assert.equal(compareRecordings(nudged(80), nudged(80.5)).equal, true);
  assert.equal(compareRecordings(nudged(80), nudged(80.6)).equal, false);
  assert.equal(compareRecordings(nudged(80), nudged(81)).equal, false);
});

test("the count is exact while the list is capped", () => {
  const many = Array.from({ length: 40 }, (_, i) => [`body:1>p:${i + 1}`, [0, i, 10, 10], ["rgb(0, 0, 0)", "0px"]]);
  const moved = many.map(([p, box]) => [p, box, ["rgb(1, 1, 1)", "0px"]]);
  const result = compareRecordings(recording({ [PAGE]: many }), recording({ [PAGE]: moved }), 5);
  assert.equal(result.count, 40);
  assert.equal(result.differences.length, 5);
});
