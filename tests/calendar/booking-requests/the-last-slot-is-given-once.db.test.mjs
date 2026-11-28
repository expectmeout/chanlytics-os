/**
 * The last slot, on a real Postgres, asked at once (00730; lane 15 of the whole-system plan, the brief's item 3): every
 * race here is two requests sent together through PostgREST, so each runs on its own connection.
 *
 * Two people ask for the same last time: one is given it, the other is answered taken and holds nothing. A request that
 * runs out as its owner presses Booked it: one of the two wins, and the visit is never both booked and let go. A move
 * and a cancel of one visit at once: the member's cancel stands, whichever is first. A booking asked for while the
 * calendar's own read writes the same hour: both land, the feed's copy holds no time, and the request does. And the
 * rule a door asks is the one the open times read (packages/db listAppointmentsBetween). Runs against the database
 * `supabase start` builds on this machine, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { listAppointmentsBetween, updateAppointment } from "@chanlytics/db/calendar";

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
const TZ = "America/New_York";
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const w = {};
const users = [];
let n = 0;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const iso = (ms) => new Date(ms).toISOString();

/** A real session for a fresh user with this role in this workspace. */
async function member(role) {
  const email = `last-slot-${role}-${RUN}@example.com`;
  const password = `pw-${RUN}-${role}-Aa1!`;
  const made = await w.admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await w.admin.from("memberships").insert({ tenant_id: w.tenant, user_id: made.data.user.id, role }));
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  return { client, id: made.data.user.id };
}

/** A person and their thread. */
async function person() {
  n += 1;
  const contact = ok(
    await w.admin
      .from("contacts")
      .insert({ tenant_id: w.tenant, display_name: `Guest ${n}`, phone_e164: `+1646555${String(3000 + n).slice(-4)}` })
      .select("id")
      .single(),
  ).id;
  const thread = ok(
    await w.admin.from("conversations").insert({ tenant_id: w.tenant, contact_id: contact }).select("id").single(),
  ).id;
  return { contact, thread };
}

/** The service role's door, as the edge asks it: an hour from `startMs`. */
const open = (who, startMs) =>
  w.admin
    .rpc("booking_request_open", {
      p_tenant_id: w.tenant,
      p_conversation_id: who.thread,
      p_contact_id: who.contact,
      p_starts_at: iso(startMs),
      p_ends_at: iso(startMs + HOUR),
      p_service: "Cut",
      p_timezone: TZ,
      p_words: "Asked for a time",
    })
    .then(ok);
const rowOf = async (id) => ok(await w.admin.from("appointments").select("*").eq("id", id).single());
const liveOf = async (who) =>
  ok(
    await w.admin
      .from("appointments")
      .select("id, status")
      .eq("contact_id", who.contact)
      .in("status", ["proposed", "booked"]),
  );
const eventsOf = async (id, kind) =>
  ok(await w.admin.from("events").select("data").eq("kind", kind).eq("subject_id", id)).map((e) => e.data);

before(async () => {
  if (skip) return;
  w.admin = createClient(URL_, KEY, { auth: { persistSession: false } });
  w.tenant = ok(
    await w.admin
      .from("tenants")
      .insert({ slug: `last-slot-${RUN}`, name: "Last slot", timezone: TZ })
      .select("id")
      .single(),
  ).id;
  w.operator = await member("operator");
});

after(async () => {
  if (skip || !w.admin) return;
  for (const table of ["appointments", "escalations", "decisions", "events", "messages", "conversations", "contacts"])
    await w.admin.from(table).delete().eq("tenant_id", w.tenant);
  await w.admin.from("tenants").delete().eq("id", w.tenant);
  for (const id of users) await w.admin.auth.admin.deleteUser(id).catch(() => {});
});

test("two people ask for the last time at once: one is given it, the other is answered taken", { skip }, async () => {
  // Five rounds, each a different hour, each two asks sent together.
  for (let round = 0; round < 5; round += 1) {
    const at = Date.now() + (30 + 2 * round) * HOUR;
    const [ana, ben] = [await person(), await person()];
    const answers = await Promise.all([open(ana, at), open(ben, at)]);
    const given = answers.filter((a) => typeof a?.appointment?.id === "string");
    const taken = answers.filter((a) => a?.error === "taken");
    assert.equal(given.length, 1, `round ${round}: one is given it (${JSON.stringify(answers)})`);
    assert.equal(taken.length, 1, `round ${round}: the other is answered taken`);
    const holders = [...(await liveOf(ana)), ...(await liveOf(ben))];
    assert.equal(holders.length, 1, "one visit holds the time");
    assert.equal(holders[0].id, given[0].appointment.id);
  }
});

test(
  "one after the other the same: a taken time leaves the request a person already holds as it was",
  { skip },
  async () => {
    const at = Date.now() + 50 * HOUR;
    const cara = await person();
    const dan = await person();
    const first = await open(cara, at);
    const elsewhere = await open(dan, at + 3 * HOUR);
    assert.deepEqual(await open(dan, at), { error: "taken" });
    assert.equal((await rowOf(elsewhere.appointment.id)).status, "proposed", "Dan still holds his own time");
    assert.equal((await rowOf(first.appointment.id)).status, "proposed", "and Cara hers");
    // The time ends where the next one may start.
    assert.equal(typeof (await open(await person(), at + HOUR)).appointment?.id, "string", "the next hour is free");
  },
);

test(
  "the doors ask the open times' own rule: what listAppointmentsBetween reads as taken is taken",
  { skip },
  async () => {
    const at = Date.now() + 70 * HOUR;
    // A booking tool's visit, and the calendar feed's own copy of another, an hour apart.
    ok(
      await w.admin.from("appointments").insert({
        tenant_id: w.tenant,
        source: "booking_email",
        tool: "booksy",
        external_id: `tool-${RUN}`,
        status: "booked",
        starts_at: iso(at),
        ends_at: iso(at + HOUR),
        timezone: TZ,
      }),
    );
    ok(
      await w.admin.from("appointments").insert({
        tenant_id: w.tenant,
        source: "calendar_feed",
        external_id: `feed-${RUN}`,
        status: "booked",
        starts_at: iso(at + 2 * HOUR),
        ends_at: iso(at + 3 * HOUR),
        timezone: TZ,
      }),
    );
    const read = await listAppointmentsBetween(w.admin, w.tenant, iso(at - HOUR), iso(at + 4 * HOUR));
    assert.deepEqual(
      read.map((r) => r.source),
      ["booking_email"],
      "the open times take the tool's visit and leave the feed's copy to the feed",
    );
    assert.deepEqual(await open(await person(), at), { error: "taken" }, "the tool's time is taken");
    assert.equal(typeof (await open(await person(), at + 2 * HOUR)).appointment?.id, "string", "the feed's is not");
  },
);

test("a request that runs out as its owner presses Booked it: one wins, never both", { skip }, async () => {
  for (let round = 0; round < 4; round += 1) {
    const eve = await person();
    const { appointment } = await open(eve, Date.now() + (90 + 2 * round) * HOUR);
    // It runs out as they arrive: a moment before, or a moment after, the request clock and the owner's press together.
    ok(
      await w.admin
        .from("appointments")
        .update({ expires_at: iso(Date.now() + (round % 2 === 0 ? -1000 : 150)) })
        .eq("id", appointment.id),
    );
    const [lapse, booked] = await Promise.all([
      w.admin.rpc("booking_request_lapse", { p_appointment_id: appointment.id, p_reply_words: "Not in time" }).then(ok),
      w.operator.client
        .rpc("booking_request_answer", { p_appointment_id: appointment.id, p_booked: true })
        .then((r) => (r.error ? { raised: r.error.message } : r.data)),
    ]);
    const row = await rowOf(appointment.id);
    const lapsed = await eventsOf(appointment.id, "appointment.lapsed");
    if (row.status === "booked") {
      assert.equal(lapsed.length, 0, "a booked visit was never let go");
      assert.ok(["answered", "early"].includes(lapse.outcome), JSON.stringify(lapse));
    } else {
      assert.equal(row.status, "cancelled");
      assert.equal(lapsed.length, 1, "let go once");
      assert.ok(["expired", "answered"].includes(booked.error), JSON.stringify(booked));
    }
  }
});

test("a move and a cancel of one visit at once: the member's cancel stands, whichever is first", { skip }, async () => {
  for (let round = 0; round < 4; round += 1) {
    const at = Date.now() + (120 + 3 * round) * HOUR;
    const id = ok(
      await w.admin
        .from("appointments")
        .insert({
          tenant_id: w.tenant,
          source: "booking_email",
          tool: "booksy",
          external_id: `move-${RUN}-${round}`,
          status: "booked",
          starts_at: iso(at),
          ends_at: iso(at + HOUR),
          timezone: TZ,
        })
        .select("id")
        .single(),
    ).id;
    // The booking tool's email says it moved an hour on (the notice reader's write), as the member cancels it.
    const [moved, cancelled] = await Promise.all([
      updateAppointment(w.admin, w.tenant, id, {
        starts_at: iso(at + HOUR),
        ends_at: iso(at + 2 * HOUR),
        status: "booked",
      }),
      w.operator.client.rpc("mark_visit", { p_appointment_id: id, p_status: "cancelled" }).then(ok),
    ]);
    const row = await rowOf(id);
    assert.equal(row.status, "cancelled", `round ${round}: the member's word stands`);
    assert.equal(cancelled.appointment?.status, "cancelled");
    if (moved === "refused") assert.equal(row.starts_at.slice(0, 16), iso(at).slice(0, 16), "nothing moved");
    else assert.equal(moved, "updated");
  }
});

test("a booking asked for while the calendar's own read writes the same hour: both land", { skip }, async () => {
  const at = Date.now() + 150 * HOUR;
  const fay = await person();
  const [synced, asked] = await Promise.all([
    w.admin
      .rpc("appointments_feed_sync", {
        p_tenant_id: w.tenant,
        p_timezone: TZ,
        p_rows: [
          {
            external_id: `owner-${RUN}`,
            starts_at: iso(at),
            ends_at: iso(at + HOUR),
            all_day: false,
            service: null,
            consultation: false,
            contact_id: null,
          },
        ],
        p_from: iso(Date.now() - 90 * 24 * HOUR),
        p_to: iso(Date.now() + 90 * 24 * HOUR),
        p_now: iso(Date.now()),
      })
      .then(ok),
    open(fay, at),
  ]);
  assert.equal(synced.added, 1, JSON.stringify(synced));
  assert.equal(typeof asked.appointment?.id, "string", "the request is held: the feed's copy holds no time here");
  assert.deepEqual(await open(await person(), at), { error: "taken" }, "and the request holds it from the next ask");
  // The next read of the feed leaves the request as it stands: it vanishes only the feed's own rows.
  ok(
    await w.admin.rpc("appointments_feed_sync", {
      p_tenant_id: w.tenant,
      p_timezone: TZ,
      p_rows: [],
      p_from: iso(Date.now() - 90 * 24 * HOUR),
      p_to: iso(Date.now() + 90 * 24 * HOUR),
      p_now: iso(Date.now() + 1000),
    }),
  );
  assert.equal((await rowOf(asked.appointment.id)).status, "proposed");
  assert.equal((await rowOf(asked.appointment.id)).vanished_at, null);
});

test("only the doors may ask whether a time is taken", { skip }, async () => {
  const r = await w.operator.client.rpc("appointments_time_taken", {
    p_tenant_id: w.tenant,
    p_contact_id: null,
    p_starts_at: iso(Date.now()),
    p_ends_at: iso(Date.now() + HOUR),
  });
  assert.match(r.error?.message ?? "", /permission denied/);
});
