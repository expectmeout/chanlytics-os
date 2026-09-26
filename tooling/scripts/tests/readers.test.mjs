/**
 * The reader kernel (Ask Rewired Phase 1, spec 5.1): one read per turn per
 * reader and arguments, a failure never kept, the tenant's facts kept across
 * turns for five minutes per workspace and person, and the reader context a
 * route or a turn builds. Then the day's readers (PR 1.2): each GET route's
 * body, answering what the route's own test asserts, with the rows a citation
 * may name; and the Inbox and Today as the page composes them. Executed over
 * the database in memory.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { callerName, personName, toCallVM } from "@chanlytics/contracts";
import { fakeDb } from "./_fake-db.mjs";
import { PLAN } from "./_lead-fixtures.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const kernel = await import(at("apps/dashboard/src/server/readers/index.ts"));
const { facts, sellsBy, policies, config } = await import(at("apps/dashboard/src/server/readers/facts.ts"));
const { metrics } = await import(at("apps/dashboard/src/server/readers/metrics.ts"));
const { conversations } = await import(at("apps/dashboard/src/server/readers/conversations.ts"));
const { escalations } = await import(at("apps/dashboard/src/server/readers/escalations.ts"));
const { calls } = await import(at("apps/dashboard/src/server/readers/calls.ts"));
const { searches } = await import(at("apps/dashboard/src/server/readers/searches.ts"));
const { inbox } = await import(at("apps/dashboard/src/server/readers/inbox.ts"));
const { today } = await import(at("apps/dashboard/src/server/readers/today.ts"));
// Named apart from the fixtures below that build a conversation's and a message's rows.
const { conversation: oneThread, messagesOf } = await import(at("apps/dashboard/src/server/readers/conversation.ts"));
const { call: oneCall } = await import(at("apps/dashboard/src/server/readers/call.ts"));
const { person: onePerson } = await import(at("apps/dashboard/src/server/readers/person.ts"));
const threadRoute = await import(at("apps/dashboard/app/api/v1/conversations/[id]/route.ts"));
const personRoute = await import(at("apps/dashboard/app/api/v1/contacts/[id]/route.ts"));
const { report: reportReader } = await import(at("apps/dashboard/src/server/readers/report.ts"));
const { campaignReport } = await import(at("apps/dashboard/src/server/readers/campaign-report.ts"));
const reportsRoute = await import(at("apps/dashboard/app/api/v1/reports/route.ts"));
const campaignsRoute = await import(at("apps/dashboard/app/api/v1/reports/campaigns/route.ts"));
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const { calendarWeek } = await import(at("apps/dashboard/src/server/calendar.ts"));
const { forgetFeeds } = await import(at("apps/dashboard/src/server/ask/openings.ts"));
const { calendar: calendarReader, sources: calendarSources } = await import(
  at("apps/dashboard/src/server/readers/calendar.ts")
);
const calendarRoute = await import(at("apps/dashboard/app/api/v1/calendar/route.ts"));

// The kept values live in the module, keyed by workspace, person and reader: each test starts with none.
beforeEach(() => kernel.readerCache.clear());
// The aggregate routes count against their bucket: this instance's memory, never a store dialled.
beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "u1";
const ctxFor = (tables) => ({ supabase: fakeDb(tables, {}), userId: USER, email: "ada@example.com", metadata: {} });
const tables = () => ({
  tenants: [
    { id: A, name: "Harbor", timezone: "America/New_York", sells_by: "booking" },
    { id: B, name: "Bayside", timezone: "Europe/Madrid", sells_by: "booking" },
  ],
  tenant_config: [{ tenant_id: A, config: { hours: "9-5" }, version: 3 }],
  policies: [],
});

/** A reader that counts its reads and can be told to fail. */
const counting = (name, opts = {}) => {
  const r = {
    name,
    reads: 0,
    ...(opts.ttlMs ? { ttlMs: opts.ttlMs } : {}),
    async read(rc, args) {
      r.reads++;
      if (opts.fail && r.reads === 1) throw new Error("first read fails");
      return {
        data: { args, tenant: rc.tenantId },
        rows: [{ kind: "page", id: "today", route: "today", label: "Today" }],
        stamp: Date.now(),
      };
    },
  };
  return r;
};

test("stableJson: the same arguments in any key order are one key; undefined is its own key", () => {
  assert.equal(
    kernel.stableJson({ b: 1, a: [2, { d: 1, c: 2 }] }),
    kernel.stableJson({ a: [2, { c: 2, d: 1 }], b: 1 }),
  );
  assert.notEqual(kernel.stableJson({ a: 1 }), kernel.stableJson({ a: 2 }));
  assert.equal(kernel.stableJson(undefined), "");
});

test("a turn reads a reader once per arguments: the same call again is the same promise, other arguments read again, and a read that failed is not kept", async () => {
  const rc = kernel.readerContext(ctxFor(tables()), { tenantId: A, role: "operator" });
  const r = counting("r");
  const a = kernel.load(rc, r, { days: 7 });
  const b = kernel.load(rc, r, { days: 7 });
  assert.equal(a, b, "the same promise");
  assert.deepEqual((await a).data, { args: { days: 7 }, tenant: A });
  await kernel.load(rc, r, { days: 30 });
  assert.equal(r.reads, 2, "other arguments are another read");
  const f = counting("f", { fail: true });
  await assert.rejects(kernel.load(rc, f, undefined), /first read fails/);
  const again = await kernel.load(rc, f, undefined);
  assert.deepEqual([f.reads, again.data.tenant], [2, A], "the failure was not kept: the second call read again");
  const other = kernel.readerContext(ctxFor(tables()), { tenantId: A, role: "operator" });
  await kernel.load(other, r, { days: 7 });
  assert.equal(r.reads, 3, "another turn is another read");
});

test("a reader with a ttl is kept across turns on this instance, per workspace and person, until the ttl; a failure is not kept; the cache is bounded", async () => {
  const r = counting("kept", { ttlMs: 60_000 });
  const t1 = kernel.readerContext(ctxFor(tables()), { tenantId: A, role: "owner" });
  const t2 = kernel.readerContext(ctxFor(tables()), { tenantId: A, role: "owner" });
  await kernel.load(t1, r, undefined);
  await kernel.load(t2, r, undefined);
  assert.equal(r.reads, 1, "the second turn read the kept value");
  const elsewhere = kernel.readerContext(ctxFor(tables()), { tenantId: B, role: "owner" });
  await kernel.load(elsewhere, r, undefined);
  assert.equal(r.reads, 2, "another workspace is another entry");
  const someoneElse = kernel.readerContext({ ...ctxFor(tables()), userId: "u2" }, { tenantId: A, role: "owner" });
  await kernel.load(someoneElse, r, undefined);
  assert.equal(r.reads, 3, "another person is another entry");
  kernel.readerCache.clear();
  const f = counting("kept-fail", { ttlMs: 60_000, fail: true });
  await assert.rejects(kernel.load(t1, f, undefined));
  await kernel.load(t2, f, undefined);
  assert.equal(f.reads, 2, "a failed read is not kept");
  kernel.readerCache.clear();
  const stale = counting("stale", { ttlMs: 10 });
  await kernel.load(kernel.readerContext(ctxFor(tables()), { tenantId: A, role: "owner" }), stale, undefined);
  await new Promise((res) => setTimeout(res, 15));
  await kernel.load(kernel.readerContext(ctxFor(tables()), { tenantId: A, role: "owner" }), stale, undefined);
  assert.equal(stale.reads, 2, "past the ttl the value is read again");
  assert.equal(kernel.READER_CACHE_CAP, 500);
});

test("the kept values are bounded at READER_CACHE_CAP, the oldest write first out: a value read again goes to the back", async () => {
  const turn = () => kernel.readerContext(ctxFor(tables()), { tenantId: A, role: "owner" });
  const r = counting("fifo", { ttlMs: 60_000 });
  await kernel.load(turn(), r, { n: 0 });
  await kernel.load(turn(), r, { n: 1 });
  // Both go stale, and the first is read again: a new write of it.
  r.ttlMs = 1;
  await new Promise((res) => setTimeout(res, 5));
  await kernel.load(turn(), r, { n: 0 });
  r.ttlMs = 60_000;
  // One past the cap: the oldest write goes, which is now the second value, not the first.
  for (let n = 2; n <= kernel.READER_CACHE_CAP; n++) await kernel.load(turn(), r, { n });
  const reads = r.reads;
  await kernel.load(turn(), r, { n: 0 });
  assert.equal(r.reads, reads, "the value read again was kept: its write was the newer");
  await kernel.load(turn(), r, { n: 1 });
  assert.equal(r.reads, reads + 1, "the oldest write was the one let go");
});

test("the facts readers: the tenant's name and zone are read once and kept; sells_by, the policies and the config are read once per turn; each answers the row's fields and nothing else", async () => {
  const ctx = ctxFor(tables());
  const rc = kernel.readerContext(ctx, { tenantId: A, role: "operator" });
  const [f, s, p, c] = await Promise.all([
    kernel.load(rc, facts, undefined),
    kernel.load(rc, sellsBy, undefined),
    kernel.load(rc, policies, undefined),
    kernel.load(rc, config, undefined),
  ]);
  assert.deepEqual(f.data, { name: "Harbor", timezone: "America/New_York" });
  assert.equal(s.data, "booking");
  assert.deepEqual(p.data, []);
  assert.deepEqual(c.data, { config: { hours: "9-5" }, version: 3 });
  await Promise.all([kernel.load(rc, facts, undefined), kernel.load(rc, config, undefined)]);
  const reads = (table) => ctx.supabase.seen.filter((q) => q.table === table && q.op === "select").length;
  assert.deepEqual(
    [reads("tenants"), reads("tenant_config")],
    [2, 1],
    "tenants once for facts and once for sells_by; the config once",
  );
  const later = kernel.readerContext(ctxFor(tables()), { tenantId: A, role: "operator" });
  const f2 = await kernel.load(later, facts, undefined);
  assert.deepEqual(f2.data, f.data);
  assert.equal(
    later.ctx.supabase.seen.filter((q) => q.table === "tenants").length,
    0,
    "the next turn's facts came from the kept value",
  );
  const none = kernel.readerContext(ctxFor({ tenants: [], tenant_config: [], policies: [] }), {
    tenantId: B,
    role: "viewer",
  });
  assert.deepEqual(
    (await kernel.load(none, facts, undefined)).data,
    { name: "Workspace", timezone: "America/New_York" },
    "tenantFacts' own defaults",
  );
  assert.equal((await kernel.load(none, config, undefined)).data, null);
});

/* ----------------------------------------------- the day's readers (PR 1.2) */

const C1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const C2 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
const L1 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
const L2 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2";
const L3 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3";
const S1 = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const R1 = "bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb";
const HOUR = 3_600_000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const uuid = (i) => `cccccccc-cccc-4ccc-8ccc-${String(i).padStart(12, "0")}`;
/** A request's database: the doors it may call, the reads that fail, PostgREST's row cap. */
const dayCtx = (tbls, { rpcs = {}, faults = {}, opts = {} } = {}) => ({
  supabase: fakeDb(tbls, faults, rpcs, opts),
  userId: USER,
  email: "ada@example.com",
  params: {},
});
/** The context a route builds from the membership it resolved. */
const turnIn = (ctx, tenantId = A) => kernel.readerContext(ctx, { tenantId, role: "viewer" });
const selects = (ctx, table) => ctx.supabase.seen.filter((q) => q.table === table && q.op === "select");

// The rows as the route tests build them (inbox-server, inbox-routes, lead-routes), so each reader answers their fixture.
const contact = (over = {}) => ({
  id: "k1",
  display_name: "Ada",
  wa_profile_name: null,
  phone_e164: "+15550000001",
  consent: "opted_in",
  dnc: false,
  marketing_consent: null,
  ...over,
});
const conversation = (id, tenant_id, over = {}) => ({
  id,
  tenant_id,
  state: "needs_human",
  paused_until: null,
  snooze_until: null,
  assignee_user_id: null,
  last_wa_inbound_at: ago(HOUR),
  last_message_at: ago(HOUR),
  contact_id: "k1",
  contacts: contact(),
  ...over,
});
const message = (id, conversation_id, tenant_id, over = {}) => ({
  id,
  conversation_id,
  tenant_id,
  direction: "inbound",
  sender: "customer",
  type: "text",
  body: "hi",
  media: null,
  meta: null,
  status: "received",
  channel: "whatsapp",
  channel_ts: ago(HOUR),
  created_at: ago(HOUR),
  ...over,
});
const call = (id, tenant_id, over = {}) => ({
  id,
  tenant_id,
  retell_call_id: `rc-${id.slice(-1)}`,
  direction: "inbound",
  call_type: "inbound",
  status: "ended",
  from_e164: "+15550000001",
  from_raw: null,
  to_e164: "+15550000002",
  started_at: "2026-09-01T00:00:00Z",
  ended_at: null,
  updated_at: null,
  duration_ms: null,
  disconnection_reason: null,
  sentiment: null,
  call_successful: null,
  in_voicemail: null,
  summary: null,
  conversation_id: C1,
  recording: null,
  ...over,
});
const view = (over = {}) => ({
  id: S1,
  tenant_id: A,
  name: "Trainers",
  asked: "",
  via: "people",
  plan: PLAN,
  removed_at: null,
  created_at: "2026-09-19T00:00:00Z",
  round_id: R1,
  seq: 1,
  purpose: "probe",
  state: "waiting_on_owner",
  ending: null,
  question: { sentence: "…", criterionKey: "chains", dropTerm: null, asked_at: "2026-09-19T00:00:00Z" },
  answered: null,
  target: 20,
  plan_version: 1,
  qualified: 12,
  review: 0,
  excluded: 13,
  counted: 12,
  judge_tokens: 900,
  ending_pending: null,
  waiting_since: null,
  ended_at: null,
  emails_checked: 0,
  with_phone: 0,
  undo_op_id: null,
  undo_version: null,
  ...over,
});
const COUNTS = { all: 322, ready: 272, nurture: 31, converted: 9, said_no: 6, not_a_fit: 4 };

test("metrics: the numbers behind Today as GET metrics answers them, for the days handed in, in the workspace read; a function that says no is a 404, never a silent zero", async () => {
  // ask-routes.test.mjs, "the metrics behind Today".
  const asked = [];
  const rpcs = {
    metrics_summary: (a) => {
      asked.push(a);
      return a.p_tenant_id === A ? { conversations: 3 } : { error: "not a member" };
    },
  };
  const r = await kernel.load(turnIn(dayCtx({}, { rpcs })), metrics, { days: 1 });
  assert.deepEqual(r.data, { metrics: { conversations: 3 }, workspaceId: A });
  assert.deepEqual(r.rows, [], "a count is not a row a citation names");
  await kernel.load(turnIn(dayCtx({}, { rpcs })), metrics, { days: 90 });
  assert.deepEqual(
    asked.map((a) => a.p_days),
    [1, 90],
    "the days as handed in: the clamp is the route's",
  );
  await assert.rejects(kernel.load(turnIn(dayCtx({}, { rpcs }), B), metrics, { days: 1 }), (e) => {
    assert.deepEqual([e.code, e.status, e.message], ["not_found", 404, "Workspace metrics unavailable."]);
    return true;
  });
});

test("conversations: the Inbox as GET conversations answers it -- the named workspace's newest hundred with their messages, paged past PostgREST's thousand rows, or the ids handed in -- each a thread, named as the Inbox row names it", async () => {
  // reads-routes.test.mjs, "the Inbox read answers the workspace the tab named".
  const two = {
    conversations: [
      conversation("c-a", A, { contacts: contact({ display_name: "Dana", phone_e164: "+13055550100" }) }),
      conversation("c-b", B, { contacts: contact({ id: "k2", display_name: "Eli", phone_e164: "+13055550101" }) }),
    ],
    messages: [],
  };
  const inBayside = await kernel.load(turnIn(dayCtx(two), B), conversations, { ids: null });
  assert.deepEqual(
    inBayside.data.conversations.map((c) => c.id),
    ["c-b"],
    "only the named workspace's rows",
  );
  assert.deepEqual(inBayside.rows, [{ kind: "thread", id: "c-b", route: "inbox/th-c-b", label: "Eli" }]);

  // inbox-server.test.mjs, "the Inbox's read reaches every thread's messages past PostgREST's thousand rows".
  const threads = Array.from({ length: 30 }, (_, i) => conversation(uuid(i), A, { last_message_at: ago(i * HOUR) }));
  const said = threads.flatMap((c, i) =>
    Array.from({ length: 90 }, (_, j) =>
      message(`m-${i}-${j}`, c.id, A, { created_at: ago(i * HOUR + j * 1000), channel_ts: ago(i * HOUR + j * 1000) }),
    ),
  );
  const ctx = dayCtx({ conversations: threads, messages: said }, { opts: { maxRows: 1000 } });
  const newest = await kernel.load(turnIn(ctx), conversations, { ids: null });
  assert.equal(
    newest.data.conversations.filter((c) => c.messages.length === 0).length,
    0,
    "none reads No messages yet",
  );
  assert.equal(
    newest.data.conversations.reduce((n, c) => n + c.messages.length, 0),
    2700,
  );
  assert.deepEqual(
    selects(ctx, "conversations").map((q) => [q.order, q.desc, q.limit]),
    [["last_message_at", true, 100]],
    "the newest hundred, in one read",
  );
  assert.deepEqual(
    selects(ctx, "messages").map((q) => q.range),
    [
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ],
    "the messages a page at a time, until a page comes back short",
  );
  assert.deepEqual(
    newest.rows.map((r) => r.id),
    newest.data.conversations.map((c) => c.id),
    "one thread per conversation, in its order",
  );
  assert.ok(newest.rows.every((r) => r.kind === "thread" && r.route === `inbox/th-${r.id}` && r.label === "Ada"));

  // inbox-server.test.mjs, "the escalated threads the page did not load come back in one read, by id".
  const tbls = {
    conversations: [
      conversation(C1, A),
      conversation(C2, A, { contacts: contact({ display_name: null, phone_e164: "+15550000009" }) }),
      conversation(uuid(9), B),
    ],
    messages: [message("m1", C1, A), message("m2", C2, A), message("m9", uuid(9), B)],
  };
  const byIds = await kernel.load(turnIn(dayCtx(tbls)), conversations, { ids: [C2, uuid(9)] });
  assert.deepEqual(
    byIds.data.conversations.map((c) => c.id),
    [C2],
    "the ones asked for, in the named workspace only",
  );
  assert.deepEqual(
    byIds.data.conversations[0].messages.map((m) => m.id),
    ["m2"],
  );
  assert.deepEqual(
    byIds.rows,
    [{ kind: "thread", id: C2, route: `inbox/th-${C2}`, label: "+1 (555) 000-0009" }],
    "a person with no name is their number, as the Inbox row says it",
  );
});

test("escalations: GET escalations' answer -- the named workspace's escalations in the state handed in, newest first, a hundred at most -- and not rows a citation names", async () => {
  // inbox-routes.test.mjs, "the escalations read answers the workspace the tab named".
  const tbls = {
    escalations: [
      {
        id: "e1",
        tenant_id: A,
        state: "open",
        reason: "price",
        details: null,
        created_at: "2026-09-01T00:00:00Z",
        conversation_id: C1,
      },
      {
        id: "e2",
        tenant_id: A,
        state: "resolved",
        reason: "price",
        details: null,
        created_at: "2026-09-02T00:00:00Z",
        conversation_id: C1,
      },
      {
        id: "e3",
        tenant_id: B,
        state: "open",
        reason: "booking",
        details: null,
        created_at: "2026-09-03T00:00:00Z",
        conversation_id: C2,
      },
    ],
  };
  const ctx = dayCtx(tbls);
  const open = await kernel.load(turnIn(ctx), escalations, { state: "open" });
  assert.deepEqual(
    open.data.escalations.map((e) => e.id),
    ["e1"],
  );
  assert.deepEqual(open.rows, []);
  const resolved = await kernel.load(turnIn(ctx), escalations, { state: "resolved" });
  assert.deepEqual(
    resolved.data.escalations.map((e) => e.id),
    ["e2"],
  );
  const bayside = await kernel.load(turnIn(ctx, B), escalations, { state: "open" });
  assert.deepEqual(
    bayside.data.escalations.map((e) => e.id),
    ["e3"],
  );
  assert.ok(selects(ctx, "escalations").every((q) => q.order === "created_at" && q.desc && q.limit === 100));
});

test("calls: GET calls' answer -- the named workspace's calls, newest first, narrowed to a status or a thread when handed one, no recording's path -- each a call, named as the Calls page names the caller", async () => {
  // inbox-routes.test.mjs, "the calls read is the workspace's, newest first, narrowed by status or thread".
  const tbls = {
    calls: [
      call(L1, A, {
        started_at: "2026-09-01T00:00:00Z",
        recording: {
          storage_path: "a/b.mp3",
          fetch_state: "stored",
          provider_url: "https://provider.example/x",
          mime: "audio/mpeg",
          bytes: 10,
        },
      }),
      call(L2, A, {
        started_at: "2026-09-02T00:00:00Z",
        status: "ongoing",
        conversation_id: C2,
        contacts: { display_name: "Dana", wa_profile_name: null, phone_e164: "+15550000003" },
      }),
      call(L3, B),
    ],
  };
  const all = await kernel.load(turnIn(dayCtx(tbls)), calls, {});
  assert.deepEqual(
    all.data.calls.map((c) => c.id),
    [L2, L1],
    "newest first, this workspace only",
  );
  const json = JSON.stringify(all.data.calls);
  assert.ok(!json.includes("storage_path") && !json.includes("provider.example"), "audio only through its own route");
  const ongoing = await kernel.load(turnIn(dayCtx(tbls)), calls, { status: "ongoing" });
  assert.deepEqual(
    ongoing.data.calls.map((c) => c.id),
    [L2],
  );
  const ofThread = await kernel.load(turnIn(dayCtx(tbls)), calls, { conversationId: C1 });
  assert.deepEqual(
    ofThread.data.calls.map((c) => c.id),
    [L1],
  );
  assert.deepEqual(
    all.rows,
    [
      { kind: "call", id: L2, route: `conversations/cv-${L2}`, label: "Dana" },
      { kind: "call", id: L1, route: `conversations/cv-${L1}`, label: "+1 (555) 000-0001" },
    ],
    "a caller by their name, or their number when they have none",
  );

  // Who a call is with, derived once (contracts callerName): each row's label is the Calls page's own `who` for that
  // row, without a view model built per call on every read.
  const L4 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee4";
  const named = await kernel.load(
    turnIn(
      dayCtx({
        calls: [
          call(L1, A, {
            started_at: "2026-09-04T00:00:00Z",
            contacts: { display_name: "Dana", wa_profile_name: null, phone_e164: "+15550000003" },
          }),
          call(L2, A, { started_at: "2026-09-03T00:00:00Z" }),
          call(L3, A, { started_at: "2026-09-02T00:00:00Z", from_e164: null, from_raw: "Restricted" }),
          call(L4, A, { started_at: "2026-09-01T00:00:00Z", from_e164: null, from_raw: null }),
        ],
      }),
    ),
    calls,
    {},
  );
  assert.deepEqual(
    named.rows.map((r) => [r.id, r.label]),
    [
      [L1, "Dana"],
      [L2, "+1 (555) 000-0001"],
      [L3, "Restricted"],
      [L4, "Caller ID withheld"],
    ],
    "a contact's name, else the number the phone showed, else what the line handed over; with neither, withheld",
  );
  assert.deepEqual(
    named.rows.map((r) => r.label),
    named.data.calls.map((c) => toCallVM(c, "America/New_York", new Date()).who),
    "the Calls page's own who, for the same rows",
  );
  assert.deepEqual(
    named.data.calls.map((c) => callerName(c)),
    named.rows.map((r) => r.label),
  );
});

test("searches: GET lead-searches' answer -- every kept search with its latest round, and the rail's counts, read together -- and no row a citation names yet", async () => {
  // lead-routes.test.mjs, "the searches read brings the rail's counts with it".
  const ctx = dayCtx(
    {
      lead_searches_view: [
        view({
          ending_pending: "stopped",
          waiting_since: "2026-09-19T11:00:00Z",
          ended_at: null,
          emails_checked: 41,
          with_phone: 72,
        }),
      ],
    },
    { rpcs: { lead_list_counts: () => COUNTS } },
  );
  const r = await kernel.load(turnIn(ctx), searches, undefined);
  assert.deepEqual(r.data.counts, COUNTS);
  const [s] = r.data.searches;
  assert.deepEqual(
    [s.id, s.asked_on, s.round.ending_pending, s.round.emails_checked, s.round.with_phone],
    [S1, "2026-09-19T00:00:00Z", true, 41, 72],
  );
  assert.deepEqual(r.rows, [], "a search is not citable until Phase 4");
  assert.equal(selects(ctx, "lead_searches_view").length, 1);
});

/* -------------------------------------- the Inbox and Today, as the page composes them */

/** What `fn` logged under one event name. */
async function logged(event, fn) {
  const lines = [];
  const was = console.error;
  console.error = (name, ...rest) => {
    if (name === event) lines.push(rest);
  };
  try {
    return { result: await fn(), lines };
  } finally {
    console.error = was;
  }
}

/**
 * A workspace a hundred and one threads deep: the newest hundred, and one gone quiet that still waits on a person.
 * Two open escalations, the newer on a thread among the hundred, the older on the quiet one.
 */
const OUTSIDE = uuid(100);
const dayTables = () => ({
  conversations: [
    ...Array.from({ length: 100 }, (_, i) => conversation(uuid(i), A, { last_message_at: ago(i * HOUR) })),
    conversation(OUTSIDE, A, {
      last_message_at: ago(200 * HOUR),
      contacts: contact({ id: "k9", display_name: "Quinn", phone_e164: "+15550000009" }),
    }),
  ],
  messages: [message("m3", uuid(3), A), message("m-out", OUTSIDE, A, { created_at: ago(200 * HOUR) })],
  escalations: [
    {
      id: "e-in",
      tenant_id: A,
      state: "open",
      reason: "price",
      details: null,
      created_at: ago(HOUR),
      conversation_id: uuid(3),
    },
    {
      id: "e-out",
      tenant_id: A,
      state: "open",
      reason: "human_token",
      details: null,
      created_at: ago(2 * HOUR),
      conversation_id: OUTSIDE,
    },
  ],
  calls: [
    call(L1, A, { started_at: "2026-09-01T00:00:00Z" }),
    call(L2, A, {
      started_at: "2026-09-02T00:00:00Z",
      contacts: { display_name: "Dana", wa_profile_name: null, phone_e164: "+15550000003" },
    }),
  ],
  lead_searches_view: [view()],
});
const SUMMARY = { period: { messages_in: 2 } };
const dayDoors = { metrics_summary: () => SUMMARY, lead_list_counts: () => COUNTS };

test("the Inbox as the page composes it: the newest hundred and the open escalations at once, then every escalated thread outside the hundred in one read by id, first; one the extra read cannot bring is counted in the log", async () => {
  const ctx = dayCtx(dayTables());
  const r = await kernel.load(turnIn(ctx), inbox, undefined);
  assert.deepEqual(
    r.data.conversations.map((c) => c.id),
    [OUTSIDE, ...Array.from({ length: 100 }, (_, i) => uuid(i))],
    "the escalated thread outside the hundred first, then the hundred: the Inbox's order",
  );
  assert.deepEqual(
    r.data.escalations.map((e) => e.id),
    ["e-in", "e-out"],
    "the open escalations as read, newest first",
  );
  assert.deepEqual(
    r.data.conversations[0].messages.map((m) => m.id),
    ["m-out"],
    "with its messages",
  );
  const read = selects(ctx, "conversations");
  assert.deepEqual(
    read.map((q) => [q.limit, q.filters.find(([op]) => op === "in")?.[2] ?? null]),
    [
      [100, null],
      [null, [OUTSIDE]],
    ],
    "conversations twice: the newest hundred, then the missing ids",
  );
  assert.equal(selects(ctx, "messages").length, 2, "the messages a page per read");
  assert.equal(selects(ctx, "escalations").length, 1);
  assert.deepEqual(
    r.rows.map((x) => x.id),
    r.data.conversations.map((c) => c.id),
    "one thread per conversation, in the Inbox's order",
  );
  assert.deepEqual(r.rows[0], { kind: "thread", id: OUTSIDE, route: `inbox/th-${OUTSIDE}`, label: "Quinn" });

  // The second conversations read fails: the list stands without it, and says how many it could not bring.
  let n = 0;
  const faults = {
    get "conversations.select"() {
      return ++n === 2 ? { message: "down" } : undefined;
    },
  };
  const { result: short, lines } = await logged("inbox_escalated_fetch_failed", () =>
    kernel.load(turnIn(dayCtx(dayTables(), { faults })), inbox, undefined),
  );
  assert.deepEqual(
    short.data.conversations.map((c) => c.id),
    Array.from({ length: 100 }, (_, i) => uuid(i)),
  );
  assert.equal(short.data.escalations.length, 2, "the escalations stand");
  assert.deepEqual(lines, [[1]], "one waiting customer the read could not bring, counted");
});

test("Today for Ask as the page composes it: the day's metrics, the newest hundred, the open escalations, the calls and the searches at once -- no escalated thread fetched by id, which is the Inbox's read -- each read once in the turn and shared with the Inbox; a failed calls or searches read is null and the rest stands", async () => {
  const ctx = dayCtx(dayTables(), { rpcs: dayDoors });
  const rc = turnIn(ctx);
  const r = await kernel.load(rc, today, undefined);
  assert.deepEqual(Object.keys(r.data), ["metrics", "conversations", "escalations", "calls", "searches"]);
  assert.deepEqual(r.data.metrics, SUMMARY);
  assert.deepEqual(
    r.data.conversations.map((c) => c.id),
    Array.from({ length: 100 }, (_, i) => uuid(i)),
    "the newest hundred, as the Today page reads them: the quiet thread that waits is not fetched",
  );
  assert.deepEqual(
    r.data.escalations.map((e) => e.id),
    ["e-in", "e-out"],
    "its escalation is read: the page counts it as a customer waiting",
  );
  assert.deepEqual(
    r.data.calls.map((c) => c.id),
    [L2, L1],
  );
  assert.deepEqual(
    r.data.searches.map((s) => s.id),
    [S1],
  );
  const hundred = await kernel.load(rc, conversations, { ids: null });
  assert.equal(r.data.conversations, hundred.data.conversations, "the hundred's own read, shared through the turn");
  assert.deepEqual(r.rows, [
    ...hundred.rows,
    { kind: "call", id: L2, route: `conversations/cv-${L2}`, label: "Dana" },
    { kind: "call", id: L1, route: `conversations/cv-${L1}`, label: "+1 (555) 000-0001" },
  ]);
  const reads = () =>
    ["conversations", "escalations", "calls", "lead_searches_view"].map((t) => selects(ctx, t).length);
  assert.deepEqual(reads(), [1, 1, 1, 1], "Today alone reads each once");
  assert.deepEqual(
    ctx.supabase.seen.filter((q) => q.rpc === "metrics_summary").map((q) => q.args.p_days),
    [1],
    "the day's metrics",
  );
  // list_threads and list_calls beside it in the turn: the Inbox reads only the ids the hundred did not hold.
  const theInbox = await kernel.load(rc, inbox, undefined);
  await kernel.load(rc, calls, {});
  assert.equal(theInbox.data.conversations[0].id, OUTSIDE);
  assert.deepEqual(
    reads(),
    [2, 1, 1, 1],
    "the hundred, the escalations and the calls shared; the missing ids read once, for the Inbox",
  );

  const { result: noCalls, lines: callLines } = await logged("today_calls_fetch_failed", () =>
    kernel.load(
      turnIn(dayCtx(dayTables(), { rpcs: dayDoors, faults: { "calls.select": { message: "permission denied" } } })),
      today,
      undefined,
    ),
  );
  assert.equal(noCalls.data.calls, null, "a calls read that failed is its own state, not none");
  assert.equal(noCalls.data.conversations.length, 100);
  assert.equal(noCalls.data.searches.length, 1);
  assert.deepEqual(callLines, [["permission denied"]]);

  const { result: noSearches, lines: searchLines } = await logged("today_searches_fetch_failed", () =>
    kernel.load(
      turnIn(dayCtx(dayTables(), { rpcs: dayDoors, faults: { "lead_searches_view.select": { message: "down" } } })),
      today,
      undefined,
    ),
  );
  assert.equal(noSearches.data.searches, null, "the queue says nothing of searches it could not read");
  assert.equal(noSearches.data.calls.length, 2);
  assert.deepEqual(noSearches.data.metrics, SUMMARY);
  assert.deepEqual(searchLines, [["down"]]);
});

/* -------------------------------------------------- the thread and the call (PR 1.3) */

const membership = (tenant_id, role, slug, created_at) => ({
  user_id: USER,
  tenant_id,
  role,
  tenants: { slug },
  created_at,
});
/**
 * inbox-routes.test.mjs, "one thread: any member reads it where it lives": two threads of bayside, a member of both
 * workspaces (a viewer in harbor, an operator in bayside), and the thread's two messages beside the other's one.
 */
const threadTables = () => ({
  memberships: [
    membership(A, "viewer", "harbor", "2026-01-01T00:00:00Z"),
    membership(B, "operator", "bayside", "2026-02-01T00:00:00Z"),
  ],
  conversations: [conversation(C1, B), conversation(C2, B)],
  messages: [
    message("m1", C1, B, { created_at: "2026-09-01T00:00:00Z", body: "first" }),
    message("m2", C1, B, { created_at: "2026-09-02T00:00:00Z", body: "second", direction: "outbound", sender: "ai" }),
    message("m3", C2, B, { created_at: "2026-09-03T00:00:00Z", body: "elsewhere" }),
  ],
});
/** A GET's request: `q` is its query string. */
const req = (q = "") => new Request(`http://localhost/api/v1/x${q}`);
/** A route's context over `tbls`, for the row `id` names. */
const routeCtx = (tbls, id) => ({ supabase: fakeDb(tbls, {}), userId: USER, email: "ada@example.com", params: { id } });

test("the one thread's messages carry an attachment's public facts, never its storage path", async () => {
  // Was a source pin on the route's text (media.test.mjs): GET conversations/:id, run.
  const tbls = threadTables();
  tbls.messages.push(
    message("m4", C1, B, {
      created_at: "2026-09-02T12:00:00Z",
      type: "media",
      body: null,
      media: {
        provider_media_id: "wamid.X",
        mime_type: "image/jpeg",
        caption: "hi",
        filename: null,
        sha256: "abc",
        storage_path: "t/c/m.jpg",
        fetch_state: "stored",
      },
    }),
  );
  const page = await threadRoute.GET.run(req(), routeCtx(tbls, C1));
  assert.deepEqual(
    page.messages.map((m) => [m.id, m.media]),
    [
      ["m1", null],
      ["m2", null],
      ["m4", { mime_type: "image/jpeg", fetch_state: "stored", filename: null, caption: "hi" }],
    ],
  );
  const json = JSON.stringify(page);
  assert.ok(
    !json.includes("t/c/m.jpg") && !json.includes("wamid.X") && !json.includes("sha256"),
    "the bytes only through their own route",
  );
  // The route's messages are its reader's, and Ask reads the same ones.
  const read = await kernel.load(turnIn(dayCtx(tbls), B), messagesOf, { id: C1, before: null });
  assert.deepEqual(read.data, page.messages);
  assert.deepEqual(read.rows, [], "a message is cited by its thread");
});

test("GET conversations/:id through its reader asks what it asked, in the same order: the row once, in its scope, then the messages once -- the row is never read a second time", async () => {
  const tbls = threadTables();
  for (const [q, filters] of [
    ["", [["eq", "conversation_id", C1]]],
    [
      "?before=2026-09-02T00:00:00Z",
      [
        ["eq", "conversation_id", C1],
        ["lt", "created_at", "2026-09-02T00:00:00Z"],
      ],
    ],
  ]) {
    const ctx = routeCtx(tbls, C1);
    await threadRoute.GET.run(req(q), ctx);
    assert.deepEqual(
      ctx.supabase.seen.map((s) => s.table),
      ["conversations", "memberships", "messages"],
      "the scope's row, the membership judged where it lives, the messages",
    );
    assert.deepEqual([selects(ctx, "conversations").length, selects(ctx, "messages").length], [1, 1]);
    const [m] = selects(ctx, "messages");
    assert.deepEqual(
      [m.columns, m.order, m.desc, m.limit, m.filters],
      [
        "id, direction, sender, type, body, media, meta, created_at, status, channel_ts, channel",
        "created_at",
        true,
        100,
        filters,
      ],
    );
  }
});

test("the one thread for Ask is what GET conversations/:id answers for it, key for key -- the row the route's scope loads, the hundred newest messages oldest first, paged back by `before` -- read with the row once and the messages once, and the thread and its person named as the Inbox names them", async () => {
  const tbls = threadTables();
  const page = await threadRoute.GET.run(req(), routeCtx(tbls, C1));
  const ctx = dayCtx(tbls);
  const r = await kernel.load(turnIn(ctx, B), oneThread, { id: C1, before: null });
  assert.deepEqual(r.data, page, "the route's payload");
  assert.deepEqual(Object.keys(r.data), ["conversation", "messages"]);
  assert.deepEqual(
    r.data.messages.map((m) => m.body),
    ["first", "second"],
    "oldest first, this thread only",
  );
  assert.deepEqual(
    [selects(ctx, "conversations").length, selects(ctx, "messages").length],
    [1, 1],
    "the row once, through the loader the scope uses; the messages once",
  );
  assert.deepEqual(r.rows, [
    { kind: "thread", id: C1, route: `inbox/th-${C1}`, label: "Ada" },
    { kind: "person", id: "k1", route: "clients/k1", label: "Ada" },
  ]);

  const olderPage = await threadRoute.GET.run(req("?before=2026-09-02T00:00:00Z"), routeCtx(tbls, C1));
  const older = await kernel.load(turnIn(dayCtx(tbls), B), oneThread, { id: C1, before: "2026-09-02T00:00:00Z" });
  assert.deepEqual(older.data, olderPage, "paged back as the route pages");
  assert.deepEqual(
    older.data.messages.map((m) => m.body),
    ["first"],
  );

  // Named as the Inbox row names the same thread: a person reached only by email is their address, never "Unknown".
  const byEmail = {
    ...threadTables(),
    conversations: [
      conversation(C1, B, { contacts: contact({ display_name: null, phone_e164: null, email: "ada@example.com" }) }),
    ],
  };
  const listed = await kernel.load(turnIn(dayCtx(byEmail), B), conversations, { ids: [C1] });
  const one = await kernel.load(turnIn(dayCtx(byEmail), B), oneThread, { id: C1, before: null });
  assert.deepEqual(
    one.rows.map((x) => x.label),
    [listed.rows[0].label, listed.rows[0].label],
  );
  assert.equal(listed.rows[0].label, "ada@example.com");
  // A thread with nobody behind it is the thread alone.
  const nobody = { ...threadTables(), conversations: [conversation(C1, B, { contact_id: null, contacts: null })] };
  const bare = await kernel.load(turnIn(dayCtx(nobody), B), oneThread, { id: C1, before: null });
  assert.deepEqual(bare.rows, [{ kind: "thread", id: C1, route: `inbox/th-${C1}`, label: "Unknown" }]);
});

test("a thread this workspace does not hold is the page's 404, in the scope's own words -- one that is not there, another workspace's, or not an id -- and none of its messages is read", async () => {
  const notFound = (message) => (e) => {
    assert.deepEqual([e.code, e.status, e.message], ["not_found", 404, message]);
    return true;
  };
  const tbls = threadTables();
  await assert.rejects(
    kernel.load(turnIn(dayCtx(tbls), B), oneThread, { id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc9", before: null }),
    notFound("Conversation not found."),
  );
  // Bayside's thread in a harbor turn. RLS would show it to a member of both, and this double has no RLS at all: the
  // turn's workspace is what refuses it, as the route refuses a member of harbor alone where the row lives.
  const ctx = dayCtx(tbls);
  await assert.rejects(
    kernel.load(turnIn(ctx, A), oneThread, { id: C1, before: null }),
    notFound("Conversation not found."),
  );
  assert.equal(selects(ctx, "messages").length, 0, "no message of another workspace's thread is read");
  await assert.rejects(
    kernel.load(turnIn(dayCtx(tbls), B), oneThread, { id: "not-a-uuid", before: null }),
    notFound("That conversation does not exist."),
  );
});

test("one call for Ask: the Calls page's own columns and mapping for one call, read under the workspace's own filter -- another workspace's call, or one not there, is the call routes' 404 -- and the call and its person are the rows", async () => {
  const stored = {
    storage_path: "a/b.mp3",
    fetch_state: "stored",
    provider_url: "https://provider.example/x",
    mime: "audio/mpeg",
    bytes: 10,
  };
  const tbls = {
    calls: [
      call(L1, A, {
        contact_id: "k1",
        contacts: { display_name: "Dana", wa_profile_name: null, phone_e164: "+15550000003" },
        recording: stored,
      }),
      call(L2, A, { contact_id: null }),
      call(L3, B, { contact_id: "k3" }),
    ],
  };
  const ctx = dayCtx(tbls);
  const r = await kernel.load(turnIn(ctx), oneCall, { id: L1 });
  const listed = await kernel.load(turnIn(dayCtx(tbls)), calls, {});
  assert.deepEqual(
    r.data,
    { call: listed.data.calls.find((c) => c.id === L1) },
    "the Calls page's mapping of the same row",
  );
  const json = JSON.stringify(r.data);
  assert.ok(!json.includes("storage_path") && !json.includes("provider.example"), "audio only through its own route");
  assert.deepEqual(
    selects(ctx, "calls").map((q) => q.filters),
    [
      [
        ["eq", "tenant_id", A],
        ["eq", "id", L1],
      ],
    ],
    "one read, filtered to the workspace as well as the id",
  );
  assert.deepEqual(r.rows, [
    { kind: "call", id: L1, route: `conversations/cv-${L1}`, label: "Dana" },
    { kind: "person", id: "k1", route: "clients/k1", label: "Dana" },
  ]);
  const alone = await kernel.load(turnIn(dayCtx(tbls)), oneCall, { id: L2 });
  assert.deepEqual(
    alone.rows,
    [{ kind: "call", id: L2, route: `conversations/cv-${L2}`, label: "+1 (555) 000-0001" }],
    "a caller who is nobody's yet is the call alone, by the number the phone showed",
  );

  const notFound = (message) => (e) => {
    assert.deepEqual([e.code, e.status, e.message], ["not_found", 404, message]);
    return true;
  };
  // Bayside's call in a harbor turn: RLS would show it to a member of both; the workspace's filter does not.
  await assert.rejects(kernel.load(turnIn(dayCtx(tbls)), oneCall, { id: L3 }), notFound("Call not found."));
  await assert.rejects(
    kernel.load(turnIn(dayCtx(tbls)), oneCall, { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee9" }),
    notFound("Call not found."),
  );
  const typo = dayCtx(tbls);
  await assert.rejects(kernel.load(turnIn(typo), oneCall, { id: "not-a-uuid" }), notFound("That call does not exist."));
  assert.equal(selects(typo, "calls").length, 0, "a malformed id never reaches the database");
});

/* ------------------------------------------------------------------------- the person (PR 1.4) */

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const pol = (tenant_id, subject_type, subject_id, mode) => ({
  tenant_id,
  class: "reply",
  subject_type,
  subject_id,
  mode,
});
/** A row as people_list answers it. */
const personRow = (id, over = {}) => ({
  id,
  display_name: "Ada",
  phone_e164: "+15550000001",
  consent: "opted_in",
  dnc: false,
  ...over,
});
/**
 * people-routes.test.mjs, "one person in full": harbor's person with the owner's notes, a WhatsApp identity, their own
 * reply mode and the workspace's, where they came from, their consent changes beside another person's and another
 * kind, and the workspace's booking link; the member is in harbor and bayside. `threads` gives them two threads, the
 * newer with a message, and a call.
 */
const personTables = ({ threads = false } = {}) => ({
  memberships: [
    membership(A, "viewer", "harbor", "2026-01-01T00:00:00Z"),
    membership(B, "viewer", "bayside", "2026-02-01T00:00:00Z"),
  ],
  contacts: [
    {
      id: P1,
      tenant_id: A,
      phone_e164: "+15550000001",
      display_name: "Ada",
      erased_at: null,
      marketing_consent: null,
      notes: "Sees Sofia",
    },
  ],
  contact_identities: [
    { contact_id: P1, channel: "whatsapp", external_id: "15550000001", created_at: "2026-08-01T00:00:00Z" },
  ],
  conversations: threads
    ? [
        conversation(C1, A, { contact_id: P1, contacts: contact({ id: P1 }) }),
        conversation(C2, A, { contact_id: P1, contacts: contact({ id: P1 }), last_message_at: ago(2 * HOUR) }),
      ]
    : [],
  messages: threads ? [message("m1", C1, A)] : [],
  calls: threads
    ? [
        call(L1, A, {
          contact_id: P1,
          contacts: { display_name: "Ada", wa_profile_name: null, phone_e164: "+15550000001" },
        }),
      ]
    : [],
  policies: [pol(A, null, null, "auto"), pol(A, "contact", P1, "ask")],
  events: [
    {
      tenant_id: A,
      kind: "contact.added",
      subject_type: "contact",
      subject_id: P1,
      data: { source: "calendar", title: "Colour" },
      created_at: "2026-08-01T00:00:00Z",
    },
    {
      id: "ev-1",
      tenant_id: A,
      kind: "contact.consent_changed",
      subject_type: "contact",
      subject_id: P1,
      data: {
        consent: "opted_in",
        source: "customer_message",
        channel: "sms",
        message_external_id: "SM123",
        words: "START",
      },
      created_at: "2026-08-02T00:00:00Z",
    },
    {
      id: "ev-2",
      tenant_id: A,
      kind: "contact.consent_changed",
      subject_type: "contact",
      subject_id: P1,
      data: { purpose: "marketing", consent: "opted_in", source: "form", note: "signed 2 Sep", by: "u-ada" },
      created_at: "2026-08-03T00:00:00Z",
    },
    {
      id: "ev-3",
      tenant_id: A,
      kind: "contact.consent_changed",
      subject_type: "contact",
      subject_id: P2,
      data: { consent: "opted_out", source: "customer_message" },
      created_at: "2026-08-04T00:00:00Z",
    },
    {
      id: "ev-4",
      tenant_id: A,
      kind: "message.sent",
      subject_type: "message",
      subject_id: "m-1",
      data: {},
      created_at: "2026-08-05T00:00:00Z",
    },
  ],
  tenant_config: [{ tenant_id: A, config: { brain: { booking_link: " https://book.example/marisa " } } }],
  tenants: [],
});
/** A request for the person `id` names, over `tbls`, `faults` failing a read: people_list answers harbor's P1 alone. */
const personCtx = (tbls, id, faults = {}) => ({
  supabase: fakeDb(tbls, faults, {
    people_list: (a) => (a.p_tenant_id === A && a.p_contact_id === P1 ? [personRow(P1)] : []),
  }),
  userId: USER,
  email: "ada@example.com",
  params: { id },
});
/** GET contacts/:id's payload keys at origin/main (fad8b7ea), in its order. */
const PERSON_KEYS = [
  "row",
  "identities",
  "conversations",
  "calls",
  "escalations",
  "decisions",
  "receptionist_mode",
  "workspace_reply_mode",
  "visits",
  "notes",
  "person_notes",
  "proposal_url",
  "booking_link",
  "consent_history",
  "campaigns",
  "lead",
  "deals",
  "deals_on",
  "deal_pace",
  "services",
  "consult_first",
  "added",
];
/** Every read GET contacts/:id made at origin/main (fad8b7ea) for one person with threads, by table. */
const PERSON_READS = {
  "rpc:people_list": 1,
  "contact_identities.select": 1,
  "conversations.select": 1,
  "calls.select": 1,
  // Their own receptionist mode, and the workspace's.
  "policies.select": 2,
  // Where they came from, and every change to either answer.
  "events.select": 2,
  "contacts.select": 1,
  // The calendar's own lookup, and the booking link and the services.
  "tenant_config.select": 2,
  // The calendar's zone, and how the workspace's customers buy.
  "tenants.select": 2,
  "leads.select": 1,
  // Their deals, and the workspace's pace.
  "deals.select": 2,
  "broadcast_recipients.select": 1,
  "person_notes.select": 1,
  "messages.select": 1,
  "escalations.select": 1,
  "decisions.select": 1,
};
/** How many times each table (or door) was asked, whatever for. */
const readsOf = (ctx) => {
  const n = {};
  for (const q of ctx.supabase.seen) {
    const k = q.rpc ? `rpc:${q.rpc}` : `${q.table}.${q.op}`;
    n[k] = (n[k] ?? 0) + 1;
  }
  return n;
};
const notHere = (e) => {
  assert.deepEqual([e.code, e.status, e.message], ["not_found", 404, "This person is not in your workspace."]);
  return true;
};

test("the person, for Ask and for the page: GET contacts/:id answers its reader's payload, key for key and byte for byte, over people-routes' fixture alone and with two threads and a call; the rows are the person, then each thread by the person's name, then each call by its caller as the Calls page names them", async () => {
  for (const threads of [false, true]) {
    const tbls = personTables({ threads });
    const page = await personRoute.GET.run(req(`?workspace=${A}`), personCtx(tbls, P1));
    const r = await kernel.load(turnIn(personCtx(tbls, P1)), onePerson, { id: P1 });
    assert.deepEqual(r.data, page, "the route's payload");
    assert.equal(JSON.stringify(r.data), JSON.stringify(page), "byte for byte");
    assert.deepEqual(Object.keys(r.data), ["person"]);
    assert.deepEqual(Object.keys(r.data.person), PERSON_KEYS, "the keys in the order the route answered them");
  }
  const r = await kernel.load(turnIn(personCtx(personTables({ threads: true }), P1)), onePerson, { id: P1 });
  const p = r.data.person;
  // What people-routes asserts of the route, of the reader.
  assert.deepEqual(
    [p.row.effective_reply_mode, p.receptionist_mode, p.workspace_reply_mode, p.notes, p.booking_link],
    ["ask", "ask", "auto", "Sees Sofia", "https://book.example/marisa"],
  );
  assert.deepEqual(p.added, { at: "2026-08-01T00:00:00Z", source: "calendar", title: "Colour" });
  assert.deepEqual(
    p.consent_history.map((c) => c.id),
    ["ev-2", "ev-1"],
    "this person's changes, newest first",
  );
  assert.deepEqual(
    p.conversations.map((c) => [c.id, c.messages.map((m) => m.id)]),
    [
      [C1, ["m1"]],
      [C2, []],
    ],
    "their threads newest first, each with its own messages",
  );
  assert.deepEqual(
    p.calls.map((c) => c.id),
    [L1],
  );
  assert.deepEqual(r.rows, [
    { kind: "person", id: P1, route: `clients/${P1}`, label: "Ada" },
    { kind: "thread", id: C1, route: `inbox/th-${C1}`, label: "Ada" },
    { kind: "thread", id: C2, route: `inbox/th-${C2}`, label: "Ada" },
    { kind: "call", id: L1, route: `conversations/cv-${L1}`, label: "Ada" },
  ]);
  assert.deepEqual(
    r.rows.map((x) => x.label),
    [
      personName(p.row),
      ...p.conversations.map(() => personName(p.row)),
      ...p.calls.map((c) => toCallVM(c, "America/New_York", new Date()).who),
    ],
    "People's name for the person and for each of their threads, the Calls page's for each call",
  );
});

test("GET contacts/:id through its reader reads what it read at origin/main, in one round: every table as many times, only the threads' messages, escalations and decisions waiting for their ids; the config now through getTenantConfig's columns and sells_by through its reader, once each", async () => {
  const tbls = personTables({ threads: true });
  const routed = personCtx(tbls, P1);
  await personRoute.GET.run(req(`?workspace=${A}`), routed);
  assert.deepEqual(
    readsOf(routed),
    { "memberships.select": 1, ...PERSON_READS },
    "the workspace's door, then the reads",
  );
  const ctx = personCtx(tbls, P1);
  await kernel.load(turnIn(ctx), onePerson, { id: P1 });
  assert.deepEqual(readsOf(ctx), PERSON_READS);
  const order = ctx.supabase.seen.map((q) => q.rpc ?? q.table);
  assert.deepEqual(
    order.slice(order.indexOf("messages")),
    ["messages", "escalations", "decisions"],
    "every other read was asked for before the threads' own",
  );
  const columns = (table) =>
    selects(ctx, table)
      .map((q) => q.columns)
      .sort();
  assert.deepEqual(
    columns("tenant_config"),
    ["config", "tenant_id, config, version, updated_at, updated_by"],
    "the calendar's own lookup, and the config through its reader (getTenantConfig)",
  );
  assert.deepEqual(
    columns("tenants"),
    ["name, timezone", "sells_by"],
    "the calendar's zone, and sells_by through its reader",
  );
});

test("a person this workspace does not hold is GET contacts/:id's 404, in its sentence, and no payload: an id nobody has, and another workspace's person", async () => {
  const tbls = personTables({ threads: true });
  await assert.rejects(kernel.load(turnIn(personCtx(tbls, P2)), onePerson, { id: P2 }), notHere);
  // Harbor's person in a bayside turn: people_list answers for the workspace it is asked about, and bayside has nobody.
  await assert.rejects(kernel.load(turnIn(personCtx(tbls, P1), B), onePerson, { id: P1 }), notHere);
  await assert.rejects(personRoute.GET.run(req(`?workspace=${B}`), personCtx(tbls, P1)), notHere);
});

test("a config read that fails keeps the route's place in the error order: a person this workspace does not hold is still the 404, one it holds is the config's own failure, and a failure the route checks first is still said first", async () => {
  const tbls = personTables({ threads: true });
  const configDown = { "tenant_config.select": { message: "config down" } };
  const configFails = (e) => {
    assert.equal(e.message, "getTenantConfig: config down");
    return true;
  };
  // The calendar's own lookup reads the config too, and says its failure as the visits' line: kept out of the output.
  await logged("person_visits_failed", async () => {
    await assert.rejects(kernel.load(turnIn(personCtx(tbls, P2, configDown)), onePerson, { id: P2 }), notHere);
    await assert.rejects(personRoute.GET.run(req(`?workspace=${A}`), personCtx(tbls, P2, configDown)), notHere);
    await assert.rejects(kernel.load(turnIn(personCtx(tbls, P1, configDown)), onePerson, { id: P1 }), configFails);
    await assert.rejects(personRoute.GET.run(req(`?workspace=${A}`), personCtx(tbls, P1, configDown)), configFails);
    // Their consent changes are checked before the config, as the route checked them.
    await assert.rejects(
      kernel.load(
        turnIn(personCtx(tbls, P1, { ...configDown, "events.select": { message: "events down" } })),
        onePerson,
        { id: P1 },
      ),
      (e) => {
        assert.equal(e.message, "events down");
        return true;
      },
    );
  });
});

/* ------------------------------------------------------------------------ the reports (PR 1.5) */

/** A member of harbor and bayside, viewing both, as ask-routes' reports fixtures hold them. */
const reportMembers = () => [
  membership(A, "viewer", "harbor", "2026-01-01T00:00:00Z"),
  membership(B, "viewer", "bayside", "2026-02-01T00:00:00Z"),
];
const series = (a) => ({ days: a.p_days, tenant: a.p_tenant_id });
/** ask-routes.test.mjs, "the reports: the three presets and no other": nobody in People, no calendar, no deals. */
const presetsWorld = () => ({
  tables: { memberships: reportMembers(), tenants: [], tenant_config: [], policies: [] },
  rpcs: {
    report_series: series,
    campaign_series: (a) => (a.p_tenant_id === A ? { days: a.p_days } : { error: "no" }),
    people_list: () => [],
  },
});
const CLIENT = "cccccccc-cccc-4ccc-8ccc-cccccccccc01";
/**
 * ask-routes.test.mjs, "the reports' Deals section": one page of People, whose one row says the client came from a
 * lead, and their deal, won five days ago at $2,500 a month. `sellsBy` is how the workspace's customers buy, or unset.
 */
const dealsWorld = (sellsBy) => ({
  tables: {
    memberships: reportMembers(),
    tenants: [{ id: A, slug: "harbor", ...(sellsBy === undefined ? {} : { sells_by: sellsBy }) }],
    tenant_config: [],
    policies: [],
    deals: [
      {
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddd01",
        tenant_id: A,
        contact_id: CLIENT,
        stage: "won",
        proposed_at: new Date(Date.now() - 5 * 86_400_000).toISOString(),
        amount_cents: 250_000,
        per: "month",
      },
    ],
  },
  rpcs: { report_series: series, people_list: () => [{ id: CLIENT, came_from: "lead" }] },
});
/** A request's database over a world, `faults` failing a read the way PostgREST fails. */
const worldCtx = (w, faults = {}) => ({
  supabase: fakeDb(w.tables, faults, w.rpcs),
  userId: USER,
  email: "ada@example.com",
  params: {},
});
/** Every query in the order it reached the database: a door by name, a table by what was done to it. */
const asked = (ctx) => ctx.supabase.seen.map((q) => (q.rpc ? `rpc:${q.rpc}` : `${q.table}.${q.op}`));
const noReport = (e) => {
  assert.deepEqual([e.code, e.status, e.message], ["not_found", 404, "No workspace found for this report."]);
  return true;
};

test("the reports, for Ask and for the page: GET reports answers its reader's payload, key for key and byte for byte -- the series, the booking line and the deals, in that order -- over ask-routes' two fixtures and each preset; the Reports page is the row", async () => {
  for (const [w, days] of [
    [presetsWorld(), 7],
    [presetsWorld(), 30],
    [dealsWorld("proposal"), 30],
    [dealsWorld("proposal"), 90],
    [dealsWorld("booking"), 30],
    [dealsWorld(null), 7],
    [dealsWorld(undefined), 30],
  ]) {
    const page = await reportsRoute.GET.run(req(`?days=${days}&workspace=${A}`), worldCtx(w));
    const r = await kernel.load(turnIn(worldCtx(w)), reportReader, { days });
    assert.deepEqual(r.data, page, "the route's payload");
    assert.equal(JSON.stringify(r.data), JSON.stringify(page), "byte for byte");
    assert.deepEqual(
      Object.keys(r.data),
      ["report", "booking", "deals"],
      "the keys in the order the route answered them",
    );
    assert.deepEqual(r.rows, [{ kind: "page", id: "reports", route: "reports", label: `Reports, ${days} days` }]);
  }
  // What ask-routes asserts of the route, of the reader.
  const week = await kernel.load(turnIn(worldCtx(presetsWorld())), reportReader, { days: 7 });
  assert.deepEqual(week.data.report, { days: 7, tenant: A });
  assert.deepEqual(week.data.booking, { calendar: "none", days: 7, asked: 0, booked: 0 }, "no calendar, said as none");
  const on = await kernel.load(turnIn(worldCtx(dealsWorld("proposal"))), reportReader, { days: 30 });
  assert.deepEqual([on.data.deals.any, on.data.deals.clients, on.data.deals.monthly_cents], [true, 1, 250_000]);
  assert.deepEqual(on.data.deals.sources, [{ came_from: "lead", count: 1 }], "the new client's source, from People");
  for (const sellsBy of ["booking", null, undefined]) {
    const off = await kernel.load(turnIn(worldCtx(dealsWorld(sellsBy))), reportReader, { days: 30 });
    assert.equal(off.data.deals.any, false, `${sellsBy}: a deal on file switches nothing`);
  }
});

test("GET reports through its reader asks what it asked at origin/main, in its order: the series; People once, with their reply modes, for the booking line and the deals alike; the booking line's calendar lookup; how the workspace's customers buy, once, through its reader; then the deals, and only where deals are on", async () => {
  const REPORT_READS = [
    "rpc:report_series",
    // Everyone, read once for the whole report: the booking line's read, which the deals take their sources from.
    "rpc:people_list",
    "policies.select",
    // The booking line's calendar: its zone and its address.
    "tenants.select",
    "tenant_config.select",
    // How the workspace's customers buy, after the booking line, then the deals.
    "tenants.select",
    "deals.select",
  ];
  const routed = worldCtx(dealsWorld("proposal"));
  await reportsRoute.GET.run(req(`?workspace=${A}`), routed);
  assert.deepEqual(asked(routed), ["memberships.select", ...REPORT_READS], "the workspace's door, then the reads");
  const ctx = worldCtx(dealsWorld("proposal"));
  await kernel.load(turnIn(ctx), reportReader, { days: 30 });
  assert.deepEqual(asked(ctx), REPORT_READS);
  assert.deepEqual(
    selects(ctx, "tenants").map((q) => q.columns),
    ["name, timezone", "sells_by"],
    "the calendar's zone, then sells_by once",
  );
  assert.deepEqual(
    ctx.supabase.seen.filter((q) => q.rpc === "report_series").map((q) => q.args),
    [{ p_tenant_id: A, p_days: 30 }],
  );
  // A turn that already holds how the workspace's customers buy is not asked again.
  const turn = turnIn(worldCtx(dealsWorld("proposal")));
  await kernel.load(turn, sellsBy, undefined);
  await kernel.load(turn, reportReader, { days: 30 });
  assert.deepEqual(
    selects(turn.ctx, "tenants").map((q) => q.columns),
    ["sells_by", "name, timezone"],
    "sells_by once in the turn: the report took the turn's",
  );
  // Where the workspace's customers book, the deals are not even read.
  const off = worldCtx(dealsWorld("booking"));
  await kernel.load(turnIn(off), reportReader, { days: 30 });
  assert.deepEqual(asked(off), REPORT_READS.slice(0, -1));
});

test("a report the function will not answer is GET reports' 404, in its sentence, and nothing else is read; the booking line is never fatal: a calendar lookup that fails is null, said once in the log, and the series and the deals stand", async () => {
  const refused = { ...presetsWorld(), rpcs: { ...presetsWorld().rpcs, report_series: () => ({ error: "no" }) } };
  const ctx = worldCtx(refused);
  await assert.rejects(kernel.load(turnIn(ctx), reportReader, { days: 30 }), noReport);
  assert.deepEqual(asked(ctx), ["rpc:report_series"], "nothing read past the series");
  await assert.rejects(reportsRoute.GET.run(req(`?workspace=${A}`), worldCtx(refused)), noReport);
  const empty = { ...presetsWorld(), rpcs: { ...presetsWorld().rpcs, report_series: () => null } };
  await assert.rejects(kernel.load(turnIn(worldCtx(empty)), reportReader, { days: 30 }), noReport);

  const down = { "tenant_config.select": { message: "config down" } };
  const { result: page, lines } = await logged("booking_report_failed", () =>
    reportsRoute.GET.run(req(`?workspace=${A}`), worldCtx(dealsWorld("proposal"), down)),
  );
  assert.deepEqual(Object.keys(page), ["report", "booking", "deals"]);
  assert.equal(page.booking, null, "the line, and only the line, is lost");
  assert.deepEqual([page.report.days, page.deals.any, page.deals.clients], [30, true, 1]);
  assert.deepEqual(
    lines.map(([json]) => JSON.parse(json)),
    [{ tenant: A, error: "config down" }],
  );
  const { result: r } = await logged("booking_report_failed", () =>
    kernel.load(turnIn(worldCtx(dealsWorld("proposal"), down)), reportReader, { days: 30 }),
  );
  assert.deepEqual(r.data, page, "the reader's payload is the route's");
});

test("the campaigns' report, for Ask and for the page: GET reports/campaigns answers its reader's payload over ask-routes' fixture, for each preset -- the function's series alone, and no row a citation names; a report it will not answer is the route's 404", async () => {
  const w = presetsWorld();
  for (const days of [7, 30, 90]) {
    const page = await campaignsRoute.GET.run(req(`?days=${days}&workspace=${A}`), worldCtx(w));
    const ctx = worldCtx(w);
    const r = await kernel.load(turnIn(ctx), campaignReport, { days });
    assert.deepEqual(r.data, page, "the route's payload");
    assert.deepEqual(r.data, { report: { days } });
    assert.deepEqual(r.rows, []);
    assert.deepEqual(ctx.supabase.seen, [{ rpc: "campaign_series", args: { p_tenant_id: A, p_days: days } }]);
  }
  await assert.rejects(kernel.load(turnIn(worldCtx(w), B), campaignReport, { days: 30 }), noReport);
  await assert.rejects(campaignsRoute.GET.run(req(`?workspace=${B}`), worldCtx(w)), noReport);
});

/* ----------------------------------------------------------------------- the calendar (PR 1.5) */

/** calendar-feed.test.mjs's clock: Tuesday noon in New York. */
const CAL_NOW = new Date("2026-09-08T16:00:00.000Z");
/** calendar-feed.test.mjs's one appointment: Ana Ruiz, with her number in its words, on the Tuesday afternoon. */
const ONE_ICS = [
  "BEGIN:VCALENDAR",
  "BEGIN:VEVENT",
  "UID:a1",
  "SUMMARY:Ana Ruiz · Balayage",
  "DESCRIPTION:Ana Ruiz +1 (917) 555-0100",
  "DTSTART;TZID=America/New_York:20260908T140000",
  "DTEND;TZID=America/New_York:20260908T153000",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");
const calProfile = {
  hours: {
    mon: { open: "09:00", close: "18:00" },
    tue: { open: "09:00", close: "18:00" },
    wed: { open: "09:00", close: "18:00" },
    thu: { open: "09:00", close: "18:00" },
    fri: { open: "09:00", close: "18:00" },
    sat: {},
    sun: {},
  },
  closures: [],
  services: [{ name: "Balayage", duration_min: 90 }],
  booking_rules: { lead_hours: 2, max_days_ahead: 14, slot_min: 30 },
};
/** calendar-feed.test.mjs, tables(url, role): harbor's calendar at `url` (none when null), its hours, its one service. */
const calTables = (url, role = "owner") => ({
  memberships: [membership(A, role, "harbor", "2026-01-01T00:00:00Z")],
  tenants: [{ id: A, slug: "harbor", name: "Harbor", status: "active", timezone: "America/New_York" }],
  tenant_config: [
    {
      tenant_id: A,
      config: {
        ...(url ? { calendar: { ical_url: url } } : {}),
        brain: {
          business_name: "Harbor",
          booking_link: "https://book.example/harbor",
          system_prompt: "Answer as the front desk of Harbor: brief, warm, and never a price or a booking.",
          fallbacks: { greeting: "g", error: "e", non_text: "n" },
          profile: calProfile,
        },
      },
    },
  ],
  policies: [],
});
/** A request over `t`: People as `people` answers them, and the door that puts a person in People, each call kept. */
const calCtx = (t, people = () => [], made = []) => ({
  supabase: fakeDb(
    t,
    {},
    {
      people_list: people,
      create_person: (a) => {
        made.push(a);
        return { contact_id: "p1", existed: false };
      },
    },
  ),
  userId: USER,
  email: "ada@example.com",
  params: {},
});
/** The network, scripted for `fn`: every calendar answers `answer`, each fetch kept; no feed is remembered past it. */
async function withFeed(answer, fn) {
  const was = globalThis.fetch;
  const fetched = [];
  globalThis.fetch = async (url) => {
    fetched.push(String(url));
    return new Response(answer.body, { status: answer.status ?? 200, headers: { "content-type": "text/calendar" } });
  };
  forgetFeeds();
  try {
    return await fn(fetched);
  } finally {
    globalThis.fetch = was;
    forgetFeeds();
  }
}
/** A turn on calendar-feed's clock. */
const calIn = (ctx, role = "viewer") => kernel.readerContext(ctx, { tenantId: A, role }, CAL_NOW);
const WEEK = { from: "2026-09-07", days: 7 };
/** Ana in People, by the number her appointment carries. */
const ANA = { id: "k-ana", display_name: "Ana Ruiz", wa_profile_name: null, phone_e164: "+19175550100", email: null };
const tuesday = (week) => week.days.find((d) => d.key === "2026-09-08");

test("the calendar, for Ask: the board's week exactly as calendarWeek assembles it for a read that puts nobody in People -- over calendar-feed's fixture with no calendar, a calendar that cannot be read, and its one appointment -- and each person its days name is a row, once, by the board's name for them", async () => {
  const none = calTables(null);
  const quiet = await calendarWeek(calCtx(none), A, WEEK, CAL_NOW, { canAct: false });
  const noFeed = await kernel.load(calIn(calCtx(none)), calendarReader, WEEK);
  assert.deepEqual(noFeed.data, { calendar: quiet });
  assert.equal(quiet.feed.state, "none");
  assert.deepEqual(noFeed.rows, []);

  await logged("ask_feed_fetch_failed", () =>
    withFeed({ body: "nope", status: 503 }, async () => {
      const t = calTables("https://cal.example/down.ics");
      const want = await calendarWeek(calCtx(t), A, WEEK, CAL_NOW, { canAct: false });
      const r = await kernel.load(calIn(calCtx(t)), calendarReader, WEEK);
      assert.deepEqual(r.data, { calendar: want });
      assert.deepEqual([want.feed.state, want.feed.reason, want.feed.status], ["unavailable", "http", 503]);
    }),
  );

  await withFeed({ body: ONE_ICS }, async (fetched) => {
    const t = calTables("https://cal.example/ok.ics");
    const want = await calendarWeek(
      calCtx(t, () => [ANA]),
      A,
      WEEK,
      CAL_NOW,
      { canAct: false },
    );
    const r = await kernel.load(calIn(calCtx(t, () => [ANA])), calendarReader, WEEK);
    assert.deepEqual(r.data, { calendar: want }, "the week calendarWeek answers");
    assert.equal(JSON.stringify(r.data.calendar), JSON.stringify(want), "byte for byte");
    assert.equal(fetched.length, 1, "the calendar asked once: the second read took the loader's cache");
    assert.deepEqual(
      tuesday(want).items.map((i) => i.person?.id),
      [ANA.id],
      "the appointment names Ana by her number",
    );
    assert.ok(tuesday(want).windows.length > 0, "and the receptionist's windows beside it");
    assert.deepEqual(r.rows, [{ kind: "person", id: ANA.id, route: `clients/${ANA.id}`, label: "Ana Ruiz" }]);
    // Two appointments of hers are one row.
    const twice = ONE_ICS.replace(
      "END:VCALENDAR",
      [
        "BEGIN:VEVENT",
        "UID:a2",
        "SUMMARY:Ana Ruiz · Toner",
        "DESCRIPTION:Ana Ruiz +1 (917) 555-0100",
        "DTSTART;TZID=America/New_York:20260910T100000",
        "DTEND;TZID=America/New_York:20260910T110000",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"),
    );
    forgetFeeds();
    globalThis.fetch = async () => new Response(twice, { status: 200, headers: { "content-type": "text/calendar" } });
    const again = await kernel.load(calIn(calCtx(t, () => [ANA])), calendarReader, WEEK);
    assert.equal(again.data.calendar.days.flatMap((d) => d.items).length, 2);
    assert.deepEqual(
      again.rows.map((x) => x.id),
      [ANA.id],
    );
  });
});

test("the calendar's reader never writes (D7): an owner's Ask reads the board of a feed naming someone People does not hold and puts nobody in People -- no door called, nothing inserted -- and its zone and settings are the turn's: a turn that holds them reads neither again", async () => {
  await withFeed({ body: ONE_ICS }, async () => {
    const made = [];
    const ctx = calCtx(calTables("https://cal.example/ok.ics"), () => [], made);
    const rc = calIn(ctx, "owner");
    await Promise.all([kernel.load(rc, facts, undefined), kernel.load(rc, config, undefined)]);
    const before = ctx.supabase.seen.length;
    const r = await kernel.load(rc, calendarReader, WEEK);
    assert.deepEqual(made, [], "nobody put in People");
    assert.deepEqual(
      ctx.supabase.seen.slice(before).map((q) => (q.rpc ? `rpc:${q.rpc}` : `${q.table}.${q.op}`)),
      ["rpc:people_list", "policies.select"],
      "everyone, and nothing the turn already read: no door, no write",
    );
    assert.deepEqual(
      tuesday(r.data.calendar).items.map((i) => i.person),
      [null],
      "the appointment names nobody People holds",
    );
    assert.deepEqual(r.rows, []);
    // Read once a turn: the board again is the same read, and its sources are one read for any reader of them.
    assert.equal(kernel.load(rc, calendarReader, WEEK), kernel.load(rc, calendarReader, WEEK));
    const s = await kernel.load(rc, calendarSources, { ...WEEK, fresh: false });
    assert.equal(s.data.week, null, "the feed was read");
    assert.deepEqual(s.rows, []);
    assert.equal(ctx.supabase.seen.length, before + 2, "nothing asked again");
  });
});

/**
 * Every query GET calendar asked at origin/main (c39ce689) for an owner over calendar-feed's one appointment with
 * nobody in People yet, in order, with the columns it selected: the workspace's door, the zone, the settings, everyone
 * with their reply modes, then the person the feed names put in People.
 */
const CALENDAR_ASKED_AT_MAIN = [
  ["memberships.select", "tenant_id, role, tenants (slug)"],
  ["tenants.select", "name, timezone"],
  ["tenant_config.select", "config"],
  ["rpc:people_list", null],
  ["policies.select", "subject_type, subject_id, mode"],
  ["rpc:create_person", null],
];

test("GET calendar through its reader asks what it asked at origin/main, in the same order -- the settings now through the config reader's columns -- and keeps its write between the read and the board: an owner's or an operator's read puts the person the feed names in People and the board links them, as it did; a viewer's asks the same, less the write", async () => {
  await withFeed({ body: ONE_ICS }, async () => {
    for (const role of ["owner", "operator", "viewer"]) {
      // The zone is the facts reader's, kept across requests on an instance: each caller here starts with none kept.
      kernel.readerCache.clear();
      const made = [];
      const ctx = calCtx(calTables("https://cal.example/route.ics", role), () => [], made);
      const page = await calendarRoute.GET.run(req(`?workspace=${A}&from=2026-09-07&days=7`), ctx);
      const want = CALENDAR_ASKED_AT_MAIN.map(([k, cols]) => [
        k,
        k === "tenant_config.select" ? "tenant_id, config, version, updated_at, updated_by" : cols,
      ]);
      assert.deepEqual(
        ctx.supabase.seen.map((q) => (q.rpc ? [`rpc:${q.rpc}`, null] : [`${q.table}.${q.op}`, q.columns])),
        role === "viewer" ? want.slice(0, -1) : want,
        role,
      );
      assert.deepEqual(
        made.map((a) => [a.p_tenant_id, a.p_phone_e164, a.p_display_name, a.p_source]),
        role === "viewer" ? [] : [[A, "+19175550100", "Ana Ruiz", "calendar"]],
        `${role}: who is put in People`,
      );
      assert.deepEqual(
        tuesday(page.calendar).items.map((i) => i.person),
        role === "viewer" ? [null] : [{ id: "p1", name: "Ana Ruiz", via: "phone" }],
        `${role}: the board links whom the read just added, as it did at origin/main`,
      );
      assert.equal(page.calendar.days.length, 7);
      assert.ok(!JSON.stringify(page).includes("cal.example"), "the address never reaches the browser");
    }
  });
});
