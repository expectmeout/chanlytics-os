/**
 * The Library's verbs, pressed in a tab: the real `templates` verbs (surfaces/campaigns/templates/verbs.ts) and the
 * bridge's two doors they hand on (bridge/verbs/templates.ts), over the bridge's own client and a wire that keeps what
 * each request carried. A page imports these and presses them (decision 0015: nothing is published on the window), so
 * what reaches the server is what each verb asks: the route, and the body. Pinned as the two modules' text until
 * 26 Nov 2026 (starter-templates, templates-made-here). What each route then does is run in
 * playbooks/routes/broadcasts-templates-and-playbooks.test.mjs and what-meta-holds-is-asked-of-the-edge.test.mjs; what
 * the refresh map reads again after each, in shell/hearing/templates-are-read-once.test.mjs.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";
import { bridgeHolds } from "../shell/_bridge-holds.mjs";

globalThis.window ??= globalThis;
globalThis.location ??= { pathname: "/w/bayside", hash: "" };
globalThis.document ??= { visibilityState: "hidden", addEventListener() {}, removeEventListener() {} };
globalThis.window.addEventListener ??= () => {};
globalThis.window.removeEventListener ??= () => {};
globalThis.window.dispatchEvent ??= () => true;
bridgeHolds({
  who: {
    workspaces: [{ id: "t1", slug: "bayside", name: "Bayside", status: "active", timezone: "America/New_York" }],
    activeWorkspaceId: "t1",
  },
});

/** Every request the tab made: `METHOD path` and the body it carried. */
const wire = [];
globalThis.window.fetch = async (url, init = {}) => {
  wire.push({
    at: `${init.method ?? "GET"} ${new URL(String(url), "https://app.chanlytics.com").pathname}`,
    body: init.body ? JSON.parse(init.body) : null,
  });
  return new Response(JSON.stringify({ ok: true, data: {} }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
beforeEach(() => (wire.length = 0));

const { templates, starters, titleOf } = await importSrc("apps/dashboard/src/surfaces/campaigns/templates/verbs.ts");
const { setSurfaceValue } = await importSrc("apps/dashboard/src/surfaces/surface-values.ts");
const ID = "77777777-7777-4777-8777-777777777771";

test("put away, back, and renamed: each is one change of the one row, through its door", async () => {
  await templates.hide(ID);
  await templates.show(ID);
  await templates.rename(ID, "Fall hours");
  await templates.rename(ID, null);
  assert.deepEqual(wire, [
    { at: `PUT /api/v1/templates/${ID}`, body: { hidden: true } },
    { at: `PUT /api/v1/templates/${ID}`, body: { hidden: false } },
    { at: `PUT /api/v1/templates/${ID}`, body: { title: "Fall hours" } },
    { at: `PUT /api/v1/templates/${ID}`, body: { title: null } },
  ]);
});

test("written, deleted, drafted, WhatsApp's list asked, and a starter filed: each verb asks its own route", async () => {
  const written = { name: "fall_hours", language: "en_US", category: "utility", body: "Hi {{1}}", examples: ["Ana"] };
  await templates.create(written);
  await templates.remove(ID);
  await templates.draft({ brief: "Tell them about the new hours", category: "utility", language: "en" });
  await templates.sync();
  // A step's editor files the starter it picked through the same door Settings › Business presses (the bridge's).
  await templates.fileStarters({ keys: ["visit_reminder"], languages: ["en_US"], channels: ["whatsapp"] });
  assert.deepEqual(wire, [
    { at: "POST /api/v1/templates", body: written },
    { at: `DELETE /api/v1/templates/${ID}`, body: null },
    {
      at: "POST /api/v1/templates/draft",
      body: { brief: "Tell them about the new hours", category: "utility", language: "en" },
    },
    { at: "POST /api/v1/templates/sync", body: null },
    {
      at: "POST /api/v1/templates/starter",
      body: { keys: ["visit_reminder"], languages: ["en_US"], channels: ["whatsapp"] },
    },
  ]);
});

test("a template is named by the workspace's own title wherever it is named by its name alone, and the library says it so", () => {
  setSurfaceValue("settings", {
    templatesAll: [{ name: "fall_hours", title: "Autumn opening times" }, { name: "quick_note" }],
  });
  assert.equal(titleOf("fall_hours"), "Autumn opening times", "looked up among the workspace's rows");
  assert.equal(starters.title("fall_hours"), "Autumn opening times", "the library the pages read says it the same way");
  assert.equal(titleOf({ name: "fall_hours", title: "Autumn" }), "Autumn", "a row says its own");
  assert.notEqual(titleOf("quick_note"), "quick_note", "a name with no title is made words, never shown raw");
  // The library reaches the pages with its slots' kinds: the pages import it (decision 0015), nothing on the window.
  assert.equal(typeof starters.slotKinds, "function");
  assert.ok(Array.isArray(starters.list) && starters.list.length > 0, "the set this workspace is offered");
});
