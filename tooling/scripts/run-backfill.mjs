/**
 * Backfill driver (prod-script bar): dry-run DEFAULT, saves the full Blob
 * snapshot as a JSONL backup BEFORE any apply, idempotent server-side
 * (stable keys), --apply to execute.
 *
 * Env: BASE_URL, DIAG_KEY. Usage: node run-backfill.mjs [--apply]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE_URL;
const KEY = process.env.DIAG_KEY;
if (!BASE || !KEY) { console.error("BASE_URL and DIAG_KEY required"); process.exit(2); }
const apply = process.argv.includes("--apply");

async function call(mode) {
  const r = await fetch(`${BASE}/api/admin/backfill?mode=${mode}`, { headers: { "x-diag-key": KEY } });
  if (!r.ok) { console.error(`backfill ${mode} HTTP ${r.status}`); process.exit(1); }
  return r.json();
}

// 1. dry run + snapshot backup (always, before any apply)
const dry = await call("dry");
const backupsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "backups");
mkdirSync(backupsDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = join(backupsDir, `blob-threads-${stamp}.jsonl`);
writeFileSync(backupPath, dry.snapshot.map((s) => JSON.stringify(s)).join("\n") + "\n");
console.log(`snapshot: ${dry.snapshot.length} threads -> ${backupPath}`);
console.log("dry-run plan:");
for (const t of dry.threads) {
  console.log(`  +${t.phone}: ${t.entries} entries, import ${t.toImport}, overlap-strip ${t.strippedOverlap}, paused=${t.pausedActive}`);
}

if (!apply) {
  console.log("\nDry run only. Re-run with --apply to execute.");
  process.exit(0);
}

// 2. apply
const res = await call("apply");
console.log("\napply result:");
for (const t of res.threads) {
  console.log(`  +${t.phone}: imported ${t.imported ?? 0}/${t.toImport}${t.pausedActive ? " (pause carried)" : ""}`);
}
