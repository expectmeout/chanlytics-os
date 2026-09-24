/**
 * A spreadsheet's line becomes a person, or fills one, on a real database.
 *
 * 00170 is a definer door whose body plpgsql does not parse until it runs, a widened decisions CHECK, and a recreated
 * people_list: what reading source cannot prove. Runs against Postgres in the database workflow; skipped without a
 * local database. The door needs a signed-in member, so a user is made and signs in, as person-email.db.test.mjs does.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { erasedPhoneHash } from "@chanlytics/contracts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY || !ANON
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes customers"
      : false;

let db;
let as;
let tenantId;
let userId;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const t = await db
    .from("tenants")
    .insert({ slug: `import-${Date.now()}`, name: "Import" })
    .select("id")
    .single();
  if (t.error) throw new Error(t.error.message);
  tenantId = t.data.id;
  const email = `owner-${Date.now()}@example.com`;
  const made = await db.auth.admin.createUser({ email, password: "a-long-test-password-1", email_confirm: true });
  if (made.error) throw new Error(made.error.message);
  userId = made.data.user.id;
  const m = await db.from("memberships").insert({ tenant_id: tenantId, user_id: userId, role: "owner" });
  if (m.error) throw new Error(m.error.message);
  as = createClient(URL_, ANON, { auth: { persistSession: false } });
  const s = await as.auth.signInWithPassword({ email, password: "a-long-test-password-1" });
  if (s.error) throw new Error(s.error.message);
});

after(async () => {
  if (skip || !tenantId) return;
  // events has no foreign key to tenants (it is partitioned), so the tenant's rows go first or they outlive it.
  await db.from("events").delete().eq("tenant_id", tenantId);
  await db.from("tenants").delete().eq("id", tenantId);
  if (userId) await db.auth.admin.deleteUser(userId);
});

const door = (args) =>
  as.rpc("import_person", { p_tenant_id: tenantId, p_name: null, p_phone_e164: null, p_email: null, ...args });

test("a new line makes a person once, by number then by address, filling only what is empty", { skip }, async () => {
  const a = await door({ p_name: "Ana Ruiz", p_phone_e164: "+16465550101", p_email: "ana@example.com" });
  assert.equal(a.error, null, a.error?.message);
  assert.equal(a.data.existed, false);
  assert.equal(a.data.email, "set");
  // The same number again, with a different spelling of the name: the person, unchanged.
  const again = await door({ p_name: "Ana R.", p_phone_e164: "+16465550101" });
  assert.equal(again.data.contact_id, a.data.contact_id);
  assert.equal(again.data.existed, true);
  const { data: row } = await db
    .from("contacts")
    .select("display_name, email, phone_e164")
    .eq("id", a.data.contact_id)
    .single();
  assert.deepEqual(row, { display_name: "Ana Ruiz", email: "ana@example.com", phone_e164: "+16465550101" });
  // An address alone that is Ana's finds Ana.
  const byMail = await door({ p_email: "ANA@example.com" });
  assert.equal(byMail.data.contact_id, a.data.contact_id, "found by the stored spelling of the address");
  assert.equal(byMail.data.email, "kept", "the address is hers already");
  // A person made from an address alone, then given their number by a later line.
  const eli = await door({ p_name: "Eli", p_email: "eli@example.com" });
  assert.equal(eli.data.existed, false);
  const eliNumbered = await door({ p_email: "eli@example.com", p_phone_e164: "+16465550103" });
  assert.equal(eliNumbered.data.contact_id, eli.data.contact_id);
  const { data: eliRow } = await db.from("contacts").select("phone_e164").eq("id", eli.data.contact_id).single();
  assert.equal(eliRow.phone_e164, "+16465550103", "an empty number is filled");
  // The event says where they came from, never the address.
  const { data: ev } = await db
    .from("events")
    .select("data")
    .eq("subject_id", a.data.contact_id)
    .eq("kind", "contact.added")
    .single();
  assert.equal(ev.data.source, "import");
  assert.equal(JSON.stringify(ev.data).includes("example.com"), false);
});

test(
  "an address another person here holds is not moved: the line's person keeps none, and the door says taken",
  { skip },
  async () => {
    await door({ p_name: "Dee", p_phone_e164: "+16465550104", p_email: "dee@example.com" });
    const fay = await door({ p_name: "Fay", p_phone_e164: "+16465550105", p_email: "dee@example.com" });
    assert.equal(fay.error, null, fay.error?.message);
    assert.equal(fay.data.existed, false);
    assert.equal(fay.data.email, "taken");
    const { data } = await db.from("contacts").select("email").eq("id", fay.data.contact_id).single();
    assert.equal(data.email, null);
  },
);

test(
  "a line with neither a number nor an address, or a malformed one, is refused as that row (22023)",
  { skip },
  async () => {
    const none = await door({ p_name: "Nobody" });
    assert.equal(none.error?.code, "22023");
    const bad = await door({ p_phone_e164: "555-0101" });
    assert.equal(bad.error?.code, "22023");
    const shapeless = await door({ p_email: "dee.example.com" });
    assert.equal(shapeless.error?.code, "22023");
  },
);

test("a person who asked to be forgotten is not brought back by a spreadsheet", { skip }, async () => {
  const phone = "+16465550106";
  const gone = await db
    .from("contacts")
    .insert({
      tenant_id: tenantId,
      phone_e164: null,
      erased_at: new Date().toISOString(),
      erased_phone_hash: await erasedPhoneHash(tenantId, phone),
    })
    .select("id")
    .single();
  assert.equal(gone.error, null, gone.error?.message);
  const r = await door({ p_name: "Gone", p_phone_e164: phone, p_phone_digest: await erasedPhoneHash(tenantId, phone) });
  // A code of its own: 42501 is Postgres's "permission denied" too, and a lost grant must not read as a forgotten line.
  assert.equal(r.error?.code, "PE001");
  assert.match(r.error?.message ?? "", /forgotten/);
});

test(
  "a person found without an address is given the line's: set, as it is stored, and the event names none",
  { skip },
  async () => {
    const hal = await door({ p_name: "Hal", p_phone_e164: "+16465550108" });
    assert.equal(hal.data.email, null, "a line with no address says nothing of one");
    const r = await door({ p_phone_e164: "+16465550108", p_email: " Hal@Example.com " });
    assert.equal(r.error, null, r.error?.message);
    assert.equal(r.data.contact_id, hal.data.contact_id);
    assert.equal(r.data.existed, true);
    assert.equal(r.data.email, "set");
    const { data: row } = await db.from("contacts").select("email").eq("id", hal.data.contact_id).single();
    assert.equal(row.email, "hal@example.com", "trimmed and lower-cased, as every address is stored");
    const { data: events } = await db
      .from("events")
      .select("data")
      .eq("tenant_id", tenantId)
      .eq("subject_id", hal.data.contact_id)
      .eq("kind", "contact.email_set");
    assert.equal(events.length, 1, "set through set_person_email, which records that it changed");
    assert.equal(events[0].data.set, true);
    assert.equal(
      JSON.stringify(events[0].data).includes("@"),
      false,
      "an event outlives an erasure, so it names no address",
    );
  },
);

test(
  "a person found without an address, given one another person here holds, keeps none: taken",
  { skip },
  async () => {
    // Dee holds the address, whether or not the test above already made her.
    await door({ p_name: "Dee", p_phone_e164: "+16465550104", p_email: "dee@example.com" });
    const jo = await door({ p_name: "Jo", p_phone_e164: "+16465550109" });
    const r = await door({ p_phone_e164: "+16465550109", p_email: "dee@example.com" });
    assert.equal(r.error, null, r.error?.message);
    assert.equal(r.data.contact_id, jo.data.contact_id);
    assert.equal(r.data.existed, true);
    assert.equal(r.data.email, "taken");
    const { data: rows } = await db
      .from("contacts")
      .select("display_name, email")
      .eq("tenant_id", tenantId)
      .in("display_name", ["Dee", "Jo"])
      .order("display_name");
    assert.deepEqual(
      rows,
      [
        { display_name: "Dee", email: "dee@example.com" },
        { display_name: "Jo", email: null },
      ],
      "the address stays Dee's",
    );
  },
);

test("a nameless person found by number gets the line's name, and a named one keeps theirs", { skip }, async () => {
  const nameless = await door({ p_phone_e164: "+16465550110" });
  const named = await door({ p_phone_e164: "+16465550110", p_name: "  Kim 	 Lee  " });
  assert.equal(named.data.contact_id, nameless.data.contact_id);
  const lou = await door({ p_name: "Lou", p_phone_e164: "+16465550111" });
  const again = await door({ p_name: "Louis", p_phone_e164: "+16465550111" });
  assert.equal(again.data.contact_id, lou.data.contact_id);
  const { data: rows } = await db
    .from("contacts")
    .select("phone_e164, display_name")
    .in("id", [nameless.data.contact_id, lou.data.contact_id])
    .order("phone_e164");
  assert.deepEqual(rows, [
    { phone_e164: "+16465550110", display_name: "Kim Lee" },
    { phone_e164: "+16465550111", display_name: "Lou" },
  ]);
});

test(
  "people_list says an imported person came from an import, and the import verb is a decision the ledger takes",
  { skip },
  async () => {
    const r = await door({ p_name: "Gil", p_phone_e164: "+16465550107" });
    const { data: rows, error } = await as.rpc("people_list", {
      p_tenant_id: tenantId,
      p_query: null,
      p_offset: 0,
      p_limit: 50,
    });
    assert.equal(error, null, error?.message);
    assert.equal(rows.find((p) => p.id === r.data.contact_id)?.came_from, "import");
    const d = await db.from("decisions").insert({
      tenant_id: tenantId,
      subject_type: "workspace",
      subject_id: tenantId,
      verb: "import",
      actor_type: "user",
      actor_user_id: userId,
      payload: {},
    });
    assert.equal(d.error, null, d.error?.message);
  },
);
