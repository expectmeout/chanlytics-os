/**
 * The settings read lands the workspace's facts once, on the seam, and nowhere else.
 *
 * The server resolves each fact from what the owner typed and what the platform knows, and says where two sources disagree
 * (settings-routes.test.mjs "F1", and its reader in readers.test.mjs). The browser's settings read hands both to the pages
 * as the settings surface's `facts` (bridge/surfaces/settings.ts), where Settings › Business reads them
 * (settings/business/shell.ts factsNow), the Inbox's template box and Live's controls too. Null on a config that would not
 * parse: there is nothing trustworthy to resolve against, and the forms close on it.
 *
 * It published them twice, on the seam and as a window global beside it (`__FACTS`), and a line of facts.test.mjs held the
 * global by reading the bridge's source. The global went on 11 Nov 2026, its one reader moved; this runs the read instead.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const WS = "t-salon";
globalThis.document = {
  body: {},
  addEventListener() {},
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }),
};
const storage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
};
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
globalThis.window = {
  location: {
    pathname: "/w/salon",
    hash: "",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {},
  setTimeout: () => 1,
  clearTimeout() {},
  __WORKSPACES: [{ id: WS, slug: "salon", name: "Salon", status: "active", timezone: "America/New_York" }],
  __ACTIVE_WORKSPACE: WS,
};
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const SRC = "../../../apps/dashboard/src";
const { settingsOverride } = await import(`${SRC}/bridge/surfaces/settings.ts`);
const { surfaceValue } = await import(`${SRC}/surfaces/surface-values.ts`);
const { api } = await import(`${SRC}/bridge/api.ts`);

/** What the server resolved: the line the workspace answers on, and a name two sources say differently. */
const FACTS = {
  business_name: { value: "Northside Studio", source: "typed" },
  voice_line: { value: "+13055550124", source: "provisioned" },
  handoff_number: { value: null, source: "absent" },
};
const CONFLICTS = [{ fact: "business_name", knownSource: "workspace", sentence: "The workspace is named Northside." }];

/** The wire, answering the settings surface's reads; `settings` is what GET settings answers. */
const wire = (settings) => {
  // The client shares an identical read for two seconds: each test's read is its own.
  api().forget();
  globalThis.window.fetch = async (url) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
    if (u.pathname === "/api/v1/settings") return json(200, { ok: true, data: settings });
    if (u.pathname === "/api/v1/team") return json(200, { ok: true, data: { members: [], invites: [] } });
    if (u.pathname === "/api/v1/policies") return json(200, { ok: true, data: { policies: [] } });
    if (u.pathname === "/api/v1/templates") return json(200, { ok: true, data: { templates: [], usedBy: {} } });
    return json(404, { ok: false, error: { code: "not_found", message: `no ${u.pathname}` } });
  };
};

test("the facts the server resolved, and where two sources disagree, are the settings surface's, whole", async () => {
  wire({
    config: { brain: { business_name: "Northside Studio" } },
    version: 3,
    role: "owner",
    facts: FACTS,
    conflicts: CONFLICTS,
  });
  await settingsOverride.apply();
  assert.deepEqual(surfaceValue("settings").facts, { facts: FACTS, conflicts: CONFLICTS });
  assert.equal(surfaceValue("settings").settings.version, 3, "beside the record they were resolved for");
});

test("a config that would not parse lands no facts: null, which closes the forms, never the last ones read", async () => {
  wire({ config: { brain: {} }, version: 3, role: "owner", facts: FACTS, conflicts: [] });
  await settingsOverride.apply();
  assert.ok(surfaceValue("settings").facts, "read once, whole");
  wire({ configBroken: true, issues: ["brain.booking_link: Invalid url"], version: 3, role: "owner" });
  await settingsOverride.apply();
  assert.equal(surfaceValue("settings").facts, null);
  assert.deepEqual(surfaceValue("settings").settings.broken, { issues: ["brain.booking_link: Invalid url"] });
});

test("they are published once: nothing of them is on the window, where the pages read them until their reader moved", async () => {
  wire({ config: { brain: {} }, version: 1, role: "owner", facts: FACTS, conflicts: [] });
  await settingsOverride.apply();
  assert.equal("__FACTS" in globalThis.window, false);
});
