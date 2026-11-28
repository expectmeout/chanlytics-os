/**
 * A switch of workspace is a new document, for as long as anything leans on that (the review of 28 Nov 2026, item 31).
 *
 * tab-stores.json says of some sixty of the tab's stores that they are one workspace's and right only because a switch
 * loads the page again: the surfaces' values, Today's and the Inbox's last reads, what each read let pass. Each is true
 * today. This is what makes it stay true: every way the bridge changes the workspace the address names is run here, over
 * a made-up window, and each must leave by the document's own door (`location.assign` or `replace`), with what the device
 * keeps sealed first, and never by the history the App Router follows, which would keep this document and every store in
 * it. And a move between pages, which does go by that history, never names another workspace.
 *
 * Were a switch ever to keep the document (to be quicker), this fails and names the stores to key or empty first. With
 * no row left that says "new document", it says so and holds nothing.
 *
 * The other ways out are held by their own tests, each run on the real code: a seat removed
 * (tests/workspace/team/a-seat-removed-leaves-nothing-on-the-device.test.mjs), a phone's push for another workspace
 * (tests/shell/in-app.test.mjs), the sign-out (tests/shell/surfaces/sign-out-seals.test.mjs).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, importSrc } from "../../_source.mjs";
import { bridgeHolds } from "../_bridge-holds.mjs";
import { historyOf } from "../address/_address.mjs";

const HARBOR = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", slug: "harbor-moving", name: "Harbor Moving" };
const GLOW = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", slug: "glow-studio", name: "Glow Studio" };
const ME = { id: "u1", email: "ada@example.com", role: "owner" };
const seat = (workspace) => ({ ...workspace, status: "active", timezone: "America/New_York" });

/** A store as the browser's are: read by name and walked by index, as a clear walks it. */
const storage = () => {
  const held = new Map();
  return {
    getItem: (k) => (held.has(k) ? held.get(k) : null),
    setItem: (k, v) => held.set(k, String(v)),
    removeItem: (k) => held.delete(k),
    key: (i) => [...held.keys()][i] ?? null,
    get length() {
      return held.size;
    },
  };
};

/** How the document was left, in order: by its own door (a load), or not at all. */
const left = [];
/** What the server answers for the list of workspaces, and for any other read. */
const wire = { list: null, refuses: null };
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const win = {
  location: {
    pathname: `/w/${HARBOR.slug}/inbox`,
    search: "",
    hash: "",
    assign: (to) => left.push(["assign", to]),
    replace: (to) => left.push(["replace", to]),
    reload: () => left.push(["reload"]),
  },
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: () => true,
  fetch: async (url, init = {}) => {
    const asked = `${init.method ?? "GET"} ${new URL(String(url), "https://app.example.org").pathname}`;
    if (wire.refuses) return json(wire.refuses.status, { ok: false, error: wire.refuses.error });
    if (asked === "GET /api/v1/workspaces") return json(200, { ok: true, data: wire.list });
    if (asked === "POST /api/v1/me/invitations/accept") return json(200, { ok: true, data: { joined: [] } });
    return json(404, { ok: false, error: { code: "not_found", message: "no" } });
  },
};
const history = historyOf(win);
win.localStorage = globalThis.localStorage = storage();
win.sessionStorage = globalThis.sessionStorage = storage();
globalThis.document = { visibilityState: "visible", addEventListener() {}, removeEventListener() {} };
globalThis.window = win;
globalThis.location = win.location;
globalThis.CustomEvent ??= class CustomEvent {
  constructor(type) {
    this.type = type;
  }
};

const data = await importSrc("apps/dashboard/src/bridge/surface-data.ts");
const address = await importSrc("apps/dashboard/src/bridge/workspace.ts");
const client = await importSrc("apps/dashboard/src/bridge/api.ts");
const device = await importSrc("apps/dashboard/src/client/kept-on-device.ts");

const leaning = Object.entries(
  JSON.parse(fs.readFileSync(path.join(ROOT, "tests/shell/stores/tab-stores.json"), "utf8")).stores,
).flatMap(([file, rows]) =>
  Object.entries(rows)
    .filter(([, whose]) => whose === "new document")
    .map(([name]) => `${file} ${name}`),
);
/** What a failure says: who leans on the load this way out no longer makes. */
const whoLeans = `${leaning.length} stores are right only because this loads the page again; key or empty each first: ${leaning.join(", ")}`;

/** The world as a tab in Harbor Moving holds it, with nothing left yet. */
function inHarbor() {
  left.length = 0;
  history.pushed.length = 0;
  history.replaced.length = 0;
  win.location.pathname = `/w/${HARBOR.slug}/inbox`;
  win.location.hash = "";
  bridgeHolds(
    { who: { workspaces: [seat(HARBOR), seat(GLOW)], me: ME, activeWorkspaceId: HARBOR.id } },
    { fresh: true },
  );
}

/** It left by a load, to `to`, and by nothing the document survives. */
function leftByALoad(how, to) {
  assert.deepEqual(left, [[how, to]], `not one load to ${to}. ${whoLeans}`);
  assert.deepEqual([...history.pushed, ...history.replaced], [], `the address moved inside the document. ${whoLeans}`);
}

test("some stores lean on a switch loading the page again, and the list says which", (t) => {
  t.diagnostic(
    leaning.length
      ? `${leaning.length} stores lean on a switch being a new document`
      : "no store leans on a switch being a new document: the tests below hold nothing any more",
  );
  assert.ok(Array.isArray(leaning));
});

test(
  "the switcher's switch leaves by a load, with what the device keeps sealed first",
  { skip: leaning.length === 0 },
  () => {
    inHarbor();
    data.switchWorkspace(GLOW.id);
    leftByALoad("assign", `/w/${GLOW.slug}`);
    assert.equal(device.deviceSealed(), true, "sealed: a read landing before the page unloads writes nothing back");
    assert.equal(globalThis.localStorage.getItem("chanlytics.workspace"), GLOW.slug, "the home returns to it");
  },
);

test("a workspace just made opens by a load too, at the route it asks for", { skip: leaning.length === 0 }, () => {
  inHarbor();
  data.switchWorkspace("cccccccc-cccc-4ccc-8ccc-cccccccccccc", "tide-yoga", "#/start");
  leftByALoad("assign", "/w/tide-yoga/start");
});

test("a switch to the workspace on screen goes nowhere", () => {
  inHarbor();
  data.switchWorkspace(HARBOR.id);
  assert.deepEqual(left, []);
  assert.deepEqual([...history.pushed, ...history.replaced], []);
});

test(
  "the workspace read corrects an address that names another workspace by a load",
  { skip: leaning.length === 0 },
  async () => {
    inHarbor();
    // The address names Harbor; the server says this person's workspace here is Glow (a seat gone, a stale preference).
    bridgeHolds({ who: { workspaces: null, activeWorkspaceId: null } });
    wire.list = { workspaces: [seat(GLOW)], active_workspace_id: GLOW.id, user: ME };
    client.api().forget();
    await data.workspaceOverride.apply();
    leftByALoad("replace", `/w/${GLOW.slug}/inbox`);
  },
);

test(
  "a read the server could place in no workspace sends the tab home by a load",
  { skip: leaning.length === 0 },
  async () => {
    inHarbor();
    wire.refuses = { status: 409, error: { code: "choose_workspace", message: "which workspace?" } };
    try {
      await client.apiFor(win)("GET workspaces");
    } finally {
      wire.refuses = null;
    }
    leftByALoad("assign", "/");
  },
);

test("a move between pages keeps the document, and never names another workspace", () => {
  inHarbor();
  const routed = [];
  for (const router of [null, { push: (to) => routed.push(to), replace: (to) => routed.push(to) }]) {
    address.setAppRouter(router);
    for (const route of ["today", "inbox/th-1", "campaigns/content", "clients/c-1", "admin/team"])
      address.goToRoute(route, {}, win);
    address.goToRoute("inbox", { replace: true }, win);
  }
  address.setAppRouter(null);
  assert.deepEqual(left, [], "no load: the page moved, the document stayed");
  const moved = [...history.pushed, ...history.replaced, ...routed];
  assert.ok(moved.length > 0, "the address moved");
  assert.deepEqual(
    moved.filter((to) => !to.startsWith(`/w/${HARBOR.slug}/`) && to !== `/w/${HARBOR.slug}`),
    [],
    `a move inside the document named another workspace. ${whoLeans}`,
  );
});
