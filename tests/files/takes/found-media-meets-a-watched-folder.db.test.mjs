/**
 * Where what a watched folder brings meets what was found online, on a real database (00642; the footage sources plan's
 * "Found media meets watched sources", F3 to F5): a watched file is its owner's word, so it is never the twin that goes
 * (acceptance 29 to 31); a video is let in by its length at one check, whichever road brought it, at the door where the
 * road says it and as the video platform says it where the road does not (26, 27); and a found read is paced and
 * budgeted in one statement (32).
 *
 * In workspaces of its own, so no other test's files, minutes or reads are counted. The platform's day is one row every
 * suite shares, so it is judged by what a call adds to it, never by what it holds.
 *
 * Runs against the local stack `supabase start` builds, never production: it makes workspaces, users and rows.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
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
const HOUR = 3_600_000;
let db;
let member;
const workspaces = [];
const users = [];

const ok = (r, what) => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};

/** A workspace of its own, so what it counts is only what this test put there. */
async function workspace(name) {
  const [made] = ok(
    await db
      .from("tenants")
      .insert({ name: `Found ${name} ${stamp}`, slug: `found-${name}-${stamp}` })
      .select("id"),
    "a workspace",
  );
  workspaces.push(made.id);
  return made.id;
}

/** A watched folder's item in a workspace, through an account and a folder of its own. */
async function watchedItem(tenant, name) {
  const [connection] = ok(
    await db
      .from("source_connections")
      .insert({
        tenant_id: tenant,
        provider: "google",
        provider_account: `found-${name}-${stamp}`,
        email: `sam@found-${name}-${stamp}.example`,
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
        folder_id: `found-folder-${name}-${stamp}`,
        folder_name: "Clips",
        state: "watching",
      })
      .select("id"),
    "the folder",
  );
  const [item] = ok(
    await db
      .from("source_items")
      .insert({
        tenant_id: tenant,
        source_id: source.id,
        provider_id: `found-item-${randomUUID()}`,
        kind: "video",
        name: "clip.mov",
        state: "taking",
        modified_at: new Date().toISOString(),
      })
      .select("id"),
    "the item",
  );
  return item.id;
}

const rowOf = async (id) => ok(await db.from("files").select("*").eq("id", id).maybeSingle(), "the row");
const purgesOf = async (tenant, id) =>
  ok(
    await db.from("jobs").select("id").eq("tenant_id", tenant).eq("kind", "file_purge").eq("payload->>file_id", id),
    "its purge",
  );

/** A print no other has, and one a few bits from it: the same picture, smaller or recompressed. */
const aPrint = () => randomBytes(16).toString("hex");
const nearPrint = (print, bits) => {
  const nibbles = [...print].map((c) => Number.parseInt(c, 16));
  for (let i = 0; i < bits; i++) nibbles[i >> 2] ^= 8 >> (i & 3);
  return nibbles.map((n) => n.toString(16)).join("");
};

/** A photo by the door every road keeps one by (00551 file_found). A watched folder's carries no print, as a take's. */
const photo = (tenant, id, over = {}) =>
  db.rpc("file_found", {
    p_tenant_id: tenant,
    p_id: id,
    p_status: "inbox",
    p_source: "instagram",
    p_source_ref: `instagram:${id}`,
    p_name: `photo-${id.slice(0, 8)}`,
    p_mime: "image/jpeg",
    p_bytes: 2000,
    p_fingerprint: `fp-${id}`,
    p_width: 1080,
    p_height: 1350,
    p_shows: null,
    p_edition: 1,
    ...over,
  });
const watchedPhoto = (tenant, id) =>
  photo(tenant, id, { p_status: "filed", p_source: "drive", p_source_ref: null, p_width: 3024, p_height: 4032 });
const printed = (tenant, id, print) => db.rpc("file_printed", { p_tenant_id: tenant, p_id: id, p_print: print });
const fateOf = async (source, status, twin) =>
  ok(
    await db.rpc("file_twin_fate", { p_source: source, p_status: status, p_pixels: 1_000_000, p_twin_id: twin }),
    "the twins' fate",
  );

/** A found video's door (00626, 00642): judging only with no copy named, writing with one. */
const foundVideo = (tenant, over = {}) => {
  const id = over.p_id ?? randomUUID();
  return db.rpc("file_video_found", {
    p_tenant_id: tenant,
    p_id: id,
    p_media_ref: null,
    p_status: "inbox",
    p_source: "instagram",
    p_source_ref: `instagram:${id}`,
    p_name: `reel-${id.slice(0, 8)}`,
    p_mime: "video/mp4",
    p_fingerprint: `found:${id}`,
    p_seconds: null,
    ...over,
  });
};
/** The video platform's word that a video is playable, with the length it measured. */
const ready = (mediaRef, seconds) =>
  db.rpc("file_media_ready", { p_media_ref: mediaRef, p_seconds: seconds, p_width: 1080, p_height: 1920 });
const room = async (tenant, seconds) =>
  ok(await db.rpc("file_video_room", { p_tenant_id: tenant, p_seconds: seconds }), "the room");
const secondsIn = async (tenant) =>
  Number(ok(await db.rpc("video_seconds_toward_cap", { p_tenant_id: tenant }), "the seconds counted"));
/** The video platform's id for a member's own video here: one across every workspace, so the workspace is in it. */
const keptRef = (tenant, name) => `found-kept-${name}-${tenant.slice(0, 8)}-${stamp}`;
/** A member's own video kept, holding this many of the workspace's seconds. */
const kept = (tenant, seconds, name) =>
  db.rpc("file_video_begin", {
    p_tenant_id: tenant,
    p_id: randomUUID(),
    p_media_ref: keptRef(tenant, name),
    p_name: name,
    p_mime: "video/mp4",
    p_bytes: 1000,
    p_fingerprint: `fp-kept-${name}-${tenant.slice(0, 8)}-${stamp}`,
    p_seconds: seconds,
  });

/** A road's line on the ledger, as a read writes it. */
const line = (tenant, source, over = {}) =>
  db.rpc("import_ledger_note", { p_tenant_id: tenant, p_source: source, p_state: "running", ...over });
const lineOf = async (tenant, source) =>
  ok(await db.from("imports").select("*").eq("tenant_id", tenant).eq("source", source).maybeSingle(), "the line");

const read = (tenant, account, over = {}) =>
  db.rpc("found_read_spend", {
    p_tenant_id: tenant,
    p_source: "instagram",
    p_account: account,
    p_workspace_max: 3,
    p_platform_max: 1_000_000_000,
    ...over,
  });
/** The found reads the platform has begun today, a day as Google counts one. */
async function readsToday() {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
  const row = ok(await db.from("source_days").select("reads").eq("day", day).maybeSingle(), "the day");
  return Number(row?.reads ?? 0);
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const home = await workspace("home");
  const email = `found-owner-${stamp}@example.com`;
  const password = `pw-${stamp}-found-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: home, user_id: made.data.user.id, role: "owner" }), "the seat");
  member = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await member.auth.signInWithPassword({ email, password }), "the owner signs in");
});

after(async () => {
  if (skip) return;
  await db.from("jobs").delete().in("tenant_id", workspaces);
  await db.from("events").delete().in("tenant_id", workspaces);
  await db.from("source_items").delete().in("tenant_id", workspaces);
  await db.from("media_sources").delete().in("tenant_id", workspaces);
  await db.from("source_connections").delete().in("tenant_id", workspaces);
  await db.from("files").delete().in("tenant_id", workspaces);
  await db.from("files_let_go").delete().in("tenant_id", workspaces);
  await db.from("imports").delete().in("tenant_id", workspaces);
  await db.from("memberships").delete().in("tenant_id", workspaces);
  await db.from("tenants").delete().in("id", workspaces);
  for (const id of users) await db.auth.admin.deleteUser(id);
});

test(
  "a road is its owner's own word where they put the file there or confirmed its folder, and nowhere else",
  { skip },
  async () => {
    const owners = async (source) => ok(await db.rpc("file_road_is_owners", { p_source: source }), source);
    assert.deepEqual(await Promise.all(["upload", "drive"].map(owners)), [true, true]);
    assert.deepEqual(
      await Promise.all(["website", "google_listing", "google_profile", "instagram", "made"].map(owners)),
      [false, false, false, false, false],
    );
    const asMember = await member.rpc("file_road_is_owners", { p_source: "drive" });
    assert.ok(asMember.error, "the doors' own: a member's session is refused it");
  },
);

test(
  "ACCEPTANCE 29: a watched photo whose look-alike only waited takes its place; over one its owner kept or set aside, both stay",
  { skip },
  async () => {
    const T = await workspace("twins");
    for (const [status, expected] of [
      ["inbox", "twin_goes"],
      ["filed", "both_stay"],
      ["set_aside", "both_stay"],
    ]) {
      const print = aPrint();
      const copy = randomUUID();
      const original = randomUUID();
      assert.equal(ok(await photo(T, copy, { p_print: print }), "the found copy").fate, "kept");
      if (status !== "inbox") ok(await db.from("files").update({ status }).eq("id", copy), `the copy ${status}`);
      // The watched photo comes as a take brings it: filed, with no print carried to the door.
      assert.deepEqual(ok(await watchedPhoto(T, original), "the original"), { fate: "kept", file_id: original });
      assert.equal(await fateOf("drive", "filed", copy), expected, `over a copy ${status}`);
      // Its print is taken as its look starts, as an upload's: the twins meet there.
      const met = ok(await printed(T, original, nearPrint(print, 6)), "its print");
      assert.deepEqual(
        met,
        { fate: "kept", twin_id: status === "inbox" ? copy : null },
        `printed over a copy ${status}`,
      );
      assert.equal((await rowOf(original)).removed_at, null, "the watched photo is never the one removed");
      assert.equal(Boolean((await rowOf(copy)).removed_at), status === "inbox", `the copy ${status}`);
      if (status === "inbox") assert.equal((await purgesOf(T, copy)).length, 1, "the copy's purge is due");
    }
    // The rule as it stood for a road that is nobody's word yet: over a kept twin, the newcomer goes.
    const keptCopy = randomUUID();
    ok(await photo(T, keptCopy, { p_print: aPrint() }), "a kept copy");
    ok(await db.from("files").update({ status: "filed" }).eq("id", keptCopy), "kept");
    assert.equal(await fateOf("instagram", "inbox", keptCopy), "new_goes");
    assert.equal(await fateOf("upload", "filed", keptCopy), "both_stay", "an upload, as before");
  },
);

test(
  "ACCEPTANCE 30 and 31: a found copy arriving after its original gives way to it, and no item is left on a removed file",
  { skip },
  async () => {
    const T = await workspace("after");
    // A watched photo, printed, then Instagram's copy of it.
    const print = aPrint();
    const original = randomUUID();
    ok(await watchedPhoto(T, original), "the original");
    assert.deepEqual(ok(await printed(T, original, print), "its print"), { fate: "kept", twin_id: null });
    const copy = randomUUID();
    assert.deepEqual(
      ok(await photo(T, copy, { p_print: nearPrint(print, 8), p_width: 4000, p_height: 5000 }), "the found copy"),
      { fate: "here", file_id: original },
      "bigger as the copy is, a road brings nothing new over the owner's own",
    );
    assert.equal(await rowOf(copy), null, "no row for what was here already");

    // A watched clip, its poster printed at its digest's first step, then the reel posted from it.
    const item = await watchedItem(T, "clip");
    const clip = randomUUID();
    const clipRef = `found-clip-${stamp}`;
    const written = ok(
      await db.rpc("file_video_sourced", {
        p_tenant_id: T,
        p_id: clip,
        p_item_id: item,
        p_media_ref: clipRef,
        p_name: "clip",
        p_mime: "video/quicktime",
        p_bytes: 255_147_868,
        p_seconds: 38.1,
        p_fingerprint: `fp-clip-${stamp}`,
      }),
      "the watched clip",
    );
    assert.equal(written.fate, "kept");
    assert.equal(ok(await ready(clipRef, 38.1), "the clip is playable").fate, "ready");
    const poster = aPrint();
    assert.deepEqual(ok(await printed(T, clip, poster), "its poster"), { fate: "kept", twin_id: null });

    const reel = randomUUID();
    const reelRef = `found-reel-${stamp}`;
    assert.equal(ok(await foundVideo(T, { p_id: reel, p_media_ref: reelRef, p_seconds: 38 }), "the reel").fate, "kept");
    assert.equal(ok(await ready(reelRef, 38), "the reel is playable").fate, "ready");
    assert.deepEqual(
      ok(await printed(T, reel, nearPrint(poster, 5)), "the reel's poster"),
      { fate: "gone", twin_id: clip },
      "the found reel gives way to the footage it was cut from",
    );
    assert.ok((await rowOf(reel)).removed_at);
    const stays = await rowOf(clip);
    assert.equal(stays.removed_at, null);
    const origin = ok(await db.from("source_items").select("file_id").eq("id", item).single(), "the item");
    assert.equal(
      origin.file_id,
      clip,
      "the item still names a file that is here: the next reconcile takes nothing again",
    );

    // And the other way about: a reel that only waited, then the clip it was cut from, printed after it.
    const earlier = randomUUID();
    const earlierRef = `found-earlier-${stamp}`;
    ok(await foundVideo(T, { p_id: earlier, p_media_ref: earlierRef, p_seconds: 20 }), "an earlier reel");
    ok(await ready(earlierRef, 20), "playable");
    const second = aPrint();
    ok(await printed(T, earlier, second), "its poster");
    const item2 = await watchedItem(T, "clip-2");
    const clip2 = randomUUID();
    const clip2Ref = `found-clip-2-${stamp}`;
    ok(
      await db.rpc("file_video_sourced", {
        p_tenant_id: T,
        p_id: clip2,
        p_item_id: item2,
        p_media_ref: clip2Ref,
        p_name: "clip-2",
        p_mime: "video/quicktime",
        p_bytes: 100_000_000,
        p_seconds: 20.2,
        p_fingerprint: `fp-clip-2-${stamp}`,
      }),
      "the second watched clip",
    );
    ok(await ready(clip2Ref, 20.2), "playable");
    assert.deepEqual(ok(await printed(T, clip2, nearPrint(second, 4)), "its poster"), {
      fate: "kept",
      twin_id: earlier,
    });
    assert.ok((await rowOf(earlier)).removed_at, "the reel that only waited went");
    assert.equal((await rowOf(clip2)).removed_at, null);
  },
);

test(
  "a video is let in by its length at one check: longer than AI can watch, no room in the minutes, or room",
  { skip },
  async () => {
    const T = await workspace("room");
    assert.deepEqual(
      [await room(T, null), await room(T, 600), await room(T, 600.5), await room(T, 3600)],
      ["room", "room", "long", "long"],
      "ten minutes is in; a second more is longer than AI can watch, whatever room there is",
    );
    ok(await kept(T, 3570, "most"), "59 minutes 30 kept");
    assert.deepEqual(
      [await room(T, 38.1), await room(T, 30), await room(T, null)],
      ["minutes", "room", "room"],
      "its own length must fit; one that says none is let in on what is known",
    );
    ok(await kept(T, 30, "rest"), "the hour filled");
    assert.deepEqual([await room(T, null), await room(T, 1)], ["minutes", "minutes"]);
    const asMember = await member.rpc("file_video_room", { p_tenant_id: T, p_seconds: 10 });
    assert.ok(asMember.error, "the doors' own: a member's session is refused it");
  },
);

test(
  "ACCEPTANCE 26: fifty reels cannot take a workspace past sixty minutes, and a judging writes nothing",
  { skip },
  async () => {
    const T = await workspace("reels");
    const judged = ok(await foundVideo(T, { p_seconds: 90 }), "judged");
    assert.deepEqual(judged, { fate: "room", file_id: null });
    assert.equal(ok(await db.from("files").select("id").eq("tenant_id", T), "files").length, 0, "nothing is written");
    assert.deepEqual(ok(await foundVideo(T, { p_seconds: 601 }), "too long"), { fate: "long", file_id: null });

    const fates = [];
    for (let i = 0; i < 50; i++) {
      const reel = await foundVideo(T, { p_media_ref: `found-reels-${i}-${stamp}`, p_seconds: 90 });
      fates.push(ok(reel, `reel ${i}`).fate);
    }
    assert.equal(fates.filter((f) => f === "kept").length, 40, "sixty minutes of ninety-second reels");
    assert.equal(fates.filter((f) => f === "minutes").length, 10);
    assert.deepEqual(
      fates.slice(0, 40).every((f) => f === "kept"),
      true,
      "the first forty, in the order they came",
    );
    assert.equal(await secondsIn(T), 3600, "each counted as it was let in, while still on its way");
    // The old edge's call, which says no length: it still answers, on what is known.
    const old = await db.rpc("file_video_found", {
      p_tenant_id: T,
      p_id: randomUUID(),
      p_media_ref: `found-reels-old-${stamp}`,
      p_status: "inbox",
      p_source: "website",
      p_source_ref: "https://example.com/clip.mp4",
      p_name: "found",
      p_mime: "video/mp4",
      p_fingerprint: `fp-old-${stamp}`,
    });
    assert.deepEqual(ok(old, "a call with no length"), { fate: "minutes", file_id: null });
  },
);

test(
  "ACCEPTANCE 27: a found video whose road said no length is judged as the platform says it: too long, or no room, is passed over",
  { skip },
  async () => {
    const T = await workspace("ready");
    // The website's line, as its batch left it: three photos and three videos let in, none of the videos measured yet.
    ok(await line(T, "website_media", { p_counts: { photos: 3, videos: 3 } }), "the website's line");
    // Too long: removed, its copy's purge due, counted on its road's line, and not fetched by the next read.
    const long = randomUUID();
    const longPrint = `found:long-${stamp}`;
    const longRef = `found-ready-long-${stamp}`;
    const site = { p_source: "website", p_source_ref: "https://example.com/tour.mp4" };
    assert.equal(
      ok(await foundVideo(T, { ...site, p_id: long, p_media_ref: longRef, p_fingerprint: longPrint }), "let in").fate,
      "kept",
      "its road says no length, so it is let in on what is known",
    );
    const passed = ok(await ready(longRef, 700), "eleven minutes forty, the platform says");
    assert.deepEqual([passed.fate, passed.why, passed.file_id], ["passed", "long", long]);
    assert.ok((await rowOf(long)).removed_at, "it is removed, never shown as a failure");
    assert.equal((await purgesOf(T, long)).length, 1, "and its copy is let go");
    assert.equal(await secondsIn(T), 0, "it counts for nothing");
    assert.equal(
      (await lineOf(T, "website_media")).counts.long_videos,
      1,
      "its road's line counts it, so the owner is told",
    );
    assert.deepEqual(
      ok(await foundVideo(T, { ...site, p_fingerprint: longPrint }), "the next read of the same place"),
      { fate: "here", file_id: null },
      "it is not fetched again",
    );
    assert.equal(ok(await ready(longRef, 700), "said again").fate, "gone", "a second delivery changes nothing");
    assert.equal((await lineOf(T, "website_media")).counts.long_videos, 1);

    // No room: passed over and counted as left, but not let go, so it can come once there is room.
    ok(await kept(T, 3590, "most"), "59 minutes 50 kept");
    const tight = randomUUID();
    const tightPrint = `found:tight-${stamp}`;
    const tightRef = `found-ready-tight-${stamp}`;
    ok(await foundVideo(T, { ...site, p_id: tight, p_media_ref: tightRef, p_fingerprint: tightPrint }), "let in");
    const left = ok(await ready(tightRef, 30), "thirty seconds into ten");
    assert.deepEqual([left.fate, left.why], ["passed", "minutes"]);
    assert.ok((await rowOf(tight)).removed_at);
    assert.equal((await lineOf(T, "website_media")).counts.left_videos, 1);
    assert.equal(
      ok(await db.from("files_let_go").select("fingerprint").eq("tenant_id", T).eq("fingerprint", tightPrint), "let go")
        .length,
      0,
    );

    // One that fits is ready, as before; and a member's own video is never judged here, whatever its length.
    const fits = randomUUID();
    const fitsRef = `found-ready-fits-${stamp}`;
    ok(
      await foundVideo(T, { ...site, p_id: fits, p_media_ref: fitsRef, p_fingerprint: `found:fits-${stamp}` }),
      "let in",
    );
    assert.equal(ok(await ready(fitsRef, 8), "eight seconds into ten").fate, "ready");
    assert.equal(Number((await rowOf(fits)).seconds), 8);
    assert.deepEqual(
      (await lineOf(T, "website_media")).counts,
      { photos: 3, videos: 1, long_videos: 1, left_videos: 1 },
      "the line says the one video that came, and the two that did not, each once",
    );
    const U = await workspace("upload");
    ok(await kept(U, null, "own"), "an upload that said no length");
    assert.equal(ok(await ready(keptRef(U, "own"), 700), "the platform says eleven minutes forty").fate, "ready");
  },
);

test(
  "ACCEPTANCE 32: an account is read once in a day; the second asking spends nothing and says when it was read",
  { skip },
  async () => {
    const T = await workspace("reads");
    const before = await readsToday();
    assert.deepEqual(ok(await read(T, "harborsalon"), "the first asking"), { fate: "go", since: null });
    assert.equal((await readsToday()) - before, 1, "the platform's day counts the read");
    const row = await lineOf(T, "instagram");
    assert.deepEqual([row.state, row.via, row.job_cursor.reads.length], ["queued", "harborsalon", 1]);

    // The edge then writes the line as it always did, and the read lands.
    ok(await line(T, "instagram", { p_state: "running", p_via: "harborsalon" }), "running");
    ok(await line(T, "instagram", { p_state: "done", p_counts: { photos: 12, videos: 4 }, p_add: true }), "done");
    const again = ok(await read(T, "harborsalon"), "the second asking");
    assert.deepEqual([again.fate, again.state, again.counts], ["read_lately", "done", { photos: 12, videos: 4 }]);
    assert.ok(Math.abs(Date.parse(again.read_at) - Date.now()) < 5 * 60_000, "when it was read");
    assert.equal((await readsToday()) - before, 1, "nothing is spent");
    assert.equal((await lineOf(T, "instagram")).job_cursor.reads.length, 1);

    // A workspace's reads of the day, and the platform's: each binds, and says until when.
    assert.equal(ok(await read(T, "harbor.color"), "a second account").fate, "go");
    const third = ok(await read(T, "harbor_nails", { p_workspace_max: 2 }), "a third, of two a day");
    assert.deepEqual([third.fate, third.binds], ["wait", "workspace_reads"]);
    const until = Date.parse(third.until) - Date.now();
    assert.ok(until > 23 * HOUR && until <= 24 * HOUR, "a day after the first of them");
    const paused = ok(await read(T, "harbor_nails", { p_platform_max: 0 }), "the platform's day used");
    assert.deepEqual([paused.fate, paused.binds], ["wait", "platform_reads"]);
    assert.equal((await readsToday()) - before, 2);

    // An account whose read stopped may be asked again, as one of the day's reads.
    ok(
      await line(T, "instagram", { p_state: "failed", p_via: "harbor.color", p_error: "Instagram didn't answer." }),
      "it stopped",
    );
    assert.equal(ok(await read(T, "harbor.color"), "asked again").fate, "go");
    assert.equal((await lineOf(T, "instagram")).job_cursor.reads.length, 3);

    const asMember = await member.rpc("found_read_spend", {
      p_tenant_id: T,
      p_source: "instagram",
      p_account: "harborsalon",
      p_workspace_max: 3,
      p_platform_max: 1000,
    });
    assert.ok(asMember.error, "a member's session is refused it");
    assert.equal((await read(T, "harbor.example", { p_source: "website_media" })).error?.code, "22023");
  },
);

test(
  "a day on, an account is read only for what is newer, unless its last read left something behind",
  { skip },
  async () => {
    const T = await workspace("since");
    ok(await read(T, "harborsalon"), "the first asking");
    ok(await line(T, "instagram", { p_state: "running", p_via: "harborsalon" }), "running");
    ok(await line(T, "instagram", { p_state: "done", p_counts: { photos: 12 }, p_add: true }), "done");
    const began = (await lineOf(T, "instagram")).started_at;
    /** The line's reads, each made this many hours old: a test cannot wait a day. */
    const age = async (hours) => {
      const row = await lineOf(T, "instagram");
      const reads = row.job_cursor.reads.map((r) => ({ ...r, at: new Date(Date.now() - hours * HOUR).toISOString() }));
      ok(
        await db
          .from("imports")
          .update({ job_cursor: { ...row.job_cursor, reads } })
          .eq("id", row.id),
        "a day on",
      );
    };
    await age(25);
    const next = ok(await read(T, "harborsalon"), "a day on");
    assert.equal(next.fate, "go");
    assert.equal(Date.parse(next.since), Date.parse(began), "only what is newer than when its last whole read began");
    assert.equal(
      (await lineOf(T, "instagram")).job_cursor.reads.length,
      1,
      "the day-old read is dropped as the row is written",
    );

    // A read that left videos behind: the account is read whole again, so what was left can come once there is room.
    ok(await line(T, "instagram", { p_state: "queued", p_via: "harborsalon", p_counts: {} }), "queued");
    ok(await line(T, "instagram", { p_state: "done", p_counts: { photos: 2, left_videos: 14 }, p_add: true }), "done");
    await age(25);
    assert.deepEqual(ok(await read(T, "harborsalon"), "after a read that left some"), { fate: "go", since: null });
  },
);
