/**
 * People's table, as the kit draws it (decision 0083): what is People's own over the kit's table — its columns'
 * defaults and words, how its headings sort (the unnamed last, ties to the most recent contact, First contact and Deal),
 * and the words a search that finds nobody says. The table itself, its window of rows, its groups and its widths are the
 * kit's, held by tests/table/; the order over every heading, way, view and words is held to the engine that left by
 * tests/table/table-goldens.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact } from "../_legacy-react.mjs";
import { importSrc } from "../_source.mjs";
import { peopleOrder } from "./_people-shown.mjs";
import { personRow, daysAgo } from "../consent/_person-row.mjs";

installLegacyReact();
const { PL_COLUMNS, PL_CARD, PL_FILE_COLUMNS } = await importSrc(
  "apps/dashboard/src/surfaces/people/cells/columns.tsx",
);
const { plSortThen } = await importSrc("apps/dashboard/src/surfaces/people/cells/sorts.ts");
const { columnOptionsOf, columnsIn, firstDirOf, visibilityOf } = await importSrc(
  "apps/dashboard/src/surfaces/kit/table/columns.ts",
);
const shownBy = await peopleOrder();

test("People's columns: Person fills and is never hidden, four show until turned off, Visits needs a calendar, a sort's own column is never offered", () => {
  const person = PL_COLUMNS.find((c) => c.key === "name");
  assert.equal(person.fill, true, "Person takes the room the others leave, and stays at the left edge");
  const shown = (x) =>
    columnOptionsOf(columnsIn(PL_COLUMNS, x), visibilityOf(PL_COLUMNS, {}))
      .filter((o) => o.on)
      .map((o) => o.key);
  assert.deepEqual(shown({ withCalendar: false }), ["name", "state", "next", "last"]);
  assert.deepEqual(shown({ withCalendar: true }), ["name", "state", "next", "last", "visits"]);
  assert.equal(
    columnOptionsOf(columnsIn(PL_COLUMNS, {}), visibilityOf(PL_COLUMNS, {})).some(
      (o) => o.key === "f_name" || o.key === "actions",
    ),
    false,
    "the tiebreak's column and the row's acts are no switch",
  );
  assert.equal(
    PL_FILE_COLUMNS.some((c) => c.hidden),
    false,
    "and no file column",
  );
  assert.deepEqual(
    PL_COLUMNS.filter((c) => c.sort && !c.hidden).map((c) => [c.key, c.sort.first, typeof c.sort.value]),
    [
      ["name", "asc", "function"],
      ["state", "desc", "function"],
      ["next", "asc", "function"],
      ["last", "desc", "function"],
      ["visits", "asc", "function"],
      ["offers", "asc", "function"],
      ["since", "desc", "function"],
      ["calls", "desc", "function"],
      ["deal", "desc", "function"],
    ],
    "every heading that sorts says which way a first press goes and what a row sorts by: the browser sorts People",
  );
  assert.equal(firstDirOf(PL_COLUMNS, "next"), "asc", "the soonest step first on the first press (0007)");
  assert.deepEqual(PL_CARD.label, "Person");
  assert.equal(PL_CARD.rowClass, "pl-card-row", "a phone's card wears the card rules' class");
});

test("Came from waits in the Columns menu (canvas P1: with it the table outgrew the pane at 1440)", () => {
  const came = (choices) => visibilityOf(PL_COLUMNS, choices).came_from;
  assert.equal(came({}), false, "off until asked for");
  assert.equal(came({ came_from: true }), true, "and the member's own choice stands");
});

test("the list's head says how it is ordered: the sortable column's own words, and nothing for a key it has none for", async () => {
  const { plSortedBy } = await importSrc("apps/dashboard/src/surfaces/people/words.ts");
  assert.equal(plSortedBy("last"), "Sorted by last contact");
  assert.equal(plSortedBy("name"), "Sorted by name");
  assert.equal(plSortedBy("bogus"), "");
});

test("a visit's hours say their start alone in the Visits cell, with the meridiem the range gave it", async () => {
  const { plVisitStart } = await importSrc("apps/dashboard/src/surfaces/people/words.ts");
  assert.equal(plVisitStart("2:00 – 3:00 PM"), "2:00 PM");
  assert.equal(plVisitStart("11:00 AM – 12:00 PM"), "11:00 AM");
  assert.equal(plVisitStart("10:30 AM"), "10:30 AM", "one time is said as it came");
  assert.equal(plVisitStart(""), "");
});

test("the tiebreak after each heading: the most recent contact, Offers' its own way, the unnamed by their words", () => {
  assert.deepEqual(plSortThen("state", false), [{ id: "last", desc: true }]);
  assert.deepEqual(plSortThen("state", true), [{ id: "last", desc: true }], "whichever way the heading is pressed");
  assert.deepEqual(plSortThen("offers", false), [{ id: "last", desc: false }]);
  assert.deepEqual(plSortThen("last", true), [], "the last contact is its own tiebreak");
  assert.deepEqual(plSortThen("name", true), [
    { id: "f_name", desc: true },
    { id: "last", desc: true },
  ]);
});

test("Person sorts the named from A to Z or Z to A, and those nobody has named after them either way", () => {
  const rows = [
    personRow({ id: "num", display_name: null, phone_e164: "+13055550101" }),
    personRow({ id: "zoe", display_name: "Zoe Example" }),
    personRow({ id: "mail", display_name: null, phone_e164: null, email: "ab@example.com", channels: ["email"] }),
    personRow({ id: "ana", display_name: "Ana Example" }),
  ];
  assert.deepEqual(
    shownBy({ rows, sortBy: "name", sortDir: "asc" }).slice(0, 2),
    ["ana", "zoe"],
    "a number no longer leads A to Z",
  );
  assert.deepEqual(shownBy({ rows, sortBy: "name", sortDir: "desc" }).slice(0, 2), ["zoe", "ana"]);
  assert.deepEqual(
    new Set(shownBy({ rows, sortBy: "name", sortDir: "desc" }).slice(2)),
    new Set(["num", "mail"]),
    "and they stay last",
  );
});

test("a tie under any heading falls to the most recent contact, whichever way the heading is pressed", () => {
  const rows = [
    personRow({ id: "old", display_name: "A", last_message_at: daysAgo(9), last_inbound_at: daysAgo(9) }),
    personRow({ id: "new", display_name: "B", last_message_at: daysAgo(1), last_inbound_at: daysAgo(1) }),
    personRow({ id: "mid", display_name: "C", last_message_at: daysAgo(4), last_inbound_at: daysAgo(4) }),
  ];
  assert.deepEqual(shownBy({ rows, sortBy: "state", sortDir: "desc" }), ["new", "mid", "old"]);
  assert.deepEqual(shownBy({ rows, sortBy: "state", sortDir: "asc" }), ["new", "mid", "old"]);
});

test("First contact and Deal sort, and a row with nothing to sort by is last either way", () => {
  const firsts = [
    personRow({ id: "a", first_contact_at: daysAgo(90), earliest_row_at: daysAgo(90) }),
    personRow({ id: "b", first_contact_at: daysAgo(5), earliest_row_at: daysAgo(5) }),
    personRow({ id: "c", first_contact_at: daysAgo(30), earliest_row_at: daysAgo(30) }),
  ];
  assert.deepEqual(
    shownBy({ rows: firsts, sortBy: "since", sortDir: "desc" }),
    ["b", "c", "a"],
    "the newest first on the first press",
  );
  assert.deepEqual(shownBy({ rows: firsts, sortBy: "since", sortDir: "asc" }), ["a", "c", "b"]);
  const deals = [
    personRow({ id: "none" }),
    personRow({ id: "out", deal_id: "d1", deal_stage: "proposed", deal_proposed_at: daysAgo(2) }),
    personRow({
      id: "won",
      deal_id: "d2",
      deal_stage: "won",
      deal_proposed_at: daysAgo(9),
      deal_decided_at: daysAgo(3),
    }),
  ];
  assert.deepEqual(
    shownBy({ rows: deals, sortBy: "deal", sortDir: "desc" }),
    ["won", "out", "none"],
    "a client, then a proposal out",
  );
  assert.deepEqual(
    shownBy({ rows: deals, sortBy: "deal", sortDir: "asc" }),
    ["out", "won", "none"],
    "nobody with no deal leads either way",
  );
});

test("the box's words narrow the view and keep its order: People's matcher, run once a row", () => {
  const rows = [
    personRow({ id: "a", display_name: "Ana Example", last_message_at: daysAgo(3), last_inbound_at: daysAgo(3) }),
    personRow({ id: "b", display_name: "Bo Other", last_message_at: daysAgo(1), last_inbound_at: daysAgo(1) }),
    personRow({ id: "c", display_name: "Cy Example", last_message_at: daysAgo(2), last_inbound_at: daysAgo(2) }),
  ];
  assert.deepEqual(shownBy({ rows, q: "example" }), ["c", "a"], "most recent first, the one the words leave out gone");
  assert.deepEqual(shownBy({ rows, q: "   " }), ["b", "c", "a"], "spaces are no words");
});

test("words that find nobody say so, with the words, and say never nobody while the server is asked", async () => {
  const { plNoMatchWords } = await importSrc("apps/dashboard/src/surfaces/people/words.ts");
  assert.deepEqual(plNoMatchWords("  zzqx ", false), {
    title: "Nobody matches “zzqx”",
    body: "Search reads names, numbers and email addresses.",
    action: "Clear search",
  });
  assert.equal(plNoMatchWords("zzqx", true).title, "Searching everyone for “zzqx”…");
});
