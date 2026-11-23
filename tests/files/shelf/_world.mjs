/**
 * The world the shelf's tests share (apps/edge/lib/files/shelf, the archive plan's B2): the copies' own world (its
 * database in memory with 00654's and 00690's doors, its pretend video platform and Drive) with the shelf beside it:
 * the relay's own handler over a bucket in memory, reached at the relay's address, and the files bucket a made video's
 * own file is kept in and pulled from. The real shelving, letting go, return and purge run over one set of tables.
 * Nothing here reaches a network.
 *
 * ORDER MATTERS in each file that uses it: the takes' world, which this stands on, sets the environment and the
 * global fetch as it loads, and the edge's modules are imported after.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import { at } from "../../_cron-doors-world.mjs";
import { RELAY_URL, T, TICKET_KEY, videoRow, world } from "../copies/_world.mjs";
import { shaOf, shelfRelay } from "./_shelf.mjs";

export * from "../copies/_world.mjs";
export { shaOf } from "./_shelf.mjs";

const { shelver } = await import(at("apps/edge/lib/files/shelf/shelve.ts"));
export const { beginShelving } = await import(at("apps/edge/lib/files/shelf/shelve.ts"));
export const { fileMadePathOf } = await import(at("packages/contracts/src/files/kinds.ts"));
export const { FILE_SHELF_MINUTES_MAX } = await import(at("packages/contracts/src/files/limits.ts"));

/** Where the files bucket's signed links begin: what the relay is set up to pull from, and nothing else. */
export const FILES_START = "https://files.example.com/storage/v1/object/sign/files/";

/** A made video's bytes, by a seed: two videos never share a checksum. */
export const videoBytes = (seed = 1, length = 64 * 1024) =>
  Uint8Array.from({ length }, (_, i) => (i * 31 + (i >> 8) + seed * 7) & 0xff);

/** A video Chanlytics made, in the Library: playable, looked at, last used days ago, unless a case says otherwise. */
export const madeVideo = (over = {}) =>
  videoRow({ source: "made", mime: "video/mp4", made: { piece: "p", shape: "hook_cut", plan: {} }, ...over });

/**
 * The world, with the shelf. `shelfOn` is the workspace's switch (features.video_shelf); `kept` is what the files
 * bucket holds, a made video's id to its own file's bytes. Every ask of the web that is the relay's goes to the
 * Worker's own handler, and every other to the case's web (theWeb), as before.
 */
export function shelfWorld({ shelfOn = true, kept = [], bucket, ...copies } = {}) {
  const w = world(copies);
  w.tables.tenant_config[0].config.features.video_shelf = shelfOn;
  w.tables.file_archives ??= [];
  w.tables.file_archive_parts ??= [];
  const files = new Map(kept.map(([fileId, bytes]) => [fileMadePathOf(T, fileId, "video"), bytes]));
  const storage = { signed: [], signFails: null };
  const base = w.db.storage.from();
  w.db.storage = {
    from: () => ({
      ...base,
      createSignedUrl: async (path, seconds) => {
        storage.signed.push({ path, seconds });
        if (storage.signFails) return { data: null, error: { message: storage.signFails, status: 500 } };
        // As Storage answers for a file that is not there.
        if (!files.has(path))
          return { data: null, error: { message: "Object not found", status: 400, statusCode: "404" } };
        return { data: { signedUrl: `${FILES_START}${path}?token=signed-for-a-while` }, error: null };
      },
    }),
  };
  const relay = shelfRelay({
    relayUrl: RELAY_URL,
    ticketKey: TICKET_KEY,
    from: FILES_START,
    ...(bucket === undefined ? {} : { shelf: bucket }),
    // The files bucket, as the relay reads a signed link: the bytes whole with their length, or Storage's refusal.
    source: (url) => {
      const bytes = files.get(decodeURIComponent(new URL(url).pathname.slice(new URL(FILES_START).pathname.length)));
      return bytes
        ? new Response(bytes, { status: 200, headers: { "content-length": String(bytes.length) } })
        : new Response(JSON.stringify({ message: "Object not found" }), { status: 400 });
    },
  });
  // The relay's address is answered by the Worker's own handler; everything else by the case's web, as it was.
  const web = globalThis.fetch;
  globalThis.fetch = (url, init) => (relay.isRelays(url) ? relay.answer(String(url), init) : web(url, init));
  return Object.assign(w, {
    relay,
    files,
    storage,
    /** What the shelf holds of a file, as its bucket has it; undefined where it holds none. */
    onShelf: (fileId) => relay.shelf?.held.get(`${T}/${fileId}/video`),
    shelfRow: (fileId) => w.tables.file_archives.find((a) => a.file_id === fileId && a.origin === "shelf") ?? null,
    shelfPiece: (fileId) => {
      const row = w.tables.file_archives.find((a) => a.file_id === fileId && a.origin === "shelf");
      return row ? (w.tables.file_archive_parts.find((p) => p.archive_id === row.id) ?? null) : null;
    },
    shelveJobs: () => w.tables.jobs.filter((job) => job.kind === "file_shelve"),
    /** Put the bucket's routing back: a case's world is its own. */
    close: () => {
      globalThis.fetch = web;
    },
  });
}

/** One shelving's job run by the real handler. */
export const shelveJob = (w, job, deadline = Date.now() + 45_000) => shelver(w.db).shelve(job, deadline);

/** Every shelving's job on the ledger not yet run, run by the real handler: what became of each. */
export async function runShelving(w) {
  const ends = [];
  for (const job of w.shelveJobs().filter((j) => !j.ran && j.state === "scheduled")) {
    job.ran = true;
    try {
      ends.push(await shelveJob(w, job));
      job.state = "done";
    } catch (failure) {
      // As the ledger holds a throw: the job is tried again later, and a case decides whether it is.
      job.ran = false;
      ends.push({ threw: failure.message });
    }
  }
  return ends;
}

/** A made video with a checked copy on the shelf: its row, its piece and the object, as a shelving leaves them. */
export async function shelveNow(w, file, bytes) {
  w.files.set(fileMadePathOf(T, file.id, "video"), bytes);
  await beginShelving(w.db, { tenantId: T, fileId: file.id, bytes: bytes.length, sha256: shaOf(bytes) });
  const ends = await runShelving(w);
  if (w.shelfRow(file.id)?.state !== "checked") throw new Error(`not shelved: ${JSON.stringify(ends)}`);
}
