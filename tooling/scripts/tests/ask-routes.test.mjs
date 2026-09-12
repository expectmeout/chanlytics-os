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
import { fakeDb } from "./_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

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

beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const T1 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const T2 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd2";
const T3 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd3";
const M1 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
const USER = "u1";
const membership = (tenant_id, role, slug, created_at) => ({ user_id: USER, tenant_id, role, tenants: { slug }, created_at });
/** A member of two workspaces: harbor (the older membership, so the default) and bayside. */
const both = (harbor, bayside) => [membership(A, harbor, "harbor", "2026-01-01T00:00:00Z"), membership(B, bayside, "bayside", "2026-02-01T00:00:00Z")];
const ctxFor = (tables, params = {}, rpcs = {}) => ({ supabase: fakeDb(tables, {}, rpcs), userId: USER, email: "ada@example.com", params });
const get = (q = "") => new Request(`http://localhost/api/v1/x${q}`);
const send = (method, body, q = "") => new Request(`http://localhost/api/v1/x${q}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
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

const threadRow = (id, tenant_id, over = {}) => ({ id, tenant_id, user_id: USER, title: "Who booked this week?", scope: null, last_at: "2026-09-10T00:00:00Z", created_at: "2026-09-10T00:00:00Z", ...over });
const turn = (id, thread_id, tenant_id, role, content) => ({ id, thread_id, tenant_id, user_id: USER, role, content, created_at: "2026-09-10T00:00:01Z" });

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
  await refused(ask.POST.run(send("POST", { text: "Who booked this week?" }), ctxFor(tables)), "choose_workspace", 400, "say which one");
  await refused(ask.POST.run(send("POST", { text: "   " }, inB), ctxFor(tables)), "validation", 400, "Ask something.");
  await refused(ask.POST.run(send("POST", { text: "x".repeat(1001) }, inB), ctxFor(tables)), "validation", 400, "Keep a question under 1000 characters.");
  await refused(ask.POST.run(send("POST", { text: "And then?", thread_id: "nope" }, inB), ctxFor(tables)), "not_found", 404, "That thread does not exist.");
  const elsewhere = ctxFor(tables, {});
  await refused(ask.POST.run(send("POST", { text: "And then?", thread_id: T1 }, inB), elsewhere), "not_found", 404, "That thread is not yours.");
  assert.equal(writes(elsewhere), 0, "no turn is saved for a question that was refused");
  assert.deepEqual([tables.ask_threads.length, tables.ask_messages.length], [1, 0]);
});

test("a question answered: the thread is made before the model is asked, the person's words and the answer are its two turns, the thread is titled by what the answer did, and the stream says thread, then final", async () => {
  // The turn through the route, with the model scripted: one round, a finish.
  // Everything else -- the thread, the two messages, the retitle, the stream --
  // is the route's own and runs for real against the database in memory.
  const tables = {
    memberships: both("viewer", "operator"),
    tenants: [{ id: A, name: "Harbor", timezone: "America/New_York" }],
    tenant_config: [{ tenant_id: A, config: {}, version: 1 }],
    policies: [], ask_threads: [], ask_messages: [],
  };
  const finish = { type: "tool_use", id: "f1", name: "finish", text: "", json: JSON.stringify({ answer: "Nobody has booked this week yet.", citations: [], followups: ["Who called this week?"], navigate: null, language: "en" }) };
  setAskPorts({ round: async () => ({ blocks: [finish], stopReason: "tool_use", streamError: null }), snapshot: async () => "" });
  try {
    const res = await ask.POST.run(send("POST", { text: "Who booked this week?", surface: "today" }, inA), ctxFor(tables));
    assert.ok(res instanceof Response, "a stream, not an envelope");
    assert.equal(res.headers.get("content-type"), "application/x-ndjson; charset=utf-8");
    const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
    assert.deepEqual(lines.map((l) => l.t), ["thread", "final"]);
    assert.equal(tables.ask_threads.length, 1, "the thread exists before the model was asked");
    const thread = tables.ask_threads[0];
    assert.deepEqual([lines[0].id, thread.tenant_id, thread.user_id], [thread.id, A, USER]);
    assert.deepEqual(tables.ask_messages.map((m) => [m.thread_id, m.role, m.content.text]), [[thread.id, "user", "Who booked this week?"], [thread.id, "assistant", "Nobody has booked this week yet."]], "the person's words, then the answer");
    assert.deepEqual([lines[1].message.text, lines[1].message.followups, lines[1].message.failed, lines[1].message.rounds], ["Nobody has booked this week yet.", ["Who called this week?"], false, 1]);
    assert.equal(lines[1].message.id, tables.ask_messages[1].id, "the final line carries the saved turn");
    assert.notEqual(thread.title, "Who booked this week?".slice(0, 0), "titled");
    assert.ok(typeof thread.title === "string" && thread.title.length > 0 && thread.last_at, "retitled by what the answer did, and touched");
    assert.equal(tables.ask_messages[1].content.model, "claude-sonnet-5", "the one model name");
    // A follow-up on the same thread: the history rides in, nothing is re-created.
    const again = await ask.POST.run(send("POST", { text: "And last week?", thread_id: thread.id }, inA), ctxFor(tables));
    await again.text();
    assert.equal(tables.ask_threads.length, 1);
    assert.equal(tables.ask_messages.length, 4);
  } finally {
    setAskPorts(null);
  }
});

test("a card's outcome is the person's own turn: which card, an outcome in its shape, a turn that is theirs, and a card approved once cannot be approved again", async () => {
  const tables = {
    memberships: both("viewer", "viewer"),
    ask_messages: [turn(M1, T1, A, "assistant", { text: "I can send that.", proposals: [{ id: "p-1", kind: "reply", outcome: null }] })],
  };
  await refused(proposals.POST.run(send("POST", { state: "done", receipt: "Sent", atMs: 0 }), ctxFor(tables, { id: M1, pid: "x" })), "validation", 400, "Which card?");
  await refused(proposals.POST.run(send("POST", {}), ctxFor(tables, { id: M1, pid: "p-1" })), "validation", 400, "An outcome is { state, receipt, atMs, undo? }.");
  await refused(proposals.POST.run(send("POST", { state: "done", receipt: "Sent", atMs: 0 }), ctxFor(tables, { id: T2, pid: "p-1" })), "not_found", 404, "That turn is not yours or is already gone.");
  await refused(proposals.POST.run(send("POST", { state: "done", receipt: "Sent", atMs: 0 }), ctxFor(tables, { id: M1, pid: "p-2" })), "not_found", 404, "No such card on that turn.");
  const done = await proposals.POST.run(send("POST", { state: "done", receipt: "Sent", atMs: 0 }), ctxFor(tables, { id: M1, pid: "p-1" }));
  assert.equal(done.proposal.outcome.state, "done");
  assert.ok(done.proposal.outcome.atMs > 0, "an outcome with no clock gets this one");
  assert.equal(tables.ask_messages[0].content.proposals[0].outcome.receipt, "Sent", "recorded on the turn that proposed it");
  await refused(proposals.POST.run(send("POST", { state: "done", receipt: "Sent again", atMs: 0 }), ctxFor(tables, { id: M1, pid: "p-1" })), "conflict", 409, "That card was already approved.");
});

test("the openings and the threads answer the workspace the tab named; one thread is read and deleted as the person's own, once", async () => {
  const tables = {
    memberships: both("viewer", "viewer"),
    tenants: [], tenant_config: [],
    ask_threads: [threadRow(T1, A, { last_at: "2026-09-09T00:00:00Z" }), threadRow(T2, A, { last_at: "2026-09-10T00:00:00Z", title: "Newer" }), threadRow(T3, B)],
    ask_messages: [turn(M1, T1, A, "user", { text: "Who booked this week?" })],
  };
  const open = await openings.GET.run(get(`?day=saturday&workspace=${A}&workspace=${A}`), ctxFor(tables));
  assert.ok(open.openings && typeof open.openings === "object", "answered even with no calendar connected");
  assert.deepEqual((await threads.GET.run(get(inA), ctxFor(tables))).threads.map((t) => t.id), [T2, T1], "newest first, this workspace only");
  assert.deepEqual((await threads.GET.run(get(inB), ctxFor(tables))).threads.map((t) => t.id), [T3]);
  const one = await thread.GET.run(get(inA), ctxFor(tables, { id: T1 }));
  assert.equal(one.thread.id, T1);
  assert.equal(one.messages.length, 1);
  await refused(thread.GET.run(get(inA), ctxFor(tables, { id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd9" })), "not_found", 404, "not yours or is already gone");
  assert.deepEqual(await thread.DELETE.run(send("DELETE"), ctxFor(tables, { id: T1 })), { deleted: T1 });
  assert.ok(!tables.ask_threads.some((t) => t.id === T1));
  await refused(thread.DELETE.run(send("DELETE"), ctxFor(tables, { id: T1 })), "not_found", 404, "not yours or is already gone");
});

test("the metrics behind Today: the workspace the tab named, the days clamped to the function's range, and a function that says no is a 404, never a silent zero", async () => {
  const asked = [];
  const rpcs = { metrics_summary: (a) => { asked.push(a); return a.p_tenant_id === A ? { conversations: 3 } : { error: "not a member" }; } };
  const tables = { memberships: both("viewer", "viewer") };
  const out = await metrics.GET.run(get(inA), ctxFor(tables, {}, rpcs));
  assert.deepEqual(out, { metrics: { conversations: 3 }, workspaceId: A });
  await metrics.GET.run(get(`?days=400&workspace=${A}&workspace=${A}`), ctxFor(tables, {}, rpcs));
  await metrics.GET.run(get(`?days=0&workspace=${A}&workspace=${A}`), ctxFor(tables, {}, rpcs));
  assert.deepEqual(asked.map((a) => a.p_days), [1, 90, 1], "one day by default, ninety at most, never less than one");
  await refused(metrics.GET.run(get(inB), ctxFor(tables, {}, rpcs)), "not_found", 404, "Workspace metrics unavailable.");
});

test("the reports: the three presets and no other, the series from the function under the caller's RLS, the booking line never fatal; the campaigns' twin the same", async () => {
  const rpcs = {
    report_series: (a) => ({ days: a.p_days, tenant: a.p_tenant_id }),
    campaign_series: (a) => (a.p_tenant_id === A ? { days: a.p_days } : { error: "no" }),
    people_list: () => [],
  };
  const tables = { memberships: both("viewer", "viewer"), tenants: [], tenant_config: [], policies: [] };
  await refused(reports.GET.run(get(`?days=10&workspace=${A}&workspace=${A}`), ctxFor(tables, {}, rpcs)), "validation", 400, "days must be 7, 30 or 90.");
  const week = await reports.GET.run(get(`?days=7&workspace=${A}&workspace=${A}`), ctxFor(tables, {}, rpcs));
  assert.deepEqual(week.report, { days: 7, tenant: A });
  assert.ok("booking" in week, "the conversion line rides along, or null when the calendar cannot be read");
  const month = await reports.GET.run(get(inA), ctxFor(tables, {}, rpcs));
  assert.equal(month.report.days, 30, "thirty by default");
  await refused(campaigns.GET.run(get(`?days=45&workspace=${A}&workspace=${A}`), ctxFor(tables, {}, rpcs)), "validation", 400, "days must be 7, 30 or 90.");
  assert.deepEqual(await campaigns.GET.run(get(`?days=90&workspace=${A}&workspace=${A}`), ctxFor(tables, {}, rpcs)), { report: { days: 90 } });
  await refused(campaigns.GET.run(get(inB), ctxFor(tables, {}, rpcs)), "not_found", 404, "No workspace found for this report.");
});
