/**
 * What comes back, through its routes (Reach out Part 6: H3, H8–H10), run through route(): the real route modules,
 * their `run` called with a database in memory whose rpcs answer as 00241's functions do. What is proved is the policy
 * each declares, what each asks of its function, and that each refusal is said in contracts' words.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";
import { REACH_OUT_REFUSALS } from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const report = await import(at("apps/dashboard/app/api/v1/reports/reach-outs/route.ts"));
const leads = await import(at("apps/dashboard/app/api/v1/reach-outs/leads/route.ts"));
const stop = await import(at("apps/dashboard/app/api/v1/reach-outs/leads/[id]/stop/route.ts"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "11111111-1111-4111-8111-111111111111";
const SEARCH = "22222222-2222-4222-8222-222222222222";
const LEAD = "55555555-5555-4555-8555-555555555555";
const THEIRS = "55555555-5555-4555-8555-555555555556";

const tables = (role = "operator") => ({
  memberships: [{ user_id: USER, tenant_id: A, role, tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" }],
  billing_accounts: [{ tenant_id: A, mode: "direct", status: "active" }],
  tenants: [{ id: A, name: "Harbor Moving Co", timezone: "America/Chicago" }],
  leads: [
    { id: LEAD, tenant_id: A, business_name: "Brightwater & Co.", erased_at: null, blanked_at: null },
    { id: THEIRS, tenant_id: B, business_name: "Elsewhere", erased_at: null, blanked_at: null },
  ],
  playbooks: [],
  templates: [],
  sending_domains: [],
  policies: [],
  broadcasts: [],
});
/** 00241's functions as their answers look, each ask recorded. */
const doors = (over = {}) => {
  const asked = [];
  const rec = (name, answer) => (a) => {
    asked.push([name, a]);
    return typeof answer === "function" ? answer(a) : answer;
  };
  return {
    asked,
    rpcs: {
      reach_out_report: rec("reach_out_report", { days: 30, has_reach_out: true, chains: [] }),
      reach_out_search_lines: rec("reach_out_search_lines", null),
      reach_out_lead_timeline: rec("reach_out_lead_timeline", { lead_id: LEAD, sends: [], readings: [] }),
      reach_out_lead_stop: rec("reach_out_lead_stop", { stopped: true, already: false, skipped: 2, leaving: 0 }),
      ...over,
    },
  };
};
const ctxFor = (t, params = {}, rpcs = {}) => ({
  supabase: fakeDb(t, {}, rpcs),
  userId: USER,
  email: "ada@example.com",
  params,
});
const inA = `?workspace=${A}`;
const get = (q = "") => new Request(`http://localhost/api/v1/x${inA}${q}`);
const post = () => new Request(`http://localhost/api/v1/x${inA}`, { method: "POST" });
async function refused(p, code, status, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    assert.equal(e.status, status, e.message);
    if (words) assert.equal(e.message, words);
    return true;
  });
}
const policy = (r) => ({ ...r.policy });

test("each route declares its policy: every member reads, an operator stops, the lead is the row", () => {
  assert.deepEqual(policy(report.GET), {
    kind: "read",
    scope: "workspace",
    role: null,
    rate: "aggregate",
    spend: false,
  });
  assert.deepEqual(policy(leads.GET), { kind: "read", scope: "workspace", role: null, rate: null, spend: false });
  assert.deepEqual(policy(stop.POST), {
    kind: "write",
    scope: "row",
    role: "operator",
    rate: "playbook",
    spend: false,
  });
});

test("GET reports/reach-outs asks its function for the workspace's period, and refuses any other", async () => {
  const d = doors();
  const out = await report.GET.run(get("&days=7"), ctxFor(tables("viewer"), {}, d.rpcs));
  assert.deepEqual(out.report, { days: 30, has_reach_out: true, chains: [] });
  assert.deepEqual(d.asked, [["reach_out_report", { p_tenant_id: A, p_days: 7 }]]);
  await report.GET.run(get(), ctxFor(tables("viewer"), {}, d.rpcs));
  assert.deepEqual(d.asked.at(-1)[1], { p_tenant_id: A, p_days: 30 }, "thirty by default");
  await refused(report.GET.run(get("&days=14"), ctxFor(tables("viewer"), {}, d.rpcs)), "validation", 400);
});

test("GET reach-outs/leads answers a search's lines, or one lead's story, and asks for exactly one", async () => {
  const d = doors();
  const none = await leads.GET.run(get(`&search=${SEARCH}`), ctxFor(tables("viewer"), {}, d.rpcs));
  assert.deepEqual(none, { lines: null, chain: null, timeline: null }, "a search with no reach-out");
  assert.deepEqual(d.asked.at(-1), ["reach_out_search_lines", { p_tenant_id: A, p_search_id: SEARCH }]);
  const story = await leads.GET.run(get(`&lead=${LEAD}`), ctxFor(tables("viewer"), {}, d.rpcs));
  assert.deepEqual(story, { lines: null, chain: null, timeline: { lead_id: LEAD, sends: [], readings: [] } });
  assert.deepEqual(d.asked.at(-1), ["reach_out_lead_timeline", { p_tenant_id: A, p_lead_id: LEAD }]);
  await refused(leads.GET.run(get(), ctxFor(tables("viewer"), {}, d.rpcs)), "validation", 400);
  await refused(
    leads.GET.run(get(`&search=${SEARCH}&lead=${LEAD}`), ctxFor(tables("viewer"), {}, d.rpcs)),
    "validation",
    400,
  );
});

test("a search with a reach-out answers its lines beside the chain as Playbooks reads it", async () => {
  const lines = { chain: { root_id: "r0", name: "Gone", state: "running" }, leads: [] };
  const d = doors({ reach_out_search_lines: () => lines });
  const out = await leads.GET.run(get(`&search=${SEARCH}`), ctxFor(tables("viewer"), {}, d.rpcs));
  assert.deepEqual(out.lines, lines);
  assert.equal(out.chain, null, "a chain the list does not hold is none, and the strip says no share");
});

test("POST stop: an operator stops a lead; a viewer may not; another workspace's lead is not found", async () => {
  const d = doors();
  const out = await stop.POST.run(post(), ctxFor(tables("operator"), { id: LEAD }, d.rpcs));
  assert.deepEqual(out, { stopped: true, already: false, skipped: 2, leaving: 0 });
  assert.deepEqual(d.asked, [["reach_out_lead_stop", { p_lead_id: LEAD }]]);
  const viewer = doors();
  await refused(stop.POST.run(post(), ctxFor(tables("viewer"), { id: LEAD }, viewer.rpcs)), "forbidden", 403);
  assert.deepEqual(viewer.asked, [], "the door is never asked");
  const stranger = doors();
  await refused(stop.POST.run(post(), ctxFor(tables("operator"), { id: THEIRS }, stranger.rpcs)), "not_found", 404);
  assert.deepEqual(stranger.asked, []);
});

test("the door's refusal is said in contracts' words", async () => {
  const d = doors({
    reach_out_lead_stop: () => {
      throw Object.assign(new Error(REACH_OUT_REFUSALS.nothingWritten), { code: "22023" });
    },
  });
  await refused(
    stop.POST.run(post(), ctxFor(tables("operator"), { id: LEAD }, d.rpcs)),
    "validation",
    422,
    REACH_OUT_REFUSALS.nothingWritten,
  );
});
