/**
 * A partner (decision 0011), P2, against the replayed stack: becoming one, and what create_workspace does with a
 * code — the attribution row, the partner's seat on the team and the event, in one transaction; nothing for a code
 * that names nobody creditable, with the reason recorded; and who may read what. Skips without a local database.
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
      ? "refusing a database that is not on this machine: this suite makes users and workspaces"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the sessions this suite signs in with need it"
        : false;

const ok = (r) => {
  assert.equal(r.error, null, r.error?.message);
  return r.data;
};

let db;
const users = [];
const tenants = [];
let partner; // the partner: their session and id
let customer; // a business that came through the link
let other; // a business that typed a code that names nobody

/** A real session for a fresh user. */
async function person(label) {
  const email = `partner-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  return { client, userId: made.data.user.id };
}

const CODE = `ada-${Math.random().toString(36).slice(2, 8)}`;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  partner = await person("partner");
  customer = await person("customer");
  other = await person("other");
});

after(async () => {
  if (skip) return;
  for (const id of tenants) await db.from("tenants").delete().eq("id", id);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

test(
  "becoming a partner: once, with a code of the right shape; the row is the caller's alone to read",
  { skip },
  async () => {
    const bad = await partner.client.rpc("partner_become", { p_code: "ab" });
    assert.equal(bad.error?.code, "22023", "the shape, in the function's words");
    const reserved = await partner.client.rpc("partner_become", { p_code: "Chanlytics" });
    assert.equal(reserved.error?.code, "22023");
    const row = ok(await partner.client.rpc("partner_become", { p_code: ` ${CODE.toUpperCase()} ` }));
    assert.equal(row.code, CODE, "as it is stored: lowercased and trimmed");
    assert.equal(row.status, "active");
    assert.equal(row.share_bp, 2500, "the share every new partner account starts with");
    assert.ok(row.terms_accepted_at, "the terms, agreed now");
    assert.equal("payout_facts" in row, false, "the platform's, never answered to the pane");
    const again = await partner.client.rpc("partner_become", { p_code: "another" });
    assert.equal(again.error?.code, "23505", "one per account");
    const taken = await customer.client.rpc("partner_become", { p_code: CODE });
    assert.equal(taken.error?.code, "23505", "a code is one person's");
    assert.match(taken.error?.message ?? "", /taken/);
    partner.id = row.id;

    const mine = ok(await partner.client.from("partners").select("id, code"));
    assert.deepEqual(mine, [{ id: row.id, code: CODE }]);
    assert.deepEqual(ok(await customer.client.from("partners").select("id")), [], "nobody else's row");
  },
);

test(
  "a workspace made through the link: the attribution, the partner's seat and the event, in one transaction",
  { skip },
  async () => {
    const w = ok(
      await customer.client
        .rpc("create_workspace", { p_name: "Harbor Moving", p_timezone: "America/Chicago", p_partner_code: CODE })
        .single(),
    );
    tenants.push(w.id);
    const link = ok(await db.from("partner_tenants").select("partner_id, code_used, standing").eq("tenant_id", w.id));
    assert.deepEqual(
      link,
      [{ partner_id: partner.id, code_used: CODE, standing: null }],
      "fixed now; the sweep judges later",
    );
    const seats = ok(await db.from("memberships").select("user_id, role").eq("tenant_id", w.id).order("role"));
    assert.deepEqual(seats, [
      { user_id: customer.userId, role: "owner" },
      { user_id: partner.userId, role: "partner" },
    ]);
    const ev = ok(await db.from("events").select("kind, data").eq("tenant_id", w.id).eq("kind", "partner.attributed"));
    assert.equal(ev.length, 1);
    assert.equal(ev[0].data.partner_id, partner.id);
    assert.equal(ev[0].data.code, CODE);

    // Who reads the attribution: the partner (theirs), the owner (their workspace's), nobody else.
    assert.equal(ok(await partner.client.from("partner_tenants").select("tenant_id")).length, 1);
    assert.equal(ok(await customer.client.from("partner_tenants").select("tenant_id")).length, 1);
    assert.equal(ok(await other.client.from("partner_tenants").select("tenant_id")).length, 0);
    // And the partner's session is a member: the workspace is on their list.
    const theirs = ok(await partner.client.from("tenants").select("id").eq("id", w.id));
    assert.equal(theirs.length, 1, "the switcher lists it");
  },
);

test(
  "a code that names nobody creditable makes the workspace all the same, with why recorded: unknown, and the caller's own",
  { skip },
  async () => {
    const unknown = ok(
      await other.client.rpc("create_workspace", { p_name: "Bayside Dental", p_partner_code: "no-such-code" }).single(),
    );
    tenants.push(unknown.id);
    assert.equal(ok(await db.from("partner_tenants").select("tenant_id").eq("tenant_id", unknown.id)).length, 0);
    let ev = ok(await db.from("events").select("data").eq("tenant_id", unknown.id).eq("kind", "partner.code_ignored"));
    assert.deepEqual(
      ev.map((e) => e.data.why),
      ["unknown"],
    );

    const own = ok(
      await partner.client.rpc("create_workspace", { p_name: "Ada's Own", p_partner_code: CODE }).single(),
    );
    tenants.push(own.id);
    assert.equal(
      ok(await db.from("partner_tenants").select("tenant_id").eq("tenant_id", own.id)).length,
      0,
      "never their own",
    );
    const seats = ok(await db.from("memberships").select("role").eq("tenant_id", own.id));
    assert.deepEqual(seats, [{ role: "owner" }], "one seat, the owner's: no partner membership on top of it");
    ev = ok(await db.from("events").select("data").eq("tenant_id", own.id).eq("kind", "partner.code_ignored"));
    assert.deepEqual(
      ev.map((e) => e.data.why),
      ["self"],
    );

    const plain = ok(await other.client.rpc("create_workspace", { p_name: "No Code" }).single());
    tenants.push(plain.id);
    assert.equal(
      ok(await db.from("events").select("id").eq("tenant_id", plain.id).like("kind", "partner.%")).length,
      0,
    );
  },
);

test("a paused partner is credited with nothing until the platform resumes them", { skip }, async () => {
  ok(await db.from("partners").update({ status: "paused" }).eq("id", partner.id));
  try {
    const w = ok(await other.client.rpc("create_workspace", { p_name: "While Paused", p_partner_code: CODE }).single());
    tenants.push(w.id);
    assert.equal(ok(await db.from("partner_tenants").select("tenant_id").eq("tenant_id", w.id)).length, 0);
    const ev = ok(await db.from("events").select("data").eq("tenant_id", w.id).eq("kind", "partner.code_ignored"));
    assert.deepEqual(
      ev.map((e) => e.data.why),
      ["paused"],
    );
  } finally {
    ok(await db.from("partners").update({ status: "active" }).eq("id", partner.id));
  }
});
