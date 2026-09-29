/**
 * Re-key the erasure digests (00249) under the prod-script bar: dry-run DEFAULT, a JSONL backup of every row it will
 * change before it writes, idempotent, --apply to execute.
 *
 * An erased person leaves a digest of each identifier (contacts.erased_phone_hash and erased_email_hash, the
 * never-again list lead_suppressions.hash, and the hashes Reach out's replies keep for their undo in
 * reach_out_replies.plan). They were sha256 of "<tenant>:<value>", which anyone with a dump and a workspace id could
 * reverse for a phone number in minutes. 00249 keys them: 'h1:' || hmac-sha256(Vault's pepper, the old digest). The
 * pepper never leaves the database, so the re-key is the database's own function (erasure_rekey): this script counts,
 * shows a sample, writes the backup, and asks it to apply. From the moment it has applied, every digest the database
 * makes is keyed (erasure_digest), and until then every one is exactly what it was.
 *
 * A dry run changes nothing: the counts of what is still legacy, per place, and five rows of each table as samples,
 * each digest cut to its first eight characters (a whole legacy digest is as good as the number it hides). An apply
 * reads every row it will change, writes them to tooling/backups/erasure-rekey-<stamp>.jsonl (one {table, row} per
 * line), then calls erasure_rekey(true), which changes only rows not yet keyed ('h1:'), so a second apply changes
 * nothing; it reads the counts again, and they must be zero.
 *
 * Needs 00249 applied: it asks for the function first and stops without it. Run it after the edge and the dashboard
 * that ask the database for their digests (erasure_digests) have deployed.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Usage:
 *   node tooling/scripts/ops/erasure-rekey.mjs
 *   node tooling/scripts/ops/erasure-rekey.mjs --apply
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PAGE = 500;
const SAMPLE = 5;

/** A digest as a sample shows it: its first eight characters, never the whole. */
export const cut = (h) => (typeof h === "string" ? `${h.slice(0, 8)}…` : h);

/** Whether a digest is still legacy: set, and not keyed. */
export const legacy = (h) => typeof h === "string" && h !== "" && !h.startsWith("h1:");

/** Whether a reply's plan keeps a legacy hash in either list its undo reads. */
export function planHoldsLegacy(plan) {
  const changed = plan && typeof plan === "object" ? plan.changed : null;
  if (!changed || typeof changed !== "object") return false;
  const lists = [changed.holds, changed.suppressions].filter(Array.isArray);
  return lists.some((l) => l.some((x) => x && typeof x === "object" && legacy(x.hash)));
}

/** Every row of a table the filter keeps, a page at a time, by its key. */
async function readAll(db, table, columns, key, narrow) {
  const rows = [];
  let after = null;
  for (;;) {
    let q = db.from(table).select(columns).order(key, { ascending: true }).limit(PAGE);
    if (after !== null) q = q.gt(key, after);
    const { data, error } = await narrow(q);
    if (error) throw new Error(`read ${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
    after = data[data.length - 1][key];
  }
}

/** What the re-key would change, read in full: the rows of each place still holding a legacy digest. */
export async function affected(db) {
  const contacts = (
    await readAll(db, "contacts", "id, tenant_id, erased_phone_hash, erased_email_hash", "id", (q) =>
      q.or("erased_phone_hash.not.is.null,erased_email_hash.not.is.null"),
    )
  ).filter((r) => legacy(r.erased_phone_hash) || legacy(r.erased_email_hash));
  const suppressions = (
    await readAll(db, "lead_suppressions", "id, tenant_id, kind, hash, what, created_at", "id", (q) =>
      q.not("hash", "like", "h1:*"),
    )
  ).filter((r) => legacy(r.hash));
  const replies = (
    await readAll(db, "reach_out_replies", "message_id, tenant_id, plan", "message_id", (q) =>
      q.not("plan->changed", "is", null),
    )
  ).filter((r) => planHoldsLegacy(r.plan));
  return { contacts, suppressions, replies };
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
    process.exit(2);
  }
  const apply = process.argv.includes("--apply");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // 00249 first: the function that re-keys, or nothing to ask.
  const before = await db.rpc("erasure_rekey", { p_apply: false });
  if (before.error) {
    console.error(`00249 is not applied here: ${before.error.message}`);
    process.exit(1);
  }
  const counts = before.data;
  console.log(
    `still legacy: contacts' numbers ${counts.contacts_phone}, contacts' addresses ${counts.contacts_email}, ` +
      `the never-again list ${counts.lead_suppressions}, replies' undo lists ${counts.reach_out_replies}; ` +
      `keyed_at ${counts.keyed_at ?? "never"}.`,
  );

  const rows = await affected(db);
  console.log(
    `read: ${rows.contacts.length} contacts, ${rows.suppressions.length} suppressions, ${rows.replies.length} replies.`,
  );
  console.log("sample (digests cut to eight characters):");
  for (const r of rows.contacts.slice(0, SAMPLE))
    console.log(`  contacts ${r.id}  phone ${cut(r.erased_phone_hash)}  email ${cut(r.erased_email_hash)}`);
  for (const r of rows.suppressions.slice(0, SAMPLE))
    console.log(`  lead_suppressions ${r.id}  ${r.kind}/${r.what}  ${cut(r.hash)}`);
  for (const r of rows.replies.slice(0, SAMPLE)) console.log(`  reach_out_replies ${r.message_id}`);

  const total = rows.contacts.length + rows.suppressions.length + rows.replies.length;
  if (!apply) {
    console.log(`\n${total} rows would be re-keyed. Dry run only: nothing was written.`);
    console.log("Re-run with --apply to execute.");
    return;
  }

  const backupsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "backups");
  mkdirSync(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(backupsDir, `erasure-rekey-${stamp}.jsonl`);
  const lines = [
    ...rows.contacts.map((row) => JSON.stringify({ table: "contacts", row })),
    ...rows.suppressions.map((row) => JSON.stringify({ table: "lead_suppressions", row })),
    ...rows.replies.map((row) => JSON.stringify({ table: "reach_out_replies", row })),
  ];
  writeFileSync(backupPath, lines.join("\n") + "\n");
  console.log(`backup: ${lines.length} rows -> ${backupPath}`);

  const done = await db.rpc("erasure_rekey", { p_apply: true });
  if (done.error) {
    console.error(`the re-key refused: ${done.error.message}`);
    process.exit(1);
  }
  const after = await db.rpc("erasure_rekey", { p_apply: false });
  if (after.error) {
    console.error(`the count after could not be read: ${after.error.message}`);
    process.exit(1);
  }
  const left =
    after.data.contacts_phone + after.data.contacts_email + after.data.lead_suppressions + after.data.reach_out_replies;
  console.log(`re-keyed; keyed_at ${after.data.keyed_at}; still legacy after: ${left}.`);
  if (left !== 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
