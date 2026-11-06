/**
 * One row in the tab order (kit/table/rows.tsx setRowTabs, the table review of 5 Nov 2026): the cursor's row keeps its
 * controls in it, every other row's are taken out, and each control gets back exactly what it had as the cursor reaches
 * its row. Run over stand-ins for a row's elements: what it writes is one attribute and what it keeps beside it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";

const { setRowTabs } = await importSrc("apps/dashboard/src/surfaces/kit/table/rows.tsx");

/** A control of a row: the tabindex it was drawn with, or none. */
const stop = (tabindex = null) => {
  const attrs = tabindex === null ? {} : { tabindex };
  return {
    attrs,
    dataset: {},
    getAttribute: (name) => attrs[name] ?? null,
    setAttribute: (name, value) => (attrs[name] = value),
    removeAttribute: (name) => delete attrs[name],
  };
};
const rowOf = (...stops) => ({ querySelectorAll: () => stops });
const orderOf = (stops) => stops.map((s) => s.attrs.tabindex ?? null);

test("a row out of the tab order keeps every control out of it, and remembers what each had", () => {
  const stops = [stop(), stop("0"), stop("-1")];
  setRowTabs(rowOf(...stops), false);
  assert.deepEqual(
    orderOf(stops),
    ["-1", "-1", "-1"],
    "REGRESSION: a lead's row held nine stops, a list of thirty 270",
  );
  assert.deepEqual(
    stops.map((s) => s.dataset.tab),
    ["", "0", "-1"],
  );
});

test("the cursor's row gets back exactly what each control had, and nothing is left beside it", () => {
  const stops = [stop(), stop("0"), stop("-1")];
  const row = rowOf(...stops);
  setRowTabs(row, false);
  setRowTabs(row, true);
  assert.deepEqual(orderOf(stops), [null, "0", "-1"]);
  assert.deepEqual(
    stops.map((s) => "tab" in s.dataset),
    [false, false, false],
  );
});

test("asked twice it changes nothing more: a control taken out is not remembered as one that was always out", () => {
  const stops = [stop(), stop("0")];
  const row = rowOf(...stops);
  setRowTabs(row, false);
  setRowTabs(row, false);
  setRowTabs(row, true);
  assert.deepEqual(orderOf(stops), [null, "0"]);
  setRowTabs(row, true);
  assert.deepEqual(orderOf(stops), [null, "0"], "a row already in the order is left as its cells drew it");
});

test("a control a cell drew since is taken out on the next draw, and a row not drawn asks nothing", () => {
  const first = stop();
  const later = stop("0");
  setRowTabs(rowOf(first), false);
  setRowTabs(rowOf(first, later), false);
  assert.deepEqual(orderOf([first, later]), ["-1", "-1"]);
  assert.equal(later.dataset.tab, "0");
  assert.doesNotThrow(() => setRowTabs(null, false));
});
