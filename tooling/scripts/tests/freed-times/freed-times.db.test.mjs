/**
 * A time a cancellation frees is offered (00497, decision 0081), against the replayed database.
 *
 * The moment is a closed set the database holds too: a step on slot_opened is accepted and a trigger nobody wrote is
 * refused. A batch carries the time it offers and the appointment that freed it, once per step and appointment, and a
 * half-said time is refused. A move says the time it left, written by the record's trigger and by the feed's read alike,
 * and a cancellation says none. Who took the time is read, never stored: an appointment of a person the batch sent to,
 * standing, inside the offered span, written after the batch started; run_counts says it beside sent and replied, and
 * null for a run that offered no time, and a sequence's History says it with the time each batch offers. Ask's count of
 * cancellations reads the service's cancels and the feed's vanished entries of a person's appointment, nothing else. And
 * the subscription stands, so the relay delivers the event to the door.
 *
 * Runs against the local database the Database workflow builds from every migration. Never production:
 * `supabase start`, then `pnpm test:db` with its keys.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { cancellationsSince } from "@chanlytics/db";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes appointments, sequences and batches"
      : false;

const ok = (res, what = "") => {
  assert.equal(res.error, null, `${what}: ${res.error?.message}`);
  return res.data;
};

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const H = 3_600_000;
const D = 24 * H;
const TZ = "America/New_York";
/** The afternoon two days on: a time inside anyone's hours, whatever the clock reads now. */
const dayAt = (daysOn, hour) => {
  const d = new Date(Date.now() + daysOn * D);
  d.setUTCHours(hour + 4, 0, 0, 0); // 15:00 in New York is 19:00Z (or 20:00Z in winter): the hour itself never matters here
  return d;
};
let db;
let tenantId;
let sequenceId;
let stepId;
let templateId;
const people = {};
let serial = 0;
const phone = () => `+1646555${String(1400 + ++serial).slice(-4)}`;

const person = async (name) =>
  ok(
    await db
      .from("contacts")
      .insert({ tenant_id: tenantId, phone_e164: phone(), display_name: name })
      .select("id")
      .single(),
    name,
  ).id;

const appointment = async (contactId, startsAt, over = {}) =>
  ok(
    await db
      .from("appointments")
      .insert({
        tenant_id: tenantId,
        contact_id: contactId,
        source: "booking_email",
        status: "booked",
        starts_at: startsAt.toISOString(),
        ends_at: new Date(startsAt.getTime() + H).toISOString(),
        timezone: TZ,
        ...over,
      })
      .select("id, starts_at")
      .single(),
    "appointment",
  );

/** A batch of the step, with its message as every batch carries it. */
const batchRow = (over = {}) => ({
  tenant_id: tenantId,
  name: "Fill a cancellation · Tue 3:00 PM",
  scheduled_for: new Date().toISOString(),
  sequence_id: sequenceId,
  step_id: stepId,
  template_id: templateId,
  template_name: "time_freed",
  template_language: "en_US",
  state: "scheduled",
  ...over,
});

const batch = async (over) =>
  ok(await db.from("sequence_batches").insert(batchRow(over)).select("id").single(), "batch").id;

const sent = async (batchId, contactId) =>
  ok(
    await db.from("sequence_sends").insert({
      tenant_id: tenantId,
      sequence_id: sequenceId,
      step_id: stepId,
      batch_id: batchId,
      contact_id: contactId,
      state: "sent",
      sent_at: new Date().toISOString(),
    }),
    "send",
  );

/** The appointment's change events, oldest first, as the record wrote them. */
const changesOf = async (appointmentId) =>
  ok(
    await db
      .from("events")
      .select("data, created_at")
      .eq("tenant_id", tenantId)
      .eq("kind", "appointment.changed")
      .eq("subject_id", appointmentId)
      .order("created_at", { ascending: true }),
    "events",
  ).map((e) => e.data);

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  tenantId = ok(
    await db
      .from("tenants")
      .insert({ slug: `freed-${RUN}`, name: "Freed times" })
      .select("id")
      .single(),
    "tenant",
  ).id;
  for (const name of ["Dani", "Eli", "Fay", "Gus", "Ida", "Jo"]) people[name] = await person(name);
  templateId = ok(
    await db
      .from("templates")
      .insert({
        tenant_id: tenantId,
        channel: "whatsapp",
        name: "time_freed",
        language: "en_US",
        meta_status: "approved",
      })
      .select("id")
      .single(),
    "the freed time's message",
  ).id;
  // The first step makes its own sequence (sequence_steps_place), as every moment's does.
  const step = ok(await db.from("sequence_steps").insert(stepRow()).select("id, sequence_id").single(), "the step");
  stepId = step.id;
  sequenceId = step.sequence_id;
});

/** A first step on the moment, with the freed time's message and its three values. */
const stepRow = (over = {}) => ({
  tenant_id: tenantId,
  name: "Fill a cancellation",
  trigger: "slot_opened",
  template_id: templateId,
  template_name: "time_freed",
  template_language: "en_US",
  params: [{ kind: "first_name" }, { kind: "business_name" }, { kind: "freed_when" }],
  policy_class: "follow_up",
  ...over,
});

after(async () => {
  if (skip || !db) return;
  await db.from("tenants").delete().eq("id", tenantId);
});

test(
  "the moment is a closed set here too: a step on slot_opened is accepted, a trigger nobody wrote is refused",
  { skip },
  async () => {
    assert.ok(stepId && sequenceId, "the step inserted in before(), with the sequence it made");
    const refused = await db.from("sequence_steps").insert(stepRow({ name: "Nobody's", trigger: "slot_opened_twice" }));
    assert.match(refused.error?.message ?? "", /sequence_steps_trigger_check/, "a trigger nobody wrote");
  },
);

test(
  "a batch carries the time it offers and the appointment that freed it, once per step and appointment; a half-said time is refused",
  { skip },
  async () => {
    const start = dayAt(2, 15);
    const freed = await appointment(people.Dani, start);
    const span = { offered_start: start.toISOString(), offered_end: new Date(start.getTime() + H).toISOString() };
    const made = await batch({ ...span, offered_from: freed.id });
    assert.ok(made);
    const again = await db.from("sequence_batches").insert(batchRow({ ...span, offered_from: freed.id }));
    assert.equal(again.error?.code, "23505", "one batch per step and appointment");
    assert.match(again.error?.message ?? "", /sequence_batches_offered_once/);
    const backwards = await db
      .from("sequence_batches")
      .insert(batchRow({ offered_start: span.offered_end, offered_end: span.offered_start, offered_from: freed.id }));
    assert.match(backwards.error?.message ?? "", /sequence_batches_offered_check/, "a span runs forward");
    const half = await db.from("sequence_batches").insert(batchRow({ offered_start: span.offered_start }));
    assert.match(half.error?.message ?? "", /sequence_batches_offered_check/, "all three or none");
    // Ordinary batches say nothing of a time, and two of them on one step are not one.
    await batch({});
    await batch({});
  },
);

test(
  "a move says the time it left (was_at), written by the record's trigger; a cancellation says none",
  { skip },
  async () => {
    const start = dayAt(3, 15);
    const row = await appointment(people.Eli, start);
    const later = new Date(start.getTime() + D);
    ok(
      await db
        .from("appointments")
        .update({ starts_at: later.toISOString(), ends_at: new Date(later.getTime() + H).toISOString() })
        .eq("id", row.id),
      "the move",
    );
    const moved = (await changesOf(row.id)).find((d) => d.change === "moved");
    assert.ok(moved, "the move is said");
    assert.equal(Date.parse(moved.was_at), start.getTime(), "the time it left");
    assert.equal(Date.parse(moved.starts_at), later.getTime(), "the time it went to");
    assert.equal(moved.by, "service");
    ok(await db.from("appointments").update({ status: "cancelled" }).eq("id", row.id), "the cancel");
    const cancelled = (await changesOf(row.id)).find((d) => d.change === "cancelled");
    assert.ok(cancelled, "the cancellation is said");
    assert.equal(cancelled.was_at, undefined, "a cancellation frees the time it had: no was_at");
    assert.equal(Date.parse(cancelled.starts_at), later.getTime());
  },
);

test("the feed's read says the time a moved row left (was_at), and keeps the row's new time", { skip }, async () => {
  const key = `ev-${RUN}`;
  const start = dayAt(4, 10);
  const later = new Date(start.getTime() + 2 * H);
  const from = new Date(Date.now() - D).toISOString();
  const to = new Date(Date.now() + 30 * D).toISOString();
  const read = (startsAt, now) =>
    db.rpc("appointments_feed_sync", {
      p_tenant_id: tenantId,
      p_timezone: TZ,
      p_rows: [
        {
          external_id: key,
          starts_at: startsAt.toISOString(),
          ends_at: new Date(startsAt.getTime() + H).toISOString(),
          all_day: false,
          service: null,
          consultation: false,
          contact_id: people.Fay,
          series: false,
          twin: false,
        },
      ],
      p_from: from,
      p_to: to,
      p_now: now.toISOString(),
    });
  const first = ok(await read(start, new Date()), "the first read");
  assert.equal(first.added, 1);
  const second = ok(await read(later, new Date(Date.now() + 60_000)), "the second read");
  assert.equal(second.moved, 1);
  const row = ok(
    await db
      .from("appointments")
      .select("id, starts_at")
      .eq("tenant_id", tenantId)
      .eq("source", "calendar_feed")
      .eq("external_id", key)
      .single(),
    "the feed's row",
  );
  assert.equal(Date.parse(row.starts_at), later.getTime(), "the row moved");
  const moved = (await changesOf(row.id)).find((d) => d.change === "moved");
  assert.ok(moved, "the feed's move is said");
  assert.equal(moved.source, "calendar_feed");
  assert.equal(Date.parse(moved.was_at), start.getTime(), "the time it left");
  const added = (await changesOf(row.id)).find((d) => d.change === "added");
  assert.equal(added?.was_at, undefined, "an addition left no time");
});

test(
  "who took the time is read, never stored: standing, inside the span, after the batch started; run_counts says it, and null for a run that offered no time",
  { skip },
  async () => {
    const start = dayAt(5, 15);
    const end = new Date(start.getTime() + H);
    const freed = await appointment(people.Gus, start);
    ok(await db.from("appointments").update({ status: "cancelled" }).eq("id", freed.id), "the cancel that freed it");
    const offering = await batch({
      offered_start: start.toISOString(),
      offered_end: end.toISOString(),
      offered_from: freed.id,
      state: "sent",
      started_at: new Date(Date.now() - H).toISOString(),
    });
    for (const who of ["Dani", "Eli", "Fay", "Ida", "Jo"]) await sent(offering, people[who]);
    // Dani took it: booked inside the span, after the batch started.
    await appointment(people.Dani, new Date(start.getTime() + 15 * 60_000));
    // Eli's row inside the span is from before the batch started: not taken from this offer.
    await appointment(people.Eli, start, { created_at: new Date(Date.now() - 2 * H).toISOString() });
    // Fay booked another day.
    await appointment(people.Fay, new Date(start.getTime() + D));
    // Ida's row inside the span vanished from the feed.
    await appointment(people.Ida, start, {
      source: "calendar_feed",
      external_id: `gone-${RUN}`,
      vanished_at: new Date().toISOString(),
    });
    // Jo asked for the time and the owner has not answered yet: a request stands too (0061).
    await appointment(people.Jo, new Date(start.getTime() + 30 * 60_000), {
      status: "proposed",
      source: "receptionist",
    });
    // Gus, whose cancellation freed it, was never sent to.
    const took = ok(await db.rpc("freed_time_taken", { p_batch_id: offering }), "freed_time_taken");
    assert.equal(took, 2, "Dani and Jo");

    const ordinary = await batch({ state: "sent", started_at: new Date(Date.now() - H).toISOString() });
    await sent(ordinary, people.Dani);
    const counts = ok(
      await db.rpc("run_counts", { p_tenant_id: tenantId, p_run_ids: [offering, ordinary] }),
      "run_counts",
    );
    assert.equal(counts[offering].sent, 5);
    assert.equal(counts[offering].took, 2, "the run's counts say who took the time");
    assert.equal(counts[ordinary].sent, 1);
    assert.equal(counts[ordinary].took, null, "a run that offered no time says nothing of it");

    // The sequence's History says the same of each batch, with the time a freed time's offers (L3).
    const history = ok(
      await db.rpc("sequence_history", { p_tenant_id: tenantId, p_sequence_id: sequenceId, p_limit: 100 }),
      "sequence_history",
    );
    const day = (id) => history.batches.find((b) => b.id === id);
    assert.equal(day(offering).took, 2);
    assert.equal(Date.parse(day(offering).offered_start), start.getTime());
    assert.deepEqual([day(ordinary).took, day(ordinary).offered_start], [null, null]);
  },
);

test(
  "Ask's count of cancellations: the service's cancel and the feed's vanished entry of a person's appointment, nothing else",
  { skip },
  async () => {
    const since = new Date(Date.now() - 30 * D).toISOString();
    const before = await cancellationsSince(db, tenantId, since);
    const at = dayAt(6, 15);
    const theirs = await appointment(people.Jo, at);
    const vanished = await appointment(people.Ida, at, { source: "calendar_feed", external_id: `v-${RUN}` });
    const nobodys = await appointment(null, at);
    const event = (subjectId, data) => ({
      tenant_id: tenantId,
      kind: "appointment.changed",
      category: "appointment",
      subject_type: "appointment",
      subject_id: subjectId,
      data,
    });
    ok(
      await db.from("events").insert([
        event(theirs.id, { change: "cancelled", source: "booking_email", by: "service" }),
        event(vanished.id, { change: "vanished", source: "calendar_feed" }),
        // A member's own cancel, a move, and a cancel of nobody's appointment are none of it.
        event(theirs.id, { change: "cancelled", source: "booking_email", by: "member" }),
        event(theirs.id, { change: "moved", source: "booking_email", by: "service" }),
        event(nobodys.id, { change: "cancelled", source: "booking_email", by: "service" }),
      ]),
      "the change events",
    );
    assert.equal(await cancellationsSince(db, tenantId, since), before + 2);
  },
);

test(
  "the subscription stands: appointment.changed reaches freed_time_offer in the background lane",
  { skip },
  async () => {
    const rows = ok(
      await db
        .from("event_subscriptions")
        .select("kind, subscriber, lane, paused")
        .eq("kind", "appointment.changed")
        .eq("subscriber", "freed_time_offer"),
      "the subscription",
    );
    assert.deepEqual(rows, [{ kind: "appointment.changed", subscriber: "freed_time_offer", lane: 2, paused: false }]);
  },
);
