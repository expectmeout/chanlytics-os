/**
 * The job that makes a video from a business's clips (apps/edge/lib/files/piece-make.ts; 00613, decision 0122), over a database
 * in memory, a web that answers as the video platform does, and a machine that draws from memory. One step a run: start checks
 * the plan against its files as they stand, reads what each block needs fetched (a clip's parts, a photo's address) and starts
 * the machine; wait asks after
 * the drawing and, once it is done, sends the video into the video platform as a file. The platform's own word that it can be
 * played is what makes it made, and rings the bell.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { resetBreakers } from "@chanlytics/channels/shared";
import { fakeDb } from "../_fake-db.mjs";
import { at } from "../_cron-doors-world.mjs";
import { linesOf } from "../_log-lines.mjs";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
Object.assign(process.env, {
  CLOUDFLARE_ACCOUNT_ID: "acct-1",
  CLOUDFLARE_STREAM_API_TOKEN: "stream-token-for-this-file",
  CLOUDFLARE_STREAM_CUSTOMER_CODE: "abc",
  CLOUDFLARE_STREAM_KEY_ID: "key-1",
  CLOUDFLARE_STREAM_KEY_JWK: Buffer.from(JSON.stringify(privateKey.export({ format: "jwk" }))).toString("base64"),
  SUPABASE_URL: "https://db.example",
});

let answer = async (url) => {
  throw new Error(`nothing answers ${url}`);
};
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init) => answer(String(url), init);

const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));
const { makePiece, setPieceMachines, tellPieceMoved } = await import(at("apps/edge/lib/files/piece-make.ts"));
const { PIECE_TEMPLATE, isPieceStep, pieceMachineOf, pieceRoundsOf } = await import(
  at("packages/contracts/src/content/piece-making.ts")
);
const { PIECE_WORDS } = await import(at("packages/contracts/src/content/piece-words.ts"));

after(() => {
  setPg(null);
  setPieceMachines(null);
  globalThis.fetch = realFetch;
});
beforeEach(() => resetBreakers());

const T = "aaaaaaaa-0000-4000-8000-000000000001";
const P = "cccccccc-0000-4000-8000-000000000001";
const CLIP = "ffffffff-0000-4000-8000-000000000001";
const U = "bbbbbbbb-0000-4000-8000-000000000001";
const UID = "0123456789abcdef0123456789abcdef";
const MADE_UID = "fedcba9876543210fedcba9876543210";
const HOST = "https://customer-abc.cloudflarestream.com";
const STREAM_API = "https://api.cloudflare.com/client/v4/accounts/acct-1/stream";
const UPLOAD_URL = "https://upload.cloudflarestream.com/tus/made-1";
/** A workspace's mark is kept in its own folder under a random name (contracts workspaceLogoPath). */
const LOGO_PATH = `${T}/dddddddd-0000-4000-8000-000000000001.png`;

const plan = (over = {}) => ({
  shape: "hook_cut",
  cuts: [
    { file_id: CLIP, from: 2.3, to: 4.8 },
    { file_id: CLIP, from: 4.8, to: 6.8 },
    { file_id: CLIP, from: 7.3, to: 9.3 },
    { file_id: CLIP, from: 9.8, to: 11.9 },
  ],
  lines: ["I asked for volume", "Did I get it?"],
  words_at: "low",
  words_hold: "all",
  end_line: "Same chair. New me.",
  language: "en",
  ...over,
});
const clipRow = (over = {}) => ({
  id: CLIP,
  tenant_id: T,
  status: "filed",
  source: "upload",
  name: "salon-chair-reveal",
  mime: "video/mp4",
  kind: "video",
  media_ref: UID,
  media_status: "ready",
  width: 720,
  height: 1280,
  seconds: 11.8,
  who_in_it: "not_asked",
  look: null,
  look_status: "done",
  removed_at: null,
  ...over,
});
const pieceRow = (over = {}) => ({
  id: P,
  tenant_id: T,
  shape: "hook_cut",
  plan: plan(),
  look: { accent: "#336699", logo_path: null, name: "Harbor Studio", book: "Book · (646) 555-0175", address: null },
  status: "making",
  stage: "queued",
  failed_why: null,
  edition: PIECE_TEMPLATE.edition,
  file_id: null,
  machine: null,
  card_key: "card-1",
  created_by: U,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  made_at: null,
  ...over,
});

const MASTER = [
  "#EXTM3U",
  '#EXT-X-STREAM-INF:RESOLUTION=480x852,CODECS="avc1.64001f",BANDWIDTH=1100000',
  "stream_480.m3u8",
  '#EXT-X-STREAM-INF:RESOLUTION=720x1280,CODECS="avc1.64001f",BANDWIDTH=2574000',
  "stream_720.m3u8",
].join("\n");
const SMALL_ONLY = MASTER.split("\n").slice(0, 3).join("\n");
const MEDIA = [
  "#EXTM3U",
  '#EXT-X-MAP:URI="init.mp4"',
  "#EXTINF:4.000,",
  "seg_1.mp4",
  "#EXTINF:4.000,",
  "seg_2.mp4",
  "#EXTINF:3.690,",
  "seg_3.mp4",
  "#EXT-X-ENDLIST",
].join("\n");

/** Whether the files bucket refuses what is put in it, for the test that says what then. */
let storageFails = false;

/** A world: the tables, the doors the job knocks on as the database answers them, the bucket, the web, and a machine. */
function world({
  piece = pieceRow(),
  clip = clipRow(),
  photos = [],
  image = true,
  master = MASTER,
  twin = null,
  shelf = null,
  full = null,
} = {}) {
  /** What the shelf's own door was asked (00695 file_shelf_begin); `shelf` is on, off, or broken. */
  const shelfAsked = [];
  const tables = {
    tenants: [{ id: T, name: "Harbor Studio" }],
    tenant_config: [
      { tenant_id: T, config: { features: { video_preview: true, video_shelf: shelf !== "off" && shelf !== null } } },
    ],
    file_archives: [],
    file_archive_parts: [],
    pieces: [piece],
    files: [...(clip ? [clip] : []), ...photos],
    piece_images: image
      ? [{ edition: PIECE_TEMPLATE.edition, snapshot_id: "snap_test", hash: PIECE_TEMPLATE.hash }]
      : [],
    jobs: [],
    notifications: [],
  };
  const row = () => tables.pieces[0];
  const db = fakeDb(
    tables,
    {},
    {
      piece_step: (a) => {
        if (row().status !== "making") return false;
        row().machine = a.p_machine;
        // A machine kept is the drawing begun (00613 piece_step).
        if (a.p_machine?.name) row().stage = "drawing";
        return true;
      },
      piece_stage: (a) => {
        if (row().status !== "making" || row().stage === a.p_stage) return false;
        row().stage = a.p_stage;
        return true;
      },
      // The videos are full (`full`): what may go is marked going, as 00654's door marks it, and its going frees the room.
      file_copies_let_go: (a) => {
        if (!full) return [];
        full.askedFor = a.p_seconds;
        return full.mayGo.map((copy) => ({ ...copy }));
      },
      file_copy_gone: (a) => {
        full.went.push(a.p_id);
        if (full.went.length === full.mayGo.length) full.left = false;
        return true;
      },
      piece_file_begin: (a) => {
        if (row().status !== "making") return { fate: "ended", file_id: null };
        if (full?.left) return { fate: "minutes", file_id: null };
        if (row().file_id) {
          // Asked again: the file the row holds, and when it was begun.
          const held = tables.files.find((f) => f.id === row().file_id);
          return {
            fate: "kept",
            file_id: row().file_id,
            media_ref: MADE_UID,
            begun_at: held?.created_at ?? new Date(Date.now() - 10 * 60_000).toISOString(),
          };
        }
        if (twin) {
          // The same bytes are a file already (00613): the video is that one, wherever it stands.
          Object.assign(row(), {
            file_id: twin.id,
            machine: null,
            ...(twin.media_status === "ready" ? { status: "made" } : {}),
            ...(twin.media_status === "failed" ? { status: "failed", failed_why: "store" } : {}),
          });
          return { fate: "here", file_id: twin.id, twin: twin.media_status };
        }
        tables.files.push({
          id: a.p_id,
          tenant_id: T,
          status: "filed",
          source: "made",
          name: a.p_name,
          kind: "video",
          media_ref: a.p_media_ref,
          media_status: "uploading",
          bytes: a.p_bytes,
          fingerprint: a.p_fingerprint,
          seconds: a.p_seconds,
          removed_at: null,
          created_at: new Date().toISOString(),
        });
        Object.assign(row(), { file_id: a.p_id, stage: "saving" });
        return { fate: "kept", file_id: a.p_id };
      },
      piece_sent: () => {
        if (row().status !== "making") return false;
        row().machine = null;
        const file = tables.files.find((f) => f.id === row().file_id);
        if (file?.media_status === "uploading") file.media_status = "processing";
        return true;
      },
      piece_end: (a) => {
        if (row().status !== "making") return false;
        Object.assign(row(), { status: "failed", failed_why: a.p_why, machine: null });
        return true;
      },
      // 00695: a made video's copy on the shelf begun, with its job, by the door itself (the shelf's own tests').
      file_shelf_begin: (a) => {
        shelfAsked.push(a);
        if (shelf === "broken") throw new Error("the database gave no answer");
        return { fate: "begun" };
      },
      // 00654: where a watched clip's copy stands, as its row says it (its origins are the copies' own tests').
      file_copy_settle: (a) => {
        const file = tables.files.find((f) => f.id === a.p_file_id);
        return { copy_state: file?.copy_state ?? null, copy_why: file?.copy_why ?? null, item_id: null };
      },
    },
  );
  setPg(db);
  const kept = [];
  const signed = [];
  db.storage = {
    from: () => ({
      // A photo's address for the machine, as Storage signs one: good for a while, resized as asked.
      createSignedUrl: async (path, seconds, opts) => {
        signed.push({ path, seconds, transform: opts?.transform ?? null });
        return {
          data: { signedUrl: `https://db.example/storage/v1/render/image/sign/files/${path}?token=t` },
          error: null,
        };
      },
      upload: async (path, bytes, opts) => {
        if (storageFails) return { data: null, error: { message: "the bucket is full" } };
        kept.push({ path, bytes: bytes.length, type: opts?.contentType });
        return { data: { path }, error: null };
      },
    }),
  };
  const web = { asked: [], sent: null, reserved: null };
  answer = async (url, init) => {
    web.asked.push(`${init?.method ?? "GET"} ${url}`);
    if (url.endsWith("/manifest/video.m3u8")) return new Response(master, { status: 200 });
    if (url.endsWith("/manifest/stream_720.m3u8")) return new Response(MEDIA, { status: 200 });
    if (url.startsWith(`${STREAM_API}?direct_user=true`)) {
      web.reserved = { bytes: init.headers["upload-length"] };
      return new Response(null, { status: 201, headers: { location: UPLOAD_URL, "stream-media-id": MADE_UID } });
    }
    // A copy let go to make room is deleted at the video platform, and so is a place reserved for nothing.
    if (url.startsWith(`${STREAM_API}/`) && init?.method === "DELETE") return new Response(null, { status: 200 });
    if (url === UPLOAD_URL) {
      web.sent = { bytes: init.body.length, offset: init.headers["upload-offset"] };
      return new Response(null, { status: 204 });
    }
    throw new Error(`nothing answers ${url}`);
  };
  // A machine draws the video and, where it was asked for one, its cover (pass 4): none until a test hands it one.
  const machine = {
    started: [],
    states: [],
    stopped: [],
    video: new Uint8Array(4096).fill(7),
    cover: null,
    pauses: 0,
  };
  setPieceMachines({
    start: async (snapshotId, job) => {
      machine.started.push({ snapshotId, job });
      return { name: `machine-${machine.started.length}`, cmdId: "cmd-1" };
    },
    read: async () => machine.states.shift() ?? { stage: "working", progress: 0.5 },
    bytes: async (_m, which) => (which === "cover" ? machine.cover : machine.video),
    stop: async (m) => void machine.stopped.push(m.name),
    pause: async () => void machine.pauses++,
  });
  return { db, tables, web, machine, row, kept, signed, shelfAsked };
}

const job = (step, tick = "1") => ({
  id: "j1",
  kind: "piece_make",
  tenant_id: T,
  payload: { piece_id: P, step, tick },
});
const soon = () => Date.now() + 45_000;
const stepsOf = (tables) => tables.jobs.map((j) => [j.kind, j.payload.step, j.payload.tick]);

test("start reads which parts of the clip each cut needs and starts the machine from the edition's image, to draw it in blocks", async () => {
  const { db, tables, machine, row } = world();
  await makePiece(db, job("start"), soon());
  assert.equal(machine.started.length, 1);
  const { snapshotId, job: drawn } = machine.started[0];
  assert.equal(snapshotId, "snap_test");
  // A plan kept as "Hook first" is read as blocks, each cut a clip's moment, and drawn by the one composition.
  assert.equal(drawn.composition, "blocks");
  assert.deepEqual(
    drawn.fetch.map((f) => [f.to, f.parts.map((p) => p.split("/").pop())]),
    [
      ["block-0.mp4", ["init.mp4", "seg_1.mp4", "seg_2.mp4"]],
      ["block-1.mp4", ["init.mp4", "seg_2.mp4"]],
      ["block-2.mp4", ["init.mp4", "seg_2.mp4", "seg_3.mp4"]],
      ["block-3.mp4", ["init.mp4", "seg_3.mp4"]],
    ],
  );
  assert.ok(
    drawn.fetch.every((f) => f.parts.every((p) => p.startsWith(`${HOST}/`))),
    "every part is asked of the video platform",
  );
  assert.deepEqual(drawn.props.files, [["block-0.mp4"], ["block-1.mp4"], ["block-2.mp4"], ["block-3.mp4"]]);
  assert.equal(drawn.props.logo, null);
  // The clip is 11.69 s by its playback copy, whatever the row said: the last cut is trimmed to it.
  assert.equal(drawn.props.timeline.blocks[3].frames, Math.round((11.69 - 9.8) * 30));
  assert.equal(drawn.props.timeline.end.name, "Harbor Studio");
  assert.equal(drawn.props.timeline.accent, "#336699");
  const kept = pieceMachineOf(row().machine);
  assert.deepEqual([kept.name, kept.cmd_id, kept.round], ["machine-1", "cmd-1", 1]);
  // The video's length rides with its machine, as the timeline was compiled here: 252 frames of cuts, and the end card's.
  assert.equal(kept.frames, drawn.props.timeline.frames);
  assert.equal(kept.frames, 310);
  assert.equal(row().stage, "drawing", "its card says it is being drawn");
  assert.deepEqual(stepsOf(tables), [["piece_make", "wait", "1"]]);
});

const PHOTO = "ffffffff-0000-4000-8000-000000000002";
const PHOTO_2 = "ffffffff-0000-4000-8000-000000000003";
const photoRow = (id, over = {}) =>
  clipRow({
    id,
    name: `photo-${id.slice(-1)}`,
    mime: "image/jpeg",
    kind: "image",
    media_ref: null,
    media_status: null,
    seconds: null,
    ...over,
  });
/** A plan in blocks, as a row will hold one: a clip, a photo, a pair (a photo over a clip's moment), a card, a quote over a photo. */
const blocksPlan = () => ({
  shape: "blocks",
  blocks: [
    { is: "clip", file_id: CLIP, from: 2.3, to: 4.8, label: "Silk press" },
    { is: "photo", file_id: PHOTO, seconds: 2.5, label: null },
    { is: "pair", before: { file_id: PHOTO_2, at: null }, after: { file_id: CLIP, at: 7.9 }, seconds: 3 },
    { is: "words", lines: ["Same chair.", "New you."], seconds: 1.8 },
    { is: "quote", text: "Best blowout in Brooklyn", from: "Maria G.", over: { file_id: PHOTO, at: null }, seconds: 3 },
  ],
  lines: ["I asked for volume", "Did I get it?"],
  words_at: "high",
  words_hold: "first",
  end_line: null,
  language: "en",
});

test("each block is handed its own files: a clip's parts, a photo by a signed address, a clip's moment by the parts around it", async () => {
  const { db, machine, signed } = world({
    piece: pieceRow({ plan: blocksPlan() }),
    photos: [photoRow(PHOTO), photoRow(PHOTO_2)],
  });
  await makePiece(db, job("start"), soon());
  assert.equal(machine.started.length, 1);
  const { job: drawn } = machine.started[0];
  assert.equal(drawn.composition, "blocks");
  const last = (address) => address.split("?")[0].split("/").slice(-2).join("/");
  assert.deepEqual(
    drawn.fetch.map((f) => [f.to, f.parts.map(last)]),
    [
      ["block-0.mp4", ["manifest/init.mp4", "manifest/seg_1.mp4", "manifest/seg_2.mp4"]],
      ["block-1.img", [`${PHOTO}/original.jpg`]],
      ["block-2-0.img", [`${PHOTO_2}/original.jpg`]],
      // Second 7.9 of the clip and half a second on: the segment it is in, and the next where that runs into it.
      ["block-2-1.mp4", ["manifest/init.mp4", "manifest/seg_2.mp4", "manifest/seg_3.mp4"]],
      ["block-4-0.img", [`${PHOTO}/original.jpg`]],
    ],
  );
  // The template reads each block's files by these names, in the block's own order; a words card has none.
  assert.deepEqual(drawn.props.files, [
    ["block-0.mp4"],
    ["block-1.img"],
    ["block-2-0.img", "block-2-1.mp4"],
    [],
    ["block-4-0.img"],
  ]);
  assert.deepEqual(
    drawn.props.timeline.blocks.map((b) => b.is),
    ["clip", "photo", "pair", "words", "quote"],
  );
  // A photo's address is signed once for the machine's fetches, no larger than a frame pushed in needs, and never enlarged.
  assert.deepEqual(
    signed.map((g) => [g.path, g.seconds, g.transform]),
    [PHOTO, PHOTO_2].map((id) => [
      `${T}/${id}/original.jpg`,
      600,
      { width: 2500, height: 2500, resize: "contain", quality: 90 },
    ]),
  );
});

test("a photo removed since the press ends the video before anything is spent", async () => {
  const { db, tables, machine, row } = world({
    piece: pieceRow({ plan: blocksPlan() }),
    photos: [photoRow(PHOTO), photoRow(PHOTO_2, { removed_at: "2026-11-10T00:00:00Z" })],
  });
  await makePiece(db, job("start"), soon());
  assert.equal(machine.started.length, 0);
  assert.deepEqual([row().status, row().failed_why], ["failed", "clips"]);
  assert.deepEqual(tables.jobs, []);
});

test("a video is drawn on the image of the edition this code names, whatever edition its row was begun under", async () => {
  // A row begun by a dashboard a deploy behind this edge, or ahead of it: the template that reads this material is this code's.
  const { db, machine } = world({ piece: pieceRow({ edition: PIECE_TEMPLATE.edition + 7 }) });
  await makePiece(db, job("start"), soon());
  assert.equal(machine.started[0]?.snapshotId, "snap_test");
});

test("a business with a mark has it fetched beside the cuts, from where its logo is served", async () => {
  const { db, machine } = world({ piece: pieceRow({ look: { ...pieceRow().look, logo_path: LOGO_PATH } }) });
  await makePiece(db, job("start"), soon());
  const { job: drawn } = machine.started[0];
  const logo = drawn.fetch.find((f) => f.to === "logo.png");
  assert.deepEqual(logo?.parts, [`https://db.example/storage/v1/object/public/workspace-logos/${LOGO_PATH}`]);
  assert.equal(drawn.props.logo, "logo.png");
  assert.equal(drawn.props.timeline.end.logo, true);
});

test("a clip whose full-size copy is not made yet is waited for: the same step, a minute on, and no machine", async () => {
  const { db, tables, machine, row } = world({ master: SMALL_ONLY, clip: clipRow({ width: 1080, height: 1920 }) });
  const before = Date.now();
  await makePiece(db, job("start", "3"), soon());
  assert.equal(machine.started.length, 0);
  assert.equal(row().status, "making");
  assert.deepEqual(stepsOf(tables), [["piece_make", "start", "4"]]);
  assert.ok(new Date(tables.jobs[0].due_at).getTime() >= before + 50_000, "due about a minute on");
  // Its card is told why this one takes longer than a minute.
  assert.equal(row().stage, "waiting_clip");
});

test("a clip that never gets its full-size copy ends the wait: the video says its clips could not be used", async () => {
  const { db, tables, row } = world({ master: SMALL_ONLY, clip: clipRow({ width: 1080, height: 1920 }) });
  await makePiece(db, job("start", "30"), soon());
  assert.deepEqual([row().status, row().failed_why], ["failed", "clips"]);
  assert.deepEqual(tables.jobs, []);
  assert.equal(tables.notifications.length, 1);
});

test("a clip removed since the press ends it before anything is spent, and its owner is told why", async () => {
  const { db, tables, machine, row } = world({ clip: clipRow({ removed_at: new Date().toISOString() }) });
  await makePiece(db, job("start"), soon());
  assert.equal(machine.started.length, 0);
  assert.deepEqual([row().status, row().failed_why], ["failed", "clips"]);
  const [told] = tables.notifications;
  assert.equal(told.kind, "job_failed");
  assert.equal(told.body, PIECE_WORDS.bell.failedBody("clips"));
  // Content's Needs you, where a video that could not be made waits on its owner.
  assert.equal(told.route, "campaigns/content:needs");
});

test("a watched clip whose copy was let go is waited for as it comes back: the same step, a minute on, no machine", async () => {
  // Asked back when AI proposed the video, or by this very step: it is on its way.
  const away = clipRow({ source: "drive", copy_state: "returning", media_ref: null });
  const { db, tables, machine, row } = world({ clip: away });
  await makePiece(db, job("start", "2"), soon());
  assert.equal(machine.started.length, 0, "nothing is drawn from a copy that is not there");
  assert.equal(row().status, "making");
  assert.deepEqual(stepsOf(tables), [["piece_make", "start", "3"]]);
  // Its card says the clips are coming back from Google Drive, about two minutes, never the twenty a new copy can take.
  assert.equal(row().stage, "from_drive");
});

test("a watched clip whose original left its folder ends the video: its clips could not be used", async () => {
  const lost = clipRow({ source: "drive", copy_state: "lost", copy_why: "gone", media_ref: null });
  const { db, tables, machine, row } = world({ clip: lost });
  await makePiece(db, job("start"), soon());
  assert.equal(machine.started.length, 0);
  assert.deepEqual([row().status, row().failed_why], ["failed", "clips"]);
  assert.equal(tables.notifications.length, 1, "and its owner is told");
});

test("an edition with no image on record is waited for, since a person builds one", async () => {
  const { db, tables, machine, row } = world({ image: false });
  await makePiece(db, job("start"), soon());
  assert.equal(machine.started.length, 0);
  assert.equal(row().status, "making");
  assert.deepEqual(stepsOf(tables), [["piece_make", "start", "2"]]);
});

test("a start run again after its machine was kept starts no second machine", async () => {
  const { db, tables, machine, row } = world();
  await makePiece(db, job("start"), soon());
  tables.jobs.length = 0;
  // The run died between keeping the machine and writing the next step, and the ledger ran it again.
  await makePiece(db, job("start"), soon());
  assert.equal(machine.started.length, 1);
  assert.equal(pieceMachineOf(row().machine).round, 1);
  assert.deepEqual(stepsOf(tables), [["piece_make", "wait", "1"]]);
});

test("a video no longer being made is left alone", async () => {
  const { db, tables, machine } = world({ piece: pieceRow({ status: "failed", failed_why: "draw" }) });
  await makePiece(db, job("start"), soon());
  await makePiece(db, job("wait"), soon());
  assert.equal(machine.started.length, 0);
  assert.deepEqual(tables.jobs, []);
});

const drawing = (over = {}) => ({
  name: "machine-1",
  cmd_id: "cmd-1",
  started_at: new Date().toISOString(),
  round: 1,
  frames: 310,
  ...over,
});

test("wait asks after a drawing still going until its run is nearly up, then puts the next tick on the ledger", async () => {
  const { db, tables, machine, row } = world({ piece: pieceRow({ machine: drawing() }) });
  await makePiece(db, job("wait", "2"), Date.now() + 26_000);
  assert.ok(machine.pauses >= 1, "it asks more than once in a run");
  assert.equal(row().status, "making");
  assert.deepEqual(stepsOf(tables), [["piece_make", "wait", "3"]]);
  assert.deepEqual(machine.stopped, []);
});

test("a made file is named for the words its video opens on: both lines where they are one short phrase", async () => {
  const named = async (lines) => {
    const { db, tables, machine } = world({ piece: pieceRow({ machine: drawing(), plan: plan({ lines }) }) });
    machine.states = [{ stage: "done", bytes: 4096 }];
    await makePiece(db, job("wait"), soon());
    return tables.files.find((f) => f.source === "made")?.name;
  };
  // A phrase a line could not hold, broken across two: the name is the phrase.
  assert.equal(await named(["How we do", "a blowout"]), "how-we-do-a-blowout");
  // Two lines too long together for a name: its first line, whole, never one cut mid-thought.
  assert.equal(await named(["I asked for volume", "Did I get it?"]), "i-asked-for-volume");
});

test("a drawing done is sent into the video platform as a file made here, and the machine is let go", async () => {
  const { db, tables, web, machine, row, kept } = world({ piece: pieceRow({ machine: drawing() }) });
  machine.states = [
    { stage: "working", progress: 0.9 },
    { stage: "done", bytes: 4096 },
  ];
  await makePiece(db, job("wait"), soon());
  // The reservation is for exactly the video's bytes, and the bytes go to the address it answered, from the first.
  assert.equal(web.reserved.bytes, "4096");
  assert.deepEqual(web.sent, { bytes: 4096, offset: "0" });
  const made = tables.files.find((f) => f.source === "made");
  assert.ok(made, "the video has its row");
  assert.equal(made.media_ref, MADE_UID);
  // Its bytes all went, and its row says so: from here the platform's word ends it, and no later run can.
  assert.equal(made.media_status, "processing");
  assert.equal(made.name, "i-asked-for-volume");
  assert.equal(made.bytes, 4096);
  assert.match(made.fingerprint, /^[0-9a-f]{64}$/);
  // Its length is the timeline's, kept with its machine at the start: the cuts' 252 frames and the end card's, less the
  // fade they share. No clip is read again to keep it: the finish asks the video platform for a place and nothing else.
  assert.equal(Number(made.seconds), 10.33);
  assert.deepEqual(
    web.asked.filter((asked) => asked.includes("/manifest/")),
    [],
  );
  assert.equal(row().stage, "saving");
  assert.equal(row().file_id, made.id);
  // Its own file is kept in its folder, for its Download: the platform plays a video and gives no file back.
  assert.deepEqual(kept, [{ path: `${T}/${made.id}/video.mp4`, bytes: 4096, type: "video/mp4" }]);
  assert.equal(row().machine, null);
  assert.deepEqual(machine.stopped, ["machine-1"]);
  // Still being made: the platform's word that it can be played is what makes it made.
  assert.equal(row().status, "making");
  assert.deepEqual(tables.jobs, []);
});

test("a cover the machine drew beside the video is kept in its folder; one it could not draw leaves the video as it is", async () => {
  const drawn = world({ piece: pieceRow({ machine: drawing() }) });
  drawn.machine.cover = new Uint8Array(900).fill(9);
  drawn.machine.states = [{ stage: "done", bytes: 4096 }];
  await makePiece(drawn.db, job("wait"), soon());
  const made = drawn.tables.files.find((f) => f.source === "made");
  assert.deepEqual(drawn.kept, [
    { path: `${T}/${made.id}/video.mp4`, bytes: 4096, type: "video/mp4" },
    { path: `${T}/${made.id}/cover.jpg`, bytes: 900, type: "image/jpeg" },
  ]);
  assert.equal(drawn.row().file_id, made.id);
});

test("the machine is asked for its cover: the best moment of the video's clips, as a frame of the video", async () => {
  const { db, machine } = world();
  await makePiece(db, job("start"), soon());
  const props = machine.started[0]?.job.props;
  assert.ok(props, "a machine was started");
  assert.ok(
    Number.isInteger(props.cover) && props.cover >= 0 && props.cover < props.timeline.frames,
    String(props.cover),
  );
});

test("as a made video is sent its copy on the shelf is begun, held to the very bytes that went, and is never the video's to fail", async () => {
  // A deployment with a relay, as production's is: the shelf's own tests run the job that follows.
  Object.assign(process.env, { FOOTAGE_RELAY_URL: "https://relay.example", FOOTAGE_TICKET_KEY: "ticket-key" });
  try {
    const sent = async (shelf) => {
      const w = world({ piece: pieceRow({ machine: drawing() }), shelf });
      w.machine.states = [{ stage: "done", bytes: 4096 }];
      const { lines } = await linesOf(() => makePiece(w.db, job("wait"), soon()));
      return { ...w, lines, made: w.tables.files.find((f) => f.source === "made") };
    };
    const on = await sent("on");
    assert.deepEqual(on.shelfAsked, [
      {
        p_tenant_id: T,
        p_file_id: on.made.id,
        p_bytes: 4096,
        // The SHA-256 of the bytes the machine drew: the ones kept for Download and sent to the platform.
        p_sha256: createHash("sha256").update(on.machine.video).digest("hex"),
        p_seconds_max: 300 * 60,
      },
    ]);
    assert.equal(on.made.media_status, "processing", "begun after its bytes all went");
    // A workspace whose switch is off is not asked for a shelf copy at all.
    const off = await sent("off");
    assert.deepEqual(off.shelfAsked, []);
    assert.equal(off.made.media_status, "processing");
    // The door not answering is a line, and the video is sent and its machine let go all the same.
    const broken = await sent("broken");
    assert.equal(broken.shelfAsked.length, 1);
    assert.equal(broken.made.media_status, "processing");
    assert.equal(broken.row().machine, null);
    assert.deepEqual(broken.machine.stopped, ["machine-1"]);
    assert.ok(
      broken.lines.some((line) => line.event === "piece_drawn"),
      "its drawing is still said",
    );
  } finally {
    delete process.env.FOOTAGE_RELAY_URL;
    delete process.env.FOOTAGE_TICKET_KEY;
  }
  // A deployment with no relay has no shelf: nothing is asked.
  const none = world({ piece: pieceRow({ machine: drawing() }), shelf: "on" });
  none.machine.states = [{ stage: "done", bytes: 4096 }];
  await makePiece(none.db, job("wait"), soon());
  assert.deepEqual(none.shelfAsked, []);
});

test("a video made where the minutes are full has what can step aside make room for it, and ends as before where nothing can", async () => {
  const drawn = async (full) => {
    const w = world({ piece: pieceRow({ machine: drawing() }), full });
    w.machine.states = [{ stage: "done", bytes: 4096 }];
    await makePiece(w.db, job("wait"), soon());
    return { ...w, made: w.tables.files.find((f) => f.source === "made") };
  };
  // Two older videos may go (the database says which): each is deleted at the platform, and the new one is kept.
  const room = {
    left: true,
    went: [],
    mayGo: [
      { id: "older-1", media_ref: "a".repeat(32), seconds: 30 },
      { id: "older-2", media_ref: "b".repeat(32), seconds: 30 },
    ],
  };
  const kept = await drawn(room);
  assert.equal(room.askedFor, 10.33, "room for the new video's own length");
  assert.deepEqual(room.went, ["older-1", "older-2"]);
  assert.deepEqual(
    kept.web.asked.filter((asked) => asked.startsWith("DELETE")),
    [`DELETE ${STREAM_API}/${"a".repeat(32)}`, `DELETE ${STREAM_API}/${"b".repeat(32)}`],
  );
  assert.ok(kept.made, "the new video has its row");
  assert.equal(kept.made.media_status, "processing");
  assert.equal(kept.row().status, "making");
  // Nothing may go: the video ends as not stored, as it did before there was a shelf, and its place is let go.
  const none = await drawn({ left: true, went: [], mayGo: [] });
  assert.equal(none.made, undefined);
  assert.deepEqual([none.row().status, none.row().failed_why], ["failed", "store"]);
  assert.deepEqual(
    none.web.asked.filter((asked) => asked.startsWith("DELETE")),
    [`DELETE ${STREAM_API}/${MADE_UID}`],
  );
});

test("a drawing that fails is tried once more from the start, on a fresh machine", async () => {
  const { db, tables, machine, row } = world({ piece: pieceRow({ machine: drawing() }) });
  machine.states = [{ stage: "failed", error: "the renderer stopped" }];
  await makePiece(db, job("wait"), soon());
  assert.deepEqual(machine.stopped, ["machine-1"]);
  assert.equal(row().status, "making");
  assert.equal(pieceMachineOf(row().machine), null);
  assert.deepEqual(stepsOf(tables), [["piece_make", "start", "1"]]);
  // The row remembers one try was made, so the second start says so on the machine it keeps.
  tables.jobs.length = 0;
  await makePiece(db, job("start"), soon());
  assert.equal(pieceMachineOf(row().machine).round, 2);
  assert.equal(machine.started.length, 1);
});

test("a drawing that fails twice ends the video: it could not be drawn, and its owner is told", async () => {
  const { db, tables, machine, row } = world({ piece: pieceRow({ machine: drawing({ round: 2 }) }) });
  machine.states = [{ stage: "gone" }];
  await makePiece(db, job("wait"), soon());
  assert.deepEqual([row().status, row().failed_why], ["failed", "draw"]);
  assert.equal(tables.notifications[0]?.body, PIECE_WORDS.bell.failedBody("draw"));
  assert.deepEqual(tables.jobs, []);
  assert.deepEqual(machine.stopped, ["machine-1"]);
});

test("a drawing still going after three minutes is taken for stalled, and treated as one that failed", async () => {
  const stale = new Date(Date.now() - 4 * 60_000).toISOString();
  const { db, tables, machine, row } = world({ piece: pieceRow({ machine: drawing({ started_at: stale }) }) });
  await makePiece(db, job("wait", "5"), Date.now() + 26_000);
  assert.deepEqual(machine.stopped, ["machine-1"]);
  assert.equal(row().status, "making");
  assert.deepEqual(stepsOf(tables), [["piece_make", "start", "1"]]);
  assert.equal(pieceRoundsOf(row().machine), 1);
});

test("a video's log says what its drawing took: how long its machine was kept, on how many cores, at which try", async () => {
  // What a video costs to draw is its machine's time: one is billed for as long as it is kept and by the cores it has.
  const begun = new Date(Date.now() - 42_000).toISOString();
  const done = world({ piece: pieceRow({ machine: drawing({ started_at: begun }) }) });
  done.machine.states = [{ stage: "done", bytes: 4096 }];
  const drawn = (await linesOf(() => makePiece(done.db, job("wait"), soon()))).lines.find(
    (line) => line.event === "piece_drawn",
  );
  assert.ok(drawn, "a made video writes its line");
  assert.deepEqual([drawn.round, drawn.vcpus, drawn.frames], [1, 8, 310]);
  assert.ok(drawn.machine_ms >= 42_000 && drawn.machine_ms < 60_000, `its machine's time: ${drawn.machine_ms}`);
  // A try that failed kept a machine as long as it ran, and a video's cost is every try's.
  const failed = world({ piece: pieceRow({ machine: drawing({ started_at: begun }) }) });
  failed.machine.states = [{ stage: "failed", error: "the renderer stopped" }];
  const ended = (await linesOf(() => makePiece(failed.db, job("wait"), soon()))).lines.find(
    (line) => line.event === "piece_drawing_ended",
  );
  assert.ok(ended, "a failed try writes its line");
  assert.deepEqual([ended.round, ended.vcpus], [1, 8]);
  assert.ok(ended.machine_ms >= 42_000 && ended.machine_ms < 60_000, `the failed try's time: ${ended.machine_ms}`);
});

test("a video the platform will not take ends as not stored, and no row of it is left as a file", async () => {
  const { db, tables, machine, row } = world({ piece: pieceRow({ machine: drawing() }) });
  machine.states = [{ stage: "done", bytes: 4096 }];
  const reserve = answer;
  answer = async (url, init) =>
    url.startsWith(`${STREAM_API}?direct_user=true`)
      ? new Response(JSON.stringify({ errors: [{ message: "storage capacity exceeded" }] }), { status: 413 })
      : reserve(url, init);
  await makePiece(db, job("wait"), soon());
  assert.deepEqual([row().status, row().failed_why], ["failed", "store"]);
  assert.equal(tables.files.filter((f) => f.source === "made").length, 0);
  assert.equal(tables.notifications[0]?.body, PIECE_WORDS.bell.failedBody("store"));
  assert.deepEqual(machine.stopped, ["machine-1"]);
});

/** A made video's row as a run that began it left it, begun so long ago. */
const begunFile = (id, agoMs) => ({
  id,
  tenant_id: T,
  status: "filed",
  source: "made",
  name: "i-asked-for-volume",
  kind: "video",
  media_ref: MADE_UID,
  media_status: "uploading",
  removed_at: null,
  created_at: new Date(Date.now() - agoMs).toISOString(),
});

test("a second run that finds the file begun moments ago by another leaves it to that run: nothing ends, nothing goes twice", async () => {
  const begun = "eeeeeeee-0000-4000-8000-000000000002";
  const { db, tables, web, machine, row } = world({ piece: pieceRow({ machine: drawing(), file_id: begun }) });
  tables.files.push(begunFile(begun, 5_000));
  machine.states = [{ stage: "done", bytes: 4096 }];
  let letGo = null;
  const before = answer;
  answer = async (url, init) => {
    if (init?.method === "DELETE") {
      letGo = url;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    return before(url, init);
  };
  await makePiece(db, job("wait"), soon());
  assert.equal(web.sent, null, "the run that began it is the one sending it");
  assert.ok(letGo?.endsWith(MADE_UID), "the reservation this run made for nothing is let go");
  assert.equal(row().status, "making", "and the video is not ended under the run that is finishing it");
  assert.deepEqual(tables.notifications, []);
  assert.equal(tables.files.find((f) => f.id === begun).removed_at, null);
  // The machine is the sender's to let go: it may still be reading from it.
  assert.deepEqual(machine.stopped, []);
});

test("a video whose file was begun by a run that died is not sent twice: it ends as not kept, and is asked for again", async () => {
  const begun = "eeeeeeee-0000-4000-8000-000000000001";
  const { db, tables, web, machine, row } = world({ piece: pieceRow({ machine: drawing(), file_id: begun }) });
  // Begun five minutes ago and still not sent: whoever began it is gone (a send takes seconds, a run a minute).
  tables.files.push(begunFile(begun, 5 * 60_000));
  machine.states = [{ stage: "done", bytes: 4096 }];
  let letGo = null;
  const before = answer;
  answer = async (url, init) => {
    if (init?.method === "DELETE") {
      letGo = url;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    return before(url, init);
  };
  await makePiece(db, job("wait"), soon());
  assert.equal(web.sent, null, "no bytes go to a reservation its row never held");
  assert.ok(letGo?.endsWith(MADE_UID), "the reservation made for nothing is let go");
  assert.deepEqual([row().status, row().failed_why], ["failed", "store"]);
  assert.deepEqual(machine.stopped, ["machine-1"]);
  assert.equal(tables.notifications.length, 1);
});

test("a video drawn to the very bytes of one already in Files is that video: its owner is told at once, and nothing is sent", async () => {
  const twin = { ...begunFile("eeeeeeee-0000-4000-8000-000000000003", 60 * 60_000), media_status: "ready" };
  const { db, tables, web, machine, row } = world({ piece: pieceRow({ machine: drawing() }), twin });
  tables.files.push(twin);
  machine.states = [{ stage: "done", bytes: 4096 }];
  let letGo = null;
  const before = answer;
  answer = async (url, init) => {
    if (init?.method === "DELETE") {
      letGo = url;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    return before(url, init);
  };
  await makePiece(db, job("wait"), soon());
  assert.equal(web.sent, null);
  assert.ok(letGo?.endsWith(MADE_UID), "the place reserved for it is let go");
  assert.deepEqual([row().status, row().file_id], ["made", twin.id]);
  // No word will come from the video platform for a file it made ready long ago: the bell is rung here.
  assert.deepEqual(
    tables.notifications.map((n) => [n.kind, n.title]),
    [["video_ready", PIECE_WORDS.bell.ready]],
  );
  assert.deepEqual(machine.stopped, ["machine-1"]);
});

test("a video drawn to the bytes of one the platform could not read is not made, and says so", async () => {
  const twin = { ...begunFile("eeeeeeee-0000-4000-8000-000000000004", 60 * 60_000), media_status: "failed" };
  const { db, tables, machine, row } = world({ piece: pieceRow({ machine: drawing() }), twin });
  tables.files.push(twin);
  machine.states = [{ stage: "done", bytes: 4096 }];
  const before = answer;
  answer = async (url, init) =>
    init?.method === "DELETE" ? new Response(JSON.stringify({ success: true }), { status: 200 }) : before(url, init);
  await makePiece(db, job("wait"), soon());
  assert.deepEqual([row().status, row().failed_why], ["failed", "store"]);
  assert.deepEqual(
    tables.notifications.map((n) => [n.kind, n.body]),
    [["job_failed", PIECE_WORDS.bell.failedBody("store")]],
  );
  assert.deepEqual(machine.stopped, ["machine-1"]);
});

test("a video whose own file could not be kept is not sent: there would be nothing to download", async () => {
  const { db, web, machine, row } = world({ piece: pieceRow({ machine: drawing() }) });
  machine.states = [{ stage: "done", bytes: 4096 }];
  storageFails = true;
  try {
    await makePiece(db, job("wait"), soon());
  } finally {
    storageFails = false;
  }
  assert.equal(web.sent, null);
  assert.deepEqual([row().status, row().failed_why], ["failed", "store"]);
  assert.deepEqual(machine.stopped, ["machine-1"]);
});

test("the platform's word that a made video can be played rings the bell once; one it could not read says so", async () => {
  const { db, tables } = world({ piece: pieceRow({ status: "made", file_id: CLIP }) });
  tables.files[0].name = "i-asked-for-volume";
  await tellPieceMoved(db, { fate: "ready", tenant_id: T, file_id: CLIP, made: true });
  assert.equal(tables.notifications.length, 1);
  assert.equal(tables.notifications[0].kind, "video_ready");
  // The bell opens the video itself, open in Content, where it plays.
  assert.equal(tables.notifications[0].route, `campaigns/content:${CLIP}`);
  // Named as Files shows it, never by its file name (seen on production 11 Nov 2026: "long-layers is in Files").
  assert.equal(tables.notifications[0].body, "I asked for volume · Watch it");
  // A word about a video that was not made here, or one delivered again, rings nothing.
  await tellPieceMoved(db, { fate: "ready", tenant_id: T, file_id: CLIP, made: false });
  await tellPieceMoved(db, { fate: "repeated", tenant_id: T, file_id: CLIP, made: false });
  assert.equal(tables.notifications.length, 1);
  await tellPieceMoved(db, { fate: "failed", tenant_id: T, file_id: CLIP, made: true });
  assert.equal(tables.notifications[1].kind, "job_failed");
  assert.equal(tables.notifications[1].body, PIECE_WORDS.bell.failedBody("store"));
});

test("the job's steps are a closed set, and a row's machine reads back or is none", () => {
  assert.equal(isPieceStep("start") && isPieceStep("wait"), true);
  assert.equal(isPieceStep("look"), false);
  assert.equal(pieceMachineOf({ name: "m", cmd_id: "c" }), null);
  assert.equal(pieceMachineOf(null), null);
  // Between two tries the row holds how many were made, and no machine.
  assert.equal(pieceRoundsOf({ round: 1 }), 1);
  assert.equal(pieceMachineOf({ round: 1 }), null);
  assert.equal(pieceRoundsOf(null), 0);
  assert.deepEqual(pieceMachineOf({ name: "m", cmd_id: "c", started_at: "2026-11-10T00:00:00Z", round: 2 }), {
    name: "m",
    cmd_id: "c",
    started_at: "2026-11-10T00:00:00Z",
    round: 2,
    frames: 0,
  });
  // The video's frames ride with it, where the start kept them.
  assert.equal(pieceMachineOf({ name: "m", cmd_id: "c", started_at: "2026-11-10T00:00:00Z", frames: 310 }).frames, 310);
  assert.equal(pieceMachineOf({ name: "m", cmd_id: "c", started_at: "2026-11-10T00:00:00Z", frames: -4 }).frames, 0);
});
