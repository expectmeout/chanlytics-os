/**
 * A person's address is a page of People (decision 0015, step 5): `clients/<id>`, drawn by the route `people/[[...param]]`,
 * takes any param that is not a scope (Leads, the Pipeline) or a view of People, and names its crumbs from the person: their
 * name in People, else the copy the tab holds, else "Profile". The People crumb is the page's own Back.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.window = { __DEMO_MODE: true };
const { isPersonParam, peopleChrome, peopleTakes } =
  await import("../../../../../apps/dashboard/src/surfaces/people/chrome.ts");
const { routeHasPage } = await import("../../../../../apps/dashboard/src/surfaces/routes.ts");
const { setSurfaceValue } = await import("../../../../../apps/dashboard/src/surfaces/surface-values.ts");

const UUID = "ed2244f3-9f88-49c5-863e-fbdea4b60e12";

test("a param is a person's unless it names a scope or a view of People, in the order the frame's rows told them apart", () => {
  for (const id of [UUID, "c-aisha", "p1", "leadership", "pipelines", "seg", "list"])
    assert.equal(isPersonParam(id), true, `${id} is a person's`);
  for (const not of [
    "leads",
    "leads:s-austin:c-ready",
    "pipeline",
    "pipeline:v-board:p-x",
    "new-list",
    "seg:regulars",
    "list:vips",
    "state:needs_you",
  ])
    assert.equal(isPersonParam(not), false, `${not} is not`);
});

test("the page takes a person, a view of People, Leads and the Pipeline (which it draws as People where deals are off)", () => {
  setSurfaceValue("people", undefined);
  assert.equal(peopleTakes(UUID), true);
  assert.equal(peopleTakes("seg:regulars"), true);
  assert.equal(peopleTakes("new-list"), true);
  assert.equal(
    peopleTakes("leads:s-austin"),
    true,
    "Leads left the shell: People's page draws it (decision 0015, step 9)",
  );
  assert.equal(peopleTakes("pipeline"), true, "no surface says deals are on: the Pipeline's address draws People");
  setSurfaceValue("people", { dealsOn: true, rows: [], lists: [], saved: [] });
  assert.equal(peopleTakes("pipeline"), true, "with deals on it draws the Pipeline: the page's own since it moved");
  assert.equal(peopleTakes(UUID), true);
  setSurfaceValue("people", undefined);
  // The registry says so too: the route holds a person's address as it holds People's.
  assert.equal(
    routeHasPage(`clients/${UUID}`, { clients: { activeNav: "clients", crumbs: [], pane: true, takes: peopleTakes } }),
    true,
  );
});

test("a person's crumbs are People (the page's own Back) and their name: from People's row, else the tab's copy, else Profile", () => {
  const back = () => {};
  const from = (id) => peopleChrome({ param: id, backToPeople: back });
  // A demo session names them from the sample's row.
  const named = from("c-aisha");
  assert.equal(named.crumbs.length, 2);
  assert.deepEqual(named.crumbs[0], { label: "People", to: "clients", go: back });
  assert.equal(named.crumbs[1], "Aisha Khan");
  // A person is a mount of their own, and their tabs are their page too (0052, 13): one mount, so a tab is never a new page.
  assert.equal(named.mount, "clients/c-aisha");
  const onTab = from("c-aisha/history");
  assert.equal(onTab.mount, "clients/c-aisha", "History is the same mount");
  assert.equal(onTab.crumbs[1], "Aisha Khan", "and names the person, never the tab");
  assert.equal(from("c-nobody").crumbs[1], "Profile");
  // A real workspace's People, once read, names them by its own rows.
  globalThis.window.__DEMO_MODE = false;
  setSurfaceValue("people", { rows: [{ id: UUID, name: "Daniela Reyes" }], lists: [], saved: [] });
  assert.equal(from(UUID).crumbs[1], "Daniela Reyes");
  assert.equal(from("00000000-0000-4000-8000-000000000000").crumbs[1], "Profile", "nobody the tab holds either");
  setSurfaceValue("people", undefined);
});

test("the list's own addresses keep their crumbs, mounts and act", () => {
  const back = () => {};
  assert.deepEqual(peopleChrome({ param: null, backToPeople: back }).crumbs, ["People"]);
  assert.equal(peopleChrome({ param: null, backToPeople: back }).mount, "clients");
  assert.deepEqual(peopleChrome({ param: "new-list", backToPeople: back }).crumbs, [
    { label: "People", to: "clients" },
    "New list",
  ]);
  assert.equal(peopleChrome({ param: "pipeline", backToPeople: back }).mount, "clients/pipeline");
});
