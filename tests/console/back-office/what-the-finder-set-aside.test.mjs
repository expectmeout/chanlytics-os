/**
 * What the finder set aside (decision 0133, step 4): a search shows its owner its finished leads alone, so the places it
 * judged and did not count are the team's to read, in the Console's workspace page under Leads set aside. The route
 * runs on the platform scope over the service client in memory: a workspace's searches the finder ran, each with what it
 * counted, set aside and spent, and the places one of them set aside, worded as the Leads page words them.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/shared/rate-limit.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/shared/service-db.ts"));
const setAside = await import(at("apps/dashboard/app/api/v1/platform/tenants/[id]/set-aside/route.ts"));
const { CONSOLE_WORKSPACE_TABS, CONSOLE_WORKSPACE_TAB_WORDS, consolePathOf } = await import("@chanlytics/contracts");

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const S1 = "51000000-0000-4000-8000-000000000001";
const S2 = "51000000-0000-4000-8000-000000000002";
const LIST = "51000000-0000-4000-8000-000000000003";
const PLAN = {
  name: "med spas",
  exclusions: [{ key: "chains", text: "Chains", origin: "claude" }],
  criteria: [{ key: "site", text: "With a website", standard: "seen", required: true }],
};
const view = (id, via, created_at, counts) => ({
  id,
  tenant_id: A,
  via,
  name: `Search ${id.slice(-1)}`,
  asked: "med spas",
  plan: PLAN,
  removed_at: null,
  created_at,
  round_id: `${id}-r`,
  seq: 1,
  purpose: "probe",
  state: "ended",
  ending: "target_reached",
  counted: counts[0],
  qualified: counts[0],
  review: counts[1],
  excluded: counts[2],
  emails_checked: 0,
  with_phone: 0,
});
const member = (search_id, cls, excluded_by, name, term, created_at) => ({
  tenant_id: A,
  search_id,
  class: cls,
  excluded_by,
  created_at,
  judgment: { term },
  lead: { business_name: name },
});

let tables;
beforeEach(() => {
  setRateStore(memoryStore());
  tables = {
    lead_searches_view: [
      view(S1, "ask", "2026-11-14T10:00:00Z", [40, 2, 3]),
      view(S2, "people", "2026-11-13T10:00:00Z", [10, 0, 1]),
      view(LIST, "import", "2026-11-14T11:00:00Z", [5, 5, 0]),
    ],
    lead_rounds: [
      { tenant_id: A, search_id: S1, cost_usd: 1.2, judge_usd: 0.05 },
      { tenant_id: A, search_id: S1, cost_usd: 0.4, judge_usd: 0.004 },
      { tenant_id: A, search_id: S2, cost_usd: 0.3, judge_usd: 0 },
    ],
    lead_search_members: [
      member(S1, "excluded", "chains", "Glow Chain", "med spa", "2026-11-14T10:05:00Z"),
      member(S1, "review", null, "Quiet Spa", "medical spa", "2026-11-14T10:06:00Z"),
      member(S1, "excluded", "site", "No Site Spa", "med spa", "2026-11-14T10:07:00Z"),
      member(S1, "qualified", null, "Counted Spa", "med spa", "2026-11-14T10:08:00Z"),
      member(S2, "excluded", "chains", "Other Chain", "med spa", "2026-11-13T10:05:00Z"),
    ],
  };
  setServiceClient(fakeDb(tables));
});
afterEach(() => setServiceClient(null));

const ctxFor = (yes, params) => ({
  supabase: fakeDb({}, {}, { platform_staff_state: () => (yes ? "owner" : "none") }),
  userId: "u1",
  email: "ada@example.com",
  params,
});
const get = (q = "") => new Request(`http://localhost/api/v1/x${q}`);

test("a workspace's searches the finder ran, newest first, each with what it counted, set aside and spent; a list of the owner's own is not one", async () => {
  const out = await setAside.GET.run(get(), ctxFor(true, { id: A }));
  assert.deepEqual(
    out.searches.map((s) => [s.id, s.counted, s.review + s.excluded, s.cost_usd]),
    [
      [S1, 40, 5, 1.65],
      [S2, 10, 1, 0.3],
    ],
  );
  assert.equal(out.search_id, S1, "the newest opens first");
});

test("the places a search set aside, each with why in the Leads page's own words and the term that found it; what counted is not among them", async () => {
  const out = await setAside.GET.run(get(), ctxFor(true, { id: A }));
  assert.deepEqual(
    out.places.map((p) => [p.name, p.why, p.term]),
    [
      ["No Site Spa", "With a website", "med spa"],
      ["Quiet Spa", "Needs review", "medical spa"],
      ["Glow Chain", "Chains", "med spa"],
    ],
  );
  const other = await setAside.GET.run(get(`?search=${S2}`), ctxFor(true, { id: A }));
  assert.equal(other.search_id, S2);
  assert.deepEqual(
    other.places.map((p) => p.name),
    ["Other Chain"],
  );
});

test("the team's alone: on the platform scope, refused to anyone else, and a tab of its own on the workspace's page", async () => {
  assert.deepEqual(setAside.GET.policy, { kind: "read", scope: "platform", role: null, rate: null, spend: false });
  await assert.rejects(setAside.GET.run(get(), ctxFor(false, { id: A })), (e) => e.status === 403 || e.status === 404);
  assert.ok(CONSOLE_WORKSPACE_TABS.includes("leads"));
  assert.equal(CONSOLE_WORKSPACE_TAB_WORDS.leads, "Leads set aside");
  assert.match(consolePathOf("workspaces", "harbor", "leads"), /harbor.*leads/);
});
