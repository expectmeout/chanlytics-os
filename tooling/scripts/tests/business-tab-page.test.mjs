/**
 * The record kit and the Business tab, EXECUTED on the stub React.
 * No source-text assertions: every claim here is something the page drew.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { stateOf } from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, all, find, textOf, classes, press } from "./_legacy-react.mjs";

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
await import(`${L}/components/record-field.jsx`);
const W = globalThis.window;

/** A new tree, drawn as today-page.test.mjs draws one: the hook cells forgotten, the component created. */
const draw = (Comp, props = {}) => { fresh(); return W.React.createElement(Comp, props); };
/** The same tree again, over the same hook cells, as React draws it after a state change. */
const redraw = (Comp, props = {}) => again(() => W.React.createElement(Comp, props));
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
  const keeping = draw(W.RecordRow, { label: "Address", value: "2581 Pitkin Avenue", source: "typed", disputed: { ...disputed, onKeep: () => kept.push(1) } });
  press(find(keeping, (n) => typeof n.props?.onClick === "function" && textOf(n) === "Keep mine"));
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

/* ------------------------------------ the fields ------------------------------------ */

test("a field carries its label, its unit and its refusal, wired for a screen reader", () => {
  const tree = draw(W.RecordField, { label: "Least notice", unit: "hours", value: "2", onChange: () => {}, hint: "Empty means no rule.", id: "lead" });
  assert.match(textOf(tree), /Least notice/);
  assert.match(textOf(tree), /hours/);
  assert.match(textOf(tree), /Empty means no rule\./);

  const typed = [];
  const bad = draw(W.RecordField, { label: "Booking link", value: "booksy", onChange: (v) => typed.push(v), problem: "Needs a full web address, starting with https://", hint: "Sent instead of confirming.", id: "link" });
  const input = find(bad, (n) => classes(n).includes("rec-input"));
  assert.equal(input.props["aria-invalid"], true);
  assert.equal(input.props["aria-describedby"], "rec-link-problem");
  assert.match(textOf(byId(bad, "rec-link-problem")), /starting with https/, "the sentence the box names is the one drawn");
  assert.doesNotMatch(textOf(bad), /Sent instead/, "a hint gives way to what is wrong");
  assert.ok(find(find(bad, (n) => n.type === "label"), (n) => n === input), "the label holds its box, so the box is named by it");
  input.props.onChange({ target: { value: "https://booksy.com" } });
  assert.deepEqual(typed, ["https://booksy.com"], "a keystroke hands the page the words, not the event");
});

test("a switch is a switch, and says which state it is in", () => {
  const flips = [];
  const tree = draw(W.RecordSwitch, { on: true, label: "Never quote a price", onChange: (v) => flips.push(v) });
  const sw = find(tree, (n) => classes(n).includes("rec-switch"));
  assert.equal(sw.type, "button", "never a div with a click on it");
  assert.equal(sw.props.role, "switch");
  assert.equal(sw.props["aria-checked"], true);
  assert.equal(sw.props["aria-label"], "Never quote a price");
  press(sw);
  assert.deepEqual(flips, [false], "a press asks for the other state");
});

const numbers = { label: "The number to publish", value: "line", options: [{ value: "line", label: "Your line" }, { value: "other", label: "A different number" }] };

test("a toggle group is a radiogroup, not a row of buttons", () => {
  const picked = [];
  const tree = draw(W.RecordToggleGroup, { ...numbers, onChange: (v) => picked.push(v) });
  const group = find(tree, (n) => n.props?.role === "radiogroup");
  assert.equal(group.props["aria-label"], "The number to publish");
  const opts = all(tree, (n) => n.props?.role === "radio");
  assert.equal(opts.length, 2);
  assert.equal(opts[0].props["aria-checked"], true);
  press(opts[1]);
  assert.deepEqual(picked, ["other"]);
});

test("a toggle group is one tab stop, and the arrows walk it", () => {
  const picked = [];
  const tree = draw(W.RecordToggleGroup, { ...numbers, onChange: (v) => picked.push(v) });
  assert.deepEqual(all(tree, (n) => n.props?.role === "radio").map((o) => o.props.tabIndex), [0, -1], "Tab lands on the chosen one only");
  const focused = [];
  const radios = [{ focus: () => focused.push(0) }, { focus: () => focused.push(1) }];
  const key = (k) => ({ key: k, preventDefault() {}, currentTarget: { querySelectorAll: () => radios } });
  find(tree, (n) => n.props?.role === "radiogroup").props.onKeyDown(key("ArrowRight"));
  assert.deepEqual([picked, focused], [["other"], [1]], "right picks the next and takes focus there");
  find(tree, (n) => n.props?.role === "radiogroup").props.onKeyDown(key("ArrowLeft"));
  assert.deepEqual(picked, ["other", "other"], "from the first, left wraps round to the last");
});

test("a combobox narrows as you type, and the arrows, Enter and Escape drive it", () => {
  const picked = [];
  const props = {
    id: "tz",
    label: "Timezone",
    value: "America/Chicago",
    options: [
      { value: "America/New_York", label: "America/New York", meta: "7:23 PM" },
      { value: "America/Chicago", label: "America/Chicago", meta: "6:23 PM" },
      { value: "America/North_Dakota/New_Salem", label: "America/North Dakota/New Salem", meta: "6:23 PM" },
      { value: "Europe/London", label: "Europe/London", meta: "12:23 AM" },
    ],
    onChange: (v) => picked.push(v),
  };
  const box = (tree) => find(tree, (n) => n.props?.role === "combobox");
  const opts = (tree) => all(tree, (n) => n.props?.role === "option");
  let tree = draw(W.RecordCombobox, props);
  assert.equal(box(tree).type, "input");
  assert.equal(box(tree).props["aria-expanded"], false, "closed until asked");
  assert.equal(box(tree).props.value, "America/Chicago", "closed, it shows what is chosen");

  box(tree).props.onChange({ target: { value: "new" } });
  tree = redraw(W.RecordCombobox, props);
  assert.equal(box(tree).props["aria-expanded"], true);
  assert.deepEqual(opts(tree).map((o) => textOf(o)), ["America/New York7:23 PM", "America/North Dakota/New Salem6:23 PM"], "only what matches, each with its meta");
  assert.equal(box(tree).props["aria-controls"], find(tree, (n) => n.props?.role === "listbox").props.id, "the box names its list");
  assert.equal(box(tree).props["aria-activedescendant"], opts(tree)[0].props.id, "the first match is the one Enter would take");

  box(tree).props.onKeyDown({ key: "ArrowDown", preventDefault() {} });
  tree = redraw(W.RecordCombobox, props);
  assert.equal(box(tree).props["aria-activedescendant"], opts(tree)[1].props.id, "down walks to the next");
  assert.equal(opts(tree)[1].props["aria-selected"], true);

  box(tree).props.onKeyDown({ key: "Enter", preventDefault() {} });
  assert.deepEqual(picked, ["America/North_Dakota/New_Salem"], "Enter takes the one walked to");
  tree = redraw(W.RecordCombobox, props);
  assert.equal(box(tree).props["aria-expanded"], false, "and closes the list");

  box(tree).props.onChange({ target: { value: "lon" } });
  tree = redraw(W.RecordCombobox, props);
  const esc = { key: "Escape", defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  box(tree).props.onKeyDown(esc);
  tree = redraw(W.RecordCombobox, props);
  assert.equal(box(tree).props["aria-expanded"], false, "Escape closes it");
  assert.equal(esc.defaultPrevented, true, "and says so, so a fold or a sheet around it does not close as well");
  assert.deepEqual(picked, ["America/North_Dakota/New_Salem"], "without taking anything");

  box(tree).props.onChange({ target: { value: "lon" } });
  tree = redraw(W.RecordCombobox, props);
  let held = false;
  opts(tree)[0].props.onMouseDown({ preventDefault() { held = true; } });
  press(opts(tree)[0]);
  assert.equal(held, true, "a pointer keeps focus in the box");
  assert.deepEqual(picked, ["America/North_Dakota/New_Salem", "Europe/London"], "and a press takes it");
});

test("a tip you cannot click is a chip; one you can is a card", () => {
  const chip = draw(W.RecordTip, { text: "Call audio is not included.", label: "What the file holds" });
  const btn = find(chip, (n) => n.props?.["data-tip"]);
  assert.equal(btn.type, "button");
  assert.equal(btn.props["aria-label"], "What the file holds");
  assert.equal(btn.props["aria-description"], "Call audio is not included.", "a screen reader hears what the tip says, too");
  assert.ok(!find(chip, (n) => classes(n).includes("rec-card-tip")), "a chip is not a card");
  const shown = [];
  const tip = W.__tip;
  W.__tip = { show: (el) => shown.push(el) };
  const el = { tag: "the mark" };
  btn.props.onClick({ currentTarget: el, stopPropagation() {}, preventDefault() {} });
  W.__tip = tip;
  assert.deepEqual(shown, [el], "a press shows it at the mark, which is how a finger reads it");

  const used = [];
  const card = draw(W.RecordCard, { title: "Google's address", body: "2581 Pitkin Ave, Brooklyn, NY 11208, USA", act: { label: "Use it", onClick: () => used.push(1) } });
  assert.ok(find(card, (n) => classes(n).includes("rec-card-tip")), "a card is the white card");
  press(find(card, (n) => typeof n.props?.onClick === "function" && textOf(n) === "Use it"));
  assert.equal(used.length, 1);
});
