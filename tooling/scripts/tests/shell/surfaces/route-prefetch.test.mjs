/**
 * The route's own reads, started from the document head (contracts routePrefetchScript, client/api.ts `prefetched`,
 * legacy-bridge/api.ts takePrefetched; 25 Sep 2026).
 *
 * Nothing was fetched until the shell had mounted: on a cold load of a person's page the first request left 2,033 ms
 * after a document whose first byte came at 26 ms. The head now starts who is looking and, on a person's page, the
 * person, and on every other page what it opens on (PREFETCH_READS; 2 Oct 2026: they left at the mount, 538 ms into a
 * document whose first byte came at 16), spelled as the client spells them, and the client's read takes what the head
 * started in place of its own fetch, once. The script is run here as a browser would run it, against a window and a
 * location the test makes; the client is the real one over a fetch that records; and what each page opens on is held to
 * what its surfaces' own reads ask for, by running them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { routePrefetchScript, PREFETCH_SLOT, PREFETCH_READS } from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";

const ID = "ed2244f3-9f88-49c5-863e-fbdea4b60e12";

/** The head's script, run over a page at `pathname` + `hash`: what it fetched, and the window it left. */
const headRuns = ({ pathname, hash, window: given = {}, fetch: fetchWith = null, globals = {} }) => {
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
    ...globals,
  };
  vm.runInNewContext(routePrefetchScript(), ctx);
  return { calls, win };
};

/** Who is looking, then what the shell's route `route` opens on, as the client spells each read. */
const opensOn = (ws, route) => [
  `/api/v1/workspaces?workspace=${ws}`,
  ...PREFETCH_READS[route].map((r) => `/api/v1/${r}${r.includes("?") ? "&" : "?"}workspace=${ws}`),
];

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

test("the route is the path's, else the hash's: a person's page opens the person from either", () => {
  const person = [`/api/v1/workspaces?workspace=harbor`, `/api/v1/contacts/${ID}?workspace=harbor`];
  // Decision 0015: the route is what follows the slug.
  assert.deepEqual(
    headRuns({ pathname: `/w/harbor/clients/${ID}`, hash: "" }).calls.map(([u]) => u),
    person,
  );
  // An address the frame has not moved yet still says it in the hash, and the person is read while the frame moves it.
  assert.deepEqual(
    headRuns({ pathname: "/w/harbor", hash: `#/clients/${ID}` }).calls.map(([u]) => u),
    person,
  );
  // The path wins over a hash left in it, and a path for another page reads no person: it opens that page.
  assert.deepEqual(
    headRuns({ pathname: "/w/harbor/inbox", hash: `#/clients/${ID}` }).calls.map(([u]) => u),
    opensOn("harbor", "inbox"),
  );
  // The path says People as the product does (ROUTE_WORDS), and an old link says it as the shell did: both open the person.
  assert.deepEqual(
    headRuns({ pathname: `/w/harbor/people/${ID}`, hash: "" }).calls.map(([u]) => u),
    person,
  );
  // Not a person: the page is People's list, which has its own reads (below).
  assert.deepEqual(
    headRuns({ pathname: "/w/harbor/clients/not-a-uuid", hash: "" }).calls.map(([u]) => u),
    PEOPLE_LIST("harbor"),
  );
});

/** Who is looking, then what People's list opens on: the rows, the lists kept, the member's views, in the order it asks. */
const PEOPLE_LIST = (ws) => [
  `/api/v1/workspaces?workspace=${ws}`,
  `/api/v1/contacts?workspace=${ws}`,
  `/api/v1/segments?workspace=${ws}`,
  `/api/v1/views?workspace=${ws}`,
];

test("on People's list the head starts its three reads beside who is looking, as the client spells them; Leads and a person's page do not take them", () => {
  assert.deepEqual(
    headRuns({ pathname: "/w/harbor/people", hash: "" }).calls.map(([u]) => u),
    PEOPLE_LIST("harbor"),
  );
  // A list, a saved list and the Pipeline are the same page over the same rows.
  for (const route of ["people/seg:vip", "people/list:abc", "people/state:needs", "people/pipeline", "clients"])
    assert.deepEqual(
      headRuns({ pathname: `/w/harbor/${route}`, hash: "" }).calls.map(([u]) => u),
      PEOPLE_LIST("harbor"),
      route,
    );
  // Leads is its own surface, and a person's page reads the person first.
  for (const route of ["people/leads", "people/leads:s-abc", "clients/leads"])
    assert.deepEqual(
      headRuns({ pathname: `/w/harbor/${route}`, hash: "" }).calls.map(([u]) => u),
      ["/api/v1/workspaces?workspace=harbor"],
      route,
    );
  // Parked under the URL the client reads, each once.
  const { win } = headRuns({ pathname: "/w/harbor/people", hash: "" });
  assert.deepEqual(Object.keys(win[PREFETCH_SLOT]).sort(), PEOPLE_LIST("harbor").slice().sort());
  const { calls } = headRuns({ pathname: "/w/harbor/people", hash: "", window: win });
  assert.deepEqual(calls, [], "run twice, nothing twice");
});

test("every page opens on its own reads, named by the path's word or the hash's; an address naming no route is Today's", () => {
  // The path says the product's word (ROUTE_WORDS); an old link, or a hash the frame has not moved yet, says the shell's.
  const pages = [
    ["today", "today"],
    ["inbox/c-1", "inbox"],
    ["conversations/calls", "conversations"],
    ["live", "live"],
    ["lists", "segments"],
    ["segments", "segments"],
    ["broadcasts", "broadcasts"],
    ["playbooks", "outbound"],
    ["outbound", "outbound"],
    ["templates", "messages"],
    ["admin/team", "admin"],
    ["start", "start"],
  ];
  for (const [path, route] of pages) {
    assert.deepEqual(
      headRuns({ pathname: `/w/acme/${path}`, hash: "" }).calls.map(([u]) => u),
      opensOn("acme", route),
      path,
    );
    assert.deepEqual(
      headRuns({ pathname: "/w/acme", hash: `#/${path}` }).calls.map(([u]) => u),
      opensOn("acme", route),
      path,
    );
  }
  for (const pathname of ["/w/acme", "/w/acme/"])
    assert.deepEqual(
      headRuns({ pathname, hash: "" }).calls.map(([u]) => u),
      opensOn("acme", "today"),
      pathname,
    );
  // People's own address, before the frame has moved it, still starts People's reads.
  for (const hash of ["#/clients", "#/clients/c-ana", "#/clients/not-a-uuid"])
    assert.deepEqual(
      headRuns({ pathname: "/w/acme", hash }).calls.map(([u]) => u),
      PEOPLE_LIST("acme"),
      hash,
    );
});

test("a page that opens on what only the tab knows, or one nobody named, starts who is looking alone; off a workspace page nothing is", () => {
  // The Calendar's weeks are the business's, Reports' period the tab's, Leads' list the view it remembers.
  for (const route of [
    "calendar",
    "calendar/2026-10-02",
    "reports",
    "people/leads",
    "clients/leads:s-1",
    "nowhere",
    "constructor",
  ])
    assert.deepEqual(
      headRuns({ pathname: `/w/acme/${route}`, hash: "" }).calls.map(([u]) => u),
      ["/api/v1/workspaces?workspace=acme"],
      route,
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

test("a read the head started is bounded until its headers come, never after: a hung one gives way, an answered one's body is never cut off", async () => {
  const timers = new Map();
  let next = 1;
  const globals = {
    setTimeout: (fn, ms) => {
      timers.set(next, { fn, ms });
      return next++;
    },
    clearTimeout: (k) => timers.delete(k),
  };
  const signals = {};
  const { win } = headRuns({
    pathname: "/w/acme",
    hash: `#/clients/${ID}`,
    window: { AbortController },
    globals,
    fetch: (url, init) => {
      signals[url] = init.signal;
      // Who is looking answers at once; the person never does.
      return url.startsWith("/api/v1/workspaces") ? Promise.resolve({ url }) : new Promise(() => {});
    },
  });
  const who = "/api/v1/workspaces?workspace=acme";
  const person = `/api/v1/contacts/${ID}?workspace=acme`;
  assert.equal(timers.size, 2, "one bound per read");
  assert.ok(
    [...timers.values()].every((t) => t.ms === 15_000),
    "as long as the client's own read would wait",
  );
  assert.deepEqual(await win[PREFETCH_SLOT][who], { url: who }, "the client takes the answer itself");
  assert.equal(timers.size, 1, "an answered read's bound ends with its headers");
  for (const t of timers.values()) t.fn();
  assert.equal(signals[person].aborted, true, "the hung read gives way to the client's own");
  assert.equal(signals[who].aborted, false, "the answered read's body is never cut off");
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

/* ------------------------------ what each page opens on ------------------------------ */

test("what the head starts for a page is what its surfaces ask for first, no more and no less: each one run", async () => {
  const asked = [];
  const win = {
    // Every read is recorded and never answered: a surface asks for its first reads together, then waits.
    fetch: (url) => {
      asked.push(url);
      return new Promise(() => {});
    },
    location: { pathname: "/w/harbor", search: "", hash: "", assign() {}, replace() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return true;
    },
  };
  globalThis.window = win;
  globalThis.sessionStorage = win.sessionStorage;
  globalThis.localStorage = win.localStorage;
  const { api } = await importSrc("apps/dashboard/src/legacy-bridge/api.ts");
  const registry = await importSrc("apps/dashboard/src/legacy-bridge/surface-registry.ts");
  const S = "apps/dashboard/src";
  const overrides = Object.fromEntries(
    [
      (await importSrc(`${S}/surfaces/today/surface.ts`)).todayOverride,
      (await importSrc(`${S}/surfaces/setup/surface.ts`)).setupOverride,
      (await importSrc(`${S}/surfaces/inbox/surface.ts`)).inboxOverride,
      (await importSrc(`${S}/surfaces/inbox/conversations-surface.ts`)).conversationsOverride,
      (await importSrc(`${S}/surfaces/people/surface.ts`)).peopleOverride,
      (await importSrc(`${S}/surfaces/live/surface.ts`)).liveOverride,
      (await importSrc(`${S}/surfaces/campaigns/broadcasts/surface.ts`)).broadcastsOverride,
      (await importSrc(`${S}/surfaces/campaigns/playbooks/surface.ts`)).playbooksOverride,
      (await importSrc(`${S}/legacy-bridge/surfaces/settings.ts`)).settingsOverride,
    ].map((o) => [o.key, o]),
  );
  const settle = async () => {
    for (let i = 0; i < 10; i += 1) await new Promise((r) => setTimeout(r, 0));
  };
  // Settings is a page of panes, each drawn from the settings surface: asked about one of them.
  const paramOf = { admin: "workspace" };
  for (const route of Object.keys(PREFETCH_READS)) {
    const own = registry.routeSurfaceFor(route, paramOf[route] ?? null);
    const keys = [own, ...(registry.ROUTE_WAITS[route] ?? [])];
    assert.ok(
      keys.every((k) => overrides[k]),
      `${route}: every surface it opens on is run here (${keys.join(", ")})`,
    );
    win.location.pathname = `/w/harbor/${route}`;
    api().forget();
    asked.length = 0;
    for (const k of keys) void overrides[k].apply().catch(() => {});
    await settle();
    // Who is looking is every page's (and a surface's clock reads it when the tab knows no zone yet).
    const theirs = [...new Set(asked)].filter((u) => !u.startsWith("/api/v1/workspaces")).sort();
    const head = opensOn("harbor", route).slice(1).sort();
    assert.deepEqual(head, theirs, `${route}: the head starts what ${keys.join(" and ")} ask for first`);
  }
  api().forget();
});
