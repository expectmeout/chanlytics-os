/**
 * anthropic_profiles on the replayed stack (00544, decision 0097): the claim is once a subject and only its winner hears the
 * details; a person or a workspace that goes, whichever way, leaves the row for the sweep; and nobody signed in reaches it.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip = !URL_ || !KEY || !ANON ? "needs the replayed stack" : false;
let db;
let anon;

async function person() {
  const email = `profile-${crypto.randomUUID()}@example.com`;
  const made = await db.auth.admin.createUser({ email, password: "Tenancy-probe-1!", email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  return { id: made.data.user.id, email };
}
async function workspace(over = {}) {
  const r = await db
    .from("tenants")
    .insert({ slug: `profile-${crypto.randomUUID().slice(0, 8)}`, name: "Profiles", ...over })
    .select("id")
    .single();
  assert.equal(r.error, null, r.error?.message);
  return r.data.id;
}
const claim = (kind, subject) => db.rpc("anthropic_profile_claim", { p_kind: kind, p_subject: subject });

before(() => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  anon = createClient(URL_, ANON, { auth: { persistSession: false } });
});

test("a claim is once a subject: only the call that made the row hears what a create needs", { skip }, async () => {
  const p = await person();
  const results = await Promise.all(Array.from({ length: 5 }, () => claim("person", p.id)));
  for (const r of results) assert.equal(r.error, null, r.error?.message);
  const winners = results.filter((r) => r.data);
  assert.equal(winners.length, 1, "a create is not idempotent, so one caller alone may make one");
  assert.equal(winners[0].data.reference_id, `person:${p.id}`);
  assert.equal(winners[0].data.email, p.email);
  assert.ok(winners[0].data.onboarded_at);

  const t = await workspace();
  const w = await claim("workspace", t);
  assert.equal(w.data.reference_id, `workspace:${t}`);
  assert.equal(w.data.email, null);
  assert.equal((await claim("workspace", t)).data, null);
});

test("a claim for nobody, an ended workspace or no kind makes no row", { skip }, async () => {
  assert.equal((await claim("person", crypto.randomUUID())).data, null);
  const ended = await workspace({ left_empty_at: new Date().toISOString() });
  assert.equal((await claim("workspace", ended)).data, null);
  const refused = await claim("nobody", crypto.randomUUID());
  assert.equal(refused.error?.code, "22023");
});

test("whichever way they go, the row stays for the sweep, with no subject", { skip }, async () => {
  const p = await person();
  const t = await workspace();
  const { data: a } = await claim("person", p.id);
  const { data: b } = await claim("workspace", t);
  await db
    .from("anthropic_profiles")
    .update({ profile_id: `uprof_${a.id}` })
    .eq("id", a.id);
  await db
    .from("anthropic_profiles")
    .update({ profile_id: `uprof_${b.id}` })
    .eq("id", b.id);

  assert.equal((await db.auth.admin.deleteUser(p.id)).error, null);
  assert.equal((await db.from("tenants").delete().eq("id", t)).error, null);

  const { data: rows } = await db
    .from("anthropic_profiles")
    .select("id, user_id, tenant_id, profile_id")
    .in("id", [a.id, b.id]);
  assert.equal(rows.length, 2, "the cascade must not take the only record of what is still at Anthropic");
  for (const r of rows) {
    assert.equal(r.user_id, null);
    assert.equal(r.tenant_id, null);
    assert.ok(r.profile_id);
  }
});

test("who waits: a person with a seat, a live workspace, and not a preview or an ended one", { skip }, async () => {
  const live = await workspace();
  const ended = await workspace({ left_empty_at: new Date().toISOString() });
  const preview = await workspace({ status: "preview" });
  const p = await person();
  const seat = await db.from("memberships").insert({ tenant_id: live, user_id: p.id, role: "owner" });
  assert.equal(seat.error, null, seat.error?.message);
  const seatless = await person();

  const { data, error } = await db.rpc("anthropic_profiles_waiting", { p_limit: 100_000 });
  assert.equal(error, null, error?.message);
  const ids = new Set(data.map((w) => w.subject));
  assert.ok(ids.has(live));
  assert.ok(ids.has(p.id));
  assert.ok(!ids.has(ended));
  assert.ok(!ids.has(preview), "a preview is registered by its first call, if it has one");
  assert.ok(!ids.has(seatless.id), "nobody without a seat can call the model");

  await claim("workspace", live);
  const after = await db.rpc("anthropic_profiles_waiting", { p_limit: 100_000 });
  assert.ok(!after.data.some((w) => w.subject === live));
  assert.equal((await db.rpc("anthropic_profiles_waiting", { p_limit: 0 })).data.length, 0);
});

test("the table and its doors are the service role's", { skip }, async () => {
  const read = await anon.from("anthropic_profiles").select("id").limit(1);
  assert.equal(read.error?.code, "42501");
  const door = await anon.rpc("anthropic_profile_claim", { p_kind: "person", p_subject: crypto.randomUUID() });
  assert.ok(door.error, "nobody signed out may claim");
  const wait = await anon.rpc("anthropic_profiles_waiting", { p_limit: 1 });
  assert.ok(wait.error, "nor learn who waits");
});
