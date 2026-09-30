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
import { readCode, readRaw, importSrc } from "../../_source.mjs";
import { installLegacyReact, fresh, again, byTestId, find, press, textOf, peoplePages } from "../../_legacy-react.mjs";
import { personDto, personRow, ROW_NOW, ROW_TZ } from "../../consent/_person-row.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

// People's page parts, drawn on the shared stub React over the real TSX (surfaces/people/), as people-table.test.mjs draws
// the table: the hooks go on the react module first (installLegacyReact does it), then the parts are imported.
installLegacyReact();
const { peopleSurfaceOf } = await importSrc("apps/dashboard/src/surfaces/people/surface-map.ts");
const { NewListRow } = await importSrc("apps/dashboard/src/surfaces/people/rail/new-list.tsx");
const { ListTitle, DeleteListButton } = await importSrc("apps/dashboard/src/surfaces/people/lists/list-title.tsx");
const { PeopleListsSheet } = await importSrc("apps/dashboard/src/surfaces/people/rail/lists-sheet.tsx");
const { PeopleBulkBar } = await importSrc("apps/dashboard/src/surfaces/people/bulk/bulk-bar.tsx");
const { PL_COLUMNS } = await importSrc("apps/dashboard/src/surfaces/people/cells/columns.tsx");
const { plPeopleShown } = await importSrc("apps/dashboard/src/surfaces/people/page/shown.ts");
const { plListRoute } = await importSrc("apps/dashboard/src/surfaces/people/words.ts");

test("the tables: the workspace's, members read, acting members write, a person of another workspace or an erased one cannot be put on a list", () => {
  const m = readRaw("supabase/migrations/00044_saved_lists.sql");
  assert.ok(m.includes("create table public.segments (") && m.includes("create table public.segment_members ("));
  assert.ok(m.includes("unique (tenant_id, name)"), "one name per workspace");
  assert.ok(
    m.includes("alter table public.segments        enable row level security;") &&
      m.includes("alter table public.segment_members enable row level security;"),
  );
  assert.ok(
    m.includes("with check (public.is_acting_member(tenant_id) and created_by = (select auth.uid()));"),
    "a list is made by an acting member, in their own name",
  );
  assert.ok(
    m.includes(
      "and exists (select 1 from public.contacts c where c.id = contact_id and c.tenant_id = segment_members.tenant_id and c.erased_at is null)",
    ),
    "the person must be of the workspace and still exist",
  );
  assert.ok(
    m.includes("grant update (name) on public.segments to authenticated;"),
    "a session client may rename a list and nothing else about it",
  );
  assert.ok(m.includes("after update of erased_at on public.contacts"), "an erased person leaves every list");
  assert.ok(!/insert into public\.decisions|'create_list'|'delete_list'/.test(m), "no ledger rows for a grouping");
});

test("the routes: one workspace's lists with their ids, owner or operator to change them, the same refusals in the same words", () => {
  // Scoped by tenant, not by RLS alone, and every member read: people-routes.test.mjs runs the GET over two
  // workspaces and over a list past PostgREST's max_rows.
  const list = readCode("apps/dashboard/app/api/v1/segments/route.ts");
  assert.ok(list.includes('role: "operator",') && list.includes('rate: "lists",'));
  // A taken name is the route's 409 in one sentence, which Ask's list card refuses in too (server/people/lists.ts).
  assert.ok(list.includes('if (error?.code === "23505") throw new AppError("conflict", LIST_NAME_TAKEN, 409);'));
  const one = readCode("apps/dashboard/app/api/v1/segments/[id]/route.ts");
  assert.ok(
    one.includes('const add = cleanIdList(body?.add, "add");') &&
      one.includes('const remove = cleanIdList(body?.remove, "remove");'),
  );
  assert.ok(one.includes('throw new AppError("validation", "Nothing to change.");'));
  // Adding someone twice is not an error: people-routes.test.mjs runs the PUT twice over the same person.
  assert.ok(
    /if \(error\.code === "42501"\)\s*throw new AppError\("validation", "One of those people is not in this workspace any more\."\);/.test(
      one,
    ),
    "RLS's refusal gets words",
  );
  // The delete counts what it removed (packages/db deleteList); people-routes.test.mjs deletes a list twice.
  assert.ok(
    one.includes('if (!count) throw new AppError("not_found", "List not found.", 404);'),
    "a delete that removed nothing is not a success",
  );
  const helper = readCode("apps/dashboard/src/server/people/lists.ts");
  assert.ok(
    helper.includes("export const LIST_NAME_MAX = 60;") &&
      helper.includes("export const LIST_BATCH_MAX = 500;") &&
      helper.includes('export const LIST_NAME_TAKEN = "A list with that name already exists.";'),
  );
  assert.ok(
    readCode("apps/dashboard/src/server/rate-limit.ts").includes(
      'lists: { limit: 60, windowMs: MIN_MS, noun: "list changes" }',
    ),
  );
});

test("the surface: lists ride People, counted over the rows on the page; the verbs re-fetch it", async () => {
  const s = readCode("apps/dashboard/src/surfaces/people/surface.ts");
  assert.ok(s.includes('read("GET segments")'));
  // Run, not read: the mapping (surface-map.ts) over two people and a list that names one of them and somebody who is
  // not among the rows (an erased person leaves every list, 00044).
  const loaded = {
    tz: ROW_TZ,
    people: [personDto({ id: "p1", marketing_consent: "opted_in" }), personDto({ id: "p2" })],
    page: null,
    saved: [{ id: "s1", name: "Regulars", ids: ["p1", "erased"] }],
    calendar: { state: "ok", source: "Google Calendar" },
    bookingLink: null,
    dealsOn: false,
    consultFirst: false,
    dealPace: null,
    followUp: null,
    views: {},
    viewsRead: true,
  };
  const kept = peopleSurfaceOf(loaded, null, new Date(ROW_NOW)).saved[0];
  assert.equal(kept.count, 1, "an erased person never counts");
  assert.deepEqual(kept.ids, ["p1"]);
  assert.equal(kept.action.to, "broadcasts/s1", "and the list carries its one step: a broadcast to those who said yes");
  const v = readCode("apps/dashboard/src/surfaces/people/people-lists.ts");
  for (const verb of ["create:", "rename:", "remove:", "add:", "drop:"]) assert.ok(v.includes(verb), verb);
  const { AFTER } = await importSrc("apps/dashboard/src/legacy-bridge/refresh-map.ts");
  for (const k of ["POST segments", "PUT segments/[id]", "DELETE segments/[id]"])
    assert.deepEqual(
      AFTER[k]().map((o) => o.key),
      ["people", "broadcasts", "playbooks"],
      `${k}: the chips are the server's, and a list is an audience and a playbook's moment too`,
    );
  assert.ok(readCode("apps/dashboard/src/legacy-bridge/LegacyApp.tsx").includes("installLists();"));
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
  // A saved list filters the table like a computed one: the page's shown rows are the list's ids, and its title says so.
  const rows = [personRow({ id: "p1" }), personRow({ id: "p2" })];
  const shownFor = (savedId) =>
    plPeopleShown({
      rows,
      found: null,
      lists: [],
      saved: [{ id: "s1", ids: ["p1"] }],
      tab: "all",
      listId: null,
      savedId,
      q: "",
      sortBy: "last",
      sortDir: "desc",
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
  assert.ok(
    readCode("apps/dashboard/src/surfaces/people/person/person-real.tsx").includes('data-testid="person-lists"'),
  );
  const LR = await import("../../_legacy-react.mjs");
  LR.installLegacyReact({ __DEMO_MODE: false });
  const went = [];
  globalThis.CHANLY = { nav: (to) => went.push(to) };
  const { setSurfaceValue } = await importSrc("apps/dashboard/src/surfaces/surface-values.ts");
  const { PersonLists } = await importSrc("apps/dashboard/src/surfaces/people/person/lists.tsx");
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
      }),
    );
  };
  const kept = { id: "s1", name: "Regulars", ids: ["p1"], byHand: true };
  assert.equal(
    LR.all(section([kept]), (n) => n.props?.["data-testid"] === "person-list-chip").length,
    1,
    "a list they are on is a chip",
  );
  const empty = section([], [{ id: "needs", label: "Needs you now", why: "" }]);
  assert.ok(LR.textOf(empty).includes("No lists of your own yet."));
  assert.ok(LR.textOf(empty).includes("Make one on People"));
  LR.press(LR.byTestId(empty, "person-lists-make"));
  assert.deepEqual(
    went,
    ["clients/new-list"],
    "the empty section is a door to People with the New list box opening; 'the People rail' is not a place a phone has",
  );
  setSurfaceValue("people", undefined);
  assert.ok(readRaw("apps/dashboard/src/legacy/styles/clients.css").includes(".cl-rail-newlist input {"));
});

test("Lists is a view of People: a kept list is the page's title with its rename, its delete and its one door; the old route lands there; the seeded page keeps the demo", async () => {
  const reg = await import(
    pathToFileURL(path.join(here, "../../../../../apps/dashboard/src/legacy-bridge/surface-registry.ts")).href
  );
  assert.equal(reg.SURFACE_STATES.segments, "real", "the route is real: it lands on People");
  assert.equal(reg.ROUTE_SURFACE.segments, "people", "the same facts as People, never a second fetch");
  assert.ok(
    !readCode("apps/dashboard/src/legacy-bridge/manifest.ts").includes("segments-real"),
    "REGRESSION: a second page of the same people",
  );
  assert.ok(
    readCode("apps/dashboard/src/legacy/demo/pages/segments.jsx").includes("window.SegmentsPage = SegmentsPage;"),
    "the demo's page under the name the shell draws",
  );
  // The phone's way to the lists is the bar's list button now, pressed in people-honest ("on a phone the lists are
  // behind the bar's list button"), not a testid read here.
  // The kept list's title, drawn: the title, its rename and the box the rename opens.
  const title = (canEdit) => again(() => ListTitle({ list: REGULARS, canEdit, onRenamed() {} }));
  fresh();
  let tree = title(true);
  assert.ok(
    byTestId(tree, "saved-filter") && byTestId(tree, "list-rename"),
    "a kept list is the title, with its rename",
  );
  press(byTestId(tree, "list-rename"));
  tree = title(true);
  assert.ok(byTestId(tree, "list-rename-name"), "and the rename is a box in the title's own place");
  // Somebody who may not edit lists has the title and no way to rename it.
  fresh();
  tree = title(false);
  assert.ok(byTestId(tree, "saved-filter") && !byTestId(tree, "list-rename"));
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
  tree = again(() => PeopleListsSheet({ onClose: () => closed++ }));
  assert.ok(byTestId(tree, "people-lists-sheet"));
  press(byTestId(tree, "people-lists-close"));
  assert.equal(closed, 1);
  // list-action (the list's one door) and show-everyone are the page's own (page/screen.tsx): pressed in
  // people-honest.test.mjs, with the shell's and a profile's New list (segments:new) opening the box.
  // The People page owns where a list's route lands:
  assert.equal(peoplePages.__listRoute, plListRoute, "the People page owns where a list's route lands");
  // The rest is behaviour, tested as such: the shell landing segments/<id> on People (shell-status.test.mjs), no
  // Lists tab on a real workspace (shell-status), a kept list's door and sentence (people-honest).
});
