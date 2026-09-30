/**
 * People's address, run (decision 0015, step 5: People's list left the shell). The frame draws its chrome around the page
 * from what surfaces/routes.ts and surfaces/people/chrome.ts say of an address; a list's own route (`lists/<id>`) is a page
 * that replaces itself with People's address for the list; and the page mounts afresh only for an address it did not write.
 * The page's own behaviour is people-honest.test.mjs's; this is the address around it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";
import { installLegacyReact, fresh, again, settle, textOf } from "../../_legacy-react.mjs";

installLegacyReact();
const { setSurfaceValue } = await importSrc("apps/dashboard/src/surfaces/surface-values.ts");
const { peopleTakes, peopleChrome } = await importSrc("apps/dashboard/src/surfaces/people/chrome.ts");
const { plListRoute } = await importSrc("apps/dashboard/src/surfaces/people/words.ts");
const { noteOwnAddress, takeOwnAddress } = await importSrc("apps/dashboard/src/surfaces/people/page/own-address.ts");
const { ListsRoute } = await importSrc("apps/dashboard/src/surfaces/people/lists-route.tsx");
const { SURFACE_ROUTES, routeHasPage, staysOnPage } = await importSrc("apps/dashboard/src/surfaces/routes.ts");

const people = (over = {}) => ({
  dealsOn: false,
  lists: [
    { id: "needs_you", label: "Needs you", ids: [] },
    { id: "quiet", label: "Gone quiet", ids: [] },
  ],
  saved: [{ id: "s1", name: "Regulars", ids: [] }],
  archived: [{ id: "s2", name: "Old list", ids: [] }],
  ...over,
});

test("the page takes People's views, the New list door and a person; Leads stays with the frame", () => {
  setSurfaceValue("people", people());
  for (const param of ["new-list", "seg:needs_you", "list:s1", "state:quiet", "state:waiting_on_you"])
    assert.equal(peopleTakes(param), true, param);
  // A person is any word that is not one of these: an id that only begins with a word of the page's is theirs.
  for (const param of ["c-1", "seg", "list", "new-listing", "leadsish", "state"])
    assert.equal(peopleTakes(param), true, param);
  for (const param of ["leads", "leads:s-1"]) assert.equal(peopleTakes(param), false, param);
});

test("the Pipeline's address is the page's, deals on or off: it draws the Pipeline where deals are on, People where they are off", () => {
  setSurfaceValue("people", people({ dealsOn: false }));
  assert.equal(peopleTakes("pipeline"), true);
  assert.equal(peopleTakes("pipeline:v-board"), true);
  assert.equal(peopleTakes("pipelineish"), true, "a word that only begins with it is somebody's id: a person's page");
  setSurfaceValue("people", people({ dealsOn: true }));
  assert.equal(peopleTakes("pipeline"), true, "where deals are on the page draws the Pipeline (people-route.tsx)");
  assert.equal(peopleTakes("pipeline:v-board"), true);
  setSurfaceValue("people", undefined);
  assert.equal(peopleTakes("pipeline"), true, "before People is read the address draws People, as it did");
});

test("the frame's rows for People: routeHasPage and staysOnPage follow what the page takes", () => {
  setSurfaceValue("people", people());
  assert.deepEqual(
    [SURFACE_ROUTES.clients.activeNav, SURFACE_ROUTES.clients.pane, SURFACE_ROUTES.segments.activeNav],
    ["clients", true, "clients"],
    "both light People in the sidebar",
  );
  assert.equal(routeHasPage("clients"), true);
  assert.equal(routeHasPage("clients/list:s1"), true);
  assert.equal(routeHasPage("clients/c-1"), true, "a person is the page's too (people/person)");
  assert.equal(routeHasPage("clients/leads"), false);
  assert.equal(routeHasPage("segments/s1"), true, "a list's own route is a page: it replaces itself with People's");
  assert.equal(staysOnPage("clients", "clients/list:s1"), true, "a pick is a move inside the page");
  assert.equal(staysOnPage("clients/list:s1", "clients/seg:needs_you"), true);
  assert.equal(staysOnPage("clients/list:s1", "clients/c-1"), true, "a person opens inside the page, as a list does");
  assert.equal(
    staysOnPage("segments/s1", "clients/list:s1"),
    false,
    "from the Lists page to People is a request for a page",
  );
});

test("the chrome of an address: People's crumb, what the view is called, one mount for every view, and the Ask door only on the bare list", () => {
  setSurfaceValue("people", people());
  const bare = peopleChrome({ param: null });
  assert.deepEqual(bare.crumbs, ["People"]);
  assert.equal(bare.mount, "clients");
  assert.deepEqual(bare.act, { ask: true, label: "Add client", glyph: "plus" });
  const at = (param) => peopleChrome({ param });
  assert.deepEqual(at("new-list").crumbs, [{ label: "People", to: "clients" }, "New list"]);
  assert.deepEqual(at("seg:needs_you").crumbs.at(-1), "Needs you", "a list of People's, by its own label");
  assert.deepEqual(at("list:s1").crumbs.at(-1), "Regulars", "a list kept by hand, by its name");
  assert.deepEqual(
    at("list:s2").crumbs.at(-1),
    "List",
    "an archived list is named for what it is, as the frame named it",
  );
  assert.deepEqual(at("state:waiting_on_you").crumbs.at(-1), "waiting on you", "every underscore, not the first");
  assert.deepEqual(at("seg:nope").crumbs.at(-1), "List", "a list People has not got is named for what it is");
  for (const param of ["new-list", "seg:needs_you", "list:s1", "state:quiet", "seg:nope"])
    assert.equal(at(param).mount, "clients", `${param}: the page follows its own address, so one mount`);
  assert.equal(at("list:s1").act, undefined, "the door is the bare list's");
  assert.deepEqual(
    [at("pipeline").crumbs, at("pipeline").mount],
    [["People"], "clients/pipeline"],
    "the Pipeline's address where deals are off draws People, under the mount it always had",
  );
  setSurfaceValue("people", undefined);
  assert.equal(at("seg:needs_you").crumbs.at(-1), "Segment", "before People is read, nothing names the list");
});

test("where a list's own route lands: the list picked by its kind, People itself for one it has not got", () => {
  setSurfaceValue("people", people());
  assert.equal(plListRoute("s1"), "clients/list:s1", "kept by hand");
  assert.equal(plListRoute("s2"), "clients/list:s2", "archived: People says so on its page");
  assert.equal(plListRoute("needs_you"), "clients/seg:needs_you", "one of People's own");
  assert.equal(plListRoute("nope"), "clients/seg:nope", "a word People does not have");
  assert.equal(
    plListRoute("6f0f5f1e-3c1e-4c9e-9d43-0f4f0c5b7a11"),
    "clients/list:6f0f5f1e-3c1e-4c9e-9d43-0f4f0c5b7a11",
    "an id is a kept list's, deleted or from another workspace",
  );
  assert.equal(plListRoute(""), "clients");
  assert.equal(plListRoute(null), "clients");
  setSurfaceValue("people", undefined);
  assert.equal(plListRoute("s1"), "clients", "before People is read: People itself");
});

test("an address the page wrote is spent once: a link that arrives at it later is not the page's", () => {
  noteOwnAddress("clients/list:s1");
  assert.equal(takeOwnAddress("clients/list:s1"), true, "the pick the page wrote says where it stands");
  assert.equal(takeOwnAddress("clients/list:s1"), false, "spent: the next arrival is a link or Back");
  noteOwnAddress("clients/list:s1");
  assert.equal(takeOwnAddress("clients/state:quiet"), false, "another address is not the one written");
  assert.equal(takeOwnAddress("clients/list:s1"), false, "and the note is spent by any arrival");
});

/** The Lists route drawn on the tests' stub React, with the address it replaces recorded. */
function listsAt(pathname) {
  const replaced = [];
  globalThis.window = globalThis;
  globalThis.location.pathname = pathname;
  globalThis.location.hash = "";
  globalThis.history = {
    replaceState: (_s, _t, url) => replaced.push(url),
    pushState: (_s, _t, url) => replaced.push(`push ${url}`),
  };
  return replaced;
}

test("a list's own route replaces itself with People's address for the list, once People is read, and says Reading until then", async () => {
  fresh();
  setSurfaceValue("people", undefined);
  const replaced = listsAt("/w/acme/lists/s1");
  let tree = globalThis.React.createElement(ListsRoute, { pathname: "/w/acme/lists/s1" });
  await settle();
  assert.match(textOf(tree), /Reading/, "the shell's own reading pane, never the seeded Segments page");
  assert.deepEqual(replaced, [], "nothing to land on yet: which list s1 names is People's to say");
  setSurfaceValue("people", people());
  fresh();
  tree = globalThis.React.createElement(ListsRoute, { pathname: "/w/acme/lists/s1" });
  await settle();
  assert.deepEqual(replaced, ["/w/acme/people/list:s1"], "replaced, never pushed: Back leaves People");
  // A later read of People, or a refresh of it, does not replace the address again.
  setSurfaceValue("people", people({ dealsOn: false }));
  again(() => globalThis.React.createElement(ListsRoute, { pathname: "/w/acme/lists/s1" }));
  await settle();
  assert.equal(replaced.length, 1, "once for the address");
  assert.ok(tree);
});

test("a list People does not have lands on People's own address for it, where People says it is not here", async () => {
  setSurfaceValue("people", people());
  fresh();
  const replaced = listsAt("/w/acme/lists/needs_you");
  globalThis.React.createElement(ListsRoute, { pathname: "/w/acme/lists/needs_you" });
  await settle();
  fresh();
  globalThis.React.createElement(ListsRoute, { pathname: "/w/acme/lists/nope" });
  await settle();
  assert.deepEqual(replaced, ["/w/acme/people/seg:needs_you", "/w/acme/people/seg:nope"]);
  fresh();
  globalThis.React.createElement(ListsRoute, { pathname: "/w/acme/lists" });
  await settle();
  assert.equal(replaced.at(-1), "/w/acme/people", "no id: People itself");
});
