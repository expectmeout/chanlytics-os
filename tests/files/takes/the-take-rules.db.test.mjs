/**
 * Taking a watched folder's file in, on a real database (00642, the footage sources plan's P3): the clip's door judges
 * room from the clip's own length before a copy is named, then writes the row and its origin in one write; the clock's
 * hand-out moves what waits to taking with its job, once, for one workspace or for all, while a workspace has room in
 * flight and the video platform has room for a clip, and never for a paused kind; freed room releases what waited for
 * it; an item's reason is one of a closed set; a clip its provider never measured is judged as the video platform
 * says its length; the day's budgets bind in one place, a day as Google counts one; and none of it is a member's to
 * call, nor the platform's day a member's to read.
 *
 * In workspaces of its own, so no other test's files, items or budgets are counted. The platform's day is one row every
 * suite shares, so it is judged by what a call adds to it, never by what it holds.
 *
 * Runs against the local stack `supabase start` builds, never production: it makes workspaces, users and rows.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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
const HUGE = 9_000_000_000_000_000;
let db;
let A;
let B;
let sourceA;
let sourceB;
let member;
const users = [];

const ok = (r, what) => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};

/** A watched folder in a workspace, through an account of its own. */
async function folderIn(tenant, name, state = "watching") {
  const [connection] = ok(
    await db
      .from("source_connections")
      .insert({
        tenant_id: tenant,
        provider: "google",
        provider_account: `takes-${name}-${stamp}`,
        email: `sam@takes-${name}-${stamp}.example`,
      })
      .select("id"),
    "the account",
  );
  const [source] = ok(
    await db
      .from("media_sources")
      .insert({
        tenant_id: tenant,
        connection_id: connection.id,
        folder_id: `takes-folder-${name}-${stamp}`,
        folder_name: "Clips",
        state,
      })
      .select("id"),
    "the folder",
  );
  return source.id;
}

/** One item as the sync lists it. */
async function item(over = {}) {
  const [row] = ok(
    await db
      .from("source_items")
      .insert({
        tenant_id: A,
        source_id: sourceA,
        provider_id: `takes-item-${randomUUID()}`,
        kind: "video",
        name: "clip.mov",
        state: "waiting",
        modified_at: new Date().toISOString(),
        ...over,
      })
      .select("*"),
    "an item",
  );
  return row;
}
const itemNow = async (id) => ok(await db.from("source_items").select("*").eq("id", id).single(), "the item");
const takeJobsOf = async (tenant, itemId) =>
  ok(
    await db
      .from("jobs")
      .select("payload, state")
      .eq("tenant_id", tenant)
      .eq("kind", "source_take")
      .eq("payload->>item_id", itemId),
    "the take's jobs",
  );

/** The clip's door, judging only (no copy named) or writing (one named). */
const sourced = (itemId, over = {}) =>
  db.rpc("file_video_sourced", {
    p_tenant_id: A,
    p_id: randomUUID(),
    p_item_id: itemId,
    p_media_ref: null,
    p_name: "clip",
    p_mime: "video/quicktime",
    p_bytes: 255_147_868,
    p_seconds: 38.1,
    p_fingerprint: `fp-${randomUUID()}`,
    ...over,
  });
const spend = (itemId, over = {}) =>
  db.rpc("source_take_spend", {
    p_tenant_id: A,
    p_item_id: itemId,
    p_bytes: 1_000,
    p_units: 205,
    p_platform_bytes_max: HUGE,
    p_workspace_bytes_max: HUGE,
    p_workspace_takes_max: 1_000_000,
    p_units_max: HUGE,
    ...over,
  });
/** The hand-out for workspace A, with room for every clip at the video platform unless a case says otherwise. */
const handOut = (over = {}) =>
  db.rpc("source_takes_hand_out", {
    p_tenant_id: A,
    p_in_flight: 5,
    p_limit: 10_000,
    p_stale_seconds: 7_200,
    p_videos_max: 1_000_000,
    ...over,
  });
/** The platform's day as it stands: the row of the day Google is in. */
async function dayNow() {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
  const row = ok(await db.from("source_days").select("*").eq("day", day).maybeSingle(), "the day");
  return { bytes: Number(row?.bytes ?? 0), takes: Number(row?.takes ?? 0), units: Number(row?.units ?? 0) };
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const tenants = ok(
    await db
      .from("tenants")
      .insert([
        { name: `Takes A ${stamp}`, slug: `takes-a-${stamp}` },
        { name: `Takes B ${stamp}`, slug: `takes-b-${stamp}` },
      ])
      .select("id"),
    "the workspaces",
  );
  A = tenants[0].id;
  B = tenants[1].id;
  sourceA = await folderIn(A, "a");
  sourceB = await folderIn(B, "b");
  const email = `takes-owner-${stamp}@example.com`;
  const password = `pw-${stamp}-takes-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: A, user_id: made.data.user.id, role: "owner" }), "the seat");
  member = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await member.auth.signInWithPassword({ email, password }), "the owner signs in");
});

after(async () => {
  if (skip) return;
  const all = [A, B];
  await db.from("jobs").delete().in("tenant_id", all);
  await db.from("events").delete().in("tenant_id", all);
  await db.from("source_items").delete().in("tenant_id", all);
  await db.from("media_sources").delete().in("tenant_id", all);
  await db.from("source_connections").delete().in("tenant_id", all);
  await db.from("files").delete().in("tenant_id", all);
  await db.from("files_let_go").delete().in("tenant_id", all);
  await db.from("memberships").delete().in("tenant_id", all);
  await db.from("tenants").delete().in("id", all);
  for (const id of users) await db.auth.admin.deleteUser(id);
});

test(
  "the clip's door judges with no copy named and writes nothing; with one it writes the row and its origin",
  { skip },
  async () => {
    const clip = await item();
    const fingerprint = `fp-clip-${stamp}`;
    assert.deepEqual(ok(await sourced(clip.id, { p_fingerprint: fingerprint }), "judged"), {
      fate: "room",
      file_id: null,
    });
    assert.equal(
      ok(await db.from("files").select("id").eq("tenant_id", A).eq("fingerprint", fingerprint), "files").length,
      0,
    );

    const id = randomUUID();
    const mediaRef = `takes-copy-${stamp}`;
    const written = ok(
      await sourced(clip.id, { p_id: id, p_media_ref: mediaRef, p_fingerprint: fingerprint }),
      "written",
    );
    assert.deepEqual(written, { fate: "kept", file_id: id, media_ref: mediaRef });
    const row = ok(await db.from("files").select("*").eq("id", id).single(), "the row");
    assert.deepEqual(
      [
        row.kind,
        row.status,
        row.source,
        row.media_status,
        row.media_ref,
        Number(row.bytes),
        Number(row.seconds),
        row.mime,
      ],
      ["video", "filed", "drive", "uploading", mediaRef, 255_147_868, 38.1, "video/quicktime"],
    );
    assert.equal((await itemNow(clip.id)).file_id, id, "the item is the file's origin from the same write");
    const events = ok(
      await db.from("events").select("data").eq("tenant_id", A).eq("kind", "file.added").eq("data->>file_id", id),
      "events",
    );
    assert.deepEqual(
      events.map((e) => [e.data.source, e.data.kind]),
      [["drive", "video"]],
    );

    // Asked again after a lost answer: the same answer, with the copy the row holds, and no second row.
    assert.deepEqual(
      ok(await sourced(clip.id, { p_id: id, p_media_ref: "another-copy", p_fingerprint: fingerprint }), "asked again"),
      { fate: "kept", file_id: id, media_ref: mediaRef },
    );
    // The same bytes by another origin: one file, named, and nothing written.
    const second = await item();
    assert.deepEqual(ok(await sourced(second.id, { p_fingerprint: fingerprint }), "a twin"), {
      fate: "here",
      file_id: id,
    });
    assert.equal((await itemNow(second.id)).file_id, null, "the door links only a row it writes");
  },
);

test(
  "what its owner removed is not brought back, and the videos' room is judged by the clip's own length",
  { skip },
  async () => {
    const letGo = `fp-let-go-${stamp}`;
    ok(await db.from("files_let_go").insert({ tenant_id: A, fingerprint: letGo }), "let go");
    const clip = await item();
    assert.deepEqual(ok(await sourced(clip.id, { p_fingerprint: letGo }), "let go"), { fate: "let_go", file_id: null });

    // Workspace B, of its own: 59 minutes 30 seconds of video already kept.
    const inB = await item({ tenant_id: B, source_id: sourceB });
    const forB = (over) => sourced(inB.id, { p_tenant_id: B, ...over });
    ok(
      await db.rpc("file_video_begin", {
        p_tenant_id: B,
        p_id: randomUUID(),
        p_media_ref: `takes-kept-${stamp}`,
        p_name: "kept",
        p_mime: "video/mp4",
        p_bytes: 1000,
        p_fingerprint: `fp-kept-${stamp}`,
        p_seconds: 3_570,
      }),
      "what is kept",
    );
    assert.deepEqual(ok(await forB({ p_seconds: 38.1 }), "38 seconds into 30"), { fate: "minutes", file_id: null });
    assert.deepEqual(ok(await forB({ p_seconds: 30 }), "30 seconds into 30"), { fate: "room", file_id: null });
    assert.deepEqual(ok(await forB({ p_seconds: null }), "no length said, room left"), { fate: "room", file_id: null });
    ok(await forB({ p_seconds: 30, p_media_ref: `takes-fills-${stamp}` }), "the hour filled");
    assert.deepEqual(ok(await forB({ p_seconds: null }), "no length said, the hour full"), {
      fate: "minutes",
      file_id: null,
    });
    assert.deepEqual(ok(await forB({ p_seconds: 1 }), "one second more"), { fate: "minutes", file_id: null });
  },
);

test(
  "the hand-out moves what waits and is due to taking with its job, newest first, while its workspace has room in flight, and once",
  { skip },
  async () => {
    // What the cases before this left waiting in the workspace is set aside, so only this case's items are due.
    ok(
      await db.from("source_items").update({ state: "listed" }).eq("tenant_id", A).eq("state", "waiting"),
      "what earlier cases left",
    );
    const older = await item({ modified_at: "2026-11-01T10:00:00Z" });
    const newer = await item({ modified_at: "2026-11-16T10:00:00Z", kind: "image", name: "photo.jpg" });
    const newest = await item({ modified_at: "2026-11-17T10:00:00Z", take_tries: 1 });
    const notYet = await item({
      take_after: new Date(Date.now() + 3_600_000).toISOString(),
      modified_at: "2026-11-18T10:00:00Z",
    });
    const folder = await item({ kind: "folder", name: "Sub", modified_at: "2026-11-18T11:00:00Z" });
    const listed = await item({ state: "listed", modified_at: "2026-11-18T12:00:00Z" });
    const paused = await folderIn(A, "paused", "paused");
    const inPaused = await item({ source_id: paused, modified_at: "2026-11-18T13:00:00Z" });

    assert.equal(ok(await handOut({ p_in_flight: 2 }), "handed out"), 2);
    const states = async (...rows) => Promise.all(rows.map(async (row) => (await itemNow(row.id)).state));
    assert.deepEqual(
      await states(newest, newer, older),
      ["taking", "taking", "waiting"],
      "the two newest: what the workspace may have in flight, and no more",
    );
    assert.deepEqual(await states(notYet, folder, listed, inPaused), ["waiting", "waiting", "listed", "waiting"]);
    const [job] = await takeJobsOf(A, newest.id);
    assert.deepEqual([job.payload.item_id, job.payload.try, job.state], [newest.id, "1", "scheduled"]);
    assert.equal((await takeJobsOf(A, newer.id)).length, 1);

    // Two are in flight: asked again with room for two it hands nothing; with room for three, the one left. And it
    // writes no second job for what is already taking.
    assert.equal(ok(await handOut({ p_in_flight: 2 }), "no room in flight"), 0);
    assert.deepEqual(await states(older), ["waiting"]);
    assert.equal(ok(await handOut({ p_in_flight: 3 }), "room for one more"), 1);
    assert.deepEqual(await states(older), ["taking"]);
    assert.equal((await takeJobsOf(A, newest.id)).length, 1);
    assert.equal((await takeJobsOf(A, inPaused.id)).length, 0, "a paused folder's file is handed no job");

    // A take that never ended (taking, no file, not written since) waits again and is handed its job in the same turn;
    // one whose file exists is the video platform's to finish, and is never put back. Asked with no staleness at all,
    // since a row's last write is the trigger's to stamp and a test cannot age one.
    const asked = await item({ state: "taking" });
    ok(await sourced(asked.id, { p_media_ref: `takes-asked-${stamp}` }), "its file");
    const lost = await item({ state: "taking" });
    assert.equal((await takeJobsOf(A, lost.id)).length, 0);
    ok(await handOut({ p_in_flight: 50, p_stale_seconds: 0 }), "a turn that takes up what never ended");
    assert.deepEqual(await states(lost, asked), ["taking", "taking"]);
    assert.equal((await takeJobsOf(A, lost.id)).length, 1, "put back to wait and handed its job again");
    assert.equal((await itemNow(lost.id)).why, "lost", "and it says it was lost, so its take clears a copy it left");
    assert.equal((await takeJobsOf(A, asked.id)).length, 0, "a clip with the video platform is left as it stands");

    // A video its provider has not measured waits for its length as long as the sync says (00641 length_until), and
    // is handed its job once that is over.
    const unmeasured = await item({
      length_until: new Date(Date.now() + 3_600_000).toISOString(),
      modified_at: "2026-11-18T14:00:00Z",
    });
    const waitOver = await item({
      length_until: new Date(Date.now() - 1_000).toISOString(),
      modified_at: "2026-11-18T14:00:00Z",
    });
    ok(await handOut({ p_in_flight: 50 }), "a turn with a video still unmeasured");
    assert.deepEqual(await states(unmeasured, waitOver), ["waiting", "taking"]);
    assert.equal((await takeJobsOf(A, unmeasured.id)).length, 0, "no job while its length is waited for");
    assert.equal((await takeJobsOf(A, waitOver.id)).length, 1);

    // An item that was in, left its folder and came back holds the file it had. Left taking with it and never run,
    // it waits again as a lost take does, its file still on its row: its next take finds it. A clip on its way at the
    // video platform is still left.
    const back = await item({ state: "taking" });
    const backRef = `takes-back-${stamp}`;
    ok(await sourced(back.id, { p_media_ref: backRef }), "the file it holds");
    ok(
      await db.rpc("file_media_ready", { p_media_ref: backRef, p_seconds: 38.1, p_width: 1080, p_height: 1920 }),
      "its clip is playable: no longer on its way",
    );
    assert.equal((await takeJobsOf(A, back.id)).length, 0);
    ok(await handOut({ p_in_flight: 50, p_stale_seconds: 0 }), "a turn that takes up a take that holds a file");
    const again = await itemNow(back.id);
    assert.deepEqual([again.state, again.why, Boolean(again.file_id)], ["taking", "lost", true]);
    assert.equal((await takeJobsOf(A, back.id)).length, 1, "handed its job again, with its file");
    assert.equal((await takeJobsOf(A, asked.id)).length, 0, "and the clip on its way is still left");
  },
);

test(
  "the video platform's room holds clips back and never photos; the clock's form asks for every workspace; a paused kind is handed nothing",
  { skip },
  async () => {
    const [made] = ok(
      await db
        .from("tenants")
        .insert({ name: `Takes C ${stamp}`, slug: `takes-c-${stamp}` })
        .select("id"),
      "a workspace of its own",
    );
    const C = made.id;
    try {
      const folder = await folderIn(C, "c");
      const inC = (over) => item({ tenant_id: C, source_id: folder, ...over });
      const clips = [
        await inC({ modified_at: "2026-11-17T10:00:00Z" }),
        await inC({ modified_at: "2026-11-16T10:00:00Z" }),
      ];
      const photo = await inC({ kind: "image", name: "photo.jpg", modified_at: "2026-11-15T10:00:00Z" });
      const forC = (over = {}) => handOut({ p_tenant_id: C, ...over });
      const state = async (row) => (await itemNow(row.id)).state;

      // Paused (the off switch): nothing is handed, and nothing changes.
      ok(await db.rpc("job_kind_pause", { p_kind: "source_take", p_why: "a test of the off switch" }), "paused");
      try {
        assert.equal(ok(await forC(), "handed out while paused"), 0);
        assert.equal(ok(await forC({ p_tenant_id: null }), "the clock's turn while paused"), 0);
        assert.deepEqual([await state(clips[0]), await state(photo)], ["waiting", "waiting"]);
      } finally {
        ok(await db.rpc("job_kind_resume", { p_kind: "source_take" }), "resumed");
      }

      // The platform has no room for a clip: the photo is handed, and the clips wait for the next turn.
      assert.equal(ok(await forC({ p_videos_max: 0 }), "no room at the video platform"), 1);
      assert.deepEqual(
        [await state(photo), await state(clips[0]), await state(clips[1])],
        ["taking", "waiting", "waiting"],
      );
      // The clock's form, with no workspace named, hands every workspace's: ours among them.
      ok(await forC({ p_tenant_id: null }), "the clock's turn");
      assert.deepEqual([await state(clips[0]), await state(clips[1])], ["taking", "taking"]);
    } finally {
      await db.from("jobs").delete().eq("tenant_id", C);
      await db.from("source_items").delete().eq("tenant_id", C);
      await db.from("media_sources").delete().eq("tenant_id", C);
      await db.from("source_connections").delete().eq("tenant_id", C);
      await db.from("tenants").delete().eq("id", C);
    }
  },
);

test(
  "freed room releases what waited for it, an item's reason is one of a closed set, and the Library's thousand is asked in one place",
  { skip },
  async () => {
    const later = new Date(Date.now() + 6 * 3_600_000).toISOString();
    const forRoom = await item({ why: "room", take_after: later });
    const forLibrary = await item({ why: "library_full", take_after: later, kind: "image", name: "p.jpg" });
    const forTomorrow = await item({ why: "budget", take_after: later });
    const after = async (row) => (await itemNow(row.id)).take_after;

    // A photo leaves the Library: what waited for room in the Library is due; what waited for the videos still waits.
    const photoId = randomUUID();
    ok(
      await db.rpc("file_found", {
        p_tenant_id: A,
        p_id: photoId,
        p_status: "filed",
        p_source: "drive",
        p_source_ref: null,
        p_name: `released-photo-${stamp}`,
        p_mime: "image/jpeg",
        p_bytes: 2000,
        p_fingerprint: `fp-released-photo-${stamp}`,
        p_width: 1000,
        p_height: 1000,
        p_shows: null,
        p_edition: 1,
      }),
      "a photo",
    );
    ok(await db.from("files").update({ removed_at: new Date().toISOString() }).eq("id", photoId), "it is removed");
    assert.equal(await after(forLibrary), null, "due at once");
    assert.ok(await after(forRoom), "a photo frees no minutes");

    // A video leaves: what waited for room in the videos is due. A day's budget is not room, and still waits.
    const clip = await item({ state: "taking" });
    const videoId = randomUUID();
    ok(await sourced(clip.id, { p_id: videoId, p_media_ref: `takes-released-${stamp}` }), "a clip");
    ok(await db.from("files").update({ removed_at: new Date().toISOString() }).eq("id", videoId), "it is removed");
    assert.equal(await after(forRoom), null, "due at once");
    assert.ok(await after(forTomorrow), "tomorrow is still tomorrow");

    // Why an item stands where it does is one of the contract's reasons, or nothing.
    const unknown = await db.from("source_items").update({ why: "because" }).eq("id", forTomorrow.id);
    assert.equal(unknown.error?.code, "23514", "a reason no screen has words for is refused");
    ok(await db.from("source_items").update({ why: "busy" }).eq("id", forTomorrow.id), "one of the set");
    // The sync's own reason for an item its provider no longer shows (00639's free text until this check).
    ok(await db.from("source_items").update({ why: "not_found" }).eq("id", forTomorrow.id), "the sync's reason");

    assert.equal(ok(await db.rpc("files_are_full", { p_tenant_id: A }), "the thousand"), false);
    const asMember = await member.rpc("files_are_full", { p_tenant_id: A });
    assert.ok(asMember.error, "the doors' own: a member's session is refused it");
  },
);

test(
  "a clip its provider never measured is judged as the video platform says its length: too long, or no room, and it is removed",
  { skip },
  async () => {
    const ready = (mediaRef, seconds) =>
      db.rpc("file_media_ready", { p_media_ref: mediaRef, p_seconds: seconds, p_width: 1080, p_height: 1920 });
    const rowOf = async (id) => ok(await db.from("files").select("*").eq("id", id).single(), "the row");

    // Too long: removed, why kept on the row with the length it turned out to have, and never let go (its owner
    // removed nothing). The item still names it: the caller settles the item, as it does for a clip that failed.
    const long = await item({ state: "taking" });
    const longId = randomUUID();
    const longRef = `takes-unmeasured-long-${stamp}`;
    const fingerprint = `fp-unmeasured-long-${stamp}`;
    ok(
      await sourced(long.id, { p_id: longId, p_media_ref: longRef, p_seconds: null, p_fingerprint: fingerprint }),
      "taken by its size alone",
    );
    const passed = ok(await ready(longRef, 700), "eleven minutes forty, the platform says");
    assert.deepEqual([passed.fate, passed.why, passed.file_id], ["passed", "long", longId]);
    const row = await rowOf(longId);
    assert.ok(row.removed_at);
    assert.deepEqual([row.media_error, Number(row.seconds)], ["too_long", 700]);
    assert.equal(
      ok(
        await db.from("files_let_go").select("fingerprint").eq("tenant_id", A).eq("fingerprint", fingerprint),
        "let go",
      ).length,
      0,
    );
    assert.equal((await itemNow(long.id)).file_id, longId, "the item is the caller's to settle");
    assert.equal(ok(await ready(longRef, 700), "said again").fate, "gone");

    // One the provider had measured is never judged again here, whatever the platform says of it.
    const measured = await item({ state: "taking" });
    const measuredRef = `takes-measured-${stamp}`;
    ok(await sourced(measured.id, { p_media_ref: measuredRef, p_seconds: 38.1 }), "taken by its length");
    assert.equal(ok(await ready(measuredRef, 700), "the platform disagrees").fate, "ready");
  },
);

test(
  "the day's budgets bind in one place: the workspace's takes and bytes, the platform's bytes and units",
  { skip },
  async () => {
    const first = await item();
    const second = await item();
    const before = await dayNow();
    assert.deepEqual(ok(await spend(first.id, { p_bytes: 5_000 }), "the first take"), { fate: "go" });
    const spent = await dayNow();
    assert.deepEqual(
      [spent.bytes - before.bytes, spent.takes - before.takes, spent.units - before.units],
      [5_000, 1, 0],
      "the bytes and the take are counted; the units are only judged here",
    );
    const taken = await itemNow(first.id);
    assert.ok(taken.taken_at, "the item is counted in its workspace's day");
    assert.equal(Number(taken.bytes), 5_000);

    // The workspace's day is one take long: the second waits, until Google's day ends.
    const waits = ok(await spend(second.id, { p_workspace_takes_max: 1 }), "the second take");
    assert.deepEqual([waits.fate, waits.binds], ["wait", "workspace_takes"]);
    const until = new Date(waits.until);
    assert.ok(
      until.getTime() > Date.now() && until.getTime() <= Date.now() + 25 * 3_600_000,
      "tomorrow, as Google counts it",
    );
    const pacific = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Los_Angeles",
      hour: "2-digit",
      minute: "2-digit",
    });
    assert.equal(pacific.format(until), "00:00", "midnight in Pacific time");
    assert.equal((await itemNow(second.id)).taken_at, null, "a take that waits is not counted");

    // An item already counted today is not counted in its workspace again: a fetch tried again goes, and its bytes
    // are the platform's to count once more.
    assert.deepEqual(ok(await spend(first.id, { p_bytes: 5_000, p_workspace_takes_max: 1 }), "tried again"), {
      fate: "go",
    });
    assert.equal((await dayNow()).bytes - spent.bytes, 5_000);

    assert.equal(
      ok(await spend(second.id, { p_bytes: 6_000, p_workspace_bytes_max: 10_000 }), "its bytes").binds,
      "workspace_bytes",
    );
    const now = await dayNow();
    assert.equal(
      ok(await spend(second.id, { p_bytes: 6_000, p_platform_bytes_max: now.bytes + 5_999 }), "the platform").binds,
      "platform_bytes",
    );
    assert.equal(
      ok(await spend(second.id, { p_units: 205, p_units_max: now.units + 204 }), "the units").binds,
      "units",
    );
    assert.deepEqual(ok(await spend(second.id, { p_tenant_id: B }), "another workspace's item"), { fate: "unknown" });

    // Units are counted where they are spent, and the count is the day's.
    const counted = Number(ok(await db.rpc("source_units_spend", { p_units: 205 }), "units"));
    assert.ok(counted >= now.units + 205);
    assert.equal((await dayNow()).units - now.units >= 205, true);
  },
);

test(
  "a watched folder is a road a file comes by, and a take is a kind the ledger holds once per item and try",
  { skip },
  async () => {
    const id = randomUUID();
    const kept = ok(
      await db.rpc("file_found", {
        p_tenant_id: A,
        p_id: id,
        p_status: "filed",
        p_source: "drive",
        p_source_ref: null,
        p_name: `front-desk-${stamp}`,
        p_mime: "image/jpeg",
        p_bytes: 2000,
        p_fingerprint: `fp-photo-${stamp}`,
        p_width: 1000,
        p_height: 1000,
        p_shows: null,
        p_edition: 1,
      }),
      "a photo from the folder",
    );
    assert.deepEqual(kept, { fate: "kept", file_id: id });

    const [kind] = ok(
      await db.from("job_kinds").select("lane, once_parts, once_kept").eq("kind", "source_take"),
      "the kind",
    );
    assert.deepEqual(kind, { lane: 2, once_parts: ["@tenant", "item_id", "try"], once_kept: false });
    const job = {
      tenant_id: A,
      kind: "source_take",
      due_at: new Date().toISOString(),
      payload: { item_id: `once-${stamp}`, try: "0" },
    };
    ok(await db.from("jobs").insert(job), "its job");
    assert.equal((await db.from("jobs").insert(job)).error?.code, "23505", "the same item and try is one job");
    ok(
      await db.from("jobs").insert({ ...job, payload: { item_id: `once-${stamp}`, try: "1" } }),
      "its next try is another",
    );
  },
);

test(
  "none of it is a member's: the doors refuse a session, and the platform's day is not a member's to read",
  { skip },
  async () => {
    const clip = await item();
    for (const [name, args] of [
      [
        "file_video_sourced",
        {
          p_tenant_id: A,
          p_id: randomUUID(),
          p_item_id: clip.id,
          p_media_ref: null,
          p_name: "x",
          p_mime: "video/mp4",
          p_bytes: 1,
          p_seconds: 1,
          p_fingerprint: "x",
        },
      ],
      [
        "source_takes_hand_out",
        { p_tenant_id: A, p_in_flight: 1, p_limit: 1, p_stale_seconds: 7_200, p_videos_max: 1 },
      ],
      [
        "source_take_spend",
        {
          p_tenant_id: A,
          p_item_id: clip.id,
          p_bytes: 1,
          p_units: 1,
          p_platform_bytes_max: HUGE,
          p_workspace_bytes_max: HUGE,
          p_workspace_takes_max: 9,
          p_units_max: HUGE,
        },
      ],
      ["source_units_spend", { p_units: 1 }],
    ]) {
      const refused = await member.rpc(name, args);
      assert.ok(refused.error, `${name}: a member's session is refused`);
    }
    const read = await member.from("source_days").select("day");
    assert.ok(read.error || read.data.length === 0, "the platform's day is the service role's alone");
    // What a member may read of its own folder's items still reads, the take's columns with it.
    const mine = ok(
      await member.from("source_items").select("id, state, why, take_after, take_tries").eq("id", clip.id),
      "own items",
    );
    assert.deepEqual(
      mine.map((row) => [row.id, row.take_tries]),
      [[clip.id, 0]],
    );
    const anon = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    const stranger = await anon.from("source_items").select("id").eq("id", clip.id);
    assert.ok(stranger.error || stranger.data.length === 0, "and no one signed out reads any");
  },
);
