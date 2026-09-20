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
import { ROLE_PERMS, estimateRoundUsd, placesToAsk, whyCannotSpend, leadDraftFooter, LEAD_NO_ADDRESS, LEAD_PROBE_PLACES, SPEND_LEADS } from "@chanlytics/contracts";
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
// Release B's ten.
const searchUndo = await import(at("apps/dashboard/app/api/v1/lead-searches/[id]/undo/route.ts"));
const stage = await import(at("apps/dashboard/app/api/v1/leads/[id]/stage/route.ts"));
const draft = await import(at("apps/dashboard/app/api/v1/leads/[id]/draft/route.ts"));
const erase = await import(at("apps/dashboard/app/api/v1/leads/[id]/route.ts"));
const bulk = await import(at("apps/dashboard/app/api/v1/leads/bulk/route.ts"));
const exportRoute = await import(at("apps/dashboard/app/api/v1/leads/export/route.ts"));
const suggestions = await import(at("apps/dashboard/app/api/v1/lead-suggestions/route.ts"));
const { setModelStream } = await import(at("apps/dashboard/src/server/model-json.ts"));
const { GatewayRefused } = await import(at("apps/dashboard/src/server/ask/gateway.ts"));
const { leadMailto, planFacts, setSuggestionsWriter } = await import(at("apps/dashboard/src/server/leads.ts"));

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
const view = (over = {}) => ({ id: S1, tenant_id: A, name: "Trainers", asked: "", via: "people", plan: PLAN, removed_at: null, created_at: "2026-09-19T00:00:00Z", round_id: R1, seq: 1, purpose: "probe", state: "waiting_on_owner", ending: null, question: { sentence: "…" }, answered: null, target: 20, plan_version: 1, qualified: 12, review: 0, excluded: 13, counted: 12, judge_tokens: 900, ending_pending: null, waiting_since: null, ended_at: null, emails_checked: 0, with_phone: 0, undo_op_id: null, undo_version: null, ...over });
const ctxFor = (role, rpcs = {}, params = {}, tables = {}) => ({ supabase: fakeDb({ memberships: member(role), billing_accounts: paying, lead_searches_view: [view()], ...tables }, {}, rpcs), userId: USER, email: "ada@example.com", params });
const get = (q = "") => new Request(`http://localhost/api/v1/x${q}`);
const send = (body, q = inA) => new Request(`http://localhost/api/v1/x${q}`, { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
async function refused(p, code, status) {
  await assert.rejects(p, (e) => { assert.equal(e.code, code, e.message); if (status) assert.equal(e.status, status); return true; });
}

test("release A's eleven declare their policy: the reads open to every member; a search, a top-up and what counts a lead the owner's, spending where money leaves; a stop the operator's", () => {
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
  // Release B widened this route's query (the rail's list, six sorts, a
  // direction and the {key, id} cursor), so A's arguments are now B's nine
  // with the rest at their defaults. The values changed; the point did not.
  const seen = [];
  const rpcs = { leads_page: (a) => { seen.push(a); return []; }, lead_list_counts: () => ({ all: 0, ready: 0, nurture: 0, converted: 0, said_no: 0, not_a_fit: 0 }) };
  await leads.GET.run(get(`${inA}&search=${S1}`), ctxFor("viewer", rpcs, {}, { lead_searches: [] }));
  await leads.GET.run(get(`${inA}&search=${S1}&class=review&sort=distance&after_key=k9&after_id=${L1}&limit=50`), ctxFor("viewer", rpcs, {}, { lead_searches: [] }));
  assert.deepEqual(seen, [
    { p_tenant_id: A, p_search_id: S1, p_class: null, p_sort: "fit", p_after_key: null, p_limit: 500, p_list: "all", p_dir: "asc", p_after_id: null },
    { p_tenant_id: A, p_search_id: S1, p_class: "review", p_sort: "distance", p_after_key: "k9", p_limit: 50, p_list: "all", p_dir: "asc", p_after_id: L1 },
  ]);
  await refused(leads.GET.run(get(`${inA}&sort=nonsense`), ctxFor("viewer", rpcs, {}, { lead_searches: [] })), "validation", 400);
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

/* ------------------------------------------------- release B's ten routes */
/**
 * B's cases build a whole workspace (`world`) and hand it to `ctxOf`, the way
 * people-routes.test.mjs does, because a row-scoped route resolves its member
 * from the row it loaded: the lead, the search and the membership must agree
 * or the role is judged in the wrong workspace. The model is a fake stream, so
 * a draft and the first day's suggestions are exercised without a key.
 */
const LEAD = "cccccccc-2222-4222-8222-cccccccccccc";
const SEARCH = S1;
const OP = "dddddddd-2222-4222-8222-dddddddddddd";
const CONTACT = "eeeeeeee-2222-4222-8222-eeeeeeeeeeee";
const NAME = "Travis Heights Coaching Co.";

const ctxOf = (tables, params = {}, rpcs = {}) => ({ supabase: fakeDb(tables, {}, rpcs), userId: USER, email: "ada@example.com", params });
const req = (method, body, q = inA) => new Request(`http://localhost/api/v1/x${q}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

/** One workspace with one search, one lead and one membership, in the real shape. */
function world(over = {}) {
  const role = over.role ?? "owner";
  const address = over.address === undefined ? "1 Main St, Austin, TX 78704" : over.address;
  return {
    memberships: member(role),
    billing_accounts: paying,
    tenants: [{ id: A, name: "Zilker Strength", timezone: "America/Chicago", slug: "harbor" }],
    tenant_config: [{ tenant_id: A, version: 1, config: { brain: {
      business_name: "Zilker Strength",
      booking_link: "https://book.example/zilker",
      system_prompt: "Answer as the front desk of Zilker Strength: brief and warm.",
      fallbacks: { greeting: "g", error: "e", non_text: "n" },
      profile: { ...(address ? { address } : {}), services: [{ name: "small-group training" }, { name: "one-to-one coaching" }] },
    } } }],
    lead_searches: [{ id: SEARCH, tenant_id: A, name: "Trainers", plan: PLAN, removed_at: null }],
    lead_searches_view: [view()],
    lead_search_members: [{ id: "m-1", search_id: SEARCH, lead_id: LEAD, tenant_id: A, blanked_at: null }],
    lead_counters: [
      { tenant_id: A, kind: "allowance", period: "2026-09", used: 14, reserved: 0 },
      { tenant_id: A, kind: "budget", period: "2026-09", used: 1.5, reserved: 0 },
    ],
    leads: [{
      id: LEAD, tenant_id: A, business_name: NAME, email: "hello@travisheightscoaching.example",
      email_state: over.emailState ?? "ok", stage: "ready", closed_reason: null, contact_id: null,
      place_id: "ChIJfixture0001", erased_at: null, blanked_at: null,
      category: "Personal trainer", city: "Austin", region: "TX", website_host: "travisheightscoaching.example", rating: 4.9, reviews: 61,
    }],
    lead_suggestions: over.suggestions ?? [],
    decisions: [],
    ...over.tables,
  };
}

/** One page row, exactly the columns `leads_page` answers (4.2). */
const pageRow = (over = {}) => ({
  member_id: "m-1", lead_id: LEAD, place_id: "ChIJfixture0001", search_id: SEARCH, round_id: R1, class: "qualified",
  excluded_by: null, fit: "strong", reason: "independent, in the area", distance_m: 2400, counted: true, counted_month: "2026-09",
  judgment: { op_id: OP, term: "personal trainer", model: "m", reasons: ["fit"], answer: { ref: 1, reason: "one address, no brand in the name", criteria: [{ key: "independent", answer: "pass", facts: ["name"] }] } },
  shares: [], business_name: NAME, category: "Personal trainer", street: "1400 S Congress Ave", city: "Austin", region: "TX", postal_code: "78704",
  lat: 30.24, lng: -97.75, website_host: "travisheightscoaching.example", instagram_url: null, phone_e164: "+15125550142", phone_sources: 2, phone_wrong: false,
  email: "hello@travisheightscoaching.example", email_alternates: [{ email: "careers@travisheightscoaching.example", why: "for job seekers" }],
  email_state: "ok", email_checked_at: "2026-09-19T12:00:00Z", rating: 4.9, reviews: 61, stage: "ready", closed_reason: null,
  last_outcome: null, last_note: null, contact_id: null, contacted_at: null, converted_at: null, exported_at: null,
  found_at: "2026-09-19T10:00:00Z", places: 1, version: 3, page_key: "0000123456", sort_key: "0000123456|m-1",
  ...over,
});

const COUNTS = { all: 322, ready: 272, nurture: 31, converted: 9, said_no: 6, not_a_fit: 4 };

let calls = [];
const rpcCalls = (name) => calls.filter((c) => c.name === name).map((c) => c.args);
/** Every door B's routes reach, answering the real shape and recording what it was asked. */
function doors(over = {}) {
  const seen = (name, fn) => (args) => { calls.push({ name, args }); return fn(args); };
  return {
    lead_set_stage: seen("lead_set_stage", over.lead_set_stage ?? ((a) => ({
      stage: a.p_outcome === "interested" ? "converted" : a.p_stage ?? "ready",
      closed_reason: a.p_reason ?? null,
      contact_id: a.p_outcome === "interested" ? CONTACT : null,
      existed: false,
      converted: a.p_outcome === "interested",
      op_id: OP,
      version: 4,
    }))),
    lead_bulk: seen("lead_bulk", over.lead_bulk ?? (() => ({ done: 2, op_id: OP, version: 1 }))),
    lead_erase: seen("lead_erase", over.lead_erase ?? (() => ({ erased: true, already: false }))),
    lead_export_mark: seen("lead_export_mark", over.lead_export_mark ?? (() => 1)),
    leads_page: seen("leads_page", over.leads_page ?? (() => [pageRow()])),
    lead_list_counts: seen("lead_list_counts", over.lead_list_counts ?? (() => COUNTS)),
    lead_niche_prior: seen("lead_niche_prior", over.lead_niche_prior ?? (() => ({ places: 1200, matched: 700, with_email: 406 }))),
    lead_search_rename: seen("lead_search_rename", over.lead_search_rename ?? ((a) => ({ search_id: a.p_search_id, name: a.p_name }))),
    lead_search_remove: seen("lead_search_remove", over.lead_search_remove ?? (() => ({ op_id: OP, version: 1, blanked: 40 }))),
    lead_search_undo: seen("lead_search_undo", over.lead_search_undo ?? (() => ({ removed: 3, credited: 2, op_id: OP, version: 1 }))),
  };
}

/** What the service wrote, held instead of sent: the one write in this module that is not the caller's own. */
let saved = [];

/** The model, faked: what it was asked is kept, and it answers the JSON its schema asks for. */
let modelCalls = [];
function fakeModel(answerOfPurpose = {}) {
  return async function* (call) {
    modelCalls.push(call);
    const said = answerOfPurpose[call.purpose] ?? (call.purpose === "lead_draft"
      ? { subject: "A question about your members", body: "Hi — we run small-group training two blocks away and often have people asking for one-to-one coaching. Worth a quick call?" }
      : { line: "a personal training studio in Austin", items: [{ words: "Chiropractors within 5 miles", who_for: "Partners · their patients often need a trainer next", category_key: "chiropractor" }] });
    yield { type: "text", index: 0, text: JSON.stringify(said) };
    yield { type: "stop", stopReason: "end_turn" };
  };
}

beforeEach(() => {
  calls = [];
  modelCalls = [];
  saved = [];
  setModelStream(fakeModel());
  setSuggestionsWriter(async (tenantId, row) => { saved.push({ tenantId, ...row }); });
});

test("release B's ten declare their policy: working a lead is the operator's, erasing, exporting, removing and giving leads back the owner's, and none of them spends", () => {
  assert.deepEqual(search.PATCH.policy, { kind: "write", scope: "row", role: "operator", rate: "lead_member", spend: false });
  assert.deepEqual(search.DELETE.policy, { kind: "write", scope: "row", role: "owner", rate: "lead_member", spend: false });
  assert.deepEqual(searchUndo.POST.policy, { kind: "write", scope: "row", role: "owner", rate: "lead_member", spend: false });
  assert.deepEqual(stage.POST.policy, { kind: "write", scope: "row", role: "operator", rate: "lead_member", spend: false });
  assert.deepEqual(draft.POST.policy, { kind: "write", scope: "row", role: "operator", rate: "lead_draft", spend: false });
  assert.deepEqual(erase.DELETE.policy, { kind: "write", scope: "row", role: "owner", rate: "erase", spend: false });
  assert.deepEqual(bulk.POST.policy, { kind: "write", scope: "workspace", role: "operator", rate: "lead_bulk", spend: false });
  assert.deepEqual(exportRoute.GET.policy, { kind: "read", scope: "workspace", role: "owner", rate: "export", spend: false });
  assert.deepEqual(suggestions.GET.policy, { kind: "read", scope: "workspace", role: null, rate: "lead_suggest", spend: false });
  assert.deepEqual(suggestions.PUT.policy, { kind: "write", scope: "workspace", role: "owner", rate: "lead_suggest", spend: false });
  // The money is release A's, and it is the only place `spend` is true.
  assert.deepEqual([searches.POST.policy.spend, more.POST.policy.spend], [true, true]);
});

test("a refusal to spend on a search says what the money was for, and the lines door keeps saying its own", () => {
  assert.equal(whyCannotSpend("stripe", "none", SPEND_LEADS), "Add a card before finding leads — nothing is charged until your trial ends.");
  assert.equal(whyCannotSpend("stripe", "none"), "Add a card before buying a number — nothing is charged until your trial ends.");
  assert.equal(whyCannotSpend("stripe", "unpaid", SPEND_LEADS), "Billing needs attention before this workspace can find leads. Open Billing to sort it out.");
  for (const status of ["none", "paused", "unpaid"]) {
    assert.equal(/buying a number|buy a number/.test(whyCannotSpend("stripe", status, SPEND_LEADS)), false, status);
  }
});

test("a stage change goes through the door with the page's words made its arguments, and a click to Talking says the lead is still a lead", async () => {
  const rpcs = doors();
  const click = await stage.POST.run(req("POST", { kind: "stage", stage: "converted" }), ctxOf(world({ role: "operator" }), { id: LEAD }, rpcs));
  assert.deepEqual(rpcCalls("lead_set_stage")[0], { p_lead_id: LEAD, p_stage: "converted", p_reason: null, p_fit_reason: null, p_outcome: null, p_note: null });
  assert.equal(click.toast, "Marked talking. They join People when they write or call in, or when a call goes well.");
  assert.deepEqual([click.converted, click.contact_id, click.undo], [false, null, { op_id: OP, version: 4 }]);
  const call = await stage.POST.run(req("POST", { kind: "outcome", outcome: "interested", note: "Tuesday" }), ctxOf(world({ role: "operator" }), { id: LEAD }, rpcs));
  assert.equal(call.toast, "Travis Heights Coaching Co. is in People now, with this call on their page.");
  assert.equal(call.undo, null, "a person made is not undone from a toast");
  assert.deepEqual(rpcCalls("lead_set_stage")[1], { p_lead_id: LEAD, p_stage: "converted", p_reason: null, p_fit_reason: null, p_outcome: "interested", p_note: "Tuesday" });
});

test("every other act on one lead says what it did, and Already a customer says the place is hidden", async () => {
  const rpcs = doors();
  const said = async (body) => (await stage.POST.run(req("POST", body), ctxOf(world({ role: "operator" }), { id: LEAD }, rpcs))).toast;
  assert.deepEqual(
    await Promise.all([
      said({ kind: "emailed" }),
      said({ kind: "said_no" }),
      said({ kind: "not_a_fit", why: "chain" }),
      said({ kind: "not_a_fit", why: "customer" }),
      said({ kind: "outcome", outcome: "voicemail" }),
      said({ kind: "outcome", outcome: "not_interested" }),
      said({ kind: "outcome", outcome: "wrong_number" }),
    ]),
    ["Marked contacted.", "Marked as said no.", "Not a fit.", "Hidden from every future search.", "Marked contacted.", "Marked as said no.", "That number is marked wrong."],
  );
  assert.deepEqual(rpcCalls("lead_set_stage")[3], { p_lead_id: LEAD, p_stage: "archived", p_reason: "customer", p_fit_reason: "customer", p_outcome: null, p_note: null });
  await refused(stage.POST.run(req("POST", { kind: "stage", stage: "archived" }), ctxOf(world({ role: "operator" }), { id: LEAD }, rpcs)), "validation", 400);
});

test("a viewer is refused every write; an operator may work leads but not erase, export or remove a search", async () => {
  const never = () => { throw new Error("must not be reached"); };
  const rpcs = doors({ lead_set_stage: never, lead_erase: never, leads_page: never, lead_export_mark: never, lead_search_remove: never });
  for (const [route, method, body, params, role] of [
    [stage, "POST", { kind: "said_no" }, { id: LEAD }, "viewer"],
    [erase, "DELETE", undefined, { id: LEAD }, "operator"],
    [exportRoute, "GET", undefined, {}, "operator"],
    [search, "DELETE", undefined, { id: SEARCH }, "operator"],
    [searchUndo, "POST", undefined, { id: SEARCH }, "operator"],
    [suggestions, "PUT", { business_line: "a personal training studio" }, {}, "operator"],
    [bulk, "POST", { by: "ids", action: "contacted", ids: [LEAD] }, {}, "viewer"],
  ]) await refused(route[method].run(req(method, body), ctxOf(world({ role }), params, rpcs)), "forbidden", 403);
  assert.deepEqual(calls, [], "not one door was reached");
});

test("a draft needs the business's address, its foot is code's, and the model is asked once with the lead's facts quoted", async () => {
  await assert.rejects(
    draft.POST.run(req("POST", {}), ctxOf(world({ role: "operator", address: null }), { id: LEAD }, doors())),
    (e) => e.message === LEAD_NO_ADDRESS,
  );
  assert.equal(modelCalls.length, 0, "no model call without an address");
  const out = await draft.POST.run(req("POST", {}), ctxOf(world({ role: "operator" }), { id: LEAD }, doors()));
  assert.ok(out.body.endsWith('Not interested? Reply "no thanks" and I won\'t write again.'), out.body);
  assert.ok(out.body.includes("Zilker Strength · 1 Main St, Austin, TX 78704"), "the postal address the law asks for");
  assert.equal(out.mailto.startsWith("mailto:hello%40travisheightscoaching.example?subject="), true);
  assert.deepEqual([modelCalls.length, modelCalls[0].purpose, modelCalls[0].request.max_tokens], [1, "lead_draft", 600]);
  assert.equal(modelCalls[0].request.output_config.format.type, "json_schema");
  const asked = JSON.stringify(modelCalls[0].request.messages);
  for (const fact of [NAME, "Austin, TX", "travisheightscoaching.example", "4.9 from 61 reviews", "small-group training"]) {
    assert.ok(asked.includes(fact), `the model is given ${fact}`);
  }
  assert.equal(/apify|compass|bounceverify/i.test(asked + modelCalls[0].request.system), false, "no vendor is named to the model or the owner");
  await assert.rejects(
    draft.POST.run(req("POST", {}), ctxOf(world({ role: "operator", emailState: "invalid" }), { id: LEAD }, doors())),
    (e) => e.message === "This lead has no address that reaches them. Call instead.",
  );
});

test("bulk acts on the ids, or on the view for Select all that match; the door gets one or the other", async () => {
  const rpcs = doors();
  await bulk.POST.run(req("POST", { by: "ids", action: "contacted", ids: [LEAD] }), ctxOf(world({ role: "operator" }), {}, rpcs));
  const out = await bulk.POST.run(req("POST", { by: "view", action: "not_a_fit", view: { list: "ready", sort: "fit", dir: "asc" } }), ctxOf(world({ role: "operator" }), {}, rpcs));
  assert.deepEqual(rpcCalls("lead_bulk").map((a) => [a.p_action, a.p_ids, a.p_view?.list]), [["contacted", [LEAD], undefined], ["not_a_fit", null, "ready"]]);
  assert.deepEqual([out.done, out.toast], [2, "Not a fit."]);
  await refused(bulk.POST.run(req("POST", { by: "ids", action: "contacted", ids: [] }), ctxOf(world({ role: "operator" }), {}, rpcs)), "validation", 400);
  await refused(bulk.POST.run(req("POST", { by: "view", action: "erase", view: { list: "ready" } }), ctxOf(world({ role: "operator" }), {}, rpcs)), "validation", 400);
});

test("the export is the owner's, on the ledger like contacts/export, and marks what it took", async () => {
  const tables = world({ role: "owner" });
  const rpcs = doors();
  const res = await exportRoute.GET.run(get(`${inA}&list=ready`), ctxOf(tables, {}, rpcs));
  assert.match(res.headers.get("content-disposition"), /^attachment; filename="leads-Zilker-Strength-\d{8}\.csv";/);
  assert.equal(rpcCalls("lead_export_mark").length, 1);
  assert.deepEqual(rpcCalls("lead_export_mark")[0], { p_tenant_id: A, p_ids: [LEAD] });
  assert.deepEqual(tables.decisions.map((d) => [d.verb, d.subject_type, d.payload.what, d.payload.rows]), [["export", "workspace", "leads", 1]]);
  const csv = await res.text();
  assert.equal(csv.split("\r\n")[0].replace("﻿", ""), "Business,What they do,Street,City,State,ZIP,Phone,Email,Mailbox,Website,About,Facebook,LinkedIn,Google Maps,Rating,Reviews,Stage,Why,Search,Found");
  assert.ok(csv.includes("Travis Heights Coaching Co."));
  assert.equal(/apify|compass|bounceverify|qualified/i.test(csv), false, "the file says what the owner would say, not what the database stores");
});

test("GET leads pages by the key the database answered, with the list, the class and the sort in SQL", async () => {
  const rpcs = doors();
  await leads.GET.run(get(`${inA}&list=ready&class=review&sort=rating&dir=desc&after_key=4.8&after_id=${LEAD}`), ctxOf(world({ role: "viewer" }), {}, rpcs));
  assert.deepEqual(rpcCalls("leads_page")[0], { p_tenant_id: A, p_search_id: null, p_class: "review", p_sort: "rating", p_after_key: "4.8", p_limit: 500, p_list: "ready", p_dir: "desc", p_after_id: LEAD });
  assert.equal(rpcCalls("lead_list_counts").length, 0, "a later page does not re-count the rail");
  const first = await leads.GET.run(get(`${inA}&search=${SEARCH}&limit=1`), ctxOf(world({ role: "viewer" }), {}, rpcs));
  assert.deepEqual(rpcCalls("leads_page")[1].p_search_id, SEARCH);
  assert.deepEqual(first.counts, COUNTS, "the first page brings the rail's numbers with it");
  assert.deepEqual(first.next, { key: "0000123456", id: "m-1" }, "a full page hands back where the database got to");
  assert.equal(first.rows.length, 1);
});

test("a row says what was seen and what Claude read, and wears the name of the search that found it", async () => {
  const rpcs = doors();
  const out = await leads.GET.run(get(inA), ctxOf(world({ role: "viewer" }), {}, rpcs));
  const r = out.rows[0];
  assert.deepEqual(
    [r.id, r.search_name, r.postal_code, r.phone_agrees, r.website, r.member.class, r.member.fit],
    [LEAD, "Trainers", "78704", true, "travisheightscoaching.example", "qualified", "strong"],
  );
  assert.deepEqual(r.member.other_emails, [{ email: "careers@travisheightscoaching.example", why: "for job seekers" }]);
  assert.deepEqual(r.member.reasons, ["fit"], "the class rule's own reason tokens ride the row, for the Needs review queue (D3)");
  const checks = Object.fromEntries(r.member.checks.map((c) => [c.key, [c.how, c.answer]]));
  assert.deepEqual(checks.on_maps, ["seen", "yes"]);
  assert.deepEqual(checks.mailbox, ["seen", "yes"]);
  assert.deepEqual(checks.phone_two_sources, ["seen", "yes"]);
  assert.deepEqual(checks.independent, ["read", "yes"], "the plan asked for it, so the judge's answer is quoted");
  assert.equal(checks.right_kind, undefined, "nobody asked, so nothing is claimed");
  assert.equal(r.member.checks.find((c) => c.key === "independent").reason, "one address, no brand in the name");
  const one = await leads.GET.run(get(inA), ctxOf(world({ role: "viewer" }), {}, doors({ leads_page: () => [pageRow({ phone_sources: 1, email_state: "catch_all" })] })));
  const seen = Object.fromEntries(one.rows[0].member.checks.map((c) => [c.key, c.answer]));
  assert.deepEqual([seen.phone_two_sources, seen.mailbox], ["unknown", "unknown"], "one source and a catch-all server cannot tell, and say so");
});

test("the searches read brings the rail's counts with it, and a round says whether it is stopping", async () => {
  const rpcs = doors();
  const tables = world({ role: "viewer" });
  tables.lead_searches_view = [view({ ending_pending: "stopped", waiting_since: "2026-09-19T11:00:00Z", ended_at: null, emails_checked: 41, with_phone: 72, undo_op_id: null, undo_version: null })];
  const out = await searches.GET.run(get(inA), ctxOf(tables, {}, rpcs));
  assert.deepEqual(out.counts, COUNTS);
  assert.deepEqual(
    [out.searches[0].id, out.searches[0].asked_on, out.searches[0].round.ending_pending, out.searches[0].round.emails_checked, out.searches[0].round.with_phone],
    [SEARCH, "2026-09-19T00:00:00Z", true, 41, 72],
  );
  tables.lead_searches_view = [view({ ending_pending: null })];
  const done = await searches.GET.run(get(inA), ctxOf(tables, {}, rpcs));
  assert.equal(done.searches[0].round.ending_pending, false, "a round with no pending ending is not stopping");
});

test("a kept search is renamed, removed with the worked leads kept, or has its finished round's leads given back", async () => {
  const rpcs = doors();
  assert.deepEqual(await search.PATCH.run(req("PATCH", { name: "Austin trainers" }), ctxOf(world({ role: "operator" }), { id: SEARCH }, rpcs)), { name: "Austin trainers" });
  const tables = world({ role: "owner" });
  // The door blanks the rest; what is left unblanked IS what was kept, and the toast counts the database's own rows.
  tables.lead_search_members = [
    { id: "m-1", search_id: SEARCH, lead_id: LEAD, tenant_id: A, blanked_at: null },
    { id: "m-2", search_id: SEARCH, lead_id: "l-2", tenant_id: A, blanked_at: null },
    { id: "m-3", search_id: SEARCH, lead_id: "l-3", tenant_id: A, blanked_at: "2026-09-19T00:00:00Z" },
  ];
  const gone = await search.DELETE.run(req("DELETE", undefined), ctxOf(tables, { id: SEARCH }, rpcs));
  assert.deepEqual([gone.archived, gone.kept, gone.toast], [40, 2, "Removed. The 2 you contacted or are talking to are kept."]);
  const back = await searchUndo.POST.run(req("POST", undefined), ctxOf(world({ role: "owner" }), { id: SEARCH }, rpcs));
  assert.deepEqual([back.removed, back.credited, back.op_id], [3, 2, OP]);
  assert.equal(back.toast, "Took back 3 leads. 2 went back to this month's leads.");
  assert.deepEqual(rpcCalls("lead_search_undo")[0], { p_search_id: SEARCH });
});

test("the Done strip's Undo says why it cannot, in the owner's words, for each of the door's three refusals", async () => {
  const of = (error) => searchUndo.POST.run(req("POST", undefined), ctxOf(world({ role: "owner" }), { id: SEARCH }, doors({ lead_search_undo: () => ({ error }) })));
  await assert.rejects(of("running"), /still running, so there is nothing to take back yet/);
  await assert.rejects(of("too_late"), /more than a day ago, so these leads stay yours and stay counted/);
  await assert.rejects(of("removed"), /This search was removed/);
  await refused(of("running"), "conflict", 409);
});

test("erasing a lead is the owner's, final, and on the ledger once however often it is asked", async () => {
  const tables = world({ role: "owner" });
  const rpcs = doors();
  assert.deepEqual(await erase.DELETE.run(req("DELETE", undefined), ctxOf(tables, { id: LEAD }, rpcs)), { erased: true, already: false });
  assert.deepEqual(tables.decisions.map((d) => [d.verb, d.subject_type, d.subject_id]), [["erase", "lead", LEAD]]);
  const again = await erase.DELETE.run(req("DELETE", undefined), ctxOf(tables, { id: LEAD }, doors({ lead_erase: () => ({ erased: true, already: true }) })));
  assert.deepEqual(again, { erased: true, already: true });
  assert.equal(tables.decisions.length, 1, "a second request is answered, not recorded again");
  await refused(erase.DELETE.run(req("DELETE", undefined), ctxOf(world({ role: "owner" }), { id: "nope" }, rpcs)), "not_found", 404);
});

test("the first day's suggestions are asked once a week, carry how reachable each kind is, and a model that will not answer is a note", async () => {
  const rpcs = doors();
  const fresh = await suggestions.GET.run(get(inA), ctxOf(world({ role: "owner" }), {}, rpcs));
  assert.deepEqual([modelCalls.length, modelCalls[0].purpose, modelCalls[0].request.max_tokens], [1, "lead_suggest", 400]);
  assert.equal(fresh.business_line, "a personal training studio in Austin");
  assert.deepEqual(fresh.items[0].reach, "About 6 in 10 have an email");
  const kept = [{ tenant_id: A, business_line: "a personal training studio in Denver", by_owner: true, made_at: new Date().toISOString(), items: [{ words: "Chiropractors", who_for: "Partners", category_key: "chiropractor" }] }];
  modelCalls = [];
  const again = await suggestions.GET.run(get(inA), ctxOf(world({ role: "owner", suggestions: kept }), {}, rpcs));
  assert.deepEqual([modelCalls.length, again.by_owner, again.business_line], [0, true, "a personal training studio in Denver"], "a week's cache is one model call a week");
  assert.deepEqual(saved, [{ tenantId: A, business_line: "a personal training studio in Austin", by_owner: false, items: [{ words: "Chiropractors within 5 miles", who_for: "Partners · their patients often need a trainer next", category_key: "chiropractor" }] }]);
  const stale = [{ ...kept[0], made_at: "2026-09-01T00:00:00Z" }];
  await suggestions.GET.run(get(inA), ctxOf(world({ role: "owner", suggestions: stale }), {}, rpcs));
  assert.equal(modelCalls.length, 1, "eight days old, so it is asked again");
  // eslint-disable-next-line require-yield -- the gateway refuses before it streams a first block
  setModelStream(async function* () { throw new GatewayRefused({ kind: "budget", used: 1, cap: 1 }); });
  const note = await suggestions.GET.run(get(inA), ctxOf(world({ role: "owner" }), {}, rpcs));
  assert.deepEqual([note.items, note.note], [[], "Suggestions are not available right now."], "the page still draws");
  assert.equal(/apify|compass|anthropic|claude-opus/i.test(JSON.stringify(note)), false);
});

test("a kind of business nobody has searched says so, and never a share from too little evidence", async () => {
  const thin = doors({ lead_niche_prior: () => ({ places: 30, matched: 12, with_email: 9 }) });
  const out = await suggestions.GET.run(get(inA), ctxOf(world({ role: "owner" }), {}, thin));
  assert.equal(out.items[0].reach, "New kind of search · checked after 25");
  const none = doors({ lead_niche_prior: () => null });
  const empty = await suggestions.GET.run(get(inA), ctxOf(world({ role: "owner" }), {}, none));
  assert.equal(empty.items[0].reach, "New kind of search · checked after 25");
});

test("the owner's own business line is saved with no suggestions, so the next read asks again", async () => {
  const rpcs = doors();
  const out = await suggestions.PUT.run(req("PUT", { business_line: "a personal training studio in Denver" }), ctxOf(world({ role: "owner" }), {}, rpcs));
  assert.deepEqual(out, { business_line: "a personal training studio in Denver" });
  assert.deepEqual(saved, [{ tenantId: A, business_line: "a personal training studio in Denver", by_owner: true, items: [] }], "saved with no suggestions, so the next read asks Claude again");
  await refused(suggestions.PUT.run(req("PUT", { business_line: "no" }), ctxOf(world({ role: "owner" }), {}, rpcs)), "validation", 400);
});

test("the plan card's facts are the month's own numbers and what past searches measured, and a kind nobody searched has no prior", async () => {
  const rpcs = doors();
  const ctx = ctxOf(world({ role: "owner" }), {}, rpcs);
  const bare = await planFacts(ctx, A);
  assert.deepEqual([bare.dupes, bare.leadsLeft, bare.prior, bare.priorOf, bare.cannotSee, bare.nearby], [322, 486, null, null, null, []]);
  assert.equal(bare.renewsOn, "Oct 1", "the month the leads come back");
  // The two caps are sized to run out together (500 leads for $25), so which
  // binds is which one this workspace is nearer: $1.50 spent on 14 leads is
  // above that rate, so the money runs out first.
  assert.equal(bare.bound, "budget");
  const slow = world({ role: "owner" });
  slow.lead_counters = [{ tenant_id: A, kind: "allowance", period: "2026-09", used: 400, reserved: 0 }, { tenant_id: A, kind: "budget", period: "2026-09", used: 5, reserved: 0 }];
  assert.deepEqual([(await planFacts(ctxOf(slow, {}, rpcs), A)).bound, (await planFacts(ctxOf(slow, {}, rpcs), A)).leadsLeft], ["allowance", 100], "400 of the month's leads found for $5: the leads bind first");
  // The card's area picker offers areas, not words: what it hands the plan is
  // what a round would be started with.
  const southAustin = { kind: "city", label: "South Austin, TX", state: "TX", center: { lat: 30.2276, lng: -97.7713 }, radius_m: 15_000, query: "South Austin, TX, USA" };
  const withPrior = await planFacts(ctx, A, { categoryKey: "personal_trainer", nearby: [southAustin] });
  assert.deepEqual(withPrior.prior, { places: 1200, matched: 700, with_email: 406 });
  assert.deepEqual([withPrior.priorOf, withPrior.nearby], ["personal_trainer", [southAustin]]);
  const spent = world({ role: "owner" });
  spent.lead_counters = [{ tenant_id: A, kind: "allowance", period: "2026-09", used: 10, reserved: 0 }, { tenant_id: A, kind: "budget", period: "2026-09", used: 24, reserved: 0 }];
  assert.equal((await planFacts(ctxOf(spent, {}, rpcs), A)).bound, "budget", "the money runs out before the leads do");
  const reserved = world({ role: "owner" });
  reserved.lead_counters = [{ tenant_id: A, kind: "allowance", period: "2026-09", used: 480, reserved: 40 }];
  assert.equal((await planFacts(ctxOf(reserved, {}, rpcs), A)).leadsLeft, 0, "a reservation above the cap is no room, never a negative");
  const untouched = world({ role: "owner" });
  untouched.lead_counters = [];
  assert.deepEqual([(await planFacts(ctxOf(untouched, {}, rpcs), A)).bound, (await planFacts(ctxOf(untouched, {}, rpcs), A)).leadsLeft], [null, 500]);
});

test("the mailto encodes each part once, keeps a quote and an ampersand, and breaks lines the way a mail app reads them", () => {
  const m = leadMailto("hello@zilkerstrength.example", "Coffee & a question", 'Hi Dana,\nOne idea "for you".');
  assert.equal(m, "mailto:hello%40zilkerstrength.example?subject=Coffee%20%26%20a%20question&body=Hi%20Dana%2C%0D%0AOne%20idea%20%22for%20you%22.");
  const foot = leadDraftFooter("Melany's Beauty Salon", "1 Main St, Austin, TX 78701");
  const once = leadMailto("a@b.example", "s", `Hi.${foot}`);
  assert.equal(once, leadMailto("a@b.example", "s", `Hi.${foot}`.replace(/\n/g, "\r\n")), "a body that already carries CRLF is not doubled");
});
