/**
 * Where a 401 sends the tab, and what it leaves behind.
 *
 * A session the gate no longer knows is a 401 on any read or write: the tab drops what it kept and goes to /login,
 * carrying the page's route and workspace (sign-in-return.ts, workspace-return.ts), so signing in lands where it was. Two things went wrong
 * on the way. The tab's cache was cleared and not sealed, so a read landing before the page unloaded wrote one person's
 * rows back for whoever signed in next on that tab (as a sign-out once did, defect 52). And a route that declares
 * `fresh` (erasing a person, an export, the team, billing, deleting the account) refused a session the Auth server no
 * longer knows while its token still verified at the gate: /login sent the tab straight back in, and the act silently
 * did not happen, every time it was pressed. That refusal says the session ENDED (contracts SESSION_ENDED), and the
 * tab ends it (POST /auth/signout, which clears its cookie) before it signs in.
 *
 * The real client and bridge, over a window whose wire answers each request. A file of its own: a 401 closes the tab's
 * cache for the rest of the page's life, and so for this process.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { SESSION_ENDED } from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";

const CACHE = "chanlytics.surfaces.v1";
const store = new Map();
const storage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  key: (i) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
};
const heard = {};
const went = [];
/** The wire: each request answered by `answer`, and every one recorded in the order it was made. */
let answer = () => new Response("{}", { status: 200 });
globalThis.sessionStorage = storage;
globalThis.localStorage = storage;
globalThis.document = { visibilityState: "visible", addEventListener() {}, removeEventListener() {} };
const win = {
  location: {
    pathname: "/w/bayside/inbox/th-1",
    search: "",
    hash: "",
    assign: (url) => went.push(["assign", url]),
  },
  sessionStorage: storage,
  localStorage: storage,
  addEventListener: (t, fn) => (heard[t] ||= []).push(fn),
  removeEventListener() {},
  dispatchEvent: () => true,
  fetch: async (url, init = {}) => {
    went.push([init.method ?? "GET", String(url)]);
    return answer(String(url), init);
  },
};
globalThis.window = win;

const cache = await importSrc("apps/dashboard/src/legacy-bridge/surface-cache.ts");
const { api } = await importSrc("apps/dashboard/src/legacy-bridge/api.ts");
const { createApi } = await importSrc("apps/dashboard/src/client/api.ts");

const refused = (error) => new Response(JSON.stringify({ ok: false, error }), { status: 401 });
const settle = async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((r) => setTimeout(r, 0));
};

test("REGRESSION: a 401 seals the tab's cache before it goes to sign in, in the page's workspace -- a read landing before the page unloaded wrote the last person's rows back", async () => {
  win.INBOX_DATA = { THREADS: [{ id: "t1", who: "A customer of theirs" }] };
  cache.snapshotSurface("inbox", ["INBOX_DATA"], "tenant-b");
  cache.flushSurfaceCache();
  assert.ok(store.get(CACHE), "cached, as a reload would paint it");

  answer = () => refused({ code: "unauthorized", message: "Sign in required." });
  went.length = 0;
  const r = await api()("GET conversations");
  assert.equal(r.ok, false);
  assert.deepEqual(went, [
    ["GET", "/api/v1/conversations?workspace=bayside"],
    ["assign", "/login?w=bayside#/inbox/th-1"],
  ]);
  assert.equal(store.get(CACHE), undefined, "cleared before it left");

  // Another surface's read lands before the page unloads: the runner persists it, as it persists every read.
  cache.snapshotSurface("inbox", ["INBOX_DATA"], "tenant-b");
  cache.flushSurfaceCache();
  for (const fn of heard.pagehide ?? []) fn();
  assert.equal(store.get(CACHE), undefined, "REGRESSION: their rows written back after the session ended");
  delete win.INBOX_DATA;
  assert.deepEqual([...cache.hydrateSurfaceCache()], [], "the next person to sign in on this tab is painted nothing");
});

test("REGRESSION: a fresh route's 401 ends the session before the tab signs in -- /login sent it straight back in, and the erase silently never happened", async () => {
  answer = (url) =>
    url === "/auth/signout"
      ? // A same-origin POST answered by the route's redirect to /login, which the page does not follow itself.
        { ok: false, status: 0, type: "opaqueredirect" }
      : refused({ code: "unauthorized", message: "Sign in again to do this.", details: SESSION_ENDED });
  went.length = 0;
  const r = await api()("DELETE contacts/[id]", { params: { id: "p-1" } });
  assert.equal(r.ok, false);
  await settle();
  assert.deepEqual(
    went,
    [
      ["DELETE", "/api/v1/contacts/p-1?workspace=bayside"],
      ["POST", "/auth/signout"],
      ["assign", "/login?w=bayside#/inbox/th-1"],
    ],
    "REGRESSION: straight to /login, which the gate answers with the app while the token still verifies",
  );
});

test("the sign-out that ends the session failing to arrive still sends the tab to sign in, once", async () => {
  answer = (url) => {
    if (url === "/auth/signout") throw new TypeError("Failed to fetch");
    return refused({ code: "unauthorized", message: "Sign in again to do this.", details: SESSION_ENDED });
  };
  went.length = 0;
  await api()("POST team/invite", { body: { email: "sam@example.com", role: "operator" } });
  await settle();
  assert.deepEqual(went.slice(1), [
    ["POST", "/auth/signout"],
    ["assign", "/login?w=bayside#/inbox/th-1"],
  ]);
});

test("the client tells the two 401s apart by what the refusal says, and a client that has no way to end a session signs in as before", async () => {
  const events = [];
  const deps = (over = {}) => ({
    fetch: async (url) =>
      url.includes("contacts/p-1")
        ? refused({ code: "unauthorized", message: "Sign in again to do this.", details: SESSION_ENDED })
        : refused({ code: "unauthorized", message: "Sign in required." }),
    workspace: () => "bayside",
    onSignedOut: () => events.push("signed-out"),
    onSessionEnded: () => events.push("session-ended"),
    refresh: async () => {},
    ...over,
  });
  const client = createApi(deps());
  const fresh = await client("DELETE contacts/[id]", { params: { id: "p-1" } });
  const plain = await client("GET conversations");
  assert.deepEqual(events, ["session-ended", "signed-out"]);
  assert.deepEqual([fresh.code, plain.code], ["unauthorized", "unauthorized"], "both are the same refusal to a page");
  events.length = 0;
  await createApi(deps({ onSessionEnded: undefined }))("DELETE contacts/[id]", { params: { id: "p-1" } });
  assert.deepEqual(events, ["signed-out"]);
  events.length = 0;
  // A 401 with no body the client can read (a proxy's, a gateway's) is the plain one.
  await createApi(deps({ fetch: async () => new Response("<html>", { status: 401 }) }))("GET conversations");
  assert.deepEqual(events, ["signed-out"]);
});
