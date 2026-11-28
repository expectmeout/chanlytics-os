/**
 * An appointment's whole life on a real Postgres, step by step through its own doors (decision 0002's section of 28 Nov
 * 2026; lane 15's item 4): asked for (proposed), booked, moved, cancelled; and a visit that has begun said missed, then
 * kept. Each step says its one `appointment.changed`, with whose word it was, and a reminder drawn before the step is
 * held or goes as contracts appointmentHolds reads the row the step left. Runs against the database `supabase start`
 * builds on this machine, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { appointmentHolds, recordKeyOf } from "@chanlytics/contracts";
import { updateAppointment } from "@chanlytics/db/calendar";

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
const MIN = 60_000;
const TZ = "America/New_York";
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const w = {};
const users = [];
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const iso = (ms) => new Date(ms).toISOString();

const rowOf = async (id) => ok(await w.admin.from("appointments").select("*").eq("id", id).single());
const changesOf = async (id) =>
  ok(
    await w.admin
      .from("events")
      .select("data")
      .eq("kind", "appointment.changed")
      .eq("subject_id", id)
      .order("created_at", { ascending: true }),
  ).map((e) => [e.data.change, e.data.by]);
/** A reminder drawn for this visit as it stood at `readAt`, asked at the send against the row as it stands now. */
const reminderGoes = async (id, drawn) => {
  const row = await rowOf(id);
  const states = new Map([[recordKeyOf(id), row]]);
  return appointmentHolds(states, {
    appointment: recordKeyOf(id),
    visit_start: drawn.start,
    appointment_read_at: drawn.at,
  });
};
const drawnNow = async (id) => ({ start: (await rowOf(id)).starts_at, at: new Date().toISOString() });

before(async () => {
  if (skip) return;
  w.admin = createClient(URL_, KEY, { auth: { persistSession: false } });
  w.tenant = ok(
    await w.admin
      .from("tenants")
      .insert({ slug: `whole-life-${RUN}`, name: "Whole life", timezone: TZ })
      .select("id")
      .single(),
  ).id;
  const email = `whole-life-operator-${RUN}@example.com`;
  const password = `pw-${RUN}-Aa1!`;
  const made = await w.admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await w.admin.from("memberships").insert({ tenant_id: w.tenant, user_id: made.data.user.id, role: "operator" }));
  w.member = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await w.member.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  w.contact = ok(
    await w.admin
      .from("contacts")
      .insert({ tenant_id: w.tenant, display_name: "Ana Ruiz", phone_e164: "+13055550188" })
      .select("id")
      .single(),
  ).id;
  w.thread = ok(
    await w.admin.from("conversations").insert({ tenant_id: w.tenant, contact_id: w.contact }).select("id").single(),
  ).id;
});

after(async () => {
  if (skip || !w.admin) return;
  for (const table of ["appointments", "escalations", "decisions", "events", "messages", "conversations", "contacts"])
    await w.admin.from(table).delete().eq("tenant_id", w.tenant);
  await w.admin.from("tenants").delete().eq("id", w.tenant);
  for (const id of users) await w.admin.auth.admin.deleteUser(id).catch(() => {});
});

test(
  "asked for, booked, moved, cancelled: each step its door, its one event, and what a queued reminder does",
  { skip },
  async () => {
    // Proposed: the receptionist's request, the service's door.
    const at = Date.now() + 40 * HOUR;
    const asked = ok(
      await w.admin.rpc("booking_request_open", {
        p_tenant_id: w.tenant,
        p_conversation_id: w.thread,
        p_contact_id: w.contact,
        p_starts_at: iso(at),
        p_ends_at: iso(at + HOUR),
        p_service: "Cut",
        p_timezone: TZ,
        p_words: "Asked for a time",
      }),
    );
    const id = asked.appointment.id;
    assert.equal((await rowOf(id)).status, "proposed");
    assert.deepEqual(await changesOf(id), [["added", "service"]]);

    // Booked: the member's Booked it.
    const booked = ok(await w.member.rpc("booking_request_answer", { p_appointment_id: id, p_booked: true }));
    assert.equal(booked.appointment?.status, "booked");
    assert.deepEqual((await changesOf(id)).at(-1), ["confirmed", "member"]);
    const drawnBooked = await drawnNow(id);
    assert.equal(await reminderGoes(id, drawnBooked), true, "a reminder drawn for the booking goes");

    // Moved: the tool's or the calendar's word, here the record's own update an hour on.
    assert.equal(
      await updateAppointment(w.admin, w.tenant, id, { starts_at: iso(at + HOUR), ends_at: iso(at + 2 * HOUR) }),
      "updated",
    );
    assert.deepEqual((await changesOf(id)).at(-1), ["moved", "service"]);
    assert.equal(await reminderGoes(id, drawnBooked), false, "the reminder drawn for the old time is held");
    const drawnMoved = await drawnNow(id);
    assert.equal(await reminderGoes(id, drawnMoved), true, "one drawn for the new time goes");

    // Cancelled: the member's word on the board.
    const cancelled = ok(await w.member.rpc("mark_visit", { p_appointment_id: id, p_status: "cancelled" }));
    assert.equal(cancelled.appointment?.status, "cancelled");
    assert.deepEqual((await changesOf(id)).at(-1), ["cancelled", "member"]);
    assert.equal(await reminderGoes(id, drawnMoved), false, "every reminder already queued is held");
    // And a cancelled visit is final: it is not booked again by any door.
    assert.deepEqual(ok(await w.member.rpc("booking_request_answer", { p_appointment_id: id, p_booked: true })), {
      error: "answered",
      status: "cancelled",
    });
    assert.equal((await changesOf(id)).length, 4, "one event a step, and none for a refusal");
  },
);

test("a visit that has begun: said missed, which holds its reminders, then corrected to kept", { skip }, async () => {
  const start = Date.now() - 30 * MIN;
  const id = ok(
    await w.admin
      .from("appointments")
      .insert({
        tenant_id: w.tenant,
        contact_id: w.contact,
        source: "booking_email",
        tool: "booksy",
        external_id: `begun-${RUN}`,
        status: "booked",
        starts_at: iso(start),
        ends_at: iso(start + HOUR),
        timezone: TZ,
      })
      .select("id")
      .single(),
  ).id;
  const drawn = await drawnNow(id);
  const missed = ok(await w.member.rpc("mark_visit", { p_appointment_id: id, p_status: "missed" }));
  assert.equal(missed.appointment?.status, "missed");
  assert.deepEqual((await changesOf(id)).at(-1), ["missed", "member"]);
  assert.equal(await reminderGoes(id, drawn), false, "a missed visit holds its reminders");
  const kept = ok(await w.member.rpc("mark_visit", { p_appointment_id: id, p_status: "kept" }));
  assert.equal(kept.appointment?.status, "kept");
  assert.deepEqual((await changesOf(id)).at(-1), ["kept", "member"]);
  // The thank-you the day after waits for kept (0123): it is owed now.
  const row = await rowOf(id);
  const states = new Map([[recordKeyOf(id), row]]);
  assert.equal(
    appointmentHolds(states, { appointment: recordKeyOf(id), visit_start: row.starts_at, visit_was: "kept" }),
    true,
  );
  // A cancellation after it began and ended is refused: what happened is not taken back.
  assert.deepEqual(ok(await w.member.rpc("mark_visit", { p_appointment_id: id, p_status: "cancelled" })), {
    error: "already_said",
  });
});
