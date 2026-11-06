/**
 * A booking the receptionist asks for (00443, decision 0061), on a real Postgres, as real sessions: the service role opens
 * the request and its thread's hold together, one open request per person (a second replaces the first: a person has one
 * thread in a workspace, so its hold is said again), never a slot an hour away or less; a member answers it, Booked it
 * (the row booked, its expiry gone, the hold resolved, both decisions theirs) or Can't (the row cancelled, the hold a reply
 * with the words the page gave it); a second answer, a row that was no request, a viewer, a stranger and a session calling
 * the service role's door are refused. An expired request takes no slot and leaves the board. Runs against the database
 * `supabase start` builds on this machine, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { appointmentsBetween } from "@chanlytics/db";

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
const DAY = 24 * HOUR;
const TZ = "America/New_York";
const w = {};
const users = [];
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

/** A real session for a fresh user with this role in this workspace. */
async function member(role, tenant) {
  const email = `request-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
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

/** A person and a thread of theirs in this workspace. */
async function person(name = "Ana Ruiz", phone = "+13055550142") {
  const contact = ok(
    await w.admin
      .from("contacts")
      .insert({ tenant_id: w.tenant, display_name: name, phone_e164: phone })
      .select("id")
      .single(),
  ).id;
  return { contact, thread: await thread(contact) };
}
const thread = async (contact) =>
  ok(await w.admin.from("conversations").insert({ tenant_id: w.tenant, contact_id: contact }).select("id").single()).id;

/** The service role's door, as the edge asks it: a slot `fromNowH` hours from now, an hour long. */
const open = (who, fromNowH, over = {}) => {
  const start = Date.now() + fromNowH * HOUR;
  return w.admin
    .rpc("booking_request_open", {
      p_tenant_id: w.tenant,
      p_conversation_id: who.thread,
      p_contact_id: who.contact,
      p_starts_at: new Date(start).toISOString(),
      p_ends_at: new Date(start + HOUR).toISOString(),
      p_service: "Balayage",
      p_timezone: TZ,
      p_words: "Asked for Sat, Oct 18, 2:00 PM · Balayage",
      ...over,
    })
    .then((r) => (r.error ? { raised: r.error.message } : r.data));
};

/** A member's answer, as the dashboard asks it. */
const answer = (as, id, booked, words = null) =>
  as.client
    .rpc("booking_request_answer", {
      p_appointment_id: id,
      p_booked: booked,
      ...(words ? { p_reply_words: words } : {}),
    })
    .then((r) => (r.error ? { raised: r.error.message } : r.data));

const rowOf = async (id) => ok(await w.admin.from("appointments").select("*").eq("id", id).single());
const holdsOf = async (threadId) =>
  ok(
    await w.admin
      .from("escalations")
      .select("id, state, reason, details, resolved_by_user_id, decision_id")
      .eq("conversation_id", threadId)
      .order("created_at", { ascending: true }),
  );
const changes = async (id) =>
  ok(
    await w.admin
      .from("events")
      .select("data")
      .eq("kind", "appointment.changed")
      .eq("subject_id", id)
      .order("created_at", { ascending: true }),
  ).map((e) => e.data.change);

before(async () => {
  if (skip) return;
  w.admin = createClient(URL_, KEY, { auth: { persistSession: false } });
  const stamp = Date.now().toString(36);
  w.tenant = ok(
    await w.admin
      .from("tenants")
      .insert({ slug: `requests-${stamp}`, name: "Requests" })
      .select("id")
      .single(),
  ).id;
  w.other = ok(
    await w.admin
      .from("tenants")
      .insert({ slug: `requests-other-${stamp}`, name: "Other" })
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
    for (const table of ["appointments", "escalations", "decisions", "events", "conversations", "contacts"])
      await w.admin.from(table).delete().eq("tenant_id", t);
    await w.admin.from("tenants").delete().eq("id", t);
  }
  for (const id of users) await w.admin.auth.admin.deleteUser(id).catch(() => {});
});

test(
  "the receptionist's request is a row that takes its slot and its thread's hold, opened together",
  { skip },
  async () => {
    const ana = await person();
    const asked = Date.now();
    const r = await open(ana, 72);
    assert.equal(r.hold, "opened");
    assert.deepEqual(r.replaced, []);
    const row = await rowOf(r.appointment.id);
    assert.deepEqual(
      [row.source, row.status, row.service, row.client_name, row.client_phone, row.conversation_id, row.contact_id],
      ["receptionist", "proposed", "Balayage", "Ana Ruiz", "+13055550142", ana.thread, ana.contact],
    );
    // Three days ahead: a day after it was asked, the sooner of the two.
    const expires = Date.parse(row.expires_at);
    assert.ok(Math.abs(expires - (asked + DAY)) < 60_000, "a day after it was asked");
    const [hold] = await holdsOf(ana.thread);
    assert.deepEqual(
      [hold.state, hold.reason, hold.details],
      ["open", "booking_request", "Asked for Sat, Oct 18, 2:00 PM · Balayage"],
    );
    assert.deepEqual(await changes(row.id), ["added"]);
    // Close to its time, an hour before the slot comes first.
    const soon = await open(await person("Bea", "+13055550143"), 5);
    const near = await rowOf(soon.appointment.id);
    const start = Date.parse(near.starts_at);
    assert.ok(Math.abs(Date.parse(near.expires_at) - (start - HOUR)) < 1_000, "an hour before the slot");
  },
);

test("one open request per person: a second replaces the first, its slot free again", { skip }, async () => {
  const cara = await person("Cara", "+13055550144");
  const first = await open(cara, 48);
  const second = await open(cara, 50);
  assert.equal(second.hold, "refreshed", "the same thread's hold, said again");
  assert.deepEqual(second.replaced, [first.appointment.id]);
  assert.equal((await rowOf(first.appointment.id)).status, "cancelled", "its slot free again");
  assert.equal((await rowOf(second.appointment.id)).status, "proposed");
  const holds = await holdsOf(cara.thread);
  assert.deepEqual(
    holds.map((h) => [h.state, h.reason]),
    [["open", "booking_request"]],
    "one hold, for the request that stands",
  );
  // And the database itself holds one open request per person.
  const twin = await w.admin.from("appointments").insert({
    tenant_id: w.tenant,
    contact_id: cara.contact,
    source: "receptionist",
    status: "proposed",
    starts_at: new Date(Date.now() + 60 * HOUR).toISOString(),
    ends_at: new Date(Date.now() + 61 * HOUR).toISOString(),
    timezone: TZ,
  });
  assert.match(twin.error?.message ?? "", /appointments_request_one/);
});

test("never a slot an hour away or less, and never by a member's own session", { skip }, async () => {
  const dee = await person("Dee", "+13055550145");
  assert.deepEqual(await open(dee, 0.5), { error: "too_soon" });
  assert.deepEqual(await holdsOf(dee.thread), [], "nothing was written");
  const own = await w.operator.client.rpc("booking_request_open", {
    p_tenant_id: w.tenant,
    p_conversation_id: dee.thread,
    p_contact_id: dee.contact,
    p_starts_at: new Date(Date.now() + 48 * HOUR).toISOString(),
    p_ends_at: new Date(Date.now() + 49 * HOUR).toISOString(),
    p_service: "",
    p_timezone: TZ,
    p_words: "x",
  });
  assert.match(own.error?.message ?? "", /permission denied/, "the service role's door");
  const wrong = await open({ contact: dee.contact, thread: (await person("Eve", "+13055550146")).thread }, 48, {
    p_tenant_id: w.other,
  });
  assert.match(wrong.raised ?? "", /no such person/, "a person of another workspace is no one here");
});

test(
  "Booked it books the row, ends its expiry and hands the thread back, which resolves the hold; both decisions the member's",
  { skip },
  async () => {
    const fay = await person("Fay", "+13055550147");
    const { appointment } = await open(fay, 30);
    const r = await answer(w.operator, appointment.id, true);
    assert.deepEqual([r.appointment, r.hold], [{ id: appointment.id, status: "booked" }, "resolved"]);
    assert.equal(typeof r.decision_id, "string");
    const row = await rowOf(appointment.id);
    assert.deepEqual([row.status, row.expires_at], ["booked", null], "a booking stands until someone says otherwise");
    const [hold] = await holdsOf(fay.thread);
    assert.deepEqual([hold.state, hold.resolved_by_user_id], ["resolved", w.operator.id]);
    const conv = ok(await w.admin.from("conversations").select("state, paused_until").eq("id", fay.thread).single());
    assert.deepEqual([conv.state, conv.paused_until], ["open", null], "the receptionist has the thread again");
    const decisions = ok(
      await w.admin
        .from("decisions")
        .select("id, verb, subject_type, actor_user_id, payload")
        .eq("tenant_id", w.tenant)
        .in("subject_id", [appointment.id, fay.thread]),
    );
    // One transaction, one clock: told apart by what they are, not by when.
    const byVerb = Object.fromEntries(decisions.map((d) => [d.verb, d]));
    assert.deepEqual(Object.keys(byVerb).sort(), ["answer_booking_request", "hand_back"]);
    assert.deepEqual(
      [byVerb.hand_back.subject_type, byVerb.answer_booking_request.subject_type],
      ["conversation", "appointment"],
    );
    assert.equal(hold.decision_id, byVerb.hand_back.id, "the hold was resolved by the hand-back");
    assert.ok(
      decisions.every((d) => d.actor_user_id === w.operator.id),
      "both the member's",
    );
    assert.equal(byVerb.answer_booking_request.payload.booked, true);
    assert.deepEqual((await changes(appointment.id)).slice(0, 1), ["added"]);
    assert.ok((await changes(appointment.id)).length >= 2, "the booking is said too");
    assert.deepEqual(await answer(w.operator, appointment.id, false), { error: "answered", status: "booked" });
  },
);

test("Can't cancels it and leaves the thread waiting on a reply, in the words the page gave", { skip }, async () => {
  const gia = await person("Gia", "+13055550148");
  const { appointment } = await open(gia, 30);
  const r = await answer(
    w.operator,
    appointment.id,
    false,
    "Could not book Sat, Oct 18, 2:00 PM · Balayage: reply to them",
  );
  assert.deepEqual([r.appointment.status, r.hold], ["cancelled", "reply"]);
  const [hold] = await holdsOf(gia.thread);
  assert.deepEqual(
    [hold.state, hold.reason, hold.details],
    ["open", "booking_reply", "Could not book Sat, Oct 18, 2:00 PM · Balayage: reply to them"],
  );
  // Without the page's words, the database says the time itself.
  const hal = await person("Hal", "+13055550149");
  const second = await open(hal, 30);
  await answer(w.operator, second.appointment.id, false);
  const [said] = await holdsOf(hal.thread);
  assert.match(said.details, /^Could not book .+ · Balayage: reply to them$/);
});

test("refused: a row that was no request, a viewer, a stranger", { skip }, async () => {
  const booked = ok(
    await w.admin
      .from("appointments")
      .insert({
        tenant_id: w.tenant,
        source: "booking_email",
        tool: "booksy",
        external_id: `request-${Math.random().toString(36).slice(2)}`,
        status: "booked",
        starts_at: new Date(Date.now() + 30 * HOUR).toISOString(),
        ends_at: new Date(Date.now() + 31 * HOUR).toISOString(),
        timezone: TZ,
      })
      .select("id")
      .single(),
  ).id;
  assert.deepEqual(await answer(w.operator, booked, true), { error: "not_a_request" });
  const ivy = await person("Ivy", "+13055550150");
  const { appointment } = await open(ivy, 30);
  assert.match((await answer(w.viewer, appointment.id, true)).raised ?? "", /not found/i, "a viewer acts in nothing");
  assert.match(
    (await answer(w.stranger, appointment.id, true)).raised ?? "",
    /not found/i,
    "a stranger learns nothing",
  );
  assert.equal((await rowOf(appointment.id)).status, "proposed");
});

test("an expired request takes no slot and leaves the board; one standing does", { skip }, async () => {
  const jo = await person("Jo", "+13055550151");
  const from = new Date(Date.now() + 20 * HOUR).toISOString();
  const to = new Date(Date.now() + 40 * HOUR).toISOString();
  const { appointment } = await open(jo, 30);
  const read = async () => (await appointmentsBetween(w.admin, w.tenant, from, to)).map((r) => r.id);
  assert.ok((await read()).includes(appointment.id), "standing, it takes its slot");
  ok(
    await w.admin
      .from("appointments")
      .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", appointment.id),
  );
  assert.ok(!(await read()).includes(appointment.id), "expired, it takes nothing");
  const [hold] = await holdsOf(jo.thread);
  assert.equal(hold.state, "open", "and its hold stays until a person answers");
  // Its time may have gone to someone else since: it is never booked blind, and Can't still answers it.
  assert.deepEqual(await answer(w.operator, appointment.id, true), { error: "expired" });
  assert.equal((await rowOf(appointment.id)).status, "proposed");
  assert.equal((await answer(w.operator, appointment.id, false)).appointment.status, "cancelled");
});
