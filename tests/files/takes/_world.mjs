/**
 * The world the takes' tests share (apps/edge/lib/files/takes, the footage sources plan's P3): a database in memory
 * whose doors answer as 00643's SQL does (_doors.mjs), a Storage that keeps what it is handed, a Drive and a video platform that
 * answer from memory, and a pretend sync that hands out an hour's key. The real take, key door and settlement run over
 * it; nothing here reaches a network.
 *
 * ORDER MATTERS in each file that uses it: this module sets the environment and the global fetch as it loads, and
 * imports the edge's modules after.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import { createHash, randomUUID } from "node:crypto";
import { fakeDb } from "../../_fake-db.mjs";
import { at } from "../../_cron-doors-world.mjs";
import { copyDoors } from "../copies/_doors.mjs";
import { takeDoors } from "./_doors.mjs";

export const TICKET_KEY = "ticket-key-for-this-file";
export const DOOR_SECRET = "app-key-for-this-file";
export const RELAY_URL = "https://relay.example";
/** The hour's Drive key the pretend sync hands out: what must never be in an address or a log. */
export const DRIVE_KEY = "ya29.a-drive-key-for-this-file";
/** A refresh token, which nothing in a take may ever see: it is seeded nowhere, and searched for everywhere. */
export const REFRESH_TOKEN = "1//a-refresh-token-for-this-file";

Object.assign(process.env, {
  CLOUDFLARE_ACCOUNT_ID: "acct-1",
  CLOUDFLARE_STREAM_API_TOKEN: "stream-token-for-this-file",
  FOOTAGE_RELAY_URL: RELAY_URL,
  FOOTAGE_TICKET_KEY: TICKET_KEY,
  FOOTAGE_KEY_DOOR_SECRET: DOOR_SECRET,
});
for (const name of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[name];

/** Every request the code under test makes of the web, answered by the case's own web (theWeb). */
let answer = async (url) => {
  throw new Error(`nothing answers ${url}`);
};
export const realFetch = globalThis.fetch;
globalThis.fetch = (url, init) => answer(String(url), init);

export const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));
const { sourceTaker } = await import(at("apps/edge/lib/files/takes/step.ts"));
const { handOutTakes } = await import(at("apps/edge/lib/files/takes/hand-out.ts"));
const { answerKeyDoor } = await import(at("apps/edge/lib/files/takes/key-door.ts"));
export { handOutTakes };
export const { TAKE_BUDGETS, TAKE_HAND_OUT, DRIVE_UNITS } = await import(at("apps/edge/lib/files/takes/budgets.ts"));

export const T = "aaaaaaaa-0000-4000-8000-000000000001";
export const T2 = "aaaaaaaa-0000-4000-8000-000000000002";
export const SOURCE = "cccccccc-0000-4000-8000-000000000001";
export const CONNECTION = "dddddddd-0000-4000-8000-000000000001";
export const STREAM_API = "https://api.cloudflare.com/client/v4/accounts/acct-1/stream";
const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files/";
const MIB = 1_048_576;

/** A fingerprint as the app makes one: the sha256 of the first MiB and the size. */
export const printOf = (head, size) =>
  createHash("sha256").update(head.subarray(0, MIB)).update(String(size)).digest("hex");

/** Bytes whose every one says where it is, by a seed: two clips never share a first MiB. */
export const bytesOf = (length, seed = 1) =>
  Uint8Array.from({ length }, (_, i) => (i * 31 + (i >> 8) + seed * 7) & 0xff);

/** One item as the sync lists it, waiting to be taken. */
export const itemRow = (over = {}) => ({
  id: randomUUID(),
  tenant_id: T,
  source_id: SOURCE,
  provider_id: `drive-${randomUUID().slice(0, 8)}`,
  kind: "video",
  parent_id: "folder-1",
  name: "clip.MOV",
  modified_at: "2026-11-16T10:00:00.000Z",
  checksum: null,
  bytes: null,
  seconds: null,
  added_by: null,
  state: "waiting",
  why: null,
  file_id: null,
  first_seen_at: "2026-11-10T10:00:00.000Z",
  gone_at: null,
  updated_at: "2026-11-16T10:00:00.000Z",
  take_after: null,
  taken_at: null,
  take_tries: 0,
  ...over,
});

/**
 * The world: its tables, its doors modelled as 00643 writes them, its Storage, and a clock the doors read (`w.nowMs`),
 * so a case can let a day pass.
 */
export function world({
  tenants = [T],
  takesVideos = true,
  files = [],
  letGo = [],
  items = [],
  sourceState = "watching",
} = {}) {
  const tables = {
    tenants: tenants.map((id) => ({ id, name: "Harbor Salon", timezone: "America/New_York", status: "active" })),
    tenant_config: takesVideos
      ? tenants.map((id) => ({ tenant_id: id, config: { features: { video_preview: true } } }))
      : [],
    media_sources: tenants.map((id, i) => ({
      id: i === 0 ? SOURCE : randomUUID(),
      tenant_id: id,
      connection_id: CONNECTION,
      folder_id: "folder-1",
      folder_name: "Clips",
      state: sourceState,
    })),
    source_items: [...items],
    source_days: [],
    files: [...files],
    files_let_go: [...letGo],
    jobs: [],
    events: [],
  };
  const w = {
    tables,
    nowMs: Date.parse("2026-11-17T20:00:00Z"),
    caps: { ...TAKE_BUDGETS },
    asked: [],
    handOuts: [],
    unitWrites: [],
  };
  // 00654's doors beside 00643's: a take that meets full videos asks which copies may be let go for it.
  const db = fakeDb(tables, {}, { ...takeDoors(tables, w), ...copyDoors(tables, w) });
  const bucket = { uploaded: [], removed: [] };
  db.storage = {
    from: () => ({
      upload: async (path, bytes) => {
        if (w.storageDown) return { error: { message: "storage is down" } };
        bucket.uploaded.push({ path, bytes: bytes.length });
        return { error: null };
      },
      remove: async (paths) => {
        bucket.removed.push(...paths);
        return { error: null };
      },
    }),
  };
  setPg(db);
  return Object.assign(w, { db, bucket, item: (id) => tables.source_items.find((i) => i.id === id) });
}

/**
 * Drive and the video platform, from memory. `drive` maps a provider's id to what it holds: `{ mime, name, seconds,
 * size, bytes }`, where `bytes` may be only the file's first MiB and `size` the whole it claims. Every request is kept.
 */
export function theWeb({ drive = {}, refuseCopy = null, driveSays = null, busyCopies = 0, held = [] } = {}) {
  const calls = [];
  // The copies the video platform holds: those a case says it held before, and each one asked for since.
  const copies = [...held];
  let busy = busyCopies;
  answer = async (url, init = {}) => {
    const headers = Object.fromEntries(
      Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]),
    );
    calls.push({ url, method: init.method ?? "GET", headers, body: init.body ? String(init.body) : null });
    if (url.startsWith(DRIVE_FILES)) {
      const asked = new URL(url);
      const held = drive[decodeURIComponent(asked.pathname.split("/").pop())];
      if (driveSays) return driveSays(asked, headers);
      if (!held || headers.authorization !== `Bearer ${DRIVE_KEY}`)
        return new Response(JSON.stringify({ error: { errors: [{ reason: "notFound" }] } }), { status: 404 });
      const size = held.size ?? held.bytes.length;
      const range = /^bytes=(\d+)-(\d+)$/.exec(headers.range ?? "");
      const from = range ? Number(range[1]) : 0;
      const to = Math.min(range ? Number(range[2]) : size - 1, held.bytes.length - 1, size - 1);
      return new Response(held.bytes.subarray(from, to + 1), {
        status: 206,
        headers: { "content-type": held.mime, "content-range": `bytes ${from}-${to}/${size}` },
      });
    }
    if (url === `${STREAM_API}/copy`) {
      // As many videos queued or encoding as it takes at once: its own "too many", with nothing wrong with the clip.
      if (busy-- > 0)
        return new Response(JSON.stringify({ success: false, errors: [{ code: 10010, message: "Too many videos" }] }), {
          status: 429,
          headers: { "content-type": "application/json" },
        });
      if (refuseCopy)
        return new Response(JSON.stringify({ success: false, errors: [{ code: 10000, message: refuseCopy }] }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      const uid = createHash("md5").update(`copy-${copies.length}`).digest("hex");
      copies.push({ uid, ...JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ success: true, result: { uid, status: { state: "downloading" } } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    // Its list, searched by a part of the name a video was asked for under.
    if (url.startsWith(`${STREAM_API}?search=`)) {
      const search = new URL(url).searchParams.get("search");
      const result = copies.filter((c) => !c.deleted && String(c.meta?.name ?? "").includes(search));
      return new Response(JSON.stringify({ success: true, result }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.startsWith(`${STREAM_API}/`)) {
      const copy = copies.find((c) => url === `${STREAM_API}/${c.uid}`);
      if (copy && (init.method ?? "GET") === "DELETE") copy.deleted = true;
      // Asked after by the sweep: one a case gave a state answers as the platform would; one it deleted is not there.
      if (copy?.deleted && (init.method ?? "GET") === "GET")
        return new Response(JSON.stringify({ success: false }), { status: 404 });
      if (copy?.state && (init.method ?? "GET") === "GET") {
        const result = { uid: copy.uid, readyToStream: copy.state === "ready", status: { state: copy.state } };
        return new Response(JSON.stringify({ success: true, result }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    throw new Error(`nothing answers ${url}`);
  };
  return { calls, copies };
}

/**
 * The sync, pretended and handed to the take and the key door in place of the deployment's: a folder opened hands
 * out the hour's key, and an item's record is what the case says Drive holds of it. `closed` names why a folder is
 * not one to read; `silent` is Google giving no answer when a key is asked for. `recordThrows` is what asking for a
 * record throws, and `signedOut` what the sync then answers of it: the account signed out for a key refused for good.
 * With none, what was thrown is thrown on, as the sync does with anything it cannot settle.
 */
let sync = null;
export function theSync({ drive = {}, closed = null, silent = false, recordThrows = null, signedOut = null } = {}) {
  const opened = [];
  // What a call under the key threw and the sync was asked to settle: kept beside the list, not as one of its items.
  Object.defineProperty(opened, "settled", { value: [] });
  sync = {
    open: async (_db, named) => {
      opened.push(named);
      if (silent) throw new Error("the token endpoint did not answer");
      if (closed) return { ok: false, skipped: closed };
      return {
        ok: true,
        accessToken: DRIVE_KEY,
        refused: async (error) => {
          opened.settled.push(error);
          if (signedOut) return { skipped: signedOut };
          throw error;
        },
      };
    },
    record: async (accessToken, providerId) => {
      if (recordThrows) throw recordThrows;
      const held = drive[providerId];
      if (accessToken !== DRIVE_KEY || !held) return { verdict: "gone" };
      return {
        verdict: "ok",
        answer: {
          id: providerId,
          kind: held.mime.startsWith("video/") ? "video" : "image",
          parentId: "folder-1",
          name: held.name,
          mime: held.mime,
          modifiedAt: "2026-11-16T10:00:00.000Z",
          checksum: held.checksum === undefined ? `md5-of-${providerId}` : held.checksum,
          bytes: held.size ?? held.bytes.length,
          seconds: held.seconds ?? null,
          addedBy: null,
          trashed: held.trashed === true,
        },
      };
    },
  };
  return opened;
}

/** The case's sync, for a world that runs another job through it (tests/files/copies). */
export const theSyncNow = () => sync;

/** One job run by the real handler, through the case's sync. */
export const takeJob = (w, job) => sourceTaker(w.db, sync).take(job, Date.now() + 30_000);

/** The relay's knock on the key door, answered by the real door through the case's sync. */
export const keyDoor = (request) => answerKeyDoor(request, sync);

/**
 * The clock's turn, then every take's job written from then on run by the real handler, those a take hands its
 * workspace as it ends among them: what became of each, in the order they ran.
 */
export async function runTakes(w) {
  let at = w.tables.jobs.length;
  await handOutTakes(w.db);
  const ends = [];
  for (; at < w.tables.jobs.length; at += 1) {
    const job = w.tables.jobs[at];
    if (job.kind === "source_take") ends.push(await takeJob(w, job));
  }
  return ends;
}
