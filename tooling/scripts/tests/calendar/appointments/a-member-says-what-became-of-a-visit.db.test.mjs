/**
 * A member says what became of a visit (decision 0002 step 8, 00397 mark_visit), on a real Postgres, as real sessions:
 * an operator says kept or missed once a visit has begun and cancelled until it ends, the decision theirs in the same
 * transaction and appointment.changed said by the triggers, a feed's row as well as a booking's; kept and missed trade
 * places through the door alone, every other end stays final; a viewer, a stranger and a write around the door are
 * refused. Runs against the database `supabase start` builds on this machine, never production.
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
      ? "refusing a database that is not on this machine: this suite makes users, workspaces and appointments"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the sessions this suite signs in with need it"
        : false;

const HOUR = 3_600_000;
const w = {};
const users = [];
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

/** A real session for a fresh user with this role in this workspace. */
async function member(role, tenant) {
  const email = `visit-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await w.admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await w.admin.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }));
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  return { client, id: made.data.user.id };
}

/** A visit in the record, starting `fromNowH` hours from now, an hour long. */
async function visit(fromNowH, over = {}) {
  const start = Date.now() + fromNowH * HOUR;
  return ok(
    await w.admin
      .from("appointments")
      .insert({
        tenant_id: w.tenant,
        source: "booking_email",
        tool: "booksy",
        external_id: `visit-${Math.random().toString(36).slice(2)}`,
        status: "booked",
        starts_at: new Date(start).toISOString(),
        ends_at: new Date(start + HOUR).toISOString(),
        timezone: "America/New_York",
        ...over,
      })
      .select("id")
      .single(),
  ).id;
}

/** One press on the door, as `who`: what it answered, or the words of what it raised. */
const say = (who, id, status) =>
  who.client
    .rpc("mark_visit", { p_appointment_id: id, p_status: status })
    .then((r) => (r.error ? { raised: r.error.message } : r.data));
const statusOf = async (id) => ok(await w.admin.from("appointments").select("status").eq("id", id).single()).status;
const changes = async (id) =>
  ok(
    await w.admin
      .from("events")
      .select("data")
      .eq("kind", "appointment.changed")
      .eq("subject_id", id)
      .order("created_at", { ascending: true }),
  ).map((e) => e.data.change);
const decisionsOf = async (id) =>
  ok(
    await w.admin
      .from("decisions")
      .select("verb, subject_type, actor_user_id, payload")
      .eq("subject_id", id)
      .order("created_at", { ascending: true }),
  );

before(async () => {
  if (skip) return;
  w.admin = createClient(URL_, KEY, { auth: { persistSession: false } });
  const stamp = Date.now().toString(36);
  w.tenant = ok(
    await w.admin
      .from("tenants")
      .insert({ slug: `visits-${stamp}`, name: "Visits" })
      .select("id")
      .single(),
  ).id;
  w.other = ok(
    await w.admin
      .from("tenants")
      .insert({ slug: `visits-other-${stamp}`, name: "Other" })
      .select("id")
      .single(),
  ).id;
  w.operator = await member("operator", w.tenant);
  w.viewer = await member("viewer", w.tenant);
  w.stranger = await member("owner", w.other);
});

after(async () => {
  if (skip || !w.admin) return;
  for (const t of [w.tenant, w.other].filter(Boolean)) {
    await w.admin.from("appointments").delete().eq("tenant_id", t);
    await w.admin.from("events").delete().eq("tenant_id", t);
    await w.admin.from("tenants").delete().eq("id", t);
  }
  for (const id of users) await w.admin.auth.admin.deleteUser(id).catch(() => {});
});

test(
  "an operator says a visit that has begun was missed: the row, their decision and the event, together",
  { skip },
  async () => {
    const id = await visit(-2);
    const r = await say(w.operator, id, "missed");
    assert.deepEqual([r.appointment, r.from], [{ id, status: "missed" }, "booked"]);
    assert.equal(typeof r.decision_id, "string");
    assert.equal(await statusOf(id), "missed");
    const [d] = await decisionsOf(id);
    assert.deepEqual(
      [d.verb, d.subject_type, d.actor_user_id, d.payload.from, d.payload.to, d.payload.source],
      ["mark_visit", "appointment", w.operator.id, "booked", "missed", "booking_email"],
    );
    assert.deepEqual(await changes(id), ["added", "missed"]);
    // Said again, nothing moves and nothing is written.
    const again = await say(w.operator, id, "missed");
    assert.equal(again.unchanged, true);
    assert.equal((await decisionsOf(id)).length, 1);
  },
);

test("kept and missed trade places through the door alone; every other end stays final", { skip }, async () => {
  const id = await visit(-3);
  assert.equal((await say(w.operator, id, "kept")).appointment.status, "kept");
  assert.equal((await say(w.operator, id, "missed")).appointment.status, "missed", "a mistaken kept is corrected");
  assert.equal((await say(w.operator, id, "kept")).appointment.status, "kept", "and back");
  assert.deepEqual(await changes(id), ["added", "kept", "missed", "kept"]);
  // Around the door, the guard holds the end final.
  const around = await w.admin.from("appointments").update({ status: "missed" }).eq("id", id);
  assert.match(around.error?.message ?? "", /terminal/, "a write that is not the door's cannot correct it");
  assert.equal(await statusOf(id), "kept");
  // A kept visit is not cancelled afterwards, and a cancelled one is said nothing more of.
  assert.deepEqual(await say(w.operator, id, "cancelled"), { error: "already_said" });
  const gone = await visit(5);
  assert.equal((await say(w.operator, gone, "cancelled")).appointment.status, "cancelled");
  assert.deepEqual(await say(w.operator, gone, "kept"), { error: "cancelled" });
});

test(
  "the door's clock: kept or missed once it has begun, cancelled until it ends; a request is never kept",
  { skip },
  async () => {
    const ahead = await visit(24);
    assert.deepEqual(await say(w.operator, ahead, "missed"), { error: "not_begun" });
    assert.equal(await statusOf(ahead), "booked");
    const over = await visit(-5);
    assert.deepEqual(await say(w.operator, over, "cancelled"), { error: "over" });
    const requested = await visit(-2, { status: "proposed" });
    assert.deepEqual(await say(w.operator, requested, "kept"), { error: "never_booked" });
    const raised = await say(w.operator, ahead, "rescheduled");
    assert.match(raised.raised ?? "", /kept, missed or cancelled/);
  },
);

test(
  "a feed's row is said of as a booking's is, and its event says it, though the feed's door writes its own",
  { skip },
  async () => {
    const id = await visit(-1, { source: "calendar_feed", tool: null });
    assert.equal((await say(w.operator, id, "missed")).appointment.status, "missed");
    assert.deepEqual(
      await changes(id),
      ["missed"],
      "a feed row's insert is the feed door's to say; the member's word is said",
    );
  },
);

test("a viewer, a stranger and nobody signed in are refused, and nothing is written", { skip }, async () => {
  const id = await visit(-2);
  assert.match((await say(w.viewer, id, "missed")).raised ?? "", /not found/i, "a viewer may not say it");
  assert.match((await say(w.stranger, id, "missed")).raised ?? "", /not found/i, "nor a stranger, who learns nothing");
  const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
  const nobody = await anon.rpc("mark_visit", { p_appointment_id: id, p_status: "missed" });
  assert.ok(nobody.error, "nobody signed in");
  assert.equal(await statusOf(id), "booked");
  assert.equal((await decisionsOf(id)).length, 0);
});

test("a booked visit is not proposed again by anyone", { skip }, async () => {
  const id = await visit(10);
  const back = await w.admin.from("appointments").update({ status: "proposed" }).eq("id", id);
  assert.match(back.error?.message ?? "", /not proposed again/);
});
