/**
 * Count a workspace's mail and contacts brought in again, from what is kept (prod-script bar): dry-run DEFAULT, a JSON
 * backup of the two rows before any write, idempotent, --apply to write.
 *
 * Until the fix beside this script, a mailbox's first run set its source's row afresh (history-import.ts startHistory),
 * so a workspace that connected a second mailbox kept only the second's counts: on 27 Oct 2026 the Email card said 222
 * emails and 0 people, where the first mailbox had brought 414 and 249. The ledger keeps one row a source for the
 * workspace; this sets what the card says of it to every mailbox's, from what is kept:
 *   - mailbox: `messages`, the emails kept as before Chanlytics (meta.backfill) from any of its mailboxes, and `oldest`,
 *     the earliest of them (the ledger's door keeps the earlier of two);
 *   - contacts: `people`, the people the mailboxes' contacts brought (contact.added, from contacts).
 * The mail row's `people` and `dropped` stay as the row has them: nothing shows them, and what was left is counted as
 * it is read, never kept, so it cannot be counted again. Written through the ledger's own door (import_ledger_note),
 * the counts set whole, each row's state as it stands. A source with no row is left alone.
 *
 * Since decision 0086 (00499) each mailbox keeps its own rows and counts only what it brought, and the pages add them
 * up: a workspace whose ledger holds a mailbox's own row is left alone, since a whole count written on the workspace's
 * row would be counted twice.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Usage:
 *   node tooling/scripts/ops/imports-recount-mail.mjs --tenant <workspace id>
 *   node tooling/scripts/ops/imports-recount-mail.mjs --tenant <workspace id> --apply
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * What each row is set to, from what is counted: only a row that exists and says otherwise. `counted` is
 * `{ messages, oldest, contactsPeople }`; a row's other counts are kept as they are.
 */
export function planRecount(rows, counted) {
  if (rows.some((r) => r.connection_id)) return [];
  const by = (s) => rows.find((r) => r.source === s) ?? null;
  const plan = [];
  const mail = by("mailbox");
  if (mail) {
    const counts = { ...mail.counts, messages: counted.messages };
    const earlier = counted.oldest && (!mail.oldest || Date.parse(counted.oldest) < Date.parse(mail.oldest));
    if (mail.counts.messages !== counted.messages || earlier)
      plan.push({ source: "mailbox", state: mail.state, was: mail.counts, counts, oldest: counted.oldest });
  }
  const contacts = by("contacts");
  if (contacts && contacts.counts.people !== counted.contactsPeople)
    plan.push({
      source: "contacts",
      state: contacts.state,
      was: contacts.counts,
      counts: { ...contacts.counts, people: counted.contactsPeople },
      oldest: null,
    });
  return plan;
}

/** What is kept: the emails from before Chanlytics, the earliest of them, and the people the contacts brought. */
async function countKept(db, tenantId) {
  const n = await db
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("channel", "email")
    .not("meta->backfill", "is", null);
  if (n.error) throw new Error(`count the kept mail: ${n.error.message}`);
  const first = await db
    .from("messages")
    .select("channel_ts, created_at")
    .eq("tenant_id", tenantId)
    .eq("channel", "email")
    .not("meta->backfill", "is", null)
    .order("channel_ts", { ascending: true, nullsFirst: false })
    .limit(1);
  if (first.error) throw new Error(`read the earliest kept mail: ${first.error.message}`);
  const people = await db
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("kind", "contact.added")
    .eq("data->>from", "contacts");
  if (people.error) throw new Error(`count the contacts' people: ${people.error.message}`);
  const row = first.data?.[0] ?? null;
  return {
    messages: n.count ?? 0,
    oldest: row ? (row.channel_ts ?? row.created_at) : null,
    contactsPeople: people.count ?? 0,
  };
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(2);
  }
  const at = process.argv.indexOf("--tenant");
  const tenantId = at >= 0 ? process.argv[at + 1] : null;
  if (!tenantId || !/^[0-9a-f-]{36}$/.test(tenantId)) {
    console.error("usage: node tooling/scripts/ops/imports-recount-mail.mjs --tenant <workspace id> [--apply]");
    process.exit(2);
  }
  const apply = process.argv.includes("--apply");
  const db = createClient(url, key, { auth: { persistSession: false } });
  const read = await db
    .from("imports")
    .select("source, connection_id, state, counts, oldest")
    .eq("tenant_id", tenantId)
    .in("source", ["mailbox", "contacts"]);
  if (read.error) throw new Error(`read the ledger: ${read.error.message}`);
  const counted = await countKept(db, tenantId);
  const plan = planRecount(read.data ?? [], counted);
  console.log(
    `counted: ${counted.messages} emails kept, back to ${counted.oldest ?? "none"}; ${counted.contactsPeople} people from contacts`,
  );
  for (const p of plan) console.log(`  ${p.source}: ${JSON.stringify(p.was)} -> ${JSON.stringify(p.counts)}`);
  if (!plan.length) {
    console.log("nothing to change");
    return;
  }
  const backupsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "backups");
  mkdirSync(backupsDir, { recursive: true });
  const backupPath = join(backupsDir, `imports-recount-mail-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(backupPath, JSON.stringify({ tenantId, rows: read.data, counted, plan }, null, 2));
  console.log(`backup: ${read.data?.length ?? 0} rows -> ${backupPath}`);
  if (!apply) {
    console.log("dry run: nothing written (--apply writes)");
    return;
  }
  for (const p of plan) {
    const { error } = await db.rpc("import_ledger_note", {
      p_tenant_id: tenantId,
      p_source: p.source,
      p_state: p.state,
      p_counts: p.counts,
      p_add: false,
      p_oldest: p.oldest ?? undefined,
    });
    if (error) throw new Error(`write ${p.source}: ${error.message}`);
    console.log(`  wrote ${p.source}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
