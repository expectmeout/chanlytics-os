/**
 * People's table, drawn from its columns (Phase 0), and its keys: where they were pressed, and what is open.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { until } from "../../shared/_until.mjs";
import { lineBox } from "../../shared/_line.mjs";
import { SHORTCUTS, shortcutGroups } from "@chanlytics/contracts";
import { keysDrawn } from "../../_keys.mjs";
import {
  BODY,
  D,
  H,
  NOW,
  ZONE,
  all,
  barMenuOf,
  byTestId,
  cells,
  click,
  columnsMenu,
  cursorRow,
  dockSays,
  drained,
  draw,
  element,
  find,
  flipColumn,
  frames,
  freshPage,
  headings,
  heldSaves,
  iso,
  itemOf,
  listeners,
  menuItems,
  onPhone,
  openSheet,
  opened,
  overlayOpen,
  peeked,
  peopleOverride,
  peopleSearch,
  person,
  press,
  rowOf,
  savedViews,
  setCells,
  setOverlayOpen,
  settle,
  sortByHeading,
  textOf,
  wire,
} from "./_people-page.mjs";

test("the table's columns: Person, State, Next step and Last contact, and with a calendar Visits; every other column waits in the Columns menu", async () => {
  // The headings a press sorts by, as the table marks them; and each body row's cells against the headings above them.
  const sorting = (tree) =>
    all(tree, (n) => n.type === "th" && n.props?.["data-sorts"] !== undefined).map((th) =>
      textOf(th).replace(/[▲▼↕]/g, "").trim(),
    );
  const oneCellPerHeading = (tree, why) => {
    const heads = all(
      find(tree, (n) => n.type === "thead"),
      (n) => n.type === "th",
    ).length;
    const rows = all(
      find(tree, (n) => n.type === "tbody"),
      (n) => n.type === "tr",
    );
    assert.equal(rows.length, 2, "both people are rows");
    for (const tr of rows)
      assert.equal(
        tr.props.children.filter((k) => k && k.type === "td").length,
        heads,
        `${tr.props.id}: one cell under each heading, ${why}`,
      );
  };
  await freshPage({ people: [person(1), person(2)] });
  let tree = draw();
  assert.deepEqual(headings(tree), ["Person", "State", "Next step", "Last contact"]);
  assert.deepEqual(
    sorting(tree),
    ["Person", "State", "Next step", "Last contact"],
    "every heading that is shown sorts",
  );
  oneCellPerHeading(tree, "without a calendar");
  // Where they came from is the member's to show (canvas P1: with it the table outgrew the pane at 1440), and never sorts.
  await freshPage({
    people: [person(1), person(2)],
    views: { people: { sortBy: "last", sortDir: "desc", columns: { came_from: true } } },
  });
  tree = draw();
  assert.deepEqual(headings(tree), ["Person", "State", "Next step", "Last contact", "Came from"]);
  assert.deepEqual(sorting(tree), ["Person", "State", "Next step", "Last contact"], "where they came from never sorts");
  oneCellPerHeading(tree, "with Came from shown");
  // Reach, Offers and the receptionist wait in the menu as well, and each shows where the member asks for it: Offers sorts,
  // Reach and the receptionist never do.
  await freshPage({
    people: [person(1), person(2)],
    views: { people: { sortBy: "last", sortDir: "desc", columns: { reach: true, receptionist: true, offers: true } } },
  });
  tree = draw();
  assert.deepEqual(headings(tree), ["Person", "State", "Next step", "Reach", "Last contact", "AI", "Offers"]);
  assert.deepEqual(
    sorting(tree),
    ["Person", "State", "Next step", "Last contact", "Offers"],
    "AI and Reach never sort",
  );
  oneCellPerHeading(tree, "with Reach, AI and Offers shown");
  await freshPage({ people: [person(1), person(2)], calendar: "ok" });
  tree = draw();
  assert.deepEqual(
    headings(tree),
    ["Person", "State", "Next step", "Last contact", "Appointments"],
    "with a calendar the visit joins the four",
  );
  assert.deepEqual(sorting(tree), ["Person", "State", "Next step", "Last contact", "Appointments"], "the visit sorts");
  oneCellPerHeading(tree, "with a calendar");
});

test("a row says where the person came from, in words, and nothing when nothing is known", async () => {
  await freshPage({
    people: [
      person(1, { came_from: "calendar" }),
      person(2, { came_from: "sms" }),
      person(3, { came_from: null }),
      person(4),
      person(5, { came_from: "ad" }),
    ],
    views: { people: { sortBy: "last", sortDir: "desc", columns: { came_from: true } } },
  });
  const tree = draw();
  const said = (id) => textOf(byTestId(rowOf(tree, id), "row-came-from")).trim();
  assert.deepEqual(
    ["p1", "p2", "p3", "p4", "p5"].map(said),
    ["Your calendar", "Text", "", "", "An ad"],
    "and a row read before the column existed says nothing either; an ad is a way in like the rest",
  );
  for (const id of ["p3", "p4"])
    assert.ok(
      byTestId(rowOf(tree, id), "row-came-from"),
      `${id}: the cell is drawn, empty, so the row's cells stay under their headings`,
    );
});

test("a row with a thread offers the booking link on file; with none on file, only the thread", async () => {
  await freshPage({ people: [person(1)], bookingLink: "https://booksy.com/salon" });
  assert.ok(byTestId(draw(), "row-booking-link"), "the workspace's link reaches the row");
  await freshPage({ people: [person(1)] });
  const tree = draw();
  assert.ok(byTestId(tree, "row-open-thread"), "the thread is one press away");
  assert.equal(byTestId(tree, "row-booking-link"), null, "and there is no link to offer");
});

test("AI's word is beside the state whether or not its column shows, marked when it does, so a card never loses it", async () => {
  // A reply is queued, so the receptionist is not simply answering: it has a word to say. Person 2's is simply answering.
  const queued = person(1, { queued_reply_at: iso(H) });
  const stateCell = (tree, id) =>
    find(rowOf(tree, id), (n) => n.type === "td" && /\bcl-state-cell\b/.test(String(n.props?.className || "")));
  const isMark = (n) => /\bcl-row-recept-mark\b/.test(String(n.props?.className || ""));
  const markOf = (tree) => find(stateCell(tree, "p1"), isMark);
  const inColumn = (mark) => /\bis-in-column\b/.test(String(mark.props.className));
  await freshPage({ people: [queued, person(2)] });
  let tree = draw();
  let mark = markOf(tree);
  assert.equal(
    mark && textOf(mark),
    "reply waiting to go",
    "the Receptionist column is off by default (Ruben, 8 Oct 2026), and the word is beside the state",
  );
  assert.equal(inColumn(mark), false, "unmarked: this is where it is said");
  flipColumn(tree, "receptionist");
  tree = draw();
  mark = markOf(tree);
  assert.equal(
    inColumn(mark),
    true,
    "shown in its column, the word beside the state is marked as said there, which the stylesheet leaves to a card",
  );
  assert.equal(
    textOf(byTestId(rowOf(tree, "p1"), "row-receptionist")).trim(),
    "Reply waiting to go",
    "the column says AI's standing as the one pill, in its own words",
  );
  assert.ok(
    stateCell(tree, "p2") && !find(stateCell(tree, "p2"), isMark),
    "a receptionist simply answering has no word beside the state",
  );
  await freshPage({ people: [queued], calendar: "ok" });
  mark = markOf(draw());
  assert.equal(
    mark && textOf(mark),
    "reply waiting to go",
    "with a calendar the Receptionist column is hidden, and the word is beside the state",
  );
  assert.equal(inColumn(mark), false, "unmarked: this is where it is said");
});

test("REGRESSION: the keyboard is one listener for the page's life, and it walks the rows shown now -- it was taken down and added again on every draw", async () => {
  const needs = (i) =>
    person(i, {
      needs_human: true,
      open_escalation_reason: "human_token",
      open_escalation_since: iso(H),
      latest_state: "needs_human",
    });
  await freshPage({ people: [needs(1), person(2), needs(3)] });
  draw();
  assert.equal(listeners.keydown?.size, 1, "one listener");
  const [only] = listeners.keydown;
  draw();
  byTestId(draw(), "people-standing-needs").props.onClick();
  draw();
  assert.equal(listeners.keydown.size, 1);
  assert.ok(listeners.keydown.has(only), "REGRESSION: a draw put a new listener in its place");
  press("j");
  press("j");
  const focused = find(draw(), (n) => n.type === "tr" && /\bfocused\b/.test(n.props?.className || ""));
  assert.equal(focused?.props.id, "person-p3", "two steps down the people who need you: Person 2 is not among them");
});

test("the keyboard: J/K and the arrows move, x and Space select, Enter opens, / searches, Esc clears the selection", async () => {
  await freshPage({ people: [person(1), person(2), person(3)] });
  const cursorOn = () =>
    find(draw(), (n) => n.type === "tr" && /\bfocused\b/.test(n.props?.className || ""))?.props.id ?? null;
  draw();
  assert.equal(press("j"), true, "J is the page's");
  assert.equal(cursorOn(), "person-p1");
  press("ArrowDown");
  assert.equal(cursorOn(), "person-p2");
  press("k");
  assert.equal(cursorOn(), "person-p1");
  press("ArrowUp");
  assert.equal(cursorOn(), "person-p1", "the first row holds");
  press("J");
  press("j");
  press("ArrowDown");
  assert.equal(cursorOn(), "person-p3", "and so does the last");
  assert.equal(press("x"), true);
  let tree = draw();
  assert.match(textOf(byTestId(tree, "bulk-bar")), /1 selected/, "x selects the row under the cursor");
  assert.equal(rowOf(tree, "p3").props["aria-selected"], true, "and the row says it is selected");
  press("k");
  draw();
  press(" ");
  assert.match(textOf(byTestId(draw(), "bulk-bar")), /2 selected/, "Space selects too");
  assert.equal(press("Escape"), true);
  assert.equal(byTestId(draw(), "bulk-bar"), null, "Esc clears the selection");
  assert.equal(press("Enter", { tagName: "TR", isContentEditable: false, closest: () => null }), true);
  assert.equal(peeked(), "Preview of Person 2", "Enter opens the person under the cursor, in the peek on a desk");
  assert.deepEqual(opened, [], "and not their page");
  draw();
  const box = lineBox();
  let focusedSearch = 0;
  box.props.ref.current = {
    focus: () => {
      focusedSearch += 1;
    },
  };
  assert.equal(press("/"), true);
  assert.equal(focusedSearch, 1, "/ puts you in the search box");
  assert.equal(
    press("j", { tagName: "INPUT", type: "text", isContentEditable: false, closest: () => null }),
    false,
    "and a J typed there is a letter",
  );
  assert.equal(
    press("j", { tagName: "INPUT", type: "checkbox", isContentEditable: false, closest: () => ({}) }),
    true,
    "a row's checkbox is not a place to type: after a click on one, J still walks",
  );
});

test("REGRESSION: Esc in a field is the field's, even once the field has gone -- Esc in the bulk bar's list name cleared the whole selection", async () => {
  await freshPage({ people: [person(1), person(2)] });
  byTestId(draw(), "select-all").props.onChange();
  // New list… puts the name box in the bar. Its own Esc closes it (React hears the key before the window does), and
  // focus goes with it: by the time the page hears the key, focus is on the body.
  itemOf(barMenuOf(draw(), "Add to list"), "New list…").onClick();
  byTestId(draw(), "bulk-list-name").props.onKeyDown({ key: "Escape" });
  const nameBox = element("INPUT", { type: "text", within: ["input", ".cl-bulk"] });
  assert.equal(
    press("Escape", nameBox, { focus: BODY }),
    false,
    "the page leaves an Esc pressed in a field to the field",
  );
  const tree = draw();
  assert.equal(byTestId(tree, "bulk-list-name"), null, "the box closed");
  assert.match(textOf(byTestId(tree, "bulk-bar")), /2 selected/, "REGRESSION: and the selection went with it");
});

test("REGRESSION: Esc while a menu or a dialog is open is theirs -- the Esc that closed one cleared the selection, and the rows walked behind it", async () => {
  await freshPage({ people: [person(1), person(2)] });
  byTestId(draw(), "select-all").props.onChange();
  draw();
  // A menu, then a dialog (Ask, the notifications, the ? sheet, the phone's drawer): the page holds still behind each.
  for (const role of ["menu", "dialog"]) {
    setOverlayOpen({ role });
    assert.equal(press("Escape"), false, `a ${role} closes itself; the page leaves its Esc alone`);
    assert.equal(press("j"), false, `and walks nothing behind the ${role}`);
    assert.equal(press("/"), false, `nor goes to the search behind the ${role}`);
    assert.match(
      textOf(byTestId(draw(), "bulk-bar")),
      /2 selected/,
      `REGRESSION: an Esc that closed a ${role} cleared the selection`,
    );
  }
  // The kit's Menu and Sheet are drawn on the body, past .app-root, and named by their class: the page holds still too.
  for (const [role, className] of [
    ["menu", "more-menu"],
    ["dialog", "sheet"],
  ]) {
    setOverlayOpen({ role, inApp: false, className });
    assert.equal(press("j"), false, `and walks nothing behind the kit's ${className}`);
  }
  // A dialog outside the app, one a browser extension added and hid, is not the app's: the page keeps its keys.
  setOverlayOpen({ role: "dialog", inApp: false });
  assert.equal(press("j"), true, "a dialog outside the app does not silence the page");
  setOverlayOpen(null);
  assert.equal(press("Escape"), true, "with nothing open, Esc clears the selection");
  assert.equal(byTestId(draw(), "bulk-bar"), null);
});

test("REGRESSION: the ? sheet's Esc is its own -- open, Esc closes it and the selection stays; closed, the sheet lets People's Esc through", async () => {
  await freshPage({ people: [person(1), person(2)] });
  // The shell draws the sheet before any page, so its listener hears a key before People's does; by the time People's
  // hears it, the sheet has closed. It draws in a frame of its own, its state apart from the page's.
  const chrome = globalThis.window.__chrome;
  globalThis.window.__chrome = { ...chrome, shortcuts: SHORTCUTS, shortcutGroups, typing: () => false };
  const sheet = () => {
    frames.begin();
    return frames.render(globalThis.window.ShortcutsSheet, {});
  };
  try {
    assert.equal(sheet(), null, "closed until asked");
    byTestId(draw(), "select-all").props.onChange();
    draw();
    globalThis.window.openShortcuts();
    assert.ok(byTestId(sheet(), "shortcuts-sheet"), "the sheet is open");
    assert.equal(press("Escape"), true, "the sheet takes the Esc that closes it");
    assert.equal(sheet(), null, "and closes");
    assert.match(
      textOf(byTestId(draw(), "bulk-bar")),
      /2 selected/,
      "REGRESSION: the Esc that closed the sheet cleared the selection behind it",
    );
    assert.equal(press("Escape"), true, "with the sheet closed, Esc is People's");
    assert.equal(byTestId(draw(), "bulk-bar"), null, "and clears the selection");
  } finally {
    globalThis.window.__chrome = chrome;
  }
});

test("REGRESSION: Esc clears the selection with focus on a bulk-bar button -- after Export CSV, Take off or Add a note, the foot's esc did nothing", async () => {
  await freshPage({ people: [person(1), person(2)] });
  byTestId(draw(), "select-all").props.onChange();
  assert.match(textOf(byTestId(draw(), "bulk-bar")), /2 selected/);
  const exportCsv = element("BUTTON", { within: ["button", ".cl-bulk"] });
  assert.equal(press("Escape", exportCsv), true, "REGRESSION: the bar kept Esc from the page");
  assert.equal(byTestId(draw(), "bulk-bar"), null, "the selection is cleared");
});

test("a key with a modifier is not the page's: Ctrl-K is AI's, and Ctrl-J, Ctrl-X, ⌘J and Alt-X move and select nothing", async () => {
  await freshPage({ people: [person(1), person(2), person(3)] });
  draw();
  press("j");
  draw();
  press("j");
  assert.equal(cursorRow(draw()), "person-p2");
  for (const [key, mod] of [
    ["k", "ctrlKey"],
    ["j", "ctrlKey"],
    ["x", "ctrlKey"],
    ["j", "metaKey"],
    ["x", "altKey"],
  ]) {
    assert.equal(press(key, null, { [mod]: true }), false, `${mod} with ${key} is not the page's`);
  }
  const tree = draw();
  assert.equal(cursorRow(tree), "person-p2", "the cursor stayed on Person 2");
  assert.equal(byTestId(tree, "bulk-bar"), null, "and nobody was selected");
});

test("Esc closes the phone's lists sheet, and a selection on takes the lists button's place in the bar until Esc clears it", () =>
  onPhone(async () => {
    await freshPage({ people: [person(1), person(2)], lists: [{ id: "s1", name: "Regulars", ids: ["p1"] }] });
    click(byTestId(draw(), "people-phone-lists"));
    assert.ok(openSheet(draw(), "people-lists-sheet"), "the sheet is open");
    // The kit's sheet, open on the body: the page holds still behind it, and its Esc is its own (Base UI's), which asks.
    setOverlayOpen({ role: "dialog", inApp: false, className: "sheet" });
    assert.equal(press("Escape"), false, "its Esc is its own");
    setOverlayOpen(null);
    openSheet(draw(), "people-lists-sheet").props.onClose();
    let tree = draw();
    assert.equal(openSheet(tree, "people-lists-sheet"), null, "Esc closed the sheet");
    // A selection on: the bar says the count where the lists button stood (Ruben, 10 Oct 2026), so nothing opens the
    // sheet over a selection, and the next Esc clears it.
    byTestId(tree, "select-all").props.onChange();
    tree = draw();
    assert.equal(byTestId(tree, "people-phone-lists"), null, "the lists button stands down while a selection is on");
    assert.equal(textOf(byTestId(tree, "people-phone-title")).trim(), "2 selected", "the bar says the count");
    assert.equal(dockSays(tree), "2 people selected");
    assert.equal(press("Escape"), true);
    tree = draw();
    assert.equal(byTestId(tree, "bulk-bar"), null, "Esc clears it");
    assert.ok(byTestId(tree, "people-phone-lists"), "and the lists button is back");
  }));

test("x and Space select nobody for a member who can neither edit lists nor export", async () => {
  await freshPage({ people: [person(1), person(2)] });
  const me = globalThis.window.__ME;
  globalThis.window.__ME = { role: "viewer" };
  try {
    draw();
    press("j");
    const tree = draw();
    assert.equal(cursorRow(tree), "person-p1", "a viewer walks the rows");
    assert.equal(press("x"), false, "x selects nobody");
    assert.equal(press(" "), false, "nor does Space");
    assert.equal(byTestId(draw(), "bulk-bar"), null);
  } finally {
    globalThis.window.__ME = me;
  }
});

test("REGRESSION: People draws no key -- the table's foot named every one (J K x esc ↵ /) and the search box a /, beside the ? sheet that lists them", async () => {
  await freshPage({ people: [person(1), person(2)] });
  const tree = draw();
  assert.equal(
    find(tree, (n) => n.props?.className === "cl-table-keys"),
    null,
    "the foot's line of keys",
  );
  assert.equal(textOf(find(tree, (n) => n.props?.className === "dtable-foot")), "2 people", "the foot says the count");
  assert.deepEqual(keysDrawn(tree), []);
});

test("/ goes to the search on an empty table too", async () => {
  await freshPage({ people: [] });
  draw();
  const box = lineBox();
  let focused = 0;
  box.props.ref.current = {
    focus: () => {
      focused += 1;
    },
  };
  assert.equal(press("/"), true);
  assert.equal(focused, 1, "nobody to walk, and still somewhere to search");
});

test("a radio's arrow keys are the radio's; a held x, Space or Enter acts once, and a held J walks on", async () => {
  await freshPage({ people: [person(1), person(2), person(3)] });
  draw();
  const radio = element("INPUT", { type: "radio", within: ["input"] });
  assert.equal(press("ArrowDown", radio), false, "a radio group moves its own choice");
  assert.equal(cursorRow(draw()), null, "and not the page's cursor");
  press("j");
  draw();
  assert.equal(press("x"), true);
  draw();
  assert.equal(press("x", null, { repeat: true }), false, "a held x does not take the row off again");
  assert.equal(press(" ", null, { repeat: true }), false, "nor does a held Space");
  assert.equal(press("Enter", null, { repeat: true }), false, "and a held Enter opens nobody");
  assert.deepEqual(opened, []);
  assert.match(textOf(byTestId(draw(), "bulk-bar")), /1 selected/, "Person 1 stays selected");
  assert.equal(press("j", null, { repeat: true }), true, "a held J walks on");
  assert.equal(press("j", null, { repeat: true }), true);
  assert.equal(cursorRow(draw()), "person-p3");
});

test("the next step is a column after State: its words and its day, the day marked once it has come, a row with none quiet, and the soonest first under the heading", async () => {
  const dayKey = (ms) => new Date(ms).toLocaleDateString("en-CA", { timeZone: ZONE });
  const today = dayKey(NOW);
  await freshPage({
    people: [
      // The later step first in the rows as they arrive, so only the sort can put the sooner one over it.
      person(1, { step_id: "s1", step_body: "Send the photos", step_due_on: dayKey(NOW + 3 * D) }),
      person(2),
      person(3, { step_id: "s3", step_body: "Call about the quote", step_due_on: today, step_for_me: true }),
    ],
  });
  const tree = draw();
  const cell = byTestId(rowOf(tree, "p3"), "row-next-step");
  assert.match(textOf(cell), /Call about the quote/, "the step's own words");
  assert.match(textOf(cell), /Due today/, "and its day in words, so a day that has come is not said by a colour alone");
  assert.equal(cell.props["data-due"], "today", "marked for the stylesheet once the day has come");
  assert.equal(
    byTestId(rowOf(tree, "p1"), "row-next-step").props["data-due"],
    "ahead",
    "a day ahead is not marked due",
  );
  assert.equal(textOf(byTestId(rowOf(tree, "p2"), "row-next-step")).trim(), "", "nothing where there is no step");
  // REGRESSION (8 Oct 2026): the step's box was classed cl-row-next, which is the next visit's day in the Visits cell
  // (clients.css, and e2e/people/people.spec.ts counts it there). One rule of that name then drew both, and the
  // visit's day broke onto a line of its own wherever a calendar was connected.
  const classes = (n) => String(n.props?.className || "").split(/\s+/);
  assert.equal(
    find(cell, (n) => classes(n).includes("cl-row-next")),
    null,
    "nothing in the step's cell wears the visit's class",
  );
  assert.ok(
    find(cell, (n) => classes(n).includes("cl-row-step-words")),
    "the step's words are named for the step, on the kit's two lines",
  );
  const order = (t) =>
    all(t, (n) => n.type === "tr" && /^person-/.test(String(n.props?.id || ""))).map((tr) => tr.props.id);
  sortByHeading(tree, "Next step");
  const first = draw();
  assert.deepEqual(
    order(first),
    ["person-p3", "person-p1", "person-p2"],
    "REGRESSION: the first press is the soonest step first (it was the latest), and a row with none is last",
  );
  sortByHeading(first, "Next step");
  assert.deepEqual(
    order(draw()),
    ["person-p1", "person-p3", "person-p2"],
    "pressed again, the latest first, and a row with none still last",
  );
});

test("Reach says the address where a reply goes by email, and its whole is in the tip, since the stylesheet may cut a long one", async () => {
  const address = "maria.fernandez@studio-example.com";
  await freshPage({
    people: [
      // A number and an address on file, and the last thing they wrote was an email: the reply goes there.
      person(1, { email: address, message_channels: ["whatsapp", "email"], last_inbound_channel: "email" }),
      person(2),
    ],
    // Reach is off until asked for (9 Oct 2026): the member has shown it.
    views: { people: { sortBy: "last", sortDir: "desc", columns: { reach: true } } },
  });
  const tree = draw();
  const reach = byTestId(rowOf(tree, "p1"), "row-reach");
  assert.match(textOf(reach), /Email/, "the wire they last wrote on");
  assert.ok(textOf(reach).includes(address), "over the address, not the number");
  assert.ok(String(reach.props.title).endsWith(address), "and the address whole in the tip");
  assert.doesNotMatch(
    String(byTestId(rowOf(tree, "p2"), "row-reach").props.title),
    /786/,
    "a number is never cut, so the tip does not say it again",
  );
});

test("the Columns menu is the kit's switches: it shows and hides columns, and Person always shows", async () => {
  await freshPage({
    people: [person(1, { came_from: "whatsapp" }), person(2)],
    lists: [{ id: "s1", name: "Regulars", ids: ["p1"] }],
  });
  let tree = draw();
  const menu = columnsMenu(tree);
  assert.equal(textOf(menu.props.trigger).trim(), "Columns");
  assert.equal(menu.props.trigger.props["data-testid"], "people-columns");
  // A desktop's table has a layout, so the menu holds how tall a row stands and the way back from the widths and places
  // first, where the way back is in sight, then the switches under their heading (a menu given no layout draws those alone).
  assert.deepEqual(
    menu.props.groups.map((g) => g.header),
    ["Row height", undefined, "Show on the table"],
    "the row height and the way back, then the switches under their heading",
  );
  assert.deepEqual(
    menu.props.groups[0].choose.options.map((o) => [o.value, o.label]),
    [
      ["comfortable", "Comfortable"],
      ["compact", "Compact"],
    ],
    "two heights to choose between",
  );
  assert.equal(menu.props.groups[0].choose.value, "comfortable", "comfortable until the member says otherwise");
  assert.deepEqual(
    menu.props.groups[1].items.map((i) => `${i.label}${i.disabled ? " (off)" : ""}`),
    ["Fit all columns", "Reset widths and order (off)", "Show default columns (off)"],
    "a fit for every column, and nothing to put back while no width, place or switch was changed",
  );
  assert.deepEqual(
    menuItems(tree),
    [
      { key: "name", on: true, locked: true },
      { key: "state", on: true, locked: false },
      { key: "next", on: true, locked: false },
      { key: "reach", on: false, locked: false },
      { key: "last", on: true, locked: false },
      { key: "receptionist", on: false, locked: false },
      { key: "offers", on: false, locked: false },
      { key: "came_from", on: false, locked: false },
      { key: "since", on: false, locked: false },
      { key: "phone", on: false, locked: false },
      { key: "email", on: false, locked: false },
      { key: "calls", on: false, locked: false },
      { key: "lists", on: false, locked: false },
      { key: "deal", on: false, locked: false },
    ],
    "every column this workspace can show, four of them on; Visits waits for a calendar",
  );
  assert.ok(!headings(tree).includes("Came from"), "off until asked for");
  flipColumn(tree, "came_from");
  tree = draw();
  assert.ok(headings(tree).includes("Came from"), "shown");
  assert.equal(menuItems(tree).find((c) => c.key === "came_from").on, true, "and its switch says so");
  flipColumn(tree, "lists");
  tree = draw();
  assert.deepEqual(headings(tree), ["Person", "State", "Next step", "Last contact", "Came from", "Lists"]);
  assert.equal(
    textOf(byTestId(rowOf(tree, "p1"), "row-lists")).trim(),
    "Regulars",
    "the lists kept by hand that they are on",
  );
  // Base UI refuses a press on a disabled switch; the page refuses the flip too, whoever asks.
  flipColumn(tree, "name");
  assert.ok(headings(draw()).includes("Person"), "Person cannot be hidden");
});

test("a Deal column waits in the Columns menu in every workspace, off until asked for, and wears the stage's pill", async () => {
  // Every workspace has deals (0008, amended 18 Oct 2026): the column is offered, off, and picked it says each row's
  // stage in the one pill.
  await freshPage({
    people: [
      person(1, {
        deal_id: "d1",
        deal_stage: "proposed",
        deal_service: "Ad management",
        deal_proposed_at: iso(6 * 86_400_000),
        deal_decided_at: null,
        deal_ended_at: null,
        deal_amount_cents: null,
        deal_per: null,
      }),
      person(2),
    ],
  });
  let tree = draw();
  assert.deepEqual(
    menuItems(tree).find((c) => c.key === "deal"),
    { key: "deal", on: false, locked: false },
    "offered, off",
  );
  assert.ok(!headings(tree).includes("Deal"), "off until asked for");
  flipColumn(tree, "deal");
  tree = draw();
  assert.ok(headings(tree).includes("Deal"));
  assert.equal(
    textOf(byTestId(rowOf(tree, "p1"), "row-deal")).trim(),
    "Proposal out",
    "the stage's word, the one pill",
  );
  assert.equal(textOf(byTestId(rowOf(tree, "p2"), "row-deal")).trim(), "", "nothing where no deal was recorded");
});

test("every workspace's People rows carry their deals, whatever the retired answer said: the row's line and Today's count read them, a search's rows too; the deal lists wait for a deal on file (0008, amended 18 Oct 2026)", async () => {
  const proposed = person(1, {
    deal_id: "d1",
    deal_stage: "proposed",
    deal_service: "Ad management",
    deal_proposed_at: iso(9 * 86_400_000),
    deal_decided_at: null,
    deal_ended_at: null,
    deal_amount_cents: 120000,
    deal_per: "once",
    deal_proposal_url: "https://docs.example.com/p/one",
    // Every open deal of theirs (0029).
    open_deals: [
      {
        id: "d1",
        stage: "proposed",
        service: "Ad management",
        proposed_at: iso(9 * 86_400_000),
        decided_at: null,
        ended_at: null,
        amount_cents: 120000,
        per: "once",
        currency: "USD",
        proposal_url: "https://docs.example.com/p/one",
        valid_until: null,
        lost_reason: null,
      },
    ],
    last_inbound_text: null,
  });
  for (const hasDeals of [true, false]) {
    await freshPage({ people: [proposed, person(2)], hasDeals });
    const P = globalThis.window.__PEOPLE;
    assert.equal(P.rows.find((r) => r.id === "p1").deal.stage, "proposed", `a deal on file: ${hasDeals}`);
    assert.equal(P.rows.find((r) => r.id === "p1").deal.proposal.url, "https://docs.example.com/p/one");
    assert.deepEqual(
      P.rows.find((r) => r.id === "p1").openDeals.map((d) => d.id),
      ["d1"],
    );
    assert.equal(P.attention.p1.sentence, "Proposal out · 9 d");
    assert.equal(
      P.lists.some((l) => l.id === "proposal_out"),
      hasDeals,
      "the deal lists wait for a deal on file",
    );
  }
  // A search's rows read the same.
  wire({ people: [], search: () => ({ people: [proposed], total: 1, has_more: false }) });
  const found = await peopleSearch("Person");
  assert.equal(found.rows[0].deal.stage, "proposed", "a search finds the deal too");
});

test("a view keeps its columns with its sort, and every save sends every key -- member_view_set replaces the page's whole object", async () => {
  const seen = await freshPage({
    people: [person(1)],
    views: { people: { sortBy: "name", sortDir: "asc", columns: { came_from: false, email: true } } },
  });
  let tree = draw();
  assert.deepEqual(
    headings(tree),
    ["Person", "State", "Next step", "Last contact", "Email"],
    "the member's own columns",
  );
  assert.deepEqual(savedViews(seen), [], "the view it already holds is not saved again");
  tree = draw();
  flipColumn(tree, "lists");
  tree = draw();
  assert.deepEqual(
    savedViews(seen).at(-1),
    // A choice the way its column's default has it (Came from off) is no choice, and goes from the view at its next save
    // (kit/table/columns.ts choicesFrom, decision 0083).
    ["people", { sortBy: "name", sortDir: "asc", columns: { email: true, lists: true } }],
    "a column change keeps the sort",
  );
  sortByHeading(tree, "State");
  draw();
  // One save at a time: the new sort goes once the column's save has landed.
  await until(() => seen.viewSaves.length === 2, "the sort's save went after the column's landed");
  assert.deepEqual(
    savedViews(seen).at(-1),
    ["people", { sortBy: "state", sortDir: "desc", columns: { email: true, lists: true } }],
    "and a new sort keeps the columns",
  );
});

test("with a calendar AI's word sits beside the state until its own column is shown -- then a desktop says it there, once, and a card keeps it beside the state", async () => {
  await freshPage({ people: [person(1, { queued_reply_at: iso(H) })], calendar: "ok" });
  const stateCell = (t) => find(t, (n) => n.type === "td" && /\bcl-state-cell\b/.test(n.props?.className || ""));
  let tree = draw();
  assert.match(textOf(stateCell(tree)), /reply waiting to go/, "beside the state");
  tree = draw();
  flipColumn(tree, "receptionist");
  tree = draw();
  assert.ok(headings(tree).includes("AI"), "in a column of its own");
  // Controller: after Task 3's review the mark always renders; a class hides it at 901px and up, where the column shows it,
  // so a phone card (which hides the Receptionist cell beside Visits) still says it.
  const mark = find(stateCell(tree), (n) => /cl-row-recept-mark/.test(n.props?.className || ""));
  assert.match(
    mark?.props?.className || "",
    /is-in-column/,
    "beside the state only where its column is off the screen: a card",
  );
});

test("the Columns menu open holds the rows still and keeps its Esc, which Base UI closes it with: the selection stays, and the next Esc clears it", async () => {
  await freshPage({ people: [person(1), person(2)] });
  byTestId(draw(), "select-all").props.onChange();
  draw();
  // The kit's popup as Base UI draws it open on the body: no page's overlay any more, so the page holds still behind it.
  setOverlayOpen({ role: "menu", inApp: false, className: "more-menu align-right" });
  assert.equal(press("j"), false, "J walks nothing behind the menu");
  assert.equal(cursorRow(draw()), null);
  assert.equal(press("Escape"), false, "the menu's Esc is its own");
  assert.match(textOf(byTestId(draw(), "bulk-bar")), /2 selected/, "and left the selection alone");
  setOverlayOpen(null);
  assert.equal(press("Escape"), true);
  assert.equal(byTestId(draw(), "bulk-bar"), null, "the next Esc clears it");
});

test("a saved view's columns are read with care -- only a true or false for a column a member may hide counts, and the next save drops the rest", async () => {
  // A view is the member's own JSON: an older page or another device may have written anything into it.
  const seen = await freshPage({
    people: [person(1)],
    views: {
      people: {
        sortBy: "last",
        sortDir: "desc",
        columns: { name: false, actions: false, came_from: "no", email: true, bogus: true },
      },
    },
  });
  const tree = draw();
  assert.deepEqual(
    headings(tree),
    ["Person", "State", "Next step", "Last contact", "Email"],
    "Person stays, and a word is not a false",
  );
  assert.ok(
    find(rowOf(tree, "p1"), (n) => n.type === "td" && /\bcl-actions-cell\b/.test(n.props?.className || "")),
    "and so do the row's actions",
  );
  assert.deepEqual(savedViews(seen), [], "what it could read of the view is what it holds: nothing to save");
  flipColumn(draw(), "lists");
  draw();
  assert.deepEqual(
    savedViews(seen).at(-1),
    ["people", { sortBy: "last", sortDir: "desc", columns: { email: true, lists: true } }],
    "the next save keeps what it understood",
  );
  for (const columns of [null, "email", ["email"], 7]) {
    await freshPage({ people: [person(1)], views: { people: { sortBy: "last", sortDir: "desc", columns } } });
    assert.deepEqual(
      headings(draw()),
      ["Person", "State", "Next step", "Last contact"],
      `${JSON.stringify(columns)} is no set of columns: the defaults`,
    );
  }
});

test("a view saves one at a time, and only the latest waits -- two in flight could land out of order and leave the older one on the member's row", async () => {
  const seen = await freshPage({ people: [person(1)], views: { people: { sortBy: "last", sortDir: "desc" } } });
  const calls = heldSaves(seen);
  flipColumn(draw(), "came_from");
  draw();
  flipColumn(draw(), "email");
  draw();
  assert.equal(calls.length, 1, "two quick toggles: the first goes, and the second waits for it to land");
  assert.deepEqual(calls[0].view.columns, { came_from: true });
  flipColumn(draw(), "lists");
  draw();
  assert.equal(calls.length, 1, "a third takes the second's place: only the latest waits");
  calls[0].land({ ok: true });
  await until(() => calls.length === 2, "the first landed, and one more went");
  assert.equal(calls.length, 2, "the first landed, and one more went");
  assert.equal(calls[1].page, "people");
  assert.deepEqual(
    calls[1].view,
    { sortBy: "last", sortDir: "desc", columns: { came_from: true, email: true, lists: true } },
    "the latest view, whole",
  );
  calls[1].land({ ok: true });
  await drained();
  await settle();
  assert.equal(calls.length, 2, "and nothing after it");
});

test("a save that fails is tried once more, unless a newer view is waiting to go -- a timeout dropped the last change", async () => {
  const seen = await freshPage({ people: [person(1)], views: { people: { sortBy: "last", sortDir: "desc" } } });
  const calls = heldSaves(seen);
  const errors = [];
  const error = console.error;
  console.error = (...a) => errors.push(a.join(" "));
  try {
    flipColumn(draw(), "email");
    draw();
    calls[0].land({ ok: false, message: "timed out" });
    await until(() => calls.length === 2, "tried once more");
    assert.equal(calls.length, 2, "tried once more");
    assert.deepEqual(calls[1].view, calls[0].view, "the same view");
    assert.deepEqual(errors, [], "and nothing said yet");
    calls[1].land({ ok: false, message: "timed out" });
    await until(() => errors.length > 0, "then it says the view was not saved");
    assert.equal(calls.length, 2, "only once");
    assert.equal(
      errors.filter((m) => m.startsWith("people_view_not_saved")).length,
      1,
      "then it says the view was not saved",
    );
    // A newer view waiting goes instead of a second try: it carries every key, the failed one's too.
    flipColumn(draw(), "lists");
    draw();
    flipColumn(draw(), "came_from");
    draw();
    assert.equal(calls.length, 3, "one at a time");
    calls[2].land({ ok: false, message: "timed out" });
    await until(() => calls.length === 4, "the newer view went instead of a second try");
    assert.equal(calls.length, 4);
    assert.deepEqual(
      calls[3].view.columns,
      { email: true, lists: true, came_from: true },
      "the newer view, not the failed one again",
    );
    calls[3].land({ ok: true });
    await drained();
    await settle();
    assert.equal(calls.length, 4, "and nothing after it");
    assert.equal(errors.length, 1, "a failed view a newer one replaced is no view lost");
  } finally {
    console.error = error;
  }
});

test("a phone draws no Columns menu: its cards are not columns, and the kit's menu leaves with the desk's controls, so none is left open where nobody can see it", async () => {
  await freshPage({ people: [person(1), person(2)] });
  assert.ok(columnsMenu(draw()), "on a desktop");
  await onPhone(async () => {
    await freshPage({ people: [person(1), person(2)] });
    assert.equal(columnsMenu(draw()), null, "none on a phone");
  });
});

test("a column put back the way its default has it is no choice any more -- AI, turned on and off again, leaves nothing to keep, and Visits shows once a calendar connects", async () => {
  const seen = await freshPage({ people: [person(1)], views: { people: { sortBy: "last", sortDir: "desc" } } });
  const saves = () => savedViews(seen).map(([, view]) => view);
  flipColumn(draw(), "receptionist");
  draw();
  await until(() => seen.viewSaves.length === 1, "the choice was saved");
  assert.deepEqual(saves().at(-1).columns, { receptionist: true }, "on: the member's choice (it is off by default)");
  await drained();
  flipColumn(draw(), "receptionist");
  draw();
  await until(() => seen.viewSaves.length === 2, "the choice put back was saved");
  assert.deepEqual(saves().at(-1).columns, {}, "off again, as it is by default: nothing left to keep");
  await freshPage({ people: [person(1)], calendar: "ok", views: { people: saves().at(-1) } });
  assert.deepEqual(
    headings(draw()),
    ["Person", "State", "Next step", "Last contact", "Appointments"],
    "a calendar connects, and Visits shows, as it does for everyone",
  );
});

test("with a calendar the menu offers Visits, shown, and AI, hidden; a Visits hidden stays hidden through a calendar outage and rides in every save", async () => {
  let seen = await freshPage({
    people: [person(1)],
    calendar: "ok",
    views: { people: { sortBy: "last", sortDir: "desc" } },
  });
  const saves = () => savedViews(seen).map(([, view]) => view);
  let tree = draw();
  assert.deepEqual(
    menuItems(tree).map((c) => [c.key, c.on]),
    [
      ["name", true],
      ["state", true],
      ["next", true],
      ["reach", false],
      ["last", true],
      ["visits", true],
      ["receptionist", false],
      ["offers", false],
      ["came_from", false],
      ["since", false],
      ["phone", false],
      ["email", false],
      ["calls", false],
      ["lists", false],
      ["deal", false],
    ],
    "the visit shows; AI waits in the menu",
  );
  flipColumn(tree, "visits");
  draw();
  await until(() => seen.viewSaves.length === 1, "the choice was saved");
  const hidden = saves().at(-1);
  assert.deepEqual(hidden.columns, { visits: false });
  // The calendar stops answering: Visits cannot show and the menu does not offer it, but the choice is kept.
  seen = await freshPage({ people: [person(1)], calendar: "unavailable", views: { people: hidden } });
  tree = draw();
  assert.ok(!headings(tree).includes("Appointments"));
  assert.ok(!menuItems(tree).some((c) => c.key === "visits"), "the menu offers what this workspace can show now");
  flipColumn(tree, "email");
  draw();
  await until(() => seen.viewSaves.length === 1, "the choice was saved");
  assert.deepEqual(
    saves().at(-1).columns,
    { visits: false, email: true },
    "a save while it is down keeps the hidden Visits",
  );
  await freshPage({ people: [person(1)], calendar: "ok", views: { people: saves().at(-1) } });
  assert.deepEqual(
    headings(draw()),
    ["Person", "State", "Next step", "Last contact", "Email"],
    "back up, and Visits is still hidden, as chosen",
  );
});

test("REGRESSION: Back keeps the columns a member chose -- People mounted again read the surface's view from before the save, and the next save wrote the old columns to the server", async () => {
  // A member whose view this page has saved before, columns and all.
  const seen = await freshPage({
    people: [person(1), person(2)],
    views: { people: { sortBy: "last", sortDir: "desc", columns: {} } },
  });
  // The bridge's own save over the wire: the save itself keeps the surface's copy in step.
  flipColumn(draw(), "came_from");
  draw();
  await until(() => seen.viewSaves.length === 1, "the column's save went");
  await drained();
  assert.deepEqual(
    seen.viewSaves,
    [{ page: "people", view: { sortBy: "last", sortDir: "desc", columns: { came_from: true } } }],
    "the save landed",
  );
  // A profile opens, so the list goes; Back mounts it again, and it reads the surface as it stands.
  setCells([]);
  const tree = draw();
  assert.ok(headings(tree).includes("Came from"), "REGRESSION: the column the member showed went away");
  assert.deepEqual(
    JSON.parse(globalThis.localStorage.getItem("chanlytics-people-view")).columns,
    { came_from: true },
    "REGRESSION: and this device's copy was written over with the old columns",
  );
  sortByHeading(tree, "State");
  draw();
  await until(() => seen.viewSaves.length === 2, "the sort's save went");
  assert.deepEqual(
    seen.viewSaves.at(-1),
    { page: "people", view: { sortBy: "state", sortDir: "desc", columns: { came_from: true } } },
    "REGRESSION: a sort afterwards sent the columns from before, and the server lost the choice",
  );
});

test("REGRESSION: a save made while People is being read is not undone by the read -- the read brought the old view back, Back showed the column again, and the next sort saved the old columns", async () => {
  const seen = await freshPage({
    people: [person(1), person(2)],
    views: { people: { sortBy: "last", sortDir: "desc", columns: {} } },
  });
  // A read of People goes out (a new message, the tab shown again, a load), and the server answers it with the view
  // it held before the save below.
  const reading = peopleOverride.apply();
  flipColumn(draw(), "came_from");
  draw();
  await reading;
  await until(() => seen.viewSaves.length === 1, "the column's save went");
  await drained();
  assert.deepEqual(
    seen.viewSaves.map((s) => s.view.columns),
    [{ came_from: true }],
    "the save went while the read was out",
  );
  setCells([]);
  const tree = draw();
  assert.ok(headings(tree).includes("Came from"), "REGRESSION: the read took the column away");
  sortByHeading(tree, "State");
  draw();
  await until(() => seen.viewSaves.length === 2, "the sort's save went");
  assert.deepEqual(
    seen.viewSaves.at(-1).view,
    { sortBy: "state", sortDir: "desc", columns: { came_from: true } },
    "REGRESSION: and the next sort saved the old columns",
  );
});

test("a read of People that overlapped no save takes the server's view -- another device's change shows", async () => {
  const people = [person(1), person(2)];
  const seen = await freshPage({ people, views: { people: { sortBy: "last", sortDir: "desc", columns: {} } } });
  flipColumn(draw(), "came_from");
  draw();
  // Landed before the other device's change is read: this read overlaps no save.
  await until(() => seen.viewSaves.length === 1, "the column's save went");
  await drained();
  // Later, on another device, the member shows Email and sorts by name; this tab reads People again.
  wire({ people, views: { people: { sortBy: "name", sortDir: "asc", columns: { email: true } } } });
  await peopleOverride.apply();
  setCells([]);
  assert.deepEqual(
    headings(draw()),
    ["Person", "State", "Next step", "Last contact", "Email"],
    "the other device's columns, not this tab's last save",
  );
});
