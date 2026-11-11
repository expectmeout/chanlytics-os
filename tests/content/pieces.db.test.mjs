/**
 * A video asked for, on a real database (00613, decision 0122), with real sessions: the press is a member's with the settings
 * permission and writes the video's row and its job's first step together, once by its card's key; three being made is the most,
 * and one begun over an hour ago is not counted; a member reads where a video stands but never its machine or its card's key, and
 * writes nothing; the service role's doors are shut to a member; where one being made stands is said as it changes; a drawn
 * video becomes a file made here, once, and says who is in it as its clips do; its bytes gone is said by its own door, after
 * which only the video platform's word ends it; a video that could not be made says why, lets go of a file whose bytes never
 * went and no other, and is tried anew by the same card's press.
 *
 * Runs against the local stack `supabase start` builds, never production: it makes workspaces, users and rows.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { PIECES_MAKING_MAX } from "@chanlytics/contracts";
import { takeLock } from "../_file-lock.mjs";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces, users and rows"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the members this suite signs in as need it"
        : false;

const stamp = Date.now().toString(36);
let db;
let A;
let B;
const users = [];
const as = {};

const ok = (r, what) => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};

async function member(name, tenant, role) {
  const email = `pieces-${name}-${stamp}@example.com`;
  const password = `pw-${stamp}-${name}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }), `${name}'s seat`);
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await client.auth.signInWithPassword({ email, password }), `${name} signs in`);
  return { client, id: made.data.user.id };
}

const CLIP = "cccccccc-0000-4000-8000-000000000001";
const PLAN = {
  shape: "hook_cut",
  cuts: [
    { file_id: CLIP, from: 2, to: 4.5 },
    { file_id: CLIP, from: 5, to: 7 },
  ],
  lines: ["I asked for volume"],
  words_at: "low",
  words_hold: "all",
  end_line: null,
  language: "en",
  people_agreed: false,
};
const LOOK = { accent: "#336699", logo_path: null, name: "Harbor", book: null, address: null };

const press = (who, over = {}) =>
  as[who].client.rpc("piece_begin", {
    p_tenant_id: A,
    p_plan: PLAN,
    p_look: LOOK,
    p_key: `card-${randomUUID()}`,
    p_edition: 1,
    ...over,
  });
const pieceOf = async (id) => ok(await db.from("pieces").select("*").eq("id", id).maybeSingle(), "the video's row");
const fileOf = async (id) => ok(await db.from("files").select("*").eq("id", id).maybeSingle(), "the file");
const jobsOf = async (kind, key, value) =>
  ok(
    await db
      .from("jobs")
      .select("kind, payload, due_at")
      .eq("tenant_id", A)
      .eq("kind", kind)
      .eq(`payload->>${key}`, value),
    "jobs",
  );

/** A video being made in workspace A, written as the press writes it, with no job of its own. */
async function making(over = {}) {
  const row = ok(
    await db
      .from("pieces")
      .insert({
        tenant_id: A,
        shape: "hook_cut",
        plan: PLAN,
        look: LOOK,
        edition: 1,
        card_key: `card-${randomUUID()}`,
        created_by: as.owner.id,
        ...over,
      })
      .select("id")
      .single(),
    "a video being made",
  );
  return row.id;
}

/** The drawn video's file begun, as the job begins it: answers the door's answer and the ids it was asked with. */
async function fileBegun(pieceId, over = {}) {
  const id = randomUUID();
  const mediaRef = `ref-${id}`;
  const answer = ok(
    await db.rpc("piece_file_begin", {
      p_piece_id: pieceId,
      p_id: id,
      p_media_ref: mediaRef,
      p_name: "i-asked-for-volume",
      p_bytes: 4096,
      p_fingerprint: `fp-${id}`,
      p_seconds: 10.33,
      ...over,
    }),
    "the file begins",
  );
  return { id, mediaRef, answer };
}

/** Every video in workspace A ended, so a count of those being made starts from none. */
const endAll = async () =>
  ok(
    await db
      .from("pieces")
      .update({ status: "failed", failed_why: "unknown" })
      .eq("tenant_id", A)
      .eq("status", "making"),
    "ended",
  );

// A piece_make due now is a row of the one queue, in the lane of someone waiting, which a claim serves first: a suite claiming
// beside this one carries it off (_file-lock.mjs). The broadcasts suite met four of them as strays, 138 ms after the press
// that wrote them (11 Nov 2026, #2253's run), so this file runs apart from the suites that claim.
let releaseLedger;
before(async () => {
  if (skip) return;
  releaseLedger = await takeLock("jobs-ledger");
  db = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const tenants = ok(
    await db
      .from("tenants")
      .insert([
        { name: `Pieces A ${stamp}`, slug: `pieces-a-${stamp}` },
        { name: `Pieces B ${stamp}`, slug: `pieces-b-${stamp}` },
      ])
      .select("id"),
    "the workspaces",
  );
  A = tenants[0].id;
  B = tenants[1].id;
  as.owner = await member("owner", A, "owner");
  as.viewer = await member("viewer", A, "viewer");
  as.stranger = await member("stranger", B, "owner");
});

after(async () => {
  if (skip) return;
  try {
    const all = [A, B];
    await db.from("jobs").delete().in("tenant_id", all);
    await db.from("pieces").delete().in("tenant_id", all);
    await db.from("files").delete().in("tenant_id", all);
    await db.from("memberships").delete().in("tenant_id", all);
    await db.from("tenants").delete().in("id", all);
    for (const id of users) await db.auth.admin.deleteUser(id);
  } finally {
    await releaseLedger?.();
  }
});

test(
  "the press writes the video's row and its job's first step together, and the same press again is the one video",
  { skip },
  async () => {
    const key = `card-${randomUUID()}`;
    const begun = ok(await press("owner", { p_key: key }), "the press");
    assert.equal(begun.fate, "begun");
    const piece = await pieceOf(begun.piece_id);
    assert.deepEqual(
      [piece.shape, piece.status, piece.failed_why, piece.edition, piece.card_key, piece.created_by, piece.file_id],
      ["hook_cut", "making", null, 1, key, as.owner.id, null],
    );
    assert.deepEqual(piece.plan, PLAN);
    assert.deepEqual(piece.look, LOOK);
    assert.equal(piece.stage, "queued");
    const [job, ...more] = await jobsOf("piece_make", "piece_id", begun.piece_id);
    assert.deepEqual(job.payload, { piece_id: begun.piece_id, step: "start", tick: "1" });
    assert.ok(Date.parse(job.due_at) <= Date.now() + 60_000, "now");
    assert.deepEqual(more, []);
    assert.deepEqual(ok(await press("owner", { p_key: key }), "again"), { fate: "here", piece_id: begun.piece_id });
    assert.equal((await jobsOf("piece_make", "piece_id", begun.piece_id)).length, 1, "and no second job");
  },
);

test(
  "only a member with the settings permission presses, in their own workspace, for a shape there is",
  { skip },
  async () => {
    assert.equal((await press("viewer")).error?.code, "42501");
    assert.equal((await press("stranger")).error?.code, "42501");
    assert.equal((await press("owner", { p_plan: { ...PLAN, shape: "slideshow" } })).error?.code, "22023");
    assert.equal((await press("owner", { p_look: null })).error?.code, "22023");
    assert.equal((await press("owner", { p_key: "" })).error?.code, "22023");
    // A plan is a few moments and a few words: nothing larger is one.
    const long = { ...PLAN, lines: ["x".repeat(9000)] };
    assert.equal((await press("owner", { p_plan: long })).error?.code, "22023");
    assert.equal((await press("owner", { p_look: { ...LOOK, name: "x".repeat(2100) } })).error?.code, "22023");
  },
);

test(
  "three being made is the most, and one begun over an hour ago holds no machine and is not counted",
  { skip },
  async () => {
    await endAll();
    // The database holds the most the contract names, and nothing in TypeScript counts them a second time.
    assert.equal(PIECES_MAKING_MAX, 3);
    const old = await making();
    for (let more = 1; more < PIECES_MAKING_MAX; more += 1) await making();
    assert.deepEqual(ok(await press("owner"), "one past the most"), { fate: "busy", piece_id: null });
    ok(
      await db
        .from("pieces")
        .update({ created_at: new Date(Date.now() - 2 * 3_600_000).toISOString() })
        .eq("id", old),
      "begun two hours ago",
    );
    assert.equal(ok(await press("owner"), "the next").fate, "begun");
    await endAll();
  },
);

test(
  "a member reads where a video stands, never its machine or its card's key, and writes nothing; a stranger reads nothing",
  { skip },
  async () => {
    const id = await making();
    for (const who of ["owner", "viewer"]) {
      const read = ok(
        await as[who].client.from("pieces").select("id, status, plan, file_id").eq("id", id),
        `${who} reads`,
      );
      assert.deepEqual(
        read.map((r) => r.status),
        ["making"],
      );
    }
    assert.ok((await as.owner.client.from("pieces").select("machine").eq("id", id)).error, "no machine");
    assert.ok((await as.owner.client.from("pieces").select("card_key").eq("id", id)).error, "no card key");
    assert.deepEqual(ok(await as.stranger.client.from("pieces").select("id").eq("id", id), "a stranger"), []);
    const written = await as.owner.client
      .from("pieces")
      .insert({ tenant_id: A, shape: "hook_cut", plan: PLAN, look: LOOK, edition: 1, card_key: "a-members-own" });
    assert.ok(written.error, "no member writes a row");
    assert.ok((await as.owner.client.from("pieces").update({ status: "made" }).eq("id", id)).error, "nor changes one");
    assert.ok((await as.owner.client.from("pieces").delete().eq("id", id)).error, "nor deletes one");
    assert.ok((await as.owner.client.from("piece_images").select("edition")).error, "the images are the platform's");
    assert.equal((await pieceOf(id)).status, "making");
    await endAll();
  },
);

test("the service role's doors are shut to a member", { skip }, async () => {
  const id = await making();
  for (const [door, args] of [
    ["piece_step", { p_piece_id: id, p_machine: { name: "m" } }],
    ["piece_stage", { p_piece_id: id, p_stage: "drawing" }],
    ["piece_sent", { p_piece_id: id }],
    ["piece_end", { p_piece_id: id, p_why: "draw" }],
    [
      "piece_file_begin",
      {
        p_piece_id: id,
        p_id: randomUUID(),
        p_media_ref: "ref-a-members",
        p_name: "a-members",
        p_bytes: 1,
        p_fingerprint: "fp-a-members",
        p_seconds: 1,
      },
    ],
  ])
    assert.ok((await as.owner.client.rpc(door, args)).error, `${door} is the service role's`);
  assert.deepEqual([(await pieceOf(id)).status, (await pieceOf(id)).machine], ["making", null]);
  assert.equal((await pieceOf(id)).stage, "queued");
  await endAll();
});

test("where a video being made stands is said as it changes, and a member reads it", { skip }, async () => {
  const id = await making();
  assert.equal(ok(await db.rpc("piece_stage", { p_piece_id: id, p_stage: "waiting_clip" }), "said"), true);
  assert.equal((await pieceOf(id)).stage, "waiting_clip");
  // Said again, nothing changes; a word outside the set changes nothing either.
  assert.equal(ok(await db.rpc("piece_stage", { p_piece_id: id, p_stage: "waiting_clip" }), "again"), false);
  assert.equal(ok(await db.rpc("piece_stage", { p_piece_id: id, p_stage: "sleeping" }), "no such stage"), false);
  assert.deepEqual(ok(await as.viewer.client.from("pieces").select("stage").eq("id", id), "a member reads it"), [
    { stage: "waiting_clip" },
  ]);
  // A machine kept is the drawing begun; a count kept between two tries is not.
  ok(await db.rpc("piece_step", { p_piece_id: id, p_machine: { name: "m", cmd_id: "c" } }), "kept");
  assert.equal((await pieceOf(id)).stage, "drawing");
  ok(await db.rpc("piece_stage", { p_piece_id: id, p_stage: "waiting_clip" }), "waiting again");
  ok(await db.rpc("piece_step", { p_piece_id: id, p_machine: { round: 1 } }), "between two tries");
  assert.equal((await pieceOf(id)).stage, "waiting_clip");
  // Once it is not being made, nothing more is said of it.
  await endAll();
  assert.equal(ok(await db.rpc("piece_stage", { p_piece_id: id, p_stage: "drawing" }), "ended"), false);
});

test(
  "a drawn video becomes a file made here, once; its bytes gone is said, and the platform's word makes it made",
  { skip },
  async () => {
    const id = await making();
    const machine = { name: "machine-1", cmd_id: "cmd-1", started_at: new Date().toISOString(), round: 1 };
    assert.equal(ok(await db.rpc("piece_step", { p_piece_id: id, p_machine: machine }), "its machine kept"), true);
    assert.deepEqual((await pieceOf(id)).machine, machine);
    assert.equal((await pieceOf(id)).stage, "drawing");
    const first = await fileBegun(id);
    assert.deepEqual(first.answer, { fate: "kept", file_id: first.id });
    const file = await fileOf(first.id);
    assert.deepEqual(
      [file.source, file.kind, file.status, file.mime, file.media_ref, file.media_status, file.name, file.owner_named],
      ["made", "video", "filed", "video/mp4", first.mediaRef, "uploading", "i-asked-for-volume", true],
    );
    assert.deepEqual(
      [file.who_in_it, file.created_by, Number(file.seconds), Number(file.bytes)],
      ["not_asked", as.owner.id, 10.33, 4096],
    );
    assert.deepEqual(file.made, { piece: id, shape: "hook_cut", plan: PLAN });
    assert.deepEqual([(await pieceOf(id)).file_id, (await pieceOf(id)).stage], [first.id, "saving"]);
    // Asked again (a lost answer, or a second run): the row it holds, the reservation that row holds, and when it was begun,
    // so whoever asks can tell a run still sending it from one that died.
    const again = await fileBegun(id);
    assert.deepEqual(
      [again.answer.fate, again.answer.file_id, again.answer.media_ref],
      ["kept", first.id, first.mediaRef],
    );
    assert.ok(Math.abs(Date.parse(again.answer.begun_at) - Date.parse(file.created_at)) < 1000, "when it was begun");
    assert.equal(await fileOf(again.id), null, "and no second row");
    // Its bytes all went: the file is being made ready, and the machine is let go.
    assert.equal(ok(await db.rpc("piece_sent", { p_piece_id: id }), "sent"), true);
    assert.equal((await fileOf(first.id)).media_status, "processing");
    assert.deepEqual([(await pieceOf(id)).status, (await pieceOf(id)).machine], ["making", null]);
    // From here nothing ends it but the platform's word.
    assert.equal(ok(await db.rpc("piece_end", { p_piece_id: id, p_why: "unknown" }), "left as it stands"), false);
    assert.equal((await pieceOf(id)).status, "making");
    const ready = ok(
      await db.rpc("file_media_ready", {
        p_media_ref: first.mediaRef,
        p_seconds: 10.33,
        p_width: 1080,
        p_height: 1920,
      }),
      "the platform's word",
    );
    assert.deepEqual([ready.fate, ready.file_id, ready.made], ["ready", first.id, true]);
    const made = await pieceOf(id);
    assert.equal(made.status, "made");
    assert.ok(made.made_at);
    // Delivered again, it moves nothing, so nothing is told twice.
    const twice = ok(
      await db.rpc("file_media_ready", {
        p_media_ref: first.mediaRef,
        p_seconds: 10.33,
        p_width: 1080,
        p_height: 1920,
      }),
      "the word again",
    );
    assert.equal(twice.fate, "repeated");
    assert.ok(!twice.made);
    assert.equal(ok(await db.rpc("piece_sent", { p_piece_id: id }), "sent, of one already made"), false);
  },
);

/** A kept clip in workspace A, as a member's upload made ready stands, saying who is in it. */
async function clip(whoInIt) {
  const id = randomUUID();
  ok(
    await db.from("files").insert({
      id,
      tenant_id: A,
      status: "filed",
      source: "upload",
      name: `clip-${id.slice(0, 8)}`,
      mime: "video/mp4",
      bytes: 1000,
      fingerprint: `fp-${id}`,
      kind: "video",
      media_ref: `ref-${id}`,
      media_status: "ready",
      seconds: 12,
      who_in_it: whoInIt,
    }),
    "a clip",
  );
  return id;
}
const planOf = (...clips) => ({ ...PLAN, cuts: clips.map((file_id) => ({ file_id, from: 2, to: 4.5 })) });

test(
  "who is in a made video is its clips' own word: agreed where the owner said so, no one where every clip says so",
  { skip },
  async () => {
    // The owner's word at the press.
    const said = await making({ plan: { ...PLAN, people_agreed: true } });
    assert.equal((await fileOf((await fileBegun(said)).id)).who_in_it, "agreed");
    // A clip already said to be agreed: the video made from it is, with nothing said at the press.
    const agreed = await making({ plan: planOf(await clip("agreed"), await clip("not_asked")) });
    assert.equal((await fileOf((await fileBegun(agreed)).id)).who_in_it, "agreed");
    // Every clip says no one is in it: so does the video.
    const noOne = await making({ plan: planOf(await clip("no_one"), await clip("no_one")) });
    assert.equal((await fileOf((await fileBegun(noOne)).id)).who_in_it, "no_one");
    // Anything else is not asked yet, and the look that follows counts who it sees.
    const mixed = await making({ plan: planOf(await clip("no_one"), await clip("not_asked")) });
    assert.equal((await fileOf((await fileBegun(mixed)).id)).who_in_it, "not_asked");
    await endAll();
  },
);

test(
  "a video that was not made is tried anew by the same card's press: the same row, begun again",
  { skip },
  async () => {
    await endAll();
    const key = `card-${randomUUID()}`;
    const first = ok(await press("owner", { p_key: key }), "the press");
    const begun = await fileBegun(first.piece_id);
    ok(await db.rpc("piece_end", { p_piece_id: first.piece_id, p_why: "draw" }), "not made");
    assert.equal((await pieceOf(first.piece_id)).status, "failed");
    // Its first job ran long ago by the time anyone presses again: gone here, as the ledger would have finished it.
    ok(await db.from("jobs").delete().eq("tenant_id", A).eq("kind", "piece_make"), "the first job, done");
    const changed = { ...PLAN, lines: ["Did I get it?"] };
    const again = ok(await press("owner", { p_key: key, p_plan: changed }), "pressed again");
    assert.deepEqual(again, { fate: "begun", piece_id: first.piece_id });
    const piece = await pieceOf(first.piece_id);
    assert.deepEqual(
      [piece.status, piece.stage, piece.failed_why, piece.file_id, piece.machine, piece.made_at],
      ["making", "queued", null, null, null, null],
    );
    // By the plan as it now stands, and with a first step of its own.
    assert.deepEqual(piece.plan, changed);
    assert.deepEqual(
      (await jobsOf("piece_make", "piece_id", first.piece_id)).map((j) => j.payload),
      [{ piece_id: first.piece_id, step: "start", tick: "1" }],
    );
    // The file of the try before was let go with it, and is this video's no longer.
    assert.ok((await fileOf(begun.id)).removed_at);
    // While it is being made, the same press is the one video again.
    assert.deepEqual(ok(await press("owner", { p_key: key }), "a third press"), {
      fate: "here",
      piece_id: first.piece_id,
    });
    await endAll();
  },
);

test(
  "a video that could not be made says why, and a file of it whose bytes never went is let go",
  { skip },
  async () => {
    const id = await making();
    const begun = await fileBegun(id);
    assert.equal(ok(await db.rpc("piece_end", { p_piece_id: id, p_why: "store" }), "ended"), true);
    const piece = await pieceOf(id);
    assert.deepEqual([piece.status, piece.failed_why, piece.machine], ["failed", "store", null]);
    assert.ok((await fileOf(begun.id)).removed_at, "its half-made file is let go");
    assert.deepEqual(
      (await jobsOf("file_purge", "file_id", begun.id)).map((j) => j.payload),
      [{ file_id: begun.id, why: "remove" }],
    );
    // Ended once: asked again it changes nothing, and a file begun for it now is refused.
    assert.equal(ok(await db.rpc("piece_end", { p_piece_id: id, p_why: "draw" }), "again"), false);
    assert.equal((await pieceOf(id)).failed_why, "store");
    assert.deepEqual((await fileBegun(id)).answer, { fate: "ended", file_id: null });
    // A reason outside the set is kept as unknown.
    const other = await making();
    assert.equal(ok(await db.rpc("piece_end", { p_piece_id: other, p_why: "anything" }), "ended"), true);
    assert.equal((await pieceOf(other)).failed_why, "unknown");
  },
);

test("a made video the platform could not read is its video failed, as not stored", { skip }, async () => {
  const id = await making();
  const begun = await fileBegun(id);
  ok(await db.rpc("piece_sent", { p_piece_id: id }), "sent");
  const failed = ok(
    await db.rpc("file_media_failed", { p_media_ref: begun.mediaRef, p_error: "ERR_CODEC" }),
    "the word",
  );
  assert.deepEqual([failed.fate, failed.file_id, failed.made], ["failed", begun.id, true]);
  assert.deepEqual([(await pieceOf(id)).status, (await pieceOf(id)).failed_why], ["failed", "store"]);
});

test(
  "the same bytes as a file already there are that file: the video follows it, and no second row is made",
  { skip },
  async () => {
    const one = await making();
    const first = await fileBegun(one);
    ok(await db.rpc("piece_sent", { p_piece_id: one }), "sent");
    const two = await making();
    const twin = await fileBegun(two, { p_fingerprint: `fp-${first.id}` });
    // `twin` says where the file it found stands, so its owner can be told where no word will come.
    assert.deepEqual(twin.answer, { fate: "here", file_id: first.id, twin: "processing" });
    assert.equal(await fileOf(twin.id), null);
    assert.deepEqual([(await pieceOf(two)).file_id, (await pieceOf(two)).status], [first.id, "making"]);
    // The one word makes both made.
    ok(
      await db.rpc("file_media_ready", {
        p_media_ref: first.mediaRef,
        p_seconds: 10.33,
        p_width: 1080,
        p_height: 1920,
      }),
      "the platform's word",
    );
    assert.deepEqual([(await pieceOf(one)).status, (await pieceOf(two)).status], ["made", "made"]);
  },
);

test("a made video deleted takes its record with it", { skip }, async () => {
  const id = await making();
  const begun = await fileBegun(id);
  ok(await db.from("files").delete().eq("id", begun.id), "the file's row deleted");
  assert.equal(await pieceOf(id), null);
});

test(
  "a video drawn to the bytes of a file already ready is made at once; to one that could not be read, not made",
  { skip },
  async () => {
    const one = await making();
    const first = await fileBegun(one);
    ok(await db.rpc("piece_sent", { p_piece_id: one }), "sent");
    ok(
      await db.rpc("file_media_ready", {
        p_media_ref: first.mediaRef,
        p_seconds: 10.33,
        p_width: 1080,
        p_height: 1920,
      }),
      "ready",
    );
    const two = await making();
    const ready = await fileBegun(two, { p_fingerprint: `fp-${first.id}` });
    assert.deepEqual(ready.answer, { fate: "here", file_id: first.id, twin: "ready" });
    const made = await pieceOf(two);
    assert.deepEqual([made.status, made.file_id, made.machine], ["made", first.id, null]);
    assert.ok(made.made_at);
    // One the platform could not read: the video is not made, as not stored.
    const three = await making();
    const bad = await fileBegun(three);
    ok(await db.rpc("piece_sent", { p_piece_id: three }), "sent");
    ok(await db.rpc("file_media_failed", { p_media_ref: bad.mediaRef, p_error: "ERR_CODEC" }), "unreadable");
    const four = await making();
    const failed = await fileBegun(four, { p_fingerprint: `fp-${bad.id}` });
    assert.deepEqual(failed.answer, { fate: "here", file_id: bad.id, twin: "failed" });
    assert.deepEqual([(await pieceOf(four)).status, (await pieceOf(four)).failed_why], ["failed", "store"]);
  },
);

test("a video's ending lets go of the file it began, never one it only found", { skip }, async () => {
  await endAll();
  const one = await making();
  const first = await fileBegun(one);
  // A second video drawn to the same bytes follows the first's file, still on its way.
  const two = await making();
  ok(await db.rpc("piece_step", { p_piece_id: two, p_machine: { name: "m", cmd_id: "c" } }), "kept");
  assert.equal((await fileBegun(two, { p_fingerprint: `fp-${first.id}` })).answer.fate, "here");
  assert.equal(ok(await db.rpc("piece_end", { p_piece_id: two, p_why: "unknown" }), "the second ends"), true);
  assert.equal((await fileOf(first.id)).removed_at, null, "the first's file is the first's");
  assert.deepEqual(await jobsOf("file_purge", "file_id", first.id), []);
  assert.equal((await pieceOf(one)).status, "making");
  await endAll();
});
