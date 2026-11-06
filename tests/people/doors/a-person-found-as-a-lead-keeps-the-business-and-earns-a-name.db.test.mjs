/**
 * A person found as a lead keeps the business and earns a name (decision 0052) -- on a real database.
 *
 * The doors a member presses (Use this name, its Undo and its ×; Works at, linked and unlinked by hand; Got it on a note
 * for them; the name a lead's call reached) and the trigger that tells a person the business a lead names: rows, rights
 * and events that reading source cannot prove, so these run against Postgres in the database workflow; skipped without
 * a local database. The reply's own door (what it links and what it offers) is proved in reach-out-replies.
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
      : !process.env.SUPABASE_ANON_KEY
        ? "no SUPABASE_ANON_KEY in env: the members this suite signs in need it"
        : false;

const RUN = Date.now().toString(36);
const PASSWORD = "a-long-test-password-1";
let serial = 0;
let db;
let tenantId;
let otherTenant;
const users = [];

const ok = (r, what) => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};
const one = async (q, what) => ok(await q.select("id").single(), what).id;
const phone = () => `+1555010${String(++serial).padStart(4, "0")}`;

/** A member of the workspace, signed in as themselves. */
const member = async (role, tag) => {
  const email = `earns-a-name-${tag}-${RUN}@example.test`;
  const { data: made, error } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw new Error(error.message);
  users.push(made.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenantId, user_id: made.user.id, role }), "membership");
  const as = createClient(URL_, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  ok(await as.auth.signInWithPassword({ email, password: PASSWORD }), "sign in");
  return { id: made.user.id, as };
};

const person = (row, t = tenantId) => one(db.from("contacts").insert({ tenant_id: t, ...row }), "person");
/** A business the finder found; one that names a person (leads.contact_id) tells them where they work. */
const business = (name, row = {}, t = tenantId) =>
  one(
    db.from("leads").insert({ tenant_id: t, place_id: `earns-a-name-${++serial}-${RUN}`, business_name: name, ...row }),
    "lead",
  );
const contactRow = async (id) =>
  ok(
    await db
      .from("contacts")
      .select("display_name, name_source, name_settled_at, lead_id, lead_settled_at")
      .eq("id", id)
      .single(),
    "contact",
  );
const replyRow = async (messageId) =>
  ok(
    await db
      .from("sequence_replies")
      .select("signer_name, signer_state, signer_was, signer_settled_at, signer_settled_by")
      .eq("message_id", messageId)
      .single(),
    "reply",
  );
const told = async (subject, kind) =>
  ok(
    await db
      .from("events")
      .select("data")
      .eq("tenant_id", tenantId)
      .eq("subject_id", subject)
      .eq("kind", kind)
      .order("created_at"),
    "events",
  ).map((e) => e.data);

/** A reply its writer sent, read and kept with the name it was signed with, offered (as the reply's door keeps it). */
async function signedReply(writer, signer, { lead = null, leadPerson = writer } = {}) {
  const thread = await one(db.from("conversations").insert({ tenant_id: tenantId, contact_id: writer }), "thread");
  const message = await one(
    db.from("messages").insert({
      tenant_id: tenantId,
      conversation_id: thread,
      contact_id: writer,
      channel: "email",
      direction: "inbound",
      sender: "customer",
      type: "text",
      body: `Yes, send it over.\n\n${signer}`,
      status: "received",
      channel_ts: new Date().toISOString(),
    }),
    "message",
  );
  ok(
    await db.from("sequence_replies").insert({
      message_id: message,
      tenant_id: tenantId,
      conversation_id: thread,
      contact_id: writer,
      lead_id: lead,
      lead_contact_id: leadPerson,
      claim: "person",
      intent: "interested",
      signer_name: signer,
      signer_state: "offered",
    }),
    "reply",
  );
  return message;
}

let maria;
let sam;
let viewer;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  tenantId = await one(db.from("tenants").insert({ slug: `earns-a-name-${RUN}`, name: "Earns a name" }), "tenant");
  otherTenant = await one(db.from("tenants").insert({ slug: `earns-a-name-other-${RUN}`, name: "Other" }), "tenant");
  maria = await member("operator", "maria");
  sam = await member("operator", "sam");
  viewer = await member("viewer", "viewer");
});

after(async () => {
  if (skip) return;
  for (const t of [tenantId, otherTenant]) if (t) await db.from("tenants").delete().eq("id", t);
  for (const id of users) await db.auth.admin.deleteUser(id);
});

test(
  "Use this name: a member takes a reply's signer for its writer, settled, and says where it came from; Undo puts the business's name back; a viewer presses neither",
  { skip },
  async () => {
    // The finder's person, named for the business: a lead that names them tells them they work there.
    const standIn = await person({ display_name: "Harbor Light Movers", name_source: "lead", phone_e164: phone() });
    const lead = await business("Harbor Light Movers", { contact_id: standIn });
    assert.equal((await contactRow(standIn)).lead_id, lead, "the lead told its person where they work");
    const msg = await signedReply(standIn, "Priya Nair", { lead });

    const refused = await viewer.as.rpc("person_name_adopt", { p_contact_id: standIn, p_message_id: msg });
    assert.equal(refused.error?.code, "P0002", "a viewer changes nobody's name");

    const named = ok(await maria.as.rpc("person_name_adopt", { p_contact_id: standIn, p_message_id: msg }), "adopt");
    assert.deepEqual(named, { named: true, contact_id: standIn, name: "Priya Nair" });
    const after1 = await contactRow(standIn);
    assert.deepEqual(
      [after1.display_name, after1.name_source, !!after1.name_settled_at],
      ["Priya Nair", "signature", true],
    );
    const r1 = await replyRow(msg);
    assert.deepEqual([r1.signer_state, r1.signer_was, r1.signer_settled_by], ["adopted", "lead", maria.id]);
    assert.deepEqual(await told(standIn, "contact.named"), [
      { named: true, by: maria.id, source: "signature", was: "lead", via: "press", message_id: msg },
    ]);
    assert.deepEqual(
      ok(await maria.as.rpc("person_name_adopt", { p_contact_id: standIn, p_message_id: msg }), "again"),
      { named: false, why: "settled" },
      "a signer is taken once",
    );

    const undone = ok(await maria.as.rpc("person_name_undo", { p_contact_id: standIn }), "undo");
    assert.deepEqual(undone, { undone: true, contact_id: standIn, name: "Harbor Light Movers" });
    const after2 = await contactRow(standIn);
    assert.deepEqual(
      [after2.display_name, after2.name_source, !!after2.name_settled_at],
      ["Harbor Light Movers", "lead", true],
      "the business's own name, settled, so that sign-off is never taken again",
    );
    assert.equal((await replyRow(msg)).signer_state, "undone");
    assert.equal((await told(standIn, "contact.named")).at(-1).via, "undo");
    assert.deepEqual(ok(await maria.as.rpc("person_name_undo", { p_contact_id: standIn }), "undo again"), {
      undone: false,
      why: "not_a_signer",
    });
  },
);

test(
  "a signature is its writer's: never offered to the lead's person a colleague answered for, never over a name of their own; the × declines it and settles the name",
  { skip },
  async () => {
    const standIn = await person({ display_name: "Northside Print Shop", name_source: "lead", phone_e164: phone() });
    const lead = await business("Northside Print Shop", { contact_id: standIn });
    const colleague = await person({ email: `dana-${RUN}@northside.example` });
    const msg = await signedReply(colleague, "Dana Ortiz", { lead, leadPerson: standIn });
    assert.deepEqual(
      ok(
        await maria.as.rpc("person_name_adopt", { p_contact_id: standIn, p_message_id: msg }),
        "for the lead's person",
      ),
      { named: false, why: "no_signer" },
      "REGRESSION: a colleague's signature renamed the business's own person",
    );
    assert.equal((await contactRow(standIn)).display_name, "Northside Print Shop");

    const declined = ok(await maria.as.rpc("person_name_decline", { p_contact_id: colleague, p_message_id: msg }), "×");
    assert.deepEqual(declined, { declined: true, contact_id: colleague });
    assert.deepEqual(
      [(await replyRow(msg)).signer_state, !!(await contactRow(colleague)).name_settled_at],
      ["declined", true],
      "declined for everyone, and the name settled so nothing takes it by itself",
    );
    assert.deepEqual(
      ok(await maria.as.rpc("person_name_adopt", { p_contact_id: colleague, p_message_id: msg }), "after the ×"),
      { named: false, why: "settled" },
    );

    const leah = await person({ display_name: "Leah Brooks", name_source: "typed", phone_e164: phone() });
    const theirs = await signedReply(leah, "L. Brooks");
    assert.deepEqual(
      ok(await maria.as.rpc("person_name_adopt", { p_contact_id: leah, p_message_id: theirs }), "over a typed name"),
      { named: false, why: "named" },
    );
    assert.equal((await contactRow(leah)).display_name, "Leah Brooks");
  },
);

test(
  "Works at, by hand: a member links a person to a business of the workspace and unlinks them, settled both ways, each told; a later lead never moves them",
  { skip },
  async () => {
    const sam1 = await person({ display_name: "Sam Rivera", name_source: "typed", phone_e164: phone() });
    const lead = await business("Eastgate Tile Works");
    assert.equal(
      (await viewer.as.rpc("person_join_lead", { p_contact_id: sam1, p_lead_id: lead })).error?.code,
      "P0002",
      "a viewer links nobody",
    );
    const elsewhere = await business("Elsewhere Co", {}, otherTenant);
    assert.equal(
      (await maria.as.rpc("person_join_lead", { p_contact_id: sam1, p_lead_id: elsewhere })).error?.code,
      "P0002",
      "a business of another workspace is not one of theirs",
    );

    ok(await maria.as.rpc("person_join_lead", { p_contact_id: sam1, p_lead_id: lead }), "join");
    const joined = await contactRow(sam1);
    assert.deepEqual([joined.lead_id, !!joined.lead_settled_at], [lead, true]);
    assert.deepEqual(await told(sam1, "contact.business_linked"), [{ lead_id: lead, via: "hand", by: maria.id }]);

    ok(await maria.as.rpc("person_leave_lead", { p_contact_id: sam1 }), "leave");
    const left = await contactRow(sam1);
    assert.deepEqual([left.lead_id, !!left.lead_settled_at], [null, true]);
    assert.equal((await told(sam1, "contact.business_unlinked")).length, 1);

    // Settled: a lead that names them later does not link them by itself.
    await business("Later Lead Co", { contact_id: sam1 });
    assert.equal((await contactRow(sam1)).lead_id, null, "REGRESSION: a member's word moved by a lead");
  },
);

test("Got it: the member a note is for marks it read, once, with its event; nobody else may", { skip }, async () => {
  const id = await person({ display_name: "Dee Park", name_source: "typed", phone_e164: phone() });
  const added = ok(
    await maria.as.rpc("person_note_add", { p_contact_id: id, p_body: "Call her back.", p_for_user_id: sam.id }),
    "note",
  );
  const noteId = added.note.id;
  assert.deepEqual(ok(await maria.as.rpc("person_note_seen", { p_note_id: noteId }), "not theirs"), {
    error: "not_yours",
  });
  assert.deepEqual(ok(await viewer.as.rpc("person_note_seen", { p_note_id: noteId }), "a viewer"), {
    error: "not_yours",
  });
  assert.deepEqual(ok(await sam.as.rpc("person_note_seen", { p_note_id: noteId }), "seen"), { seen: noteId });
  assert.deepEqual(ok(await sam.as.rpc("person_note_seen", { p_note_id: noteId }), "again"), { seen: noteId });
  const note = ok(await db.from("person_notes").select("for_seen_at").eq("id", noteId).single(), "note row");
  assert.ok(note.for_seen_at, "kept on the note");
  assert.deepEqual(await told(id, "contact.note_seen"), [{ note_id: noteId, by: sam.id }], "told once, ids only");
});

test(
  "who a lead's call reached: an Interested call's person is named as typed, settled; a call that reached no one named keeps the business's name",
  { skip },
  async () => {
    const call = async (name, spokeWith) => {
      const lead = await business(name, { phone_e164: phone() });
      ok(
        await maria.as.rpc("lead_set_stage", { p_lead_id: lead, p_outcome: "interested", p_spoke_with: spokeWith }),
        "the call",
      );
      const { contact_id: made } = ok(await db.from("leads").select("contact_id").eq("id", lead).single(), "lead");
      assert.ok(made, "the call made their person");
      return made;
    };
    const priya = await call("Westbrook Signs", "  Priya Nair ");
    const named = await contactRow(priya);
    assert.deepEqual([named.display_name, named.name_source, !!named.name_settled_at], ["Priya Nair", "typed", true]);
    assert.deepEqual(
      (await told(priya, "contact.named")).map((e) => [e.source, e.was, e.via]),
      [["typed", "lead", "call"]],
    );
    const nobody = await call("Southgate Frames", "   ");
    const kept = await contactRow(nobody);
    assert.deepEqual([kept.display_name, kept.name_source], ["Southgate Frames", "lead"]);
  },
);
