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
import { callerName, toCallVM } from "@chanlytics/contracts";
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
const threadRoute = await import(at("apps/dashboard/app/api/v1/conversations/[id]/route.ts"));

// The kept values live in the module, keyed by workspace, person and reader: each test starts with none.
beforeEach(() => kernel.readerCache.clear());

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
