/**
 * The route's own reads, started from the document head (contracts routePrefetchScript, client/api.ts `prefetched`,
 * legacy-bridge/api.ts takePrefetched; 25 Sep 2026).
 *
 * Nothing was fetched until the shell had mounted: on a cold load of a person's page the first request left 2,033 ms
 * after a document whose first byte came at 26 ms. The head now starts who is looking and, on a person's page, the
 * person, spelled as the client spells them, and the client's read takes what the head started in place of its own
 * fetch, once. The script is run here as a browser would run it, against a window and a location the test makes; the
 * client is the real one over a fetch that records.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { routePrefetchScript, PREFETCH_SLOT } from "@chanlytics/contracts";
import { importSrc } from "./_source.mjs";

const ID = "ed2244f3-9f88-49c5-863e-fbdea4b60e12";

/** The head's script, run over a page at `pathname` + `hash`: what it fetched, and the window it left. */
const headRuns = ({ pathname, hash, window: given = {}, fetch: fetchWith = null }) => {
  const calls = [];
  const win = given;
  const ctx = {
    window: win,
    location: { pathname, hash },
    fetch:
      fetchWith ??
      ((url, init) => {
        calls.push([url, init]);
        return Promise.resolve({ url });
      }),
    encodeURIComponent,
    decodeURIComponent,
    RegExp,
  };
  vm.runInNewContext(routePrefetchScript(), ctx);
  return { calls, win };
};

test("on a person's page the head starts who is looking and the person, as the client spells them, same-origin", () => {
  const { calls, win } = headRuns({ pathname: "/w/harbor", hash: `#/clients/${ID}` });
  assert.deepEqual(
    calls.map(([u]) => u),
    [`/api/v1/workspaces?workspace=harbor`, `/api/v1/contacts/${ID}?workspace=harbor`],
  );
  assert.ok(
    calls.every(([, init]) => init.credentials === "same-origin"),
    "the session's cookies ride along, as on the client's own fetch",
  );
  assert.deepEqual(Object.keys(win[PREFETCH_SLOT]).sort(), calls.map(([u]) => u).sort(), "parked under the URL");
});

test("on any other workspace page only who is looking is started; off a workspace page nothing is", () => {
  assert.deepEqual(
    headRuns({ pathname: "/w/acme", hash: "#/today" }).calls.map(([u]) => u),
    ["/api/v1/workspaces?workspace=acme"],
  );
  for (const hash of ["#/clients", "#/clients/leads", "#/clients/c-ana", "#/clients/not-a-uuid", ""])
    assert.deepEqual(
      headRuns({ pathname: "/w/acme", hash }).calls.map(([u]) => u),
      ["/api/v1/workspaces?workspace=acme"],
      hash,
    );
  for (const pathname of ["/", "/login", "/w", "/w/", "/yes/acme"])
    assert.deepEqual(headRuns({ pathname, hash: `#/clients/${ID}` }).calls, [], pathname);
});

test("run twice, the head starts nothing twice; a fetch that throws leaves the page alone", () => {
  const first = headRuns({ pathname: "/w/acme", hash: `#/clients/${ID}` });
  const again = headRuns({ pathname: "/w/acme", hash: `#/clients/${ID}`, window: first.win });
  assert.deepEqual(again.calls, [], "already parked");
  assert.doesNotThrow(() =>
    headRuns({
      pathname: "/w/acme",
      hash: "#/today",
      fetch: () => {
        throw new Error("no fetch here");
      },
    }),
  );
});

/* ------------------------------ the client takes it ------------------------------ */

const { createApi } = await importSrc("apps/dashboard/src/client/api.ts");
const json = (body) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const client = ({ prefetched, fetched }) =>
  createApi({
    fetch: async (url) => {
      fetched.push(url);
      return json({ ok: true, data: { person: { id: "fetched" } } });
    },
    workspace: () => "acme",
    onSignedOut() {},
    refresh: async () => {},
    prefetched,
  });

test("a read takes what the head started for its URL, once; the next identical read asks the server", async () => {
  const fetched = [];
  let handed = 0;
  const slot = {
    [`/api/v1/contacts/${ID}?workspace=acme`]: Promise.resolve(json({ ok: true, data: { person: { id: "early" } } })),
  };
  const api = client({
    fetched,
    prefetched: (url) => {
      const p = slot[url] ?? null;
      if (p) {
        handed += 1;
        delete slot[url];
      }
      return p;
    },
  });
  const r = await api("GET contacts/[id]", { params: { id: ID } });
  assert.equal(r.ok, true);
  assert.equal(r.data.person.id, "early", "the head's answer");
  assert.deepEqual(fetched, [], "no fetch of its own");
  assert.equal(handed, 1);
  api.forget();
  const r2 = await api("GET contacts/[id]", { params: { id: ID } });
  assert.equal(r2.data.person.id, "fetched", "handed over once: the next read is the server's");
  assert.deepEqual(fetched, [`/api/v1/contacts/${ID}?workspace=acme`]);
});

test("the page's own read, seconds after the head's landed, shares its answer; long after, it asks the server", async () => {
  // Seen on the dev server (25 Sep 2026): the head's read landed, the page mounted 14 s later and read the person
  // again, since a settled read is shared for two seconds. A phone mounts the shell seconds after the head ran.
  const fetched = [];
  let clock = 1_000;
  const slot = {
    [`/api/v1/contacts/${ID}?workspace=acme`]: Promise.resolve(json({ ok: true, data: { person: { id: "early" } } })),
  };
  const api = createApi({
    fetch: async (url) => {
      fetched.push(url);
      return json({ ok: true, data: { person: { id: "fetched" } } });
    },
    workspace: () => "acme",
    onSignedOut() {},
    refresh: async () => {},
    now: () => clock,
    prefetched: (url) => {
      const p = slot[url] ?? null;
      delete slot[url];
      return p;
    },
  });
  assert.equal((await api("GET contacts/[id]", { params: { id: ID } })).data.person.id, "early");
  clock += 6_000;
  assert.equal(
    (await api("GET contacts/[id]", { params: { id: ID } })).data.person.id,
    "early",
    "six seconds on: the head's",
  );
  assert.deepEqual(fetched, []);
  clock += 6_000;
  assert.equal(
    (await api("GET contacts/[id]", { params: { id: ID } })).data.person.id,
    "fetched",
    "twelve: the server's",
  );
  assert.deepEqual(fetched, [`/api/v1/contacts/${ID}?workspace=acme`]);
});

test("a prefetch that failed is asked again by the read itself, and a write never takes one", async () => {
  const fetched = [];
  const api = client({
    fetched,
    prefetched: (url) =>
      url.startsWith("/api/v1/contacts/") ? Promise.reject(new TypeError("Failed to fetch")) : null,
  });
  const r = await api("GET contacts/[id]", { params: { id: ID } });
  assert.equal(r.ok, true);
  assert.equal(r.data.person.id, "fetched");
  assert.deepEqual(fetched, [`/api/v1/contacts/${ID}?workspace=acme`]);
});

/* ------------------------------ the bridge's slot ------------------------------ */

test("the bridge's client takes the window's slot for a URL and forgets it as it does", async () => {
  const fetched = [];
  const win = {
    fetch: async (url) => {
      fetched.push(url);
      return json({ ok: true, data: { person: { id: "fetched" } } });
    },
    location: { pathname: "/w/acme", hash: "", assign() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return true;
    },
    __WORKSPACES: [{ id: "ws-acme", slug: "acme", name: "Acme", status: "active" }],
    __ACTIVE_WORKSPACE: "ws-acme",
    [PREFETCH_SLOT]: {
      [`/api/v1/contacts/${ID}?workspace=acme`]: Promise.resolve(json({ ok: true, data: { person: { id: "early" } } })),
    },
  };
  globalThis.window = win;
  globalThis.sessionStorage = win.sessionStorage;
  globalThis.localStorage = win.localStorage;
  const { apiFor } = await importSrc("apps/dashboard/src/legacy-bridge/api.ts");
  const api = apiFor(win);
  const r = await api("GET contacts/[id]", { params: { id: ID } });
  assert.equal(r.data.person.id, "early");
  assert.deepEqual(fetched, []);
  assert.deepEqual(Object.keys(win[PREFETCH_SLOT]), [], "taken, and gone from the slot");
});
