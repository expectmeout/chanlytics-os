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
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ASK_MODEL } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";
import { PLAN } from "../_lead-fixtures.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
delete process.env.ASK_MODEL;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
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
const { readerCache, readerContext } = await import(at("apps/dashboard/src/server/readers/index.ts"));
const warm = await import(at("apps/dashboard/app/api/v1/ask/warm/route.ts"));
const { buildContext, clearContextCache } = await import(at("apps/dashboard/src/server/ask/context.ts"));

beforeEach(() => setRateStore(memoryStore()));
// The workspace's facts are kept across turns in the module: each test starts with none kept.
beforeEach(() => readerCache.clear());
// And the page contexts the warm keeps for a minute.
beforeEach(() => clearContextCache());

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

test("the ten declare their policy: a question every member's and counted, the warm every member's and counted with the aggregates, the aggregates counted with their query declared, a person's own threads and cards on the account", () => {
  const open = { kind: "read", scope: "workspace", role: null, rate: null, spend: false };
  const own = { scope: "account", role: null, rate: null, spend: false };
  assert.deepEqual(ask.POST.policy, { kind: "write", scope: "workspace", role: "viewer", rate: "ask", spend: false });
  assert.deepEqual(warm.POST.policy, {
    kind: "write",
    scope: "workspace",
    role: "viewer",
    rate: "aggregate",
    spend: false,
  });
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
  // What the model was told each turn: the surface the palette sent must reach the prompt (the turn's words, in the
  // question's message, after the page's data).
  const systems = [];
  setAskPorts({
    round: async (call, onText) => {
      const q = call.request.messages.at(-1).content;
      systems.push(
        [
          ...call.request.system.map((b) => b.text),
          ...(Array.isArray(q) ? q.map((c) => c.text ?? "") : [String(q)]),
        ].join("\n"),
      );
      onText(written);
      return {
        blocks: [{ type: "text", id: "", name: "", text: written, json: "" }],
        stopReason: "end_turn",
        streamError: null,
      };
    },
    shape: async () => "",
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

test("the warm (D6): a viewer may warm; it answers the build's stamp and nothing it read, and fills the minute's cache, so the question's build right after reads nothing; a context that is not one is a 400 in words, and nothing is read for it", async () => {
  const C1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
  const tables = {
    memberships: both("viewer", "viewer"),
    tenants: [{ id: A, name: "Harbor", timezone: "America/New_York" }],
    conversations: [
      {
        id: C1,
        tenant_id: A,
        contact_id: null,
        state: "open",
        paused_until: null,
        snooze_until: null,
        assignee_user_id: null,
        last_wa_inbound_at: null,
        last_message_at: "2026-09-10T00:00:00Z",
        contacts: {
          id: "k1",
          display_name: "Rosa",
          wa_profile_name: null,
          phone_e164: null,
          consent: "opted_in",
          dnc: false,
        },
      },
    ],
    messages: [],
    escalations: [],
  };
  const context = {
    v: 1,
    surface: "inbox",
    route: "inbox",
    view: "all",
    focus: null,
    rows: [{ kind: "thread", id: C1 }],
    askedAt: 1,
  };
  const before = Date.now();
  const warmed = ctxFor(tables);
  const out = await warm.POST.run(send("POST", context, inA), warmed);
  assert.deepEqual(Object.keys(out), ["stamp"], "the stamp, and nothing of what was read");
  assert.ok(out.stamp >= before && out.stamp <= Date.now());
  assert.ok(
    warmed.supabase.seen.some((q) => q.table === "conversations"),
    "the warm read the page",
  );
  // The question, a moment later, as the turn builds it: the same person, the same page, another request.
  const asked = ctxFor(tables);
  const built = await buildContext(readerContext(asked, { tenantId: A, role: "viewer" }, undefined, { keep: true }), {
    ...context,
    askedAt: 2,
    focus: { kind: "thread", id: C1, label: "Rosa" },
  });
  assert.equal(built.warm, "hit");
  assert.equal(built.stamp, out.stamp);
  assert.deepEqual(asked.supabase.seen, [], "the turn's build read nothing: the warm had");
  assert.deepEqual(
    built.blocks.map((b) => b.source),
    ["page://inbox", `thread://${C1}`],
  );

  const bad = ctxFor(tables);
  await refused(
    warm.POST.run(send("POST", { ...context, rows: [{ kind: "lead" }] }, inA), bad),
    "validation",
    400,
    "rows",
  );
  await refused(
    warm.POST.run(send("POST", { ...context, surface: "nowhere" }, inA), bad),
    "validation",
    400,
    "surface",
  );
  await refused(warm.POST.run(send("POST", { ...context, extra: 1 }, inA), bad), "validation", 400);
  await refused(warm.POST.run(send("POST", undefined, inA), bad), "validation", 400);
  assert.equal(
    bad.supabase.seen.filter((q) => q.table !== "memberships").length,
    0,
    "a refused context reads nothing of the workspace",
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
/** The model, scripted: every round answers in words; what it was sent each round is kept. `ports` adds to the ports. */
function wordsOnly(ports = {}) {
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
    shape: async () => "",
    ...ports,
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
/** The question itself: the last text of the question's message, after the page's data and the turn's words. */
const lastUser = (req) => {
  const m = req.messages.at(-1);
  return typeof m.content === "string" ? m.content : (m.content.filter((c) => c.type === "text").at(-1)?.text ?? "");
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
    // A later turn in the thread still knows what that answer was about. Asked at once, the thread is warm: the answer's
    // turn is replayed as the model was sent it (the Phase 5 plan, PR 5.4), its words in the question's blocks.
    await linesOf(
      await ask.POST.run(send("POST", { text: "And how many is that?", thread_id: PLANNED }, inA), ctxFor(tables)),
    );
    const textOf = (c) => (typeof c === "string" ? c : c.map((b) => b.text ?? "").join("\n"));
    const replayed = requests[1].messages.map((m) => textOf(m.content));
    assert.ok(
      replayed.some(
        (c) => c.includes(`(search id ${SEARCH})`) && c.includes("My answer: Include the franchise ones too."),
      ),
      "the answer is replayed with what it answered",
    );
    assert.equal(tables.ask_messages.at(-1).content.shape.replay, "live", "replayed, not rebuilt");
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
    shape: async () => "",
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

/* ------------------------------------------------ a long thread, and the scope of each turn (Phase 5, 5.1) -- */

/** A stored thread of `n` rows, a question and its answer in turn, a minute apart, the first at `from`. */
const longThread = (n, from = Date.parse("2026-09-20T12:00:00Z")) =>
  Array.from({ length: n }, (_, i) => ({
    ...turn(
      `eeeeeeee-eeee-4eee-8eee-${String(i).padStart(12, "0")}`,
      T1,
      A,
      i % 2 ? "assistant" : "user",
      i % 2 ? { v: 2, text: `Answer ${i}.` } : { text: `Question ${i}?` },
    ),
    created_at: new Date(from + i * 60_000).toISOString(),
  }));
const askWorld = (threads = [], messages = []) => ({
  memberships: both("owner", "viewer"),
  tenants: [{ id: A, name: "Harbor", timezone: "America/New_York" }],
  tenant_config: [{ tenant_id: A, config: {}, version: 1 }],
  policies: [],
  ask_threads: threads,
  ask_messages: messages,
});

test("a thread past thirty turns reads its newest sixty rows (MESSAGES_CAP): GET ask/threads/[id] draws them oldest first, the newest last, a tie in the clock broken by the id; and a follow-up is asked with the newest twelve turns, from a question, never the first", async () => {
  const rows = longThread(70);
  // The newest turn's question and answer in one millisecond: the id puts them in order, the same way every read.
  rows[69].created_at = rows[68].created_at;
  const tables = askWorld([threadRow(T1, A)], rows);
  const read = await thread.GET.run(get(inA), ctxFor(tables, { id: T1 }));
  assert.equal(read.messages.length, 60, "the read's sixty");
  assert.deepEqual(
    [read.messages[0].text, read.messages.at(-2).text, read.messages.at(-1).text],
    ["Question 10?", "Question 68?", "Answer 69."],
    "REGRESSION: a thread past thirty turns reopened on its first thirty and dropped the newest",
  );
  assert.deepEqual(
    read.messages.map((m) => m.text),
    rows.slice(10).map((r) => r.content.text),
    "in the order they were written",
  );
  const requests = wordsOnly();
  try {
    await linesOf(await ask.POST.run(send("POST", { text: "And after that?", thread_id: T1 }, inA), ctxFor(tables)));
    const history = requests[0].messages.slice(0, -1).map((m) => [m.role, m.content]);
    assert.deepEqual(history.at(-1), ["assistant", "Answer 69."], "the model reads the thread up to its newest turn");
    assert.deepEqual(
      history,
      rows.slice(46, 70).map((r) => [r.role, r.content.text]),
      "the newest twelve turns, twenty-four messages from Question 46: twelve turns, counted as turns",
    );
    assert.equal(lastUser(requests[0]), "And after that?");
  } finally {
    setAskPorts(null);
  }
});

test("the scope is each turn's (the Phase 5 plan, D9): a follow-up asked on another row is asked about that row -- the scope line in its words and the row read before the model -- and the thread keeps it; no scope sent is the thread's own, unchanged, and so is one not in the palette's shape; null is none, and clears the thread's", async () => {
  const ROSA = { kind: "person", id: "cccccccc-cccc-4ccc-8ccc-cccccccccc01", label: "Rosa" };
  const NORA = { kind: "person", id: "cccccccc-cccc-4ccc-8ccc-cccccccccc02", label: "Nora" };
  const tables = askWorld();
  // The scope's row is read before the model is asked (cross-page.ts scopedRead): answered at once here.
  const requests = wordsOnly({
    tool: async (tc, run) => ({ result: JSON.stringify({ read: run.input }), isError: false }),
  });
  /** What a turn was asked about: the scope line in its words, and the rows read for it before the model. */
  const aboutOf = (req) => {
    const q = req.messages.at(-1).content;
    const blocks = Array.isArray(q) ? q : [];
    const words = blocks
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    return {
      line: /They are looking at (.+?) \((\w+) ([^)]+)\)/.exec(words)?.slice(1, 4) ?? null,
      read: blocks.filter((b) => b.type === "search_result" && b.source === "read://people.get").map((b) => b.title),
    };
  };
  const about = (s) => ({ line: [s.label, s.kind, s.id], read: [`people {"action":"get","contact_id":"${s.id}"}`] });
  const NONE = { line: null, read: [] };
  const asked = async (body) => linesOf(await ask.POST.run(send("POST", body, inA), ctxFor(tables)));
  try {
    const id = (await asked({ text: "What did she ask for?", scope: ROSA, surface: "people" }))[0].id;
    const stored = () => tables.ask_threads.find((t) => t.id === id).scope;
    assert.deepEqual(
      aboutOf(requests.at(-1)),
      about(ROSA),
      "the first turn: about Rosa, her row read before the model",
    );
    assert.deepEqual(stored(), ROSA, "a new thread is made with its question's scope");
    await asked({ text: "And Nora?", thread_id: id, scope: NORA, surface: "people" });
    assert.deepEqual(
      aboutOf(requests.at(-1)),
      about(NORA),
      "a follow-up asked on Nora's row: about Nora, her row read",
    );
    assert.deepEqual(
      stored(),
      NORA,
      "REGRESSION: the thread kept its first scope, so the next question sent with none was asked about Rosa again",
    );
    for (const [scope, why] of [
      [undefined, "no scope sent"],
      ["Nora", "a scope that is a string"],
      [{ kind: "person", id: "", label: "Nora" }, "a scope with no id"],
      [{ kind: "shelf", id: NORA.id, label: "Nora" }, "a kind the palette never sends"],
    ]) {
      await asked({ text: "And then?", thread_id: id, ...(scope === undefined ? {} : { scope }) });
      assert.deepEqual(aboutOf(requests.at(-1)), about(NORA), `${why}: the thread's own, Nora`);
      assert.deepEqual(stored(), NORA, `${why}: the thread's scope unchanged`);
    }
    await asked({ text: "Anything else?", thread_id: id, scope: null });
    assert.deepEqual(aboutOf(requests.at(-1)), NONE, "null: this turn has none -- no scope line, no row read for it");
    assert.equal(stored(), null, "and the thread's is cleared");
    await asked({ text: "And now?", thread_id: id });
    assert.deepEqual(aboutOf(requests.at(-1)), NONE, "no scope sent after it was cleared: the thread's own, none");
    assert.equal(stored(), null);
    assert.deepEqual(
      tables.ask_messages.filter((m) => m.role === "assistant").map((m) => m.content.shape.scope_kind),
      ["person", "person", "person", "person", "person", "person", null, null],
      "each turn's shape says the scope it ran with",
    );
    // A new thread asked with none is made with none.
    const bare = (await asked({ text: "Who is new this week?", scope: null }))[0].id;
    assert.equal(tables.ask_threads.find((t) => t.id === bare).scope, null);
    assert.deepEqual(aboutOf(requests.at(-1)), NONE);
  } finally {
    setAskPorts(null);
  }
});

/* ------------------------------------ the turn as the model was sent it, kept on its row (Phase 5, 5.3) -- */

const { GatewayRefused } = await import(at("apps/dashboard/src/server/ask/gateway.ts"));
/**
 * The prefix a request says (the Phase 5 plan, D2): the sha256 of what it sent besides its messages -- system and tools
 * as sent, the tool choice, and the output config.
 */
const prefixOf = (request) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        system: request.system,
        tools: request.tools,
        tool_choice: request.tool_choice,
        output_config: request.output_config,
      }),
    )
    .digest("hex");
/**
 * A request's messages less the cache's markers it carried (the Phase 5 plan, D10): the markers ride on each request's
 * own copy, so what the turn keeps of a request is these.
 */
const unmark = (messages) =>
  messages.map((m) =>
    Array.isArray(m.content) ? { ...m, content: m.content.map(({ cache_control: _cc, ...b }) => b) } : m,
  );
/** A card the scripted model proposes, the same bytes every turn. */
const CARD = {
  id: "p-1",
  kind: "policy",
  needs: "operator",
  title: "Autonomy: reply",
  summary: "Ask first on every reply.",
  payload: { class: "reply", mode: "ask" },
  undo: null,
};
const SIGNATURE = "EmwKAhgBEgxzaWduYXR1cmU=";
/**
 * The model, scripted: one round that thinks, proposes a card and answers beside it -- a turn that ends on a call no
 * request answered -- each request kept as it was sent.
 */
function besideACard() {
  const requests = [];
  setAskPorts({
    round: async (call, onText) => {
      requests.push(JSON.parse(JSON.stringify(call.request)));
      onText(answered);
      return {
        blocks: [
          { type: "thinking", id: "", name: "", text: "", json: "", thinking: "", signature: SIGNATURE },
          {
            type: "tool_use",
            id: "t-card",
            name: "propose_autonomy",
            text: "",
            json: '{"class":"reply","mode":"ask"}',
          },
          { type: "text", id: "", name: "", text: answered, json: "" },
        ],
        stopReason: "end_turn",
        streamError: null,
      };
    },
    shape: async () => "",
    propose: async () => ({ proposal: CARD, result: JSON.stringify({ proposed: true, id: CARD.id }), isError: false }),
  });
  return requests;
}
/** What `fn` answered, and every line console.log printed while it ran. */
async function printed(fn) {
  const said = [];
  const was = console.log;
  console.log = (...parts) => said.push(parts.join(" "));
  try {
    return { value: await fn(), said };
  } finally {
    console.log = was;
  }
}

/** A caller over a database in memory that keeps a turn's content as jsonb does: its objects' keys in jsonb's order. */
const asJsonb = (tables, params = {}) => ({
  supabase: fakeDb(tables, {}, {}, { jsonb: ["ask_messages.content"] }),
  userId: USER,
  email: "ada@example.com",
  params,
});

test("the turn as the model was sent it rides on the answer's row, at content.raw (the Phase 5 plan, D11): its messages and blocks one JSON string beside its scalars, so they come back the bytes that were sent though jsonb reorders every object's keys; the words history the turn was asked with among them; nowhere else -- not on the stream, not in a log line; a turn that failed keeps none", async () => {
  const tables = askWorld();
  const requests = besideACard();
  try {
    const { value: lines, said } = await printed(async () =>
      linesOf(
        await ask.POST.run(send("POST", { text: "Ask me before every reply", surface: "today" }, inA), asJsonb(tables)),
      ),
    );
    const row = tables.ask_messages[1];
    assert.equal(row.role, "assistant");
    const raw = row.content.raw;
    assert.ok(raw, "the answer's row keeps the turn as it was sent");
    // The trap: what the row keeps as objects comes back in jsonb's order, never the writer's.
    assert.deepEqual(Object.keys(raw), ["at", "model", "blocks", "prefix"], "jsonb's order: shorter keys first");
    assert.deepEqual(Object.keys(row.content.answer), ["v", "do", "say", "form", "show", "language"]);
    assert.deepEqual(Object.keys(lines.at(-1).message.answer), ["v", "form", "say", "show", "do", "language"]);
    // The string comes back as it went.
    const sent = requests[0];
    assert.equal(requests.length, 1);
    const blocks = JSON.parse(raw.blocks);
    assert.deepEqual(Object.keys(blocks), ["base", "question", "rounds", "final", "results"]);
    assert.equal(
      JSON.stringify([...blocks.base, { role: "user", content: blocks.question }, ...blocks.rounds]),
      JSON.stringify(unmark(sent.messages)),
      "read back, the last request's messages, byte for byte, less the cache's markers the request carried",
    );
    assert.ok(!raw.blocks.includes("cache_control"), "the row keeps no marker");
    assert.deepEqual([blocks.base, blocks.rounds], [[], []], "a thread's first turn, one round");
    assert.deepEqual(blocks.final, [
      { type: "thinking", thinking: "", signature: SIGNATURE },
      { type: "tool_use", id: "t-card", name: "propose_autonomy", input: { class: "reply", mode: "ask" } },
      { type: "text", text: answered },
    ]);
    assert.deepEqual(
      blocks.results,
      [
        {
          type: "tool_result",
          tool_use_id: "t-card",
          content: JSON.stringify({ proposed: true, id: CARD.id }),
          is_error: false,
        },
      ],
      "the card's result, which no request carried",
    );
    assert.equal(raw.model, ASK_MODEL);
    assert.equal(raw.prefix, prefixOf(sent), "the prefix the request says");
    assert.ok(Number.isInteger(raw.at) && raw.at <= Date.parse(row.created_at), "the round began before the save");

    assert.equal(lines.at(-1).t, "final");
    assert.deepEqual(
      lines.at(-1).message.proposals.map((p) => p.id),
      [CARD.id],
      "the final line is the answer the Line draws",
    );
    for (const l of lines)
      assert.ok(!JSON.stringify(l).includes('"raw"') && !JSON.stringify(l).includes(SIGNATURE), `${l.t}: no raw`);
    const logged = said.filter((l) => l.includes('"event":"ask_turn'));
    assert.equal(logged.length, 2, "ask_turn_shape and ask_turn");
    for (const l of logged) assert.ok(!l.includes('"raw"') && !l.includes(SIGNATURE), "no log line carries it");

    // A follow-up at once: the thread is warm, so it replays the first turn as the model was sent it (the Phase 5 plan,
    // PR 5.4), the card's result first in its question. Its raw keeps no base -- its history is the chain it replayed --
    // and names the answer it followed.
    const follow = { text: "And the reminders?", thread_id: row.thread_id };
    await linesOf(await ask.POST.run(send("POST", follow, inA), asJsonb(tables)));
    const nextRaw = tables.ask_messages[3].content.raw;
    const next = JSON.parse(nextRaw.blocks);
    assert.deepEqual(Object.keys(next), ["question", "rounds", "final", "results"], "a live turn keeps no base");
    assert.equal(nextRaw.after, row.id, "the answer it followed");
    assert.deepEqual(next.question[0], blocks.results[0], "the card's result opens its question");
    const firstTurn = [...blocks.base, { role: "user", content: blocks.question }, ...blocks.rounds];
    assert.equal(
      JSON.stringify([
        ...firstTurn,
        { role: "assistant", content: blocks.final },
        { role: "user", content: next.question },
        ...next.rounds,
      ]),
      JSON.stringify(unmark(requests[1].messages)),
      "the follow-up's: the first turn as it was sent, its final, then its own, byte for byte",
    );
    assert.equal(tables.ask_messages[3].content.shape.replay, "live");

    // A turn that failed keeps nothing to replay.
    setAskPorts({
      round: async () => {
        throw new GatewayRefused({ kind: "budget", used: 1, cap: 1 });
      },
      shape: async () => "",
    });
    await linesOf(await ask.POST.run(send("POST", { ...follow, text: "And tomorrow?" }, inA), asJsonb(tables)));
    const failed = tables.ask_messages[5].content;
    assert.deepEqual([failed.failed, failed.failure, failed.raw], [true, "budget", null]);
  } finally {
    setAskPorts(null);
  }
});

test("through the route a thread stays live turn after turn (the Phase 5 plan, PR 5.4): a card-ending turn, then a follow-up asked on a page -- its question the card's result, the page's data, the words and the question in one message, after the first turn as it was sent -- then a third that follows the second's link; the raws are read by id, only the chain's; each shape says how its history went", async () => {
  const tables = askWorld();
  const page = {
    blocks: [
      {
        type: "search_result",
        source: "page://today",
        title: "Today",
        content: [{ type: "text", text: "Today: 2 need you" }],
        citations: { enabled: false },
      },
    ],
    refs: [{ kind: "page", id: "today", route: "today", label: "Today" }],
    rows: 0,
    chars: 30,
    stamp: 1,
    failed: false,
    warm: "hit",
  };
  const requests = [];
  setAskPorts({
    round: async (call, onText) => {
      requests.push(JSON.parse(JSON.stringify(call.request)));
      onText(answered);
      const n = requests.length;
      const card = {
        type: "tool_use",
        id: "t-card",
        name: "propose_autonomy",
        text: "",
        json: '{"class":"reply","mode":"ask"}',
      };
      const thought = {
        type: "thinking",
        id: "",
        name: "",
        text: "",
        json: "",
        thinking: "",
        signature: `${SIGNATURE}${n}`,
      };
      return {
        blocks: [thought, ...(n === 1 ? [card] : []), { type: "text", id: "", name: "", text: answered, json: "" }],
        stopReason: "end_turn",
        streamError: null,
      };
    },
    shape: async () => "",
    context: async () => page,
    propose: async () => ({ proposal: CARD, result: JSON.stringify({ proposed: true, id: CARD.id }), isError: false }),
  });
  const onToday = { v: 1, surface: "today", route: "today", view: null, focus: null, rows: [], askedAt: 1 };
  try {
    const [opened] = await linesOf(
      await ask.POST.run(send("POST", { text: "Ask me before every reply" }, inA), asJsonb(tables)),
    );
    const thread_id = opened.id;
    const body = { text: "And the reminders?", thread_id, context: onToday };
    await linesOf(await ask.POST.run(send("POST", body, inA), asJsonb(tables)));
    const third = asJsonb(tables);
    await linesOf(await ask.POST.run(send("POST", { text: "And tomorrow?", thread_id }, inA), third));

    const answers = tables.ask_messages.filter((m) => m.role === "assistant");
    assert.deepEqual(
      answers.map((m) => m.content.shape.replay),
      ["none", "live", "live"],
    );
    assert.deepEqual(
      answers.map((m) => m.content.raw.after ?? null),
      [null, answers[0].id, answers[1].id],
      "each follows the answer before it",
    );
    const [one, two, three] = requests;
    const finalOf = (m) => JSON.parse(m.content.raw.blocks).final;
    assert.equal(
      JSON.stringify(unmark(two.messages.slice(0, one.messages.length))),
      JSON.stringify(unmark(one.messages)),
      "turn 2 begins with turn 1's request, byte for byte",
    );
    assert.deepEqual(two.messages[one.messages.length], { role: "assistant", content: finalOf(answers[0]) });
    assert.deepEqual(
      two.messages.at(-1).content.map((b) => b.tool_use_id ?? b.source ?? b.type),
      ["t-card", "page://today", "text", "text"],
      "the card's result, then the page's data, the words and the question: one message",
    );
    assert.equal(
      JSON.stringify(unmark(three.messages.slice(0, two.messages.length))),
      JSON.stringify(unmark(two.messages)),
      "turn 3 begins with turn 2's request, byte for byte",
    );
    assert.deepEqual(three.messages[two.messages.length], { role: "assistant", content: finalOf(answers[1]) });
    assert.deepEqual(
      three.messages.at(-1).content.map((b) => b.type),
      ["text", "text"],
      "turn 2 left no call unanswered",
    );
    const rawReads = third.supabase.seen.filter((q) => q.table === "ask_messages" && /\braw\b/.test(q.columns ?? ""));
    assert.deepEqual(
      rawReads.map((q) => [q.columns, q.filters]),
      [["id, raw:content->raw", [["in", "id", [answers[1].id, answers[0].id]]]]],
      "one read of the raws, the chain's answers by id",
    );
  } finally {
    setAskPorts(null);
  }
});

test("what happened since, through the route (the Phase 5 plan, D8): a card approved between two turns is said in the next live turn's words, after the clock -- its title, its id, approved, its receipt -- that turn keeps what it told, and the turn after it says it no more", async () => {
  const tables = askWorld();
  const requests = [];
  // A reply's card: its approval sends a reply and leaves system as it was, so the next turn stays live. (An autonomy
  // or a settings card's approval changes system, which carries the policies and the settings: the next turn is cold.)
  const REPLY = {
    id: "p-1",
    kind: "reply",
    needs: "operator",
    title: "Reply to Rosa",
    summary: "We open at nine on Saturday.",
    payload: { conversation_id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1", text: "We open at nine on Saturday." },
    undo: null,
  };
  setAskPorts({
    round: async (call, onText) => {
      requests.push(JSON.parse(JSON.stringify(call.request)));
      onText(answered);
      const draft = {
        type: "tool_use",
        id: "t-card",
        name: "propose_reply",
        text: "",
        json: JSON.stringify({ action: "draft", conversation_id: REPLY.payload.conversation_id, text: REPLY.summary }),
      };
      return {
        blocks: [
          ...(requests.length === 1 ? [draft] : []),
          { type: "text", id: "", name: "", text: answered, json: "" },
        ],
        stopReason: "end_turn",
        streamError: null,
      };
    },
    shape: async () => "",
    propose: async () => ({
      proposal: REPLY,
      result: JSON.stringify({ proposed: true, id: REPLY.id }),
      isError: false,
    }),
  });
  const SINCE = "Since the last answer, the person acted on cards from earlier in this thread:";
  /** The words of a request's question: the text block that says who is asking, line by line. */
  const wordsOf = (req) =>
    req.messages
      .at(-1)
      .content.find((b) => b.type === "text" && b.text.includes("You are speaking with"))
      .text.split("\n");
  try {
    const [opened] = await linesOf(
      await ask.POST.run(send("POST", { text: "Tell Rosa we open at nine" }, inA), asJsonb(tables)),
    );
    const card = tables.ask_messages.find((m) => m.role === "assistant");
    const outcome = asJsonb(tables, { id: card.id, pid: REPLY.id });
    await proposals.POST.run(send("POST", { state: "done", receipt: "Sent to Rosa", atMs: 1_000 }), outcome);
    for (const text of ["And the reminders?", "And tomorrow?"])
      await linesOf(await ask.POST.run(send("POST", { text, thread_id: opened.id }, inA), asJsonb(tables)));

    const answers = tables.ask_messages.filter((m) => m.role === "assistant");
    assert.deepEqual(
      answers.map((m) => m.content.shape.replay),
      ["none", "live", "live"],
    );
    assert.equal(
      wordsOf(requests[1])[1],
      `${SINCE} “Reply to Rosa” (p-1) was approved: Sent to Rosa.`,
      "the second turn says it, after the clock",
    );
    assert.deepEqual(answers[1].content.raw.told, ["p-1:done:1000"], "and keeps what it told");
    assert.ok(!wordsOf(requests[2]).some((l) => l.startsWith(SINCE)), "the third turn says it no more");
    assert.deepEqual(answers[2].content.raw.told, []);
    assert.ok(!wordsOf(requests[0]).some((l) => l.startsWith(SINCE)), "a first turn has nothing to say");
  } finally {
    setAskPorts(null);
  }
});

test("the database in memory keeps a column named jsonb as jsonb keeps it: what is written comes back with every object's keys, at every depth, shortest first, then by their bytes -- a call's input and a card's reordered -- and a string as it went; a column not named keeps the writer's order", async () => {
  const world = { t: [] };
  const db = fakeDb(world, {}, {}, { jsonb: ["t.content"] });
  const input = {
    action: "search",
    words: "parking",
    card: [{ action: "invite", email: "a@example.com", role: "viewer" }],
  };
  await db.from("t").insert({ id: "b", content: input, other: input });
  const [kept] = world.t;
  assert.deepEqual(Object.keys(kept.content), ["card", "words", "action"]);
  assert.deepEqual(Object.keys(kept.content.card[0]), ["role", "email", "action"]);
  assert.deepEqual(kept.content, input, "the same values");
  assert.deepEqual(Object.keys(kept.other), ["action", "words", "card"], "a column not named: the writer's order");
  await db
    .from("t")
    .update({ content: { action: "search", words: "parking" } })
    .eq("id", "b");
  assert.equal(JSON.stringify(world.t[0].content), '{"words":"parking","action":"search"}', "an update the same");
  await db
    .from("t")
    .update({ content: { a: JSON.stringify(input) } })
    .eq("id", "b");
  assert.equal(world.t[0].content.a, JSON.stringify(input), "a string comes back as it went");
});

/**
 * Every read of a turn's rows `ctx` made: none of the whole content and none of the raw turn, each key of a turn it
 * reads by its JSON path (PostgREST's alias:column->key).
 */
function readByPath(ctx) {
  const reads = ctx.supabase.seen.filter((q) => q.table === "ask_messages" && q.op === "select");
  assert.ok(reads.length > 0, "the turns were read");
  for (const { columns } of reads) {
    const cols = columns.split(",").map((c) => c.trim());
    assert.ok(!cols.includes("content") && !cols.includes("*"), `never the whole content: ${columns}`);
    assert.ok(!columns.includes("raw"), `never the raw turn: ${columns}`);
    assert.ok(
      cols.filter((c) => c.includes("content")).every((c) => /^\w+:content->\w+$/.test(c)),
      `each key by its path: ${columns}`,
    );
  }
}

test("the Line's reads never select the raw turn (the Phase 5 plan, D11): GET ask/threads/[id] and the history a follow-up is asked with read each key of a turn they read by its JSON path, never the whole content, and answer what the whole rows give, byte for byte; a card's outcome recorded later writes the row back whole, the raw turn beside it", async () => {
  const { toMessageVM, modelTurnOf } = await import(at("apps/dashboard/src/server/ask/store.ts"));
  const raw = {
    at: Date.parse("2026-09-10T00:00:01Z"),
    model: ASK_MODEL,
    prefix: "0".repeat(64),
    blocks: JSON.stringify({
      base: [],
      question: [{ type: "text", text: "Which drafts are held?" }],
      rounds: [],
      final: [{ type: "thinking", thinking: "", signature: SIGNATURE }],
      results: [],
    }),
  };
  // Every key the Line (toMessageVM) and the history (modelTurnOf) read, each away from its default, beside the raw turn.
  const asked = turn(M1, T1, A, "user", {
    text: "Include the franchise ones too",
    answering: {
      search_id: SEARCH,
      name: "Pilates studios · Denver",
      question: "Most of the first 25 are franchises, which I'm leaving out. Is that what you meant?",
      asked: "Pilates studios in Denver, no franchises",
      leaving_out: ["Franchises"],
    },
  });
  const answer = {
    ...turn("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2", T1, A, "assistant", {
      v: 2,
      answer: {
        v: 2,
        form: "structured",
        say: { headline: "Dos borradores esperan.", detail: "Desde el mediodía." },
        show: { figures: [], items: [], breakdown: null },
        do: { open: null, next: [] },
        language: "es",
      },
      text: "Dos borradores esperan.",
      citations: [{ kind: "thread", id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1", label: "Rosa", to: "" }],
      followups: ["¿Y mañana?"],
      navigate: { to: "inbox", label: "Inbox", now: false },
      proposals: [CARD],
      language: "es",
      ungrounded: true,
      tools: ["inbox.list"],
      latency_ms: 1234,
      rounds: 2,
      failed: true,
      failure: "cap",
      model: ASK_MODEL,
      shape: { v: 1 },
      raw,
    }),
    created_at: "2026-09-10T00:00:02Z",
  };
  const tables = askWorld([threadRow(T1, A)], [asked, answer]);
  const whole = [asked, answer].map((r) => structuredClone(r));

  const reader = asJsonb(tables, { id: T1 });
  const read = await thread.GET.run(get(inA), reader);
  assert.equal(
    JSON.stringify(read.messages),
    JSON.stringify(whole.map(toMessageVM)),
    "the thread as the Line draws it: byte for byte what the whole rows give",
  );
  assert.ok(!JSON.stringify(read).includes('"raw"') && !JSON.stringify(read).includes(SIGNATURE), "no raw in its JSON");
  readByPath(reader);

  const requests = wordsOnly();
  try {
    const asker = asJsonb(tables);
    await linesOf(await ask.POST.run(send("POST", { text: "And tomorrow?", thread_id: T1 }, inA), asker));
    assert.deepEqual(
      requests[0].messages.slice(0, -1).map((m) => [m.role, m.content]),
      whole.map(modelTurnOf).map((t) => [t.role, t.text.slice(0, 1200)]),
      "the history a follow-up is asked with: what the whole rows give",
    );
    assert.ok(requests[0].messages[0].content.includes("Pilates studios · Denver"), "the search an answer answered");
    readByPath(asker);
  } finally {
    setAskPorts(null);
  }

  // A card's outcome, recorded later: the row is read and written back whole, so the raw turn stays beside it.
  const outcome = asJsonb(tables, { id: answer.id, pid: CARD.id });
  const done = await proposals.POST.run(send("POST", { state: "done", receipt: "Set", atMs: 0 }), outcome);
  assert.equal(done.proposal.outcome.receipt, "Set");
  const row = tables.ask_messages.find((m) => m.id === answer.id);
  assert.equal(row.content.proposals[0].outcome.receipt, "Set");
  assert.deepEqual(row.content.raw, raw, "the raw turn kept");
  assert.equal(row.content.raw.blocks, raw.blocks, "its blocks byte for byte");
  const [write] = outcome.supabase.seen.filter((q) => q.table === "ask_messages" && q.op === "update");
  assert.deepEqual(write.values.content.raw, raw, "written back whole");
});

test("the database in memory answers a select that names a JSON path as PostgREST does: the columns it names and no other, each path under its name, null where the row holds no such key; a select with no path still answers whole rows, as it always has here; a spelling it does not model is refused by name", async () => {
  const db = fakeDb({ t: [{ id: "a", content: { x: 1, y: { z: [2] }, n: null }, other: "o" }] });
  const one = (columns) => db.from("t").select(columns).eq("id", "a").maybeSingle();
  assert.deepEqual((await one("id, v:content->x, y:content->y, n:content->n, gone:content->w")).data, {
    id: "a",
    v: 1,
    y: { z: [2] },
    n: null,
    gone: null,
  });
  assert.deepEqual((await one("id, content->x")).data, { id: "a", x: 1 }, "a path with no alias is named by its key");
  assert.deepEqual((await one("id")).data, { id: "a", content: { x: 1, y: { z: [2] }, n: null }, other: "o" });
  for (const columns of ["id, x:content->>x", "id, z:content->y->z", "id, contacts(name), x:content->x"])
    await assert.rejects(one(columns), /fakeDb: .* is not modelled/, columns);
});
