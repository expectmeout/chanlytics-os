/**
 * A deal is a record (docs/decisions/0004-deals-record.md), proved where the
 * rule lives: on the database.
 *
 * deal_record is the one door (00155). A member who may act -- an owner or an
 * operator -- starts a proposal and moves it; a viewer and a member of another
 * workspace are told the person does not exist; every move is an event that
 * carries no words; one engagement is open per person per service; a stale
 * version answers moved; an ended engagement is re-signed as a new row; the
 * people read carries the newest open or current deal; and an erased person's
 * deals keep no words.
 *
 * Runs the way consent-paths.db.test.mjs does: its own workspaces, users and
 * rows, made with the service key and removed after, against the database
 * `supabase start` builds on this machine, never production. The sessions are
 * real: users sign in with a password through the anon key, so auth.uid() and
 * is_acting_member judge them as the dashboard's client would. A failed
 * sign-in fails the test.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes users, workspaces, people and deals"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the sessions this suite signs in with need it"
        : false;

/** The world: one workspace with an owner, an operator and a viewer in it; another workspace with an owner; one person. */
const w = {};
const users = [];
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

/** A real session for a fresh user with this role in this workspace. */
async function member(role, tenant) {
  const email = `deals-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await w.admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await w.admin.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }));
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  return client;
}

before(async () => {
  if (skip) return;
  w.admin = createClient(URL_, KEY, { auth: { persistSession: false } });
  w.tenant = ok(
    await w.admin
      .from("tenants")
      .insert({ slug: `deals-${Date.now()}`, name: "Deals" })
      .select("id")
      .single(),
  ).id;
  w.other = ok(
    await w.admin
      .from("tenants")
      .insert({ slug: `deals-other-${Date.now()}`, name: "Other" })
      .select("id")
      .single(),
  ).id;
  w.owner = await member("owner", w.tenant);
  w.operator = await member("operator", w.tenant);
  w.viewer = await member("viewer", w.tenant);
  w.stranger = await member("owner", w.other);
  w.contact = ok(
    await w.admin
      .from("contacts")
      .insert({ tenant_id: w.tenant, phone_e164: "+15125550171", display_name: "Fixture Deal Person" })
      .select("id")
      .single(),
  ).id;
});

after(async () => {
  if (skip || !w.admin) return;
  if (w.tenant) {
    await w.admin.from("deals").delete().eq("tenant_id", w.tenant);
    await w.admin.from("events").delete().eq("tenant_id", w.tenant);
    await w.admin.from("contacts").delete().eq("tenant_id", w.tenant);
    await w.admin.from("tenants").delete().eq("id", w.tenant);
  }
  if (w.other) await w.admin.from("tenants").delete().eq("id", w.other);
  for (const id of users) await w.admin.auth.admin.deleteUser(id).catch(() => {});
});

/** One press on the door: what it answered, or the words of what it raised. */
const record = (client, args) =>
  client.rpc("deal_record", args).then((r) => (r.error ? { error: r.error.message } : r.data));

// One person serves all three tests. Each proposes its own services, so the
// one-open-per-service rule never crosses a test; the erasure is the last
// thing done to them, and node:test runs a file's tests in order.

test(
  "the door: a proposal starts a deal; a viewer and a stranger are refused; the kinds are written",
  { skip },
  async () => {
    const v = await record(w.viewer, { p_contact_id: w.contact, p_stage: "proposed" });
    assert.equal(v.error, "not_found", "a viewer reads only");
    const s = await record(w.stranger, { p_contact_id: w.contact, p_stage: "proposed" });
    assert.equal(s.error, "not_found", "another workspace's member sees no person");
    const r = await record(w.operator, { p_contact_id: w.contact, p_stage: "proposed", p_service: "Ad management" });
    assert.ok(r.deal, JSON.stringify(r));
    assert.equal(r.deal.stage, "proposed");
    assert.equal(r.deal.version, 1);
    assert.equal(r.from, null);
    const ev = ok(
      await w.admin.from("events").select("kind, data").eq("subject_id", r.deal.id).eq("kind", "deal.proposed"),
    );
    assert.equal(ev.length, 1);
    assert.equal(ev[0].data.stage, "proposed");
    assert.equal(ev[0].data.note, undefined, "an event carries no words");
  },
);

test(
  "one open engagement per person per service; a stale version answers moved; an ended one is not reopened",
  { skip },
  async () => {
    const a = await record(w.operator, { p_contact_id: w.contact, p_stage: "proposed", p_service: "SEO" });
    assert.ok(a.deal, JSON.stringify(a));
    const dup = await record(w.operator, { p_contact_id: w.contact, p_stage: "proposed", p_service: "SEO" });
    assert.equal(dup.error, "already_open");
    const other = await record(w.operator, { p_contact_id: w.contact, p_stage: "proposed", p_service: "Ads" });
    assert.ok(other.deal, "a different service is its own engagement");
    const stale = await record(w.operator, {
      p_contact_id: w.contact,
      p_stage: "won",
      p_deal_id: a.deal.id,
      p_version: 99,
    });
    assert.equal(stale.error, "moved");
    assert.equal(stale.version, 1);
    const won = await record(w.owner, {
      p_contact_id: w.contact,
      p_stage: "won",
      p_deal_id: a.deal.id,
      p_version: 1,
      p_amount_cents: 250000,
      p_per: "month",
      p_note: "Signed at the desk",
    });
    assert.ok(won.deal, JSON.stringify(won));
    assert.equal(won.deal.stage, "won");
    assert.equal(won.deal.version, 2);
    assert.equal(won.from, "proposed");
    assert.ok(won.deal.decided_at);
    const same = await record(w.owner, {
      p_contact_id: w.contact,
      p_stage: "won",
      p_deal_id: a.deal.id,
      p_version: 2,
      p_note: "Renewed",
    });
    assert.ok(same.deal, JSON.stringify(same));
    assert.equal(same.deal.version, 3, "refreshing details bumps the version");
    const wonEvents = ok(await w.admin.from("events").select("id").eq("subject_id", a.deal.id).eq("kind", "deal.won"));
    assert.equal(wonEvents.length, 1, "a same-stage update is not a move");
    const ended = await record(w.owner, {
      p_contact_id: w.contact,
      p_stage: "ended",
      p_deal_id: a.deal.id,
      p_version: 3,
    });
    assert.ok(ended.deal, JSON.stringify(ended));
    assert.equal(ended.deal.stage, "ended");
    const reopen = await record(w.owner, {
      p_contact_id: w.contact,
      p_stage: "proposed",
      p_deal_id: a.deal.id,
      p_version: 4,
    });
    assert.equal(reopen.error, "ended");
    const fresh = await record(w.owner, { p_contact_id: w.contact, p_stage: "proposed", p_service: "SEO" });
    assert.ok(fresh.deal, "an ended engagement is re-signed as a new row");
    assert.notEqual(fresh.deal.id, a.deal.id);
  },
);

test("the people read carries the newest open or current deal; an erasure blanks the words", { skip }, async () => {
  const lost = await record(w.operator, { p_contact_id: w.contact, p_stage: "proposed", p_service: "Old" });
  assert.ok(lost.deal, JSON.stringify(lost));
  const passed = await record(w.operator, {
    p_contact_id: w.contact,
    p_stage: "lost",
    p_deal_id: lost.deal.id,
    p_version: 1,
  });
  assert.equal(passed.deal?.stage, "lost", JSON.stringify(passed));
  const open = await record(w.operator, {
    p_contact_id: w.contact,
    p_stage: "proposed",
    p_service: "New",
    p_note: "Sent by email",
    p_evidence: { form: "paper" },
  });
  assert.ok(open.deal, JSON.stringify(open));
  const rows = ok(await w.operator.rpc("people_list", { p_tenant_id: w.tenant, p_contact_id: w.contact }));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].deal_id, open.deal.id, "the open one, not the newest lost one");
  assert.equal(rows[0].deal_stage, "proposed");
  assert.equal(rows[0].deal_service, "New");
  // The erasure as the right-to-be-forgotten path completes it: erased_at is
  // written, and 00155's trigger on that column takes the words with it.
  ok(await w.admin.from("contacts").update({ erased_at: new Date().toISOString() }).eq("id", w.contact));
  const after_ = ok(
    await w.admin.from("deals").select("note, evidence, stage, version").eq("id", open.deal.id).single(),
  );
  assert.equal(after_.note, null);
  assert.equal(after_.evidence, null);
  assert.equal(after_.stage, "proposed", "the stage stays");
  assert.equal(after_.version, 2);
});
