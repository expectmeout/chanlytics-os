/**
 * The inline editor, one fold open at a time, and the sheet.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  again,
  unmount,
  remount,
  settle,
  all,
  find,
  byTestId,
  textOf,
  classes,
  press,
  escapeSheet,
} from "../../_stub-react.mjs";
import { keysDrawn } from "../../_keys.mjs";
import {
  W,
  bookingRules,
  byId,
  draw,
  drawInline,
  kitSheetOf,
  numbers,
  offer,
  popupOf,
  redraw,
  website,
} from "./_record-kit.mjs";

test("an inline editor is the row's label and its field, what saving writes, and Save and Cancel", () => {
  const saved = [];
  const cancelled = [];
  const tree = drawInline(
    website({
      says: "Website: https://marisas.example",
      saysLabel: "It will say",
      onSave: () => saved.push(1),
      onCancel: () => cancelled.push(1),
    }),
  );
  const editor = find(tree, (n) => classes(n).includes("rec-inline"));
  assert.equal(editor.props["data-testid"], "rec-inline-website");
  assert.equal(editor.props.role, "group");
  assert.equal(
    textOf(byId(tree, editor.props["aria-labelledby"])),
    "Website",
    "named by the row's own label, which stays where it was",
  );
  assert.equal(
    find(tree, (n) => classes(n).includes("rec-input")).props["aria-labelledby"],
    "rec-inline-website-key",
    "and the page's field can be named by it too",
  );
  const says = find(tree, (n) => n.props?.["data-testid"] === "rec-inline-says-website");
  assert.equal(
    says.props.id,
    "rec-inline-website-says",
    "what saving writes has the id the page's field is described by",
  );
  assert.equal(says.props["data-inline"], "true");
  assert.deepEqual(
    [textOf(find(says, (n) => classes(n).includes("rec-says-eyebrow"))), textOf(find(says, (n) => n.type === "pre"))],
    ["It will say", "Website: https://marisas.example"],
  );
  press(find(tree, (n) => n.props?.["data-testid"] === "rec-inline-save-website"));
  press(find(tree, (n) => n.props?.["data-testid"] === "rec-inline-cancel-website"));
  assert.deepEqual([saved.length, cancelled.length], [1, 1]);
  // Two small presses where the row's act was, a check and a cross: named by their words for a screen reader and on
  // hover, and never a foot of their own under the box (the row keeps its one line). Their keys, Enter and Esc, were
  // named on the hover until the ? sheet became the one place a key is drawn (Ruben, 23 Sep 2026).
  const save = find(tree, (n) => n.props?.["data-testid"] === "rec-inline-save-website");
  const cancel = find(tree, (n) => n.props?.["data-testid"] === "rec-inline-cancel-website");
  assert.deepEqual(
    [save.props["aria-label"], save.props.title, cancel.props["aria-label"], cancel.props.title],
    ["Save", "Save", "Cancel", "Cancel"],
  );
  assert.deepEqual(keysDrawn(tree), [], "REGRESSION: Save (Enter) and Cancel (Esc) on the presses' hover");
  assert.equal(
    find(tree, (n) => classes(n).includes("rec-foot")),
    null,
    "no foot: the presses are in the act's column",
  );
  assert.ok(
    find(tree, (n) => classes(n).includes("rec-inline-more")),
    "what it will say is a second line, under the box",
  );
  assert.equal(
    find(drawInline(website()), (n) => classes(n).includes("rec-inline-more")),
    null,
    "and with nothing to say the editor is the one line",
  );
  // Closed, it is hidden whole, as a closed fold is: the row is what shows.
  assert.equal(find(drawInline(website({ open: false })), (n) => classes(n).includes("rec-inline")).props.hidden, true);
});

test("what saving writes can say what goes as well as what comes, and a sentence of the page's before them", () => {
  const tree = drawInline(
    website({
      says: "Website: https://marisas.example",
      saysLabel: "It will say",
      gone: "Website: https://marisasbeautysalon.example.com",
      goneLabel: "It will no longer say",
      note: "Saved like this, the receptionist starts being given the details on this page.",
    }),
  );
  const says = find(tree, (n) => n.props?.["data-testid"] === "rec-inline-says-website");
  const parts = all(says, (n) => classes(n).includes("rec-says-part")).map((p) => [
    p.props["data-part"],
    textOf(find(p, (n) => classes(n).includes("rec-says-eyebrow"))),
    textOf(find(p, (n) => n.type === "pre")),
  ]);
  assert.deepEqual(parts, [
    ["says", "It will say", "Website: https://marisas.example"],
    ["gone", "It will no longer say", "Website: https://marisasbeautysalon.example.com"],
  ]);
  assert.match(
    textOf(find(says, (n) => n.props?.["data-testid"] === "rec-inline-says-website-note")),
    /starts being given/,
  );
  // Nothing to say draws nothing: never an empty block.
  assert.equal(
    find(drawInline(website({ says: " ", gone: "" })), (n) => classes(n).includes("rec-says")),
    null,
  );
});

test("an inline editor's keys: Escape cancels, Ctrl or Cmd with Enter saves, and neither while it saves", () => {
  const saved = [];
  const cancelled = [];
  const key = (k, over = {}) => ({
    key: k,
    defaultPrevented: false,
    metaKey: false,
    ctrlKey: false,
    currentTarget: { contains: () => true },
    target: {},
    preventDefault() {
      this.defaultPrevented = true;
    },
    ...over,
  });
  let editor = find(drawInline(website({ onSave: () => saved.push(1), onCancel: () => cancelled.push(1) })), (n) =>
    classes(n).includes("rec-inline"),
  );
  editor.props.onKeyDown(key("Escape"));
  editor.props.onKeyDown(key("Escape", { defaultPrevented: true }));
  editor.props.onKeyDown(key("Enter", { metaKey: true }));
  editor.props.onKeyDown(key("Enter"));
  assert.deepEqual(
    [cancelled.length, saved.length],
    [1, 1],
    "Escape unless a field inside took it; Cmd or Ctrl with Enter; Enter alone does nothing",
  );
  editor.props.onKeyDown(key("Enter", { ctrlKey: true, currentTarget: { contains: () => false } }));
  assert.equal(saved.length, 1, "a key from a sheet drawn inside it is the sheet's");
  editor = find(
    drawInline(website({ saving: true, onSave: () => saved.push(1), onCancel: () => cancelled.push(1) })),
    (n) => classes(n).includes("rec-inline"),
  );
  editor.props.onKeyDown(key("Escape"));
  editor.props.onKeyDown(key("Enter", { ctrlKey: true }));
  assert.deepEqual(
    [cancelled.length, saved.length],
    [1, 1],
    "while it saves, the save is on its way: nothing cancels it and nothing sends it twice",
  );
  // Enter alone, in a box, saves: one value in one box is what Enter has always sent. A textarea keeps it for its
  // newline, a box that took the key first keeps it, and Enter with a modifier that is not Ctrl or Cmd is not a save.
  editor = find(drawInline(website({ onSave: () => saved.push(1), onCancel: () => cancelled.push(1) })), (n) =>
    classes(n).includes("rec-inline"),
  );
  editor.props.onKeyDown(key("Enter", { target: { tagName: "INPUT" } }));
  assert.equal(saved.length, 2, "Enter in the box saves");
  editor.props.onKeyDown(key("Enter", { target: { tagName: "TEXTAREA" } }));
  editor.props.onKeyDown(key("Enter", { target: { tagName: "INPUT" }, defaultPrevented: true }));
  editor.props.onKeyDown(key("Enter", { target: { tagName: "INPUT" }, shiftKey: true }));
  assert.equal(saved.length, 2, "a textarea's Enter, a taken Enter and Shift with Enter send nothing");
});

test("an inline editor's Save stays a button focus rests on while it saves, and neither press acts meanwhile", () => {
  const pressed = [];
  const tree = drawInline(
    website({ saving: true, onSave: () => pressed.push("save"), onCancel: () => pressed.push("cancel") }),
  );
  const save = find(tree, (n) => n.props?.["data-testid"] === "rec-inline-save-website");
  const cancel = find(tree, (n) => n.props?.["data-testid"] === "rec-inline-cancel-website");
  // Not `disabled`: a disabled button lets go of focus, to the page, and a save that failed left it there.
  assert.deepEqual(
    [save.props.disabled, save.props["aria-disabled"], save.props["aria-busy"], save.props["aria-label"]],
    [undefined, true, true, "Saving…"],
  );
  assert.equal(cancel.props["aria-disabled"], true);
  press(save);
  press(cancel);
  assert.deepEqual(pressed, []);
});

test("an inline editor takes focus as it opens, gives it back as it closes, and takes it back when an ask inside it goes", () => {
  const focused = [];
  const box = {
    tabIndex: 0,
    disabled: false,
    value: "https://marisas.example",
    getClientRects: () => [{}],
    classList: { contains: () => false },
    closest: () => null,
    focus: () => focused.push("box"),
    setSelectionRange: (a, b) => focused.push(`caret ${a}-${b}`),
  };
  const body = { querySelectorAll: () => [box] };
  const element = { querySelector: (sel) => (sel === ".rec-inline-body" ? body : null), contains: () => true };
  const ask = W.React.createElement("span", { className: "confirm" }, "Discard your changes?");
  const redrawInline = (props) =>
    again(() =>
      W.React.createElement(W.RecordInline, props, W.React.createElement("input", { className: "rec-input" })),
    );
  let tree = drawInline(website({ open: false }));
  // The stub attaches no ref, so the test stands in for the element React would have put there.
  find(tree, (n) => classes(n).includes("rec-inline")).props.ref.current = element;
  redrawInline(website({ open: true }));
  assert.deepEqual(focused, ["box", "caret 23-23"], "the box, with the caret at the end of what is there");
  const doc = globalThis.document;
  const was = { activeElement: doc.activeElement, querySelector: doc.querySelector, contains: doc.contains };
  // The ask's "Yes" takes focus as it is drawn, and leaves the page when it is answered "Keep editing".
  const yes = { closest: (sel) => (sel === ".confirm" || sel === ".rec-inline-body" ? {} : null) };
  let gone = false;
  Object.assign(doc, {
    activeElement: null,
    contains: (el) => !(gone && el === yes),
    querySelector: (sel) => (sel === '[data-rec-act="website"]' ? { focus: () => focused.push("act") } : null),
  });
  try {
    tree = redrawInline(website({ open: true, confirm: ask }));
    find(tree, (n) => classes(n).includes("rec-inline")).props.onFocus({ target: yes });
    gone = true;
    redrawInline(website({ open: true }));
    assert.deepEqual(
      focused,
      ["box", "caret 23-23", "box", "caret 23-23"],
      "an ask answered with Keep editing gives focus back to the box",
    );
    redrawInline(website({ open: false }));
  } finally {
    Object.assign(doc, was);
    if (was.contains === undefined) delete doc.contains;
  }
  assert.equal(focused.at(-1), "act", "closed, focus comes back to the row's act");
});

test("a row being edited keeps its disagreement on screen, to read, and its press stays with the row", () => {
  const disputed = {
    value: "1200 Maple Ave, Brooklyn, NY 11208, USA",
    source: "verified",
    sentence: "Your receptionist gives 1200 Maple Avenue; Google has you at 1200 Maple Ave, Brooklyn, NY 11208, USA.",
    onUse: () => {},
  };
  const tree = drawInline(website({ id: "address", label: "Address", disputed }));
  const line = find(tree, (n) => classes(n).includes("rec-row-dispute"));
  assert.match(textOf(line), /Google has you at/);
  assert.equal(
    find(line, (n) => n.type === "button"),
    null,
    "nothing to press while the value is being typed",
  );
  // The editor is on the page, hidden, while the row is at rest, so its line must not carry the row's line's id.
  assert.deepEqual(
    all(tree, (n) => n.props?.id === "rec-row-address-other"),
    [],
    "the id is the row's own line's, once in the document",
  );
  const row = draw(W.RecordRow, { id: "address", label: "Address", value: "1200 Maple Avenue", disputed });
  assert.equal(all(row, (n) => n.props?.id === "rec-row-address-other").length, 1);
});

test("an inline editor whose page goes away lets go of the registry, as a fold does", async () => {
  const folds = W.__recordFolds;
  folds.reset();
  folds.request("website", { dirty: () => true });
  drawInline(website());
  unmount();
  await settle();
  assert.deepEqual([folds.open(), W.__settingsUnsaved()], [null, false]);
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

test("a fold whose page goes away lets go; one that comes straight back, or comes back new, holds on", async () => {
  const folds = W.__recordFolds;
  folds.reset();
  folds.request("booking_rules", { dirty: () => true });
  folds.request("notes", { dirty: () => false });
  assert.deepEqual(folds.asking(), { holding: "booking_rules", wants: "notes" });
  const drawFold = () => W.React.createElement(W.RecordFold, bookingRules());
  const unloadAsks = () => {
    const ev = {
      type: "beforeunload",
      returnValue: undefined,
      prevented: false,
      preventDefault() {
        this.prevented = true;
      },
    };
    W.dispatchEvent(ev);
    return ev.prevented;
  };
  draw(W.RecordFold, bookingRules());

  // React's StrictMode check (on in the app, in development) unmounts and remounts every effect at once.
  remount(drawFold);
  await settle();
  assert.equal(folds.open(), "booking_rules", "a fold that comes straight back is not gone");

  // A key change, or a new parent: this instance goes and a new one with the same id comes, in the same commit.
  unmount();
  drawFold();
  await settle();
  assert.equal(folds.open(), "booking_rules", "the fold on the page keeps its place");
  assert.equal(W.__settingsUnsaved(), true, "and the rail's guard");
  assert.equal(unloadAsks(), true, "and the browser's prompt");

  // The rail's "Yes, leave" replaces the pane, and the fold with it.
  unmount();
  await settle();
  assert.equal(W.__settingsUnsaved(), false, "a fold that is gone holds nothing the rail should ask about");
  assert.equal(folds.asking(), null);
  assert.equal(folds.open(), null);
  assert.equal(unloadAsks(), false);
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

test("a page holds its fold through useRecordFold: open, close and the ask come from the registry, and a change redraws it", () => {
  const folds = W.__recordFolds;
  folds.reset();
  let edited = false;
  let hours;
  let notes;
  const Page = () => {
    hours = W.useRecordFold("hours", { dirty: () => edited });
    notes = W.useRecordFold("notes", { dirty: false });
    return null;
  };
  const redrawPage = () => again(() => W.React.createElement(Page));
  draw(Page);
  assert.deepEqual(
    [hours.open, notes.open, hours.asking],
    [false, false, null],
    "nothing is open until it is asked for",
  );

  hours.request();
  assert.equal(folds.open(), "hours");
  // The hook holds what the registry told it: without its subscription, this draw would still say closed.
  redrawPage();
  assert.deepEqual(
    [hours.open, notes.open],
    [true, false],
    "the registry's change redraws the page with its fold open",
  );

  edited = true;
  assert.equal(W.__settingsUnsaved(), true, "the rail's guard is the hook's own dirty test, read when asked");
  notes.request();
  redrawPage();
  assert.deepEqual(
    hours.asking,
    { holding: "hours", wants: "notes" },
    "a dirty fold is asked about before it gives way",
  );
  hours.stay();
  redrawPage();
  assert.deepEqual([hours.open, hours.asking], [true, null], "keep editing");
  notes.request();
  hours.discard();
  redrawPage();
  assert.deepEqual([hours.open, notes.open], [false, true], "discard, and the one asked for opens");
  notes.close();
  redrawPage();
  assert.equal(notes.open, false);
  folds.reset();
});

test("a fold whose save is out never gives way at once: what is asked of it waits, and the save's answer is the answer", () => {
  // A fold judged against the saver's base reads CLEAN the moment its save goes out (the base holds the save as if
  // taken), so its dirty test alone would have closed it under another row's press, its draft gone, and a refused save
  // would have found nothing to put back.
  const folds = W.__recordFolds;
  folds.reset();
  let out = false;
  let hours;
  let notes;
  const Page = () => {
    hours = W.useRecordFold("hours", { dirty: () => false, saving: () => out });
    notes = W.useRecordFold("notes", { dirty: false });
    return null;
  };
  const redrawPage = () => again(() => W.React.createElement(Page));
  draw(Page);
  hours.request();
  out = true;
  assert.deepEqual([folds.dirty(), folds.saving()], [false, true]);
  assert.deepEqual(
    [W.__settingsUnsaved(), W.__settingsSaving()],
    [true, true],
    "the rail is told, and told why, so it asks in words that are true of a save",
  );
  const unload = {
    type: "beforeunload",
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };
  W.dispatchEvent(unload);
  assert.equal(
    unload.prevented,
    true,
    "and the browser is asked to ask: a tab closed over a save may take the request with it",
  );

  assert.equal(notes.request(), false, "the one asked for waits");
  redrawPage();
  assert.deepEqual([hours.open, notes.open], [true, false]);
  assert.deepEqual(hours.asking, { holding: "hours", wants: "notes" }, "the ask is recorded, for the save to answer");
  // Taken: the fold closes itself, and the one asked for opens.
  out = false;
  hours.close();
  redrawPage();
  assert.deepEqual([hours.open, notes.open], [false, true]);
  assert.deepEqual([W.__settingsUnsaved(), W.__settingsSaving()], [false, false]);

  // With no save out, a clean fold gives way at once, as it always did; and a saving test that throws is no save.
  notes.close();
  hours.request();
  assert.equal(notes.request(), true);
  folds.reset();
  unmount();
  const Thrower = () => {
    hours = W.useRecordFold("hours", {
      dirty: false,
      saving: () => {
        throw new Error("no saver");
      },
    });
    return null;
  };
  draw(Thrower);
  hours.request();
  assert.equal(folds.saving(), false);
  // A page gone lets go of its saving test with its dirty test.
  unmount();
  folds.request("hours");
  assert.equal(folds.saving(), false);
  folds.reset();
});

test("while it saves a gesture says it is busy and draws no ask, and each control can be held read-only", () => {
  const ask = W.React.createElement("span", { className: "confirm", "data-testid": "ask" }, "Discard your changes?");
  const foldOf = (tree) => find(tree, (n) => classes(n).includes("rec-fold"));
  let tree = draw(W.RecordFold, bookingRules({ confirm: ask, saving: true }));
  assert.equal(foldOf(tree).props["aria-busy"], true);
  assert.equal(byTestId(tree, "ask"), null, "nothing asks whether to discard a change that is on its way");
  tree = draw(W.RecordFold, bookingRules({ confirm: ask }));
  assert.deepEqual(
    [foldOf(tree).props["aria-busy"], !!byTestId(tree, "ask")],
    [undefined, true],
    "once the save is answered, the ask is drawn",
  );
  tree = drawInline(website({ confirm: ask, saving: true }));
  assert.equal(find(tree, (n) => classes(n).includes("rec-inline")).props["aria-busy"], true);
  assert.equal(byTestId(tree, "ask"), null);

  // A box keeps its words and its focus and takes no typing: read-only, never disabled, which lets go of focus.
  const box = find(
    draw(W.RecordField, { id: "tone", label: "Its voice", value: "Warm.", onChange: () => {}, readOnly: true }),
    (n) => n.type === "input",
  );
  assert.deepEqual([box.props.readOnly, box.props.disabled], [true, undefined]);
  // A switch and a choice say they are not to be pressed, and a press does nothing.
  const flipped = [];
  const sw = find(
    draw(W.RecordSwitch, { on: true, label: "Monday", onChange: (v) => flipped.push(v), readOnly: true }),
    (n) => n.props?.role === "switch",
  );
  press(sw);
  assert.deepEqual([sw.props["aria-disabled"], sw.props.disabled, flipped.length], [true, undefined, 0]);
  press(
    find(
      draw(W.RecordSwitch, { on: true, label: "Monday", onChange: (v) => flipped.push(v) }),
      (n) => n.props?.role === "switch",
    ),
  );
  assert.deepEqual(flipped, [false], "held only while it is told to be");
  const picked = [];
  const group = draw(W.RecordToggleGroup, { ...numbers, onChange: (v) => picked.push(v), readOnly: true });
  const radios = all(group, (n) => n.props?.role === "radio");
  press(radios[1]);
  find(group, (n) => n.props?.role === "radiogroup").props.onKeyDown({
    key: "ArrowRight",
    preventDefault() {},
    currentTarget: { querySelectorAll: () => [] },
  });
  assert.deepEqual(
    [radios.map((r) => r.props["aria-disabled"]), picked],
    [[true, true], []],
    "neither a press nor an arrow chooses",
  );
  // A combobox opens no list.
  const combo = draw(W.RecordCombobox, {
    id: "tz",
    label: "Timezone",
    value: "America/New_York",
    options: [
      { value: "America/New_York", label: "America/New York" },
      { value: "America/Chicago", label: "America/Chicago" },
    ],
    onChange: () => {},
    readOnly: true,
  });
  const input = find(combo, (n) => n.props?.role === "combobox");
  assert.equal(input.props.readOnly, true);
  input.props.onKeyDown({ key: "ArrowDown", preventDefault() {} });
  const after = redraw(W.RecordCombobox, {
    id: "tz",
    label: "Timezone",
    value: "America/New_York",
    options: [
      { value: "America/New_York", label: "America/New York" },
      { value: "America/Chicago", label: "America/Chicago" },
    ],
    onChange: () => {},
    readOnly: true,
  });
  assert.equal(find(after, (n) => n.props?.role === "combobox").props["aria-expanded"], false);
  // And it did not open underneath: the box still shows the chosen zone, not an empty search.
  assert.equal(
    find(after, (n) => n.props?.role === "combobox").props.value,
    "America/New York",
    "REGRESSION: the arrow opened it, and the box went blank",
  );
});

test("a fold's ask is its own: only the section holding the changes is asked, beside them", () => {
  const folds = W.__recordFolds;
  folds.reset();
  let hours;
  let notes;
  // Two sections, as the hook's own example draws them: each renders `{x.asking ? <Confirm/> : null}`.
  const Hours = () => {
    hours = W.useRecordFold("hours", { dirty: true });
    return null;
  };
  const Notes = () => {
    notes = W.useRecordFold("notes", { dirty: false });
    return null;
  };
  const Page = () => W.React.createElement("div", null, W.React.createElement(Hours), W.React.createElement(Notes));
  const redrawPage = () => again(() => W.React.createElement(Page));
  draw(Page);

  hours.request();
  notes.request();
  redrawPage();
  assert.deepEqual(
    hours.asking,
    { holding: "hours", wants: "notes" },
    "the section holding the changes is asked, and told which fold waits",
  );
  assert.equal(notes.asking, null, "the section asked for draws no prompt: it was never open");

  hours.discard();
  redrawPage();
  assert.deepEqual(
    [hours.open, notes.open, hours.asking, notes.asking],
    [false, true, null, null],
    "discard: the one asked for opens, and nobody is asked",
  );

  folds.reset();
  hours.request();
  notes.request();
  hours.stay();
  redrawPage();
  assert.deepEqual(
    [hours.open, notes.open, hours.asking, notes.asking],
    [true, false, null, null],
    "keep editing: it stays open, and nobody is asked",
  );
  folds.reset();
});

test("a page that remounts while its fold is open hands the registry its own dirty test, and an ask stands", () => {
  const folds = W.__recordFolds;
  folds.reset();
  let changed = true;
  let hours;
  // Each drawing of the page answers for itself: its own `dirty`, as a remounted page's own state would.
  const Page = () => {
    const mine = changed;
    hours = W.useRecordFold("hours", { dirty: () => mine });
    return null;
  };
  draw(Page);
  hours.request();
  folds.request("notes", { dirty: () => false });
  assert.deepEqual(folds.asking(), { holding: "hours", wants: "notes" });

  // A key change, or a new parent: this drawing goes and a new one comes, which holds no changes.
  unmount();
  changed = false;
  W.React.createElement(Page);
  assert.deepEqual(folds.asking(), { holding: "hours", wants: "notes" }, "the remount leaves the ask standing");
  assert.equal(W.__settingsUnsaved(), false, "the rail asks the page on screen, not the drawing that went");
  changed = true;
  again(() => W.React.createElement(Page));
  assert.equal(W.__settingsUnsaved(), true, "and follows it as it changes");
  folds.reset();
});

test("a fold opened by its id alone is guarded by the dirty test its hook bound as it mounted, until the hook goes", () => {
  const folds = W.__recordFolds;
  folds.reset();
  let edited = false;
  // A page whose fold is drawn with its hook; something else on the page knows only the fold's id (the Business tab's
  // standing line opens the row it names).
  const Page = () => {
    W.useRecordFold("tone", { dirty: () => edited });
    return null;
  };
  draw(Page);
  folds.request("tone");
  assert.equal(folds.open(), "tone");
  assert.equal(folds.dirty(), false, "clean");
  edited = true;
  assert.equal(folds.dirty(), true, "the registry asks the fold's own test, which no one handed the request");
  assert.equal(W.__settingsUnsaved(), true, "so the Settings rail asks before the pane goes");
  const unload = {
    type: "beforeunload",
    returnValue: undefined,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };
  W.dispatchEvent(unload);
  assert.equal(unload.prevented, true, "and the browser before the tab closes");
  assert.equal(folds.request("notes", { dirty: () => false }), false, "and another fold asked for waits on the answer");
  assert.deepEqual(folds.asking(), { holding: "tone", wants: "notes" });

  // A fold asked for by its id while another holds changes brings its own test when the ask is answered.
  folds.reset();
  folds.request("hours", { dirty: () => true });
  folds.request("tone");
  folds.discard();
  assert.deepEqual([folds.open(), folds.dirty()], ["tone", true], "opened behind the ask, still guarded");

  // Gone from the page, its test is let go: nothing answers for a fold that is not there.
  unmount();
  assert.equal(folds.dirty(), false);
  folds.reset();
  folds.request("tone");
  assert.equal(W.__settingsUnsaved(), false, "a later request by its id finds no test left behind");
  folds.reset();
});

test("a hook binds one dirty test for its life, so a request made after a redraw is let go of when the page goes", async () => {
  const folds = W.__recordFolds;
  folds.reset();
  let edited = false;
  let tone;
  // The hook alone, with no fold drawn: nothing counts this page's fold (drawn()), so the test is all that answers for it.
  const Page = () => {
    tone = W.useRecordFold("tone", { dirty: () => edited });
    return null;
  };
  draw(Page);
  // Every keystroke draws the page again before the row's own act asks for its fold.
  redraw(Page);
  tone.request();
  edited = true;
  assert.equal(W.__settingsUnsaved(), true, "open and edited, it holds changes");
  unmount();
  await settle();
  assert.equal(folds.dirty(), false, "gone, it answers for nothing");
  assert.equal(W.__settingsUnsaved(), false, "and the rail is not asked about a page that is not there");
  folds.reset();
});

test("an ask for a fold that leaves the page goes with it, and the fold holding changes stays open; one that comes back new keeps it", async () => {
  const folds = W.__recordFolds;
  folds.reset();
  // The fold asked for is on the page through its hook; the fold holding changes is open by its id.
  const Wanted = () => {
    W.useRecordFold("notes", { dirty: () => false });
    return null;
  };
  draw(Wanted);
  folds.request("hours", { dirty: () => true });
  folds.request("notes");
  assert.deepEqual(folds.asking(), { holding: "hours", wants: "notes" });

  // A key change, or a new parent: the fold asked for goes and a new one comes in the same commit, and the ask stands.
  unmount();
  W.React.createElement(Wanted);
  await settle();
  assert.deepEqual(folds.asking(), { holding: "hours", wants: "notes" }, "the fold asked for is still on the page");

  // Gone for good. Answered "discard", the ask would have thrown the changes away to open a fold nothing draws.
  let heard = 0;
  const unhear = folds.subscribe(() => {
    heard += 1;
  });
  unmount();
  await settle();
  unhear();
  assert.equal(folds.asking(), null, "the ask goes with the fold it asked for");
  assert.ok(heard > 0, "and the page is told, so the question it drew goes too");
  assert.deepEqual([folds.open(), folds.dirty()], ["hours", true], "the fold holding changes stays open, with them");
  folds.reset();
});

test("a fold whose id is falsy is still a fold, and one listener that throws does not silence the rest", () => {
  const folds = W.__recordFolds;
  folds.reset();
  folds.request(0, { dirty: () => true });
  assert.equal(folds.open(), 0);
  assert.equal(W.__settingsUnsaved(), true, "an open fold with the id 0 holds changes like any other");
  assert.equal(folds.request("notes", { dirty: () => false }), false, "and is asked about before it gives way");

  folds.reset();
  const heard = [];
  const reported = [];
  const was = console.error;
  console.error = (err) => reported.push(err && err.message);
  const stopA = folds.subscribe(() => {
    throw new Error("a page's listener broke");
  });
  const stopB = folds.subscribe(() => heard.push(folds.open()));
  try {
    folds.request("hours", { dirty: () => false });
  } finally {
    console.error = was;
    stopA();
    stopB();
  }
  assert.deepEqual(heard, ["hours"], "the next listener still hears it");
  assert.deepEqual(reported, ["a page's listener broke"], "and the one that broke is reported, not swallowed");
  assert.equal(folds.open(), "hours", "the change itself stands");
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
    const ev = {
      type: "beforeunload",
      returnValue: undefined,
      prevented: false,
      preventDefault() {
        this.prevented = true;
      },
    };
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

test("a sheet is the kit's one sheet: its name, the line under it, its round Close, its tools, rows and a foot that holds still", () => {
  const closed = [];
  const tree = draw(W.RecordSheet, offer({ onClose: () => closed.push(1) }));
  const sheet = kitSheetOf(tree);
  assert.ok(sheet, "drawn by the kit's Sheet, Base UI's Dialog: modal, named by its title and described by its line");
  assert.deepEqual([sheet.props.open, sheet.props.title, sheet.props.sub], [true, "What you offer", offer().sub]);
  const close = find(tree, (n) => classes(n).includes("rec-sheet-close"));
  assert.equal(close.props["aria-label"], "Close");
  press(close);
  assert.equal(closed.length, 1, "its round Close is the sheet's close");

  const saveAll = W.React.createElement("button", { type: "button", onClick: () => {} }, "Save 33 services");
  unmount();
  // Children as React hands them, after the props: the stub's createElement sets `children` from these.
  const full = W.React.createElement(
    W.RecordSheet,
    offer({ id: "services", foot: saveAll, tools: "search" }),
    "row one",
    "row two",
  );
  assert.equal(popupOf(full).props["data-testid"], "rec-sheet-services");
  const foot = find(full, (n) => classes(n).includes("rec-sheet-foot"));
  assert.ok(
    find(foot, (n) => n === saveAll),
    "the foot holds the page's act",
  );
  assert.equal(
    find(
      find(full, (n) => classes(n).includes("rec-sheet-body")),
      (n) => n === saveAll,
    ),
    null,
    "outside the part that scrolls",
  );
  assert.equal(textOf(find(full, (n) => classes(n).includes("rec-sheet-body"))), "row onerow two");
  assert.equal(textOf(find(full, (n) => classes(n).includes("rec-sheet-tools"))), "search");
});

test("Escape and a press on the wash ask the sheet's close, unless something in it took the key; nothing while its save is out", () => {
  // Base UI hears both on the document and asks the kit's Sheet (kit/sheet/sheet.tsx), which asks the page.
  const closed = [];
  const tree = draw(W.RecordSheet, offer({ onClose: () => closed.push(1) }));
  assert.equal(escapeSheet(tree), false);
  assert.equal(closed.length, 1, "Escape asks the page, as its Close does");
  assert.equal(escapeSheet(tree, { taken: true }), true, "a key a combobox inside already took is its own");
  assert.equal(closed.length, 1);
  find(tree, (n) => typeof n.props?.onOpenChange === "function").props.onOpenChange(false, {
    reason: "outside-press",
    event: {},
    cancel() {},
  });
  assert.equal(closed.length, 2, "a press on the wash is the sheet's Close (REGRESSION: the X was the only way out)");
  const saving = draw(W.RecordSheet, offer({ saving: true, onClose: () => closed.push(1) }));
  escapeSheet(saving);
  press(find(saving, (n) => classes(n).includes("rec-sheet-close")));
  assert.equal(closed.length, 2, "the save is on its way, and nothing throws it away");
  assert.equal(find(saving, (n) => classes(n).includes("rec-sheet-close")).props["aria-disabled"], true);
});
