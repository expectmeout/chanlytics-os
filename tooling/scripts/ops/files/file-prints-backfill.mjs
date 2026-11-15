/**
 * Print every file kept before 00630 (decision 0134, amended 15 Nov 2026; prod-script bar): dry-run DEFAULT, a JSONL backup of
 * every planned row before any write, idempotent, --apply to execute.
 *
 * 00630 prints a picture as it comes (a found photo from the bytes its road read, any other photo as its look starts, a video
 * at its digest's first step), so the same picture brought by two roads is kept once. Files kept before it carry no print, and
 * would never be judged against the next road's copy. This prints each one the way the edge does (apps/edge/lib/files/prints.ts:
 * a photo from the small copy Storage makes, a video from the poster its digest kept) and hands it to the same door,
 * file_printed, which keeps the print and, where it twins a file already printed, says which goes. Nothing here is a second rule
 * for which one stays.
 *
 * A dry run prints each file and says which pairs in a workspace are twins (within the database's bits); it writes nothing, and
 * the door decides which of each pair goes on --apply. A second apply finds only what the first could not print (a picture too
 * plain to print, a copy Storage did not answer), and leaves those as they are.
 *
 * Needs 00630 applied: it reads the column first and stops without it.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Usage:
 *   node --import tsx tooling/scripts/ops/files/file-prints-backfill.mjs
 *   node --import tsx tooling/scripts/ops/files/file-prints-backfill.mjs --apply
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PRINT_TWIN_BITS, printDistance } from "@chanlytics/core";
import { listFilesUnprinted, recordFilePrint } from "@chanlytics/db/files";
import { readPicturePrint, downloadMade, downloadPrintCopy } from "../../../../apps/edge/lib/files/prints.ts";

const PAGE = 200;

/** Every file the backfill prints: none removed, none made here, a video only once it plays. */
async function unprintedFiles(db) {
  const rows = [];
  for (let after = null; ;) {
    const page = await listFilesUnprinted(db, { after, limit: PAGE });
    rows.push(...page);
    if (page.length < PAGE) return rows;
    after = page[page.length - 1].id;
  }
}

/** A file's print, read as the edge reads it: null where Storage did not answer or the picture is too plain to print. */
async function printOf(db, row) {
  const bytes = row.kind === "video" ? await downloadMade(db, row, "poster") : await downloadPrintCopy(db, row);
  return bytes ? readPicturePrint(bytes) : null;
}

/** The pairs in one workspace whose prints are twins, nearest first, for the dry run to show. */
export function twinPairsOf(printed) {
  const pairs = [];
  for (let i = 0; i < printed.length; i++)
    for (let j = i + 1; j < printed.length; j++) {
      const [a, b] = [printed[i], printed[j]];
      if (a.tenant_id !== b.tenant_id || a.kind !== b.kind) continue;
      if (a.kind === "video" && Math.abs(Number(a.seconds) - Number(b.seconds)) > 0.5) continue;
      const bits = printDistance(a.print, b.print);
      if (bits <= PRINT_TWIN_BITS) pairs.push({ bits, a, b });
    }
  return pairs.sort((x, y) => x.bits - y.bits);
}

const said = (r) => `${r.id} ${r.kind} ${r.source}/${r.status} ${r.width}x${r.height}`;

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
    process.exit(2);
  }
  const apply = process.argv.includes("--apply");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  let rows;
  try {
    rows = await unprintedFiles(db);
  } catch (e) {
    console.error(`00630 is not applied here, or the files could not be read: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
  console.log(`${rows.length} files with no print.`);
  if (!rows.length) return;

  if (!apply) {
    const printed = [];
    for (const r of rows) {
      const print = await printOf(db, r);
      if (print) printed.push({ ...r, print });
      else console.log(`  no print  ${said(r)}`);
    }
    const pairs = twinPairsOf(printed);
    for (const p of pairs) console.log(`  twins (${p.bits} bits)  ${said(p.a)}  |  ${said(p.b)}`);
    console.log(
      `\n${printed.length} of ${rows.length} would be printed; ${pairs.length} pairs are twins, and the door says which of each goes.`,
    );
    console.log("Dry run only: nothing was written. Re-run with --apply to execute.");
    return;
  }

  const backupsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "backups");
  mkdirSync(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(backupsDir, `file-prints-backfill-${stamp}.jsonl`);
  writeFileSync(backupPath, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  console.log(`backup: ${rows.length} rows -> ${backupPath}`);

  let printedCount = 0;
  let unread = 0;
  const gone = [];
  const goneIds = new Set();
  for (const r of rows) {
    // A file that went as the twin of one printed before it in this run has nothing left to print.
    if (goneIds.has(r.id)) continue;
    const print = await printOf(db, r);
    if (!print) {
      unread += 1;
      continue;
    }
    const fate = await recordFilePrint(db, r.tenant_id, r.id, print);
    if (fate.fate === "gone") gone.push({ id: r.id, stays: fate.twinId });
    else if (fate.twinId) gone.push({ id: fate.twinId, stays: r.id });
    printedCount += 1;
    for (const g of gone) goneIds.add(g.id);
  }
  for (const g of gone) console.log(`  went as a twin  ${g.id}  (stays: ${g.stays})`);
  console.log(
    `\n${printedCount} printed, ${gone.length} went as twins, ${unread} not printed (too plain, or no copy).`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
