/**
 * What the Templates page is handed of a message's other versions (One message, every channel, step 1), EXECUTED against
 * the settings surface as it runs in the browser: the workspace's email and text rows beside its WhatsApp ones, and
 * nothing that changes what any other reader of the templates sees.
 *
 * - `GET templates?all=1` already returns every channel's rows; the surface keeps WhatsApp's alone as `templatesAll` (the
 *   Inbox's composer, Broadcasts, Playbooks and Ask read that, and `__TEMPLATES_ALL`, `__TEMPLATE_USE` and
 *   `__TEMPLATE_SENT` are what they were), and hands the page the email and text rows as `templateVersions`.
 * - A reach-out's emails (`reach_out_*`) are not among them: they have their own list.
 * - A read that failed is null, as it is for the WhatsApp rows, never an empty list that says there are none.
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
const SRC = "../../../../apps/dashboard/src";
const { settingsOverride } = await import(`${SRC}/legacy-bridge/surfaces/settings.ts`);
const { surfaceValue } = await import(`${SRC}/surfaces/surface-values.ts`);
console.error = quiet;

const row = (id, channel, name, over = {}) => ({
  id,
  channel,
  name,
  language: "en_US",
  body_preview: "Hi",
  variables: [],
  category: "utility",
  meta_status: "approved",
  quality: null,
  rejected_reason: null,
  synced_at: null,
  source: "chanlytics",
  hidden_at: null,
  title: null,
  header: null,
  ...over,
});
/** The wire, answering the settings surface's reads; `templates` is the ?all=1 answer, or a status to fail with. */
const wire = (templates) => {
  globalThis.window.fetch = async (url) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
    if (u.pathname === "/api/v1/templates")
      return typeof templates === "number"
        ? json(templates, { ok: false, error: { code: "internal", message: "down" } })
        : json(200, { ok: true, data: templates });
    if (u.pathname === "/api/v1/settings") return json(200, { ok: true, data: { config: { brain: {} }, version: 1 } });
    if (u.pathname === "/api/v1/team") return json(200, { ok: true, data: { members: [], invites: [] } });
    if (u.pathname === "/api/v1/policies") return json(200, { ok: true, data: { policies: [] } });
    if (u.pathname === "/api/v1/channels") return json(200, { ok: true, data: { channels: [] } });
    return json(404, { ok: false, error: { code: "not_found", message: `no ${u.pathname}` } });
  };
};

test("the page is handed a message's email and text rows beside its WhatsApp ones, and the WhatsApp list is what it was", async () => {
  wire({
    templates: [
      row("w1", "whatsapp", "visit_reminder"),
      row("e1", "email", "visit_reminder", { header: "Your appointment tomorrow" }),
      row("s1", "sms", "visit_reminder"),
      row("w2", "whatsapp", "quick_note"),
      // A reach-out's email: its own list, and no message's.
      row("r1", "email", "reach_out_9f2c", { language: "en", header: "Quick one" }),
    ],
    usedBy: {},
    sends: {},
  });
  await settingsOverride.apply();
  const held = surfaceValue("settings");
  assert.deepEqual(
    held.templateVersions.map((t) => [t.id, t.channel, t.name]),
    [
      ["e1", "email", "visit_reminder"],
      ["s1", "sms", "visit_reminder"],
    ],
    "the email and the text, never the reach-out's",
  );
  assert.equal(held.templateVersions[0].header, "Your appointment tomorrow", "an email's subject rides as its heading");
  // What every other reader sees is unchanged: WhatsApp's rows, and what is keyed by their names.
  assert.deepEqual(
    held.templatesAll.map((t) => t.id),
    ["w1", "w2"],
  );
  assert.deepEqual(
    globalThis.window.__TEMPLATES_ALL.map((t) => t.id),
    ["w1", "w2"],
  );
  assert.ok(
    globalThis.window.__TEMPLATES_ALL.every((t) => t.channel === "whatsapp"),
    "no other channel in the list the other pages read",
  );
  const named = Object.keys(globalThis.window.__TEMPLATE_USE);
  assert.ok(named.includes("visit_reminder") && !named.includes("reach_out_9f2c"), "the usage names no reach-out");
});

test("a workspace with no email or text row is handed an empty list, and a failed read is null, never none", async () => {
  wire({ templates: [row("w1", "whatsapp", "visit_reminder")], usedBy: {} });
  await settingsOverride.apply();
  assert.deepEqual(surfaceValue("settings").templateVersions, [], "read, and there are none");
  wire(500);
  await settingsOverride.apply();
  assert.equal(surfaceValue("settings").templateVersions, null, "not read is not none");
  assert.equal(surfaceValue("settings").templatesAll, null, "as the WhatsApp rows say of the same read");
});
