/**
 * A note is a record (0007, 00157) -- on a real database.
 *
 * A table, its CHECKs, five definer doors, a trigger on erasure and the old
 * door restated: what reading source cannot prove, so these run against
 * Postgres in the database workflow; skipped without a local database.
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
      ? "refusing a database that is not on this machine: this suite writes customers"
      : false;

let db;
let tenantId;
const users = [];
const PASSWORD = "a-long-test-password-1";

const person = async (row) => {
  const { data, error } = await db
    .from("contacts")
    .insert({ tenant_id: tenantId, ...row })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
};

/** A member of the workspace, signed in as themselves. */
const member = async (role, tag) => {
  const email = `person-notes-${tag}-${Date.now()}@example.test`;
  const { data: made, error } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw new Error(error.message);
  users.push(made.user.id);
  const { error: mErr } = await db.from("memberships").insert({ tenant_id: tenantId, user_id: made.user.id, role });
  if (mErr) throw new Error(mErr.message);
  const as = createClient(URL_, process.env.SUPABASE_ANON_KEY ?? KEY, { auth: { persistSession: false } });
  const { error: sErr } = await as.auth.signInWithPassword({ email, password: PASSWORD });
  if (sErr) throw new Error(sErr.message);
  return { id: made.user.id, as };
};

let owner;
let maria;
let sam;
let viewer;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const { data, error } = await db
    .from("tenants")
    .insert({ slug: `person-notes-${Date.now()}`, name: "Person notes" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  tenantId = data.id;
  owner = await member("owner", "owner");
  maria = await member("operator", "maria");
  sam = await member("operator", "sam");
  viewer = await member("viewer", "viewer");
});

after(async () => {
  if (skip || !tenantId) return;
  await db.from("tenants").delete().eq("id", tenantId);
  for (const id of users) await db.auth.admin.deleteUser(id);
});

test(
  "a member writes a note: trimmed, dated, theirs, for one teammate, team only; the event holds no words",
  { skip },
  async () => {
    const id = await person({ display_name: "Dee", phone_e164: "+15550100301" });
    const { data, error } = await maria.as.rpc("person_note_add", {
      p_contact_id: id,
      p_body: "  Prefers Saturdays.  ",
      p_for_user_id: sam.id,
      p_team_only: true,
    });
    assert.equal(error, null, error?.message);
    const n = data.note;
    assert.equal(n.body, "Prefers Saturdays.");
    assert.equal(n.author_kind, "member");
    assert.equal(n.author_user_id, maria.id);
    assert.equal(n.for_user_id, sam.id);
    assert.equal(n.team_only, true);
    assert.equal(n.state, "kept");
    assert.equal(n.source, "page");

    const { data: ev } = await db
      .from("events")
      .select("kind, data")
      .eq("tenant_id", tenantId)
      .eq("subject_id", id)
      .eq("kind", "contact.noted");
    assert.equal(ev.length, 1);
    assert.ok(!JSON.stringify(ev[0].data).includes("Saturdays"), "the event holds no words");

    const refusals = [
      [{ p_body: "   " }, "empty"],
      [{ p_body: "x".repeat(601) }, "too_long"],
      [{ p_body: "Hi", p_for_user_id: "00000000-0000-4000-8000-000000000000" }, "not_a_member"],
      [{ p_body: "Hi", p_source: "call" }, "bad_source"],
    ];
    for (const [args, want] of refusals) {
      const { data: r } = await maria.as.rpc("person_note_add", { p_contact_id: id, ...args });
      assert.equal(r.error, want, JSON.stringify(args));
    }
    const { data: v } = await viewer.as.rpc("person_note_add", { p_contact_id: id, p_body: "Hi" });
    assert.equal(v.error, "not_found", "a viewer writes nothing");
    const { data: seen } = await viewer.as.from("person_notes").select("body").eq("contact_id", id);
    assert.deepEqual(
      seen.map((r) => r.body),
      ["Prefers Saturdays."],
      "a viewer reads the notes",
    );
  },
);

test(
  "its author changes a note, with the version they saw; nobody else does; an owner or its author takes it away",
  { skip },
  async () => {
    const id = await person({ phone_e164: "+15550100311" });
    const { data: a } = await maria.as.rpc("person_note_add", { p_contact_id: id, p_body: "Allergic to ammonia." });
    const note = a.note;

    const { data: other } = await sam.as.rpc("person_note_edit", { p_note_id: note.id, p_body: "No.", p_version: 1 });
    assert.equal(other.error, "not_yours");

    const { data: ok, error } = await maria.as.rpc("person_note_edit", {
      p_note_id: note.id,
      p_body: "Allergic to ammonia -- use the gentle line.",
      p_for_user_id: sam.id,
      p_team_only: false,
      p_version: 1,
    });
    assert.equal(error, null, error?.message);
    assert.equal(ok.note.version, 2);
    assert.equal(ok.note.for_user_id, sam.id);

    const { data: stale } = await maria.as.rpc("person_note_edit", {
      p_note_id: note.id,
      p_body: "Stale",
      p_version: 1,
    });
    assert.equal(stale.error, "moved");

    const { data: notHers } = await sam.as.rpc("person_note_remove", { p_note_id: note.id });
    assert.equal(notHers.error, "not_yours", "an operator takes away only their own");
    const { data: gone } = await owner.as.rpc("person_note_remove", { p_note_id: note.id });
    assert.equal(gone.removed, note.id, "an owner takes away any note");
    const { count } = await db.from("person_notes").select("id", { count: "exact", head: true }).eq("id", note.id);
    assert.equal(count, 0, "the words are gone");
  },
);

test(
  "the receptionist suggests: service role only, once per source, three waiting at most; kept it is read, dismissed it is gone",
  { skip },
  async () => {
    const id = await person({ phone_e164: "+15550100321" });
    const call = "11111111-1111-4111-8111-111111111111";
    const { data: asMember } = await maria.as.rpc("person_note_suggest", {
      p_tenant_id: tenantId,
      p_contact_id: id,
      p_body: "Prefers mornings.",
      p_source: "call",
      p_source_id: call,
    });
    assert.equal(asMember, null, "a member cannot call the edge's door");

    const { data: s1, error } = await db.rpc("person_note_suggest", {
      p_tenant_id: tenantId,
      p_contact_id: id,
      p_body: "Prefers mornings.",
      p_source: "call",
      p_source_id: call,
    });
    assert.equal(error, null, error?.message);
    assert.equal(s1.note.state, "suggested");
    assert.equal(s1.note.author_kind, "receptionist");
    const { data: again } = await db.rpc("person_note_suggest", {
      p_tenant_id: tenantId,
      p_contact_id: id,
      p_body: "Prefers mornings.",
      p_source: "call",
      p_source_id: call,
    });
    assert.equal(again.error, "already", "once per call");
    for (const n of [2, 3]) {
      const { data } = await db.rpc("person_note_suggest", {
        p_tenant_id: tenantId,
        p_contact_id: id,
        p_body: `Fact ${n}.`,
        p_source: "thread",
      });
      assert.ok(data.note);
    }
    const { data: full } = await db.rpc("person_note_suggest", {
      p_tenant_id: tenantId,
      p_contact_id: id,
      p_body: "Fact 4.",
      p_source: "thread",
    });
    assert.equal(full.error, "too_many");

    const { data: noEdit } = await maria.as.rpc("person_note_edit", { p_note_id: s1.note.id, p_body: "Mine now" });
    assert.equal(noEdit.error, "not_yours", "a suggestion is changed as it is kept, not edited");

    const { data: kept } = await maria.as.rpc("person_note_decide", {
      p_note_id: s1.note.id,
      p_keep: true,
      p_body: "Prefers early mornings.",
    });
    assert.equal(kept.note.state, "kept");
    assert.equal(kept.note.kept_by, maria.id);
    assert.equal(kept.note.body, "Prefers early mornings.");
    const { data: twice } = await sam.as.rpc("person_note_decide", { p_note_id: s1.note.id, p_keep: false });
    assert.equal(twice.error, "decided");

    const { data: waiting } = await db.from("person_notes").select("id").eq("contact_id", id).eq("state", "suggested");
    const { data: dismissed } = await sam.as.rpc("person_note_decide", { p_note_id: waiting[0].id, p_keep: false });
    assert.equal(dismissed.removed, waiting[0].id);
    const { count } = await db
      .from("person_notes")
      .select("id", { count: "exact", head: true })
      .eq("id", waiting[0].id);
    assert.equal(count, 0, "a dismissed suggestion keeps no words");
  },
);

test("the old door still writes the field and adds a row when the words are new", { skip }, async () => {
  const id = await person({ phone_e164: "+15550100331" });
  const { error } = await maria.as.rpc("set_person_notes", { p_contact_id: id, p_notes: "Old page: likes tea." });
  assert.equal(error, null, error?.message);
  await maria.as.rpc("set_person_notes", { p_contact_id: id, p_notes: "Old page: likes tea." });
  const { data: c } = await db.from("contacts").select("notes").eq("id", id).single();
  assert.equal(c.notes, "Old page: likes tea.");
  const { data: rows } = await db.from("person_notes").select("body, author_user_id").eq("contact_id", id);
  assert.deepEqual(rows, [{ body: "Old page: likes tea.", author_user_id: maria.id }], "one row, not one per save");
});

test("an erasure takes every note and the old field", { skip }, async () => {
  const id = await person({ phone_e164: "+15550100341", notes: "Lives on Elm St." });
  await maria.as.rpc("person_note_add", { p_contact_id: id, p_body: "Has two kids." });
  await db.rpc("person_note_suggest", {
    p_tenant_id: tenantId,
    p_contact_id: id,
    p_body: "Likes red.",
    p_source: "thread",
  });
  const { error } = await db.from("contacts").update({ erased_at: new Date().toISOString() }).eq("id", id);
  assert.equal(error, null, error?.message);
  const { count } = await db.from("person_notes").select("id", { count: "exact", head: true }).eq("contact_id", id);
  assert.equal(count, 0);
  const { data: c } = await db.from("contacts").select("notes").eq("id", id).single();
  assert.equal(c.notes, null, "00054's field was left on the erased row; it is not any more");
  const { data: r } = await maria.as.rpc("person_note_add", { p_contact_id: id, p_body: "After" });
  assert.equal(r.error, "not_found", "nothing is written on an erased person");
});

test("a member of another workspace reads none of these notes", { skip }, async () => {
  const id = await person({ phone_e164: "+15550100351" });
  await maria.as.rpc("person_note_add", { p_contact_id: id, p_body: "Private." });
  const { data: t2 } = await db
    .from("tenants")
    .insert({ slug: `person-notes-other-${Date.now()}`, name: "Other" })
    .select("id")
    .single();
  const email = `person-notes-stranger-${Date.now()}@example.test`;
  const { data: made } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  users.push(made.user.id);
  try {
    await db.from("memberships").insert({ tenant_id: t2.id, user_id: made.user.id, role: "owner" });
    const as = createClient(URL_, process.env.SUPABASE_ANON_KEY ?? KEY, { auth: { persistSession: false } });
    await as.auth.signInWithPassword({ email, password: PASSWORD });
    const { data } = await as.from("person_notes").select("id").eq("contact_id", id);
    assert.deepEqual(data, []);
    const { data: w } = await as.rpc("person_note_add", { p_contact_id: id, p_body: "Hi" });
    assert.equal(w.error, "not_found");
  } finally {
    await db.from("tenants").delete().eq("id", t2.id);
  }
});
