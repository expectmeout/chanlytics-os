/**
 * The templates are read once (docs/decisions/0047, task 3.3 of the wiring plan; OW2).
 *
 * GET templates was read by four surfaces with three lifetimes: the settings read (every template, for Settings and the Library), the
 * broadcasts and the playbooks (the approved ones, for their composers) and the Inbox (the approved ones, kept for five minutes, which
 * the New conversation sheet borrowed). A template written in this tab reached them by three routes (the refresh map, a table of
 * window hooks, and a function the map's own builder called), and one Meta approved arrived by none: for minutes the Library could
 * say a template was approved while the Inbox's reply box did not offer it, or the reverse for one that was blocked, whose send
 * then failed at the wire.
 *
 * The settings read is the one read now, and everything that offers a message is made of what it publishes (surfaces/
 * offered-templates.ts): the Inbox's reply box and the New conversation sheet, Sent's composer, Playbooks' composer and Campaigns'
 * home. The feed tells the settings read of a template's change in every tab at once (WATCHED templates), a write made here re-reads
 * it alone, and the pages follow its publication with no read of their own. Run on the real surfaces over a wire that records every
 * request, the real runner's seam (surface-values.ts), and the real refresh map.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { campaignMessagesOf, templateOffered } from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";

globalThis.window ??= globalThis;
globalThis.location ??= { pathname: "/w/a", hash: "#/today" };
globalThis.location.pathname = "/w/a";
globalThis.document ??= { visibilityState: "hidden", addEventListener() {}, removeEventListener() {} };
globalThis.window.dispatchEvent ??= () => true;
globalThis.window.addEventListener ??= () => {};
globalThis.window.removeEventListener ??= () => {};
globalThis.CustomEvent ??= class CustomEvent {
  constructor(type, init) {
    this.type = type;
    this.detail = init?.detail;
  }
};
Object.assign(globalThis, {
  __WORKSPACES: [{ id: "t1", slug: "a", name: "A", status: "active", timezone: "America/New_York" }],
  __ACTIVE_WORKSPACE: "t1",
});

const json = (status, body) =>
  new Response(JSON.stringify({ ...body }), { status, headers: { "content-type": "application/json" } });
/** What the wire answers by route, and every request it was asked for (the route, and the `all` the templates read names). */
let answers = {};
const asked = [];
globalThis.window.fetch = async (url) => {
  const u = new URL(String(url), "https://app.chanlytics.com");
  const route = u.pathname.replace("/api/v1/", "");
  asked.push({ route, all: u.searchParams.get("all") });
  const answer = answers[route];
  return answer
    ? json(200, { ok: true, data: typeof answer === "function" ? answer() : answer })
    : json(404, { ok: false, error: { code: "not_found", message: `no ${route}` } });
};
const askedFor = (route) => asked.filter((a) => a.route === route);

const offered = await importSrc("apps/dashboard/src/surfaces/offered-templates.ts");
const { setSurfaceValue, surfaceValue } = await importSrc("apps/dashboard/src/surfaces/surface-values.ts");
const { onSurfaceMoved } = await importSrc("apps/dashboard/src/legacy-bridge/surface-status.ts");
const refreshMap = await importSrc("apps/dashboard/src/legacy-bridge/refresh-map.ts");
const { settingsOverride } = await importSrc("apps/dashboard/src/legacy-bridge/surfaces/settings.ts");
const { inboxOverride } = await importSrc("apps/dashboard/src/surfaces/inbox/surface.ts");
const { broadcastsOverride } = await importSrc("apps/dashboard/src/surfaces/campaigns/broadcasts/surface.ts");
const { playbooksOverride } = await importSrc("apps/dashboard/src/surfaces/campaigns/playbooks/surface.ts");
const { installBroadcasts } = await importSrc("apps/dashboard/src/surfaces/campaigns/broadcasts/verbs.ts");
const { installPlaybooks } = await importSrc("apps/dashboard/src/surfaces/campaigns/playbooks/verbs.ts");

/** One version of a message, as the templates read returns its row. */
const row = (name, channel = "whatsapp", over = {}) => ({
  id: `t-${name}-${channel}`,
  channel,
  name,
  language: "en_US",
  meta_status: "approved",
  category: "utility",
  hidden_at: null,
  title: null,
  blocked: null,
  variables: [],
  header: channel === "email" ? `Subject of ${name}` : null,
  body_preview: `Words of ${name} on ${channel}`,
  ...over,
});
/** What the settings surface publishes of the templates (legacy-bridge/surfaces/settings.ts): WhatsApp's rows, the other channels' versions, the messages. */
const settingsOf = (rows, over = {}) => ({
  templatesAll: rows.filter((r) => r.channel === "whatsapp"),
  templateVersions: rows.filter((r) => r.channel !== "whatsapp"),
  messages: campaignMessagesOf(rows),
  ...over,
});
const names = (list) => list?.map((t) => t.name);

after(() => {
  for (const key of ["settings", "inbox", "broadcasts", "playbooks"]) setSurfaceValue(key, undefined);
});

test("the rows a picker may offer are judged by the one rule, and every answer is one of three: still reading, could not read, or what it holds", () => {
  const rows = [
    row("welcome"),
    row("in_review", "whatsapp", { meta_status: "pending" }),
    row("put_away", "whatsapp", { hidden_at: "2026-10-01T00:00:00Z" }),
    row("refused", "whatsapp", { meta_status: "rejected" }),
    row("hours_note", "email"),
  ];
  const settings = settingsOf(rows);
  assert.deepEqual(names(offered.offeredWhatsApp(settings)), ["welcome"], "WhatsApp's approved, shown messages");
  assert.deepEqual(
    names(offered.offeredRows(settings)),
    ["welcome", "hours_note"],
    "and the versions on the other channels",
  );
  assert.deepEqual(
    offered.heldBackOf(settings),
    { pending: 1, rejected: 1, paused: 0, disabled: 0, hidden: 1 },
    "the rest are counted by why, for an empty picker to say it",
  );
  // The rule is contracts', the same one the templates reader keeps its composers' rows by.
  for (const r of rows)
    assert.equal(offered.offeredRows(settings).includes(r), templateOffered(r), `${r.name}: ${r.meta_status}`);
  // Still reading (Settings has not landed), or could not read (its templates read failed): never 'none approved'.
  for (const read of [offered.offeredWhatsApp, offered.offeredRows, offered.heldBackOf, offered.callTextOf]) {
    assert.equal(read(undefined), undefined);
    assert.equal(read({ templatesAll: null, templateVersions: null }), null);
  }
  assert.deepEqual(offered.offeredWhatsApp({ templatesAll: [] }), [], "none approved is an answer of its own");
  // A value kept from before the versions were carried reads as having none.
  assert.deepEqual(names(offered.offeredRows({ templatesAll: [row("welcome")] })), ["welcome"]);
});

test("the call's text is found among every WhatsApp row, a hidden one too, as the edge texts it", () => {
  const call = row("call_text", "whatsapp", { hidden_at: "2026-10-01T00:00:00Z" });
  assert.deepEqual(names(offered.callTextOf(settingsOf([call, row("welcome")]))), ["call_text"]);
  assert.deepEqual(offered.callTextOf(settingsOf([row("welcome")])), [], "none found is a fact, not a gap");
});

test("a settings read that lands makes the Inbox's picker, Sent's composer and Playbooks' composer again, and not one of them asks for a template", () => {
  asked.length = 0;
  // Each surface read once already, before Settings landed: their values stand as their own reads left them.
  setSurfaceValue("settings", undefined);
  setSurfaceValue("inbox", {
    THREADS: [],
    INBOX_BUCKETS: [],
    INBOX_VIEWS: [],
    CHANNEL_LABELS: {},
    INBOX_BASELINE: { doneThisWeek: 0 },
  });
  setSurfaceValue("broadcasts", { rows: [], audiences: [], listsRead: true });
  setSurfaceValue("playbooks", { rows: [], pools: {}, library: undefined, messages: null });
  const moved = { inbox: 0, broadcasts: 0, playbooks: 0 };
  const stops = Object.keys(moved).map((key) => onSurfaceMoved([key], () => (moved[key] += 1)));
  try {
    setSurfaceValue(
      "settings",
      settingsOf([row("welcome"), row("call_text"), row("later", "whatsapp", { meta_status: "pending" })]),
    );
    assert.deepEqual(
      names(surfaceValue("inbox").templates),
      ["welcome", "call_text"],
      "the reply box offers the approved ones",
    );
    assert.deepEqual(surfaceValue("inbox").templatesHeld, {
      pending: 1,
      rejected: 0,
      paused: 0,
      disabled: 0,
      hidden: 0,
    });
    assert.deepEqual(
      names(surfaceValue("broadcasts").templates),
      ["welcome", "call_text"],
      "Sent's composer the same messages",
    );
    const pb = surfaceValue("playbooks");
    assert.deepEqual(names(pb.templates), ["welcome", "call_text"], "and Playbooks'");
    assert.deepEqual(names(pb.library), ["call_text"], "Campaigns' home has the call's text");
    assert.equal(
      pb.messages.length,
      3,
      "and the Library's count: every message of the workspace, the one in review included",
    );
    assert.deepEqual(moved, { inbox: 1, broadcasts: 1, playbooks: 1 }, "each page is told once, to draw it");

    // Meta approves the one in review, and the owner hides another: one publication of Settings, and every page follows it.
    setSurfaceValue(
      "settings",
      settingsOf([row("welcome", "whatsapp", { hidden_at: "2026-10-10T00:00:00Z" }), row("call_text"), row("later")]),
    );
    for (const [key, list] of [
      ["inbox", surfaceValue("inbox").templates],
      ["broadcasts", surfaceValue("broadcasts").templates],
      ["playbooks", surfaceValue("playbooks").templates],
    ])
      assert.deepEqual(names(list), ["call_text", "later"], `${key}: approved, and the hidden one gone`);
    assert.deepEqual(surfaceValue("inbox").templatesHeld, {
      pending: 0,
      rejected: 0,
      paused: 0,
      disabled: 0,
      hidden: 1,
    });

    // Its templates read failed on the next read: 'could not read', in every place at once.
    setSurfaceValue("settings", settingsOf([], { templatesAll: null, templateVersions: null, messages: null }));
    assert.equal(surfaceValue("inbox").templates, null);
    assert.equal(surfaceValue("inbox").templatesHeld, null);
    assert.equal(surfaceValue("broadcasts").templates, null);
    assert.equal(surfaceValue("playbooks").templates, null);
    assert.equal(surfaceValue("playbooks").library, null);
    assert.equal(surfaceValue("playbooks").messages, null);
    assert.deepEqual(asked, [], "not a request was made for any of it");
  } finally {
    for (const stop of stops) stop();
  }
});

test("a settings read that changes nothing the pickers draw publishes nothing again: a teammate joined, a rule was saved", () => {
  const rows = [row("welcome"), row("call_text"), row("hours_note", "email")];
  setSurfaceValue("settings", settingsOf(rows));
  const before = {
    inbox: surfaceValue("inbox"),
    broadcasts: surfaceValue("broadcasts"),
    playbooks: surfaceValue("playbooks"),
  };
  // Settings is read again for a seat taken: its rows are new objects, equal to the ones it held.
  setSurfaceValue(
    "settings",
    settingsOf(
      rows.map((r) => ({ ...r })),
      { team: [{ id: "u2", display_name: "Ana" }] },
    ),
  );
  assert.equal(surfaceValue("inbox"), before.inbox, "the Inbox's value is the object it was");
  assert.equal(surfaceValue("broadcasts"), before.broadcasts, "Sent's");
  assert.equal(surfaceValue("playbooks"), before.playbooks, "and Playbooks'");
});

test("a surface made of the settings read is not unmade by its withdrawal: a value withdrawn tells nothing", () => {
  setSurfaceValue("settings", settingsOf([row("welcome")]));
  const had = surfaceValue("inbox");
  setSurfaceValue("settings", undefined);
  assert.equal(surfaceValue("inbox"), had);
  assert.deepEqual(names(surfaceValue("inbox").templates), ["welcome"]);
});

test("none of the three pages reads GET templates: each is read over a wire that serves no such route, and each takes the settings read as it stands", async () => {
  const workspace = { workspaces: globalThis.__WORKSPACES, activeWorkspaceId: "t1" };
  answers = {
    workspaces: workspace,
    conversations: { conversations: [] },
    escalations: { escalations: [] },
    broadcasts: { broadcasts: [], more: false },
    contacts: {
      people: [],
      page: { q: "", offset: 0, limit: 1, total: 0, has_more: false },
      calendar: { state: "none" },
    },
    segments: { lists: [] },
    channels: { channels: [] },
    settings: { config: { brain: {} }, version: 1 },
    playbooks: {
      playbooks: [],
      timezone: "America/New_York",
      pools: {},
      calendar: "none",
      lists: [],
      people_lists: [],
    },
  };
  const quiet = async (fn) => {
    const e = console.error;
    console.error = () => {};
    try {
      return await fn();
    } finally {
      console.error = e;
    }
  };
  asked.length = 0;
  // Before Settings lands: the pickers are still reading.
  setSurfaceValue("settings", undefined);
  await quiet(() => Promise.all([inboxOverride.apply(), broadcastsOverride.apply(), playbooksOverride.apply()]));
  assert.equal(surfaceValue("inbox").templates, undefined);
  assert.equal(surfaceValue("broadcasts").templates, undefined);
  assert.equal(surfaceValue("playbooks").templates, undefined);
  assert.equal(surfaceValue("playbooks").library, undefined, "the home says nothing of the call's text yet");
  // After: each read takes what Settings holds.
  setSurfaceValue("settings", settingsOf([row("welcome"), row("hours_note", "email")]));
  await quiet(() => Promise.all([inboxOverride.apply(), broadcastsOverride.apply(), playbooksOverride.apply()]));
  assert.deepEqual(names(surfaceValue("inbox").templates), ["welcome"]);
  assert.deepEqual(names(surfaceValue("broadcasts").templates), ["welcome", "hours_note"]);
  assert.deepEqual(names(surfaceValue("playbooks").templates), ["welcome", "hours_note"]);
  assert.deepEqual(
    askedFor("templates"),
    [],
    "REGRESSION (OW2): the Inbox, Sent and Playbooks each read the templates again",
  );
  assert.ok(
    askedFor("conversations").length > 0 && askedFor("broadcasts").length > 0 && askedFor("playbooks").length > 0,
  );
});

test("the settings read is the one read of them: it lands every template with its status once, and the three pages are made of what it published", async () => {
  const rows = [
    row("welcome"),
    row("in_review", "whatsapp", { meta_status: "pending" }),
    row("hours_note", "email"),
    row("call_text"),
  ];
  answers = {
    workspaces: { workspaces: globalThis.__WORKSPACES, activeWorkspaceId: "t1" },
    settings: { config: { brain: {} }, version: 1, role: "owner", facts: {}, conflicts: [] },
    team: { members: [], invites: [] },
    policies: { policies: [], role: "owner" },
    channels: { channels: [] },
    templates: { templates: rows, messages: campaignMessagesOf(rows), usedBy: {} },
  };
  // The pages were read earlier, with Settings not yet in.
  setSurfaceValue("settings", undefined);
  setSurfaceValue("inbox", {
    THREADS: [],
    INBOX_BUCKETS: [],
    INBOX_VIEWS: [],
    CHANNEL_LABELS: {},
    INBOX_BASELINE: { doneThisWeek: 0 },
  });
  setSurfaceValue("broadcasts", { rows: [], audiences: [], listsRead: true });
  setSurfaceValue("playbooks", { rows: [], pools: {}, library: undefined, messages: null });
  asked.length = 0;
  await settingsOverride.apply();
  assert.deepEqual(
    askedFor("templates"),
    [{ route: "templates", all: "1" }],
    "one read of the templates, every row with its status",
  );
  const settings = surfaceValue("settings");
  assert.deepEqual(
    names(settings.templatesAll),
    ["welcome", "in_review", "call_text"],
    "the Library draws all of WhatsApp's",
  );
  assert.deepEqual(
    names(surfaceValue("inbox").templates),
    ["welcome", "call_text"],
    "the reply box only the ones that may go",
  );
  assert.deepEqual(surfaceValue("inbox").templatesHeld, { pending: 1, rejected: 0, paused: 0, disabled: 0, hidden: 0 });
  assert.deepEqual(names(surfaceValue("broadcasts").templates), ["welcome", "hours_note", "call_text"]);
  assert.deepEqual(names(surfaceValue("playbooks").templates), ["welcome", "hours_note", "call_text"]);
  assert.deepEqual(names(surfaceValue("playbooks").library), ["call_text"]);
});

test("a template written, hidden, removed, synced or added from a starter re-reads Settings alone, and no window hook is called behind a write", () => {
  for (const route of [
    "POST templates",
    "PUT templates/[id]",
    "DELETE templates/[id]",
    "POST templates/starter",
    "POST templates/sync",
  ])
    assert.deepEqual(
      refreshMap.AFTER[route]().map((o) => o.key),
      ["settings"],
      `${route}: the one read of the templates`,
    );
  assert.equal(Object.hasOwn(refreshMap, "HOOKS"), false, "the table of window hooks is gone");
  // `__refreshBroadcasts` went with it: its only caller was that table. `__refreshPlaybooks` stays for Today's approve of a run.
  const had = { b: globalThis.__refreshBroadcasts, p: globalThis.__refreshPlaybooks };
  delete globalThis.__refreshBroadcasts;
  delete globalThis.__refreshPlaybooks;
  try {
    installBroadcasts();
    installPlaybooks();
    assert.equal(Object.hasOwn(globalThis, "__refreshBroadcasts"), false, "Sent publishes no hook to read it again");
    assert.equal(
      typeof globalThis.__refreshPlaybooks,
      "function",
      "Today's approve still re-reads the cards behind a run",
    );
    assert.equal(typeof globalThis.__broadcasts?.send, "function", "and Sent's verbs are published as ever");
  } finally {
    if (had.b) globalThis.__refreshBroadcasts = had.b;
    if (had.p) globalThis.__refreshPlaybooks = had.p;
  }
});

test("the feed tells Settings of a template in every tab, wherever it is, and tells the three pages nothing of it: they follow Settings", async () => {
  const { wantsRefresh } = await importSrc("apps/dashboard/src/legacy-bridge/surface-realtime.ts");
  const { watchedTables } = await importSrc("packages/db/src/realtime.ts");
  assert.ok(watchedTables().includes("templates"), "the database tells a workspace of its templates (00408)");
  const change = { table: "templates", event: "UPDATE", row: {} };
  for (const hash of ["#/today", "#/inbox", "#/campaigns", "#/broadcasts", "#/messages", "#/admin/workspace"]) {
    globalThis.location.hash = hash;
    assert.equal(wantsRefresh(settingsOverride, "templates", change), true, `Settings: ${hash}`);
    assert.equal(wantsRefresh(inboxOverride, "templates", change), false, `the Inbox: ${hash}`);
    assert.equal(wantsRefresh(broadcastsOverride, "templates", change), false, `Sent: ${hash}`);
  }
  // Playbooks still hears the table on its page, for the server's count of a run whose message is stricter than its moment.
  globalThis.location.hash = "#/outbound";
  assert.equal(wantsRefresh(playbooksOverride, "templates", change), true);
  globalThis.location.hash = "#/today";
});
