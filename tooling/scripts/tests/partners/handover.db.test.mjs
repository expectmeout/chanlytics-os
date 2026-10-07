/**
 * A partner sets up a workspace and hands it to its owner (decision 0016), against the replayed stack: the workspace
 * made with the partner seated as partner and credited at creation; the handover read by its addressee alone; a
 * decline, a resend and an accept that makes the owner; each refusal in the function's own words; the letter's news;
 * and the sweep holding for review a handover accepted from the partner's own company domain. Skips without a local
 * database.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
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
// The partner's own company domain, and their business owner's on it: the case the sweep holds for review.
const DOMAIN = `agency-${RUN}.example.com`;
let partner;
let owner;
let stranger;
let made;

/** A real session for a fresh user at this address; `factor`, past its second factor (0013, 00218: a partner's seat asks). */
async function person(email, { factor = false } = {}) {
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const u = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(u.error, null, u.error?.message);
  users.push(u.data.user.id);
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  if (factor) await showSecondFactor(client);
  return { client, userId: u.data.user.id, email };
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  partner = await person(`partner@${DOMAIN}`, { factor: true });
  owner = await person(`owner@${DOMAIN}`);
  // Past it too, so the refusal they meet is "only a partner", not the second factor's.
  stranger = await person(`stranger-${RUN}@example.com`, { factor: true });
  const code = `hand-${Math.random().toString(36).slice(2, 8)}`;
  partner.id = ok(await partner.client.rpc("partner_become", { p_code: code })).id;
});

after(async () => {
  if (skip) return;
  for (const id of tenants) await db.from("tenants").delete().eq("id", id);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

test(
  "made for a business: the partner sits on it as partner, never owner, and it is credited now",
  { skip },
  async () => {
    const own = await partner.client.rpc("create_workspace_for_business", {
      p_name: "Luna Studio",
      p_timezone: "",
      p_owner_email: partner.email,
    });
    assert.equal(own.error?.code, "22023", "never to their own address");
    const nobody = await stranger.client.rpc("create_workspace_for_business", {
      p_name: "Luna Studio",
      p_timezone: "",
      p_owner_email: owner.email,
    });
    assert.equal(nobody.error?.code, "42501", "a partner's door");

    made = ok(
      await partner.client
        .rpc("create_workspace_for_business", {
          p_name: "Luna Studio",
          p_timezone: "Europe/Madrid",
          p_owner_email: ` ${owner.email.toUpperCase()} `,
        })
        .single(),
    );
    tenants.push(made.id);
    assert.equal(made.timezone, "Europe/Madrid");
    const seats = ok(await db.from("memberships").select("user_id, role").eq("tenant_id", made.id));
    assert.deepEqual(seats, [{ user_id: partner.userId, role: "partner" }], "no owner until one accepts");
    const [link] = ok(
      await db
        .from("partner_tenants")
        .select("partner_id, origin, handover_email, handover_sent_at, handover_expires_at")
        .eq("tenant_id", made.id),
    );
    assert.equal(link.partner_id, partner.id);
    assert.equal(link.origin, "handover");
    assert.equal(link.handover_email, owner.email, "as it is stored: lowercased and trimmed");
    const days = (Date.parse(link.handover_expires_at) - Date.parse(link.handover_sent_at)) / 86_400_000;
    assert.equal(Math.round(days), 14);
  },
);

test("the handover is its addressee's to read and answer, nobody else's", { skip }, async () => {
  const mine = ok(await owner.client.rpc("handovers_mine"));
  assert.equal(mine.length, 1);
  assert.equal(mine[0].tenant_id, made.id);
  assert.equal(mine[0].workspace, "Luna Studio");
  assert.deepEqual(ok(await stranger.client.rpc("handovers_mine")), []);
  assert.deepEqual(ok(await partner.client.rpc("handovers_mine")), [], "the partner's is not theirs to accept");
  const theirs = await stranger.client.rpc("handover_accept", { p_tenant: made.id });
  assert.equal(theirs.error?.code, "P0002", "not found, never 'not yours'");
  const self = await partner.client.rpc("handover_accept", { p_tenant: made.id });
  assert.equal(self.error?.code, "P0002");
  const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
  assert.ok((await anon.rpc("handovers_mine")).error, "never to a stranger without a session");
});

test(
  "declined, sent again, accepted: the owner is the first and only one, and the events say so",
  { skip },
  async () => {
    ok(await owner.client.rpc("handover_decline", { p_tenant: made.id }));
    assert.deepEqual(ok(await owner.client.rpc("handovers_mine")), []);
    const late = await owner.client.rpc("handover_accept", { p_tenant: made.id });
    assert.equal(late.error?.code, "55000", "declined is declined until it is sent again");

    const again = ok(await partner.client.rpc("partner_handover_resend", { p_tenant: made.id, p_email: owner.email }));
    assert.equal(again.email, owner.email);
    const accepted = ok(await owner.client.rpc("handover_accept", { p_tenant: made.id }).single());
    assert.equal(accepted.id, made.id);
    const seats = ok(await db.from("memberships").select("user_id, role").eq("tenant_id", made.id).order("role"));
    assert.deepEqual(seats, [
      { user_id: owner.userId, role: "owner" },
      { user_id: partner.userId, role: "partner" },
    ]);
    const twice = await owner.client.rpc("handover_accept", { p_tenant: made.id });
    assert.equal(twice.error?.code, "55000");
    const after_ = await partner.client.rpc("partner_handover_resend", { p_tenant: made.id, p_email: owner.email });
    assert.equal(after_.error?.code, "55000", "nothing to send once it has its owner");
    const kinds = ok(await db.from("events").select("kind").eq("tenant_id", made.id).like("kind", "partner.handover%"));
    assert.deepEqual(kinds.map((e) => e.kind).sort(), [
      "partner.handover_accepted",
      "partner.handover_declined",
      "partner.handover_sent",
      "partner.handover_sent",
    ]);
  },
);

test("the partner hears it in the letter, and brought counts it now", { skip }, async () => {
  ok(
    await db
      .from("partners")
      .update({ written_through: new Date(Date.now() - 3_600_000).toISOString() })
      .eq("id", partner.id),
  );
  // No instant: the function's own default, the database's now(). The runner's clock and the database's differ by
  // milliseconds, and a share written at the database's now() is after a runner's new Date() taken a moment later
  // whenever the database's is ahead.
  const due = ok(await db.rpc("partner_letters_due"));
  const mine = due.find((d) => d.partner_id === partner.id);
  assert.ok(mine, "a letter is due");
  assert.deepEqual(mine.news.accepted, ["Luna Studio"]);
  assert.deepEqual(mine.news.brought, [], "brought is the link's word");
  const counted = await partner.client
    .from("partner_tenants")
    .select("tenant_id", { count: "exact", head: true })
    .or("origin.eq.link,handover_accepted_at.not.is.null");
  assert.equal(counted.count, 1);
});

test("the sweep holds for review a handover accepted from the partner's own company domain", { skip }, async () => {
  // The sweep reads every partner, and partner.db.test.mjs runs beside this file on the same stack with its own
  // clock (a share paid 1 August). So this one is judged by its card mark, at an instant before that share can be
  // judged or mature: the other file's workspace is left for its own sweeps.
  const AT = "2026-06-01T12:00:00Z";
  ok(await db.from("billing_card_marks").insert({ tenant_id: made.id, card_fingerprint: `fp_${RUN}` }));
  ok(
    await db.rpc("partner_earn", {
      p_tenant_id: made.id,
      p_invoice_id: `in_${RUN}`,
      p_event_id: `evt_${RUN}`,
      p_amount_cents: 10000,
      p_currency: "usd",
      p_paid_at: AT,
    }),
  );
  ok(await db.rpc("partner_earnings_sweep", { p_now: "2026-06-02T00:00:00Z" }));
  const [link] = ok(await db.from("partner_tenants").select("standing, standing_why, checks").eq("tenant_id", made.id));
  assert.equal(link.standing, "review");
  assert.equal(link.checks.same_domain, true);
  assert.match(link.standing_why, /partner's own email domain/);
});
