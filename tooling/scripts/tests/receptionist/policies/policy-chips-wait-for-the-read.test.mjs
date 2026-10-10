/**
 * The policy chips say a workspace's own modes, and none before they are read.
 *
 * The policy store (legacy-bridge/policy-store.ts) answered from the mockup's seeded charter while `__POLICIES` was
 * undefined, which in the app is a cold tab before GET settings lands, or a settings read that failed twice: a real
 * workspace's chips (the kit's PolicyChip, beside a broadcast run waiting on its owner, an approval, a playbook) said
 * "Replies · holds it" from the seed, a mode the database never said. And settings landing told no chip, since the
 * chips listen for `policy:changed` alone. Run on the real store and the real settings surface, over a window whose
 * wire answers the surface's reads.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";

const storage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
};
const heard = [];
globalThis.document = { body: {}, addEventListener() {}, removeEventListener() {} };
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
globalThis.window = {
  location: { pathname: "/w/salon", hash: "", search: "", origin: "https://app.example.com", assign() {} },
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: (e) => {
    heard.push({ type: e.type, reply: globalThis.window.POLICY?.modeOf("reply") ?? null });
    return true;
  },
  __WORKSPACES: [{ id: "t-salon", slug: "salon", name: "Salon", status: "active", timezone: "America/New_York" }],
  __ACTIVE_WORKSPACE: "t-salon",
  // A real workspace's session (seed-globals.ts sets it so wherever nothing set it first).
  __DEMO_MODE: false,
  // The mockup's seeded store (data-bits.jsx), which the manifest installs before the bridge replaces it.
  POLICY: {
    MODES: ["Auto", "Veto", "Ask", "Never"],
    ROWS: [{ id: "reply", def: "Veto" }],
    modeOf: () => "Veto",
    set() {},
  },
};
const json = (body) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
let policies = null;
globalThis.window.fetch = async (url) => {
  const u = new URL(String(url), "https://app.example.com");
  if (u.pathname === "/api/v1/settings") return json({ ok: true, data: { config: { brain: {} }, version: 1 } });
  if (u.pathname === "/api/v1/team") return json({ ok: true, data: { members: [], invites: [] } });
  if (u.pathname === "/api/v1/policies") return json({ ok: true, data: { policies, role: "owner", deals_on: false } });
  if (u.pathname === "/api/v1/channels") return json({ ok: true, data: { channels: [] } });
  if (u.pathname === "/api/v1/templates") return json({ ok: true, data: { templates: [], usedBy: {} } });
  return new Response(JSON.stringify({ ok: false, error: { code: "not_found" } }), { status: 404 });
};

const quiet = console.error;
console.error = () => {};
const { installPolicyStore } = await importSrc("apps/dashboard/src/legacy-bridge/policy-store.ts");
const { settingsOverride } = await importSrc("apps/dashboard/src/legacy-bridge/surfaces/settings.ts");
console.error = quiet;
installPolicyStore(globalThis.window);

test("REGRESSION: before the workspace's policies are read, a chip states no mode -- it said the mockup's seeded Veto", () => {
  const S = globalThis.window.POLICY;
  assert.equal(S.modeOf("reply"), null, "REGRESSION: the seed's mode beside a real workspace's approval");
  assert.equal(S.row("reply").mode, null);
  assert.equal(S.real(), false);
});

test("REGRESSION: the settings read landing tells every chip, with the workspace's own modes already in the store -- a chip drawn before it said nothing until a mode was next changed by hand", async () => {
  policies = [
    { class: "reply", mode: "auto", limits: {} },
    { class: "money", mode: "never", limits: {} },
  ];
  heard.length = 0;
  await settingsOverride.apply();
  const told = heard.filter((e) => e.type === "policy:changed");
  assert.equal(told.length, 1, "REGRESSION: the chips were never told the modes had landed");
  assert.equal(told[0].reply, "Auto", "told once the store answers from the workspace's rows");
  assert.equal(globalThis.window.POLICY.real(), true);
});

test("a policies read that failed tells the chips too: they go on saying no mode, never the seed's", async () => {
  globalThis.window.__POLICIES = undefined;
  const fetchWas = globalThis.window.fetch;
  globalThis.window.fetch = async (url) =>
    new URL(String(url), "https://app.example.com").pathname === "/api/v1/policies"
      ? new Response(JSON.stringify({ ok: false, error: { code: "internal", message: "down" } }), { status: 500 })
      : fetchWas(url);
  heard.length = 0;
  const quietAgain = console.error;
  console.error = () => {};
  try {
    await settingsOverride.apply();
  } finally {
    console.error = quietAgain;
    globalThis.window.fetch = fetchWas;
  }
  assert.equal(globalThis.window.__POLICIES, null, "the read failed, and says so");
  assert.deepEqual(
    heard.filter((e) => e.type === "policy:changed"),
    [{ type: "policy:changed", reply: null }],
  );
});
