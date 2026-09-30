/**
 * The workspace in the address (plan 3.5), run: what a path names, what an
 * address is built as, where the home sends a tab, and what the browser is
 * asked to remember; and the route after it (decision 0015): read, followed,
 * moved and linked, over a window made up for the purpose.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";

const {
  pathWorkspace,
  workspaceHref,
  homeHref,
  lastWorkspace,
  rememberWorkspace,
  getActiveWorkspace,
  signInHref,
  addressInWorkspace,
  routeOnScreen,
  hrefOfRoute,
  hearAddress,
  goToRoute,
  addressApi,
  notifyAddress,
  setAppRouter,
} = await importSrc("apps/dashboard/src/legacy-bridge/workspace.ts");
const { staysOnPage, routeHasPage } = await importSrc("apps/dashboard/src/surfaces/routes.ts");

test("a path names its workspace under /w/, by slug or id, decoded; anything else names none", () => {
  assert.equal(pathWorkspace("/w/acme"), "acme");
  assert.equal(pathWorkspace("/w/acme/"), "acme");
  assert.equal(pathWorkspace("/w/a%20b"), "a b", "decoded");
  assert.equal(
    pathWorkspace("/w/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "an id is accepted too: the server takes either",
  );
  assert.equal(pathWorkspace("/"), null);
  assert.equal(pathWorkspace("/login"), null);
  assert.equal(pathWorkspace("/w/"), null);
  assert.equal(pathWorkspace("/w/%E0%A4%A"), null, "a malformed escape names nothing rather than throwing");
  assert.equal(getActiveWorkspace(), null, "outside a browser there is no address");
});

test("an address is the slug encoded, with whatever rides after it; a hash route is written as the path it moves to", () => {
  assert.equal(workspaceHref("acme"), "/w/acme");
  assert.equal(workspaceHref("acme", "?billing=success"), "/w/acme?billing=success", "a query rides as it is");
  assert.equal(workspaceHref("a b", "#/inbox"), "/w/a%20b/inbox");
  assert.equal(
    workspaceHref("acme", "?billing=success#/admin/billing"),
    "/w/acme/admin/billing?billing=success",
    "and the query stays after the route, as a path's does",
  );
  assert.equal(workspaceHref("acme", "#/start"), "/w/acme/start", "the first run, for a workspace just made");
  assert.equal(workspaceHref("acme", "#/"), "/w/acme#/", "a hash that names no route is left as it is");
});

test("the home sends a tab to the last workspace used, else to the one the server calls active, carrying the query and the route; an account with no workspace stays", () => {
  const answer = {
    workspaces: [
      { id: "id-a", slug: "acme" },
      { id: "id-b", slug: "bayside" },
    ],
    activeWorkspaceId: "id-b",
  };
  assert.equal(homeHref("acme", answer, "#/today"), "/w/acme/today", "the last one used wins");
  assert.equal(
    homeHref(null, answer, "?billing=success#/admin/billing"),
    "/w/bayside/admin/billing?billing=success",
    "else the server's active one",
  );
  assert.equal(homeHref(null, { workspaces: [], activeWorkspaceId: null }), null, "nowhere: the create screen");
  assert.equal(homeHref(null, null), null, "and nowhere when the server could not be asked");
});

test("the browser remembers the last workspace when it can, and nothing throws when it cannot", () => {
  assert.equal(lastWorkspace(), null, "no storage here: nothing remembered");
  assert.doesNotThrow(() => rememberWorkspace("acme"));
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };
  rememberWorkspace("acme");
  assert.equal(lastWorkspace(), "acme");
  assert.equal(store.get("chanlytics.workspace"), "acme", "the one key localStorage keeps");
  rememberWorkspace(null);
  assert.equal(lastWorkspace(), null);
  delete globalThis.localStorage;
});

/* --------------------- the route after the slug: read, followed, moved, linked --------------------- */

/** A window with an address and the History the App Router patches: a push and a replace write the path (or the hash). */
function windowAt(address) {
  const listeners = new Map();
  const pushed = [];
  const replaced = [];
  const win = {
    location: { pathname: "/", search: "", hash: "", ...address },
    history: {
      pushState: (_data, _unused, url) => {
        pushed.push(url);
        move(url);
      },
      replaceState: (_data, _unused, url) => {
        replaced.push(url);
        move(url);
      },
    },
    addEventListener: (type, fn) => listeners.set(type, [...(listeners.get(type) ?? []), fn]),
    removeEventListener: (type, fn) =>
      listeners.set(
        type,
        (listeners.get(type) ?? []).filter((f) => f !== fn),
      ),
  };
  function move(url) {
    if (url.startsWith("#")) win.location.hash = url;
    else win.location.pathname = url.split("?")[0];
  }
  /** Back, or Forward: the browser moved the address and said so. */
  const popTo = (pathname) => {
    win.location.pathname = pathname;
    for (const fn of listeners.get("popstate") ?? []) fn();
  };
  return { win, pushed, replaced, popTo, listening: (t) => (listeners.get(t) ?? []).length };
}

test("the route on screen is the path's, else the hash's, else Today", () => {
  assert.equal(routeOnScreen(windowAt({ pathname: "/w/acme/inbox/th-1" }).win), "inbox/th-1");
  assert.equal(routeOnScreen(windowAt({ pathname: "/w/acme", hash: "#/reports" }).win), "reports", "not moved yet");
  assert.equal(routeOnScreen(windowAt({ pathname: "/w/acme/inbox", hash: "#/reports" }).win), "inbox", "the path wins");
  assert.equal(routeOnScreen(windowAt({ pathname: "/w/acme" }).win), "today");
  assert.equal(routeOnScreen(windowAt({ pathname: "/w/acme", hash: "#error=x" }).win), "today", "not a route");
  assert.equal(routeOnScreen(windowAt({ pathname: "/", hash: "#/clients" }).win), "clients", "the standalone mockup");
});

test("a route is linked as its path in a workspace, and as its hash where there is no workspace path", () => {
  assert.equal(hrefOfRoute("inbox/th-1", windowAt({ pathname: "/w/acme/today" }).win), "/w/acme/inbox/th-1");
  assert.equal(hrefOfRoute("today", windowAt({ pathname: "/w/a%20b" }).win), "/w/a%20b/today", "the slug as written");
  assert.equal(hrefOfRoute("inbox", windowAt({ pathname: "/" }).win), "#/inbox");
});

test("a move pushes a path and is heard at once; the same place again is no entry; a listener answers only for a route that changed", () => {
  const w = windowAt({ pathname: "/w/acme/today" });
  const heard = [];
  const stop = hearAddress(() => heard.push(routeOnScreen(w.win)), w.win);
  goToRoute("inbox", {}, w.win);
  assert.deepEqual(w.pushed, ["/w/acme/inbox"]);
  assert.deepEqual(heard, ["inbox"]);
  goToRoute("inbox", {}, w.win);
  assert.equal(w.pushed.length, 1, "the address it is already at: no new entry");
  assert.equal(heard.length, 1, "and no news");
  w.popTo("/w/acme/today");
  assert.deepEqual(heard, ["inbox", "today"], "Back is heard through popstate");
  stop();
  assert.equal(w.listening("popstate"), 0, "the stop leaves nothing listening");
  goToRoute("clients", {}, w.win);
  assert.equal(heard.length, 2, "stopped: silent");
});

test("a replace makes no entry and is heard like a redirect; with quiet, it is a page saying where it stands, and nobody is told", () => {
  const w = windowAt({ pathname: "/w/acme/clients" });
  const heard = [];
  const stop = hearAddress(() => heard.push(routeOnScreen(w.win)), w.win);
  goToRoute("clients/leads", { replace: true }, w.win);
  assert.deepEqual(w.replaced, ["/w/acme/people/leads"]);
  assert.deepEqual(w.pushed, [], "no entry");
  assert.deepEqual(heard, ["clients/leads"], "a redirect is heard, as location.replace was");
  goToRoute("clients/leads:p-1", { replace: true, quiet: true }, w.win);
  assert.deepEqual(w.replaced.at(-1), "/w/acme/people/leads:p-1");
  assert.deepEqual(heard, ["clients/leads"], "quiet: no listener is told");
  stop();
});

test("in the standalone mockup a route is moved as its hash", () => {
  const w = windowAt({ pathname: "/", hash: "#/today" });
  goToRoute("inbox", {}, w.win);
  assert.deepEqual(w.pushed, ["#/inbox"]);
  assert.equal(routeOnScreen(w.win), "inbox");
});

test("a route with a page of its own goes through the App Router and is heard when the router lands; the shell's own routes are pushed as they always were", () => {
  const w = windowAt({ pathname: "/w/acme/today" });
  const asked = [];
  setAppRouter({ push: (href) => asked.push(["push", href]), replace: (href) => asked.push(["replace", href]) });
  try {
    const heard = [];
    const stop = hearAddress(() => heard.push(routeOnScreen(w.win)), w.win);
    goToRoute("reports", {}, w.win);
    assert.deepEqual(asked, [["push", "/w/acme/reports"]], "the router draws the page, so the router is asked");
    assert.deepEqual(w.pushed, [], "the history is the router's: nothing pushed under it");
    assert.deepEqual(heard, [], "the address has not moved yet, so nobody is told");
    // The router landed: the path says the route, and the frame's follower says so (LegacyHost's AddressFollower).
    w.win.location.pathname = "/w/acme/reports";
    notifyAddress();
    assert.deepEqual(heard, ["reports"], "heard once the address says it");
    goToRoute("reports", {}, w.win);
    assert.equal(asked.length, 1, "the address it is at: no second push");
    goToRoute("reports", { replace: true }, w.win);
    assert.deepEqual(asked.at(-1), ["replace", "/w/acme/reports"], "a replace is the router's too");
    goToRoute("settings", {}, w.win);
    assert.deepEqual(w.pushed, ["/w/acme/settings"], "a route the frame's table draws is pushed, as always");
    assert.equal(asked.length, 2, "and never asks the router for a page that draws nothing");
    stop();
    // With no router (a test's window, the standalone mockup) a route with a page is moved like any other.
    setAppRouter(null);
    const m = windowAt({ pathname: "/", hash: "#/today" });
    goToRoute("reports", {}, m.win);
    assert.deepEqual(m.pushed, ["#/reports"]);
  } finally {
    setAppRouter(null);
  }
});

test("a move within a page that follows its address stays on the history the page listens to: the router is asked only to arrive at the page, never to move under it", () => {
  const w = windowAt({ pathname: "/w/acme/reports" });
  const asked = [];
  setAppRouter({ push: (href) => asked.push(["push", href]), replace: (href) => asked.push(["replace", href]) });
  try {
    goToRoute("inbox", {}, w.win);
    assert.deepEqual(asked, [["push", "/w/acme/inbox"]], "arriving at the Inbox from another page is the router's");
    w.win.location.pathname = "/w/acme/inbox";
    goToRoute("inbox/th-2", {}, w.win);
    goToRoute("inbox/th-3", { replace: true }, w.win);
    goToRoute("inbox", { replace: true }, w.win);
    assert.deepEqual(
      w.pushed,
      ["/w/acme/inbox/th-2"],
      "a thread opened on the page is pushed on the page's own history",
    );
    assert.deepEqual(w.replaced, ["/w/acme/inbox/th-3", "/w/acme/inbox"], "and a replace is the page's too");
    assert.equal(asked.length, 1, "the router was not asked to move under a page that follows its address");
    goToRoute("conversations/whatsapp:c1", {}, w.win);
    assert.deepEqual(
      asked.at(-1),
      ["push", "/w/acme/conversations/whatsapp:c1"],
      "another page with a tail is the router's to draw",
    );
  } finally {
    setAppRouter(null);
  }
});

test("the four verbs on window.__shell are these, over the window they were made for", () => {
  const w = windowAt({ pathname: "/w/acme/today" });
  const api = addressApi(w.win);
  assert.equal(api.route(), "today");
  assert.equal(api.href("inbox"), "/w/acme/inbox");
  const heard = [];
  const stop = api.hear(() => heard.push(api.route()));
  api.go("reports");
  assert.deepEqual(heard, ["reports"]);
  stop();
});

test("a session that ended mid-page signs in again at the route it was on, from a path or a hash; anything else is no page to return to", () => {
  assert.equal(signInHref({ pathname: "/w/acme/inbox/th-1", hash: "" }), "/login#/inbox/th-1");
  assert.equal(signInHref({ pathname: "/w/acme", hash: "#/reports" }), "/login#/reports");
  assert.equal(signInHref({ pathname: "/w/acme", hash: "" }), "/login");
  assert.equal(signInHref({ pathname: "/w/acme", hash: "#error=access_denied" }), "/login");
});

test("this address in another workspace: the same route under its slug, and the query that came with it", () => {
  assert.equal(
    addressInWorkspace("bayside", { pathname: "/w/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/inbox/th-1", search: "?x=1" }),
    "/w/bayside/inbox/th-1?x=1",
  );
  assert.equal(addressInWorkspace("bayside", { pathname: "/w/acme", hash: "#/reports" }), "/w/bayside/reports");
  assert.equal(addressInWorkspace("bayside", { pathname: "/w/acme" }), "/w/bayside", "Today: no route to carry");
});

/** A table of routes with pages, as SURFACE_ROUTES is: one that takes addresses under it, and one that takes none. */
const TABLE = {
  clients: { activeNav: "clients", crumbs: ["People"], pane: true, takes: (param) => !/^leads(:|$)/.test(param) },
  reports: { activeNav: "reports", crumbs: ["Reports"], pane: true },
};

test("a page takes the addresses under its route that it says, and the frame's table keeps the rest", () => {
  assert.equal(routeHasPage("clients", TABLE), true);
  assert.equal(routeHasPage("clients/c-1", TABLE), true, "a person");
  assert.equal(routeHasPage("clients/seg:needs_you", TABLE), true, "a view");
  assert.equal(routeHasPage("clients/pipeline:v-board", TABLE), true, "the Pipeline's address");
  assert.equal(routeHasPage("clients/leads", TABLE), false, "Leads is not the page's: its row draws it");
  assert.equal(routeHasPage("clients/leads:s-1:p-2", TABLE), false);
  assert.equal(routeHasPage("reports", TABLE), true);
  assert.equal(routeHasPage("reports/anything", TABLE), false, "a page that takes none has only its route");
  assert.equal(routeHasPage("inbox", TABLE), false, "a route that has not left the shell");
  assert.equal(routeHasPage("constructor", TABLE), false, "a name off Object.prototype is no page");
  assert.equal(routeHasPage("", TABLE), false);
});

test("a move between two addresses of one page is the page's own; a move to it from another route is the router's", () => {
  // routes.ts holds the real table: 'reports' is the page there, and it takes no address under it.
  assert.equal(staysOnPage("inbox", "inbox/th-1"), true, "a page that takes every address under it");
  assert.equal(staysOnPage("inbox/th-1", "inbox"), true);
  assert.equal(
    staysOnPage("reports", "reports"),
    false,
    "a page that takes none has no address to stay within: the router's",
  );
  assert.equal(staysOnPage("today", "reports"), false, "from a route the frame's table draws");
  assert.equal(staysOnPage("reports", "inbox"), false);
  assert.equal(staysOnPage("settings", "settings/x"), false, "no page, so no page to stay on");
});
