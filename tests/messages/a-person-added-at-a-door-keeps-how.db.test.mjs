/**
 * 00307 on a real Postgres: a person added at a door keeps the door's word as their first touch (the Reports lenses
 * spec, K3). Every writer of a person who did not write or phone first (the calendar sweep, create_person,
 * import_person, a lead converted) already declares how in the contact.added event it inserts beside them; the trigger
 * reads that event, so none of those writers is restated, and the first value wins as everywhere else. The event is
 * inserted here as each writer inserts it. event-shapes.db.test.mjs runs the real SQL writers over the same trigger.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes people and events"
      : false;

const stamp = Date.now();
let db;
let tenantId;
let seq = 0;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  tenantId = ok(
    await db
      .from("tenants")
      .insert({ slug: `harbor-door-${stamp}`, name: "Harbor Door" })
      .select("id")
      .single(),
  ).id;
});

// events has no foreign key to a workspace, so its rows are deleted before the workspace they name.
after(async () => {
  if (skip) return;
  if (tenantId) {
    await db.from("events").delete().eq("tenant_id", tenantId);
    await db.from("tenants").delete().eq("id", tenantId);
  }
});

const person = async () =>
  ok(
    await db
      .from("contacts")
      .insert({ tenant_id: tenantId, phone_e164: `+1555013${9200 + ++seq}` })
      .select("id")
      .single(),
  ).id;
const added = async (id, data, kind = "contact.added", subjectType = "contact") =>
  ok(
    await db
      .from("events")
      .insert({ tenant_id: tenantId, kind, category: "contact", subject_type: subjectType, subject_id: id, data }),
  );
const touchOf = async (id) => {
  const c = ok(await db.from("contacts").select("acquired_via, acquired_ref").eq("id", id).single());
  return [c.acquired_via, c.acquired_ref];
};

test(
  "the door's word is the person's first touch: calendar, lead (with its lead), import, and manual for any other",
  { skip },
  async () => {
    const lead = "9f2c1b1e-0000-4000-8000-000000000001";
    for (const [data, want] of [
      [{ source: "calendar", title: "Gel refill", uid: "ics-1" }, ["calendar", null]],
      [{ source: "lead", lead_id: lead }, ["lead", lead]],
      [{ source: "lead" }, ["lead", null]],
      [{ source: "import", by: "u1" }, ["import", null]],
      [{ source: "manual", title: null, by: "u1" }, ["manual", null]],
      [{ source: "front_desk" }, ["manual", null]],
      [{ source: "  " }, ["manual", null]],
      [{}, ["manual", null]],
    ]) {
      const id = await person();
      await added(id, data);
      assert.deepEqual(await touchOf(id), want, JSON.stringify(data));
    }
  },
);

test(
  "the first value wins: a second door's event, or a message's stamp already there, changes nothing",
  { skip },
  async () => {
    const id = await person();
    await added(id, { source: "import" });
    await added(id, { source: "calendar" });
    assert.deepEqual(await touchOf(id), ["import", null]);

    const spoke = ok(
      await db.rpc("ingest_inbound", {
        p_tenant_id: tenantId,
        p_channel: "whatsapp",
        p_identity_external_id: "15550139299",
        p_phone_e164: "+15550139299",
        p_wa_profile_name: null,
        p_message_external_id: `door.${stamp}`,
        p_type: "text",
        p_body: "hello",
        p_channel_ts: null,
        p_media: null,
        p_meta: { raw_type: "text" },
        p_opt_out: false,
        p_opt_in: false,
      }),
    );
    await added(spoke.contact_id, { source: "import" });
    assert.deepEqual(await touchOf(spoke.contact_id), ["whatsapp", null], "the message that made them came first");
  },
);

test(
  "an event of another kind, an event about something else, and an event about a person who is not there, stamp nothing and fail nothing",
  { skip },
  async () => {
    const id = await person();
    await added(id, { source: "import" }, "contact.named");
    await added(id, { source: "import" }, "contact.added", "lead");
    assert.deepEqual(await touchOf(id), [null, null]);
    await added("00000000-0000-4000-8000-000000000000", { source: "import" });
  },
);

test(
  "a stamp that cannot be written costs the door's event nothing: the event lands, and the person has no first touch",
  { skip },
  async () => {
    const id = await person();
    // A lead id no ref can hold (contacts_acquired_ref_check: at most 200 characters) makes the stamp raise.
    await added(id, { source: "lead", lead_id: "x".repeat(201) });
    const landed = ok(await db.from("events").select("id").eq("subject_id", id).eq("kind", "contact.added"));
    assert.equal(landed.length, 1, "the event is on record");
    assert.deepEqual(await touchOf(id), [null, null], "and a warning in the database's log, no stamp");
  },
);
