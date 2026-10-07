/**
 * The report functions as packages/db calls them (repositories/reports/report-series.ts): by name, for the workspace and the days,
 * over whatever client the caller holds (the session's, so RLS decides what a member reads). A read that fails throws;
 * the reach-outs' say the database's refusal with its code, for the door to word. And the reviews' one read
 * (repositories/reports/review-report.ts), run over a database in memory: the period's profile reviews, the counts and the
 * oldest, the ones that wait, who answered and what was held, each for the workspace alone, paged past a thousand rows.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { reviewsReadSince, REVIEWS_WAITING_SHOWN } from "@chanlytics/contracts";
import { campaignSeries, reachOutReport, reportSeries, reviewsLedger } from "@chanlytics/db";
import { fakeDb } from "../_fake-db.mjs";
import { AT, rows, uuid } from "../_rows.mjs";

const W = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
/** A database that answers a function by name and keeps what it was asked. */
const dbWith = (answers) => {
  const asked = [];
  return { asked, db: { rpc: async (name, args) => (asked.push([name, args]), answers[name]) } };
};

test("each function is asked for the workspace and the days, and answers what the database says", async () => {
  const { db, asked } = dbWith({
    report_series: { data: { days: 7 }, error: null },
    campaign_series: { data: { days: 30 }, error: null },
    reach_out_report: { data: { days: 90 }, error: null },
  });
  assert.deepEqual(await reportSeries(db, W, 7), { days: 7 });
  assert.deepEqual(await campaignSeries(db, W, 30), { days: 30 });
  assert.deepEqual(await reachOutReport(db, W, 90), { ok: true, data: { days: 90 } });
  assert.deepEqual(asked, [
    ["report_series", { p_tenant_id: W, p_days: 7 }],
    ["campaign_series", { p_tenant_id: W, p_days: 30 }],
    ["reach_out_report", { p_tenant_id: W, p_days: 90 }],
  ]);
});

test("a read that fails throws, never nothing; the reach-outs' refusal keeps the code the door words it by", async () => {
  const down = { data: null, error: { message: "connection refused", code: "08006" } };
  await assert.rejects(reportSeries(dbWith({ report_series: down }).db, W, 7), /report_series.*connection refused/);
  await assert.rejects(
    campaignSeries(dbWith({ campaign_series: down }).db, W, 7),
    /campaign_series.*connection refused/,
  );
  const refused = { data: null, error: { message: "No workspace.", code: "P0002" } };
  assert.deepEqual(await reachOutReport(dbWith({ reach_out_report: refused }).db, W, 7), {
    ok: false,
    code: "P0002",
    message: "No workspace.",
  });
});

/* ---------------------------------------------------------------- the reviews on record: one bounded read */

const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
/** The read's start for a 30-day period ending on this day: a day before the period before begins, UTC midnight. */
const SINCE = reviewsReadSince("2026-10-06", 30);

/** A google_reviews row, whole as the table holds it: a profile review of the workspace, unanswered and undated unless the test says. */
const ledgerReview = (o = {}) => ({
  id: uuid(),
  tenant_id: W,
  review_id: `ChdDSUhN-${uuid().slice(-6)}`,
  origin: "profile",
  rating: 5,
  author: "Sam Example",
  author_uri: null,
  author_photo_uri: null,
  body: "Lovely.",
  language_code: null,
  published_at: null,
  reply_text: null,
  replied_at: null,
  maps_uri: null,
  first_seen_at: AT,
  last_seen_at: AT,
  ...o,
});

/** The Google read's row of a review: the columns the page draws, never the tenant or the last time it was seen. */
const ledgerDrawn = ({ tenant_id: _tenant, last_seen_at: _seen, ...drawn }) => drawn;

/** A reply or a held reply on the ledger, filed under the google_reviews row. */
const ledgerEvent = (kind, review, data, o = {}) =>
  rows.event({
    tenant_id: W,
    kind,
    category: "google",
    subject_type: "review",
    subject_id: review.id,
    data: { review_id: review.review_id, ...data },
    ...o,
  });

/** What a read of one world answers, and the queries it made. */
async function ledgerOf(tables, sinceIso = SINCE) {
  const db = fakeDb(tables);
  return { ledger: await reviewsLedger(db, W, sinceIso), seen: db.seen };
}

test("the reviews written are the profile's of this workspace dated in the read, and nothing else", async () => {
  const replied = ledgerReview({
    published_at: "2026-10-05T10:00:00.000Z",
    rating: 5,
    reply_text: "Thank you!",
    replied_at: "2026-10-05T12:30:00.000Z",
  });
  const waits = ledgerReview({ published_at: "2026-09-20T09:00:00.000Z", rating: 2 });
  const edge = ledgerReview({ published_at: SINCE, rating: 4, reply_text: "Glad to hear it.", replied_at: SINCE });
  const unrated = ledgerReview({ published_at: "2026-09-25T18:00:00.000Z", rating: null });
  const before = ledgerReview({ published_at: "2026-08-06T23:59:59.000Z", rating: 3 });
  const undated = ledgerReview({ published_at: null, rating: 1 });
  const public5 = ledgerReview({ origin: "places", published_at: "2026-10-01T08:00:00.000Z" });
  const theirs = ledgerReview({ tenant_id: OTHER, published_at: "2026-10-04T08:00:00.000Z" });
  const { ledger } = await ledgerOf({
    google_reviews: [replied, waits, edge, unrated, before, undated, public5, theirs],
  });
  assert.deepEqual(ledger.written, [
    { id: replied.id, rating: 5, published_at: replied.published_at, has_reply: true, replied_at: replied.replied_at },
    { id: waits.id, rating: 2, published_at: waits.published_at, has_reply: false, replied_at: null },
    { id: edge.id, rating: 4, published_at: SINCE, has_reply: true, replied_at: SINCE },
    { id: unrated.id, rating: null, published_at: unrated.published_at, has_reply: false, replied_at: null },
  ]);
});

test("on record: the reviews of each origin the workspace holds, counted not read, and the oldest dated profile review", async () => {
  const oldest = ledgerReview({ published_at: "2026-03-02T08:00:00.000Z" });
  const recent = ledgerReview({ published_at: "2026-10-05T10:00:00.000Z" });
  const undated = ledgerReview({ published_at: null });
  const public2 = [
    ledgerReview({ origin: "places", published_at: "2025-01-01T08:00:00.000Z" }),
    ledgerReview({ origin: "places", published_at: "2026-10-01T08:00:00.000Z" }),
  ];
  const theirs = ledgerReview({ tenant_id: OTHER, published_at: "2020-01-01T00:00:00.000Z" });
  const { ledger, seen } = await ledgerOf({ google_reviews: [recent, undated, oldest, ...public2, theirs] });
  assert.deepEqual(ledger.on_record, { profile: 3, places: 2, oldest_at: oldest.published_at });
  const heads = seen.filter((q) => q.head);
  assert.deepEqual(
    heads.map((q) => q.filters.find(([, col]) => col === "origin")?.[2]).sort(),
    ["places", "profile"],
    "each origin is a counted head: no row of either is read",
  );
});

test("on record with nothing dated has no oldest; with nothing at all it counts none", async () => {
  const undated = ledgerReview({ published_at: null });
  const { ledger } = await ledgerOf({ google_reviews: [undated] });
  assert.deepEqual(ledger.on_record, { profile: 1, places: 0, oldest_at: null });
  const none = (await ledgerOf({ google_reviews: [] })).ledger;
  assert.deepEqual(none, {
    written: [],
    on_record: { profile: 0, places: 0, oldest_at: null },
    waiting_total: 0,
    waiting: [],
    replies: [],
    held: [],
  });
});

test("waiting: the profile's reviews with no reply, the oldest first and the undated last, a few of them and all of them counted", async () => {
  const dated = (day, o = {}) => ledgerReview({ published_at: `2026-0${day}T09:00:00.000Z`, ...o });
  const newest = dated("9-30");
  const oldest = dated("3-02");
  const tieA = dated("8-15");
  const tieB = dated("8-15");
  const middle = dated("6-10");
  const undated = ledgerReview({ published_at: null });
  const answered = dated("1-05", { reply_text: "Thanks!", replied_at: "2026-01-05T10:00:00.000Z" });
  const public5 = ledgerReview({ origin: "places", published_at: "2026-02-01T09:00:00.000Z" });
  const theirs = ledgerReview({ tenant_id: OTHER, published_at: "2026-01-01T09:00:00.000Z" });
  const { ledger } = await ledgerOf({
    google_reviews: [newest, undated, tieB, answered, oldest, public5, middle, tieA, theirs],
  });
  assert.equal(REVIEWS_WAITING_SHOWN, 5, "the read is written for five");
  assert.equal(ledger.waiting_total, 6, "the count is all of them, not the five shown");
  assert.deepEqual(
    ledger.waiting,
    [oldest, middle, tieA, tieB, newest].map(ledgerDrawn),
    "oldest first, a tie by id, the undated one past the cap",
  );
  const { ledger: few } = await ledgerOf({ google_reviews: [undated, oldest] });
  assert.deepEqual(few.waiting, [oldest, undated].map(ledgerDrawn), "undated reviews come after every dated one");
  assert.equal(few.waiting_total, 2);
});

test("a waiting review is drawn as the Google read draws a review: the same columns, from the profile", async () => {
  const waits = ledgerReview({
    published_at: "2026-09-20T09:00:00.000Z",
    rating: 2,
    author: "Alex Example",
    author_photo_uri: "https://example.com/alex.png",
    body: "Waited a long time.",
    language_code: "en",
    maps_uri: "https://example.com/maps/alex",
  });
  const { ledger } = await ledgerOf({ google_reviews: [waits] });
  assert.deepEqual(ledger.waiting, [
    {
      id: waits.id,
      review_id: waits.review_id,
      origin: "profile",
      rating: 2,
      author: "Alex Example",
      author_uri: null,
      author_photo_uri: "https://example.com/alex.png",
      body: "Waited a long time.",
      language_code: "en",
      published_at: "2026-09-20T09:00:00.000Z",
      reply_text: null,
      replied_at: null,
      maps_uri: "https://example.com/maps/alex",
      first_seen_at: AT,
    },
  ]);
});

test("who answered: the replies of the written reviews, by the writer the event names; held: the waiting reviews' alone", async () => {
  const byReceptionist = ledgerReview({
    published_at: "2026-10-05T10:00:00.000Z",
    reply_text: "Thank you!",
    replied_at: "2026-10-05T12:00:00.000Z",
  });
  const byYou = ledgerReview({
    published_at: "2026-10-03T10:00:00.000Z",
    reply_text: "Glad you came.",
    replied_at: "2026-10-04T08:00:00.000Z",
  });
  const onGoogle = ledgerReview({
    published_at: "2026-10-02T10:00:00.000Z",
    reply_text: "Cheers.",
    replied_at: "2026-10-02T11:00:00.000Z",
  });
  const heldPrice = ledgerReview({ published_at: "2026-10-01T10:00:00.000Z", rating: 1 });
  const heldMoney = ledgerReview({ published_at: "2026-09-29T10:00:00.000Z", rating: 2 });
  const longAgo = ledgerReview({ published_at: "2025-05-01T10:00:00.000Z", reply_text: "Thanks.", replied_at: AT });
  const answeredHeld = ledgerReview({
    published_at: "2026-09-28T10:00:00.000Z",
    reply_text: "Sorry.",
    replied_at: "2026-09-29T10:00:00.000Z",
  });
  const unnamed = ledgerReview({
    published_at: "2026-09-27T10:00:00.000Z",
    reply_text: "See you soon.",
    replied_at: "2026-09-27T11:00:00.000Z",
  });
  const events = [
    ledgerEvent(
      "google.replied",
      byReceptionist,
      { chars: 80, by: "receptionist" },
      { created_at: "2026-10-05T12:00:00.000Z" },
    ),
    ledgerEvent("google.replied", byYou, { chars: 40 }, { created_at: "2026-10-04T08:00:00.000Z" }),
    // The reply was changed afterwards: both events come through, and the fold takes the latest.
    ledgerEvent("google.replied", byYou, { chars: 12, by: "receptionist" }, { created_at: "2026-10-04T09:00:00.000Z" }),
    // An event that names no one it knows is no receptionist's.
    ledgerEvent("google.replied", unnamed, { chars: 14, by: "owner" }, { created_at: "2026-09-27T11:00:00.000Z" }),
    // A reply to a review older than the read is none of the period's.
    ledgerEvent("google.replied", longAgo, { chars: 30 }, { created_at: "2026-10-04T10:00:00.000Z" }),
    ledgerEvent("google.reply_held", heldPrice, { why: "price" }, { created_at: "2026-10-02T10:00:00.000Z" }),
    ledgerEvent("google.reply_held", heldMoney, { why: "money" }, { created_at: "2026-09-30T10:00:00.000Z" }),
    // A reply that was held once and answered since is no longer waiting.
    ledgerEvent("google.reply_held", answeredHeld, { why: "price" }, { created_at: "2026-09-28T12:00:00.000Z" }),
    // Another kind of event, filed under a written review and under a waiting one, and another workspace's events under the same ids.
    ledgerEvent(
      "google.reviews",
      byReceptionist,
      { source: "profile", by: "receptionist" },
      { created_at: "2026-10-05T12:30:00.000Z" },
    ),
    ledgerEvent(
      "google.reviews",
      heldMoney,
      { source: "profile", why: "price" },
      { created_at: "2026-10-05T12:31:00.000Z" },
    ),
    ledgerEvent(
      "google.replied",
      byReceptionist,
      { chars: 9 },
      { tenant_id: OTHER, created_at: "2026-10-05T13:00:00.000Z" },
    ),
    ledgerEvent(
      "google.reply_held",
      heldPrice,
      { why: "money" },
      { tenant_id: OTHER, created_at: "2026-10-02T11:00:00.000Z" },
    ),
    rows.event({
      tenant_id: W,
      kind: "google.replied",
      category: "google",
      subject_id: null,
      data: { by: "receptionist" },
    }),
  ];
  const { ledger } = await ledgerOf({
    google_reviews: [byReceptionist, byYou, onGoogle, heldPrice, heldMoney, longAgo, answeredHeld, unnamed],
    events,
  });
  assert.deepEqual(
    ledger.written.map((r) => r.id),
    [byReceptionist, byYou, onGoogle, heldPrice, heldMoney, answeredHeld, unnamed].map((r) => r.id),
  );
  assert.deepEqual(ledger.replies, [
    { review_id: byReceptionist.id, by: "receptionist", at: "2026-10-05T12:00:00.000Z" },
    { review_id: byYou.id, by: null, at: "2026-10-04T08:00:00.000Z" },
    { review_id: byYou.id, by: "receptionist", at: "2026-10-04T09:00:00.000Z" },
    { review_id: unnamed.id, by: null, at: "2026-09-27T11:00:00.000Z" },
  ]);
  assert.deepEqual(
    ledger.held,
    [
      { review_id: heldMoney.id, why: "money" },
      { review_id: heldPrice.id, why: "price" },
    ],
    "held reads the waiting reviews only, the earlier hold first",
  );
});

test("every read names the workspace, and the period's rows and the replies are paged past a thousand", async () => {
  const written = Array.from({ length: 1205 }, (_, i) =>
    ledgerReview({
      published_at: `2026-09-${String(10 + (i % 15)).padStart(2, "0")}T0${i % 10}:00:00.000Z`,
      reply_text: "Thank you!",
      replied_at: "2026-10-01T10:00:00.000Z",
    }),
  );
  const events = written.map((r) => ledgerEvent("google.replied", r, { chars: 10, by: "receptionist" }));
  const { ledger, seen } = await ledgerOf({ google_reviews: written, events });
  assert.deepEqual(
    ledger.written.map((r) => r.id),
    written.map((r) => r.id),
    "every row, once, in id order",
  );
  assert.equal(ledger.replies.length, 1205);
  assert.equal(ledger.on_record.profile, 1205);
  assert.equal(ledger.waiting_total, 0);
  const pages = (table) => seen.filter((q) => q.table === table && q.range).map((q) => q.range);
  assert.deepEqual(pages("google_reviews"), [
    [0, 999],
    [1000, 1999],
  ]);
  assert.deepEqual(pages("events"), [
    [0, 999],
    [1000, 1999],
  ]);
  assert.ok(
    seen.every((q) => q.filters.some(([op, col, val]) => op === "eq" && col === "tenant_id" && val === W)),
    "no read leaves the workspace",
  );
});

/**
 * A database as `db` answers, except where `fails` says a select fails: that one answers the database's refusal, as
 * PostgREST does, and the others answer as they did.
 */
function ledgerDownWhere(db, fails) {
  const down = { data: null, count: null, error: { message: "connection refused", code: "08006" } };
  const refusal = new Proxy(() => refusal, {
    get: (_, key) => (key === "then" ? (resolve, reject) => Promise.resolve(down).then(resolve, reject) : refusal),
  });
  return {
    ...db,
    from: (table) => {
      const query = db.from(table);
      return {
        ...query,
        select: (columns, opts) => (fails(table, columns, opts) ? refusal : query.select(columns, opts)),
      };
    },
  };
}

test("a read that fails throws, whichever part of it; it is never a report of no reviews", async () => {
  const waits = ledgerReview({ published_at: "2026-09-20T09:00:00.000Z" });
  const tables = { google_reviews: [waits], events: [] };
  const parts = [
    ["written", (t, c) => t === "google_reviews" && c.startsWith("id, rating")],
    ["on record", (t, c, o) => t === "google_reviews" && o?.head === true],
    ["oldest", (t, c) => t === "google_reviews" && c === "published_at"],
    ["waiting", (t, c) => t === "google_reviews" && c.startsWith("id, review_id")],
    ["replies", (t, c) => t === "events" && c.startsWith("subject_id, created_at")],
    ["held", (t, c) => t === "events" && c === "subject_id, data"],
  ];
  for (const [part, fails] of parts)
    await assert.rejects(
      reviewsLedger(ledgerDownWhere(fakeDb(tables), fails), W, SINCE),
      new RegExp(`reviewsLedger ${part}: connection refused`),
      part,
    );
  await assert.rejects(
    reviewsLedger(fakeDb(tables, { "google_reviews.select": { message: "connection refused" } }), W, SINCE),
    /reviewsLedger.*connection refused/,
  );
  await assert.rejects(
    reviewsLedger(fakeDb(tables, { "events.select": { message: "connection refused" } }), W, SINCE),
    /reviewsLedger.*connection refused/,
  );
});

test("nothing waiting asks for no held reply", async () => {
  const answered = ledgerReview({
    published_at: "2026-10-05T10:00:00.000Z",
    reply_text: "Thank you!",
    replied_at: "2026-10-05T12:00:00.000Z",
  });
  const { ledger, seen } = await ledgerOf({ google_reviews: [answered], events: [] });
  assert.deepEqual(ledger.held, []);
  assert.equal(
    seen.filter((q) => q.table === "events" && q.filters.some(([, col]) => col === "subject_id")).length,
    0,
    "no waiting review, no read of the held replies",
  );
});
