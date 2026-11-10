/**
 * An occasion's doors (00598, decision 0119) on a real Postgres: every function the migration made, run.
 *
 *   sequence_occasion_enrol      once per sequence, person and occasion, for good; nobody the workspace does not hold; a
 *                                visit that moved leaves the occasions of its other starts; one at a time where the moment
 *                                keeps it so; a rest between occasions where the moment asks one.
 *   sequence_occasions_leave     by what a key starts with, all but one where asked; what is settled stays as it was.
 *   sequence_occasions_due       what waits and is due, soonest first, with its step and whether that step runs now.
 *   sequence_occasions_hand_out  one job a workspace with someone due, and no second while it waits.
 *   contacts_erase_leaves_occasions  an erased person's occasions are gone.
 *   and each is the service role's alone.
 *
 * Local stack only: it makes a workspace, a member, people, a template and three sequences with the service key, and
 * removes them after.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes sequences and their occasions"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the member this suite signs in as needs it"
        : false;

const stamp = Date.now();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
let db;
let tenantId;
let templateId;
let member;
const users = [];
const people = {};
/** The three sequences an occasion starts: a visit two hours away, a visit missed, an ask with no booking. */
const sequences = {};

const wrote = (res, why) => {
  assert.equal(res.error, null, `${why ?? "the write"}: ${res.error?.message}`);
  return res.data;
};
const from = (ms) => new Date(Date.now() + ms);
const same = (a, b) => Date.parse(a) === b.getTime();

/** Enrol someone for an occasion, as the edge's subscriber asks (db enrolOccasion): what the door answered. */
const enrol = async (sequenceId, contactId, occasion, dueAt, more = {}) =>
  wrote(
    await db.rpc("sequence_occasion_enrol", {
      p_tenant_id: tenantId,
      p_sequence_id: sequenceId,
      p_contact_id: contactId,
      p_occasion: occasion,
      p_due_at: dueAt.toISOString(),
      ...(more.single ? { p_single: true } : {}),
      ...(more.replaces ? { p_replaces: more.replaces } : {}),
      ...(more.restDays ? { p_rest_days: more.restDays } : {}),
    }),
    `enrolling ${occasion}`,
  );

/** One person's occasions in a sequence, as the table keeps them, in the order they were made. */
const occasionsOf = async (sequenceId, contactId) =>
  wrote(
    await db
      .from("sequence_occasions")
      .select("id, occasion, state, why, due_at, try_at, settled_at, batch_id, created_at")
      .eq("sequence_id", sequenceId)
      .eq("contact_id", contactId)
      .order("created_at")
      .order("occasion"),
    "their occasions",
  );
const said = (rows) => rows.map((r) => [r.occasion, r.state, r.why]);

/** An occasion's step was asked for and its batch made: settled as the job settles one (db settleOccasion). */
const ran = async (id) =>
  wrote(
    await db
      .from("sequence_occasions")
      .update({ state: "ran", settled_at: new Date().toISOString() })
      .eq("id", id)
      .eq("state", "waiting")
      .select("id"),
    "settling it",
  );

/** Nothing of the workspace waits: each test of what is due starts from none. */
const settleAll = async () =>
  wrote(
    await db
      .from("sequence_occasions")
      .update({ state: "left", why: "another_test", settled_at: new Date().toISOString() })
      .eq("tenant_id", tenantId)
      .eq("state", "waiting"),
    "settling what waits",
  );

const leave = async (startsWith, why, except) =>
  wrote(
    await db.rpc("sequence_occasions_leave", {
      p_tenant_id: tenantId,
      p_starts_with: startsWith,
      p_why: why,
      ...(except ? { p_except: except } : {}),
    }),
    `leaving ${startsWith}`,
  );

const due = async (at, limit = 10) =>
  wrote(
    await db.rpc("sequence_occasions_due", { p_tenant_id: tenantId, p_at: at.toISOString(), p_limit: limit }),
    "what is due",
  );

/** A sequence that starts on a moment: its first step, which makes its sequence (00440). */
async function sequenceOn(trigger, policyClass) {
  return wrote(
    await db
      .from("sequence_steps")
      .insert({
        tenant_id: tenantId,
        name: `On ${trigger}`,
        trigger,
        template_id: templateId,
        template_name: "occasion_words",
        template_language: "en_US",
        policy_class: policyClass,
        run_hour: 10,
        cap_per_run: 25,
      })
      .select("id")
      .single(),
    `the sequence on ${trigger}`,
  ).id;
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  tenantId = wrote(
    await db
      .from("tenants")
      .insert({ slug: `occasion-doors-${stamp}`, name: "Harbor Studio", timezone: "America/New_York" })
      .select("id")
      .single(),
    "the workspace",
  ).id;
  templateId = wrote(
    await db
      .from("templates")
      .insert({
        tenant_id: tenantId,
        channel: "whatsapp",
        name: "occasion_words",
        language: "en_US",
        meta_status: "approved",
      })
      .select("id")
      .single(),
    "the template",
  ).id;
  for (const [key, phone] of [
    ["ana", "+15555550161"],
    ["bo", "+15555550162"],
    ["cy", "+15555550163"],
    ["di", "+15555550164"],
    ["eve", "+15555550165"],
  ])
    people[key] = wrote(
      await db
        .from("contacts")
        .insert({ tenant_id: tenantId, display_name: key, phone_e164: phone })
        .select("id")
        .single(),
      `the person ${key}`,
    ).id;
  sequences.soon = await sequenceOn("visit_soon", "booking");
  sequences.missed = await sequenceOn("visit_missed", "booking");
  sequences.ask = await sequenceOn("asked_no_booking", "follow_up");

  const email = `occasion-doors-${stamp}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  wrote(await db.from("memberships").insert({ tenant_id: tenantId, user_id: made.data.user.id, role: "owner" }));
  member = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await member.auth.signInWithPassword({ email, password });
  assert.equal(signedIn.error, null, signedIn.error?.message);
});

after(async () => {
  if (skip || !db) return;
  if (tenantId) await db.from("tenants").delete().eq("id", tenantId);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

test("an occasion enrols its person once, for good, at the time it was given", { skip }, async () => {
  const at = from(2 * HOUR);
  assert.equal(await enrol(sequences.soon, people.ana, "visit:a1:100", at), "enrolled");
  const [row, ...more] = await occasionsOf(sequences.soon, people.ana);
  assert.equal(more.length, 0);
  assert.deepEqual(
    [row.occasion, row.state, row.why, row.settled_at, row.batch_id, same(row.due_at, at), same(row.try_at, at)],
    ["visit:a1:100", "waiting", null, null, null, true, true],
    "it waits, due and first tried at its own time",
  );

  assert.equal(await enrol(sequences.soon, people.ana, "visit:a1:100", from(3 * HOUR)), "already");
  const [again, ...others] = await occasionsOf(sequences.soon, people.ana);
  assert.equal(others.length, 0, "asked twice, kept once");
  assert.ok(same(again.due_at, at), "and its time is the one it was first given");

  // Served once: its step asked for, the same occasion never starts it again.
  assert.equal((await ran(row.id)).length, 1);
  assert.equal(await enrol(sequences.soon, people.ana, "visit:a1:100", from(4 * HOUR)), "already");
  assert.deepEqual(said(await occasionsOf(sequences.soon, people.ana)), [["visit:a1:100", "ran", null]]);
});

test("nobody the workspace does not hold is enrolled, and an occasion has a key and a time", { skip }, async () => {
  assert.equal(await enrol(sequences.soon, crypto.randomUUID(), "visit:x1:100", from(HOUR)), "gone");
  const erased = wrote(
    await db
      .from("contacts")
      .insert({
        tenant_id: tenantId,
        display_name: "gone",
        phone_e164: "+15555550169",
        erased_at: new Date().toISOString(),
      })
      .select("id")
      .single(),
    "someone erased",
  ).id;
  assert.equal(await enrol(sequences.soon, erased, "visit:x2:100", from(HOUR)), "gone");
  const none = await db
    .from("sequence_occasions")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .in("occasion", ["visit:x1:100", "visit:x2:100"]);
  assert.equal(none.count, 0, "and nothing was written for either");

  const keyless = await db.rpc("sequence_occasion_enrol", {
    p_tenant_id: tenantId,
    p_sequence_id: sequences.soon,
    p_contact_id: people.ana,
    p_occasion: null,
    p_due_at: from(HOUR).toISOString(),
  });
  assert.equal(keyless.error?.code, "22004", keyless.error?.message ?? "an occasion with no key was taken");
});

test("a visit that moved keeps one reminder: the occasions of its other starts leave", { skip }, async () => {
  // Two visits of one person: a reminder is owed to each (visit_soon is no single moment).
  assert.equal(await enrol(sequences.soon, people.bo, "visit:b1:100", from(2 * HOUR)), "enrolled");
  assert.equal(await enrol(sequences.soon, people.bo, "visit:b2:100", from(5 * HOUR)), "enrolled");
  // The first moves: its new start is another occasion, and the one made for the old start leaves as moved.
  assert.equal(
    await enrol(sequences.soon, people.bo, "visit:b1:160", from(3 * HOUR), { replaces: "visit:b1:" }),
    "enrolled",
  );
  const rows = await occasionsOf(sequences.soon, people.bo);
  assert.deepEqual(said(rows).sort(), [
    ["visit:b1:100", "left", "moved"],
    ["visit:b1:160", "waiting", null],
    ["visit:b2:100", "waiting", null],
  ]);
  assert.ok(rows.find((r) => r.occasion === "visit:b1:100").settled_at, "what left says when");
  // Asked again for the start it has now, nothing moves.
  assert.equal(
    await enrol(sequences.soon, people.bo, "visit:b1:160", from(3 * HOUR), { replaces: "visit:b1:" }),
    "already",
  );
  assert.equal(said(await occasionsOf(sequences.soon, people.bo)).filter(([, state]) => state === "waiting").length, 2);
});

test(
  "one at a time where the moment keeps it so: none while another waits, or they are still in the sequence",
  { skip },
  async () => {
    const single = { single: true };
    assert.equal(await enrol(sequences.missed, people.cy, "missed:c1", from(10 * MIN), single), "enrolled");
    assert.equal(await enrol(sequences.missed, people.cy, "missed:c2", from(10 * MIN), single), "busy");
    assert.equal(await enrol(sequences.missed, people.cy, "missed:c1", from(10 * MIN), single), "already");
    assert.deepEqual(said(await occasionsOf(sequences.missed, people.cy)), [["missed:c1", "waiting", null]]);
    // Another sequence is another conversation: theirs here holds nothing there.
    assert.equal(await enrol(sequences.ask, people.cy, "ask:c9", from(DAY), single), "enrolled");

    // The first one's step was asked for and nothing of theirs waits here: the next missed visit starts its own.
    const [first] = await occasionsOf(sequences.missed, people.cy);
    await ran(first.id);
    assert.equal(await enrol(sequences.missed, people.cy, "missed:c2", from(10 * MIN), single), "enrolled");

    // Someone still in the sequence (a later step is to come) starts nothing new in it.
    wrote(
      await db
        .from("sequence_enrollments")
        .insert({ tenant_id: tenantId, sequence_id: sequences.missed, contact_id: people.di, state: "in", place: 1 }),
      "their place in the sequence",
    );
    assert.equal(await enrol(sequences.missed, people.di, "missed:d1", from(10 * MIN), single), "busy");
    assert.deepEqual(await occasionsOf(sequences.missed, people.di), []);
  },
);

test(
  "a moment that rests between occasions starts nothing new inside the rest, whatever became of the last",
  { skip },
  async () => {
    const asked = { single: true, restDays: 7 };
    assert.equal(await enrol(sequences.ask, people.ana, "ask:m1", from(DAY), asked), "enrolled");
    const [first] = await occasionsOf(sequences.ask, people.ana);
    await ran(first.id);
    // Its follow-up went, carrying the booking link: that ask starts no second follow-up.
    assert.equal(await enrol(sequences.ask, people.ana, "ask:m2", from(DAY), asked), "busy");
    // Eight days on, a new ask is a new occasion.
    wrote(
      await db
        .from("sequence_occasions")
        .update({ created_at: from(-8 * DAY).toISOString() })
        .eq("id", first.id),
      "eight days pass",
    );
    assert.equal(await enrol(sequences.ask, people.ana, "ask:m2", from(DAY), asked), "enrolled");
    assert.deepEqual(said(await occasionsOf(sequences.ask, people.ana)), [
      ["ask:m1", "ran", null],
      ["ask:m2", "waiting", null],
    ]);
  },
);

test(
  "occasions leave by what their key starts with, all but one where asked, and what is settled stays",
  { skip },
  async () => {
    for (const occasion of ["visit:d9:100", "visit:d9:160", "visit:d8:100"])
      assert.equal(await enrol(sequences.soon, people.di, occasion, from(2 * HOUR)), "enrolled");
    assert.equal(await leave("visit:d9:", "moved", "visit:d9:160"), 1, "all of the visit's but the start it has now");
    assert.deepEqual(said(await occasionsOf(sequences.soon, people.di)).sort(), [
      ["visit:d8:100", "waiting", null],
      ["visit:d9:100", "left", "moved"],
      ["visit:d9:160", "waiting", null],
    ]);
    assert.equal(await leave("visit:d9:", "visit_gone"), 1, "the visit cancelled: the one that still waited");
    assert.equal(await leave("visit:d9:", "visit_gone"), 0, "and nothing twice");
    assert.deepEqual(said(await occasionsOf(sequences.soon, people.di)).sort(), [
      ["visit:d8:100", "waiting", null],
      ["visit:d9:100", "left", "moved"],
      ["visit:d9:160", "left", "visit_gone"],
    ]);
    // A key too short to name anything leaves nothing.
    assert.equal(await leave("vi", "visit_gone"), 0);
    assert.deepEqual(
      said(await occasionsOf(sequences.soon, people.di)).filter(([, state]) => state === "waiting"),
      [["visit:d8:100", "waiting", null]],
    );
  },
);

test("what is due is answered soonest first, with its step, and whether that step runs now", { skip }, async () => {
  await settleAll();
  const now = new Date();
  assert.equal(await enrol(sequences.soon, people.ana, "visit:t7a:1", from(-5 * MIN)), "enrolled");
  assert.equal(await enrol(sequences.soon, people.bo, "visit:t7b:1", from(-10 * MIN)), "enrolled");
  assert.equal(await enrol(sequences.soon, people.cy, "visit:t7c:1", from(HOUR)), "enrolled");

  const rows = await due(now);
  assert.deepEqual(
    rows.map((r) => [r.occasion, r.contact_id, r.sequence_id, r.runs]),
    [
      ["visit:t7b:1", people.bo, sequences.soon, true],
      ["visit:t7a:1", people.ana, sequences.soon, true],
    ],
    "the two whose time has come, the longest due first; the one an hour off is not asked for",
  );
  const [first] = rows;
  assert.deepEqual(
    [first.step.id, first.step.trigger, first.step.template_name, "mode" in first.step],
    [sequences.soon, "visit_soon", "occasion_words", true],
    "with its sequence's first step as a run reads one, its sequence's mode beside it",
  );
  assert.ok(first.created_at && first.due_at, "and when it began and was due");
  assert.deepEqual(
    (await due(now, 1)).map((r) => r.occasion),
    ["visit:t7b:1"],
    "no more than asked for",
  );

  // Put off, as a step that could not be made this minute is (db deferOccasion): not due until then, its time unmoved.
  const putOff = wrote(
    await db
      .from("sequence_occasions")
      .update({ try_at: from(10 * MIN).toISOString() })
      .eq("tenant_id", tenantId)
      .eq("occasion", "visit:t7b:1")
      .select("due_at"),
    "putting one off",
  );
  assert.equal(putOff.length, 1);
  assert.deepEqual(
    (await due(now)).map((r) => r.occasion),
    ["visit:t7a:1"],
  );

  // Its sequence paused: still answered, so the job settles it and no row waits on a sequence turned off.
  wrote(await db.from("sequence_steps").update({ state: "paused" }).eq("id", sequences.soon), "pausing it");
  assert.deepEqual(
    (await due(now)).map((r) => [r.occasion, r.runs]),
    [["visit:t7a:1", false]],
  );
  wrote(await db.from("sequence_steps").update({ state: "running" }).eq("id", sequences.soon), "resuming it");
  // The workspace paused: the same.
  wrote(await db.from("tenants").update({ status: "paused" }).eq("id", tenantId), "pausing the workspace");
  assert.deepEqual(
    (await due(now)).map((r) => r.runs),
    [false],
  );
  wrote(await db.from("tenants").update({ status: "active" }).eq("id", tenantId), "resuming the workspace");
  assert.deepEqual(
    (await due(now)).map((r) => r.runs),
    [true],
  );
});

test("the clock hands a workspace with someone due one job, and no second while it waits", { skip }, async () => {
  await settleAll();
  const jobs = async () =>
    wrote(
      await db
        .from("jobs")
        .select("id, state, due_at, payload")
        .eq("tenant_id", tenantId)
        .eq("kind", "sequence_occasions"),
      "its jobs",
    );
  const handOut = async () =>
    wrote(
      await db.rpc("sequence_occasions_hand_out", { p_at: new Date().toISOString(), p_spread_seconds: 20 }),
      "the hand-out",
    );

  // Someone due an hour from now: nothing to hand out for this workspace.
  assert.equal(await enrol(sequences.soon, people.eve, "visit:t8a:1", from(HOUR)), "enrolled");
  await handOut();
  assert.deepEqual(await jobs(), [], "nobody due, no job");

  assert.equal(await enrol(sequences.soon, people.eve, "visit:t8b:1", from(-MIN)), "enrolled");
  const askedAt = Date.now();
  assert.ok((await handOut()) >= 1, "it says how many it wrote");
  const [job, ...more] = await jobs();
  assert.equal(more.length, 0);
  // Another suite's tick may claim a job that is due at once: it is the workspace's one either way.
  assert.ok(["scheduled", "fired"].includes(job.state), job.state);
  assert.deepEqual(job.payload, {});
  const dueIn = Date.parse(job.due_at) - askedAt;
  assert.ok(dueIn > -5_000 && dueIn < 25_000, `due inside the spread, not ${dueIn} ms off`);

  // Its job waits: the next minute's hand-out writes no second.
  await handOut();
  assert.equal((await jobs()).length, 1, "one a workspace while one waits");
});

test("an erased person's occasions are gone, and nobody else's", { skip }, async () => {
  await settleAll();
  assert.equal(await enrol(sequences.soon, people.eve, "visit:t9a:1", from(HOUR)), "enrolled");
  assert.equal(await enrol(sequences.soon, people.ana, "visit:t9b:1", from(HOUR)), "enrolled");
  assert.ok((await occasionsOf(sequences.soon, people.eve)).length >= 1);
  wrote(await db.from("contacts").update({ erased_at: new Date().toISOString() }).eq("id", people.eve), "erasing them");
  assert.deepEqual(await occasionsOf(sequences.soon, people.eve), [], "every one of theirs, waiting or settled");
  assert.ok(
    (await occasionsOf(sequences.soon, people.ana)).some((r) => r.occasion === "visit:t9b:1" && r.state === "waiting"),
    "and another person's stands",
  );
  // And none is made for them after.
  assert.equal(await enrol(sequences.soon, people.eve, "visit:t9c:1", from(HOUR)), "gone");
});

test("the table keeps what a settled row says, and every door is the service role's alone", { skip }, async () => {
  // What left says why, and what is settled says when.
  const whyless = await db.from("sequence_occasions").insert({
    tenant_id: tenantId,
    sequence_id: sequences.soon,
    contact_id: people.ana,
    occasion: "visit:t10a:1",
    due_at: new Date().toISOString(),
    try_at: new Date().toISOString(),
    state: "left",
    settled_at: new Date().toISOString(),
  });
  assert.equal(whyless.error?.code, "23514", whyless.error?.message ?? "a row left with no why was kept");
  const undated = await db.from("sequence_occasions").insert({
    tenant_id: tenantId,
    sequence_id: sequences.soon,
    contact_id: people.ana,
    occasion: "visit:t10b:1",
    due_at: new Date().toISOString(),
    try_at: new Date().toISOString(),
    state: "ran",
  });
  assert.equal(undated.error?.code, "23514", undated.error?.message ?? "a settled row with no date was kept");

  // A member reads their workspace's occasions and calls none of the doors.
  const read = await member.from("sequence_occasions").select("id").eq("tenant_id", tenantId).limit(1);
  assert.equal(read.error, null, read.error?.message);
  assert.equal(read.data.length, 1, "a member reads what waits in their workspace");
  const calls = {
    sequence_occasion_enrol: {
      p_tenant_id: tenantId,
      p_sequence_id: sequences.soon,
      p_contact_id: people.ana,
      p_occasion: "visit:t10c:1",
      p_due_at: new Date().toISOString(),
    },
    sequence_occasions_leave: { p_tenant_id: tenantId, p_starts_with: "visit:", p_why: "visit_gone" },
    sequence_occasions_due: { p_tenant_id: tenantId, p_at: new Date().toISOString(), p_limit: 10 },
    sequence_occasions_hand_out: { p_at: new Date().toISOString(), p_spread_seconds: 20 },
  };
  for (const [door, args] of Object.entries(calls)) {
    const refused = await member.rpc(door, args);
    assert.equal(refused.error?.code, "42501", `${door}: ${refused.error?.message ?? "a member's call was taken"}`);
  }
  const taken = await db
    .from("sequence_occasions")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("occasion", "visit:t10c:1");
  assert.equal(taken.count, 0, "and the member's enrol wrote nothing");
});
