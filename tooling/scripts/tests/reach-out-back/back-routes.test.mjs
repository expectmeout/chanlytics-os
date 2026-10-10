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
import { fieldsOf, logLineOf } from "../_log-lines.mjs";
import { REACH_OUT_REFUSALS } from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const report = await import(at("apps/dashboard/app/api/v1/reports/reach-outs/route.ts"));
const leads = await import(at("apps/dashboard/app/api/v1/reach-outs/leads/route.ts"));
const stop = await import(at("apps/dashboard/app/api/v1/reach-outs/leads/[id]/stop/route.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/service-db.ts"));

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
      // 00363: each chain's own totals over the report's window, by its root: none wrote here.
      reach_out_chain_totals: rec("reach_out_chain_totals", {}),
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

/** What a set of doors was asked, by the function's name: the report and the chains' totals are asked together. */
const byName = (asked) => [...asked].sort((a, b) => a[0].localeCompare(b[0]));
/** The lines `event` was logged with while `fn` ran, by their fields, and what `fn` answered. */
async function logged(event, fn) {
  const lines = [];
  const was = { error: console.error, warn: console.warn };
  console.error = console.warn = (...args) => {
    const line = logLineOf(args);
    if (line?.event === event) lines.push(fieldsOf(line));
  };
  try {
    return { result: await fn(), lines };
  } finally {
    console.error = was.error;
    console.warn = was.warn;
  }
}
/** A report with one chain of its own, whose one step wrote to three businesses and heard back from one. */
const ONE_CHAIN = {
  days: 30,
  has_reach_out: true,
  chains: [
    {
      root_id: "r1",
      name: "A",
      state: "running",
      search: null,
      last_at: null,
      runs: 1,
      steps: [{ id: "r1", n: 0, written: 3, wrote_back: 1 }],
    },
  ],
};

test("GET reports/reach-outs reads the report and every chain's totals over one window: a period ends today and names no day, days a member picked name their last day to both, and a window it cannot read is refused in its words before either is asked", async () => {
  const d = doors();
  const out = await report.GET.run(get("&period=7d"), ctxFor(tables("viewer"), {}, d.rpcs));
  assert.deepEqual(out, {
    report: { days: 30, has_reach_out: true, chains: [] },
    chains: { complete: true, by_root: {} },
  });
  assert.deepEqual(byName(d.asked), [
    ["reach_out_chain_totals", { p_tenant_id: A, p_days: 7 }],
    ["reach_out_report", { p_tenant_id: A, p_days: 7 }],
  ]);
  const thirty = doors();
  await report.GET.run(get(), ctxFor(tables("viewer"), {}, thirty.rpcs));
  assert.deepEqual(
    byName(thirty.asked),
    [
      ["reach_out_chain_totals", { p_tenant_id: A, p_days: 30 }],
      ["reach_out_report", { p_tenant_id: A, p_days: 30 }],
    ],
    "thirty days by default, to both",
  );
  // Days long past, whatever today is: twenty of them, to the 20th, so the chains count the report's own days.
  const picked = doors();
  await report.GET.run(get("&from=2026-01-01&to=2026-01-20"), ctxFor(tables("viewer"), {}, picked.rpcs));
  assert.deepEqual(byName(picked.asked), [
    ["reach_out_chain_totals", { p_tenant_id: A, p_days: 20, p_end: "2026-01-20" }],
    ["reach_out_report", { p_tenant_id: A, p_days: 20, p_end: "2026-01-20" }],
  ]);
  const none = doors();
  const over = (q) => report.GET.run(get(q), ctxFor(tables("viewer"), {}, none.rpcs));
  await refused(over("&period=14d"), "validation", 400);
  await refused(over("&from=2999-01-01&to=2999-01-05"), "validation", 400, "A report ends today at the latest.");
  await refused(
    over("&from=2026-01-01"),
    "validation",
    400,
    "from and to are a first and a last day together, written YYYY-MM-DD, with no period beside them.",
  );
  assert.deepEqual(none.asked, [], "nothing asked of the database for a window it would not read");
});

test("GET reports/reach-outs answers its reader's payload; where the chains' totals cannot be read the report's own chains stand in, as not every chain: a database without the function quietly, a read that fails said in the log; only the report's own failure is the route's", async () => {
  const { load, readerContext } = await import(at("apps/dashboard/src/server/readers/index.ts"));
  const { reachOutReport } = await import(at("apps/dashboard/src/server/readers/campaign-report.ts"));
  const d = doors({
    reach_out_report: () => ONE_CHAIN,
    reach_out_chain_totals: () => ({
      r1: { written: 3, wrote_back: 1, last_at: null },
      r2: { written: 0, wrote_back: 0, last_at: null },
    }),
  });
  const page = await report.GET.run(get("&period=30d"), ctxFor(tables("viewer"), {}, d.rpcs));
  const read = await load(
    readerContext(ctxFor(tables("viewer"), {}, d.rpcs), { tenantId: A, role: "viewer" }),
    reachOutReport,
    {
      days: 30,
      end: null,
    },
  );
  assert.deepEqual(read.data, page, "the route's payload is the reader's");
  assert.deepEqual(read.rows, [], "no row of its own: it is drawn on Reports");
  assert.deepEqual(
    page.chains,
    { complete: true, by_root: { r1: { written: 3, wrote_back: 1 }, r2: { written: 0, wrote_back: 0 } } },
    "every chain, the one past the report's own among them",
  );
  // A database before 00363: PostgREST does not know the function. The report's own chains, summed, and no line.
  const missing = doors({
    reach_out_report: () => ONE_CHAIN,
    reach_out_chain_totals: () => {
      throw Object.assign(new Error("Could not find the function public.reach_out_chain_totals"), { code: "PGRST202" });
    },
  });
  const old = await logged("reach_out_chain_totals_read_failed", () =>
    report.GET.run(get("&period=30d"), ctxFor(tables("viewer"), {}, missing.rpcs)),
  );
  assert.deepEqual(old.result.chains, { complete: false, by_root: { r1: { written: 3, wrote_back: 1 } } });
  assert.deepEqual(old.lines, [], "a function not there yet is no failure");
  // A chains' read that fails (a member's statement past its 8 seconds) is no missing function: the report still answers,
  // its own chains said as not every chain, and the failure is logged, never thrown at the section.
  const slow = doors({
    reach_out_report: () => ONE_CHAIN,
    reach_out_chain_totals: () => {
      throw Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" });
    },
  });
  const timedOut = await logged("reach_out_chain_totals_read_failed", () =>
    report.GET.run(get("&period=30d"), ctxFor(tables("viewer"), {}, slow.rpcs)),
  );
  assert.deepEqual(timedOut.result.report, ONE_CHAIN, "the report answers whatever the totals do");
  assert.deepEqual(timedOut.result.chains, { complete: false, by_root: { r1: { written: 3, wrote_back: 1 } } });
  assert.deepEqual(timedOut.lines, [
    { tenant_id: A, error: "reach_out_chain_totals: canceling statement due to statement timeout" },
  ]);
  // An answer of the wrong shape is no count: every chain says "—" rather than a number nobody counted.
  const odd = doors({ reach_out_report: () => ONE_CHAIN, reach_out_chain_totals: () => ({ r1: { written: "3" } }) });
  assert.equal((await report.GET.run(get("&period=30d"), ctxFor(tables("viewer"), {}, odd.rpcs))).chains, null);
  // The report's own read is the section: its failure is the route's, whatever the totals answered.
  const down = doors({
    reach_out_report: () => {
      throw Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" });
    },
  });
  await assert.rejects(
    report.GET.run(get("&period=30d"), ctxFor(tables("viewer"), {}, down.rpcs)),
    /canceling statement/,
  );
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
  // The ledger is written as the service role (a session may not insert into events): stood in, and read below.
  const ledger = { events: [] };
  setServiceClient(fakeDb(ledger));

  const out = await stop.POST.run(post(), ctxFor(tables("operator"), { id: LEAD }, d.rpcs));
  assert.deepEqual(out, { stopped: true, already: false, skipped: 2, leaving: 0 });
  assert.deepEqual(d.asked, [["reach_out_lead_stop", { p_lead_id: LEAD }]]);
  const viewer = doors();
  await refused(stop.POST.run(post(), ctxFor(tables("viewer"), { id: LEAD }, viewer.rpcs)), "forbidden", 403);
  assert.deepEqual(viewer.asked, [], "the door is never asked");
  const stranger = doors();
  await refused(stop.POST.run(post(), ctxFor(tables("operator"), { id: THEIRS }, stranger.rpcs)), "not_found", 404);
  assert.deepEqual(stranger.asked, []);
  setServiceClient(null);
  assert.deepEqual(
    ledger.events.map((e) => [e.tenant_id, e.kind, e.subject_type, e.subject_id, e.data]),
    [[A, "reach_out.lead_stopped", "lead", LEAD, { by: USER }]],
    "REGRESSION: a business stopped hearing from the workspace on a member's word, and nothing said whose; a refusal says nothing",
  );
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
