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
import { until } from "../../shared/_until.mjs";
import { bridgeHolds } from "../_bridge-holds.mjs";

bridgeHolds({ who: { activeWorkspaceId: undefined } });
const win = {
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
const { bootWaitsFor, drawComing, pageDrawn } = await importSrc("apps/dashboard/src/bridge/hearing/page-waits.ts");
const { startSurfaces, getConnection, getSurfaceStatuses, markHydrated, onSurfaceStatusChange, refreshSurfaces } =
  await importSrc("apps/dashboard/src/bridge/surface-runner.ts");
const { getActiveWorkspace } = await importSrc("apps/dashboard/src/bridge/workspace.ts");
const { read } = await importSrc("apps/dashboard/src/bridge/api.ts");
const { createApi } = await importSrc("apps/dashboard/src/client/api.ts");
const { restReads } = await importSrc("apps/dashboard/src/client/rest-reads.ts");

const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (n) => {
  for (let i = 0; i < n; i += 1) await tick();
};

/** The page at `pathname`; the workspace surface answers after two ticks; the others record what the page named when they asked. */
function world({ pathname }) {
  win.location.pathname = pathname;
  bridgeHolds({ who: { activeWorkspaceId: undefined } });
  const log = [];
  const workspace = {
    key: "workspace",
    apply: async () => {
      log.push(["workspace:asked", getActiveWorkspace()]);
      await tick();
      await tick();
      bridgeHolds({ who: { activeWorkspaceId: "id-a" } });
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
  bridgeHolds({ who: { activeWorkspaceId: "id-a" } });
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
  bridgeHolds({ who: { activeWorkspaceId: "id-a" } });
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
  const { setConnection } = await importSrc("apps/dashboard/src/bridge/surface-status.ts");
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
  bridgeHolds({ who: { activeWorkspaceId: "id-a" } });
  // On screen: a hidden page reads only what says itself in the tab's title and badge, and holds Today's notice until it is
  // in front (shell/feed/the-runner-heals.test.mjs).
  globalThis.document = { visibilityState: "visible", addEventListener() {}, removeEventListener() {} };
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
    globalThis.document = { visibilityState: "hidden", addEventListener() {}, removeEventListener() {} };
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

test("the feed is joined once who is looking is known, not once the whole boot is in; what it says meanwhile is read once the boot's answers are let go of, and once", async () => {
  // Realtime has no backfill: joined at the end of the boot, a message landing after the Inbox's read and before the
  // join (the length of the boot, two seconds and more on a phone) was never heard.
  win.location.pathname = "/w/acme";
  win.location.hash = "";
  bridgeHolds({ who: { activeWorkspaceId: "id-a" } });
  const asked = [];
  let finish = () => {};
  const surfaces = [
    { key: "workspace", apply: async () => void asked.push("workspace") },
    {
      key: "inbox",
      refreshOnMessageInserts: true,
      debounceMs: 1,
      apply: () => {
        asked.push("inbox");
        // The boot's read is slow; a later read answers at once.
        return asked.filter((k) => k === "inbox").length === 1
          ? new Promise((r) => {
              finish = r;
            })
          : Promise.resolve();
      },
    },
  ];
  const feed = liveFeed();
  const stop = startSurfaces(surfaces, feed.join);
  try {
    await settle(10);
    assert.equal(feed.joins.length, 1, "joined while the Inbox's boot read is still out");
    assert.equal(feed.joins[0].opts.tenantId, "id-a");
    feed.joins[0].onChange({ tenant_id: "id-a" }, "messages", "INSERT");
    feed.joins[0].onChange({ tenant_id: "id-a" }, "messages", "INSERT");
    await settle(10);
    assert.deepEqual(asked, ["workspace", "inbox"], "held: a read now would be answered from what the boot holds");
    finish();
    await settle(20);
    assert.deepEqual(asked, ["workspace", "inbox", "inbox"], "read once the boot is in, once for both");
  } finally {
    // The boot ends whatever failed above, so its hold on answers is let go of before the next test.
    finish();
    stop();
    await settle(10);
  }
});

test("REGRESSION: a refresh the live feed asks for never shares a read sent before the change -- Today's read of the conversations from a moment before a message could answer the Inbox's refresh after it", async () => {
  // Today and the Inbox both read GET conversations, and identical reads share one request for two seconds: a write
  // forgets every read out (client/api.ts), and what the live feed says changed now does too.
  win.location.pathname = "/w/acme";
  win.location.hash = "";
  bridgeHolds({ who: { activeWorkspaceId: "id-a" } });
  const sent = [];
  const parked = [];
  win.fetch = async (url) => {
    sent.push(url);
    await new Promise((r) => parked.push(r));
    return new Response(JSON.stringify({ ok: true, data: { conversations: [] } }), { status: 200 });
  };
  const release = async () => {
    for (let i = 0; i < 20; i += 1) {
      while (parked.length) parked.shift()();
      await tick();
    }
  };
  const reads = (key, debounceMs) => ({
    key,
    refreshOnMessageInserts: true,
    debounceMs,
    apply: async () => void (await read("GET conversations")),
  });
  const today = reads("today", 60_000);
  const inbox = reads("inbox", 1);
  const feed = liveFeed();
  const stop = startSurfaces([today, inbox], feed.join);
  try {
    await release();
    assert.equal(feed.joins.length, 1, "the boot is in and the feed joined");
    sent.length = 0;
    // Today's own read goes out (its refresh, a return to the tab), and is still out when a message lands.
    void refreshSurfaces([today]);
    await settle(2);
    assert.equal(sent.length, 1, "Today's read is out");
    feed.joins[0].onChange({ tenant_id: "id-a" }, "messages", "INSERT");
    await new Promise((r) => setTimeout(r, 10));
    await settle(4);
    assert.equal(sent.length, 2, "REGRESSION: the Inbox's refresh after the message took Today's read from before it");
  } finally {
    stop();
    await release();
  }
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
  const { ROUTE_DRAWS } = await importSrc("apps/dashboard/src/bridge/surface-registry.ts");
  const keys = [
    "conversations",
    "inbox",
    "today",
    "settings",
    "people",
    "leads",
    "reports",
    "reports_headline",
    "reports_reviews",
    "reports_receptionist",
    "reports_people",
    "reports_campaigns",
    "live",
    "broadcasts",
    "playbooks",
    "calendar",
    "notifications",
    "setup",
    "google",
    "billing",
    "reach_out_replies",
    "channels",
    "today_pins",
    "ask_morning",
    "reply_drafts",
  ];
  const draws = ROUTE_DRAWS.today;
  for (const k of ["calendar", "broadcasts", "reports_headline"])
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
        "../surfaces/today/override",
        "../surfaces/inbox/conversations-surface",
        "surfaces/settings",
        "../surfaces/people/surface",
        "../surfaces/campaigns/broadcasts/surface",
        "../surfaces/campaigns/playbooks/surface",
        "../surfaces/calendar/surface",
        "../surfaces/reports/surface",
        "../surfaces/reports/headline",
        "../surfaces/reports/reviews-surface",
        "../surfaces/reports/receptionist-surface",
        "../surfaces/reports/people-surface",
        "../surfaces/reports/campaigns-surface",
        "surfaces/notifications",
        "../surfaces/live/surface",
        "../surfaces/setup/override",
        "../surfaces/leads/override",
        "google",
        "../surfaces/settings/billing/surface",
        // The partner account every pane of Settings draws, the rail's Partner (the Settings load review, 28 Oct 2026).
        "../surfaces/settings/partner/surface",
        "reach-out/replies",
        "../surfaces/channels/surface",
        "../surfaces/today/pins-surface",
        // Ask for you's morning (decision 0070).
        "../surfaces/today/ask-morning-surface",
        // The drafts Ask kept for Need you's rows, read with Today's first reads (decision 0071).
        "../surfaces/today/need-you/drafts-surface",
      ].map((m) => importSrc(`apps/dashboard/src/bridge/${m}.ts`)),
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
  for (const k of [
    ...draws,
    ...ROUTE_DRAWS["reports/reviews"],
    ...ROUTE_DRAWS["reports/receptionist"],
    ...ROUTE_DRAWS["reports/people"],
    ...ROUTE_DRAWS["reports/campaigns"],
    ...ROUTE_DRAWS.reports,
    ...ROUTE_DRAWS["admin/integrations"],
  ])
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

test("the Reviews lens reads its own surface right after Reports' own, ahead of every stranger", async () => {
  // Every lens of Reports draws from the one read of the page; Reviews alone draws a read of its own beside it (surfaces/reports/reviews-surface.ts).
  const reg = await importSrc("apps/dashboard/src/bridge/surface-registry.ts");
  assert.deepEqual(reg.ROUTE_DRAWS["reports/reviews"], ["reports_reviews"]);
  assert.deepEqual(
    reg.routeDrawsFor("reports", "reviews"),
    ["reports_reviews"],
    "asked as the shell asks: page and lens",
  );
  const keys = [
    "conversations",
    "inbox",
    "today",
    "settings",
    "people",
    "leads",
    "reports",
    "reports_reviews",
    "calendar",
  ];
  const { order, overrides } = crowd(keys, { hash: "#/reports/reviews" });
  const stop = startSurfaces(overrides);
  await settle(80);
  stop();
  assert.deepEqual(
    order.slice(0, 2),
    ["reports", "reports_reviews"],
    "its own surface, then the lens's read, before Settings or anyone's list",
  );
  assert.equal(new Set(order).size, keys.length, "and every other surface still boots");
});

test("the Receptionist lens reads its own surface right after Reports' own, ahead of every stranger", async () => {
  // Reviews and the Receptionist each draw a read of their own beside the one of the page (surfaces/reports/receptionist-surface.ts).
  const reg = await importSrc("apps/dashboard/src/bridge/surface-registry.ts");
  assert.deepEqual(reg.ROUTE_DRAWS["reports/receptionist"], ["reports_receptionist"]);
  assert.deepEqual(
    reg.routeDrawsFor("reports", "receptionist"),
    ["reports_receptionist"],
    "asked as the shell asks: page and lens",
  );
  const keys = [
    "conversations",
    "inbox",
    "today",
    "settings",
    "people",
    "leads",
    "reports",
    "reports_reviews",
    "reports_receptionist",
    "calendar",
  ];
  // The Reviews lens's read is in the crowd as a stranger: it comes after the lens's own, with Settings and the rest.
  const { order, overrides } = crowd(keys, { hash: "#/reports/receptionist" });
  const stop = startSurfaces(overrides);
  await settle(80);
  stop();
  assert.deepEqual(
    order.slice(0, 2),
    ["reports", "reports_receptionist"],
    "its own surface, then the lens's read, before Settings or anyone's list",
  );
  assert.equal(new Set(order).size, keys.length, "and every other surface still boots");
});

test("the People lens reads its own surface right after Reports' own, ahead of every stranger", async () => {
  // Reviews, the Receptionist and People each draw a read of their own beside the one of the page (surfaces/reports/people-surface.ts).
  const reg = await importSrc("apps/dashboard/src/bridge/surface-registry.ts");
  assert.deepEqual(reg.ROUTE_DRAWS["reports/people"], ["reports_people"]);
  assert.deepEqual(
    reg.routeDrawsFor("reports", "people"),
    ["reports_people"],
    "asked as the shell asks: page and lens",
  );
  const keys = [
    "conversations",
    "inbox",
    "today",
    "settings",
    "people",
    "leads",
    "reports",
    "reports_reviews",
    "reports_receptionist",
    "reports_people",
    "calendar",
  ];
  // The other lenses' reads are in the crowd as strangers: they come after the lens's own, with Settings and the rest.
  const { order, overrides } = crowd(keys, { hash: "#/reports/people" });
  const stop = startSurfaces(overrides);
  await settle(80);
  stop();
  assert.deepEqual(
    order.slice(0, 2),
    ["reports", "reports_people"],
    "its own surface, then the lens's read, before Settings or anyone's list",
  );
  assert.equal(new Set(order).size, keys.length, "and every other surface still boots");
});

test("the Campaigns lens reads its own surface right after Reports' own, ahead of every stranger; the Overview reads it there too, for one fact, and the Pipeline lens does not", async () => {
  // Reviews, the Receptionist, People and Campaigns each draw a read of their own beside the one of the page (surfaces/reports/campaigns-surface.ts).
  const reg = await importSrc("apps/dashboard/src/bridge/surface-registry.ts");
  assert.deepEqual(reg.ROUTE_DRAWS["reports/campaigns"], ["reports_campaigns"]);
  assert.deepEqual(
    reg.routeDrawsFor("reports", "campaigns"),
    ["reports_campaigns"],
    "asked as the shell asks: page and lens",
  );
  assert.deepEqual(reg.ROUTE_DRAWS.reports, ["reports_campaigns"], "the Overview draws it for one fact");
  assert.deepEqual(reg.routeDrawsFor("reports", null), ["reports_campaigns"], "asked as the shell asks the Overview");
  assert.deepEqual(reg.routeDrawsFor("reports", "pipeline"), [], "the Pipeline draws none of it: its row says so");
  const keys = [
    "conversations",
    "inbox",
    "today",
    "settings",
    "people",
    "leads",
    "reports",
    "reports_reviews",
    "reports_receptionist",
    "reports_people",
    "reports_campaigns",
    "calendar",
  ];
  // The other lenses' reads are in the crowd as strangers: they come after the lens's own, with Settings and the rest.
  for (const hash of ["#/reports/campaigns", "#/reports"]) {
    const { order, overrides } = crowd(keys, { hash });
    const stop = startSurfaces(overrides);
    await settle(80);
    stop();
    assert.deepEqual(
      order.slice(0, 2),
      ["reports", "reports_campaigns"],
      `${hash}: its own surface, then the Campaigns read, before Settings or anyone's list`,
    );
    assert.equal(new Set(order).size, keys.length, `${hash}: and every other surface still boots`);
  }
  // The Pipeline lens draws the report alone: the Campaigns read is a stranger to it, and comes with the rest.
  const { order, overrides } = crowd(keys, { hash: "#/reports/pipeline" });
  const stop = startSurfaces(overrides);
  await settle(80);
  stop();
  assert.equal(order[0], "reports", "the page's own surface first");
  assert.notEqual(order[1], "reports_campaigns", "and the Pipeline's boot does not put the Campaigns read next");
  assert.equal(new Set(order).size, keys.length, "and every other surface still boots");
});

test("Settings' Connections pane reads what it draws right after who is looking, ahead of every stranger: the partner, its channels, Google's, Setup's", async () => {
  // The pane draws Google's listing and its connection (settings/connections/pane.tsx); Today draws its review line from it
  // too, and no other page does (ROUTE_DRAWS). Its WhatsApp and phone rows are the channels read's (surfaces/channels/
  // surface.ts; the wiring's second audit, R6), its Email card Setup's mailboxes, and the rail names Partner from the partner
  // account. It draws none of the settings read, so its gate waits for who is looking alone, and a load's first draw for these
  // (settings/frame/pane-reads.ts): read in the boot's second pass, Setup landed after the pane and moved it (the Settings load
  // review, 28 Oct 2026).
  const reg = await importSrc("apps/dashboard/src/bridge/surface-registry.ts");
  const drawn = ["partner", "channels", "google", "setup"];
  assert.deepEqual(reg.ROUTE_DRAWS["admin/integrations"], drawn);
  assert.deepEqual(reg.routeDrawsFor("admin", "integrations"), drawn, "asked as the shell asks: page and pane");
  assert.equal(reg.routeSurfaceFor("admin", "integrations"), "workspace", "the gate waits for who is looking");
  // Every other pane draws the partner account, and what else it stands on where it stands on more.
  for (const pane of [undefined, null, "workspace", "team", "autonomy", "profile", "activity"])
    assert.deepEqual(reg.routeDrawsFor("admin", pane), ["partner"], String(pane));
  assert.deepEqual(reg.routeDrawsFor("admin", "billing"), ["partner", "billing"]);
  assert.deepEqual(reg.routeDrawsFor("admin", "receptionist"), ["partner", "setup"]);
  const keys = [
    "conversations",
    "inbox",
    "today",
    "people",
    "calendar",
    "reports",
    "settings",
    "partner",
    "setup",
    "google",
    "channels",
  ];
  const { order, overrides } = crowd(keys, { hash: "#/admin/integrations" });
  const stop = startSurfaces(overrides);
  await settle(80);
  stop();
  assert.deepEqual(order.slice(0, 4), drawn, "what it draws, in its order, before anyone else's");
  assert.equal(new Set(order).size, keys.length, "and every other surface still boots");
});

test("a person's page waits only for who is looking, then reads the person, then People: never the whole list first", async () => {
  // Measured on production (23 Sep 2026): a new tab on a person held Reading… until People's 29 rows were in (0.87 s),
  // and only then asked for the person (1.5 s). The page reads its own person (people-detail.ts warmPersonOnScreen);
  // the gate waits for the workspace, which carries the role the page's acts depend on. The person's own read names them
  // in the crumbs, so People's rows come after it (the People load review, 28 Oct 2026: everyone's every page was read
  // ahead of the one person drawn).
  const reg = await importSrc("apps/dashboard/src/bridge/surface-registry.ts");
  const ID = "ed2244f3-9f88-49c5-863e-fbdea4b60e12";
  assert.equal(reg.routeSurfaceFor("clients", ID), "workspace", "the gate waits for who is looking");
  assert.equal(reg.routeSurfaceFor("clients", "c-ana"), "people", "the mockup's seeded people keep the list's gate");
  assert.equal(reg.routeSurfaceFor("clients", null), "people", "People itself waits for its rows");
  assert.equal(reg.routeSurfaceFor("clients", "leads:c-review"), "leads", "and the Leads scope for its own");
  assert.deepEqual(
    reg.routeDrawsFor("clients", ID),
    ["person", "people"],
    "the page's own read, then People for where they stand in the list",
  );
  assert.deepEqual(reg.routeDrawsFor("clients", null), [], "the list draws nothing beside its own surface");
  // Nor does Leads, under any view: never as a person. Its reach-out sheet read Setup's mailboxes and Settings' link next,
  // and went with the composer (the lead-to-sequence canvas, 18 Oct 2026).
  assert.deepEqual(reg.routeDrawsFor("clients", "leads"), []);
  assert.deepEqual(reg.routeDrawsFor("clients", "leads:s-1"), []);
  assert.equal(reg.ROUTE_DRAWS.leads, undefined);
  const keys = ["conversations", "inbox", "today", "settings", "people", "leads", "reports", "workspace", "calendar"];
  const { order, overrides } = crowd(keys, { hash: `#/clients/${ID}` });
  const stop = startSurfaces(overrides);
  await settle(80);
  stop();
  assert.deepEqual(order.slice(0, 2), ["workspace", "people"], "who is looking, then the row that names them");
  assert.equal(new Set(order).size, keys.length, "and every other surface still boots");
});

test("(lane C, D) a cold Calendar reads its campaigns right after its own surface, and People not at all for it: a visit's person comes with the board's own read", async () => {
  // The peek drew the person's deal and standing from People's whole book, read second for it; the board's read carries
  // them now (contracts calendar-person-facts.ts), and what it draws beside its own is the campaigns over its days.
  const { ROUTE_DRAWS } = await importSrc("apps/dashboard/src/bridge/surface-registry.ts");
  assert.deepEqual(ROUTE_DRAWS.calendar, ["calendar_runs"]);
  const keys = [
    "conversations",
    "inbox",
    "today",
    "settings",
    "leads",
    "reports",
    "people",
    "calendar",
    "calendar_runs",
    "billing",
  ];
  const { order, overrides } = crowd(keys, { hash: "#/calendar" });
  const stop = startSurfaces(overrides);
  await settle(80);
  stop();
  assert.deepEqual(
    order.slice(0, 2),
    ["calendar", "calendar_runs"],
    "its own surface, then its campaigns, before anyone else's",
  );
  assert.equal(new Set(order).size, keys.length, "and every other surface still boots");
});

test("Today reads what is left to set up right after its own surface: the card is drawn above the queue", async () => {
  // Read seventh, Setup landed after the queue and the card pushed it down (Ruben, 24 Sep 2026: "does not load
  // properly like the rest of the page").
  const { ROUTE_DRAWS, ROUTE_WAITS } = await importSrc("apps/dashboard/src/bridge/surface-registry.ts");
  assert.equal(ROUTE_DRAWS.today[0], "setup");
  assert.equal(
    ROUTE_WAITS.today[0],
    "setup",
    "and Today's first draw waits for it, first of what stands above its queue",
  );
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

test("REGRESSION (16 Nov 2026): a move asked while the boot is out reads what the page moved to waits for first among what is left", async () => {
  // The order was the first page's: a press to Today a second after the Calendar drew waited for Today's own behind
  // Leads, People and the rest of the Calendar's boot, and Today drew 1.3 to 2.4 s after the press (the phone re-measure).
  const { goToRoute } = await importSrc("apps/dashboard/src/bridge/workspace.ts");
  const keys = [
    "conversations",
    "inbox",
    "leads",
    "people",
    "reports",
    "settings",
    "calendar",
    "today",
    "setup",
    "broadcasts",
    "notifications",
  ];
  const { order, overrides } = crowd(keys, { hash: "#/calendar" });
  win.history = { pushState() {}, replaceState() {} };
  let landed = () => {};
  bootWaitsFor(
    new Promise((r) => {
      landed = r;
    }),
  );
  try {
    const stop = startSurfaces(overrides);
    await until(() => order.length > 0, "the Calendar's own asked");
    assert.deepEqual(order, ["calendar"], "the Calendar's own, and nobody else's while its read is out");
    goToRoute("today", {}, win);
    landed();
    await until(() => new Set(order).size === keys.length, "every surface asked");
    stop();
    assert.deepEqual(
      order.slice(1, 5),
      ["today", "setup", "broadcasts", "notifications"],
      "Today's own surface and what its first draw waits for, ahead of the Calendar's strangers",
    );
    assert.equal(new Set(order).size, keys.length, "and every other surface still boots, once");
  } finally {
    delete win.history;
  }
});

test("a page read that never lands holds the rest for the route's wait at most, and only this boot's", async () => {
  const ID = "ed2244f3-9f88-49c5-863e-fbdea4b60e12";
  const keys = ["settings", "people", "workspace"];
  bridgeHolds({ parts: { routeWaitMs: 150 } });
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
    bridgeHolds({ parts: { routeWaitMs: undefined } });
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
  bridgeHolds({ who: { activeWorkspaceId: "id-a" } });
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
  bridgeHolds({ who: { activeWorkspaceId: "id-a" } });
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
      // The phone app's word that this page's tab is in front or behind (hearing/front.ts).
      "window +chanly:front",
      'connection {"offline":true,"realtimeDown":false}',
      "window +offline",
      "window +online",
    ]);
    await until(() => joins.length === 1, "the feed is joined once the boot is in");
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
      "window -chanly:front",
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
  bridgeHolds({ who: { activeWorkspaceId: "id-a" } });
  const m = new Map();
  const keptLocal = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
  // Cached at this address (its slot in local storage), and resolved then for another workspace than the server says now.
  const cachedFor = (tenant) =>
    m.set(
      "chanlytics.surfaces.v2:acme",
      JSON.stringify({
        build: process.env.NEXT_PUBLIC_BUILD_SHA || "dev",
        savedAt: Date.now(),
        at: "acme",
        tenant,
        surfaces: {},
      }),
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
    globalThis.localStorage = keptLocal;
  }
});

/*
 * The page first (the plan "Pages that open at once", piece 3). The rest of the boot waited for the page on screen's own
 * reads, not for the page itself: on a first open its code was still loading, and People and Campaigns began about twenty
 * reads for other pages before they drew (the phone sweep of 22 Nov 2026; the field data from 23 Nov: Campaigns 13 a load,
 * up to 24, and 5.3 s). Now the rest also wait for the frame to say the page is drawn (hearing/page-waits.ts drawComing, pageDrawn).
 */
test("the rest of the boot waits for the page on screen to be drawn, not only for its reads: the frame's word lets them go", async () => {
  const { bootComing, afterBoot } = await importSrc("apps/dashboard/src/bridge/workspace.ts");
  const keys = ["settings", "inbox", "people", "reports", "workspace", "calendar"];
  const { order, overrides } = crowd(keys, { hash: "#/calendar" });
  // As the frame's boot says both first (bridge/boot/installs.ts, run at FrameApp's module scope), before anything reads ahead.
  bootComing();
  drawComing();
  let read = false;
  void afterBoot("page").then(() => (read = true));
  const stop = startSurfaces(overrides);
  try {
    await until(() => order.includes("calendar"), "the Calendar's own asked");
    await settle(20);
    assert.deepEqual(
      order,
      ["workspace", "calendar"],
      "its reads are in, and nobody else's is asked: it has not drawn",
    );
    assert.equal(read, false, "and nothing read ahead for a press (afterBoot('page')) goes before the draw either");
    pageDrawn();
    await until(() => new Set(order).size === keys.length, "the rest asked once it drew");
    assert.equal(read, true);
  } finally {
    pageDrawn();
    stop();
  }
});

test("a page that never says it drew holds the rest for the route's wait at most", async () => {
  const keys = ["settings", "people", "workspace", "calendar"];
  bridgeHolds({ parts: { routeWaitMs: 120 } });
  const { order, overrides } = crowd(keys, { hash: "#/calendar" });
  drawComing();
  const stop = startSurfaces(overrides);
  try {
    // Nothing says the page drew: only the route's wait lets the rest go (the test above holds them before it).
    await until(() => new Set(order).size === keys.length, "the wait ran out; the shell has its rest");
  } finally {
    bridgeHolds({ parts: { routeWaitMs: undefined } });
    pageDrawn();
    stop();
  }
});

test("with the switch off (NEXT_PUBLIC_PAGE_FIRST=off) the rest go once the page's reads are in, as before", async () => {
  const keys = ["settings", "people", "workspace", "calendar"];
  process.env.NEXT_PUBLIC_PAGE_FIRST = "off";
  const { order, overrides } = crowd(keys, { hash: "#/calendar" });
  drawComing();
  const stop = startSurfaces(overrides);
  try {
    await until(() => new Set(order).size === keys.length, "every surface asked with no word of a draw");
  } finally {
    delete process.env.NEXT_PUBLIC_PAGE_FIRST;
    pageDrawn();
    stop();
  }
});

test("what the live feed says while the rest of the boot is out is read once the page on screen is in, not once the rest are", async () => {
  // The rest now go later (after the draw): held until they were all in, a message would show later than it did.
  win.location.pathname = "/w/acme";
  win.location.hash = "#/inbox";
  bridgeHolds({ who: { activeWorkspaceId: "id-a" } });
  const asked = [];
  let finishStranger = () => {};
  const surfaces = [
    { key: "workspace", apply: async () => void asked.push("workspace") },
    { key: "inbox", refreshOnMessageInserts: true, debounceMs: 1, apply: async () => void asked.push("inbox") },
    {
      key: "reports",
      apply: () => {
        asked.push("reports");
        return new Promise((r) => (finishStranger = r));
      },
    },
  ];
  drawComing();
  const feed = liveFeed();
  const stop = startSurfaces(surfaces, feed.join);
  try {
    await until(() => asked.includes("inbox") && feed.joins.length === 1, "the Inbox's own read, and the feed joined");
    pageDrawn();
    await until(() => asked.includes("reports"), "a stranger's read is out");
    feed.joins[0].onChange({ tenant_id: "id-a" }, "messages", "INSERT");
    await until(
      () => asked.filter((k) => k === "inbox").length === 2,
      "the Inbox read again while the stranger's read is still out",
    );
  } finally {
    finishStranger();
    pageDrawn();
    stop();
  }
});

/** GET open/rest as the server answers it (server/workspace/page-open.ts): a line for each read asked but those `without`, then what it came to. */
const restAnswer = (url, without = []) => {
  const asked = new URL(url, "http://x").searchParams.get("reads").split(",").map(decodeURIComponent);
  const lines = asked
    .filter((k) => !without.includes(k.split("?")[0]))
    .map((k) => JSON.stringify({ k, s: 200, b: { ok: true, data: { from: "rest", k } } }));
  return new Response(`${[...lines, JSON.stringify({ o: { ms: 1, db_ms: 0, db_n: 0 } })].join("\n")}\n`, {
    status: 200,
    headers: { "content-type": "application/x-ndjson; charset=utf-8" },
  });
};

test("the pages not on screen ask their first reads as one request, each answered from its line, and the rest alone", async () => {
  // "Pages that open at once", piece 8: the boot asked each in a request of its own, 36 a load (23 Nov 2026).
  win.location.pathname = "/w/acme";
  win.location.hash = "";
  bridgeHolds({ who: { activeWorkspaceId: "id-a" } });
  const sent = [];
  win.fetch = async (url) => {
    sent.push(url);
    if (url.startsWith("/api/v1/open/rest")) return restAnswer(url, ["leads"]);
    return new Response(JSON.stringify({ ok: true, data: { from: "alone" } }), { status: 200 });
  };
  const got = {};
  const reading = (key, route) => ({ key, apply: async () => void (got[key] = await read(route)) });
  const surfaces = [
    { key: "workspace", apply: async () => {} },
    reading("inbox", "GET conversations"),
    reading("campaigns", "GET conversations"),
    reading("reports", "GET reach-outs"),
    reading("leads", "GET leads"),
    reading("settings", "GET activity"),
  ];
  const stop = startSurfaces(surfaces);
  try {
    pageDrawn();
    await until(() => Object.keys(got).length === 5, "every page not on screen answered");
  } finally {
    stop();
  }
  const together = sent.filter((u) => u.startsWith("/api/v1/open/rest"));
  assert.equal(together.length, 1, "one request for all of them");
  const asked = new URL(together[0], "http://x").searchParams.get("reads").split(",").map(decodeURIComponent);
  assert.deepEqual(
    asked.map((k) => k.split("?")[0]).sort(),
    ["conversations", "leads", "reach-outs"],
    "the reads it carries, the one two pages ask for once",
  );
  assert.equal(new URL(together[0], "http://x").searchParams.get("workspace"), "acme", "on the workspace on screen");
  assert.deepEqual(
    [got.inbox.from, got.campaigns.from, got.reports.from],
    ["rest", "rest", "rest"],
    "each answered from its own line",
  );
  assert.ok(!sent.some((u) => u.startsWith("/api/v1/conversations")), "none of those asked again alone");
  assert.equal(got.leads.from, "alone", "a read the answer had no line for is asked alone");
  assert.equal(got.settings.from, "alone", "and one it does not carry goes alone, as before");
});

test("a rest refused whole leaves no page without its read: each is asked alone", async () => {
  win.location.pathname = "/w/acme";
  win.location.hash = "";
  bridgeHolds({ who: { activeWorkspaceId: "id-a" } });
  const sent = [];
  win.fetch = async (url) => {
    sent.push(url);
    if (url.startsWith("/api/v1/open/rest")) return new Response("{}", { status: 500 });
    return new Response(JSON.stringify({ ok: true, data: { from: "alone" } }), { status: 200 });
  };
  const got = {};
  const surfaces = [
    { key: "workspace", apply: async () => {} },
    { key: "inbox", apply: async () => void (got.inbox = await read("GET conversations")) },
    { key: "reports", apply: async () => void (got.reports = await read("GET reach-outs")) },
  ];
  const stop = startSurfaces(surfaces);
  try {
    pageDrawn();
    await until(() => got.inbox && got.reports, "both answered");
  } finally {
    stop();
  }
  assert.deepEqual([got.inbox.from, got.reports.from], ["alone", "alone"]);
  assert.equal(sent.filter((u) => u.startsWith("/api/v1/open/rest")).length, 1, "the rest asked once, not again");
});

/** A client over `fetch` whose gathered reads go as one GET open/rest, as the tab's does (bridge/api.ts). */
const gatheringClient = (fetch) => {
  const rest = restReads(fetch);
  const client = createApi({
    fetch,
    together: rest,
    workspace: () => "acme",
    onSignedOut() {},
    refresh: async () => {},
  });
  return { rest, client };
};
const alone = () => new Response(JSON.stringify({ ok: true, data: { from: "alone" } }), { status: 200 });

test("a read that fails inside the rest is that read's own refusal: its code, its status, and when it may try again", async () => {
  const refused = { ok: false, error: { code: "rate_limited", message: "Too many at once." } };
  const sent = [];
  const fetch = async (url) => {
    sent.push(url);
    if (!url.startsWith("/api/v1/open/rest")) return alone();
    const line = { k: "conversations", s: 429, b: refused, h: { "retry-after": "30" } };
    return new Response(`${JSON.stringify(line)}\n`, { status: 200 });
  };
  const { client } = gatheringClient(fetch);
  const [answer] = await Promise.all(client.gather(() => [client("GET conversations")]));
  assert.deepEqual([answer.ok, answer.status, answer.code, answer.retryAfterS], [false, 429, "rate_limited", 30]);
  assert.equal(sent.length, 1, "as its own request would have said it, and not asked again alone");
});

test("a read asked twice while the rest gathers is asked once with it and once alone: neither waits for ever", async () => {
  // A write landing between the two lets go of the first (forget), so the second is not shared with it: one request
  // cannot carry two answers to one key.
  const sent = [];
  const fetch = async (url) => {
    sent.push(url);
    return url.startsWith("/api/v1/open/rest") ? restAnswer(url) : alone();
  };
  const { client } = gatheringClient(fetch);
  const both = client.gather(() => {
    const first = client("GET conversations");
    client.forget();
    return [first, client("GET conversations")];
  });
  const [first, second] = await Promise.all(both);
  assert.deepEqual([first.data.from, second.data.from], ["rest", "alone"]);
  assert.equal(sent.filter((u) => u.startsWith("/api/v1/open/rest")).length, 1);
});

test("a move while the rest is out asks the page it moved to for its own reads alone, and lets their lines go", async () => {
  // Sent as the boot asked them, the page moved to waited its turn among every other page's reads.
  let answerRest = () => {};
  const sent = [];
  const fetch = async (url) => {
    sent.push(url);
    if (!url.startsWith("/api/v1/open/rest")) return alone();
    return new Promise((r) => {
      answerRest = () => r(restAnswer(url));
    });
  };
  const { rest, client } = gatheringClient(fetch);
  const reads = client.gather(() => [client("GET calendar"), client("GET reach-outs")]);
  await until(() => sent.length === 1, "the rest asked");
  rest.hurry(["calendar"]);
  const [calendar] = await Promise.all([reads[0]]);
  assert.equal(calendar.data.from, "alone", "the page moved to has its read now, its own request's");
  answerRest();
  const [, reachOuts] = await Promise.all(reads);
  assert.equal(reachOuts.data.from, "rest", "and the rest still answers the others");
  assert.deepEqual(
    sent.map((u) => u.split("?")[0]),
    ["/api/v1/open/rest", "/api/v1/calendar"],
  );
});
