/**
 * Make every person's kept moments whole (00239, decision 0021 step 1) (prod-script bar): dry-run DEFAULT, a JSONL
 * backup of each workspace's rows before any write, idempotent, --apply to execute.
 *
 * 00239 keeps each person's moments as their messages and calls are written, from the moment it is applied. Everyone
 * who was a person before it has no row, or a row a trigger began from what was written since. This makes each of them
 * whole from their rows, a workspace at a time, in batches of a few hundred people, each its own transaction
 * (person_moments_fill). A message written for someone in a batch while it runs waits for that batch, a fraction of a
 * second, and is never lost: the batch takes each person's row before it reads their rows. A second apply writes the
 * same rows again.
 *
 * The dry run says, for each workspace, how many people have no row and how many have a row that differs from their
 * rows (person_moments_check). The apply writes the backup, fills, and checks each workspace again: one still not whole
 * is named, and the run exits 1.
 *
 * Needs 00239 applied: it checks for person_moments first and stops without it.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Usage:
 *   node tooling/scripts/ops/person-moments-fill.mjs
 *   node tooling/scripts/ops/person-moments-fill.mjs --apply
 *   node tooling/scripts/ops/person-moments-fill.mjs --apply --workspace <uuid>
 */
import { createClient } from "@supabase/supabase-js";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** People per batch: each batch is one transaction, so a person written meanwhile waits no longer than one batch. */
export const BATCH = 300;
/** Rows per read: PostgREST's own cap. */
const PAGE = 1000;

/** How many people a check names, by what it says of them. */
export function tally(rows) {
  const out = { missing: 0, differs: 0, other: 0 };
  for (const r of rows ?? []) {
    if (r.what === "missing") out.missing += 1;
    else if (r.what === "differs") out.differs += 1;
    else out.other += 1;
  }
  return out;
}

/** Every row a read pages through, a thousand at a time, in the read's own order. */
export async function everyRow(read) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await read(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

/**
 * A workspace's check, a batch at a time: the people whose kept moments are not what their rows say. Each batch answers
 * every person in it, whole or not, in order, so its last says where the next begins.
 */
export async function checkWorkspace(db, tenantId, batch = BATCH) {
  const notWhole = [];
  let after = null;
  for (;;) {
    const { data, error } = await db.rpc("person_moments_check", {
      p_tenant_id: tenantId,
      p_after: after,
      p_limit: batch,
    });
    if (error) throw new Error(`check ${tenantId} after ${after ?? "the first person"}: ${error.message}`);
    const rows = data ?? [];
    notWhole.push(...rows.filter((r) => r.what !== "whole"));
    if (rows.length < batch) return notWhole;
    after = rows[rows.length - 1].contact_id;
  }
}

/** A workspace's rows as they are, each a line of the backup; answers how many. */
export async function backupWorkspace(db, tenantId, writeLine) {
  const rows = await everyRow((from, to) =>
    db
      .from("person_moments")
      .select(
        "contact_id, tenant_id, added_at, last_word_at, last_call_at, first_word_at, first_call_at, first_row_at, moved_in",
      )
      .eq("tenant_id", tenantId)
      .order("contact_id", { ascending: true })
      .range(from, to),
  );
  for (const r of rows) writeLine(JSON.stringify({ person_moments: r }));
  return rows.length;
}

/** A workspace filled batch by batch, each starting after the last person of the one before; answers how many. */
export async function fillWorkspace(db, tenantId, batch = BATCH) {
  let after = null;
  let filled = 0;
  let batches = 0;
  for (;;) {
    const { data, error } = await db.rpc("person_moments_fill", {
      p_tenant_id: tenantId,
      p_after: after,
      p_limit: batch,
    });
    if (error) throw new Error(`fill ${tenantId} after ${after ?? "the first person"}: ${error.message}`);
    const step = Array.isArray(data) ? data[0] : data;
    batches += 1;
    filled += step?.filled ?? 0;
    if (!step?.last_contact_id) return { filled, batches };
    after = step.last_contact_id;
  }
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
    process.exit(2);
  }
  const apply = process.argv.includes("--apply");
  const only = process.argv.includes("--workspace") ? process.argv[process.argv.indexOf("--workspace") + 1] : null;
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const table = await db.from("person_moments").select("contact_id").limit(1);
  if (table.error) {
    console.error(`00239 is not applied here: ${table.error.message}`);
    process.exit(1);
  }

  const workspaces = only
    ? [{ id: only }]
    : await everyRow((from, to) => db.from("tenants").select("id").order("id", { ascending: true }).range(from, to));
  const before = [];
  for (const w of workspaces) before.push({ id: w.id, ...tally(await checkWorkspace(db, w.id)) });
  const owed = before.filter((b) => b.missing + b.differs + b.other > 0);
  for (const b of owed) console.log(`  ${b.id}  ${b.missing} with no row, ${b.differs} not whole`);
  console.log(`${owed.length} of ${workspaces.length} workspaces are owed a fill.`);

  if (!apply) {
    console.log("Dry run only: nothing was written. Re-run with --apply to execute.");
    return;
  }

  const backupsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "backups");
  mkdirSync(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(backupsDir, `person-moments-fill-${stamp}.jsonl`);
  writeFileSync(backupPath, "");
  let kept = 0;
  for (const b of owed) kept += await backupWorkspace(db, b.id, (line) => appendFileSync(backupPath, `${line}\n`));
  console.log(`backup: ${kept} rows of ${owed.length} workspaces -> ${backupPath}`);

  const notWhole = [];
  for (const b of owed) {
    const { filled, batches } = await fillWorkspace(db, b.id);
    const after = tally(await checkWorkspace(db, b.id));
    const left = after.missing + after.differs + after.other;
    console.log(`  ${b.id}  ${filled} people in ${batches} batches${left ? `, ${left} still not whole` : ", whole"}`);
    if (left) notWhole.push(b.id);
  }
  console.log(`\n${owed.length - notWhole.length} of ${owed.length} workspaces whole.`);
  if (notWhole.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
