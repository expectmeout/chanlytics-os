/**
 * Ask, metrics and reports, run through route(): the real route modules,
 * their `run` called with a database in memory. What is proved is the policy
 * each declares and what the handler answers, not its text. The question's
 * answer needs the model, so only its doors are run here: everything up to
 * the point the thread would be saved, and the refusals that keep it from
 * being.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ASK_MODEL } from "@chanlytics/contracts";
import { fakeDb } from "./_fake-db.mjs";
import { PLAN } from "./_lead-fixtures.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
delete process.env.ASK_MODEL;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const ask = await import(at("apps/dashboard/app/api/v1/ask/route.ts"));
const { setAskPorts } = await import(at("apps/dashboard/src/server/ask/loop.ts"));
const proposals = await import(at("apps/dashboard/app/api/v1/ask/messages/[id]/proposals/[pid]/route.ts"));
const openings = await import(at("apps/dashboard/app/api/v1/ask/openings/route.ts"));
const threads = await import(at("apps/dashboard/app/api/v1/ask/threads/route.ts"));
const thread = await import(at("apps/dashboard/app/api/v1/ask/threads/[id]/route.ts"));
const metrics = await import(at("apps/dashboard/app/api/v1/metrics/route.ts"));
const reports = await import(at("apps/dashboard/app/api/v1/reports/route.ts"));
const campaigns = await import(at("apps/dashboard/app/api/v1/reports/campaigns/route.ts"));
const { readerCache } = await import(at("apps/dashboard/src/server/readers/index.ts"));

beforeEach(() => setRateStore(memoryStore()));
// The workspace's facts are kept across turns in the module: each test starts with none kept.
beforeEach(() => readerCache.clear());

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const T1 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const T2 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd2";
const T3 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd3";
const M1 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
const USER = "u1";
const membership = (tenant_id, role, slug, created_at) => ({
  user_id: USER,
  tenant_id,
  role,
  tenants: { slug },
  created_at,
});
/** A member of two workspaces: harbor (the older membership, so the default) and bayside. */
const both = (harbor, bayside) => [
  membership(A, harbor, "harbor", "2026-01-01T00:00:00Z"),
  membership(B, bayside, "bayside", "2026-02-01T00:00:00Z"),
];
const ctxFor = (tables, params = {}, rpcs = {}) => ({
  supabase: fakeDb(tables, {}, rpcs),
  userId: USER,
  email: "ada@example.com",
  params,
});
const get = (q = "") => new Request(`http://localhost/api/v1/x${q}`);
const send = (method, body, q = "") =>
  new Request(`http://localhost/api/v1/x${q}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
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
/** Every row the code under test wrote, changed or removed. */
const writes = (ctx) => ctx.supabase.seen.filter((s) => ["insert", "update", "delete", "upsert"].includes(s.op)).length;

const threadRow = (id, tenant_id, over = {}) => ({
  id,
  tenant_id,
  user_id: USER,
  title: "Who booked this week?",
  scope: null,
  last_at: "2026-09-10T00:00:00Z",
  created_at: "2026-09-10T00:00:00Z",
  ...over,
});
const turn = (id, thread_id, tenant_id, role, content) => ({
  id,
  thread_id,
  tenant_id,
  user_id: USER,
  role,
  content,
  created_at: "2026-09-10T00:00:01Z",
});

test("the nine declare their policy: a question every member's and counted, the aggregates counted with their query declared, a person's own threads and cards on the account", () => {
  const open = { kind: "read", scope: "workspace", role: null, rate: null, spend: false };
  const own = { scope: "account", role: null, rate: null, spend: false };
  assert.deepEqual(ask.POST.policy, { kind: "write", scope: "workspace", role: "viewer", rate: "ask", spend: false });
  assert.deepEqual(proposals.POST.policy, { kind: "write", ...own });
  assert.deepEqual(openings.GET.policy, { ...open, rate: "aggregate" });
  assert.deepEqual(threads.GET.policy, open);
  assert.deepEqual(thread.GET.policy, { kind: "read", ...own });
  assert.deepEqual(thread.DELETE.policy, { kind: "write", ...own });
  assert.deepEqual(metrics.GET.policy, { ...open, rate: "aggregate" });
  assert.deepEqual(reports.GET.policy, { ...open, rate: "aggregate" });
  assert.deepEqual(campaigns.GET.policy, { ...open, rate: "aggregate" });
});

test("a question: the workspace must be named, something must be asked and not too much, a thread must exist and be this workspace's — and nothing is saved for a refusal", async () => {
  const tables = { memberships: both("viewer", "operator"), ask_threads: [threadRow(T1, A)], ask_messages: [] };
  await refused(
    ask.POST.run(send("POST", { text: "Who booked this week?" }), ctxFor(tables)),
    "choose_workspace",
    400,
    "say which one",
  );
  await refused(ask.POST.run(send("POST", { text: "   " }, inB), ctxFor(tables)), "validation", 400, "Ask something.");
  await refused(
    ask.POST.run(send("POST", { text: "x".repeat(1001) }, inB), ctxFor(tables)),
    "validation",
    400,
    "Keep a question under 1000 characters.",
  );
  await refused(
    ask.POST.run(send("POST", { text: "And then?", thread_id: "nope" }, inB), ctxFor(tables)),
    "not_found",
    404,
    "That thread does not exist.",
  );
  const elsewhere = ctxFor(tables, {});
  await refused(
    ask.POST.run(send("POST", { text: "And then?", thread_id: T1 }, inB), elsewhere),
    "not_found",
    404,
    "That thread is not yours.",
  );
  assert.equal(writes(elsewhere), 0, "no turn is saved for a question that was refused");
  assert.deepEqual([tables.ask_threads.length, tables.ask_messages.length], [1, 0]);
});

test("a question answered: the thread is made before the model is asked, the person's words and the answer are its two turns, the answer is stored as the Line draws it beside the v1 fields it gives, the thread keeps its question as its title, and the stream says thread, say, then final", async () => {
  // The turn through the route, with the model scripted: one round, the answer
  // written as its format. Everything else -- the thread, the two messages,
  // the stream -- is the route's own and runs for real against the database
  // in memory.
  const tables = {
    memberships: both("viewer", "operator"),
    tenants: [{ id: A, name: "Harbor", timezone: "America/New_York" }],
    tenant_config: [{ tenant_id: A, config: {}, version: 1 }],
    policies: [],
    ask_threads: [],
    ask_messages: [],
  };
  const none = { kind: "none", id: "", label: "" };
  const written = JSON.stringify({
    say: { headline: "Nobody has booked this week yet.", detail: "" },
    show: { figures: [], items: [], breakdown: { label: "", total: 0, parts: [], source: none } },
    do: {
      open: { source: { kind: "page", id: "calendar", label: "Calendar" }, label: "", now: false },
      next: ["Who called this week?"],
    },
    language: "en",
  });
  // What the model was told each turn: the surface the palette sent must reach the prompt.
  const systems = [];
  setAskPorts({
    round: async (call, onText) => {
      systems.push(call.request.system.map((b) => b.text).join("\n"));
      onText(written);
      return {
        blocks: [{ type: "text", id: "", name: "", text: written, json: "" }],
        stopReason: "end_turn",
        streamError: null,
      };
    },
    snapshot: async () => "",
  });
  try {
    const res = await ask.POST.run(
      send("POST", { text: "Who booked this week?", surface: "today" }, inA),
      ctxFor(tables),
    );
    assert.ok(res instanceof Response, "a stream, not an envelope");
    assert.equal(res.headers.get("content-type"), "application/x-ndjson; charset=utf-8");
    const lines = (await res.text())
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    assert.deepEqual(
      lines.map((l) => l.t),
      ["thread", "say", "final"],
    );
    assert.deepEqual([lines[1].headline, lines[1].detail], ["Nobody has booked this week yet.", ""]);
    assert.equal(tables.ask_threads.length, 1, "the thread exists before the model was asked");
    const thread = tables.ask_threads[0];
    assert.deepEqual([lines[0].id, thread.tenant_id, thread.user_id], [thread.id, A, USER]);
    assert.deepEqual(
      tables.ask_messages.map((m) => [m.thread_id, m.role, m.content.text]),
      [
        [thread.id, "user", "Who booked this week?"],
        [thread.id, "assistant", "Nobody has booked this week yet."],
      ],
      "the person's words, then the answer's words",
    );
    const stored = tables.ask_messages[1].content;
    const message = lines[2].message;
    assert.equal(stored.v, 2);
    assert.deepEqual(message.answer, stored.answer, "the final line carries the answer as stored");
    assert.deepEqual(
      [stored.answer.say.headline, stored.answer.do.open, stored.answer.do.next],
      [
        "Nobody has booked this week yet.",
        { to: "calendar", label: "Calendar", now: false },
        ["Who called this week?"],
      ],
    );
    assert.deepEqual(
      [stored.navigate, stored.followups, stored.citations],
      [{ to: "calendar", label: "Calendar", now: false }, ["Who called this week?"], []],
      "the v1 fields every older reader knows",
    );
    assert.deepEqual(
      [message.text, message.followups, message.failed, message.rounds],
      ["Nobody has booked this week yet.", ["Who called this week?"], false, 1],
    );
    assert.equal(message.id, tables.ask_messages[1].id, "the final line carries the saved turn");
    assert.equal(thread.title, "Who booked this week?", "titled by its question, never renamed (D9)");
    assert.ok(thread.last_at, "and touched");
    assert.equal(
      stored.model,
      ASK_MODEL,
      "the model the deployment runs: the default here, since the test sets no ASK_MODEL",
    );
    // A follow-up on the same thread: the history rides in, nothing is re-created.
    const again = await ask.POST.run(
      send("POST", { text: "And last week?", thread_id: thread.id }, inA),
      ctxFor(tables),
    );
    await again.text();
    assert.equal(tables.ask_threads.length, 1);
    assert.equal(tables.ask_messages.length, 4);
    // Where they are rides into the turn, as contracts list the surfaces (ASK_SURFACES), Leads among them.
    assert.ok(systems[0].includes("They are on the today page."), "the first turn's surface reached the prompt");
    assert.ok(!systems[1].includes("They are on the"), "a follow-up sent without one names no page");
    const onLeads = await ask.POST.run(
      send("POST", { text: "100 nail salons in Queens, NY", surface: "leads" }, inA),
      ctxFor(tables),
    );
    await onLeads.text();
    assert.ok(systems[2].includes("They are on the Leads page"), "Leads is a surface the route accepts");
    assert.ok(systems[2].includes("propose_lead_search"), "and the prompt steers a search there");
    assert.equal(tables.ask_threads[1].title, "100 nail salons in Queens, NY", "titled by the owner's own words");
    const elsewhere = await ask.POST.run(send("POST", { text: "And more?", surface: "clients" }, inA), ctxFor(tables));
    await elsewhere.text();
    assert.ok(!systems[3].includes("They are on the"), "a name the palette never sends is dropped, not refused");
  } finally {
    setAskPorts(null);
  }
});

test("a turn reads back as it was stored: one made since the Line with its answer, one made before with its v1 fields alone", async () => {
  const answer = {
    v: 2,
    form: "structured",
    say: { headline: "Nobody has booked this week yet.", detail: "" },
    show: { figures: [], items: [], breakdown: null },
    do: { open: null, next: [] },
    language: "en",
  };
  const M2 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2";
  const v1 = { citations: [], followups: [], navigate: null };
  const tables = {
    memberships: both("viewer", "viewer"),
    tenants: [],
    tenant_config: [],
    ask_threads: [threadRow(T1, A)],
    ask_messages: [
      turn(M1, T1, A, "assistant", { text: "Two threads wait.", ...v1 }),
      {
        ...turn(M2, T1, A, "assistant", { v: 2, answer, text: "Nobody has booked this week yet.", ...v1 }),
        created_at: "2026-09-10T00:00:02Z",
      },
    ],
  };
  const one = await thread.GET.run(get(inA), ctxFor(tables, { id: T1 }));
  assert.deepEqual(
    one.messages.map((m) => [m.text, m.answer ?? null]),
    [
      ["Two threads wait.", null],
      ["Nobody has booked this week yet.", answer],
    ],
  );
});

test("a card's outcome is the person's own turn: which card, an outcome in its shape, a turn that is theirs, and a card approved once cannot be approved again", async () => {
  const tables = {
    memberships: both("viewer", "viewer"),
    ask_messages: [
      turn(M1, T1, A, "assistant", {
        text: "I can send that.",
        proposals: [{ id: "p-1", kind: "reply", outcome: null }],
      }),
    ],
  };
  await refused(
    proposals.POST.run(send("POST", { state: "done", receipt: "Sent", atMs: 0 }), ctxFor(tables, { id: M1, pid: "x" })),
    "validation",
    400,
    "Which card?",
  );
  await refused(
    proposals.POST.run(send("POST", {}), ctxFor(tables, { id: M1, pid: "p-1" })),
    "validation",
    400,
    "An outcome is { state, receipt, atMs, undo? }.",
  );
  await refused(
    proposals.POST.run(
      send("POST", { state: "done", receipt: "Sent", atMs: 0 }),
      ctxFor(tables, { id: T2, pid: "p-1" }),
    ),
    "not_found",
    404,
    "That turn is not yours or is already gone.",
  );
  await refused(
    proposals.POST.run(
      send("POST", { state: "done", receipt: "Sent", atMs: 0 }),
      ctxFor(tables, { id: M1, pid: "p-2" }),
    ),
    "not_found",
    404,
    "No such card on that turn.",
  );
  const done = await proposals.POST.run(
    send("POST", { state: "done", receipt: "Sent", atMs: 0 }),
    ctxFor(tables, { id: M1, pid: "p-1" }),
  );
  assert.equal(done.proposal.outcome.state, "done");
  assert.ok(done.proposal.outcome.atMs > 0, "an outcome with no clock gets this one");
  assert.equal(
    tables.ask_messages[0].content.proposals[0].outcome.receipt,
    "Sent",
    "recorded on the turn that proposed it",
  );
  await refused(
    proposals.POST.run(
      send("POST", { state: "done", receipt: "Sent again", atMs: 0 }),
      ctxFor(tables, { id: M1, pid: "p-1" }),
    ),
    "conflict",
    409,
    "That card was already approved.",
  );
});

test("the openings and the threads answer the workspace the tab named; one thread is read and deleted as the person's own, once", async () => {
  const tables = {
    memberships: both("viewer", "viewer"),
    tenants: [],
    tenant_config: [],
    ask_threads: [
      threadRow(T1, A, { last_at: "2026-09-09T00:00:00Z" }),
      threadRow(T2, A, { last_at: "2026-09-10T00:00:00Z", title: "Newer" }),
      threadRow(T3, B),
    ],
    ask_messages: [turn(M1, T1, A, "user", { text: "Who booked this week?" })],
  };
  const open = await openings.GET.run(get(`?day=saturday&workspace=${A}&workspace=${A}`), ctxFor(tables));
  assert.ok(open.openings && typeof open.openings === "object", "answered even with no calendar connected");
  assert.deepEqual(
    (await threads.GET.run(get(inA), ctxFor(tables))).threads.map((t) => t.id),
    [T2, T1],
    "newest first, this workspace only",
  );
  assert.deepEqual(
    (await threads.GET.run(get(inB), ctxFor(tables))).threads.map((t) => t.id),
    [T3],
  );
  const one = await thread.GET.run(get(inA), ctxFor(tables, { id: T1 }));
  assert.equal(one.thread.id, T1);
  assert.equal(one.messages.length, 1);
  await refused(
    thread.GET.run(get(inA), ctxFor(tables, { id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd9" })),
    "not_found",
    404,
    "not yours or is already gone",
  );
  assert.deepEqual(await thread.DELETE.run(send("DELETE"), ctxFor(tables, { id: T1 })), { deleted: T1 });
  assert.ok(!tables.ask_threads.some((t) => t.id === T1));
  await refused(
    thread.DELETE.run(send("DELETE"), ctxFor(tables, { id: T1 })),
    "not_found",
    404,
    "not yours or is already gone",
  );
});

test("the metrics behind Today: the workspace the tab named, the days clamped to the function's range, and a function that says no is a 404, never a silent zero", async () => {
  const asked = [];
  const rpcs = {
    metrics_summary: (a) => {
      asked.push(a);
      return a.p_tenant_id === A ? { conversations: 3 } : { error: "not a member" };
    },
  };
  const tables = { memberships: both("viewer", "viewer") };
  const out = await metrics.GET.run(get(inA), ctxFor(tables, {}, rpcs));
  assert.deepEqual(out, { metrics: { conversations: 3 }, workspaceId: A });
  await metrics.GET.run(get(`?days=400&workspace=${A}&workspace=${A}`), ctxFor(tables, {}, rpcs));
  await metrics.GET.run(get(`?days=0&workspace=${A}&workspace=${A}`), ctxFor(tables, {}, rpcs));
  assert.deepEqual(
    asked.map((a) => a.p_days),
    [1, 90, 1],
    "one day by default, ninety at most, never less than one",
  );
  await refused(
    metrics.GET.run(get(inB), ctxFor(tables, {}, rpcs)),
    "not_found",
    404,
    "Workspace metrics unavailable.",
  );
});

test("the reports: the three presets and no other, the series from the function under the caller's RLS, the booking line never fatal; the campaigns' twin the same", async () => {
  const rpcs = {
    report_series: (a) => ({ days: a.p_days, tenant: a.p_tenant_id }),
    campaign_series: (a) => (a.p_tenant_id === A ? { days: a.p_days } : { error: "no" }),
    people_list: () => [],
  };
  const tables = { memberships: both("viewer", "viewer"), tenants: [], tenant_config: [], policies: [] };
  await refused(
    reports.GET.run(get(`?days=10&workspace=${A}&workspace=${A}`), ctxFor(tables, {}, rpcs)),
    "validation",
    400,
    "days must be 7, 30 or 90.",
  );
  const week = await reports.GET.run(get(`?days=7&workspace=${A}&workspace=${A}`), ctxFor(tables, {}, rpcs));
  assert.deepEqual(week.report, { days: 7, tenant: A });
  assert.ok("booking" in week, "the conversion line rides along, or null when the calendar cannot be read");
  const month = await reports.GET.run(get(inA), ctxFor(tables, {}, rpcs));
  assert.equal(month.report.days, 30, "thirty by default");
  await refused(
    campaigns.GET.run(get(`?days=45&workspace=${A}&workspace=${A}`), ctxFor(tables, {}, rpcs)),
    "validation",
    400,
    "days must be 7, 30 or 90.",
  );
  assert.deepEqual(await campaigns.GET.run(get(`?days=90&workspace=${A}&workspace=${A}`), ctxFor(tables, {}, rpcs)), {
    report: { days: 90 },
  });
  await refused(
    campaigns.GET.run(get(inB), ctxFor(tables, {}, rpcs)),
    "not_found",
    404,
    "No workspace found for this report.",
  );
});

test("the reports' Deals section rides on how the workspace's customers buy (0008): drawn where it says proposal, and not even read where it books or was never asked", async () => {
  const contact = "cccccccc-cccc-4ccc-8ccc-cccccccccc01";
  // One page of People, the booking line's: the deals read where each new client came from out of the same rows.
  const rpcs = {
    report_series: (a) => ({ days: a.p_days, tenant: a.p_tenant_id }),
    people_list: () => [{ id: contact, came_from: "lead" }],
  };
  const won = {
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddd01",
    tenant_id: A,
    contact_id: contact,
    stage: "won",
    proposed_at: new Date(Date.now() - 5 * 86_400_000).toISOString(),
    amount_cents: 250_000,
    per: "month",
  };
  const run = async (sellsBy) => {
    const tables = {
      memberships: both("viewer", "viewer"),
      tenants: [{ id: A, slug: "harbor", ...(sellsBy === undefined ? {} : { sells_by: sellsBy }) }],
      tenant_config: [],
      policies: [],
      deals: [won],
    };
    const ctx = ctxFor(tables, {}, rpcs);
    const out = await reports.GET.run(get(inA), ctx);
    return {
      deals: out.deals,
      read: ctx.supabase.seen.some((q) => q.table === "deals"),
      people: ctx.supabase.seen.filter((q) => q.rpc === "people_list").length,
    };
  };
  const on = await run("proposal");
  assert.deepEqual([on.deals.any, on.deals.clients, on.deals.monthly_cents], [true, 1, 250_000]);
  assert.deepEqual(on.deals.sources, [{ came_from: "lead", count: 1 }], "the new client's source, from People");
  assert.equal(on.people, 1, "People read once for the whole report, the booking line's read");
  for (const sellsBy of ["booking", null, undefined]) {
    const off = await run(sellsBy);
    assert.equal(off.deals.any, false, `${sellsBy}: a deal on file switches nothing`);
    assert.equal(off.read, false, `${sellsBy}: the table is not read for a section not drawn`);
  }
});

/* ------------------------------------------------ a search keeps its thread (00172) -- */

const SEARCH = "55555555-5555-4555-8555-555555555551";
const PLANNED = "dddddddd-dddd-4ddd-8ddd-ddddddddddd9";
/** A search waiting on its question, as lead_searches_view answers it. */
const waitingSearch = (over = {}) => ({
  id: SEARCH,
  tenant_id: A,
  name: "Pilates studios · Denver",
  asked: "Pilates studios in Denver, no franchises",
  plan: { ...PLAN, exclusions: [{ key: "franchises", text: "Franchises", origin: "you_said" }] },
  state: "waiting_on_owner",
  question: { sentence: "Most of the first 25 are franchises, which I'm leaving out. Is that what you meant?" },
  plan_version: 1,
  thread_id: PLANNED,
  ...over,
});
const nothing = { kind: "none", id: "", label: "" };
const answered = JSON.stringify({
  say: { headline: "Here is the search with the franchises in.", detail: "" },
  show: { figures: [], items: [], breakdown: { label: "", total: 0, parts: [], source: nothing } },
  do: { open: { source: nothing, label: "", now: false }, next: [] },
  language: "en",
});
/** The model, scripted: every round answers in words; what it was sent each round is kept. */
function wordsOnly() {
  const requests = [];
  setAskPorts({
    round: async (call, onText) => {
      requests.push(call.request);
      onText(answered);
      return {
        blocks: [{ type: "text", id: "", name: "", text: answered, json: "" }],
        stopReason: "end_turn",
        streamError: null,
      };
    },
    snapshot: async () => "",
  });
  return requests;
}
const leadWorld = (threads = [], messages = []) => ({
  memberships: both("owner", "owner"),
  tenants: [{ id: A, name: "Harbor", timezone: "America/New_York" }],
  tenant_config: [{ tenant_id: A, config: {}, version: 1 }],
  policies: [],
  ask_threads: threads,
  ask_messages: messages,
  lead_searches_view: [waitingSearch()],
});
const lastUser = (req) => {
  const m = req.messages.at(-1);
  return typeof m.content === "string" ? m.content : m.content.map((c) => c.text ?? "").join("");
};
const linesOf = async (res) =>
  (await res.text())
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));

test("an answer to a search's question lands in the thread it was planned in: the thread keeps the owner's words, the model reads which search and what it asked, on that turn and every later one", async () => {
  const tables = leadWorld(
    [threadRow(PLANNED, A, { title: "Pilates studios in Denver, no franchises" })],
    [
      turn(M1, PLANNED, A, "user", { text: "Pilates studios in Denver, no franchises" }),
      {
        ...turn("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2", PLANNED, A, "assistant", { text: "Here is the plan." }),
        created_at: "2026-09-10T00:00:02Z",
      },
    ],
  );
  const requests = wordsOnly();
  try {
    const body = {
      text: "Include the franchise ones too",
      thread_id: PLANNED,
      answering: { search_id: SEARCH },
      surface: "leads",
    };
    const lines = await linesOf(await ask.POST.run(send("POST", body, inA), ctxFor(tables)));
    assert.equal(lines[0].id, PLANNED, "the turn is in the planning thread");
    assert.equal(tables.ask_threads.length, 1, "no new thread");
    const mine = tables.ask_messages[2];
    assert.deepEqual(
      [mine.thread_id, mine.role, mine.content.text],
      [PLANNED, "user", "Include the franchise ones too"],
    );
    assert.deepEqual(
      mine.content.answering,
      {
        search_id: SEARCH,
        name: "Pilates studios · Denver",
        question: "Most of the first 25 are franchises, which I'm leaving out. Is that what you meant?",
        asked: "Pilates studios in Denver, no franchises",
        leaving_out: ["Franchises"],
      },
      "what it answered is stored beside the words, read from the search, never from the client",
    );
    // The thread as the Line reads it back: the owner's words and nothing of the machine's.
    const read = await thread.GET.run(get(inA), ctxFor(tables, { id: PLANNED }));
    assert.equal(read.messages[2].text, "Include the franchise ones too");
    assert.ok(!JSON.stringify(read).includes("search id"), "the context never reaches the page");
    // The model: the planning turns as history, then the answer inside what it answers.
    const said = lastUser(requests[0]);
    assert.ok(
      said.startsWith(
        `On People › Leads, my search for Pilates studios · Denver (search id ${SEARCH}) stopped to ask: “Most of the first 25 are franchises`,
      ),
      said,
    );
    assert.ok(said.includes("I had asked for: “Pilates studios in Denver, no franchises”, leaving out Franchises."));
    assert.ok(said.includes("My answer: Include the franchise ones too."));
    assert.ok(said.includes("propose_lead_search with amends set to that id"));
    assert.deepEqual(
      requests[0].messages.slice(0, 2).map((m) => [m.role, m.content]),
      [
        ["user", "Pilates studios in Denver, no franchises"],
        ["assistant", "Here is the plan."],
      ],
      "the conversation where the search was planned rides in",
    );
    // A later turn in the thread still knows what that answer was about.
    await linesOf(
      await ask.POST.run(send("POST", { text: "And how many is that?", thread_id: PLANNED }, inA), ctxFor(tables)),
    );
    const replayed = requests[1].messages.map((m) => (typeof m.content === "string" ? m.content : ""));
    assert.ok(
      replayed.some(
        (c) => c.includes(`(search id ${SEARCH})`) && c.includes("My answer: Include the franchise ones too."),
      ),
      "the answer is replayed with what it answered",
    );
    assert.equal(lastUser(requests[1]), "And how many is that?", "a plain turn is only its words");
    assert.equal(
      tables.ask_threads[0].title,
      "Pilates studios in Denver, no franchises",
      "the title stays the planning question's (D9)",
    );
  } finally {
    setAskPorts(null);
  }
});

test("an answer whose thread is not the caller's -- a teammate's, which RLS hides, or another workspace's -- starts one of their own, titled by the search's name; a plain question to such a thread is still refused", async () => {
  const requests = wordsOnly();
  try {
    // RLS answers another person's thread with nothing (00040 ask_threads_own_select), so to the route it is absent.
    for (const [threads, why] of [
      [[], "a thread RLS hides"],
      [[threadRow(PLANNED, B)], "another workspace's thread"],
    ]) {
      const tables = leadWorld(threads);
      const body = { text: "Yes, include them", thread_id: PLANNED, answering: { search_id: SEARCH } };
      const lines = await linesOf(await ask.POST.run(send("POST", body, inA), ctxFor(tables)));
      const made = tables.ask_threads.find((t) => t.tenant_id === A);
      assert.ok(made && made.id !== PLANNED, `${why}: a new thread`);
      assert.deepEqual(
        [lines[0].id, lines[0].title, made.title],
        [made.id, "Pilates studios · Denver", "Pilates studios · Denver"],
        `${why}: titled by the search's name`,
      );
      assert.deepEqual(
        tables.ask_messages.filter((m) => m.thread_id === made.id && m.role === "user").map((m) => m.content.text),
        ["Yes, include them"],
      );
    }
    assert.ok(lastUser(requests[0]).includes("My answer: Yes, include them."), "the model is told what it answers");
    // A search that keeps no thread (made on the page, or before 00172): the same.
    const bare = leadWorld();
    bare.lead_searches_view = [waitingSearch({ thread_id: null })];
    await linesOf(
      await ask.POST.run(send("POST", { text: "Yes", answering: { search_id: SEARCH } }, inA), ctxFor(bare)),
    );
    assert.deepEqual(
      bare.ask_threads.map((t) => t.title),
      ["Pilates studios · Denver"],
      "never the machine's sentence",
    );
    // Without an answer to make, a thread that is not theirs is what it always was: a 404, nothing saved.
    const plain = leadWorld([threadRow(PLANNED, B)]);
    await refused(
      ask.POST.run(send("POST", { text: "And then?", thread_id: PLANNED }, inA), ctxFor(plain)),
      "not_found",
      404,
      "That thread is not yours.",
    );
    assert.equal(plain.ask_messages.length, 0);
    // A search that is not this workspace's is refused before anything is saved.
    const away = leadWorld();
    away.lead_searches_view = [waitingSearch({ tenant_id: B })];
    await refused(
      ask.POST.run(send("POST", { text: "Yes", answering: { search_id: SEARCH } }, inA), ctxFor(away)),
      "not_found",
      404,
    );
    assert.deepEqual([away.ask_threads.length, away.ask_messages.length], [0, 0]);
  } finally {
    setAskPorts(null);
  }
});

test("a new search's card carries the thread it was planned in, for the commit to hand the search; a card that answers a search carries none", async () => {
  const tables = leadWorld();
  let n = 0;
  setAskPorts({
    round: async () => ({
      blocks: [{ type: "tool_use", id: `t${++n}`, name: "propose_lead_search", text: "", json: "{}" }],
      stopReason: "tool_use",
      streamError: null,
    }),
    snapshot: async () => "",
    propose: async () => ({
      proposal: {
        id: `p${n}`,
        kind: "lead_search",
        needs: "owner",
        title: "Find 20 personal trainers",
        summary: "…",
        payload: n === 1 ? { plan: PLAN } : { plan: { ...PLAN, version: 2 }, amends: { search_id: SEARCH } },
        undo: n === 1 ? "Stop the search" : null,
      },
      result: JSON.stringify({ proposed: true }),
      isError: false,
    }),
  });
  try {
    const body = { text: "20 personal trainers in Austin", surface: "leads" };
    const lines = await linesOf(await ask.POST.run(send("POST", body, inA), ctxFor(tables)));
    const made = tables.ask_threads[0].id;
    assert.equal(lines.at(-1).message.proposals[0].payload.thread_id, made, "the card on the stream");
    assert.equal(
      tables.ask_messages[1].content.proposals[0].payload.thread_id,
      made,
      "and as stored, for an approve later",
    );
    const again = { text: "Include them", thread_id: made, answering: { search_id: SEARCH } };
    const answer = (await linesOf(await ask.POST.run(send("POST", again, inA), ctxFor(tables)))).at(-1).message;
    assert.equal("thread_id" in answer.proposals[0].payload, false, "an answer's card starts no search");
  } finally {
    setAskPorts(null);
  }
});
