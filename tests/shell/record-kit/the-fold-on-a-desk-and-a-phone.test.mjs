/**
 * The record kit's fold, on a desk and on a phone.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { again, unmount, all, find, byTestId, textOf, classes, press, atWidth } from "../../_stub-react.mjs";
import { W, bookingRules, byId, dialogOf, draw, drawFold, fakeNode, inRoots, redraw } from "./_record-kit.mjs";

test("a fold opens, says what the receptionist will be told, and saves only itself", () => {
  const saved = [];
  const cancelled = [];
  const tree = draw(W.RecordFold, bookingRules({ onSave: () => saved.push(1), onCancel: () => cancelled.push(1) }));
  const fold = find(tree, (n) => classes(n).includes("rec-fold"));
  assert.equal(fold.props["data-open"], "true");
  assert.equal(fold.props["data-testid"], "rec-fold-booking_rules");
  const says = find(tree, (n) => n.props?.["data-testid"] === "rec-fold-says-booking_rules");
  assert.match(textOf(says), /At least 2 hours/);
  assert.match(
    textOf(says),
    /Your receptionist will be told/,
    "the eyebrow is the page's words; the kit has none of its own",
  );
  const save = find(tree, (n) => typeof n.props?.onClick === "function" && textOf(n) === "Save");
  press(save);
  assert.equal(saved.length, 1);
  press(find(tree, (n) => typeof n.props?.onClick === "function" && textOf(n) === "Cancel"));
  press(find(tree, (n) => typeof n.props?.onClick === "function" && textOf(n) === "Close"));
  assert.equal(cancelled.length, 2, "Cancel and Close both hand the page the fold's cancel");
  assert.equal(
    find(draw(W.RecordFold, bookingRules({ says: "" })), (n) => classes(n).includes("rec-says")),
    null,
    "a fold that writes nothing draws no block",
  );
});

test("a fold says what saving it writes as an inline editor does: what goes beside what comes, and the page's sentence first", () => {
  // Hours, services, the voice, languages, notes and the hand-off reasons all count for whether the prompt is composed
  // at all, so a fold needs the same three parts a row has, through the same RecordSays.
  const tree = draw(
    W.RecordFold,
    bookingRules({
      gone: "- These need a consultation before they can be booked: Extensions.",
      goneLabel: "It will no longer be told",
      note: "Saved like this, the receptionist stops being given the details on this page.",
    }),
  );
  const says = find(tree, (n) => n.props?.["data-testid"] === "rec-fold-says-booking_rules");
  assert.equal(says.props.id, "rec-fold-booking_rules-says", "and a field of the page's can be described by it");
  assert.equal(says.props["data-inline"], undefined, "a fold stacks each eyebrow over its lines");
  const parts = all(says, (n) => classes(n).includes("rec-says-part")).map((p) => [
    p.props["data-part"],
    textOf(find(p, (n) => classes(n).includes("rec-says-eyebrow"))),
    textOf(find(p, (n) => n.type === "pre")),
  ]);
  assert.deepEqual(parts, [
    ["says", "Your receptionist will be told", "Booking rules:\n- At least 2 hours' notice for any appointment."],
    ["gone", "It will no longer be told", "- These need a consultation before they can be booked: Extensions."],
  ]);
  assert.match(
    textOf(find(says, (n) => n.props?.["data-testid"] === "rec-fold-says-booking_rules-note")),
    /stops being given/,
  );
  assert.equal(
    find(tree, (n) => classes(n).includes("rec-foot-note")),
    null,
    "the sentence is what saving writes, never the foot's line",
  );

  // Only a sentence, or only what goes, is still something to say; nothing at all draws no block.
  const only = (props) =>
    find(draw(W.RecordFold, bookingRules({ says: null, ...props })), (n) => classes(n).includes("rec-says"));
  assert.ok(only({ note: "Saved like this, the receptionist stops being given the details on this page." }));
  assert.ok(only({ gone: "- Sunday: closed", goneLabel: "It will no longer be told" }));
  assert.equal(only({}), null);

  // The foot's own line has a name of its own, so `note` means one thing in the kit.
  const foot = find(
    draw(W.RecordFold, bookingRules({ footNote: "Saves these five rules and nothing else on the page." })),
    (n) => classes(n).includes("rec-foot"),
  );
  assert.equal(
    textOf(find(foot, (n) => classes(n).includes("rec-foot-note"))),
    "Saves these five rules and nothing else on the page.",
  );
});

test("what saving writes is drawn a line at a time, and only the lines the page names as changed are marked", () => {
  // Spec §9, item 3: when the block changes as the draft changes, only the changed clause washes, once. Which clause
  // changed is the page's to work out (it holds the block before and after); the kit draws each line as its own span,
  // in the same text, and marks the ones it is told, for record.css to wash. Never a re-layout: the words are the
  // same words, line for line.
  const says = "Booking rules:\n- At least 3 hours' notice for any appointment.\n- Up to 14 days ahead.";
  const gone = "- At least 2 hours' notice for any appointment.";
  const tree = draw(
    W.RecordFold,
    bookingRules({ says, gone, goneLabel: "It will no longer be told", changed: [1], goneChanged: [0] }),
  );
  const block = find(tree, (n) => n.props?.["data-testid"] === "rec-fold-says-booking_rules");
  const part = (name) => find(block, (n) => n.props?.["data-part"] === name);
  const lines = (p) =>
    all(
      find(p, (n) => n.type === "pre"),
      (n) => classes(n).includes("rec-says-line"),
    );
  assert.equal(textOf(find(part("says"), (n) => n.type === "pre")), says, "the same text, newlines and all");
  assert.deepEqual(
    lines(part("says")).map((l) => [textOf(l), l.props["data-changed"]]),
    [
      ["Booking rules:", undefined],
      ["- At least 3 hours' notice for any appointment.", "true"],
      ["- Up to 14 days ahead.", undefined],
    ],
    "the one changed line, and only it",
  );
  assert.deepEqual(
    lines(part("gone")).map((l) => l.props["data-changed"]),
    ["true"],
    "what goes is marked by its own list",
  );
  // Told nothing, it marks nothing: a block drawn as the fold opens has not changed.
  const plain = draw(W.RecordFold, bookingRules({ says }));
  assert.deepEqual(
    all(plain, (n) => n.props?.["data-changed"] !== undefined && classes(n).includes("rec-says-line")),
    [],
  );
  // A changed line is keyed by its words, so a line rewritten is a new line to the browser and washes once, where a
  // line that stays keeps its element and does not wash again.
  const keys = all(
    find(part("says"), (n) => n.type === "pre"),
    (n) => n.type === W.React.Fragment,
  ).map((f) => f.props.key);
  assert.equal(new Set(keys).size, 3, "each line its own key");
  assert.ok(keys[1].includes("3 hours"), "keyed by what it says");
  // The inline editor draws its lines the same way, through the same RecordSays.
  const row = draw(W.RecordInline, {
    id: "website",
    label: "Website",
    open: true,
    says: "Website: https://marisas.example",
    saysLabel: "It will say",
    changed: [0],
    onSave: () => {},
    onCancel: () => {},
  });
  assert.equal(
    find(row, (n) => classes(n).includes("rec-says-line")).props["data-changed"],
    "true",
    "and marks what it is told",
  );
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
  assert.equal(
    foldOf(draw(W.RecordFold, bookingRules())).props["data-wide"],
    undefined,
    "a fold's fields start under the value",
  );
  // record.css takes the indent off a wide fold's fields, and keeps it on what saving writes and on the foot.
  assert.equal(foldOf(draw(W.RecordFold, bookingRules({ id: "hours", wide: true }))).props["data-wide"], "true");
});

test("a fold's Save is gated, says when it is saving, and the keys cancel and save it", () => {
  const saved = [];
  const refused = [];
  const gated = draw(
    W.RecordFold,
    bookingRules({ onSave: () => saved.push(1), gate: { "aria-disabled": true, onClick: () => refused.push(1) } }),
  );
  press(find(gated, (n) => n.props?.["data-testid"] === "rec-fold-save-booking_rules"));
  assert.deepEqual([saved.length, refused.length], [0, 1], "the gate is spread after the handler");

  const whileSaving = [];
  const busy = find(
    draw(W.RecordFold, bookingRules({ saving: true, savingLabel: "Saving…", onSave: () => whileSaving.push(1) })),
    (n) => n.props?.["data-testid"] === "rec-fold-save-booking_rules",
  );
  // Not `disabled`: a disabled button lets go of focus, to the page, and a save that failed left it there.
  assert.deepEqual(
    [busy.props.disabled, busy.props["aria-disabled"], busy.props["aria-busy"], textOf(busy)],
    [undefined, true, true, "Saving…"],
  );
  press(busy);
  assert.equal(whileSaving.length, 0, "a press while it saves does nothing, and focus stays on Save");
  // Neither does the head's Close, which is Cancel: it cancelled while the foot's Cancel and Escape did not.
  const closed = [];
  const saving = draw(W.RecordFold, bookingRules({ saving: true, onCancel: () => closed.push(1) }));
  const close = find(saving, (n) => n.props?.["data-testid"] === "rec-fold-close-booking_rules");
  press(close);
  press(find(saving, (n) => n.props?.["data-testid"] === "rec-fold-cancel-booking_rules"));
  assert.deepEqual(
    [closed.length, close.props["aria-disabled"], close.props.disabled],
    [0, true, undefined],
    "the save is on its way, and nothing says it was thrown away",
  );

  const cancelled = [];
  const tree = draw(W.RecordFold, bookingRules({ onSave: () => saved.push(1), onCancel: () => cancelled.push(1) }));
  const fold = find(tree, (n) => classes(n).includes("rec-fold"));
  // A key pressed inside the fold's own DOM; a portal's (a sheet drawn from inside the fold) bubbles through React
  // to the fold all the same, from outside it.
  const inside = { currentTarget: { contains: () => true }, target: { tag: "a field" } };
  const key = (k, over = {}) => ({
    key: k,
    defaultPrevented: false,
    metaKey: false,
    ctrlKey: false,
    ...inside,
    preventDefault() {
      this.defaultPrevented = true;
    },
    ...over,
  });
  fold.props.onKeyDown(key("Escape"));
  fold.props.onKeyDown(key("Escape", { defaultPrevented: true }));
  fold.props.onKeyDown(key("Enter", { ctrlKey: true }));
  fold.props.onKeyDown(key("Enter"));
  assert.deepEqual(
    [cancelled.length, saved.length],
    [1, 1],
    "Escape cancels unless a field inside took it; Ctrl or Cmd with Enter saves; Enter alone does not",
  );
  const fromPortal = { currentTarget: { contains: () => false } };
  fold.props.onKeyDown(key("Enter", { ctrlKey: true, ...fromPortal }));
  fold.props.onKeyDown(key("Escape", fromPortal));
  assert.deepEqual(
    [cancelled.length, saved.length],
    [1, 1],
    "a key from a sheet drawn inside the fold is the sheet's, not the fold's",
  );
});

test("a fold takes focus as it opens, and gives it back to its row as it closes", () => {
  const focused = [];
  // What the fold's fields hold, in order: the mark that explains a label comes before its box, and Save after it.
  const stop = (name, cls, inFoot = false) => ({
    name,
    tabIndex: 0,
    disabled: false,
    getClientRects: () => [{}],
    classList: { contains: (c) => c === cls },
    closest: (sel) => (inFoot && sel === ".rec-foot" ? {} : null),
    focus: () => focused.push(name),
  });
  const inner = {
    querySelectorAll: () => [stop("tip", "rec-tip"), stop("field", "rec-input"), stop("save", "btn", true)],
  };
  const act = { focus: () => focused.push("act") };
  const tree = draw(W.RecordFold, bookingRules({ open: false }));
  // The stub attaches no ref, so the test stands in for the element React would have put there.
  find(tree, (n) => classes(n).includes("rec-fold")).props.ref.current = {
    querySelector: (sel) => (sel === ".rec-fold-inner" ? inner : null),
    contains: () => false,
  };
  redraw(W.RecordFold, bookingRules({ open: true }));
  assert.deepEqual(focused, ["field"], "the first thing to type into: not the tip before it, not the page behind");

  const doc = globalThis.document;
  const was = { activeElement: doc.activeElement, querySelector: doc.querySelector };
  Object.assign(doc, {
    activeElement: null,
    querySelector: (sel) => (sel === '[data-rec-act="booking_rules"]' ? act : null),
  });
  try {
    redraw(W.RecordFold, bookingRules({ open: false }));
  } finally {
    Object.assign(doc, was);
  }
  assert.deepEqual(focused, ["field", "act"], "focus that went with the fold comes back to the row's act");
  const row = draw(W.RecordRow, {
    id: "booking_rules",
    label: "Booking rules",
    value: "2 hours' notice",
    act: { label: "Change", onClick: () => {} },
  });
  assert.equal(
    find(row, (n) => classes(n).includes("rec-row-act")).props["data-rec-act"],
    "booking_rules",
    "which is where the row's act says it is",
  );
});

test("focus that went with something comes back to the field the person was in; focus a person moved is left where they put it", () => {
  // Task 3.2's review, and Task 3.3's. The refocus first fired whenever an ask went away, typing included, so the caret
  // jumped to the end of the FIRST field after one letter, and "Keep editing" went to the first field of a fold of many.
  // Then it knew only about asks: the last shift's remove, an Add that turned into the sentence for a full list and a
  // menu's item each took focus to the top of the document as they left the page.
  const focused = [];
  const field = (name) => ({
    name,
    tabIndex: 0,
    disabled: false,
    getClientRects: () => [{}],
    classList: { contains: () => false },
    closest: (sel) => (sel === ".rec-fold-inner" ? {} : null),
    focus: () => focused.push(name),
  });
  const first = field("least notice");
  const second = field("slot length");
  const inFoot = {
    ...field("cancel"),
    closest: (sel) => (sel === ".rec-fold-inner" || sel === ".rec-foot" ? {} : null),
  };
  const inAsk = {
    ...field("yes, discard"),
    closest: (sel) => (sel === ".rec-fold-inner" || sel === ".confirm" ? {} : null),
  };
  const remove = {
    ...field("remove the second shift"),
    matches: (sel) => sel === "button:not([role]):not(.rec-input)",
  };
  const inner = { querySelectorAll: () => [first, second] };
  const ask = W.React.createElement("span", { className: "confirm" }, "Discard your changes?");
  let tree = draw(W.RecordFold, bookingRules({ open: false }));
  const fold = () => find(tree, (n) => classes(n).includes("rec-fold"));
  fold().props.ref.current = {
    querySelector: (sel) => (sel === ".rec-fold-inner" ? inner : null),
    contains: () => true,
  };
  tree = redraw(W.RecordFold, bookingRules({ open: true }));
  assert.deepEqual(focused, ["least notice"], "opened: the first field");

  const doc = globalThis.document;
  const was = { activeElement: doc.activeElement, contains: doc.contains };
  // What has left the page. The stub attaches no elements, so the test says which of its stand-ins are still there.
  const left = new Set();
  doc.contains = (el) => !left.has(el);
  try {
    // The person moves to the second field, then presses Cancel; the ask's Yes takes focus, and goes with the ask.
    for (const target of [second, inFoot, inAsk]) fold().props.onFocus({ target });
    tree = redraw(W.RecordFold, bookingRules({ open: true, confirm: ask }));
    assert.deepEqual(focused, ["least notice"], "nothing has gone: nothing moves");
    left.add(inAsk);
    doc.activeElement = null;
    tree = redraw(W.RecordFold, bookingRules({ open: true }));
    assert.deepEqual(
      focused,
      ["least notice", "slot length"],
      "back to where they were: not the first field, not Cancel, not the ask",
    );
    tree = redraw(W.RecordFold, bookingRules({ open: true }));
    assert.deepEqual(focused, ["least notice", "slot length"], "once: a draw later, nothing more");

    // Typing takes the ask away too, and focus is in the box being typed in: nothing moves it.
    fold().props.onFocus({ target: second });
    tree = redraw(W.RecordFold, bookingRules({ open: true, confirm: ask }));
    doc.activeElement = second;
    tree = redraw(W.RecordFold, bookingRules({ open: true }));
    assert.deepEqual(focused, ["least notice", "slot length"], "focus that was never lost is left where it is");

    // A press that removes itself: the last shift's remove, an Add at the cap, a menu's item. Not an ask, and the same.
    fold().props.onFocus({ target: remove });
    left.add(remove);
    doc.activeElement = null;
    tree = redraw(W.RecordFold, bookingRules({ open: true }));
    assert.deepEqual(focused, ["least notice", "slot length", "slot length"]);
    // And when the field the person was in went with it (its row was the one removed), the first field.
    fold().props.onFocus({ target: second });
    fold().props.onFocus({ target: inFoot });
    left.add(second);
    left.add(inFoot);
    tree = redraw(W.RecordFold, bookingRules({ open: true }));
    assert.deepEqual(focused.slice(3), ["least notice"]);

    // A person who clicked away from the fold put focus on the page themselves: what they left is still there, and a
    // redraw (a save's tick, a surface read again) does not pull focus back in.
    fold().props.onFocus({ target: first });
    doc.activeElement = null;
    tree = redraw(W.RecordFold, bookingRules({ open: true }));
    assert.equal(focused.length, 4);

    // What had focus goes while focus is somewhere the person put it since (a toast's Undo, outside the fold, takes out
    // the row they were in): it stays with them.
    const undoInToast = { name: "undo" };
    doc.activeElement = undoInToast;
    left.add(first);
    tree = redraw(W.RecordFold, bookingRules({ open: true }));
    assert.equal(focused.length, 4, "focus is not pulled out of the toast");
    left.delete(first);
    doc.activeElement = null;

    // Closed and opened again, it starts from the first field: where the person was is forgotten with the draft.
    tree = redraw(W.RecordFold, bookingRules({ open: false }));
    tree = redraw(W.RecordFold, bookingRules({ open: true }));
    assert.deepEqual(focused.slice(4), ["least notice"]);
  } finally {
    Object.assign(doc, was);
    if (was.contains === undefined) delete doc.contains;
  }
});

test("a row a list has just been given takes focus in its first box", () => {
  // After an Add, focus stayed on Add. The page names the row (data-rec-row) and hands the fold `focusOn`.
  const focused = [];
  const asked = [];
  const stop = (name) => ({
    name,
    tabIndex: 0,
    disabled: false,
    getClientRects: () => [{}],
    classList: { contains: () => false },
    closest: () => null,
    focus: () => focused.push(name),
  });
  const row = { querySelectorAll: () => [stop("opens"), stop("closes"), stop("remove")] };
  const tree = draw(W.RecordFold, bookingRules({ open: true }));
  find(tree, (n) => classes(n).includes("rec-fold")).props.ref.current = {
    querySelector: (sel) => {
      asked.push(sel);
      return sel === '[data-rec-row="hours-mon-1"]' ? row : null;
    },
    contains: () => true,
  };
  redraw(W.RecordFold, bookingRules({ open: true, focusOn: { row: "hours-mon-1" } }));
  assert.deepEqual(focused, ["opens"], "the new row's first box, not Add and not its remove");
  assert.ok(asked.includes('[data-rec-row="hours-mon-1"]'));
  const same = { row: "hours-mon-1" };
  redraw(W.RecordFold, bookingRules({ open: true, focusOn: same }));
  redraw(W.RecordFold, bookingRules({ open: true, focusOn: same }));
  assert.deepEqual(focused, ["opens", "opens"], "once for each row given, however often the fold is drawn");
  redraw(W.RecordFold, bookingRules({ open: true, focusOn: { row: "no-such-row" } }));
  assert.equal(focused.length, 2, "a row that is not there takes nothing");
});

test("a fold draws the page's ask in its foot's place: a question stands alone, and Save and Cancel are back once it is answered", () => {
  // Ruben, 7 Oct 2026: the question stood above Save and Cancel, four presses in two colours in one foot. It takes
  // their place now, and they come back with its answer.
  const ask = W.React.createElement("span", { className: "confirm", "data-testid": "ask" }, "Discard your changes?");
  const kidsOf = (props) => {
    const inner = find(draw(W.RecordFold, bookingRules(props)), (n) => classes(n).includes("rec-fold-inner"));
    return [].concat(inner.props.children).filter(Boolean);
  };
  const isFoot = (k) => classes(k.rendered).includes("rec-foot");
  const asked = kidsOf({ confirm: ask });
  assert.ok(asked.includes(ask), "inside the fold, where the changes it asks about are");
  assert.equal(asked.findIndex(isFoot), -1, "Save and Cancel are not drawn beside its two answers");
  assert.ok(kidsOf({}).findIndex(isFoot) >= 0, "and they are back once it is answered");
  // A save that is out is never asked about: the foot stays, busy, and the ask is not drawn.
  const saving = kidsOf({ confirm: ask, saving: true });
  assert.deepEqual([saving.includes(ask), saving.findIndex(isFoot) >= 0], [false, true]);
});

test("on a phone the row a fold opens from is still drawn behind its sheet, so the card under the wash keeps its height", () => {
  // Task 6.2b's note 8: the page draws a fold's row OR the fold, so while a row's sheet was open the card behind it
  // was one row shorter, and it grew back as the sheet went. A sheet that leaves over a fading wash (the fold's close,
  // spec §9, item 1) would show that. The page hands the kit what the row draws at rest (`behind`), and the kit draws
  // it in the fold's place, behind the wash, for as long as the fold is a sheet: never inside the dialog, never at a
  // desktop's width, where the fold itself stands in the row's place, and never while it is closed, when the page
  // draws the row itself.
  const behind = W.React.createElement(
    "div",
    { className: "rec-row", "data-testid": "rec-row-booking_rules" },
    "Booking rules",
  );
  const width = atWidth(true);
  try {
    const tree = drawFold(bookingRules({ behind }));
    assert.ok(
      find(tree, (n) => n === behind),
      "drawn while the sheet is open",
    );
    assert.equal(
      find(dialogOf(tree), (n) => n === behind),
      null,
      "and not inside the dialog",
    );
    // Behind a modal sheet it is a picture of the row, not the row: nothing in it can be pressed, focused or read out.
    // It sits in a box that lays out as nothing (display: contents, record.css), so the card is as it was, and that box
    // is aria-hidden and inert -- set through its ref, which React 18 (the mockup) and 19 (the app) both pass through,
    // where they spell the `inert` prop differently.
    const shield = find(tree, (n) => classes(n).includes("rec-fold-behind"));
    assert.ok(shield && find(shield, (n) => n === behind), "the row is inside its box");
    assert.equal(shield.props["aria-hidden"], "true");
    // Keyed, so React never reuses it as the fold's own box drawn in its place as the fold closes: that box carried
    // `display: contents` into its close, and the card moved 8px under the leaving sheet (the journey measured it).
    assert.equal(shield.props.key, "behind");
    const el = { attrs: {}, setAttribute: (k, v) => (el.attrs[k] = v) };
    shield.props.ref(el);
    assert.deepEqual(el.attrs, { inert: "" }, "inert, whatever React spells it");
    shield.props.ref(null);
    assert.equal(
      find(drawFold(bookingRules({ behind, open: false })), (n) => n === behind),
      null,
      "closed: the page's",
    );
  } finally {
    width.put();
  }
  assert.equal(
    find(drawFold(bookingRules({ behind })), (n) => n === behind),
    null,
    "a desktop's fold is in its place",
  );
});

test("on a phone a fold's sheet leaves as it closes: a still copy slides down over a fading wash, and is gone", async () => {
  // Spec §9, item 1 closes the fold on --ease-in-out, and Task 6.1's step 3b asks it of the sheet too. The sheet is
  // React's until the registry closes it, and React takes it off the page then, with focus going back to the row's act
  // and the next fold let in at once. So nothing is kept: what leaves is a copy of what was on screen (typed words and
  // all, where the sheet had scrolled to), put in the app's root beside it, with nothing in it to press, focus, name or
  // find (no role, no ids, no test ids, inert, hidden from a screen reader), for record.css to slide away. It goes when
  // its slide ends.
  const root = { added: [], appendChild: (n) => root.added.push(n) };
  const doc = globalThis.document;
  const was = doc.querySelector;
  doc.querySelector = (sel) => (inRoots(sel, ".app-root") ? root : null);
  const width = atWidth(true);
  try {
    const body = fakeNode("div", { class: "rec-sheet-body", "data-testid": "rec-fold-says-booking_rules" });
    const title = fakeNode("h2", { class: "rec-sheet-title", id: "rec-fold-booking_rules-label" });
    const sheetEl = fakeNode(
      "section",
      {
        class: "rec-sheet rec-fold-sheet",
        role: "dialog",
        "aria-modal": "true",
        "data-testid": "rec-fold-booking_rules",
      },
      [title, body],
    );
    const washEl = fakeNode("div", { class: "rec-sheet-backdrop", "data-fold": "true" });
    let tree = drawFold(bookingRules());
    // The stub attaches no ref: the test hands the kit the elements React would have.
    dialogOf(tree).props.ref.current = sheetEl;
    find(tree, (n) => classes(n).includes("rec-sheet-backdrop")).props.ref.current = washEl;
    find(dialogOf(tree), (n) => classes(n).includes("rec-sheet-body")).props.onScroll({
      currentTarget: { scrollTop: 120 },
    });
    tree = again(() => W.React.createElement(W.RecordFold, bookingRules({ open: false })));
    assert.equal(dialogOf(tree), null, "the fold is closed: no dialog is drawn");
    const [washCopy, sheetCopy] = root.added;
    assert.ok(washCopy && sheetCopy, "a copy of the wash and of the sheet, in the app's root");
    assert.equal(sheetCopy.attrs["data-leaving"], "true");
    assert.equal(washCopy.attrs["data-leaving"], "true");
    for (const k of ["role", "aria-modal", "data-testid", "id"]) assert.equal(sheetCopy.attrs[k], undefined, `no ${k}`);
    assert.equal(sheetCopy.attrs["aria-hidden"], "true");
    assert.equal(sheetCopy.attrs.inert, "");
    for (const kid of sheetCopy.kids) {
      assert.equal(kid.attrs.id, undefined, "no id inside it: the fold's own ids are the page's again");
      assert.equal(kid.attrs["data-testid"], undefined, "and nothing a test could find it by");
    }
    assert.equal(sheetCopy.kids[1].scrollTop, 120, "scrolled where the sheet was");
    sheetCopy.heard.transitionend({ target: sheetCopy, propertyName: "transform" });
    assert.ok(sheetCopy.removed && washCopy.removed, "and gone when its slide ends");

    // Neither leaves where the fold is still open: a width crossed draws it in the other frame, and a page going away
    // takes it with it.
    root.added.length = 0;
    tree = drawFold(bookingRules());
    dialogOf(tree).props.ref.current = sheetEl;
    width.resize(false);
    again(() => W.React.createElement(W.RecordFold, bookingRules()));
    assert.deepEqual(root.added, [], "a width crossed with the fold open");
    width.resize(true);
    tree = again(() => W.React.createElement(W.RecordFold, bookingRules()));
    dialogOf(tree).props.ref.current = sheetEl;
    unmount();
    assert.deepEqual(root.added, [], "a page gone with the fold open");

    // And under reduced motion nothing leaves: the sheet goes at once.
    const plain = globalThis.matchMedia;
    globalThis.matchMedia = (q) => ({
      ...plain(q),
      matches: q === "(prefers-reduced-motion: reduce)" || plain(q).matches,
    });
    try {
      tree = drawFold(bookingRules());
      dialogOf(tree).props.ref.current = sheetEl;
      again(() => W.React.createElement(W.RecordFold, bookingRules({ open: false })));
      assert.deepEqual(root.added, [], "reduced motion");
    } finally {
      globalThis.matchMedia = plain;
    }
  } finally {
    width.put();
    doc.querySelector = was;
  }
});

test("on a phone a fold opens as a sheet from the bottom: a modal dialog named by its label, with the same fields, the same says and the same foot", () => {
  const width = atWidth(true);
  try {
    const saved = [];
    const cancelled = [];
    const ask = W.React.createElement("span", { className: "confirm", "data-testid": "ask" }, "Discard your changes?");
    const tree = drawFold(
      bookingRules({
        footNote: "Saves these five rules and nothing else on the page.",
        onSave: () => saved.push(1),
        onCancel: () => cancelled.push(1),
      }),
    );
    const sheet = dialogOf(tree);
    assert.ok(sheet, "a dialog, not a fold under its row");
    assert.equal(sheet.props["aria-modal"], true);
    assert.ok(
      classes(sheet).includes("rec-sheet"),
      "the kit's own sheet frame, which record.css raises from the bottom",
    );
    assert.equal(sheet.props["data-testid"], "rec-fold-booking_rules", "known by the fold's own name, at every width");
    assert.equal(textOf(byId(tree, sheet.props["aria-labelledby"])), "Booking rules", "named by the fold's label");
    assert.equal(sheet.props["aria-labelledby"], "rec-fold-booking_rules-label", "the id a page's field is named by");
    assert.match(
      textOf(byId(tree, sheet.props["aria-describedby"])),
      /It never books/,
      "and described by the fold's hint, under it",
    );
    assert.ok(
      find(sheet, (n) => n.props?.id === "bt-lead"),
      "the page's field is in it",
    );
    assert.match(textOf(byTestId(sheet, "rec-fold-says-booking_rules")), /At least 2 hours/, "what saving writes");
    assert.match(textOf(find(sheet, (n) => classes(n).includes("rec-foot-note"))), /five rules/, "the foot's own line");
    assert.ok(
      find(tree, (n) => classes(n).includes("rec-sheet-backdrop")),
      "the page stays readable under the wash, and takes no press",
    );

    // The fields and what saving writes scroll; the ask, Save and Cancel hold still in the foot.
    const body = find(sheet, (n) => classes(n).includes("rec-sheet-body"));
    const foot = find(sheet, (n) => classes(n).includes("rec-sheet-foot"));
    assert.ok(find(body, (n) => n.props?.id === "bt-lead") && byTestId(body, "rec-fold-says-booking_rules"));
    const held = (f) => [].concat(f.props.children).filter(Boolean);
    assert.deepEqual(
      [held(foot).map((k) => k.type === W.RecordFoot), foot.props["data-asking"]],
      [[true], undefined],
      "Save and Cancel, and no question",
    );
    // Asked, the question holds the foot alone: its two answers where Save and Cancel stood, and the foot says so for
    // kit.css to give the words their room.
    const asking = find(dialogOf(drawFold(bookingRules({ confirm: ask }))), (n) =>
      classes(n).includes("rec-sheet-foot"),
    );
    assert.deepEqual(
      [held(asking).map((k) => k === ask), asking.props["data-asking"]],
      [[true], "true"],
      "the ask in Save's place, never beside it",
    );

    press(byTestId(sheet, "rec-fold-save-booking_rules"));
    press(byTestId(sheet, "rec-fold-cancel-booking_rules"));
    const close = byTestId(sheet, "rec-fold-close-booking_rules");
    assert.equal(close.props["aria-label"], "Close");
    assert.equal(
      close.props["aria-labelledby"],
      `${close.props.id} rec-fold-booking_rules-label`,
      "Close, then the fold's label: a screen reader hears what it closes",
    );
    press(close);
    assert.deepEqual([saved.length, cancelled.length], [1, 2], "Save saves; Cancel and Close both cancel");

    // Closed on a phone it is what it is on a desktop: hidden whole, in its place, and no dialog.
    const closed = drawFold(bookingRules({ open: false }));
    assert.equal(dialogOf(closed), null);
    assert.equal(find(closed, (n) => classes(n).includes("rec-fold")).props.hidden, true);
    assert.equal(
      find(closed, (n) => classes(n).includes("rec-sheet-backdrop")),
      null,
    );
  } finally {
    width.put();
  }
  // And at a desktop's width, nothing about the fold has changed: a group under its row.
  const desk = drawFold(bookingRules());
  assert.equal(dialogOf(desk), null);
  assert.equal(find(desk, (n) => classes(n).includes("rec-fold")).props.role, "group");
});

test("a fold's sheet keeps Tab inside it, and Escape, the head's Close and a press on the wash cancel it, never while it saves", () => {
  const width = atWidth(true);
  const trapped = [];
  const trap = W.trapTab;
  W.trapTab = (e, box) => trapped.push([e.key, box]);
  try {
    const cancelled = [];
    const saved = [];
    let tree = drawFold(bookingRules({ onCancel: () => cancelled.push(1), onSave: () => saved.push(1) }));
    const sheet = dialogOf(tree);
    const box = { contains: () => true };
    const key = (k, over = {}) => ({
      type: "keydown",
      key: k,
      defaultPrevented: false,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      currentTarget: box,
      target: { tag: "a field" },
      preventDefault() {
        this.defaultPrevented = true;
      },
      ...over,
    });
    sheet.props.onKeyDown(key("Tab"));
    assert.deepEqual(trapped, [["Tab", box]], "Tab walks the sheet's own controls, round and round");
    const esc = key("Escape");
    sheet.props.onKeyDown(esc);
    assert.equal(cancelled.length, 1, "Escape inside the sheet cancels");
    W.dispatchEvent(esc);
    assert.equal(cancelled.length, 1, "and the same key reaching the window does not cancel twice");
    W.dispatchEvent(key("Escape"));
    assert.equal(cancelled.length, 2, "with focus outside it (the page's body), the window hears the key");
    W.dispatchEvent(key("Escape", { defaultPrevented: true }));
    assert.equal(cancelled.length, 2, "a key something inside already took is not the sheet's");
    sheet.props.onKeyDown(key("Enter", { ctrlKey: true }));
    assert.equal(saved.length, 1, "Ctrl or Cmd with Enter saves, as a fold's");

    const wash = find(tree, (n) => classes(n).includes("rec-sheet-backdrop"));
    let prevented = false;
    wash.props.onMouseDown({
      preventDefault() {
        prevented = true;
      },
    });
    assert.equal(prevented, true, "a press on the wash keeps focus where it was, as the sheet's does");
    press(wash);
    assert.equal(
      cancelled.length,
      3,
      "and it is the fold's Cancel: reaching for another row asks, when anything was typed",
    );

    // While its save is out, nothing cancels it: not Escape, not the wash, not the head's Close.
    tree = drawFold(bookingRules({ saving: true, onCancel: () => cancelled.push(1) }));
    dialogOf(tree).props.onKeyDown(key("Escape"));
    W.dispatchEvent(key("Escape"));
    press(find(tree, (n) => classes(n).includes("rec-sheet-backdrop")));
    press(byTestId(tree, "rec-fold-close-booking_rules"));
    assert.equal(cancelled.length, 3, "the save is on its way, and nothing says it was thrown away");
    assert.equal(dialogOf(tree).props["aria-busy"], true, "and the sheet says it is busy, as a fold does");

    // Closed, the window's Escape is nobody's: the listener is on only while the sheet is.
    drawFold(bookingRules({ open: false, onCancel: () => cancelled.push(1) }));
    W.dispatchEvent(key("Escape"));
    assert.equal(cancelled.length, 3);
  } finally {
    W.trapTab = trap;
    width.put();
    unmount();
  }
});

test("a fold's sheet hands focus to its first field as it opens, and back to the row's act as it closes", () => {
  const width = atWidth(true);
  const focused = [];
  const stop = (name, cls, inFoot = false) => ({
    name,
    tabIndex: 0,
    disabled: false,
    getClientRects: () => [{}],
    classList: { contains: (c) => c === cls },
    closest: (sel) => (inFoot && sel === ".rec-foot" ? {} : null),
    focus: () => focused.push(name),
  });
  const inner = {
    querySelectorAll: () => [stop("tip", "rec-tip"), stop("field", "rec-input"), stop("save", "btn", true)],
  };
  const act = { focus: () => focused.push("act") };
  const doc = globalThis.document;
  const was = { activeElement: doc.activeElement, querySelector: doc.querySelector };
  try {
    let tree = drawFold(bookingRules({ open: false }));
    // The stub attaches no ref: the test stands in for the sheet React would have put there. The fold's ref is one ref
    // at every width, so the element it names is whichever frame is drawn.
    find(tree, (n) => classes(n).includes("rec-fold")).props.ref.current = {
      querySelector: (sel) => (sel === ".rec-fold-inner" ? inner : null),
      contains: () => false,
    };
    tree = again(() => W.React.createElement(W.RecordFold, bookingRules({ open: true })));
    assert.ok(dialogOf(tree));
    assert.deepEqual(focused, ["field"], "the first field, not the tip before it, not the dialog, not the page behind");
    Object.assign(doc, {
      activeElement: null,
      querySelector: (sel) => (sel === '[data-rec-act="booking_rules"]' ? act : null),
    });
    again(() => W.React.createElement(W.RecordFold, bookingRules({ open: false })));
    assert.deepEqual(focused, ["field", "act"], "focus that went with the sheet comes back to the row's act");
  } finally {
    Object.assign(doc, was);
    width.put();
    unmount();
  }
});

test("a fold's sheet is held by the registry as a fold is, and draws the same hooks in the same order at every width", () => {
  const width = atWidth(true);
  const folds = W.__recordFolds;
  folds.reset();
  let edited = false;
  let hours;
  const seen = [];
  let keep = null;
  // A hook-holding thing drawn after the fold, holding a value it was given after its first draw: it keeps it whatever
  // the fold draws. A fold that held a hook more at one width than the other, or open than closed, throws here as React
  // throws (_hook-frames.mjs).
  const After = () => {
    const [mine, set] = W.React.useState("fresh");
    keep = set;
    seen.push(mine);
    return null;
  };
  const Page = () => {
    hours = W.useRecordFold("hours", { dirty: () => edited });
    return W.React.createElement(
      W.React.Fragment,
      null,
      W.React.createElement(W.RecordFold, {
        ...bookingRules({ id: "hours", label: "Hours" }),
        open: hours.open,
        onCancel: hours.close,
      }),
      W.React.createElement(After),
    );
  };
  const redrawPage = () => again(() => W.React.createElement(Page));
  try {
    let tree = (unmount(), W.React.createElement(Page));
    assert.equal(dialogOf(tree), null, "closed, no sheet");
    keep("after's own");
    seen.length = 0;
    hours.request();
    tree = redrawPage();
    assert.ok(dialogOf(tree), "the registry opens it, and on a phone it is a sheet");
    edited = true;
    assert.equal(W.__settingsUnsaved(), true, "the rail and the browser ask its dirty test, whichever frame drew it");
    width.resize(false);
    tree = redrawPage();
    assert.equal(dialogOf(tree), null);
    width.resize(true);
    tree = redrawPage();
    hours.close();
    tree = redrawPage();
    assert.equal(dialogOf(tree), null);
    assert.deepEqual(
      [...new Set(seen)],
      ["after's own"],
      "closed, open, a phone and a desktop: what comes after the fold reads its own cell every time",
    );
  } finally {
    folds.reset();
    width.put();
    unmount();
  }
});

test('a fold given frame="sheet" is the sheet beside a desktop page too, its row behind it, with the same hooks as closed; the row frame stays the default', () => {
  // Settings › Business draws every fold this way (surfaces/settings/business/gestures/ BtFold): an editor that opened under its
  // row pushed everything under it down. The sheet is the phone's frame, drawn at any width; the row stays in its
  // card behind it, as on a phone; and the fold holds the same hooks whichever frame draws it.
  const folds = W.__recordFolds;
  folds.reset();
  const behind = W.React.createElement("div", { className: "rec-row", "data-testid": "rec-row-hours" }, "Hours");
  let hours;
  const seen = [];
  let keep = null;
  const After = () => {
    const [mine, set] = W.React.useState("fresh");
    keep = set;
    seen.push(mine);
    return null;
  };
  const Page = () => {
    hours = W.useRecordFold("hours", { dirty: () => false });
    return W.React.createElement(
      W.React.Fragment,
      null,
      W.React.createElement(W.RecordFold, {
        ...bookingRules({ id: "hours", label: "Hours", behind, wide: true }),
        frame: "sheet",
        open: hours.open,
        onCancel: hours.close,
      }),
      W.React.createElement(After),
    );
  };
  const redrawPage = () => again(() => W.React.createElement(Page));
  try {
    let tree = (unmount(), W.React.createElement(Page));
    assert.equal(dialogOf(tree), null, "closed: no sheet");
    assert.equal(find(tree, (n) => classes(n).includes("rec-fold")).props.hidden, true, "and the fold hidden whole");
    keep("after's own");
    seen.length = 0;
    hours.request();
    tree = redrawPage();
    const sheet = dialogOf(tree);
    assert.ok(sheet, "open at a desktop's width: a sheet, never a fold under the row");
    assert.deepEqual(
      [sheet.props["data-testid"], sheet.props["aria-modal"], sheet.props["data-wide"]],
      ["rec-fold-hours", true, "true"],
      "the fold's own test id, modal, and wide where the fold is",
    );
    assert.ok(
      find(tree, (n) => n === behind),
      "the row is drawn behind it",
    );
    assert.equal(
      find(sheet, (n) => n === behind),
      null,
      "and not inside it",
    );
    hours.close();
    tree = redrawPage();
    assert.equal(dialogOf(tree), null);
    assert.deepEqual(
      [...new Set(seen)],
      ["after's own"],
      "closed, open and closed again: what comes after the fold reads its own cell every time",
    );
  } finally {
    folds.reset();
    unmount();
  }
  // The row frame is the default, and a desktop's fold is in its place, as the person's page draws it.
  assert.equal(dialogOf(drawFold(bookingRules({ behind }))), null);
  assert.equal(
    find(drawFold(bookingRules({ behind })), (n) => n === behind),
    null,
  );
});

test("a fold open when the window crosses the phone's width is drawn again in the other frame, open, with focus in its first field", () => {
  // The frame is the kit's, and the page's draft is the page's: a width crossed while it is open redraws the one fold
  // in the other frame, still open, and nothing is asked. What was typed is the page's (receptionist/business-tab/page/
  // holds that the draft stays). Focus left with the frame that went, so it goes to the first field of the new one.
  const width = atWidth(true);
  const focused = [];
  const field = {
    tabIndex: 0,
    disabled: false,
    getClientRects: () => [{}],
    classList: { contains: () => false },
    closest: () => null,
    focus: () => focused.push("field"),
  };
  const inner = { querySelectorAll: () => [field] };
  try {
    const props = bookingRules({ open: true });
    let tree = drawFold(props);
    assert.equal(width.listening(), 1, "the fold hears the window's width change");
    const ref = dialogOf(tree).props.ref;
    ref.current = { querySelector: (sel) => (sel === ".rec-fold-inner" ? inner : null), contains: () => true };
    width.resize(false);
    tree = again(() => W.React.createElement(W.RecordFold, props));
    assert.equal(dialogOf(tree), null, "a desktop's fold");
    const fold = find(tree, (n) => classes(n).includes("rec-fold"));
    assert.deepEqual([fold.props["data-open"], fold.props.hidden], ["true", undefined], "and still open");
    assert.deepEqual(focused, ["field"], "focus in its first field");
    width.resize(true);
    tree = again(() => W.React.createElement(W.RecordFold, props));
    assert.ok(dialogOf(tree), "and back to a sheet");
    assert.deepEqual(focused, ["field", "field"]);
    unmount();
    assert.equal(width.listening(), 0, "and stops listening as it goes");
  } finally {
    width.put();
    unmount();
  }
});

test("on a touch screen a fold opens on itself, as a sheet or under its row, and its first field waits for a tap", () => {
  // Ruben, 8 October 2026: a sheet that put a person in its first field as it rose raised the keyboard over what
  // they had not read yet, and the phone moved the page to the field. A touch screen is the pointer (frame-verbs.ts),
  // never the width: the sheet takes focus itself there, as RecordSheet does, and Tab and a tap go on from it. A fold
  // under its row, and an inline editor, open on themselves there too (the 9th: no editor a press opens is an
  // exception); every frame under a mouse keeps its first field.
  const width = atWidth(true);
  const narrow = globalThis.matchMedia;
  let touch = true;
  globalThis.matchMedia = (q) =>
    q === "(pointer: coarse)"
      ? { media: q, matches: touch, addEventListener() {}, removeEventListener() {} }
      : narrow(q);
  const focused = [];
  const field = {
    tabIndex: 0,
    disabled: false,
    getClientRects: () => [{}],
    classList: { contains: () => false },
    closest: () => null,
    focus: () => focused.push("field"),
  };
  const inner = { querySelectorAll: () => [field] };
  const cross = (props) => {
    width.resize(false);
    again(() => W.React.createElement(W.RecordFold, props));
    width.resize(true);
    return again(() => W.React.createElement(W.RecordFold, props));
  };
  try {
    const props = bookingRules({ open: true });
    let tree = drawFold(props);
    assert.equal(dialogOf(tree).props.tabIndex, -1, "the sheet can hold focus itself, and Tab never lands on it");
    dialogOf(tree).props.ref.current = {
      querySelector: (sel) => (sel === ".rec-fold-inner" ? inner : null),
      contains: () => true,
      focus: () => focused.push("sheet"),
    };
    tree = cross(props);
    assert.ok(dialogOf(tree), "a sheet again");
    assert.deepEqual(focused, ["sheet", "sheet"], "under its row and as a sheet, the fold's own box takes focus");
    touch = false;
    cross(props);
    assert.deepEqual(
      focused.slice(2),
      ["field", "field"],
      "a narrow window on a desk has its keys: the field, in both",
    );
  } finally {
    width.put();
    unmount();
  }
});
