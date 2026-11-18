/**
 * The world the takes' tests share (apps/edge/lib/files/takes, the footage sources plan's P3): a database in memory
 * whose doors answer as 00642's SQL does, a Storage that keeps what it is handed, a Drive and a video platform that
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
const LA = "America/Los_Angeles";

/** The day Google counts an instant in, as 00642 does: the date in Pacific time. */
const pacificDay = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: LA }).format(new Date(ms));

/** When the Pacific day after an instant's begins. */
function nextPacificDay(ms) {
  const day = pacificDay(ms);
  let at = ms;
  // A day is at most 25 hours: step a quarter hour at a time to the first instant of the next one.
  while (pacificDay(at) === day) at += 15 * 60 * 1000;
  let back = at;
  while (pacificDay(back - 60 * 1000) !== day) back -= 60 * 1000;
  return new Date(back - (back % (60 * 1000)));
}

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
 * The world: its tables, its doors modelled as 00642 writes them, its Storage, and a clock the doors read (`w.nowMs`),
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
  const live = (tenantId, fingerprint) =>
    tables.files.find((f) => f.tenant_id === tenantId && f.fingerprint === fingerprint && !f.removed_at);
  const wasLetGo = (tenantId, fingerprint) =>
    tables.files_let_go.some((g) => g.tenant_id === tenantId && g.fingerprint === fingerprint);
  const kept = (tenantId) => tables.files.filter((f) => f.tenant_id === tenantId && !f.removed_at);
  const videoSeconds = (tenantId) =>
    kept(tenantId)
      .filter((f) => f.kind === "video" && f.media_status !== "failed")
      .reduce((sum, f) => sum + Number(f.seconds ?? 0), 0);
  const dayRow = () => {
    const day = pacificDay(w.nowMs);
    let row = tables.source_days.find((d) => d.day === day);
    if (!row) tables.source_days.push((row = { day, bytes: 0, takes: 0, units: 0 }));
    return row;
  };
  const mediaWord = (mediaRef, word, seconds = null) => {
    const row = tables.files.find((f) => f.media_ref === mediaRef);
    if (!row) return { fate: "unknown" };
    const named = { tenant_id: row.tenant_id, file_id: row.id, made: false };
    if (row.removed_at) return { fate: word === "ready" ? "gone" : "repeated", ...named };
    if (["ready", "failed"].includes(row.media_status)) return { fate: "repeated", ...named };
    // A video whose road never said its length, judged by it as the platform says it: too long, or no room.
    if (word === "ready" && row.seconds === null && seconds !== null && row.source !== "upload") {
      const why = seconds > 600 ? "long" : videoSeconds(row.tenant_id) + seconds > 3600 ? "minutes" : null;
      if (why) {
        Object.assign(row, {
          removed_at: new Date(w.nowMs).toISOString(),
          seconds,
          media_error: why === "long" ? "too_long" : "no_room",
        });
        return { fate: "passed", why, ...named };
      }
    }
    row.media_status = word;
    if (word === "ready" && seconds !== null) row.seconds = seconds;
    return { fate: word, ...named };
  };

  const db = fakeDb(
    tables,
    {},
    {
      // 00551 and 00630, as a take meets the door: asked again, a twin, what was let go, room, then the row.
      file_found: (a) => {
        w.asked.push({ door: "file_found", ...a });
        if (w.doorThrows) throw new Error(w.doorThrows);
        if (tables.files.some((f) => f.id === a.p_id)) return { fate: "kept", file_id: a.p_id };
        const twin = live(a.p_tenant_id, a.p_fingerprint);
        if (twin) return { fate: "here", file_id: twin.id };
        if (a.p_source !== "upload" && wasLetGo(a.p_tenant_id, a.p_fingerprint)) return { fate: "here", file_id: null };
        if (kept(a.p_tenant_id).length >= 1000) return { fate: "full", file_id: null };
        tables.files.push({
          id: a.p_id,
          tenant_id: a.p_tenant_id,
          kind: "image",
          status: a.p_status,
          source: a.p_source,
          source_ref: a.p_source_ref,
          name: a.p_name,
          mime: a.p_mime,
          bytes: a.p_bytes,
          fingerprint: a.p_fingerprint,
          width: a.p_width,
          height: a.p_height,
          look_status: "waiting",
          media_ref: null,
          media_status: null,
          removed_at: null,
        });
        tables.jobs.push({
          id: randomUUID(),
          tenant_id: a.p_tenant_id,
          kind: "file_look",
          payload: { file_id: a.p_id },
        });
        return { fate: "kept", file_id: a.p_id };
      },
      // 00642's order: asked again, a twin, what was let go, the Library's cap, the videos' room, then (with a copy
      // named) the row and its origin in one write.
      file_video_sourced: (a) => {
        w.asked.push({ door: "file_video_sourced", ...a });
        if (w.doorThrows) throw new Error(w.doorThrows);
        const held = tables.files.find((f) => f.tenant_id === a.p_tenant_id && f.id === a.p_id);
        if (held) return { fate: "kept", file_id: a.p_id, media_ref: held.media_ref };
        const twin = live(a.p_tenant_id, a.p_fingerprint);
        if (twin) return { fate: "here", file_id: twin.id };
        if (wasLetGo(a.p_tenant_id, a.p_fingerprint)) return { fate: "let_go", file_id: null };
        if (kept(a.p_tenant_id).length >= 1000) return { fate: "full", file_id: null };
        // 00642 file_video_room, the one check a found video's door asks too: long, minutes or room.
        if (w.doorCallsLong || (a.p_seconds !== null && a.p_seconds > 600)) return { fate: "long", file_id: null };
        const used = videoSeconds(a.p_tenant_id);
        if ((a.p_seconds === null && used >= 3600) || used + Number(a.p_seconds ?? 0) > 3600)
          return { fate: "minutes", file_id: null };
        if (a.p_media_ref === null) return { fate: "room", file_id: null };
        tables.files.push({
          id: a.p_id,
          tenant_id: a.p_tenant_id,
          kind: "video",
          status: "filed",
          source: "drive",
          source_ref: null,
          name: a.p_name,
          mime: a.p_mime,
          bytes: a.p_bytes,
          seconds: a.p_seconds,
          fingerprint: a.p_fingerprint,
          media_ref: a.p_media_ref,
          media_status: "uploading",
          look_status: "waiting",
          removed_at: null,
        });
        const item = tables.source_items.find((i) => i.tenant_id === a.p_tenant_id && i.id === a.p_item_id);
        if (item) item.file_id = a.p_id;
        return { fate: "kept", file_id: a.p_id, media_ref: a.p_media_ref };
      },
      // 00642: the platform's day and the workspace's, a day as Google counts one.
      source_take_spend: (a) => {
        const item = tables.source_items.find((i) => i.tenant_id === a.p_tenant_id && i.id === a.p_item_id);
        if (!item) return { fate: "unknown" };
        const day = pacificDay(w.nowMs);
        const until = nextPacificDay(w.nowMs).toISOString();
        const spent = dayRow();
        const today = (i) => i.taken_at && pacificDay(Date.parse(i.taken_at)) === day;
        if (spent.units + a.p_units > a.p_units_max) return { fate: "wait", binds: "units", until };
        if (spent.bytes + a.p_bytes > a.p_platform_bytes_max) return { fate: "wait", binds: "platform_bytes", until };
        if (!today(item)) {
          const mine = tables.source_items.filter((i) => i.tenant_id === a.p_tenant_id && today(i));
          if (mine.length + 1 > a.p_workspace_takes_max) return { fate: "wait", binds: "workspace_takes", until };
          if (mine.reduce((sum, i) => sum + Number(i.bytes ?? 0), 0) + a.p_bytes > a.p_workspace_bytes_max)
            return { fate: "wait", binds: "workspace_bytes", until };
          item.taken_at = new Date(w.nowMs).toISOString();
          item.bytes = a.p_bytes;
        }
        spent.bytes += a.p_bytes;
        spent.takes += 1;
        return { fate: "go" };
      },
      source_units_spend: (a) => {
        w.unitWrites.push(a.p_units);
        const spent = dayRow();
        spent.units += a.p_units;
        return spent.units;
      },
      // 00556's two doors, as the video platform's word meets them: found by the copy's id, moved once.
      file_media_ready: (a) => mediaWord(a.p_media_ref, "ready", a.p_seconds ?? null),
      file_media_failed: (a) => mediaWord(a.p_media_ref, "failed"),
      // 00642: what waits and is due, of a folder still being read, moved to taking and given its job in one write.
      // For one workspace or for all, while a workspace has fewer than so many in flight and the video platform is
      // preparing fewer than so many clips. A paused kind is handed nothing.
      source_takes_hand_out: (a) => {
        w.handOuts.push(a);
        if (w.kindPaused) return 0;
        const mine = (i) => !a.p_tenant_id || i.tenant_id === a.p_tenant_id;
        const reading = new Set(
          tables.media_sources.filter((s) => ["setting_up", "watching"].includes(s.state)).map((s) => s.id),
        );
        for (const item of tables.source_items)
          if (
            mine(item) &&
            item.state === "taking" &&
            !item.file_id &&
            Date.parse(item.updated_at) < w.nowMs - a.p_stale_seconds * 1000
          )
            Object.assign(item, { state: "waiting", why: "lost", take_after: null });
        const taking = tables.source_items.filter((i) => i.state === "taking");
        const flying = (tenantId) => taking.filter((i) => i.tenant_id === tenantId).length;
        const videosRoom = Math.max(a.p_videos_max, 0) - taking.filter((i) => i.kind === "video").length;
        const due = tables.source_items
          .filter(
            (i) =>
              mine(i) &&
              i.state === "waiting" &&
              ["image", "video"].includes(i.kind) &&
              (!i.take_after || Date.parse(i.take_after) <= w.nowMs) &&
              reading.has(i.source_id),
          )
          .sort((x, y) => String(y.modified_at).localeCompare(String(x.modified_at)) || x.id.localeCompare(y.id));
        const places = new Map();
        const candidates = [];
        for (const item of due) {
          const place = (places.get(item.tenant_id) ?? 0) + 1;
          places.set(item.tenant_id, place);
          if (place <= Math.max(a.p_in_flight, 1) - flying(item.tenant_id)) candidates.push(item);
        }
        let handed = 0;
        let videos = 0;
        for (const item of a.p_tenant_id ? candidates : candidates.slice(0, Math.max(a.p_limit, 1))) {
          if (item.kind === "video" && ++videos > videosRoom) continue;
          Object.assign(item, {
            state: "taking",
            why: item.why === "lost" ? "lost" : null,
            take_after: null,
            updated_at: new Date(w.nowMs).toISOString(),
          });
          tables.jobs.push({
            id: randomUUID(),
            tenant_id: item.tenant_id,
            kind: "source_take",
            state: "scheduled",
            payload: { item_id: item.id, try: String(item.take_tries) },
          });
          handed += 1;
        }
        return handed;
      },
    },
  );
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
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    throw new Error(`nothing answers ${url}`);
  };
  return { calls, copies };
}

/**
 * The sync, pretended and handed to the take and the key door in place of the deployment's: a folder opened hands
 * out the hour's key, and an item's record is what the case says Drive holds of it. `closed` names why a folder is
 * not one to read; `silent` is Google giving no answer when a key is asked for.
 */
let sync = null;
export function theSync({ drive = {}, closed = null, silent = false } = {}) {
  const opened = [];
  sync = {
    open: async (_db, named) => {
      opened.push(named);
      if (silent) throw new Error("the token endpoint did not answer");
      return closed ? { ok: false, skipped: closed } : { ok: true, accessToken: DRIVE_KEY };
    },
    record: async (accessToken, providerId) => {
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
