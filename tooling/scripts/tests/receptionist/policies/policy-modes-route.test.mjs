/**
 * PUT /api/v1/policies, run (Reach out, Part 3): a reach-out's class takes the modes its runtime honours — veto (its
 * default: a later run gives thirty minutes to be stopped), ask and never, never auto — and a class with nothing to
 * hold refuses veto, by the one rule (contracts policyModeOffered; every class and mode in policy-veto-option). The
 * real route over a database in memory.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const policies = await import(at("apps/dashboard/app/api/v1/policies/route.ts"));
beforeEach(() => setRateStore(memoryStore()));

const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "u1";
const tables = () => ({
  memberships: [
    { user_id: USER, tenant_id: B, role: "operator", tenants: { slug: "bayside" }, created_at: "2026-02-01T00:00:00Z" },
  ],
  policies: [
    { tenant_id: B, class: "outreach", mode: "veto", limits: {}, subject_type: null, subject_id: null },
    { tenant_id: B, class: "campaign", mode: "ask", limits: {}, subject_type: null, subject_id: null },
  ],
  decisions: [],
  events: [],
});
const put = (t, body) =>
  policies.PUT.run(
    new Request(`http://localhost/api/v1/policies?workspace=${B}`, { method: "PUT", body: JSON.stringify(body) }),
    { supabase: fakeDb(t, {}, {}), userId: USER, email: "ada@example.com", params: {} },
  );
const refusedWith = (p, words) =>
  assert.rejects(p, (e) => {
    assert.equal(e.code, "validation", e.message);
    assert.ok(e.message.includes(words), e.message);
    return true;
  });

test("a reach-out's class moves between veto, ask and never, and back to veto, its default", async () => {
  const t = tables();
  await put(t, { class: "outreach", mode: "ask" });
  assert.equal(t.policies.find((p) => p.class === "outreach").mode, "ask");
  await put(t, { class: "outreach", mode: "veto" });
  assert.equal(t.policies.find((p) => p.class === "outreach").mode, "veto", "veto can come back");
  await put(t, { class: "outreach", mode: "never" });
  assert.equal(t.policies.find((p) => p.class === "outreach").mode, "never");
});

test("cold email never goes the moment a run is made: auto is refused for a reach-out", async () => {
  await refusedWith(put(tables(), { class: "outreach", mode: "auto" }), "cannot be set to auto");
});

test("a class with nothing to hold for review refuses veto, in its own words", async () => {
  await refusedWith(put(tables(), { class: "follow_up", mode: "veto" }), "has nothing to hold for review");
  await refusedWith(
    put(tables(), { class: "reviews", mode: "veto" }),
    "The Reviews row has nothing to hold for review.",
  );
});
