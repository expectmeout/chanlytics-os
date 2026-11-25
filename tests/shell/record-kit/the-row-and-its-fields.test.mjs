/**
 * The record kit's row, and its fields.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { stateOf } from "@chanlytics/contracts";
import { all, find, textOf, classes, press } from "../../_stub-react.mjs";
import { W, byId, components, draw, isIcon, numbers, redraw } from "./_record-kit.mjs";
import { bridgeHolds } from "../_bridge-holds.mjs";

/* ------------------------------------ the row ------------------------------------ */

test("a row draws its label, its value and one act", () => {
  const tree = draw(W.RecordRow, {
    label: "Website",
    value: "marisasbeautysalon.example.com",
    act: { label: "Change", onClick: () => {} },
  });
  assert.match(textOf(tree), /Website/);
  assert.match(textOf(tree), /marisasbeautysalon\.example\.com/);
  assert.match(textOf(tree), /Change/);
  assert.equal(all(tree, (n) => n.type === "button").length, 1, "one act, never two");
  // And the whole row is that act's press (row.tsx recRowPress): a row with an act says so, and one without is not a
  // press at all.
  const row = find(tree, (n) => classes(n).includes("rec-row"));
  assert.deepEqual([row.props["data-act"], typeof row.props.onClick], ["true", "function"]);
  const still = find(draw(W.RecordRow, { label: "Website", value: "marisasbeautysalon.example.com" }), (n) =>
    classes(n).includes("rec-row"),
  );
  assert.deepEqual([still.props["data-act"], still.props.onClick], [undefined, undefined]);
});

test("a press on a row is a press on its act, never for a press on something of the row's own, never for words selected", () => {
  // The act was latent, opacity 0 until the row was hovered, and 17px of words at the row's edge; the row is the
  // target now. A press on a link, a dispute's press or a box in the row is theirs; the act itself has run its own
  // handler by the time the press reaches the row; and words dragged over in the value are a selection.
  const pressed = [];
  const act = { click: () => pressed.push("act") };
  const link = {};
  const box = {};
  link.closest = (sel) => (sel.includes("a[href]") ? link : null);
  box.closest = (sel) => (sel.includes("input") ? box : null);
  const words = { closest: () => null };
  // Drawn on the body, through a portal, by the menu an act opened: React carries its press up to the row all the same.
  const elsewhere = { closest: () => null };
  const row = {
    contains: (n) => n === act || n === link || n === box || n === words,
    querySelector: (sel) => (sel === ".rec-row-act" ? act : null),
  };
  const at = (target) => ({ currentTarget: row, target });
  // The row's press, as a row with an act draws it (row.tsx recRowPress, the kit's own).
  const rowPress = find(
    draw(W.RecordRow, { label: "Website", value: "example.com", act: { label: "Change", onClick: () => {} } }),
    (n) => classes(n).includes("rec-row"),
  ).props.onClick;
  const selected = { text: "" };
  const was = W.getSelection;
  W.getSelection = () => ({ toString: () => selected.text });
  try {
    rowPress(at(words));
    assert.deepEqual(pressed, ["act"], "a press on the row's words is the act's");
    rowPress(at(link));
    rowPress(at(box));
    assert.deepEqual(pressed, ["act"], "a link or a box in the row is pressed for itself");
    rowPress(at({ closest: (sel) => (sel.includes("button") ? act : null) }));
    assert.deepEqual(pressed, ["act"], "the act itself has already answered its own press");
    rowPress(at(elsewhere));
    assert.deepEqual(
      pressed,
      ["act"],
      "a press on the menu the act opened is not a press on the row: it opened it again",
    );
    selected.text = "marisas";
    rowPress(at(words));
    assert.deepEqual(pressed, ["act"], "words dragged over are a selection, not a press");
  } finally {
    W.getSelection = was;
  }
});

test("an act that opens something of its own hands its button and its face to the page, which draws them as its menu's control", () => {
  // The Logo row (00407): one act, as every row has, whose press opens a few choices. The kit asks nothing of the menu:
  // the page's MoreMenu draws the act's face (its words and chevron) on its own trigger.
  const handed = [];
  const tree = draw(W.RecordRow, {
    id: "logo",
    label: "Logo",
    value: "BC",
    act: {
      label: "Add",
      wrap: (button, face) => {
        handed.push({ button, face });
        return W.React.createElement("button", { className: "rec-row-act", "data-testid": "the-pages-menu" }, face);
      },
    },
  });
  assert.equal(handed.length, 1);
  assert.ok(classes(handed[0].button).includes("rec-row-act"), "the row's own act");
  const menu = find(tree, (n) => n.props?.["data-testid"] === "the-pages-menu");
  assert.ok(menu, "drawn where the act stands");
  assert.equal(textOf(find(menu, (n) => classes(n).includes("rec-row-act-words"))), "Add", "the act's words");
  assert.ok(
    find(menu, (n) => classes(n).includes("rec-row-chev")),
    "and the phone's chevron",
  );
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
  assert.equal(find(words, isIcon), null, "nothing but the words in the clipped box");
  const icon = find(act, (n) => classes(n).includes("rec-row-act-icon"));
  assert.equal(find(icon, isIcon).props.name, "arrow-right", "the arrow, beside them");
  assert.equal(icon.props["aria-hidden"], "true", "a picture of where it goes, which the act's name already says");
  // The act draws its face (one fragment, which a page's menu may draw on its own control): its parts, in order.
  const kids = []
    .concat(act.props.children)
    .flatMap((k) => (k && k.type === W.React.Fragment ? [].concat(k.props.children) : [k]))
    .filter(Boolean);
  assert.ok(kids.indexOf(words) >= 0 && kids.indexOf(words) < kids.indexOf(icon), "after the words");
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

test("a row the page says a save has just drawn again says so, for its value to arrive", () => {
  // Spec §9, item 4: the value of a row its editor's save closed arrives on the house's rise-in (record.css). The kit
  // only carries the page's word for it; a row drawn any other way says nothing.
  const row = (props) =>
    find(draw(W.RecordRow, { id: "tone", label: "Its voice", value: "Calm", ...props }), (n) =>
      classes(n).includes("rec-row"),
    );
  assert.equal(row({ settled: true }).props["data-settled"], "true");
  assert.equal(row({}).props["data-settled"], undefined);
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
  const tree = draw(W.RecordRow, { label: "Address", value: "1200 Maple Ave", source: "verified" });
  const src = find(tree, (n) => classes(n).includes("rec-src"));
  assert.ok(src, "a source that is not the owner's is said");
  assert.match(textOf(src), /from Google/, "in contracts' words");
  assert.deepEqual(
    all(tree, (n) => classes(n).includes("pill")).map(textOf),
    [],
    "a muted word beside the value, never a bordered pill: a phone wrapped the pill onto a line of its own",
  );
  // "You set this" is every row's default and tells an owner nothing they could act on.
  const typed = draw(W.RecordRow, { label: "Address", value: "1200 Maple Ave", source: "typed" });
  assert.ok(!find(typed, (n) => classes(n).includes("rec-src")), "typed draws no source at all");
  assert.equal(textOf(typed).includes(stateOf("fact", "typed").label), false);
  // The four that are not the owner's still are, each in contracts' words.
  for (const source of ["provisioned", "workspace", "absent"]) {
    const row = draw(W.RecordRow, { label: "Answers on", value: "+1 (212) 555-0142", source });
    assert.equal(
      textOf(find(row, (n) => classes(n).includes("rec-src"))),
      stateOf("fact", source).label,
      `${source} is said`,
    );
  }
});

test("a disputed fact wears warn and offers the other answer", () => {
  const used = [];
  const disputed = { value: "1200 Maple Ave, Brooklyn, NY 11208, USA", source: "verified", onUse: () => used.push(1) };
  const tree = draw(W.RecordRow, { label: "Address", value: "1200 Maple Avenue", source: "typed", disputed });
  assert.match(textOf(tree), /1200 Maple Ave, Brooklyn, NY 11208, USA/, "the other answer is on the row");
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
    value: "1200 Maple Avenue",
    source: "typed",
    disputed: { ...disputed, onKeep: () => kept.push(1) },
  });
  press(find(keeping, (n) => typeof n.props?.onClick === "function" && textOf(n) === "Keep mine"));
  assert.equal(kept.length, 1, "and keeping yours is a press too");
});

test("an other answer on a row with no value fills it and disagrees with nothing: the row is not marked disputed", () => {
  const used = [];
  const page = "https://calendly.com/example-studio/consult";
  const tree = draw(W.RecordRow, {
    label: "Booking link",
    value: null,
    empty: "Not set",
    disputed: {
      value: page,
      sentence: `Found on your website: ${page}`,
      useLabel: "Use it",
      onUse: () => used.push(1),
    },
  });
  assert.deepEqual(all(tree, (n) => classes(n).includes("rec-src")).map(textOf), [], "nothing says it disagrees");
  assert.match(textOf(tree), /Found on your website: https:\/\/calendly\.com\/example-studio\/consult/);
  press(find(tree, (n) => typeof n.props?.onClick === "function" && textOf(n) === "Use it"));
  assert.equal(used.length, 1, "and the press takes it");
});

test("something wrong is on its row at full strength: a serious disagreement, or a sentence the page names", () => {
  const rowOf = (tree) => find(tree, (n) => classes(n).includes("rec-row"));
  assert.equal(
    rowOf(draw(W.RecordRow, { label: "Website", value: "marisas.example.com" })).props["data-state"],
    undefined,
    "nothing wrong, no state",
  );
  // Severity is factConflicts' (contracts facts.ts), and it is about the customer: the published number that does not
  // reach the receptionist is serious; an address written two ways is minor.
  const serious = { value: "+1 (305) 555-0123", source: "provisioned", severity: "serious", onUse: () => {} };
  assert.equal(
    rowOf(
      draw(W.RecordRow, {
        label: "Tells customers to call",
        value: "+1 (212) 555-0142",
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
    value: "1200 Maple Ave, Brooklyn, NY 11208, USA",
    source: "verified",
    severity: "minor",
    onUse: () => {},
  };
  const tree = draw(W.RecordRow, {
    label: "Address",
    value: "1200 Maple Avenue",
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
    /1200 Maple Ave, Brooklyn, NY 11208, USA/,
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
    "Your receptionist introduces the business as Marisa's Beauty Salon; this workspace is named Billing probe.";
  const read = { value: "Billing probe", source: "workspace", severity: "minor", sentence };
  const tree = draw(W.RecordRow, {
    id: "name",
    label: "Name",
    value: "Marisa's Beauty Salon",
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
    value: "Marisa's Beauty Salon",
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
    value: "marisas.example.com",
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
    label: "Where a caller is put through",
    value: "+1 (786) 555-0182",
    act: { label: "Change", onClick: () => {}, name: "Change the transfer number" },
  });
  const act = find(tree, (n) => n.props?.["data-testid"] === "rec-row-act-handoff_number");
  assert.equal(act.props["aria-label"], "Change the transfer number", 'not "Change Where a caller is put through"');
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
  // No hook: the box carries the id it was given, and none is taken.
  assert.equal(components(tree).length, 2, "the box and its FieldError, nothing that asks React for a name");

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
  assert.equal(components(tree).length, 2, "the box and its FieldError: no hook");
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

test("a toggle group's options may each say what choosing them means, and are named and described by their own words", () => {
  const picked = [];
  const buys = {
    id: "buys",
    label: "How customers buy",
    value: "proposal",
    options: [
      { value: "booking", label: "They book an appointment", hint: "Bookings, reminders and the booking link." },
      { value: "proposal", label: "Some get a proposal first", hint: "Adds deals." },
    ],
    onChange: (v) => picked.push(v),
  };
  const tree = draw(W.RecordToggleGroup, buys);
  const group = find(tree, (n) => n.props?.role === "radiogroup");
  assert.deepEqual([group.props["aria-label"], group.props["data-hints"]], ["How customers buy", "true"]);
  const radios = all(tree, (n) => n.props?.role === "radio");
  // Each option's name is its label and its description the sentence under it, by ids made from the group's.
  assert.deepEqual(
    radios.map((r) => [
      textOf(byId(tree, r.props["aria-labelledby"])),
      textOf(byId(tree, r.props["aria-describedby"])),
      r.props["aria-checked"],
      r.props.tabIndex,
    ]),
    [
      ["They book an appointment", "Bookings, reminders and the booking link.", false, -1],
      ["Some get a proposal first", "Adds deals.", true, 0],
    ],
  );
  assert.deepEqual(
    radios.map((r) => r.props["aria-labelledby"]),
    ["buys-0-label", "buys-1-label"],
  );
  press(radios[0]);
  assert.deepEqual(picked, ["booking"], "a press chooses, as it does without them");
  // Named by the words on screen that already say the question, as a switch can be.
  const named = find(
    draw(W.RecordToggleGroup, { ...buys, labelledBy: "the-question" }),
    (n) => n.props?.role === "radiogroup",
  );
  assert.deepEqual([named.props["aria-labelledby"], named.props["aria-label"]], ["the-question", undefined]);
  // Without hints nothing changes: the option is its label, and the group carries no mark.
  const plain = draw(W.RecordToggleGroup, numbers);
  assert.equal(find(plain, (n) => n.props?.role === "radiogroup").props["data-hints"], undefined);
  assert.deepEqual(
    all(plain, (n) => n.props?.role === "radio").map((r) => [r.props["aria-labelledby"], r.props["aria-describedby"]]),
    [
      [undefined, undefined],
      [undefined, undefined],
    ],
  );
  // Hookless, so a group with hints cannot make ids of its own: it needs one.
  assert.throws(
    () => draw(W.RecordToggleGroup, { ...buys, id: null }),
    (e) => e instanceof TypeError && /needs an id/.test(e.message),
  );
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
  bridgeHolds({ parts: { tip: { show: (el) => shown.push(el) } } });
  const el = { tag: "the mark" };
  btn.props.onClick({ currentTarget: el, stopPropagation() {}, preventDefault() {} });
  bridgeHolds({ parts: { tip: tip } });
  assert.deepEqual(shown, [el], "a press shows it at the mark, which is how a finger reads it");

  const used = [];
  const card = draw(W.RecordTipCard, {
    title: "Google's address",
    body: "1200 Maple Ave, Brooklyn, NY 11208, USA",
    act: { label: "Use it", onClick: () => used.push(1) },
  });
  assert.ok(
    find(card, (n) => classes(n).includes("rec-card-tip")),
    "a card is the white card",
  );
  press(find(card, (n) => typeof n.props?.onClick === "function" && textOf(n) === "Use it"));
  assert.equal(used.length, 1);
});
