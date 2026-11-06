/**
 * A person is added by their number or their address, on a real database (00393, Add people's one person).
 *
 * add_person is the member's door to a person typed by hand when an address is part of it: a number, an address or
 * both, through resolve_person (decision 0034). An address alone makes a person; the same address again is that person,
 * not a second; a number and an address are both kept; neither, or an address that is not one, is refused with the
 * door's words; the added event says the person came by hand. A definer door whose body does not parse until it runs:
 * what reading source cannot prove. Runs against Postgres in the database workflow; skipped without a local database.
 * The door needs a signed-in member, so a user is made and signs in, as create-person-refuses-the-forgotten does.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

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
    .insert({ slug: `add-person-${Date.now()}`, name: "Add person" })
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
  as.rpc("add_person", {
    p_tenant_id: tenantId,
    p_phone_e164: "",
    p_email: "",
    p_display_name: "",
    p_source: "manual",
    ...args,
  });
const person = async (id) =>
  (await db.from("contacts").select("id, phone_e164, email, display_name").eq("id", id).single()).data;

test("an address alone adds a person, and the same address again is that person, not a second", { skip }, async () => {
  const first = await door({ p_email: "Ana.Ruiz@Example.com", p_display_name: "Ana Ruiz" });
  assert.equal(first.error, null, first.error?.message);
  assert.equal(first.data.existed, false);
  const ana = await person(first.data.contact_id);
  assert.equal(ana.email, "ana.ruiz@example.com", "kept as the door keeps an address: lower-cased");
  assert.equal(ana.phone_e164, null, "no number was typed, and none is made up");
  assert.equal(ana.display_name, "Ana Ruiz");

  const again = await door({ p_email: "ana.ruiz@example.com" });
  assert.equal(again.error, null, again.error?.message);
  assert.equal(again.data.existed, true);
  assert.equal(again.data.contact_id, first.data.contact_id, "found by the address: one person");

  const added = await db
    .from("events")
    .select("data")
    .eq("tenant_id", tenantId)
    .eq("kind", "contact.added")
    .eq("subject_id", first.data.contact_id);
  assert.equal(added.data?.length, 1, "one added event, for the one person");
  assert.equal(added.data[0].data.source, "manual", "the person came by hand");
});

test("a number and an address are both kept on the one person", { skip }, async () => {
  const r = await door({ p_phone_e164: "+16465550142", p_email: "sam@example.com", p_display_name: "Sam" });
  assert.equal(r.error, null, r.error?.message);
  const sam = await person(r.data.contact_id);
  assert.equal(sam.phone_e164, "+16465550142");
  assert.equal(sam.email, "sam@example.com");
});

test(
  "neither a number nor an address, or an address that is not one, is refused with the door's words",
  { skip },
  async () => {
    const neither = await door({ p_display_name: "Nobody" });
    assert.equal(neither.error?.code, "22023");
    assert.match(neither.error?.message ?? "", /A number or an address is needed/);
    const bad = await door({ p_email: "not an address" });
    assert.equal(bad.error?.code, "22023");
    assert.match(bad.error?.message ?? "", /not an email address/);
    const shortNumber = await door({ p_phone_e164: "646555" });
    assert.equal(shortNumber.error?.code, "22023");
  },
);
