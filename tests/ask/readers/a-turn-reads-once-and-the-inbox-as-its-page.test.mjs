/**
 * Readers, the one place a read lives: a turn reads a reader once per arguments, a ttl keeps across turns, the kept
 * values are bounded; and the facts, metrics, conversations, escalations, calls and searches, the Inbox and Today
 * answered as their routes answer them, a thread among them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { callerName, toCallVM } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";
import {
  A,
  B,
  C1,
  C2,
  COUNTS,
  HOUR,
  L1,
  L2,
  L3,
  OUTSIDE,
  S1,
  SUMMARY,
  ago,
  appointmentWord,
  call,
  calls,
  closedHolds,
  config,
  contact,
  conversation,
  conversations,
  counting,
  ctxFor,
  dayCtx,
  dayDoors,
  dayTables,
  escalations,
  facts,
  hasDeals,
  inbox,
  kernel,
  logged,
  message,
  messagesOf,
  metrics,
  newToolContext,
  oneThread,
  openHolds,
  policies,
  req,
  routeCtx,
  runTool,
  searches,
  selects,
  tables,
  threadRoute,
  threadTables,
  today,
  turnIn,
  uuid,
  view,
} from "./_readers.mjs";

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

test("the facts readers: the tenant's name and zone are read once and kept for turns that keep; the word, a deal on file, the policies and the config are read once per turn; each answers the row's fields and nothing else", async () => {
  const ctx = ctxFor(tables());
  const rc = kernel.readerContext(ctx, { tenantId: A, role: "operator" }, undefined, { keep: true });
  const [f, w, d, p, c] = await Promise.all([
    kernel.load(rc, facts, undefined),
    kernel.load(rc, appointmentWord, undefined),
    kernel.load(rc, hasDeals, undefined),
    kernel.load(rc, policies, undefined),
    kernel.load(rc, config, undefined),
  ]);
  assert.deepEqual(f.data, { name: "Harbor", timezone: "America/New_York" });
  // None picked, and the retired answer said its customers book: an appointment (contracts appointmentWordOf).
  assert.equal(w.data, "appointment");
  assert.equal(d.data, false, "no deal on file");
  assert.deepEqual(p.data, []);
  // Who last changed it and when ride with the row (PR 1.7), so the settings read is the turn's one read of it.
  assert.deepEqual(c.data, { config: { hours: "9-5" }, version: 3, updated_by: null, updated_at: null });
  await Promise.all([kernel.load(rc, facts, undefined), kernel.load(rc, config, undefined)]);
  const reads = (table) => ctx.supabase.seen.filter((q) => q.table === table && q.op === "select").length;
  assert.deepEqual(
    [reads("tenants"), reads("tenant_config"), reads("deals")],
    [2, 1, 1],
    "tenants once for facts and once for the word; the config once; the deals once, for whether there is one",
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
    "getTenantFacts' own defaults",
  );
  assert.equal((await kernel.load(none, config, undefined)).data, null);
});

test("the word reader says the word picked, else an appointment, and a row it cannot read (a database 00458 has not reached among them) says an appointment", async () => {
  const wordOf = async (tenant, faults = {}) => {
    const t = tables();
    t.tenants = [{ ...t.tenants[0], ...tenant }];
    const rc = kernel.readerContext({ ...ctxFor(t), supabase: fakeDb(t, faults) }, { tenantId: A, role: "operator" });
    return (await kernel.load(rc, appointmentWord, undefined)).data;
  };
  assert.equal(await wordOf({ appointment_word: "session" }), "session", "the word picked");
  assert.equal(await wordOf({ appointment_word: null }), "appointment", "none picked");
  assert.equal(
    await wordOf({}, { "tenants.select": { message: "down" } }),
    "appointment",
    "unreadable: an appointment",
  );
  // An older database: the column is not there, and the one read says an appointment.
  const asked = [];
  const older = {
    from: () => ({
      select: (columns) => ({
        eq: () => ({
          maybeSingle: async () => {
            asked.push(columns);
            return { data: null, error: { message: "column tenants.appointment_word does not exist" } };
          },
        }),
      }),
    }),
  };
  const rc = kernel.readerContext({ ...ctxFor(tables()), supabase: older }, { tenantId: A, role: "operator" });
  assert.equal((await kernel.load(rc, appointmentWord, undefined)).data, "appointment");
  assert.deepEqual(asked, ["appointment_word"]);
});

test("metrics: the numbers behind Today as GET metrics answers them, for the days handed in, in the workspace read; a function that says no is a 404, never a silent zero", async () => {
  // ask/routes/, "the metrics behind Today".
  const asked = [];
  const rpcs = {
    metrics_summary: (a) => {
      asked.push(a);
      return a.p_tenant_id === A ? { conversations: 3 } : { error: "not a member" };
    },
  };
  const r = await kernel.load(turnIn(dayCtx({}, { rpcs })), metrics, { days: 1 });
  assert.deepEqual(r.data, { metrics: { conversations: 3 }, workspace_id: A });
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
  const ctx = dayCtx({ conversations: threads, messages: said }, { opts: { maxRows: 100 } });
  const newest = await kernel.load(turnIn(ctx), conversations, { ids: null });
  assert.equal(
    newest.data.conversations.filter((c) => c.messages.length === 0).length,
    0,
    "none reads No messages yet",
  );
  assert.equal(
    newest.data.conversations.reduce((n, c) => n + c.messages.length, 0),
    300,
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
    [{ p_tenant_id: A, p_threads: 30, p_each: 10, p_most: 1000 }],
    "the messages in one read (00258), under a row cap: each thread's newest ten (LIST_MESSAGES_EACH), never one cut",
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
  // leads/routes/, "the searches read brings the rail's counts with it".
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
    openHolds(ctx).length,
    2,
    "the open escalations in two halves: the holds that wait on a person, and the hand-backs (escalations.ts)",
  );
  assert.equal(
    selects(ctx, "escalations").filter(closedHolds).length,
    2,
    "and each read of threads asks their newest closed hold beside their messages (db listLastClosedHolds)",
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
    "going",
    "previewsTried", // not done today or the word: GET today's route reads those beside this reader
    "formRequests", // the requests sent through a form that nobody has answered (00680)
    "formRequestsCount", // how many in all, past the list's 200 (00709)
    "formHeld", // each form's entries held for a look that nobody has looked at in three days
    "comments", // the comments on the posts that wait on the owner: AI can't answer, or the answer didn't go (00699)
    "ai",
  ]);
  // What Today says of AI beside the day (Working for you, W1 to W3): each part a read of its own, null where it fails
  // (here no visits, settings or saved views are kept), and the day stands.
  assert.deepEqual(Object.keys(r.data.ai), ["booked", "stopped", "looked_at"]);
  assert.equal(r.data.ai.looked_at, null, "a first look: nothing kept of an earlier one");
  // What goes on its own today, each with its Stop (decision 0064): the runs set to start before the day ends, none here.
  assert.deepEqual(r.data.going, []);
  assert.deepEqual(
    r.data.heldThreads.map((c) => c.id),
    [OUTSIDE],
    "the thread of the hold past the hundred, read by id: Ask's Today counts it as the badge does (S7-7)",
  );
  // A one-day window reads what was booked in it as well (decision 0076): none in this world.
  assert.deepEqual(r.data.metrics, { ...SUMMARY, bookings: { booked: 0, visits: [], arrive: false } });
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
  const reads = () => [
    selects(ctx, "conversations").length,
    openHolds(ctx).length,
    selects(ctx, "escalations").filter(closedHolds).length,
    selects(ctx, "calls").length,
    selects(ctx, "lead_searches_view").length,
  ];
  assert.deepEqual(
    reads(),
    [2, 2, 2, 1, 1],
    "Today alone: the hundred and the held thread by id, the escalations in their two halves, the closed holds of each read of threads, the calls, the searches",
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
    [2, 2, 2, 1, 1],
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
  assert.deepEqual(callLines, [{ error: "DbFailure: permission denied" }]);

  const { result: noSearches, lines: searchLines } = await logged("today_searches_fetch_failed", () =>
    kernel.load(
      turnIn(dayCtx(dayTables(), { rpcs: dayDoors, faults: { "lead_searches_view.select": { message: "down" } } })),
      today,
      undefined,
    ),
  );
  assert.equal(noSearches.data.searches, null, "the queue says nothing of searches it could not read");
  assert.equal(noSearches.data.calls.length, 2);
  assert.deepEqual(noSearches.data.metrics, { ...SUMMARY, bookings: { booked: 0, visits: [], arrive: false } });
  assert.deepEqual(searchLines, [{ error: "DbFailure: down" }]);
});

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
  assert.deepEqual(read.rows, [], "a message is cited by its conversation");
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
        "id, conversation_id, direction, sender, type, body, media, meta, created_at, status, channel_ts, channel, error",
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
  const said = (await runTool(tc, { name: "inbox", input: { action: "conversation", conversation_id: C1 } })).result;
  assert.ok(JSON.parse(said).messages.length > 0, "the tool read the conversation");
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
