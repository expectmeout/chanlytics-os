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
  "the seen mark: refused signed out, refused to a stranger, written on the one row the seat was given and refreshed on the next look",
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
    // A seat is given its row as it is made (00622): a look moves that row, and never makes a second.
    const rowsOf = () =>
      db.from("notification_reads").select("user_id, seen_at").eq("tenant_id", tenantId).eq("user_id", member.userId);
    const joined = await rowsOf();
    assert.equal(joined.error, null, joined.error?.message);
    assert.equal(joined.data.length, 1, "one row per person per workspace, from the moment they join");
    const first = await member.client.rpc("notifications_seen", { p_tenant_id: tenantId });
    assert.equal(first.error, null, first.error?.message);
    assert.equal(first.data.tenant_id, tenantId);
    assert.ok(
      Date.parse(first.data.seen_at) >= Date.parse(joined.data[0].seen_at),
      "a look moves the mark on from where the seat started",
    );
    const second = await member.client.rpc("notifications_seen", { p_tenant_id: tenantId });
    assert.equal(second.error, null);
    assert.ok(
      Date.parse(second.data.seen_at) >= Date.parse(first.data.seen_at),
      "the next look moves the mark forward, never a second row",
    );
    const again = await rowsOf();
    assert.equal(again.data.length, 1);
    // The mark is the person's own: their session reads it, another member's does not.
    const own = await member.client.from("notification_reads").select("user_id").eq("tenant_id", tenantId);
    assert.deepEqual(
      own.data.map((r) => r.user_id),
      [member.userId],
    );
    const other = await memberClient("viewer");
    const theirs = await other.client.from("notification_reads").select("user_id").eq("tenant_id", tenantId);
    assert.deepEqual(
      theirs.data.map((r) => r.user_id),
      [other.userId],
      "RLS: a mark is read by its owner alone, so another member reads their own and no one else's",
    );
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

test(
  "a member's phone choices are their own (00372): written through member_push_off_set on their own membership, each kind once, read back by them and by nobody else",
  { skip },
  async () => {
    const a = await memberClient("operator");
    const b = await memberClient("owner");
    const set = await a.client.rpc("member_push_off_set", {
      p_tenant_id: tenantId,
      p_kinds: ["review", "call", "review"],
    });
    assert.equal(set.error, null, set.error?.message);
    assert.deepEqual(set.data, ["call", "review"], "kept in order, each once");
    const own = await a.client.from("memberships").select("push_off").eq("tenant_id", tenantId).eq("user_id", a.userId);
    assert.deepEqual(
      own.data,
      [{ push_off: ["call", "review"] }],
      "read back through the row the member already reads",
    );
    const theirs = await b.client.from("memberships").select("push_off").eq("user_id", a.userId);
    assert.deepEqual(theirs.data, [], "another member never reads it");
    const elsewhere = await a.client.rpc("member_push_off_set", { p_tenant_id: otherTenantId, p_kinds: ["call"] });
    assert.equal(elsewhere.error?.code, "42501", "no membership there, nothing written there");
    for (const bad of [["Call!"], ["call", null], Array.from({ length: 41 }, (_, i) => `kind_${i}`)]) {
      const r = await a.client.rpc("member_push_off_set", { p_tenant_id: tenantId, p_kinds: bad });
      assert.equal(r.error?.code, "22023", JSON.stringify(bad).slice(0, 40));
    }
    const back = await a.client.rpc("member_push_off_set", { p_tenant_id: tenantId, p_kinds: [] });
    assert.deepEqual(back.data, [], "everything back on");
    const anon = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    const refused = await anon.rpc("member_push_off_set", { p_tenant_id: tenantId, p_kinds: [] });
    assert.notEqual(refused.error, null, "no session, no door");
  },
);

test(
  "a note left for a member queues the push its bell row is told by (00372), and a note for its own writer neither rings nor pushes",
  { skip },
  async () => {
    const writer = await memberClient("owner");
    const reader = await memberClient("operator");
    const contact = "5a7c1e2d-3b4f-4a6e-8c9d-0e1f2a3b4c5d";
    const rung = await db.rpc("note_for_you_notify", {
      p_tenant_id: tenantId,
      p_contact_id: contact,
      p_note_id: contact,
      p_by: writer.userId,
      p_for: reader.userId,
    });
    assert.equal(rung.error, null, rung.error?.message);
    const kept = await db
      .from("notifications")
      .select("id, recipient_user_id")
      .eq("tenant_id", tenantId)
      .eq("kind", "note_for_you")
      .eq("recipient_user_id", reader.userId);
    assert.equal(kept.data.length, 1);
    const jobs = await db
      .from("jobs")
      .select("kind, payload")
      .eq("tenant_id", tenantId)
      .eq("kind", "push_send")
      .contains("payload", { notification_id: kept.data[0].id });
    assert.equal(jobs.error, null, jobs.error?.message);
    assert.equal(jobs.data.length, 1, "one push_send, naming the row");
    const before = await db.from("notifications").select("id").eq("tenant_id", tenantId).eq("kind", "note_for_you");
    await db.rpc("note_for_you_notify", {
      p_tenant_id: tenantId,
      p_contact_id: contact,
      p_note_id: contact,
      p_by: writer.userId,
      p_for: writer.userId,
    });
    const after_ = await db.from("notifications").select("id").eq("tenant_id", tenantId).eq("kind", "note_for_you");
    assert.equal(after_.data.length, before.data.length, "a note for its own writer rings nobody");
  },
);

test(
  "read through (00614, 00622): a bell starts where its seat joined, again for a member who comes back; a read goes up to the moment asked, never past now and never back, and is a look; a look moves the look alone; Undo goes back to the moment the read answered, never forward",
  { skip },
  async () => {
    const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
    const out = await anon.rpc("notifications_read_through", { p_tenant_id: tenantId });
    assert.match(out.error?.message ?? "", /permission denied for function|Sign in required/);
    const stranger = await memberClient("owner", otherTenantId);
    const notMine = await stranger.client.rpc("notifications_read_through", { p_tenant_id: tenantId });
    assert.match(notMine.error?.message ?? "", /Workspace not found/);

    // Every member may: a viewer reads the bell too.
    const member = await memberClient("viewer");
    const mine = async () => {
      const r = await db
        .from("notification_reads")
        .select("seen_at, read_through_at")
        .eq("tenant_id", tenantId)
        .eq("user_id", member.userId)
        .maybeSingle();
      assert.equal(r.error, null, r.error?.message);
      return r.data;
    };
    const stand = async (at) => {
      const r = await db
        .from("notification_reads")
        .update({ seen_at: at, read_through_at: at })
        .eq("tenant_id", tenantId)
        .eq("user_id", member.userId);
      assert.equal(r.error, null, r.error?.message);
    };
    /** The door: no moment is a read up to now; a moment is its Undo, or with `read` a read up to it. */
    const through = (p_through, read) =>
      member.client.rpc("notifications_read_through", {
        p_tenant_id: tenantId,
        ...(p_through === undefined ? {} : { p_through }),
        ...(read ? { p_read: true } : {}),
      });
    const ms = (iso) => Date.parse(iso);

    // A seat's bell starts when it joins (memberships_start_the_bell): nothing from before is new or unread to them.
    const seat = await db
      .from("memberships")
      .select("created_at")
      .eq("tenant_id", tenantId)
      .eq("user_id", member.userId)
      .single();
    assert.equal(seat.error, null, seat.error?.message);
    const start = await mine();
    assert.deepEqual(
      [ms(start.seen_at), ms(start.read_through_at)],
      [ms(seat.data.created_at), ms(seat.data.created_at)],
      "both moments at the seat's own",
    );

    // As a member who joined an hour ago, the bell open on notes up to half an hour ago.
    const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const listed = new Date(Date.now() - 1_800_000).toISOString();
    await stand(hourAgo);

    // A read up to what the bell listed: no further, and it is a look.
    const read = await through(listed, true);
    assert.equal(read.error, null, read.error?.message);
    assert.equal(ms(read.data.read_through_at), ms(listed), "read up to the moment asked, not up to now");
    assert.equal(ms(read.data.was), ms(hourAgo), "it answers where they stood, which an Undo hands back");
    const held = await mine();
    assert.equal(ms(held.read_through_at), ms(listed));
    assert.ok(ms(held.seen_at) > ms(listed), "a read is also a look: seen_at is now");
    // A tab that listed less than another device has read: nothing moves back, and its Undo would move nothing.
    const stale = await through(new Date(Date.now() - 2_700_000).toISOString(), true);
    assert.equal(stale.error, null, stale.error?.message);
    assert.equal(ms(stale.data.read_through_at), ms(listed), "a read never moves back");
    assert.equal(ms(stale.data.was), ms(listed));
    assert.equal(ms((await mine()).read_through_at), ms(listed));

    // A look moves the look alone.
    const look = await member.client.rpc("notifications_seen", { p_tenant_id: tenantId });
    assert.equal(look.error, null, look.error?.message);
    const looked = await mine();
    assert.equal(looked.read_through_at, held.read_through_at, "a look reads nothing");
    assert.ok(ms(looked.seen_at) >= ms(held.seen_at));

    // Undo: back to the moment the read answered, and the look stays where it is.
    const undo = await through(read.data.was);
    assert.equal(undo.error, null, undo.error?.message);
    const undone = await mine();
    assert.equal(ms(undone.read_through_at), ms(hourAgo));
    assert.equal(undone.seen_at, looked.seen_at, "an Undo leaves the look where it was");

    // An Undo never goes forward: a later moment that is not said to be a read moves nothing.
    const forward = await through(listed);
    assert.equal(forward.error, null, forward.error?.message);
    assert.equal(forward.data.unchanged, true);
    assert.equal(ms((await mine()).read_through_at), ms(hourAgo));

    // No moment is a read up to now, as the build before 00622 sends it: both moments together.
    const all = await through();
    assert.equal(all.error, null, all.error?.message);
    assert.equal(ms(all.data.was), ms(hourAgo));
    const everything = await mine();
    assert.equal(
      everything.read_through_at,
      everything.seen_at,
      "reading everything is also a look: both at one moment",
    );

    // Never past now: a browser whose clock runs an hour ahead reads nothing that has not happened yet.
    const ahead = await through(new Date(Date.now() + 3_600_000).toISOString(), true);
    assert.equal(ahead.error, null, ahead.error?.message);
    const capped = await mine();
    assert.equal(capped.read_through_at, capped.seen_at, "a moment past now is read as now");
    assert.ok(ms(capped.read_through_at) < Date.now() + 60_000);

    // A seat from before 00622 that never looked has no row: it stands where it joined.
    const gone = await db.from("notification_reads").delete().eq("tenant_id", tenantId).eq("user_id", member.userId);
    assert.equal(gone.error, null, gone.error?.message);
    const first = await through();
    assert.equal(first.error, null, first.error?.message);
    assert.equal(ms(first.data.was), ms(seat.data.created_at), "its first read answers the moment it joined");

    // A member who leaves and comes back starts again from the new seat: what happened while they were away is not
    // theirs to read.
    const comeBack = async () => {
      const left = await db.from("memberships").delete().eq("tenant_id", tenantId).eq("user_id", member.userId);
      assert.equal(left.error, null, left.error?.message);
      const back = await db
        .from("memberships")
        .insert({ tenant_id: tenantId, user_id: member.userId, role: "viewer" })
        .select("created_at")
        .single();
      assert.equal(back.error, null, back.error?.message);
      return back.data.created_at;
    };
    await stand(hourAgo);
    const seatAgain = await comeBack();
    const again = await mine();
    assert.deepEqual(
      [ms(again.seen_at), ms(again.read_through_at)],
      [ms(seatAgain), ms(seatAgain)],
      "a row from before the new seat is moved up to it",
    );
    // And what they had read past the new seat is kept: a seat never moves a bell back.
    const later = new Date(Date.now() + 3_600_000).toISOString();
    await stand(later);
    await comeBack();
    const kept = await mine();
    assert.deepEqual([ms(kept.seen_at), ms(kept.read_through_at)], [ms(later), ms(later)]);
  },
);
