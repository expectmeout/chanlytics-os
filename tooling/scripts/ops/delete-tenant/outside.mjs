/**
 * What a workspace keeps outside the database, and its removal (tooling/scripts/ops/delete-tenant.mjs): its files in
 * storage's buckets, its pictures' copies at Anthropic, its videos at Cloudflare Stream and on Chanlytics' own shelf.
 * No cascade reaches any of it.
 *
 * The removals run from a list written before anything is deleted: a file beside the backup with one line for each
 * thing to remove. A removal that worked marks its line, and the file is written again as the work goes, so a run that
 * stopped half-way, or met a provider that was down, leaves a list that says exactly what is still there. A later run
 * with `--resume <list>` asks only for those. A thing already gone is the end wanted, so asking twice does no harm.
 *
 * Plain Node, as the script is: it imports nothing of the app's.
 */
import { createHmac } from "node:crypto";
import { readFileSync, renameSync, writeFileSync } from "node:fs";

/** One video's removal from the shelf: a small call to the relay. */
const SHELF_CALL_MS = 10_000;
/** How long a shelf ticket made here runs: one call's worth, and some. */
const SHELF_TICKET_S = 300;
/** One copy's delete at Anthropic: a small call, with room for a slow answer. */
const ANTHROPIC_CALL_MS = 10_000;
/** One video's delete at Stream: the same. */
const STREAM_CALL_MS = 10_000;
/** A page of storage's list(), its own default: a folder past it is read again from where the page ended. */
const LIST_PAGE = 100;
/** The paths one storage remove() carries. */
const REMOVE_BATCH = 100;
/** How many removals at a provider go by between two writes of the list. */
const SAVE_EVERY = 25;

/**
 * The shelf's ticket to take one workspace's one file off it, as the relay reads one (apps/relay/src/ticket.ts
 * `readShelfTicket`): written out here because this script runs as plain Node and imports nothing of the app's. The
 * test holds it to the relay's own reader.
 */
export function shelfDeleteTicket(ticketKey, video, nowMs = Date.now()) {
  const claim = {
    for: "shelf",
    tenant: video.tenant,
    file: video.file,
    use: "delete",
    exp: Math.floor(nowMs / 1000) + SHELF_TICKET_S,
  };
  const body = `v2.${Buffer.from(JSON.stringify(claim), "utf8").toString("base64url")}`;
  return `${body}.${createHmac("sha256", ticketKey).update(body).digest().toString("base64url")}`;
}

/** The videos a workspace keeps on the shelf, read off its copies' pieces: each key is `<workspace>/<file>/video`. */
export function shelvedOf(parts) {
  return (parts ?? [])
    .map((part) => /^([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)\/video$/.exec(String(part.shelf_key ?? "")))
    .filter(Boolean)
    .map(([, tenant, file]) => ({ tenant, file }));
}

/** One video taken off the shelf through the relay, under a ticket of its own. Answers whether it is gone. */
async function removeFromShelf(relay, video, ask) {
  const res = await ask(`${relay.url.replace(/\/+$/, "")}/shelf/${encodeURIComponent(video.file)}/video`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${shelfDeleteTicket(relay.ticketKey, video)}` },
    signal: AbortSignal.timeout(SHELF_CALL_MS),
  }).catch(() => null);
  // The shelf says 204 for one it let go and for one it never held.
  return res?.status === 204;
}

/** Each video taken off the shelf through the relay. Answers how many stayed. */
export async function removeShelved(relay, videos, ask = fetch) {
  let stayed = 0;
  for (const video of videos) if (!(await removeFromShelf(relay, video, ask))) stayed++;
  return stayed;
}

/**
 * Every file under a folder of a bucket, `{ path, bytes }`, its subfolders' included: list() names one folder's
 * children, a subfolder as an entry with no id. A folder nothing was ever written to lists as empty, which is no files,
 * not an error; a folder it could not read is the error, so nothing is taken for empty that was not seen.
 */
export async function filesUnder(bucket, folder) {
  const files = [];
  const folders = [folder];
  while (folders.length) {
    const dir = folders.shift();
    for (let offset = 0; ; offset += LIST_PAGE) {
      const { data, error } = await bucket.list(dir, { limit: LIST_PAGE, offset });
      if (error) return { files, error: `${dir}: ${error.message}` };
      for (const entry of data ?? []) {
        if (!entry.id) folders.push(`${dir}/${entry.name}`);
        else files.push({ path: `${dir}/${entry.name}`, bytes: entry.metadata?.size ?? 0 });
      }
      if (!data || data.length < LIST_PAGE) break;
    }
  }
  return { files, error: null };
}

/**
 * The paths removed a batch at a time, `after` called as each batch ends. A batch storage refuses is kept by path and
 * the rest still go; a path already gone is the end state wanted, so it is neither removed nor failed.
 */
export async function removeAll(bucket, paths, after = () => {}) {
  const removed = [];
  const failed = [];
  let firstError = null;
  for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
    const batch = paths.slice(i, i + REMOVE_BATCH);
    const { data, error } = await bucket.remove(batch);
    if (error) {
      failed.push(...batch);
      firstError ??= error.message;
    } else removed.push(...(data ?? []).map((o) => o.name));
    after(batch, !error);
  }
  return { removed, failed, error: firstError };
}

/* ------------------------------------------------------------------------------------------ the clean-up list -- */

/**
 * The list's lines for what a workspace keeps outside the database, in the order it is removed: its logo, its files,
 * its pictures' copies at Anthropic, its videos at Stream, its videos on the shelf, then its media.
 */
export function listOf({ logos = [], files = [], copies = [], videos = [], shelved = [], media = [] }) {
  const stored = (bucket, paths) => paths.map((path) => ({ what: "storage", bucket, path }));
  return [
    ...stored("workspace-logos", logos),
    ...stored("files", files),
    ...copies.map((id) => ({ what: "anthropic", id })),
    ...videos.map((id) => ({ what: "stream", id })),
    ...shelved.map(({ tenant, file }) => ({ what: "shelf", tenant, file })),
    ...stored("media", media),
  ].map((item, i) => ({ n: i + 1, ...item, done: false }));
}

/** The list written whole: its first line says whose it is, each line after is one thing and whether it is gone. */
export function writeList(path, head, items) {
  const lines = [{ clean_up: 1, ...head }, ...items].map((line) => JSON.stringify(line));
  // Written beside itself and moved into place, so a run that dies mid-write leaves the list as it last stood.
  writeFileSync(`${path}.part`, lines.join("\n") + "\n");
  renameSync(`${path}.part`, path);
}

/** A list read back: `{ head, items }`, or `{ error }` for a file that is not one. */
export function readList(path) {
  let lines;
  try {
    lines = readFileSync(path, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (cause) {
    return { error: `could not read ${path}: ${cause.message}` };
  }
  const [head, ...items] = lines;
  if (head?.clean_up !== 1 || typeof head.tenant !== "string") return { error: `${path} is not a clean-up list` };
  return { head, items, error: null };
}

/** What a group of the list is called, where it is, and the words for one of its lines. */
const GROUPS = {
  "workspace-logos": { said: "logo files", where: "from workspace-logos", verb: "removed" },
  files: { said: "files", where: "from files", verb: "removed" },
  anthropic: { said: "copies", where: "at Anthropic", verb: "deleted" },
  stream: { said: "videos", where: "at Stream", verb: "deleted" },
  shelf: { said: "videos", where: "from the shelf", verb: "removed" },
  media: { said: "media files", where: "from media", verb: "removed" },
};
const groupOf = (item) => (item.what === "storage" ? item.bucket : item.what);

/** One line of the list, said: what it is and where. */
export function itemWords(item) {
  if (item.what === "storage") return `the file ${item.bucket}/${item.path}`;
  if (item.what === "anthropic") return `a picture's copy at Anthropic, ${item.id}`;
  if (item.what === "stream") return `a video at Cloudflare Stream, ${item.id}`;
  return `a video on the shelf, ${item.tenant}/${item.file}/video`;
}

/** A provider's call for one line, by kind: answers whether the thing is gone, or null where this run lacks its key. */
const CALLS = {
  anthropic: (env) =>
    env.ANTHROPIC_API_KEY
      ? async (item, ask) => {
          const res = await ask(`https://api.anthropic.com/v1/files/${encodeURIComponent(item.id)}`, {
            method: "DELETE",
            headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
            signal: AbortSignal.timeout(ANTHROPIC_CALL_MS),
          }).catch(() => null);
          return !!res && (res.ok || res.status === 404);
        }
      : null,
  stream: (env) =>
    env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_STREAM_API_TOKEN
      ? async (item, ask) => {
          const account = encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID);
          const res = await ask(
            `https://api.cloudflare.com/client/v4/accounts/${account}/stream/${encodeURIComponent(item.id)}`,
            {
              method: "DELETE",
              headers: { authorization: `Bearer ${env.CLOUDFLARE_STREAM_API_TOKEN}` },
              signal: AbortSignal.timeout(STREAM_CALL_MS),
            },
          ).catch(() => null);
          return !!res && (res.ok || res.status === 404);
        }
      : null,
  shelf: (env) =>
    env.FOOTAGE_RELAY_URL && env.FOOTAGE_TICKET_KEY
      ? (item, ask) => removeFromShelf({ url: env.FOOTAGE_RELAY_URL, ticketKey: env.FOOTAGE_TICKET_KEY }, item, ask)
      : null,
};

/** What a provider's lines wait for where this run holds no key for it. */
const KEYS_WANTED = {
  anthropic: "set ANTHROPIC_API_KEY for the run",
  stream: "set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_STREAM_API_TOKEN for the run",
  shelf: "set FOOTAGE_RELAY_URL and FOOTAGE_TICKET_KEY for the run",
};

/** A bucket's lines removed a batch at a time, each batch storage took marked done. */
async function removeStored(db, bucket, items, save) {
  const byPath = new Map(items.map((item) => [item.path, item]));
  const { error } = await removeAll(db.storage.from(bucket), [...byPath.keys()], (batch, took) => {
    if (took) for (const path of batch) byPath.get(path).done = true;
    save();
  });
  return error;
}

/** A provider's lines asked for one at a time, each that is gone marked done. */
async function removeAt(call, items, ask, save) {
  let since = 0;
  for (const item of items) {
    item.done = await call(item, ask);
    if (++since % SAVE_EVERY === 0) save();
  }
  save();
}

/**
 * Every line of the list not yet done, asked for; the list written again as lines are marked. Answers what happened to
 * each group that had work, in the list's order: `{ group, said, where, verb, asked, gone, why }`.
 */
export async function cleanUp(list, { db, env = process.env, ask = fetch }) {
  const save = () => writeList(list.path, list.head, list.items);
  const out = [];
  for (const group of Object.keys(GROUPS)) {
    const left = list.items.filter((item) => groupOf(item) === group && !item.done);
    if (!left.length) continue;
    let why = null;
    if (left[0].what === "storage") why = await removeStored(db, group, left, save);
    else {
      const call = CALLS[group](env);
      if (call) await removeAt(call, left, ask, save);
      else why = KEYS_WANTED[group];
    }
    out.push({ group, ...GROUPS[group], asked: left.length, gone: left.filter((item) => item.done).length, why });
  }
  save();
  return out;
}
