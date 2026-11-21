/**
 * The world the copies' tests share (apps/edge/lib/files/copy, the footage sources plan's P4): the takes' own world
 * (its database in memory, its pretend Drive, video platform and sync) with 00654's doors beside 00643's, so the real
 * door, return, letting go and sweep run over one set of tables. Nothing here reaches a network.
 *
 * ORDER MATTERS in each file that uses it: the takes' world sets the environment and the global fetch as it loads,
 * and the edge's modules are imported after.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import { randomUUID } from "node:crypto";
import { fakeDb } from "../../_fake-db.mjs";
import { at } from "../../_cron-doors-world.mjs";
import { takeDoors } from "../takes/_doors.mjs";
import { CONNECTION, SOURCE, T, itemRow, setPg, theSyncNow } from "../takes/_world.mjs";
import { copyDoors } from "./_doors.mjs";

export * from "../takes/_world.mjs";

const { copyReturner } = await import(at("apps/edge/lib/files/copy/bring-back.ts"));
export const { ensureCopy, ensureCopyOf } = await import(at("apps/edge/lib/files/copy/ensure.ts"));
export const { makeRoom, letUnusedCopiesGo } = await import(at("apps/edge/lib/files/copy/let-go.ts"));
export const { keepCopiesMoving } = await import(at("apps/edge/lib/files/copy/sweep.ts"));
export const { COPY_RETURN, LET_GO, RETURN_BUDGETS, SOURCE_GRACE } = await import(
  at("apps/edge/lib/files/takes/budgets.ts")
);

/**
 * The world's now is the clock's own: the edge reads the clock for what is rested and what is unused, so a world with
 * a date of its own would pass at some hours and fail at others (CI runs every test at its clock and twelve hours on).
 */
export const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;
/** A moment so many days before the world's now. */
export const daysAgo = (days) => new Date(NOW - days * DAY).toISOString();

let stamp = 0;
/** A 32-hex id as the video platform gives one. */
export const copyId = () => (++stamp).toString(16).padStart(32, "a");

/** A video in the Library, playable and looked at: a watched folder's clip unless a case says another road. */
export const videoRow = (over = {}) => ({
  id: randomUUID(),
  tenant_id: T,
  kind: "video",
  status: "filed",
  source: "drive",
  source_ref: null,
  name: `clip-${++stamp}`,
  mime: "video/quicktime",
  bytes: 50_000_000,
  seconds: 60,
  fingerprint: `print-${stamp}`,
  media_ref: copyId(),
  media_status: "ready",
  media_error: null,
  look_status: "done",
  look: { says: "a clip" },
  made: null,
  copy_state: "here",
  copy_why: null,
  copy_used_at: null,
  copy_returned_at: null,
  ready_at: daysAgo(3),
  created_at: daysAgo(3),
  updated_at: daysAgo(3),
  removed_at: null,
  ...over,
});

/** A watched clip already in the Library with the item it came from: its copy here unless a case says otherwise. */
export function watchedClip(file = {}, item = {}) {
  const row = videoRow(file);
  const away = ["away", "lost"].includes(row.copy_state);
  if (away) row.media_ref = null;
  const origin = itemRow({
    state: "in",
    file_id: row.id,
    provider_id: `drive-${row.name}`,
    checksum: `md5-of-${row.name}`,
    bytes: row.bytes,
    seconds: row.seconds,
    ...item,
  });
  return { row, origin };
}

/** What Drive holds of a clip's origin, as the pretend sync and web read it: the bytes the take kept facts of. */
export const driveOf = (...clips) =>
  Object.fromEntries(
    clips.map(({ row, origin }) => [
      origin.provider_id,
      {
        mime: row.mime,
        name: `${row.name}.MOV`,
        seconds: Number(row.seconds),
        size: Number(row.bytes),
        bytes: new Uint8Array(16),
        checksum: origin.checksum,
      },
    ]),
  );

/**
 * The world: the takes' tables and doors, and the copies' beside them. `sourceState` is the folder's, and
 * `connectionHealth` its Google account's (a stopped folder's clips step aside only while it reads: F1).
 */
export function world({
  files = [],
  items = [],
  pieces = [],
  posts = [],
  sourceState = "watching",
  connectionHealth = "ok",
} = {}) {
  const tables = {
    tenants: [{ id: T, name: "Harbor Salon", timezone: "America/New_York", status: "active" }],
    tenant_config: [{ tenant_id: T, config: { features: { video_preview: true } } }],
    source_connections: [{ id: CONNECTION, tenant_id: T, provider: "google", health: connectionHealth }],
    media_sources: [
      {
        id: SOURCE,
        tenant_id: T,
        connection_id: CONNECTION,
        folder_id: "folder-1",
        folder_name: "Clips",
        state: sourceState,
      },
    ],
    source_items: [...items],
    source_days: [],
    files: [...files],
    files_let_go: [],
    pieces: [...pieces],
    posts: [...posts],
    jobs: [],
    events: [],
  };
  const w = { tables, nowMs: NOW, asked: [], handOuts: [], unitWrites: [] };
  const db = fakeDb(tables, {}, { ...takeDoors(tables, w), ...copyDoors(tables, w) });
  db.storage = {
    from: () => ({
      list: async () => ({ data: [], error: null }),
      remove: async () => ({ error: null }),
      upload: async () => ({ error: null }),
    }),
  };
  setPg(db);
  return Object.assign(w, {
    db,
    file: (id) => tables.files.find((f) => f.id === id),
    item: (id) => tables.source_items.find((i) => i.id === id),
    returns: () => tables.jobs.filter((job) => job.kind === "copy_return"),
  });
}

/** One return's job run by the real handler, through the case's sync. */
export const returnJob = (w, job) => copyReturner(w.db, theSyncNow()).bringBack(job, Date.now() + 30_000);

/** Every return's job on the ledger not yet run, run by the real handler: what became of each. */
export async function runReturns(w) {
  const ends = [];
  for (const job of w.returns().filter((j) => !j.ran)) {
    job.ran = true;
    ends.push(await returnJob(w, job));
  }
  return ends;
}

/** The calls a case's web saw of the video platform, by what was asked: copies asked for, and ids deleted. */
export const platformSaw = (web) => ({
  asked: web.calls.filter((c) => c.url.endsWith("/copy") && c.method === "POST").length,
  deleted: web.calls.filter((c) => c.method === "DELETE").map((c) => c.url.split("/").pop()),
});
