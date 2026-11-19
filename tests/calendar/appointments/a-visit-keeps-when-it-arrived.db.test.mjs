/**
 * A visit keeps when its booking arrived (decision 0141, 00647), on a real Postgres: the stamp's door moves the column
 * and nothing else (no word of a change on the ledger, and the visit's own updated_at stays, which a reminder asks
 * about), the later moment wins, a member's session reads the week's arrivals with who booked each through the one
 * read the dashboard counts from, and the subscription that stamps is on. Runs against the database `supabase start`
 * builds on this machine, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { stampVisitArrival } from "@chanlytics/db/calendar";
import { listArrivedVisits } from "@chanlytics/db/notices";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes users, workspaces and appointments"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the session this suite signs in with needs it"
        : false;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const w = {};
const users = [];
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const ahead = (ms) => new Date(Date.now() + ms).toISOString();

/** A visit in the record, an hour long, starting `startsAt`. */
async function visit(startsAt, over = {}) {
  return ok(
    await w.admin
      .from("appointments")
      .insert({
        tenant_id: w.tenant,
        source: "booking_tool",
        external_id: `arrival-${Math.random().toString(36).slice(2)}`,
        status: "booked",
        starts_at: startsAt,
        ends_at: new Date(Date.parse(startsAt) + HOUR).toISOString(),
        timezone: "America/New_York",
        ...over,
      })
      .select("id")
      .single(),
  ).id;
}
const rowOf = async (id) =>
  ok(await w.admin.from("appointments").select("arrived_at, updated_at, status").eq("id", id).single());
const changesOf = async (id) =>
  ok(
    await w.admin
      .from("events")
      .select("data")
      .eq("kind", "appointment.changed")
      .eq("subject_id", id)
      .order("created_at", { ascending: true }),
  ).map((e) => e.data.change);
const same = (a, b) => Date.parse(a) === Date.parse(b);

before(async () => {
  if (skip) return;
  w.admin = createClient(URL_, KEY, { auth: { persistSession: false } });
  const stamp = Date.now().toString(36);
  w.tenant = ok(
    await w.admin
      .from("tenants")
      .insert({ slug: `arrivals-${stamp}`, name: "Arrivals" })
      .select("id")
      .single(),
  ).id;
  w.person = ok(
    await w.admin
      .from("contacts")
      .insert({ tenant_id: w.tenant, display_name: "Dana Whitfield", phone_e164: "+13055550112" })
      .select("id")
      .single(),
  ).id;
  const email = `arrivals-${stamp}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await w.admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await w.admin.from("memberships").insert({ tenant_id: w.tenant, user_id: made.data.user.id, role: "viewer" }));
  w.member = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const session = await w.member.auth.signInWithPassword({ email, password });
  assert.equal(session.error, null, session.error?.message);
});

after(async () => {
  if (skip || !w.admin) return;
  if (w.tenant) {
    await w.admin.from("appointments").delete().eq("tenant_id", w.tenant);
    await w.admin.from("events").delete().eq("tenant_id", w.tenant);
    await w.admin.from("contacts").delete().eq("tenant_id", w.tenant);
    await w.admin.from("tenants").delete().eq("id", w.tenant);
  }
  for (const id of users) await w.admin.auth.admin.deleteUser(id).catch(() => {});
});

test(
  "the stamp moves the column and nothing else: no change on the ledger, and the visit's updated_at stays",
  { skip },
  async () => {
    const id = await visit(ahead(2 * DAY));
    const made = await rowOf(id);
    assert.equal(made.arrived_at, null, "a visit is written with no stamp");
    const first = ago(3 * HOUR);
    assert.equal(await stampVisitArrival(w.admin, w.tenant, id, first), true);
    const stamped = await rowOf(id);
    assert.ok(same(stamped.arrived_at, first), "the moment given, not the moment of the write");
    assert.equal(
      stamped.updated_at,
      made.updated_at,
      "REGRESSION: a stamp read as a change of the visit would hold a reminder drawn before it",
    );
    assert.deepEqual(await changesOf(id), ["added"], "the stamp says nothing on the ledger: nothing to deliver again");
    // Every other write still moves updated_at.
    ok(await w.admin.from("appointments").update({ service: "Gloss" }).eq("id", id));
    assert.notEqual((await rowOf(id)).updated_at, made.updated_at, "another write is a change of the visit");
  },
);

test("the later moment wins, and a second delivery or an older event moves nothing", { skip }, async () => {
  const id = await visit(ahead(2 * DAY));
  const added = ago(DAY);
  const confirmed = ago(HOUR);
  assert.equal(await stampVisitArrival(w.admin, w.tenant, id, added), true);
  assert.equal(await stampVisitArrival(w.admin, w.tenant, id, added), false, "one event delivered twice");
  assert.equal(await stampVisitArrival(w.admin, w.tenant, id, confirmed), true, "a hold confirmed the next day");
  assert.equal(await stampVisitArrival(w.admin, w.tenant, id, added), false, "the older event, delivered late");
  assert.ok(same((await rowOf(id)).arrived_at, confirmed));
});

test(
  "a member reads what arrived since a moment and stands, with who booked each, the first to arrive first",
  { skip },
  async () => {
    const since = ago(3 * DAY);
    const stampAt = async (id, at) => assert.equal(await stampVisitArrival(w.admin, w.tenant, id, at), true);
    const named = await visit(ahead(3 * DAY), { client_name: "Ana Reyes" });
    const linked = await visit(ahead(4 * DAY), { source: "calendar_feed", contact_id: w.person });
    const came = await visit(ago(HOUR), { client_name: "Ivy Chen" });
    const gone = await visit(ahead(5 * DAY), { client_name: "Sofia Diaz" });
    const own = await visit(ahead(5 * DAY), { source: "calendar_feed" });
    const old = await visit(ahead(6 * DAY), { client_name: "Eli Stone" });
    await visit(ahead(6 * DAY), { client_name: "No Stamp" });
    await stampAt(named, ago(2 * DAY));
    await stampAt(linked, ago(DAY));
    await stampAt(came, ago(DAY + HOUR));
    await stampAt(gone, ago(DAY));
    await stampAt(own, ago(DAY));
    await stampAt(old, ago(5 * DAY));
    ok(await w.admin.from("appointments").update({ status: "kept" }).eq("id", came));
    ok(await w.admin.from("appointments").update({ status: "cancelled" }).eq("id", gone));

    const arrived = await listArrivedVisits(w.member, w.tenant, since);
    assert.deepEqual(
      arrived.filter((v) => [named, linked, came, gone, own, old].includes(v.id)).map((v) => [v.id, v.who, v.via]),
      [
        [named, "Ana Reyes", "booking_tool"],
        [came, "Ivy Chen", "booking_tool"],
        [linked, "Dana Whitfield", "calendar_feed"],
      ],
      "one cancelled, the owner's own entry and one from before the moment are left out; a visit that came is not",
    );
    assert.ok(arrived.every((v) => typeof v.arrivedAt === "string" && Date.parse(v.arrivedAt) >= Date.parse(since)));
  },
);

test("appointment.changed is delivered to visit_arrival, in the lane where nobody waits", { skip }, async () => {
  const subscriptions = ok(
    await w.admin.from("event_subscriptions").select("subscriber, lane, paused").eq("kind", "appointment.changed"),
  );
  assert.deepEqual(
    subscriptions.filter((s) => s.subscriber === "visit_arrival"),
    [{ subscriber: "visit_arrival", lane: 2, paused: false }],
  );
});
