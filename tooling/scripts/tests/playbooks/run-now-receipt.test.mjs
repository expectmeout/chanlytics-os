/**
 * Run now's receipt, through the dashboard's route: the time the edge gave comes back to the page.
 *
 * The edge's run now answers with when the run was scheduled for, and the moment asked for when the hours moved it
 * (run in playbooks-run-door.test.mjs). The dashboard's service read four fields of that answer and the route
 * returned none of the time, so the page could only say "sending now" over a run moved to nine (the wiring audit's
 * C7). Run through route() with the production guard open (EDGE_PROVIDERS=live) onto a fake edge.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";
import { REACH_OUT_IS_NOT_A_MOMENT } from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
// The guard is read once, as its module loads: open it before the route is imported.
process.env.EDGE_PROVIDERS = "live";
process.env.EDGE_URL = "https://edge.example";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const run = await import(at("apps/dashboard/app/api/v1/playbooks/[id]/run/route.ts"));
beforeEach(() => setRateStore(memoryStore()));

const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const B1 = "88888888-8888-4888-8888-888888888881";
const K2 = "99999999-9999-4999-8999-999999999992";
const T1 = "77777777-7777-4777-8777-777777777771";
const USER = "u1";
// The membership and playbook rows outbound-routes.test.mjs runs the route over.
const tables = () => ({
  memberships: [
    { user_id: USER, tenant_id: B, role: "operator", tenants: { slug: "bayside" }, created_at: "2026-02-01T00:00:00Z" },
  ],
  playbooks: [
    {
      id: K2,
      tenant_id: B,
      kind: "moment",
      name: "Win-back",
      trigger: "quiet_30",
      template_id: T1,
      template_name: "winback_offer",
      template_language: "en_US",
      params: [],
      policy_class: "reengage",
      state: "running",
      run_hour: 10,
      cap_per_run: 50,
      gap_days: 30,
      cadence_days: 0,
      last_run_for: null,
      last_run_at: null,
      created_at: "2026-09-01T00:00:00Z",
    },
  ],
  decisions: [],
  broadcasts: [],
  broadcast_recipients: [],
});
const press = () =>
  run.POST.run(new Request("http://localhost/api/v1/x", { method: "POST" }), {
    supabase: fakeDb(tables(), {}, {}),
    userId: USER,
    email: "ada@example.com",
    params: { id: K2 },
  });

/** The edge: what it answers to one run now, and every call it received. */
const edge = { calls: [], answer: null };
globalThis.fetch = async (url, init) => {
  edge.calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
  return new Response(JSON.stringify(edge.answer), { status: 200, headers: { "content-type": "application/json" } });
};

test("REGRESSION (C7): the route hands back when a run really goes, as the edge said -- it returned the outcome and none of the time", async () => {
  edge.answer = {
    ok: true,
    outcome: "sent",
    broadcast_id: B1,
    eligible: 2,
    mode: "ask",
    state: "scheduled",
    scheduled_for: "2026-09-16T13:00:00.000Z",
    moved_from: "2026-09-16T03:00:00.000Z",
  };
  const out = await press();
  assert.deepEqual(
    edge.calls.at(-1),
    { url: "https://edge.example/api/admin/playbooks-run", body: { tenant_id: B, playbook_id: K2, user_id: USER } },
    "the edge was asked for this playbook, as this person",
  );
  assert.deepEqual(
    out,
    {
      id: K2,
      outcome: "sent",
      eligible: 2,
      broadcast_id: B1,
      name: "Win-back",
      scheduled_for: "2026-09-16T13:00:00.000Z",
      moved_from: "2026-09-16T03:00:00.000Z",
    },
    "REGRESSION: no time came back",
  );

  edge.answer = { ok: true, outcome: "held", broadcast_id: B1, eligible: 2, mode: "ask", state: "pending_approval" };
  const held = await press();
  assert.deepEqual(
    [held.outcome, held.scheduled_for, held.moved_from],
    ["held", null, null],
    "a run left waiting has no time to give, and none is made up",
  );
});

test("Run now is a moment's: a reach-out step is refused in words before the edge is asked (Reach out, Part 3)", async () => {
  const t = tables();
  Object.assign(t.playbooks[0], { kind: "reach_out", trigger: "lead_first", policy_class: "outreach" });
  const before = edge.calls.length;
  await assert.rejects(
    run.POST.run(new Request("http://localhost/api/v1/x", { method: "POST" }), {
      supabase: fakeDb(t, {}, {}),
      userId: USER,
      email: "ada@example.com",
      params: { id: K2 },
    }),
    (e) => e.status === 409 && e.message === REACH_OUT_IS_NOT_A_MOMENT,
  );
  assert.equal(edge.calls.length, before, "the edge was never asked");
});
