/**
 * Let one workspace's videos step aside now, by hand (the archive plan's B2; prod-script bar): dry-run DEFAULT, a JSONL
 * backup of every video it weighs before any write, --apply to execute.
 *
 * A video steps aside by itself only after two weeks unused, or when a new one needs its room. To see a made video
 * step aside and come back on Play without waiting two weeks, this asks the let-go's own door (file_copies_let_go,
 * through db markCopiesGoing) with "now" as its two times: every video the door would ever let go is marked going,
 * the least recently used first. Nothing here is a second rule for which may go: the door decides, and only a copy
 * something can give back is ever chosen (a watched folder's clip that can be fetched again, or a made video with a
 * checked copy kept for it). An upload and a found video never are.
 *
 * It marks and stops. The half-hourly pass finishes each one within forty minutes, as it finishes any let-go: it
 * checks a made video's kept copy first, and one whose copy is not what it should be stays where it is and is put
 * right. A video that stepped aside comes back on Play.
 *
 * Only for a workspace whose made videos keep a copy (features.video_shelf in its config): it reads that first and
 * stops without it.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Usage:
 *   node --import tsx tooling/scripts/ops/files/let-go-now.mjs --workspace <workspace id>
 *   node --import tsx tooling/scripts/ops/files/let-go-now.mjs --workspace <workspace id> --apply
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { videoShelfOf } from "@chanlytics/contracts";
import { findWorkspaceNameAndConfig } from "@chanlytics/db/campaigns";
import { findShelfPart, listVideoCopiesHere, markCopiesGoing } from "@chanlytics/db/files";

/** The most videos one run weighs and marks: the door's own most for a let-go that makes room. */
export const A_RUN = 100;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-9][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** What a run was asked: the one workspace by its id, and whether to write. Null where no workspace is named. */
export function askOf(argv) {
  const at = argv.indexOf("--workspace");
  const workspace = at >= 0 ? (argv[at + 1] ?? "") : "";
  return UUID.test(workspace) ? { workspace: workspace.toLowerCase(), apply: argv.includes("--apply") } : null;
}

/**
 * Each video that is here, with what the dry run can say of it before the door is asked: a made video steps aside
 * only where its kept copy is checked; any other is the door's to weigh (its folder must be able to give it back).
 */
export async function judgeVideos(db, tenantId, videos) {
  const weighed = [];
  for (const video of videos) {
    if (video.source !== "made") {
      weighed.push({ ...video, says: "the door decides" });
      continue;
    }
    const part = await findShelfPart(db, tenantId, video.id);
    weighed.push({ ...video, says: part?.state === "checked" ? "may step aside" : "stays: no checked copy is kept" });
  }
  return weighed;
}

/**
 * The run: the workspace's switch, then its videos weighed, then (on apply) the door asked once with now as its two
 * times. Answers what it found, for the lines main says. `now` is the one clock both of the door's times read.
 */
export async function letGoNow(db, ask, now = new Date()) {
  const { name, config } = await findWorkspaceNameAndConfig(db, ask.workspace);
  if (name === null) return { fate: "no_workspace" };
  if (!videoShelfOf(config)) return { fate: "switch_off", name };
  const weighed = await judgeVideos(db, ask.workspace, await listVideoCopiesHere(db, ask.workspace, A_RUN));
  if (!ask.apply || !weighed.length) return { fate: "dry", name, weighed };
  const going = await markCopiesGoing(db, {
    tenantId: ask.workspace,
    // By age, never by room: each one unused since now, and none held back by its rest.
    seconds: null,
    unusedBefore: now,
    restedBefore: now,
    limit: A_RUN,
  });
  return { fate: "marked", name, weighed, going };
}

const said = (video) =>
  `${video.id}  ${String(video.source).padEnd(8)} ${String(Math.round(Number(video.seconds ?? 0))).padStart(5)}s  ${video.says}`;

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
    process.exit(2);
  }
  const ask = askOf(process.argv);
  if (!ask) {
    console.error("--workspace <workspace id> required: one workspace, by its id");
    process.exit(2);
  }
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // The dry run first, whatever was asked: what is weighed is said, and kept, before anything is marked.
  const read = await letGoNow(db, { ...ask, apply: false });
  if (read.fate === "no_workspace") {
    console.error(`no workspace ${ask.workspace}`);
    process.exit(1);
  }
  if (read.fate === "switch_off") {
    console.error(
      `${read.name}: its made videos keep no copy (features.video_shelf is off). Nothing is let go by hand here.`,
    );
    process.exit(1);
  }
  console.log(`${read.name}: ${read.weighed.length} videos are here and play.`);
  for (const video of read.weighed) console.log(`  ${said(video)}`);
  if (!read.weighed.length) return;
  if (!ask.apply) {
    console.log("\nDry run only: nothing was marked. Re-run with --apply to ask the door.");
    return;
  }

  const backupsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "backups");
  mkdirSync(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(backupsDir, `let-go-now-${stamp}.jsonl`);
  writeFileSync(backupPath, read.weighed.map((video) => JSON.stringify(video)).join("\n") + "\n");
  console.log(`backup: ${read.weighed.length} rows -> ${backupPath}`);

  const done = await letGoNow(db, ask);
  for (const copy of done.going ?? []) console.log(`  marked going  ${copy.id}  (${Math.round(copy.seconds)}s)`);
  console.log(
    `\n${done.going?.length ?? 0} of ${read.weighed.length} marked going. The half-hourly pass finishes each within forty minutes; one whose kept copy is not what it should be stays. Each comes back on Play.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
