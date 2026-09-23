/**
 * A person may have a proposal -- on a real database.
 *
 * 00154 is a column, a CHECK, a trigger on erasure and a definer door. A
 * constraint, a trigger and a function body are what reading source cannot
 * prove, so these run against Postgres in the database workflow; skipped
 * without a local database.
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
const person = async (row) => {
  const { data, error } = await db
    .from("contacts")
    .insert({ tenant_id: tenantId, ...row })
    .select("id")
    .single();
  return { id: data?.id ?? null, error };
};

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const { data, error } = await db
    .from("tenants")
    .insert({ slug: `person-proposal-${Date.now()}`, name: "Person proposal" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  tenantId = data.id;
});

after(async () => {
  if (skip || !tenantId) return;
  await db.from("tenants").delete().eq("id", tenantId);
});

test(
  "the column holds the stored shape only: a trimmed web address, no whitespace, at most 500 characters",
  { skip },
  async () => {
    const ok = await person({ phone_e164: "+15550100201", proposal_url: "https://docs.example.com/p/42" });
    assert.equal(ok.error, null, ok.error?.message);
    for (const bad of [
      " https://docs.example.com/p/42",
      "docs.example.com/p/42",
      "mailto:ana@example.com",
      "https://docs.example.com/p 42",
      `https://docs.example.com/${"x".repeat(500)}`,
      "https://",
    ]) {
      const r = await person({ phone_e164: "+15550100202", proposal_url: bad });
      assert.match(r.error?.message ?? "", /contacts_proposal_url_check/, `refused: ${JSON.stringify(bad)}`);
    }
  },
);

test("an erased row holds no proposal: whatever sets erased_at, the trigger clears it", { skip }, async () => {
  const { id } = await person({ phone_e164: "+15550100211", proposal_url: "https://docs.example.com/p/gone" });
  const { error } = await db.from("contacts").update({ erased_at: new Date().toISOString() }).eq("id", id);
  assert.equal(error, null, error?.message);
  const { data } = await db.from("contacts").select("proposal_url, erased_at").eq("id", id).single();
  assert.equal(data.proposal_url, null);
  assert.ok(data.erased_at);
});

test(
  "set_person_proposal: an acting member where the person lives, trimmed, a non-address refused in the owner's words, an empty one clears, the event names no address",
  { skip },
  async () => {
    const email = `person-proposal-${Date.now()}@example.test`;
    const { data: made, error: uErr } = await db.auth.admin.createUser({
      email,
      password: "a-long-test-password-1",
      email_confirm: true,
    });
    assert.equal(uErr, null, uErr?.message);
    const userId = made.user.id;
    try {
      const { error: mErr } = await db
        .from("memberships")
        .insert({ tenant_id: tenantId, user_id: userId, role: "operator" });
      assert.equal(mErr, null, mErr?.message);
      const as = createClient(URL_, process.env.SUPABASE_ANON_KEY ?? KEY, { auth: { persistSession: false } });
      const { error: sErr } = await as.auth.signInWithPassword({ email, password: "a-long-test-password-1" });
      assert.equal(sErr, null, sErr?.message);

      const { id } = await person({ display_name: "Dee", phone_e164: "+15550100221" });

      const { data: set, error } = await as.rpc("set_person_proposal", {
        p_contact_id: id,
        p_url: "  https://docs.example.com/p/dee ",
      });
      assert.equal(error, null, error?.message);
      assert.deepEqual(set, { contact_id: id, proposal_url: "https://docs.example.com/p/dee" }, "stored trimmed");

      const { error: shapeless } = await as.rpc("set_person_proposal", {
        p_contact_id: id,
        p_url: "docs.example.com/p/dee",
      });
      assert.match(shapeless?.message ?? "", /not a web address/);

      const { data: cleared } = await as.rpc("set_person_proposal", { p_contact_id: id, p_url: "" });
      assert.deepEqual(cleared, { contact_id: id, proposal_url: null });

      const { data: events } = await db
        .from("events")
        .select("kind, data")
        .eq("tenant_id", tenantId)
        .eq("subject_id", id)
        .eq("kind", "contact.proposal_set")
        .order("created_at");
      assert.deepEqual(
        events.map((e) => e.data.set),
        [true, false],
        "set, then cleared",
      );
      assert.ok(
        events.every((e) => !JSON.stringify(e.data).includes("example.com")),
        "an event outlives an erasure, so it names no address",
      );

      const { data: other } = await db
        .from("tenants")
        .insert({ slug: `person-proposal-far-${Date.now()}`, name: "Far" })
        .select("id")
        .single();
      try {
        const { data: far } = await db
          .from("contacts")
          .insert({ tenant_id: other.id, phone_e164: "+15550100231" })
          .select("id")
          .single();
        const { error: stranger } = await as.rpc("set_person_proposal", {
          p_contact_id: far.id,
          p_url: "https://docs.example.com/p/x",
        });
        assert.match(
          stranger?.message ?? "",
          /Person not found/,
          "a person in a workspace the caller does not act in does not exist",
        );
      } finally {
        await db.from("tenants").delete().eq("id", other.id);
      }
    } finally {
      await db.auth.admin.deleteUser(userId);
    }
  },
);
