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
 * - The page is handed the workspace's messages (lane 1, T7): the read's own, which are made of every row; and where the
 *   read carries none (an older server answering this bridge), the bridge makes them of the rows it keeps, so a page never
 *   sees them undefined. `templatesAll` is WhatsApp's alone whichever way they arrive.
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
const { campaignMessagesOf } = await import("@chanlytics/contracts");
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

/** What a message reads as, for the cases below: where it is anchored, which versions it holds, and whether it is offered. */
const shape = (m) => [
  m.name,
  m.language,
  m.anchor,
  m.versions.whatsapp?.status ?? null,
  m.versions.email?.id ?? null,
  m.versions.sms?.id ?? null,
  m.offered,
];

test("the page is handed the read's own messages as they are, a version in review inside its message, and the WhatsApp list is what it was", async () => {
  const rows = [
    row("w1", "whatsapp", "winback_offer", { meta_status: "pending", category: "marketing" }),
    row("e1", "email", "winback_offer", { category: "marketing", header: "We miss you" }),
  ];
  // What the server made of every row (readers/templates.ts); the title is the read's, so a page that made its own would show.
  const made = campaignMessagesOf(rows).map((m) => ({ ...m, title: "From the read" }));
  wire({ templates: rows, messages: made, usedBy: {}, sends: {} });
  await settingsOverride.apply();
  const held = surfaceValue("settings");
  assert.deepEqual(held.messages, made, "the read's messages, not made again");
  assert.deepEqual(shape(held.messages[0]), [
    "winback_offer",
    "en_US",
    { id: "w1", channel: "whatsapp" },
    "pending",
    "e1",
    null,
    true,
  ]);
  assert.deepEqual(
    held.templatesAll.map((t) => t.id),
    ["w1"],
    "WhatsApp's rows alone: the Inbox, setup and the phone read them",
  );
  assert.deepEqual(
    held.templateVersions.map((t) => t.id),
    ["e1"],
  );
});

test("a read without messages (an older server) is handed messages made of the WhatsApp rows and the email and text rows the surface keeps", async () => {
  wire({
    templates: [
      row("w1", "whatsapp", "visit_reminder"),
      row("e1", "email", "visit_reminder", { header: "Your appointment tomorrow" }),
      row("s1", "sms", "visit_reminder"),
      // A version in review keeps its standing in the message it is made into.
      row("w2", "whatsapp", "quick_note", { meta_status: "pending" }),
      row("e2", "email", "quick_note"),
      // A message with no WhatsApp row at all, and one WhatsApp has not approved with nothing beside it.
      row("e3", "email", "harbor_note"),
      row("w3", "whatsapp", "autumn_offer", { meta_status: "pending" }),
      // A reach-out's email is no message's.
      row("r1", "email", "reach_out_9f2c", { language: "en", header: "Quick one" }),
    ],
    usedBy: {},
    sends: {},
  });
  await settingsOverride.apply();
  const held = surfaceValue("settings");
  assert.deepEqual(held.messages.map(shape), [
    ["visit_reminder", "en_US", { id: "w1", channel: "whatsapp" }, "approved", "e1", "s1", true],
    ["quick_note", "en_US", { id: "w2", channel: "whatsapp" }, "pending", "e2", null, true],
    ["autumn_offer", "en_US", { id: "w3", channel: "whatsapp" }, "pending", null, null, false],
    ["harbor_note", "en_US", { id: "e3", channel: "email" }, null, "e3", null, true],
  ]);
  // The same messages contracts makes of those rows, whichever way a page asks.
  assert.deepEqual(
    held.messages,
    campaignMessagesOf([...held.templatesAll, ...held.templateVersions]),
    "derived from templatesAll and templateVersions, as the page keeps them",
  );
  assert.deepEqual(
    held.templatesAll.map((t) => t.id),
    ["w1", "w2", "w3"],
    "still WhatsApp's alone",
  );
});

test("a failed read is no messages (null), and a workspace with no template has none (an empty list), never undefined", async () => {
  wire(500);
  await settingsOverride.apply();
  assert.equal(surfaceValue("settings").messages, null, "not read is not none");
  wire({ templates: [], usedBy: {}, sends: {} });
  await settingsOverride.apply();
  assert.deepEqual(surfaceValue("settings").messages, [], "read, and there are none");
  wire({ templates: [], messages: [], usedBy: {}, sends: {} });
  await settingsOverride.apply();
  assert.deepEqual(surfaceValue("settings").messages, []);
});
