/**
 * Call-history backfill driver (prod-script bar): dry-run DEFAULT, JSONL
 * snapshot of the plan BEFORE any apply, idempotent server-side, --apply to
 * execute. Env: BASE_URL, DIAG_KEY.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE_URL;
const KEY = process.env.DIAG_KEY;
if (!BASE || !KEY) { console.error("BASE_URL and DIAG_KEY required"); process.exit(2); }
const apply = process.argv.includes("--apply");

async function call(mode) {
  const r = await fetch(`${BASE}/api/admin/backfill-calls?mode=${mode}`, { headers: { "x-diag-key": KEY } });
  const body = await r.json().catch(() => null);
  if (!r.ok || !body?.ok) { console.error(`backfill-calls ${mode} ->`, r.status, JSON.stringify(body).slice(0, 300)); process.exit(1); }
  return body;
}

const dry = await call("dry");
const backups = join(dirname(fileURLToPath(import.meta.url)), "..", "backups");
mkdirSync(backups, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const path = join(backups, `retell-calls-${stamp}.jsonl`);
writeFileSync(path, dry.calls.map((c) => JSON.stringify(c)).join("\n") + "\n");

console.log(`agents: ${dry.agents.join(", ")}`);
console.log(`found ${dry.found} calls -> plan saved to ${path}\n`);
for (const c of dry.calls) {
  console.log(`  ${String(c.started).slice(0, 16)}  ${String(c.from).padEnd(14)}  ${String(c.seconds).padStart(4)}s  ${c.status}${c.has_recording ? "  rec" : ""}${c.has_summary ? "  summary" : ""}`);
}

if (!apply) { console.log("\nDry run only. Re-run with --apply to import."); process.exit(0); }

const res = await call("apply");
console.log("\napply result:");
let imported = 0, existing = 0, stored = 0;
for (const c of res.calls) {
  if (c.imported === "new") imported++;
  if (c.imported === "existing") existing++;
  if (c.recording === "stored") stored++;
  if (c.error) console.log(`  ERROR ${c.call_id}: ${c.error}`);
}
console.log(`  imported ${imported} new, ${existing} already present, ${stored} recordings copied to private storage`);
