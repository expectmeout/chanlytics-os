/**
 * A cell's two lines (kit/table/lines.tsx, the table review of 5 Nov 2026): the fact, then what qualifies it, each on a
 * line of its own; a cell with one fact draws one line; a number's stand at the column's end; and a line says its whole
 * words as its tip only where its column cut them. Drawn on the shared stub React over the real TSX.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact, fresh, again, all, find, classes, textOf } from "../_legacy-react.mjs";
import { importSrc } from "../_source.mjs";

installLegacyReact();
const { CellLines, cutWords } = await importSrc("apps/dashboard/src/surfaces/kit/table/lines.tsx");

const h = (...a) => globalThis.React.createElement(...a);
const drawn = (props) => {
  fresh();
  return again(() => h(CellLines, props));
};
const lineOf = (tree, name) => find(tree, (n) => classes(n).includes(name));

test("two lines: the fact first, what qualifies it second, each an element of its own", () => {
  const tree = drawn({ top: "Not planned", sub: "Their address couldn't be checked" });
  assert.equal(textOf(lineOf(tree, "dtable-line-top")), "Not planned");
  assert.equal(textOf(lineOf(tree, "dtable-line-sub")), "Their address couldn't be checked");
  assert.equal(
    all(tree, (n) => /^dtable-line-/.test(String(n.props?.className))).length,
    2,
    "REGRESSION: a lead's stage, its place and its reason stood on one line with nothing between them (5 Nov 2026)",
  );
});

test("a cell with one fact draws one line: nothing, an empty string and false are no second line", () => {
  for (const sub of [null, undefined, "", false]) {
    const tree = drawn({ top: "4h", sub });
    assert.equal(lineOf(tree, "dtable-line-sub"), null, `no second line for ${String(sub)}`);
    assert.equal(textOf(lineOf(tree, "dtable-line-top")), "4h");
  }
  assert.equal(textOf(lineOf(drawn({ top: "4.9", sub: 0 }), "dtable-line-sub")), "0", "a zero is said");
});

test("a number's lines stand at the column's end, and no other cell's say so", () => {
  const box = (tree) => lineOf(tree, "dtable-lines");
  assert.equal(box(drawn({ top: "4.9", sub: "137 reviews", end: true })).props["data-end"], "");
  assert.equal(box(drawn({ top: "Contacted" })).props["data-end"], undefined);
});

test("a line holding a control with its own ring and tip is left open, and no other is", () => {
  const box = (tree) => lineOf(tree, "dtable-lines");
  assert.equal(box(drawn({ top: "(718) 555-0142", sub: "hello@quix.example", open: true })).props["data-open"], "");
  assert.equal(box(drawn({ top: "Contacted", sub: "3h ago" })).props["data-open"], undefined);
});

test("a line says its whole words only where its column cut them", () => {
  const line = (scrollWidth, clientWidth, textContent = "  Local: your receptionist is built  ") => ({
    scrollWidth,
    clientWidth,
    textContent,
  });
  assert.equal(cutWords(line(200, 120)), "Local: your receptionist is built", "cut: its whole words, trimmed");
  assert.equal(cutWords(line(120, 120)), null, "shown whole: nothing more to say");
  assert.equal(cutWords(line(121, 120)), null, "a pixel a rounding makes is no cut");
  assert.equal(cutWords(line(200, 120, "   ")), null, "no words, no tip");
  assert.equal(cutWords(line(200, 120, null)), null);
});
