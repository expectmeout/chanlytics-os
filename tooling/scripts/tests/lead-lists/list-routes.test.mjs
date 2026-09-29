/**
 * A list of your own, through its routes (Reach out Part 7: J3, J5-J7, J9), run through route(): the real route
 * modules, their `run` called with a database in memory whose rpcs answer as 00242's functions do. What is proved is
 * the policy each declares, what each hands its door (the estimate included), that a body past its limits never
 * reaches the door, that the door's refusal is said in its own words, and that Find new ones refuses a list.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";
import { LEAD_IMPORT_WORDS, leadImportEstimateUsd } from "@chanlytics/contracts";
import { PLAN } from "../_lead-fixtures.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const importRoute = await import(at("apps/dashboard/app/api/v1/lead-searches/import/route.ts"));
const chosenRoute = await import(at("apps/dashboard/app/api/v1/lead-searches/chosen/route.ts"));
const more = await import(at("apps/dashboard/app/api/v1/lead-searches/[id]/more/route.ts"));

beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const S1 = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const R1 = "bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb";
const L1 = "cccccccc-1111-4111-8111-cccccccccccc";
const USER = "u1";
const inA = `?workspace=${A}`;
const tables = (role, over = {}) => ({
  memberships: [{ user_id: USER, tenant_id: A, role, tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" }],
  billing_accounts: [{ tenant_id: A, mode: "direct", status: "active" }],
  ...over,
});
const ctxFor = (role, rpcs = {}, params = {}, over = {}) => ({
  supabase: fakeDb(tables(role, over), {}, rpcs),
  userId: USER,
  email: "ada@example.com",
  // Past the second factor (0013): a partner's seat asks for it.
  aal: "aal2",
  params,
});
const send = (body) => new Request(`http://localhost/api/v1/x${inA}`, { method: "POST", body: JSON.stringify(body) });
async function refused(p, code, status, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    if (status) assert.equal(e.status, status, e.message);
    if (words) assert.equal(e.message, words);
    return true;
  });
}
const row = (i) => ({
  name: `Gym ${i}`,
  email: `gym${i}@example.com`,
  phone: null,
  website_host: null,
  city: "Austin",
  region: "TX",
  category: null,
});
const IMPORTED = {
  search_id: S1,
  round_id: R1,
  added: 2,
  checking: 2,
  counted: 0,
  left_out: { unreadable: 0, twice: 0, customer: 0, never_again: 0 },
};

test("the two routes declare their policy: an import is the finder's and spends; a choice is an operator's and does not", () => {
  assert.deepEqual(
    { ...importRoute.POST.policy },
    { kind: "write", scope: "workspace", role: "partner", rate: "lead_search", spend: true },
  );
  assert.deepEqual(
    { ...chosenRoute.POST.policy },
    { kind: "write", scope: "workspace", role: "operator", rate: "lead_bulk", spend: false },
  );
});

test("POST lead-searches/import hands the door the rows and the check's estimate, and answers what it did", async () => {
  const seen = [];
  const rpcs = { lead_search_import: (a) => (seen.push(a), IMPORTED) };
  const out = await importRoute.POST.run(
    send({ name: "Expo gyms", asked: "gyms I met", rows: [row(1), row(2)] }),
    ctxFor("owner", rpcs),
  );
  assert.deepEqual(out, IMPORTED);
  assert.deepEqual(seen, [
    {
      p_tenant_id: A,
      p_name: "Expo gyms",
      p_asked: "gyms I met",
      p_rows: [row(1), row(2)],
      p_estimate_usd: leadImportEstimateUsd(2),
    },
  ]);
  assert.equal(leadImportEstimateUsd(2), 0.5, "never under the checker run's floor");
  assert.equal(leadImportEstimateUsd(500), 0.58, "a cent an address at most, with the margin");
  // A partner imports too; an operator may not, and the door is never asked.
  await importRoute.POST.run(send({ name: "Expo gyms", rows: [row(1)] }), ctxFor("partner", rpcs));
  assert.equal(seen.at(-1).p_asked, "", "no line about them: the door uses the name");
  const asked = seen.length;
  await refused(
    importRoute.POST.run(send({ name: "Expo gyms", rows: [row(1)] }), ctxFor("operator", rpcs)),
    "forbidden",
    403,
  );
  assert.equal(seen.length, asked);
});

test("an import past its limits never reaches the door", async () => {
  const seen = [];
  const rpcs = { lead_search_import: (a) => (seen.push(a), IMPORTED) };
  const many = Array.from({ length: 501 }, (_, i) => row(i));
  await refused(importRoute.POST.run(send({ name: "Too many", rows: many }), ctxFor("owner", rpcs)), "validation", 400);
  await refused(importRoute.POST.run(send({ name: "", rows: [row(1)] }), ctxFor("owner", rpcs)), "validation", 400);
  await refused(importRoute.POST.run(send({ name: "No rows", rows: [] }), ctxFor("owner", rpcs)), "validation", 400);
  await refused(
    importRoute.POST.run(send({ name: "No name", rows: [{ ...row(1), name: "" }] }), ctxFor("owner", rpcs)),
    "validation",
    400,
  );
  assert.deepEqual(seen, []);
});

test("the door's refusal is said in its own words", async () => {
  const sentence = "This list has 3 addresses to check and you have 1 lead left this month.";
  const rpcs = { lead_search_import: () => ({ error: "month_leads_used", left: 1, sentence }) };
  await refused(
    importRoute.POST.run(send({ name: "Expo", rows: [row(1)] }), ctxFor("owner", rpcs)),
    "conflict",
    409,
    sentence,
  );
  const nothing = {
    lead_search_choose: () => ({ error: "nothing", sentence: "None of these can be written to yet." }),
  };
  await refused(
    chosenRoute.POST.run(send({ name: "12 chosen", lead_ids: [L1] }), ctxFor("operator", nothing)),
    "conflict",
    409,
    "None of these can be written to yet.",
  );
});

test("POST lead-searches/chosen hands the door the chosen ids; a viewer may not; ids are ids, at most 500", async () => {
  const seen = [];
  const answer = { search_id: S1, round_id: R1, counted: 1, left_out: { not_counted: 0, no_email: 0, gone: 0 } };
  const rpcs = { lead_search_choose: (a) => (seen.push(a), answer) };
  assert.deepEqual(
    await chosenRoute.POST.run(send({ name: "1 chosen on Sep 28", lead_ids: [L1] }), ctxFor("operator", rpcs)),
    answer,
  );
  assert.deepEqual(seen, [{ p_tenant_id: A, p_name: "1 chosen on Sep 28", p_lead_ids: [L1] }]);
  await refused(chosenRoute.POST.run(send({ name: "x", lead_ids: [L1] }), ctxFor("viewer", rpcs)), "forbidden", 403);
  await refused(
    chosenRoute.POST.run(send({ name: "x", lead_ids: ["not-an-id"] }), ctxFor("operator", rpcs)),
    "validation",
    400,
  );
  const many = Array.from({ length: 501 }, () => L1);
  await refused(chosenRoute.POST.run(send({ name: "x", lead_ids: many }), ctxFor("operator", rpcs)), "validation", 400);
  assert.equal(seen.length, 1);
});

test("Find new ones refuses a list of your own before its door, in words", async () => {
  const view = (via) => ({
    id: S1,
    tenant_id: A,
    name: "Expo gyms",
    asked: "",
    via,
    plan: PLAN,
    removed_at: null,
    created_at: "2026-09-19T00:00:00Z",
    round_id: R1,
    seq: 1,
    purpose: "main",
    state: "ended",
    ending: "target_reached",
    counted: 3,
  });
  for (const via of ["import", "chosen"]) {
    const seen = [];
    const rpcs = { lead_search_more: (a) => (seen.push(a), { round_id: R1 }) };
    await refused(
      more.POST.run(
        send({ purpose: "topup", plan: PLAN }),
        ctxFor("owner", rpcs, { id: S1 }, { lead_searches_view: [view(via)] }),
      ),
      "conflict",
      409,
      LEAD_IMPORT_WORDS.searchAgain,
    );
    assert.deepEqual(seen, [], `a ${via} list's door is never asked`);
  }
  // A finder's search still takes it.
  const seen = [];
  const rpcs = { lead_search_more: (a) => (seen.push(a), { round_id: R1 }) };
  await more.POST.run(
    send({ purpose: "topup", plan: PLAN }),
    ctxFor("owner", rpcs, { id: S1 }, { lead_searches_view: [view("people")] }),
  );
  assert.equal(seen.length, 1);
});
