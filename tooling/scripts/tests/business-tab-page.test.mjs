/**
 * The record kit and the Business tab, EXECUTED on the stub React.
 * No source-text assertions: every claim here is something the page drew.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { stateOf } from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, unmount, remount, settle, all, find, textOf, classes, press } from "./_legacy-react.mjs";

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
await import(`${L}/components/record-fold.jsx`);
await import(`${L}/components/record-sheet.jsx`);
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

test("something wrong is on its row at full strength: a disagreement, or a sentence the page names", () => {
  const rowOf = (tree) => find(tree, (n) => classes(n).includes("rec-row"));
  assert.equal(rowOf(draw(W.RecordRow, { label: "Website", value: "melanys.com" })).props["data-state"], undefined, "nothing wrong, no state");
  const disputed = { value: "2581 Pitkin Ave, Brooklyn, NY 11208, USA", source: "verified", onUse: () => {} };
  assert.equal(rowOf(draw(W.RecordRow, { label: "Address", value: "2581 Pitkin Avenue", source: "typed", disputed })).props["data-state"], "warn", "a disagreement is a person's to settle");

  const sentence = "Without a booking link it has nowhere to send anyone who asks to book.";
  const tree = draw(W.RecordRow, { id: "booking_link", label: "Booking link", value: null, empty: "Not set", wrong: sentence, act: { label: "Add one", onClick: () => {} } });
  const row = rowOf(tree);
  assert.equal(row.props["data-state"], "warn", "a fact that is missing and needed is drawn the same way");
  assert.equal(textOf(find(row, (n) => classes(n).includes("rec-row-wrong"))), sentence, "in the page's own words");
  const act = find(tree, (n) => classes(n).includes("rec-row-act"));
  assert.equal(textOf(byId(tree, act.props["aria-describedby"])), sentence, "and the act that fixes it is described by it");
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

/* ------------------------------------ the fold ------------------------------------ */

const bookingRules = (over = {}) => ({
  id: "booking_rules",
  label: "Booking rules",
  hint: "It never books. It says which times are open and sends the link.",
  open: true,
  says: "Booking rules:\n- At least 2 hours' notice for any appointment.",
  saysLabel: "Your receptionist will be told",
  onSave: () => {},
  onCancel: () => {},
  ...over,
});

test("a fold opens, says what the receptionist will be told, and saves only itself", () => {
  const saved = [];
  const cancelled = [];
  const tree = draw(W.RecordFold, bookingRules({ onSave: () => saved.push(1), onCancel: () => cancelled.push(1) }));
  const fold = find(tree, (n) => classes(n).includes("rec-fold"));
  assert.equal(fold.props["data-open"], "true");
  assert.equal(fold.props["data-testid"], "rec-fold-booking_rules");
  const says = find(tree, (n) => n.props?.["data-testid"] === "rec-fold-says-booking_rules");
  assert.match(textOf(says), /At least 2 hours/);
  assert.match(textOf(says), /Your receptionist will be told/, "the eyebrow is the page's words; the kit has none of its own");
  const save = find(tree, (n) => typeof n.props?.onClick === "function" && textOf(n) === "Save");
  press(save);
  assert.equal(saved.length, 1);
  press(find(tree, (n) => typeof n.props?.onClick === "function" && textOf(n) === "Cancel"));
  press(find(tree, (n) => typeof n.props?.onClick === "function" && textOf(n) === "Close"));
  assert.equal(cancelled.length, 2, "Cancel and Close both hand the page the fold's cancel");
  assert.equal(find(draw(W.RecordFold, bookingRules({ says: "" })), (n) => classes(n).includes("rec-fold-says")), null, "a fold that writes nothing draws no block");
});

test("a fold kept while closed is hidden whole, its head and its Close with it", () => {
  const foldOf = (tree) => find(tree, (n) => classes(n).includes("rec-fold"));
  const closed = foldOf(draw(W.RecordFold, bookingRules({ open: false })));
  assert.equal(closed.props["data-open"], "false");
  // `hidden` is spelled the same in React 18 (the mockup) and 19 (the app), where `inert` is not, and it takes the
  // fold out of sight, out of the tab order and out of the accessibility tree at once. The row is what shows.
  assert.equal(closed.props.hidden, true);
  assert.ok(!foldOf(draw(W.RecordFold, bookingRules({ open: true }))).props.hidden, "open, it is there");
});

test("a fold whose own grid carries a label column says so, and no other fold does", () => {
  const foldOf = (tree) => find(tree, (n) => classes(n).includes("rec-fold"));
  assert.equal(foldOf(draw(W.RecordFold, bookingRules())).props["data-wide"], undefined, "a fold's fields start under the value");
  // record.css takes the indent off a wide fold's fields, and keeps it on what saving writes and on the foot.
  assert.equal(foldOf(draw(W.RecordFold, bookingRules({ id: "hours", wide: true }))).props["data-wide"], "true");
});

test("a fold's Save is gated, says when it is saving, and the keys cancel and save it", () => {
  const saved = [];
  const refused = [];
  const gated = draw(W.RecordFold, bookingRules({ onSave: () => saved.push(1), gate: { "aria-disabled": true, onClick: () => refused.push(1) } }));
  press(find(gated, (n) => n.props?.["data-testid"] === "rec-fold-save-booking_rules"));
  assert.deepEqual([saved.length, refused.length], [0, 1], "the gate is spread after the handler");

  const busy = find(draw(W.RecordFold, bookingRules({ saving: true, savingLabel: "Saving…" })), (n) => n.props?.["data-testid"] === "rec-fold-save-booking_rules");
  assert.deepEqual([busy.props.disabled, busy.props["aria-busy"], textOf(busy)], [true, true, "Saving…"]);

  const cancelled = [];
  const tree = draw(W.RecordFold, bookingRules({ onSave: () => saved.push(1), onCancel: () => cancelled.push(1) }));
  const fold = find(tree, (n) => classes(n).includes("rec-fold"));
  const key = (k, over = {}) => ({ key: k, defaultPrevented: false, metaKey: false, ctrlKey: false, preventDefault() { this.defaultPrevented = true; }, ...over });
  fold.props.onKeyDown(key("Escape"));
  fold.props.onKeyDown(key("Escape", { defaultPrevented: true }));
  fold.props.onKeyDown(key("Enter", { ctrlKey: true }));
  fold.props.onKeyDown(key("Enter"));
  assert.deepEqual([cancelled.length, saved.length], [1, 1], "Escape cancels unless a field inside took it; Ctrl or Cmd with Enter saves; Enter alone does not");
});

test("a fold takes focus as it opens, and gives it back to its row as it closes", () => {
  const focused = [];
  const field = { focus: () => focused.push("field") };
  const act = { focus: () => focused.push("act") };
  let tree = draw(W.RecordFold, bookingRules({ open: false }));
  // The stub attaches no ref, so the test stands in for the element React would have put there.
  find(tree, (n) => classes(n).includes("rec-fold")).props.ref.current = { querySelector: (sel) => (sel.includes("rec-fold-inner") ? field : null), contains: () => false };
  tree = redraw(W.RecordFold, bookingRules({ open: true }));
  assert.deepEqual(focused, ["field"], "the first thing to type into, not the page behind");

  const doc = globalThis.document;
  const was = { activeElement: doc.activeElement, querySelector: doc.querySelector };
  Object.assign(doc, { activeElement: null, querySelector: (sel) => (sel === '[data-rec-act="booking_rules"]' ? act : null) });
  try {
    redraw(W.RecordFold, bookingRules({ open: false }));
  } finally {
    Object.assign(doc, was);
  }
  assert.deepEqual(focused, ["field", "act"], "focus that went with the fold comes back to the row's act");
  const row = draw(W.RecordRow, { id: "booking_rules", label: "Booking rules", value: "2 hours' notice", act: { label: "Change", onClick: () => {} } });
  assert.equal(find(row, (n) => classes(n).includes("rec-row-act")).props["data-rec-act"], "booking_rules", "which is where the row's act says it is");
});

/* ------------------------------------ one fold at a time ------------------------------------ */

test("only one fold is open, and a dirty one is asked about before it closes", () => {
  W.__recordFolds.reset();
  assert.equal(W.__recordFolds.open(), null);
  W.__recordFolds.request("hours", { dirty: () => false });
  assert.equal(W.__recordFolds.open(), "hours");
  // A clean fold gives way without a word.
  let edited = false;
  W.__recordFolds.request("services", { dirty: () => edited });
  assert.equal(W.__recordFolds.open(), "services");
  assert.equal(W.__recordFolds.asking(), null, "nothing was asked");
  // Typed into, it does not, and says which fold is holding.
  edited = true;
  assert.equal(W.__recordFolds.request("notes", { dirty: () => false }), false, "the request says it was held");
  const asked = W.__recordFolds.asking();
  assert.equal(W.__recordFolds.open(), "services", "the dirty fold stays open until it is answered");
  assert.deepEqual(asked, { holding: "services", wants: "notes" });
  W.__recordFolds.discard();
  assert.equal(W.__recordFolds.open(), "notes");
  assert.equal(W.__recordFolds.asking(), null);
});

test("an ask is answered by keeping on, or by the holding fold closing, and a fold not open closes nothing", () => {
  const folds = W.__recordFolds;
  folds.reset();
  folds.request("hours", { dirty: () => true });
  folds.request("notes", { dirty: () => false });
  folds.stay();
  assert.deepEqual([folds.open(), folds.asking()], ["hours", null], "keep editing keeps the fold that held");
  folds.request("notes", { dirty: () => false });
  folds.close("hours");
  assert.equal(folds.open(), "notes", "once the holding fold closes (saved, or cancelled), the one asked for opens");
  folds.close("hours");
  assert.equal(folds.open(), "notes", "a stale close from a fold that is not open does nothing");
  folds.close("notes");
  assert.equal(folds.open(), null);
});

test("a fold whose page goes away lets go: the rail stops asking, and nothing waits on an answer from it", async () => {
  const folds = W.__recordFolds;
  folds.reset();
  folds.request("booking_rules", { dirty: () => true });
  folds.request("notes", { dirty: () => false });
  assert.deepEqual(folds.asking(), { holding: "booking_rules", wants: "notes" });
  const drawFold = () => W.React.createElement(W.RecordFold, bookingRules());
  fresh();
  drawFold();
  // React's StrictMode check (on in the app, in development) unmounts and remounts every effect at once.
  remount(drawFold);
  await settle();
  assert.equal(folds.open(), "booking_rules", "a fold that comes straight back is not gone");
  // The rail's "Yes, leave" replaces the pane, and the fold with it.
  unmount();
  await settle();
  assert.equal(W.__settingsUnsaved(), false, "a fold that is gone holds nothing the rail should ask about");
  assert.equal(folds.asking(), null);
  assert.equal(folds.open(), null);
});

test("a fold that was closed, or gave way, before it went leaves the open one alone", async () => {
  const folds = W.__recordFolds;
  folds.reset();
  folds.request("booking_rules", { dirty: () => false });
  draw(W.RecordFold, bookingRules());
  folds.request("hours", { dirty: () => true });
  unmount();
  await settle();
  assert.equal(folds.open(), "hours", "the fold now open is not the one that went");
  assert.equal(W.__settingsUnsaved(), true);
  folds.reset();
});

test("the page knows when a fold holds unsaved changes", () => {
  W.__recordFolds.reset();
  W.__recordFolds.request("hours", { dirty: () => true });
  assert.equal(W.__settingsUnsaved(), true);
  W.__recordFolds.reset();
  assert.equal(W.__settingsUnsaved(), false);
});

test("closing the browser tab over a dirty fold asks the browser to ask; over a clean one or none, it does not", () => {
  const unload = () => {
    const ev = { type: "beforeunload", returnValue: undefined, prevented: false, preventDefault() { this.prevented = true; } };
    W.dispatchEvent(ev);
    return ev;
  };
  W.__recordFolds.reset();
  assert.equal(unload().prevented, false, "nothing open");
  let edited = false;
  W.__recordFolds.request("hours", { dirty: () => edited });
  assert.equal(unload().prevented, false, "open, and clean");
  edited = true;
  const ev = unload();
  assert.deepEqual([ev.prevented, ev.returnValue], [true, ""], "open, and holding changes");
  W.__recordFolds.reset();
  assert.equal(unload().prevented, false, "and the hold goes with the fold");
});

test("the registry tells whoever listens each time it changes", () => {
  const folds = W.__recordFolds;
  folds.reset();
  const told = [];
  const stop = folds.subscribe(() => told.push(folds.open()));
  folds.request("hours", { dirty: () => false });
  folds.close("hours");
  stop();
  folds.request("notes");
  assert.deepEqual(told, ["hours", null]);
  folds.reset();
});

/* ------------------------------------ the sheet ------------------------------------ */

const offer = (over = {}) => ({
  title: "What you offer",
  sub: "Names and rough timings. A price only if you can state it flatly.",
  onClose: () => {},
  foot: null,
  ...over,
});

test("a sheet is a dialog with a name, a close and a foot that holds still", () => {
  const closed = [];
  const tree = draw(W.RecordSheet, offer({ onClose: () => closed.push(1) }));
  const sheet = find(tree, (n) => classes(n).includes("rec-sheet"));
  assert.equal(sheet.props.role, "dialog");
  assert.equal(sheet.props["aria-modal"], true);
  assert.ok(sheet.props["aria-label"] === "What you offer" || sheet.props["aria-labelledby"]);
  const close = find(tree, (n) => n.props?.["aria-label"] === "Close");
  assert.equal(close.type, "button");
  press(close);
  assert.equal(closed.length, 1);

  const saveAll = W.React.createElement("button", { type: "button", onClick: () => {} }, "Save 33 services");
  fresh();
  // Children as React hands them, after the props: the stub's createElement sets `children` from these.
  const full = W.React.createElement(W.RecordSheet, offer({ id: "services", foot: saveAll, tools: "search" }), "row one", "row two");
  const named = find(full, (n) => classes(n).includes("rec-sheet"));
  assert.equal(named.props["data-testid"], "rec-sheet-services");
  assert.equal(textOf(byId(full, named.props["aria-labelledby"])), "What you offer", "with an id, the sheet is named by its heading");
  assert.match(textOf(byId(full, named.props["aria-describedby"])), /rough timings/, "and described by the line under it");
  const foot = find(full, (n) => classes(n).includes("rec-sheet-foot"));
  assert.ok(find(foot, (n) => n === saveAll), "the foot holds the page's act");
  assert.equal(find(find(full, (n) => classes(n).includes("rec-sheet-body")), (n) => n === saveAll), null, "outside the part that scrolls");
  assert.equal(textOf(find(full, (n) => classes(n).includes("rec-sheet-body"))), "row onerow two");
  assert.equal(textOf(find(full, (n) => classes(n).includes("rec-sheet-tools"))), "search");
});

test("Escape closes a sheet, once, unless something in it took the key", () => {
  const closed = [];
  const tree = draw(W.RecordSheet, offer({ onClose: () => closed.push(1) }));
  const esc = (over = {}) => ({ type: "keydown", key: "Escape", defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...over });
  const inside = esc();
  find(tree, (n) => classes(n).includes("rec-sheet")).props.onKeyDown(inside);
  assert.deepEqual([closed.length, inside.defaultPrevented], [1, true], "from inside the sheet, and taken, so a fold around it does not cancel too");
  W.dispatchEvent(inside);
  assert.equal(closed.length, 1, "the same key reaching the window does not close it twice");
  W.dispatchEvent(esc());
  assert.equal(closed.length, 2, "with focus outside it, the window hears the key");
  W.dispatchEvent(esc({ defaultPrevented: true }));
  assert.equal(closed.length, 2, "a key a combobox inside already took is not the sheet's");
});

test("Tab stays inside a sheet, and wraps round both ways", () => {
  const sheet = find(draw(W.RecordSheet, offer()), (n) => classes(n).includes("rec-sheet"));
  const focused = [];
  const [first, middle, last] = ["first", "middle", "last"].map((name) => ({ name, focus: () => focused.push(name) }));
  // What the sheet's own controls would be, in the order a browser tabs through them.
  const box = { querySelectorAll: () => [first, middle, last] };
  const doc = globalThis.document;
  const was = doc.activeElement;
  const tabFrom = (at, shiftKey) => {
    doc.activeElement = at;
    const e = { key: "Tab", shiftKey, currentTarget: box, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    sheet.props.onKeyDown(e);
    return e.defaultPrevented;
  };
  try {
    assert.equal(tabFrom(last, false), true, "Tab from the last control goes round to the first");
    assert.equal(tabFrom(first, true), true, "Shift+Tab from the first goes round to the last");
    assert.equal(tabFrom(box, true), true, "and from the sheet itself, where focus lands as it opens, to the last too");
    assert.equal(tabFrom(middle, false), false, "between the ends, the browser moves focus as ever");
  } finally {
    doc.activeElement = was;
  }
  assert.deepEqual(focused, ["first", "last", "last"]);
});

test("a sheet takes focus as it opens, gives it back to what opened it, and opens inside the app", () => {
  const focused = [];
  const opener = { focus: () => focused.push("opener") };
  const panel = { focus: () => focused.push("sheet") };
  const appRoot = { app: "root" };
  const portals = [];
  const doc = globalThis.document;
  const was = { activeElement: doc.activeElement, querySelector: doc.querySelector, createPortal: W.ReactDOM.createPortal };
  Object.assign(doc, { activeElement: opener, querySelector: (sel) => (sel === ".app-root" ? appRoot : null) });
  W.ReactDOM.createPortal = (node, into) => { portals.push(into); return node; };
  try {
    const tree = draw(W.RecordSheet, offer());
    const sheet = find(tree, (n) => classes(n).includes("rec-sheet"));
    assert.equal(sheet.props.tabIndex, -1, "the sheet itself can take focus, so a screen reader names it");
    // React calls a callback ref with the element as it mounts and with null as it goes; the stub calls neither.
    sheet.props.ref(panel);
    sheet.props.ref(null);
  } finally {
    Object.assign(doc, { activeElement: was.activeElement, querySelector: was.querySelector });
    W.ReactDOM.createPortal = was.createPortal;
  }
  assert.deepEqual(focused, ["sheet", "opener"]);
  assert.deepEqual(portals, [appRoot], "drawn in the app's root, where People's overlay check (PL_OVERLAY) finds a dialog, over the pane's own layout");
});
