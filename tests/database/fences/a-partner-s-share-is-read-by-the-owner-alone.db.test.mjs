/**
 * A partner's share of an invoice is read by the workspace's owner alone (00370), on a real Postgres with real sessions.
 *
 * partner_earn and partner_reverse write what the partner who brought the workspace earns from its invoices into the
 * workspace's own events, and the events policy let every member read every event: an operator or a viewer could read
 * the partner's cut of what the business pays. Billing is the owner's, and so are those kinds now; every other event
 * reads as it did. Runs against the database `supabase start` builds, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { takeLock } from "../../_file-lock.mjs";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env"
        : false;

let admin;
let tenant;
const made = { users: [], tenants: [] };
const PASSWORD = "partner-share-fence-test-password-1";
const RUN = Date.now().toString(36);
const as = {};
const ok = (r, what) => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};

/** A member of the workspace in this role, signed in on a session of their own. */
async function member(role) {
  const email = `partner-share-fence-${role}-${RUN}@example.com`;
  const u = ok(await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true }), "user").user;
  made.users.push(u.id);
  ok(await admin.from("memberships").insert({ user_id: u.id, tenant_id: tenant, role }), "membership");
  const session = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await session.auth.signInWithPassword({ email, password: PASSWORD }), "sign in");
  return session;
}

// The partner ledger is the platform's: partner_earnings_sweep matures and judges every partner's rows, and counts
// them. The suites that write it or sweep it take its lock for the whole file (_file-lock.mjs), one after the other.
let releaseLedger;

before(async () => {
  if (skip) return;
  releaseLedger = await takeLock("partner-ledger");
  admin = createClient(URL_, KEY, { auth: { persistSession: false } });
  tenant = ok(
    await admin
      .from("tenants")
      .insert({ name: "Partner share fence", slug: `partner-share-fence-${RUN}` })
      .select("id")
      .single(),
    "tenant",
  ).id;
  made.tenants.push(tenant);
  // The events as partner_earn, partner_reverse and an ordinary verb write them, under the workspace's own id.
  const event = (kind, category, data) => ({
    tenant_id: tenant,
    kind,
    category,
    subject_type: "tenant",
    subject_id: tenant,
    data,
  });
  ok(
    await admin
      .from("events")
      .insert([
        event("partner.earned", "billing", { invoice: "in_1", amount_cents: 9900, earned_cents: 1980 }),
        event("partner.reversed", "billing", { invoice: "in_1", reversed_cents: 1980 }),
        event("partner.paid", "billing", { paid_cents: 1980 }),
        event("contact.added", "contact", { source: "manual" }),
      ]),
    "events",
  );
  as.owner = await member("owner");
  as.operator = await member("operator");
  as.viewer = await member("viewer");
});

after(async () => {
  try {
    if (skip) return;
    // events has no foreign key to tenants (it is partitioned), so the tenant's rows go first or they outlive it.
    for (const id of made.tenants) {
      await admin.from("events").delete().eq("tenant_id", id);
      await admin.from("tenants").delete().eq("id", id);
    }
    for (const id of made.users) await admin.auth.admin.deleteUser(id).catch(() => undefined);
  } finally {
    await releaseLedger?.();
  }
});

/** The kinds this suite wrote, as a session reads them (a new workspace writes its own events beside them). */
const WROTE = ["contact.added", "partner.earned", "partner.paid", "partner.reversed"];
const kindsAs = async (session) =>
  ok(await session.from("events").select("kind").eq("tenant_id", tenant).in("kind", WROTE), "read")
    .map((r) => r.kind)
    .sort();

test("the owner reads the partner's share with every other event of the workspace", { skip }, async () => {
  assert.deepEqual(await kindsAs(as.owner), ["contact.added", "partner.earned", "partner.paid", "partner.reversed"]);
});

test("an operator and a viewer read every event of the workspace but the partner's share", { skip }, async () => {
  for (const role of ["operator", "viewer"]) {
    assert.deepEqual(await kindsAs(as[role]), ["contact.added"], `${role}: the partner's cut is the owner's to read`);
  }
});
