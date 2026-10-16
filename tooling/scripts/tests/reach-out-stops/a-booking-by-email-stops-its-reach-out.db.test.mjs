/**
 * A booking reaches its reach-out through its event (00389): the spine's first subscriber that acts, on a real Postgres.
 *
 *   1. an appointment kept on the record from a booking tool's notice by email writes appointment.changed in its own
 *      transaction ({change, source, starts_at}), and the relay owes the reach_out_booked subscriber a delivery of it;
 *      the subscriber, run on its real ports, books and converts the lead a reach-out wrote to, and a second run moves
 *      nothing;
 *   2. a cancelled booking, and a write that moves neither its start nor its status, book nobody; a move is a change
 *      of its own; the feed's own rows are left to the feed's door, which writes theirs;
 *   3. a proposed booking books nobody until it is confirmed, which is a change that books, here by its client's
 *      number; an appointment that names only its person books by the person's address;
 *   4. the business's own addresses book nobody, as People's import leaves them out: its members' and the ones it is
 *      alerted at.
 *
 * Before 00389 the booking door ran only from the hourly calendar sweep, over the feed's items, so a booking that
 * arrived by email never reached it, and its lead kept being written to.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces, people and leads"
      : false;

const DAY = 86_400_000;
const stamp = Date.now().toString(36);
const iso = (ms) => new Date(ms).toISOString();
let db;
let A;
let B;
let template;
let n = 0;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const one = async (q) => ok(await q.select("id").single()).id;

/** A person and their lead, in `tenant`, at `stage`. */
async function leadOf(tenant, { stage = "nurture", person } = {}) {
  n += 1;
  const address = `office-${n}@by-email-${stamp}.example`;
  const phone = `+1512555${String(1000 + n).slice(-4)}`;
  const contact =
    person ??
    (await one(
      db
        .from("contacts")
        .insert({ tenant_id: tenant, email: address, phone_e164: phone, display_name: `Fixture ${n}` }),
    ));
  const lead = await one(
    db.from("leads").insert({
      tenant_id: tenant,
      place_id: `ChIJfixtureByEmail${stamp}${n}`,
      business_name: `Fixture Movers ${n}`,
      city: "Austin",
      region: "TX",
      email: address,
      email_state: "ok",
      stage,
      contact_id: contact,
      website_host: `by-email-${stamp}.example`,
    }),
  );
  return { address, phone, person: contact, lead };
}

/** A lead the reach-out's first step wrote to two days ago. */
async function wroteTo() {
  const ro = await leadOf(A);
  const search = await one(
    db
      .from("lead_searches")
      .insert({ tenant_id: A, via: "people", card: "movers", name: "Movers", asked: "movers", plan: {} }),
  );
  const root = await one(
    db.from("sequence_steps").insert({
      tenant_id: A,
      kind: "reach_out",
      policy_class: "outreach",
      gap_minutes: 5,
      template_id: template,
      template_name: `reach_by_email_${stamp}`,
      template_language: "en",
      params: [],
      name: "Movers",
      trigger: "lead_first",
      lead_search_id: search,
      state: "running",
      signed_by: "Sam",
    }),
  );
  const run = await one(
    db.from("sequence_batches").insert({
      tenant_id: A,
      name: "Movers · sent",
      template_id: template,
      template_name: `reach_by_email_${stamp}`,
      template_language: "en",
      audience: { kind: "reach_out", root_id: root, step_id: root },
      state: "sent",
      scheduled_for: iso(Date.now() - 2 * DAY),
      step_id: root,
      run_for: new Date(Date.now() - (n + 2) * DAY).toISOString().slice(0, 10),
    }),
  );
  ok(
    await db.from("sequence_sends").insert({
      id: crypto.randomUUID(),
      tenant_id: A,
      batch_id: run,
      step_id: root,
      sequence_id: root,
      lead_id: ro.lead,
      contact_id: ro.person,
      state: "sent",
      send_at: iso(Date.now() - 2 * DAY),
      sent_at: iso(Date.now() - 2 * DAY),
    }),
  );
  return ro;
}
const stageOf = async (lead) => ok(await db.from("leads").select("stage").eq("id", lead).single()).stage;
const converted = async (lead) =>
  ok(await db.from("events").select("data").eq("subject_id", lead).eq("kind", "lead.converted")).map((e) => e.data);

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await one(
    db.from("tenants").insert({ slug: `by-email-a-${stamp}`, name: "Harbor Moving Co", timezone: "America/Chicago" }),
  );
  B = await one(
    db.from("tenants").insert({ slug: `by-email-b-${stamp}`, name: "Other Moving Co", timezone: "America/Chicago" }),
  );
  template = await one(
    db.from("templates").insert({
      tenant_id: A,
      channel: "email",
      source: "chanlytics",
      name: `reach_by_email_${stamp}`,
      language: "en",
      category: "marketing",
      meta_status: "approved",
      components: [
        { type: "HEADER", format: "TEXT", text: "A quick question" },
        { type: "BODY", text: "Hi {{business}}, a quick question." },
      ],
    }),
  );
});
after(async () => {
  if (skip) return;
  for (const t of [A, B]) {
    await db.from("events").delete().eq("tenant_id", t);
    await db.from("tenants").delete().eq("id", t);
  }
});

/** An appointment on the record, as a booking tool's notice keeps it (source booking_email, 00345). */
async function appointment(over = {}) {
  n += 1;
  const start = Date.now() + 3 * DAY;
  return one(
    db.from("appointments").insert({
      tenant_id: A,
      source: "booking_email",
      tool: "booksy",
      external_id: `booksy-${stamp}-${n}`,
      starts_at: iso(start),
      ends_at: iso(start + 3_600_000),
      timezone: "America/Chicago",
      ...over,
    }),
  );
}
const changesOf = async (id) =>
  ok(
    await db
      .from("events")
      .select("kind, subject_type, data")
      .eq("tenant_id", A)
      .eq("kind", "appointment.changed")
      .eq("subject_id", id)
      .order("created_at"),
  );
/** The event as the delivery hands it to a subscriber (db eventOfDelivery). */
const eventOf = async (id) =>
  ok(
    await db
      .from("events")
      .select(
        "id, tenant_id, kind, subject_type, subject_id, data, created_at, version, aggregate_version, causation_id",
      )
      .eq("tenant_id", A)
      .eq("kind", "appointment.changed")
      .eq("subject_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single(),
  );
let SUBSCRIBERS;
let ports;
before(async () => {
  if (skip) return;
  ({ SUBSCRIBERS } = await import(pathToFileURL(path.join(ROOT, "packages/core/src/subscribers.ts")).href));
  const { reachOutBookedFrom } = await import(
    pathToFileURL(path.join(ROOT, "packages/db/src/repositories/calendar/appointments.ts")).href
  );
  ports = { bookedFromAppointment: (t, id) => reachOutBookedFrom(db, t, id) };
});

test(
  "a booking by email writes its change with it, the relay owes the subscriber its delivery, and the subscriber books the lead once",
  { skip },
  async () => {
    const ro = await wroteTo();
    const id = await appointment({ client_email: ro.address, client_name: "Fixture" });
    const [change] = await changesOf(id);
    assert.deepEqual(
      [change.kind, change.subject_type, change.data.change, change.data.source],
      ["appointment.changed", "appointment", "added", "booking_email"],
    );
    // Owed to the subscriber: on the outbox, or already relayed to a delivery of its own (a tick may have run).
    const ev = await eventOf(id);
    const outbox = ok(await db.from("event_outbox").select("event_id").eq("event_id", ev.id));
    const delivered = ok(
      await db.from("event_deliveries").select("subscriber").eq("event_id", ev.id).eq("subscriber", "reach_out_booked"),
    );
    assert.equal(outbox.length + delivered.length, 1, "the event waits for the relay, or is the subscriber's");

    await SUBSCRIBERS.reach_out_booked(ev, ports);
    assert.equal(
      await stageOf(ro.lead),
      "converted",
      "the reach-out's lead is booked, and its next email never written",
    );
    assert.equal((await converted(ro.lead)).length, 1);
    await SUBSCRIBERS.reach_out_booked(ev, ports);
    assert.equal((await converted(ro.lead)).length, 1, "a second run moves nothing");
  },
);

test("a cancelled booking books nobody; a move is a change of its own; a quiet write is none", { skip }, async () => {
  const ro = await wroteTo();
  const gone = await appointment({ client_email: ro.address, status: "cancelled" });
  assert.deepEqual(
    (await changesOf(gone)).map((c) => c.data.change),
    ["cancelled"],
  );
  await SUBSCRIBERS.reach_out_booked(await eventOf(gone), ports);
  assert.equal(await stageOf(ro.lead), "nurture", "a cancelled booking books nobody");

  const other = await wroteTo();
  const id = await appointment({ client_phone: other.phone });
  ok(await db.from("appointments").update({ service: "Packing" }).eq("id", id));
  assert.deepEqual(
    (await changesOf(id)).map((c) => c.data.change),
    ["added"],
    "a write that moves nothing is no change",
  );
  const later = Date.now() + 5 * DAY;
  ok(
    await db
      .from("appointments")
      .update({ starts_at: iso(later), ends_at: iso(later + 3_600_000) })
      .eq("id", id),
  );
  ok(await db.from("appointments").update({ status: "cancelled" }).eq("id", id));
  assert.deepEqual(
    (await changesOf(id)).map((c) => c.data.change),
    ["added", "moved", "cancelled"],
  );
  // The last change is a cancel: the subscriber books nobody on it, though the lead's number is on the row.
  await SUBSCRIBERS.reach_out_booked(await eventOf(id), ports);
  assert.equal(await stageOf(other.lead), "nurture");
});

test(
  "a proposed booking books nobody until it is confirmed; an appointment of a person books by the person's address",
  { skip },
  async () => {
    const ro = await wroteTo();
    const id = await appointment({ client_phone: ro.phone, status: "proposed" });
    await SUBSCRIBERS.reach_out_booked(await eventOf(id), ports);
    assert.equal(await stageOf(ro.lead), "nurture", "a proposed time is not a booking");
    ok(await db.from("appointments").update({ status: "booked" }).eq("id", id));
    assert.deepEqual(
      (await changesOf(id)).map((c) => c.data.change),
      ["added", "confirmed"],
    );
    await SUBSCRIBERS.reach_out_booked(await eventOf(id), ports);
    assert.equal(await stageOf(ro.lead), "converted", "confirmed, it books, by its client's number");

    const other = await wroteTo();
    const theirs = await appointment({ contact_id: other.person });
    await SUBSCRIBERS.reach_out_booked(await eventOf(theirs), ports);
    assert.equal(await stageOf(other.lead), "converted", "no client address of its own: its person's");
  },
);

test("the feed's rows are left to the feed's door, and the business's own address books nobody", { skip }, async () => {
  const feed = await appointment({ source: "calendar_feed", tool: null });
  assert.deepEqual(await changesOf(feed), [], "the feed's door writes the feed's changes (00348), never this trigger");

  const owner = await db.auth.admin.createUser({
    email: `owner-${stamp}@by-email-${stamp}.example`,
    password: `pw-${stamp}-Aa1!`,
    email_confirm: true,
  });
  assert.equal(owner.error, null, owner.error?.message);
  try {
    ok(await db.from("memberships").insert({ tenant_id: A, user_id: owner.data.user.id, role: "owner" }));
    const ro = await wroteTo();
    // The lead's own address is the owner's here: an appointment the owner is on books no lead of theirs.
    ok(await db.from("leads").update({ email: owner.data.user.email }).eq("id", ro.lead));
    const id = await appointment({ client_email: owner.data.user.email });
    assert.equal(ok(await db.rpc("reach_out_booked_from", { p_tenant_id: A, p_appointment_id: id })), 0);
    assert.equal(await stageOf(ro.lead), "nurture");
  } finally {
    await db.auth.admin.deleteUser(owner.data.user.id);
  }
});

test("an address the business is alerted at books nobody", { skip }, async () => {
  const ro = await wroteTo();
  const kept = ok(await db.from("tenant_config").select("config").eq("tenant_id", A).maybeSingle());
  const config = kept?.config ?? {};
  ok(
    await db.from("tenant_config").upsert({
      tenant_id: A,
      config: {
        ...config,
        notifications: { ...config.notifications, escalation_emails: [` ${ro.address.toUpperCase()} `] },
      },
    }),
  );
  try {
    const id = await appointment({ client_email: ro.address });
    assert.equal(ok(await db.rpc("reach_out_booked_from", { p_tenant_id: A, p_appointment_id: id })), 0);
    assert.equal(await stageOf(ro.lead), "nurture", "the business's alert address is its own, written in any case");
  } finally {
    ok(await db.from("tenant_config").upsert({ tenant_id: A, config }));
  }
});
