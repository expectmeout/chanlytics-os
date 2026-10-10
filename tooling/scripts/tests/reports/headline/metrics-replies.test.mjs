/**
 * The day's hold beside the metrics (server/metrics/metrics.ts; packages/db `firstReplies`): the replies `first_replies` lists, the
 * one rule for who answered and how fast (00303), kept to the window's own midnight, run through `holdOf` on the server and handed
 * on as `reply_hold`: the hold most replies waited and how many went out as it ended, later than it, and with none; four numbers,
 * however long the day. So the browser, GET today and Ask say reply speed against the hold from one reading.
 *
 * The replies are `metrics_summary`'s own where it answers them (`replies`, 00359: the rows it read to count who answered): every
 * read of Today asked `first_replies` for them a second time, beside the function, the two heaviest statements the dashboard makes
 * (9 Oct 2026). A database the migration has not reached answers none, and is asked `first_replies` from 26 hours back, as it was:
 * either deploy order works. A read that fails costs the clause, never the page; a longer window is none of Today's and reads
 * none; a day on which no reply waited a hold sends nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { HOUR_MS } from "@chanlytics/contracts";
import { firstReplies } from "@chanlytics/db";
import { fakeDb } from "../../_fake-db.mjs";
import { importSrc } from "../../_source.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
const { metricsSummaryFor } = await importSrc("apps/dashboard/src/server/metrics/metrics.ts");

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CONVERSATION = "cccccccc-cccc-4ccc-8ccc-cccccccccc01";
/** A row of `first_replies` as PostgREST answers it. */
const row = (over) => ({
  asked_at: "2026-09-18T14:00:00.250+00:00",
  conversation_id: CONVERSATION,
  ai_at: "2026-09-18T14:01:00.850+00:00",
  human_at: null,
  who: "ai",
  ai_seconds: 60.6,
  ai_hold_s: 60,
  ...over,
});
const SUMMARY = {
  workspace: { name: "Harbor Studio", timezone: "America/New_York", status: "active" },
  channels: [],
  window: {
    days: 1,
    since: "2026-09-18T04:00:00+00:00",
    since_local: "2026-09-18T00:00:00",
    now_local: "2026-09-18T11:00:00",
  },
  now: {},
  period: { messages_in: 4, median_reply_seconds_ai: 62 },
};
/** A workspace's database: the metrics function, and `first_replies` where the world models it (or fails where it is a function). */
const world = (answer) =>
  fakeDb(
    {
      memberships: [
        { user_id: "u1", tenant_id: A, role: "owner", tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
      ],
      mailboxes: [],
    },
    {},
    { metrics_summary: () => SUMMARY, ...(answer ? { first_replies: answer } : {}) },
  );
const dbWith = (answers) => {
  const asked = [];
  return { asked, db: { rpc: async (name, args) => (asked.push([name, args]), answers[name]) } };
};

test("firstReplies: the receptionist's replies as report_series lists them, whole seconds, and nobody else's", async () => {
  const since = new Date("2026-09-16T20:00:00Z");
  const { db, asked } = dbWith({
    first_replies: {
      error: null,
      data: [
        row({ ai_seconds: 60.6, ai_hold_s: 60.2 }),
        row({ who: "you", ai_seconds: null, ai_hold_s: null }),
        row({ ai_seconds: 7.4, ai_hold_s: null }),
      ],
    },
  });
  assert.deepEqual(await firstReplies(db, A, since), [
    { asked_at: "2026-09-18T14:00:00.250+00:00", s: 61, hold: 60 },
    { asked_at: "2026-09-18T14:00:00.250+00:00", s: 7, hold: 0 },
  ]);
  assert.deepEqual(asked, [["first_replies", { p_tenant_id: A, p_start: since.toISOString() }]]);
  const down = dbWith({ first_replies: { data: null, error: { message: "boom", code: "08006" } } });
  await assert.rejects(firstReplies(down.db, A, since), /first_replies.*boom/);
});

/** The function's answer once it carries the day's replies (00359), each as it lists them: asked, seconds, hold, whole. */
const carrying = (replies, over = {}) =>
  fakeDb(
    {
      memberships: [
        { user_id: "u1", tenant_id: A, role: "owner", tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
      ],
      mailboxes: [],
    },
    {},
    {
      metrics_summary: () => ({ ...SUMMARY, ...over, replies }),
      first_replies: () => {
        throw new Error("first_replies was asked beside a function that answers the replies");
      },
    },
  );

test("the day's replies are the function's own where it answers them: counted once, by the one rule, and first_replies is not asked again", async () => {
  // The same day as the test below, as the function lists it: only the receptionist's, already whole, already the window's.
  const db = carrying([
    { asked_at: "2026-09-18T14:00:00.25+00:00", s: 61, hold: 60 },
    { asked_at: "2026-09-18T15:00:00+00:00", s: 95, hold: 60 },
    { asked_at: "2026-09-18T16:00:00+00:00", s: 7, hold: 0 },
  ]);
  const m = await metricsSummaryFor(db, A, 1);
  assert.deepEqual(m.reply_hold, { label: "1-minute", at_end: 1, later: 1, unheld: 1 });
  assert.equal(
    db.seen.filter((q) => q.rpc === "first_replies").length,
    0,
    "REGRESSION: who answered first was worked out twice on every read of Today",
  );
  assert.equal(db.seen.filter((q) => q.rpc === "metrics_summary").length, 1);
  assert.equal(m.replies, undefined, "the rows are this server's to count: no list goes over the wire");
  assert.equal(m.period.median_reply_seconds_ai, 62, "the median is the function's, untouched");
  // A day nobody was answered on, and a day no reply waited a hold: the function's answer, less the list, and no second read.
  for (const replies of [[], [{ asked_at: "2026-09-18T16:00:00+00:00", s: 7, hold: 0 }]]) {
    const quiet = carrying(replies);
    assert.deepEqual(await metricsSummaryFor(quiet, A, 1), SUMMARY);
    assert.equal(quiet.seen.filter((q) => q.rpc === "first_replies").length, 0);
  }
  // A row that is not a reply is left out, never counted as one nobody waited for.
  const odd = carrying([
    { asked_at: "2026-09-18T14:00:00+00:00", s: 61, hold: 60 },
    { asked_at: null, s: 61, hold: 60 },
    { asked_at: "2026-09-18T15:00:00+00:00", s: "soon", hold: 60 },
    null,
    { asked_at: "2026-09-18T16:00:00+00:00", s: 61 },
  ]);
  assert.deepEqual((await metricsSummaryFor(odd, A, 1)).reply_hold, {
    label: "1-minute",
    at_end: 1,
    later: 0,
    unheld: 1,
  });
});

test("a longer window's answer carries no replies (null), and none are asked for: the period's are Reports'", async () => {
  const db = carrying(null, { window: { ...SUMMARY.window, days: 7 } });
  const m = await metricsSummaryFor(db, A, 7);
  assert.equal(m.reply_hold, undefined);
  assert.equal(m.replies, undefined);
  assert.equal(db.seen.filter((q) => q.rpc === "first_replies").length, 0);
});

test("a database the migration has not reached: a one-day window carries the day's hold from first_replies, from the replies the window's own midnight keeps, by the one rule, four numbers", async () => {
  const db = world(() => [
    row({ asked_at: "2026-09-17T23:30:00.000+00:00", ai_seconds: 61.4 }),
    row({ asked_at: "2026-09-18T14:00:00.250+00:00", ai_seconds: 60.6 }),
    row({ asked_at: "2026-09-18T15:00:00.000+00:00", ai_seconds: 95.2 }),
    row({ asked_at: "2026-09-18T15:30:00.000+00:00", who: "you", ai_seconds: null, ai_hold_s: null }),
    row({ asked_at: "2026-09-18T16:00:00.000+00:00", ai_seconds: 7.4, ai_hold_s: 0 }),
  ]);
  const m = await metricsSummaryFor(db, A, 1);
  // The reply before the window's midnight is not the day's; of the three that are: one went out as its minute ended, one after it
  // (95 seconds against 60, past the queue's own tick), one was sent with no hold at all.
  assert.deepEqual(m.reply_hold, { label: "1-minute", at_end: 1, later: 1, unheld: 1 });
  assert.equal(
    m.replies,
    undefined,
    "no list goes over the wire: the browser, the phone and Ask each get four numbers",
  );
  assert.equal(m.period.median_reply_seconds_ai, 62, "the median is the function's, untouched");
  const [call] = db.seen.filter((q) => q.rpc === "first_replies");
  const lookback = Date.now() - Date.parse(call.args.p_start);
  assert.ok(
    Math.abs(lookback - 26 * HOUR_MS) < 10_000,
    "from 26 hours back: a local day is at most 25, so the window's own midnight is always inside it",
  );
  assert.equal(call.args.p_tenant_id, A);
});

test("a day on which no reply waited a hold sends no summary: the function's answer as it was", async () => {
  const db = world(() => [row({ ai_hold_s: 0 }), row({ ai_hold_s: null, asked_at: "2026-09-18T16:00:00.000+00:00" })]);
  const m = await metricsSummaryFor(db, A, 1);
  assert.equal(m.reply_hold, undefined);
  assert.deepEqual(m, SUMMARY, "byte for byte what the function answered");
});

test("a longer window reads no replies: the period's are Reports' (report_series), and the answer is the function's alone", async () => {
  const db = world(() => [row({})]);
  const m = await metricsSummaryFor(db, A, 7);
  assert.equal(m.reply_hold, undefined);
  assert.equal(db.seen.filter((q) => q.rpc === "first_replies").length, 0);
});

test("a replies read that fails costs the clause and nothing else: Today draws, saying the median it said before", async () => {
  const db = world(() => {
    throw new Error("connection refused");
  });
  const was = console.error;
  console.error = () => {};
  try {
    const m = await metricsSummaryFor(db, A, 1);
    assert.equal(m.reply_hold, undefined);
    assert.equal(m.period.median_reply_seconds_ai, 62);
    assert.equal(m.linesRead, undefined, "the lines were all read: only the replies were not");
  } finally {
    console.error = was;
  }
});
