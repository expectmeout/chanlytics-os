/**
 * A thumb's pull down on the record kit's sheet.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { unmount, all, find, byTestId, textOf, classes, press } from "../../_stub-react.mjs";
import { W, bookingRules, dialogOf, draw, drawFold, fakeNode, offer, popupOf, redraw, thumb } from "./_record-kit.mjs";

test("touchSwipe reads one way from a thumb's travel: across when it went further across, down only from a scroller's top", () => {
  const went = [];
  const ways = W.touchSwipe({
    onLeft: () => went.push("left"),
    onRight: () => went.push("right"),
    onDown: () => went.push("down"),
  });
  thumb(ways, -120, 6);
  thumb(ways, 140, -4);
  thumb(ways, 8, 120);
  assert.deepEqual(went, ["left", "right", "down"]);
  thumb(ways, -40, 10);
  thumb(ways, 4, 60);
  thumb(ways, 8, -120);
  assert.deepEqual(went, ["left", "right", "down"], "a short drag, and a push up, are nothing");
  // Down through a scrolled body is a scroll back up: the scroller under the finger was not at its top.
  const scrolled = { scrollHeight: 900, clientHeight: 300, scrollTop: 120, parentElement: null };
  thumb(ways, 0, 200, scrolled);
  assert.deepEqual(went, ["left", "right", "down"]);
  thumb(ways, 0, 200, { ...scrolled, scrollTop: 0 });
  assert.deepEqual(went, ["left", "right", "down", "down"], "and from its top, a pull down");
  // `when` gates the pull down alone: a peek walks its pile wherever it is.
  const gated = [];
  const off = W.touchSwipe({ onLeft: () => gated.push("left"), onDown: () => gated.push("down"), when: () => false });
  thumb(off, -120, 0);
  thumb(off, 0, 120);
  assert.deepEqual(gated, ["left"]);
});

test("on a phone a pull down on a sheet from its top is its Close, not while its save is out; beside a desktop page it is not", () => {
  const closed = [];
  const popup = (props = {}) => popupOf(draw(W.RecordSheet, offer({ onClose: () => closed.push(1), ...props }))).props;
  const kitPhone = (fn) => {
    const was = W.matchMedia;
    W.matchMedia = (q) => ({ matches: q === "(max-width: 900px)" });
    try {
      fn();
    } finally {
      W.matchMedia = was;
    }
  };
  kitPhone(() => {
    thumb(popup(), 4, 120);
    assert.deepEqual(closed, [1], "the sheet rose from the bottom, and goes back the way it came");
    thumb(popup({ saving: true }), 4, 120);
    assert.deepEqual(closed, [1], "not while its save is out");
    thumb(popup(), 4, 120, { scrollHeight: 900, clientHeight: 300, scrollTop: 80, parentElement: null });
    assert.deepEqual(closed, [1], "a pull through a scrolled body is a scroll");
  });
  thumb(popup(), 4, 120);
  assert.deepEqual(closed, [1], "beside a desktop page the sheet is not pulled");
  // The fold's sheet, the same way: the pull is its Cancel.
  const cancelled = [];
  kitPhone(() => {
    thumb(dialogOf(drawFold(bookingRules({ onCancel: () => cancelled.push(1) }))).props, 0, 100);
    assert.deepEqual(cancelled, [1]);
    thumb(dialogOf(drawFold(bookingRules({ saving: true, onCancel: () => cancelled.push(1) }))).props, 0, 100);
    assert.deepEqual(cancelled, [1], "and nothing cancels a save on its way");
  });
});

test("a sheet gives focus back as a fold does: to the field the person was in when what held it goes, and to a row the page names", () => {
  // The quality review: the sheet copied the fold's rules in part, and focus that went with what held it (an Undo left
  // where a row was, "Keep editing") came back to the dialog itself, where the fold brings it back to the field the
  // person was in. One rule now, the fold's (record-fold.jsx useRecFocusHold, useRecFocusOn).
  const focused = [];
  // A stand-in for a box: which part of the sheet it is in answers closest(), as the element would.
  const field = (name, part = ".rec-sheet-body", more = {}) => ({
    name,
    tabIndex: 0,
    disabled: false,
    getClientRects: () => [{}],
    classList: { contains: () => false },
    closest: (sel) =>
      sel
        .split(",")
        .map((x) => x.trim())
        .includes(part) || (more.within || []).includes(sel)
        ? {}
        : null,
    focus: () => focused.push(name),
    ...more,
  });
  const search = field("search", ".rec-sheet-tools");
  const nameBox = field("Service 3 name");
  const inPlace = field("Undo in the row's place", ".rec-sheet-body", {
    matches: (sel) => sel === "button:not([role]):not(.rec-input)",
  });
  const keep = field("Keep editing", ".rec-sheet-body", { within: [".confirm"] });
  const tools = { querySelectorAll: () => [search] };
  const stop = (name) => ({
    name,
    tabIndex: 0,
    disabled: false,
    getClientRects: () => [{}],
    focus: () => focused.push(name),
  });
  const row = { querySelectorAll: () => [stop("name"), stop("minutes"), stop("remove")] };
  const panel = {
    focus: () => focused.push("sheet"),
    dataset: {},
    contains: () => true,
    querySelector: (sel) =>
      sel === ".rec-sheet-tools, .rec-sheet-body" ? tools : sel === '[data-rec-row="service-3"]' ? row : null,
  };
  const doc = globalThis.document;
  const was = { activeElement: doc.activeElement, contains: doc.contains };
  const left = new Set();
  doc.contains = (el) => !left.has(el);
  try {
    doc.activeElement = { name: "opener" };
    let tree = draw(W.RecordSheet, offer());
    const sheet = () => popupOf(tree);
    // React calls a callback ref with the element as it mounts; the stub calls none, so this is that moment. Base UI
    // focuses the sheet itself as it opens (the kit's Sheet, initialFocus).
    sheet().props.ref(panel);
    panel.focus();
    assert.deepEqual(focused, ["sheet"], "as it opens, focus is on the dialog, so a screen reader names it");
    doc.activeElement = panel;
    // The person is in Service 3's name, removes the row, and focus is put on the Undo left in its place; the toast's
    // Undo puts the row back, and the Undo in its place goes.
    sheet().props.onFocus({ target: nameBox });
    sheet().props.onFocus({ target: inPlace });
    left.add(inPlace);
    doc.activeElement = null;
    tree = redraw(W.RecordSheet, offer());
    assert.deepEqual(focused, ["sheet", "Service 3 name"], "REGRESSION: it came back to the dialog, not the row's box");
    // "Keep editing" goes with its ask: back to the same box.
    doc.activeElement = nameBox;
    sheet().props.onFocus({ target: keep });
    left.add(keep);
    doc.activeElement = null;
    tree = redraw(W.RecordSheet, offer());
    assert.deepEqual(focused.slice(2), ["Service 3 name"]);
    // Focus the person moved is left where they put it: nothing went, so nothing moves.
    doc.activeElement = null;
    tree = redraw(W.RecordSheet, offer());
    assert.equal(focused.length, 3);
    // With the box they were in gone too, the first field: the search.
    sheet().props.onFocus({ target: nameBox });
    left.add(nameBox);
    tree = redraw(W.RecordSheet, offer());
    assert.deepEqual(focused.slice(3), ["search"]);

    // A row the page names takes focus in its first box, once for each time it is named.
    doc.activeElement = panel;
    tree = redraw(W.RecordSheet, offer({ focusOn: { row: "service-3" } }));
    assert.deepEqual(focused.slice(4), ["name"], "the named row's first box, not its remove");
    const same = { row: "service-3" };
    tree = redraw(W.RecordSheet, offer({ focusOn: same }));
    tree = redraw(W.RecordSheet, offer({ focusOn: same }));
    assert.deepEqual(focused.slice(4), ["name", "name"]);
    tree = redraw(W.RecordSheet, offer({ focusOn: { row: "no-such-row" } }));
    assert.equal(focused.length, 6, "a row that is not there takes nothing");
  } finally {
    Object.assign(doc, was);
    if (was.contains === undefined) delete doc.contains;
  }
});

test("a sheet given a Save draws the fold's own foot, and the ask in its place while one is asked: nothing asks while its save is out; Escape and Close cancel, Ctrl or Cmd with Enter saves", () => {
  // The quality review: the Business tab's sheet built its own foot (RecordFoot, the ask hidden while saving), which a
  // fold's kit owns. The sheet takes RecordFold's foot props, optional, so a sheet with a foot of its own (the playbook
  // composer's) is drawn as it was.
  const saves = [];
  const cancels = [];
  const ask = W.React.createElement("span", { className: "confirm", "data-testid": "ask" }, "Discard your changes?");
  const props = (over = {}) =>
    offer({
      id: "services",
      onClose: () => cancels.push(1),
      onSave: () => saves.push(1),
      saveLabel: "Save 33 services",
      footNote: "Removing one offers an undo.",
      ...over,
    });
  let tree = draw(W.RecordSheet, props());
  const foot = () => find(tree, (n) => classes(n).includes("rec-sheet-foot"));
  assert.equal(textOf(byTestId(foot(), "rec-sheet-save-services")), "Save 33 services");
  assert.match(textOf(foot()), /Removing one offers an undo\./);
  const parts = () =>
    all(foot(), (n) => n.props?.["data-testid"] === "ask" || n.type === W.RecordFoot).map((n) =>
      n.type === W.RecordFoot ? "foot" : "ask",
    );
  assert.deepEqual([parts(), foot().props["data-asking"]], [["foot"], undefined], "Save and Cancel, and no question");
  // Asked, the question stands in Save's and Cancel's place, alone, and the foot says so (kit.css gives it room).
  tree = draw(W.RecordSheet, props({ confirm: ask }));
  assert.deepEqual(
    [parts(), foot().props["data-asking"]],
    [["ask"], "true"],
    "the ask in Save's place, never beside it",
  );
  tree = draw(W.RecordSheet, props());
  press(byTestId(foot(), "rec-sheet-save-services"));
  press(byTestId(foot(), "rec-sheet-cancel-services"));
  assert.deepEqual([saves.length, cancels.length], [1, 1], "Save saves, and Cancel is the sheet's close, with its ask");
  const sheet = () => popupOf(tree);
  const key = (over) => ({
    key: "Enter",
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    currentTarget: { contains: () => true },
    target: {},
    ...over,
  });
  sheet().props.onKeyDown(key({ ctrlKey: true }));
  sheet().props.onKeyDown(key({ metaKey: true }));
  sheet().props.onKeyDown(key({}));
  assert.equal(saves.length, 3, "Ctrl or Cmd with Enter saves, as a fold's does; Enter alone does not");

  // While its save is out: busy, still a button, the ask not drawn, and nothing cancels it.
  tree = draw(W.RecordSheet, props({ saving: true, confirm: ask }));
  assert.equal(sheet().props["aria-busy"], true, "record.css draws its boxes read-only by it, as a fold's");
  const save = byTestId(foot(), "rec-sheet-save-services");
  assert.deepEqual(
    [save.type, save.props.disabled, save.props["aria-disabled"], save.props["aria-busy"], textOf(save)],
    ["button", undefined, true, true, "Saving…"],
  );
  assert.equal(byTestId(foot(), "ask"), null, "nothing asks whether to discard what is on its way");
  press(save);
  press(byTestId(foot(), "rec-sheet-cancel-services"));
  press(find(tree, (n) => n.props?.["aria-label"] === "Close"));
  const esc = {
    key: "Escape",
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
  sheet().props.onKeyDown(esc);
  sheet().props.onKeyDown(key({ ctrlKey: true }));
  assert.deepEqual(
    [saves.length, cancels.length],
    [3, 1],
    "Save, Cancel, Close, Escape and Ctrl+Enter do nothing while it saves",
  );

  // With no Save given, the page's own foot, as the playbook composer draws it: no kit foot, and aria-busy absent.
  tree = draw(W.RecordSheet, offer({ foot: W.React.createElement("button", { type: "button" }, "Start it") }));
  assert.equal(
    find(tree, (n) => n.type === W.RecordFoot),
    null,
  );
  assert.equal(sheet().props["aria-busy"], undefined);
});

test("a row of chips names each thing its value counts, with its measure beside it, and how many more", () => {
  unmount();
  // Children as React hands them, after the props: the stub's createElement sets `children` from these.
  const chipRow = W.React.createElement(W.RecordChips, {
    chips: [
      { label: "Balayage", meta: "180 min" },
      { label: "Haircut", meta: null },
    ],
    more: "+31 more",
  });
  const tree = W.React.createElement(
    W.RecordRow,
    { id: "services", label: "Services", value: "33 on record" },
    chipRow,
  );
  const chips = all(tree, (n) => classes(n).includes("rec-chip"));
  assert.deepEqual(chips.map(textOf), ["Balayage180 min", "Haircut", "+31 more"]);
  assert.deepEqual(
    chips.map((c) => c.props["data-more"]),
    [undefined, undefined, "true"],
  );
  assert.equal(textOf(find(chips[0], (n) => classes(n).includes("rec-chip-meta"))), "180 min");
  assert.equal(
    find(tree, (n) => classes(n).includes("rec-row")).props.className,
    "rec-row rec-row-top",
    "a row with chips under its value is a tall row",
  );
  assert.equal(all(draw(W.RecordChips, { chips: [] }), (n) => classes(n).includes("rec-chip")).length, 0);
});

test("a row of chips caps itself, and says how many it cut in the words it was given", () => {
  // A cap the kit keeps, so every record page gets it: a row of chips that wraps three deep at a phone's width is a
  // paragraph of nouns where the row states one fact. The words for what was cut are still the page's, from its own
  // contracts, and the kit hands them the number it cut.
  const five = [
    "Never quotes a price",
    "Never confirms a booking",
    "Says it's an assistant",
    "No health advice",
    "Looks at photos",
  ];
  const cut = [];
  const tree = draw(W.RecordChips, {
    chips: five.map((label) => ({ label })),
    max: 4,
    more: (n) => {
      cut.push(n);
      return `+${n} more`;
    },
  });
  assert.deepEqual(all(tree, (n) => classes(n).includes("rec-chip")).map(textOf), [...five.slice(0, 4), "+1 more"]);
  assert.deepEqual(cut, [1], "the kit says how many it cut; the words are the page's");
  // Nothing to cut, nothing said.
  const four = draw(W.RecordChips, {
    chips: five.slice(0, 4).map((label) => ({ label })),
    max: 4,
    more: (n) => `+${n} more`,
  });
  assert.deepEqual(
    all(four, (n) => classes(n).includes("rec-chip")).map((c) => c.props["data-more"]),
    [undefined, undefined, undefined, undefined],
  );
  // A page that caps its own list still passes its own words, as the services and the notes do.
  const given = draw(W.RecordChips, { chips: [{ label: "Balayage" }], more: "+31 more" });
  assert.deepEqual(all(given, (n) => classes(n).includes("rec-chip")).map(textOf), ["Balayage", "+31 more"]);
  // Phrases (the rules it keeps) read as one line, a quiet dot between them (kit.css): the variant is the row's class.
  const rowOf = (t) => find(t, (n) => classes(n).includes("rec-chips")).props.className;
  assert.equal(
    rowOf(draw(W.RecordChips, { chips: [{ label: five[1] }], phrases: true })),
    "rec-chips rec-chips-phrases",
  );
  assert.equal(rowOf(given), "rec-chips", "names stay chips");
});

test("a sheet its page lets go of while it is open leaves the way it came, with its wash, from still copies on the body", async () => {
  // The kit's Sheet (useLeavesWhenLetGo): most pages draw a sheet only while it is open, and Base UI's portal goes with
  // it in the same commit, so the copies that play its leaving go on the document's body.
  const doc = globalThis.document;
  const was = doc.body;
  const put = [];
  doc.body = { appendChild: (n) => put.push(n) };
  const wash = fakeNode("div", { class: "sheet-backdrop" });
  const el = fakeNode("section", { class: "sheet" });
  el.parentElement = { querySelector: (sel) => (sel === ".sheet-backdrop" ? wash : null) };
  el.style = { setProperty() {} };
  el.dataset = {};
  try {
    popupOf(draw(W.RecordSheet, offer())).props.ref(el);
    unmount();
    assert.deepEqual(put, [], "not from a frame mounted and let go of at once (StrictMode's check)");
    popupOf(draw(W.RecordSheet, offer())).props.ref(el);
    await new Promise((r) => setTimeout(r, 70));
    unmount();
    assert.deepEqual(
      put.map((n) => [n.attrs.class, n.attrs["data-leaving"], n.attrs["aria-hidden"]]),
      [
        ["sheet-backdrop", "true", "true"],
        ["sheet", "true", "true"],
      ],
      "its wash and the sheet, each a still copy playing its leaving",
    );
  } finally {
    doc.body = was;
  }
});

test('(D) a combobox option is found by the words it goes by and does not show: a zone by its cities ("Miami")', async () => {
  const { zoneSearchWords } = await import("@chanlytics/contracts");
  const zones = ["America/New_York", "America/Chicago", "America/Los_Angeles", "Europe/London"];
  const props = {
    id: "tz-cities",
    label: "Timezone",
    value: "America/Chicago",
    options: zones.map((z) => ({ value: z, label: z.replace(/_/g, " "), also: zoneSearchWords(z) })),
    onChange: () => {},
  };
  const box = (tree) => find(tree, (n) => n.props?.role === "combobox");
  const opts = (tree) => all(tree, (n) => n.props?.role === "option").map((o) => textOf(o));
  let tree = draw(W.RecordCombobox, props);
  for (const [typed, found] of [
    ["Miami", ["America/New York"]],
    ["houston", ["America/Chicago"]],
    ["seattle", ["America/Los Angeles"]],
    ["Manchester", ["Europe/London"]],
    ["new york", ["America/New York"]],
  ]) {
    box(tree).props.onChange({ target: { value: typed } });
    tree = redraw(W.RecordCombobox, props);
    assert.deepEqual(opts(tree), found, typed);
  }
  // What it goes by is searched, never shown: the option says its own name.
  box(tree).props.onChange({ target: { value: "miami" } });
  tree = redraw(W.RecordCombobox, props);
  assert.doesNotMatch(opts(tree).join(" "), /Miami/);
});
