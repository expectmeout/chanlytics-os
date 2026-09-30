/**
 * The runner's boot, run: which surface asks first, and what the others see.
 *
 * No browser: a window with the three things the runner touches, a document
 * that never becomes visible, and overrides whose apply() records what the
 * page named for the workspace at the moment they asked. The workspace is
 * the address (plan 3.5): /w/<slug> names it, the home names none.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";

const win = {
  __ACTIVE_WORKSPACE: undefined,
  location: {
    pathname: "/",
    search: "",
    hash: "",
    reload() {
      win.reloads += 1;
    },
    assign(url) {
      win.assigned = url;
    },
    replace(url) {
      win.replaced = url;
    },
  },
  reloads: 0,
  assigned: null,
  replaced: null,
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {
    return true;
  },
};
globalThis.window = win;
globalThis.document = { visibilityState: "hidden", addEventListener() {}, removeEventListener() {} };
const { startSurfaces, bootWaitsFor, getConnection, getSurfaceStatuses, markHydrated, onSurfaceStatusChange } =
  await importSrc("apps/dashboard/src/legacy-bridge/surface-runner.ts");
const { getActiveWorkspace } = await importSrc("apps/dashboard/src/legacy-bridge/workspace.ts");
const { read } = await importSrc("apps/dashboard/src/legacy-bridge/api.ts");

const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (n) => {
  for (let i = 0; i < n; i += 1) await tick();
};

/** The page at `pathname`; the workspace surface answers after two ticks; the others record what the page named when they asked. */
function world({ pathname }) {
  win.location.pathname = pathname;
  win.__ACTIVE_WORKSPACE = undefined;
  const log = [];
  const workspace = {
    key: "workspace",
    apply: async () => {
      log.push(["workspace:asked", getActiveWorkspace()]);
      await tick();
      await tick();
      win.__ACTIVE_WORKSPACE = "id-a";
      log.push(["workspace:answered", "id-a"]);
    },
  };
  const other = (key) => ({
    key,
    debounceMs: 1,
    apply: async () => {
      log.push([key, getActiveWorkspace()]);
    },
  });
  return { log, overrides: [workspace, other("inbox"), other("people")] };
}

test("off a workspace page, the workspace surface asks first and the others ask only once it has answered", async () => {
  const { log, overrides } = world({ pathname: "/" });
  const stop = startSurfaces(overrides);
  await settle(12);
  stop();
  assert.deepEqual(
    log.slice(0, 2),
    [
      ["workspace:asked", null],
      ["workspace:answered", "id-a"],
    ],
    "one request before every other",
  );
  assert.deepEqual(
    log
      .slice(2)
      .map((l) => l[0])
      .sort(),
    ["inbox", "people"],
    "then the rest",
  );
});

test("on a workspace page, the page's own surfaces fire at once with the address's workspace on each, the rest once they are in, and nothing asks twice", async () => {
  // Today draws People; the Inbox is a stranger to it (25 Sep 2026: the boot is two passes, the page's and the rest).
  const { log, overrides } = world({ pathname: "/w/acme" });
  const stop = startSurfaces(overrides);
  await settle(12);
  stop();
  assert.deepEqual(
    log
      .map((l) => l[0])
      .slice(0, 2)
      .sort(),
    ["people", "workspace:asked"],
    "the page's own asked before the workspace surface answered: on a workspace page nothing waits for it",
  );
  assert.ok(
    log.findIndex((l) => l[0] === "inbox") > log.findIndex((l) => l[0] === "workspace:answered"),
    "a stranger asks once the page's own are in",
  );
  assert.ok(
    log.filter((l) => l[0] === "inbox" || l[0] === "people").every((l) => l[1] === "acme"),
    "each carried the workspace the address names",
  );
  assert.equal(log.filter((l) => l[0] === "inbox").length, 1);
  assert.equal(win.reloads + (win.assigned ? 1 : 0) + (win.replaced ? 1 : 0), 0, "a boot never navigates");
});

/** Overrides that record when they start and finish, so the test can watch how many run at once. */
function crowd(keys, { hash = "" } = {}) {
  win.location.pathname = "/w/acme";
  win.location.hash = hash;
  win.__ACTIVE_WORKSPACE = "id-a";
  const order = [];
  let live = 0;
  let peak = 0;
  const overrides = keys.map((key) => ({
    key,
    debounceMs: 1,
    apply: async () => {
      order.push(key);
      live += 1;
      peak = Math.max(peak, live);
      await tick();
      await tick();
      live -= 1;
    },
  }));
  return { order, overrides, peak: () => peak };
}

test("boot runs in lanes rather than all at once: twenty-three requests in one millisecond is what made a cold load take 7.8s", async () => {
  const keys = [
    "today",
    "inbox",
    "people",
    "calendar",
    "reports",
    "settings",
    "broadcasts",
    "playbooks",
    "conversations",
    "notifications",
  ];
  const { overrides, peak } = crowd(keys);
  const stop = startSurfaces(overrides);
  await settle(60);
  stop();
  assert.ok(peak() <= 4, `at most four surfaces boot at once, saw ${peak()}`);
  assert.ok(peak() > 1, "and more than one, or a cold load is ten round trips end to end");
});

test("the surface the address is asking for takes the first lane", async () => {
  // Landing on Reports and loading eleven surfaces ahead of it is backwards.
  const keys = ["today", "inbox", "people", "calendar", "reports", "settings", "broadcasts", "playbooks"];
  const { order, overrides } = crowd(keys, { hash: "#/reports" });
  const stop = startSurfaces(overrides);
  await settle(60);
  stop();
  assert.equal(order[0], "reports", "the one on screen asks first");
  assert.equal(new Set(order).size, keys.length, "and every other surface still boots");
});

test("a route with no surface of its own changes nothing: the order is only a preference", async () => {
  const keys = ["today", "inbox", "people", "calendar"];
  const { order, overrides } = crowd(keys, { hash: "#/nothing-here" });
  const stop = startSurfaces(overrides);
  await settle(40);
  stop();
  assert.deepEqual([...order].sort(), [...keys].sort(), "all of them, and none twice");
});

test("the boot holds every answer until its last surface is in: two surfaces reading one list ask the server once", async () => {
  // Measured on the salon's Leads page: 31 reads at boot, 20 distinct. A surface in the second lane asked for a list
  // a surface in the first had been answered a moment before, because a settled read was dropped as it settled.
  win.location.pathname = "/w/acme";
  win.location.hash = "";
  win.__ACTIVE_WORKSPACE = "id-a";
  const sent = [];
  win.fetch = async (url) => {
    sent.push(url);
    await tick();
    return new Response(JSON.stringify({ ok: true, data: { templates: [] } }), { status: 200 });
  };
  let firstIn = () => {};
  const first = new Promise((r) => {
    firstIn = r;
  });
  // Two of Today's own (it draws the calendar and People), so they boot in one pass, side by side.
  const overrides = [
    {
      key: "calendar",
      apply: async () => {
        await read("GET templates");
        firstIn();
      },
    },
    {
      key: "people",
      apply: async () => {
        await first;
        await tick();
        await read("GET templates");
      },
    },
  ];
  const stop = startSurfaces(overrides);
  await settle(20);
  const asked = () => sent.filter((u) => u.startsWith("/api/v1/templates")).length;
  assert.equal(asked(), 1, "the second surface read the answer the first had just been given");
  await read("GET templates");
  assert.equal(
    asked(),
    2,
    "once the boot is in, a read asks the server: what follows is the live feed's and a write's to refresh",
  );
  stop();
});

/** A document that becomes visible when the test says, with its listeners by type. */
function returnable() {
  const on = {};
  const doc = {
    visibilityState: "hidden",
    addEventListener: (t, f) => {
      (on[t] ||= []).push(f);
    },
    removeEventListener: (t, f) => {
      on[t] = (on[t] || []).filter((g) => g !== f);
    },
  };
  const back = () => {
    doc.visibilityState = "visible";
    for (const f of on.visibilitychange || []) f();
  };
  const away = () => {
    doc.visibilityState = "hidden";
    for (const f of on.visibilitychange || []) f();
  };
  return { doc, back, away };
}

test("a return to the tab reads the surface on screen first and the rest behind it in lanes, never every surface at once", async () => {
  // Every surface was scheduled at once on a return -- twenty surfaces, thirty reads in one burst, the page's own
  // among them and no sooner than a stranger's: the burst the boot's lanes exist to prevent.
  const keys = [
    "today",
    "inbox",
    "people",
    "calendar",
    "reports",
    "settings",
    "broadcasts",
    "playbooks",
    "conversations",
    "notifications",
  ];
  const { doc, back } = returnable();
  globalThis.document = doc;
  const { order, overrides } = crowd(keys, { hash: "#/reports" });
  let live = 0;
  let peak = 0;
  const measured = overrides.map((o) => ({
    ...o,
    apply: async () => {
      live += 1;
      peak = Math.max(peak, live);
      await o.apply();
      live -= 1;
    },
  }));
  const stop = startSurfaces(measured);
  try {
    await settle(60);
    order.length = 0;
    peak = 0;
    back();
    await settle(60);
    assert.equal(order[0], "reports", "the one on screen is read first");
    assert.equal(new Set(order).size, keys.length, "and every other surface is still read");
    assert.equal(order.length, keys.length, "each once");
    assert.ok(peak <= 4 && peak > 1, `through the boot's lanes, saw ${peak} at once`);
    order.length = 0;
    back();
    back();
    await settle(60);
    assert.equal(order.length, keys.length, "two returns in quick succession are one pass, not two");
  } finally {
    stop();
    globalThis.document = { visibilityState: "hidden", addEventListener() {}, removeEventListener() {} };
  }
});

test("a glance at another app reads nothing again; half a minute away, a surface not live, or the live feed down reads every surface", async () => {
  // Every return read every surface -- about 28 reads on a workspace for a look at a message elsewhere, and the phone
  // app's five pages each did it on every return to the app. The live feed keeps them current while the tab is away.
  const { setConnection } = await importSrc("apps/dashboard/src/legacy-bridge/surface-status.ts");
  mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
  const { doc, back, away } = returnable();
  globalThis.document = doc;
  const { order, overrides } = crowd(["today", "inbox", "people"], { hash: "#/today" });
  const stop = startSurfaces(overrides);
  try {
    await settle(60);
    order.length = 0;
    away();
    mock.timers.tick(10_000);
    back();
    await settle(60);
    assert.deepEqual(order, [], "REGRESSION: every surface read again for a ten-second glance away");
    away();
    mock.timers.tick(31_000);
    back();
    await settle(60);
    assert.equal(order.length, 3, "half a minute away: every surface is read again");
    order.length = 0;
    setConnection({ realtimeDown: true });
    away();
    mock.timers.tick(1_000);
    back();
    await settle(60);
    assert.equal(order.length, 3, "the live feed down: nothing kept them current, so a glance reads again");
  } finally {
    setConnection({ realtimeDown: false });
    stop();
    mock.timers.reset();
    globalThis.document = { visibilityState: "hidden", addEventListener() {}, removeEventListener() {} };
  }
});

/** A live feed the test holds: what each join asked for, whether it was left, and the change it can send. */
function liveFeed() {
  const joins = [];
  const join = (onChange, opts) => {
    const joined = { onChange, opts, left: false };
    joins.push(joined);
    return () => {
      joined.left = true;
    };
  };
  return { joins, join };
}

test("once the boot is in, the runner joins the live feed the page handed it -- this workspace's, once -- routes each change to the surfaces that watch its table, and leaves it when stopped", async () => {
  // It reached for the Supabase browser client itself. In a node test that client has no URL or key, so a boot that
  // finished while its test was still running threw, un-awaited, and failed the test as an unhandled rejection --
  // only when the machine was slow enough for the boot to finish in time, which is why it came and went.
  win.location.pathname = "/w/acme";
  win.location.hash = "";
  win.__ACTIVE_WORKSPACE = "id-a";
  const asked = [];
  const surface = (key, watches) => ({
    key,
    debounceMs: 1,
    ...watches,
    apply: async () => {
      asked.push(key);
    },
  });
  const feed = liveFeed();
  const stop = startSurfaces(
    [
      surface("inbox", { refreshOnMessageInserts: true }),
      surface("live", { refreshOnTables: ["calls"] }),
      // Today's rule (surfaces/today/surface.ts): a call starting or ending, never a transcript turn.
      surface("today", {
        refreshOnTables: ["calls"],
        refreshWhen: (c) => c.table !== "calls" || c.event !== "UPDATE" || c.row.status !== "ongoing",
      }),
      surface("settings"),
    ],
    feed.join,
  );
  try {
    await settle(20);
    assert.deepEqual([...asked].sort(), ["inbox", "live", "settings", "today"], "every surface booted");
    assert.equal(feed.joins.length, 1, "one feed for the runner, joined once the boot is in");
    const [{ onChange, opts }] = feed.joins;
    assert.equal(opts.tenantId, "id-a", "the workspace on screen: its topic is the one joined");
    asked.length = 0;
    onChange({ tenant_id: "id-a" }, "messages", "INSERT");
    await settle(20);
    assert.deepEqual(asked, ["inbox"], "a message repaints what watches messages, and nothing else");
    // The runner hands a surface's rule the event and the row the feed heard: a turn keeps a call ongoing.
    asked.length = 0;
    onChange({ tenant_id: "id-a", status: "ongoing" }, "calls", "UPDATE");
    await settle(20);
    assert.deepEqual(asked, ["live"], "a transcript turn repaints Live, and Today waits");
    asked.length = 0;
    onChange({ tenant_id: "id-a", status: "ended" }, "calls", "UPDATE");
    await settle(20);
    assert.deepEqual([...asked].sort(), ["live", "today"], "a call ended: Today repaints too");
  } finally {
    stop();
  }
  assert.equal(feed.joins[0].left, true, "a stopped runner leaves its feed");
});

test("a runner stopped before its boot is in never joins the feed, however late the boot ends", async () => {
  let finish = () => {};
  const slow = {
    key: "inbox",
    refreshOnMessageInserts: true,
    apply: () =>
      new Promise((r) => {
        finish = r;
      }),
  };
  const feed = liveFeed();
  const stop = startSurfaces([slow], feed.join);
  await settle(2);
  stop();
  finish();
  await settle(20);
  assert.equal(feed.joins.length, 0);
});

test("surfaces that watch the feed, started with no feed to join, are refused at the call rather than when the boot ends", () => {
  const watching = { key: "inbox", refreshOnMessageInserts: true, apply: async () => {} };
  assert.throws(() => startSurfaces([watching]), /need a feed to join/);
  const stop = startSurfaces([{ key: "settings", apply: async () => {} }]);
  stop();
});

test("identity leads even on a workspace page, where nothing waits for it", async () => {
  // The shell reads __ME to decide what a role may see. Queued behind three
  // strangers it would draw the nav for the wrong role and then correct it.
  const keys = ["today", "inbox", "people", "calendar", "reports", "workspace", "settings"];
  const { order, overrides } = crowd(keys, { hash: "#/reports" });
  const stop = startSurfaces(overrides);
  await settle(60);
  stop();
  assert.equal(order[0], "workspace", "who you are, first");
  assert.equal(order[1], "reports", "then what you are looking at");
  assert.equal(new Set(order).size, keys.length, "and the rest still boot");
});

test("what the page on screen draws from other surfaces follows its own surface, in the page's order, ahead of every stranger", async () => {
  // Today draws the day beside its queue from the calendar, the queue's runs from broadcasts, the card's period line
  // and Worth a look from reports. Measured on the salon's Today (22 Sep 2026): the calendar was read eleventh, behind
  // Settings, People and Leads that nobody was looking at, and the day popped in 1.6 s after the queue beside it.
  const { ROUTE_DRAWS } = await importSrc("apps/dashboard/src/legacy-bridge/surface-registry.ts");
  const keys = [
    "conversations",
    "inbox",
    "today",
    "settings",
    "people",
    "leads",
    "reports",
    "live",
    "broadcasts",
    "playbooks",
    "calendar",
    "notifications",
    "setup",
    "google",
    "billing",
    "reach_out_replies",
  ];
  const draws = ROUTE_DRAWS.today;
  for (const k of ["calendar", "broadcasts", "reports"])
    assert.ok(draws.includes(k), `Today names ${k} among what it draws`);
  // Each name is an override that exists, read from the modules that export them: a renamed surface would otherwise
  // leave its entry inert and this test green.
  const keepError = console.error;
  console.error = () => {};
  let known;
  try {
    const modules = await Promise.all(
      [
        "surface-data",
        "../surfaces/inbox/surface",
        "../surfaces/today/surface",
        "../surfaces/inbox/conversations-surface",
        "surfaces/settings",
        "surfaces/people",
        "surfaces/broadcasts",
        "surfaces/playbooks",
        "surfaces/calendar",
        "../surfaces/reports/surface",
        "surfaces/notifications",
        "surfaces/live",
        "setup",
        "leads",
        "google",
        "billing",
        "reach-out/replies",
      ].map((m) => importSrc(`apps/dashboard/src/legacy-bridge/${m}.ts`)),
    );
    known = new Set(
      modules.flatMap((mod) =>
        Object.values(mod)
          .filter((v) => v && typeof v === "object" && typeof v.key === "string" && typeof v.apply === "function")
          .map((v) => v.key),
      ),
    );
  } finally {
    console.error = keepError;
  }
  for (const k of draws)
    assert.ok(known.has(k), `${k} is a surface an override feeds (known: ${[...known].join(", ")})`);
  const { order, overrides } = crowd(keys, { hash: "#/today" });
  const stop = startSurfaces(overrides);
  await settle(80);
  stop();
  assert.deepEqual(
    order.slice(0, 1 + draws.length),
    ["today", ...draws],
    "its own surface first, then what it draws in the order it draws them, before Settings or anyone's list",
  );
  assert.equal(new Set(order).size, keys.length, "and every other surface still boots");
});

test("a person's page waits only for who is looking, then reads People for their name: never the whole list first", async () => {
  // Measured on production (23 Sep 2026): a new tab on a person held Reading… until People's 29 rows were in (0.87 s),
  // and only then asked for the person (1.5 s). The page reads its own person (people-detail.ts warmPersonOnScreen);
  // the gate waits for the workspace, which carries the role the page's acts depend on.
  const reg = await importSrc("apps/dashboard/src/legacy-bridge/surface-registry.ts");
  const ID = "ed2244f3-9f88-49c5-863e-fbdea4b60e12";
  assert.equal(reg.routeSurfaceFor("clients", ID), "workspace", "the gate waits for who is looking");
  assert.equal(reg.routeSurfaceFor("clients", "c-ana"), "people", "the mockup's seeded people keep the list's gate");
  assert.equal(reg.routeSurfaceFor("clients", null), "people", "People itself waits for its rows");
  assert.equal(reg.routeSurfaceFor("clients", "leads:c-review"), "leads", "and the Leads scope for its own");
  assert.deepEqual(reg.routeDrawsFor("clients", ID), ["people"]);
  assert.deepEqual(reg.routeDrawsFor("clients", null), [], "the list draws nothing beside its own surface");
  const keys = ["conversations", "inbox", "today", "settings", "people", "leads", "reports", "workspace", "calendar"];
  const { order, overrides } = crowd(keys, { hash: `#/clients/${ID}` });
  const stop = startSurfaces(overrides);
  await settle(80);
  stop();
  assert.deepEqual(order.slice(0, 2), ["workspace", "people"], "who is looking, then the row that names them");
  assert.equal(new Set(order).size, keys.length, "and every other surface still boots");
});

test("(0008) a cold Calendar reads People right after its own surface: an appointment's peek says the person's deal", async () => {
  // The peek draws the person's deal stage and "Start a proposal" from People, and whether deals are on at all; read
  // in the runner's fixed order, People came after Settings, and the pill arrived late on a cold Calendar.
  const { ROUTE_DRAWS } = await importSrc("apps/dashboard/src/legacy-bridge/surface-registry.ts");
  assert.deepEqual(ROUTE_DRAWS.calendar, ["people"]);
  const keys = ["conversations", "inbox", "today", "settings", "leads", "reports", "people", "calendar", "billing"];
  const { order, overrides } = crowd(keys, { hash: "#/calendar" });
  const stop = startSurfaces(overrides);
  await settle(80);
  stop();
  assert.deepEqual(order.slice(0, 2), ["calendar", "people"], "its own surface, then People, before anyone else's");
  assert.equal(new Set(order).size, keys.length, "and every other surface still boots");
});

test("Today reads what is left to set up right after its own surface: the card is drawn above the queue", async () => {
  // Read seventh, Setup landed after the queue and the card pushed it down (Ruben, 24 Sep 2026: "does not load
  // properly like the rest of the page").
  const { ROUTE_DRAWS, ROUTE_WAITS } = await importSrc("apps/dashboard/src/legacy-bridge/surface-registry.ts");
  assert.equal(ROUTE_DRAWS.today[0], "setup");
  assert.deepEqual(ROUTE_WAITS.today, ["setup"], "and Today's first draw waits for it");
  const keys = ["conversations", "inbox", "today", "settings", "people", "calendar", "reports", "setup", "google"];
  const { order, overrides } = crowd(keys, { hash: "#/today" });
  const stop = startSurfaces(overrides);
  await settle(80);
  stop();
  assert.deepEqual(order.slice(0, 2), ["today", "setup"], "its own surface, then Setup, in the first lanes");
});

/* ------------------------------ two passes ------------------------------ */
// Measured on production (25 Sep 2026, a cold person page): the page's own read went out beside nine of the boot's and
// took 3,236 ms; alone, 773. Twenty-six reads, 520 KB, for a page that draws one person. The boot is two passes now:
// the page's own surfaces, then, once they and the page's own read are in, everyone else's.

test("a cold boot is two passes: the page's own surfaces, then the rest once they and the page's own read are in", async () => {
  const ID = "ed2244f3-9f88-49c5-863e-fbdea4b60e12";
  const keys = ["settings", "inbox", "people", "reports", "workspace", "calendar"];
  const { order, overrides } = crowd(keys, { hash: `#/clients/${ID}` });
  let landed = () => {};
  bootWaitsFor(
    new Promise((r) => {
      landed = r;
    }),
  );
  const stop = startSurfaces(overrides);
  await settle(20);
  assert.deepEqual(order, ["workspace", "people"], "the page's own, and nobody else while its read is out");
  landed();
  await settle(40);
  stop();
  assert.equal(new Set(order).size, keys.length, "then every other surface boots");
  assert.deepEqual(order.slice(0, 2), ["workspace", "people"]);
});

test("a page read that never lands holds the rest for the route's wait at most, and only this boot's", async () => {
  const ID = "ed2244f3-9f88-49c5-863e-fbdea4b60e12";
  const keys = ["settings", "people", "workspace"];
  win.__routeWaitMs = 150;
  try {
    const { order, overrides } = crowd(keys, { hash: `#/clients/${ID}` });
    bootWaitsFor(new Promise(() => {}));
    const stop = startSurfaces(overrides);
    // A few ticks (a tick is ~15 ms on Windows), well inside the cap.
    await settle(3);
    assert.deepEqual(order, ["workspace", "people"]);
    await new Promise((r) => setTimeout(r, 320));
    await settle(6);
    stop();
    assert.deepEqual(order, ["workspace", "people", "settings"], "the wait ran out; the shell has its rest");
    // The read that never lands was this boot's: the next boots without it.
    const again = crowd(keys, { hash: `#/clients/${ID}` });
    const stop2 = startSurfaces(again.overrides);
    await settle(10);
    stop2();
    assert.deepEqual(again.order, ["workspace", "people", "settings"], "in one go, with no wait");
  } finally {
    delete win.__routeWaitMs;
  }
});

const turn = async (n) => {
  for (let i = 0; i < n; i += 1) await new Promise((r) => setImmediate(r));
};

test("a failed boot over CACHED real data is degraded, not seeded", async () => {
  // The cache restores real rows before React mounts. If both boot attempts
  // then fail, recording "seeded" is the one thing that is not true:
  // yesterday's real conversations are on screen under a status meaning "no
  // real data", so the pill shows neither live nor stale. refresh() has
  // always used this rule; boot did not.
  win.location.pathname = "/w/acme";
  win.location.hash = "";
  win.__ACTIVE_WORKSPACE = "id-a";
  markHydrated(["cached-rows"]);
  const down = (key) => ({
    key,
    apply: async () => {
      throw new Error("down");
    },
  });
  const quiet = mock.method(console, "error", () => {});
  mock.timers.enable({ apis: ["setTimeout"] });
  const stop = startSurfaces([down("cached-rows"), down("never-loaded")]);
  try {
    await turn(10);
    assert.equal(getSurfaceStatuses().get("cached-rows"), undefined, "one retry first: a boot blip is not a failure");
    mock.timers.tick(800);
    await turn(10);
    assert.equal(getSurfaceStatuses().get("cached-rows"), "degraded", "real rows on screen, and stale");
    assert.equal(getSurfaceStatuses().get("never-loaded"), "seeded", "no real rows ever: failed, not stale");
  } finally {
    stop();
    mock.timers.reset();
    quiet.mock.restore();
  }
});

test("the runner hears the tab and the network in order, and its stop undoes it in the same order: listeners, pending refreshes, the feed, the connection", async () => {
  win.location.pathname = "/w/acme";
  win.location.hash = "";
  win.__ACTIVE_WORKSPACE = "id-a";
  const said = [];
  globalThis.document = {
    visibilityState: "hidden",
    addEventListener: (type) => said.push(`document +${type}`),
    removeEventListener: (type) => said.push(`document -${type}`),
  };
  const { addEventListener, removeEventListener } = win;
  win.addEventListener = (type) => said.push(`window +${type}`);
  win.removeEventListener = (type) => said.push(`window -${type}`);
  const navigatorWas = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { onLine: false } });
  let connection = JSON.stringify(getConnection());
  const off = onSurfaceStatusChange(() => {
    const now = JSON.stringify(getConnection());
    if (now !== connection) said.push(`connection ${now}`);
    connection = now;
  });
  const joins = [];
  const join = (onChange) => {
    joins.push(onChange);
    return () => said.push("the feed left");
  };
  const clearTimeoutWas = globalThis.clearTimeout;
  let stop = () => {};
  try {
    stop = startSurfaces(
      [{ key: "inbox", refreshOnMessageInserts: true, debounceMs: 60_000, apply: async () => {} }],
      join,
    );
    assert.deepEqual(said, [
      "document +visibilitychange",
      'connection {"offline":true,"realtimeDown":false}',
      "window +offline",
      "window +online",
    ]);
    await settle(10);
    assert.equal(joins.length, 1, "the feed is joined once the boot is in");
    joins[0]({ id: "m1" }, "messages", "INSERT");
    said.length = 0;
    globalThis.clearTimeout = (t) => {
      said.push("a pending refresh cleared");
      clearTimeoutWas(t);
    };
    stop();
    stop = () => {};
    assert.deepEqual(said, [
      "document -visibilitychange",
      "window -offline",
      "window -online",
      "a pending refresh cleared",
      "the feed left",
      'connection {"offline":false,"realtimeDown":false}',
    ]);
  } finally {
    stop();
    globalThis.clearTimeout = clearTimeoutWas;
    off();
    if (navigatorWas) Object.defineProperty(globalThis, "navigator", navigatorWas);
    else delete globalThis.navigator;
    win.addEventListener = addEventListener;
    win.removeEventListener = removeEventListener;
    globalThis.document = { visibilityState: "hidden", addEventListener() {}, removeEventListener() {} };
  }
});

test("a boot that ends after its runner stopped never reloads for another workspace's cache; one that ends running does", async () => {
  // Restored cache belongs to whoever was signed in when it was written: a different workspace reloads the tab, once
  // its boot is in. A runner already stopped (a StrictMode unmount, a workspace switch) is past deciding that.
  win.location.pathname = "/w/acme";
  win.location.hash = "";
  win.__ACTIVE_WORKSPACE = "id-a";
  const m = new Map();
  globalThis.sessionStorage = {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
  const cachedFor = (tenant) =>
    m.set(
      "chanlytics.surfaces.v1",
      JSON.stringify({ build: process.env.NEXT_PUBLIC_BUILD_SHA || "dev", tenant, surfaces: {} }),
    );
  const reloads = win.reloads;
  try {
    cachedFor("id-old");
    let finish = () => {};
    const slow = {
      key: "settings",
      apply: () =>
        new Promise((r) => {
          finish = r;
        }),
    };
    const stop = startSurfaces([slow]);
    await settle(2);
    stop();
    finish();
    await settle(10);
    assert.equal(win.reloads, reloads, "stopped: nothing is reloaded");
    cachedFor("id-old");
    const stop2 = startSurfaces([{ key: "settings", apply: async () => {} }]);
    await settle(10);
    stop2();
    assert.equal(win.reloads, reloads + 1, "running: another workspace's rows are dropped and the tab reloads");
  } finally {
    delete globalThis.sessionStorage;
  }
});
