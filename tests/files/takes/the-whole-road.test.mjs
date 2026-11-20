/**
 * The whole road, proved in one run (the review of 18 November 2026, finding 22): a watched folder listed by the real
 * walk, kept current by the real read, its files taken by the real take THROUGH THE DEPLOYMENT'S OWN SYNC (no
 * pretend one: takes/sync.ts opens the folder as a walk does), the relay's knock answered by the real key door, and a
 * clip finished by the video platform's word at the real webhook. Over the sync's world (its Drive, its Vault, its
 * tables) with the takes' own doors beside it (_doors.mjs), so both halves write the same rows.
 *
 * What only this file proves: that the two halves agree on a row. A file that left its folder and came back is in
 * again with the file it had; new bytes under the same file are a new file; a key Google refuses part way is settled
 * by the sync's rule; and every unit asked of Drive, by a walk, a read, a take or the relay, is on the day's one line.
 */
import crypto, { createHmac } from "node:crypto";
import { test, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetBreakers } from "@chanlytics/channels/shared";
import { at } from "../../_cron-doors-world.mjs";
import { driveRefusal } from "../sources/_fake-drive.mjs";
import { CONNECTION, ROOT, SOURCE, firstWalk, runJobs, schedule, setEnv, world } from "../sources/_world.mjs";
import { copyDoors } from "../copies/_doors.mjs";
import { takeDoors } from "./_doors.mjs";

const TICKET_KEY = "ticket-key-for-this-file";
const DOOR_SECRET = "app-key-for-this-file";
const WEBHOOK_SECRET = "stream-webhook-secret-for-this-file";
setEnv();
Object.assign(process.env, {
  CLOUDFLARE_ACCOUNT_ID: "acct-1",
  CLOUDFLARE_STREAM_API_TOKEN: "stream-token-for-this-file",
  CLOUDFLARE_STREAM_WEBHOOK_SECRET: WEBHOOK_SECRET,
  FOOTAGE_RELAY_URL: "https://relay.example",
  FOOTAGE_TICKET_KEY: TICKET_KEY,
  FOOTAGE_KEY_DOOR_SECRET: DOOR_SECRET,
});
for (const name of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[name];

const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));
const { sourceTaker } = await import(at("apps/edge/lib/files/takes/step.ts"));
const { answerKeyDoor } = await import(at("apps/edge/lib/files/takes/key-door.ts"));
const { receiveStreamWebhook } = await import(at("apps/edge/lib/files/video-webhook.ts"));
const { DRIVE_UNITS } = await import(at("apps/edge/lib/files/takes/budgets.ts"));

const STREAM_API = "https://api.cloudflare.com/client/v4/accounts/acct-1/stream";
const MIB = 1_048_576;
/** Bytes whose every one says where it is, by a seed: two files never share a first MiB. */
const bytesOf = (length, seed) => Uint8Array.from({ length }, (_, i) => (i * 31 + (i >> 8) + seed * 7) & 0xff);

let w;
beforeEach(() => resetBreakers());
afterEach(() => {
  w?.restore();
  setPg(null);
});

/**
 * The sync's world with the takes' doors over the same tables, a Storage that keeps what it is handed, and the video
 * platform answering beside the pretend Drive. Answers what each kept.
 */
function road() {
  const takes = {
    get nowMs() {
      return Date.now();
    },
    asked: [],
    handOuts: [],
    unitWrites: [],
  };
  w = world({
    tables: { files: [], files_let_go: [], source_days: [], events: [] },
    rpcs: (tables) => ({ ...takeDoors(tables, takes), ...copyDoors(tables, takes) }),
  });
  const stored = [];
  w.db.storage = {
    from: () => ({
      upload: async (path, bytes) => {
        stored.push({ path, bytes: bytes.length });
        return { error: null };
      },
      remove: async () => ({ error: null }),
    }),
  };
  setPg(w.db);
  const copies = [];
  const driveFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (!url.startsWith(STREAM_API)) return driveFetch(input, init);
    if (url !== `${STREAM_API}/copy`) throw new Error(`the video platform is not asked ${url} on this road`);
    const uid = crypto.createHash("md5").update(`copy-${copies.length}`).digest("hex");
    copies.push({ uid, ...JSON.parse(String(init.body)) });
    return new Response(JSON.stringify({ success: true, result: { uid, status: { state: "downloading" } } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { takes, stored, copies };
}

/** A folder with one short clip and one photo, each holding bytes of its own. */
function footage(drive) {
  return drive
    .folder(ROOT, "Footage", null)
    .folder("elsewhere", "Private", null)
    .video("clip-1", "IMG_1561.MOV", ROOT, { size: 56_000_000 })
    .photo("photo-1", "IMG_0001.HEIC", ROOT, { size: 4096 })
    .holds("clip-1", bytesOf(MIB, 1))
    .holds("photo-1", bytesOf(4096, 2));
}

/**
 * Every take's job on the ledger run by the real handler through the deployment's own sync, those a take hands its
 * workspace as it ends among them: what became of each, in the order they ran. A job that throws is left failed, as
 * the ledger leaves one it will try again, and the throw is the test's to read.
 */
async function runTakes() {
  const ends = [];
  for (let round = 0; round < 50; round++) {
    const job = w.tables.jobs.find((row) => row.kind === "source_take" && (row.state ?? "scheduled") === "scheduled");
    if (!job) return ends;
    job.state = "fired";
    try {
      ends.push(await sourceTaker(w.db).take(job, Date.now() + 30_000));
      job.state = "done";
    } catch (error) {
      job.state = "failed";
      throw error;
    }
  }
  throw new Error("the takes did not come to rest in 50 rounds");
}

const read = async () => {
  schedule(w, "source_read", { source_id: SOURCE }, [SOURCE]);
  return runJobs(w);
};

/** Stream's delivery about one video, signed as Stream signs it. */
function delivery(event) {
  const body = JSON.stringify(event);
  const time = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", WEBHOOK_SECRET).update(`${time}.${body}`).digest("hex");
  return new Request("https://edge.example/api/stream-webhook", {
    method: "POST",
    headers: { "webhook-signature": `time=${time},sig1=${sig}` },
    body,
  });
}

/** The relay's knock for the clip a copy was asked for: the ticket in the address the video platform was given. */
const relayKnock = (copy, method = "GET") =>
  new Request("https://edge.example/api/sources/key", {
    method: "POST",
    headers: { authorization: `Bearer ${DOOR_SECRET}` },
    body: JSON.stringify({ ticket: new URL(copy.input).searchParams.get("ticket"), method, range: "bytes=0-" }),
  });

const fileOf = (providerId) => w.tables.files.find((file) => file.id === w.item(providerId).file_id);
const standingOf = (providerId) => [w.item(providerId).state, w.item(providerId).why ?? null];
const recordsOf = (providerId) => w.drive.count(`/drive/v3/files/${providerId}`);

/** The folder watched and both its files in the Library: the road walked once, to its end. */
async function cameIn() {
  const kept = road();
  footage(w.drive);
  await firstWalk(w);
  await runTakes();
  const [copy] = kept.copies;
  assert.equal((await answerKeyDoor(relayKnock(copy))).status, 200);
  const word = delivery({ uid: copy.uid, readyToStream: true, status: { state: "ready" }, duration: 8 });
  assert.equal((await receiveStreamWebhook(word)).status, 200);
  assert.deepEqual(
    [standingOf("clip-1"), standingOf("photo-1")],
    [
      ["in", null],
      ["in", null],
    ],
  );
  return kept;
}

test("a folder is watched and what it holds comes in: listed by the walk, taken by its job, finished by the platform's word", async () => {
  const { takes, stored, copies } = road();
  footage(w.drive);
  await firstWalk(w);
  // The walk's end asked for the newest and its workspace was handed their jobs at once: no clock turn between.
  assert.deepEqual(
    [standingOf("clip-1"), standingOf("photo-1")],
    [
      ["taking", null],
      ["taking", null],
    ],
  );
  assert.equal(w.jobs("source_take").length, 2);

  // Each job opens the folder as a walk does (the account's own hour's key, from Vault) and takes its file.
  const ends = await runTakes();
  assert.deepEqual(ends.map((end) => end.took).sort(), ["asked", "in"]);
  const photo = fileOf("photo-1");
  assert.deepEqual(
    [standingOf("photo-1"), photo.source, photo.kind, photo.bytes],
    [["in", null], "drive", "image", 4096],
  );
  assert.deepEqual(
    stored.map((kept) => kept.bytes),
    [4096],
    "the photo's bytes are in Storage, once",
  );

  // The clip is asked of the video platform by the relay's address, which names the item and never a Google key.
  const clip = fileOf("clip-1");
  assert.deepEqual([standingOf("clip-1"), clip.media_status, clip.bytes], [["taking", null], "uploading", 56_000_000]);
  const [copy] = copies;
  assert.equal(copies.length, 1);
  assert.ok(copy.input.startsWith(`https://relay.example/clip/${w.item("clip-1").id}/clip.mov?ticket=`), copy.input);
  assert.doesNotMatch(
    JSON.stringify(copy),
    /access-token-1|refresh-token-1/,
    "no key of Google's leaves in an address",
  );

  // The relay shows the ticket at the key door, which opens the folder through the same sync and counts its read.
  const key = await answerKeyDoor(relayKnock(copy));
  assert.equal(key.status, 200);
  assert.deepEqual(await key.json(), { access_token: "access-token-1", file_id: "clip-1" });

  // The platform's word finishes it.
  const word = delivery({ uid: copy.uid, readyToStream: true, status: { state: "ready" }, duration: 8 });
  assert.equal((await receiveStreamWebhook(word)).status, 200);
  assert.deepEqual([standingOf("clip-1"), clip.media_status], [["in", null], "ready"]);
  assert.equal(w.tables.files.length, 2);

  // Every unit asked of Drive is on the day's one line: the walk's and the read's, each take's record and download,
  // and the relay's own download, which the key door counted as it gave the key.
  const [day] = w.tables.source_days;
  assert.equal(w.tables.source_days.length, 1);
  assert.equal(day.units, w.drive.units() + DRIVE_UNITS.download);
  assert.equal(
    w.drive.units((call) => call.query.alt === "media"),
    2 * DRIVE_UNITS.download,
    "two downloads by the app: the photo whole and the clip's first MiB",
  );
  assert.deepEqual([day.takes, day.bytes], [2, 56_000_000 + 4096], "and the day's takes and bytes beside them");
  // Once the ticket's clip is in, the same ticket opens nothing.
  assert.equal((await answerKeyDoor(relayKnock(copy))).status, 404);
  assert.ok(takes.handOuts.length >= 3, "asked as the walk ended, as each take ended and as the clip settled");
});

test("a file that left its folder and came back is in again with the file it had: nothing of it is asked of Drive twice", async () => {
  const { stored, copies } = await cameIn();
  const [clipFile, photoFile] = [fileOf("clip-1").id, fileOf("photo-1").id];
  w.drive.move("clip-1", "elsewhere").move("photo-1", "elsewhere");
  await read();
  assert.deepEqual(
    [standingOf("clip-1"), standingOf("photo-1")],
    [
      ["outside", null],
      ["outside", null],
    ],
  );
  assert.equal(w.tables.files.filter((file) => !file.removed_at).length, 2, "what came in stays in the Library");

  w.drive.move("clip-1", ROOT).move("photo-1", ROOT);
  await read();
  // The read asked for both (each still holds its file) and handed them their jobs as it ended.
  assert.deepEqual(
    [standingOf("clip-1"), standingOf("photo-1")],
    [
      ["taking", null],
      ["taking", null],
    ],
  );
  const before = { records: recordsOf("clip-1") + recordsOf("photo-1"), units: w.tables.source_days[0].units };
  const ends = await runTakes();
  assert.deepEqual(
    ends.map((end) => end.took),
    ["in", "in"],
  );
  assert.deepEqual(
    [w.item("clip-1").file_id, w.item("photo-1").file_id, standingOf("clip-1"), standingOf("photo-1")],
    [clipFile, photoFile, ["in", null], ["in", null]],
  );
  assert.equal(recordsOf("clip-1") + recordsOf("photo-1"), before.records, "no record and no byte is read again");
  assert.equal(w.tables.source_days[0].units, before.units, "and none of the day's units is spent");
  assert.deepEqual([w.tables.files.length, stored.length, copies.length], [2, 1, 1], "no second file, copy or upload");
});

test("new bytes under the same file are a new file: it is asked for again, and what was taken before stays in the Library", async () => {
  const { stored } = await cameIn();
  const first = fileOf("photo-1").id;
  w.drive.put({ id: "photo-1", md5Checksum: "md5-other-bytes", size: 5000 }).holds("photo-1", bytesOf(5000, 9));
  await read();
  // The read saw the bytes changed on a file the taking held: it let go of the old file and its job was handed out.
  assert.deepEqual([standingOf("photo-1"), w.item("photo-1").file_id], [["taking", null], null]);
  assert.deepEqual(
    (await runTakes()).map((end) => end.took),
    ["in"],
  );
  const second = fileOf("photo-1");
  assert.notEqual(second.id, first);
  assert.deepEqual(
    [second.bytes, w.item("photo-1").checksum, w.item("photo-1").bytes],
    [5000, "md5-other-bytes", 5000],
  );
  assert.deepEqual(
    w.tables.files
      .filter((file) => file.kind === "image" && !file.removed_at)
      .map((file) => file.bytes)
      .sort(),
    [4096, 5000],
    "both are in the Library: nothing removes what was taken before",
  );
  assert.deepEqual(
    stored.map((kept) => kept.bytes),
    [4096, 5000],
  );
  // The clip beside it was not touched.
  assert.deepEqual(standingOf("clip-1"), ["in", null]);
});

test("a key Google refuses part way through a take is the sync's to settle: a stale one is replaced and the job tried again", async () => {
  road();
  footage(w.drive);
  await firstWalk(w);
  // Drive refuses the key once, as the photo's record is asked for; Google then gives the account a fresh one.
  w.drive.answerNext("/drive/v3/files/photo-1", driveRefusal(401, "authError"));
  w.drive.grant({ access_token: "access-token-2", expires_in: 3600, scope: "drive" });
  await assert.rejects(runTakes(), /key was refused/, "thrown on: the ledger tries the job again");
  assert.equal(w.vault.get(CONNECTION).access_token, "access-token-2", "with the new key, kept");
  assert.deepEqual([w.tables.source_connections[0].health, w.source().state], ["ok", "watching"], "nothing is paused");
  const failed = w.tables.jobs.find((job) => job.kind === "source_take" && job.state === "failed");
  assert.equal(failed.payload.item_id, w.item("photo-1").id);
  assert.deepEqual(standingOf("photo-1"), ["taking", null], "the item is still its job's to take");
  assert.equal(w.tables.source_days[0].units > 0, true, "what the refused call cost is still counted");
  // Tried again, as the ledger tries it: both files go through under the new key.
  failed.state = "scheduled";
  await runTakes();
  assert.deepEqual(
    [standingOf("photo-1"), standingOf("clip-1")],
    [
      ["in", null],
      ["taking", null],
    ],
  );
  assert.equal(fileOf("clip-1").media_status, "uploading");
  assert.equal(w.drive.count("/token"), 1, "one refresh, for the one refusal");
});

test("a grant Google refuses for good signs the account out: its folder pauses and its files wait for it, none failed", async () => {
  const { stored, copies } = road();
  footage(w.drive);
  await firstWalk(w);
  w.drive.answerNext("/drive/v3/files/photo-1", driveRefusal(401, "authError"));
  w.drive.answerNext("/drive/v3/files/clip-1", driveRefusal(401, "authError"));
  w.drive.grant({ error: "invalid_grant" });
  const ends = await runTakes();
  assert.deepEqual(
    ends.map((end) => end.skipped ?? end.took).sort(),
    ["the account is signed out", "the folder is paused"],
    "the first take meets the refusal; the second finds the folder already paused",
  );
  assert.deepEqual(
    [w.tables.source_connections[0].health, w.source().state, w.source().stopped_why],
    ["needs_reconnect", "paused", "signed_out"],
  );
  for (const id of ["photo-1", "clip-1"]) {
    const item = w.item(id);
    assert.deepEqual([item.state, item.why, item.take_tries, item.file_id], ["waiting", "folder", 0, null], id);
    assert.ok(Date.parse(item.take_after) > Date.now(), "asked after again later, never failed");
  }
  assert.deepEqual([w.tables.files.length, stored.length, copies.length], [0, 0, 0], "nothing came in");
  // A paused folder's files are handed no job: the clock asks, and nothing is due of a folder that is not read.
  for (const item of w.items()) item.take_after = null;
  const jobs = w.jobs("source_take").length;
  await sourceTaker(w.db).take(
    { tenant_id: w.tables.tenants[0].id, payload: { item_id: w.item("photo-1").id } },
    Date.now() + 30_000,
  );
  assert.equal(w.jobs("source_take").length, jobs, "a take's end hands nothing of a paused folder out");
});
