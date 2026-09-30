/**
 * How a rule names a list it reads, said once (contracts listNamer): a People list by its label, one of the
 * workspace's own by its name, archived or not, and nothing for a token that names neither. People's rail (the
 * bridge's publishPeople) and Ask's lists (people with action lists) each wrote the same body for themselves
 * (defect 39); both are run here and must say a rule the way the one function names its lists.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";
import { PEOPLE_LISTS, listNamer, listRuleParts } from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VIP = "11111111-1111-4111-8111-111111111111";
const OLD = "22222222-2222-4222-8222-222222222222";
const RULED = "33333333-3333-4333-8333-333333333333";
const GONE = "44444444-4444-4444-8444-444444444444";
const label = (id) => PEOPLE_LISTS.find((l) => l.id === id).label;

/** A list kept by its rule that reads the other kinds: one of the workspace's, an archived one, a People list, a gone one. */
const RULE = {
  all: [
    { field: "in_list", op: "is", list: `list:${VIP}` },
    { field: "in_list", op: "is_not", list: `list:${OLD}` },
    { field: "in_list", op: "is_not", list: "seg:opted_out" },
    { field: "in_list", op: "is_not", list: `list:${GONE}` },
  ],
};
const SAVED = [
  { id: VIP, name: "VIP", ids: [], rule: null, archived_at: null },
  { id: OLD, name: "Last summer", ids: [], rule: null, archived_at: "2026-09-01T00:00:00Z" },
  { id: RULED, name: "Regulars", ids: [], rule: RULE, archived_at: null },
];
const SAID = ["On VIP", "Not on Last summer", `Not on ${label("opted_out")}`, "Not on another list"];

test("a list's name: a People list's label, the workspace's own name, archived or not, and nothing for anything else", () => {
  const name = listNamer(SAVED);
  assert.equal(name("seg:needs_you"), label("needs_you"));
  assert.equal(name("state:needs_you"), label("needs_you"), "the old standing tabs' token reads as seg:");
  assert.equal(name(`list:${VIP}`), "VIP");
  assert.equal(name(`list:${OLD}`), "Last summer", "an archived list is still named by a rule that reads it");
  assert.equal(name(`list:${GONE}`), null, "a list that is gone");
  assert.equal(name("seg:no_such_list"), null, "a People list that does not exist");
  assert.equal(name("VIP"), null, "not a token");
  assert.equal(listNamer([])(`list:${VIP}`), null, "nothing saved");
  assert.deepEqual(listRuleParts(RULE, name), SAID);
});

test("Ask's lists say a rule's lists by the one namer", async () => {
  const { runTool, newToolContext } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
  const { readerCache } = await import(at("apps/dashboard/src/server/readers/index.ts"));
  readerCache.clear();
  const t = {
    memberships: [
      { user_id: "u1", tenant_id: A, role: "owner", tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
    ],
    tenants: [{ id: A, name: "Harbor", timezone: "America/New_York" }],
    tenant_config: [],
    tenant_channels: [],
    policies: [],
    contacts: [],
    segments: SAVED.map(({ ids: _ids, ...l }) => ({ ...l, tenant_id: A })),
    segment_members: [],
  };
  const tc = newToolContext(
    {
      supabase: fakeDb(t, {}, { people_list: () => [] }),
      userId: "u1",
      email: "ada@example.com",
      params: {},
    },
    A,
    "owner",
    "America/New_York",
    new Date("2026-09-14T14:00:00Z"),
  );
  const out = await runTool(tc, { name: "people", input: { action: "lists" } });
  assert.equal(out.isError, false, out.result);
  const read = JSON.parse(out.result);
  const regulars = read.own.find((l) => l.name === "Regulars");
  assert.ok(regulars, out.result);
  assert.equal(regulars.rule, listRuleParts(RULE, listNamer(SAVED)).join(" · "));
  assert.equal(regulars.rule, SAID.join(" · "));
  assert.deepEqual(read.archived, ["Last summer"]);
});

test("People's rail says a rule's lists by the one namer", async () => {
  const storage = () => {
    const m = new Map();
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k),
    };
  };
  const json = (body) =>
    new Response(JSON.stringify({ ok: true, data: body }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  globalThis.localStorage = storage();
  globalThis.sessionStorage = storage();
  globalThis.document ??= {
    body: {},
    addEventListener() {},
    removeEventListener() {},
    getElementById: () => null,
    querySelector: () => null,
  };
  globalThis.window = {
    location: { pathname: "/w/harbor", hash: "#/clients", origin: "https://app.chanlytics.com" },
    localStorage: globalThis.localStorage,
    sessionStorage: globalThis.sessionStorage,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h),
    __WORKSPACES: [{ id: A, slug: "harbor", name: "Harbor", status: "active", timezone: "America/New_York" }],
    __ACTIVE_WORKSPACE: A,
    fetch: async (url) => {
      const u = new URL(String(url), "https://app.chanlytics.com");
      if (u.pathname === "/api/v1/contacts")
        return json({
          people: [],
          page: { q: null, offset: 0, limit: 1000, total: 0, has_more: false },
          calendar: { state: "none", source: "your calendar" },
          booking_link: null,
          deals_on: false,
        });
      if (u.pathname === "/api/v1/segments") return json({ lists: SAVED });
      if (u.pathname === "/api/v1/views") return json({ views: {} });
      return new Response(JSON.stringify({ ok: false, error: { code: "not_found" } }), { status: 404 });
    },
  };
  const { peopleOverride } = await import(at("apps/dashboard/src/legacy-bridge/surfaces/people.ts"));
  await peopleOverride.apply();
  const rail = globalThis.window.__PEOPLE;
  const regulars = rail.saved.find((l) => l.name === "Regulars");
  assert.ok(regulars, JSON.stringify(rail.saved));
  assert.deepEqual(regulars.rule, listRuleParts(RULE, listNamer(SAVED)));
  assert.deepEqual(regulars.rule, SAID);
  assert.deepEqual(rail.archived, [{ id: OLD, name: "Last summer" }]);
});
