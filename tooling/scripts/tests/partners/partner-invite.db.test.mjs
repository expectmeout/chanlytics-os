/**
 * An existing workspace brings in a partner (decision 0018, 00225), against the replayed stack: only the owner asks,
 * by a code that names an active partner who is someone else; the partner answers, joining only on a session that
 * showed its second factor; joining seats them as partner and credits them, earning from a workspace that had never
 * paid and not from one that was already paying, judged against the trial's end; a declined or withdrawn invitation
 * is the owner's to see and ask again; a workspace with a partner asks no second; an invitation stands while its
 * sender is an owner and its partner is active; and a join-time decision is said as one, never as the nightly
 * check's, and is not the partner's letter's news. Skips without a local database.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { DAY_MS } from "@chanlytics/contracts";
import { showSecondFactor } from "../_second-factor.mjs";

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
const RUN = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
let partner;
let owner;
let operator;
let fresh; // a workspace that has never paid
let paying; // a workspace that already pays
let trial; // a workspace in its trial, whose $0 first invoice was once stamped as a payment
let cancelled; // cancelled in its trial: the $0 stamp, from before the edge stopped writing it, before the trial's end
let forgotten; // paid for months, then Stripe deleted its customer: no status, no trial on record, the payment kept
let shared; // two owners, one of whom asks and is then made an operator
let lapseA; // asks a partner who is then paused
let lapseB; // asks the same partner, who declines first
let coOwner;
let sleeper; // a second partner, paused by the platform
let admin;
const ago = (days) => new Date(Date.now() - days * DAY_MS).toISOString();

async function signIn(email, password) {
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  return client;
}

async function person(label, { factor = false } = {}) {
  const email = `invite-${label}-${RUN}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const u = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(u.error, null, u.error?.message);
  users.push(u.data.user.id);
  const client = await signIn(email, password);
  if (factor) await showSecondFactor(client);
  return { client, userId: u.data.user.id, email, password };
}

async function workspace(name) {
  const w = ok(await owner.client.rpc("create_workspace", { p_name: name, p_timezone: "America/Chicago" }).single());
  tenants.push(w.id);
  return w.id;
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  partner = await person("partner", { factor: true });
  owner = await person("owner");
  operator = await person("operator");
  partner.code = `iv-${Math.random().toString(36).slice(2, 8)}`;
  partner.id = ok(await partner.client.rpc("partner_become", { p_code: partner.code })).id;
  fresh = await workspace("Fresh Shop");
  paying = await workspace("Paying Shop");
  ok(
    await db
      .from("billing_accounts")
      .upsert({ tenant_id: paying, status: "active", last_paid_at: new Date().toISOString() }),
  );
  trial = await workspace("Trial Shop");
  ok(
    await db
      .from("billing_accounts")
      .upsert({ tenant_id: trial, status: "trialing", last_paid_at: new Date().toISOString() }),
  );
  ok(await db.from("memberships").insert({ tenant_id: fresh, user_id: operator.userId, role: "operator" }));
  coOwner = await person("coowner");
  admin = await person("admin");
  sleeper = await person("sleeper", { factor: true });
  sleeper.code = `iz-${Math.random().toString(36).slice(2, 8)}`;
  sleeper.id = ok(await sleeper.client.rpc("partner_become", { p_code: sleeper.code })).id;
  cancelled = await workspace("Cancelled Shop");
  ok(
    await db
      .from("billing_accounts")
      .upsert({ tenant_id: cancelled, status: "canceled", last_paid_at: ago(30), trial_end: ago(16) }),
  );
  forgotten = await workspace("Forgotten Shop");
  ok(
    await db
      .from("billing_accounts")
      .upsert({ tenant_id: forgotten, status: "none", last_paid_at: ago(60), trial_end: null }),
  );
  shared = await workspace("Shared Shop");
  ok(await db.from("memberships").insert({ tenant_id: shared, user_id: coOwner.userId, role: "owner" }));
  lapseA = await workspace("Lapse A");
  lapseB = await workspace("Lapse B");
});

after(async () => {
  if (skip) return;
  for (const id of tenants) {
    await db.from("partner_earnings").delete().eq("tenant_id", id);
    await db.from("partner_tenants").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
  if (admin?.userId) await db.from("platform_admins").delete().eq("user_id", admin.userId);
  for (const p of [partner, sleeper]) if (p?.id) await db.from("partners").delete().eq("id", p.id);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

test("only the owner asks, by a code naming an active partner who is someone else", { skip }, async () => {
  const byOperator = await operator.client.rpc("partner_invite", { p_tenant: fresh, p_code: partner.code });
  assert.equal(byOperator.error?.code, "42501", "an operator may not");
  const nobody = await owner.client.rpc("partner_invite", { p_tenant: fresh, p_code: "nobody-has-this" });
  assert.equal(nobody.error?.code, "P0002");
  const sent = ok(
    await owner.client.rpc("partner_invite", { p_tenant: fresh, p_code: ` ${partner.code.toUpperCase()} ` }),
  );
  assert.equal(sent.code, partner.code, "as it is stored: lowercased and trimmed");
  const card = ok(await owner.client.rpc("workspace_partner", { p_tenant: fresh }));
  assert.equal(card.partner, null);
  assert.equal(card.invitation.code, partner.code);
  assert.equal((await operator.client.rpc("workspace_partner", { p_tenant: fresh })).error?.code, "42501");
  // What only functions write: a session inserts no invitation, even the owner's.
  const forged = await owner.client
    .from("partner_invitations")
    .insert({ tenant_id: paying, partner_id: partner.id, expires_at: new Date(Date.now() + 86_400_000).toISOString() });
  assert.ok(forged.error, "no session writes an invitation");
});

test(
  "the partner sees who asked; joining needs the second factor, and a workspace that never paid earns",
  { skip },
  async () => {
    const mine = ok(await partner.client.rpc("partner_invitations_mine"));
    assert.deepEqual(
      mine.map((i) => i.workspace),
      ["Fresh Shop"],
    );
    const password = await signIn(partner.email, partner.password);
    const refused = await password.rpc("partner_invite_accept", { p_tenant: fresh });
    assert.equal(refused.error?.code, "42501", "a password alone does not take a seat");
    const [joined] = ok(await partner.client.rpc("partner_invite_accept", { p_tenant: fresh }));
    assert.equal(joined.earns, true);
    const seat = ok(await db.from("memberships").select("role").eq("tenant_id", fresh).eq("user_id", partner.userId));
    assert.deepEqual(seat, [{ role: "partner" }]);
    const link = ok(await db.from("partner_tenants").select("partner_id, origin, standing").eq("tenant_id", fresh));
    assert.deepEqual(link, [{ partner_id: partner.id, origin: "invite", standing: null }]);
    assert.equal(ok(await db.from("partner_invitations").select("tenant_id").eq("tenant_id", fresh)).length, 0);
    // Its first invoice earns the partner's share, as a workspace they brought.
    const share = ok(
      await db.rpc("partner_earn", {
        p_tenant_id: fresh,
        p_invoice_id: `in_invite_${RUN}`,
        p_event_id: `evt_invite_${RUN}`,
        p_amount_cents: 10000,
        p_currency: "usd",
        p_paid_at: new Date().toISOString(),
      }),
    );
    assert.equal(share.earned_cents, 2500);
    // The owner's card says so, and a workspace with a partner asks no second.
    const card = ok(await owner.client.rpc("workspace_partner", { p_tenant: fresh }));
    assert.deepEqual(
      [card.partner.code, card.partner.origin, card.partner.seated, card.invitation],
      [partner.code, "invite", true, null],
    );
    const second = await owner.client.rpc("partner_invite", { p_tenant: fresh, p_code: partner.code });
    assert.equal(second.error?.code, "55000");
  },
);

test("declined, it is the owner's to see and ask again; withdrawn, it is gone", { skip }, async () => {
  ok(await owner.client.rpc("partner_invite", { p_tenant: paying, p_code: partner.code }));
  ok(await partner.client.rpc("partner_invite_decline", { p_tenant: paying }));
  const declined = ok(await owner.client.rpc("workspace_partner", { p_tenant: paying }));
  assert.ok(declined.invitation.declined_at, "the owner sees it was declined");
  assert.deepEqual(ok(await partner.client.rpc("partner_invitations_mine")), [], "and it leaves the partner's list");
  const late = await partner.client.rpc("partner_invite_accept", { p_tenant: paying });
  assert.equal(late.error?.code, "55000", "a declined invitation is not joined");

  ok(await owner.client.rpc("partner_invite", { p_tenant: paying, p_code: partner.code }));
  assert.equal(ok(await owner.client.rpc("workspace_partner", { p_tenant: paying })).invitation.declined_at, null);
  ok(await owner.client.rpc("partner_invite_withdraw", { p_tenant: paying }));
  assert.equal(ok(await owner.client.rpc("workspace_partner", { p_tenant: paying })).invitation, null);
  const gone = await partner.client.rpc("partner_invite_accept", { p_tenant: paying });
  assert.equal(gone.error?.code, "P0002");
});

test(
  "a workspace that was already paying seats the partner with no share, in words a person can change",
  { skip },
  async () => {
    ok(await owner.client.rpc("partner_invite", { p_tenant: paying, p_code: partner.code }));
    const [joined] = ok(await partner.client.rpc("partner_invite_accept", { p_tenant: paying }));
    assert.equal(joined.earns, false);
    const [link] = ok(await db.from("partner_tenants").select("standing, standing_why").eq("tenant_id", paying));
    assert.equal(link.standing, "disqualified");
    assert.match(link.standing_why, /already paying for its plan when the partner joined/);
    const none = await db.rpc("partner_earn", {
      p_tenant_id: paying,
      p_invoice_id: `in_paying_${RUN}`,
      p_event_id: `evt_paying_${RUN}`,
      p_amount_cents: 10000,
      p_currency: "usd",
      p_paid_at: new Date().toISOString(),
    });
    assert.equal(none.error, null, none.error?.message);
    assert.equal(none.data, null, "nothing earned");
  },
);

test(
  "a workspace still in its trial has not paid, whatever its first $0 invoice stamped: joining it earns",
  { skip },
  async () => {
    ok(await owner.client.rpc("partner_invite", { p_tenant: trial, p_code: partner.code }));
    const [joined] = ok(await partner.client.rpc("partner_invite_accept", { p_tenant: trial }));
    assert.equal(joined.earns, true);
    const [link] = ok(await db.from("partner_tenants").select("standing, invited_by").eq("tenant_id", trial));
    assert.deepEqual(link, { standing: null, invited_by: owner.userId }, "judged by the nightly check, who asked kept");
  },
);

test(
  "a workspace cancelled in its trial has not paid, whatever its $0 stamp says, and joining it earns; one that paid before its customer was deleted was paying",
  { skip },
  async () => {
    ok(await owner.client.rpc("partner_invite", { p_tenant: cancelled, p_code: partner.code }));
    const [c] = ok(await partner.client.rpc("partner_invite_accept", { p_tenant: cancelled }));
    assert.equal(c.earns, true, "the stamp predates the trial's end: it was the trial's $0 invoice");
    ok(await owner.client.rpc("partner_invite", { p_tenant: forgotten, p_code: partner.code }));
    const [f] = ok(await partner.client.rpc("partner_invite_accept", { p_tenant: forgotten }));
    assert.equal(f.earns, false, "a payment with no trial on record, whatever the status says now");
  },
);

test(
  "a join to a workspace that was paying is decided as the partner joined: on the row and the ledger, in the back office's words, and never the letter's news",
  { skip },
  async () => {
    const [link] = ok(
      await db.from("partner_tenants").select("standing, standing_by, checks").eq("tenant_id", forgotten),
    );
    assert.deepEqual(link, { standing: "disqualified", standing_by: null, checks: { already_paying: true } });
    const said = ok(
      await db.from("events").select("data").eq("tenant_id", forgotten).eq("kind", "partner.standing_set"),
    );
    assert.deepEqual(
      said.map((e) => [e.data.standing, e.data.by]),
      [["disqualified", "joining"]],
    );
    ok(await db.from("platform_admins").insert({ user_id: admin.userId }));
    try {
      const rows = Object.fromEntries(
        ok(await admin.client.rpc("platform_partner_workspaces")).map((w) => [w.tenant_id, w]),
      );
      assert.deepEqual([rows[forgotten].origin, rows[forgotten].decided_by], ["invite", "joining"], "not the sweep's");
      assert.deepEqual([rows[cancelled].origin, rows[cancelled].decided_by], ["invite", null], "not judged yet");
    } finally {
      await db.from("platform_admins").delete().eq("user_id", admin.userId);
    }
    // The share written for Fresh Shop above is news; the two decided as the partner joined are not.
    const letters = ok(await db.rpc("partner_letters_due", { p_now: new Date(Date.now() + 1000).toISOString() }));
    const mine = letters.find((l) => l.partner_id === partner.id);
    assert.ok(mine, "the partner has news: a share written");
    const standing = (mine.news.standing ?? []).map((row) => row.workspace);
    assert.deepEqual(
      standing.filter((w) => w === "Forgotten Shop" || w === "Paying Shop"),
      [],
      "they were told when they joined",
    );
  },
);

test(
  "an invitation stands while its sender is an owner: made an operator, their ask leaves the partner's list, is refused, and waits on nobody's card",
  { skip },
  async () => {
    ok(await owner.client.rpc("partner_invite", { p_tenant: shared, p_code: partner.code }));
    ok(await db.from("memberships").update({ role: "operator" }).eq("tenant_id", shared).eq("user_id", owner.userId));
    const listed = async () => ok(await partner.client.rpc("partner_invitations_mine"));
    assert.ok(!(await listed()).some((i) => i.workspace === "Shared Shop"), "not on the partner's list");
    const refused = await partner.client.rpc("partner_invite_accept", { p_tenant: shared });
    assert.equal(refused.error?.code, "55000");
    assert.match(refused.error?.message ?? "", /no longer its owner/);
    const card = ok(await coOwner.client.rpc("workspace_partner", { p_tenant: shared }));
    assert.equal(card.invitation, null, "the other owner's card waits for nobody, and may ask");
    ok(await coOwner.client.rpc("partner_invite", { p_tenant: shared, p_code: partner.code }));
    assert.ok(
      (await listed()).some((i) => i.workspace === "Shared Shop"),
      "asked again by an owner, it stands",
    );
  },
);

test(
  "a partner who stops being active loses the invitations waiting for them, a declined one stays for its owner, and their code is refused as one naming nobody",
  { skip },
  async () => {
    ok(await owner.client.rpc("partner_invite", { p_tenant: lapseA, p_code: sleeper.code }));
    ok(await owner.client.rpc("partner_invite", { p_tenant: lapseB, p_code: sleeper.code }));
    ok(await sleeper.client.rpc("partner_invite_decline", { p_tenant: lapseB }));
    ok(await db.from("partners").update({ status: "paused" }).eq("id", sleeper.id));
    const left = ok(
      await db.from("partner_invitations").select("tenant_id, declined_at").in("tenant_id", [lapseA, lapseB]),
    );
    assert.deepEqual(
      left.map((i) => [i.tenant_id, i.declined_at !== null]),
      [[lapseB, true]],
    );
    const owners = ok(await owner.client.rpc("workspace_partner", { p_tenant: lapseA }));
    assert.equal(owners.invitation, null, "the owner may ask someone else");
    const nobody = await owner.client.rpc("partner_invite", { p_tenant: lapseA, p_code: "nobody-has-this" });
    const paused = await owner.client.rpc("partner_invite", { p_tenant: lapseA, p_code: sleeper.code });
    assert.equal(paused.error?.code, "P0002");
    assert.equal(paused.error?.message, nobody.error?.message, "which codes exist is not learned a code at a time");
  },
);
