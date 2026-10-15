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
import {
  callerName,
  DEFAULT_TIMEZONE,
  describeNow,
  freeWindows,
  journeyGuide,
  newReceptionistDefaults,
  numberHealthOfConfig,
  PLAYBOOK_CARD_WORDS,
  peopleNowOf,
  personName,
  reportFacts,
  toCallVM,
  toPeopleReportVM,
  toPersonVM,
  toReceptionistReportVM,
  toReportVM,
  toReviewsReportVM,
} from "@chanlytics/contracts";
import * as contracts from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";
import { rows } from "../_rows.mjs";
import { fieldsOf, logLineOf } from "../_log-lines.mjs";
import { PLAN } from "../_lead-fixtures.mjs";
import { QUIET, SERIES } from "../reports/people/_people-world.mjs";
import { NOW as LEDGER_NOW, SERIES as LEDGER, STUCK, STUCK_NOW } from "../reports/campaigns/_campaign-world.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const kernel = await import(at("apps/dashboard/src/server/readers/index.ts"));
const {
  facts,
  sellsBy,
  policies,
  config,
  businessShape,
  channelsReady: channelsReadyReader,
} = await import(at("apps/dashboard/src/server/readers/facts.ts"));
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
const {
  report: reportReader,
  reviewsReport,
  receptionistReport,
  peopleReport,
} = await import(at("apps/dashboard/src/server/readers/report.ts"));
const { runTool, newToolContext } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/service-db.ts"));
const { campaignReport, campaignLedgerReport } = await import(
  at("apps/dashboard/src/server/readers/campaign-report.ts")
);
const reportsRoute = await import(at("apps/dashboard/app/api/v1/reports/route.ts"));
const campaignsRoute = await import(at("apps/dashboard/app/api/v1/reports/campaigns/route.ts"));
const ledgerRoute = await import(at("apps/dashboard/app/api/v1/reports/campaigns/ledger/route.ts"));
const reviewsRoute = await import(at("apps/dashboard/app/api/v1/reports/reviews/route.ts"));
const receptionistRoute = await import(at("apps/dashboard/app/api/v1/reports/receptionist/route.ts"));
const peopleRoute = await import(at("apps/dashboard/app/api/v1/reports/people/route.ts"));
const googleRoute = await import(at("apps/dashboard/app/api/v1/google/route.ts"));
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const { calendarWeek } = await import(at("apps/dashboard/src/server/calendar/calendar-week.ts"));
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
const listCountsRoute = await import(at("apps/dashboard/app/api/v1/people/list-counts/route.ts"));
const segmentsRoute = await import(at("apps/dashboard/app/api/v1/segments/route.ts"));
const broadcastsRoute = await import(at("apps/dashboard/app/api/v1/broadcasts/route.ts"));
/**
 * 3 Oct 2026: what a workspace's campaigns have sent by email and by text this calendar month, which the Campaigns head
 * and the composers say (`month_sent`, server/campaigns/month-sent.ts): a function only the service role may call, so the
 * readers reach it through the service client, here a double that counts 1,240 emails and 12 texts.
 */
const MONTH_SENT = { email: 1240, sms: 12 };
setServiceClient(fakeDb({}, {}, { campaign_month_sent: ({ p_channel }) => MONTH_SENT[p_channel] }));
const broadcastRoute = await import(at("apps/dashboard/app/api/v1/broadcasts/[id]/route.ts"));
const { everyone } = await import(at("apps/dashboard/src/server/people/people.ts"));
const { audiencePool: audiencePoolReader } = await import(at("apps/dashboard/src/server/readers/audience-pool.ts"));
const { audiencePool: audiencePoolOf, poolList } = await import(at("apps/dashboard/src/server/people/audience.ts"));
const { channelsReadyOrNull } = await import(at("apps/dashboard/src/server/campaigns/channels-ready.ts"));
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

test("conversations: the Inbox as GET conversations answers it -- the named workspace's newest hundred with each one's newest messages, past PostgREST's thousand rows in one read, or the ids handed in -- each a thread, named as the Inbox row names it", async () => {
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
    ctx.supabase.seen
      .filter((q) => q.rpc === "newest_messages")
      .map((q) => ({ ...q.args, p_threads: q.args.p_threads.length })),
    [{ p_tenant_id: A, p_threads: 30, p_each: 100, p_most: 4000 }],
    "the messages in one read (00258): each thread's newest hundred, four thousand in all",
  );
  assert.equal(selects(ctx, "messages").length, 0, "never the table a page at a time");
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

test("searches: GET lead-searches' answer -- every kept search with its latest round, and the rail's counts, read together -- and each search a row a citation names, opened on Leads at that search", async () => {
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
  assert.deepEqual(r.rows, [{ kind: "search", id: S1, route: `clients/leads:s-${S1}`, label: s.name }]);
  assert.equal(selects(ctx, "lead_searches_view").length, 1);
});

/* -------------------------------------- the Inbox and Today, as the page composes them */

/**
 * What `fn` logged under one event name, at error or warn: a logger line's fields (src/server/log.ts, and the packages',
 * which write through the same logger), or a positional line's values after its name.
 */
async function logged(event, fn) {
  const lines = [];
  const was = { error: console.error, warn: console.warn };
  const hear = (...args) => {
    const line = logLineOf(args);
    if (line) {
      if (line.event === event) lines.push(fieldsOf(line));
    } else if (args[0] === event) lines.push(args.slice(1));
  };
  console.error = console.warn = hear;
  try {
    return { result: await fn(), lines };
  } finally {
    console.error = was.error;
    console.warn = was.warn;
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
  assert.equal(
    ctx.supabase.seen.filter((q) => q.rpc === "newest_messages").length,
    2,
    "the messages in one read for each",
  );
  assert.equal(
    selects(ctx, "escalations").length,
    2,
    "the open escalations in two halves: the holds that wait on a person, and the hand-backs (escalations.ts)",
  );
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
  assert.deepEqual(lines, [{ unread: 1 }], "one waiting customer the read could not bring, counted");
});

test("Today for Ask as the page composes it: the day's metrics, the newest hundred, the open escalations, the calls, the searches and the runs waiting at once, then the threads of the holds past the hundred by id -- each read once in the turn and shared with the Inbox; a failed calls or searches read is null and the rest stands", async () => {
  const ctx = dayCtx(dayTables(), { rpcs: dayDoors });
  const rc = turnIn(ctx);
  const r = await kernel.load(rc, today, undefined);
  assert.deepEqual(Object.keys(r.data), [
    "metrics",
    "conversations",
    "escalations",
    "calls",
    "searches",
    "runs",
    "heldThreads",
  ]);
  assert.deepEqual(
    r.data.heldThreads.map((c) => c.id),
    [OUTSIDE],
    "the thread of the hold past the hundred, read by id: Ask's Today counts it as the badge does (S7-7)",
  );
  assert.deepEqual(r.data.metrics, SUMMARY);
  assert.deepEqual(
    r.data.conversations.map((c) => c.id),
    Array.from({ length: 100 }, (_, i) => uuid(i)),
    "the newest hundred, as the Today page reads them: the quiet thread that waits is read apart (heldThreads)",
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
  assert.deepEqual(
    reads(),
    [2, 2, 1, 1],
    "Today alone: the hundred and the held thread by id, the escalations in their two halves, the calls, the searches",
  );
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
    [2, 2, 1, 1],
    "the hundred, the held thread, the escalations and the calls shared: the Inbox reads nothing again",
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
  assert.deepEqual(callLines, [{ error: "Error: permission denied" }]);

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
  assert.deepEqual(searchLines, [{ error: "Error: down" }]);
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

test("what a message cost to send is never Ask's to read: the thread reader, the Inbox reader and the thread tool carry each message's meta as the page sends it, without it", async () => {
  const pricing = { billable: true, pricing_model: "PMP", category: "utility", type: "regular" };
  const tbls = threadTables();
  tbls.messages[1] = { ...tbls.messages[1], meta: { source: "ai", handled: "ai", pricing } };
  const metas = (messages) => messages.map((m) => m.meta);

  const one = await kernel.load(turnIn(dayCtx(tbls), B), oneThread, { id: C1, before: null });
  assert.deepEqual(metas(one.data.messages), [null, { source: "ai", handled: "ai" }], "the thread reader");
  const route = await threadRoute.GET.run(req(), routeCtx(tbls, C1));
  assert.deepEqual(route, one.data, "and the route is the reader");

  const listed = await kernel.load(turnIn(dayCtx(tbls), B), conversations, { ids: [C1] });
  assert.deepEqual(
    metas(listed.data.conversations[0].messages),
    [null, { source: "ai", handled: "ai" }],
    "the Inbox reader",
  );

  const tc = newToolContext(dayCtx(tbls), B, "operator", "America/New_York", new Date());
  const said = (await runTool(tc, { name: "inbox", input: { action: "thread", conversation_id: C1 } })).result;
  assert.ok(JSON.parse(said).messages.length > 0, "the tool read the thread");
  for (const [name, out] of [
    ["thread reader", one],
    ["Inbox reader", listed],
    ["thread tool", said],
  ])
    assert.ok(
      !JSON.stringify(out).includes("pricing"),
      `REGRESSION: Ask's ${name} was handed what a message cost to send`,
    );
  assert.deepEqual(tbls.messages[1].meta.pricing, pricing, "the row itself is untouched");
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
/**
 * A request for the person `id` names, over `tbls`, `faults` failing a read: people_list answers harbor's P1 alone.
 * `opts` are the fake's (maxRows: PostgREST's cap on every select).
 */
const personCtx = (tbls, id, faults = {}, opts = {}) => ({
  supabase: fakeDb(
    tbls,
    faults,
    { people_list: (a) => (a.p_tenant_id === A && a.p_contact_id === P1 ? [personRow(P1)] : []) },
    opts,
  ),
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
  "sequences",
  "lead",
  "doubts",
  "deals",
  "deals_on",
  "deal_pace",
  "services",
  "consult_first",
  "added",
  // Since #1566 (decision 0052): the business they work at, and the signers of their replies still offered or taken.
  "business",
  "signers",
];
/**
 * Every read GET contacts/:id made at origin/main (fad8b7ea) for one person with threads, by table, and since 00344 the
 * open doubts naming them (person_doubts, decision 0034 step 4), read in the same round.
 */
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
  "sequence_sends.select": 1,
  // The sequences they are in now (decision 0060, S5); with none, their names are never asked.
  "sequence_enrollments.select": 1,
  "person_doubts.select": 1,
  "person_notes.select": 1,
  // The signers of their replies (db signersOf, decision 0052, #1566).
  "sequence_replies.select": 1,
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
    order.slice(order.indexOf("messages")).sort(),
    ["decisions", "escalations", "messages"],
    "every other read was asked for before the threads' own: the decisions on them and on the person ride in the same read, one, and the order they start in is the database's business",
  );
  const columns = (table) =>
    selects(ctx, table)
      .map((q) => q.columns)
      .sort();
  assert.deepEqual(
    columns("tenant_config"),
    ["tenant_id, config, version, updated_at, updated_by", "tenant_id, config, version, updated_at, updated_by"],
    "the calendar's own lookup, and the config through its reader: each the row as the server reads it for a member (workspace/config-row.ts)",
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

test("REGRESSION (the wiring's second audit, S5-3): a person combined into another since is the 404 that names the record kept, through a later combine, and never one erased or another workspace's", async () => {
  const OLD = "44444444-4444-4444-8444-444444444444";
  const tbls = personTables({ threads: true });
  const combined = (id, into, over = {}) => ({
    id,
    tenant_id: A,
    phone_e164: null,
    display_name: "Ada",
    erased_at: null,
    marketing_consent: null,
    notes: null,
    merged_into_contact_id: into,
    ...over,
  });
  // OLD was combined into P2, and P2 into P1 since: OLD's address opens P1, the person both became.
  tbls.contacts.push(combined(P2, P1), combined(OLD, P2));
  const keptIs = (to) => (e) => {
    notHere(e);
    assert.deepEqual(e.details, to === null ? undefined : { moved_to: to }, `the record kept: ${to}`);
    return true;
  };
  await assert.rejects(kernel.load(turnIn(personCtx(tbls, P2)), onePerson, { id: P2 }), keptIs(P1));
  await assert.rejects(kernel.load(turnIn(personCtx(tbls, OLD)), onePerson, { id: OLD }), keptIs(P1));
  await assert.rejects(personRoute.GET.run(req(`?workspace=${A}`), personCtx(tbls, OLD)), keptIs(P1));
  // Another workspace asking for them is told nothing of where they went.
  await assert.rejects(kernel.load(turnIn(personCtx(tbls, P2), B), onePerson, { id: P2 }), keptIs(null));
  // The record kept was erased since: nobody to open.
  const erased = personTables({ threads: true });
  erased.contacts[0].erased_at = "2026-08-10T00:00:00Z";
  erased.contacts.push(combined(P2, P1));
  await assert.rejects(kernel.load(turnIn(personCtx(erased, P2)), onePerson, { id: P2 }), keptIs(null));
  // A combine that comes back on itself is followed no further than five records.
  const loop = personTables({ threads: true });
  loop.contacts.push(combined(P2, OLD), combined(OLD, P2));
  await assert.rejects(kernel.load(turnIn(personCtx(loop, P2)), onePerson, { id: P2 }), keptIs(null));
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

test("a person's page holds their newest 2,000 messages, as it asks: PostgREST answers a thousand rows to a select, so the reader pages them newest first, the id breaking a moment's ties, and one that arrives between the pages is held once; past 2,000 the oldest drop, and the read says it stopped", async () => {
  // `n` messages across their two threads, two a minute, m0000 the oldest: a moment is shared, so only the id orders it.
  const heavy = (n) => {
    const tbls = personTables({ threads: true });
    const first = Date.parse("2026-08-01T00:00:00Z");
    tbls.messages = Array.from({ length: n }, (_, i) => {
      const at = new Date(first + Math.floor(i / 2) * 60_000).toISOString();
      return message(`m${String(i).padStart(4, "0")}`, i % 2 ? C2 : C1, A, { created_at: at, channel_ts: at });
    });
    return tbls;
  };
  const held = (p) => p.conversations.flatMap((c) => c.messages.map((m) => m.id)).sort();
  const pages = (ctx) =>
    selects(ctx, "messages").map((q) => [q.range, q.orders.map((o) => `${o.col}${o.desc ? " desc" : ""}`)]);
  const NEWEST_FIRST = ["created_at desc", "id desc"];

  // 1,500: every one, in two pages, where `.limit(2000)` was answered with the newest 1,000.
  const some = heavy(1500);
  const ctx = personCtx(some, P1, {}, { maxRows: 1000 });
  const r = await kernel.load(turnIn(ctx), onePerson, { id: P1 });
  assert.deepEqual(held(r.data.person), some.messages.map((m) => m.id).sort(), "all 1,500");
  assert.deepEqual(pages(ctx), [
    [[0, 999], NEWEST_FIRST],
    [[1000, 1999], NEWEST_FIRST],
  ]);
  for (const c of r.data.person.conversations) {
    const ids = c.messages.map((m) => m.id);
    assert.deepEqual(ids, [...ids].sort(), "each thread's oldest first, as the page draws it");
  }
  const timeline = toPersonVM(r.data.person, "America/New_York", new Date(), USER).timeline.map((i) => i.id);
  assert.ok(timeline.includes("m-m0000"), "the page's timeline reaches their first message");
  const page = await personRoute.GET.run(req(`?workspace=${A}`), personCtx(some, P1, {}, { maxRows: 1000 }));
  assert.deepEqual(held(page.person), held(r.data.person), "and GET contacts/:id answers the same");

  // A message that arrives between the two pages moves the rest down a place, so the second opens with the first's
  // last: the page holds it once, and the new one waits for the next read.
  const moving = heavy(1500);
  const before = moving.messages.map((m) => m.id).sort();
  const live = personCtx(moving, P1, {}, { maxRows: 1000 });
  const from = live.supabase.from;
  let asked = 0;
  live.supabase.from = (table) => {
    if (table === "messages" && ++asked === 2) {
      moving.messages.push(message("m-new", C1, A, { created_at: "2026-08-02T00:00:00Z" }));
    }
    return from(table);
  };
  const r2 = await kernel.load(turnIn(live), onePerson, { id: P1 });
  assert.equal(selects(live, "messages").length, 2);
  assert.deepEqual(held(r2.data.person), before, "each of the 1,500 once");

  // 2,500: the newest 2,000, the oldest 500 left out, and one line that says the read stopped at its cap.
  const many = heavy(2500);
  const capped = personCtx(many, P1, {}, { maxRows: 1000 });
  const { result, lines } = await logged("paged_read_capped", () => kernel.load(turnIn(capped), onePerson, { id: P1 }));
  assert.deepEqual(
    held(result.data.person),
    many.messages
      .slice(500)
      .map((m) => m.id)
      .sort(),
    "the newest 2,000",
  );
  assert.deepEqual(pages(capped), [
    [[0, 999], NEWEST_FIRST],
    [[1000, 1999], NEWEST_FIRST],
  ]);
  assert.deepEqual(lines, [{ what: "person messages", cap: 2000 }]);

  // A person with a thread's worth: one page, as before.
  const few = personCtx(heavy(40), P1, {}, { maxRows: 1000 });
  await kernel.load(turnIn(few), onePerson, { id: P1 });
  assert.deepEqual(pages(few), [[[0, 999], NEWEST_FIRST]]);
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
    const page = await reportsRoute.GET.run(req(`?period=${days}d&workspace=${A}`), worldCtx(w));
    const r = await kernel.load(turnIn(worldCtx(w)), reportReader, { days, end: null });
    assert.deepEqual(r.data, page, "the route's payload");
    assert.equal(JSON.stringify(r.data), JSON.stringify(page), "byte for byte");
    assert.deepEqual(
      Object.keys(r.data),
      ["report", "booking", "deals", "profile"],
      "the keys in the order the route answered them",
    );
    assert.deepEqual(r.rows, [{ kind: "page", id: "reports", route: "reports", label: `Reports, ${days} days` }]);
  }
  // What ask-routes asserts of the route, of the reader.
  const week = await kernel.load(turnIn(worldCtx(presetsWorld())), reportReader, { days: 7, end: null });
  assert.deepEqual(week.data.report, { days: 7, tenant: A });
  assert.deepEqual(week.data.booking, { calendar: "none", days: 7, asked: 0, booked: 0 }, "no calendar, said as none");
  const on = await kernel.load(turnIn(worldCtx(dealsWorld("proposal"))), reportReader, { days: 30, end: null });
  assert.deepEqual([on.data.deals.any, on.data.deals.clients, on.data.deals.monthly_cents], [true, 1, 250_000]);
  assert.deepEqual(on.data.deals.sources, [{ came_from: "lead", count: 1 }], "the new client's source, from People");
  for (const sellsBy of ["booking", null, undefined]) {
    const off = await kernel.load(turnIn(worldCtx(dealsWorld(sellsBy))), reportReader, { days: 30, end: null });
    assert.equal(off.data.deals.any, false, `${sellsBy}: a deal on file switches nothing`);
  }
});

test("the Reports row Ask cites names its period as the page does: one day is '1 day', never '1 days' (Month on the 1st)", async () => {
  for (const [days, label] of [
    [1, "Reports, 1 day"],
    [5, "Reports, 5 days"],
  ]) {
    const r = await kernel.load(turnIn(worldCtx(presetsWorld())), reportReader, { days, end: null });
    assert.deepEqual(r.rows, [{ kind: "page", id: "reports", route: "reports", label }], `${days}: ${label}`);
  }
});

test("the report reader hands the workspace's hours and closures beside the report, from the config the booking line read; none said, null", async () => {
  const hours = { mon: { open: "09:30", close: "18:00" } };
  const closures = [{ date: "2026-09-18" }];
  const kept = presetsWorld();
  // A brain the parser reads whole: business_name, system_prompt and fallbacks are required of it, and a config it
  // refuses says no profile at all.
  const brain = {
    business_name: "Harbor",
    system_prompt: "Answer as the front desk of Harbor: brief, warm, and never a price or a booking.",
    fallbacks: { greeting: "g", error: "e", non_text: "n" },
    profile: { hours, closures },
  };
  kept.tables.tenant_config = [{ tenant_id: A, config: { brain }, version: 1 }];
  const ctx = worldCtx(kept);
  const r = await kernel.load(turnIn(ctx), reportReader, { days: 30, end: null });
  assert.deepEqual(r.data.profile, { hours, closures });
  assert.equal(
    asked(ctx).filter((q) => q === "tenant_config.select").length,
    1,
    "the config is read once in the turn: the booking line's read, not a second",
  );
  const none = await kernel.load(turnIn(worldCtx(presetsWorld())), reportReader, { days: 30, end: null });
  assert.equal(
    none.data.profile,
    null,
    "no row: the profile could not be read, and the page says nothing about closed",
  );
  // A config the parser refuses could not be read either. One it reads whole that keeps no hours is an empty profile:
  // that is how the page knows the workspace has not set them.
  const refused = presetsWorld();
  refused.tables.tenant_config = [{ tenant_id: A, config: { brain: { profile: { hours, closures } } }, version: 1 }];
  assert.equal(
    (await kernel.load(turnIn(worldCtx(refused)), reportReader, { days: 30, end: null })).data.profile,
    null,
  );
  for (const [profile, kept] of [
    [{}, {}],
    [{ closures }, { closures }],
  ]) {
    const w = presetsWorld();
    w.tables.tenant_config = [{ tenant_id: A, config: { brain: { ...brain, profile } }, version: 1 }];
    const said = await kernel.load(turnIn(worldCtx(w)), reportReader, { days: 30, end: null });
    assert.deepEqual(said.data.profile, kept);
  }
});

/** report_series's answer for a period: no day counted, `replies` each reply the receptionist sent (00304 gives each its hold). */
const replyReport =
  (replies, extra = {}) =>
  (a) => ({
    timezone: "America/New_York",
    days: a.p_days,
    span_days: a.p_days * 2,
    today: "2026-09-14",
    series: [],
    reasons: {},
    reply_seconds: replies.map((r) => r.s),
    sentiments: {},
    voicemail: 0,
    replies,
    ...extra,
  });
const sixtyHeld = Array.from({ length: 14 }, () => ({ day: "2026-09-14", s: 63, hold: 60 }));
/** What Ask's report tool says over a world whose report_series answers `payload`, as a member of harbor. */
async function askReport(payload) {
  const w = presetsWorld();
  w.rpcs.report_series = payload;
  const t = newToolContext(worldCtx(w), A, "viewer", "America/New_York", new Date("2026-09-14T14:00:00Z"));
  const out = await runTool(t, { name: "report", input: { days: 7 } });
  assert.equal(out.isError, false);
  return JSON.parse(out.result);
}
const replyTileOf = (said) => said.tiles.find((x) => x.label === "Median reply time");

test("Ask's report says the hold the owner set, as the page does: the reply time includes it, and reply_time.hold splits the replies against it", async () => {
  const said = await askReport(replyReport(sixtyHeld));
  assert.deepEqual(said.reply_time, {
    median: "1m 3s",
    p90: "1m 3s",
    count: 14,
    hold: { seconds: 60, label: "1-minute", atEnd: 14, unheld: 0, later: 0, laterMost: null },
  });
  assert.equal(replyTileOf(said).meta, "slowest tenth 1m 3s · 14 replies · includes your 1-minute hold");
});

test("Ask's report with no hold in the payload says what it said before: hold null, and the tile's old line", async () => {
  const unheld = sixtyHeld.map(({ day, s }) => ({ day, s }));
  const said = await askReport(replyReport(unheld));
  assert.equal(said.reply_time.hold, null);
  assert.equal(replyTileOf(said).meta, "slowest tenth 1m 3s · 14 replies");
  // A report from before the replies were listed at all.
  const v2 = await askReport(replyReport([], { replies: undefined, reply_seconds: [63, 63] }));
  assert.equal(v2.reply_time.hold, null);
  assert.equal(replyTileOf(v2).meta, "slowest tenth 1m 3s · 2 replies");
});

test("the report reader's profile reaches the view model: the closed count with hours said, the door with none, nothing with a profile that could not be read", async () => {
  const hours = { mon: { open: "09:30", close: "18:00" } };
  const brain = {
    business_name: "Harbor",
    system_prompt: "Answer as the front desk of Harbor: brief, warm, and never a price or a booking.",
    fallbacks: { greeting: "g", error: "e", non_text: "n" },
  };
  // Monday 14 Sep 2026: 9:15 is before opening, 9:30 is open, 21:00 is after closing.
  const arrivals = [
    { d: "2026-09-14", q: 37, n: 1 },
    { d: "2026-09-14", q: 38, n: 2 },
    { d: "2026-09-14", q: 84, n: 4 },
  ];
  const read = async (config) => {
    const w = presetsWorld();
    w.rpcs.report_series = replyReport([], { arrivals, hours: Array.from({ length: 7 }, () => Array(24).fill(0)) });
    if (config) w.tables.tenant_config = [{ tenant_id: A, config, version: 1 }];
    const r = (await kernel.load(turnIn(worldCtx(w)), reportReader, { days: 30, end: null })).data;
    return toReportVM(r.report, { profile: r.profile });
  };
  const said = await read({ brain: { ...brain, profile: { hours } } });
  assert.deepEqual([said.hours?.closed, said.hoursUnset], [5, false]);
  const unset = await read({ brain });
  assert.deepEqual([unset.hours?.closed ?? null, unset.hoursUnset], [null, true]);
  assert.deepEqual(
    reportFacts(unset, null).map((f) => f.id),
    ["hours"],
    "the door to set them, and nothing else to say of a quiet period",
  );
  const unread = await read(undefined);
  assert.deepEqual([unread.hours?.closed ?? null, unread.hoursUnset], [null, false]);
});

/**
 * What a report asked, each read once, whatever order the database stand-in heard them in: the series, the booking
 * line and the deals are asked for together (readers/report.ts, 9 Oct 2026: one after the other they were the slowest
 * read the dashboard makes), so only the first has a place of its own, and it is the series.
 */
const readTogether = (list) => [...list].sort();

test("GET reports through its reader asks what it asked at origin/main, each read once, the series first: People once, with their reply modes, for the booking line and the deals alike; the booking line's calendar zone and settings, now through their readers; how the workspace's customers buy, once, through its reader; the deals, and only where deals are on -- and a turn that holds the zone, the settings and sells_by reads none of them again", async () => {
  const REPORT_READS = [
    "rpc:report_series",
    // Everyone, read once for the whole report: the booking line's read, which the deals take their sources from.
    "rpc:people_list",
    "policies.select",
    // The booking line's calendar: its zone and its settings, through the facts and config readers, where its own
    // lookup read them at origin/main.
    "tenants.select",
    "tenant_config.select",
    // This workspace has no settings row, so the door is asked after the table: from 00366 a member who is not the
    // owner reads the row only there (workspace/config-row.ts).
    "rpc:tenant_config_read",
    // How the workspace's customers buy, after the booking line, then the deals.
    "tenants.select",
    "deals.select",
  ];
  const routed = worldCtx(dealsWorld("proposal"));
  await reportsRoute.GET.run(req(`?workspace=${A}`), routed);
  assert.deepEqual(asked(routed).slice(0, 2), ["memberships.select", "rpc:report_series"], "the door, then the series");
  assert.deepEqual(readTogether(asked(routed).slice(1)), readTogether(REPORT_READS), "and each of the reads, once");
  const ctx = worldCtx(dealsWorld("proposal"));
  await kernel.load(turnIn(ctx), reportReader, { days: 30, end: null });
  assert.equal(asked(ctx)[0], "rpc:report_series", "the series is asked first");
  assert.deepEqual(readTogether(asked(ctx)), readTogether(REPORT_READS));
  assert.deepEqual(
    readTogether(selects(ctx, "tenants").map((q) => q.columns)),
    ["name, timezone", "sells_by"],
    "the calendar's zone and sells_by, each once",
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
  await kernel.load(turn, reportReader, { days: 30, end: null });
  assert.deepEqual(
    readTogether(asked(turn.ctx).slice(held)),
    readTogether(["rpc:report_series", "rpc:people_list", "policies.select", "deals.select"]),
    "the series, everyone and the deals: the tenant, its settings and sells_by were the turn's",
  );
  // Where the workspace's customers book, the deals are not even read.
  const off = worldCtx(dealsWorld("booking"));
  await kernel.load(turnIn(off), reportReader, { days: 30, end: null });
  assert.deepEqual(readTogether(asked(off)), readTogether(REPORT_READS.slice(0, -1)));
});

test("the report over days that ended before today: the series is asked to their last day, the deals are those proposed in those days, and the booking line is not counted; on a database that cannot read such days yet it is refused in words, where days that end today read as they always did", async () => {
  const day = (k) => new Date(Date.now() - k * 86_400_000).toISOString().slice(0, 10);
  const seriesAsked = (ctx) => ctx.supabase.seen.filter((q) => q.rpc === "report_series").map((q) => q.args);
  // Seven days that hold the proposal of five days ago (8 to 2 days ago).
  const ctx = worldCtx(dealsWorld("proposal"));
  const holding = (await kernel.load(turnIn(ctx), reportReader, { days: 7, end: day(2) })).data;
  assert.deepEqual(seriesAsked(ctx), [{ p_tenant_id: A, p_days: 7, p_end: day(2) }]);
  assert.deepEqual(
    holding.booking,
    { calendar: "ended", days: 7, asked: 0, booked: 0 },
    "the booking line follows people as they stand today: for days that ended it is not counted at all",
  );
  assert.deepEqual([holding.deals.sent, holding.deals.won, holding.deals.clients], [1, 1, 1]);
  // Seven days that ended before it went out (20 to 14 days ago): the proposal is not theirs, the client it made is
  // still among the clients now, which are counted whenever they began.
  const before = (await kernel.load(turnIn(worldCtx(dealsWorld("proposal"))), reportReader, { days: 7, end: day(14) }))
    .data;
  assert.deepEqual(
    [before.deals.sent, before.deals.won, before.deals.clients],
    [0, 0, 1],
    "REGRESSION: a window that ended two weeks ago counted every proposal sent since its first day",
  );
  // The route answers its reader's payload for a first and a last day, as it does for a period.
  const routed = worldCtx(dealsWorld("proposal"));
  const page = await reportsRoute.GET.run(req(`?from=${day(8)}&to=${day(2)}&workspace=${A}`), routed);
  assert.deepEqual(seriesAsked(routed), [{ p_tenant_id: A, p_days: 7, p_end: day(2) }]);
  assert.deepEqual(page, holding, "the route's payload is the reader's");

  // A database without 00359 has no function that takes a last day: PostgREST refuses the call by its arguments.
  const gone = (a) => {
    if (a.p_end === undefined) return series(a);
    throw Object.assign(new Error("Could not find the function public.report_series(p_days, p_end, p_tenant_id)"), {
      code: "PGRST202",
    });
  };
  const old = () => worldCtx({ ...presetsWorld(), rpcs: { ...presetsWorld().rpcs, report_series: gone } });
  await assert.rejects(
    kernel.load(turnIn(old()), reportReader, { days: 7, end: day(2) }),
    (e) =>
      e.code === "validation" &&
      e.status === 400 &&
      e.message === "Picked days cannot be read yet. Pick a period that ends today.",
    "said in words, never as some other days and never as a failure of the workspace",
  );
  assert.equal(
    (await kernel.load(turnIn(old()), reportReader, { days: 7, end: null })).data.report.days,
    7,
    "either deploy order works: a period names no day, and reads as it always did",
  );
});

test("a report the function will not answer is GET reports' 404, in its sentence, whatever was asked beside the series; the booking line is never fatal: a calendar lookup that fails is null, said once in the log, and the series and the deals stand", async () => {
  const refused = { ...presetsWorld(), rpcs: { ...presetsWorld().rpcs, report_series: () => ({ error: "no" }) } };
  const ctx = worldCtx(refused);
  await assert.rejects(kernel.load(turnIn(ctx), reportReader, { days: 30, end: null }), noReport);
  // The series is asked first and its answer alone decides there is a report: the booking line and the deals are asked
  // for beside it (as the headline's are), and what they found is answered to nobody.
  assert.equal(asked(ctx)[0], "rpc:report_series", "the series first");
  await assert.rejects(reportsRoute.GET.run(req(`?workspace=${A}`), worldCtx(refused)), noReport);
  const empty = { ...presetsWorld(), rpcs: { ...presetsWorld().rpcs, report_series: () => null } };
  await assert.rejects(kernel.load(turnIn(worldCtx(empty)), reportReader, { days: 30, end: null }), noReport);

  const down = { "tenant_config.select": { message: "config down" } };
  const { result: page, lines } = await logged("booking_report_failed", () =>
    reportsRoute.GET.run(req(`?workspace=${A}`), worldCtx(dealsWorld("proposal"), down)),
  );
  assert.deepEqual(Object.keys(page), ["report", "booking", "deals", "profile"]);
  assert.equal(page.booking, null, "the line, and only the line, is lost");
  assert.deepEqual([page.report.days, page.deals.any, page.deals.clients], [30, true, 1]);
  assert.deepEqual(
    lines,
    // The settings come through the config reader now (getTenantConfig), which names itself in its failure.
    [{ tenant_id: A, error: "getTenantConfig: config down" }],
  );
  const { result: r } = await logged("booking_report_failed", () =>
    kernel.load(turnIn(worldCtx(dealsWorld("proposal"), down)), reportReader, { days: 30, end: null }),
  );
  assert.deepEqual(r.data, page, "the reader's payload is the route's");
});

test("the campaigns' report, for Ask and for the page: GET reports/campaigns answers its reader's payload over ask-routes' fixture, for each preset -- the function's series alone, and no row a citation names; a report it will not answer is the route's 404", async () => {
  const w = presetsWorld();
  for (const days of [7, 30, 90]) {
    const page = await campaignsRoute.GET.run(req(`?period=${days}d&workspace=${A}`), worldCtx(w));
    const ctx = worldCtx(w);
    const r = await kernel.load(turnIn(ctx), campaignReport, { days, end: null });
    assert.deepEqual(r.data, page, "the route's payload");
    assert.deepEqual(r.data, { report: { days } });
    assert.deepEqual(r.rows, []);
    assert.deepEqual(ctx.supabase.seen, [{ rpc: "campaign_series", args: { p_tenant_id: A, p_days: days } }]);
  }
  // Kept a minute across turns that keep (every Ask turn on Campaigns reads it for the page's rows; the moment spec, A6);
  // a route, which keeps nothing, reads it on each request.
  const calls = (rc) => rc.ctx.supabase.seen.filter((q) => q.rpc === "campaign_series").length;
  const keeps = () => kernel.readerContext(worldCtx(w), { tenantId: A, role: "viewer" }, undefined, { keep: true });
  const [first, next, route] = [keeps(), keeps(), turnIn(worldCtx(w))];
  for (const rc of [first, next, route]) await kernel.load(rc, campaignReport, { days: 30, end: null });
  assert.deepEqual(
    [first, next, route].map(calls),
    [1, 0, 1],
    "the next turn's came from the kept read; the route read it",
  );
  await assert.rejects(kernel.load(turnIn(worldCtx(w), B), campaignReport, { days: 30, end: null }), noReport);
  await assert.rejects(campaignsRoute.GET.run(req(`?workspace=${B}`), worldCtx(w)), noReport);
});

/**
 * The reviews' report's world: Harbor Studio on Google, in Auckland (thirteen hours ahead of UTC in October, so its day
 * and UTC's can differ), its Business Profile synced. `a` is a profile review with a reply the receptionist wrote, `b` one
 * that waits, `c` one of the five the public listing shows.
 */
const REVIEW_A = "ffffffff-ffff-4fff-8fff-ffffffffff01";
const REVIEW_B = "ffffffff-ffff-4fff-8fff-ffffffffff02";
const REVIEW_C = "ffffffff-ffff-4fff-8fff-ffffffffff03";
const googleRow = (id, published, over = {}) =>
  rows.googleReview({
    id,
    tenant_id: A,
    review_id: `g-${id.slice(-2)}`,
    rating: 5,
    author: "Ana P.",
    body: "Fast, careful, and on time.",
    published_at: published,
    first_seen_at: published,
    last_seen_at: published,
    ...over,
  });
/** What reviews_ledger answers for a workspace with the profile's two reviews: the database counts in SQL (google-reviews-ledger.db.test.mjs holds the function), the day in Auckland, where 14:00 UTC on 6 October is already the 7th. */
const waitingRow = () => {
  const {
    tenant_id: _tenant,
    last_seen_at: _seen,
    ...drawn
  } = googleRow(REVIEW_B, "2026-10-05T09:00:00Z", { rating: 2 });
  return { ...drawn, held: null };
};
const reviewsLedgerOf = (args, { listing = true } = {}) =>
  listing
    ? {
        timezone: "Pacific/Auckland",
        today: "2026-10-07",
        days: args.p_days,
        on_record: { profile: 2, places: 1, complete: true },
        written: [
          { id: REVIEW_A, d: "2026-10-04", rating: 5, replied: true, secs: 21_600, by: "receptionist" },
          { id: REVIEW_B, d: "2026-10-06", rating: 2, replied: false, secs: null, by: null },
        ],
        waiting_total: 1,
        waiting: [waitingRow()],
      }
    : {
        timezone: "Pacific/Auckland",
        today: "2026-10-07",
        days: args.p_days,
        on_record: { profile: 0, places: 0, complete: false },
        written: [],
        waiting_total: 0,
        waiting: [],
      };
const reviewsWorld = ({ listing = true, synced = true } = {}) => ({
  tables: {
    memberships: reportMembers(),
    tenants: [{ id: A, slug: "harbor", name: "Harbor Studio", timezone: "Pacific/Auckland" }],
    tenant_config: [],
    policies: [
      {
        id: "p-reviews",
        tenant_id: A,
        class: "reviews",
        mode: "auto",
        subject_type: null,
        subject_id: null,
        limits: {},
        updated_at: "2026-10-01T00:00:00Z",
      },
    ],
    google_listings: listing
      ? [
          rows.googleListing({
            tenant_id: A,
            address: "1 Dock Street",
            maps_uri: "https://maps.example.com/harbor",
            business_status: "OPERATIONAL",
            rating: 4.8,
            review_count: 213,
            linked_at: "2026-08-01T12:00:00Z",
            checked_at: "2026-10-06T12:00:00Z",
          }),
        ]
      : [],
    google_connections: listing
      ? [
          rows.googleConnection({
            tenant_id: A,
            google_email: "owner@example.com",
            account_title: "Harbor Studio",
            location_name: "locations/1",
            location_title: "Harbor Studio",
            connected_at: "2026-08-01T12:00:00Z",
            last_synced_at: synced ? "2026-10-06T12:00:00Z" : null,
          }),
        ]
      : [],
    // A review and a day's reading hang off the listing (a foreign key that cascades): none without one.
    google_reviews: listing
      ? [
          googleRow(REVIEW_A, "2026-10-03T14:00:00Z", {
            reply_text: "Thank you, Ana!",
            replied_at: "2026-10-03T20:00:00Z",
          }),
          googleRow(REVIEW_B, "2026-10-05T09:00:00Z", { rating: 2 }),
          googleRow(REVIEW_C, "2026-10-04T09:00:00Z", { origin: "places" }),
        ]
      : [],
    // The day before the machine's own, so the 92 days the Google read keeps always hold it.
    google_listing_days: listing
      ? [
          {
            tenant_id: A,
            day: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
            rating: 4.8,
            review_count: 213,
          },
        ]
      : [],
    events: [],
  },
  rpcs: { reviews_ledger: (args) => reviewsLedgerOf(args, { listing }) },
});

test("the reviews' report, for Ask and for the page: GET reports/reviews answers its reader's payload, key for key and byte for byte, for each preset -- Google as GET google reads it and the ledger the database counted beside it, no row of its own", async () => {
  const w = reviewsWorld();
  const { ready: _ready, ...google } = (await googleRoute.GET.run(req(`?workspace=${A}`), worldCtx(w))).google;
  for (const [period, days] of [
    ["7d", 7],
    ["30d", 30],
    ["90d", 90],
  ]) {
    const page = await reviewsRoute.GET.run(req(`?period=${period}&workspace=${A}`), worldCtx(w));
    const r = await kernel.load(turnIn(worldCtx(w)), reviewsReport, { days, end: null });
    assert.equal(JSON.stringify(r.data), JSON.stringify(page), "the route's payload, byte for byte");
    assert.deepEqual(Object.keys(page), ["timezone", "today", "days", "google", "readable", "ledger"]);
    assert.deepEqual([page.timezone, page.days], ["Pacific/Auckland", days]);
    assert.equal(
      JSON.stringify(page.google),
      JSON.stringify(google),
      "the one Google read: GET google's bytes, less what this deployment can do",
    );
    assert.equal(page.readable, true, "a listing is kept");
    assert.deepEqual(r.rows, [], "drawn on the Reports page, whose row the report names");
  }
  const month = await reviewsRoute.GET.run(req(`?period=month&workspace=${A}`), worldCtx(w));
  assert.ok(month.days >= 1 && month.days <= 31, "Month is the days since the 1st in the workspace's own zone");
  await assert.rejects(
    reviewsRoute.GET.run(req(`?period=14d&workspace=${A}`), worldCtx(w)),
    (e) => e.status === 400,
    "a period that is none of the four is refused at the door",
  );
});

test("the reviews' ledger is the database's, asked once for the days and beside Google, whose one read serves every period of a turn: the window is the database's day, and the dashboard reads no review of the period itself", async () => {
  const w = reviewsWorld();
  const ctx = worldCtx(w);
  // 14:00 UTC on 6 October is 03:00 on the 7th in Auckland, which the database says.
  const clock = new Date("2026-10-06T14:00:00Z");
  const turn = kernel.readerContext(ctx, { tenantId: A, role: "viewer" }, clock);
  const r = await kernel.load(turn, reviewsReport, { days: 30, end: null });
  assert.deepEqual([r.data.timezone, r.data.today, r.data.days], ["Pacific/Auckland", "2026-10-07", 30]);
  assert.deepEqual(r.data.ledger, reviewsLedgerOf({ p_days: 30 }), "the database's answer, as it answered");
  assert.deepEqual(
    ctx.supabase.seen.filter((q) => q.rpc),
    [{ rpc: "reviews_ledger", args: { p_tenant_id: A, p_days: 30 } }],
  );
  assert.deepEqual(
    [r.data.google.listing.name, r.data.google.reply_mode, r.data.google.reviews.length],
    ["Harbor Studio", "auto", 3],
    "Google as GET google reads it: the Autonomy row for reviews rides along",
  );
  assert.equal(r.data.ledger.waiting[0].id, REVIEW_B);
  assert.deepEqual(
    asked(ctx).sort(),
    [
      "google_connections.select",
      "google_listing_days.select",
      "google_listings.select",
      "google_reviews.select",
      "policies.select",
      "rpc:reviews_ledger",
    ],
    "the lens is six requests, made at once: the four of Google, the Autonomy row and the ledger",
  );
  assert.equal(
    selects(ctx, "google_reviews").length,
    1,
    "the newest twenty, once; the period's reviews are the database's",
  );
  assert.deepEqual(
    asked(ctx).filter((q) => q.startsWith("events") || q === "tenants.select"),
    [],
    "no event and no zone is read by the dashboard: the function says both",
  );
  // The report at three periods in one turn (Ask's report tool) reads Google once.
  for (const days of [7, 90]) await kernel.load(turn, reviewsReport, { days, end: null });
  for (const table of ["google_listings", "google_connections", "google_reviews", "google_listing_days", "policies"])
    assert.equal(selects(ctx, table).length, 1, `${table}: read once for the turn`);
  assert.deepEqual(
    ctx.supabase.seen.filter((q) => q.rpc).map((q) => q.args.p_days),
    [30, 7, 90],
    "the ledger is of the days asked",
  );
});

test("the reviews' report keeps no ledger where no profile has synced: the five public reviews are no record, and the day is the turn's", async () => {
  const w = reviewsWorld({ synced: false });
  const ctx = worldCtx(w);
  const clock = new Date("2026-10-06T14:00:00Z");
  const r = await kernel.load(kernel.readerContext(ctx, { tenantId: A, role: "viewer" }, clock), reviewsReport, {
    days: 30,
    end: null,
  });
  assert.equal(r.data.ledger, null);
  assert.deepEqual([r.data.timezone, r.data.today, r.data.days], ["Pacific/Auckland", "2026-10-07", 30]);
  assert.equal(r.data.readable, true);
  assert.equal(asked(ctx).filter((q) => q === "tenants.select").length, 1, "the zone is the turn's, read once");
});

test("the reviews' report of a workspace with no listing answers `ledger: null`; a ledger that cannot be read is the route's failure and a function with no workspace is its 404 -- no listing, could not read and not found are three answers", async () => {
  const none = reviewsWorld({ listing: false });
  const ctx = worldCtx(none);
  const r = await kernel.load(turnIn(ctx), reviewsReport, { days: 30, end: null });
  assert.equal(r.data.ledger, null);
  assert.deepEqual([r.data.google.listing, r.data.google.reviews, r.data.google.days], [null, [], []]);
  assert.equal(r.data.readable, false, "none is kept and this deployment can look none up");
  assert.deepEqual(
    asked(ctx).filter((q) => q.startsWith("events")),
    [],
    "no event is read",
  );
  assert.deepEqual(await reviewsRoute.GET.run(req(`?workspace=${A}`), worldCtx(none)), r.data);

  const down = {
    ...reviewsWorld(),
    rpcs: {
      reviews_ledger: () => {
        throw new Error("connection refused");
      },
    },
  };
  const failed = /reviews_ledger: connection refused/;
  await assert.rejects(kernel.load(turnIn(worldCtx(down)), reviewsReport, { days: 30, end: null }), failed);
  await assert.rejects(reviewsRoute.GET.run(req(`?workspace=${A}`), worldCtx(down)), failed);
  const unknown = { ...reviewsWorld(), rpcs: { reviews_ledger: () => ({ error: "unknown_tenant" }) } };
  await assert.rejects(kernel.load(turnIn(worldCtx(unknown)), reviewsReport, { days: 30, end: null }), noReport);
  await assert.rejects(reviewsRoute.GET.run(req(`?workspace=${A}`), worldCtx(unknown)), noReport);
});

test("the reviews' report on a database that does not have the ledger's function yet (00350 not applied) draws the listing alone: GET reports/reviews answers 200 with `ledger: null` and Google's read, said once in the log with the workspace; the fold's head is the listing's sentence, and any other refusal is still the route's failure", async () => {
  const gone = Object.assign(
    new Error("Could not find the function public.reviews_ledger(p_days, p_tenant_id) in the schema cache"),
    { code: "PGRST202" },
  );
  const absent = {
    ...reviewsWorld(),
    rpcs: {
      reviews_ledger: () => {
        throw gone;
      },
    },
  };
  const { ready: _ready, ...google } = (await googleRoute.GET.run(req(`?workspace=${A}`), worldCtx(reviewsWorld())))
    .google;
  const { result: page, lines } = await logged("reviews_ledger_missing", () =>
    reviewsRoute.GET.run(req(`?workspace=${A}`), worldCtx(absent)),
  );
  assert.deepEqual(Object.keys(page), ["timezone", "today", "days", "google", "readable", "ledger"]);
  assert.equal(page.ledger, null);
  assert.equal(
    JSON.stringify(page.google),
    JSON.stringify(google),
    "Google as GET google reads it, listing and reviews",
  );
  assert.deepEqual([page.timezone, page.days, page.readable], ["Pacific/Auckland", 30, true]);
  assert.deepEqual(
    lines,
    [{ tenant_id: A }],
    "the window is visible in the logs, once for the read, naming the workspace",
  );

  const { result: r } = await logged("reviews_ledger_missing", () =>
    kernel.load(turnIn(worldCtx(absent)), reviewsReport, { days: 30, end: null }),
  );
  assert.deepEqual(r.data, page, "Ask's reader answers what the route does");

  const vm = toReviewsReportVM(page, { nowMs: Date.parse("2026-10-06T14:00:00Z") });
  assert.deepEqual([vm.state, vm.source, vm.waiting.total], ["linked", "places", 0]);
  assert.match(vm.lines.head, /^4\.8 on Google from 213 reviews; /, "the head says the listing's sentence");

  // A different code is not this window: the route fails as it does for any ledger that cannot be read.
  const denied = {
    ...reviewsWorld(),
    rpcs: {
      reviews_ledger: () => {
        throw Object.assign(new Error("permission denied for function reviews_ledger"), { code: "42501" });
      },
    },
  };
  const unsaid = await logged("reviews_ledger_missing", async () => {
    await assert.rejects(reviewsRoute.GET.run(req(`?workspace=${A}`), worldCtx(denied)), /permission denied/);
  });
  assert.deepEqual(unsaid.lines, [], "and the log does not call it the missing function");
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

test("the calendar, for Ask: the board's week exactly as calendarWeek assembles it (a read puts nobody in People) -- over calendar-feed's fixture with no calendar, a calendar that cannot be read, and its one appointment -- and each person its days name is a row, once, by the board's name for them", async () => {
  const none = calTables(null);
  const quiet = await calendarWeek(calCtx(none), A, WEEK, CAL_NOW);
  const noFeed = await kernel.load(calIn(calCtx(none)), calendarReader, WEEK);
  assert.deepEqual(noFeed.data, { calendar: quiet });
  assert.equal(quiet.feed.state, "none");
  assert.deepEqual(noFeed.rows, []);

  await logged("ask_feed_fetch_failed", () =>
    withFeed({ body: "nope", status: 503 }, async () => {
      const t = calTables("https://cal.example/down.ics");
      const want = await calendarWeek(calCtx(t), A, WEEK, CAL_NOW);
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

/**
 * The record's five reads (its rows over the span, in two since 00397: the bookings whole and the feed's rows by key;
 * the notices' latest and their held count; the mailbox) are asked for together and waited for together
 * (calendar-week.ts recordOverSpan, 9 Oct 2026: one after the other they were round trips the board stood behind). Which
 * is heard first is the database stand-in's to say, not the route's, so the five are put in one order before what was
 * asked is compared: every read is still there, once, with its columns, and everything before and after them is still
 * in its own order. `at` is where the five begin.
 */
const recordTogether = (asked, at) => [
  ...asked.slice(0, at),
  ...asked.slice(at, at + 5).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  ...asked.slice(at + 5),
];

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
      recordTogether(
        ctx.supabase.seen.slice(before).map((q) => (q.rpc ? `rpc:${q.rpc}` : `${q.table}.${q.op}`)),
        0,
      ),
      // The record's rows over the span and the notices' health line (00345) are read beside the feed, then everyone.
      // Last, once the feed has read, the record's taken time over the days on offer (record-busy.ts): this week does
      // not cover a fortnight's offer, so the board's open times ask for it rather than reuse the span's rows.
      // The span's record is two reads since a member's word on a visit (00397, visitsOver): the bookings, and the feed's
      // rows by key.
      recordTogether(
        [
          "appointments.select",
          "appointments.select",
          "appointment_notices.select",
          "appointment_notices.select",
          "mailboxes.select",
          "rpc:people_list",
          "policies.select",
          "appointments.select",
        ],
        0,
      ),
      "the record, everyone, and nothing the turn already read: no door, no write",
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
    assert.notEqual(s.data.parsed, null, "the feed was read");
    assert.deepEqual(s.data.rows, [], "no booking has arrived by email");
    assert.deepEqual(s.rows, []);
    // What the board needs of the address and the settings, and not them: nothing a projection of the read could leak.
    assert.ok(!("url" in s.data) && !("cfg" in s.data), "no address, no raw settings");
    assert.equal(typeof s.data.source, "string");
    const json = JSON.stringify(s.data);
    assert.ok(
      !json.includes("cal.example") && !json.includes("front desk of Harbor"),
      "neither is anywhere in the read",
    );
    // The record (two reads since 00397: the bookings, and the feed's rows by key), the notices' two, the mailbox,
    // everyone, the policies and the taken time: eight, and nothing asked again.
    assert.equal(ctx.supabase.seen.length, before + 8, "nothing asked again");
  });
});

test("the board's open times leave out a booking that arrived by email, over the days the receptionist may offer, whichever span the page shows (00345)", async () => {
  // Tuesday noon in New York, two hours' notice, and ONE_ICS takes Tuesday two to half past three: the receptionist's
  // next open time is Tuesday half past three. Booksy emailed two bookings: the rest of Tuesday, and Wednesday one to two.
  const emailed = (id, from, to) => ({
    id,
    tenant_id: A,
    source: "booking_email",
    tool: "booksy",
    external_id: `booksy:${id}`,
    status: "booked",
    starts_at: from,
    ends_at: to,
    all_day: false,
    timezone: "America/New_York",
  });
  const withRecord = (rows) => ({ ...calTables("https://cal.example/ok.ics"), appointments: rows });
  const board = async (t, span) => (await kernel.load(calIn(calCtx(t)), calendarReader, span)).data.calendar;
  await withFeed({ body: ONE_ICS }, async () => {
    const alone = await board(withRecord([]), WEEK);
    assert.equal(alone.next_opening.start, "2026-09-08T19:30:00.000Z", "the feed alone: Tuesday, half past three");
    const t = withRecord([
      emailed("appt-1", "2026-09-08T19:30:00.000Z", "2026-09-08T22:00:00.000Z"),
      emailed("appt-2", "2026-09-09T17:00:00.000Z", "2026-09-09T18:00:00.000Z"),
    ]);
    // The week they fall in: both are drawn, Tuesday has nothing left to offer, and Wednesday's hour is left out.
    const week = await board(t, WEEK);
    const day = (key) => week.days.find((d) => d.key === key);
    assert.equal(day("2026-09-08").items.length, 2, "the feed's appointment and the emailed one");
    assert.deepEqual(day("2026-09-08").windows, []);
    assert.deepEqual(day("2026-09-09").windows, [
      { start: "2026-09-09T13:00:00.000Z", end: "2026-09-09T17:00:00.000Z" },
      { start: "2026-09-09T18:00:00.000Z", end: "2026-09-09T22:00:00.000Z" },
    ]);
    assert.equal(week.next_opening.start, "2026-09-09T13:00:00.000Z", "Wednesday at nine, as the receptionist offers");
    // A board turned to December draws none of those rows, and its next open time is still the receptionist's own: the
    // record is read over the days on offer, not the days on screen.
    const december = await board(t, { from: "2026-12-07", days: 7 });
    assert.equal(december.days.flatMap((d) => d.items).length, 0);
    assert.equal(december.next_opening.start, "2026-09-09T13:00:00.000Z");
  });
});

/**
 * Every query GET calendar asked at origin/main (c39ce689) for an owner over calendar-feed's one appointment with
 * nobody in People yet, in order, with the columns it selected: the workspace's door, the zone, the settings, everyone
 * with their reply modes. It then put the person the feed names in People (create_person); since decision 0047 (lane 6)
 * a read of the board writes nothing, for any role, and that last call is gone.
 */
const CALENDAR_ASKED_AT_MAIN = [
  ["memberships.select", "tenant_id, role, tenants (slug, name, timezone)"],
  ["tenants.select", "name, timezone"],
  ["tenant_config.select", "config"],
  // Since 00345: the record's rows over the span and the notices' health line (the latest, and the held count), read
  // beside the feed before everyone is (docs/plans/2026-10-07-bookings-arrive-by-email.md); since 00397 the span's
  // record is two reads (visitsOver): the bookings whole, and the feed's rows as ids and statuses by key.
  ["appointments.select", "*"],
  ["appointments.select", "id, status, external_id, starts_at"],
  ["appointment_notices.select", "tool, received_at"],
  ["appointment_notices.select", "id"],
  // The workspace's address the tool is to send to, and Gmail's pending confirmation of a forward here.
  ["mailboxes.select", "*"],
  ["rpc:people_list", null],
  ["policies.select", "subject_type, subject_id, mode"],
  // Once the feed has read: the record's taken time over the days on offer, which the open times subtract beside the
  // feed's (record-busy.ts). Asked here because this week does not cover a fortnight's offer; the board's first window does.
  ["appointments.select", "*"],
];

test("GET calendar through its reader asks what it asked at origin/main, in the same order -- the settings now through the config reader's columns -- less the write it made between the read and the board: no role's read puts the person the feed names in People (decision 0047, lane 6), and the board links nobody People does not hold", async (t) => {
  // The route reads the real clock, and People takes whom a feed names within a month of it (contracts
  // peopleFromItems). The feed's one appointment is on 8 September 2026, so with no clock this went red for good on
  // 8 October, thirty days on: nobody was added, and the last read asked for was missing. It runs on the clock the
  // file's other calendar tests name.
  t.mock.timers.enable({ apis: ["Date"], now: CAL_NOW.getTime() });
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
      // The record's five begin after the door, the zone and the settings.
      assert.deepEqual(
        recordTogether(
          ctx.supabase.seen.map((q) => (q.rpc ? [`rpc:${q.rpc}`, null] : [`${q.table}.${q.op}`, q.columns])),
          3,
        ),
        recordTogether(want, 3),
        role,
      );
      assert.deepEqual(
        made.map((a) => [a.p_tenant_id, a.p_phone_e164, a.p_display_name, a.p_source]),
        [],
        `${role}: nobody is put in People by a read`,
      );
      assert.deepEqual(
        tuesday(page.calendar).items.map((i) => i.person),
        [null],
        `${role}: the board links nobody People does not hold`,
      );
      assert.equal(page.calendar.days.length, 7);
      assert.ok(!JSON.stringify(page).includes("cal.example"), "the address never reaches the browser");
    }
  });
});

test("a route's turn takes the workspace's name and zone from its membership: GET calendar no longer asks for them, and says the membership row's zone; a turn handed none reads them as it did", async () => {
  await withFeed({ body: ONE_ICS }, async () => {
    // The membership's row as the real select embeds it (with-route.ts memberContext): its slug, name and zone. The
    // tenants table says another zone, so an answer in it would show the zone was read again.
    const t = calTables("https://cal.example/route.ics");
    t.memberships[0].tenants = { slug: "harbor", name: "Harbor", timezone: "Asia/Tokyo" };
    t.tenants[0].timezone = "UTC";
    const ctx = calCtx(t);
    const page = await calendarRoute.GET.run(req(`?workspace=${A}&from=2026-09-07&days=7`), ctx);
    const seen = ctx.supabase.seen.map((q) => (q.rpc ? `rpc:${q.rpc}` : `${q.table}.${q.op}:${q.columns}`));
    assert.ok(
      !seen.includes("tenants.select:name, timezone"),
      `the zone came with the membership: ${seen.join(" | ")}`,
    );
    assert.equal(seen[0], "memberships.select:tenant_id, role, tenants (slug, name, timezone)");
    assert.equal(page.calendar.timezone, "Asia/Tokyo", "the board's days are the membership row's");
    // Handed the facts, the turn answers them without asking; handed none, it asks as it always did.
    const held = kernel.readerContext(worldCtx({ tables: {} }), {
      tenantId: A,
      role: "owner",
      facts: { name: "Harbor", timezone: "Asia/Tokyo" },
    });
    assert.deepEqual((await kernel.load(held, facts, undefined)).data, { name: "Harbor", timezone: "Asia/Tokyo" });
    assert.deepEqual(held.ctx.supabase.seen, [], "nothing asked");
    const bare = turnIn(worldCtx({ tables: { tenants: [{ id: A, name: "Harbor", timezone: "UTC" }] } }));
    assert.equal((await kernel.load(bare, facts, undefined)).data.timezone, "UTC");
    assert.equal(bare.ctx.supabase.seen.length, 1);
  });
});

/* ------------------------------------------------------------ the Receptionist lens (Reports, C2) */

const LINKS_URL = "https://cal.example/links.ics";
/** Bo, Cy and Dee beside Ana (above): People as people_list answers it, each with the number a visit of theirs would carry. */
const BO = { id: "k-bo", display_name: "Bo Example", wa_profile_name: null, phone_e164: "+19175550101", email: null };
const CY = { id: "k-cy", display_name: "Cy Example", wa_profile_name: null, phone_e164: "+19175550102", email: null };
const DEE = {
  id: "k-dee",
  display_name: "Dee Example",
  wa_profile_name: null,
  phone_e164: "+19175550103",
  email: null,
};
const visit = (uid, name, phone, from, to) => [
  "BEGIN:VEVENT",
  `UID:${uid}`,
  `SUMMARY:${name} · Cut`,
  `DESCRIPTION:${name} ${phone}`,
  `DTSTART;TZID=America/New_York:${from}`,
  `DTEND;TZID=America/New_York:${to}`,
  "END:VEVENT",
];
/**
 * The calendar on CAL_NOW (Tuesday noon in New York): Ana's visit this afternoon, Bo's ten days before anyone sent him
 * a link, and Dee's tomorrow, who was sent none. Cy has none.
 */
const LINKED_ICS = [
  "BEGIN:VCALENDAR",
  ...visit("r1", "Ana Ruiz", "+1 (917) 555-0100", "20260908T140000", "20260908T153000"),
  ...visit("r2", "Bo Example", "+1 (917) 555-0101", "20260828T100000", "20260828T110000"),
  ...visit("r3", "Dee Example", "+1 (917) 555-0103", "20260909T100000", "20260909T110000"),
  "END:VCALENDAR",
].join("\r\n");
/** The people sent the booking link, as receptionist_series lists them: the moment each was first sent it. */
const LINKS = {
  total: 3,
  people: [
    { c: ANA.id, at: "2026-09-07T15:00:00.000Z" },
    { c: BO.id, at: "2026-09-07T16:00:00.000Z" },
    { c: CY.id, at: "2026-09-08T10:00:00.000Z" },
  ],
};
const NO_HOLD = {
  total: 0,
  sent: 0,
  canceled: 0,
  steered: 0,
  overtaken: 0,
  person_first: 0,
  waiting: 0,
  other: 0,
  low_confidence: 0,
};
const NO_HANDOVERS = { n: 0, replied: { n: 0, median_s: null }, settled: { n: 0, median_s: null } };
const NO_MISSED = { n: 0, touched: 0, pending: 0, unknown: 0 };
/** What receptionist_series answers (00380) for a quiet window, as the database hands it over: the days asked, ending where it was asked to; `over` is what the test puts in it. */
const quietSeries = (a, over = {}) => ({
  timezone: "America/New_York",
  today: "2026-09-08",
  end: a.p_end ?? "2026-09-08",
  days: a.p_days,
  hold: { now: NO_HOLD, before: { total: 0, sent: 0 } },
  topics: { of: 0, stamped: 0, by_intent: {} },
  languages: { of: 0, stamped: 0, by_language: {} },
  blocked: { total: 0, by_reason: {} },
  call_endings: { total: 0, by_reason: {} },
  handover: { now: NO_HANDOVERS, before: NO_HANDOVERS },
  missed: { now: NO_MISSED, before: NO_MISSED },
  after_hours: [],
  links: { total: 0, people: [] },
  stuck: { open: [] },
  ...over,
});
/** calendar-feed's Harbor (New York, its hours) with the calendar `url` names (none when null), receptionist_series answering `over` and People holding Ana, Bo, Cy and Dee. */
const receptionistWorld = (url, over = {}, rpcs = {}) => ({
  tables: calTables(url),
  rpcs: {
    receptionist_series: (a) => quietSeries(a, over),
    people_list: () => [ANA, BO, CY, DEE],
    ...rpcs,
  },
});
const LENS = { days: 30, end: null };

test("the Receptionist lens, for Ask and for the page: GET reports/receptionist answers its reader's payload, key for key and byte for byte, for each preset -- the database's series with the booking link counted against the calendar, and the hours beside it, no row of its own", async (t) => {
  // The route reads the real clock: the file's calendar tests name theirs.
  t.mock.timers.enable({ apis: ["Date"], now: CAL_NOW.getTime() });
  await withFeed({ body: LINKED_ICS }, async () => {
    const w = receptionistWorld(LINKS_URL, { links: LINKS });
    for (const [period, days] of [
      ["7d", 7],
      ["30d", 30],
      ["90d", 90],
    ]) {
      const page = await receptionistRoute.GET.run(req(`?period=${period}&workspace=${A}`), worldCtx(w));
      const r = await kernel.load(calIn(worldCtx(w)), receptionistReport, { days, end: null });
      assert.equal(JSON.stringify(r.data), JSON.stringify(page), `${period}: the route's payload, byte for byte`);
      assert.deepEqual(Object.keys(page), ["timezone", "today", "end", "days", "series", "profile"]);
      assert.deepEqual([page.timezone, page.today, page.days], ["America/New_York", "2026-09-08", days]);
      assert.deepEqual(page.series.links, { sent: 3, booked: 1, calendar: "ok" });
      assert.deepEqual(r.rows, [], "drawn on the Reports page, whose row the report names");
    }
    await assert.rejects(
      receptionistRoute.GET.run(req(`?period=14d&workspace=${A}`), worldCtx(w)),
      (e) => e.status === 400,
      "a period that is none of the four is refused at the door",
    );
  });
});

test("the Receptionist lens counts the people sent the booking link against the calendar by asked-then-booked's own rule: of three, one has a visit after the link -- People once, the calendar once, and the zone and the settings once, whoever asks", async () => {
  await withFeed({ body: LINKED_ICS }, async (fetched) => {
    const ctx = worldCtx(receptionistWorld(LINKS_URL, { links: LINKS }));
    const r = await kernel.load(calIn(ctx), receptionistReport, LENS);
    assert.deepEqual(r.data.series.links, { sent: 3, booked: 1, calendar: "ok" });
    assert.equal("people" in r.data.series.links, false, "the people are counted, not carried");
    assert.equal(fetched.length, 1, "the calendar asked once");
    const seen = asked(ctx);
    for (const q of ["rpc:receptionist_series", "rpc:people_list", "tenants.select", "tenant_config.select"])
      assert.equal(seen.filter((x) => x === q).length, 1, `${q}: once`);
  });
});

test("the Receptionist lens on a database that does not have its function yet (00380 not applied) answers 200 with `series: null` and the window it was asked, said once in the log with the workspace; any other refusal is still the route's failure", async () => {
  const gone = Object.assign(
    new Error("Could not find the function public.receptionist_series(p_days, p_tenant_id) in the schema cache"),
    { code: "PGRST202" },
  );
  const absent = receptionistWorld(
    null,
    {},
    {
      receptionist_series: () => {
        throw gone;
      },
    },
  );
  const { result: page, lines } = await logged("receptionist_series_missing", () =>
    receptionistRoute.GET.run(req(`?workspace=${A}`), worldCtx(absent)),
  );
  assert.deepEqual(Object.keys(page), ["timezone", "today", "days", "series", "profile"]);
  assert.equal(page.series, null);
  assert.deepEqual([page.timezone, page.days], ["America/New_York", 30]);
  assert.match(page.today, /^\d{4}-\d{2}-\d{2}$/, "the workspace's day, from the turn's clock and zone");
  assert.deepEqual(
    page.profile,
    { hours: calProfile.hours, closures: calProfile.closures },
    "the hours are still said",
  );
  assert.deepEqual(lines, [{ tenant_id: A }], "said once for the read, naming the workspace");

  const ctx = worldCtx(absent);
  const { result: r } = await logged("receptionist_series_missing", () =>
    kernel.load(turnIn(ctx), receptionistReport, LENS),
  );
  assert.deepEqual(r.data, page, "Ask's reader answers what the route does");
  assert.equal(asked(ctx).filter((q) => q === "rpc:people_list").length, 0, "nobody is read for a link nobody listed");

  // Days that ended before today name their last day in the answer, as the window was asked.
  const { result: ended } = await logged("receptionist_series_missing", () =>
    kernel.load(calIn(worldCtx(absent)), receptionistReport, { days: 20, end: "2026-08-31" }),
  );
  assert.deepEqual(
    [ended.data.timezone, ended.data.today, ended.data.end, ended.data.days, ended.data.series],
    ["America/New_York", "2026-09-08", "2026-08-31", 20, null],
  );

  // A different code is not this window: the route fails as it does for any read that cannot be made.
  const denied = receptionistWorld(
    null,
    {},
    {
      receptionist_series: () => {
        throw Object.assign(new Error("permission denied for function receptionist_series"), { code: "42501" });
      },
    },
  );
  const unsaid = await logged("receptionist_series_missing", async () => {
    await assert.rejects(receptionistRoute.GET.run(req(`?workspace=${A}`), worldCtx(denied)), /permission denied/);
  });
  assert.deepEqual(unsaid.lines, [], "and the log does not call it the missing function");
});

test("the Receptionist lens: a function with no workspace is the route's 404 in its words, and a read that fails is its failure -- not found and could not read are two answers", async () => {
  const unknown = receptionistWorld(null, {}, { receptionist_series: () => ({ error: "unknown_tenant" }) });
  await assert.rejects(kernel.load(turnIn(worldCtx(unknown)), receptionistReport, LENS), noReport);
  await assert.rejects(receptionistRoute.GET.run(req(`?workspace=${A}`), worldCtx(unknown)), noReport);
  const down = receptionistWorld(
    null,
    {},
    {
      receptionist_series: () => {
        throw new Error("connection refused");
      },
    },
  );
  const failed = /receptionist_series: connection refused/;
  await assert.rejects(kernel.load(turnIn(worldCtx(down)), receptionistReport, LENS), failed);
  await assert.rejects(receptionistRoute.GET.run(req(`?workspace=${A}`), worldCtx(down)), failed);
});

test("the Receptionist lens reads nobody it has no one to find: days that ended before today are 'ended', and a window in which no link was sent is none booked of none -- neither reads People or the calendar", async () => {
  await withFeed({ body: LINKED_ICS }, async (fetched) => {
    const ended = worldCtx(receptionistWorld(LINKS_URL, { today: "2026-10-06", links: LINKS }));
    const clock = new Date("2026-10-06T16:00:00Z");
    const r = await kernel.load(
      kernel.readerContext(ended, { tenantId: A, role: "viewer" }, clock),
      receptionistReport,
      {
        days: 20,
        end: "2026-09-20",
      },
    );
    assert.deepEqual(
      r.data.series.links,
      { sent: 3, booked: null, calendar: "ended" },
      "three were sent it; the page says why no more",
    );
    assert.equal(r.data.end, "2026-09-20");
    assert.deepEqual(
      ended.supabase.seen.filter((q) => q.rpc),
      [{ rpc: "receptionist_series", args: { p_tenant_id: A, p_days: 20, p_end: "2026-09-20" } }],
      "the series, and not People: the fake people_list is never called",
    );

    const quiet = worldCtx(receptionistWorld(LINKS_URL));
    const q = await kernel.load(calIn(quiet), receptionistReport, LENS);
    assert.deepEqual(q.data.series.links, { sent: 0, booked: 0, calendar: "ok" });
    assert.equal(asked(quiet).filter((x) => x === "rpc:people_list").length, 0, "no link sent: nobody to find");
    assert.equal(fetched.length, 0, "and the calendar was asked of neither");
  });
});

test("the Receptionist lens does not count who booked of a list the database cut short: with more people sent the link than it lists, `booked` is null with the calendar ok -- People and the calendar are not read, and the line says how many were sent and no more", async () => {
  await withFeed({ body: LINKED_ICS }, async (fetched) => {
    // receptionist_series lists at most 500 people and counts them all: a count of the listed would understate.
    const listed = Array.from({ length: 500 }, (_, i) => ({ c: `k-${i}`, at: "2026-09-07T15:00:00.000Z" }));
    const cut = worldCtx(receptionistWorld(LINKS_URL, { links: { total: 501, people: listed } }));
    const r = await kernel.load(calIn(cut), receptionistReport, LENS);
    assert.deepEqual(r.data.series.links, { sent: 501, booked: null, calendar: "ok" });
    assert.equal(asked(cut).filter((x) => x === "rpc:people_list").length, 0, "nobody is read for a count that is cut");
    assert.equal(fetched.length, 0, "nor the calendar");
    assert.equal(
      toReceptionistReportVM(r.data, { nowMs: CAL_NOW.getTime() }).link.line,
      "501 people were sent the booking link.",
      "the fold says how many were sent, and nothing of a calendar that could not be asked",
    );

    // The whole list listed is counted as ever: 500 sent, 500 listed.
    const whole = worldCtx(receptionistWorld(LINKS_URL, { links: { total: 500, people: listed } }));
    const w = await kernel.load(calIn(whole), receptionistReport, LENS);
    assert.deepEqual(w.data.series.links, { sent: 500, booked: 0, calendar: "ok" });
    assert.equal(asked(whole).filter((x) => x === "rpc:people_list").length, 1);
  });
});

test("the Receptionist lens never fails for the booking link: a workspace with no calendar, a calendar that cannot be read and People that cannot be read are each said as what they are, with `booked` null and never 0", async () => {
  const none = await kernel.load(calIn(worldCtx(receptionistWorld(null, { links: LINKS }))), receptionistReport, LENS);
  assert.deepEqual(none.data.series.links, { sent: 3, booked: null, calendar: "none" });

  const { result: down } = await logged("ask_feed_fetch_failed", () =>
    withFeed({ body: "nope", status: 503 }, () =>
      kernel.load(calIn(worldCtx(receptionistWorld(LINKS_URL, { links: LINKS }))), receptionistReport, LENS),
    ),
  );
  assert.deepEqual(down.data.series.links, { sent: 3, booked: null, calendar: "unavailable" });

  const unreadable = receptionistWorld(
    LINKS_URL,
    { links: LINKS },
    {
      people_list: () => {
        throw new Error("people down");
      },
    },
  );
  const { result: broken, lines } = await logged("booking_report_failed", () =>
    kernel.load(calIn(worldCtx(unreadable)), receptionistReport, LENS),
  );
  assert.deepEqual(broken.data.series.links, { sent: 3, booked: null, calendar: "unavailable" });
  assert.equal(lines.length, 1, "logged once, never fatal");
  assert.equal(lines[0].tenant_id, A);
  assert.match(lines[0].error, /people down/);
  assert.notEqual(broken.data.series.hold, undefined, "and the rest of the lens is answered");
});

test("the Receptionist lens counts who waits on you by the one rule: a flagged thread nobody has, a call-back among them -- not one a teammate has, not one put aside", async () => {
  const escalation = (reason, created_at, state, over = {}) => ({
    reason,
    created_at,
    state,
    paused_until: null,
    assignee_user_id: null,
    ...over,
  });
  const open = [
    escalation("human_token", "2026-09-21T08:00:00Z", "needs_human"),
    escalation("callback", "2026-09-21T09:00:00Z", "open"),
    escalation("manual", "2026-09-21T07:00:00Z", "open", { assignee_user_id: "u2" }), // a teammate has it
    escalation("human_token", "2026-09-20T09:00:00Z", "snoozed"), // put aside
  ];
  const ctx = worldCtx(receptionistWorld(null, { today: "2026-09-21", stuck: { open } }));
  const clock = new Date("2026-09-21T12:00:00Z");
  const r = await kernel.load(
    kernel.readerContext(ctx, { tenantId: A, role: "viewer" }, clock),
    receptionistReport,
    LENS,
  );
  assert.deepEqual(r.data.series.stuck, {
    waiting: 2,
    oldest_at: "2026-09-21T08:00:00Z",
    callbacks: 1,
    capped: false,
  });
});

test("the Receptionist lens carries the hours and closures the report carries -- one read of the same config in the turn -- and none where the config cannot be read", async () => {
  const w = receptionistWorld(null, {}, { report_series: series });
  const ctx = worldCtx(w);
  const rc = calIn(ctx);
  const [page, lens] = await Promise.all([
    kernel.load(rc, reportReader, LENS),
    kernel.load(rc, receptionistReport, LENS),
  ]);
  assert.deepEqual(lens.data.profile, page.data.profile, "one derivation of the profile");
  assert.deepEqual(lens.data.profile, { hours: calProfile.hours, closures: calProfile.closures });
  assert.equal(asked(ctx).filter((q) => q === "tenant_config.select").length, 1, "the config is read once for both");

  // No row, and a config the parser refuses (a brain without its name, prompt and fallbacks): no profile, and the series is answered.
  const noRow = receptionistWorld(null);
  noRow.tables.tenant_config = [];
  const refused = receptionistWorld(null);
  refused.tables.tenant_config = [
    { tenant_id: A, config: { brain: { profile: { hours: calProfile.hours } } }, version: 1 },
  ];
  for (const world of [noRow, refused]) {
    const r = await kernel.load(calIn(worldCtx(world)), receptionistReport, LENS);
    assert.equal(r.data.profile, null);
    assert.notEqual(r.data.series, null);
  }
});

/* ------------------------------------------------------------------- the People lens (Reports, C3) */

const BOOK_DAY = 24 * HOUR;
/**
 * A person as people_list answers it (people-pool.test.mjs's row): wrote on WhatsApp `daysAgo` days before CAL_NOW, a yes
 * to messages and to offers on it, with nothing else open.
 */
const bookRow = (n, daysAgo, over = {}) => {
  const heard = new Date(CAL_NOW.getTime() - daysAgo * BOOK_DAY).toISOString();
  return {
    id: `k-${n}`,
    display_name: `Person ${n}`,
    wa_profile_name: null,
    phone_e164: `+1917555${String(n).padStart(4, "0")}`,
    email: null,
    consent: "opted_in",
    consent_source: "customer_message",
    consent_updated_at: heard,
    marketing_consent: "opted_in",
    marketing_consent_source: "form",
    marketing_consent_updated_at: heard,
    marketing_channels: ["whatsapp"],
    dnc: false,
    channels: ["whatsapp"],
    conversation_count: 1,
    escalation_count: 0,
    needs_human: false,
    open_escalation_reason: null,
    open_escalation_since: null,
    latest_conversation_id: `cv-${n}`,
    latest_state: "open",
    latest_paused_until: null,
    latest_assignee_user_id: null,
    latest_snooze_until: null,
    latest_wa_inbound_at: heard,
    last_message_at: heard,
    last_message_direction: "inbound",
    last_message_sender: "customer",
    last_inbound_text: "Can I move Saturday to 11?",
    last_inbound_at: heard,
    last_call_at: null,
    last_inbound_call_at: null,
    call_count: 0,
    call_seconds: 0,
    first_contact_at: heard,
    earliest_row_at: heard,
    has_backfill: false,
    has_chat: true,
    message_channels: ["whatsapp"],
    queued_reply_at: null,
    ...over,
  };
};
/**
 * The moment the fifth person last wrote: 22:00 on 1 Sep in New York, 02:00 on 2 Sep in UTC. CAL_NOW is the 8th at noon in
 * New York, so by the workspace's days they were heard 7 days ago (`d7_30`), and by UTC's 6 (`under_7`): only the workspace's
 * zone puts them in the right bucket.
 */
const EDGE_HEARD = "2026-09-02T02:00:00.000Z";
/**
 * Five people, so the book's buckets differ: heard 2, 20, 45 and 100 days before CAL_NOW, and the fifth on the edge of the
 * week by the zone (above). The first has a step of the member's a day past, the second one of a teammate's due today and
 * reaches Harbor by WhatsApp and by phone, the fourth asked to stop.
 */
const BOOK = [
  bookRow(1, 2, { step_id: "s1", step_body: "Send the quote", step_due_on: "2026-09-07", step_for_user_id: USER }),
  bookRow(2, 20, {
    channels: ["whatsapp", "voice"],
    step_id: "s2",
    step_body: "Call back",
    step_due_on: "2026-09-08",
    step_for_user_id: "u2",
  }),
  bookRow(3, 45),
  bookRow(4, 100, { consent: "opted_out" }),
  bookRow(5, 0, { last_inbound_at: EDGE_HEARD, last_message_at: EDGE_HEARD, latest_wa_inbound_at: EDGE_HEARD }),
];
/** The counts of the People world's busy thirty days, without the window they were read for. */
const { timezone: _zone, today: _day, days: _span, ...BUSY } = SERIES;
/** What people_series answers (00395) for the days asked, ending where it was asked to: a quiet window, or what `over` puts in it. */
const peopleSeriesAnswer = (a, over = {}) => ({
  timezone: "America/New_York",
  today: "2026-09-08",
  end: a.p_end ?? "2026-09-08",
  days: a.p_days,
  ...QUIET,
  ...over,
});
/** Harbor's WhatsApp number, as the People worlds give the channels (calendar-counts.test.mjs's). */
const WHATSAPP_ON = [{ tenant_id: A, kind: "whatsapp", status: "active", config: {} }];
/** calendar-feed's Harbor with People as BOOK, people_series answering `over` and the channels `channels` gives. */
const peopleLensWorld = (over = {}, rpcs = {}, channels = WHATSAPP_ON) => ({
  tables: { ...calTables(null), tenant_channels: channels },
  rpcs: { people_series: (a) => peopleSeriesAnswer(a, over), people_list: () => BOOK, ...rpcs },
});
/** What a database that has not run 00395 answers a call to people_series. */
const peopleSeriesGone = () => {
  throw Object.assign(
    new Error("Could not find the function public.people_series(p_days, p_tenant_id) in the schema cache"),
    { code: "PGRST202" },
  );
};
const peopleListDown = () => {
  throw new Error("people down");
};

test("the People lens, for Ask and for the page: GET reports/people answers its reader's payload, key for key and byte for byte, for each preset -- the database's series and the book as it stands now, no row of its own", async (t) => {
  // The route reads the real clock: the book's days are counted from the turn's.
  t.mock.timers.enable({ apis: ["Date"], now: CAL_NOW.getTime() });
  const w = peopleLensWorld(BUSY);
  for (const [period, days] of [
    ["7d", 7],
    ["30d", 30],
    ["90d", 90],
  ]) {
    const page = await peopleRoute.GET.run(req(`?period=${period}&workspace=${A}`), worldCtx(w));
    const r = await kernel.load(calIn(worldCtx(w)), peopleReport, { days, end: null });
    assert.equal(JSON.stringify(r.data), JSON.stringify(page), `${period}: the route's payload, byte for byte`);
    assert.deepEqual(Object.keys(page), ["timezone", "today", "end", "days", "series", "now"]);
    assert.deepEqual([page.timezone, page.today, page.days], ["America/New_York", "2026-09-08", days]);
    assert.deepEqual(r.rows, [], "drawn on the Reports page, whose row the report names");
  }
  await assert.rejects(
    peopleRoute.GET.run(req(`?period=14d&workspace=${A}`), worldCtx(w)),
    (e) => e.status === 400,
    "a period that is none of the four is refused at the door",
  );
});

test("the People lens carries the series as the database gave it and the book as People counts it: peopleNowOf over the rows People holds, in the workspace's zone at the turn's clock, judged against what the workspace can send on", async () => {
  const w = peopleLensWorld(BUSY);
  const r = await kernel.load(calIn(worldCtx(w)), peopleReport, LENS);
  assert.deepEqual(r.data.series, peopleSeriesAnswer({ p_days: 30 }, BUSY), "the series, as the database gave it");

  const held = (await kernel.load(calIn(worldCtx(w)), everyoneReader, undefined)).data;
  const ready = await channelsReadyOrNull(worldCtx(w), A, { withPause: false });
  assert.notEqual(ready, null, "the channels are read, WhatsApp among them");
  const nowMs = CAL_NOW.getTime();
  assert.deepEqual(r.data.now, peopleNowOf(held, { tz: "America/New_York", nowMs, ready }));
  assert.equal(r.data.now.people, 5);
  assert.deepEqual(
    r.data.now.fresh,
    { under_7: 1, d7_30: 2, d31_60: 1, d61_90: 0, d91_up: 1, never: 0 },
    "the fifth, 22:00 on the 1st in New York, was heard 7 days ago by the workspace's days",
  );
  const inUtc = peopleNowOf(held, { tz: "UTC", nowMs, ready });
  assert.deepEqual(
    inUtc.fresh,
    { under_7: 2, d7_30: 1, d31_60: 1, d61_90: 0, d91_up: 1, never: 0 },
    "and 6 by UTC's: the zone is what tells the two apart",
  );
  assert.notDeepEqual(r.data.now.fresh, inUtc.fresh);
  assert.deepEqual(r.data.now.steps, { overdue: 1, due_today: 1 }, "the days of the steps are the workspace's");
  assert.deepEqual(r.data.now.wires, {
    whatsapp_only: 4,
    sms_only: 0,
    phone_only: 0,
    email_only: 0,
    several: 1,
    none: 0,
  });

  // The channels count: with no WhatsApp number nobody can be sent offers, which counting by WhatsApp alone (the channels not read) would not say.
  const dark = await kernel.load(calIn(worldCtx(peopleLensWorld(BUSY, {}, []))), peopleReport, LENS);
  assert.equal(r.data.now.lists.offers_ok, 4);
  assert.equal(dark.data.now.lists.offers_ok, 0);
  assert.equal(peopleNowOf(held, { tz: "America/New_York", nowMs, ready: null }).lists.offers_ok, 4);
  assert.equal(
    dark.data.now.lists.opted_in,
    r.data.now.lists.opted_in,
    "the yes is theirs, whether or not you can send",
  );
});

test("the People lens on a database that does not have its function yet (00395 not applied) answers 200 with `series: null`, the book and the window it was asked, said once in the log with the workspace; any other refusal is still the route's failure", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: CAL_NOW.getTime() });
  const absent = peopleLensWorld(BUSY, { people_series: peopleSeriesGone });
  const { result: page, lines } = await logged("people_series_missing", () =>
    peopleRoute.GET.run(req(`?workspace=${A}`), worldCtx(absent)),
  );
  assert.deepEqual(Object.keys(page), ["timezone", "today", "days", "series", "now"]);
  assert.equal(page.series, null);
  assert.deepEqual([page.timezone, page.today, page.days], ["America/New_York", "2026-09-08", 30]);
  assert.equal(page.now.people, 5, "the book does not need the function");
  assert.deepEqual(lines, [{ tenant_id: A }], "said once for the read, naming the workspace");

  const ctx = worldCtx(absent);
  const { result: r } = await logged("people_series_missing", () => kernel.load(calIn(ctx), peopleReport, LENS));
  assert.deepEqual(r.data, page, "Ask's reader answers what the route does");
  const seen = asked(ctx);
  for (const q of ["rpc:people_list", "tenants.select"])
    assert.equal(seen.filter((x) => x === q).length, 1, `${q}: once, whichever half asks`);

  // Days that ended before today name their last day in the answer, as the window was asked.
  const { result: ended } = await logged("people_series_missing", () =>
    kernel.load(calIn(worldCtx(absent)), peopleReport, { days: 20, end: "2026-08-31" }),
  );
  assert.deepEqual(
    [ended.data.timezone, ended.data.today, ended.data.end, ended.data.days, ended.data.series],
    ["America/New_York", "2026-09-08", "2026-08-31", 20, null],
  );
  assert.equal(ended.data.now.people, 5);

  // A different code is not this window: the route fails as it does for any read that cannot be made.
  const denied = peopleLensWorld(BUSY, {
    people_series: () => {
      throw Object.assign(new Error("permission denied for function people_series"), { code: "42501" });
    },
  });
  const unsaid = await logged("people_series_missing", async () => {
    await assert.rejects(peopleRoute.GET.run(req(`?workspace=${A}`), worldCtx(denied)), /permission denied/);
  });
  assert.deepEqual(unsaid.lines, [], "and the log does not call it the missing function");
});

test("the People lens: a function with no workspace is the route's 404 in its words, and a read that fails is its failure -- not found and could not read are two answers", async () => {
  const unknown = peopleLensWorld(BUSY, { people_series: () => ({ error: "unknown_tenant" }) });
  await assert.rejects(kernel.load(turnIn(worldCtx(unknown)), peopleReport, LENS), noReport);
  await assert.rejects(peopleRoute.GET.run(req(`?workspace=${A}`), worldCtx(unknown)), noReport);
  const down = peopleLensWorld(BUSY, {
    people_series: () => {
      throw new Error("connection refused");
    },
  });
  const failed = /people_series: connection refused/;
  await assert.rejects(kernel.load(turnIn(worldCtx(down)), peopleReport, LENS), failed);
  await assert.rejects(peopleRoute.GET.run(req(`?workspace=${A}`), worldCtx(down)), failed);
});

test("the People lens never fails for its book: People that cannot be read leave `now: null`, said once in the log with the workspace, and the series is answered -- each half fails alone, and both gone still answer the window as it was asked", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: CAL_NOW.getTime() });
  const down = peopleLensWorld(BUSY, { people_list: peopleListDown });
  const { result: page, lines } = await logged("people_pool_failed", () =>
    peopleRoute.GET.run(req(`?workspace=${A}`), worldCtx(down)),
  );
  assert.deepEqual(Object.keys(page), ["timezone", "today", "end", "days", "series", "now"]);
  assert.equal(page.now, null);
  assert.deepEqual(page.series, peopleSeriesAnswer({ p_days: 30 }, BUSY), "and the rest of the lens is answered");
  assert.equal(lines.length, 1, "logged once, never fatal");
  assert.equal(lines[0].tenant_id, A);
  assert.match(lines[0].error, /people down/);

  const { result: r } = await logged("people_pool_failed", () =>
    kernel.load(calIn(worldCtx(down)), peopleReport, LENS),
  );
  assert.deepEqual(r.data, page, "Ask's reader answers what the route does");

  const both = peopleLensWorld(BUSY, { people_series: peopleSeriesGone, people_list: peopleListDown });
  const { result: neither, lines: poolLines } = await logged("people_pool_failed", () =>
    kernel.load(calIn(worldCtx(both)), peopleReport, LENS),
  );
  const none = neither.data;
  assert.deepEqual([none.series, none.now, none.days, none.today], [null, null, 30, "2026-09-08"]);
  assert.equal(poolLines.length, 1, "the book's failure is said once beside the missing function's");
});

test("the People lens never fails the route for a zone it cannot read: a database without its function whose workspace row cannot be read answers `series: null, now: null` -- the book's failure said once in the log -- and Ask's tool reads that as `available: false`", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: CAL_NOW.getTime() });
  const absent = peopleLensWorld(BUSY, { people_series: peopleSeriesGone });
  const zoneDown = { "tenants.select": { message: "tenants down" } };
  const { result: r, lines } = await logged("people_pool_failed", () =>
    kernel.load(calIn(worldCtx(absent, zoneDown)), peopleReport, LENS),
  );
  const none = r.data;
  assert.deepEqual([none.series, none.now, none.days], [null, null, 30], "neither half, and the days as asked");
  assert.deepEqual(Object.keys(none), ["timezone", "today", "days", "series", "now"]);
  assert.equal(
    typeof none.timezone,
    "string",
    "a zone and a day the type holds, though nothing reads them of this answer",
  );
  assert.match(none.today, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(r.rows, []);
  assert.equal(lines.length, 1, "the book's failure is said once");
  assert.match(lines[0].error, /tenants down/);
  const lens = toPeopleReportVM(none);
  assert.deepEqual([lens.windowAvailable, lens.nowAvailable], [false, false], "Ask's tool: `{ available: false }`");

  // Days that ended before today name their last day, as the window was asked.
  const { result: ended } = await logged("people_pool_failed", () =>
    kernel.load(calIn(worldCtx(absent, zoneDown)), peopleReport, { days: 20, end: "2026-08-31" }),
  );
  assert.deepEqual(
    [ended.data.end, ended.data.days, ended.data.series, ended.data.now],
    ["2026-08-31", 20, null, null],
  );

  // The zone is only the missing function's trouble when both fail: with the function there, a zone that cannot be read is the series' answer to give.
  const { result: there } = await logged("people_pool_failed", () =>
    kernel.load(calIn(worldCtx(peopleLensWorld(BUSY), zoneDown)), peopleReport, LENS),
  );
  assert.deepEqual(there.data.series, peopleSeriesAnswer({ p_days: 30 }, BUSY), "the window is answered");
  assert.equal(there.data.now, null, "and the book, which needs the zone, is not");
});

test("the People lens reads its book for days that ended before today as well: the book is as of now and the window is the database's -- people_series is asked with the last day named, and People once", async () => {
  const ctx = worldCtx(peopleLensWorld(BUSY));
  const ended = await kernel.load(calIn(ctx), peopleReport, { days: 20, end: "2026-08-31" });
  assert.deepEqual(
    ctx.supabase.seen.filter((q) => q.rpc === "people_series"),
    [{ rpc: "people_series", args: { p_tenant_id: A, p_days: 20, p_end: "2026-08-31" } }],
    "the database counts the 20 days to the 31st",
  );
  assert.equal(asked(ctx).filter((x) => x === "rpc:people_list").length, 1, "and People is read");
  assert.equal(ended.data.end, "2026-08-31");
  assert.equal(ended.data.days, 20);
  const live = await kernel.load(calIn(worldCtx(peopleLensWorld(BUSY))), peopleReport, LENS);
  assert.deepEqual(ended.data.now, live.data.now, "the book is the same as of now, whichever days are asked");
});

test("the People lens reads each of its things once in a turn: the series, People, the zone and the channels -- and a turn that already loaded People for the report reads People once", async () => {
  const ctx = worldCtx(peopleLensWorld(BUSY));
  await kernel.load(calIn(ctx), peopleReport, LENS);
  for (const q of ["rpc:people_series", "rpc:people_list", "tenants.select", "tenant_channels.select", "lines.select"])
    assert.equal(asked(ctx).filter((x) => x === q).length, 1, `${q}: once`);

  const both = worldCtx(peopleLensWorld(BUSY, { report_series: series }));
  const rc = calIn(both);
  await Promise.all([kernel.load(rc, reportReader, LENS), kernel.load(rc, peopleReport, LENS)]);
  await kernel.load(rc, peopleReport, LENS);
  assert.equal(
    asked(both).filter((x) => x === "rpc:people_list").length,
    1,
    "the report counted People for its booking line; the lens counts the same read",
  );
  assert.equal(asked(both).filter((x) => x === "rpc:people_series").length, 1);
});

test("the People lens is the workspace's, not the member's: the same answer for an owner and a viewer, whoever a step in the book is for", async () => {
  const w = peopleLensWorld(BUSY);
  const viewer = await kernel.load(calIn(worldCtx(w), "viewer"), peopleReport, LENS);
  const owner = await kernel.load(
    kernel.readerContext({ ...worldCtx(w), userId: "u2" }, { tenantId: A, role: "owner" }, CAL_NOW),
    peopleReport,
    LENS,
  );
  assert.equal(JSON.stringify(owner.data), JSON.stringify(viewer.data));
  assert.notEqual(owner.data.now, null);
});

/* ----------------------------------------------------------------------- the Campaigns lens' ledger (C4) */

/** campaigns/_campaign-world.mjs's clock: noon on Fri 4 Sep 2026 at Harbor (New York), where its stuck facts are judged. */
const LEDGER_CLOCK = new Date(LEDGER_NOW);
/** Harbor's WhatsApp number as Meta last said it: rated RED, and the three moments its config keeps (the standing's is the newest). */
const RED_CONFIG = {
  quality_rating: "RED",
  quality_read_at: "2026-09-04T10:00:00.000Z",
  standing_read_at: "2026-09-04T12:30:00.000Z",
  quality_at: "2026-09-03T08:00:00.000Z",
};
/** An active WhatsApp channel of Harbor's holding `config`; `over` changes the row (a stopped number, another kind). */
const numberOf = (config, over = {}) => [{ tenant_id: A, kind: "whatsapp", status: "active", config, ...over }];
/** What campaign_ledger answers (00405) for the days asked: the world's thirty days, said for the window it was asked. */
const ledgerAnswer = (a) => ({ ...LEDGER, end: a.p_end ?? LEDGER.end, days: a.p_days });
/** calendar-feed's Harbor with the ledger world's two answers (campaign_stuck as the database gives it) and the channels `channels` gives. */
const ledgerWorld = (rpcs = {}, channels = numberOf(RED_CONFIG)) => ({
  tables: { ...calTables(null), tenant_channels: channels },
  rpcs: { campaign_ledger: ledgerAnswer, campaign_stuck: () => STUCK, ...rpcs },
});
/** What a database that has not run 00405 or 00406 answers a call to its function. */
const functionGone = (signature) => () => {
  throw Object.assign(new Error(`Could not find the function public.${signature} in the schema cache`), {
    code: "PGRST202",
  });
};
const ledgerGone = functionGone("campaign_ledger(p_days, p_tenant_id)");
const stuckGone = functionGone("campaign_stuck(p_tenant_id)");
/** A function the database refuses for a reason that is not its absence. */
const refusedFunction = (name) => () => {
  throw Object.assign(new Error(`permission denied for function ${name}`), { code: "42501" });
};
/** A turn on the ledger world's clock, or on `now`. */
const ledgerIn = (ctx, role = "viewer", now = LEDGER_CLOCK) => kernel.readerContext(ctx, { tenantId: A, role }, now);
/** What a workspace with nothing stuck is told by campaign_stuck. */
const NOTHING_STUCK = { runs_waiting: [], runs_failed: [], replies: [], templates: [] };

test("the Campaigns lens' ledger, for Ask and for the page: GET reports/campaigns/ledger answers its reader's payload, key for key and byte for byte, for each preset -- the database's series and what is stuck, judged; no row of its own", async (t) => {
  // The route reads the real clock: what is stuck is judged at the turn's.
  t.mock.timers.enable({ apis: ["Date"], now: LEDGER_NOW });
  const w = ledgerWorld();
  for (const [period, days] of [
    ["7d", 7],
    ["30d", 30],
    ["90d", 90],
  ]) {
    const page = await ledgerRoute.GET.run(req(`?period=${period}&workspace=${A}`), worldCtx(w));
    const r = await kernel.load(ledgerIn(worldCtx(w)), campaignLedgerReport, { days, end: null });
    assert.equal(JSON.stringify(r.data), JSON.stringify(page), `${period}: the route's payload, byte for byte`);
    assert.deepEqual(Object.keys(page), ["timezone", "today", "end", "days", "series", "stuck"]);
    assert.deepEqual([page.timezone, page.today, page.days], ["America/New_York", "2026-09-04", days]);
    assert.deepEqual(r.rows, [], "drawn on the Reports page, whose row the report names");
  }
  await assert.rejects(
    ledgerRoute.GET.run(req(`?period=14d&workspace=${A}`), worldCtx(w)),
    (e) => e.status === 400,
    "a period that is none of the four is refused at the door",
  );
});

test("the Campaigns lens' ledger carries the series as the database gave it, judges what is stuck by the product's own rules at the turn's clock, and says the number's health from the channel's stored config", async () => {
  const w = ledgerWorld();
  const r = await kernel.load(ledgerIn(worldCtx(w)), campaignLedgerReport, LENS);
  assert.deepEqual(r.data.series, ledgerAnswer({ p_days: 30 }), "the series, as the database gave it");

  const health = numberHealthOfConfig(RED_CONFIG);
  assert.deepEqual(
    r.data.stuck,
    {
      ...STUCK_NOW,
      number: {
        state: "read",
        tone: "danger",
        can_send: false,
        label: health.label,
        checked_at: "2026-09-04T12:30:00.000Z",
      },
    },
    "the world's stuck half, judged at its clock, with a red number beside it",
  );
  assert.equal(r.data.stuck.waiting.late, 1, "of the three runs waiting, only the one made for yesterday is refused");
  assert.equal(r.data.stuck.number.tone, "danger");
  assert.equal(r.data.stuck.number.can_send, false);

  // The clock is the turn's: one minute past Harbor's midnight, the run made for Sep 4 is late as well.
  const pastMidnight = new Date("2026-09-05T04:01:00Z");
  const later = await kernel.load(ledgerIn(worldCtx(w), "viewer", pastMidnight), campaignLedgerReport, LENS);
  assert.equal(later.data.stuck.waiting.late, 2, "judged at the turn's clock, in the workspace's zone");
  assert.deepEqual(later.data.series, r.data.series, "the series is the database's, whatever the clock");

  // A rating that is good, and a number Meta keeps standing against, are the gate's own words.
  const green = { quality_rating: "GREEN", quality_at: "2026-09-03T08:00:00.000Z" };
  const ok = await kernel.load(ledgerIn(worldCtx(ledgerWorld({}, numberOf(green)))), campaignLedgerReport, LENS);
  assert.deepEqual(ok.data.stuck.number, {
    state: "read",
    tone: "ok",
    can_send: true,
    label: numberHealthOfConfig(green).label,
    checked_at: "2026-09-03T08:00:00.000Z",
  });

  // The same good rating with Meta's standing against the number (BLOCKED, kept under the config's `standing`, 00338): the
  // whole stored config reaches the rule, so the lens says the number cannot send, as the composer's gate refuses it.
  const blocked = { ...green, standing: { can_send: "BLOCKED", problems: [], notes: [] } };
  const stopped = await kernel.load(ledgerIn(worldCtx(ledgerWorld({}, numberOf(blocked)))), campaignLedgerReport, LENS);
  assert.deepEqual(stopped.data.stuck.number, {
    state: "read",
    tone: "danger",
    can_send: false,
    label: numberHealthOfConfig(green).label,
    checked_at: "2026-09-03T08:00:00.000Z",
  });
  assert.deepEqual(
    [numberHealthOfConfig(blocked).tone, numberHealthOfConfig(blocked).canSend],
    ["danger", false],
    "and it is the rule's own answer for that config, not the rating's",
  );
});

test("the Campaigns lens' ledger on a database that does not have its functions yet (00405, 00406 not applied) answers 200 -- without campaign_ledger `series: null`, the window it was asked and what is stuck; without campaign_stuck `stuck: null` -- each said once in the log; any other refusal is still the route's failure", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: LEDGER_NOW });
  const noLedger = ledgerWorld({ campaign_ledger: ledgerGone });
  const { result: page, lines } = await logged("campaign_ledger_missing", () =>
    ledgerRoute.GET.run(req(`?workspace=${A}`), worldCtx(noLedger)),
  );
  assert.deepEqual(Object.keys(page), ["timezone", "today", "days", "series", "stuck"]);
  assert.equal(page.series, null);
  assert.deepEqual([page.timezone, page.today, page.days], ["America/New_York", "2026-09-04", 30]);
  assert.deepEqual(page.stuck.waiting, STUCK_NOW.waiting, "what is stuck does not need the function");
  assert.deepEqual(lines, [{ tenant_id: A }], "said once for the read, naming the workspace");

  const { result: r } = await logged("campaign_ledger_missing", () =>
    kernel.load(ledgerIn(worldCtx(noLedger)), campaignLedgerReport, LENS),
  );
  assert.deepEqual(r.data, page, "Ask's reader answers what the route does");

  // Days that ended before today name their last day in the answer, as the window was asked.
  const { result: ended } = await logged("campaign_ledger_missing", () =>
    kernel.load(ledgerIn(worldCtx(noLedger)), campaignLedgerReport, { days: 20, end: "2026-08-31" }),
  );
  assert.deepEqual(
    [ended.data.timezone, ended.data.today, ended.data.end, ended.data.days, ended.data.series],
    ["America/New_York", "2026-09-04", "2026-08-31", 20, null],
  );
  assert.deepEqual(ended.data.stuck, r.data.stuck, "what is stuck is as of now, whichever days are asked");

  // The zone is the workspace's (the turn's); one that cannot be read is the product's default, never the route's failure.
  const auckland = {
    ...noLedger,
    tables: { ...noLedger.tables, tenants: [{ ...noLedger.tables.tenants[0], timezone: "Pacific/Auckland" }] },
  };
  const { result: nz } = await logged("campaign_ledger_missing", () =>
    kernel.load(ledgerIn(worldCtx(auckland)), campaignLedgerReport, LENS),
  );
  assert.deepEqual(
    [nz.data.timezone, nz.data.today],
    ["Pacific/Auckland", "2026-09-05"],
    "Harbor's own day, ahead of UTC",
  );
  const unzoned = worldCtx(auckland, { "tenants.select": { message: "tenants down" } });
  const { result: lost } = await logged("campaign_ledger_missing", () =>
    kernel.load(ledgerIn(unzoned), campaignLedgerReport, LENS),
  );
  assert.deepEqual([lost.data.timezone, lost.data.series], [DEFAULT_TIMEZONE, null]);
  assert.notEqual(DEFAULT_TIMEZONE, "Pacific/Auckland");

  // Without campaign_stuck as well: nothing stuck is said, once.
  const neither = ledgerWorld({ campaign_ledger: ledgerGone, campaign_stuck: stuckGone });
  const { result: bare, lines: bareLines } = await logged("campaign_stuck_missing", () =>
    ledgerRoute.GET.run(req(`?workspace=${A}`), worldCtx(neither)),
  );
  assert.deepEqual(Object.keys(bare), ["timezone", "today", "days", "series", "stuck"]);
  assert.deepEqual([bare.series, bare.stuck], [null, null]);
  assert.deepEqual(bareLines, [{ tenant_id: A }], "the missing function is said once, and it is not a failure");
  const { lines: bareLedger } = await logged("campaign_ledger_missing", () =>
    ledgerRoute.GET.run(req(`?workspace=${A}`), worldCtx(neither)),
  );
  assert.deepEqual(bareLedger, [{ tenant_id: A }], "and the ledger's, once beside it");
  // And with the ledger there: the window is the database's, and the stuck half is the one missing.
  const noStuck = ledgerWorld({ campaign_stuck: stuckGone });
  const { result: half } = await logged("campaign_stuck_missing", () =>
    ledgerRoute.GET.run(req(`?workspace=${A}`), worldCtx(noStuck)),
  );
  assert.deepEqual(half.series, ledgerAnswer({ p_days: 30 }));
  assert.equal(half.stuck, null);
  assert.equal("stuck_failed" in half, false, "a function the database lacks is no failure");

  // A different code is not this window: the route fails as it does for any read that cannot be made.
  const denied = ledgerWorld({ campaign_ledger: refusedFunction("campaign_ledger") });
  const unsaid = await logged("campaign_ledger_missing", async () => {
    await assert.rejects(ledgerRoute.GET.run(req(`?workspace=${A}`), worldCtx(denied)), /permission denied/);
  });
  assert.deepEqual(unsaid.lines, [], "and the log does not call it the missing function");
});

test("the Campaigns lens' ledger: a function with no workspace is the route's 404 in its words, and a read that fails is its failure -- not found and could not read are two answers", async () => {
  const unknown = ledgerWorld({ campaign_ledger: () => ({ error: "unknown_tenant" }) });
  await assert.rejects(kernel.load(turnIn(worldCtx(unknown)), campaignLedgerReport, LENS), noReport);
  await assert.rejects(ledgerRoute.GET.run(req(`?workspace=${A}`), worldCtx(unknown)), noReport);
  // An answer short of a part the lens is made of is no answer either.
  const short = ledgerWorld({ campaign_ledger: (a) => ({ ...ledgerAnswer(a), runs: null }) });
  await assert.rejects(kernel.load(turnIn(worldCtx(short)), campaignLedgerReport, LENS), noReport);
  const down = ledgerWorld({
    campaign_ledger: () => {
      throw new Error("connection refused");
    },
  });
  const failed = /campaign_ledger: connection refused/;
  await assert.rejects(kernel.load(turnIn(worldCtx(down)), campaignLedgerReport, LENS), failed);
  await assert.rejects(ledgerRoute.GET.run(req(`?workspace=${A}`), worldCtx(down)), failed);
});

test("the Campaigns lens' ledger never fails for what is stuck: campaign_stuck failing, or answering what is no list of runs, replies and templates, leaves `stuck: null` and `stuck_failed: true` -- said once in the log with the workspace -- and the series is answered", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: LEDGER_NOW });
  const down = ledgerWorld({
    campaign_stuck: () => {
      throw new Error("connection refused");
    },
  });
  const { result: page, lines } = await logged("campaign_stuck_failed", () =>
    ledgerRoute.GET.run(req(`?workspace=${A}`), worldCtx(down)),
  );
  assert.deepEqual(Object.keys(page), ["timezone", "today", "end", "days", "series", "stuck", "stuck_failed"]);
  assert.equal(page.stuck, null);
  assert.equal(page.stuck_failed, true);
  assert.deepEqual(page.series, ledgerAnswer({ p_days: 30 }), "and the rest of the lens is answered");
  assert.equal(lines.length, 1, "logged once, never fatal");
  assert.equal(lines[0].tenant_id, A);
  assert.match(lines[0].error, /campaign_stuck: connection refused/);

  const { result: r } = await logged("campaign_stuck_failed", () =>
    kernel.load(ledgerIn(worldCtx(down)), campaignLedgerReport, LENS),
  );
  assert.equal(JSON.stringify(r.data), JSON.stringify(page), "Ask's reader answers what the route does");

  // An answer that is not the four lists (the database's own `{ error }`) is a failed read as well, and so is a refusal.
  for (const stuck of [
    () => ({ error: "unknown_tenant" }),
    () => ({ ...NOTHING_STUCK, replies: [null] }),
    refusedFunction("campaign_stuck"),
  ]) {
    const said = await logged("campaign_stuck_failed", () =>
      kernel.load(ledgerIn(worldCtx(ledgerWorld({ campaign_stuck: stuck }))), campaignLedgerReport, LENS),
    );
    assert.deepEqual([said.result.data.stuck, said.result.data.stuck_failed], [null, true]);
    assert.equal(said.lines.length, 1);
    assert.deepEqual(said.result.data.series, ledgerAnswer({ p_days: 30 }));
  }
  const refused = await logged("campaign_stuck_missing", () =>
    kernel.load(
      ledgerIn(worldCtx(ledgerWorld({ campaign_stuck: refusedFunction("campaign_stuck") }))),
      campaignLedgerReport,
      LENS,
    ),
  );
  assert.deepEqual(refused.lines, [], "a refusal is a failure, not the missing function");

  // Nothing stuck is an answer: every list empty, which is a zero, and not a failure.
  const quiet = await kernel.load(
    ledgerIn(worldCtx(ledgerWorld({ campaign_stuck: () => NOTHING_STUCK }))),
    campaignLedgerReport,
    LENS,
  );
  assert.equal("stuck_failed" in quiet.data, false);
  assert.equal(quiet.data.stuck.waiting.n, 0);
});

test("the Campaigns lens' ledger says the number apart from the rest: none with no active WhatsApp number, unread when the channels cannot be read -- said once in the log -- and when it was checked is the newest of the dates its config keeps", async () => {
  const numberAt = async (channels) =>
    (await kernel.load(ledgerIn(worldCtx(ledgerWorld({}, channels))), campaignLedgerReport, LENS)).data.stuck.number;
  assert.deepEqual(await numberAt([]), { state: "none" });
  assert.deepEqual(await numberAt(numberOf(RED_CONFIG, { status: "disabled" })), { state: "none" }, "a stopped number");
  assert.deepEqual(await numberAt(numberOf(RED_CONFIG, { kind: "sms" })), { state: "none" }, "another wire");

  const down = worldCtx(ledgerWorld(), { "tenant_channels.select": { message: "channels down" } });
  const { result: r, lines } = await logged("campaign_number_failed", () =>
    kernel.load(ledgerIn(down), campaignLedgerReport, LENS),
  );
  assert.deepEqual(r.data.stuck.number, { state: "unread" });
  assert.deepEqual(
    r.data.stuck.waiting,
    STUCK_NOW.waiting,
    "each half fails alone: the rest of what is stuck is answered",
  );
  assert.deepEqual(r.data.series, ledgerAnswer({ p_days: 30 }));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].tenant_id, A);
  assert.match(lines[0].error, /channels down/);

  // When it was checked: the newest of the three dates that parse; a value that is no date is nothing.
  const green = { quality_rating: "GREEN" };
  for (const [config, checked] of [
    [green, null],
    [{ ...green, quality_at: "2026-09-03T08:00:00.000Z" }, "2026-09-03T08:00:00.000Z"],
    [RED_CONFIG, "2026-09-04T12:30:00.000Z"],
    [{ ...RED_CONFIG, quality_read_at: "2026-09-04T15:00:00.000Z" }, "2026-09-04T15:00:00.000Z"],
    [{ ...RED_CONFIG, standing_read_at: "yesterday", quality_read_at: 5 }, "2026-09-03T08:00:00.000Z"],
    [{ ...green, quality_read_at: "never", standing_read_at: null, quality_at: 0 }, null],
  ]) {
    const number = await numberAt(numberOf(config));
    assert.equal(number.checked_at, checked, JSON.stringify(config));
    assert.equal(number.tone, numberHealthOfConfig(config).tone);
  }
});

test("the Campaigns lens' ledger asks the database what it was asked: campaign_ledger over the window, with its last day named only where it is not today, and campaign_stuck for the workspace alone, as of now", async () => {
  const ctx = worldCtx(ledgerWorld());
  const ended = await kernel.load(ledgerIn(ctx), campaignLedgerReport, { days: 20, end: "2026-08-31" });
  assert.deepEqual(
    ctx.supabase.seen.filter((q) => q.rpc),
    [
      { rpc: "campaign_ledger", args: { p_tenant_id: A, p_days: 20, p_end: "2026-08-31" } },
      { rpc: "campaign_stuck", args: { p_tenant_id: A } },
    ],
    "the database counts the 20 days to the 31st, and what is stuck is asked of no window",
  );
  assert.deepEqual([ended.data.end, ended.data.days], ["2026-08-31", 20]);
  const live = await kernel.load(ledgerIn(worldCtx(ledgerWorld())), campaignLedgerReport, LENS);
  assert.deepEqual(ended.data.stuck, live.data.stuck, "what is stuck is the same as of now, whichever days are asked");

  const today = worldCtx(ledgerWorld());
  await kernel.load(ledgerIn(today), campaignLedgerReport, LENS);
  assert.deepEqual(
    today.supabase.seen.filter((q) => q.rpc),
    [
      { rpc: "campaign_ledger", args: { p_tenant_id: A, p_days: 30 } },
      { rpc: "campaign_stuck", args: { p_tenant_id: A } },
    ],
    "a period names no last day",
  );
});

test("the Campaigns lens' ledger reads each of its things once in a turn: the series, what is stuck and the channels; a turn that keeps (Ask) reads them again, for what is stuck is judged at its own clock", async () => {
  const ctx = worldCtx(ledgerWorld());
  const rc = ledgerIn(ctx);
  await kernel.load(rc, campaignLedgerReport, LENS);
  await kernel.load(rc, campaignLedgerReport, LENS);
  for (const q of ["rpc:campaign_ledger", "rpc:campaign_stuck", "tenant_channels.select"])
    assert.equal(asked(ctx).filter((x) => x === q).length, 1, `${q}: once`);

  assert.equal(campaignLedgerReport.ttlMs, undefined, "a route reads it fresh, and a turn keeps its own");
  const keeps = () =>
    kernel.readerContext(worldCtx(ledgerWorld()), { tenantId: A, role: "viewer" }, LEDGER_CLOCK, { keep: true });
  const [first, next] = [keeps(), keeps()];
  for (const turn of [first, next]) await kernel.load(turn, campaignLedgerReport, LENS);
  assert.deepEqual(
    [first, next].map((turn) => turn.ctx.supabase.seen.filter((q) => q.rpc === "campaign_stuck").length),
    [1, 1],
    "the next turn read it too",
  );
});

test("the Campaigns lens' ledger is the workspace's, not the member's: the same answer for a viewer, an owner and the teammate whose thread is among the replies", async () => {
  const w = ledgerWorld();
  const viewer = await kernel.load(ledgerIn(worldCtx(w)), campaignLedgerReport, LENS);
  const owner = await kernel.load(
    kernel.readerContext({ ...worldCtx(w), userId: "u2" }, { tenantId: A, role: "owner" }, LEDGER_CLOCK),
    campaignLedgerReport,
    LENS,
  );
  const teammate = await kernel.load(
    kernel.readerContext({ ...worldCtx(w), userId: "user-teammate" }, { tenantId: A, role: "operator" }, LEDGER_CLOCK),
    campaignLedgerReport,
    LENS,
  );
  assert.equal(JSON.stringify(owner.data), JSON.stringify(viewer.data));
  assert.equal(JSON.stringify(teammate.data), JSON.stringify(viewer.data));
  assert.equal(
    viewer.data.stuck.replies.n,
    2,
    "the teammate's own thread is no one's but the teammate's; two wait on a person",
  );
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
      // The record holds nothing for this workspace: the feed's taken time alone.
      taken: async () => [],
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

  // A booking that arrived by email (00345) is the reader's to read, under the caller's RLS, and is left out beside
  // the feed's, as the receptionist leaves it out: one to two that Wednesday afternoon, New York. A cancelled one is
  // not taken time.
  await withFeed({ body: WEDNESDAY_TAKEN }, async () => {
    const emailed = (id, from, to, status) => ({
      id,
      tenant_id: A,
      source: "booking_email",
      tool: "booksy",
      external_id: `booksy:${id}`,
      status,
      starts_at: from,
      ends_at: to,
      all_day: false,
      timezone: "America/New_York",
    });
    const t = {
      ...calTables("https://cal.example/open.ics"),
      appointments: [
        emailed("appt-1", "2026-09-09T17:00:00.000Z", "2026-09-09T18:00:00.000Z", "booked"),
        emailed("appt-2", "2026-09-09T19:00:00.000Z", "2026-09-09T20:00:00.000Z", "cancelled"),
      ],
    };
    const read = await kernel.load(calIn(calCtx(t)), openingsReader, { day: "2026-09-09", service: null });
    assert.deepEqual(
      read.data.openings.days.map((d) => d.windows),
      [["12:00 PM–1:00 PM", "2:00 PM–6:00 PM"]],
      "the emailed hour is left out; the cancelled one is open",
    );
  });
});

test("GET ask/openings through its reader asks what it asked at origin/main, in the same order -- the workspace's door, the zone, then the settings, now through the config reader's columns -- and a turn that holds the zone and the settings reads neither again", async () => {
  const bare = { memberships: reportMembers(), tenants: [], tenant_config: [] };
  const ctx = dayCtx(bare);
  await openingsRoute.GET.run(req(`?workspace=${A}`), ctx);
  assert.deepEqual(
    ctx.supabase.seen.map((q) => (q.rpc ? [`rpc:${q.rpc}`, null] : [`${q.table}.${q.op}`, q.columns])),
    [
      ["memberships.select", "tenant_id, role, tenants (slug, name, timezone)"],
      ["tenants.select", "name, timezone"],
      // At origin/main (c39ce689), the one column: config.
      ["tenant_config.select", "tenant_id, config, version, updated_at, updated_by"],
      // No settings row in this world, so the door after the table (00366, workspace/config-row.ts).
      ["rpc:tenant_config_read", null],
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

test("the business's shape (readers/facts.ts businessShape): how its customers buy, the word it derives, and whether bookings arrive by a tool's emails", async () => {
  const t = calTables(null);
  t.tenants[0].sells_by = "proposal";
  t.tenant_config[0].config.bookings = { tool: "booksy" };
  const r = await kernel.load(turnIn(ctxFor(t)), businessShape, undefined);
  assert.deepEqual(r.data, { sellsBy: "proposal", dealsOn: true, word: "meeting", bookingsByEmail: true });
  assert.deepEqual(r.rows, [], "no row of its own");
  const bare = await kernel.load(turnIn(ctxFor(calTables(null))), businessShape, undefined);
  assert.deepEqual(bare.data, { sellsBy: null, dealsOn: false, word: "appointment", bookingsByEmail: false });
  const unreadable = calTables(null);
  unreadable.tenant_config = [];
  const none = await kernel.load(turnIn(ctxFor(unreadable)), businessShape, undefined);
  assert.equal(none.data.bookingsByEmail, false, "no settings row: no booking tool, and the shape still answers");
  const down = await kernel.load(
    turnIn({ ...ctxFor(t), supabase: fakeDb(t, { "tenant_config.select": { message: "config down" } }) }),
    businessShape,
    undefined,
  );
  assert.deepEqual(
    down.data,
    { sellsBy: "proposal", dealsOn: true, word: "meeting", bookingsByEmail: false },
    "settings that cannot be read cost the booking tool's word, never the shape",
  );
  // A turn that holds how its customers buy and the settings reads neither again.
  const turn = turnIn(ctxFor(t));
  await Promise.all([sellsBy, config].map((x) => kernel.load(turn, x, undefined)));
  const held = turn.ctx.supabase.seen.length;
  await kernel.load(turn, businessShape, undefined);
  assert.equal(turn.ctx.supabase.seen.length, held, "the turn's own reads");
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
  // 3 Oct 2026: what the workspace can send on now, which who can be sent what is judged against (contracts reach-any.ts).
  "channels_ready",
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
  assert.deepEqual(harbor.data.page, { q: null, offset: 0, limit: 1000, total: 0, has_more: false, next: null });
  assert.deepEqual(
    harbor.rows.map((x) => x.label),
    ["Ada", "Ada"],
  );
  const found = await kernel.load(turnIn(worldCtx(pagingWorld())), peopleReader, { q: "bo", offset: 0 });
  assert.deepEqual(
    [found.data.people.map((p) => p.id), found.data.page],
    [[P2], { q: "bo", offset: 0, limit: 1000, total: 1, has_more: false, next: null }],
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
 * 7 Oct 2026: the follow-up's template is read as its message, whatever its channels (db messageVersionRowsOf: the rows of its
 * name and language, which contracts campaignMessageOf picks the versions out of), where it was Meta's row alone.
 */
const MESSAGE_ROWS_ASKED =
  "id, channel, name, language, meta_status, category, variables, hidden_at, title, source, components, body_preview, rejected_reason";
/**
 * Every query GET contacts asked at origin/main (e3184cff) for peopleWorld's first page, in order, with the columns it
 * selected (and, since 3 Oct 2026, the two reads of what the workspace can send on). The workspace's door. The first stage at once: the page and how many match, then the page's reply modes.
 * The second at once: how the workspace's customers buy, the calendar's zone and settings (the feed itself is fetched,
 * never read from the database), who each step is for, the pace; then, once sells_by says deals are on, the proposal
 * follow-up's facts -- its playbook, its class, the workspace, its number, the proposals out, its template, and the
 * runs that touched them.
 */
const PEOPLE_ASKED_AT_MAIN = [
  ["memberships.select", "tenant_id, role, tenants (slug, name, timezone)"],
  ["rpc:people_list", null],
  ["contacts.select", "id"],
  ["policies.select", "subject_type, subject_id, mode"],
  ["tenants.select", "sells_by"],
  ["tenants.select", "name, timezone"],
  ["tenant_config.select", "config"],
  // 7 Oct 2026 (00349): what the member asking has seen of each person on the page (server/people/person-seen.ts), for
  // the rows that say who is new to them: one call to the door, with the page's other reads of its rows.
  ["rpc:contact_seen", null],
  ["rpc:team_roster", null],
  // 3 Oct 2026: what the workspace can send on, with the first page (readers/facts.ts channelsReady): its WhatsApp
  // number, and its texting line. The mailbox is read only where the deployment has an email domain.
  ["tenant_channels.select", "config, number_e164"],
  ["lines.select", "sms_state, reg_mock"],
  ["deals.select", "id, stage, proposed_at, decided_at"],
  ["sequence_steps.select", "id, state, run_hour, last_run_for, until, template_name, template_language"],
  ["policies.select", "mode"],
  ["tenants.select", "status"],
  ["tenant_channels.select", "config, number_e164"],
  ["deals.select", "id, contact_id, proposed_at"],
  // 3 Oct 2026: the channels the follow-up ticks (db playbookChannels), beside its template: the number and Meta's
  // approval stop only a follow-up that goes by WhatsApp.
  ["sequence_steps.select", "channels"],
  // 11 Oct 2026 (0002's readers): the record over the feed's season, joined to it: a booking's rows whole, and the
  // feed's rows as ids and statuses by key (db visitsOver).
  ["appointments.select", "*"],
  ["appointments.select", "id, status, external_id, starts_at"],
  ["templates.select", MESSAGE_ROWS_ASKED],
  ["tenants.select", "timezone"],
  ["tenants.select", "timezone"],
  ["sequence_batches.select", "id, playbook_id:step_id, state, scheduled_for, created_at, run_for, params"],
  ["sequence_batches.select", "id, playbook_id:step_id, state, scheduled_for, created_at, run_for, params"],
  // 6 Oct 2026: a follow-up's touches carry the deal and the link it was about (0029), the two keys of its words read.
  [
    "sequence_sends.select",
    "broadcast_id:batch_id, contact_id, sent_at, state, proposal_link:facts->>proposal_link, proposal_deal:facts->>deal_id",
  ],
  [
    "sequence_sends.select",
    "broadcast_id:batch_id, contact_id, sent_at, state, proposal_link:facts->>proposal_link, proposal_deal:facts->>deal_id",
  ],
];
/**
 * The same queries in the order they reach the database since 2 Oct 2026: what is read of the workspace -- how its
 * customers buy, the calendar's zone and settings, the pace -- and the page's reply modes no longer wait for the page's
 * rows, a round trip each time; they leave with the page and its count. Then, once sells_by says deals are on, the
 * follow-up's facts; and once the rows are in, who each step is for.
 */
const PEOPLE_ASKED_NOW = [
  ["memberships.select", "tenant_id, role, tenants (slug, name, timezone)"],
  ["rpc:people_list", null],
  ["tenants.select", "sells_by"],
  ["tenant_channels.select", "config, number_e164"],
  ["lines.select", "sms_state, reg_mock"],
  ["tenants.select", "name, timezone"],
  ["tenant_config.select", "config"],
  ["deals.select", "id, stage, proposed_at, decided_at"],
  ["policies.select", "subject_type, subject_id, mode"],
  ["contacts.select", "id"],
  ["sequence_steps.select", "id, state, run_hour, last_run_for, until, template_name, template_language"],
  ["policies.select", "mode"],
  ["tenants.select", "status"],
  ["tenant_channels.select", "config, number_e164"],
  ["deals.select", "id, contact_id, proposed_at"],
  ["rpc:contact_seen", null],
  ["rpc:team_roster", null],
  ["sequence_steps.select", "channels"],
  // 11 Oct 2026 (0002's readers): the record over the feed's season, joined to it: a booking's rows whole, and the
  // feed's rows as ids and statuses by key (db visitsOver).
  ["appointments.select", "*"],
  ["appointments.select", "id, status, external_id, starts_at"],
  ["templates.select", MESSAGE_ROWS_ASKED],
  ["tenants.select", "timezone"],
  ["tenants.select", "timezone"],
  ["sequence_batches.select", "id, playbook_id:step_id, state, scheduled_for, created_at, run_for, params"],
  ["sequence_batches.select", "id, playbook_id:step_id, state, scheduled_for, created_at, run_for, params"],
  // 6 Oct 2026: a follow-up's touches carry the deal and the link it was about (0029), the two keys of its words read.
  [
    "sequence_sends.select",
    "broadcast_id:batch_id, contact_id, sent_at, state, proposal_link:facts->>proposal_link, proposal_deal:facts->>deal_id",
  ],
  [
    "sequence_sends.select",
    "broadcast_id:batch_id, contact_id, sent_at, state, proposal_link:facts->>proposal_link, proposal_deal:facts->>deal_id",
  ],
];
/**
 * The record's reads beside the rest (0002's readers): a reader asks for the record beside the feed, so where its two
 * reads land among the others is the stand-in's to say. The others in their order, and the record's apart.
 */
const recordApart = (asked) => {
  const isRecord = (q) => (Array.isArray(q) ? q[0] : q) === "appointments.select";
  return [asked.filter((q) => !isRecord(q)), asked.filter(isRecord)];
};
/** A list of queries as a bag: the same reads, whatever their order. */
const bagOf = (asked) => asked.map((q) => JSON.stringify(q)).sort();
/** Every query in the order it reached the database, with the columns a select asked for. */
const askedWith = (ctx) =>
  ctx.supabase.seen.map((q) => (q.rpc ? [`rpc:${q.rpc}`, null] : [`${q.table}.${q.op}`, q.columns]));
/** The config reader's columns (getTenantConfig), where the calendar's own lookup asked for the one, config. */
const CONFIG_READER_COLUMNS = "tenant_id, config, version, updated_at, updated_by";

test("GET contacts through its reader asks what it asked at origin/main -- the page, its count and everything read of the workspace at once, then the follow-up's facts and who each step is for -- the settings now through the config reader's columns and sells_by through its reader; a turn that holds the zone, the settings and sells_by reads none of them again", async () => {
  await withFeed({ body: ONE_ICS }, async () => {
    const asConfigReader = (list) =>
      list.map(([k, cols]) => [k, k === "tenant_config.select" ? CONFIG_READER_COLUMNS : cols]);
    const want = asConfigReader(PEOPLE_ASKED_NOW);
    assert.deepEqual(bagOf(want), bagOf(asConfigReader(PEOPLE_ASKED_AT_MAIN)), "no read added and none lost");
    // One world for every request below: its times are read from the clock once.
    const w = peopleWorld();
    const routed = worldCtx(w);
    const page = await contactsRoute.GET.run(req(`?workspace=${A}`), routed);
    assert.deepEqual(recordApart(askedWith(routed)), recordApart(want), "the workspace's door, then the reads");
    const ctx = worldCtx(w);
    const r = await kernel.load(turnIn(ctx), peopleReader, { q: null, offset: 0 });
    assert.deepEqual(r.data, page, "the route's payload");
    assert.deepEqual(recordApart(askedWith(ctx)), recordApart(want.slice(1)));
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
    assert.deepEqual(
      recordApart(askedWith(searched)),
      recordApart(
        want
          .slice(1)
          .filter(
            ([k, cols]) =>
              !/^(sequence_steps|tenant_channels|lines|templates|sequence_batches|sequence_sends)\./.test(k) &&
              !(k === "deals.select") &&
              !(k === "policies.select" && cols === "mode") &&
              !(k === "tenants.select" && /^(status|timezone)$/.test(cols)),
          ),
      ),
      "the same, less the pace and the follow-up",
    );
    // A turn that already holds the zone, the settings and how the customers buy is asked for none of them again.
    const turn = turnIn(worldCtx(w));
    await Promise.all([facts, config, sellsBy].map((x) => kernel.load(turn, x, undefined)));
    const held = turn.ctx.supabase.seen.length;
    await kernel.load(turn, peopleReader, { q: null, offset: 0 });
    const heldWant = want
      .slice(1)
      .filter(([k, cols]) => k !== "tenant_config.select" && !(k === "tenants.select" && /sells_by|name/.test(cols)));
    // The follow-up's reads wait on the business's zone (its last day is judged by it: S1-3), which the turn holds but hands
    // over a moment later: they reach the database after who each step is for, in the order the page asks them.
    assert.deepEqual(
      recordApart(askedWith(turn.ctx).slice(held)),
      recordApart(heldWant),
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
      lines,
      // The settings come through the config reader now (getTenantConfig), which names itself in its failure.
      [{ tenant_id: A, error: "getTenantConfig: config down" }],
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

test("the lists, for Ask and for the page: GET segments answers its reader's payload over people-routes' fixture in both workspaces -- every list of the one workspace read, with every member -- and each list a row a citation names, opened on People at that list", async () => {
  for (const [tenant, want] of [
    [A, [{ id: SEG1, name: "Regulars", ids: [P1], rule: null, archived_at: null }]],
    [B, [{ id: SEG2, name: "VIP", ids: [P2], rule: null, archived_at: null }]],
  ]) {
    const page = await segmentsRoute.GET.run(req(`?workspace=${tenant}`), worldCtx(segmentsWorld()));
    const ctx = worldCtx(segmentsWorld());
    const r = await kernel.load(turnIn(ctx, tenant), listsReader, undefined);
    assert.deepEqual(r.data, page, "the route's payload");
    assert.deepEqual(r.data, { lists: want });
    assert.deepEqual(
      r.rows,
      want.map((l) => ({ kind: "list", id: l.id, route: `clients/list:${l.id}`, label: l.name })),
    );
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

test("the broadcasts, for Ask and for the page: GET broadcasts answers its reader's payload over outbound-routes' two fixtures -- the recent fifty with what their messages earned, whether older ones exist, and who a run reached within the week of the turn's clock -- and each broadcast a row a citation names, opened where its address spells it, a run", async () => {
  for (const [w, tenant] of [
    [bcWorld(), A],
    [bcWorld(), B],
    [touchedWorld(), A],
  ]) {
    const page = await broadcastsRoute.GET.run(req(`?workspace=${tenant}`), worldCtx(w));
    const r = await kernel.load(turnIn(worldCtx(w), tenant), broadcastsReader, undefined);
    assert.deepEqual(r.data, page, "the route's payload");
    assert.equal(JSON.stringify(r.data), JSON.stringify(page), "byte for byte");
    // 3 Oct 2026: and whether each channel can send now (`ready`, server/campaigns/channels-ready.ts), which the composer's
    // Send by row is drawn from; these workspaces keep no WhatsApp number, so it says so.
    assert.deepEqual(Object.keys(r.data), [
      "broadcasts",
      "more",
      "touched_at",
      "ready",
      "month_sent",
      "month_sent_next",
      "open_to_customers",
    ]);
    // 13 Oct 2026: and whether the workspace is open to its customers (contracts openToCustomersOf), which the card that
    // gets a yes reads: these workspaces are active, with no plan on record, so open.
    assert.equal(r.data.open_to_customers, "open");
    assert.equal(r.data.ready.whatsapp.why, "Connect a WhatsApp number first.");
    assert.deepEqual(
      r.data.month_sent,
      MONTH_SENT,
      "the month's emails and texts, for the head and the composer to say",
    );
    // 4 Oct 2026: and the month after, with the instant it begins by the workspace's clock, which a send set to go past the
    // month's end counts against (contracts monthSentAt): the composer reads the month at the time it is set for.
    assert.deepEqual(r.data.month_sent_next.sent, MONTH_SENT);
    assert.ok(r.data.month_sent_next.from > Date.now(), "the next month begins ahead");
    assert.ok(
      r.data.month_sent_next.from - Date.now() < 32 * 24 * HOUR,
      "within thirty-one days: the very next month's first moment",
    );
    assert.deepEqual(r.data.ready.paused, undefined, "a workspace that is not paused says nothing of it");
    assert.deepEqual(
      r.rows,
      r.data.broadcasts.map((b) => ({ kind: "broadcast", id: b.id, route: `broadcasts/run:${b.id}`, label: b.name })),
    );
  }
  // What outbound-routes asserts of the route, of the reader.
  const harbor = (await kernel.load(turnIn(worldCtx(bcWorld())), broadcastsReader, undefined)).data;
  assert.deepEqual(
    [harbor.broadcasts.map((b) => b.id), harbor.broadcasts[0].counts.sent, harbor.broadcasts[0].counts.delivered],
    [[BC2, BC1], 1, 1],
  );
  // 11 Oct 2026: who heard and when (`touched_at`, every message's time), so the composer judges a send by those within a
  // week of the time it is set for, either side (contracts heardFor).
  const touched = (await kernel.load(turnIn(worldCtx(touchedWorld())), broadcastsReader, undefined)).data.touched_at;
  assert.deepEqual(Object.keys(touched), ["k1"], "sent this week; not held back, not canceled, not last month");
  assert.equal(touched.k1.length, 1);
  const at = Date.parse(touched.k1[0]);
  assert.ok(at <= Date.now() && Date.now() - at < 2 * HOUR, `when it went, an hour ago: ${touched.k1}`);
  // The week is the turn's: at a clock eight days on, the run of an hour ago is last week's.
  const later = kernel.readerContext(
    worldCtx(touchedWorld()),
    { tenantId: A, role: "viewer" },
    new Date(Date.now() + 8 * 24 * HOUR),
  );
  assert.deepEqual((await kernel.load(later, broadcastsReader, undefined)).data.touched_at, {});
});

test("the month a page says is null where it could not be counted, said in the log, and never a month of nothing: both pages still answer", async () => {
  setServiceClient(
    fakeDb(
      {},
      {},
      {
        campaign_month_sent: () => {
          throw new Error("the database is down");
        },
      },
    ),
  );
  try {
    const { result, lines } = await logged("campaign_month_failed", () =>
      broadcastsRoute.GET.run(req(`?workspace=${A}`), worldCtx(bcWorld())),
    );
    assert.equal(result.month_sent, null);
    assert.equal(result.month_sent_next.sent, null, "nor is the month after a month of nothing");
    assert.equal(typeof result.month_sent_next.from, "number", "where it begins is the clock's, counted or not");
    assert.equal(result.broadcasts.length > 0, true, "the page is read all the same");
    assert.equal(lines.length, 2, "one line for each of the two months' reads");
    assert.match(String(lines[0].error), /cannot count the month's email campaign messages: the database is down/);
  } finally {
    setServiceClient(fakeDb({}, {}, { campaign_month_sent: ({ p_channel }) => MONTH_SENT[p_channel] }));
  }
});

test("a paused workspace is said by the readiness the composers and the Campaigns home read -- the broadcasts' and the playbooks' -- and by People's reads never: it changes what is sent, not who can hear the business", async () => {
  const paused = (w) => {
    w.tables.tenants = [{ id: A, name: "Harbor", timezone: "America/New_York", status: "paused", sells_by: null }];
    return w;
  };
  const read = async (w, reader) => (await kernel.load(turnIn(worldCtx(w)), reader, undefined)).data;
  const bc = await read(paused(bcWorld()), broadcastsReader);
  assert.equal(bc.ready.paused, true, "the composer says the pause where Send would be");
  assert.deepEqual(
    ["whatsapp", "sms", "email"].map((c) => typeof bc.ready[c].ready),
    ["boolean", "boolean", "boolean"],
    "and the channels are as they were: what each can do",
  );
  const active = bcWorld();
  active.tables.tenants = [{ id: A, name: "Harbor", timezone: "America/New_York", status: "active", sells_by: null }];
  assert.equal(
    "paused" in (await read(active, broadcastsReader)).ready,
    false,
    "an active workspace says nothing of it",
  );
  const pb = await read(paused(playbooksWorld()), playbooksReader);
  assert.equal(pb.ready.paused, true, "the playbooks' page says it too: its cards and the home's rows promise no time");
  // People's reads ask for no such thing: the facts' channelsReady carries the channels alone.
  const people = await read(paused(bcWorld()), channelsReadyReader);
  assert.equal("paused" in people, false);
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
  assert.deepEqual(r.rows, [
    { kind: "broadcast", id: BC1, route: `broadcasts/run:${BC1}`, label: r.data.broadcast.name },
  ]);
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
    // The rows say who can be sent what against what the workspace sends on (3 Oct 2026), read as the reader reads it.
    const ready = await channelsReadyOrNull(worldCtx(w), A);
    const want = await audiencePoolOf(worldCtx(w), A, "America/New_York", CAL_NOW, ready);
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
    assert.deepEqual(recordApart(asked(turn.ctx).slice(held)), [
      ["tenant_channels.select", "lines.select", "rpc:people_list", "policies.select"],
      // The record over the feed's season (0002's readers): a booking's rows, and the feed's rows by key.
      ["appointments.select", "appointments.select"],
    ]);
    // The settings are read only where the pool's calendar lookup would read them: one that fails costs the visits,
    // said once in the log, as server/people/audience.ts's own lookup costs them -- never the pool.
    const down = { "tenant_config.select": { message: "config down" } };
    const { result: blind, lines } = await logged("people_visits_failed", () =>
      kernel.load(calIn(worldCtx(w, down)), audiencePoolReader, undefined),
    );
    const { result: blindWant } = await logged("people_visits_failed", () =>
      audiencePoolOf(worldCtx(w, down), A, "America/New_York", CAL_NOW, ready),
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
const PLAYBOOKS_KEYS = [
  "playbooks",
  "timezone",
  // 11 Oct 2026: `touched` left the answer; no client read it, and who the breath holds is in each pool's `held`.
  "pools",
  "calendar",
  "lists",
  "people_lists",
  "deals_on",
  // 3 Oct 2026: whether each channel can send now, which the pools were counted against (server/campaigns/channels-ready.ts),
  // and what its campaigns have sent by email and by text this month (server/campaigns/month-sent.ts).
  "ready",
  "month_sent",
  // 9 Oct 2026 (spec 2026-10-09 §4.8): what the workspace calls an appointment, and whether its bookings arrive by a tool's
  // emails (readers/facts.ts businessShape), which the home's moments are said and counted by.
  "appointment_word",
  "bookings_by_email",
  // 9 Oct 2026 (spec 2026-10-09 §4.3, decision 7): each autonomy class's mode as stored (readers/facts.ts policies), so a
  // Resume asked on Campaigns says in full that a campaign under `auto` sends on its own.
  "modes",
];
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
  tables: {
    ...calTables(null, "owner"),
    playbooks: [],
    templates: [],
    // With its WhatsApp number: the pools are counted against what each channel can send on now (step 3), and a workspace
    // with none has nobody a run can reach.
    tenant_channels: [{ tenant_id: A, kind: "whatsapp", status: "active", config: {} }],
    ...extra,
  },
  rpcs: { people_list: people },
});
test("Today's pins are counted on the server by the rule People's rail counts by, for the member asking (the wiring's second audit, R10): each token its list's count, a list kept by hand its members, and null for a list this workspace can't count or a token that names none", async () => {
  const LIST = "cccccccc-3333-4333-8333-cccccccccccc";
  const people = [
    poolPerson(1),
    poolPerson(2),
    // Heard an hour ago: on no quiet list.
    poolPerson(3, { last_inbound_at: ago(HOUR), latest_wa_inbound_at: ago(HOUR) }),
    poolPerson(4, { marketing_consent: "opted_out" }),
  ];
  const world = () =>
    countsWorld(pagedPeople(people), {
      segments: [{ id: LIST, tenant_id: A, name: "Regulars", rule: null, archived_at: null }],
      segment_members: [
        { tenant_id: A, segment_id: LIST, contact_id: "p1" },
        { tenant_id: A, segment_id: LIST, contact_id: "p4" },
      ],
    });
  const tokens = ["seg:quiet", "seg:opted_in", "seg:offers_ok", `list:${LIST}`, "seg:booked_week", "seg:nothing_here"];
  const { counts } = await listCountsRoute.GET.run(req(`?workspace=${A}&lists=${tokens.join(",")}`), worldCtx(world()));
  // People's own count of each, as its rail makes it: its rows read the member's way (contracts poolRowOf, personRowOf's),
  // each built-in list's rule over them.
  const page = await contactsRoute.GET.run(req(`?workspace=${A}`), worldCtx(world()));
  const tz = "America/New_York";
  const rows = page.people.map((r) =>
    contracts.poolRowOf(r, { tz, now: new Date(), viewer: USER, dealsOn: page.deals_on, ready: page.channels_ready }),
  );
  const rail = (id) => rows.filter(contracts.PEOPLE_LISTS.find((l) => l.id === id).test).length;
  for (const id of ["quiet", "opted_in", "offers_ok"])
    assert.equal(counts[`seg:${id}`], rail(id), `seg:${id}: the rail's count, ${rail(id)}`);
  assert.deepEqual([rail("quiet"), rail("opted_in"), rail("offers_ok")], [3, 4, 3], "the fixture puts people on them");
  assert.equal(counts[`list:${LIST}`], 2, "a list kept by hand: its members");
  assert.equal(
    counts["seg:booked_week"],
    null,
    "a list that needs the calendar, where there is none: not counted here",
  );
  assert.equal(counts["seg:nothing_here"], null, "a token that names no list");
  // A token said twice is counted once, and no more than Today may pin are counted.
  const many = await listCountsRoute.GET.run(
    req(
      `?workspace=${A}&lists=${["seg:quiet", "seg:quiet", ...Array.from({ length: 12 }, (_, i) => `seg:l${i}`)].join(",")}`,
    ),
    worldCtx(world()),
  );
  assert.equal(Object.keys(many.counts).length, contracts.TODAY_PINS_MAX);
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

test("the playbooks, for Ask and for the page: GET playbooks answers its reader's payload, key for key and byte for byte -- over outbound-routes' fixture in both workspaces, whose People read fails and counts no moment; calendar-counts' thousand and three people with one reached this week, its People read refused, and its proposals out where deals are on and where they are off; and a workspace with a calendar, deals on and a list of its own -- and each playbook a row a citation names, opened on Playbooks at its card", async () => {
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
      assert.deepEqual(
        r.rows,
        r.data.playbooks.map((p) => ({ kind: "playbook", id: p.id, route: `campaigns/moment:${p.id}`, label: p.name })),
      );
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
    [rich.calendar, rich.deals_on, "touched" in rich, rich.lists.map((l) => l.id), rich.pools[`list:${SEG1}`].pool],
    ["ok", true, false, [SEG1], 1],
  );
  // 9 Oct 2026 (spec 2026-10-09 §4.8, §4.3): the shape's word and booking tool, and the matrix's modes by class.
  assert.deepEqual(
    [rich.appointment_word, rich.bookings_by_email, pages["deals off"].appointment_word, pages["deals off"].modes],
    ["meeting", false, "appointment", {}],
    "a meeting where deals are on, else an appointment; no autonomy row is no mode",
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
  ["memberships.select", "tenant_id, role, tenants (slug, name, timezone)"],
  ["tenants.select", "name, timezone"],
  ["tenants.select", "timezone"],
  ["tenants.select", "sells_by"],
  [
    "sequence_batches.select",
    "id, name, template_id, template_name, template_language, params, audience, state, scheduled_for, started_at, finished_at, recipient_count, failure, created_at, playbook_id, run_for",
  ],
  [
    "sequence_steps.select",
    "id, name, trigger, list_id, list_key, template_id, template_name, template_language, params, policy_class, state, run_hour, cap_per_run, gap_days, cadence_days, last_run_for, last_run_at, created_at",
  ],
  ["sequence_batches.select", "id, playbook_id:step_id, state, scheduled_for, created_at, run_for, params"],
  ["deals.select", "id, stage, proposed_at, decided_at"],
  [
    "sequence_sends.select",
    // 6 Oct 2026: with the channel each went by, so a run says what each channel sent (0030).
    "broadcast_id, contact_id, state, reason, sent_at, channel, messages(conversation_id, status, meta)",
  ],
  // 6 Oct 2026: a follow-up's touches carry the deal and the link it was about (0029), the two keys of its words read.
  [
    "sequence_sends.select",
    "broadcast_id:batch_id, contact_id, sent_at, state, proposal_link:facts->>proposal_link, proposal_deal:facts->>deal_id",
  ],
  ["rpc:people_list", null],
  ["policies.select", "subject_type, subject_id, mode"],
  ["tenants.select", "name, timezone"],
  ["tenant_config.select", "config"],
  // 11 Oct 2026 (0002's readers): the record over the feed's season, beside it: a booking's rows whole, and the feed's
  // rows as ids and statuses by key (db visitsOver).
  ["appointments.select", "*"],
  ["appointments.select", "id, status, external_id, starts_at"],
  ["deals.select", "id, contact_id, proposed_at"],
  ["tenants.select", "timezone"],
  ["sequence_batches.select", "id, playbook_id:step_id, state, scheduled_for, created_at, run_for, params"],
  [
    "sequence_sends.select",
    "broadcast_id:batch_id, contact_id, sent_at, state, proposal_link:facts->>proposal_link, proposal_deal:facts->>deal_id",
  ],
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
    // 2 Oct 2026: a playbook on a moment under Bookings or the follow-ups is counted by its message's yes when that is
    // stricter than its moment's (server/campaigns/playbook-pools.ts strictMessagePools), so the templates are read once,
    // after the pools and before the lists.
    want.splice(
      want.findIndex(([k]) => k === "segments.select"),
      0,
      // 7 Oct 2026: over every channel, with each row's id and channel, so a message with no WhatsApp row is counted by its own
      // rows' category (campaignMessagesOf).
      ["templates.select", "id, channel, name, language, category, meta_status, body_preview, title, variables"],
    );
    // 3 Oct 2026: the playbooks' rows name the channels column, and the page asks whether each channel can send now
    // (server/campaigns/channels-ready.ts) with its first reads: the WhatsApp number's config and the texting line (no email
    // domain is set here, so no mailbox).
    for (const q of want) if (q[0] === "sequence_steps.select") q[1] += ", channels";
    // 11 Oct 2026 (00416): and each one's last day and the end of its trial, which Campaigns' home says as its state.
    for (const q of want) if (q[0] === "sequence_steps.select") q[1] += ", until, trial_until";
    // 4 Oct 2026: and whether the workspace is paused (tenants.status, db workspacePaused), which the composers and the
    // Campaigns home say instead of a time; read with the channels, for the pages that compose or promise a run.
    want.splice(
      want.findIndex(([k]) => k === "sequence_batches.select"),
      0,
      ["tenant_channels.select", "config, number_e164"],
      ["lines.select", "sms_state, reg_mock"],
      ["tenants.select", "status"],
    );
    // 9 Oct 2026 (00374): what the runs earned is the database's count, one call (playbook_totals), where every run of
    // every playbook and every person on one were read to sum it here.
    want.splice(
      want.findIndex(([k, cols]) => k === "sequence_batches.select" && cols.startsWith("id, name, template_id")),
      1,
      ["rpc:playbook_totals", null],
    );
    want.splice(
      want.findIndex(([k, cols]) => k === "sequence_sends.select" && cols.includes("messages(")),
      1,
    );
    // 9 Oct 2026 (spec 2026-10-09 §4.3, decision 7): the autonomy matrix's rows, so the page knows a class under `auto`
    // (control-plane listPolicies, the readers/facts.ts policies reader Ask's campaigns.playbooks already reads).
    want.push(["policies.select", "id, class, mode, subject_type, subject_id, limits, updated_at"]);
    // 9 Oct 2026: the pools' reads leave with the page's first ones (server/campaigns/playbook-pools.ts poolReads), so the
    // reads no longer reach the database one behind another: the same reads, each as often, the door before them all.
    const w = playbooksWorld();
    const routed = worldCtx(w);
    const page = await playbooksRoute.GET.run(req(`?workspace=${A}`), routed);
    assert.deepEqual(askedWith(routed)[0], want[0], "the workspace's door, before any read");
    assert.deepEqual(bagOf(askedWith(routed)), bagOf(want), "no read added and none lost");
    const ctx = worldCtx(w);
    const r = await kernel.load(turnIn(ctx), playbooksReader, undefined);
    assert.deepEqual(r.data, page);
    assert.deepEqual(bagOf(askedWith(ctx)), bagOf(want.slice(1)));
    const turn = turnIn(worldCtx(w));
    await Promise.all([facts, config, sellsBy].map((x) => kernel.load(turn, x, undefined)));
    const held = turn.ctx.supabase.seen.length;
    await kernel.load(turn, playbooksReader, undefined);
    assert.deepEqual(
      bagOf(askedWith(turn.ctx).slice(held)),
      bagOf(
        want
          .slice(1)
          .filter(
            ([k, cols]) => k !== "tenant_config.select" && !(k === "tenants.select" && /sells_by|name/.test(cols)),
          ),
      ),
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
    assert.deepEqual(lines, [{ tenant_id: A, error: "Error: getTenantConfig: config down" }]);
    const { result: r2 } = await logged("playbook_pools_visits_failed", () =>
      kernel.load(turnIn(worldCtx(w, down)), playbooksReader, undefined),
    );
    assert.deepEqual(r2.data, blind);
  });
});

/**
 * A request's database whose reads of one table are not answered until `open()`: what a reader has asked for while one of
 * its reads is still out. The query is recorded as it is answered (fakeDb), so a table held here is in `seen` only after.
 */
function heldAt(ctx, table) {
  let open;
  const gate = new Promise((go) => (open = go));
  const from = ctx.supabase.from.bind(ctx.supabase);
  ctx.supabase.from = (t) => {
    const q = from(t);
    if (t !== table) return q;
    for (const answer of ["then", "single", "maybeSingle"]) {
      const was = q[answer].bind(q);
      q[answer] = (...args) => gate.then(() => was(...args));
    }
    return q;
  };
  return open;
}
/** Long enough for every read that waits on nothing held to have reached the database. */
const idle = async () => {
  for (let i = 0; i < 25; i++) await new Promise((go) => setImmediate(go));
};

test("GET playbooks asks for the pools' reads with its first ones, not behind them: with the playbooks' own rows still out, everyone, the reply modes, the settings, the proposals out and their follow-ups and the lists have all been asked for, and only the templates wait, which are read for the playbooks; the page is the one it was; and where deals are off, no deal is read at all", async () => {
  await withFeed({ body: ONE_ICS }, async () => {
    const w = playbooksWorld();
    const page = await playbooksRoute.GET.run(req(`?workspace=${A}`), worldCtx(w));
    const ctx = worldCtx(w);
    const open = heldAt(ctx, "sequence_steps");
    let answered = false;
    const waiting = playbooksRoute.GET.run(req(`?workspace=${A}`), ctx).then((p) => ((answered = true), p));
    await idle();
    assert.equal(answered, false, "the page waits for its playbooks");
    const before = askedWith(ctx).map(([k, cols]) => `${k} ${cols ?? ""}`.trim());
    for (const read of [
      "rpc:people_list",
      "policies.select subject_type, subject_id, mode",
      `tenant_config.select ${CONFIG_READER_COLUMNS}`,
      "deals.select id, contact_id, proposed_at",
      "segments.select id, name, rule, archived_at",
      "segment_members.select segment_id, contact_id",
    ])
      assert.ok(
        before.includes(read),
        `REGRESSION: the pools' ${read} waited for the page's first reads to answer (asked: ${before.join(" | ")})`,
      );
    // The follow-ups' touches are two reads deep, behind the proposals out: both of theirs and the week's own.
    assert.equal(before.filter((k) => k.startsWith("sequence_sends.select") && /proposal_link/.test(k)).length, 2);
    assert.ok(
      !before.some((k) => /^(sequence_steps|templates)\.select/.test(k)),
      "the templates are read for the playbooks",
    );
    open();
    assert.deepEqual(await waiting, page, "the page it always answered");
    assert.equal(selects(ctx, "templates").length, 1, "and the templates once, when the playbooks are in");

    // Deals off: the pace is counted by nothing and no proposal is out, so neither is read.
    const off = worldCtx(countsWorld(pagedPeople([poolPerson(1), poolPerson(2)])));
    const quiet = await playbooksRoute.GET.run(req(`?workspace=${A}`), off);
    assert.deepEqual(
      [quiet.deals_on, quiet.pools.proposal_waiting, quiet.pools.everyone_monthly.pool],
      [false, null, 2],
    );
    assert.deepEqual(selects(off, "deals"), [], "REGRESSION: a workspace with deals off read its deals for a pace");
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
/**
 * What GET settings asks of the database, after the workspace's door, in its order: what it asked at origin/main, and
 * the listing's review link (db reviewLinkOf, 00415) read beside the platform's facts.
 */
const SETTINGS_ASKED = [
  "tenant_config.select",
  "tenants.select",
  "google_listings.select",
  "google_listings.select",
  "lines.select",
  "tenant_channels.select",
  "policies.select",
];
/** The preview's clock, apart: the rest of what the settings read answers does not move with the minute. */
const withoutClock = (d) => (d.prompt ? { ...d, prompt: { ...d.prompt, now: "<clock>" } } : d);

test("the settings read, for Ask and for the page: GET settings answers its reader's payload, key for key, over settings-routes' fixtures -- a viewer's feed masked and an owner's whole, who last changed the row, a config the parser refuses as its own state, the platform's facts with the number the business forwards, whether the listing keeps a review link -- asking in its order: the row once, the platform's facts and the review link at once, then the Autonomy rows inside the preview; no configuration row is the route's 404; the preview's clock is the turn's, and a turn that holds the row reads it once", async () => {
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
      "review_link",
    ]);
    assert.equal(r.data.review_link, false, "no listing, no review link");
    assert.deepEqual(
      [r.data.version, r.data.role, r.data.configBroken, r.data.prompt, r.data.updatedBy, r.data.updatedAt],
      [version, role, false, null, null, "2026-09-01T00:00:00Z"],
      "no receptionist, no prompt; a row written before its author was kept says so with null",
    );
    assert.deepEqual(r.rows, []);
    assert.deepEqual(asked(ctx), SETTINGS_ASKED.slice(0, -1), "no receptionist: no Autonomy rows to read");
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
  // The table, then the door: from 00366 a viewer reads the row only through tenant_config_read, and neither has it.
  assert.deepEqual(asked(none), ["tenant_config.select", "rpc:tenant_config_read"]);
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
  assert.deepEqual(asked(routed), ["memberships.select", ...SETTINGS_ASKED], "the workspace's door, then the reads");
  assert.deepEqual(asked(ctx), SETTINGS_ASKED);
  // The listing keeps a review link (00415): the composers offer it to a review-link slot, and the review ask with it.
  const reviewed = () => ({
    ...forwardedWorld(),
    google_listings: [rows.googleListing({ tenant_id: A, new_review_uri: "https://example.com/review/harbor" })],
  });
  const linked = await kernel.load(memberIn(dayCtx(reviewed()), A, "owner", NOW), settingsReader, undefined);
  assert.equal(linked.data.review_link, true, "the listing's link is said as there being one, never the link");
  assert.equal((await settingsRoute.GET.run(req(`?workspace=${A}`), dayCtx(reviewed()))).review_link, true);
  // A turn that holds the row reads it once: the settings read is the turn's one read of the config.
  const turn = memberIn(dayCtx(forwardedWorld()), A, "owner", NOW);
  await kernel.load(turn, config, undefined);
  const held = turn.ctx.supabase.seen.length;
  const again = await kernel.load(turn, settingsReader, undefined);
  assert.deepEqual(asked(turn.ctx).slice(held), SETTINGS_ASKED.slice(1), "the row was the turn's");
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
      rows.googleListing({
        tenant_id: A,
        place_id: "ChIJ-northside-movers",
        name: "Northside Movers",
        linked_at: "2026-09-07T14:00:00Z",
        facts: {
          hours: [{ open: { day: 2, hour: 9, minute: 0 }, close: { day: 2, hour: 17, minute: 0 } }],
          website: null,
          service_area_only: true,
          primary_type: "moving_company",
          booking_page: "https://calendly.com/northside-movers-example/estimate",
          phone_e164: "+13055550100",
        },
      }),
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

test("connections, for the page: GET setup answers its reader's payload over setup.test.mjs's shape -- setupDtoFor's own answer for a member reading their own workspace on their session, on the turn's clock, and their role beside it -- asking what setupDtoFor asks, in its order: the roster through its door, never the back office's counts; each domain it sends cold email from a row a citation names, on Connections", async () => {
  const NOW = new Date("2026-09-07T15:00:00Z");
  const w = setupWorld();
  const routed = worldCtx(w);
  const page = await setupRoute.GET.run(req(`?workspace=${A}`), routed);
  const ctx = worldCtx(w);
  const r = await kernel.load(memberIn(ctx, A, "owner", NOW), connections, undefined);
  assert.deepEqual(r.data, page, "the route's payload");
  assert.equal(JSON.stringify(r.data), JSON.stringify(page), "byte for byte");
  assert.deepEqual(Object.keys(r.data), ["setup", "role"]);
  assert.deepEqual(r.rows, [], "email is off here: no domain, no row");
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
  // A workspace that sends cold email from a domain of its own: each domain is a row a citation names, on Connections.
  const D1 = "5e5e5e5e-5e5e-4e5e-8e5e-5e5e5e5e5e5e";
  const sending = setupWorld();
  sending.tables.mailboxes = [
    {
      id: "mb1",
      tenant_id: A,
      local_part: "harbor",
      reply_token: "a".repeat(24),
      reply_token_prev: null,
      from_name: "Harbor",
      reply_mode: "draft",
      last_received_at: null,
      last_error: null,
    },
  ];
  sending.tables.mailbox_connections = [
    rows.mailboxConnection({
      id: D1,
      tenant_id: A,
      address: "sam@send.example.com",
      host: "send.example.com",
      from_name: "Sam",
    }),
  ];
  const was = process.env.EMAIL_DOMAIN;
  process.env.EMAIL_DOMAIN = "mail.example.com";
  try {
    const d = await kernel.load(memberIn(worldCtx(sending), A, "owner", NOW), connections, undefined);
    assert.deepEqual(
      d.data.setup.email.sending.mailboxes.map((x) => x.id),
      [D1],
    );
    assert.deepEqual(d.rows, [{ kind: "mailbox", id: D1, route: "admin/integrations", label: "sam@send.example.com" }]);
  } finally {
    if (was === undefined) delete process.env.EMAIL_DOMAIN;
    else process.env.EMAIL_DOMAIN = was;
  }
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
  assert.deepEqual(none.data, { notifications: [], seen_at: "2026-09-10T12:00:00Z", unread: 0 });
  assert.deepEqual(asked(quiet), ["notification_reads.select", "notifications.select"]);
});

test("the bell's read lists its newest sixty and counts the unread rows past them, less the ones the server closed (00421)", async () => {
  const NOW = Date.parse("2026-09-20T12:00:00Z");
  const many = Array.from({ length: 62 }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    tenant_id: A,
    kind: "alert",
    title: `Row ${i}`,
    body: "…",
    route: null,
    subject_type: null,
    subject_id: null,
    recipient_user_id: null,
    created_at: new Date(NOW - (i + 1) * 3_600_000).toISOString(),
    closed_at: i === 61 ? new Date(NOW).toISOString() : null,
  }));
  const r = await kernel.load(
    memberIn(dayCtx(notificationsWorld(NOW, { rows: many })), A, "viewer", new Date(NOW)),
    notificationsReader,
    undefined,
  );
  assert.equal(r.data.notifications.length, 60, "the newest sixty, listed");
  assert.equal(
    r.data.unread,
    61,
    "the sixty listed and the sixty-first, past the list; the sixty-second was closed when what it asked for ended",
  );
  assert.equal(r.data.notifications[0].closed_at, null, "each listed row says whether the server closed it");
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

test("the activity log, for the page: GET activity answers its reader's payload over activity.test.mjs's fixture -- both ledgers newest first, the noise left out, the actors named -- with a filter handed in as the route parsed it: none, a person, a day by the workspace's clock; the route keeps the owner's door and the reader trusts its caller; not a row a citation names", async () => {
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

test("the channels, for the page and for Ask: GET channels answers its reader's payload over reads-routes' fixture -- the named workspace's rows by kind, when each last heard from a customer, and the quality Meta assigned the WhatsApp number, from its config -- the last message, the last call and the rows asked at once, as the route asked them; not a row a citation names", async () => {
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
    "standing",
    "standing_read_at",
    // When the number first connected (#1541), which the toast and the row try its link by.
    "connected_at",
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

test("the channels carry what Meta holds about the WhatsApp number, as the edge kept it on the row's config, and when it was read: read back as held, so a config that holds no standing says none -- the page's route says the same as the reader, byte for byte", async () => {
  const held = {
    can_send: "BLOCKED",
    problems: [
      {
        entity: "WABA",
        code: 141006,
        said: "A payment method is required to send messages",
        fix: "Add a payment method in WhatsApp Manager",
      },
    ],
    notes: [],
    name: "Harbor Moving",
    name_status: "APPROVED",
    verification: "not_verified",
    limit: "TIER_250",
    has_payment_method: false,
    owner_business_id: "410540000000001",
    waba_id: "205540000000001",
  };
  const world = (config) =>
    channelsWorld({
      tenant_channels: [{ ...channelsWorld().tenant_channels[0], config }, channelsWorld().tenant_channels[1]],
    });
  const first = async (config) =>
    (await kernel.load(turnIn(dayCtx(world(config))), channelsReader, undefined)).data.channels[0];
  const stamped = { quality_rating: "GREEN", standing: held, standing_read_at: "2026-10-06T14:55:00Z" };
  const ok = await first(stamped);
  assert.deepEqual([ok.standing, ok.standing_read_at, ok.quality], [held, "2026-10-06T14:55:00Z", "GREEN"]);
  const page = await channelsRoute.GET.run(req(`?workspace=${A}`), dayCtx(world(stamped)));
  assert.equal(JSON.stringify(page.channels[0]), JSON.stringify(ok), "the route says what the reader says");
  for (const standing of [undefined, null, "BLOCKED", [], {}, { can_send: "" }, { problems: [] }]) {
    const c = await first({ standing });
    assert.deepEqual([c.standing, c.standing_read_at], [null, null], JSON.stringify(standing));
  }
  assert.equal(
    channelsRoute.GET.policy.role,
    null,
    "every member reads it, as they read the quality: the policy is the route's and is not changed",
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
  "sequence_batches.select",
  "sequence_sends.select",
  "messages.select",
  "sequence_steps.select",
];
/**
 * 9 Oct 2026 (00374): how many of each went out is the database's count, one call (template_sends), where every sent
 * person and every templated message was paged here; it is asked as the reads start, ahead of the runs it no longer waits on.
 */
const TEMPLATES_ALL_ASKED = [
  "templates.select",
  "rpc:template_sends",
  ...TEMPLATES_ALL_ASKED_AT_MAIN.slice(1).filter((k) => k !== "sequence_sends.select" && k !== "messages.select"),
  // 14 Oct 2026 (the wiring's second audit, S1-3): the business's zone, so a campaign past its last day reads ended.
  "tenants.select",
];

test("the templates, for the composers, Settings and Ask: GET templates answers its reader's payload over outbound-routes' fixtures, `all` as the route parses it -- the composers' read the approved and unhidden alone, each row the message as the customer receives it and why this product cannot send it, and nothing more read; Settings' every template, with what sends each and how many went out -- and each template a row a citation names, with no address of its own: it opens the page it came from", async () => {
  for (const [q, all, names, keys, reads] of [
    // `held`: what the composers' read left out, counted by why, so an empty picker can say it (contracts noTemplateWords).
    ["", false, ["visit_reminder"], ["templates", "held", "messages", "booking"], ["templates.select"]],
    [
      "&all=1",
      true,
      ["hello_world", "offer", "visit_reminder"],
      ["templates", "held", "messages", "booking", "usedBy", "sends"],
      TEMPLATES_ALL_ASKED,
    ],
    ["&all=0", false, ["visit_reminder"], ["templates", "held", "messages", "booking"], ["templates.select"]],
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
    assert.deepEqual(
      r.rows,
      r.data.templates.map((t) => ({
        kind: "template",
        id: t.id,
        route: `campaigns/message:${t.name}`,
        label: t.title || t.name,
      })),
      "a template opens its own message in the Library, from Settings' read and the composers' alike (W-campaign-run-template-reachout-6)",
    );
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

test("GET templates names the call's text it finds among every WhatsApp row, a hidden one too, as the edge texts it: Campaigns' home keeps today's lookup without Settings' read", async () => {
  const w = usageWorld();
  w.templates = w.templates.map((t) => (t.name === "booking_link" ? { ...t, hidden_at: "2026-09-01T00:00:00Z" } : t));
  const r = await kernel.load(turnIn(dayCtx(w), B), templatesReader, { all: false });
  assert.equal(
    r.data.templates.some((t) => t.name === "booking_link"),
    false,
    "the composers are not offered it",
  );
  assert.equal(r.data.booking?.name, "booking_link", "and the phone agent still texts it after a call");
  // A workspace with no WhatsApp row that carries the booking link answers none.
  const none = usageWorld();
  none.templates = none.templates.filter((t) => t.channel !== "whatsapp");
  assert.equal((await kernel.load(turnIn(dayCtx(none), B), templatesReader, { all: false })).data.booking, null);
});

/**
 * Lane 1 (a message needs no WhatsApp row), T7: the read answers the workspace's messages, made of EVERY row, beside the
 * list. An email's and a text's rows are written approved and a WhatsApp row is Meta's, so the composers' list holds the
 * first and not a version still in review, and a message made of the list alone lost that version's standing.
 */
const EM1 = "77777777-7777-4777-8777-777777777781";
const EM2 = "77777777-7777-4777-8777-777777777782";
const EM3 = "77777777-7777-4777-8777-777777777783";
const messagesWorld = (rows) => ({
  memberships: templatesWorld().memberships,
  templates: rows,
  playbooks: [],
  broadcasts: [],
  broadcast_recipients: [],
  messages: [],
});
/** An email's or a text's version as the library files it: Meta's component shape, the subject a HEADER, the words the BODY. */
const ownRow = (id, channel, over = {}) =>
  tplRow(id, B, {
    channel,
    category: null,
    source: "chanlytics",
    components: [
      ...(channel === "email" ? [{ type: "HEADER", format: "TEXT", text: "We miss you" }] : []),
      { type: "BODY", text: "Hi {{1}}" },
    ],
    ...over,
  });
const messagesOfRead = async (rows, all = false) =>
  (await kernel.load(turnIn(dayCtx(messagesWorld(rows)), B), templatesReader, { all })).data;

test("the read answers one message for a WhatsApp version in review and the approved email of its name and language, its standing kept inside it, while the list still leaves the version out", async () => {
  const rows = [
    tplRow(TP1, B, {
      name: "winback_offer",
      meta_status: "pending",
      category: "marketing",
      variables: [{ position: 1 }],
    }),
    ownRow(EM1, "email", { name: "winback_offer", category: "marketing", variables: [{ position: 1 }] }),
  ];
  for (const all of [false, true]) {
    const data = await messagesOfRead(rows, all);
    assert.equal(data.messages.length, 1, `one message, not a row for each version (all: ${all})`);
    const [message] = data.messages;
    assert.equal(message.name, "winback_offer");
    assert.equal(message.versions.whatsapp?.status, "pending", "the version in review keeps its status");
    assert.equal(message.versions.whatsapp?.id, TP1);
    assert.equal(message.versions.email?.id, EM1);
    assert.equal(message.versions.sms, null);
    assert.equal(message.offered, true, "the email version is one the message can be sent on");
    assert.deepEqual(
      [message.anchor, message.category, message.slots],
      [{ id: TP1, channel: "whatsapp" }, "marketing", 1],
      "Meta's row anchors it and gives it its category, whatever its status",
    );
    // Today's list is as it was: the composers' omits the version in review, Settings' holds every row.
    assert.deepEqual(
      data.templates.map((t) => t.id),
      all ? [TP1, EM1] : [EM1],
    );
    assert.deepEqual(
      data.held,
      { pending: 1, rejected: 0, paused: 0, disabled: 0, hidden: 0 },
      "what the list left out",
    );
  }
  // A WhatsApp version in review alone is a message the composers do not offer, and it is still one.
  const alone = (await messagesOfRead([rows[0]])).messages;
  assert.deepEqual(
    alone.map((m) => [m.name, m.offered, m.versions.whatsapp?.status, m.versions.email]),
    [["winback_offer", false, "pending", null]],
  );
});

test("the read answers a message with no WhatsApp row, one a name and language, in the order its rows appear; a hidden one and a reach-out's email are not offered or not messages", async () => {
  const data = await messagesOfRead([
    ownRow(EM1, "email", { name: "harbor_note", language: "en_US", category: "utility" }),
    ownRow(EM2, "sms", { name: "harbor_note", language: "en_US", category: "utility" }),
    ownRow(EM3, "email", {
      name: "harbor_note",
      language: "es_MX",
      category: "utility",
      hidden_at: "2026-09-01T00:00:00Z",
    }),
    ownRow(TP3, "email", { name: "reach_out_0a1b2c3d4e5f60718293a4b5c6d7e8f9", language: "en" }),
  ]);
  assert.deepEqual(
    data.messages.map((m) => [m.name, m.language, m.anchor.channel, m.hidden, m.offered, m.versions.whatsapp]),
    [
      ["harbor_note", "en_US", "email", false, true, null],
      ["harbor_note", "es_MX", "email", true, false, null],
    ],
    "a reach-out's email belongs to no message; the hidden language is a message the pickers do not list",
  );
  assert.deepEqual(
    data.messages.map((m) => m.versions.sms?.id ?? null),
    [EM2, null],
    "the text beside the email",
  );
});

test("an email whose subject holds a value is not blocked, and a WhatsApp row with a document for a heading still is: blocked is judged on a WhatsApp row alone", async () => {
  const HEADING = [
    { type: "HEADER", format: "TEXT", text: "Hi {{1}}" },
    { type: "BODY", text: "Hi {{1}}" },
  ];
  const data = await messagesOfRead(
    [
      ownRow(EM1, "email", { name: "subject_note", components: HEADING }),
      ownRow(EM2, "sms", { name: "subject_note" }),
      tplRow(TP1, B, {
        name: "pdf_note",
        components: [
          { type: "HEADER", format: "DOCUMENT" },
          { type: "BODY", text: "Hi" },
        ],
      }),
      // The same heading on Meta's array is "a heading that takes a value": WhatsApp's row is held, the email's is not.
      tplRow(TP2, B, { name: "subject_note", components: HEADING }),
    ],
    true,
  );
  const blockedOf = (id) => data.templates.find((t) => t.id === id).blocked;
  assert.equal(blockedOf(EM1), null, "an email's subject may take a value");
  assert.equal(blockedOf(EM2), null, "a text has none to judge");
  assert.equal(blockedOf(TP1), "a document for a heading", "WhatsApp's row is still judged");
  assert.equal(blockedOf(TP2), "a heading that takes a value");
  // The message holds the email whatever its WhatsApp version is held for.
  const subject = data.messages.find((m) => m.name === "subject_note");
  assert.equal(subject.versions.whatsapp?.blocked, "a heading that takes a value");
  assert.equal(subject.versions.email?.id, EM1);
  assert.equal(subject.offered, true, "by its email and its text");
  assert.equal(data.messages.find((m) => m.name === "pdf_note").offered, false, "a WhatsApp row alone it cannot send");
});

test("the booking message is chosen among WhatsApp rows alone: an email named like the booking starter is not it", async () => {
  const KEPT = "booking_link";
  const world = [
    // The call's text, as an email: the starter the call prefers, on the wrong channel.
    ownRow(EM1, "email", { name: "call_text", variables: [{ position: 1 }, { position: 2 }, { position: 3 }] }),
    tplRow(TP4, B, { name: KEPT, variables: [{ position: 1 }, { position: 2 }, { position: 3 }] }),
  ];
  const { usedBy } = await messagesOfRead(world, true);
  assert.deepEqual(
    Object.entries(usedBy).map(([name, u]) => [name, u.booking]),
    [[KEPT, true]],
    "the Inbox books with the WhatsApp starter; the email of the other's name is used by nothing",
  );
  // With a WhatsApp row of that name it is the one chosen, as it always was.
  const both = await messagesOfRead([...world, tplRow(TP3, B, { name: "call_text", variables: [] })], true);
  assert.deepEqual(
    Object.entries(both.usedBy).map(([name, u]) => [name, u.booking]),
    [["call_text", true]],
  );
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
  // Counted by WhatsApp alone, as before the channels were: none of these lists reads who can be sent what.
  const pool = await audiencePoolOf(worldCtx(w), A, "America/New_York", new Date(), null);
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

/**
 * 10 Oct 2026 (Ask, the marketing manager, task 3): before Ask writes a message it reads the library whole, a version
 * still in Meta's review among its message's versions, so it never writes a twin of one the workspace holds. One message
 * here, an approved email and a WhatsApp version in review, which a campaign sends; another workspace's beside it.
 */
test("campaigns.messages reads the whole library, a WhatsApp version still in review among its message's versions with each version's state, its slots and the campaigns that send it, each version a row a citation names; campaigns.audiences still lists the message by the one version a broadcast may go by now", async () => {
  const slot = [{ position: 1, label: "First name", example: "Ana" }];
  const w = countsWorld(pagedPeople([]), {
    templates: [
      tplRow(TP1, A, { name: "spring_offer", meta_status: "pending", category: "marketing", variables: slot }),
      tplRow(EM1, A, {
        channel: "email",
        name: "spring_offer",
        category: "marketing",
        source: "chanlytics",
        variables: slot,
      }),
      tplRow(TP9, B, { name: "spring_offer", meta_status: "pending", category: "marketing" }),
    ],
    playbooks: [
      pbRow(PB1, { name: "Spring", template_name: "spring_offer" }),
      pbRow(PB2, { tenant_id: B, name: "Elsewhere", template_name: "spring_offer" }),
    ],
  });
  const tc = newToolContext(worldCtx(w), A, "viewer", "America/New_York", new Date());
  const out = await runTool(tc, { name: "campaigns", input: { action: "messages" } });
  assert.equal(out.isError, false, out.result);
  assert.deepEqual(
    JSON.parse(out.result).messages,
    [
      {
        name: "spring_offer",
        language: "en_US",
        category: "marketing",
        versions: [
          { channel: "whatsapp", id: TP1, state: "pending" },
          { channel: "email", id: EM1, state: "approved" },
        ],
        slots: [{ position: 1, label: "First name", kind: "first_name" }],
        used_by: [{ id: PB1, name: "Spring" }],
      },
    ],
    "one message, both versions with their states; this workspace's campaign alone",
  );
  assert.deepEqual([...tc.read.template.keys()].sort(), [TP1, EM1].sort(), "each version a template a citation names");
  // The composers' list is as it was: the message, by the email a broadcast may go by now, and not the version in review.
  const aud = await runTool(tc, { name: "campaigns", input: { action: "audiences" } });
  assert.equal(aud.isError, false, aud.result);
  assert.deepEqual(
    JSON.parse(aud.result).templates.map((m) => [m.template_id, m.name, m.channels]),
    [[EM1, "spring_offer", { whatsapp: false, email: true, sms: false }]],
  );
});

/**
 * 10 Oct 2026 (Ask, the marketing manager, task 4): what am I missing is the journey as Campaigns' home draws it, its
 * head and its rail as data, composed from the readers the page's surfaces answer from, so the number Ask says is the
 * page's. Harbor here: a calendar connected, its WhatsApp number, deals off, and one running win-back by appointments.
 */
test("campaigns.journey says the journey as Campaigns' home draws it: 2 of 4 moments covered, first contact by the receptionist and quiet by the running win-back, which its stage names; the day before and after off; and the guide beside it, the day before's row among its rows; the win-back a row a citation names", async () => {
  const w = countsWorld(pagedPeople([poolPerson(1)]), {
    ...calTables("https://cal.example/journey.ics"),
    playbooks: [pbRow(PB1, { name: "Come back soon", trigger: "lapsed" })],
  });
  await withFeed({ body: ONE_ICS }, async () => {
    const tc = newToolContext(worldCtx(w), A, "viewer", "America/New_York", new Date());
    const out = await runTool(tc, { name: "campaigns", input: { action: "journey" } });
    assert.equal(out.isError, false, out.result);
    const said = JSON.parse(out.result);
    assert.equal(said.covered, 2, "first contact and quiet");
    assert.equal(said.of, 4, "a calendar, deals off: no proposal waiting");
    assert.deepEqual(
      said.stages.map((s) => [s.id, s.label, s.covered, s.state, s.moment]),
      [
        ["first_contact", "First contact", true, "Answers · asks for the yes", null],
        ["before", "Appointment tomorrow", false, "Off", "visit_tomorrow"],
        ["after", "After the appointment", false, "Off", "visited"],
        ["quiet", "Quiet or lapsed", true, "On · daily 10:00 AM", "lapsed"],
      ],
    );
    assert.deepEqual(
      said.stages.find((s) => s.id === "quiet").campaigns,
      [{ id: PB1, name: "Come back soon", state: "On · daily 10:00 AM" }],
      "the win-back, named on the stage it covers",
    );
    assert.deepEqual(
      said.stages.filter((s) => s.id !== "quiet").map((s) => s.campaigns),
      [[], [], []],
      "the receptionist and the call's text are no campaign",
    );
    // The guide for the workspace's shape, in its word (the stages' "Appointment tomorrow"): the page's word, once.
    assert.deepEqual(said.guide, journeyGuide({ calendarOn: true, dealsOn: false, word: "appointment" }));
    assert.equal(
      said.guide.find((r) => r.stage === "after").sends,
      "the day after an appointment, when nothing is booked next: a thank-you and how it went, with a review ask where your Google listing keeps a review link",
    );
    const before = said.guide.find((r) => r.stage === "before");
    assert.deepEqual(
      [Object.keys(before), before.moment, before.sends],
      [["stage", "moment", "sends"], "visit_tomorrow", "the day before an appointment on the calendar: a reminder"],
      "the day before's row: its moment, and what it sends when",
    );
    // The win-back here goes by appointments, so its row says its moment's own days, never weeks of its own.
    assert.equal(
      said.guide.find((r) => r.stage === "quiet").sends,
      "no appointment in 45 days, and nothing booked: a win-back",
    );
    assert.deepEqual([...tc.read.playbook.keys()], [PB1], "the campaign it names, a row a citation names");
  });
});

/**
 * 12 Oct 2026 (Ask, the marketing manager, the review after the merge): campaigns.playbooks says a campaign's end and its
 * trial as its card on Campaigns does, through the page's one reading of GET playbooks' answer (contracts
 * lifecyclePlaybooksOf). A campaign past its last day still reads running and runs nothing, so it has no next run and
 * says why; one on trial under a class that sends on its own runs under veto until its trial ends; a last day ahead is
 * said. Harbor here, on a frozen clock, Thursday 3 December 2026 at nine in the morning in New York, its campaigns' class
 * on auto; the month's offer three times: ended on 30 November, on trial until 8 December and ending on the 31st, and one
 * whose trial ended in November.
 */
const LIFE_NOW = new Date("2026-12-03T14:00:00.000Z");
test("campaigns.playbooks says a campaign's end and its trial as its card does: one past its last day, still running, has no next run and says it ended; one on trial under auto runs under veto until the day its trial ends, and says its last day ahead; one whose trial is over runs under its class's mode", async () => {
  const PB3 = "99999999-9999-4999-8999-999999999993";
  const monthly = { trigger: "everyone_monthly", policy_class: "campaign", cadence_days: 30, gap_days: 0 };
  const w = countsWorld(pagedPeople([]), {
    policies: [{ tenant_id: A, class: "campaign", mode: "auto", subject_type: null, subject_id: null }],
    playbooks: [
      pbRow(PB1, { ...monthly, name: "November offer", until: "2026-11-30", trial_until: null }),
      pbRow(PB2, { ...monthly, name: "Winter offer", until: "2026-12-31", trial_until: "2026-12-08T14:00:00.000Z" }),
      pbRow(PB3, { ...monthly, name: "Always on", until: null, trial_until: "2026-11-20T14:00:00.000Z" }),
    ],
  });
  const tc = newToolContext(worldCtx(w), A, "owner", "America/New_York", LIFE_NOW);
  const out = await runTool(tc, { name: "campaigns", input: { action: "playbooks" } });
  assert.equal(out.isError, false, out.result);
  const said = JSON.parse(out.result);
  assert.equal(said.modes.campaign, "auto", "the class sends on its own");
  const by = Object.fromEntries(said.playbooks.map((p) => [p.name, p]));
  // Its state is the home's words (contracts lifecycleStateOf), never the stored "running" of one past its last day (R13 X5-7).
  const facts = (p) => [p.state, p.mode, p.next_run, p.runs_nothing, p.ended, p.on_trial_until, p.ends];
  assert.deepEqual(
    facts(by["November offer"]),
    ["Ended Nov 30", "auto", null, "Ended Nov 30", "Nov 30", undefined, undefined],
    "REGRESSION: it said its next run was today at 10, a month after its last day",
  );
  assert.deepEqual(
    facts(by["Winter offer"]),
    ["On trial until Dec 8", "veto", "today 10:00 AM", undefined, undefined, "Dec 8", "Dec 31"],
    "REGRESSION: it said a run sends on its own, where each waits 30 minutes with a Stop",
  );
  assert.deepEqual(facts(by["Always on"]), [
    "On · every 30 days",
    "auto",
    "today 10:00 AM",
    undefined,
    undefined,
    undefined,
    undefined,
  ]);
  // The note says the run's breath in the contracts' words, and the appointment moments neither it nor the gap holds
  // (contracts playbookRunReach returns before both).
  assert.ok(
    said.note.includes(`, exempt from the gap and ${PLAYBOOK_CARD_WORDS.appointmentBreath}.`) &&
      !said.note.includes("per person per week"),
    said.note,
  );
});

test("campaigns.playbooks says the autonomy modes could not be read where their read failed, never that every run waits for a person (the wiring's second audit, R13 X5-8)", async () => {
  // A read that failed was taken for no rules at all: every class read as ask, and Ask said each campaign's runs wait for a
  // person, where some send on their own.
  const w = countsWorld(pagedPeople([]), {
    policies: [{ tenant_id: A, class: "campaign", mode: "auto", subject_type: null, subject_id: null }],
    playbooks: [pbRow(PB1, { name: "November offer", trigger: "everyone_monthly", policy_class: "campaign" })],
  });
  const down = { "policies.select": { message: "policies down" } };
  const { result: out, lines } = await logged("ask_tool_read_failed", () =>
    runTool(newToolContext(worldCtx(w, down), A, "owner", "America/New_York", LIFE_NOW), {
      name: "campaigns",
      input: { action: "playbooks" },
    }),
  );
  assert.equal(out.isError, false, out.result);
  const said = JSON.parse(out.result);
  assert.equal(said.modes, null, "no class's mode is said");
  assert.match(said.could_not_read, /could not be read just now, never that a campaign's runs wait for a person/);
  assert.deepEqual(
    said.playbooks.map((p) => [p.name, p.mode]),
    [["November offer", null]],
    "nor any campaign's mode, auto or ask",
  );
  assert.equal(lines.length, 1, "said once in the log");
  // Read, the mode is said as before.
  const tc = newToolContext(worldCtx(w), A, "owner", "America/New_York", LIFE_NOW);
  const read = JSON.parse((await runTool(tc, { name: "campaigns", input: { action: "playbooks" } })).result);
  assert.deepEqual([read.modes.campaign, read.could_not_read], ["auto", undefined]);
});

/**
 * 10 Oct 2026 (Ask, the marketing manager, task 5): how full the book is, for pacing an offer to what the business can
 * take, is the openings reader's own answer counted in slots over the next fourteen days, so the room Ask says is the
 * time the receptionist would offer. Harbor here opens nine to five on weekdays; its feed holds two hours tomorrow and
 * a booking that arrived by email takes an hour the day after. The clock is late on a Tuesday in New York, already
 * Wednesday in UTC, so today offers nothing and the first day with room is tomorrow on the business's clock.
 */
const ROOM_NOW = new Date("2026-09-09T03:30:00.000Z");
const ROOM_ICS = [
  "BEGIN:VCALENDAR",
  "BEGIN:VEVENT",
  "UID:r1",
  "SUMMARY:Taken",
  "DTSTART;TZID=America/New_York:20260909T100000",
  "DTEND;TZID=America/New_York:20260909T120000",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");
const NINE_TO_FIVE = { open: "09:00", close: "17:00" };
const ROOM_HOURS = {
  mon: NINE_TO_FIVE,
  tue: NINE_TO_FIVE,
  wed: NINE_TO_FIVE,
  thu: NINE_TO_FIVE,
  fri: NINE_TO_FIVE,
  sat: {},
  sun: {},
};
/**
 * calTables(url), open nine to five and booking by `rules`, with one booking on record: Thursday two to three in the
 * afternoon, New York.
 */
const roomTables = (url, rules = calProfile.booking_rules) => {
  const t = calTables(url);
  const [row] = t.tenant_config;
  const brain = { ...row.config.brain, profile: { ...calProfile, hours: ROOM_HOURS, booking_rules: rules } };
  return {
    ...t,
    tenant_config: [{ ...row, config: { ...row.config, brain } }],
    appointments: [
      {
        id: "appt-room",
        tenant_id: A,
        source: "booking_email",
        tool: "booksy",
        external_id: "booksy:appt-room",
        status: "booked",
        starts_at: "2026-09-10T18:00:00.000Z",
        ends_at: "2026-09-10T19:00:00.000Z",
        all_day: false,
        timezone: "America/New_York",
      },
    ],
  };
};
/** The open slots of half an hour in each day's windows, as freeWindows gives them. */
const slotsOf = (openings) =>
  openings.map((o) => ({
    day: o.key,
    open: o.windows.reduce((n, w) => n + Math.floor((w.end - w.start) / (30 * 60_000)), 0),
  }));
const sumOpen = (days) => days.reduce((n, d) => n + d.open, 0);

test("calendar.room says how full the book is over the next fourteen days, or the fewer a business offers: the open slots freeWindows gives at half an hour, after the feed's two hours tomorrow and the hour on record the day after, by day from tomorrow on the business's clock, and the slots those take out of the hours; with no calendar, none says so and nothing is read; a calendar that cannot be read says unavailable", async () => {
  const room = async (t) => {
    const tc = newToolContext(calCtx(t), A, "viewer", "America/New_York", ROOM_NOW);
    const out = await runTool(tc, { name: "calendar", input: { action: "room" } });
    assert.equal(out.isError, false, out.result);
    return JSON.parse(out.result);
  };
  await withFeed({ body: ROOM_ICS }, async (fetched) => {
    const said = await room(roomTables("https://cal.example/room.ics"));
    const free = {
      hours: ROOM_HOURS,
      closures: [],
      tz: "America/New_York",
      rules: { lead_hours: 2, max_days_ahead: 14, slot_min: 30 },
      now: ROOM_NOW,
    };
    const busy = [
      { start: Date.parse("2026-09-09T14:00:00.000Z"), end: Date.parse("2026-09-09T16:00:00.000Z") },
      { start: Date.parse("2026-09-10T18:00:00.000Z"), end: Date.parse("2026-09-10T19:00:00.000Z") },
    ];
    const open = slotsOf(freeWindows({ ...free, busy }));
    const hours = slotsOf(freeWindows({ ...free, busy: [] }));
    assert.equal(said.days, 14);
    assert.deepEqual(said.by_day, open, "each day with room, as freeWindows gives it");
    assert.equal(said.open, sumOpen(open));
    assert.equal(said.open, 138, "nine weekdays of sixteen half hours, less four tomorrow and two the day after");
    assert.deepEqual(
      said.by_day[0],
      { day: "2026-09-09", open: 12 },
      "tomorrow on the business's clock, where UTC says today",
    );
    assert.equal(said.taken, sumOpen(hours) - sumOpen(open));
    assert.equal(said.taken, 6, "the feed's two hours and the record's one, in half hours");
    assert.deepEqual(Object.keys(said), ["days", "open", "taken", "by_day"], "nothing is missing: no none");
    assert.equal(fetched.length, 1, "one read of the feed");
  });

  // The room is the first fourteen days on offer: a business that offers a month ahead is counted over fourteen, and one
  // that offers a week over its week -- Wednesday to Friday and the Monday, less the same six half hours.
  for (const [ahead, days, open, last] of [
    [30, 14, 138, "2026-09-21"],
    [7, 7, 58, "2026-09-14"],
  ])
    await withFeed({ body: ROOM_ICS }, async () => {
      const rules = { ...calProfile.booking_rules, max_days_ahead: ahead };
      const said = await room(roomTables("https://cal.example/room.ics", rules));
      assert.deepEqual(
        [said.days, said.open, said.taken, said.by_day.at(-1).day],
        [days, open, 6, last],
        `${ahead} days ahead`,
      );
    });

  await withFeed({ body: ROOM_ICS }, async (fetched) => {
    assert.deepEqual(await room(roomTables(null)), {
      days: 14,
      open: 0,
      taken: 0,
      by_day: [],
      none: "no_calendar",
    });
    assert.deepEqual(fetched, [], "no calendar, no read");
  });

  await logged("ask_feed_fetch_failed", () =>
    withFeed({ body: "nope", status: 503 }, async () => {
      assert.deepEqual(await room(roomTables("https://cal.example/down.ics")), {
        days: 14,
        open: 0,
        taken: 0,
        by_day: [],
        none: "unavailable",
      });
    }),
  );
});
