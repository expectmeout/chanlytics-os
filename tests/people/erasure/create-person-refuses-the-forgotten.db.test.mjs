/**
 * A person who asked to be forgotten is not added by hand, on a real database (00331, decision 0034 step 0).
 *
 * create_person is the door POST contacts and the calendar board call. It looked for a living row by number and
 * made one when none was there, and never asked whether the number had been erased, so an owner opening the Calendar
 * brought back, from their own appointment, a person who had asked to be forgotten. Now the door makes the digest
 * itself (00263) and refuses with import_person's words and code, PE001, which the board skips as one person refused.
 * A definer door whose body does not parse until it runs: what reading source cannot prove. Runs against Postgres in
 * the database workflow; skipped without a local database. The door needs a signed-in member, so a user is made and
 * signs in, as import-person.db.test.mjs does.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { legacyErasedPhoneHash } from "@chanlytics/contracts";

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
    .insert({ slug: `forgotten-${Date.now()}`, name: "Forgotten" })
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
  as.rpc("create_person", { p_tenant_id: tenantId, p_display_name: "", p_source: "manual", ...args });

test(
  "a number whose person asked to be forgotten is refused with the door's own code, by hand and from the board",
  { skip },
  async () => {
    const phone = "+16465550131";
    const gone = await db
      .from("contacts")
      .insert({
        tenant_id: tenantId,
        phone_e164: null,
        erased_at: new Date().toISOString(),
        erased_phone_hash: await legacyErasedPhoneHash(tenantId, phone),
      })
      .select("id")
      .single();
    assert.equal(gone.error, null, gone.error?.message);

    const byHand = await door({ p_phone_e164: phone, p_display_name: "Gone" });
    // A code of its own: 42501 is Postgres's "permission denied" too, and a lost grant must not read as a forgotten line.
    assert.equal(byHand.error?.code, "PE001");
    assert.match(byHand.error?.message ?? "", /forgotten/);
    const fromTheBoard = await door({ p_phone_e164: phone, p_source: "calendar", p_title: "Trim" });
    assert.equal(fromTheBoard.error?.code, "PE001");

    const living = await db.from("contacts").select("id").eq("tenant_id", tenantId).is("erased_at", null);
    assert.deepEqual(living.data, [], "nothing was made: the erased row is the only one");
    const added = await db.from("events").select("id").eq("tenant_id", tenantId).eq("kind", "contact.added");
    assert.deepEqual(added.data, [], "and no event says anyone was added");
  },
);

test(
  "every other number is made or found as before: once, with its event, and a name fills only an empty one",
  { skip },
  async () => {
    const phone = "+16465550132";
    const first = await door({ p_phone_e164: phone });
    assert.equal(first.error, null, first.error?.message);
    assert.equal(first.data.existed, false);
    const again = await door({ p_phone_e164: phone, p_display_name: "Dee Alvarez" });
    assert.equal(again.error, null, again.error?.message);
    assert.deepEqual([again.data.contact_id, again.data.existed], [first.data.contact_id, true]);
    const row = await db.from("contacts").select("display_name").eq("id", first.data.contact_id).single();
    assert.equal(row.data.display_name, "Dee Alvarez", "the empty name was filled");
    const added = await db.from("events").select("subject_id").eq("tenant_id", tenantId).eq("kind", "contact.added");
    assert.deepEqual(
      added.data.map((e) => e.subject_id),
      [first.data.contact_id],
      "one event, for the one person made",
    );
  },
);
