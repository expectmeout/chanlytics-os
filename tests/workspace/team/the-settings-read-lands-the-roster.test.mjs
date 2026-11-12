/**
 * The settings read lands the team's roster and its open invitations once, on the seam, and they are read from there.
 *
 * GET team answers the members and the invitations nobody has taken yet (server/workspace/team.ts). The browser's settings
 * read hands both to the pages as the settings surface's `team` and `invites` (bridge/surfaces/settings.ts): Settings › Team
 * draws them, a thread's holder is named from the roster ("Ana García has it", surfaces/holder-names.ts), and the bell says
 * an invitation nobody took (bridge/notifications.ts). A team read that failed is null for both, never an empty list: "we
 * could not read the team" and "there is nobody" are different facts.
 *
 * Both were published twice, on the seam and as window globals beside it (`__TEAM`, `__TEAM_INVITES`), and the last two
 * readers took the globals. They went on 11 Nov 2026; a line of team-audit-and-invites.test.mjs held the second by reading
 * the bridge's source, and this runs the read and its two readers instead.
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
const quiet = console.error;
console.error = () => {};
const SRC = "../../../apps/dashboard/src";
const { settingsOverride } = await import(`${SRC}/bridge/surfaces/settings.ts`);
const { surfaceValue } = await import(`${SRC}/surfaces/surface-values.ts`);
const { api } = await import(`${SRC}/bridge/api.ts`);
const { holderName } = await import(`${SRC}/surfaces/holder-names.ts`);
const { feedFromGlobals } = await import(`${SRC}/bridge/notifications.ts`);
console.error = quiet;

const ANA = {
  membershipId: "m-ana",
  userId: "u-ana",
  email: "ana@example.com",
  displayName: "Ana García",
  role: "owner",
};
const LEE = { membershipId: "m-lee", userId: "u-lee", email: "lee@example.com", displayName: "", role: "operator" };
const SAM = {
  id: "inv-sam",
  email: "sam@example.com",
  role: "viewer",
  created_at: "2026-11-10T15:00:00Z",
  expires_at: "2026-11-17T15:00:00Z",
};

/** The wire, answering the settings surface's reads; `team` is what GET team answers, or a status to fail with. */
const wire = (team) => {
  // The client shares an identical read for two seconds: each test's read is its own.
  api().forget();
  globalThis.window.fetch = async (url) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
    if (u.pathname === "/api/v1/settings")
      return json(200, {
        ok: true,
        data: { config: { brain: {} }, version: 1, role: "owner", facts: {}, conflicts: [] },
      });
    if (u.pathname === "/api/v1/team")
      return typeof team === "number"
        ? json(team, { ok: false, error: { code: "internal", message: "down" } })
        : json(200, { ok: true, data: team });
    if (u.pathname === "/api/v1/policies") return json(200, { ok: true, data: { policies: [] } });
    if (u.pathname === "/api/v1/templates") return json(200, { ok: true, data: { templates: [], usedBy: {} } });
    return json(404, { ok: false, error: { code: "not_found", message: `no ${u.pathname}` } });
  };
};
/** The settings read, with the console's one line for a failed part kept out of the run's output. */
const land = async () => {
  console.error = () => {};
  try {
    await settingsOverride.apply();
  } finally {
    console.error = quiet;
  }
};
/** The bell's rows for invitations, by key, as its feed derives them now. */
const invitedNow = () =>
  feedFromGlobals({ INBOX_DATA: { THREADS: [] } }, Date.parse("2026-11-11T15:00:00Z"))
    .map((r) => r.key)
    .filter((k) => k.startsWith("invite:"));

test("the roster and the open invitations are the settings surface's, whole, and each reader takes them from there", async () => {
  wire({ members: [ANA, LEE], invites: [SAM] });
  await land();
  assert.deepEqual(surfaceValue("settings").team, [ANA, LEE]);
  assert.deepEqual(surfaceValue("settings").invites, [SAM]);
  // A thread's holder is named from the roster: the name the workspace says them by, the address where they gave none.
  assert.equal(holderName("u-ana"), "Ana García");
  assert.equal(holderName("u-lee"), "lee@example.com");
  assert.equal(holderName("u-gone"), null, "someone no longer on it: no name is invented");
  // And the bell says the invitation nobody took.
  assert.deepEqual(invitedNow(), ["invite:inv-sam"]);
});

test("a team read that failed lands neither: null, never an empty roster, and nobody is named or said invited", async () => {
  wire({ members: [ANA], invites: [SAM] });
  await land();
  assert.equal(holderName("u-ana"), "Ana García", "read once, whole");
  wire(500);
  await land();
  assert.equal(surfaceValue("settings").team, null, "REGRESSION guard: [] would say the workspace has nobody");
  assert.equal(surfaceValue("settings").invites, null);
  assert.equal(holderName("u-ana"), null, "the roster unread: a teammate has no name");
  assert.deepEqual(invitedNow(), []);
  assert.ok(surfaceValue("settings").settings, "and the business's record beside it is not blanked by it");
});

test("they are published once: neither is on the window, where the bell and the holder's name read them until they moved", async () => {
  wire({ members: [ANA], invites: [] });
  await land();
  assert.equal("__TEAM" in globalThis.window, false);
  assert.equal("__TEAM_INVITES" in globalThis.window, false);
});
