/**
 * The unsubscribe door (00174 set_email_marketing), proved where it lives: on the database. A press records the no
 * once, puts the address on the workspace's never-again list under the finder's own hash, and closes the leads
 * still being written to as said no. A converted lead keeps its stage, another workspace's person is not found, and
 * no signed-in member can call it at all: the public page holds no session, and nobody else should.
 *
 * Runs against the database `supabase start` builds on this machine, never production (consent-paths.db.test.mjs
 * is the shape).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { leadSuppressionHash } from "@chanlytics/contracts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes users, workspaces and leads"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the member this suite signs in needs it"
        : false;

let db;
let A;
let B;
let person;
let member;
const leads = {};
const users = [];
const EMAIL = "hello@fixture-unsubscribe.example";
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const press = (over = {}) =>
  db.rpc("set_email_marketing", {
    p_tenant_id: A,
    p_contact_id: person,
    p_state: "opted_out",
    p_source: "unsubscribe",
    p_evidence: { channel: "email", via: "one_click", message_id: "11111111-1111-4111-8111-111111111111" },
    ...over,
  });

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const stamp = Date.now();
  A = ok(
    await db
      .from("tenants")
      .insert({ slug: `unsubscribe-a-${stamp}`, name: "Fixture Movers" })
      .select("id")
      .single(),
  ).id;
  B = ok(
    await db
      .from("tenants")
      .insert({ slug: `unsubscribe-b-${stamp}`, name: "Another" })
      .select("id")
      .single(),
  ).id;
  // The person first, then the leads that name them: contacts_link_lead links a new contact to a lead by address
  // at INSERT, and these leads are placed in the stages the test needs by hand.
  person = ok(
    await db
      .from("contacts")
      .insert({ tenant_id: A, email: EMAIL, display_name: "Fixture Strength Lab" })
      .select("id")
      .single(),
  ).id;
  for (const [stage, i] of [
    ["ready", 1],
    ["nurture", 2],
    ["converted", 3],
  ])
    leads[stage] = ok(
      await db
        .from("leads")
        .insert({
          tenant_id: A,
          place_id: `ChIJfixtureUnsubscribe${i}`,
          business_name: "Fixture Strength Lab",
          city: "Austin",
          region: "TX",
          email: EMAIL,
          email_state: "ok",
          stage,
          contact_id: person,
          ...(stage === "converted" ? { converted_at: new Date().toISOString() } : {}),
        })
        .select("id, version")
        .single(),
    );

  const email = `unsubscribe-owner-${stamp}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: A, user_id: made.data.user.id, role: "owner" }));
  member = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await member.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
});

after(async () => {
  if (skip) return;
  for (const t of [A, B].filter(Boolean)) {
    await db.from("events").delete().eq("tenant_id", t);
    await db.from("tenants").delete().eq("id", t);
  }
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

test(
  "the door records an unsubscribe and nothing else: another answer or another source is refused",
  { skip },
  async () => {
    for (const over of [{ p_state: "opted_in" }, { p_state: "unknown" }, { p_source: "customer_message" }]) {
      const r = await press(over);
      assert.equal(r.error?.code, "22023", JSON.stringify(over));
    }
    const row = ok(await db.from("contacts").select("email_marketing").eq("id", person).single());
    assert.equal(row.email_marketing, "unknown", "a refusal wrote nothing");
  },
);

test("a person the workspace does not have is not found, and nothing is written", { skip }, async () => {
  const unknown = ok(await press({ p_contact_id: "44444444-4444-4444-8444-444444444444" }));
  assert.deepEqual(unknown, { changed: false, found: false, business: "Fixture Movers" });
  const elsewhere = ok(await press({ p_tenant_id: B }));
  assert.deepEqual(elsewhere, { changed: false, found: false, business: "Another" });
  const n = ok(await db.from("lead_suppressions").select("id").eq("tenant_id", B));
  assert.equal(n.length, 0);
});

test(
  "no signed-in member may call it: a stop is the person's, pressed on a page with no session",
  { skip },
  async () => {
    const r = await member.rpc("set_email_marketing", {
      p_tenant_id: A,
      p_contact_id: person,
      p_state: "opted_out",
      p_source: "unsubscribe",
    });
    assert.equal(r.error?.code, "42501", r.error?.message);
    const row = ok(await db.from("contacts").select("email_marketing").eq("id", person).single());
    assert.equal(row.email_marketing, "unknown");
  },
);

test(
  "ACCEPTANCE: the press is recorded once, the address goes on the never-again list, and the leads being written to are closed as said no",
  { skip },
  async () => {
    const first = ok(await press());
    assert.deepEqual(first, { changed: true, found: true, business: "Fixture Movers" });

    const row = ok(
      await db
        .from("contacts")
        .select("email_marketing, email_marketing_source, email_marketing_updated_at, consent, dnc, marketing_consent")
        .eq("id", person)
        .single(),
    );
    assert.equal(row.email_marketing, "opted_out");
    assert.equal(row.email_marketing_source, "unsubscribe");
    assert.ok(row.email_marketing_updated_at);
    // Email only: the texting and WhatsApp answers are not this door's.
    assert.equal(row.consent, "unknown");
    assert.equal(row.dnc, false);
    assert.equal(row.marketing_consent, "unknown");

    const said = ok(
      await db
        .from("events")
        .select("data")
        .eq("tenant_id", A)
        .eq("kind", "contact.consent_changed")
        .eq("subject_id", person),
    );
    assert.equal(said.length, 1);
    assert.deepEqual(said[0].data, {
      purpose: "email_marketing",
      consent: "opted_out",
      source: "unsubscribe",
      channel: "email",
      via: "one_click",
      message_id: "11111111-1111-4111-8111-111111111111",
    });

    // The hash the finder checks every found address against (edge lead-db.ts suppressed()).
    const supp = ok(await db.from("lead_suppressions").select("kind, hash, what").eq("tenant_id", A));
    assert.deepEqual(supp, [{ kind: "email", hash: await leadSuppressionHash(A, EMAIL), what: "email_opt_out" }]);

    const now = ok(await db.from("leads").select("id, stage, closed_reason, version").eq("tenant_id", A));
    const byId = new Map(now.map((l) => [l.id, l]));
    for (const stage of ["ready", "nurture"]) {
      const l = byId.get(leads[stage].id);
      assert.equal(l.stage, "archived", stage);
      assert.equal(l.closed_reason, "said_no", stage);
      assert.equal(l.version, leads[stage].version + 1, `${stage}: the version moved, so an older undo is refused`);
    }
    const converted = byId.get(leads.converted.id);
    assert.equal(
      converted.stage,
      "converted",
      "a lead in conversation keeps its stage; the send door refuses it anyway",
    );
    assert.equal(converted.version, leads.converted.version);

    const closed = ok(await db.from("events").select("subject_id, data").eq("tenant_id", A).eq("kind", "lead.stage"));
    assert.deepEqual(closed.map((e) => e.subject_id).sort(), [leads.ready.id, leads.nurture.id].sort());
    for (const e of closed)
      assert.deepEqual(e.data, { stage: "archived", reason: "said_no", by: null, source: "unsubscribe" });
    const ops = ok(await db.from("lead_operations").select("id").eq("tenant_id", A));
    assert.equal(ops.length, 0, "no operation to undo: the stop is the person's");

    // Pressed again (a mail client retrying, a second click): nothing changes and nothing more is said.
    const again = ok(await press({ p_evidence: { channel: "email", via: "page" } }));
    assert.deepEqual(again, { changed: false, found: true, business: "Fixture Movers" });
    const saidAgain = ok(
      await db
        .from("events")
        .select("id")
        .eq("tenant_id", A)
        .eq("kind", "contact.consent_changed")
        .eq("subject_id", person),
    );
    assert.equal(saidAgain.length, 1);
    const suppAgain = ok(await db.from("lead_suppressions").select("id").eq("tenant_id", A));
    assert.equal(suppAgain.length, 1);
    const closedAgain = ok(await db.from("events").select("id").eq("tenant_id", A).eq("kind", "lead.stage"));
    assert.equal(closedAgain.length, 2);
  },
);
