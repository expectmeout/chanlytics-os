/**
 * A change made elsewhere washes (decision 0052, canvas A's motion grammar): a value someone else changed while the page is
 * open takes the kit's wash (a fill that fades; nothing moves) and is said once, politely. Nothing washes on the first
 * paint, on a move to another record, or just after the reader's own press, whose act already answered them.
 *
 * Run against the kit's Wash (motion/wash.tsx) on the stub React, the person's figures that wear it (the kit's Figure, the
 * page's watched figures), and the words contracts gives it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PERSON_WASH_WORDS } from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, find } from "../../_legacy-react.mjs";

installLegacyReact({ __surfaceState: () => "live", __DEMO_MODE: false });
// The reader's press is heard on the document (capture): kept here so a test can press.
const pressedOn = {};
let said = null;
globalThis.document.addEventListener = (type, fn) => {
  pressedOn[type] = fn;
};
globalThis.document.createElement = () => ({
  setAttribute() {},
  set textContent(t) {
    said = t;
  },
});
const S = "../../../../../apps/dashboard/src";
const { Wash } = await import(`${S}/surfaces/kit/motion/wash.tsx`);
const { Figure } = await import(`${S}/surfaces/kit/figure/figure.tsx`);

const h = (type, props, ...kids) => globalThis.React.createElement(type, props, ...kids);
const span = (tree) => find(tree, (n) => n.type === "span" && String(n.props?.className || "").includes("wash"));
const draw = (scope, value) => h(Wash, { scope, value, said: PERSON_WASH_WORDS.figure("Last contact", value) }, value);

test("a value someone else changed washes and is said once, politely; the first paint and an unchanged value do not", () => {
  fresh();
  said = null;
  assert.equal(span(draw("p1", "Oct 6")).props["data-wash"], undefined, "nothing on the first paint");
  again(() => draw("p1", "Oct 6"));
  assert.equal(span(again(() => draw("p1", "Oct 6"))).props["data-wash"], undefined, "nothing changed, nothing washes");
  again(() => draw("p1", "Today"));
  assert.equal(span(again(() => draw("p1", "Today"))).props["data-wash"], "true", "the new value washes");
  assert.equal(said, "Last contact is now Today", "said in the one polite region");
});

test("a move to another record is a first paint, never a change", () => {
  fresh();
  draw("p1", "Oct 6");
  again(() => draw("p2", "Sep 30"));
  assert.equal(span(again(() => draw("p2", "Sep 30"))).props["data-wash"], undefined);
});

test("a change just after the reader's own press is their own act answering: no wash", () => {
  fresh();
  draw("p1", "Oct 6");
  assert.equal(typeof pressedOn.pointerdown, "function", "the press is heard on the document");
  pressedOn.pointerdown();
  again(() => draw("p1", "Today"));
  assert.equal(span(again(() => draw("p1", "Today"))).props["data-wash"], undefined);
});

test("the kit's figure wears the wash only where the page watches it; a figure nobody watches draws its number alone", () => {
  fresh();
  const watched = h(Figure, { label: "Last contact", value: "Today", washed: true });
  assert.equal(span(watched).props["data-wash"], "true");
  const still = h(Figure, { label: "Last contact", value: "Today", washed: false });
  assert.equal(span(still).props["data-wash"], undefined);
  assert.equal(span(h(Figure, { label: "Messages", value: "17" })), null, "Reports' figures are untouched");
});

test("what the wash says is contracts', one sentence a value", () => {
  assert.equal(PERSON_WASH_WORDS.name("Priya Nair"), "Their name is now Priya Nair");
  assert.equal(PERSON_WASH_WORDS.state("Needs you"), "Where they stand is now: Needs you");
  assert.equal(typeof PERSON_WASH_WORDS.upNext, "string");
  assert.equal(typeof PERSON_WASH_WORDS.history, "string");
});
