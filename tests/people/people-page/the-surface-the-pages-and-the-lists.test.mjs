/**
 * People's surface on every page, its pages, and the lists on People (#563).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { until } from "../../shared/_until.mjs";
import { lineBox } from "../../shared/_line.mjs";
import {
  H,
  PersonLists,
  all,
  barMenuOf,
  byTestId,
  click,
  draw,
  find,
  flashes,
  frames,
  freshPage,
  iso,
  itemOf,
  opened,
  peeked,
  peopleOverride,
  peopleSearch,
  person,
  press,
  quietly,
  routeNow,
  searchLanded,
  setCells,
  textOf,
  toastAfter,
  went,
  wire,
  wrote,
} from "./_people-page.mjs";

/* --------------------------- the surface, every page --------------------------- */

test("REGRESSION (B7): People reads every page before it counts -- a list, a count and a search covered the first thousand", async () => {
  const seen = wire({
    people: [person(1), person(2), person(3)],
    per: 2,
    lists: [{ id: "s1", name: "Regulars", ids: ["p1", "p3"] }],
  });
  await peopleOverride.apply();
  const P = globalThis.window.__PEOPLE;
  assert.deepEqual(seen.offsets, [0, 2], "the second page was read before anything was counted");
  assert.equal(P.rows.length, 3, "REGRESSION: the rows were the first page, and a refresh put them back to it");
  assert.equal(
    P.saved.find((s) => s.id === "s1").count,
    2,
    "REGRESSION: a saved list counted only the people on the first page",
  );
  assert.equal(P.lists.find((l) => l.id === "opted_in").count, 3, "a smart list counts everyone");
  assert.equal(P.page.has_more, false, "nothing left to show more of");
});

test("past fifty pages the surface stops and says more follow, and a search answers with whether the server holds more matches than it sent", async () => {
  const seen = wire({
    people: Array.from({ length: 60 }, (_, i) => person(i)),
    per: 1,
    search: () => ({ people: [person(99, { display_name: "Rosa Far" })], total: 1400, has_more: true }),
  });
  await peopleOverride.apply();
  assert.equal(seen.offsets.length, 50, "a chain of pages that never ends cannot hang the surface");
  assert.equal(globalThis.window.__PEOPLE.page.has_more, true);
  const r = await peopleSearch("rosa");
  assert.deepEqual(
    r.rows.map((p) => p.id),
    ["p99"],
  );
  assert.equal(r.more, true, "the first thousand matches, and the page can say so");
});

test("REGRESSION (B27): a saved-lists read that fails leaves People standing and says so -- it took People, every profile and Lists down", async () => {
  wire({ people: [person(1)], listsFail: true });
  await quietly(() => peopleOverride.apply());
  const P = globalThis.window.__PEOPLE;
  assert.equal(P.rows.length, 1, "the people are there");
  assert.equal(P.savedRead, false);
  assert.deepEqual(P.saved, []);
  wire({ people: [person(1)], lists: [] });
  await peopleOverride.apply();
  assert.equal(globalThis.window.__PEOPLE.savedRead, true, "a read that lands, even of no lists, is read");
});

test("a saved list keeps every member the server holds, for an Undo, and counts only the people still here", async () => {
  wire({ people: [person(1)], lists: [{ id: "s1", name: "Regulars", ids: ["p1", "p-erased"] }] });
  await peopleOverride.apply();
  const s1 = globalThis.window.__PEOPLE.saved[0];
  assert.deepEqual([s1.count, s1.ids], [1, ["p1"]], "an erased person never counts");
  assert.deepEqual(s1.members, ["p1", "p-erased"], "who is on it, as the server keeps it");
});

test("a refresh keeps every row, list and need that did not change as the object it was, so the table draws again only what moved", async () => {
  // Every refresh built every row anew and the table's row memo never held: one person's new message drew the whole
  // table again (5 Oct 2026; surface-values.ts shareUnchanged).
  const lists = [{ id: "s1", name: "Regulars", ids: ["p1", "p3"] }];
  wire({ people: [person(1), person(2), person(3)], lists });
  await peopleOverride.apply();
  const before = globalThis.window.__PEOPLE;
  wire({ people: [person(1), person(2, { display_name: "Rosa Changed" }), person(3)], lists });
  await peopleOverride.apply();
  const after = globalThis.window.__PEOPLE;
  const row = (P, id) => P.rows.find((r) => r.id === id);
  assert.notEqual(after, before, "what was published is new: something changed");
  assert.equal(row(after, "p1"), row(before, "p1"), "a person who did not change is the row they were");
  assert.equal(row(after, "p3"), row(before, "p3"));
  assert.notEqual(row(after, "p2"), row(before, "p2"), "the one who changed is a new row");
  assert.equal(row(after, "p2").name, "Rosa Changed");
  assert.equal(after.attention.p1, before.attention.p1, "and what each unchanged person needs is what it was");
  assert.equal(after.saved, before.saved, "the lists, unchanged, are the lists they were");
  // Read again with nothing changed: the rows and the needs are the very objects the table already drew.
  await peopleOverride.apply();
  assert.equal(globalThis.window.__PEOPLE.rows, after.rows);
  assert.equal(globalThis.window.__PEOPLE.attention, after.attention);
});

test("REGRESSION (B14): Enter or Space on a focused button presses that button -- it opened the profile under the cursor instead", async () => {
  await freshPage({ people: [person(1), person(2)] });
  draw();
  press("ArrowDown");
  draw();
  const button = {
    tagName: "BUTTON",
    isContentEditable: false,
    closest: (sel) => (/\bbutton\b/.test(sel) ? {} : null),
  };
  assert.equal(press("Enter", button), false, "the button keeps its Enter");
  assert.deepEqual(opened, [], "REGRESSION: Enter on a focused button opened a profile");
  press(" ", button);
  assert.equal(byTestId(draw(), "bulk-bar"), null, "and Space on it selects nobody");
  const onRow = { tagName: "TR", isContentEditable: false, closest: () => null };
  assert.equal(press("Enter", onRow), true);
  assert.equal(peeked(), "Preview of Person 1", "away from a button, Enter still opens the person under the cursor");
});

test("REGRESSION (B22): a list made on the rail says so and is the one shown -- the rail closed with no word", async () => {
  const seen = await freshPage({ people: [person(1)] });
  seen.answer = ({ method, route, body }) =>
    method === "POST" && route === "segments" ? { id: "s9", name: body.name, ids: [] } : undefined;
  let tree = draw();
  const rail = find(tree, (n) => typeof n.props?.onCreateList === "function");
  const r = await rail.props.onCreateList("Regulars");
  assert.deepEqual(
    wrote(seen),
    [["POST", "segments", { name: "Regulars" }]],
    "the verb asked for the list by its name",
  );
  assert.equal(r.ok, true, "the rail still hears the answer, to show a refusal where the name was typed");
  assert.ok(
    flashes.some((f) => textOf(f.msg).includes("Regulars")),
    `REGRESSION: nothing said the list was made: ${JSON.stringify(flashes.map((f) => textOf(f.msg)))}`,
  );
  // The surface re-reads after the write; here the list arrives as the server keeps it.
  globalThis.window.__PEOPLE.saved = [{ id: "s9", name: "Regulars", count: 0, ids: [], members: [] }];
  tree = draw();
  const chip = byTestId(tree, "saved-filter");
  assert.ok(chip && textOf(chip).includes("Regulars"), "the new list is the one shown");
});

test("an archived list leaves the rail for one quiet line, and one press brings it back (00169, decision 0009)", async () => {
  const seen = await freshPage({
    people: [person(1)],
    lists: [
      { id: "s1", name: "Regulars", ids: ["p1"] },
      { id: "s2", name: "VIP", ids: ["p1"], archived_at: "2026-09-20T12:00:00.000Z" },
    ],
  });
  const P = globalThis.window.__PEOPLE;
  assert.deepEqual(
    P.saved.map((l) => l.id),
    ["s1"],
    "off the rail",
  );
  assert.deepEqual(P.archived, [{ id: "s2", name: "VIP" }]);
  const line = byTestId(draw(), "rail-archived");
  assert.ok(line && /Archived:\s*VIP/.test(textOf(line)), line && textOf(line));
  await toastAfter(() => byTestId(line, "rail-restore").props.onClick(), "the list is back");
  assert.deepEqual(wrote(seen), [["PUT", "segments/s2", { archived: false }]], "the list is put back by its own route");
  assert.match(textOf(flashes.at(-1).msg), /^VIP is back on your lists/);
});

test("REGRESSION: adding people to a list counts who was added, and Undo takes only them off -- it counted everyone selected and could not be undone", async () => {
  const seen = await freshPage({
    people: [person(1), person(2), person(3)],
    lists: [{ id: "s1", name: "Regulars", ids: ["p1"] }],
  });
  let tree = draw();
  byTestId(tree, "select-all").props.onChange();
  tree = draw();
  const regulars = itemOf(barMenuOf(tree, "Add to list"), "Regulars");
  const toast = await toastAfter(() => regulars.onClick(), "who was added");
  assert.match(
    textOf(toast.msg),
    /^2 added to Regulars/,
    `REGRESSION: the count took in the person already on it: ${textOf(toast.msg)}`,
  );
  assert.deepEqual(wrote(seen)[0], ["PUT", "segments/s1", { add: ["p2", "p3"] }]);
  assert.equal(typeof toast.undo, "function", "the add can be undone");
  await toast.undo();
  assert.deepEqual(
    wrote(seen)[1],
    ["PUT", "segments/s1", { remove: ["p2", "p3"] }],
    "Undo takes off only the people this added",
  );
});

test("REGRESSION (B4): a yes recorded for more than fifty goes for fifty, says so, and keeps the rest selected -- the rest were dropped without a word", async () => {
  const seen = await freshPage({ people: Array.from({ length: 60 }, (_, i) => person(i)) });
  let tree = draw();
  byTestId(tree, "select-all").props.onChange();
  tree = draw();
  const way = barMenuOf(tree, "Messages").props.items.find((i) => i.label && !i.header);
  await toastAfter(() => way.onClick(), "the yes for fifty");
  const [yes] = wrote(seen);
  assert.deepEqual([yes[0], yes[1]], ["PUT", "contacts/consent"], "the batch door of the yes to messages");
  assert.equal(yes[2].ids.length, 50, "fifty went: the batch door takes fifty at a time");
  const said = textOf(flashes.at(-1).msg);
  assert.ok(
    said.includes("10 more still selected"),
    `REGRESSION: the ten past fifty were dropped without a word: ${said}`,
  );
  tree = draw();
  assert.ok(
    textOf(byTestId(tree, "bulk-bar")).includes("10 selected"),
    "the ten stay selected, one press from the next fifty",
  );
});

// The rail is one kit for both scopes (RailSection, RailRow, railToggle: surfaces/people/rail/rail-kit.tsx); Leads draws its lists and
// searches with the same rows. Run here: the Saved section, and the one-at-a-time pick both scopes share.
test("the rail's Saved section draws each kept list as a rail row, and the rail picks one row at a time: a pick replaces the last, pressed again shows everyone", async () => {
  await freshPage({
    people: [person(1), person(2)],
    lists: [
      { id: "s1", name: "Regulars", ids: ["p1"] },
      { id: "s2", name: "Walk-ins", ids: ["p2"] },
    ],
  });
  // The stub tree reaches a row through its parent's children and its parent's drawing both: each is counted once.
  const railRows = (tree) => [
    ...new Set(
      all(
        tree,
        (n) =>
          n.type === "button" &&
          String(n.props?.className || "")
            .split(" ")
            .includes("cl-rail-row"),
      ),
    ),
  ];
  const press = (b) => b.props.onClick({ stopPropagation() {}, preventDefault() {} });
  const savedRows = () => railRows(byTestId(draw(), "saved-lists"));
  assert.deepEqual(
    savedRows().map((b) => textOf(b)),
    ["Regulars1", "Walk-ins1"],
    "each kept list, its name and who is still on it",
  );
  const current = () =>
    railRows(draw())
      .filter((b) => b.props["aria-current"] === "true")
      .map((b) => textOf(b));
  assert.deepEqual(
    current().map((t) => t.replace(/\d+$/, "")),
    ["Everyone"],
    "nothing is picked: the rail's Everyone row is current (canvas P1)",
  );
  press(savedRows()[0]);
  assert.deepEqual(current(), ["Regulars1"], "one row picked, and a screen reader hears which");
  press(savedRows()[1]);
  assert.deepEqual(current(), ["Walk-ins1"], "a pick replaces the last");
  const smart = railRows(draw()).find((b) => b.props.className.split(" ").includes("smart"));
  assert.ok(smart, "the smart lists are rail rows too");
  // Every smart list stands in its group (RailGroup, rail-group-<id>), as the rail's groups say.
  const isSmart = (b) => b.props.className.split(" ").includes("smart");
  const groups = [
    ...new Set(
      all(draw(), (n) => n.type === "div" && String(n.props?.["data-testid"] || "").startsWith("rail-group-")),
    ),
  ];
  assert.ok(groups.length > 0, "the smart lists are grouped");
  assert.equal(
    groups.reduce((k, g) => k + railRows(g).filter(isSmart).length, 0),
    railRows(draw()).filter(isSmart).length,
    "and none stands outside a group",
  );
  press(smart);
  assert.deepEqual(current(), [textOf(smart)], "a smart list replaces a kept one, as a kept one replaces a smart one");
  press(railRows(draw()).find((b) => b.props["aria-current"] === "true"));
  assert.deepEqual(
    current().map((t) => t.replace(/\d+$/, "")),
    ["Everyone"],
    "the picked row pressed again: everyone, the rail's first row current again",
  );
});

test("a selection never outlives its view, and does outlive a search: a list picked on the rail drops it, words typed in the box do not", async () => {
  await freshPage({ people: [person(1), person(2)], lists: [{ id: "s1", name: "Regulars", ids: ["p1"] }] });
  const railRows = (tree) => [
    ...new Set(
      all(
        tree,
        (n) =>
          n.type === "button" &&
          String(n.props?.className || "")
            .split(" ")
            .includes("cl-rail-row"),
      ),
    ),
  ];
  const box = () => lineBox();
  byTestId(draw(), "select-all").props.onChange();
  assert.ok(byTestId(draw(), "bulk-bar"), "everyone shown is selected");
  box(draw()).props.onChange({ target: { value: "zz-nobody" } });
  draw();
  box(draw()).props.onChange({ target: { value: "" } });
  draw();
  assert.ok(byTestId(draw(), "bulk-bar"), "REGRESSION: one letter in the box dropped everything selected");
  railRows(byTestId(draw(), "saved-lists"))[0].props.onClick({ stopPropagation() {}, preventDefault() {} });
  draw();
  assert.equal(
    byTestId(draw(), "bulk-bar"),
    null,
    "another view: a bar counting people who are no longer on screen is what bulk acts go wrong with",
  );
});

test("REGRESSION: the rail's 'Can receive offers' says it needs a number -- its tip read 'Said yes to OFFERS', beside a count that leaves out a yes with no number to send to", async () => {
  await freshPage({ people: [person(1)] });
  const rows = all(
    draw(),
    (n) =>
      n.type === "button" &&
      String(n.props?.className || "")
        .split(" ")
        .includes("cl-rail-row"),
  );
  const offers = rows.find((b) => textOf(b).startsWith("Can receive offers"));
  assert.ok(offers, "the list is on the rail");
  assert.ok(
    String(offers.props["data-tip"]).includes("Said yes to OFFERS, separately, with a number to send to"),
    `REGRESSION: ${offers.props["data-tip"]}`,
  );
});

test("REGRESSION (B27): lists that could not be read say so on the rail, the profile and Lists, and the people stay", async () => {
  await freshPage({ people: [person(1)], listsFail: true });
  let tree = draw();
  assert.ok(byTestId(tree, "people-lists-failed"), "the rail's Saved section says the lists could not be read");
  assert.equal(all(tree, (n) => n.props?.["data-testid"] === "row-select").length, 1, "the people are drawn");
  byTestId(tree, "select-all").props.onChange();
  tree = draw();
  assert.deepEqual(
    barMenuOf(tree, "Add to list").props.items.map((i) => i.header || i.label),
    ["Your saved lists couldn't be read", "New list…"],
    "no list is offered that could not be read",
  );
  assert.equal(typeof PersonLists, "function", "the profile's lists can be drawn on their own");
  setCells([]);
  frames.begin();
  const onProfile = PersonLists({ personId: "p1", canEdit: true, first: "Person", flash: () => {} });
  assert.ok(byTestId(onProfile, "person-lists-failed"), 'the profile says so, instead of "No lists yet"');
});

test("REGRESSION (B6): past everyone loaded, a search keeps the loaded people its words match and says what it searched -- the server's matches replaced them", async () => {
  const seen = await freshPage({
    people: [
      person(1, { last_inbound_text: "Can I book a trim on Saturday?" }),
      person(2, { last_inbound_text: "Thanks, see you then" }),
    ],
    // Past everyone loaded, the server finds Saturday Jones (the route the box asks: GET contacts?q=).
    search: () => ({ people: [person(99, { display_name: "Saturday Jones" })], total: 1, has_more: false }),
  });
  globalThis.window.__PEOPLE.page = { ...globalThis.window.__PEOPLE.page, total: 60000, has_more: true };
  draw();
  lineBox().props.onChange({
    target: { value: "saturday" },
  });
  draw();
  await searchLanded(seen, 0);
  assert.deepEqual(seen.queries, ["saturday"], "the box asked the server once, for its words");
  let tree = draw();
  const names = all(tree, (n) => n.props?.["data-testid"] === "row-select").map((n) => n.props["aria-label"]);
  assert.ok(names.includes("Select Saturday Jones"), `the server's match is shown: ${names}`);
  assert.ok(
    names.includes("Select Person 1"),
    `REGRESSION: a loaded person matched by their last words vanished: ${names}`,
  );
  assert.match(textOf(byTestId(tree, "people-more")), /names and numbers searched across everyone/);
  assert.ok(textOf(tree).includes("Showing 2 of 60000"), "the foot counts against everyone, not the rows in hand");

  seen.search = () => ({ fail: "That search is too long." });
  lineBox().props.onChange({
    target: { value: "saturday!" },
  });
  draw();
  await searchLanded(seen, 1);
  tree = draw();
  assert.match(
    textOf(byTestId(tree, "people-more")),
    /couldn't search past/,
    "a search that could not ask the server says so",
  );
});

test("REGRESSION: past a page of people, the line under the table stands in the table's gutter -- its own padding put its words at the pane's edge", async () => {
  await freshPage({ people: [person(1), person(2)] });
  globalThis.window.__PEOPLE.page = { ...globalThis.window.__PEOPLE.page, total: 1240, has_more: true };
  const more = byTestId(draw(), "people-more");
  assert.ok(more, "more people than a page: the line is drawn");
  assert.equal(textOf(more), "2 of 1,240 loaded Show more", "the count, then the one button");
  assert.equal(more.props.children.at(-1), byTestId(more, "people-more-btn"), "the button ends the line");
  // The gutter is People's stylesheet's (.pl-more: 28px, 16px at 900px and under, as the standing line and the
  // table's wrap have it), and nothing on the line says otherwise.
  assert.ok(String(more.props.className).split(/\s+/).includes("pl-more"), "the line takes People's gutter");
  assert.equal(
    more.props.style,
    undefined,
    "REGRESSION: an inline padding of 8px 0 16px set the sides to 0, 28px left of the table on a desktop and 16px on a phone",
  );
});

test("REGRESSION: People opens on the people -- one line, then the table; a title, two sentences, four stat cards and a five-tab strip stood in front of them", async () => {
  await freshPage({
    people: [
      person(1, {
        needs_human: true,
        open_escalation_reason: "human_token",
        open_escalation_since: iso(3 * H),
        latest_state: "needs_human",
      }),
      person(2, {
        needs_human: true,
        open_escalation_reason: "callback",
        open_escalation_since: iso(H),
        latest_state: "needs_human",
      }),
      person(3),
    ],
  });
  let tree = draw();
  const cls = (n) => String(n.props?.className || "");

  // The one line: the count, who needs a person, and the week.
  const standing = byTestId(tree, "people-standing");
  assert.ok(standing, "the page opens on its one line");
  assert.match(textOf(standing), /3 people/);
  assert.match(textOf(standing), /2 need you/);

  // What stood in front of the table.
  assert.ok(!byTestId(tree, "attention-strip"), "REGRESSION: five tabs, three rows and a footer above the table");
  assert.ok(
    !byTestId(tree, "attention-tab-needs_you"),
    "REGRESSION: a tab counting what the rail and the rows already count",
  );
  assert.ok(!find(tree, (n) => cls(n).includes("cl-head-stats")), "REGRESSION: four stat cards");
  assert.ok(
    !find(tree, (n) => cls(n).includes("cl-page-title")),
    "REGRESSION: a page title under a top bar that says People",
  );
  const said = textOf(tree);
  assert.ok(!said.includes("AI handles the routine"), "REGRESSION: the page explained itself on every visit");
  assert.ok(!said.includes("the strip above"), "REGRESSION: the page explained its own furniture");

  // The two who need a person are in the table, once, with their state on the row.
  const rows = all(tree, (n) => n.props?.["data-testid"] === "row-select").map((n) => n.props["aria-label"]);
  assert.deepEqual(rows.length, 3, `everyone is in the table: ${rows}`);
  assert.equal(
    rows.filter((r) => r === "Select Person 1").length,
    1,
    "REGRESSION: the strip drew the table's own first rows over again",
  );
  assert.ok(
    all(tree, (n) => n.props?.["data-testid"] === "row-state-detail").length >= 2,
    "each row says its own state",
  );

  // The count in the line is the tap that shows them, because a phone has no rail.
  byTestId(tree, "people-standing-needs").props.onClick();
  tree = draw();
  assert.deepEqual(
    all(tree, (n) => n.props?.["data-testid"] === "row-select").map((n) => n.props["aria-label"]),
    ["Select Person 1", "Select Person 2"],
    "tapping the count shows the people it counts",
  );
  assert.equal(byTestId(tree, "people-standing-needs").props["aria-pressed"], true, "and says it is on");
  // Needs you is a list (decision 0009): the tap opens it, by name and by its own address.
  assert.equal(textOf(byTestId(tree, "smart-filter")), "Needs you");
  assert.equal(routeNow(), "clients/seg:needs_you");
  byTestId(tree, "people-standing-needs").props.onClick();
  tree = draw();
  assert.equal(all(tree, (n) => n.props?.["data-testid"] === "row-select").length, 3, "tapping again shows everyone");
});

test("a day nobody needs you says the count and the week, and offers no tap", async () => {
  await freshPage({ people: [person(1), person(2)] });
  const standing = byTestId(draw(), "people-standing");
  assert.match(textOf(standing), /2 people/);
  assert.ok(!textOf(standing).includes("need you"), "nothing claims your attention when nothing does");
  assert.ok(!byTestId(draw(), "people-standing-needs"), "and there is no button to press");
});

test("a list kept by hand is the page's title when open, with its rename, its delete and its one door -- the Lists page held them over a second table of the same people", async () => {
  // Person 1 said yes to offers (the fixture's default); person 2 was never asked.
  const seen = await freshPage({
    people: [
      person(1),
      person(2, { marketing_consent: "unknown", marketing_consent_source: null, marketing_consent_updated_at: null }),
    ],
    lists: [{ id: "s1", name: "Regulars", ids: ["p1", "p2"] }],
  });
  let tree = draw({ initialSaved: "s1" });
  const title = byTestId(tree, "saved-filter");
  assert.ok(title && textOf(title).includes("Regulars"), "the list is the title");
  assert.ok(
    !all(tree, (n) => n.props?.className === "cl-section-title").some((n) => textOf(n) === "Everyone"),
    "REGRESSION: Everyone, with the list as a chip beside it",
  );
  const step = byTestId(tree, "list-action");
  assert.ok(step, "a kept list has its one door, as a smart list has its step");
  assert.match(textOf(step), /1 of 2 on this list said yes to offers/, textOf(step));
  const cta = find(step, (n) => n.type === "button");
  assert.equal(textOf(cta).trim(), "Send them a message");
  went.length = 0;
  click(cta);
  assert.deepEqual(went, ["campaigns/sequences/new:once:to:s1"], "and it opens New's Send once on this list");
  // Renamed where the name is: the title is its own box (kit/record/in-place.tsx), its words as the browser says them.
  click(byTestId(tree, "list-rename"));
  byTestId(draw({ initialSaved: "s1" }), "list-rename-name").props.onFocus({ currentTarget: {} });
  const named = { currentTarget: { textContent: "VIP regulars" } };
  byTestId(draw({ initialSaved: "s1" }), "list-rename-name").props.onInput(named);
  byTestId(draw({ initialSaved: "s1" }), "list-rename-save").props.onClick();
  await until(() => flashes.some((f) => textOf(f.msg).includes("VIP regulars")), "the rename was said");
  assert.deepEqual(wrote(seen), [["PUT", "segments/s1", { name: "VIP regulars" }]]);
  // One person off, from the row, with Undo.
  tree = draw({ initialSaved: "s1" });
  const drop = byTestId(tree, "row-drop-list");
  assert.ok(drop, "each row can leave the list");
  // The row's button hands the drop to the page and answers nothing (cells-hook.ts onDrop), so the verb's answer is waited for.
  drop.props.onClick();
  await until(() => flashes.at(-1)?.undo, "the toast said the person is off the list");
  assert.deepEqual(wrote(seen).at(-1), ["PUT", "segments/s1", { remove: ["p1"] }]);
  assert.ok(flashes.at(-1).undo, "and Undo puts them back");
  assert.ok(byTestId(tree, "delete-list"), "the delete on the same line");
  click(byTestId(tree, "show-everyone"));
  tree = draw({ initialSaved: "s1" });
  assert.ok(
    all(tree, (n) => n.props?.className === "cl-section-title").some((n) => textOf(n) === "Everyone"),
    "Show everyone",
  );
  assert.equal(byTestId(tree, "row-drop-list"), null, "and nobody can be taken off a list that is not open");
});
