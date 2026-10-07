/**
 * Durable notifications (00057), proved on a real Postgres with real
 * sessions: a member sees the workspace's rows and a stranger none; the seen
 * mark and the per-row marks are written through their doors as the signed-in
 * person and never for another; a row's marks are read by their owner alone;
 * and the purge is the service role's, refused to a member.
 *
 * Runs the way activations.db.test.mjs does: against the database
 * `supabase start` builds on this machine, never production. Users are made
 * with the admin API and sign in with a password through the anon key, so RLS
 * judges them as the dashboard's client would.
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
      ? "refusing a database that is not on this machine: this suite makes users"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the sessions this suite signs in with need it"
        : false;

let db;
let tenantId;
let otherTenantId;
const users = [];

/** A real session for a fresh user with this role in this workspace. */
async function memberClient(role, tenant = tenantId) {
  const email = `bell-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  const m = await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role });
  assert.equal(m.error, null, m.error?.message);
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  return { client, userId: made.data.user.id };
}

/** A row the edge would keep, written as the service role (the only writer). */
async function row(tenant, over = {}) {
  const r = await db
    .from("notifications")
    .insert({
      tenant_id: tenant,
      kind: "alert",
      title: "A text arrived",
      body: "Kept for the bell.",
      route: "inbox",
      ...over,
    })
    .select("id")
    .single();
  assert.equal(r.error, null, r.error?.message);
  return r.data.id;
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const t = await db
    .from("tenants")
    .insert({ slug: `bell-${Date.now()}`, name: "Bell" })
    .select("id")
    .single();
  assert.equal(t.error, null, t.error?.message);
  tenantId = t.data.id;
  const o = await db
    .from("tenants")
    .insert({ slug: `bell-other-${Date.now()}`, name: "Other" })
    .select("id")
    .single();
  assert.equal(o.error, null, o.error?.message);
  otherTenantId = o.data.id;
});

after(async () => {
  if (skip) return;
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
  if (tenantId) await db.from("tenants").delete().eq("id", tenantId);
  if (otherTenantId) await db.from("tenants").delete().eq("id", otherTenantId);
});

test(
  "a member reads the workspace's rows, a viewer included; a member of another workspace reads none; nobody but the service role writes one",
  { skip },
  async () => {
    const mine = await row(tenantId);
    await row(otherTenantId);
    const viewer = await memberClient("viewer");
    const seen = await viewer.client.from("notifications").select("id, tenant_id, kind, title").order("created_at");
    assert.equal(seen.error, null, seen.error?.message);
    assert.deepEqual(
      seen.data.map((n) => [n.id, n.tenant_id]),
      [[mine, tenantId]],
      "the workspace's rows and no other's",
    );
    const stranger = await memberClient("owner", otherTenantId);
    const theirs = await stranger.client.from("notifications").select("id").eq("tenant_id", tenantId);
    assert.equal(theirs.error, null);
    assert.deepEqual(theirs.data, [], "RLS: a stranger sees nothing of this workspace");
    const written = await viewer.client
      .from("notifications")
      .insert({ tenant_id: tenantId, kind: "alert", title: "Forged", body: "x" });
    assert.notEqual(written.error, null, "a member cannot write a row: the edge writes them with the service role");
  },
);

test(
  "the seen mark: refused signed out, refused to a stranger, written once for this person and refreshed on the next look",
  { skip },
  async () => {
    const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
    const out = await anon.rpc("notifications_seen", { p_tenant_id: tenantId });
    assert.notEqual(out.error, null);
    // The grant refuses anon before the function body can (execute is revoked from anon), so
    // the door is closed a step earlier than the function's own check; either refusal is the fact.
    assert.match(out.error.message, /permission denied for function|Sign in required/);
    const stranger = await memberClient("owner", otherTenantId);
    const notMine = await stranger.client.rpc("notifications_seen", { p_tenant_id: tenantId });
    assert.notEqual(notMine.error, null);
    assert.match(notMine.error.message, /Workspace not found/);
    const member = await memberClient("operator");
    const first = await member.client.rpc("notifications_seen", { p_tenant_id: tenantId });
    assert.equal(first.error, null, first.error?.message);
    assert.equal(first.data.tenant_id, tenantId);
    const reads = await db.from("notification_reads").select("user_id, seen_at").eq("tenant_id", tenantId);
    assert.deepEqual(
      reads.data.map((r) => r.user_id),
      [member.userId],
      "one row per person per workspace",
    );
    const second = await member.client.rpc("notifications_seen", { p_tenant_id: tenantId });
    assert.equal(second.error, null);
    assert.ok(
      Date.parse(second.data.seen_at) >= Date.parse(first.data.seen_at),
      "the next look moves the mark forward, never a second row",
    );
    const again = await db.from("notification_reads").select("user_id").eq("tenant_id", tenantId);
    assert.equal(again.data.length, 1);
    // The mark is the person's own: their session reads it, another member's does not.
    const own = await member.client.from("notification_reads").select("user_id").eq("tenant_id", tenantId);
    assert.deepEqual(
      own.data.map((r) => r.user_id),
      [member.userId],
    );
    const other = await memberClient("viewer");
    const notTheirs = await other.client.from("notification_reads").select("user_id").eq("tenant_id", tenantId);
    assert.deepEqual(notTheirs.data, [], "RLS: a mark is read by its owner alone");
  },
);

test(
  "a row's marks: read sets once and keeps its time, false clears, null keeps; dismissed the same; a stranger's row is not found; the marks are the person's own",
  { skip },
  async () => {
    const id = await row(tenantId);
    const member = await memberClient("operator");
    const read = await member.client.rpc("notification_mark", { p_id: id, p_read: true });
    assert.equal(read.error, null, read.error?.message);
    assert.deepEqual(read.data, { notification_id: id });
    const marks = () =>
      db
        .from("notification_marks")
        .select("read_at, dismissed_at")
        .eq("notification_id", id)
        .eq("user_id", member.userId)
        .maybeSingle();
    const m1 = (await marks()).data;
    assert.ok(m1.read_at && !m1.dismissed_at, "read set, dismissed untouched");
    const again = await member.client.rpc("notification_mark", { p_id: id, p_read: true });
    assert.equal(again.error, null);
    assert.equal(
      (await marks()).data.read_at,
      m1.read_at,
      "true again keeps the first time: coalesce, never a later stamp",
    );
    const dismissed = await member.client.rpc("notification_mark", { p_id: id, p_dismissed: true });
    assert.equal(dismissed.error, null);
    const m2 = (await marks()).data;
    assert.ok(m2.dismissed_at && m2.read_at === m1.read_at, "dismissed set; null for read keeps read");
    const restored = await member.client.rpc("notification_mark", { p_id: id, p_dismissed: false });
    assert.equal(restored.error, null);
    const m3 = (await marks()).data;
    assert.ok(m3.dismissed_at === null && m3.read_at === m1.read_at, "false clears dismissed and only dismissed");
    const stranger = await memberClient("owner", otherTenantId);
    const notFound = await stranger.client.rpc("notification_mark", { p_id: id, p_read: true });
    assert.notEqual(notFound.error, null);
    assert.match(
      notFound.error.message,
      /Notification not found/,
      "a row of another workspace does not exist for a stranger",
    );
    const nobody = await stranger.client.rpc("notification_mark", {
      p_id: "00000000-0000-4000-8000-000000000000",
      p_read: true,
    });
    assert.match(nobody.error.message, /Notification not found/);
    const own = await member.client.from("notification_marks").select("notification_id").eq("notification_id", id);
    assert.deepEqual(
      own.data.map((r) => r.notification_id),
      [id],
    );
    const other = await memberClient("viewer");
    const notTheirs = await other.client.from("notification_marks").select("notification_id").eq("notification_id", id);
    assert.deepEqual(notTheirs.data, [], "RLS: a mark is read by its owner alone");
  },
);

test(
  "the purge is the service role's: a member may not call it; it removes only what is older than the interval, and the marks go with the row",
  { skip },
  async () => {
    const old = await row(tenantId, {
      created_at: new Date(Date.now() - 100 * 86_400_000).toISOString(),
      title: "A season ago",
    });
    const fresh = await row(tenantId, { title: "Today" });
    const member = await memberClient("owner");
    const marked = await member.client.rpc("notification_mark", { p_id: old, p_read: true });
    assert.equal(marked.error, null, marked.error?.message);
    const refused = await member.client.rpc("purge_notifications", { p_keep: "90 days" });
    assert.notEqual(refused.error, null, "revoked from authenticated");
    const purged = await db.rpc("purge_notifications", { p_keep: "90 days" });
    assert.equal(purged.error, null, purged.error?.message);
    assert.ok(purged.data >= 1, "the season-old row went");
    const left = await db.from("notifications").select("id").in("id", [old, fresh]);
    assert.deepEqual(
      left.data.map((r) => r.id),
      [fresh],
      "today's row stays",
    );
    const marks = await db.from("notification_marks").select("notification_id").eq("notification_id", old);
    assert.deepEqual(marks.data, [], "the marks went with their row");
  },
);
