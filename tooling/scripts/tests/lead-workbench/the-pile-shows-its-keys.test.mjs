/**
 * The pile's keys, shown where they are pressed (16 Oct 2026; the lead workbench's plan had them "in SHORTCUTS and drawn
 * nowhere"). On a desk each press of the rail shows its key (contracts' slot `key`, the one the page's listener answers)
 * and Undo shows its own (LEAD_PILE_UNDO_KEY); a phone, which has none to press, shows none. Every press names its key
 * to a screen reader (aria-keyshortcuts), and the key drawn is hidden from it, so a press is still named by its words.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, all, byTestId, textOf, classes } from "../_legacy-react.mjs";

installLegacyReact({ __DEMO_MODE: false, __surfaceState: () => "live", __chrome: { state: contracts.stateOf } });
const W = globalThis;
await import("../../../../apps/dashboard/src/legacy/components/data-bits.jsx");
Object.assign(W, { CHANLY: { nav: () => {}, R: {} }, canDo: () => true, gate: () => ({}) });
const { LeadPileView, PileRail, PileProgress } =
  await import("../../../../apps/dashboard/src/surfaces/leads/pile/pile.tsx");

const target = { rootId: "s-1", name: "Early gyms" };
const pile = {
  cls: "qualified",
  target,
  targets: [target],
  asking: false,
  busy: false,
  held: [],
  canUndo: true,
  act: async () => {},
  undo: async () => {},
  setAsking: () => {},
  setTarget: () => {},
  setPass: () => {},
  stop: () => {},
};
const up = { id: "l-1", name: "Harbor Fitness" };
const props = { pile, up, later: 0, counts: null, searchName: "Gyms in Austin", card: null, onWriteHeld: () => {} };
const rail = contracts.leadPileRailOf({ cls: "qualified", target: target.name });
const keysDrawn = (tree) => all(tree, (n) => n.type === "kbd");

test("on a desk each press of the rail and Undo shows its key, the one the listener answers", () => {
  fresh();
  const tree = again(() => W.React.createElement(LeadPileView, props));
  const undo = contracts.LEAD_PILE_UNDO_KEY.toUpperCase();
  assert.deepEqual(keysDrawn(tree).map(textOf), [...rail.map((s) => s.key.toUpperCase()), undo], "N, L, A, then Z");
  for (const s of rail) {
    const press = byTestId(tree, `lead-pile-${s.act}`);
    assert.equal(press.props["aria-keyshortcuts"], s.key.toUpperCase(), `${s.act} names its key`);
    assert.equal(textOf(press), `${s.label}${s.key.toUpperCase()}`, `${s.act}: its words, then its key`);
  }
  assert.equal(byTestId(tree, "lead-pile-undo").props["aria-keyshortcuts"], undo);
  for (const k of keysDrawn(tree)) assert.equal(k.props["aria-hidden"], "true", "a press is named by its words alone");
  const filled = rail.find((s) => s.look === "primary");
  const onFilled = keysDrawn(byTestId(tree, `lead-pile-${filled.act}`))[0];
  assert.deepEqual(
    classes(onFilled),
    ["kbd", "kbd-on-dark"],
    "light on the filled press: the house's key for a filled button (inbox.css)",
  );
});

test("on a phone the rail and Undo name their keys to a screen reader and draw none", () => {
  fresh();
  const tree = again(() =>
    W.React.createElement("div", null, [
      W.React.createElement(PileRail, { key: "rail", p: props, l: up }),
      W.React.createElement(PileProgress, { key: "progress", p: props }),
    ]),
  );
  assert.deepEqual(keysDrawn(tree), [], "no key drawn where there is none to press");
  for (const s of rail)
    assert.equal(byTestId(tree, `lead-pile-${s.act}`).props["aria-keyshortcuts"], s.key.toUpperCase(), s.act);
  assert.equal(byTestId(tree, "lead-pile-undo").props["aria-keyshortcuts"], contracts.LEAD_PILE_UNDO_KEY.toUpperCase());
});
