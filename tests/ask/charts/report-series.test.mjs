/**
 * The series Ask can chart, read through the report tool as the model calls it: every day of the period, not the last
 * fourteen, and the Reviews lens's own series. Asked on 18 Oct 2026 to chart Google reviews over time, Ask drew 2 bars while
 * Reports held 40 days of them: the tool cut the days and passed the lens's head and figures alone. A period longer than
 * a chart's points is added up by the week, and a day no reading reaches is left out, never drawn as a zero.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ASK_ANSWER_CAPS, reviewsWindowOf, toReviewsReportVM, weekTotals } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";
import { rows } from "../../_rows.mjs";
import { rday } from "../../reports/_report-world.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { runTool, newToolContext, toApiTools } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "99999999-9999-4999-8999-999999999999";
const TZ = "America/New_York";
const TODAY = "2026-10-17";
const NOW = new Date("2026-10-17T16:00:00Z");

/** The day `n` days before today. */
const ago = (n) => new Date(Date.parse(`${TODAY}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

/** A quiet business with two messages a day, one answered by the receptionist and one by a person. */
const reportSeries = (a) => ({
  timezone: TZ,
  days: a.p_days,
  span_days: a.p_days * 2,
  today: TODAY,
  series: Array.from({ length: a.p_days * 2 }, (_, i) =>
    rday(ago(a.p_days * 2 - 1 - i), { messages_in: 2, conversations: 1, answered_ai: 1, answered_you: 1 }),
  ),
  reasons: {},
  reply_seconds: [],
  sentiments: {},
  voicemail: 0,
});

/** `readings` days of the listing's count, one more review a day, the last of them today. */
const readings = (n) =>
  Array.from({ length: n }, (_, i) => ({ tenant_id: A, day: ago(n - 1 - i), rating: 4.5, review_count: 71 + i }));

/** The reviews on record, one a week back from today, as the database counts them. */
const WRITTEN = [ago(0), ago(7), ago(14), ago(21)].map((d, i) => ({
  id: `r${i}`,
  d,
  rating: 5,
  replied: true,
  secs: 3600,
  by: null,
}));
const ledgerOf =
  (written) =>
  ({ p_days }) => ({
    timezone: TZ,
    today: TODAY,
    days: p_days,
    on_record: { profile: written.length, places: 0, complete: true },
    written,
    waiting_total: 0,
    waiting: [],
  });

const listing = rows.googleListing({
  tenant_id: A,
  rating: 4.5,
  review_count: 110,
  linked_at: "2026-09-01T12:00:00Z",
  checked_at: NOW.toISOString(),
});
const connection = rows.googleConnection({
  tenant_id: A,
  google_email: "owner@example.com",
  location_name: "locations/1",
  location_title: "Harbor Studio",
  connected_at: "2026-08-01T12:00:00Z",
  last_synced_at: NOW.toISOString(),
});

/** A workspace with its Google tables as given, and the rest of Reports quiet. */
const world = (google = {}, written = []) => ({
  supabase: fakeDb(
    {
      memberships: [{ user_id: USER, tenant_id: A, role: "owner", tenants: { slug: "harbor" } }],
      tenants: [{ id: A, slug: "harbor", name: "Harbor Studio", timezone: TZ }],
      tenant_config: [],
      policies: [],
      contacts: [],
      google_listings: [],
      google_connections: [],
      google_reviews: [],
      google_listing_days: [],
      events: [],
      ...google,
    },
    {},
    { report_series: reportSeries, reviews_ledger: ledgerOf(written) },
  ),
  userId: USER,
  email: "ada@example.com",
  params: {},
});

/** One report call, as the model makes it, its answer parsed. */
async function report(ctx, input) {
  const out = await runTool(newToolContext(ctx, A, "owner", TZ, NOW), { name: "report", input });
  assert.equal(out.isError, false, out.result);
  return JSON.parse(out.result);
}

test("by_day holds every day of the period, oldest first, each named so a chart can say it", async () => {
  const said = await report(world(), { period: "30d", lenses: ["overview"] });
  assert.equal(said.by_day.length, 30);
  assert.deepEqual(said.by_day.at(-1), { day: "Oct 17", in: 2, receptionist: 1, you: 1, unanswered: 0 });
  assert.equal(said.by_day[0].day, "Sep 18");
});

test("a month by day fits a chart whole, so it is said by the day alone", async () => {
  const said = await report(world(), { period: "30d", lenses: ["overview"] });
  assert.ok(said.by_day.length <= ASK_ANSWER_CAPS.points);
  assert.equal("by_week" in said, false);
});

test("a period longer than a chart holds is added up by the week as well, with every message in it", async () => {
  const said = await report(world(), { period: "90d", lenses: ["overview"] });
  assert.equal(said.by_day.length, 90);
  assert.ok(said.by_week.length <= ASK_ANSWER_CAPS.points, "drawn whole");
  const sum = (key) => said.by_week.reduce((n, w) => n + w[key], 0);
  assert.deepEqual([sum("in"), sum("receptionist"), sum("you"), sum("unanswered")], [180, 90, 90, 0]);
  assert.deepEqual(Object.keys(said.by_week[0]), ["week", "in", "receptionist", "you", "unanswered"]);
});

test("with a Business Profile, the lens says the weeks its card draws, and the card's line", async () => {
  const ctx = world({ google_listings: [listing], google_connections: [connection] }, WRITTEN);
  const said = (await report(ctx, { period: "30d", lenses: ["reviews"] })).reviews;
  assert.deepEqual(said.weekly.rows.at(-1), { week: "Oct 12", written: 1 });
  assert.equal(
    said.weekly.rows.reduce((n, w) => n + w.written, 0),
    4,
  );
  assert.equal(said.weekly.line, "4 written in the last 30 days");
});

test("with no review in its weeks, the lens says the card's own words for why", async () => {
  const ctx = world({ google_listings: [listing], google_connections: [connection] });
  const said = (await report(ctx, { period: "30d", lenses: ["reviews"] })).reviews;
  assert.deepEqual(said.weekly, { empty: "No review written in this period." });
});

test("with the public listing alone, the lens says what its daily readings gained, by the day", async () => {
  const ctx = world({ google_listings: [listing], google_listing_days: readings(40) });
  const said = (await report(ctx, { period: "30d", lenses: ["reviews"] })).reviews;
  assert.equal(said.gained.rows.length, 30);
  assert.deepEqual(said.gained.rows.at(-1), { day: "Oct 17", gained: 1 });
  assert.equal(said.gained.line, "30 ratings gained in the last 30 days");
});

test("the 18 Oct case: 40 days of readings in a 90-day read are charted by the week, from the day they begin", async () => {
  const ctx = world({ google_listings: [listing], google_listing_days: readings(40) });
  const said = (await report(ctx, { period: "90d", lenses: ["reviews"] })).reviews;
  assert.ok(said.gained.rows.length > 2, "more than the two bars it drew");
  assert.ok(said.gained.rows.length <= ASK_ANSWER_CAPS.points, "drawn whole");
  assert.equal(said.gained.rows[0].week, "Sep 8", "the first reading's week: no zero for a day nothing read");
  assert.equal(
    said.gained.rows.reduce((n, w) => n + w.gained, 0),
    39,
    "the first reading is the baseline: forty readings, thirty-nine gains",
  );
});

test("a day no reading reaches is left out of the days too, never said as none gained", async () => {
  const ctx = world({ google_listings: [listing], google_listing_days: readings(10) });
  const said = (await report(ctx, { period: "30d", lenses: ["reviews"] })).reviews;
  assert.equal(said.gained.rows.length, 10);
  assert.equal(said.gained.rows[0].day, "Oct 8");
});

test("one reading says the card's words for why there are no days yet", async () => {
  const ctx = world({ google_listings: [listing], google_listing_days: readings(1) });
  const said = (await report(ctx, { period: "30d", lenses: ["reviews"] })).reviews;
  assert.deepEqual(said.gained, {
    empty: "The count is read once a day; the first difference shows after the second read.",
  });
});

test("the numbers are the page's: the weeks are the fold's own", async () => {
  const ctx = world({ google_listings: [listing], google_connections: [connection] }, WRITTEN);
  const said = (await report(ctx, { period: "30d", lenses: ["reviews"] })).reviews;
  const page = toReviewsReportVM(
    {
      timezone: TZ,
      today: TODAY,
      days: 30,
      google: { listing, connection, reviews: [], days: [], reply_mode: "ask" },
      readable: true,
      ledger: ledgerOf(WRITTEN)({ p_days: 30 }),
    },
    { nowMs: NOW.getTime() },
  );
  assert.deepEqual(
    said.weekly.rows,
    page.weekly.points.map((w) => ({ week: w.label, written: w.written })),
  );
  assert.ok(reviewsWindowOf(TODAY, 30).since <= page.weekly.points[0].day);
});

test("the tool says what the page on screen lacks: Reports' page data holds figures, so a chart reads the series", () => {
  const { description } = toApiTools("owner", false, true).find((d) => d.name === "report");
  assert.match(description, /the Reports page on screen holds its figures and not its series/);
});

test("weekTotals adds a day series up by calendar week, each clipped to the series, its keys alone", () => {
  const days = [
    { day: "2026-10-03", a: 1, b: 2, other: 9 }, // a Saturday
    { day: "2026-10-04", a: 1, b: 0, other: 9 }, // its Sunday
    { day: "2026-10-05", a: 4, b: 1, other: 9 }, // the Monday after
  ];
  assert.deepEqual(weekTotals(days, ["a", "b"]), [
    { day: "2026-10-03", label: "Oct 3", short: "3", a: 2, b: 2 },
    { day: "2026-10-05", label: "Oct 5", short: "5", a: 4, b: 1 },
  ]);
  assert.deepEqual(weekTotals([], ["a"]), []);
});
