/**
 * The reads of the workspace, run through route(): the real route modules,
 * their `run` called with a database in memory. What is proved is the
 * policy each declares and what the handler answers, not its text.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "./_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { read, workspace } = await import(at("apps/dashboard/src/server/route.ts"));
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const notifications = await import(at("apps/dashboard/app/api/v1/notifications/route.ts"));
const conversations = await import(at("apps/dashboard/app/api/v1/conversations/route.ts"));
const channels = await import(at("apps/dashboard/app/api/v1/channels/route.ts"));

beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "u1";
const membership = (tenant_id, role, slug, created_at) => ({ user_id: USER, tenant_id, role, tenants: { slug }, created_at });
const both = (harbor, bayside) => [membership(A, harbor, "harbor", "2026-01-01T00:00:00Z"), membership(B, bayside, "bayside", "2026-02-01T00:00:00Z")];
const ctxFor = (tables, { params = {}, rpcs = {} } = {}) => ({ supabase: fakeDb(tables, {}, rpcs), userId: USER, email: "ada@example.com", params });
const get = (q = "") => new Request(`http://localhost/api/v1/x${q}`);
const put = (q, body) => new Request(`http://localhost/api/v1/x${q}`, { method: "PUT", body: JSON.stringify(body) });
async function refused(p, code, status) {
  await assert.rejects(p, (e) => { assert.equal(e.code, code, e.message); if (status) assert.equal(e.status, status); return true; });
}

test("the fourteen declare a read of the workspace, and the one that hands over everyone is owner-only", async () => {
  for (const rel of ["billing", "broadcasts/[id]", "calls/[id]/export", "channels", "channels/whatsapp/signup", "consent/qr", "contacts/export", "conversations", "conversations/[id]/export", "google", "lines", "messages/[id]/media", "setup", "notifications"]) {
    const mod = await import(at(`apps/dashboard/app/api/v1/${rel}/route.ts`));
    assert.equal(mod.GET.policy.kind, "read", rel);
    assert.equal(mod.GET.policy.scope, "workspace", rel);
  }
  const people = await import(at("apps/dashboard/app/api/v1/contacts/export/route.ts"));
  assert.deepEqual(people.GET.policy, { kind: "read", scope: "workspace", role: "owner", rate: "export", spend: false });
  assert.deepEqual(notifications.PUT.policy, { kind: "write", scope: "workspace", role: "viewer", rate: "notify_mark", spend: false });
});

test("a read refuses an account in two workspaces that named neither, as a write does", async () => {
  const GET = read({ scope: workspace, handle: async ({ member }) => member.tenantId });
  const tables = { memberships: both("owner", "owner") };
  await refused(GET.run(get(), ctxFor(tables)), "choose_workspace", 400);
  assert.equal(await GET.run(get(`?workspace=${B}`), ctxFor(tables)), B, "named, it proceeds");
});

test("the Inbox read answers the workspace the tab named, and a stranger is a 404", async () => {
  const tables = {
    memberships: both("viewer", "viewer"),
    conversations: [
      { id: "c-a", tenant_id: A, contact_id: "k1", state: "open", last_message_at: "2026-09-10T10:00:00Z", paused_until: null, contacts: { id: "k1", display_name: "Dana", wa_profile_name: null, phone_e164: "+13055550100", consent: "unknown", dnc: false } },
      { id: "c-b", tenant_id: B, contact_id: "k2", state: "open", last_message_at: "2026-09-10T11:00:00Z", paused_until: null, contacts: { id: "k2", display_name: "Eli", wa_profile_name: null, phone_e164: "+13055550101", consent: "unknown", dnc: false } },
    ],
    messages: [],
  };
  const inBayside = await conversations.GET.run(get(`?workspace=${B}`), ctxFor(tables));
  assert.deepEqual(inBayside.conversations.map((c) => c.id), ["c-b"], "only the named workspace's rows");
  await refused(conversations.GET.run(get(), ctxFor({ ...tables, memberships: [] })), "not_found", 404);
});

test("the channels read maps the rows the workspace has, with Meta's quality from the config", async () => {
  const tables = {
    memberships: both("operator", "operator"),
    tenant_channels: [
      { id: "ch1", tenant_id: A, kind: "whatsapp", number_e164: "+13055550199", status: "active", created_at: "2026-08-01T00:00:00Z", config: { quality_rating: "GREEN", messaging_limit: "TIER_1K" } },
      { id: "ch2", tenant_id: B, kind: "voice", number_e164: "+13055550198", status: "active", created_at: "2026-08-01T00:00:00Z", config: {} },
    ],
    messages: [],
    calls: [],
  };
  const out = await channels.GET.run(get(`?workspace=${A}`), ctxFor(tables));
  assert.deepEqual(out.channels.map((c) => [c.id, c.kind, c.quality, c.messaging_limit]), [["ch1", "whatsapp", "GREEN", "TIER_1K"]]);
});

test("marking notifications: every member may, the workspace must be named, and the marks are this person's", async () => {
  const calls = [];
  const rpcs = {
    notifications_seen: (args) => { calls.push(["seen", args]); return { seen_at: "2026-09-11T12:00:00Z" }; },
    notification_mark: (args) => { calls.push(["mark", args]); return null; },
  };
  const tables = { memberships: both("viewer", "viewer") };
  await refused(notifications.PUT.run(put("", { seen: true }), ctxFor(tables, { rpcs })), "choose_workspace", 400);
  const seen = await notifications.PUT.run(put(`?workspace=${B}`, { seen: true }), ctxFor(tables, { rpcs }));
  assert.deepEqual(seen, { seen_at: "2026-09-11T12:00:00Z" });
  assert.deepEqual(calls[0], ["seen", { p_tenant_id: B }], "the named workspace, never the oldest");
  const id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const marked = await notifications.PUT.run(put(`?workspace=${A}`, { id, read: true }), ctxFor(tables, { rpcs }));
  assert.deepEqual(marked, { notification_id: id, read: true, dismissed: undefined });
  assert.deepEqual(calls[1], ["mark", { p_id: id, p_read: true }]);
  await refused(notifications.PUT.run(put(`?workspace=${A}`, { id }), ctxFor(tables, { rpcs })), "validation", 400);
  await refused(notifications.PUT.run(put(`?workspace=${A}`, {}), ctxFor(tables, { rpcs })), "validation", 400);
});
