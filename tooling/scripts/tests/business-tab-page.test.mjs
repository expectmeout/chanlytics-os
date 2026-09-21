/**
 * The record kit and the Business tab, EXECUTED on the stub React.
 * No source-text assertions: every claim here is something the page drew.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { stateOf } from "@chanlytics/contracts";
import { installLegacyReact, fresh, all, find, textOf, classes, press } from "./_legacy-react.mjs";

// The app's chrome bridge publishes contracts' stateOf as __chrome.state (legacy-bridge/shell.ts). Without it every
// StatePill is plain, and no tone could be read here.
installLegacyReact({ __DEMO_MODE: false, __chrome: { state: stateOf } });
const L = "../../../apps/dashboard/src/legacy";
Object.assign(globalThis, {
  CHANLY: { nav: () => {}, R: {} },
  canDo: () => true,
  gate: () => ({}),
  usePPToast: () => [null, () => {}],
});
await import(`${L}/components/data-bits.jsx`);
await import(`${L}/components/record-row.jsx`);
const W = globalThis.window;

/** A new tree, drawn as today-page.test.mjs draws one: the hook cells forgotten, the component created. */
const draw = (Comp, props = {}) => { fresh(); return W.React.createElement(Comp, props); };
/** Everything in a tree that a press acts on. */
const pressable = (tree) => all(tree, (n) => typeof n.props?.onClick === "function");
const byId = (tree, id) => find(tree, (n) => n.props?.id === id);

/* ------------------------------------ the row ------------------------------------ */

test("a row draws its label, its value and one act", () => {
  const tree = draw(W.RecordRow, { label: "Website", value: "melanysbeautysalon.com", act: { label: "Change", onClick: () => {} } });
  assert.match(textOf(tree), /Website/);
  assert.match(textOf(tree), /melanysbeautysalon\.com/);
  assert.match(textOf(tree), /Change/);
  assert.equal(pressable(tree).length, 1, "one act, never two");
});

test("an empty row says so and keeps its act reachable", () => {
  const tree = draw(W.RecordRow, { label: "Website", value: null, empty: "Not set", act: { label: "Add one", onClick: () => {} } });
  assert.match(textOf(tree), /Not set/);
  const row = find(tree, (n) => classes(n).includes("rec-row"));
  assert.equal(row.props["data-empty"], "true");
  assert.equal(find(row, (n) => classes(n).includes("rec-row-act"))?.type, "button", "the act is a real button, on the row");
});

test("a source chip is the one pill, in the fact kind's tone", () => {
  const tree = draw(W.RecordRow, { label: "Address", value: "2581 Pitkin Ave", source: "verified" });
  const pill = find(tree, (n) => classes(n).some((c) => c.startsWith("pill-")));
  assert.ok(pill, "the chip is a StatePill");
  assert.ok(classes(pill).includes("pill-ok"), "verified is ok");
  assert.match(textOf(pill), /from Google/);
});

test("a disputed fact wears warn and offers the other answer", () => {
  const used = [];
  const disputed = { value: "2581 Pitkin Ave, Brooklyn, NY 11208, USA", source: "verified", onUse: () => used.push(1) };
  const tree = draw(W.RecordRow, { label: "Address", value: "2581 Pitkin Avenue", source: "typed", disputed });
  const pill = find(tree, (n) => classes(n).includes("pill-warn"));
  assert.ok(pill, "a disagreement is warn");
  assert.match(textOf(tree), /2581 Pitkin Ave, Brooklyn, NY 11208, USA/, "the other answer is on the row");
  assert.deepEqual(
    all(tree, (n) => classes(n).includes("pill")).map(textOf),
    [stateOf("fact", "disputed").label, stateOf("fact", "verified").label],
    "the row's chip and the other answer's, both in contracts' words",
  );
  const use = find(tree, (n) => typeof n.props?.onClick === "function" && /Use Google/i.test(textOf(n)));
  press(use);
  assert.equal(used.length, 1, "the row offers the fill, it does not just record the difference");

  const kept = [];
  const again = draw(W.RecordRow, { label: "Address", value: "2581 Pitkin Avenue", source: "typed", disputed: { ...disputed, onKeep: () => kept.push(1) } });
  press(find(again, (n) => typeof n.props?.onClick === "function" && textOf(n) === "Keep mine"));
  assert.equal(kept.length, 1, "and keeping yours is a press too");
});

test("an act says which row it acts on, and a gate's refusal replaces its press", () => {
  const pressed = [];
  const refused = [];
  const gate = { "aria-disabled": true, "data-tip": "Only an owner can change this.", onClick: () => refused.push(1) };
  const tree = draw(W.RecordRow, { id: "website", label: "Website", value: "melanys.com", act: { label: "Change", onClick: () => pressed.push(1), gate } });
  assert.ok(find(tree, (n) => n.props?.["data-testid"] === "rec-row-website"), "the row carries its id");
  const act = find(tree, (n) => n.props?.["data-testid"] === "rec-row-act-website");
  const name = act.props["aria-labelledby"].split(" ").map((id) => textOf(byId(tree, id))).join(" ");
  assert.equal(name, "Change Website", "a screen reader hears which Change this is");
  assert.equal(act.props["aria-disabled"], true, "a refused act stays on the page and in the tab order");
  press(act);
  assert.deepEqual([pressed.length, refused.length], [0, 1], "the gate is spread after the handler, so its refusal wins");
});
