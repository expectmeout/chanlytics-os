/**
 * The account, run through route(): the real route modules, their `run`
 * called with a database in memory. What is proved is the policy each
 * declares and what the handler answers, not its text.
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
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const me = await import(at("apps/dashboard/app/api/v1/me/route.ts"));
const workspaces = await import(at("apps/dashboard/app/api/v1/workspaces/route.ts"));

beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const USER = "u1";
const membership = (tenant_id, role, slug, created_at) => ({ user_id: USER, tenant_id, role, tenants: { slug }, created_at });
/** A member of two workspaces: harbor (the older membership, so the default) and bayside. */
const both = (harbor, bayside) => [membership(A, harbor, "harbor", "2026-01-01T00:00:00Z"), membership(B, bayside, "bayside", "2026-02-01T00:00:00Z")];
const tenants = () => [
  { id: A, slug: "harbor", name: "Harbor", status: "active", timezone: "America/New_York" },
  { id: B, slug: "bayside", name: "Bayside", status: "active", timezone: "America/New_York" },
];
const ctxFor = (tables, params = {}, rpcs = {}) => ({ supabase: fakeDb(tables, {}, rpcs), userId: USER, email: "ada@example.com", params });
const get = (q = "") => new Request(`http://localhost/api/v1/x${q}`);
const send = (method, body, q = "") => new Request(`http://localhost/api/v1/x${q}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const inA = `?workspace=${A}`;
const inB = `?workspace=${B}`;
async function refused(p, code, status, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    if (status) assert.equal(e.status, status, e.message);
    if (words) assert.ok(e.message.includes(words), `${JSON.stringify(e.message)} should say ${JSON.stringify(words)}`);
    return true;
  });
}

test("the three declare their policy: your name on the account and counted, where you are on the account with no bucket, the zone the owner's with none said out loud", () => {
  assert.deepEqual(me.PUT.policy, { kind: "write", scope: "account", role: null, rate: "profile_set", spend: false });
  assert.deepEqual(workspaces.GET.policy, { kind: "read", scope: "account", role: null, rate: null, spend: false });
  assert.deepEqual(workspaces.PATCH.policy, { kind: "write", scope: "workspace", role: "owner", rate: null, spend: false });
});

test("your name: yours alone to set, judged by the contracts' rule before the database's, saved through the one door, and what the door says is what you are called", async () => {
  const door = [];
  const rpcs = { profile_set: (a) => { door.push(a); return { display_name: a.p_display_name }; } };
  const tables = { memberships: both("viewer", "viewer") };
  await refused(me.PUT.run(send("PUT", { display_name: 5 }), ctxFor(tables, {}, rpcs)), "validation", 400, "Give a name, or leave it empty to clear it.");
  await refused(me.PUT.run(send("PUT", { display_name: "x".repeat(500) }), ctxFor(tables, {}, rpcs)), "validation", 400, "A name is at most");
  assert.equal(door.length, 0, "nothing reached the door");
  assert.deepEqual(await me.PUT.run(send("PUT", { display_name: "  Ada   Lovelace " }), ctxFor(tables, {}, rpcs)), { display_name: "Ada Lovelace" });
  assert.deepEqual(await me.PUT.run(send("PUT", { display_name: "" }), ctxFor(tables, {}, rpcs)), { display_name: "" }, "empty clears it");
  assert.deepEqual(door.map((a) => a.p_display_name), ["Ada Lovelace", ""]);
  const refusedByDb = { profile_set: () => { throw new Error("profile_set: too soon"); } };
  await refused(me.PUT.run(send("PUT", { display_name: "Ada" }), ctxFor(tables, {}, refusedByDb)), "validation", 400, "too soon");
});

test("where you are: every workspace with who is signed in; the active one by memberContext's rule, a stale preference degrading to the default rather than a 404; nowhere yet a real answer", async () => {
  const tables = {
    memberships: both("viewer", "owner"),
    tenants: tenants(),
    profiles: [{ user_id: USER, display_name: "Ada" }],
  };
  const home = await workspaces.GET.run(get(), ctxFor(tables, {}, { is_platform_admin: () => false }));
  assert.deepEqual(home.workspaces.map((w) => w.name), ["Bayside", "Harbor"], "by name");
  assert.equal(home.activeWorkspaceId, A, "the oldest membership is the default");
  assert.deepEqual(home.user, { id: USER, email: "ada@example.com", role: "viewer", display_name: "Ada", platform_admin: false });
  const bayside = await workspaces.GET.run(get(inB), ctxFor(tables, {}, { is_platform_admin: () => false }));
  assert.deepEqual([bayside.activeWorkspaceId, bayside.user.role], [B, "owner"], "the role describes the workspace being viewed");
  const stale = await workspaces.GET.run(get(`?workspace=${C}`), ctxFor(tables, {}, { is_platform_admin: () => false }));
  assert.equal(stale.activeWorkspaceId, A, "a workspace this person was removed from degrades to their default");
  const admin = await workspaces.GET.run(get(), ctxFor(tables, {}, { is_platform_admin: () => true }));
  assert.equal(admin.user.platform_admin, true, "the nav's one bit rides along");
  const nowhere = await workspaces.GET.run(get(), ctxFor({ memberships: [], tenants: [], profiles: [] }, {}, { is_platform_admin: () => false }));
  assert.deepEqual(nowhere, { workspaces: [], activeWorkspaceId: null, pending: null, user: { id: USER, email: "ada@example.com", role: null, display_name: null, platform_admin: false } });
});

test("the zone: the owner's, the workspace named, checked against Intl, and a change that landed on no row is a refusal rather than a success", async () => {
  const tables = { memberships: both("viewer", "owner"), tenants: tenants() };
  await refused(workspaces.PATCH.run(send("PATCH", { timezone: "America/Chicago" }), ctxFor(tables)), "choose_workspace", 400);
  await refused(workspaces.PATCH.run(send("PATCH", { timezone: "America/Chicago" }, inA), ctxFor(tables)), "forbidden", 403, "Only an owner");
  await refused(workspaces.PATCH.run(send("PATCH", { timezone: "Mars/Olympus" }, inB), ctxFor(tables)), "validation", 400);
  const changed = await workspaces.PATCH.run(send("PATCH", { timezone: "America/Chicago" }, inB), ctxFor(tables));
  assert.deepEqual(changed, { workspace: { id: B, slug: "bayside", name: "Bayside", status: "active", timezone: "America/Chicago" } });
  assert.equal(tables.tenants.find((t) => t.id === B).timezone, "America/Chicago");
  await refused(workspaces.PATCH.run(send("PATCH", { timezone: "America/Chicago" }, inB), ctxFor({ ...tables, tenants: [] })), "forbidden", 403, "could not be changed");
});
