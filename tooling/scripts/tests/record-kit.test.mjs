/**
 * The record kit, EXECUTED on the stub React: the row, the fields, the fold, the inline editor, the registry that keeps
 * one open, and the sheet. No source-text assertions: every claim here is something the kit drew. The kit serves every
 * Settings tab, so it is tested here on its own, and a page's tests live in the page's own file, where a change to the
 * page cannot break these.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { stateOf } from "@chanlytics/contracts";
import {
  installLegacyReact,
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
} from "./_legacy-react.mjs";

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

/**
 * A new tree, drawn as today-page.test.mjs draws one, over the last one unmounted as React replaces a tree: its effects
 * clean up (a fold's hold on the registry among them), its cells are forgotten, and the component is created.
 */
const draw = (Comp, props = {}) => {
  unmount();
  return W.React.createElement(Comp, props);
};
/** The same tree again, over the same hook cells, as React draws it after a state change. */
const redraw = (Comp, props = {}) => again(() => W.React.createElement(Comp, props));
/** Everything in a tree that a press acts on. */
const pressable = (tree) => all(tree, (n) => typeof n.props?.onClick === "function");
const byId = (tree, id) => find(tree, (n) => n.props?.id === id);

/* ------------------------------------ the row ------------------------------------ */

test("a row draws its label, its value and one act", () => {
  const tree = draw(W.RecordRow, {
    label: "Website",
    value: "melanysbeautysalon.com",
    act: { label: "Change", onClick: () => {} },
  });
  assert.match(textOf(tree), /Website/);
  assert.match(textOf(tree), /melanysbeautysalon\.com/);
  assert.match(textOf(tree), /Change/);
  assert.equal(pressable(tree).length, 1, "one act, never two");
});

test("an act's arrow is drawn beside its words, never inside the box a phone clips to a pixel", () => {
  // At a phone's width the act's words are a 1px clipped box for a screen reader (record.css), and an arrow drawn
  // inside it was laid out 40px past the screen's right edge: the Business tab's "Answers on" door at 390px.
  const tree = draw(W.RecordRow, {
    id: "voice_line",
    label: "Answers on",
    value: "+1 (305) 555-0100",
    act: {
      label: "Connections",
      icon: "arrow-right",
      name: "Connections, where the line it answers on is set up",
      onClick: () => {},
    },
  });
  const act = find(tree, (n) => classes(n).includes("rec-row-act"));
  const words = find(act, (n) => classes(n).includes("rec-row-act-words"));
  assert.equal(textOf(words), "Connections");
  assert.equal(
    find(words, (n) => n.type === "Icon"),
    null,
    "nothing but the words in the clipped box",
  );
  const icon = find(act, (n) => classes(n).includes("rec-row-act-icon"));
  assert.equal(find(icon, (n) => n.type === "Icon").props.name, "arrow-right", "the arrow, beside them");
  assert.equal(icon.props["aria-hidden"], "true", "a picture of where it goes, which the act's name already says");
  const kids = [].concat(act.props.children).filter(Boolean);
  assert.ok(kids.indexOf(words) < kids.indexOf(icon), "after the words");
  // An act with no icon draws none.
  const plain = draw(W.RecordRow, {
    id: "website",
    label: "Website",
    value: "x.example",
    act: { label: "Change", onClick: () => {} },
  });
  assert.equal(
    find(plain, (n) => classes(n).includes("rec-row-act-icon")),
    null,
  );
});

test("an empty row says so and keeps its act reachable", () => {
  const tree = draw(W.RecordRow, {
    label: "Website",
    value: null,
    empty: "Not set",
    act: { label: "Add one", onClick: () => {} },
  });
  assert.match(textOf(tree), /Not set/);
  const row = find(tree, (n) => classes(n).includes("rec-row"));
  assert.equal(row.props["data-empty"], "true");
  assert.equal(
    find(row, (n) => classes(n).includes("rec-row-act"))?.type,
    "button",
    "the act is a real button, on the row",
  );
});

test("a fact that is not the owner's says where it came from, quietly; one they typed says nothing", () => {
  const tree = draw(W.RecordRow, { label: "Address", value: "2581 Pitkin Ave", source: "verified" });
  const src = find(tree, (n) => classes(n).includes("rec-src"));
  assert.ok(src, "a source that is not the owner's is said");
  assert.match(textOf(src), /from Google/, "in contracts' words");
  assert.deepEqual(
    all(tree, (n) => classes(n).includes("pill")).map(textOf),
    [],
    "a muted word beside the value, never a bordered pill: a phone wrapped the pill onto a line of its own",
  );
  // "You set this" is every row's default and tells an owner nothing they could act on.
  const typed = draw(W.RecordRow, { label: "Address", value: "2581 Pitkin Ave", source: "typed" });
  assert.ok(!find(typed, (n) => classes(n).includes("rec-src")), "typed draws no source at all");
  assert.equal(textOf(typed).includes(stateOf("fact", "typed").label), false);
  // The four that are not the owner's still are, each in contracts' words.
  for (const source of ["provisioned", "workspace", "absent"]) {
    const row = draw(W.RecordRow, { label: "Answers on", value: "+1 (646) 932-5775", source });
    assert.equal(
      textOf(find(row, (n) => classes(n).includes("rec-src"))),
      stateOf("fact", source).label,
      `${source} is said`,
    );
  }
});

test("a disputed fact wears warn and offers the other answer", () => {
  const used = [];
  const disputed = { value: "2581 Pitkin Ave, Brooklyn, NY 11208, USA", source: "verified", onUse: () => used.push(1) };
  const tree = draw(W.RecordRow, { label: "Address", value: "2581 Pitkin Avenue", source: "typed", disputed });
  assert.match(textOf(tree), /2581 Pitkin Ave, Brooklyn, NY 11208, USA/, "the other answer is on the row");
  assert.deepEqual(
    all(tree, (n) => classes(n).includes("rec-src")).map(textOf),
    [stateOf("fact", "disputed").label, stateOf("fact", "verified").label],
    "the row's own and the other answer's, both in contracts' words",
  );
  assert.equal(
    find(tree, (n) => classes(n).includes("rec-src"))?.props?.["data-tone"],
    "warn",
    "a disagreement is warn, in the ink rather than a panel",
  );
  const use = find(tree, (n) => typeof n.props?.onClick === "function" && /Use Google/i.test(textOf(n)));
  press(use);
  assert.equal(used.length, 1, "the row offers the fill, it does not just record the difference");

  const kept = [];
  const keeping = draw(W.RecordRow, {
    label: "Address",
    value: "2581 Pitkin Avenue",
    source: "typed",
    disputed: { ...disputed, onKeep: () => kept.push(1) },
  });
  press(find(keeping, (n) => typeof n.props?.onClick === "function" && textOf(n) === "Keep mine"));
  assert.equal(kept.length, 1, "and keeping yours is a press too");
});

test("something wrong is on its row at full strength: a serious disagreement, or a sentence the page names", () => {
  const rowOf = (tree) => find(tree, (n) => classes(n).includes("rec-row"));
  assert.equal(
    rowOf(draw(W.RecordRow, { label: "Website", value: "melanys.com" })).props["data-state"],
    undefined,
    "nothing wrong, no state",
  );
  // Severity is factConflicts' (contracts facts.ts), and it is about the customer: the published number that does not
  // reach the receptionist is serious; an address written two ways is minor.
  const serious = { value: "+1 (308) 336-8109", source: "provisioned", severity: "serious", onUse: () => {} };
  assert.equal(
    rowOf(
      draw(W.RecordRow, {
        label: "Tells customers to call",
        value: "+1 (646) 932-5775",
        source: "typed",
        disputed: serious,
      }),
    ).props["data-state"],
    "warn",
    "a serious disagreement is a person's to settle, and the row says so",
  );

  const sentence = "Without a booking link it has nowhere to send anyone who asks to book.";
  const tree = draw(W.RecordRow, {
    id: "booking_link",
    label: "Booking link",
    value: null,
    empty: "Not set",
    wrong: sentence,
    act: { label: "Add one", onClick: () => {} },
  });
  const row = rowOf(tree);
  assert.equal(row.props["data-state"], "warn", "a fact that is missing and needed is drawn the same way");
  assert.equal(textOf(find(row, (n) => classes(n).includes("rec-row-wrong"))), sentence, "in the page's own words");
  const act = find(tree, (n) => classes(n).includes("rec-row-act"));
  assert.equal(
    textOf(byId(tree, act.props["aria-describedby"])),
    sentence,
    "and the act that fixes it is described by it",
  );
});

test("a minor disagreement keeps its warn word and its line, and leaves the row as it is", () => {
  const minor = {
    value: "2581 Pitkin Ave, Brooklyn, NY 11208, USA",
    source: "verified",
    severity: "minor",
    onUse: () => {},
  };
  const tree = draw(W.RecordRow, {
    label: "Address",
    value: "2581 Pitkin Avenue",
    source: "typed",
    disputed: minor,
    act: { label: "Change", onClick: () => {} },
  });
  const row = find(tree, (n) => classes(n).includes("rec-row"));
  assert.equal(
    find(row, (n) => classes(n).includes("rec-src"))?.props?.["data-tone"],
    "warn",
    "the warn word, at full strength",
  );
  assert.match(
    textOf(find(row, (n) => classes(n).includes("rec-row-dispute"))),
    /2581 Pitkin Ave, Brooklyn, NY 11208, USA/,
    "and the line with the other answer",
  );
  // What draws an act at rest in record.css is the row's warn state or its being empty; this row has neither, so its
  // act waits to be approached like any other.
  assert.equal(row.props["data-state"], undefined, "no warn wash on the row");
  assert.equal(row.props["data-empty"], "false");
});

test("a disagreement with nothing to take it is a line to read, and offers no press", () => {
  // A role that may not settle it, or an answer that is information rather than a fill (the workspace's own name):
  // the page passes no onUse, and the kit draws no button that could only refuse.
  const sentence =
    "Your receptionist introduces the business as Melany's Beauty Salon; this workspace is named Billing probe.";
  const read = { value: "Billing probe", source: "workspace", severity: "minor", sentence };
  const tree = draw(W.RecordRow, {
    id: "name",
    label: "Name",
    value: "Melany's Beauty Salon",
    source: "typed",
    disputed: read,
  });
  const line = find(tree, (n) => classes(n).includes("rec-row-dispute"));
  assert.equal(textOf(line), sentence, "the disagreement is on the row, whole");
  assert.equal(
    find(tree, (n) => classes(n).includes("rec-src"))?.props?.["data-tone"],
    "warn",
    "and wears its warn ink",
  );
  assert.equal(
    find(line, (n) => n.type === "button"),
    null,
    "with no press at all",
  );
  assert.equal(
    find(line, (n) => classes(n).includes("rec-row-dispute-acts")),
    null,
    "nor an empty place for one",
  );
  // Given only a way to keep it, that is the one press.
  const kept = draw(W.RecordRow, {
    id: "name",
    label: "Name",
    value: "Melany's Beauty Salon",
    source: "typed",
    disputed: { ...read, onKeep: () => {} },
  });
  assert.deepEqual(all(kept, (n) => n.type === "button" && classes(n).includes("btn")).map(textOf), ["Keep mine"]);
});

test("an act says which row it acts on, and a gate's refusal replaces its press", () => {
  const pressed = [];
  const refused = [];
  const gate = { "aria-disabled": true, "data-tip": "Only an owner can change this.", onClick: () => refused.push(1) };
  const tree = draw(W.RecordRow, {
    id: "website",
    label: "Website",
    value: "melanys.com",
    act: { label: "Change", onClick: () => pressed.push(1), gate },
  });
  assert.ok(
    find(tree, (n) => n.props?.["data-testid"] === "rec-row-website"),
    "the row carries its id",
  );
  const act = find(tree, (n) => n.props?.["data-testid"] === "rec-row-act-website");
  const name = act.props["aria-labelledby"]
    .split(" ")
    .map((id) => textOf(byId(tree, id)))
    .join(" ");
  assert.equal(name, "Change Website", "a screen reader hears which Change this is");
  assert.equal(act.props["aria-disabled"], true, "a refused act stays on the page and in the tab order");
  press(act);
  assert.deepEqual(
    [pressed.length, refused.length],
    [0, 1],
    "the gate is spread after the handler, so its refusal wins",
  );
});

test("an act the page names itself is called that, and its words and the row's label no longer make its name", () => {
  const tree = draw(W.RecordRow, {
    id: "handoff_number",
    label: "Transfers a caller to",
    value: "+1 (786) 555-0182",
    act: { label: "Change", onClick: () => {}, name: "Change the transfer number" },
  });
  const act = find(tree, (n) => n.props?.["data-testid"] === "rec-row-act-handoff_number");
  assert.equal(act.props["aria-label"], "Change the transfer number", 'not "Change Transfers a caller to"');
  assert.equal(act.props["aria-labelledby"], undefined, "one name, not two");
  assert.equal(act.props["data-rec-act"], "handoff_number", "and focus still comes back to it as a fold closes");
});

/* ------------------------------------ the fields ------------------------------------ */

test("a field carries its label, its unit and its refusal, wired for a screen reader", () => {
  const tree = draw(W.RecordField, {
    label: "Least notice",
    unit: "hours",
    value: "2",
    onChange: () => {},
    hint: "Empty means no rule.",
    id: "lead",
  });
  assert.match(textOf(tree), /Least notice/);
  assert.match(textOf(tree), /hours/);
  assert.match(textOf(tree), /Empty means no rule\./);

  const typed = [];
  const bad = draw(W.RecordField, {
    label: "Booking link",
    value: "booksy",
    onChange: (v) => typed.push(v),
    problem: "Needs a full web address, starting with https://",
    hint: "Sent instead of confirming.",
    id: "link",
  });
  const input = find(bad, (n) => classes(n).includes("rec-input"));
  assert.equal(input.props["aria-invalid"], true);
  assert.equal(input.props["aria-describedby"], "rec-link-problem");
  assert.match(
    textOf(byId(bad, "rec-link-problem")),
    /starting with https/,
    "the sentence the box names is the one drawn",
  );
  assert.doesNotMatch(textOf(bad), /Sent instead/, "a hint gives way to what is wrong");
  assert.ok(
    find(
      find(bad, (n) => n.type === "label"),
      (n) => n === input,
    ),
    "the label holds its box, so the box is named by it",
  );
  input.props.onChange({ target: { value: "https://booksy.com" } });
  assert.deepEqual(typed, ["https://booksy.com"], "a keystroke hands the page the words, not the event");
});

test("fields given no id still name their own sentences, and a combobox its own list", () => {
  // Two of each on one page, none given an id: React.useId names each, where "rec-undefined-problem" named them all.
  const Page = () =>
    W.React.createElement(
      "div",
      null,
      W.React.createElement(W.RecordField, {
        label: "Opens",
        value: "9",
        onChange: () => {},
        problem: "Needs a time.",
      }),
      W.React.createElement(W.RecordField, {
        label: "Closes",
        value: "5",
        onChange: () => {},
        problem: "Needs a time too.",
      }),
      W.React.createElement(W.RecordCombobox, { label: "Timezone", value: null, options: [], onChange: () => {} }),
      W.React.createElement(W.RecordCombobox, {
        label: "Also a timezone",
        value: null,
        options: [],
        onChange: () => {},
      }),
    );
  const tree = draw(Page);
  const boxes = all(tree, (n) => classes(n).includes("rec-input"));
  const described = boxes.map((b) => b.props["aria-describedby"]);
  assert.notEqual(described[0], described[1], "each box names its own sentence");
  assert.deepEqual(
    described.map((id) => textOf(byId(tree, id))).map((t) => t.trim()),
    ["Needs a time.", "Needs a time too."],
  );
  assert.ok(described.every((id) => !id.includes("undefined")));
  const lists = all(tree, (n) => n.props?.role === "combobox").map((c) => c.props["aria-controls"]);
  assert.notEqual(lists[0], lists[1], "each combobox names its own list");
  assert.deepEqual(
    lists.map((id) => byId(tree, id)?.props.role),
    ["listbox", "listbox"],
  );
});

test("a field keeps the page's own class and description beside its own", () => {
  const tree = draw(W.RecordField, {
    id: "lead",
    label: "Least notice",
    value: "2",
    onChange: () => {},
    hint: "Empty means no rule.",
    className: "tabular",
    "aria-describedby": "lead-consequence",
  });
  const box = find(tree, (n) => n.type === "input");
  assert.deepEqual(classes(box), ["rec-input", "tabular"]);
  assert.equal(
    box.props["aria-describedby"],
    "rec-lead-hint lead-consequence",
    "the hint, and the page's consequence line",
  );
});

test("a box in a row of a list carries its own name and its sentence, needs no hook, and refuses to be nameless", () => {
  // The week's time boxes and the closed days' rows were raw inputs wired by hand, three times over, and the list's
  // header (From · Until · Why) is not read out: a box in a row is named for its row ("Closed from, row 2").
  const typed = [];
  let tree = draw(W.RecordBox, {
    id: "closure-1-date",
    label: "Closed from, row 2",
    type: "date",
    value: "2099-12-24",
    onChange: (v) => typed.push(v),
    problem: "That date is not on the calendar.",
  });
  const input = find(tree, (n) => n.type === "input");
  assert.deepEqual(
    [input.props.id, input.props.type, input.props["aria-label"], input.props.value, classes(input)],
    ["closure-1-date", "date", "Closed from, row 2", "2099-12-24", ["rec-input"]],
  );
  input.props.onChange({ target: { value: "2099-12-26" } });
  assert.deepEqual(typed, ["2099-12-26"], "onChange hands the page the words, as RecordField's does");
  // The sentence is under the box, and the box is wrong by it.
  const said = byId(tree, "rec-closure-1-date-problem");
  assert.equal(textOf(said), "That date is not on the calendar.");
  assert.deepEqual(
    [input.props["aria-invalid"], input.props["aria-describedby"]],
    [true, "rec-closure-1-date-problem"],
  );
  // No hook: the stub keeps one order of cells, and none is taken.
  assert.equal(
    all(tree, (n) => typeof n.type === "function").length,
    2,
    "the box and its FieldError, nothing that asks React for a name",
  );

  // A box wrong by a sentence drawn ELSEWHERE (a day's two boxes share one): marked, described, nothing drawn.
  tree = draw(W.RecordBox, {
    id: "hours-mon-1-open",
    label: "Monday opens, second shift",
    type: "time",
    size: "sm",
    value: "14:00",
    onChange: () => {},
    invalid: "bt-hours-mon-problem",
    className: "bt-time",
    readOnly: true,
  });
  const box = find(tree, (n) => n.type === "input");
  assert.deepEqual(
    [box.props["aria-invalid"], box.props["aria-describedby"], box.props.readOnly, box.props.type, classes(box)],
    [true, "bt-hours-mon-problem", true, "time", ["rec-input", "bt-time"]],
  );
  assert.equal(
    find(tree, (n) => n.type === W.FieldError),
    null,
  );
  assert.equal(
    find(tree, (n) => classes(n).includes("rec-box")).props["data-size"],
    "sm",
    "the small variant, at the width of a time",
  );

  // Nothing wrong, nothing said; a unit, as RecordField draws one; the page's own description joins the box's.
  tree = draw(W.RecordBox, {
    id: "service-0-minutes",
    label: "Balayage, minutes",
    unit: "min",
    value: "180",
    onChange: () => {},
    "aria-describedby": "svc-note",
  });
  assert.deepEqual(
    [
      find(tree, (n) => n.type === "input").props["aria-invalid"],
      find(tree, (n) => n.type === "input").props["aria-describedby"],
    ],
    [undefined, "svc-note"],
  );
  assert.equal(textOf(find(tree, (n) => classes(n).includes("rec-input-unit"))), "min");
  assert.throws(
    () => draw(W.RecordBox, { label: "nameless", value: "", onChange: () => {} }),
    (e) => e instanceof TypeError && /needs an id/.test(e.message),
  );
});

test("a box in a row of a list is a textarea when its words run to sentences, named and wired as the input is, and hookless", () => {
  // A note's text and a message sent in the business's name are rows of a list that come and go, so they are boxes
  // with no hook; their words run to lines, so the box is a textarea.
  const typed = [];
  const tree = draw(W.RecordBox, {
    id: "note-1-text",
    label: "Note 2, what it says",
    rows: 3,
    value: "Behind the building.",
    onChange: (v) => typed.push(v),
    problem: "Each note needs both a title and the text to say.",
    readOnly: true,
    placeholder: "What it says",
  });
  const box = find(tree, (n) => n.type === "textarea");
  assert.ok(box, "a textarea");
  assert.equal(
    find(tree, (n) => n.type === "input"),
    null,
    "and no input beside it",
  );
  assert.deepEqual(
    [
      box.props.id,
      box.props.rows,
      box.props["aria-label"],
      box.props.value,
      box.props.readOnly,
      box.props.placeholder,
      classes(box),
      box.props.type,
    ],
    ["note-1-text", 3, "Note 2, what it says", "Behind the building.", true, "What it says", ["rec-input"], undefined],
  );
  assert.deepEqual([box.props["aria-invalid"], box.props["aria-describedby"]], [true, "rec-note-1-text-problem"]);
  assert.equal(textOf(byId(tree, "rec-note-1-text-problem")), "Each note needs both a title and the text to say.");
  box.props.onChange({ target: { value: "Behind the building, on the left." } });
  assert.deepEqual(typed, ["Behind the building, on the left."]);
  assert.equal(all(tree, (n) => typeof n.type === "function").length, 2, "the box and its FieldError: no hook");
  // Without rows it is the input it always was.
  assert.equal(
    find(
      draw(W.RecordBox, { id: "note-1-title", label: "Note 2 title", value: "", onChange: () => {} }),
      (n) => n.type === "textarea",
    ),
    null,
  );
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

const numbers = {
  label: "The number to publish",
  value: "line",
  options: [
    { value: "line", label: "Your line" },
    { value: "other", label: "A different number" },
  ],
};

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
  assert.deepEqual(
    all(tree, (n) => n.props?.role === "radio").map((o) => o.props.tabIndex),
    [0, -1],
    "Tab lands on the chosen one only",
  );
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
  assert.deepEqual(
    opts(tree).map((o) => textOf(o)),
    ["America/New York7:23 PM", "America/North Dakota/New Salem6:23 PM"],
    "only what matches, each with its meta",
  );
  assert.equal(
    box(tree).props["aria-controls"],
    find(tree, (n) => n.props?.role === "listbox").props.id,
    "the box names its list",
  );
  assert.equal(
    box(tree).props["aria-activedescendant"],
    opts(tree)[0].props.id,
    "the first match is the one Enter would take",
  );

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
  const esc = {
    key: "Escape",
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
  box(tree).props.onKeyDown(esc);
  tree = redraw(W.RecordCombobox, props);
  assert.equal(box(tree).props["aria-expanded"], false, "Escape closes it");
  assert.equal(esc.defaultPrevented, true, "and says so, so a fold or a sheet around it does not close as well");
  assert.deepEqual(picked, ["America/North_Dakota/New_Salem"], "without taking anything");

  box(tree).props.onChange({ target: { value: "lon" } });
  tree = redraw(W.RecordCombobox, props);
  let held = false;
  find(tree, (n) => n.props?.role === "listbox").props.onMouseDown({
    preventDefault() {
      held = true;
    },
  });
  press(opts(tree)[0]);
  assert.equal(held, true, "a pointer on the list, an option or its scroll, keeps focus in the box");
  assert.deepEqual(picked, ["America/North_Dakota/New_Salem", "Europe/London"], "and a press takes it");
});

test("a combobox searches what is typed onto its chosen label, and its list is never a tab stop", () => {
  const props = {
    id: "tz2",
    label: "Timezone",
    value: "America/Chicago",
    options: [
      { value: "America/Chicago", label: "America/Chicago" },
      { value: "Europe/London", label: "Europe/London" },
      { value: "Europe/Lisbon", label: "Europe/Lisbon" },
    ],
    onChange: () => {},
  };
  const box = (tree) => find(tree, (n) => n.props?.role === "combobox");
  let tree = draw(W.RecordCombobox, props);
  // Closed, the box shows the chosen label. Focus selects it, so the first keystroke replaces it.
  const selected = [];
  box(tree).props.onFocus({ target: { select: () => selected.push("all") } });
  assert.deepEqual(selected, ["all"]);
  // A click that focuses the box would put the caret where it landed, undoing that; its mouseup is held.
  const doc = globalThis.document;
  const was = doc.activeElement;
  const input = { tag: "the box" };
  let held = false;
  try {
    doc.activeElement = null;
    box(tree).props.onMouseDown({ currentTarget: input });
    box(tree).props.onMouseUp({
      preventDefault() {
        held = true;
      },
    });
  } finally {
    doc.activeElement = was;
  }
  assert.equal(held, true, "the click that focused it keeps the label selected");
  // A caret moved into the label anyway: what the browser hands onChange is the label with the typing in it.
  box(tree).props.onChange({ target: { value: "America/ChicagoLon" } });
  tree = redraw(W.RecordCombobox, props);
  assert.equal(box(tree).props.value, "Lon", "what was typed is the search, not the label with it appended");
  assert.equal(box(tree).props["aria-expanded"], true);
  assert.deepEqual(
    all(tree, (n) => n.props?.role === "option").map((o) => textOf(o)),
    ["Europe/London"],
  );
  // A list that scrolls is a tab stop in Chrome unless it says otherwise, and Tab would leave the box for it.
  const list = find(tree, (n) => n.props?.role === "listbox");
  assert.equal(list.props.tabIndex, -1);
  assert.equal(
    all(tree, (n) => n.props?.role === "option" && typeof n.props.onMouseDown === "function").length,
    0,
    "the list holds the pointer, not each option",
  );
});

test("a combobox that adds can offer what is typed after the matches, and the page's keys come first", () => {
  const picked = [];
  const keys = [];
  const chosen = ["English"];
  const props = {
    id: "langs",
    label: "Add a language",
    value: null,
    options: [
      { value: "Spanish", label: "Spanish" },
      { value: "Portuguese", label: "Portuguese" },
    ],
    onChange: (v) => picked.push(v),
    // The page's rule for what may be taken as typed: not a name already chosen or already offered.
    typed: (words) =>
      chosen.concat(["Spanish", "Portuguese"]).some((l) => l.toLowerCase() === words.toLowerCase())
        ? null
        : { value: words, label: `Add “${words}”` },
    onKeyDown: (e) => {
      keys.push(e.key);
      if (e.key === "Backspace" && e.target.value === "") e.preventDefault();
    },
  };
  const box = (tree) => find(tree, (n) => n.props?.role === "combobox");
  const opts = (tree) => all(tree, (n) => n.props?.role === "option").map((o) => textOf(o));
  let tree = draw(W.RecordCombobox, props);
  box(tree).props.onChange({ target: { value: "Xhosa" } });
  tree = redraw(W.RecordCombobox, props);
  assert.deepEqual(opts(tree), ["Add “Xhosa”"], "nothing matches, so what is typed is the one option");
  assert.equal(box(tree).props["aria-expanded"], true);
  box(tree).props.onKeyDown({
    key: "Enter",
    target: { value: "Xhosa" },
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  });
  assert.deepEqual(picked, ["Xhosa"], "Enter takes it, as it takes any option");
  tree = redraw(W.RecordCombobox, props);
  box(tree).props.onChange({ target: { value: "Po" } });
  tree = redraw(W.RecordCombobox, props);
  assert.deepEqual(opts(tree), ["Portuguese", "Add “Po”"], "after the matches, never before them");
  box(tree).props.onChange({ target: { value: "spanish" } });
  tree = redraw(W.RecordCombobox, props);
  assert.deepEqual(opts(tree), ["Spanish"], "a name the page says it holds is not offered twice");
  // The page's keys first: a key it takes goes no further, and one it leaves is the box's.
  const back = {
    key: "Backspace",
    target: { value: "" },
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
  box(tree).props.onKeyDown(back);
  assert.equal(back.defaultPrevented, true);
  const esc = {
    key: "Escape",
    target: { value: "spanish" },
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
  box(tree).props.onKeyDown(esc);
  tree = redraw(W.RecordCombobox, props);
  assert.equal(box(tree).props["aria-expanded"], false, "Escape, which the page left, still closes the list");
  assert.deepEqual(keys, ["Enter", "Backspace", "Escape"]);
  // Refused, the box takes no key, the page's included.
  tree = draw(W.RecordCombobox, { ...props, readOnly: true });
  box(tree).props.onKeyDown({ key: "Backspace", target: { value: "" }, defaultPrevented: false, preventDefault() {} });
  assert.deepEqual(keys, ["Enter", "Backspace", "Escape"], "not while the box is read-only");
  // Given no `typed`, nothing that is not an option is offered.
  tree = draw(W.RecordCombobox, { ...props, typed: null });
  box(tree).props.onChange({ target: { value: "Xhosa" } });
  tree = redraw(W.RecordCombobox, { ...props, typed: null });
  assert.deepEqual(opts(tree), []);
  assert.equal(box(tree).props["aria-expanded"], false);
});

test("a combobox left with words in it hands them to the page, and one given no onLeave throws them away as it did", () => {
  // The old form's language box added what was typed when it lost focus; a combobox that closed over the words lost
  // them, and the fold saved without the language that was typed.
  const left = [];
  const picked = [];
  const props = {
    id: "langs-leave",
    label: "Add a language",
    value: null,
    options: [{ value: "Spanish", label: "Spanish" }],
    onChange: (v) => picked.push(v),
    onLeave: (words) => left.push(words),
  };
  const box = (tree) => find(tree, (n) => n.props?.role === "combobox");
  let tree = draw(W.RecordCombobox, props);
  box(tree).props.onBlur();
  assert.deepEqual(left, [], "an empty box hands nothing over");
  box(tree).props.onChange({ target: { value: "  Xhosa " } });
  tree = redraw(W.RecordCombobox, props);
  box(tree).props.onBlur();
  tree = redraw(W.RecordCombobox, props);
  assert.deepEqual(left, ["Xhosa"], "the words, trimmed");
  assert.deepEqual(
    [box(tree).props["aria-expanded"], box(tree).props.value],
    [false, ""],
    "and the box closes and clears, as it did",
  );
  // An option taken is not handed over again as it goes: Enter took it, and the box is empty when focus leaves.
  box(tree).props.onChange({ target: { value: "Spa" } });
  tree = redraw(W.RecordCombobox, props);
  box(tree).props.onKeyDown({
    key: "Enter",
    target: { value: "Spa" },
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  });
  tree = redraw(W.RecordCombobox, props);
  box(tree).props.onBlur();
  assert.deepEqual([picked, left], [["Spanish"], ["Xhosa"]]);
  // Refused, it hands nothing over: nothing is typed into a box that is read-only.
  tree = draw(W.RecordCombobox, { ...props, readOnly: true });
  box(tree).props.onChange({ target: { value: "Zulu" } });
  tree = redraw(W.RecordCombobox, { ...props, readOnly: true });
  box(tree).props.onBlur();
  assert.deepEqual(left, ["Xhosa"]);
  // Given no onLeave (the timezone's box), leaving throws the words away, as it always did.
  const quiet = { ...props, onLeave: undefined };
  tree = draw(W.RecordCombobox, quiet);
  box(tree).props.onChange({ target: { value: "Chicago" } });
  tree = redraw(W.RecordCombobox, quiet);
  assert.doesNotThrow(() => box(tree).props.onBlur());
  tree = redraw(W.RecordCombobox, quiet);
  assert.deepEqual([box(tree).props["aria-expanded"], box(tree).props.value, picked], [false, "", ["Spanish"]]);
});

test("a tip you cannot click is a chip; one you can is a card", () => {
  const chip = draw(W.RecordTip, { text: "Call audio is not included.", label: "What the file holds" });
  const btn = find(chip, (n) => n.props?.["data-tip"]);
  assert.equal(btn.type, "button");
  assert.equal(btn.props["aria-label"], "What the file holds");
  assert.equal(
    btn.props["aria-description"],
    "Call audio is not included.",
    "a screen reader hears what the tip says, too",
  );
  assert.ok(!find(chip, (n) => classes(n).includes("rec-card-tip")), "a chip is not a card");
  const shown = [];
  const tip = W.__tip;
  W.__tip = { show: (el) => shown.push(el) };
  const el = { tag: "the mark" };
  btn.props.onClick({ currentTarget: el, stopPropagation() {}, preventDefault() {} });
  W.__tip = tip;
  assert.deepEqual(shown, [el], "a press shows it at the mark, which is how a finger reads it");

  const used = [];
  const card = draw(W.RecordTipCard, {
    title: "Google's address",
    body: "2581 Pitkin Ave, Brooklyn, NY 11208, USA",
    act: { label: "Use it", onClick: () => used.push(1) },
  });
  assert.ok(
    find(card, (n) => classes(n).includes("rec-card-tip")),
    "a card is the white card",
  );
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
  let tree = draw(W.RecordFold, bookingRules({ open: false }));
  // The stub attaches no ref, so the test stands in for the element React would have put there.
  find(tree, (n) => classes(n).includes("rec-fold")).props.ref.current = {
    querySelector: (sel) => (sel === ".rec-fold-inner" ? inner : null),
    contains: () => false,
  };
  tree = redraw(W.RecordFold, bookingRules({ open: true }));
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
  const remove = { ...field("remove the second shift"), matches: (sel) => sel === "button:not([role])" };
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
  let tree = draw(W.RecordFold, bookingRules({ open: true }));
  find(tree, (n) => classes(n).includes("rec-fold")).props.ref.current = {
    querySelector: (sel) => {
      asked.push(sel);
      return sel === '[data-rec-row="hours-mon-1"]' ? row : null;
    },
    contains: () => true,
  };
  tree = redraw(W.RecordFold, bookingRules({ open: true, focusOn: { row: "hours-mon-1" } }));
  assert.deepEqual(focused, ["opens"], "the new row's first box, not Add and not its remove");
  assert.ok(asked.includes('[data-rec-row="hours-mon-1"]'));
  const same = { row: "hours-mon-1" };
  tree = redraw(W.RecordFold, bookingRules({ open: true, focusOn: same }));
  tree = redraw(W.RecordFold, bookingRules({ open: true, focusOn: same }));
  assert.deepEqual(focused, ["opens", "opens"], "once for each row given, however often the fold is drawn");
  tree = redraw(W.RecordFold, bookingRules({ open: true, focusOn: { row: "no-such-row" } }));
  assert.equal(focused.length, 2, "a row that is not there takes nothing");
});

test("a fold draws the page's ask above its foot, where the changes it asks about are", () => {
  const ask = W.React.createElement("span", { className: "confirm", "data-testid": "ask" }, "Discard your changes?");
  const inner = find(draw(W.RecordFold, bookingRules({ confirm: ask })), (n) => classes(n).includes("rec-fold-inner"));
  const kids = [].concat(inner.props.children).filter(Boolean);
  const at = (pred) => kids.findIndex(pred);
  assert.ok(at((k) => k === ask) >= 0, "inside the fold");
  assert.ok(at((k) => k === ask) < at((k) => classes(k.rendered).includes("rec-foot")), "above Save and Cancel");
});

/* ------------------------------------ the fold on a phone ------------------------------------ */

/**
 * A window whose width answers the kit's phone query, `(max-width: 760px)`, as a browser's does, and can be resized:
 * resize() changes what the query matches and tells whoever listens, as a browser tells a MediaQueryList's listeners.
 * put() gives the window back the stub's own matchMedia (every other test's desktop).
 */
const atWidth = (phone) => {
  const was = W.matchMedia;
  const heard = new Set();
  let now = phone;
  W.matchMedia = (q) => ({
    media: q,
    get matches() {
      return q === "(max-width: 760px)" ? now : false;
    },
    addEventListener: (type, fn) => {
      if (type === "change") heard.add(fn);
    },
    removeEventListener: (type, fn) => {
      heard.delete(fn);
    },
  });
  return {
    resize(p) {
      now = p;
      for (const fn of [...heard]) fn({ matches: p, media: "(max-width: 760px)" });
    },
    listening: () => heard.size,
    put() {
      W.matchMedia = was;
    },
  };
};
const dialogOf = (tree) => find(tree, (n) => n.props?.role === "dialog");
/** A fold as a page draws one, with a field of its own in it. */
const drawFold = (props, field = W.React.createElement("input", { className: "rec-input", id: "bt-lead" })) => {
  unmount();
  return W.React.createElement(W.RecordFold, props, field);
};

test("on a phone a fold opens as a sheet from the bottom: a modal dialog named by its label, with the same fields, the same says and the same foot", () => {
  const width = atWidth(true);
  try {
    const saved = [];
    const cancelled = [];
    const ask = W.React.createElement("span", { className: "confirm", "data-testid": "ask" }, "Discard your changes?");
    const tree = drawFold(
      bookingRules({
        confirm: ask,
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
    assert.ok(
      find(sheet, (n) => n === ask),
      "the page's ask",
    );
    assert.match(textOf(find(sheet, (n) => classes(n).includes("rec-foot-note"))), /five rules/, "the foot's own line");
    assert.ok(
      find(tree, (n) => classes(n).includes("rec-sheet-backdrop")),
      "the page stays readable under the wash, and takes no press",
    );

    // The fields and what saving writes scroll; the ask, Save and Cancel hold still in the foot.
    const body = find(sheet, (n) => classes(n).includes("rec-sheet-body"));
    const foot = find(sheet, (n) => classes(n).includes("rec-sheet-foot"));
    assert.ok(find(body, (n) => n.props?.id === "bt-lead") && byTestId(body, "rec-fold-says-booking_rules"));
    const kids = [].concat(foot.props.children).filter(Boolean);
    const at = (pred) => kids.findIndex(pred);
    assert.ok(at((k) => k === ask) >= 0 && at((k) => k === ask) < at((k) => k.type === W.RecordFoot), "above Save");

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
  // A hook-holding thing drawn after the fold, holding a value it was given after its first draw: were the fold to hold
  // a hook more at one width than the other, or open than closed, this would read another cell as its own (the stub
  // keeps one call order for the whole page), the fold's or a fresh one, and not what it was given.
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

test("a fold open when the window crosses the phone's width is drawn again in the other frame, open, with focus in its first field", () => {
  // The frame is the kit's, and the page's draft is the page's: a width crossed while it is open redraws the one fold
  // in the other frame, still open, and nothing is asked. What was typed is the page's (business-tab-page.test.mjs
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

/* ------------------------------------ the inline editor ------------------------------------ */

const website = (over = {}) => ({
  id: "website",
  label: "Website",
  open: true,
  onSave: () => {},
  onCancel: () => {},
  ...over,
});
/** An inline editor over its field, as a page draws one: the field is its child. */
const drawInline = (
  props,
  field = W.React.createElement("input", { className: "rec-input", "aria-labelledby": "rec-inline-website-key" }),
) => {
  unmount();
  return W.React.createElement(W.RecordInline, props, field);
};

test("an inline editor is the row's label and its field, what saving writes, and Save and Cancel", () => {
  const saved = [];
  const cancelled = [];
  const tree = drawInline(
    website({
      says: "Website: https://melanys.example",
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
    ["It will say", "Website: https://melanys.example"],
  );
  press(find(tree, (n) => n.props?.["data-testid"] === "rec-inline-save-website"));
  press(find(tree, (n) => n.props?.["data-testid"] === "rec-inline-cancel-website"));
  assert.deepEqual([saved.length, cancelled.length], [1, 1]);
  assert.match(textOf(find(tree, (n) => classes(n).includes("rec-foot-keys"))), /Esc cancels/);
  // Closed, it is hidden whole, as a closed fold is: the row is what shows.
  assert.equal(find(drawInline(website({ open: false })), (n) => classes(n).includes("rec-inline")).props.hidden, true);
});

test("what saving writes can say what goes as well as what comes, and a sentence of the page's before them", () => {
  const tree = drawInline(
    website({
      says: "Website: https://melanys.example",
      saysLabel: "It will say",
      gone: "Website: https://melanysbeautysalon.com",
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
    ["says", "It will say", "Website: https://melanys.example"],
    ["gone", "It will no longer say", "Website: https://melanysbeautysalon.com"],
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
    [save.props.disabled, save.props["aria-disabled"], save.props["aria-busy"], textOf(save)],
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
    value: "https://melanys.example",
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
    value: "2581 Pitkin Ave, Brooklyn, NY 11208, USA",
    source: "verified",
    sentence: "Your receptionist gives 2581 Pitkin Avenue; Google has you at 2581 Pitkin Ave, Brooklyn, NY 11208, USA.",
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
  const row = draw(W.RecordRow, { id: "address", label: "Address", value: "2581 Pitkin Avenue", disputed });
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
  unmount();
  // Children as React hands them, after the props: the stub's createElement sets `children` from these.
  const full = W.React.createElement(
    W.RecordSheet,
    offer({ id: "services", foot: saveAll, tools: "search" }),
    "row one",
    "row two",
  );
  const named = find(full, (n) => classes(n).includes("rec-sheet"));
  assert.equal(named.props["data-testid"], "rec-sheet-services");
  assert.equal(
    textOf(byId(full, named.props["aria-labelledby"])),
    "What you offer",
    "with an id, the sheet is named by its heading",
  );
  assert.match(
    textOf(byId(full, named.props["aria-describedby"])),
    /rough timings/,
    "and described by the line under it",
  );
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

test("Escape closes a sheet, once, unless something in it took the key", () => {
  const closed = [];
  const tree = draw(W.RecordSheet, offer({ onClose: () => closed.push(1) }));
  const esc = (over = {}) => ({
    type: "keydown",
    key: "Escape",
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    ...over,
  });
  const inside = esc();
  find(tree, (n) => classes(n).includes("rec-sheet")).props.onKeyDown(inside);
  assert.deepEqual(
    [closed.length, inside.defaultPrevented],
    [1, true],
    "from inside the sheet, and taken, so a fold around it does not cancel too",
  );
  W.dispatchEvent(inside);
  assert.equal(closed.length, 1, "the same key reaching the window does not close it twice");
  W.dispatchEvent(esc());
  assert.equal(closed.length, 2, "with focus outside it, the window hears the key");
  W.dispatchEvent(esc({ defaultPrevented: true }));
  assert.equal(closed.length, 2, "a key a combobox inside already took is not the sheet's");
});

test("a press on the wash behind a sheet keeps focus where it was", () => {
  const wash = find(draw(W.RecordSheet, offer()), (n) => classes(n).includes("rec-sheet-backdrop"));
  let prevented = false;
  wash.props.onMouseDown({
    preventDefault() {
      prevented = true;
    },
  });
  // A mousedown's default moves focus to what was pressed, here the page's body, and Shift+Tab would then walk the
  // page behind the modal.
  assert.equal(prevented, true);
});

test("Tab stays inside a sheet, and wraps round both ways", () => {
  const sheet = find(draw(W.RecordSheet, offer()), (n) => classes(n).includes("rec-sheet"));
  const focused = [];
  const control = (name, over = {}) => ({
    name,
    tabIndex: 0,
    disabled: false,
    getClientRects: () => [{}],
    focus: () => focused.push(name),
    ...over,
  });
  const [first, middle, last] = ["first", "middle", "last"].map((name) => control(name));
  // Last in the sheet, and never a tab stop: a radiogroup's unchosen option (tabindex -1), and a closed fold's button,
  // which has no box on screen. A trap that counted them took them for its last stop, and Tab walked out of the sheet.
  const unchosen = control("unchosen", { tabIndex: -1 });
  const folded = control("folded", { getClientRects: () => [] });
  const box = { querySelectorAll: () => [first, middle, last, unchosen, folded] };
  const doc = globalThis.document;
  const was = doc.activeElement;
  const tabFrom = (at, shiftKey) => {
    doc.activeElement = at;
    const e = {
      key: "Tab",
      shiftKey,
      currentTarget: box,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
    };
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
  const was = {
    activeElement: doc.activeElement,
    querySelector: doc.querySelector,
    createPortal: W.ReactDOM.createPortal,
  };
  Object.assign(doc, { activeElement: opener, querySelector: (sel) => (sel === ".app-root" ? appRoot : null) });
  W.ReactDOM.createPortal = (node, into) => {
    portals.push(into);
    return node;
  };
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
  assert.deepEqual(
    portals,
    [appRoot],
    "drawn in the app's root, where People's overlay check (PL_OVERLAY) finds a dialog, over the pane's own layout",
  );
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
    matches: (sel) => sel === "button:not([role])",
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
    const sheet = () => find(tree, (n) => classes(n).includes("rec-sheet"));
    // React calls a callback ref with the element as it mounts; the stub calls none, so this is that moment.
    sheet().props.ref(panel);
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

test("a sheet given a Save draws the fold's own foot: the ask above it, and nothing while its save is out; Escape and Close cancel, Ctrl or Cmd with Enter saves", () => {
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
      confirm: ask,
      ...over,
    });
  let tree = draw(W.RecordSheet, props());
  const foot = () => find(tree, (n) => classes(n).includes("rec-sheet-foot"));
  assert.equal(textOf(byTestId(foot(), "rec-sheet-save-services")), "Save 33 services");
  assert.match(textOf(foot()), /Removing one offers an undo\./);
  const kids = all(foot(), (n) => n.props?.["data-testid"] === "ask" || n.type === W.RecordFoot);
  assert.deepEqual(
    kids.map((n) => (n.type === W.RecordFoot ? "foot" : "ask")),
    ["ask", "foot"],
    "the ask above Save, where the changes it asks about are",
  );
  press(byTestId(foot(), "rec-sheet-save-services"));
  press(byTestId(foot(), "rec-sheet-cancel-services"));
  assert.deepEqual([saves.length, cancels.length], [1, 1], "Save saves, and Cancel is the sheet's close, with its ask");
  const sheet = () => find(tree, (n) => classes(n).includes("rec-sheet"));
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
  tree = draw(W.RecordSheet, props({ saving: true }));
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
});
