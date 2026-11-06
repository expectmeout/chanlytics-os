/**
 * reviews_ledger (00350), proved on a real Postgres: the Reviews lens's one read of the reviews on record. The window is the
 * workspace's own zone (a tenant in Pacific/Auckland, a day ahead of UTC, and one in Los Angeles, a day behind it, read the
 * same instant on different days), the profile's reviews are counted by the day each was written, a reply is the receptionist's
 * where its own event (written through the real writer, emitEvent) is the last recorded under the review and lies within
 * six hours of the reply on the row, the ones that wait come oldest first and five at most with why a reply written for one
 * was held, the counts are the workspace's alone, the answer is the DTO the fold reads and no more, and a member reads what the service role reads for their
 * own workspace and nothing of another's.
 *
 * Runs the way tenancy.db.test.mjs does: its own workspaces, users and rows, made with the service key and removed after,
 * against the database `supabase start` builds on this machine, never production. The sessions are real.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { REVIEWS_WAITING_SHOWN, isReviewsLedgerDto } from "@chanlytics/contracts";
import { emitEvent } from "@chanlytics/db";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes users, workspaces, reviews and events"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the member's session this suite reads as needs it"
        : false;

const AUCKLAND = "Pacific/Auckland";
const LOS_ANGELES = "America/Los_Angeles";
const HOUR = 3_600_000;

let db;
const made = { tenants: [], users: [] };
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

/** The wall clock in a zone at an instant, as two-digit text: year, month, day, hour, minute. */
const wall = (ms, zone) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  );
const dayIn = (ms, zone) => {
  const w = wall(ms, zone);
  return `${w.year}-${w.month}-${w.day}`;
};
const shift = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** The instant Auckland's wall clock reads `hhmm` on `day`: it keeps 13 hours ahead of UTC in summer and 12 in winter. */
function nz(day, hhmm) {
  const [y, m, d] = day.split("-").map(Number);
  const [h, min] = hhmm.split(":").map(Number);
  for (const offset of [13, 12]) {
    const ms = Date.UTC(y, m - 1, d, h, min) - offset * HOUR;
    const w = wall(ms, AUCKLAND);
    if (`${w.year}-${w.month}-${w.day}` === day && `${w.hour}:${w.minute}` === hhmm) return new Date(ms).toISOString();
  }
  throw new Error(`no instant reads ${hhmm} on ${day} in ${AUCKLAND}`);
}
const sameInstant = (a, b) => Date.parse(a) === Date.parse(b);
/** Oldest first, the ones with no date last, a tie by id: the order the ledger lists reviews in. */
const oldestFirst = (rows) =>
  [...rows].sort((a, b) => {
    if (a.published_at !== b.published_at) {
      if (a.published_at === null) return 1;
      if (b.published_at === null) return -1;
      return Date.parse(a.published_at) - Date.parse(b.published_at);
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

let seq = 0;
/** One google_reviews row of a workspace, inserted as the edge would: a profile review, unanswered and undated unless said. */
async function review(tenant, over = {}) {
  seq += 1;
  const row = {
    tenant_id: tenant,
    review_id: `ledger-${Date.now()}-${seq}`,
    origin: "profile",
    rating: 5,
    author: "Ana P.",
    body: "Careful movers.",
    published_at: null,
    reply_text: null,
    replied_at: null,
    ...over,
  };
  return ok(await db.from("google_reviews").insert(row).select("*").single());
}
async function workspace(slug, timezone) {
  const id = ok(
    await db
      .from("tenants")
      .insert({ slug: `${slug}-${Date.now()}`, name: "Harbor Studio", timezone })
      .select("id")
      .single(),
  ).id;
  made.tenants.push(id);
  ok(
    await db
      .from("google_listings")
      .insert({ tenant_id: id, place_id: `place-${seq}-${id.slice(0, 8)}`, name: "Harbor Studio" }),
  );
  return id;
}
/** A real session for a fresh member of a workspace. */
async function memberOf(tenant, role = "viewer") {
  const email = `ledger-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const user = ok(await db.auth.admin.createUser({ email, password, email_confirm: true })).user;
  made.users.push(user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: user.id, role }));
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await client.auth.signInWithPassword({ email, password }));
  return client;
}
const callLedger = (client, tenant, days) =>
  client.rpc("reviews_ledger", days === undefined ? { p_tenant_id: tenant } : { p_tenant_id: tenant, p_days: days });
/** What the ledger answers the service role, which sees every workspace. */
const ledger = async (tenant, days) => ok(await callLedger(db, tenant, days));

let A; // Auckland: the workspace under test
let B; // another workspace, in UTC, with rows of every kind
let C; // Los Angeles: the same instant on another day
let today; // A's day now, in its zone
let viewerA;
let viewerB;
/** Every profile review of A, as inserted, and the writer its reply must be said to have. */
const mine = [];
let held; // the waiting reviews whose held replies the case checks: the first of two tied, the second, and the rest

const D = (n) => shift(today, -n);
const reviewAt = (day, hhmm) => mine.find((m) => m.row.published_at && sameInstant(m.row.published_at, nz(day, hhmm)));

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await workspace("ledger-a", AUCKLAND);
  B = await workspace("ledger-b", "UTC");
  C = await workspace("ledger-c", LOS_ANGELES);
  today = dayIn(Date.now(), AUCKLAND);
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  const later = (hours) => new Date(now.getTime() + hours * HOUR).toISOString();
  const seed = async (over, by = null) => {
    const row = await review(A, over);
    mine.push({ row, by });
    return row;
  };
  const filed = (row, data = {}) =>
    emitEvent(db, A, "google.replied", "review", row.id, { review_id: row.review_id, chars: 12, ...data });

  // The edge of the period before, in the zone: its first minute is in, the minute before it is not.
  await seed({ published_at: nz(D(13), "00:00"), rating: 4 });
  await seed({ published_at: nz(D(14), "23:59"), rating: 4 });
  // 23:30 and 00:30 there: the zone's day, whatever day UTC calls them.
  const lateNight = await seed(
    { published_at: nz(D(1), "23:30"), rating: 5, reply_text: "Thank you!", replied_at: now.toISOString() },
    "receptionist",
  );
  await filed(lateNight, { by: "receptionist" });
  await seed({ published_at: nz(D(2), "00:30"), rating: 3, reply_text: "Sorry.", replied_at: nz(D(2), "03:30") });
  // The events are written now. The owner rewrote the receptionist's reply on Google seven hours after its event: replied_at
  // moved past the slack, and the event no longer names the writer. Five hours after it, it still does.
  const rewritten = await seed({ published_at: nz(D(3), "09:00"), reply_text: "Thank you.", replied_at: later(7) });
  await filed(rewritten, { by: "receptionist" });
  const inSlack = await seed(
    { published_at: nz(D(4), "09:00"), reply_text: "Thank you.", replied_at: later(5) },
    "receptionist",
  );
  await filed(inSlack, { by: "receptionist" });
  // The receptionist replied, then a person did through Chanlytics (an event with no `by`): the last one is the person's.
  const replaced = await seed({
    published_at: nz(D(5), "09:00"),
    rating: 4,
    reply_text: "Glad.",
    replied_at: now.toISOString(),
  });
  await filed(replaced, { by: "receptionist" });
  await filed(replaced);
  const alone = await seed({
    published_at: nz(D(5), "11:00"),
    rating: 4,
    reply_text: "Glad.",
    replied_at: now.toISOString(),
  });
  await filed(alone);
  // A reply dated before its review has no time to say. No stars. No date.
  await seed({ published_at: nz(D(6), "10:00"), rating: 2, reply_text: "Hello.", replied_at: nz(D(6), "09:00") });
  await seed({ published_at: nz(D(1), "12:00"), rating: null });
  await seed({ published_at: null, rating: 1 });
  // The same instant in two zones.
  const instant = `${shift(dayIn(Date.now(), "UTC"), -3)}T05:00:00Z`;
  await seed({ published_at: instant });
  // Reviews older than any period, all waiting: more than the answer lists, two on one instant to be told apart by id.
  const old = [];
  for (let i = 0; i < 7; i += 1)
    old.push(await seed({ published_at: nz(shift(D(60), i === 1 ? 0 : i), "10:00"), rating: 3 }));
  const [first, second] = oldestFirst(old.slice(0, 2));
  held = { [first.id]: "price", [second.id]: "money" };
  // Why a reply written for a waiting review was held: the last reason stands; one held for a review since answered is not said.
  const hold = (row, why) => emitEvent(db, A, "google.reply_held", "review", row.id, { review_id: row.review_id, why });
  await hold(first, "price");
  await hold(second, "price");
  await hold(second, "money");
  await hold(lateNight, "price");
  // The public five are not the profile's.
  await review(A, { origin: "places", review_id: `places-1-${seq}`, published_at: nz(D(2), "10:00") });
  await review(A, { origin: "places", review_id: `places-2-${seq}`, published_at: nz(D(3), "10:00") });
  // Another workspace's rows, of every kind, the newest of all.
  const theirs = await review(B, {
    published_at: new Date().toISOString(),
    reply_text: "Ours.",
    replied_at: new Date().toISOString(),
  });
  await emitEvent(db, B, "google.replied", "review", theirs.id, {
    review_id: theirs.review_id,
    chars: 5,
    by: "receptionist",
  });
  await review(B, { published_at: "2020-01-01T00:00:00Z" });
  await review(C, { published_at: instant });

  viewerA = await memberOf(A);
  viewerB = await memberOf(B);
});

after(async () => {
  if (skip) return;
  for (const t of made.tenants) {
    await db.from("events").delete().eq("tenant_id", t);
    await db.from("tenants").delete().eq("id", t);
  }
  for (const u of made.users) await db.auth.admin.deleteUser(u);
});

/** What the ledger must say of A's profile reviews dated from the period before's first day, read off what was inserted. */
const expectedWritten = (days) =>
  oldestFirst(
    mine
      .map((m) => m.row)
      .filter((r) => r.published_at && dayIn(Date.parse(r.published_at), AUCKLAND) >= shift(today, -(2 * days - 1))),
  ).map((r) => ({
    id: r.id,
    d: dayIn(Date.parse(r.published_at), AUCKLAND),
    rating: r.rating,
    replied: r.reply_text !== null,
    secs:
      r.reply_text !== null && Date.parse(r.replied_at) >= Date.parse(r.published_at)
        ? Math.round((Date.parse(r.replied_at) - Date.parse(r.published_at)) / 1000)
        : null,
    by: mine.find((m) => m.row.id === r.id).by,
  }));

test(
  "the writer and the reader are joined: the events the real writer filed are the ones the ledger is made from",
  { skip },
  async () => {
    const events = ok(
      await db
        .from("events")
        .select("kind, data")
        .eq("tenant_id", A)
        .in("kind", ["google.replied", "google.reply_held"]),
    );
    const count = (kind, keep = () => true) => events.filter((e) => e.kind === kind && keep(e.data)).length;
    assert.equal(count("google.replied"), 6, "six replies filed");
    assert.equal(
      count("google.replied", (d) => d.by === "receptionist"),
      4,
      "four of them say the receptionist wrote the reply",
    );
    assert.equal(count("google.reply_held"), 4, "four held replies filed");
  },
);

test(
  "the window is the workspace's own zone: the period before's first day to now, each review on its day there, oldest first",
  { skip },
  async () => {
    const out = await ledger(A, 7);
    assert.deepEqual([out.timezone, out.today, out.days], [AUCKLAND, today, 7]);
    assert.deepEqual(out.written, expectedWritten(7));
    const ids = out.written.map((w) => w.id);
    assert.ok(ids.includes(reviewAt(D(13), "00:00").row.id), "the period before's first minute is in");
    assert.ok(!ids.includes(reviewAt(D(14), "23:59").row.id), "the minute before it is not");
    const late = out.written.find((w) => w.id === reviewAt(D(1), "23:30").row.id);
    assert.equal(late.d, D(1), "23:30 there is that day");
    const early = out.written.find((w) => w.id === reviewAt(D(2), "00:30").row.id);
    assert.equal(early.d, D(2), "00:30 there is that day");
    assert.notEqual(nz(D(2), "00:30").slice(0, 10), D(2), "though UTC calls it the day before: the point of the case");
    assert.ok(
      !mine.some((m) => m.row.published_at === null && ids.includes(m.row.id)),
      "a review with no date is in no period",
    );
    assert.ok(
      out.written.some((w) => w.rating === null),
      "a review with no stars is among them, with no rating",
    );
    // A shorter period reads a shorter window.
    assert.deepEqual((await ledger(A, 1)).written, expectedWritten(1));
    assert.ok(expectedWritten(1).length < expectedWritten(7).length);
  },
);

test(
  "who wrote a reply and how long it took: the receptionist's own event within six hours of the reply, never a person's later one, never an edit past the slack",
  { skip },
  async () => {
    const out = await ledger(A, 30);
    const said = (day, hhmm) => out.written.find((w) => w.id === reviewAt(day, hhmm).row.id);
    assert.equal(said(D(1), "23:30").by, "receptionist");
    assert.equal(said(D(4), "09:00").by, "receptionist", "five hours on: still the receptionist's");
    assert.equal(said(D(3), "09:00").by, null, "seven hours on: the owner rewrote it on Google");
    assert.equal(said(D(5), "09:00").by, null, "a person replied after the receptionist: the last event has no writer");
    assert.equal(said(D(5), "11:00").by, null, "a person's reply alone");
    assert.equal(said(D(2), "00:30").by, null, "a reply written on Google, with no event");
    assert.equal(said(D(2), "00:30").secs, 10_800, "three hours, to the second");
    assert.equal(said(D(6), "10:00").secs, null, "a reply dated before its review has no time");
    assert.deepEqual(
      out.written.filter((w) => !w.replied).map((w) => [w.secs, w.by]),
      out.written.filter((w) => !w.replied).map(() => [null, null]),
      "no reply, no time and no writer",
    );
  },
);

test(
  "what waits: the profile's reviews with no reply, all counted, the oldest five listed with why a reply was held, a tie told apart by id, the answered review's held reason said nowhere",
  { skip },
  async () => {
    const out = await ledger(A, 30);
    const waiting = oldestFirst(mine.map((m) => m.row).filter((r) => r.reply_text === null));
    assert.equal(REVIEWS_WAITING_SHOWN, 5, "contracts' constant for the cap, which the function writes as a number");
    assert.ok(waiting.length > REVIEWS_WAITING_SHOWN, "more wait than are listed");
    assert.equal(out.waiting_total, waiting.length, "the count is all of them");
    assert.deepEqual(
      out.waiting.map((w) => w.id),
      waiting.slice(0, REVIEWS_WAITING_SHOWN).map((w) => w.id),
      "oldest first, a tie by id, five of them",
    );
    assert.deepEqual(
      Object.keys(out.waiting[0]).sort(),
      [
        "author",
        "author_photo_uri",
        "author_uri",
        "body",
        "draft_text",
        "first_seen_at",
        "held",
        "id",
        "language_code",
        "maps_uri",
        "origin",
        "posts_at",
        "published_at",
        "rating",
        "replied_at",
        "reply_text",
        "review_id",
      ],
      "the Google read's own sixteen columns, the reply it holds and when that goes among them (00462), and why a reply was held",
    );
    assert.ok(out.waiting.every((w) => w.origin === "profile" && w.reply_text === null));
    assert.deepEqual(
      out.waiting.map((w) => w.held),
      out.waiting.map((w) => held[w.id] ?? null),
      "the last reason stands (money after price), and none where none was held",
    );
    assert.deepEqual(Object.values(held).sort(), ["money", "price"], "two of the oldest five were held");
    assert.ok(
      out.written.every((w) => !("held" in w)),
      "the held reply of a review since answered is said nowhere",
    );
  },
);

test("a review with no date waits after the dated ones", { skip }, async () => {
  const solo = await workspace("ledger-order", AUCKLAND);
  const march = await review(solo, { published_at: nz("2026-03-02", "09:00") });
  const january = await review(solo, { published_at: nz("2026-01-05", "09:00") });
  const undated = await review(solo, { published_at: null });
  const out = await ledger(solo, 30);
  assert.deepEqual(
    out.waiting.map((w) => w.id),
    [january.id, march.id, undated.id],
  );
  assert.equal(out.waiting_total, 3);
  assert.deepEqual(out.written, [], "none of the three is in the last 60 days");
});

test(
  "the answer is the Reviews ledger the fold reads and nothing more: its fields exactly, one of each kind of review in it",
  { skip },
  async () => {
    const out = await ledger(A, 30);
    assert.ok(isReviewsLedgerDto(out), "contracts' guard takes it");
    assert.deepEqual(Object.keys(out).sort(), [
      "days",
      "end",
      "on_record",
      "timezone",
      "today",
      "waiting",
      "waiting_total",
      "written",
    ]);
    assert.equal(out.end, out.today, "a window that names no last day ends on the workspace's today (00359)");
    assert.deepEqual(Object.keys(out.on_record).sort(), ["complete", "places", "profile"]);
    assert.ok(out.written.length > 0 && out.waiting.length > 0, "a review written and one that waits are both in it");
    for (const w of out.written)
      assert.deepEqual(Object.keys(w).sort(), ["by", "d", "id", "rating", "replied", "secs"], w.id);
    assert.deepEqual(
      await ledger("00000000-0000-4000-8000-000000000000", 30),
      { error: "unknown_tenant" },
      "and the guard refuses a workspace the function does not know",
    );
    assert.ok(!isReviewsLedgerDto({ error: "unknown_tenant" }));
  },
);

test(
  "on record: the profile's reviews and the public five counted apart, and whether the sync read the whole list",
  { skip },
  async () => {
    const expected = { profile: mine.length, places: 2, complete: false };
    assert.deepEqual((await ledger(A, 30)).on_record, expected, "no connection: nothing says the list was read whole");
    ok(
      await db
        .from("google_connections")
        .insert({ tenant_id: A, account_name: "accounts/1", location_name: "locations/2" }),
    );
    assert.deepEqual(
      (await ledger(A, 30)).on_record,
      expected,
      "a connection the sync has not marked: still not whole",
    );
    ok(await db.from("google_connections").update({ reviews_complete: true }).eq("tenant_id", A));
    assert.deepEqual((await ledger(A, 30)).on_record, { ...expected, complete: true });
    ok(await db.from("google_connections").update({ reviews_complete: false }).eq("tenant_id", A));
    assert.equal((await ledger(A, 30)).on_record.complete, false);
    // A workspace with no review on record counts none.
    const empty = await workspace("ledger-empty", "UTC");
    const none = await ledger(empty, 30);
    assert.deepEqual(none.on_record, { profile: 0, places: 0, complete: false });
    assert.deepEqual([none.written, none.waiting, none.waiting_total], [[], [], 0]);
  },
);

test("the zone is each workspace's own: one instant is two days in Los Angeles and in Auckland", { skip }, async () => {
  const seed = mine.find((m) => m.row.published_at && m.row.published_at.slice(11, 16) === "05:00");
  const instant = seed.row.published_at;
  const inLosAngeles = (await ledger(C, 7)).written.at(0);
  const inAuckland = (await ledger(A, 7)).written.find((w) => w.id === seed.row.id);
  assert.equal(inLosAngeles.d, dayIn(Date.parse(instant), LOS_ANGELES));
  assert.equal(inAuckland.d, dayIn(Date.parse(instant), AUCKLAND));
  assert.notEqual(
    inLosAngeles.d,
    inAuckland.d,
    "05:00 UTC is the evening before in Los Angeles and the afternoon of the same day in Auckland",
  );
});

test(
  "another workspace's rows and events are never in the answer, and the days are held to one through ninety-two",
  { skip },
  async () => {
    const ids = new Set(mine.map((m) => m.row.id));
    const out = await ledger(A, 92);
    assert.ok(out.written.every((w) => ids.has(w.id)) && out.waiting.every((w) => ids.has(w.id)));
    const theirs = await ledger(B, 30);
    assert.equal(theirs.on_record.profile, 2);
    assert.deepEqual([theirs.timezone, theirs.written.length, theirs.written[0].by], ["UTC", 1, "receptionist"]);
    for (const [asked, said] of [
      [0, 1],
      [-5, 1],
      [500, 92],
      [null, 30],
      [undefined, 30],
    ])
      assert.equal((await ledger(A, asked)).days, said, `${asked}`);
    assert.deepEqual(await ledger("00000000-0000-4000-8000-000000000000", 30), { error: "unknown_tenant" });
  },
);

test(
  "a member reads what the service role reads for their own workspace, and another's is a workspace they do not know",
  { skip },
  async () => {
    assert.deepEqual(ok(await callLedger(viewerA, A, 30)), await ledger(A, 30));
    assert.deepEqual(ok(await callLedger(viewerB, B, 30)), await ledger(B, 30));
    assert.deepEqual(
      ok(await callLedger(viewerA, B, 30)),
      { error: "unknown_tenant" },
      "RLS: B is none of A's member's workspaces",
    );
    assert.deepEqual(ok(await callLedger(viewerB, A, 30)), { error: "unknown_tenant" });
    const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
    const refused = await callLedger(anon, A, 30);
    assert.equal(refused.data, null);
    assert.equal(refused.error?.code, "42501", "no session, no function: execute is the signed-in role's alone");
  },
);
