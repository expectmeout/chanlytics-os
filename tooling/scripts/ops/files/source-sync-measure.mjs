/**
 * What a watched folder's sync costs at Google, measured on a real account (the footage sources plan, P2): the folder
 * chooser's reads, a whole walk of a folder's tree, and a read of the account's changes, each through the code the
 * app runs (the Drive adapter, and the read's own sorting), timed call by call and counted in Google's units.
 *
 * It only reads, and keeps nothing: no file's bytes, no database, nothing written anywhere but what it prints. What it
 * prints is counts, times and units, and the ids and names of folders (the chooser, as a person would see it); a
 * file's name is never printed. Without --run it says what it would ask and asks nothing. Each run on a real account
 * is asked for by hand, on Ruben's word.
 *
 * The sign-in is the proof's own (P1's runner made it): a Desktop client of the Google project and the grant a person
 * gave it, both in files on this PC, never printed.
 *
 * Env: GOOGLE_PROOF_CLIENT_FILE (the client's JSON), GOOGLE_PROOF_GRANT_FILE (the kept grant)
 * Usage:
 *   node --import tsx tooling/scripts/ops/files/source-sync-measure.mjs chooser [--run]
 *   node --import tsx tooling/scripts/ops/files/source-sync-measure.mjs walk --folder <id> [--run]
 *   node --import tsx tooling/scripts/ops/files/source-sync-measure.mjs place --folder <id> [--run]
 *   node --import tsx tooling/scripts/ops/files/source-sync-measure.mjs changes --folder <id> --from <place> [--run]
 *
 * --seconds <n> (240 unless said) is how long a tree is listed for: one too large for it is reported as far as the
 * listing got, with `stopped: true`, so a large drive costs a known time and never the whole of itself.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { driveSource } from "../../../../packages/channels/src/files/drive.ts";
import { SOURCE_PACE } from "../../../../apps/edge/lib/files/sources/pace.ts";
import { sortChanges } from "../../../../apps/edge/lib/files/sources/read.ts";

/** What each call costs at Google since 1 May 2026, by its path: an item's record 5, a list 100. */
export function unitsOf(method, path) {
  if (path.endsWith("/changes/startPageToken")) return 5;
  if (path.endsWith("/changes") || path.endsWith("/files") || path.endsWith("/drives")) return 100;
  return method === "GET" && path.includes("/files/") ? 5 : 0;
}

/** What a run's calls came to: how many, their units, and how long each took. */
export function summaryOf(calls) {
  const times = calls.map((call) => call.ms).sort((a, b) => a - b);
  const at = (share) => times[Math.min(times.length - 1, Math.floor(times.length * share))] ?? 0;
  return {
    calls: calls.length,
    units: calls.reduce((sum, call) => sum + call.units, 0),
    total_ms: times.reduce((sum, ms) => sum + ms, 0),
    fastest_ms: times[0] ?? 0,
    median_ms: at(0.5),
    slowest_ms: times.at(-1) ?? 0,
  };
}

const flag = (name) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? (process.argv[at + 1] ?? "") : "";
};

/** A fetch that times and counts every call to Drive, and nothing else of it. */
function countingFetch(calls) {
  return async (url, init = {}) => {
    const started = Date.now();
    const reply = await fetch(url, init);
    const { pathname } = new URL(String(url));
    calls.push({
      path: pathname,
      status: reply.status,
      ms: Date.now() - started,
      units: unitsOf(init.method ?? "GET", pathname),
    });
    return reply;
  };
}

/** An hour's key for the account, from the grant kept on this PC. Neither is printed. */
async function accessToken() {
  const client = JSON.parse(readFileSync(process.env.GOOGLE_PROOF_CLIENT_FILE ?? "", "utf8")).installed;
  const grant = JSON.parse(readFileSync(process.env.GOOGLE_PROOF_GRANT_FILE ?? "", "utf8"));
  const reply = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: client.client_id,
      client_secret: client.client_secret,
      refresh_token: grant.refresh_token,
      grant_type: "refresh_token",
    }).toString(),
  });
  const body = await reply.json();
  if (!reply.ok || typeof body.access_token !== "string")
    throw new Error(`no key for the account: ${body.error ?? reply.status}`);
  return body.access_token;
}

/** The reply's answer, or the run stopped with why. */
function answered(reply, what) {
  if (reply.verdict !== "ok")
    throw new Error(
      `${what}: Drive said ${reply.verdict}${reply.verdict === "pace" ? ` (rest ${reply.restMs} ms)` : ""}`,
    );
  return reply.answer;
}

/** The chooser's first levels: the account's own Drive, its shared drives, what was shared with it. */
async function chooser(drive, token) {
  const out = {};
  for (const place of ["mine", "drives", "shared"]) {
    const page = answered(await drive.listFolders(token, { place }, null), place);
    out[place] = { folders: page.folders, more: page.nextPage !== null };
  }
  return out;
}

/** How long a tree is listed for, in milliseconds: --seconds, or four minutes. */
const budgetMs = () => (Number(flag("seconds")) > 0 ? Number(flag("seconds")) : 240) * 1000;

/**
 * A folder's whole tree as a walk lists it, many folders in one question (the pace's `foldersAtOnce`) and one at a
 * time where a question is refused: what it holds by kind, and its folders' ids. A tree too large for the budget is
 * listed as far as it got (`stopped`, and how many folders were still to list).
 */
async function walk(drive, token, folderId) {
  const until = Date.now() + budgetMs();
  const root = answered(await drive.validateFolder(token, folderId), "the folder");
  const kinds = { folder: 0, image: 0, video: 0, other: 0 };
  const folders = new Map([[root.id, { provider_id: root.id, kind: "folder", state: "listed" }]]);
  const queue = [root.id];
  const tally = { pages: 0, noLength: 0, refused: 0, unlistable: 0 };
  /** These folders' children, to the listing's end: how it ended. */
  const list = async (parents) => {
    for (let page = null; ;) {
      if (Date.now() > until) return "stopped";
      const reply = await drive.listChildrenOf(token, root, parents, page);
      if (reply.verdict === "pace") answered(reply, "a listing's page");
      if (reply.verdict !== "ok") return "refused";
      tally.pages += 1;
      for (const item of reply.answer.items) {
        kinds[item.kind] += 1;
        if (item.kind === "video" && item.seconds === null) tally.noLength += 1;
        if (item.kind !== "folder") continue;
        folders.set(item.id, { provider_id: item.id, kind: "folder", state: "listed" });
        queue.push(item.id);
      }
      page = reply.answer.nextPage;
      if (page === null) return "listed";
    }
  };
  let stopped = false;
  while (queue.length > 0 && !stopped) {
    // Together only inside a shared drive, as the walk does.
    const together = queue.splice(0, root.driveId ? SOURCE_PACE.foldersAtOnce : 1);
    let ended = await list(together);
    if (ended === "refused" && together.length > 1) {
      // One of them is not there and Drive does not say which: each alone.
      tally.refused += 1;
      ended = "listed";
      for (const [index, parent] of together.entries()) {
        const alone = await list([parent]);
        if (alone === "refused") tally.unlistable += 1;
        if (alone !== "stopped") continue;
        queue.unshift(...together.slice(index));
        ended = "stopped";
        break;
      }
    } else if (ended === "refused") tally.unlistable += 1;
    else if (ended === "stopped") queue.unshift(...together);
    stopped = ended === "stopped";
  }
  return {
    root,
    kinds,
    pages: tally.pages,
    videos_with_no_length_yet: tally.noLength,
    questions_refused: tally.refused,
    folders_not_listable: tally.unlistable,
    stopped,
    folders_still_to_list: queue.length,
    folders,
  };
}

/** Every change since a place, sorted as a read sorts it: how many, how many inside the folder's tree, and its pages. */
async function changes(drive, token, folderId, from) {
  const tree = await walk(drive, token, folderId);
  const open = { source: { folder_id: tree.root.id, include_subfolders: true } };
  const out = { pages: 0, changes: 0, inside: 0, removed: 0, place: from };
  for (let cursor = from; ;) {
    const page = answered(await drive.listChanges(token, tree.root, cursor), "the changes");
    const sorted = sortChanges(open, page.changes, tree.folders);
    out.pages += 1;
    out.changes += page.changes.length;
    out.inside += sorted.toRead.length + sorted.marks.length;
    out.removed += page.changes.filter((change) => change.removed).length;
    out.place = page.nextPage ?? page.cursor ?? cursor;
    if (page.nextPage === null) break;
    cursor = page.nextPage;
  }
  return {
    ...out,
    shared_drive: tree.root.driveId !== null,
    tree: { kinds: tree.kinds, pages: tree.pages, stopped: tree.stopped },
  };
}

async function main() {
  const [mode] = process.argv.slice(2);
  const folderId = flag("folder");
  const from = flag("from");
  const modes = ["chooser", "walk", "place", "changes"];
  if (!modes.includes(mode) || (mode !== "chooser" && !folderId) || (mode === "changes" && !from)) {
    console.error(`usage: source-sync-measure.mjs ${modes.join(" | ")} [--folder <id>] [--from <place>] [--run]`);
    process.exit(2);
  }
  if (!process.argv.includes("--run")) {
    console.log(`would read (${mode}) from Google Drive with the proof's sign-in, and keep nothing. Add --run to ask.`);
    return;
  }
  const calls = [];
  const drive = driveSource({ fetch: countingFetch(calls) });
  const token = await accessToken();
  const started = Date.now();
  let found;
  if (mode === "chooser") found = await chooser(drive, token);
  else if (mode === "walk") {
    const { folders, root, ...tree } = await walk(drive, token, folderId);
    found = { ...tree, shared_drive: root.driveId !== null, folders_in_tree: folders.size };
  } else if (mode === "place") {
    const root = answered(await drive.validateFolder(token, folderId), "the folder");
    found = {
      place: answered(await drive.getStartCursor(token, root), "the place"),
      shared_drive: root.driveId !== null,
    };
  } else found = await changes(drive, token, folderId, from);
  console.log(JSON.stringify({ mode, found, cost: summaryOf(calls), wall_ms: Date.now() - started }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
