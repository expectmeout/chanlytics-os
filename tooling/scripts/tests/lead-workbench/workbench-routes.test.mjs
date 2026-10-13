/**
 * The lead workbench's routes (00426), run through route(): the real route modules, their `run` called with a database
 * in memory whose rpcs answer as 00426's functions do. What is proved is the policy each declares, what each asks of
 * its function, that a dry check is the add's own door asked to write nothing, and that each refusal is said in
 * contracts' words, at the status its code means.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";
import { REACH_OUT_ADD_WORDS } from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const add = await import(at("apps/dashboard/app/api/v1/reach-outs/[id]/leads/route.ts"));
const check = await import(at("apps/dashboard/app/api/v1/reach-outs/[id]/leads/check/route.ts"));
const people = await import(at("apps/dashboard/app/api/v1/reach-outs/[id]/people/route.ts"));
const sources = await import(at("apps/dashboard/app/api/v1/reach-outs/sources/route.ts"));
const leave = await import(at("apps/dashboard/app/api/v1/reach-outs/[id]/leads/leave/route.ts"));
const back = await import(at("apps/dashboard/app/api/v1/leads/back/route.ts"));
const later = await import(at("apps/dashboard/app/api/v1/leads/[id]/later/route.ts"));
const undo = await import(at("apps/dashboard/app/api/v1/lead-operations/[id]/undo/route.ts"));

beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "11111111-1111-4111-8111-111111111111";
const ROOT_ID = "33333333-3333-4333-8333-333333333333";
const LIST = "22222222-2222-4222-8222-222222222222";
const LEAD = "55555555-5555-4555-8555-555555555555";
const OTHER = "55555555-5555-4555-8555-555555555556";
const OP = "66666666-6666-4666-8666-666666666666";

const tables = (role = "operator") => ({
  memberships: [{ user_id: USER, tenant_id: A, role, tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" }],
  billing_accounts: [{ tenant_id: A, mode: "direct", status: "active" }],
  tenants: [{ id: A, name: "Harbor Fitness Co", timezone: "America/Chicago" }],
  playbooks: [
    {
      id: ROOT_ID,
      tenant_id: A,
      kind: "reach_out",
      trigger: "lead_first",
      name: "Early gyms",
      state: "running",
      lead_search_id: LIST,
    },
  ],
});
/** 00426's doors as their answers look, each ask recorded. */
const doors = (over = {}) => {
  const asked = [];
  const rec = (name, answer) => (a) => {
    asked.push([name, a]);
    return typeof answer === "function" ? answer(a) : answer;
  };
  const added = {
    dry: false,
    added: 1,
    op_id: OP,
    version: 1,
    left_out: { no_email: 1 },
    leads: [{ lead_id: OTHER, why: "no_email", chain_id: null, chain_name: null }],
    waiting: 3,
    cap: 25,
  };
  return {
    asked,
    rpcs: {
      reach_out_add: rec("reach_out_add", (a) =>
        a.p_dry ? { ...added, dry: true, added: 0, would_add: 1, op_id: undefined, version: undefined } : added,
      ),
      lead_member_later: rec("lead_member_later", { op_id: OP, version: 4 }),
      reach_out_chain_people: rec("reach_out_chain_people", {
        root_id: ROOT_ID,
        fed_by: "list",
        search: { id: LIST, name: "Early gyms" },
        counts: { waiting: 1, writing: 0, done: 0, of: 1 },
        waiting: [{ lead_id: LEAD, business_name: "Iron Works", sent: 0, added_at: "2026-10-13T15:00:00Z" }],
        writing: [],
        done: [],
      }),
      lead_undo: rec("lead_undo", { ok: true, taken: 1, leaving: 0, sent: 0 }),
      leads_back_today: rec("leads_back_today", [
        { lead_id: LEAD, business_name: "Iron Works", resume_at: "2026-10-13T05:00:00Z", contact_id: null },
      ]),
      reach_out_leave_out: rec("reach_out_leave_out", { ok: true, op_id: OP, version: 3, skipped: 1 }),
      reach_out_sources: rec("reach_out_sources", [
        {
          id: LIST,
          name: "Gyms · Austin",
          via: "people",
          asked_on: "2026-10-12T15:00:00Z",
          ready: 31,
          with_unconfirmed: 33,
        },
      ]),
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
const send = (body) => new Request(`http://localhost/api/v1/x${inA}`, { method: "POST", body: JSON.stringify(body) });
async function refused(p, code, status, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    assert.equal(e.status, status, e.message);
    if (words) assert.equal(e.message, words);
    return true;
  });
}

test("each declares its policy: adding, checking and Later an operator's, a reach-out's people any member's", () => {
  const op = { kind: "write", role: "operator", rate: "lead_member", spend: false };
  assert.deepEqual(add.POST.policy, { ...op, scope: "row" });
  assert.deepEqual(check.POST.policy, { ...op, scope: "row" });
  assert.deepEqual(later.POST.policy, { ...op, scope: "workspace" });
  assert.deepEqual(undo.POST.policy, { ...op, scope: "workspace" });
  assert.deepEqual(people.GET.policy, { kind: "read", role: null, rate: null, spend: false, scope: "row" });
});

test("an add asks reach_out_add with its leads; its check asks the same door to write nothing", async () => {
  const d = doors();
  const out = await add.POST.run(send({ lead_ids: [LEAD, OTHER] }), ctxFor(tables(), { id: ROOT_ID }, d.rpcs));
  assert.deepEqual([out.added, out.op_id, out.waiting, out.left_out], [1, OP, 3, { no_email: 1 }]);
  const dry = await check.POST.run(send({ lead_ids: [LEAD] }), ctxFor(tables(), { id: ROOT_ID }, d.rpcs));
  assert.deepEqual([dry.dry, dry.would_add, dry.added], [true, 1, 0]);
  assert.deepEqual(d.asked, [
    ["reach_out_add", { p_root_id: ROOT_ID, p_lead_ids: [LEAD, OTHER], p_dry: false }],
    ["reach_out_add", { p_root_id: ROOT_ID, p_lead_ids: [LEAD], p_dry: true }],
  ]);
});

test("who is refused before the door, and the door's refusals in contracts' words", async () => {
  const viewer = doors();
  await refused(
    add.POST.run(send({ lead_ids: [LEAD] }), ctxFor(tables("viewer"), { id: ROOT_ID }, viewer.rpcs)),
    "forbidden",
    403,
  );
  await refused(
    later.POST.run(send({ search_id: LIST }), ctxFor(tables("viewer"), { id: LEAD }, viewer.rpcs)),
    "forbidden",
    403,
  );
  assert.deepEqual(viewer.asked, [], "the doors are never asked");
  const nobody = doors();
  await refused(add.POST.run(send({ lead_ids: [LEAD] }), ctxFor(tables(), { id: OP }, nobody.rpcs)), "not_found", 404);
  await refused(
    add.POST.run(send({ lead_ids: [] }), ctxFor(tables(), { id: ROOT_ID }, nobody.rpcs)),
    "validation",
    400,
  );
  assert.deepEqual(nobody.asked, []);
  const finder = doors({ reach_out_add: () => ({ error: "fed_by_search", search_id: LIST }) });
  await refused(
    add.POST.run(send({ lead_ids: [LEAD] }), ctxFor(tables(), { id: ROOT_ID }, finder.rpcs)),
    "conflict",
    409,
    REACH_OUT_ADD_WORDS.fedBySearch,
  );
  const gone = doors({ reach_out_add: () => ({ error: "list_gone" }) });
  await refused(
    check.POST.run(send({ lead_ids: [LEAD] }), ctxFor(tables(), { id: ROOT_ID }, gone.rpcs)),
    "conflict",
    409,
    REACH_OUT_ADD_WORDS.listGone,
  );
  // The door's own P0002 (a role it refuses, a reach-out it does not find) is a 404 in its words.
  const door = doors({
    reach_out_add: () => {
      throw Object.assign(new Error("Reach-out not found."), { code: "P0002" });
    },
  });
  await refused(
    add.POST.run(send({ lead_ids: [LEAD] }), ctxFor(tables(), { id: ROOT_ID }, door.rpcs)),
    "not_found",
    404,
    "Reach-out not found.",
  );
});

test("Later asks its door with the lead and the search, and answers its undo", async () => {
  const d = doors();
  const out = await later.POST.run(send({ search_id: LIST }), ctxFor(tables(), { id: LEAD }, d.rpcs));
  assert.deepEqual(out, { lead_id: LEAD, op_id: OP, version: 4 });
  assert.deepEqual(d.asked, [["lead_member_later", { p_search_id: LIST, p_lead_id: LEAD }]]);
  const removed = doors({ lead_member_later: () => ({ error: "removed" }) });
  await refused(
    later.POST.run(send({ search_id: LIST }), ctxFor(tables(), { id: LEAD }, removed.rpcs)),
    "conflict",
    409,
  );
});

test("an add taken back says how many came off; too late, it says why in the owner's words", async () => {
  const d = doors();
  const out = await undo.POST.run(send({ version: 1 }), ctxFor(tables(), { id: OP }, d.rpcs));
  assert.deepEqual(out, { op_id: OP, undone: true, taken: 1, leaving: 0, sent: 0 });
  assert.deepEqual(d.asked, [["lead_undo", { p_op_id: OP, p_version: 1 }]]);
  for (const [error, words] of [
    ["on_its_way", REACH_OUT_ADD_WORDS.onItsWay],
    ["sent", REACH_OUT_ADD_WORDS.sent],
  ]) {
    const late = doors({ lead_undo: () => ({ error, leaving: 1, sent: 0 }) });
    await refused(undo.POST.run(send({ version: 1 }), ctxFor(tables(), { id: OP }, late.rpcs)), "conflict", 409, words);
  }
  // Keep, exclude and put back stay find's: the door refuses an operator's undo of them, as not found.
  const theirs = doors({
    lead_undo: () => {
      throw Object.assign(new Error("Operation not found."), { code: "P0002" });
    },
  });
  await assert.rejects(undo.POST.run(send({ version: 1 }), ctxFor(tables(), { id: OP }, theirs.rpcs)));
});

test("a reach-out's people are read for any member, by its first step, with a limit when asked", async () => {
  const d = doors();
  const out = await people.GET.run(get("&limit=20"), ctxFor(tables("viewer"), { id: ROOT_ID }, d.rpcs));
  assert.deepEqual(
    [out.fed_by, out.counts, out.waiting.map((l) => l.lead_id)],
    ["list", { waiting: 1, writing: 0, done: 0, of: 1 }, [LEAD]],
  );
  assert.deepEqual(d.asked, [["reach_out_chain_people", { p_tenant_id: A, p_root_id: ROOT_ID, p_limit: 20 }]]);
});

test("what a reach-out could start from is read for any member, in the workspace, as its door answers it", async () => {
  assert.deepEqual(sources.GET.policy, { kind: "read", role: null, rate: null, spend: false, scope: "workspace" });
  const d = doors();
  const out = await sources.GET.run(get(), ctxFor(tables("viewer"), {}, d.rpcs));
  assert.deepEqual(
    out.sources.map((s) => [s.id, s.ready, s.with_unconfirmed]),
    [[LIST, 31, 33]],
  );
  assert.deepEqual(d.asked, [["reach_out_sources", { p_tenant_id: A }]]);
});

test("Leave out is an operator's, by the reach-out's first step, and answers its undo; its refusals are the add's words", async () => {
  assert.deepEqual(leave.POST.policy, {
    kind: "write",
    role: "operator",
    rate: "lead_member",
    spend: false,
    scope: "row",
  });
  const d = doors();
  const out = await leave.POST.run(send({ lead_id: LEAD }), ctxFor(tables(), { id: ROOT_ID }, d.rpcs));
  assert.deepEqual(out, { lead_id: LEAD, op_id: OP, version: 3, skipped: 1 });
  assert.deepEqual(d.asked, [["reach_out_leave_out", { p_root_id: ROOT_ID, p_lead_id: LEAD }]]);
  for (const [error, words] of [
    ["not_on_it", REACH_OUT_ADD_WORDS.notOnIt],
    ["list_gone", REACH_OUT_ADD_WORDS.listGone],
    ["fed_by_search", REACH_OUT_ADD_WORDS.fedBySearch],
    ["on_its_way", REACH_OUT_ADD_WORDS.onItsWay],
    ["sent", REACH_OUT_ADD_WORDS.sent],
  ]) {
    const said = doors({ reach_out_leave_out: () => ({ error }) });
    await refused(
      leave.POST.run(send({ lead_id: LEAD }), ctxFor(tables(), { id: ROOT_ID }, said.rpcs)),
      "conflict",
      409,
      words,
    );
  }
  await refused(
    leave.POST.run(send({ lead_id: LEAD }), ctxFor(tables("viewer"), { id: ROOT_ID }, d.rpcs)),
    "forbidden",
    403,
  );
});

test("Back today is read for any member, in the workspace, as its door answers it", async () => {
  assert.deepEqual(back.GET.policy, { kind: "read", role: null, rate: null, spend: false, scope: "workspace" });
  const d = doors();
  const out = await back.GET.run(get(), ctxFor(tables("viewer"), {}, d.rpcs));
  assert.deepEqual(
    out.leads.map((l) => [l.lead_id, l.business_name]),
    [[LEAD, "Iron Works"]],
  );
  assert.deepEqual(d.asked, [["leads_back_today", { p_tenant_id: A }]]);
});
