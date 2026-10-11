/**
 * Campaigns' ledger, the decisions with no markup (spec 2026-10-09 §4.3, §4.4): what the screen shows for a status, a
 * group, words searched, an order and a grouping (ledgerViewOf), how the page holds them (useLedgerView, on the stub
 * React), and what a key does (onLedgerKey, Task 4). Rows here are made by hand in the view model's shape (contracts
 * LifecycleRow), so each rule is seen alone; the page over the real view model is ledger-page.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact, fresh, again } from "../../_legacy-react.mjs";

installLegacyReact();
// Literal paths, so knip sees the exports these tests read.
const { ledgerViewOf, useLedgerView } =
  await import("../../../../../apps/dashboard/src/surfaces/campaigns/home/ledger/use-ledger-view.ts");

const NOW = Date.parse("2026-10-09T13:00:00Z");
const HOUR = 3_600_000;

/** A row in the view model's shape, a playbook running by default, with whatever a test changes of it. */
const row = (id, over = {}) => ({
  id,
  kind: "playbook",
  name: id,
  hint: "",
  status: "on",
  stateWords: "On",
  phoneWords: "",
  tone: "ok",
  needs: "messages",
  needsWords: "",
  channels: [],
  people: { n: 0, unit: "people" },
  results: "none",
  next: { words: "", atMs: null },
  open: null,
  waiting: null,
  act: null,
  search: id,
  ...over,
});
const group = (id, rows, add = null) => ({ id, caps: id.toUpperCase(), glyph: "bell", meta: "", rows, add });
const ledgerOf = (groups, tools = true) => ({
  groups,
  counts: { all: 0, running: 0, needs: 0, paused: 0 },
  tools,
  sentOnce: null,
  period: "Last 30 days",
  results: "read",
  words: {},
});
const ASK = { status: "all", group: null, query: "", sort: "next", grouping: "moment" };
const ids = (shown) => shown.rows.map((r) => r.id);
const TURN_ON = { kind: "turn_on", label: "Turn on", moment: "visited" };

test("Next puts a run that waits first, then the soonest, and what has no time last; ties go by name", () => {
  const l = ledgerOf([
    group("before", [
      row("paused", { status: "paused", next: { words: "Paused", atMs: null } }),
      row("later", { next: { words: "tomorrow", atMs: NOW + 20 * HOUR } }),
      row("soon", { next: { words: "today", atMs: NOW + HOUR } }),
      row("waits", { status: "waiting", tone: "warn", next: { words: "now", atMs: NOW } }),
      row("also-soon", { next: { words: "today", atMs: NOW + HOUR } }),
    ]),
  ]);
  assert.deepEqual(ids(ledgerViewOf(l, ASK)), ["waits", "also-soon", "soon", "later", "paused"]);
});

test("a desk sorts by name, by who is at it now, or by what came back, the uncounted last", () => {
  const l = ledgerOf([
    group("quiet", [
      row("b", { people: { n: 4, unit: "people" }, results: { kind: "sent", sent: 10, replied: 1 } }),
      row("a", { people: { n: null, unit: "people" }, results: "uncounted" }),
      row("c", {
        people: { n: 9, unit: "people" },
        results: { kind: "written", written: 40, businesses: 18, wroteBack: 6 },
      }),
    ]),
  ]);
  assert.deepEqual(ids(ledgerViewOf(l, { ...ASK, sort: "name" })), ["a", "b", "c"]);
  assert.deepEqual(ids(ledgerViewOf(l, { ...ASK, sort: "people" })), ["c", "b", "a"]);
  assert.deepEqual(ids(ledgerViewOf(l, { ...ASK, sort: "replied" })), ["c", "b", "a"]);
});

test("a status tab shows what the one predicate says it holds; a one-off send stands under All alone", () => {
  const l = ledgerOf([
    group("before", [
      row("on"),
      row("waits", { status: "waiting", tone: "warn" }),
      row("rest", { status: "paused", tone: "plain" }),
    ]),
    group("sent_once", [row("once", { kind: "sent_once" })]),
  ]);
  assert.deepEqual(ids(ledgerViewOf(l, { ...ASK, status: "needs" })), ["waits"]);
  assert.deepEqual(ids(ledgerViewOf(l, { ...ASK, status: "paused" })), ["rest"]);
  assert.ok(ids(ledgerViewOf(l, ASK)).includes("once"), "All counts the one-off sends, so the rows add up");
});

test("a group narrows to itself, a group the ledger has not got narrows nothing, and the count says how many of how many", () => {
  const l = ledgerOf([group("before", [row("r1"), row("r2")]), group("quiet", [row("w1")])]);
  const one = ledgerViewOf(l, { ...ASK, group: "quiet" });
  assert.deepEqual(ids(one), ["w1"]);
  assert.equal(one.chosen.id, "quiet");
  assert.deepEqual([one.shown, one.total, one.filtered], [1, 3, true]);
  const none = ledgerViewOf(l, { ...ASK, group: "proposal" });
  assert.equal(none.chosen, null, "an address naming a group that is not here is the whole ledger");
  assert.deepEqual([none.shown, none.filtered], [3, false]);
});

test("how many is campaigns': the receptionist and the call's text are drawn, never counted, as the All tab counts", () => {
  const l = ledgerOf([
    group("first_contact", [
      row("receptionist", { kind: "receptionist", status: "always" }),
      row("call_text", { kind: "call_text" }),
      row("w1"),
    ]),
  ]);
  const shown = ledgerViewOf(l, ASK);
  assert.deepEqual([shown.rows.length, shown.shown, shown.total], [3, 1, 1]);
});

test("First contact's own rows stand before its campaigns in every order: only the campaigns are sorted", () => {
  const l = ledgerOf([
    group("first_contact", [
      row("receptionist", { kind: "receptionist", status: "always", next: { words: "", atMs: null } }),
      row("call_text", { kind: "call_text", next: { words: "", atMs: null } }),
      row("welcome", { name: "Welcome", next: { words: "tomorrow", atMs: NOW + 20 * HOUR } }),
      row("again", { name: "Again", next: { words: "today", atMs: NOW + HOUR } }),
    ]),
  ]);
  assert.deepEqual(
    ids(ledgerViewOf(l, ASK)),
    ["receptionist", "call_text", "again", "welcome"],
    "Next: a campaign running soon never climbs over the receptionist and the call's text",
  );
  assert.deepEqual(ids(ledgerViewOf(l, { ...ASK, sort: "name" })), ["receptionist", "call_text", "again", "welcome"]);
  assert.deepEqual(ids(ledgerViewOf(l, { ...ASK, sort: "people" }))[0], "receptionist");
});

test("words searched match the row's own words for a search, any case, and an empty moment stands with its Turn on under All alone", () => {
  const l = ledgerOf([
    group("before", [row("r1", { name: "Reminder", search: "reminder whatsapp" })]),
    group("after", [], TURN_ON),
    group("quiet", [row("w1", { name: "Win-back", search: "win-back quiet 30 days" })]),
  ]);
  assert.deepEqual(ids(ledgerViewOf(l, { ...ASK, query: "  WhatsApp " })), ["r1"]);
  assert.deepEqual(
    ledgerViewOf(l, ASK).groups.map((g) => g.id),
    ["before", "after", "quiet"],
    "under All the empty moment draws, with its Turn on",
  );
  assert.deepEqual(
    ledgerViewOf(l, { ...ASK, query: "win" }).groups.map((g) => g.id),
    ["quiet"],
    "under a filter it does not",
  );
});

test("a row decided under a filter stays shown until the filter changes: it does not leave from under the pointer", () => {
  const l = ledgerOf([
    group("before", [row("approved", { status: "on" }), row("waits", { status: "waiting", tone: "warn" })]),
  ]);
  assert.deepEqual(ids(ledgerViewOf(l, { ...ASK, status: "needs" })), ["waits"]);
  assert.deepEqual(
    ids(ledgerViewOf(l, { ...ASK, status: "needs", keep: "approved" })),
    ["waits", "approved"],
    "the row just approved stays on the screen under the tab it was decided in, its state changed in place",
  );
});

test("without grouping the rows are one list in the order chosen", () => {
  const l = ledgerOf([group("before", [row("b")]), group("quiet", [row("a"), row("c")])]);
  const flat = ledgerViewOf(l, { ...ASK, sort: "name", grouping: "none" });
  assert.equal(flat.grouped, false);
  assert.deepEqual(flat.groups, []);
  assert.deepEqual(ids(flat), ["a", "b", "c"]);
});

test("without grouping the receptionist and the call's text head the one list in every order, never counted", () => {
  const l = ledgerOf([
    group("first_contact", [
      row("receptionist", { kind: "receptionist", name: "Receptionist", status: "always" }),
      row("call_text", { kind: "call_text", name: "Call text", next: { words: "", atMs: null } }),
      row("welcome", { name: "Welcome", next: { words: "today", atMs: NOW + HOUR } }),
    ]),
    group("before", [
      row("asks", { name: "Asks", status: "waiting", tone: "warn", next: { words: "now", atMs: NOW } }),
      row("busy", { name: "Busy", people: { n: 40, unit: "people" }, results: { kind: "sent", sent: 9, replied: 9 } }),
    ]),
  ]);
  const flat = (sort) => ledgerViewOf(l, { ...ASK, sort, grouping: "none" });
  for (const sort of ["next", "name", "people", "replied"]) {
    assert.deepEqual(
      ids(flat(sort)).slice(0, 2),
      ["receptionist", "call_text"],
      `${sort}: First contact's own rows first`,
    );
  }
  assert.deepEqual(
    ids(flat("next")),
    ["receptionist", "call_text", "asks", "welcome", "busy"],
    "then the campaigns, sorted",
  );
  assert.deepEqual(ids(flat("name")), ["receptionist", "call_text", "asks", "busy", "welcome"]);
  assert.deepEqual([flat("name").shown, flat("name").total], [3, 3], "and never among the campaigns counted");
});

test("under seven rows only the group narrows; a phone holds one choice, sorts by Next and keeps the groups", () => {
  const groups = [
    group("before", [row("b", { next: { words: "", atMs: NOW + 2 * HOUR } })]),
    group("quiet", [row("a", { status: "paused", tone: "plain", next: { words: "Paused", atMs: null } })]),
  ];
  const went = [];
  const at = (over = {}) => ({ group: null, onGroup: (g) => went.push(g), phone: false, ...over });
  // Few rows: no tools, so a status, words and an order set earlier are not applied.
  fresh();
  let view = again(() => useLedgerView(ledgerOf(groups, false), at()));
  view.setStatus("paused");
  view.setQuery("zzz");
  view.setSort("name");
  view = again(() => useLedgerView(ledgerOf(groups, false), at()));
  assert.deepEqual([view.status, view.query, view.sort], ["all", "", "next"]);
  assert.deepEqual(
    view.visibleRows.map((r) => r.id),
    ["b", "a"],
  );
  // A phone: a status clears the group the address names, a group clears the status, and the order is Next.
  fresh();
  view = again(() => useLedgerView(ledgerOf(groups), at({ group: "quiet", phone: true })));
  view.setSort("name");
  view.setStatus("needs");
  assert.deepEqual(went, [null], "Needs you lets go of in:<group>");
  view = again(() => useLedgerView(ledgerOf(groups), at({ group: null, phone: true })));
  assert.equal(view.sort, "next", "a phone sorts by Next");
  view.setGroup("before");
  assert.deepEqual(went, [null, "before"]);
  view = again(() => useLedgerView(ledgerOf(groups), at({ group: "before", phone: true })));
  assert.equal(view.status, "all", "a group chip clears the status");
  // A desk composes the two: a status keeps the group.
  fresh();
  went.length = 0;
  view = again(() => useLedgerView(ledgerOf(groups), at({ group: "quiet" })));
  view.setStatus("paused");
  assert.deepEqual(went, [], "on a desk a tab and a card compose");
});

test("Escape lets go of the words first, then of the filter; Clear lets go of all at once", () => {
  const groups = [group("before", [row("b")]), group("quiet", [row("a")])];
  const went = [];
  const at = { group: "quiet", onGroup: (g) => went.push(g), phone: false };
  fresh();
  let view = again(() => useLedgerView(ledgerOf(groups), at));
  view.setQuery("a");
  view.setStatus("paused");
  view = again(() => useLedgerView(ledgerOf(groups), at));
  view.clearOne();
  view = again(() => useLedgerView(ledgerOf(groups), at));
  assert.deepEqual([view.query, view.status, went], ["", "paused", []], "the words go first");
  view.clearOne();
  view = again(() => useLedgerView(ledgerOf(groups), at));
  assert.deepEqual([view.status, went], ["all", [null]], "then the status and the group");
  went.length = 0;
  view.setQuery("b");
  view = again(() => useLedgerView(ledgerOf(groups), at));
  view.clearAll();
  view = again(() => useLedgerView(ledgerOf(groups), at));
  assert.deepEqual([view.query, view.status, went], ["", "all", [null]]);
});

/* ------------------------------------------------------- the keys ------------------------------------------------------- */

const { onLedgerKey, rowOpener, useArrivalLands, useFocusComesHome, useLedgerCursor, useRowMarks } =
  await import("../../../../../apps/dashboard/src/surfaces/campaigns/home/ledger/ledger-keys.ts");

/** A key event as the window hears it, pressed on the page (a div), unless a test says where. */
const key = (k, over = {}) => ({
  key: k,
  target: { nodeType: 1, tagName: "DIV", closest: () => null, getAttribute: () => null },
  defaultPrevented: false,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  repeat: false,
  prevented: false,
  preventDefault() {
    this.prevented = true;
  },
  ...over,
});
/** The doors the listener reads, each press written down. */
const doors = (over = {}) => {
  const did = [];
  return {
    did,
    ids: ["r1", "r2", "r3"],
    cursor: null,
    move: (step) => did.push(["move", step]),
    open: (id) => did.push(["open", id]),
    focusSearch: () => did.push(["search"]),
    narrowed: false,
    clearOne: () => did.push(["clear"]),
    sheetOpen: false,
    ...over,
  };
};

test("J and K, or the arrows, walk the rows; Enter opens the one under the cursor; / goes to the search", () => {
  globalThis.document.querySelector = () => null;
  const d = doors({ cursor: "r2" });
  for (const k of ["j", "J", "ArrowDown"]) onLedgerKey(d, key(k));
  for (const k of ["k", "ArrowUp"]) onLedgerKey(d, key(k));
  onLedgerKey(d, key("Enter"));
  onLedgerKey(d, key("/"));
  assert.deepEqual(d.did, [
    ["move", 1],
    ["move", 1],
    ["move", 1],
    ["move", -1],
    ["move", -1],
    ["open", "r2"],
    ["search"],
  ]);
});

test("Escape lets go only where something narrows the list, and from the search box too", () => {
  globalThis.document.querySelector = () => null;
  const idle = doors();
  onLedgerKey(idle, key("Escape"));
  assert.deepEqual(idle.did, [], "nothing to let go of: the key is not taken");
  const d = doors({ narrowed: true });
  const e = key("Escape");
  onLedgerKey(d, e);
  assert.deepEqual(d.did, [["clear"]]);
  assert.equal(e.prevented, true);
  const box = {
    nodeType: 1,
    tagName: "INPUT",
    type: "search",
    closest: () => null,
    getAttribute: (a) => (a === "data-testid" ? "cmh-ledger-search" : null),
  };
  const typed = doors({ narrowed: true });
  onLedgerKey(typed, key("Escape", { target: box }));
  onLedgerKey(typed, key("j", { target: box }));
  assert.deepEqual(
    typed.did,
    [["clear"]],
    "Escape in the search lets go of the words; a letter typed there is a letter",
  );
});

test("never behind a sheet or a menu, never with a modifier, and Enter on a focused control is the control's", () => {
  const d = doors({ cursor: "r1" });
  onLedgerKey({ ...d, sheetOpen: true }, key("j"));
  onLedgerKey(d, key("j", { metaKey: true }));
  onLedgerKey(d, key("j", { defaultPrevented: true }));
  globalThis.document.querySelector = (sel) => (sel.includes('.sheet[role="dialog"]') ? {} : null);
  onLedgerKey(d, key("j"));
  globalThis.document.querySelector = () => null;
  onLedgerKey(
    d,
    key("Enter", { target: { nodeType: 1, tagName: "A", closest: () => ({}), getAttribute: () => null } }),
  );
  assert.deepEqual(d.did, []);
});

/**
 * A page whose rows are these ids, each with its name (its opener) unless it is `bare`, and the search where `search`:
 * what each element was asked, written down: a focus (and whether it kept the page where it was) or a scroll.
 */
const pageOf = ({ rows = [], bare = [], search = true } = {}) => {
  const did = [];
  const el = (name) => ({
    focus: (o) => did.push(["focus", name, o?.preventScroll === true ? "still" : "scrolls"]),
    scrollIntoView: (o) => did.push(["scroll", name, o?.block]),
  });
  globalThis.document.querySelector = (sel) => {
    for (const id of rows) {
      if (sel === rowOpener(id)) return bare.includes(id) ? null : el(`name:${id}`);
      if (sel === `[data-row="${id}"]`) return el(`row:${id}`);
    }
    return search && sel.includes('[data-testid="cmh-ledger-search"]') ? el("search") : null;
  };
  return did;
};
/** A sheet's life over the ledger: the page drawn with nothing open, the sheet opened from a row, then closed. */
const sheetFrom = (id, before, after) => {
  fresh();
  again(() => useFocusComesHome(null, before));
  again(() => useFocusComesHome(id, before));
  again(() => useFocusComesHome(null, after));
};

test("a row's opener is found by its id, and a sheet that closes gives the focus back to the row it was opened from", () => {
  assert.equal(rowOpener("pb-1"), '[data-row="pb-1"] [data-row-open]');
  assert.equal(rowOpener('a"b'), '[data-row="a\\"b"] [data-row-open]');
  const ids = ["r1", "r2", "r3"];
  const did = pageOf({ rows: ids });
  sheetFrom("r2", ids, ids);
  assert.deepEqual(did, [["focus", "name:r2", "still"]], "its name, and the page holds still");
  again(() => useFocusComesHome(null, ids));
  assert.equal(did.length, 1, "once");
  globalThis.document.querySelector = () => null;
});

test("focus never scrolls a phone: a sheet reached by its address gives nothing back, and a row decided keeps its place", () => {
  const ids = ["r1", "r2"];
  const did = pageOf({ rows: ids });
  // Today's door, the bell, a reload of campaigns/moment:r2: the drawer is open at the first draw, from no row.
  fresh();
  again(() => useFocusComesHome("r2", ids));
  again(() => useFocusComesHome("r2", ids));
  again(() => useFocusComesHome(null, ids));
  assert.deepEqual(did, [], "nothing is focused, and nothing scrolls, for a row the person never saw");
  fresh();
  again(() => useRowMarks(false)).settle("r1");
  assert.deepEqual(
    did,
    [["focus", "name:r1", "still"]],
    "an act decided in a row leaves the focus on its name, in place",
  );
  globalThis.document.querySelector = () => null;
});

test("the keys' cursor and an arrival are brought into view, the least scroll that shows them", () => {
  const ids = ["r1", "r2"];
  const did = pageOf({ rows: ids });
  fresh();
  again(() => useLedgerCursor(ids)).move(1);
  assert.deepEqual(did, [
    ["focus", "name:r1", "still"],
    ["scroll", "row:r1", "nearest"],
  ]);
  did.length = 0;
  fresh();
  again(() => useArrivalLands({ id: "r2", kind: "arrived" }, ids));
  assert.deepEqual(did, [
    ["focus", "name:r2", "still"],
    ["scroll", "row:r2", "nearest"],
  ]);
  globalThis.document.querySelector = () => null;
});

test("an arrival waits for its row: drawn without it nothing moves, drawn with it it lands, once; let go of and given again, it lands again", () => {
  const did = pageOf({ rows: ["r1", "r2", "r3"] });
  fresh();
  const mark = { id: "r3", kind: "arrived" };
  again(() => useArrivalLands(mark, ["r1", "r2"]));
  assert.deepEqual(did, [], "its row is not drawn yet (the playbooks not read again): nothing is focused or scrolled");
  again(() => useArrivalLands(mark, ["r1", "r2", "r3"]));
  assert.deepEqual(did, [
    ["focus", "name:r3", "still"],
    ["scroll", "row:r3", "nearest"],
  ]);
  again(() => useArrivalLands(mark, ["r1", "r2", "r3"]));
  again(() => useArrivalLands({ ...mark }, ["r3", "r1", "r2"]));
  assert.equal(did.length, 2, "exactly once, however often the page draws");
  again(() => useArrivalLands(null, ["r1", "r2", "r3"]));
  again(() => useArrivalLands(mark, ["r1", "r2", "r3"]));
  assert.equal(did.length, 4, "the mark let go of, the same campaign saved again lands again");
  globalThis.document.querySelector = () => null;
});

test("a drawer opened from a moment's card gives the focus back to the card's name as it closes, never to the row", () => {
  const ids = ["r1", "r2"];
  const did = pageOf({ rows: ids });
  const rowsOnly = globalThis.document.querySelector;
  // The rail's cards: each moment's name, the door to its lead's drawer (rail.tsx Stage).
  globalThis.document.querySelector = (sel) => {
    const card = /data-stage="([^"]+)"\] \[data-row-open\]$/.exec(sel);
    if (!card) return rowsOnly(sel);
    return { focus: (o) => did.push(["focus", `card:${card[1]}`, o?.preventScroll === true ? "still" : "scrolls"]) };
  };
  fresh();
  const fromCard = again(() => useFocusComesHome(null, ids));
  fromCard("r2", "quiet");
  again(() => useFocusComesHome("r2", ids));
  again(() => useFocusComesHome(null, ids));
  assert.deepEqual(did, [["focus", "card:quiet", "still"]], "the card that opened it, the page held still");
  // A card noted for another campaign (its press opened a tab, and no drawer here) is not this drawer's opener.
  did.length = 0;
  fresh();
  again(() => useFocusComesHome(null, ids))("r1", "before");
  again(() => useFocusComesHome("r2", ids));
  again(() => useFocusComesHome(null, ids));
  assert.deepEqual(did, [["focus", "name:r2", "still"]], "the row it was opened from");
  // A card's campaign the ledger does not show (narrowed to another moment): still the card.
  did.length = 0;
  fresh();
  again(() => useFocusComesHome(null, ["r1"]))("r9", "after");
  again(() => useFocusComesHome("r9", ["r1"]));
  again(() => useFocusComesHome(null, ["r1"]));
  assert.deepEqual(did, [["focus", "card:after", "still"]]);
  globalThis.document.querySelector = () => null;
});

test("a row gone when its sheet closes gives the focus to the row now in its place, else the last row, else the search", () => {
  // Deleted: the row after it stands in its place now.
  let did = pageOf({ rows: ["r1", "r3"] });
  sheetFrom("r2", ["r1", "r2", "r3"], ["r1", "r3"]);
  assert.deepEqual(did, [["focus", "name:r3", "still"]], "the row now at its index");
  // The last row left the tab: the row before it is the last now.
  did = pageOf({ rows: ["r1", "r2"] });
  sheetFrom("r3", ["r1", "r2", "r3"], ["r1", "r2"]);
  assert.deepEqual(did, [["focus", "name:r2", "still"]], "else the last row");
  // The row now in its place has no page to open (the receptionist): the last row's name.
  did = pageOf({ rows: ["r1", "receptionist", "r3"], bare: ["receptionist"] });
  sheetFrom("r2", ["r1", "r2", "r3"], ["r1", "receptionist", "r3"]);
  assert.deepEqual(did, [["focus", "name:r3", "still"]]);
  // No row is left: the search, never the page's body.
  did = pageOf({ rows: [] });
  sheetFrom("r1", ["r1"], []);
  assert.deepEqual(did, [["focus", "search", "still"]], "else the search");
  globalThis.document.querySelector = () => null;
});
