/**
 * The lead finder's routes, run through route(): the real route modules,
 * their `run` called with a database in memory and the doors faked. What is
 * proved is the policy each declares, the estimate the route computes, the
 * door's refusals said as sentences, and who is refused before anything
 * reaches a door.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "./_fake-db.mjs";
import { ROLE_PERMS, estimateRoundUsd, placesToAsk, LEAD_PROBE_PLACES } from "@chanlytics/contracts";
import { PLAN } from "./_lead-fixtures.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const searches = await import(at("apps/dashboard/app/api/v1/lead-searches/route.ts"));
const search = await import(at("apps/dashboard/app/api/v1/lead-searches/[id]/route.ts"));
const answerRoute = await import(at("apps/dashboard/app/api/v1/lead-searches/[id]/answer/route.ts"));
const more = await import(at("apps/dashboard/app/api/v1/lead-searches/[id]/more/route.ts"));
const stop = await import(at("apps/dashboard/app/api/v1/lead-searches/[id]/stop/route.ts"));
const leads = await import(at("apps/dashboard/app/api/v1/leads/route.ts"));
const keep = await import(at("apps/dashboard/app/api/v1/leads/[id]/keep/route.ts"));
const exclude = await import(at("apps/dashboard/app/api/v1/leads/[id]/exclude/route.ts"));
const putBack = await import(at("apps/dashboard/app/api/v1/leads/[id]/put-back/route.ts"));
const undo = await import(at("apps/dashboard/app/api/v1/lead-operations/[id]/undo/route.ts"));

beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const S1 = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const R1 = "bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb";
const L1 = "cccccccc-1111-4111-8111-cccccccccccc";
const O1 = "dddddddd-1111-4111-8111-dddddddddddd";
const USER = "u1";
const inA = `?workspace=${A}`;
const member = (role) => [{ user_id: USER, tenant_id: A, role, tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" }];
const paying = [{ tenant_id: A, mode: "direct", status: "active" }];
const view = (over = {}) => ({ id: S1, tenant_id: A, name: "Trainers", asked: "", via: "people", plan: PLAN, removed_at: null, created_at: "2026-09-19T00:00:00Z", round_id: R1, seq: 1, purpose: "probe", state: "waiting_on_owner", ending: null, question: { sentence: "…" }, answered: null, target: 20, plan_version: 1, qualified: 12, review: 0, excluded: 13, counted: 12, judge_tokens: 900, ...over });
const ctxFor = (role, rpcs = {}, params = {}, tables = {}) => ({ supabase: fakeDb({ memberships: member(role), billing_accounts: paying, lead_searches_view: [view()], ...tables }, {}, rpcs), userId: USER, email: "ada@example.com", params });
const get = (q = "") => new Request(`http://localhost/api/v1/x${q}`);
const send = (body, q = inA) => new Request(`http://localhost/api/v1/x${q}`, { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
async function refused(p, code, status) {
  await assert.rejects(p, (e) => { assert.equal(e.code, code, e.message); if (status) assert.equal(e.status, status); return true; });
}

test("the eleven declare their policy: the reads open to every member; a search, a top-up and what counts a lead the owner's, spending where money leaves; a stop the operator's", () => {
  const open = { kind: "read", role: null, rate: null, spend: false, scope: "workspace" };
  assert.deepEqual(searches.GET.policy, open);
  assert.deepEqual(search.GET.policy, open);
  assert.deepEqual(leads.GET.policy, open);
  assert.deepEqual(searches.POST.policy, { kind: "write", scope: "workspace", role: "owner", rate: "lead_search", spend: true });
  assert.deepEqual(more.POST.policy, { kind: "write", scope: "workspace", role: "owner", rate: "lead_search", spend: true });
  assert.deepEqual(answerRoute.POST.policy, { kind: "write", scope: "workspace", role: "owner", rate: "lead_answer", spend: false });
  assert.deepEqual(stop.POST.policy, { kind: "write", scope: "workspace", role: "operator", rate: "lead_answer", spend: false });
  for (const r of [keep, exclude, putBack, undo]) assert.deepEqual(r.POST.policy, { kind: "write", scope: "workspace", role: "owner", rate: "lead_member", spend: false });
});

test("the permission `find` and the routes agree: the one role that may find is the one role the counting routes name", () => {
  assert.deepEqual([ROLE_PERMS.owner.find, ROLE_PERMS.operator.find, ROLE_PERMS.viewer.find], [true, false, false]);
  const may = Object.entries(ROLE_PERMS).filter(([, p]) => p.find).map(([r]) => r);
  for (const r of [searches.POST, more.POST, keep.POST, putBack.POST, undo.POST]) assert.deepEqual(may, [r.policy.role], "the door checks `find`; the route spells the role: they must be the same set");
});

test("a search: the route computes the estimate from the card's prices and hands the plan and how it came to the door; the door's word comes back as a sentence", async () => {
  const seen = [];
  const rpcs = { lead_search_create: (a) => { seen.push(a); return { search_id: S1, round_id: R1 }; } };
  const out = await searches.POST.run(send(PLAN), ctxFor("owner", rpcs));
  assert.deepEqual(out, { search_id: S1, round_id: R1 });
  const expected = Math.round((estimateRoundUsd(PLAN, "probe", LEAD_PROBE_PLACES) + estimateRoundUsd(PLAN, "main", placesToAsk(PLAN, PLAN.count, 0.5).total)) * 100) / 100;
  assert.deepEqual(seen, [{ p_tenant_id: A, p_plan: PLAN, p_via: "people", p_estimate_usd: expected }]);
  assert.ok(expected > 0.1 && expected < 2, `a twenty-lead search costs cents: ${expected}`);
  const viaAsk = { ...ctxFor("owner", rpcs), via: "ask" };
  await searches.POST.run(send(PLAN), viaAsk);
  assert.equal(seen[1].p_via, "ask");
  await refused(searches.POST.run(send(PLAN), ctxFor("owner", { lead_search_create: () => ({ error: "paused" }) })), "conflict", 409);
  await assert.rejects(searches.POST.run(send(PLAN), ctxFor("owner", { lead_search_create: () => ({ error: "paused" }) })), /Searching is paused for now\. Nothing was started\./);
  await assert.rejects(searches.POST.run(send(PLAN), ctxFor("owner", { lead_search_create: () => ({ error: "month_leads_used", left: 3 }) })), /This month covers 3 more leads/);
  await assert.rejects(searches.POST.run(send(PLAN), ctxFor("owner", { lead_search_create: () => ({ error: "month_leads_used", left: 0 }) })), /This month's leads are used up/, "the 501st, refused in a sentence");
  await assert.rejects(searches.POST.run(send(PLAN), ctxFor("owner", { lead_search_create: () => ({ error: "budget_used" }) })), /searching budget is used/);
  await assert.rejects(searches.POST.run(send(PLAN), ctxFor("owner", { lead_search_create: () => ({ error: "month_leads_used", left: 0, sentence: "You have found this month's 500 leads. Your leads renew on Oct 1." }) })), /You have found this month's 500 leads\. Your leads renew on Oct 1\./, "the door's own sentence, said as it is");
  await refused(searches.POST.run(send({ ...PLAN, count: 5000 }), ctxFor("owner", rpcs)), "validation", 400);
});

test("who is refused before any door: a viewer cannot search, an operator cannot search, keep, put back or undo, a workspace that cannot spend is refused before the rate is counted", async () => {
  const never = { lead_search_create: () => { throw new Error("must not be reached"); }, lead_member_keep: () => { throw new Error("must not be reached"); }, lead_member_put_back: () => { throw new Error("must not be reached"); }, lead_undo: () => { throw new Error("must not be reached"); } };
  await refused(searches.POST.run(send(PLAN), ctxFor("viewer", never)), "forbidden", 403);
  await refused(searches.POST.run(send(PLAN), ctxFor("operator", never)), "forbidden", 403);
  await refused(keep.POST.run(send({ search_id: S1 }), ctxFor("operator", never, { id: L1 })), "forbidden", 403);
  await refused(putBack.POST.run(send({ search_id: S1 }), ctxFor("operator", never, { id: L1 })), "forbidden", 403);
  await refused(undo.POST.run(send({ version: 2 }), ctxFor("operator", never, { id: O1 })), "forbidden", 403);
  await refused(exclude.POST.run(send({ search_id: S1 }), ctxFor("viewer", never, { id: L1 })), "forbidden", 403);
  const unpaid = { supabase: fakeDb({ memberships: member("owner"), billing_accounts: [{ tenant_id: A, mode: "stripe", status: "past_due" }] }, {}, never), userId: USER, email: "ada@example.com", params: {} };
  await refused(searches.POST.run(send(PLAN), unpaid), "payment_required", 402);
});

test("the answer takes the search's latest round: keep and stop as words, include with its amended plan; an operator may stop", async () => {
  const seen = [];
  const rpcs = { lead_round_answer: (a) => { seen.push(a); return { ok: true }; }, lead_round_stop: (a) => { seen.push(a); return { ok: true }; } };
  assert.deepEqual(await answerRoute.POST.run(send({ answer: "keep" }), ctxFor("owner", rpcs, { id: S1 })), { round_id: R1, answered: "keep" });
  await refused(answerRoute.POST.run(send({ answer: "include" }), ctxFor("owner", rpcs, { id: S1 })), "validation", 400);
  await answerRoute.POST.run(send({ answer: "include", plan: { ...PLAN, version: 2, exclusions: [] } }), ctxFor("owner", rpcs, { id: S1 }));
  assert.deepEqual(seen.map((a) => [a.p_round_id, a.p_answer, a.p_plan?.version]), [[R1, "keep", undefined], [R1, "include", 2]]);
  await refused(answerRoute.POST.run(send({ answer: "keep" }), ctxFor("operator", rpcs, { id: S1 })), "forbidden", 403);
  assert.deepEqual(await stop.POST.run(send(undefined), ctxFor("operator", rpcs, { id: S1 })), { search_id: S1, stopping: true });
  assert.deepEqual(seen.at(-1), { p_search_id: S1 });
  await assert.rejects(answerRoute.POST.run(send({ answer: "keep" }), ctxFor("owner", { lead_round_answer: () => ({ error: "state", state: "running" }) }, { id: S1 })), /not waiting for an answer/);
  await refused(search.GET.run(get(inA), ctxFor("viewer", {}, { id: "eeeeeeee-1111-4111-8111-eeeeeeeeeeee" })), "not_found", 404);
});

test("the leads page is keyset-paged by the door under the caller's RLS: the search, the class as a filter, the sort key, the cursor and the size", async () => {
  const seen = [];
  const rpcs = { leads_page: (a) => { seen.push(a); return { rows: [], next: null }; } };
  await leads.GET.run(get(`${inA}&search=${S1}`), ctxFor("viewer", rpcs));
  await leads.GET.run(get(`${inA}&search=${S1}&class=review&sort=distance&after=k9&limit=50`), ctxFor("viewer", rpcs));
  assert.deepEqual(seen, [
    { p_tenant_id: A, p_search_id: S1, p_sort: "found", p_limit: 200 },
    { p_tenant_id: A, p_search_id: S1, p_class: "review", p_sort: "distance", p_after_key: "k9", p_limit: 50 },
  ]);
  await refused(leads.GET.run(get(inA), ctxFor("viewer", rpcs)), "validation", 400);
});

test("keep, exclude, put back and undo reach their doors with the ids and the version; a hidden place and a changed record are refused in sentences", async () => {
  const seen = [];
  const rpcs = {
    lead_member_keep: (a) => { seen.push(["keep", a]); return { op_id: O1, version: 3 }; },
    lead_member_exclude: (a) => { seen.push(["exclude", a]); return { op_id: O1, version: 4 }; },
    lead_member_put_back: () => ({ error: "hidden" }),
    lead_undo: (a) => { seen.push(["undo", a]); return { error: "changed" }; },
  };
  assert.deepEqual(await keep.POST.run(send({ search_id: S1 }), ctxFor("owner", rpcs, { id: L1 })), { lead_id: L1, op_id: O1, version: 3 });
  assert.deepEqual(await exclude.POST.run(send({ search_id: S1 }), ctxFor("owner", rpcs, { id: L1 })), { lead_id: L1, op_id: O1, version: 4 });
  await assert.rejects(putBack.POST.run(send({ search_id: S1 }), ctxFor("owner", rpcs, { id: L1 })), /hidden: it is already a customer, or was erased/);
  await assert.rejects(undo.POST.run(send({ version: 3 }), ctxFor("owner", rpcs, { id: O1 })), /Someone changed this since you saw it/);
  assert.deepEqual(seen, [["keep", { p_search_id: S1, p_lead_id: L1 }], ["exclude", { p_search_id: S1, p_lead_id: L1 }], ["undo", { p_op_id: O1, p_version: 3 }]]);
  await refused(keep.POST.run(send({ search_id: S1 }), ctxFor("owner", rpcs, { id: "nope" })), "not_found", 404);
});
