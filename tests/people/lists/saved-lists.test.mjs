/**
 * Saved lists: a name and the people on it.
 *
 * People v1 kept six computed lists; what a salon also keeps is a list by
 * hand. Now: a segments table the workspace owns (members read, owner or
 * operator writes), routes that make, change and delete one, a People rail
 * whose Saved section is real, and a profile section that puts a person on
 * a list or takes them off. No ledger rows: a list changes nothing a
 * customer experiences until a broadcast goes to it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { importSrc } from "../../_source.mjs";
import { DESK, givenOn } from "../../_css.mjs";
import { installStubReact, fresh, again, byTestId, find, press, textOf } from "../../_stub-react.mjs";
import { personDto, personRow, ROW_NOW, ROW_TZ } from "../../consent/_person-row.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

// People's page parts, drawn on the shared stub React over the real TSX (surfaces/people/), as people-table.test.mjs draws
// the table: the hooks go on the react module first (installStubReact does it), then the parts are imported.
installStubReact();
const { peopleSurfaceOf } = await importSrc("apps/dashboard/src/surfaces/people/surface-map.ts");
const { NewListRow } = await importSrc("apps/dashboard/src/surfaces/people/rail/new-list.tsx");
const { ListTitle, DeleteListButton } = await importSrc("apps/dashboard/src/surfaces/people/lists/list-title.tsx");
const { PeopleListsSheet } = await importSrc("apps/dashboard/src/surfaces/people/rail/lists-sheet.tsx");
const { PeopleBulkBar } = await importSrc("apps/dashboard/src/surfaces/people/bulk/bulk-bar.tsx");
const { PL_COLUMNS } = await importSrc("apps/dashboard/src/surfaces/people/cells/columns.tsx");
const { plViewRows } = await importSrc("apps/dashboard/src/surfaces/people/page/shown.ts");
const { plListRoute } = await importSrc("apps/dashboard/src/surfaces/people/words.ts");

// The tables: the workspace's, members read, acting members write, a person of another workspace or an erased one cannot
// be put on a list, an erased person leaves every list, one name a workspace. Run on the stack in
// people/lists/a-list-has-a-life.db.test.mjs (pinned as 00044's text here until 26 Nov 2026). That a list changed no ledger
// at first is history: every change to a list is the ledger's since (the same suite).

// The routes: one workspace's lists with their ids, owner or operator to change them, the same refusals in the same words.
// Run through the routes in people/routes/a-person-a-list-and-everyone.test.mjs ("lists: one workspace's", "one list",
// "a list's refusals are said in the helper's words"); pinned as the routes' and lists.ts's text here until 26 Nov 2026.

test("the surface: lists ride People, counted over the rows on the page; the verbs re-fetch it", async () => {
  // The lists ride People's own read, from GET segments: run over the surface in people/lists/list-names.test.mjs ("People's
  // rail says a rule's lists by the one namer"), pinned as surface.ts's text here until 26 Nov 2026.
  // Run, not read: the mapping (surface-map.ts) over two people and a list that names one of them and somebody who is
  // not among the rows (an erased person leaves every list, 00044).
  const loaded = {
    tz: ROW_TZ,
    people: [personDto({ id: "p1", marketing_consent: "opted_in" }), personDto({ id: "p2" })],
    page: null,
    saved: [{ id: "s1", name: "Regulars", ids: ["p1", "erased"] }],
    calendar: { state: "ok", source: "Google Calendar" },
    bookingLink: null,
    hasDeals: false,
    word: "appointment",
    consultFirst: false,
    dealPace: null,
    followUp: null,
    views: {},
    viewsRead: true,
  };
  const kept = peopleSurfaceOf(loaded, null, new Date(ROW_NOW)).saved[0];
  assert.equal(kept.count, 1, "an erased person never counts");
  assert.deepEqual(kept.ids, ["p1"]);
  assert.equal(
    kept.action.to,
    "campaigns/sequences/new:once:to:s1",
    "and the list carries its one step: a broadcast to those who said yes",
  );
  // The verbs, each over the wire to its route (pinned as people-lists.ts's text until 26 Nov 2026).
  const { lists: verbs } = await importSrc("apps/dashboard/src/surfaces/people/people-lists.ts");
  const asked = [];
  const realFetch = globalThis.window.fetch;
  globalThis.window.fetch = async (url, init = {}) => {
    asked.push([init.method ?? "GET", new URL(String(url), "https://app.chanlytics.com").pathname]);
    const data = { id: "s1", name: "Regulars", ids: ["p1"], rule: null, archived_at: null, deleted: true };
    return new Response(JSON.stringify({ ok: true, data }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    await verbs.create("Regulars");
    await verbs.rename("s1", "Best");
    await verbs.add("s1", ["p1"]);
    await verbs.drop("s1", ["p1"]);
    await verbs.remove("s1");
  } finally {
    globalThis.window.fetch = realFetch;
  }
  assert.deepEqual(
    asked.filter(([method]) => method !== "GET"),
    [
      ["POST", "/api/v1/segments"],
      ["PUT", "/api/v1/segments/s1"],
      ["PUT", "/api/v1/segments/s1"],
      ["PUT", "/api/v1/segments/s1"],
      ["DELETE", "/api/v1/segments/s1"],
    ],
    "make, rename, add, drop and delete, each its route",
  );
  const { AFTER } = await importSrc("apps/dashboard/src/bridge/refresh-map.ts");
  for (const k of ["POST segments", "PUT segments/[id]", "DELETE segments/[id]"])
    assert.deepEqual(
      AFTER[k]().map((o) => o.key),
      // The stand-in window is at Reports (installStubReact), which draws neither composer: each is left for its pages (S10-6).
      ["people"],
      `${k}: the chips are the server's, and a list is an audience and a playbook's moment too, where they are drawn`,
    );
  // The verbs are imported by what presses them: nothing publishes them on the window (the loadability review, 19 Oct 2026).
  assert.equal(globalThis.window.__lists, undefined, "the lists' verbs are not on the window");
});

/** A list kept by hand, as the surface holds it (surface-map.ts): the one a title, a bar and a row's drop are drawn over. */
const REGULARS = { id: "s1", name: "Regulars", count: 1, ids: ["p1"], byHand: true, rule: null, unknown: null };

test("the page: the rail's Saved section is real, a name typed there is the only thing typed, a person joins from their profile", async () => {
  // The Saved section itself is the rail kit's (RailSection), drawn and pressed in people-honest, not read here.
  // The rail's New list: a button, then the one box, which takes a name and nothing else; a list kept by hand has no rule.
  const made = [];
  const onCreate = async (name, rule) => {
    made.push([name, rule]);
    return { ok: true, data: { id: "s2" } };
  };
  fresh();
  let tree = again(() => NewListRow({ onCreate }));
  assert.ok(byTestId(tree, "new-list"), "closed, it is one button");
  assert.equal(byTestId(tree, "new-list-name"), null);
  press(byTestId(tree, "new-list"));
  tree = again(() => NewListRow({ onCreate }));
  const box = byTestId(tree, "new-list-name");
  assert.ok(box, "a press opens the box for the name");
  box.props.onChange({ target: { value: "  Regulars " } });
  tree = again(() => NewListRow({ onCreate }));
  await byTestId(tree, "new-list-add").props.onClick();
  assert.deepEqual(made, [["Regulars", null]], "the name is the only thing typed");
  // The demo-only block ("Saved lists need a segments table (Tier 2)") stood in the deleted people.jsx: a demo session
  // draws this page over the sample's lists now (people-sample.test.mjs), so there is no second block to be gone.
  // A saved list is a view like a computed one: the view's rows are the list's ids, and its title says so.
  const rows = [personRow({ id: "p1" }), personRow({ id: "p2" })];
  const shownFor = (savedId) =>
    plViewRows({
      rows,
      found: null,
      lists: [],
      saved: [{ id: "s1", ids: ["p1"] }],
      tab: "all",
      listId: null,
      savedId,
    })
      .map((r) => r.id)
      .sort();
  assert.deepEqual(shownFor("s1"), ["p1"], "a saved list filters the table like a computed one");
  assert.deepEqual(shownFor(null), ["p1", "p2"]);
  fresh();
  tree = again(() => ListTitle({ list: REGULARS, canEdit: true, onRenamed() {} }));
  assert.match(textOf(byTestId(tree, "saved-filter")), /Regulars/, "the list is the page's title while it is open");
  // Deleting a list is asked once, through the one Confirm, in words that say what stays.
  fresh();
  tree = again(() => DeleteListButton({ list: REGULARS, onDeleted() {} }));
  press(byTestId(tree, "delete-list"));
  tree = again(() => DeleteListButton({ list: REGULARS, onDeleted() {} }));
  const ask = find(tree, (n) => typeof n.props?.question === "string");
  assert.equal(ask.props.question, "Delete “Regulars”?");
  assert.equal(ask.props.detail, "The people stay.");
  // The profile's section is the person page's rail (surfaces/people/person/person-real.tsx), and what it draws is the
  // person's lists (lists.tsx), run here on the stub React the page tests share, over the People the seam holds.
  const LR = await import("../../_stub-react.mjs");
  LR.installStubReact();
  const went = [];
  globalThis.CHANLY = { nav: (to) => went.push(to) };
  const { setSurfaceValue } = await importSrc("apps/dashboard/src/surfaces/surface-values.ts");
  const { PersonLists, ListsGroup } = await importSrc("apps/dashboard/src/surfaces/people/person/lists.tsx");
  const picked = [];
  const section = (saved, smart = []) => {
    // Only what the section reads of People: the lists, and whether they could be read.
    setSurfaceValue("people", { saved, savedRead: true });
    LR.fresh();
    return LR.again(() =>
      globalThis.React.createElement(PersonLists, {
        personId: "p1",
        canEdit: true,
        first: "Person",
        flash() {},
        smart,
        onPick: () => picked.push("lists"),
      }),
    );
  };
  const kept = { id: "s1", name: "Regulars", ids: ["p1"], byHand: true };
  const onOne = section([kept]);
  LR.fresh();
  const group = LR.again(() =>
    globalThis.React.createElement(ListsGroup, {
      personId: "p1",
      canEdit: true,
      first: "Person",
      flash() {},
      smart: [],
      row: false,
      onPick() {},
    }),
  );
  assert.ok(LR.byTestId(group, "person-lists"), "the profile's own section, on the person's rail");
  assert.equal(
    LR.all(onOne, (n) => n.props?.["data-testid"] === "person-list-chip").length,
    1,
    "a list they are on is a chip",
  );
  const empty = section([], [{ id: "needs", label: "Needs you now", why: "" }]);
  assert.ok(LR.textOf(empty).includes("No lists of your own yet."));
  assert.ok(LR.textOf(empty).includes("Make one"));
  LR.press(LR.byTestId(empty, "person-lists-make"));
  assert.deepEqual(
    [went, picked],
    [[], ["lists"]],
    "the empty section opens the lists sheet, where a list is made with them on it; 'the People rail' is not a place a phone has",
  );
  setSurfaceValue("people", undefined);
  // The rail's new list (rail/new-list.tsx, lists/rule-editor.tsx) is named in a row beside its press: the field takes the
  // row's width and gives it back to the press, as People's sheet gives it (pinned as clients.css's text until 26 Nov 2026).
  const field = givenOn("apps/dashboard/src/styles/clients.css", ".cl-rail-newlist input", DESK);
  assert.deepEqual(
    [field.flex, field["min-width"]],
    ["1", "0"],
    "the new list's name takes the row, and shrinks for its press",
  );
});

test("Lists is a view of People: a kept list is the page's title with its rename, its delete and its one door; the old route lands there; the seeded page keeps the demo", async () => {
  const reg = await import(
    pathToFileURL(path.join(here, "../../../apps/dashboard/src/bridge/surface-registry.ts")).href
  );
  assert.equal(reg.SURFACE_STATES.segments, "real", "the route is real: it lands on People");
  assert.equal(reg.ROUTE_SURFACE.segments, "people", "the same facts as People, never a second fetch");
  // REGRESSION: a second page of the same people. The address is People's (above), and no page of its own is loaded:
  // the frame's manifest loads the seed's globals alone (pinned as manifest.ts's text until 26 Nov 2026).
  assert.equal(reg.surfaceStateFor("segments"), "real");
  assert.equal(reg.routeSurfaceFor("segments"), "people");
  // The phone's way to the lists is the bar's list button now, pressed in people-honest ("on a phone the lists are
  // behind the bar's list button"), not a testid read here.
  // The kept list's title, drawn: the title, its rename, and the name as the box it is typed in, from the first draw.
  const title = (canEdit) => again(() => ListTitle({ list: REGULARS, canEdit, onRenamed() {}, onRefused() {} }));
  fresh();
  let tree = title(true);
  assert.ok(
    byTestId(tree, "saved-filter") && byTestId(tree, "list-rename"),
    "a kept list is the title, with its rename",
  );
  assert.equal(
    byTestId(tree, "list-rename-name")?.props.contentEditable,
    "plaintext-only",
    "and the name is a box in the title's own place: renaming it moves nothing",
  );
  // Somebody who may not edit lists has the title and no way to rename it.
  fresh();
  tree = title(false);
  assert.ok(byTestId(tree, "saved-filter") && !byTestId(tree, "list-rename") && !byTestId(tree, "list-rename-name"));
  // The row's drop, and the bar's: with a list kept by hand open, and only then, a person or a selection leaves it.
  const someone = personRow({ id: "p1" });
  const dropped = [];
  const actions = PL_COLUMNS.find((c) => c.key === "actions");
  const drop = { list: REGULARS, onDrop: (p) => dropped.push(p.id) };
  fresh();
  tree = again(() => actions.cell(someone, { bookingLink: null, drop }));
  press(byTestId(tree, "row-drop-list"));
  assert.deepEqual(dropped, ["p1"], "the row takes the person off the list that is open");
  fresh();
  tree = again(() => actions.cell(someone, { bookingLink: null, drop: null }));
  assert.equal(byTestId(tree, "row-drop-list"), null, "and nobody can be taken off a list that is not open");
  const bar = (activeSaved) => {
    fresh();
    return again(() =>
      PeopleBulkBar({
        sel: new Set(["p1"]),
        rows: [someone],
        saved: [REGULARS],
        canEdit: true,
        canExport: true,
        onClear() {},
        flash() {},
        activeSaved,
      }),
    );
  };
  assert.ok(byTestId(bar(REGULARS), "bulk-drop-list"), "the bar's own, over a list kept by hand");
  assert.equal(
    byTestId(bar({ ...REGULARS, byHand: false }), "bulk-drop-list"),
    null,
    "a rule says who is on a smart list",
  );
  assert.equal(byTestId(bar(null), "bulk-drop-list"), null);
  // The phone's lists, behind one tap, as a sheet.
  fresh();
  let closed = 0;
  // The kit's Sheet, a phone's small job: its Done, its Esc, its wash and a pull each ask through onClose (Base UI's).
  tree = again(() => PeopleListsSheet({ open: true, onClose: () => closed++ }));
  assert.deepEqual(
    [tree.props.shape, tree.props.open, tree.props.testid, tree.props.close],
    ["job", true, "people-lists-sheet", { word: "Done" }],
  );
  tree.props.onClose();
  assert.equal(closed, 1);
  // list-action (the list's one door) and show-everyone are the page's own (page/screen.tsx): pressed in
  // people/people-page/, with the shell's and a profile's New list (segments:new) opening the box.
  // The People page owns where a list's route lands (words.ts plListRoute), and every page that links a list imports it.
  assert.equal(plListRoute("s1"), "clients", "before People's lists are read, People itself");
  // The rest is behaviour, tested as such: the shell landing segments/<id> on People (shell/surfaces/status/), no
  // Lists tab on a real workspace (shell-status), a kept list's door and sentence (people-honest).
});

test("a list archived instead of deleted says why in the reader's words: a campaign runs on it, never a playbook (decision 19)", async () => {
  const { plArchivedWords } = await importSrc("apps/dashboard/src/surfaces/people/lists/doors.tsx");
  assert.equal(
    textOf(plArchivedWords("VIP", { paused: [], readBy: [] })),
    "VIP is archived, not deleted: a campaign runs on it. It comes back from Archived under your lists.",
  );
});
