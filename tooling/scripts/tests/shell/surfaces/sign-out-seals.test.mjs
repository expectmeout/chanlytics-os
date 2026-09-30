/**
 * A sign-out stays signed out in the tab's cache (defect 52).
 *
 * The shell's sign-out cleared the surface cache, then posted the form -- inside the app only after the phone was
 * forgotten, up to two seconds -- while the runner still ran. A read landing in between was snapshotted and written by
 * the next second's write or the page's hide, and the next person signing in on that tab had the last one's Inbox
 * restored at module scope, before React and before the tenant guard. Review G's probe (review3/G/signout-cache-probe)
 * showed it on the real module; this runs the shell's own sign-out over the real cache, and a read landing after it.
 * In a file of its own: a sign-out closes the cache for the rest of the page's life, and so for this process.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
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
const posted = [];
let forgotten = () => {};
globalThis.sessionStorage = storage;
globalThis.localStorage = storage;
globalThis.document = {
  visibilityState: "visible",
  addEventListener() {},
  removeEventListener() {},
  createElement: () => ({
    submit() {
      posted.push("/auth/signout");
    },
  }),
  body: { appendChild() {} },
};
const win = {
  location: { hash: "#/inbox" },
  localStorage: storage,
  document: globalThis.document,
  addEventListener: (t, fn) => (heard[t] ||= []).push(fn),
  removeEventListener() {},
  // Inside the app: the phone is forgotten first, and the sign-out waits for it.
  __appBridge: {
    receive() {},
    forgetPhone: () =>
      new Promise((r) => {
        forgotten = r;
      }),
  },
};
globalThis.window = win;

const cache = await importSrc("apps/dashboard/src/legacy-bridge/surface-cache.ts");
const { installShell } = await importSrc("apps/dashboard/src/legacy-bridge/shell.ts");

test("REGRESSION (defect 52): a read that lands while the sign-out waits for the phone writes nothing back", async () => {
  // Someone's workspace, booted: the Inbox read and cached.
  win.INBOX_DATA = { THREADS: [{ id: "t1", who: "A customer of theirs" }] };
  cache.snapshotSurface("inbox", ["INBOX_DATA"], "tenant-a");
  cache.flushSurfaceCache();
  assert.ok(store.get(CACHE), "cached, as a reload would paint it");

  installShell(win);
  win.__shell.signOut();
  assert.equal(store.get(CACHE), undefined, "cleared at the press");
  assert.deepEqual(posted, [], "the form waits for the phone to be forgotten");

  // The live feed's refresh lands in that wait: the runner persists it, as it persists every read.
  cache.snapshotSurface("inbox", ["INBOX_DATA"], "tenant-a");
  cache.resnapshotSurface("inbox", ["INBOX_DATA"], "tenant-a");
  cache.flushSurfaceCache();
  for (const fn of heard.pagehide ?? []) fn();
  assert.equal(store.get(CACHE), undefined, "REGRESSION: their rows written back after the session ended");

  forgotten();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(posted, ["/auth/signout"]);

  // The next person to sign in on this tab: nothing of the last one's is painted before the tenant guard looks.
  delete win.INBOX_DATA;
  assert.deepEqual([...cache.hydrateSurfaceCache()], []);
  assert.equal(win.INBOX_DATA, undefined);
});
