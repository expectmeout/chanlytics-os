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
import { callerName, describeNow, newReceptionistDefaults, personName, toCallVM } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";
import { PLAN } from "../_lead-fixtures.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
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
const { calendarWeek } = await import(at("apps/dashboard/src/server/calendar/calendar.ts"));
const { forgetFeeds, openingsFor } = await import(at("apps/dashboard/src/server/ask/openings.ts"));
const { openings: openingsReader } = await import(at("apps/dashboard/src/server/readers/openings.ts"));
const openingsRoute = await import(at("apps/dashboard/app/api/v1/ask/openings/route.ts"));
const { calendar: calendarReader, sources: calendarSources } = await import(
  at("apps/dashboard/src/server/readers/calendar.ts")
);
const calendarRoute = await import(at("apps/dashboard/app/api/v1/calendar/route.ts"));
const { people: peopleReader } = await import(at("apps/dashboard/src/server/readers/people.ts"));
const { lists: listsReader } = await import(at("apps/dashboard/src/server/readers/lists.ts"));
const { broadcasts: broadcastsReader, broadcast: oneBroadcast } = await import(
  at("apps/dashboard/src/server/readers/broadcasts.ts")
);
const contactsRoute = await import(at("apps/dashboard/app/api/v1/contacts/route.ts"));
const segmentsRoute = await import(at("apps/dashboard/app/api/v1/segments/route.ts"));
const broadcastsRoute = await import(at("apps/dashboard/app/api/v1/broadcasts/route.ts"));
const broadcastRoute = await import(at("apps/dashboard/app/api/v1/broadcasts/[id]/route.ts"));
const { everyone } = await import(at("apps/dashboard/src/server/people/people.ts"));
const { audiencePool: audiencePoolReader } = await import(at("apps/dashboard/src/server/readers/audience-pool.ts"));
const { audiencePool: audiencePoolOf, poolList } = await import(at("apps/dashboard/src/server/people/audience.ts"));
const { everyone: everyoneReader } = await import(at("apps/dashboard/src/server/readers/everyone.ts"));
const { playbooks: playbooksReader } = await import(at("apps/dashboard/src/server/readers/playbooks.ts"));
const playbooksRoute = await import(at("apps/dashboard/app/api/v1/playbooks/route.ts"));
const { getBroadcast } = await import(at("apps/dashboard/src/server/campaigns/broadcasts.ts"));
const { settings: settingsReader } = await import(at("apps/dashboard/src/server/readers/settings.ts"));
const { connections } = await import(at("apps/dashboard/src/server/readers/connections.ts"));
const { notifications: notificationsReader } = await import(at("apps/dashboard/src/server/readers/notifications.ts"));
const { activity: activityReader } = await import(at("apps/dashboard/src/server/readers/activity.ts"));
const { channels: channelsReader } = await import(at("apps/dashboard/src/server/readers/channels.ts"));
const { autonomy } = await import(at("apps/dashboard/src/server/readers/autonomy.ts"));
const settingsRoute = await import(at("apps/dashboard/app/api/v1/settings/route.ts"));
const setupRoute = await import(at("apps/dashboard/app/api/v1/setup/route.ts"));
const notificationsRoute = await import(at("apps/dashboard/app/api/v1/notifications/route.ts"));
const activityRoute = await import(at("apps/dashboard/app/api/v1/activity/route.ts"));
const channelsRoute = await import(at("apps/dashboard/app/api/v1/channels/route.ts"));
const policiesRoute = await import(at("apps/dashboard/app/api/v1/policies/route.ts"));
const { setupDtoFor } = await import(at("apps/dashboard/src/server/workspace/setup.ts"));
const { templates: templatesReader } = await import(at("apps/dashboard/src/server/readers/templates.ts"));
const templatesRoute = await import(at("apps/dashboard/app/api/v1/templates/route.ts"));

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

test("a reader with a ttl is kept across turns that keep, on this instance, per workspace and person, until the ttl; a failure is not kept; the cache is bounded", async () => {
  const r = counting("kept", { ttlMs: 60_000 });
  const t1 = kernel.readerContext(ctxFor(tables()), { tenantId: A, role: "owner" }, undefined, { keep: true });
  const t2 = kernel.readerContext(ctxFor(tables()), { tenantId: A, role: "owner" }, undefined, { keep: true });
  await kernel.load(t1, r, undefined);
  await kernel.load(t2, r, undefined);
  assert.equal(r.reads, 1, "the second turn read the kept value");
  const elsewhere = kernel.readerContext(ctxFor(tables()), { tenantId: B, role: "owner" }, undefined, { keep: true });
  await kernel.load(elsewhere, r, undefined);
  assert.equal(r.reads, 2, "another workspace is another entry");
  const someoneElse = kernel.readerContext(
    { ...ctxFor(tables()), userId: "u2" },
    { tenantId: A, role: "owner" },
    undefined,
    { keep: true },
  );
  await kernel.load(someoneElse, r, undefined);
  assert.equal(r.reads, 3, "another person is another entry");
  kernel.readerCache.clear();
  const f = counting("kept-fail", { ttlMs: 60_000, fail: true });
  await assert.rejects(kernel.load(t1, f, undefined));
  await kernel.load(t2, f, undefined);
  assert.equal(f.reads, 2, "a failed read is not kept");
  kernel.readerCache.clear();
  const stale = counting("stale", { ttlMs: 10 });
  await kernel.load(
    kernel.readerContext(ctxFor(tables()), { tenantId: A, role: "owner" }, undefined, { keep: true }),
    stale,
    undefined,
  );
  await new Promise((res) => setTimeout(res, 15));
  await kernel.load(
    kernel.readerContext(ctxFor(tables()), { tenantId: A, role: "owner" }, undefined, { keep: true }),
    stale,
    undefined,
  );
  assert.equal(stale.reads, 2, "past the ttl the value is read again");
  assert.equal(kernel.READER_CACHE_CAP, 500);
});

test("the kept values are bounded at READER_CACHE_CAP, the oldest write first out: a value read again goes to the back", async () => {
  const turn = () => kernel.readerContext(ctxFor(tables()), { tenantId: A, role: "owner" }, undefined, { keep: true });
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

test("the facts readers: the tenant's name and zone are read once and kept for turns that keep; sells_by, the policies and the config are read once per turn; each answers the row's fields and nothing else", async () => {
  const ctx = ctxFor(tables());
  const rc = kernel.readerContext(ctx, { tenantId: A, role: "operator" }, undefined, { keep: true });
  const [f, s, p, c] = await Promise.all([
    kernel.load(rc, facts, undefined),
    kernel.load(rc, sellsBy, undefined),
    kernel.load(rc, policies, undefined),
    kernel.load(rc, config, undefined),
  ]);
  assert.deepEqual(f.data, { name: "Harbor", timezone: "America/New_York" });
  assert.equal(s.data, "booking");
  assert.deepEqual(p.data, []);
  // Who last changed it and when ride with the row (PR 1.7), so the settings read is the turn's one read of it.
  assert.deepEqual(c.data, { config: { hours: "9-5" }, version: 3, updated_by: null, updated_at: null });
  await Promise.all([kernel.load(rc, facts, undefined), kernel.load(rc, config, undefined)]);
  const reads = (table) => ctx.supabase.seen.filter((q) => q.table === table && q.op === "select").length;
  assert.deepEqual(
    [reads("tenants"), reads("tenant_config")],
    [2, 1],
    "tenants once for facts and once for sells_by; the config once",
  );
  const later = kernel.readerContext(ctxFor(tables()), { tenantId: A, role: "operator" }, undefined, { keep: true });
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
  // inbox.list and calls.list beside it in the turn: the Inbox reads only the ids the hundred did not hold.
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

test("GET reports through its reader asks what it asked at origin/main, in its order: the series; People once, with their reply modes, for the booking line and the deals alike; the booking line's calendar zone and settings, now through their readers; how the workspace's customers buy, once, through its reader; then the deals, and only where deals are on -- and a turn that holds the zone, the settings and sells_by reads none of them again", async () => {
  const REPORT_READS = [
    "rpc:report_series",
    // Everyone, read once for the whole report: the booking line's read, which the deals take their sources from.
    "rpc:people_list",
    "policies.select",
    // The booking line's calendar: its zone and its settings, through the facts and config readers, where its own
    // lookup read them at origin/main.
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
    selects(ctx, "tenant_config").map((q) => q.columns),
    // At origin/main (c39ce689) the booking line's lookup asked for the one column, config.
    ["tenant_id, config, version, updated_at, updated_by"],
    "the settings once, through the config reader",
  );
  assert.deepEqual(
    ctx.supabase.seen.filter((q) => q.rpc === "report_series").map((q) => q.args),
    [{ p_tenant_id: A, p_days: 30 }],
  );
  // A turn that already holds the zone, the settings and how the workspace's customers buy is asked for none again.
  const turn = turnIn(worldCtx(dealsWorld("proposal")));
  await Promise.all([facts, config, sellsBy].map((r) => kernel.load(turn, r, undefined)));
  const held = turn.ctx.supabase.seen.length;
  await kernel.load(turn, reportReader, { days: 30 });
  assert.deepEqual(
    asked(turn.ctx).slice(held),
    ["rpc:report_series", "rpc:people_list", "policies.select", "deals.select"],
    "the series, everyone and the deals: the tenant, its settings and sells_by were the turn's",
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
    // The settings come through the config reader now (getTenantConfig), which names itself in its failure.
    [{ tenant: A, error: "getTenantConfig: config down" }],
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
    // What the board needs of the address and the settings, and not them: nothing a projection of the read could leak.
    assert.ok(!("url" in s.data) && !("cfg" in s.data), "no address, no raw settings");
    assert.equal(typeof s.data.source, "string");
    const json = JSON.stringify(s.data);
    assert.ok(
      !json.includes("cal.example") && !json.includes("front desk of Harbor"),
      "neither is anywhere in the read",
    );
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
      // One instance, three requests: a route keeps nothing across requests, so each asks for the zone again.
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

/* ----------------------------------------------------------------------- the openings (PR 1.5) */

/** calendar-counts.test.mjs's feed for the openings: Wednesday morning taken, the afternoon open. */
const WEDNESDAY_TAKEN = [
  "BEGIN:VCALENDAR",
  "BEGIN:VEVENT",
  "UID:o1",
  "SUMMARY:Taken",
  "DTSTART;TZID=America/New_York:20260909T090000",
  "DTEND;TZID=America/New_York:20260909T120000",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

test("the openings, for Ask and for the palette: GET ask/openings answers its reader's payload over ask-routes' fixture, with no calendar connected, and over a calendar that cannot be read; over calendar-counts' feed the reader answers what openingsFor answers on the same clock -- the morning taken, the afternoon open; no row a citation names", async () => {
  const bare = { memberships: reportMembers(), tenants: [], tenant_config: [] };
  const page = await openingsRoute.GET.run(req(`?day=saturday&workspace=${A}`), dayCtx(bare));
  const r = await kernel.load(turnIn(dayCtx(bare)), openingsReader, { day: "saturday", service: null });
  assert.deepEqual(r.data, page, "the route's payload");
  assert.equal(JSON.stringify(r.data), JSON.stringify(page), "byte for byte");
  assert.equal(r.data.openings.state, "no_calendar");
  assert.deepEqual(r.rows, []);

  await logged("ask_feed_fetch_failed", () =>
    withFeed({ body: "nope", status: 404 }, async () => {
      const t = calTables("https://cal.example/open.ics");
      const down = await openingsRoute.GET.run(req(`?workspace=${A}`), calCtx(t));
      const read = await kernel.load(calIn(calCtx(t)), openingsReader, { day: null, service: null });
      assert.deepEqual(read.data, down, "the route's payload");
      assert.deepEqual(
        [down.openings.state, down.openings.text],
        ["unavailable", "The calendar could not be read right now."],
      );
    }),
  );

  await withFeed({ body: WEDNESDAY_TAKEN }, async () => {
    const t = calTables("https://cal.example/open.ics");
    // openingsFor handed the fixture's own zone and settings, as the reader hands it the turn's.
    const want = await openingsFor(A, { day: "2026-09-09", service: "Balayage" }, CAL_NOW, {
      timezone: t.tenants[0].timezone,
      config: t.tenant_config[0].config,
    });
    const read = await kernel.load(calIn(calCtx(t)), openingsReader, { day: "2026-09-09", service: "Balayage" });
    assert.deepEqual(read.data, { openings: want });
    assert.deepEqual(
      want.days.map((d) => d.windows),
      [["12:00 PM–6:00 PM"]],
      "the morning is taken; the afternoon is open",
    );
    assert.match(want.text, /^For Balayage \(about 90 minutes\): /);
  });
});

test("GET ask/openings through its reader asks what it asked at origin/main, in the same order -- the workspace's door, the zone, then the settings, now through the config reader's columns -- and a turn that holds the zone and the settings reads neither again", async () => {
  const bare = { memberships: reportMembers(), tenants: [], tenant_config: [] };
  const ctx = dayCtx(bare);
  await openingsRoute.GET.run(req(`?workspace=${A}`), ctx);
  assert.deepEqual(
    ctx.supabase.seen.map((q) => [`${q.table}.${q.op}`, q.columns]),
    [
      ["memberships.select", "tenant_id, role, tenants (slug)"],
      ["tenants.select", "name, timezone"],
      // At origin/main (c39ce689), the one column: config.
      ["tenant_config.select", "tenant_id, config, version, updated_at, updated_by"],
    ],
  );
  const turn = turnIn(dayCtx(bare));
  await Promise.all([kernel.load(turn, facts, undefined), kernel.load(turn, config, undefined)]);
  const before = turn.ctx.supabase.seen.length;
  const r = await kernel.load(turn, openingsReader, { day: null, service: null });
  assert.equal(r.data.openings.state, "no_calendar");
  assert.equal(turn.ctx.supabase.seen.length, before, "nothing read: the zone and the settings were the turn's");
});

/* ---------------------------------------------------- the cross-turn cache is opt-in (PR 1.5) */

test("the cross-turn cache is opt-in: a context that does not keep reads a ttl reader again in the next context, and what a turn kept is never served to it; a route keeps nothing -- GET calendar and GET ask/openings read the zone on every request, so a zone changed between two requests is the second request's", async () => {
  const r = counting("opt-in", { ttlMs: 60_000 });
  const plain = () => kernel.readerContext(ctxFor(tables()), { tenantId: A, role: "owner" });
  const keeps = () => kernel.readerContext(ctxFor(tables()), { tenantId: A, role: "owner" }, undefined, { keep: true });
  assert.equal(plain().keep, false, "a context keeps nothing unless it says so");
  await kernel.load(plain(), r, undefined);
  await kernel.load(plain(), r, undefined);
  assert.equal(r.reads, 2, "no keep: the next context read again");
  await kernel.load(keeps(), r, undefined);
  await kernel.load(keeps(), r, undefined);
  assert.equal(r.reads, 3, "a turn that keeps: the next turn took the kept value");
  await kernel.load(plain(), r, undefined);
  assert.equal(r.reads, 4, "what a turn kept is not served to a context that does not keep");

  await withFeed({ body: ONE_ICS }, async () => {
    const t = calTables("https://cal.example/zone.ics", "viewer");
    for (const timezone of ["America/New_York", "Europe/Madrid", "America/New_York"]) {
      t.tenants[0].timezone = timezone;
      const board = calCtx(t);
      const week = await calendarRoute.GET.run(req(`?workspace=${A}&from=2026-09-07&days=7`), board);
      const palette = calCtx(t);
      const open = await openingsRoute.GET.run(req(`?workspace=${A}`), palette);
      assert.deepEqual(
        [week.calendar.timezone, open.openings.tz],
        [timezone, timezone],
        "each request answers its own read of the zone",
      );
      assert.deepEqual(
        [selects(board, "tenants").length, selects(palette, "tenants").length],
        [1, 1],
        "the zone read for this request, by each route",
      );
    }
  });
});

/* ------------------------------------------------- the people list, the lists, the broadcasts (PR 1.6) */

const P3 = "33333333-3333-4333-8333-333333333333";
/** GET contacts' payload keys at origin/main (e3184cff), in its order: withVisits' four, then the page's own. */
const PEOPLE_KEYS = [
  "people",
  "calendar",
  "booking_link",
  "consult_first",
  "deals_on",
  "deal_pace",
  "follow_up",
  "page",
];
/**
 * people-routes.test.mjs, "the people list is the workspace the tab named": harbor holds two people and bayside one;
 * harbor's reply mode is auto, and one of its people has their own, never. No calendar, and nobody asked how its
 * customers buy.
 */
const listWorld = () => ({
  tables: {
    memberships: reportMembers(),
    policies: [pol(A, null, null, "auto"), pol(A, "contact", P2, "never")],
    tenants: [],
    tenant_config: [],
  },
  rpcs: { people_list: (a) => (a.p_tenant_id === A ? [personRow(P1), personRow(P2)] : [personRow(P3)]) },
});
/** people-routes.test.mjs, "the list pages under one order": the door does the matching, the count is where the rows are. */
const pagingWorld = () => ({
  tables: {
    memberships: reportMembers(),
    policies: [],
    tenants: [],
    tenant_config: [],
    contacts: [
      { id: P1, tenant_id: A, phone_e164: "+15550000001", display_name: "Ada", erased_at: null },
      { id: P2, tenant_id: A, phone_e164: "+15550000002", display_name: "Bo", erased_at: null },
      { id: P3, tenant_id: A, phone_e164: "+15550000003", display_name: "Cy", erased_at: "2026-08-01T00:00:00Z" },
    ],
  },
  rpcs: { people_list: (a) => (a.p_query ? [personRow(P2, { display_name: "Bo" })] : [personRow(P1), personRow(P2)]) },
});

test("the people list, for Ask and for the page: GET contacts answers its reader's payload, key for key and byte for byte -- over people-routes' fixture in both workspaces, and a query, an offset and three digits over its paging fixture -- the same reading of who exists as the export, and each person a row, named as People names them", async () => {
  for (const [w, tenant, query, args] of [
    [listWorld(), A, "", { q: null, offset: 0 }],
    [listWorld(), B, "", { q: null, offset: 0 }],
    [pagingWorld(), A, "&q=%20bo%20", { q: "bo", offset: 0 }],
    [pagingWorld(), A, "&offset=1000", { q: null, offset: 1000 }],
    [pagingWorld(), A, "&q=0002", { q: "0002", offset: 0 }],
  ]) {
    const page = await contactsRoute.GET.run(req(`?workspace=${tenant}${query}`), worldCtx(w));
    const r = await kernel.load(turnIn(worldCtx(w), tenant), peopleReader, args);
    assert.deepEqual(r.data, page, "the route's payload");
    assert.equal(JSON.stringify(r.data), JSON.stringify(page), "byte for byte");
    assert.deepEqual(Object.keys(r.data), PEOPLE_KEYS, "the keys in the order the route answered them");
    assert.deepEqual(
      r.rows,
      r.data.people.map((p) => ({ kind: "person", id: p.id, route: `clients/${p.id}`, label: personName(p) })),
    );
  }
  // What people-routes asserts of the route, of the reader.
  const harbor = await kernel.load(turnIn(worldCtx(listWorld())), peopleReader, { q: null, offset: 0 });
  assert.deepEqual(
    harbor.data.people.map((p) => [p.id, p.effective_reply_mode, p.visits]),
    [
      [P1, "auto", null],
      [P2, "never", null],
    ],
  );
  assert.equal(harbor.data.calendar.state, "none");
  assert.deepEqual(harbor.data.page, { q: null, offset: 0, limit: 1000, total: 0, has_more: false });
  assert.deepEqual(
    harbor.rows.map((x) => x.label),
    ["Ada", "Ada"],
  );
  const found = await kernel.load(turnIn(worldCtx(pagingWorld())), peopleReader, { q: "bo", offset: 0 });
  assert.deepEqual(
    [found.data.people.map((p) => p.id), found.data.page],
    [[P2], { q: "bo", offset: 0, limit: 1000, total: 1, has_more: false }],
    "the door matched, and the count counted the same match",
  );
  // The same reading of who exists as the CSV export (everyone(), server/people/people.ts): the door's rows under the member's
  // RLS, each with the reply mode in force, a page at a time.
  const all = await everyone(worldCtx(listWorld()), A);
  assert.deepEqual(
    harbor.data.people.map((p) => [p.id, p.effective_reply_mode]),
    all.map((p) => [p.id, p.effective_reply_mode]),
  );
});

/**
 * A workspace whose customers sometimes get a proposal first (0008), with calendar-feed's one appointment naming Ana by
 * her number: Ana has a step for a teammate, Luis a proposal out and a step for the member asking, and the proposal
 * follow-up runs (0006) -- its number, its approved template -- and its run reached Luis this week.
 */
const peopleWorld = () => {
  const cal = calTables("https://cal.example/people.ics", "viewer");
  const sent = ago(48 * HOUR);
  const DAY = 24 * HOUR;
  return {
    tables: {
      ...cal,
      memberships: reportMembers(),
      tenants: [{ ...cal.tenants[0], sells_by: "proposal" }],
      policies: [
        pol(A, null, null, "auto"),
        { tenant_id: A, class: "follow_up", subject_type: null, subject_id: null, mode: "ask" },
      ],
      contacts: [
        { id: P1, tenant_id: A, display_name: "Ana Ruiz", phone_e164: "+19175550100", erased_at: null },
        { id: P2, tenant_id: A, display_name: "Luis Mora", phone_e164: "+19175550101", erased_at: null },
      ],
      deals: [
        { id: "d1", tenant_id: A, contact_id: P2, stage: "proposed", proposed_at: ago(10 * DAY), decided_at: null },
        { id: "d2", tenant_id: A, contact_id: P1, stage: "won", proposed_at: ago(13 * DAY), decided_at: ago(3 * DAY) },
      ],
      playbooks: [
        {
          id: "pb-follow",
          tenant_id: A,
          trigger: "proposal_waiting",
          state: "running",
          run_hour: 10,
          last_run_for: null,
          template_name: "proposal_follow_up",
          template_language: "en_US",
        },
      ],
      templates: [
        {
          tenant_id: A,
          channel: "whatsapp",
          name: "proposal_follow_up",
          language: "en_US",
          meta_status: "approved",
          category: "utility",
        },
      ],
      tenant_channels: [{ tenant_id: A, kind: "whatsapp", status: "active", config: { quality_rating: "GREEN" } }],
      broadcasts: [
        {
          id: "b1",
          tenant_id: A,
          playbook_id: "pb-follow",
          state: "sent",
          scheduled_for: sent,
          created_at: sent,
          run_for: null,
          params: [{ kind: "first_name" }, { kind: "business_name" }, { kind: "proposal_link" }],
        },
      ],
      broadcast_recipients: [{ tenant_id: A, broadcast_id: "b1", contact_id: P2, state: "sent", sent_at: sent }],
    },
    rpcs: {
      people_list: (a) =>
        a.p_tenant_id === A
          ? [
              personRow(P1, { display_name: "Ana Ruiz", phone_e164: "+19175550100", step_for_user_id: "u2" }),
              personRow(P2, {
                display_name: "Luis Mora",
                phone_e164: "+19175550101",
                deal_id: "d1",
                deal_stage: "proposed",
                step_for_user_id: USER,
              }),
            ]
          : [],
      team_roster: () => [
        { member_user_id: USER, display_name: "Ada", email: "ada@example.com" },
        { member_user_id: "u2", display_name: "Sam", email: "sam@example.com" },
      ],
    },
  };
};
/**
 * Every query GET contacts asked at origin/main (e3184cff) for peopleWorld's first page, in order, with the columns it
 * selected. The workspace's door. The first stage at once: the page and how many match, then the page's reply modes.
 * The second at once: how the workspace's customers buy, the calendar's zone and settings (the feed itself is fetched,
 * never read from the database), who each step is for, the pace; then, once sells_by says deals are on, the proposal
 * follow-up's facts -- its playbook, its class, the workspace, its number, the proposals out, its template, and the
 * runs that touched them.
 */
const PEOPLE_ASKED_AT_MAIN = [
  ["memberships.select", "tenant_id, role, tenants (slug)"],
  ["rpc:people_list", null],
  ["contacts.select", "id"],
  ["policies.select", "subject_type, subject_id, mode"],
  ["tenants.select", "sells_by"],
  ["tenants.select", "name, timezone"],
  ["tenant_config.select", "config"],
  ["rpc:team_roster", null],
  ["deals.select", "id, stage, proposed_at, decided_at"],
  ["playbooks.select", "state, run_hour, last_run_for, template_name, template_language"],
  ["policies.select", "mode"],
  ["tenants.select", "status"],
  ["tenant_channels.select", "config"],
  ["deals.select", "id, contact_id, proposed_at"],
  ["templates.select", "meta_status, category"],
  ["tenants.select", "timezone"],
  ["tenants.select", "timezone"],
  ["broadcasts.select", "id, playbook_id, state, scheduled_for, created_at, run_for, params"],
  ["broadcasts.select", "id, playbook_id, state, scheduled_for, created_at, run_for, params"],
  ["broadcast_recipients.select", "broadcast_id, contact_id, sent_at, state"],
  ["broadcast_recipients.select", "broadcast_id, contact_id, sent_at, state"],
];
/** Every query in the order it reached the database, with the columns a select asked for. */
const askedWith = (ctx) =>
  ctx.supabase.seen.map((q) => (q.rpc ? [`rpc:${q.rpc}`, null] : [`${q.table}.${q.op}`, q.columns]));
/** The config reader's columns (getTenantConfig), where the calendar's own lookup asked for the one, config. */
const CONFIG_READER_COLUMNS = "tenant_id, config, version, updated_at, updated_by";

test("GET contacts through its reader asks what it asked at origin/main, in its two stages -- the page and its count at once; then how the customers buy, the calendar's zone and settings, who each step is for, the pace and the follow-up's facts at once -- the settings now through the config reader's columns and sells_by through its reader; a turn that holds the zone, the settings and sells_by reads none of them again", async () => {
  await withFeed({ body: ONE_ICS }, async () => {
    const want = PEOPLE_ASKED_AT_MAIN.map(([k, cols]) => [
      k,
      k === "tenant_config.select" ? CONFIG_READER_COLUMNS : cols,
    ]);
    // One world for every request below: its times are read from the clock once.
    const w = peopleWorld();
    const routed = worldCtx(w);
    const page = await contactsRoute.GET.run(req(`?workspace=${A}`), routed);
    assert.deepEqual(askedWith(routed), want, "the workspace's door, then the reads");
    const ctx = worldCtx(w);
    const r = await kernel.load(turnIn(ctx), peopleReader, { q: null, offset: 0 });
    assert.deepEqual(r.data, page, "the route's payload");
    assert.deepEqual(askedWith(ctx), want.slice(1));
    // What each read was for, in the payload: Ana's visit from the feed, who each step is for, the pace, the follow-up.
    const [ana, luis] = r.data.people;
    assert.deepEqual(
      [r.data.calendar.state, ana.visits.last.title, luis.visits.last],
      ["ok", "Ana Ruiz · Balayage", null],
    );
    assert.deepEqual(
      [ana.step_for_name, ana.step_for_me, luis.step_for_name, luis.step_for_me],
      ["Sam", false, "Ada", true],
    );
    assert.deepEqual([r.data.deals_on, r.data.deal_pace], [true, { median_days: 10, yeses: 1 }]);
    assert.deepEqual(Object.keys(r.data.follow_up.had), [P2], "Luis had his proposal's follow-up");
    // A search reads neither the pace nor the follow-up's facts: People keeps its first page's.
    const searched = worldCtx(w);
    const s = await kernel.load(turnIn(searched), peopleReader, { q: "luis", offset: 0 });
    assert.deepEqual([s.data.deal_pace, s.data.follow_up], [null, null]);
    assert.deepEqual(askedWith(searched), want.slice(1, 8), "the two stages, less the pace and the follow-up");
    // A turn that already holds the zone, the settings and how the customers buy is asked for none of them again.
    const turn = turnIn(worldCtx(w));
    await Promise.all([facts, config, sellsBy].map((x) => kernel.load(turn, x, undefined)));
    const held = turn.ctx.supabase.seen.length;
    await kernel.load(turn, peopleReader, { q: null, offset: 0 });
    assert.deepEqual(
      askedWith(turn.ctx).slice(held),
      want
        .slice(1)
        .filter(([k, cols]) => k !== "tenant_config.select" && !(k === "tenants.select" && /sells_by|name/.test(cols))),
      "the page, the steps, the pace and the follow-up's own reads: the zone, the settings and sells_by were the turn's",
    );
  });
});

test("the people list's calendar is never fatal: settings that cannot be read cost every row its visits and the list its calendar, said once in the log, and the rest of the page stands -- the reader's payload is the route's", async () => {
  await withFeed({ body: ONE_ICS }, async () => {
    const down = { "tenant_config.select": { message: "config down" } };
    const w = peopleWorld();
    const { result: page, lines } = await logged("people_visits_failed", () =>
      contactsRoute.GET.run(req(`?workspace=${A}`), worldCtx(w, down)),
    );
    assert.deepEqual(
      [page.people.map((p) => p.visits), page.calendar, page.booking_link],
      [[null, null], { state: "none", source: "your calendar", timezone: "UTC" }, null],
    );
    assert.deepEqual([page.deals_on, Object.keys(page.follow_up.had), page.page.total], [true, [P2], 2]);
    assert.deepEqual(
      lines.map(([json]) => JSON.parse(json)),
      // The settings come through the config reader now (getTenantConfig), which names itself in its failure.
      [{ tenant: A, error: "getTenantConfig: config down" }],
    );
    const { result: r } = await logged("people_visits_failed", () =>
      kernel.load(turnIn(worldCtx(w, down)), peopleReader, { q: null, offset: 0 }),
    );
    assert.deepEqual(r.data, page);
  });
});

const SEG1 = "5e5e5e5e-1111-4111-8111-5e5e5e5e5e5e";
const SEG2 = "5e5e5e5e-2222-4222-8222-5e5e5e5e5e5e";
/** people-routes.test.mjs, "lists: one workspace's with their members' ids": a list in each workspace, one member each. */
const segmentsWorld = () => ({
  tables: {
    memberships: reportMembers(),
    segments: [
      { id: SEG1, tenant_id: A, name: "Regulars" },
      { id: SEG2, tenant_id: B, name: "VIP" },
    ],
    segment_members: [
      { segment_id: SEG1, contact_id: P1, tenant_id: A },
      { segment_id: SEG2, contact_id: P2, tenant_id: B },
    ],
  },
  rpcs: {},
});

test("the lists, for Ask and for the page: GET segments answers its reader's payload over people-routes' fixture in both workspaces -- every list of the one workspace read, with every member -- and a list is not a row a citation names yet", async () => {
  for (const [tenant, want] of [
    [A, [{ id: SEG1, name: "Regulars", ids: [P1], rule: null, archived_at: null }]],
    [B, [{ id: SEG2, name: "VIP", ids: [P2], rule: null, archived_at: null }]],
  ]) {
    const page = await segmentsRoute.GET.run(req(`?workspace=${tenant}`), worldCtx(segmentsWorld()));
    const ctx = worldCtx(segmentsWorld());
    const r = await kernel.load(turnIn(ctx, tenant), listsReader, undefined);
    assert.deepEqual(r.data, page, "the route's payload");
    assert.deepEqual(r.data, { lists: want });
    assert.deepEqual(r.rows, []);
    assert.deepEqual(asked(ctx), ["segments.select", "segment_members.select"], "the lists and their members at once");
  }
});

const BC1 = "88888888-8888-4888-8888-888888888881";
const BC2 = "88888888-8888-4888-8888-888888888882";
const BC3 = "88888888-8888-4888-8888-888888888883";
/** A broadcast row as outbound-routes.test.mjs builds one. */
const bcRow = (id, tenant_id, over = {}) => ({
  id,
  tenant_id,
  name: "Reminder",
  template_id: "77777777-7777-4777-8777-777777777771",
  template_name: "visit_reminder",
  template_language: "en_US",
  params: [],
  audience: { kind: "everyone", id: null, label: "Everyone" },
  state: "scheduled",
  scheduled_for: "2026-09-10T00:00:00Z",
  started_at: null,
  finished_at: null,
  recipient_count: 3,
  failure: null,
  created_at: "2026-09-10T00:00:00Z",
  playbook_id: null,
  run_for: null,
  ...over,
});
/** outbound-routes.test.mjs, "the broadcasts list is the workspace the tab named": two of harbor's, one of bayside's. */
const bcWorld = () => ({
  tables: {
    memberships: reportMembers(),
    broadcasts: [
      bcRow(BC1, A, { created_at: "2026-09-09T00:00:00Z" }),
      bcRow(BC2, A, { created_at: "2026-09-10T00:00:00Z", state: "sent" }),
      bcRow(BC3, B),
    ],
    broadcast_recipients: [
      {
        broadcast_id: BC2,
        tenant_id: A,
        contact_id: "k1",
        state: "sent",
        reason: null,
        sent_at: "2026-09-10T01:00:00Z",
        messages: { conversation_id: null, status: "delivered" },
      },
    ],
  },
  rpcs: {},
});
/** outbound-routes.test.mjs, "who a run of any kind reached this week": sent, held back, canceled, last month. */
const touchedWorld = () => {
  const rec = (broadcast_id, contact_id, state, sent_at) => ({
    broadcast_id,
    tenant_id: A,
    contact_id,
    state,
    reason: null,
    sent_at,
    messages: null,
  });
  return {
    tables: {
      memberships: reportMembers(),
      broadcasts: [
        bcRow(BC1, A, { created_at: ago(2 * HOUR), state: "sent" }),
        bcRow(BC2, A, { created_at: ago(2 * HOUR), state: "canceled" }),
        bcRow(BC3, A, { created_at: ago(40 * 24 * HOUR), state: "sent" }),
      ],
      broadcast_recipients: [
        rec(BC1, "k1", "sent", ago(HOUR)),
        rec(BC1, "k2", "skipped", null),
        rec(BC2, "k3", "queued", null),
        rec(BC3, "k4", "sent", ago(40 * 24 * HOUR)),
      ],
    },
    rpcs: {},
  };
};

test("the broadcasts, for Ask and for the page: GET broadcasts answers its reader's payload over outbound-routes' two fixtures -- the recent fifty with what their messages earned, whether older ones exist, and who a run reached within the week of the turn's clock -- and a broadcast is not a row a citation names yet", async () => {
  for (const [w, tenant] of [
    [bcWorld(), A],
    [bcWorld(), B],
    [touchedWorld(), A],
  ]) {
    const page = await broadcastsRoute.GET.run(req(`?workspace=${tenant}`), worldCtx(w));
    const r = await kernel.load(turnIn(worldCtx(w), tenant), broadcastsReader, undefined);
    assert.deepEqual(r.data, page, "the route's payload");
    assert.equal(JSON.stringify(r.data), JSON.stringify(page), "byte for byte");
    assert.deepEqual(Object.keys(r.data), ["broadcasts", "more", "touched"]);
    assert.deepEqual(r.rows, []);
  }
  // What outbound-routes asserts of the route, of the reader.
  const harbor = (await kernel.load(turnIn(worldCtx(bcWorld())), broadcastsReader, undefined)).data;
  assert.deepEqual(
    [harbor.broadcasts.map((b) => b.id), harbor.broadcasts[0].counts.sent, harbor.broadcasts[0].counts.delivered],
    [[BC2, BC1], 1, 1],
  );
  const touched = (await kernel.load(turnIn(worldCtx(touchedWorld())), broadcastsReader, undefined)).data.touched;
  assert.deepEqual(touched, ["k1"], "sent this week; not held back, not canceled, not last month");
  // The week is the turn's: at a clock eight days on, the run of an hour ago is last week's.
  const later = kernel.readerContext(
    worldCtx(touchedWorld()),
    { tenantId: A, role: "viewer" },
    new Date(Date.now() + 8 * 24 * HOUR),
  );
  assert.deepEqual((await kernel.load(later, broadcastsReader, undefined)).data.touched, []);
});

/** run-report.test.mjs's shape, in harbor: one run that reached two people and held one back, and what came back. */
const detailWorld = () => {
  const T0 = Date.parse("2026-09-20T15:00:00Z");
  const at = (ms) => new Date(T0 + ms).toISOString();
  const rec = (contact_id, over) => ({
    broadcast_id: BC1,
    tenant_id: A,
    contact_id,
    state: "sent",
    reason: null,
    sent_at: at(0),
    ...over,
  });
  const said = (conversation_id, direction, ms, body, sender) => ({
    tenant_id: A,
    conversation_id,
    direction,
    created_at: at(ms),
    body,
    sender,
    type: "text",
  });
  return {
    tables: {
      memberships: reportMembers(),
      broadcasts: [bcRow(BC1, A, { state: "sent", scheduled_for: at(0), started_at: at(0), created_at: at(-HOUR) })],
      broadcast_recipients: [
        rec(P1, {
          messages: { conversation_id: "cv-1", status: "read", meta: { status_at: { delivered: at(60_000) } } },
          contacts: { display_name: "Ana Ruiz", wa_profile_name: null, phone_e164: "+19175550100", email: null },
        }),
        rec(P2, {
          messages: { conversation_id: "cv-2", status: "delivered", meta: {} },
          contacts: { display_name: null, wa_profile_name: "Lu", phone_e164: "+19175550101", email: null },
        }),
        rec(P3, {
          state: "skipped",
          reason: "no_consent",
          sent_at: null,
          messages: null,
          contacts: { display_name: "Rosa", wa_profile_name: null, phone_e164: null, email: "rosa@example.com" },
        }),
      ],
      messages: [
        said("cv-1", "inbound", HOUR, "Yes please!", "customer"),
        said("cv-1", "outbound", 2 * HOUR, "Booked you in.", "ai"),
        said("cv-2", "inbound", 3 * HOUR, "stop", "customer"),
      ],
      events: [
        {
          tenant_id: A,
          kind: "contact.consent_changed",
          subject_type: "contact",
          subject_id: P2,
          data: { consent: "opted_out", purpose: "marketing" },
          created_at: at(3 * HOUR),
        },
      ],
      conversations: [
        { id: "cv-1", tenant_id: A, state: "open" },
        { id: "cv-2", tenant_id: A, state: "needs_human" },
      ],
    },
    rpcs: {},
  };
};
/** A request for broadcasts/:id over `w`. */
const detailCtx = (w, id) => ({ ...worldCtx(w), params: { id } });

test("one broadcast, for Ask and for the page: GET broadcasts/:id answers its reader's payload, which is getBroadcast's, over run-report's shape -- who it reached and what came back from each; another workspace's broadcast is the route's 404 in its words, and an id that is not one never reaches the database", async () => {
  const w = detailWorld();
  const page = await broadcastRoute.GET.run(req(`?workspace=${A}`), detailCtx(w, BC1));
  const r = await kernel.load(turnIn(worldCtx(w)), oneBroadcast, { id: BC1 });
  assert.deepEqual(r.data, page, "the route's payload");
  assert.equal(JSON.stringify(r.data), JSON.stringify(page), "byte for byte");
  assert.deepEqual(r.data, await getBroadcast(worldCtx(w), A, BC1), "getBroadcast's own answer");
  assert.deepEqual(r.rows, []);
  const by = Object.fromEntries(r.data.recipients.map((x) => [x.contact_id, x]));
  assert.deepEqual(
    [by[P1].name, by[P1].replied, by[P1].reply_words, by[P1].answered_by],
    ["Ana Ruiz", true, "Yes please!", "receptionist"],
  );
  assert.deepEqual(
    [by[P2].name, by[P2].consent_after, by[P2].consent_purpose, by[P2].waiting_on_you],
    ["Lu", "opted_out", "marketing", true],
  );
  assert.deepEqual([by[P3].state, by[P3].reason, by[P3].replied], ["skipped", "no_consent", false]);
  const gone = (e) => {
    assert.deepEqual([e.code, e.status, e.message], ["not_found", 404, "Broadcast not found."]);
    return true;
  };
  await assert.rejects(kernel.load(turnIn(worldCtx(w), B), oneBroadcast, { id: BC1 }), gone);
  await assert.rejects(broadcastRoute.GET.run(req(`?workspace=${B}`), detailCtx(w, BC1)), gone);
  const typo = detailCtx(w, "not-a-uuid");
  await assert.rejects(broadcastRoute.GET.run(req(`?workspace=${A}`), typo), (e) => {
    assert.deepEqual([e.code, e.status, e.message], ["not_found", 404, "That broadcast does not exist."]);
    return true;
  });
  assert.deepEqual(asked(typo), ["memberships.select"], "the workspace's door, and nothing of the broadcast's");
});

/* --------------------------------------------------------------------------- the audience pool (PR 1.6) */

test("the audience pool, for Ask: everyone with their appointments for the member asking, exactly as server/people/audience.ts reads it for the same zone and clock -- over a calendar that names one of them -- read once a turn; the zone, the settings and sells_by are the turn's, so the pool's calendar lookup reads neither and sells_by is not read again; settings that cannot be read cost the visits, never the pool; a workspace-wide read, with no row of its own", async () => {
  await withFeed({ body: ONE_ICS }, async () => {
    const w = peopleWorld();
    const want = await audiencePoolOf(worldCtx(w), A, "America/New_York", CAL_NOW);
    const r = await kernel.load(calIn(worldCtx(w)), audiencePoolReader, undefined);
    assert.deepEqual(r.data, want, "the pool server/people/audience.ts reads");
    assert.deepEqual(r.rows, []);
    // Ana's appointment is on the turn's own day, ahead of its clock; deals are on here, so Luis's proposal is his.
    const [ana, luis] = r.data.rows;
    assert.deepEqual([r.data.calendar.state, ana.nextVisitDate, luis.nextVisitDate], ["ok", "2026-09-08", null]);
    assert.deepEqual([r.data.deals_on, !!luis.deal], [true, true]);
    // A turn that holds the zone, the settings and how the customers buy reads everyone and their reply modes, once.
    const turn = calIn(worldCtx(w));
    await Promise.all([facts, config, sellsBy].map((x) => kernel.load(turn, x, undefined)));
    const held = turn.ctx.supabase.seen.length;
    assert.equal(kernel.load(turn, audiencePoolReader, undefined), kernel.load(turn, audiencePoolReader, undefined));
    await kernel.load(turn, audiencePoolReader, undefined);
    assert.deepEqual(asked(turn.ctx).slice(held), ["rpc:people_list", "policies.select"]);
    // The settings are read only where the pool's calendar lookup would read them: one that fails costs the visits,
    // said once in the log, as server/people/audience.ts's own lookup costs them -- never the pool.
    const down = { "tenant_config.select": { message: "config down" } };
    const { result: blind, lines } = await logged("people_visits_failed", () =>
      kernel.load(calIn(worldCtx(w, down)), audiencePoolReader, undefined),
    );
    const { result: blindWant } = await logged("people_visits_failed", () =>
      audiencePoolOf(worldCtx(w, down), A, "America/New_York", CAL_NOW),
    );
    assert.deepEqual(blind.data, blindWant);
    assert.deepEqual(
      [blind.data.calendar.state, blind.data.people.map((p) => p.visits), lines.length],
      ["none", [null, null], 1],
    );
  });
});

/* -------------------------------------------------------------------------------- the playbooks (PR 1.6) */

const PB1 = "99999999-9999-4999-8999-999999999991";
const PB2 = "99999999-9999-4999-8999-999999999992";
/** GET playbooks' payload keys at origin/main (e3184cff), in its order. */
const PLAYBOOKS_KEYS = ["playbooks", "timezone", "touched", "pools", "calendar", "lists", "people_lists", "deals_on"];
/** A playbook row as the page's read selects it (server/campaigns/playbooks.ts COLUMNS), a moment. */
const pbRow = (id, over = {}) => ({
  id,
  tenant_id: A,
  kind: "moment",
  name: "Win-back",
  trigger: "quiet_30",
  list_id: null,
  list_key: null,
  template_id: "77777777-7777-4777-8777-777777777771",
  template_name: "winback_offer",
  template_language: "en_US",
  params: [],
  policy_class: "reengage",
  state: "running",
  run_hour: 10,
  cap_per_run: 50,
  gap_days: 30,
  cadence_days: 0,
  last_run_for: null,
  last_run_at: null,
  created_at: "2026-09-01T00:00:00Z",
  ...over,
});
/** peopleWorld's workspace with its playbooks: the proposal follow-up, and a win-back on a list of its own kept by hand. */
const playbooksWorld = () => {
  const w = peopleWorld();
  return {
    tables: {
      ...w.tables,
      playbooks: [
        pbRow("pb-follow", {
          name: "Follow-up",
          trigger: "proposal_waiting",
          template_name: "proposal_follow_up",
          policy_class: "follow_up",
          gap_days: 0,
        }),
        pbRow("pb-win", { trigger: "saved_list", list_id: SEG1, created_at: "2026-09-02T00:00:00Z" }),
      ],
      segments: [{ id: SEG1, tenant_id: A, name: "Regulars", rule: null, archived_at: null }],
      segment_members: [{ tenant_id: A, segment_id: SEG1, contact_id: P1 }],
    },
    rpcs: w.rpcs,
  };
};
/** calendar-counts.test.mjs's person: a yes to offers and a number, heard from forty days ago. */
const poolPerson = (n, over = {}) => ({
  id: `p${n}`,
  display_name: `Person ${n}`,
  wa_profile_name: null,
  phone_e164: `+1917555${String(n).padStart(4, "0")}`,
  consent: "opted_in",
  consent_source: "customer_message",
  marketing_consent: "opted_in",
  dnc: false,
  has_chat: true,
  first_seen_at: ago(60 * 24 * HOUR),
  last_inbound_at: ago(40 * 24 * HOUR),
  latest_wa_inbound_at: ago(40 * 24 * HOUR),
  latest_conversation_id: `c${n}`,
  conversation_count: 1,
  ...over,
});
/** people_list as the database answers it: a page of at most a thousand, from an offset. */
const pagedPeople = (all) => (a) => all.slice(a.p_offset ?? 0, (a.p_offset ?? 0) + (a.p_limit ?? 1000));
/** calendar-counts.test.mjs's workspace: an owner, no calendar, and whatever `extra` adds. */
const countsWorld = (people, extra = {}) => ({
  tables: { ...calTables(null, "owner"), playbooks: [], templates: [], ...extra },
  rpcs: { people_list: people },
});
/** outbound-routes.test.mjs, "playbooks: the workspace's with their runs' numbers": one of harbor's, one of bayside's. */
const outboundWorld = () => ({
  tables: {
    memberships: reportMembers(),
    playbooks: [pbRow(PB1), pbRow(PB2, { tenant_id: B, name: "Welcome", trigger: "new_week" })],
    broadcasts: [bcRow(BC1, B, { playbook_id: PB2, state: "sent", run_for: "2026-09-10" })],
    broadcast_recipients: [],
    tenants: [{ id: B, name: "Bayside", timezone: "America/Chicago" }],
    templates: [],
  },
  // No People door: the pools' read of everyone fails, and no moment is counted.
  rpcs: {},
});

test("the playbooks, for Ask and for the page: GET playbooks answers its reader's payload, key for key and byte for byte -- over outbound-routes' fixture in both workspaces, whose People read fails and counts no moment; calendar-counts' thousand and three people with one reached this week, its People read refused, and its proposals out where deals are on and where they are off; and a workspace with a calendar, deals on and a list of its own -- and a playbook is not a row a citation names yet", async () => {
  const thousand = Array.from({ length: 1003 }, (_, i) => poolPerson(i + 1));
  thousand[0].marketing_consent = "unknown";
  thousand[1].dnc = true;
  const sent = ago(48 * HOUR);
  const touchedOnce = countsWorld(pagedPeople(thousand), {
    broadcasts: [{ id: "b1", tenant_id: A, state: "sent", playbook_id: null, scheduled_for: sent, created_at: sent }],
    broadcast_recipients: [{ tenant_id: A, broadcast_id: "b1", contact_id: "p3", state: "sent", sent_at: sent }],
  });
  const refused = countsWorld(() => {
    throw new Error("canceling statement due to statement timeout");
  });
  const out = (n, days, over = {}) =>
    poolPerson(n, {
      deal_id: `d${n}`,
      deal_stage: "proposed",
      deal_proposed_at: ago(days * 24 * HOUR),
      deal_proposal_url: `https://docs.example.com/proposal/${n}`,
      ...over,
    });
  const proposals = pagedPeople([out(1, 10), out(2, 20), out(3, 20, { deal_proposal_url: null }), poolPerson(4)]);
  const dealsOn = countsWorld(proposals, {
    tenants: [
      { id: A, slug: "harbor", name: "Harbor", status: "active", timezone: "America/New_York", sells_by: "proposal" },
    ],
    deals: [],
  });
  const booked = countsWorld(proposals);
  const cases = [
    ["outbound, harbor", outboundWorld(), A],
    ["outbound, bayside", outboundWorld(), B],
    ["a thousand and three", touchedOnce, A],
    ["People refused", refused, A],
    ["deals on", dealsOn, A],
    ["deals off", booked, A],
    ["calendar, deals and a list", playbooksWorld(), A],
  ];
  const pages = {};
  await withFeed({ body: ONE_ICS }, async () => {
    for (const [label, w, tenant] of cases) {
      const { result: page } = await logged("playbook_pools_people_failed", () =>
        playbooksRoute.GET.run(req(`?workspace=${tenant}`), worldCtx(w)),
      );
      const { result: r } = await logged("playbook_pools_people_failed", () =>
        kernel.load(turnIn(worldCtx(w), tenant), playbooksReader, undefined),
      );
      assert.deepEqual(r.data, page, `${label}: the route's payload`);
      assert.equal(JSON.stringify(r.data), JSON.stringify(page), `${label}: byte for byte`);
      assert.deepEqual(Object.keys(r.data), PLAYBOOKS_KEYS, `${label}: the keys in the order the route answered them`);
      assert.deepEqual(r.rows, []);
      pages[label] = r.data;
    }
  });
  // What outbound-routes and calendar-counts assert of the route, of the reader.
  assert.deepEqual(
    pages["outbound, bayside"].playbooks.map((p) => [p.id, p.totals.runs]),
    [[PB2, 1]],
  );
  assert.equal(pages["outbound, bayside"].timezone, "America/Chicago");
  assert.deepEqual(
    [pages["outbound, harbor"].playbooks.map((p) => p.id), pages["outbound, harbor"].pools.everyone_monthly],
    [[PB1], null],
    "a People read that fails counts no moment, and the playbooks stand",
  );
  const e = pages["a thousand and three"].pools.everyone_monthly;
  assert.deepEqual(
    [e.candidates, e.held, e.pool],
    [1003 - 2 - 1, 1, 1003],
    "past the first page, less the one reached",
  );
  assert.equal(pages["People refused"].pools.everyone_monthly, null);
  assert.deepEqual([pages["deals on"].deals_on, pages["deals on"].pools.proposal_waiting.pool], [true, 2]);
  assert.deepEqual([pages["deals off"].deals_on, pages["deals off"].pools.proposal_waiting], [false, null]);
  const rich = pages["calendar, deals and a list"];
  assert.deepEqual(
    [
      rich.calendar,
      rich.deals_on,
      Object.keys(rich.touched),
      rich.lists.map((l) => l.id),
      rich.pools[`list:${SEG1}`].pool,
    ],
    ["ok", true, [P2], [SEG1], 1],
  );
});

/**
 * Every query GET playbooks asked at origin/main (e3184cff) for playbooksWorld, in order, with the columns it selected.
 * The workspace's door. The first stage at once: the zone, who a run reached this week (with the zone its touches
 * keep), how the customers buy, the playbooks' runs and rows, the pace, then the runs' recipients. The second: everyone
 * with their reply modes; the calendar's own lookup of the zone and the settings; then, deals being on, who had a
 * proposal's follow-up; and the lists.
 */
const PLAYBOOKS_ASKED_AT_MAIN = [
  ["memberships.select", "tenant_id, role, tenants (slug)"],
  ["tenants.select", "name, timezone"],
  ["tenants.select", "timezone"],
  ["tenants.select", "sells_by"],
  [
    "broadcasts.select",
    "id, name, template_id, template_name, template_language, params, audience, state, scheduled_for, started_at, finished_at, recipient_count, failure, created_at, playbook_id, run_for",
  ],
  [
    "playbooks.select",
    "id, name, trigger, list_id, list_key, template_id, template_name, template_language, params, policy_class, state, run_hour, cap_per_run, gap_days, cadence_days, last_run_for, last_run_at, created_at",
  ],
  ["broadcasts.select", "id, playbook_id, state, scheduled_for, created_at, run_for, params"],
  ["deals.select", "id, stage, proposed_at, decided_at"],
  [
    "broadcast_recipients.select",
    "broadcast_id, contact_id, state, reason, sent_at, messages(conversation_id, status, meta)",
  ],
  ["broadcast_recipients.select", "broadcast_id, contact_id, sent_at, state"],
  ["rpc:people_list", null],
  ["policies.select", "subject_type, subject_id, mode"],
  ["tenants.select", "name, timezone"],
  ["tenant_config.select", "config"],
  ["deals.select", "id, contact_id, proposed_at"],
  ["tenants.select", "timezone"],
  ["broadcasts.select", "id, playbook_id, state, scheduled_for, created_at, run_for, params"],
  ["broadcast_recipients.select", "broadcast_id, contact_id, sent_at, state"],
  ["segments.select", "id, name, rule, archived_at"],
  ["segment_members.select", "segment_id, contact_id"],
];

test("GET playbooks through its reader asks what it asked at origin/main, in its order, less one read: the pools' calendar lookup no longer reads the zone the page's first read just read, and the settings come through the config reader's columns; a turn that holds the zone, the settings and sells_by reads none of them; settings that cannot be read cost the visit moments, said once in the log, never the page", async () => {
  await withFeed({ body: ONE_ICS }, async () => {
    // At origin/main the pools' calendar lookup read the zone a second time, just before the settings.
    const lookup = PLAYBOOKS_ASKED_AT_MAIN.findIndex(
      ([k, cols], i) => i > 1 && k === "tenants.select" && cols === "name, timezone",
    );
    const want = PLAYBOOKS_ASKED_AT_MAIN.filter((_, i) => i !== lookup).map(([k, cols]) => [
      k,
      k === "tenant_config.select" ? CONFIG_READER_COLUMNS : cols,
    ]);
    const w = playbooksWorld();
    const routed = worldCtx(w);
    const page = await playbooksRoute.GET.run(req(`?workspace=${A}`), routed);
    assert.deepEqual(askedWith(routed), want, "the workspace's door, then the reads");
    const ctx = worldCtx(w);
    const r = await kernel.load(turnIn(ctx), playbooksReader, undefined);
    assert.deepEqual(r.data, page);
    assert.deepEqual(askedWith(ctx), want.slice(1));
    const turn = turnIn(worldCtx(w));
    await Promise.all([facts, config, sellsBy].map((x) => kernel.load(turn, x, undefined)));
    const held = turn.ctx.supabase.seen.length;
    await kernel.load(turn, playbooksReader, undefined);
    assert.deepEqual(
      askedWith(turn.ctx).slice(held),
      want
        .slice(1)
        .filter(([k, cols]) => k !== "tenant_config.select" && !(k === "tenants.select" && /sells_by|name/.test(cols))),
      "the zone, the settings and sells_by were the turn's",
    );
    const down = { "tenant_config.select": { message: "config down" } };
    const { result: blind, lines } = await logged("playbook_pools_visits_failed", () =>
      playbooksRoute.GET.run(req(`?workspace=${A}`), worldCtx(w, down)),
    );
    assert.deepEqual(
      [blind.calendar, blind.pools.visit_tomorrow, blind.pools.visited, blind.pools.lapsed],
      ["none", null, null, null],
      "no calendar read: the moments it names are not counted",
    );
    assert.ok(blind.pools.everyone_monthly && blind.playbooks.length === 2, "and everything else stands");
    assert.deepEqual(
      lines.map(([json]) => JSON.parse(json)),
      [{ tenant: A, error: "getTenantConfig: config down" }],
    );
    const { result: r2 } = await logged("playbook_pools_visits_failed", () =>
      kernel.load(turnIn(worldCtx(w, down)), playbooksReader, undefined),
    );
    assert.deepEqual(r2.data, blind);
  });
});

/* ------------------------------------------------------------------ everyone, once a turn (PR 1.6) */

test("everyone, for Ask: every page of People with the reply mode in force for each, exactly as server/people/people.ts reads it, and no row of its own; the audience pool and the Playbooks page's pools count from the one read, so a turn that reads both reads every page once and the reply modes once", async () => {
  const all = Array.from({ length: 1003 }, (_, i) => poolPerson(i + 1));
  const w = countsWorld(pagedPeople(all));
  const r = await kernel.load(turnIn(worldCtx(w)), everyoneReader, undefined);
  assert.deepEqual(r.data, await everyone(worldCtx(w), A), "server/people/people.ts everyone()");
  assert.deepEqual([r.data.length, r.rows], [1003, []]);
  const ctx = worldCtx(w);
  const turn = turnIn(ctx);
  await Promise.all([kernel.load(turn, audiencePoolReader, undefined), kernel.load(turn, playbooksReader, undefined)]);
  assert.deepEqual(
    ctx.supabase.seen.filter((q) => q.rpc === "people_list").map((q) => q.args.p_offset ?? 0),
    [0, 1000],
    "every page once, for the pool and the Playbooks page's pools alike",
  );
  assert.equal(
    selects(ctx, "policies").filter((q) => q.columns === "subject_type, subject_id, mode").length,
    1,
    "and the reply modes once",
  );
});

/* ------------------------------------------ the workspace's pages: settings, and the six beside it (PR 1.7) */

/** A request's reader context for a member of `role` in `tenantId`, on `now` when handed one. */
const memberIn = (ctx, tenantId, role, now) => kernel.readerContext(ctx, { tenantId, role }, now);
const DAY = 86_400_000;
const FEED = "https://calendar.example.com/private/abcdef123456/basic.ics";
/**
 * settings-routes.test.mjs, "the settings read": a member of two workspaces -- harbor's viewer, bayside's owner -- each
 * with a calendar feed on file, and harbor's own name and zone.
 */
const settingsWorld = (over = {}) => ({
  memberships: [
    membership(A, "viewer", "harbor", "2026-01-01T00:00:00Z"),
    membership(B, "owner", "bayside", "2026-02-01T00:00:00Z"),
  ],
  tenant_config: [
    { tenant_id: A, config: { calendar: { ical_url: FEED } }, version: 3, updated_at: "2026-09-01T00:00:00Z" },
    { tenant_id: B, config: { calendar: { ical_url: FEED } }, version: 1, updated_at: "2026-09-01T00:00:00Z" },
  ],
  tenants: [{ id: A, name: "Harbor", timezone: "America/New_York" }],
  tenant_channels: [],
  google_listings: [],
  ...over,
});
/** settings-routes.test.mjs, "F1": a receptionist that publishes the number the business keeps, forwarded to its line. */
const forwardedWorld = () => ({
  memberships: [
    membership(A, "owner", "harbor", "2026-01-01T00:00:00Z"),
    membership(B, "owner", "bayside", "2026-02-01T00:00:00Z"),
  ],
  tenant_config: [
    {
      tenant_id: A,
      config: {
        brain: {
          business_name: "Harbor Moving",
          booking_link: "https://book.example/harbor",
          phone_display: "(718) 555-0142",
          system_prompt: "Answer as the front desk of Harbor Moving: brief, warm, and never a price.",
          fallbacks: { greeting: "g", error: "e", non_text: "n" },
        },
      },
      version: 2,
      updated_at: "2026-09-01T00:00:00Z",
    },
  ],
  tenants: [{ id: A, name: "Harbor Moving", timezone: "America/New_York" }],
  tenant_channels: [{ tenant_id: A, kind: "voice", number_e164: "+19295550100", status: "active" }],
  google_listings: [],
  lines: [
    {
      id: L1,
      tenant_id: A,
      e164: "+17185550142",
      kind: "forwarded",
      provider: "carrier",
      area_code: 718,
      voice_state: "answering",
      sms_state: "none",
      whatsapp_state: "none",
      port_state: "none",
      forwarding_state: "verified",
      state_since: "2026-09-20T00:00:00Z",
      created_at: "2026-09-20T00:00:00Z",
      facts: { carrier: "verizon", mode: "unanswered", destination_e164: "+19295550100" },
    },
  ],
});
/** What GET settings asked of the database at origin/main, after the workspace's door, in its order. */
const SETTINGS_ASKED_AT_MAIN = [
  "tenant_config.select",
  "tenants.select",
  "google_listings.select",
  "lines.select",
  "tenant_channels.select",
  "policies.select",
];
/** The preview's clock, apart: the rest of what the settings read answers does not move with the minute. */
const withoutClock = (d) => (d.prompt ? { ...d, prompt: { ...d.prompt, now: "<clock>" } } : d);

test("the settings read, for Ask and for the page: GET settings answers its reader's payload, key for key, over settings-routes' fixtures -- a viewer's feed masked and an owner's whole, who last changed the row, a config the parser refuses as its own state, the platform's facts with the number the business forwards -- asking what it asked at origin/main in its order: the row once, the platform's facts at once, then the Autonomy rows inside the preview; no configuration row is the route's 404; the preview's clock is the turn's, and a turn that holds the row reads it once", async () => {
  for (const [tenant, role, version] of [
    [A, "viewer", 3],
    [B, "owner", 1],
  ]) {
    const page = await settingsRoute.GET.run(req(`?workspace=${tenant}`), dayCtx(settingsWorld()));
    const ctx = dayCtx(settingsWorld());
    const r = await kernel.load(memberIn(ctx, tenant, role), settingsReader, undefined);
    assert.deepEqual(r.data, page, "the route's payload");
    assert.equal(JSON.stringify(r.data), JSON.stringify(page), "byte for byte");
    assert.deepEqual(Object.keys(r.data), [
      "config",
      "version",
      "role",
      "configBroken",
      "facts",
      "conflicts",
      "prompt",
      "updatedBy",
      "updatedAt",
    ]);
    assert.deepEqual(
      [r.data.version, r.data.role, r.data.configBroken, r.data.prompt, r.data.updatedBy, r.data.updatedAt],
      [version, role, false, null, null, "2026-09-01T00:00:00Z"],
      "no receptionist, no prompt; a row written before its author was kept says so with null",
    );
    assert.deepEqual(r.rows, []);
    assert.deepEqual(asked(ctx), SETTINGS_ASKED_AT_MAIN.slice(0, -1), "no receptionist: no Autonomy rows to read");
  }
  const viewer = await kernel.load(memberIn(dayCtx(settingsWorld()), A, "viewer"), settingsReader, undefined);
  assert.ok(
    viewer.data.config.calendar.ical_url.includes("…") &&
      !viewer.data.config.calendar.ical_url.includes("abcdef123456"),
    "a viewer learns that a feed is set, not its address",
  );
  const owner = await kernel.load(memberIn(dayCtx(settingsWorld()), B, "owner"), settingsReader, undefined);
  assert.equal(owner.data.config.calendar.ical_url, FEED, "an owner sees it whole");
  const authored = settingsWorld({
    tenant_config: [{ tenant_id: B, config: {}, version: 1, updated_at: "2026-09-02T00:00:00Z", updated_by: "u7" }],
  });
  const byU7 = await kernel.load(memberIn(dayCtx(authored), B, "owner"), settingsReader, undefined);
  assert.deepEqual(byU7.data, await settingsRoute.GET.run(req(`?workspace=${B}`), dayCtx(authored)));
  assert.deepEqual([byU7.data.updatedBy, byU7.data.updatedAt], ["u7", "2026-09-02T00:00:00Z"]);
  // A config the parser refuses: its own state, and nothing past the row is read.
  const broken = settingsWorld({
    tenant_config: [{ tenant_id: A, config: "nonsense", version: 7, updated_at: "2026-09-01T00:00:00Z" }],
  });
  const brokenCtx = dayCtx(broken);
  const refused = await kernel.load(memberIn(brokenCtx, A, "viewer"), settingsReader, undefined);
  assert.deepEqual(refused.data, await settingsRoute.GET.run(req(`?workspace=${A}`), dayCtx(broken)));
  assert.deepEqual(Object.keys(refused.data), ["config", "version", "role", "configBroken", "issues"]);
  assert.deepEqual(
    [refused.data.config, refused.data.version, refused.data.configBroken],
    [null, 7, true],
    "REGRESSION: a broken config collapsed to {} and read as 'no receptionist yet'",
  );
  assert.ok(Array.isArray(refused.data.issues) && refused.data.issues.length > 0);
  assert.deepEqual(asked(brokenCtx), ["tenant_config.select"]);
  // No row at all: the route's 404, in its sentence, from the reader.
  const noRow = (e) => {
    assert.deepEqual([e.code, e.status, e.message], ["not_found", 404, "Workspace has no configuration row."]);
    return true;
  };
  const none = dayCtx(settingsWorld({ tenant_config: [] }));
  await assert.rejects(kernel.load(memberIn(none, A, "viewer"), settingsReader, undefined), noRow);
  assert.deepEqual(asked(none), ["tenant_config.select"]);
  await assert.rejects(
    settingsRoute.GET.run(req(`?workspace=${A}`), dayCtx(settingsWorld({ tenant_config: [] }))),
    noRow,
  );
  // F1: the platform's facts -- the number the business keeps, forwarded to its line -- and the receptionist's prompt.
  const NOW = new Date("2026-09-21T14:00:00Z");
  const routed = dayCtx(forwardedWorld());
  const page = await settingsRoute.GET.run(req(`?workspace=${A}`), routed);
  const ctx = dayCtx(forwardedWorld());
  const r = await kernel.load(memberIn(ctx, A, "owner", NOW), settingsReader, undefined);
  assert.deepEqual(withoutClock(r.data), withoutClock(page), "the route's payload, the preview's clock apart");
  assert.deepEqual(r.data.facts.kept_line, { value: "+17185550142", source: "provisioned" });
  assert.deepEqual(r.data.conflicts, [], "customers call the number they know and reach the receptionist");
  assert.equal(
    r.data.prompt.now,
    describeNow("America/New_York", NOW, undefined),
    "the preview says the turn's clock: one clock for the turn",
  );
  assert.deepEqual(
    asked(routed),
    ["memberships.select", ...SETTINGS_ASKED_AT_MAIN],
    "the workspace's door, then the reads",
  );
  assert.deepEqual(asked(ctx), SETTINGS_ASKED_AT_MAIN);
  // A turn that holds the row reads it once: the settings read is the turn's one read of the config.
  const turn = memberIn(dayCtx(forwardedWorld()), A, "owner", NOW);
  await kernel.load(turn, config, undefined);
  const held = turn.ctx.supabase.seen.length;
  const again = await kernel.load(turn, settingsReader, undefined);
  assert.deepEqual(asked(turn.ctx).slice(held), SETTINGS_ASKED_AT_MAIN.slice(1), "the row was the turn's");
  assert.deepEqual(again.data, r.data);
});

/** setup.test.mjs, "what the first run's Check reads": Northside's listing and its receptionist, owned in harbor. */
const setupWorld = () => ({
  tables: {
    memberships: [
      membership(A, "owner", "harbor", "2026-01-01T00:00:00Z"),
      membership(B, "viewer", "bayside", "2026-02-01T00:00:00Z"),
    ],
    google_listings: [
      {
        tenant_id: A,
        place_id: "ChIJ-northside-movers",
        name: "Northside Movers",
        address: null,
        maps_uri: null,
        business_status: null,
        rating: null,
        review_count: null,
        linked_at: "2026-09-07T14:00:00Z",
        checked_at: null,
        check_error: null,
        facts: {
          hours: [{ open: { day: 2, hour: 9, minute: 0 }, close: { day: 2, hour: 17, minute: 0 } }],
          website: null,
          service_area_only: true,
          primary_type: "moving_company",
          booking_page: "https://calendly.com/northside-movers-example/estimate",
          phone_e164: "+13055550100",
        },
      },
    ],
    tenant_config: [
      {
        tenant_id: A,
        version: 3,
        config: { brain: { business_name: "Northside Movers", ...newReceptionistDefaults("Northside Movers") } },
      },
    ],
  },
  rpcs: {
    team_roster: () => [
      { membership_id: "m1", member_user_id: USER, email: "ada@example.com", display_name: "Ada", role: "owner" },
    ],
  },
});

test("connections, for the page: GET setup answers its reader's payload over setup.test.mjs's shape -- setupDtoFor's own answer for a member reading their own workspace on their session, on the turn's clock, and their role beside it -- asking what setupDtoFor asks, in its order: the roster through its door, never the back office's counts", async () => {
  const NOW = new Date("2026-09-07T15:00:00Z");
  const w = setupWorld();
  const routed = worldCtx(w);
  const page = await setupRoute.GET.run(req(`?workspace=${A}`), routed);
  const ctx = worldCtx(w);
  const r = await kernel.load(memberIn(ctx, A, "owner", NOW), connections, undefined);
  assert.deepEqual(r.data, page, "the route's payload");
  assert.equal(JSON.stringify(r.data), JSON.stringify(page), "byte for byte");
  assert.deepEqual(Object.keys(r.data), ["setup", "role"]);
  assert.deepEqual(r.rows, []);
  const direct = worldCtx(w);
  assert.deepEqual(
    r.data,
    { setup: await setupDtoFor(direct.supabase, A, { kind: "member" }, NOW), role: "owner" },
    "setupDtoFor's own answer for a member, and the role riding along so the page knows who may act",
  );
  assert.deepEqual(askedWith(ctx), askedWith(direct), "setupDtoFor's own reads, in its order, on the member's session");
  assert.ok(asked(ctx).includes("rpc:team_roster"), "the roster through its door: a member's");
  assert.ok(!asked(ctx).includes("memberships.select"), "never the back office's plain counts");
  assert.deepEqual(asked(routed), ["memberships.select", ...asked(ctx)], "the workspace's door, then the same reads");
  const viewer = await kernel.load(memberIn(worldCtx(w), B, "viewer", NOW), connections, undefined);
  assert.deepEqual(viewer.data, await setupRoute.GET.run(req(`?workspace=${B}`), worldCtx(w)));
  assert.equal(viewer.data.role, "viewer");
});

const N1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const N2 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
const N3 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc3";
const N4 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc4";
/**
 * reads-routes.test.mjs, "reading notifications", on a clock (`now`): harbor's rows a day, three days and forty days
 * old, one of bayside's; my mark on N2, another person's on N1 -- and, handed `mine`, marks of my own beside them.
 */
const notificationsWorld = (now = Date.now(), { mine = [], rows } = {}) => {
  const ago = (days) => new Date(now - days * DAY).toISOString();
  const row = (id, tenant_id, kind, title, days, over = {}) => ({
    id,
    tenant_id,
    kind,
    title,
    body: "…",
    route: null,
    subject_type: null,
    subject_id: null,
    created_at: ago(days),
    ...over,
  });
  return {
    memberships: [
      membership(A, "viewer", "harbor", "2026-01-01T00:00:00Z"),
      membership(B, "viewer", "bayside", "2026-02-01T00:00:00Z"),
    ],
    notifications: rows ?? [
      row(N1, A, "handoff", "Rosa asked for a person", 1, {
        body: "She wrote: can I talk to someone?\nSecond line",
        route: "inbox/th-x",
        subject_type: "conversation",
        subject_id: "x",
      }),
      row(N2, A, "billing", "Your trial ends in three days", 3, { route: "admin/billing" }),
      row(N3, A, "alert", "Old", 40),
      row(N4, B, "alert", "Elsewhere", 1),
    ],
    notification_marks: [
      { notification_id: N2, user_id: USER, read_at: ago(2), dismissed_at: null },
      { notification_id: N1, user_id: "someone-else", read_at: ago(0), dismissed_at: ago(0) },
      ...mine,
    ],
    notification_reads: [{ tenant_id: A, user_id: USER, seen_at: "2026-09-10T12:00:00Z" }],
  };
};

test("the notifications, for the page: GET notifications answers its reader's payload over reads-routes' fixture in both workspaces -- the month's rows newest first, each with this person's own marks, and when they last opened the bell -- the thirty days counted back from the turn's clock; the marks read only for the rows listed, and only this person's: another person's mark is not mine, my own dismissal is", async () => {
  const today = Date.now();
  for (const [tenant, ids, seen] of [
    [A, [N1, N2], "2026-09-10T12:00:00Z"],
    [B, [N4], null],
  ]) {
    const page = await notificationsRoute.GET.run(req(`?workspace=${tenant}`), dayCtx(notificationsWorld(today)));
    const r = await kernel.load(turnIn(dayCtx(notificationsWorld(today)), tenant), notificationsReader, undefined);
    assert.deepEqual(r.data, page, "the route's payload");
    assert.equal(JSON.stringify(r.data), JSON.stringify(page), "byte for byte");
    assert.deepEqual([r.data.notifications.map((n) => n.id), r.data.seen_at], [ids, seen]);
    assert.deepEqual(r.rows, []);
  }
  // On the turn's clock: my own dismissal of N1 beside another person's mark on it, my read of N2.
  const NOW = Date.parse("2026-09-20T12:00:00Z");
  const mine = [{ notification_id: N1, user_id: USER, read_at: null, dismissed_at: new Date(NOW).toISOString() }];
  const ctx = dayCtx(notificationsWorld(NOW, { mine }));
  const r = await kernel.load(memberIn(ctx, A, "viewer", new Date(NOW)), notificationsReader, undefined);
  assert.deepEqual(
    r.data.notifications.map((n) => [n.id, n.read, n.dismissed]),
    [
      [N1, false, true],
      [N2, true, false],
    ],
    "this person's marks ride on each row: my dismissal of N1, my read of N2; another person's read of N1 is not mine",
  );
  assert.deepEqual(asked(ctx), ["notification_reads.select", "notifications.select", "notification_marks.select"]);
  const [rows] = selects(ctx, "notifications");
  assert.deepEqual(
    rows.filters.find(([op]) => op === "gte"),
    ["gte", "created_at", new Date(NOW - 30 * DAY).toISOString()],
    "thirty days back from the turn's clock",
  );
  const [marks] = selects(ctx, "notification_marks");
  assert.deepEqual(
    marks.filters,
    [
      ["eq", "user_id", USER],
      ["in", "notification_id", [N1, N2]],
    ],
    "my marks, for the rows listed and no others",
  );
  // Four weeks on, the month reaches back two days: only yesterday's row is still in it.
  const later = await kernel.load(
    memberIn(dayCtx(notificationsWorld(NOW)), A, "viewer", new Date(NOW + 28 * DAY)),
    notificationsReader,
    undefined,
  );
  assert.deepEqual(
    later.data.notifications.map((n) => n.id),
    [N1],
  );
  // No row this month: no mark is read at all.
  const quiet = dayCtx(notificationsWorld(NOW, { rows: [] }));
  const none = await kernel.load(turnIn(quiet), notificationsReader, undefined);
  assert.deepEqual(none.data, { notifications: [], seen_at: "2026-09-10T12:00:00Z" });
  assert.deepEqual(asked(quiet), ["notification_reads.select", "notifications.select"]);
});

/**
 * activity.test.mjs, "owners read both ledgers": harbor's owner; a person, their thread and their call; four decisions
 * (one bayside's) and five events (a usage row and a webhook row among them), and the team's roster.
 */
const activityWorld = () => {
  const P = "11111111-1111-4111-8111-111111111111";
  const C = "22222222-2222-4222-8222-222222222222";
  const K = "33333333-3333-4333-8333-333333333333";
  const decision = (id, tenant_id, verb, subject_type, subject_id, actor, payload, created_at) => ({
    id,
    tenant_id,
    verb,
    subject_type,
    subject_id,
    actor_type: "user",
    actor_user_id: actor,
    payload,
    created_at,
  });
  const event = (id, kind, subject_type, subject_id, data, created_at) => ({
    id,
    tenant_id: A,
    kind,
    subject_type,
    subject_id,
    data,
    created_at,
  });
  return {
    tables: {
      memberships: [membership(A, "owner", "harbor", "2026-01-01T00:00:00Z")],
      tenants: [{ id: A, slug: "harbor", name: "Harbor", status: "active", timezone: "America/New_York" }],
      conversations: [{ id: C, tenant_id: A, contact_id: P }],
      calls: [{ id: K, tenant_id: A, contact_id: P }],
      decisions: [
        decision(
          "d1",
          A,
          "consent_change",
          "contact",
          P,
          "u-ada",
          { consent: "opted_in", source: "form" },
          "2026-09-11T14:00:00Z",
        ),
        decision("d2", A, "take_over", "conversation", C, "u-bo", {}, "2026-09-11T15:00:00Z"),
        decision("d3", A, "export", "workspace", A, "u-ada", { what: "people", rows: 5 }, "2026-09-12T02:30:00Z"),
        decision("d4", B, "export", "workspace", B, "u-x", {}, "2026-09-11T16:00:00Z"),
      ],
      events: [
        event("e1", "message.received", "message", "m1", {}, "2026-09-11T14:30:00Z"),
        event("e2", "usage.ask_tokens", "user", USER, { tokens: 400 }, "2026-09-11T14:45:00Z"),
        event("e3", "webhook.delivery", null, null, {}, "2026-09-11T14:50:00Z"),
        event("e4", "call.recorded", "call", K, {}, "2026-09-10T10:00:00Z"),
        event("e5", "broadcast.sent", "broadcast", "b1", { sent: 3, held: 1 }, "2026-09-12T13:00:00Z"),
      ],
    },
    rpcs: {
      team_roster: () => [
        { membership_id: "m1", member_user_id: "u-ada", email: "ada@example.com", display_name: "Ada", role: "owner" },
        { membership_id: "m2", member_user_id: "u-bo", email: "bo@example.com", display_name: "", role: "operator" },
      ],
    },
    person: P,
  };
};

test("the activity log, for the page: GET activity answers its reader's payload over activity.test.mjs's fixture -- both ledgers newest first, the noise left out, the actors named -- with a filter handed in as the route parsed it: none, a person, a day by the workspace's clock; the route keeps the owner's door and the reader trusts its caller; not a row a citation names yet", async () => {
  const w = activityWorld();
  for (const [q, filter, ids] of [
    ["", {}, ["e-e5", "d-d3", "d-d2", "e-e1", "d-d1", "e-e4"]],
    [`&person=${w.person}`, { person: w.person }, ["d-d2", "d-d1", "e-e4"]],
    ["&day=2026-09-11", { day: "2026-09-11" }, ["d-d3", "d-d2", "e-e1", "d-d1"]],
  ]) {
    const routed = worldCtx(w);
    const page = await activityRoute.GET.run(req(`?workspace=${A}${q}`), routed);
    const ctx = worldCtx(w);
    const r = await kernel.load(memberIn(ctx, A, "owner"), activityReader, filter);
    assert.deepEqual(r.data, page, `the route's payload: ${q || "no filter"}`);
    assert.equal(JSON.stringify(r.data), JSON.stringify(page), "byte for byte");
    assert.deepEqual(
      r.data.rows.map((x) => x.id),
      ids,
    );
    assert.deepEqual(r.rows, []);
    assert.deepEqual(asked(routed), ["memberships.select", ...asked(ctx)], "the workspace's door, then the same reads");
  }
  assert.deepEqual(activityRoute.GET.policy.role, "owner", "the owner's door is the route's");
});

/** reads-routes.test.mjs, "the channels read": harbor's WhatsApp number with Meta's quality on its config, bayside's line. */
const channelsWorld = (over = {}) => ({
  memberships: [
    membership(A, "operator", "harbor", "2026-01-01T00:00:00Z"),
    membership(B, "operator", "bayside", "2026-02-01T00:00:00Z"),
  ],
  tenant_channels: [
    {
      id: "ch1",
      tenant_id: A,
      kind: "whatsapp",
      number_e164: "+13055550199",
      status: "active",
      created_at: "2026-08-01T00:00:00Z",
      config: { quality_rating: "GREEN", messaging_limit: "TIER_1K" },
    },
    {
      id: "ch2",
      tenant_id: B,
      kind: "voice",
      number_e164: "+13055550198",
      status: "active",
      created_at: "2026-08-01T00:00:00Z",
      config: {},
    },
  ],
  messages: [],
  calls: [],
  ...over,
});

test("the channels, for the page and for Ask: GET channels answers its reader's payload over reads-routes' fixture -- the named workspace's rows by kind, when each last heard from a customer, and the quality Meta assigned the WhatsApp number, from its config -- the last message, the last call and the rows asked at once, as the route asked them; not a row a citation names yet", async () => {
  for (const tenant of [A, B]) {
    const page = await channelsRoute.GET.run(req(`?workspace=${tenant}`), dayCtx(channelsWorld()));
    const ctx = dayCtx(channelsWorld());
    const r = await kernel.load(turnIn(ctx, tenant), channelsReader, undefined);
    assert.deepEqual(r.data, page, "the route's payload");
    assert.equal(JSON.stringify(r.data), JSON.stringify(page), "byte for byte");
    assert.deepEqual(r.rows, []);
    assert.deepEqual(asked(ctx), ["messages.select", "calls.select", "tenant_channels.select"]);
  }
  const harbor = (await kernel.load(turnIn(dayCtx(channelsWorld())), channelsReader, undefined)).data;
  assert.deepEqual(
    harbor.channels.map((c) => [c.id, c.kind, c.quality, c.messaging_limit]),
    [["ch1", "whatsapp", "GREEN", "TIER_1K"]],
  );
  assert.deepEqual(Object.keys(harbor.channels[0]), [
    "id",
    "kind",
    "number_e164",
    "status",
    "created_at",
    "last_inbound_at",
    "quality",
    "quality_event",
    "messaging_limit",
    "quality_at",
  ]);
  // When each last heard from a customer: WhatsApp's last inbound message, the line's last inbound call.
  const heard = channelsWorld({
    tenant_channels: [
      ...channelsWorld().tenant_channels,
      {
        id: "ch3",
        tenant_id: A,
        kind: "voice",
        number_e164: "+13055550197",
        status: "active",
        created_at: "2026-08-02T00:00:00Z",
        config: null,
      },
    ],
    messages: [
      {
        tenant_id: A,
        direction: "inbound",
        channel: "whatsapp",
        channel_ts: "2026-09-20T10:00:00Z",
        created_at: "2026-09-20T10:00:01Z",
      },
    ],
    calls: [{ tenant_id: A, direction: "inbound", started_at: "2026-09-19T10:00:00Z" }],
  });
  const r = await kernel.load(turnIn(dayCtx(heard)), channelsReader, undefined);
  assert.deepEqual(r.data, await channelsRoute.GET.run(req(`?workspace=${A}`), dayCtx(heard)));
  assert.deepEqual(
    r.data.channels.map((c) => [c.kind, c.last_inbound_at]),
    [
      ["voice", "2026-09-19T10:00:00Z"],
      ["whatsapp", "2026-09-20T10:00:00Z"],
    ],
    "by kind, each with when it last heard from a customer",
  );
});

/** settings-routes.test.mjs, "the autonomy matrix": harbor's rows and a person's own row, bayside's with its limits. */
const matrixRow = (tenant_id, cls, mode, limits = {}) => ({
  id: `${cls}-${tenant_id.slice(0, 1)}`,
  tenant_id,
  class: cls,
  mode,
  subject_type: null,
  subject_id: null,
  limits,
  updated_at: "2026-09-01T00:00:00Z",
});
const matrixWorld = (over = {}) => ({
  memberships: [
    membership(A, "viewer", "harbor", "2026-01-01T00:00:00Z"),
    membership(B, "operator", "bayside", "2026-02-01T00:00:00Z"),
  ],
  policies: [
    matrixRow(A, "reply", "auto"),
    matrixRow(A, "money", "ask"),
    { ...matrixRow(A, "reply", "never"), id: "person", subject_type: "contact", subject_id: "k1" },
    matrixRow(B, "reply", "auto", { max_replies_day: 50, reply_delay_ms: 15000 }),
    matrixRow(B, "booking", "auto"),
  ],
  ...over,
});

test("the autonomy matrix, for the page: GET policies answers its reader's payload over settings-routes' fixture in both workspaces -- the workspace's own rows by class, never a person's, the reader's role, and whether deals are on -- the rows and how the customers buy read at once, through the turn's readers, fresh on every request; a turn that holds both reads neither again", async () => {
  for (const [tenant, role, classes] of [
    [A, "viewer", ["money", "reply"]],
    [B, "operator", ["booking", "reply"]],
  ]) {
    const page = await policiesRoute.GET.run(req(`?workspace=${tenant}`), dayCtx(matrixWorld()));
    const ctx = dayCtx(matrixWorld());
    const r = await kernel.load(memberIn(ctx, tenant, role), autonomy, undefined);
    assert.deepEqual(r.data, page, "the route's payload");
    assert.equal(JSON.stringify(r.data), JSON.stringify(page), "byte for byte");
    assert.deepEqual(Object.keys(r.data), ["policies", "role", "deals_on"]);
    assert.deepEqual(
      [r.data.policies.map((p) => p.class), r.data.role, r.data.deals_on],
      [classes, role, false],
      "the workspace's rows, by class; a person's own row is not the matrix",
    );
    assert.deepEqual(r.rows, []);
    assert.deepEqual(asked(ctx), ["tenants.select", "policies.select"]);
  }
  const agency = matrixWorld({
    tenants: [{ id: A, name: "Harbor", timezone: "America/New_York", sells_by: "proposal" }],
  });
  const on = await kernel.load(memberIn(dayCtx(agency), A, "viewer"), autonomy, undefined);
  assert.equal(on.data.deals_on, true, "some customers get a proposal first: the follow-ups' row is drawn");
  assert.deepEqual(on.data, await policiesRoute.GET.run(req(`?workspace=${A}`), dayCtx(agency)));
  // A route keeps nothing: the same request twice reads the matrix twice.
  const twice = dayCtx(matrixWorld());
  await policiesRoute.GET.run(req(`?workspace=${A}`), twice);
  await policiesRoute.GET.run(req(`?workspace=${A}`), twice);
  assert.equal(selects(twice, "policies").length, 2, "fresh on every request");
  // A turn that holds the rows and how the customers buy (workspace.settings, campaigns.playbooks) reads neither again.
  const turn = memberIn(dayCtx(matrixWorld()), A, "viewer");
  await Promise.all([kernel.load(turn, policies, undefined), kernel.load(turn, sellsBy, undefined)]);
  const held = turn.ctx.supabase.seen.length;
  await kernel.load(turn, autonomy, undefined);
  assert.equal(turn.ctx.supabase.seen.length, held, "the turn's own reads");
});

const TP1 = "77777777-7777-4777-8777-777777777771";
const TP2 = "77777777-7777-4777-8777-777777777772";
const TP3 = "77777777-7777-4777-8777-777777777773";
const TP4 = "77777777-7777-4777-8777-777777777774";
const TP9 = "77777777-7777-4777-8777-777777777779";
/** A template row as outbound-routes.test.mjs builds one. */
const tplRow = (id, tenant_id, over = {}) => ({
  id,
  tenant_id,
  channel: "whatsapp",
  name: "visit_reminder",
  language: "en_US",
  body_preview: "See you at {{1}}",
  variables: [],
  category: "utility",
  meta_status: "approved",
  quality: null,
  rejected_reason: null,
  synced_at: null,
  source: "starter",
  hidden_at: null,
  title: null,
  ...over,
});
/**
 * outbound-routes.test.mjs, "templates: the composers see the approved and unhidden": bayside's approved reminder, its
 * hidden sample and its pending offer, harbor's own; the reminder here titled, and carrying a heading, a footer and a
 * button that takes a value (Meta's components, as the sync keeps them).
 */
const templatesWorld = () => ({
  memberships: [
    membership(A, "viewer", "harbor", "2026-01-01T00:00:00Z"),
    membership(B, "operator", "bayside", "2026-02-01T00:00:00Z"),
  ],
  templates: [
    tplRow(TP1, B, {
      title: "Visit reminder",
      components: [
        { type: "HEADER", format: "TEXT", text: "Your visit" },
        { type: "BODY", text: "See you at {{1}}" },
        { type: "FOOTER", text: "Reply STOP to opt out" },
        { type: "BUTTONS", buttons: [{ type: "URL", text: "Book", url: "https://book.example/{{1}}" }] },
      ],
    }),
    tplRow(TP2, B, { name: "hello_world", hidden_at: "2026-09-01T00:00:00Z" }),
    tplRow(TP3, B, { name: "offer", meta_status: "pending", category: "marketing" }),
    tplRow(TP4, A, { name: "elsewhere" }),
  ],
});
/** outbound-routes.test.mjs, "a template says what sends it": bayside's messages, playbooks and runs. */
const usageWorld = () => ({
  memberships: templatesWorld().memberships,
  templates: [
    tplRow(TP1, B, { name: "winback_offer" }),
    tplRow(TP2, B, { name: "winback_offer", language: "es_MX" }),
    tplRow(TP3, B, { name: "autumn_promo", category: "marketing", source: "meta" }),
    tplRow(TP4, B, { name: "booking_link", variables: [{ position: 1 }, { position: 2 }, { position: 3 }] }),
    tplRow(TP9, A, { name: "elsewhere" }),
  ],
  playbooks: [
    pbRow(PB1, { tenant_id: B, template_name: "winback_offer" }),
    pbRow(PB2, { tenant_id: B, name: "Second wind", template_name: "winback_offer", state: "paused" }),
  ],
  broadcasts: [
    bcRow(BC1, B, { template_name: "winback_offer", state: "sent" }),
    bcRow(BC2, B, { template_name: "winback_offer", playbook_id: PB1, state: "sent" }),
  ],
  broadcast_recipients: [
    { broadcast_id: BC1, contact_id: "c1", tenant_id: B, state: "sent", sent_at: "2026-09-10T15:00:00Z" },
    { broadcast_id: BC2, contact_id: "c2", tenant_id: B, state: "sent", sent_at: "2026-09-17T14:00:00Z" },
  ],
  messages: [],
});
/** What GET templates asked at origin/main for Settings (`all`), after the workspace's door: the rows, then the usage. */
const TEMPLATES_ALL_ASKED_AT_MAIN = [
  "templates.select",
  "broadcasts.select",
  "broadcast_recipients.select",
  "messages.select",
  "playbooks.select",
];

test("the templates, for the composers, Settings and Ask: GET templates answers its reader's payload over outbound-routes' fixtures, `all` as the route parses it -- the composers' read the approved and unhidden alone, each row the message as the customer receives it and why this product cannot send it, and nothing more read; Settings' every template, with what sends each and how many went out -- and a template is not a row a citation names yet", async () => {
  for (const [q, all, names, keys, reads] of [
    ["", false, ["visit_reminder"], ["templates"], ["templates.select"]],
    [
      "&all=1",
      true,
      ["hello_world", "offer", "visit_reminder"],
      ["templates", "usedBy", "sends"],
      TEMPLATES_ALL_ASKED_AT_MAIN,
    ],
    ["&all=0", false, ["visit_reminder"], ["templates"], ["templates.select"]],
  ]) {
    const routed = dayCtx(templatesWorld());
    const page = await templatesRoute.GET.run(req(`?workspace=${B}${q}`), routed);
    const ctx = dayCtx(templatesWorld());
    const r = await kernel.load(turnIn(ctx, B), templatesReader, { all });
    assert.deepEqual(r.data, page, `the route's payload: ${q || "the composers'"}`);
    assert.equal(JSON.stringify(r.data), JSON.stringify(page), "byte for byte");
    assert.deepEqual(
      [Object.keys(r.data), r.data.templates.map((t) => t.name)],
      [keys, names],
      "the composers see the approved and unhidden; Settings sees everything, by name",
    );
    assert.deepEqual(r.rows, []);
    assert.deepEqual(asked(ctx), reads);
    assert.deepEqual(asked(routed), ["memberships.select", ...reads], "the workspace's door, then the same reads");
  }
  // The row as the composers get it: its category (a marketing template goes only to a yes to offers) and its title,
  // the heading, footer and buttons out of Meta's array, and why it can't go from here -- never the array itself.
  const [reminder] = (await kernel.load(turnIn(dayCtx(templatesWorld()), B), templatesReader, { all: false })).data
    .templates;
  assert.deepEqual(
    [reminder.category, reminder.title, reminder.header, reminder.footer, reminder.buttons, reminder.blocked],
    [
      "utility",
      "Visit reminder",
      "Your visit",
      "Reply STOP to opt out",
      [{ text: "Book", kind: "url" }],
      "a button that takes a value",
    ],
  );
  assert.equal("components" in reminder, false, "Meta's array stays behind");
  const settingsRead = (await kernel.load(turnIn(dayCtx(templatesWorld()), B), templatesReader, { all: true })).data;
  assert.equal(settingsRead.templates.find((t) => t.name === "offer").category, "marketing");
  // What sends each, and how many went out: outbound-routes' shape, the route's payload.
  const usage = dayCtx(usageWorld());
  const u = await kernel.load(turnIn(usage, B), templatesReader, { all: true });
  assert.deepEqual(u.data, await templatesRoute.GET.run(req(`?workspace=${B}&all=1`), dayCtx(usageWorld())));
  assert.deepEqual(
    [u.data.usedBy.winback_offer.playbooks.map((p) => [p.name, p.paused]), u.data.usedBy.winback_offer.broadcasts],
    [
      [
        ["Win-back", false],
        ["Second wind", true],
      ],
      1,
    ],
    "both playbooks, which is paused, and the one run a person sent: a playbook's own run is not a second broadcast",
  );
  assert.deepEqual(u.data.sends.winback_offer, { count: 2, lastAt: "2026-09-17T14:00:00Z" });
  assert.equal(u.data.usedBy.elsewhere, undefined, "another workspace's are not this one's");
});

const LIST_HAND = "bbbbbbbb-1111-4111-8111-bbbbbbbbbbb1";
const LIST_RULE = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbb2";
const LIST_NAMING = "bbbbbbbb-3333-4333-8333-bbbbbbbbbbb3";
const LIST_ARCHIVED = "bbbbbbbb-4444-4444-8444-bbbbbbbbbbb4";
const LIST_GONE = "bbbbbbbb-9999-4999-8999-bbbbbbbbbbb9";
/**
 * calendar-counts' three people, with the workspace's own lists: one kept by hand; one kept by a rule, with a stale
 * member row a rule list never reads; one whose rule names the first; and one archived (00169), kept by hand.
 */
const listsPoolWorld = () =>
  countsWorld(pagedPeople([poolPerson(1), poolPerson(2), poolPerson(3, { conversation_count: 0 })]), {
    segments: [
      { id: LIST_HAND, tenant_id: A, name: "Regulars", rule: null, archived_at: null },
      {
        id: LIST_RULE,
        tenant_id: A,
        name: "Talked to us",
        rule: { all: [{ field: "conversations", op: "at_least", n: 1 }] },
        archived_at: null,
      },
      {
        id: LIST_NAMING,
        tenant_id: A,
        name: "Regulars who talked",
        rule: {
          all: [
            { field: "in_list", op: "is", list: `list:${LIST_HAND}` },
            { field: "conversations", op: "at_least", n: 1 },
          ],
        },
        archived_at: null,
      },
      { id: LIST_ARCHIVED, tenant_id: A, name: "Old list", rule: null, archived_at: "2026-09-10T00:00:00Z" },
    ],
    segment_members: [
      { tenant_id: A, segment_id: LIST_HAND, contact_id: "p1" },
      { tenant_id: A, segment_id: LIST_HAND, contact_id: "p3" },
      { tenant_id: A, segment_id: LIST_RULE, contact_id: "p3" },
      { tenant_id: A, segment_id: LIST_ARCHIVED, contact_id: "p2" },
    ],
  });

test("poolList takes the turn's lists: handed the workspace's lists as the lists reader holds them -- archived and members included -- it answers what it answers reading them itself, for a list kept by hand, a rule list, a rule that names another list, an archived list and one that is not there, and reads no list; without them it reads its own, as the send does", async () => {
  const w = listsPoolWorld();
  const pool = await audiencePoolOf(worldCtx(w), A, "America/New_York", new Date());
  const want = {
    [LIST_HAND]: { label: "Regulars", memberIds: ["p1", "p3"], rule: null },
    [LIST_RULE]: { label: "Talked to us", memberIds: ["p1", "p2"] },
    [LIST_NAMING]: { label: "Regulars who talked", memberIds: ["p1"] },
    [LIST_ARCHIVED]: { label: "Old list", memberIds: ["p2"], rule: null, archived: true },
    [LIST_GONE]: null,
  };
  for (const id of [LIST_HAND, LIST_RULE, LIST_NAMING, LIST_ARCHIVED, LIST_GONE]) {
    const ref = { kind: "saved", id };
    const reading = worldCtx(w);
    const itself = await poolList(reading, A, pool, ref);
    const handed = worldCtx(w);
    const lists = (await kernel.load(turnIn(handed), listsReader, undefined)).data.lists;
    const held = handed.supabase.seen.length;
    const got = await poolList(handed, A, pool, ref, lists);
    assert.deepEqual(got, itself, `the same answer, handed or read: ${id}`);
    assert.equal(handed.supabase.seen.length, held, `handed the lists, it reads none: ${id}`);
    assert.ok(asked(reading).includes("segments.select"), `without them, it reads its own: ${id}`);
    const expected = want[id];
    if (!expected) assert.equal(got, null, "no such list");
    else for (const [k, v] of Object.entries(expected)) assert.deepEqual(got[k], v, `${id}: ${k}`);
  }
  // A People list reads no saved list either way.
  const builtin = worldCtx(w);
  assert.deepEqual(
    await poolList(builtin, A, pool, { kind: "builtin", id: "phoned_only" }, []),
    await poolList(worldCtx(w), A, pool, { kind: "builtin", id: "phoned_only" }),
  );
  assert.deepEqual(asked(builtin), []);
});
