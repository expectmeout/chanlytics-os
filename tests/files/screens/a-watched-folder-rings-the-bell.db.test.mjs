/**
 * 00657 on the database: a watched folder rings the bell as its own state turns, and the row closes once it is mended
 * (the footage sources plan's P5, part 2; the screens canvas's Bell board).
 *
 *   1. Google signs the account out: "Google Drive needs you" to whoever may mend it, closed once it is connected again.
 *   2. A folder that can't be opened, and a wave of removals held for a second look: one row each, closed when it ends.
 *   3. The day's new photos and videos: one row for the workspace, counted up in place.
 *   4. Whoever connected it leaves: its folder is read at the next turn of the clock, and once the sync pauses it the
 *      bell says so to those left.
 *   5. A folder's long name still fits a title.
 *
 * Local stack only: it makes workspaces, users and rows with the service key, and removes them.
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
      ? "refusing a database that is not on this machine: this suite makes workspaces, users and rows"
      : false;

const stamp = Date.now().toString(36);
let db;
const tenants = [];
const users = [];
let serial = 0;

const ok = (r, what) => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};

/** A user of the auth store, removed after. */
async function person(name) {
  serial += 1;
  const made = ok(
    await db.auth.admin.createUser({ email: `bell-${stamp}-${serial}@example.com`, email_confirm: true }),
    "a user",
  );
  users.push(made.user.id);
  if (name) ok(await db.from("profiles").upsert({ user_id: made.user.id, display_name: name }), "a name");
  return made.user.id;
}

/** A workspace with an owner, a partner who connected Google Drive, and one watched folder. */
async function workspace(folderName = "Clips") {
  serial += 1;
  const tag = `${stamp}-${serial}`;
  const [tenant] = ok(
    await db
      .from("tenants")
      .insert({ name: `Bell ${tag}`, slug: `bell-${tag}`, timezone: "UTC" })
      .select("id"),
    "the workspace",
  );
  tenants.push(tenant.id);
  const owner = await person(null);
  const partner = await person("Dana");
  ok(
    await db.from("memberships").insert([
      { tenant_id: tenant.id, user_id: owner, role: "owner" },
      { tenant_id: tenant.id, user_id: partner, role: "partner" },
    ]),
    "the members",
  );
  const [connection] = ok(
    await db
      .from("source_connections")
      .insert({
        tenant_id: tenant.id,
        provider: "google",
        provider_account: `bell-${tag}`,
        email: `dana@bell-${tag}.example`,
        connected_by: partner,
      })
      .select("id, email"),
    "the account",
  );
  const [source] = ok(
    await db
      .from("media_sources")
      .insert({
        tenant_id: tenant.id,
        connection_id: connection.id,
        folder_id: `bell-folder-${tag}`,
        folder_name: folderName,
        state: "watching",
      })
      .select("id"),
    "the folder",
  );
  return { T: tenant.id, owner, partner, connection: connection.id, email: connection.email, source: source.id };
}

const bellOf = async (ws) =>
  ok(
    await db
      .from("notifications")
      .select("kind, title, body, subject_type, subject_id, recipient_user_id, closed_at")
      .eq("tenant_id", ws.T)
      .in("kind", ["footage", "footage_in"])
      .order("created_at"),
    "the bell",
  );
const open = (rows) => rows.filter((r) => r.closed_at === null);
const folder = (ws, patch) => db.from("media_sources").update(patch).eq("id", ws.source);
const account = (ws, patch) => db.from("source_connections").update(patch).eq("id", ws.connection);

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
});

after(async () => {
  if (skip) return;
  for (const id of tenants) await db.from("tenants").delete().eq("id", id);
  for (const id of users) await db.auth.admin.deleteUser(id);
});

test(
  "Google signs the account out: whoever may mend it hears once, and the row closes once it is connected again",
  { skip },
  async () => {
    const ws = await workspace();
    ok(await account(ws, { health: "needs_reconnect" }), "signed out");
    ok(await account(ws, { health: "needs_reconnect", updated_at: new Date().toISOString() }), "said again");
    const rung = open(await bellOf(ws));
    assert.deepEqual(rung.map((r) => r.recipient_user_id).sort(), [ws.owner, ws.partner].sort(), "the owner and Dana");
    for (const row of rung) {
      assert.equal(row.kind, "footage");
      assert.equal(row.title, "Google Drive needs you");
      assert.equal(row.body, `Google signed ${ws.email} out. Nothing new comes in.`);
    }
    ok(await account(ws, { health: "ok" }), "connected again");
    assert.equal(open(await bellOf(ws)).length, 0, "mended: closed for everyone");
  },
);

test(
  "a folder that can't be opened and a wave held for a second look: one row each, closed when each ends",
  { skip },
  async () => {
    const ws = await workspace();
    ok(await folder(ws, { state: "frozen" }), "frozen");
    ok(await folder(ws, { hold_at: new Date().toISOString(), hold_count: 23 }), "a wave held");
    const titles = open(await bellOf(ws)).map((r) => r.title);
    assert.ok(titles.includes("Can't open “Clips”"), titles.join(" | "));
    assert.ok(titles.includes("23 files left “Clips” at once"), titles.join(" | "));
    ok(await folder(ws, { state: "watching" }), "thawed");
    assert.deepEqual(
      [...new Set(open(await bellOf(ws)).map((r) => r.title))],
      ["23 files left “Clips” at once"],
      "only the wave is open",
    );
    ok(await folder(ws, { hold_at: null, hold_count: null }), "the second look settled it");
    assert.equal(open(await bellOf(ws)).length, 0);
  },
);

test("the day's new photos and videos are one row for the workspace, counted up in place", { skip }, async () => {
  const ws = await workspace();
  for (const n of [1, 2, 3]) {
    ok(
      await db.from("files").insert({
        tenant_id: ws.T,
        status: "filed",
        source: "drive",
        name: `bell-${stamp}-${n}.jpg`,
        mime: "image/jpeg",
        bytes: 1000 + n,
        fingerprint: `bell-fp-${stamp}-${ws.T}-${n}`,
        kind: "image",
      }),
      `file ${n}`,
    );
    const rows = (await bellOf(ws)).filter((r) => r.kind === "footage_in");
    assert.equal(rows.length, 1, "one row, never one a file");
    assert.equal(rows[0].title, n === 1 ? "1 new photo or video" : `${n} new photos and videos`);
    assert.equal(rows[0].body, "From “Clips” · in your Library");
    assert.equal(rows[0].recipient_user_id, null, "the whole workspace");
  }
});

test(
  "whoever connected it leaves: the folder is read at once, and the pause the sync makes is told to those left",
  { skip },
  async () => {
    const ws = await workspace();
    const far = new Date(Date.now() + 3600_000).toISOString();
    ok(await folder(ws, { next_read_at: far }), "a quiet folder");
    ok(await db.from("memberships").delete().eq("tenant_id", ws.T).eq("user_id", ws.partner), "Dana left");
    const [after] = ok(await db.from("media_sources").select("next_read_at").eq("id", ws.source), "the folder");
    assert.ok(Date.parse(after.next_read_at) <= Date.now() + 1000, "read at the next turn of the clock");
    ok(await folder(ws, { state: "paused", stopped_why: "connector_left" }), "the sync pauses it, and says why");
    const rung = open(await bellOf(ws));
    assert.deepEqual(
      rung.map((r) => r.recipient_user_id),
      [ws.owner],
      "the owner; Dana is gone",
    );
    assert.equal(rung[0].title, "“Clips” is paused");
    assert.equal(rung[0].body, "Dana connected it and has left. Connect your own Google account.");
    ok(await folder(ws, { state: "stopped" }), "let go");
    assert.equal(open(await bellOf(ws)).length, 0, "a folder let go closes its rows");
  },
);

test("a folder's long name is cut to fit a title", { skip }, async () => {
  const ws = await workspace("A".repeat(300));
  ok(await folder(ws, { state: "frozen" }), "frozen");
  const [row] = open(await bellOf(ws));
  assert.ok(row.title.length <= 200, `${row.title.length}`);
  assert.match(row.title, /^Can't open “A+…”$/);
});
