/**
 * The pages that draw channels, billing, rules and you hear them (docs/decisions/0047, task 1.2 of the wiring plan; NS-1, S1-17, S1-18,
 * F8e, F5a, F5c, OW4, OW7).
 *
 * `tenant_channels`, `lines` and `billing_accounts` are on the live feed (Setup and Connections have heard them since 00117), and the
 * pages that speak of a line or of the workspace's pause did not: Today's chips and its red band come from one metrics read nothing
 * re-read for a channel or a status, Live draws the line's number and switch from the channels, and Campaigns' composers word Send by
 * and Send from the channels and the pause. And two writes left a page behind in their own tab: a mode saved on Autonomy (Campaigns'
 * Resume question says "It sends on its own" for a class that is Auto, from the modes the playbooks read held) was announced twice where
 * it was made and told nothing of the composers, and a new name left the Team list on the old one.
 *
 * Run on the real overrides' rules, the real refresh map, and the real verbs over a wire that answers the reads they make.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";

globalThis.window ??= globalThis;
globalThis.location ??= { pathname: "/w/studio", hash: "#/today" };
globalThis.document ??= { visibilityState: "hidden", addEventListener() {}, removeEventListener() {} };
globalThis.window.addEventListener ??= () => {};
globalThis.window.removeEventListener ??= () => {};
/** Every event the window was told, in order. */
const told = [];
globalThis.window.dispatchEvent = (e) => {
  told.push(e.type);
  return true;
};
globalThis.CustomEvent ??= class CustomEvent {
  constructor(type, init) {
    this.type = type;
    this.detail = init?.detail;
  }
};
Object.assign(globalThis, {
  __WORKSPACES: [{ id: "t1", slug: "studio", name: "Studio", status: "active", timezone: "America/New_York" }],
  __ACTIVE_WORKSPACE: "t1",
});

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
/** What the wire answers, by `METHOD route`; and every request made. */
let answers = {};
const wire = [];
globalThis.window.fetch = async (url, init = {}) => {
  const u = new URL(String(url), "https://app.chanlytics.com");
  const route = `${init.method ?? "GET"} ${u.pathname.replace("/api/v1/", "")}`;
  wire.push(route);
  const answer = answers[route];
  return answer
    ? json(200, { ok: true, data: typeof answer === "function" ? answer() : answer })
    : json(404, { ok: false, error: { code: "not_found", message: "no" } });
};

const { startSurfaces } = await importSrc("apps/dashboard/src/legacy-bridge/surface-runner.ts");
const { AFTER, REFRESHES_NOTHING } = await importSrc("apps/dashboard/src/legacy-bridge/refresh-map.ts");
const { wantsRefresh } = await importSrc("apps/dashboard/src/legacy-bridge/surface-realtime.ts");
const { readWhatWasMissed } = await importSrc("apps/dashboard/src/legacy-bridge/surface-registry.ts");
const { watchedTables } = await importSrc("packages/db/src/realtime.ts");
const { setPolicy } = await importSrc("apps/dashboard/src/legacy-bridge/inbox-verbs.ts");
const { meVerbs } = await importSrc("apps/dashboard/src/legacy-bridge/identity.ts");
const { workspaceOverride } = await importSrc("apps/dashboard/src/legacy-bridge/surface-data.ts");
const { settingsOverride } = await importSrc("apps/dashboard/src/legacy-bridge/surfaces/settings.ts");
const { todayOverride } = await importSrc("apps/dashboard/src/surfaces/today/surface.ts");
const { liveOverride } = await importSrc("apps/dashboard/src/surfaces/live/surface.ts");
const { peopleOverride } = await importSrc("apps/dashboard/src/surfaces/people/surface.ts");
const { playbooksOverride } = await importSrc("apps/dashboard/src/surfaces/campaigns/playbooks/surface.ts");
const { broadcastsOverride } = await importSrc("apps/dashboard/src/surfaces/campaigns/broadcasts/surface.ts");
const { reviewsOverride } = await importSrc("apps/dashboard/src/surfaces/reports/reviews-surface.ts");
const { DEFAULT_REFRESH_TABLES } = await importSrc("apps/dashboard/src/legacy-bridge/surface-realtime.ts");

const keysOf = (route) => AFTER[route]().map((o) => o.key);
const at = (hash) => {
  globalThis.location.hash = hash;
};
const change = (table, event = "UPDATE") => ({ table, event, row: {} });
const flush = async () => {
  for (let i = 0; i < 12; i += 1) {
    for (let j = 0; j < 20; j += 1) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
};

/** The line, the channel and the workspace's status: three tables the feed already tells of. */
const LINE_TABLES = ["tenant_channels", "lines", "billing_accounts"];

test("the tables are on the live feed already: nothing here needs a migration", () => {
  for (const table of LINE_TABLES) assert.ok(watchedTables().includes(table), `${table} is told to a workspace`);
});

test("Today hears the channel, the line and the billing account its chips and its red bands are drawn from", () => {
  // The WhatsApp, text, voice and email chips, 'WhatsApp is disconnected: messages coming in are not being answered' and 'This workspace
  // is paused' come from one metrics read, which Today read again for a message, a hold, a call or a lead round and never for these.
  assert.deepEqual(todayOverride.refreshOnTables, [
    ...DEFAULT_REFRESH_TABLES,
    "calls",
    "lead_rounds",
    "tenant_channels",
    "lines",
    "mailboxes", // the email chip, drawn where a mailbox exists (the wiring's second audit)
    "billing_accounts",
    "contacts", // the person each row of the queue names (the-pages-hear-the-silent-records)
  ]);
  for (const table of LINE_TABLES) {
    assert.equal(wantsRefresh(todayOverride, table), true, `${table} is wanted`);
    for (const event of ["INSERT", "UPDATE", "DELETE"])
      assert.equal(wantsRefresh(todayOverride, table, change(table, event)), true, `${table} ${event} is heard`);
  }
  // And the rule it had: a transcript turn of a call in progress is no news.
  const turn = { table: "calls", event: "UPDATE", row: { status: "ongoing" } };
  assert.equal(wantsRefresh(todayOverride, "calls", turn), false);
});

test("Live hears the calls, and the line's number and switch are the channels read's, which hears them wherever the tab is (R6)", async () => {
  const { channelsOverride } = await importSrc("apps/dashboard/src/surfaces/channels/surface.ts");
  assert.deepEqual(liveOverride.refreshOnTables, ["calls"]);
  assert.equal(liveOverride.debounceMs, 300, "and waits as it did");
  // The line's row is heard by the one read of the channels, which Live follows (live/surface.ts followChannels).
  assert.deepEqual(channelsOverride.refreshOnTables, ["tenant_channels"]);
  assert.equal(channelsOverride.fresh, "live", "on every page: Today's strip and Connections draw it too");
  assert.equal(wantsRefresh(channelsOverride, "tenant_channels", change("tenant_channels")), true);
  // A line saga's step or the workspace's status is no part of the phone line right now.
  for (const table of ["lines", "billing_accounts", "tenant_channels"])
    assert.equal(wantsRefresh(liveOverride, table), false, table);
});

test("the composers hear the channel, the line and the billing account on their own page, and read what they missed as it comes on screen", () => {
  for (const [o, home, away] of [
    [playbooksOverride, "#/outbound", "#/inbox"],
    // Campaigns' composer hears the channels for Sent's runs too (who can hear you, Send by): away is the Inbox.
    [broadcastsOverride, "#/broadcasts", "#/inbox"],
  ]) {
    for (const table of LINE_TABLES) {
      assert.ok(o.refreshOnTables.includes(table), `${o.key} names ${table}`);
      at(home);
      for (const event of ["INSERT", "UPDATE", "DELETE"])
        assert.equal(wantsRefresh(o, table, change(table, event)), true, `${o.key}: ${table} ${event} on ${home}`);
      at(away);
      assert.equal(wantsRefresh(o, table, change(table)), false, `${o.key}: ${table} is kept for its page on ${away}`);
    }
    // The tables it heard before are heard as they were: the runs always, a message on its page.
    at(away);
    assert.equal(
      wantsRefresh(o, "sequence_batches", change("sequence_batches")),
      true,
      `${o.key}: a run, wherever the tab is`,
    );
    assert.equal(wantsRefresh(o, "messages", change("messages", "INSERT")), false);
  }
  at("#/today");
  // A change passed over on another page is read once when the composer's page comes on screen.
  const win = {
    location: globalThis.location,
    addEventListener(_t, fn) {
      this.on = fn;
    },
    removeEventListener() {},
  };
  const read = [];
  at("#/inbox");
  const stop = readWhatWasMissed([playbooksOverride, broadcastsOverride], (k) => read.push(...k), win);
  try {
    wantsRefresh(playbooksOverride, "billing_accounts", change("billing_accounts"));
    wantsRefresh(broadcastsOverride, "tenant_channels", change("tenant_channels"));
    assert.deepEqual(read, [], "nothing is read from the Inbox");
    at("#/campaigns/new");
    win.on?.();
    assert.deepEqual(
      read,
      ["broadcasts"],
      "Campaigns' composer reads Sent's runs it draws once (who can hear you); its playbook composer went (the closed-loop audit of 17 Oct 2026, G)",
    );
    at("#/broadcasts");
    win.on?.();
    assert.deepEqual(read, ["broadcasts"], "and Sent owes nothing more: it was read");
    at("#/outbound");
    win.on?.();
    assert.deepEqual(read, ["broadcasts", "playbooks"], "the playbooks once, on their own page");
  } finally {
    stop();
    at("#/today");
  }
});

test("a mode saved reads the rules' own read, and what the page on screen draws of the rest; each of the rest is left for the pages that draw it, never read for a page nobody has open (W-review-facts-rules-9, S10-6)", () => {
  // Resume asks 'It sends on its own: nothing will wait for your approval' when the class is Auto, from the modes the playbooks read held;
  // People's follow-up column says the mode, and the Reviews lens whether a review's composer asks for a draft.
  const win = {
    location: globalThis.location,
    addEventListener(_t, fn) {
      this.on = fn;
    },
    removeEventListener() {},
  };
  const owedOn = (hash, overrides = [playbooksOverride, broadcastsOverride]) => {
    const read = [];
    at("#/__nowhere");
    const stop = readWhatWasMissed(overrides, (k) => read.push(...k), win);
    try {
      at(hash);
      win.on?.();
    } finally {
      stop();
    }
    return read;
  };
  const settle = () => {
    owedOn("#/campaigns/new");
    owedOn("#/broadcasts");
    owedOn("#/outbound");
    owedOn("#/clients", [peopleOverride]);
  };
  // Nothing is owed from before.
  settle();

  at("#/admin/autonomy");
  assert.deepEqual(
    keysOf("PUT policies"),
    ["settings"],
    "on Autonomy, where a mode is saved, the rules' own read alone",
  );
  assert.deepEqual(
    owedOn("#/campaigns/new"),
    ["broadcasts"],
    "Sent's runs are read as Campaigns' composer comes on screen: the runs it draws hear the rules there",
  );
  assert.deepEqual(owedOn("#/broadcasts"), ["playbooks"], "and Sent the playbooks, which name its runs' campaigns");
  assert.deepEqual(owedOn("#/outbound"), [], "and their own page owes nothing more");
  assert.deepEqual(
    owedOn("#/clients", [peopleOverride]),
    ["people"],
    "People's follow-up column, as People comes on screen",
  );
  settle();

  at("#/inbox");
  assert.deepEqual(
    keysOf("PUT policies"),
    ["settings", "broadcasts"],
    "from the Inbox, the runs waiting for your word it draws beside the rules' own read",
  );
  assert.deepEqual(owedOn("#/campaigns/new"), [], "Campaigns' composer owes nothing: Sent's runs were read");
  assert.deepEqual(owedOn("#/outbound"), ["playbooks"], "the playbooks as their own page comes on screen");
  settle();

  at("#/campaigns/new");
  assert.deepEqual(
    keysOf("PUT policies"),
    ["settings", "broadcasts"],
    "on Campaigns' composer Sent's runs are read at once",
  );
  assert.deepEqual(
    owedOn("#/broadcasts"),
    ["playbooks"],
    "Sent owes the playbooks alone, which name its runs' campaigns: its runs were read in the composer",
  );
  assert.deepEqual(owedOn("#/outbound"), [], "and their own page owes nothing more");
  settle();

  at("#/broadcasts");
  assert.deepEqual(
    keysOf("PUT policies"),
    ["settings", "playbooks", "broadcasts"],
    "Sent draws a run's playbook beside its runs",
  );
  at("#/campaigns");
  assert.deepEqual(keysOf("PUT policies"), ["settings"], "Campaigns' landing, Sequences' list, draws neither composer");
  at("#/outbound");
  assert.deepEqual(keysOf("PUT policies"), ["settings", "playbooks"], "Campaigns' old address is the playbooks' too");
  at("#/clients");
  assert.deepEqual(keysOf("PUT policies"), ["settings", "people"], "People's follow-up column, on People");
  at("#/reports/reviews");
  assert.deepEqual(keysOf("PUT policies"), ["settings", "reports_reviews"], "the reply mode, on the Reviews lens");
  settle();
  at("#/today");
});

test("a mode saved announces policy:changed once in the tab that saved it: the settings read that lands the modes says it, the verb does not say it again", async (t) => {
  const stop = startSurfaces([{ key: "nothing-in-particular", apply: async () => {} }], () => () => {});
  try {
    await flush();
    t.mock.method(peopleOverride, "apply", async () => {});
    t.mock.method(reviewsOverride, "apply", async () => {});
    answers = {
      "PUT policies": { policy: { class: "reengage", mode: "auto" } },
      "GET settings": { config: { brain: {} }, version: 1 },
      "GET team": { members: [], invites: [] },
      "GET policies": { policies: [{ class: "reengage", mode: "auto", limits: {} }], role: "owner" },
      "GET channels": { channels: [] },
      "GET templates": { templates: [], usedBy: {} },
    };
    at("#/inbox");
    told.length = 0;
    const r = await setPolicy("reengage", "auto");
    assert.equal(r.ok, true);
    assert.ok(wire.includes("GET policies"), "the settings read that lands the modes was made");
    assert.equal(
      told.filter((type) => type === "policy:changed").length,
      1,
      "REGRESSION: the chips beside approvals and the Inbox's agent rail redrew twice for one save",
    );
  } finally {
    stop();
  }
});

test("naming yourself is a write the workspace and the Team list are re-read after, not a patch of the sidebar alone", async (t) => {
  assert.deepEqual(keysOf("PUT me"), ["workspace", "settings"], "the roster the Team pane lists, and who is looking");
  assert.equal("PUT me" in REFRESHES_NOTHING, false, "and it is no longer a write that moves nothing");

  const stop = startSurfaces([{ key: "nothing-in-particular", apply: async () => {} }], () => () => {});
  try {
    await flush();
    const settingsRead = [];
    t.mock.method(settingsOverride, "apply", async () => void settingsRead.push("settings"));
    answers = {
      "PUT me": { display_name: "Dana Ortiz" },
      "GET workspaces": {
        workspaces: [{ id: "t1", slug: "studio", name: "Studio", status: "active", timezone: "America/New_York" }],
        activeWorkspaceId: "t1",
        user: { id: "u1", email: "dana@example.com", role: "owner", display_name: "Dana Ortiz" },
      },
    };
    globalThis.__ME = { id: "u1", email: "dana@example.com", role: "owner", display_name: "Dana" };
    told.length = 0;
    const r = await meVerbs.setName("Dana Ortiz");
    assert.deepEqual([r.ok, r.name], [true, "Dana Ortiz"]);
    assert.equal(
      globalThis.__ME.display_name,
      "Dana Ortiz",
      "who is looking is the workspace read's, landed before the save is over",
    );
    assert.deepEqual(settingsRead, ["settings"], "and the Team list's roster is read again beside it");
    assert.equal(told.filter((type) => type === "surface:workspace").length, 1, "the sidebar redraws from that read");
    assert.equal(told.includes("me:changed"), false, "and is not told a second time by a patch of its own");
    assert.ok(wire.includes("GET workspaces"));
  } finally {
    stop();
    delete globalThis.__ME;
  }
});

test("the workspace read the save lands is the one that is the app's own: the surface is the workspace override", () => {
  assert.equal(AFTER["PUT me"]()[0], workspaceOverride);
  assert.equal(AFTER["PUT me"]()[1], settingsOverride);
});

after(() => {
  at("#/today");
});
