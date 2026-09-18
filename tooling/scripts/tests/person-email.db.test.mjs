/**
 * A person may have an email -- on a real database.
 *
 * 00125 is a column, a CHECK, a partial unique index, a trigger on erasure, a
 * definer door and a recreated people_list. A constraint, a trigger and a
 * function body are what reading source cannot prove, so these run against
 * Postgres in the database workflow; skipped without a local database.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = !URL_ || !KEY
  ? "no database in env"
  : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
    ? "refusing a database that is not on this machine: this suite writes customers"
    : false;

let db;
let tenantId;
const person = async (row) => {
  const { data, error } = await db.from("contacts").insert({ tenant_id: tenantId, ...row }).select("id").single();
  return { id: data?.id ?? null, error };
};

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const { data, error } = await db.from("tenants").insert({ slug: `person-email-${Date.now()}`, name: "Person email" }).select("id").single();
  if (error) throw new Error(error.message);
  tenantId = data.id;
});

after(async () => {
  if (skip || !tenantId) return;
  await db.from("tenants").delete().eq("id", tenantId);
});

test("the column holds the stored shape only, one address per workspace, and a person may have an address and no number", { skip }, async () => {
  const onlyEmail = await person({ email: "ana@example.com" });
  assert.equal(onlyEmail.error, null, onlyEmail.error?.message);
  for (const bad of ["Ana@Example.com", " ana2@example.com", "ana3@example", "ana4 example.com", "a@b@c.com", "<ana5@example.com>"]) {
    const r = await person({ email: bad });
    assert.match(r.error?.message ?? "", /contacts_email_check/, `refused: ${JSON.stringify(bad)}`);
  }
  const twice = await person({ phone_e164: "+15550100101", email: "ana@example.com" });
  assert.equal(twice.error?.code, "23505", "a second person in the workspace cannot hold the same address");
  const noAddress = [await person({ phone_e164: "+15550100102" }), await person({ phone_e164: "+15550100103" })];
  assert.deepEqual(noAddress.map((r) => r.error), [null, null], "two people without an address are not a conflict");

  const { data: other, error: oErr } = await db.from("tenants").insert({ slug: `person-email-other-${Date.now()}`, name: "Other" }).select("id").single();
  assert.equal(oErr, null);
  try {
    const { error } = await db.from("contacts").insert({ tenant_id: other.id, email: "ana@example.com" });
    assert.equal(error, null, "the same address in another workspace is another person");
  } finally {
    await db.from("tenants").delete().eq("id", other.id);
  }
});

test("people_list returns the address and its search matches it, alone or beside a name", { skip }, async () => {
  await person({ display_name: "Bo Reyes", phone_e164: "+15550100111", email: "bo.reyes@mail.example" });
  await person({ display_name: "Cy Adams", phone_e164: "+15550100112" });
  const list = async (q) => {
    const { data, error } = await db.rpc("people_list", { p_tenant_id: tenantId, ...(q ? { p_query: q } : {}) });
    assert.equal(error, null, error?.message);
    return data;
  };
  const bo = (await list("mail.example"))[0];
  assert.equal(bo?.display_name, "Bo Reyes", "found by a piece of the address");
  assert.equal(bo.email, "bo.reyes@mail.example", "and the row carries it");
  assert.deepEqual((await list("reyes")).map((r) => r.display_name), ["Bo Reyes"], "a name that is also in the address is one row, not two");
  assert.equal((await list("cy"))[0].email, null, "a person without one says so");
});

test("an erased row holds no address: whatever sets erased_at, the trigger clears it", { skip }, async () => {
  const { id } = await person({ phone_e164: "+15550100121", email: "gone@example.com" });
  const { error } = await db.from("contacts").update({ erased_at: new Date().toISOString() }).eq("id", id);
  assert.equal(error, null, error?.message);
  const { data } = await db.from("contacts").select("email, erased_at").eq("id", id).single();
  assert.equal(data.email, null);
  assert.ok(data.erased_at);
  const again = await person({ phone_e164: "+15550100122", email: "gone@example.com" });
  assert.equal(again.error, null, "and the address is free for whoever writes from it next");
});

test("set_person_email: an acting member where the person lives, the stored spelling, a taken address refused in the owner's words, an empty one clears, the event names no address", { skip }, async () => {
  const email = `person-email-${Date.now()}@example.test`;
  const { data: made, error: uErr } = await db.auth.admin.createUser({ email, password: "a-long-test-password-1", email_confirm: true });
  assert.equal(uErr, null, uErr?.message);
  const userId = made.user.id;
  try {
    const { error: mErr } = await db.from("memberships").insert({ tenant_id: tenantId, user_id: userId, role: "operator" });
    assert.equal(mErr, null, mErr?.message);
    const as = createClient(URL_, process.env.SUPABASE_ANON_KEY ?? KEY, { auth: { persistSession: false } });
    const { error: sErr } = await as.auth.signInWithPassword({ email, password: "a-long-test-password-1" });
    assert.equal(sErr, null, sErr?.message);

    const { id } = await person({ display_name: "Dee", phone_e164: "+15550100131" });
    await person({ display_name: "Eli", phone_e164: "+15550100132", email: "eli@example.com" });

    const { data: set, error } = await as.rpc("set_person_email", { p_contact_id: id, p_email: "  Dee@Example.COM " });
    assert.equal(error, null, error?.message);
    assert.deepEqual(set, { contact_id: id, email: "dee@example.com" }, "stored trimmed and lower-cased, whatever the caller sent");

    const { error: taken } = await as.rpc("set_person_email", { p_contact_id: id, p_email: "eli@example.com" });
    assert.equal(taken?.code, "23505");
    assert.equal(taken?.message, "Another person here already has that address.");
    const { error: shapeless } = await as.rpc("set_person_email", { p_contact_id: id, p_email: "dee.example.com" });
    assert.match(shapeless?.message ?? "", /not an email address/);

    const { data: cleared } = await as.rpc("set_person_email", { p_contact_id: id, p_email: "" });
    assert.deepEqual(cleared, { contact_id: id, email: null });

    const { data: events } = await db.from("events").select("kind, data").eq("tenant_id", tenantId).eq("subject_id", id).eq("kind", "contact.email_set").order("created_at");
    assert.deepEqual(events.map((e) => e.data.set), [true, false], "set, then cleared");
    assert.ok(events.every((e) => !JSON.stringify(e.data).includes("@")), "an event outlives an erasure, so it names no address");

    const { data: other } = await db.from("tenants").insert({ slug: `person-email-far-${Date.now()}`, name: "Far" }).select("id").single();
    try {
      const { data: far } = await db.from("contacts").insert({ tenant_id: other.id, phone_e164: "+15550100141" }).select("id").single();
      const { error: stranger } = await as.rpc("set_person_email", { p_contact_id: far.id, p_email: "x@example.com" });
      assert.match(stranger?.message ?? "", /Person not found/, "a person in a workspace the caller does not act in does not exist");
    } finally {
      await db.from("tenants").delete().eq("id", other.id);
    }
  } finally {
    await db.auth.admin.deleteUser(userId);
  }
});
