/**
 * Where a file's copies are, on a real database (00686, the archive plan's B1): a connected account's row says which
 * door its key opens, and the code live before the column still writes over its own row; the folder a press saves
 * into, a copy of a file and a copy's pieces refuse the rows that should be impossible; a disconnect leaves every copy
 * known, its connection cleared and its Google account kept; a purged file takes its copies' rows; a member reads
 * their own workspace's and never where a piece sits on the shelf, and writes nothing.
 *
 * In a workspace of its own. Runs against the local stack `supabase start` builds, never production: it makes
 * workspaces, users and rows.
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
      ? "refusing a database that is not on this machine: this suite makes workspaces, users and rows"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the member this suite signs in as needs it"
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
/** A write the database refused: its SQLSTATE and the rule it names. */
const refused = (r, code, rule, what) => {
  assert.equal(r.error?.code, code, `${what}: ${r.error?.message ?? "it went through"}`);
  if (rule) assert.match(r.error.message, new RegExp(rule), what);
};

/** A workspace of its own, with one Google account connected for each door named. */
async function workspace(...doors) {
  serial += 1;
  const tag = `${stamp}-${serial}`;
  const [tenant] = ok(
    await db
      .from("tenants")
      .insert({ name: `Archive ${tag}`, slug: `archive-${tag}` })
      .select("id"),
    "the workspace",
  );
  tenants.push(tenant.id);
  const connections = {};
  for (const door of doors) {
    const [row] = ok(
      await db
        .from("source_connections")
        .insert({
          tenant_id: tenant.id,
          provider: "google",
          provider_account: `archive-${door}-${tag}`,
          email: `sam@archive-${tag}.example`,
          door,
        })
        .select("id, provider_account"),
      `the ${door} account`,
    );
    connections[door] = row;
  }
  return { T: tenant.id, tag, ...connections };
}

/** A video in a workspace's Library, playable and looked at. */
async function video(ws, over = {}) {
  serial += 1;
  const away = ["away", "lost"].includes(over.copy_state);
  const [row] = ok(
    await db
      .from("files")
      .insert({
        tenant_id: ws.T,
        status: "filed",
        source: "drive",
        name: `archive-clip-${stamp}-${serial}`,
        mime: "video/quicktime",
        bytes: 50_000_000,
        fingerprint: `archive-fp-${stamp}-${serial}`,
        kind: "video",
        media_ref: away ? null : `archive-ref-${stamp}-${serial}`,
        media_status: "ready",
        seconds: 60,
        look_status: "done",
        ...over,
      })
      .select("id"),
    "a video",
  );
  return row.id;
}

const copy = (ws, fileId, over = {}) =>
  db
    .from("file_archives")
    .insert({ tenant_id: ws.T, file_id: fileId, origin: "shelf", ...over })
    .select("id, state");
const piece = (ws, archiveId, over = {}) =>
  db
    .from("file_archive_parts")
    .insert({ tenant_id: ws.T, archive_id: archiveId, part: "video", bytes: 1000, ...over })
    .select("id");
const SHA = "a".repeat(64);

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
});

after(async () => {
  if (skip) return;
  await db.from("source_connections").delete().in("tenant_id", tenants);
  await db.from("files").delete().in("tenant_id", tenants);
  await db.from("archive_folders").delete().in("tenant_id", tenants);
  await db.from("memberships").delete().in("tenant_id", tenants);
  await db.from("tenants").delete().in("id", tenants);
  for (const id of users) await db.auth.admin.deleteUser(id);
});

test(
  "a row written with no door is a watched folder's, and the key of three still writes over it",
  { skip },
  async () => {
    const ws = await workspace();
    const row = {
      tenant_id: ws.T,
      provider: "google",
      provider_account: `archive-old-${ws.tag}`,
      email: `sam@archive-${ws.tag}.example`,
    };
    const [first] = ok(
      await db.from("source_connections").insert(row).select("id, door"),
      "as the code before 00686 writes",
    );
    assert.equal(first.door, "watch");
    // The code live before the column: a reconnect writes over its own row by the three-column key.
    const again = ok(
      await db
        .from("source_connections")
        .upsert(
          { ...row, email: `sam.again@archive-${ws.tag}.example` },
          { onConflict: "tenant_id,provider,provider_account" },
        )
        .select("id"),
      "the old key",
    );
    assert.equal(again[0].id, first.id);
    // The code that follows: by the key of four, the same row.
    const byDoor = ok(
      await db
        .from("source_connections")
        .upsert({ ...row, door: "watch" }, { onConflict: "tenant_id,provider,provider_account,door" })
        .select("id"),
      "the new key",
    );
    assert.equal(byDoor[0].id, first.id);
    assert.equal(ok(await db.from("source_connections").select("id").eq("tenant_id", ws.T), "its rows").length, 1);
    refused(
      await db.from("source_connections").update({ door: "other" }).eq("id", first.id),
      "23514",
      "source_connections_door_check",
      "a door that is not one of the two",
    );
    // B1 keeps the old key beside the new: a second door for one account waits for the step that drops it.
    refused(
      await db.from("source_connections").insert({ ...row, door: "save" }),
      "23505",
      "source_connections_one_account",
      "a second door for the account, while the key of three stands",
    );
  },
);

test("the tables refuse a copy that says two things at once", { skip }, async () => {
  const ws = await workspace("save");
  const account = ws.save.provider_account;
  const file = await video(ws);
  const other = await video(ws);
  const [shelf] = ok(await copy(ws, file), "a shelf copy");
  assert.equal(shelf.state, "saving", "a copy starts as being sent");
  const [saved] = ok(
    await copy(ws, file, { origin: "saved", google_account: account, connection_id: ws.save.id }),
    "a saved copy",
  );
  ok(
    await copy(ws, file, { origin: "saved", google_account: `${account}-second` }),
    "a saved copy for a second account",
  );
  refused(await copy(ws, file), "23505", "file_archives_one_shelf_copy", "a second shelf copy of one file");
  refused(
    await copy(ws, file, { origin: "saved", google_account: account }),
    "23505",
    "file_archives_one_copy_an_account",
    "a second saved copy for the same account",
  );
  refused(
    await copy(ws, other, { google_account: account }),
    "23514",
    "file_archives_account_shape",
    "a shelf copy naming an account",
  );
  refused(
    await copy(ws, other, { origin: "saved" }),
    "23514",
    "file_archives_account_shape",
    "a saved copy naming none",
  );
  refused(
    await db.from("file_archives").update({ connection_id: ws.save.id }).eq("id", shelf.id),
    "23514",
    "file_archives_shelf_has_no_connection",
    "a shelf copy with a connection",
  );
  refused(
    await copy(ws, other, { origin: "mirror", google_account: account }),
    "23514",
    "file_archives_origin_check",
    "an origin",
  );
  const change = (patch) => db.from("file_archives").update(patch).eq("id", saved.id);
  refused(
    await change({ why: "drive_full" }),
    "23514",
    "file_archives_why_shape",
    "a reason on a copy that did not fail",
  );
  refused(await change({ state: "failed" }), "23514", "file_archives_why_shape", "a failed copy with no reason");
  refused(
    await change({ state: "failed", why: "cosmic_rays" }),
    "23514",
    "file_archives_why_check",
    "a reason off the list",
  );
  refused(await change({ state: "checked" }), "23514", "file_archives_checked_shape", "checked, with no time it was");
  ok(await change({ state: "failed", why: "drive_full" }), "a failed copy with its reason");
  ok(await change({ state: "saving", why: null }), "tried again, the reason cleared");

  ok(await piece(ws, saved.id, { drive_file_id: "drive-file-1" }), "a piece in the owner's Drive");
  ok(await piece(ws, shelf.id, { shelf_key: "t/f/video.mp4", sha256: SHA }), "a piece on the shelf");
  refused(
    await piece(ws, saved.id, { part: "portrait", drive_file_id: "d", shelf_key: "s" }),
    "23514",
    "file_archive_parts_one_place",
    "a piece in Drive and on the shelf at once",
  );
  refused(
    await piece(ws, saved.id, { part: "portrait" }),
    "23514",
    "file_archive_parts_one_place",
    "a piece that is nowhere",
  );
  refused(
    await piece(ws, saved.id, { drive_file_id: "drive-file-2" }),
    "23505",
    "file_archive_parts_one_a_copy",
    "a second video piece",
  );
  refused(
    await piece(ws, saved.id, { part: "square", drive_file_id: "d", md5: "ABC" }),
    "23514",
    "file_archive_parts_md5_check",
    "a checksum that is not one",
  );
  refused(
    await piece(ws, saved.id, {
      part: "story",
      drive_file_id: "d",
      state: "checked",
      checked_at: new Date().toISOString(),
    }),
    "23514",
    "file_archive_parts_checked_shape",
    "a checked piece with no checksum",
  );
  refused(
    await piece(ws, saved.id, { part: "thumbnail", drive_file_id: "d" }),
    "23514",
    "file_archive_parts_part_check",
    "a piece",
  );
  // The house fence: a copy names its file, and a piece its copy, with the workspace.
  const elsewhere = await workspace();
  const theirs = await video(elsewhere);
  refused(
    await copy(ws, theirs),
    "23503",
    "file_archives_file_id_same_workspace",
    "a copy of another workspace's file",
  );
  // A piece of a kind the copy does not hold yet, so the one rule it meets is the fence (its video piece is there:
  // a second would meet the one-a-copy key first).
  refused(
    await piece(elsewhere, shelf.id, { part: "original", shelf_key: "k" }),
    "23503",
    "file_archive_parts_archive_id_same_workspace",
    "a piece of another workspace's copy",
  );
});

test("a disconnect leaves every copy known, and a purged file takes its copies' rows", { skip }, async () => {
  const ws = await workspace("save");
  const account = ws.save.provider_account;
  const file = await video(ws);
  const [folder] = ok(
    await db
      .from("archive_folders")
      .insert({
        tenant_id: ws.T,
        google_account: account,
        connection_id: ws.save.id,
        folder_id: "f-root",
        made_folder_id: "f-made",
        added_folder_id: "f-added",
      })
      .select("id, state"),
    "the folder a press saves into",
  );
  assert.equal(folder.state, "ready");
  refused(
    await db
      .from("archive_folders")
      .insert({ tenant_id: ws.T, google_account: account, folder_id: "x", made_folder_id: "y", added_folder_id: "z" }),
    "23505",
    "archive_folders_one_account",
    "a second folder for the account",
  );
  const [saved] = ok(
    await copy(ws, file, { origin: "saved", google_account: account, connection_id: ws.save.id }),
    "a saved copy",
  );
  ok(await piece(ws, saved.id, { drive_file_id: "drive-file-1" }), "its piece");

  ok(await db.from("source_connections").delete().eq("id", ws.save.id), "the account disconnected");
  const [folderNow] = ok(
    await db.from("archive_folders").select("connection_id, google_account").eq("id", folder.id),
    "the folder",
  );
  assert.deepEqual(
    folderNow,
    { connection_id: null, google_account: account },
    "the folder stays, known by its account",
  );
  const [copyNow] = ok(
    await db.from("file_archives").select("connection_id, google_account, tenant_id").eq("id", saved.id),
    "the copy",
  );
  assert.deepEqual(copyNow, { connection_id: null, google_account: account, tenant_id: ws.T }, "and so does the copy");
  assert.equal(ok(await db.from("file_archive_parts").select("id").eq("archive_id", saved.id), "its pieces").length, 1);

  ok(await db.from("files").delete().eq("id", file), "the file purged");
  assert.equal(ok(await db.from("file_archives").select("id").eq("file_id", file), "its copies").length, 0);
  assert.equal(
    ok(await db.from("file_archive_parts").select("id").eq("archive_id", saved.id), "their pieces").length,
    0,
  );
});

test(
  "a member reads their workspace's copies, never a shelf key or a checksum, and writes nothing",
  { skip },
  async () => {
    const ws = await workspace("save");
    const file = await video(ws);
    const [shelf] = ok(await copy(ws, file), "a shelf copy");
    ok(await piece(ws, shelf.id, { shelf_key: "t/f/video.mp4", sha256: SHA }), "its piece");
    const [saved] = ok(
      await copy(ws, file, { origin: "saved", google_account: ws.save.provider_account }),
      "a saved copy",
    );
    ok(await piece(ws, saved.id, { drive_file_id: "drive-file-1" }), "its piece");
    const elsewhere = await workspace();
    ok(await copy(elsewhere, await video(elsewhere)), "another workspace's copy");

    const email = `archive-viewer-${stamp}@example.com`;
    const password = `pw-${stamp}-archive-Aa1!`;
    const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
    assert.equal(made.error, null, made.error?.message);
    users.push(made.data.user.id);
    ok(
      await db.from("memberships").insert({ tenant_id: ws.T, user_id: made.data.user.id, role: "viewer" }),
      "the seat",
    );
    const member = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    ok(await member.auth.signInWithPassword({ email, password }), "the viewer signs in");

    const copies = ok(
      await member.from("file_archives").select("id, origin, state, why, google_account"),
      "the copies",
    );
    assert.deepEqual(copies.map((row) => row.origin).sort(), ["saved", "shelf"], "their workspace's, and no other's");
    const pieces = ok(
      await member.from("file_archive_parts").select("part, drive_file_id, bytes, state"),
      "the pieces",
    );
    assert.deepEqual(
      pieces.map((row) => row.drive_file_id).sort(),
      ["drive-file-1", null].sort(),
      "a Drive file's id, to open it there",
    );
    for (const column of ["shelf_key", "md5", "sha256", "*"])
      refused(await member.from("file_archive_parts").select(column), "42501", null, `a member reads ${column}`);
    refused(
      await member.from("file_archives").insert({ tenant_id: ws.T, file_id: file, origin: "shelf" }),
      "42501",
      null,
      "a member adds",
    );
    for (const table of ["archive_folders", "file_archives", "file_archive_parts"]) {
      refused(
        await member.from(table).update({ updated_at: new Date().toISOString() }).eq("tenant_id", ws.T),
        "42501",
        null,
        table,
      );
      refused(await member.from(table).delete().eq("tenant_id", ws.T), "42501", null, table);
    }
    const anon = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    for (const table of ["archive_folders", "file_archives", "file_archive_parts"])
      refused(await anon.from(table).select("id"), "42501", null, `nobody signed in reads ${table}`);
  },
);
