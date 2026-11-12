/**
 * A seat removed while the person's tab is open leaves nothing of the workspace on their device.
 *
 * A browser keeps a workspace's rows for a day, to paint a reload before anything is read (bridge/surface-cache.ts), and a
 * phone a copy of its last screen (surfaces/frame/first-rows.ts): customers' names and words, on the device of whoever was
 * allowed to read them. A teammate removes that person. Their session is still good, so nothing answers 401; what says
 * they are out is the list of workspaces, the next time it is read (bridge/surface-data.ts): the one on screen is no longer
 * in it. The tab leaves for another of theirs, or the front door, and what the device kept goes first and stays gone, so a
 * read that lands before the page unloads cannot put the rows back (sealSurfaceCache).
 *
 * The clear was tested by itself, and the sign-out, the 401 and the switch each by theirs; this way out had no test (the
 * architecture audit's review, 11 Nov 2026). Run on the real workspace surface, the real cache and the real client, over a
 * scripted wire.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";

/* ---- a window, its storage and a wire ---- */
globalThis.window ??= globalThis;
globalThis.location ??= { pathname: "/w/harbor/today", hash: "", search: "" };
globalThis.document ??= { visibilityState: "visible", addEventListener() {}, removeEventListener() {} };
/** A store as the browser's are: read by name and walked by index, as the clear walks it. */
const storage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
};
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
const bus = new EventTarget();
globalThis.window.addEventListener = (...a) => bus.addEventListener(...a);
globalThis.window.removeEventListener = (...a) => bus.removeEventListener(...a);
globalThis.window.dispatchEvent = (e) => bus.dispatchEvent(e);
const replaced = [];
globalThis.location.replace = (to) => replaced.push(to);

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const ws = (slug, name) => ({ id: `id-${slug}`, slug, name, status: "active", timezone: "America/New_York" });
const ME = { id: "u1", email: "ada@example.com", role: "operator" };
const listOf = (...workspaces) => ({ workspaces, activeWorkspaceId: workspaces[0]?.id ?? null, user: ME });

/** The list the server answers with now. */
let list = listOf();
globalThis.window.fetch = async (url, init = {}) => {
  const u = new URL(String(url), "https://app.chanlytics.com");
  const line = `${init.method ?? "GET"} ${u.pathname.replace("/api/v1/", "")}`;
  if (line === "POST me/invitations/accept") return json(200, { ok: true, data: { joined: [] } });
  if (line === "GET workspaces") return json(200, { ok: true, data: list });
  return json(404, { ok: false, error: { code: "not_found", message: "no" } });
};

const { api } = await importSrc("apps/dashboard/src/bridge/api.ts");
const { workspaceOverride } = await importSrc("apps/dashboard/src/bridge/surface-data.ts");
const { snapshotSurface, flushSurfaceCache } = await importSrc("apps/dashboard/src/bridge/surface-cache.ts");

const ROWS = "chanlytics.surfaces.v2:";
const COPY = "chanlytics.rows.v1:";
/** Every slot of a workspace's rows the device holds, of either kind. */
const kept = () => {
  const names = [];
  for (let i = 0; i < localStorage.length; i += 1) names.push(localStorage.key(i));
  return names.filter((n) => n.startsWith(ROWS) || n.startsWith(COPY)).sort();
};
/** A phone's copy of a screen, as the frame keeps one. */
const copyOf = (name) =>
  JSON.stringify({ at: Date.now(), width: 393, sheets: "1", vars: "", html: `<div>${name}</div>` });

/** The tab stands on Harbor, one of the person's two workspaces, with Harbor's rows kept as a visit keeps them. */
function onHarbor(theirs) {
  api().forget();
  replaced.length = 0;
  globalThis.location.pathname = "/w/harbor/today";
  globalThis.__WORKSPACES = theirs;
  globalThis.__ACTIVE_WORKSPACE = "id-harbor";
}

test("a person removed from the workspace on their screen leaves it for another of theirs, and nothing it kept stays on the device", async () => {
  onHarbor([ws("harbor", "Harbor"), ws("luna", "Luna")]);
  // What a visit keeps: the surfaces' rows, written by the cache itself, and a phone's copy of two screens.
  globalThis.__TODAY_PROBE = { who: "Robin Example", said: "Can I move my appointment?" };
  snapshotSurface("today", ["__TODAY_PROBE"], "id-harbor");
  flushSurfaceCache();
  localStorage.setItem(`${COPY}harbor:inbox`, copyOf("Robin Example"));
  localStorage.setItem(`${COPY}luna:inbox`, copyOf("Sam Example"));
  assert.deepEqual(kept(), [`${COPY}harbor:inbox`, `${COPY}luna:inbox`, `${ROWS}harbor`], "the fixture kept them");

  // A teammate removes them from Harbor; the list read next no longer holds it.
  list = listOf(ws("luna", "Luna"));
  await workspaceOverride.apply();

  assert.equal(replaced.length, 1, "the tab leaves");
  assert.match(replaced[0], /^\/w\/luna(\/|$)/, "for the workspace they still have");
  assert.deepEqual(kept(), [], "and the device keeps none of the rows: Harbor's, and every other's, as at a sign-out");

  // A read of Harbor's that was already out lands before the page unloads: it is written nowhere.
  snapshotSurface("today", ["__TODAY_PROBE"], "id-harbor");
  flushSurfaceCache();
  globalThis.window.dispatchEvent(new Event("pagehide"));
  assert.deepEqual(kept(), [], "sealed: nothing read from here on is kept");
  delete globalThis.__TODAY_PROBE;
});

test("removed from their only workspace, they go to the front door, and the device forgets which workspace it last opened", async () => {
  onHarbor([ws("harbor", "Harbor")]);
  // The device is sealed from the test before, as a tab is for its life: its slots are written here as a visit left them.
  localStorage.setItem(`${ROWS}harbor`, JSON.stringify({ tenant: "id-harbor", savedAt: Date.now(), surfaces: {} }));
  localStorage.setItem(`${COPY}harbor:people`, copyOf("Robin Example"));
  const { rememberWorkspace } = await importSrc("apps/dashboard/src/bridge/workspace.ts");
  rememberWorkspace("harbor");
  const remembered = () => {
    const names = [];
    for (let i = 0; i < localStorage.length; i += 1) names.push(localStorage.key(i));
    return names.filter((n) => localStorage.getItem(n) === "harbor");
  };
  assert.equal(remembered().length, 1, "the fixture remembers Harbor as the last one opened");

  list = listOf();
  await workspaceOverride.apply();

  assert.deepEqual(replaced, ["/"], "the front door, which shows them no workspace");
  assert.deepEqual(kept(), [], "nothing of Harbor's rows");
  assert.deepEqual(remembered(), [], "and no word of Harbor as the place to open next");
});

test("a list that still holds the workspace on screen moves nothing and clears nothing", async () => {
  onHarbor([ws("harbor", "Harbor"), ws("luna", "Luna")]);
  localStorage.setItem(`${COPY}harbor:inbox`, copyOf("Robin Example"));
  list = listOf(ws("harbor", "Harbor"));
  await workspaceOverride.apply();
  assert.deepEqual(replaced, [], "they are still of Harbor: the tab stays");
  assert.deepEqual(kept(), [`${COPY}harbor:inbox`], "and so does what it kept");
  localStorage.removeItem(`${COPY}harbor:inbox`);
});
