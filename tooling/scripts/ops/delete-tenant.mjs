/**
 * Delete a workspace and everything in it (prod-script bar): dry-run DEFAULT,
 * a JSONL backup of every row before any apply, idempotent, --apply to execute.
 *
 * A tenant delete cascades through thirty-odd tables and nothing undoes it, so
 * the guard is not a human reading a name off the screen. --expect-name has to
 * match the tenant's name exactly, the counts are printed before anything is
 * touched, and the backup is written first or the run stops.
 *
 * Two tables do NOT cascade, and both are handled here rather than discovered
 * afterwards:
 *   - `events` carries a tenant_id with no foreign key at all, because it is
 *     partitioned and a partitioned table cannot reference one. Deleting the
 *     tenant would leave its whole history orphaned, so this deletes it first.
 *   - `billing_events` is ON DELETE SET NULL on purpose: Stripe's dedup ledger
 *     has to outlive the workspace or a redelivered event would be processed
 *     twice. Those rows are backed up and reported, never deleted.
 *
 * And the cascade is blind outside Postgres. A workspace that owns a phone line
 * owns a Twilio subaccount, a number still being billed, a trunk, a messaging
 * service and a registered campaign; one with a Google connection holds a grant
 * at Google; each has Vault secrets keyed by name that no foreign key reaches.
 * Deleting the rows leaves all of it running with nothing pointing at it. So an
 * apply REFUSES when the workspace still holds any of it, and says what to
 * release first. --orphans-ok proceeds anyway, deliberately and out loud.
 *
 * This is not hypothetical: the workspace this tool was written for turned out
 * to own the product's first real phone line, answering, with two inbound texts
 * on it. A dry run is what caught that; a hand-typed DELETE would not have.
 *
 * The files are outside Postgres too. The workspace's folder in `media` holds its
 * call recordings (calls/) and its messages' media (a folder per thread), and the
 * 90-day purge finds a recording through its calls row, which this delete removes:
 * a workspace deleted on 28 Oct 2026 left 24 recordings that nothing would take. So
 * the folder is read to the bottom with the counts, and emptied after the rows,
 * as the logo folder is.
 *
 * Its two deletes (the events, then the tenant with its cascade) are one statement each, and the service role's
 * statements end at 30 seconds (00283). A workspace with a very long history can need longer: the events delete then
 * times out having removed nothing, or the tenant delete does after the events are gone. Both are safe to run again,
 * since the backup is already written and the script is idempotent; for a workspace too large to finish, run the same
 * two deletes from psql after `set statement_timeout = 0`.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Usage:
 *   node tooling/scripts/ops/delete-tenant.mjs --tenant <uuid> --expect-name "<name>"
 *   node tooling/scripts/ops/delete-tenant.mjs --tenant <uuid> --expect-name "<name>" --apply
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Every table carrying a tenant_id, derived from the migrations. Pinned here
 * BY VALUE so the backup cannot silently miss a table: a companion test reads
 * supabase/migrations and fails when this list and the schema disagree.
 *
 * google_reviews and google_listing_days are absent on purpose — they cascade
 * through google_listings, which cascades from tenants, so they are captured
 * by backing that up. They are listed in the test's expected set all the same.
 */
const TABLES = [
  "ai_usage",
  "appointment_notices",
  "appointments",
  // What Ask remembers, its journal and each member's mornings (00470, decision 0070).
  "ask_journal_days",
  "ask_memory_lines",
  "ask_messages",
  "ask_mornings",
  "ask_threads",
  "ask_voice_sessions",
  "billing_accounts",
  "billing_card_marks",
  "billing_events",
  "business_records",
  "calls",
  "capability_activations",
  "contact_identities",
  "contact_marks",
  "contact_reads",
  "contacts",
  // When a thread's person last wrote on each wire (00484, decision 0001).
  "conversation_channel_state",
  // Ask's drafts written ahead for a thread waiting on a person (00475, decision 0071).
  "conversation_drafts",
  "conversations",
  "deals",
  "decisions",
  "escalations",
  "events",
  // The notes an owner's corrections suggest keeping (00448, decision 0063).
  "fact_suggestions",
  "google_connections",
  "google_listing_days",
  "google_listings",
  "google_reviews",
  "idempotency_keys",
  "invitations",
  "jobs",
  "lead_counters",
  "lead_judgments",
  "lead_operations",
  "lead_places",
  "lead_preferences",
  "lead_rounds",
  "lead_runs",
  "lead_search_members",
  "lead_searches",
  "lead_suggestions",
  "lead_suppressions",
  "leads",
  "lines",
  // The mailboxes a business connected to write its reach-outs from (00423, decision 0056).
  "mailbox_connections",
  // What the workspace said of a sender, and what its mailbox left where it was (00483).
  "mailbox_left",
  "mailbox_sender_reads",
  "mailbox_senders",
  "mailboxes",
  "memberships",
  "messages",
  // A receptionist's turns as the model read them, and the prompts they read (00401, decision 0039).
  "model_prompts",
  "model_turns",
  "notification_reads",
  "notifications",
  "partner_earnings",
  "partner_invitations",
  "partner_tenants",
  // The doubt queue (00344): a pair of the workspace's records the door could not tell apart.
  "person_doubts",
  "person_moments",
  "person_notes",
  "platform_metrics",
  // The Console (00467, decision 0066): what the team did in it and why, who had it taken, what it reported, and the
  // requests about it, the last of which outlive it.
  "platform_acts",
  "platform_claims",
  "privacy_requests",
  "support_reports",
  // The spine (00334): an event's outbox row and its deliveries follow their workspace.
  "event_outbox",
  "event_deliveries",
  // The intake ledger (00336): a provider's deliveries the door placed with the workspace.
  "provider_events",
  "policies",
  "reach_out_check_spend",
  // A conversation rehearsed or a real call reviewed (00476, decision 0069).
  "rehearsals",
  // What was brought in, and what the profile and the website say (00477, 00479; decision 0073).
  "imports",
  "business_reads",
  "reply_turns",
  "segment_members",
  "segments",
  "sequence_batches",
  "sequence_enrollments",
  "sequence_replies",
  "sequence_sends",
  "sequence_steps",
  "sequences",
  "templates",
  "tenant_channels",
  "tenant_config",
  // The settings as they stood at each version (00402, decision 0039).
  "tenant_config_versions",
  // The workspace's receptionist at Retell, made before any number (00476, decision 0069).
  "voice_agents",
];

/** Survives the delete with a null tenant_id, deliberately. */
// A partner's earnings (0012) are money owed or paid, and outlive the workspace they came from, as its events do. What
// the Console's staff did there, and the request that asked for the delete, are the record of it (00467).
const KEPT = new Set(["billing_events", "partner_earnings", "platform_acts", "privacy_requests"]);

/** A page of storage's list(), its own default: a folder past it is read again from where the page ended. */
const LIST_PAGE = 100;
/** The paths one storage remove() carries. */
const REMOVE_BATCH = 100;

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
 * The paths removed a batch at a time. A batch storage refuses is kept by path and the rest still go; a path already
 * gone is the end state wanted, so it is neither removed nor failed.
 */
export async function removeAll(bucket, paths) {
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
  }
  return { removed, failed, error: firstError };
}

const megabytes = (bytes) => `${(bytes / 1e6).toFixed(1)} MB`;

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
    process.exit(2);
  }

  const arg = (name) => {
    const i = process.argv.indexOf(name);
    return i === -1 ? null : (process.argv[i + 1] ?? null);
  };
  const tenantId = arg("--tenant");
  const expectName = arg("--expect-name");
  const apply = process.argv.includes("--apply");
  const orphansOk = process.argv.includes("--orphans-ok");
  if (!tenantId || !expectName) {
    console.error('usage: --tenant <uuid> --expect-name "<name>" [--apply]');
    process.exit(2);
  }

  const db = createClient(url, key, { auth: { persistSession: false } });

  // ------------------------------------------------------------------ 1. who
  const { data: tenant, error: tErr } = await db
    .from("tenants")
    .select("id, name, slug, created_at")
    .eq("id", tenantId)
    .maybeSingle();
  if (tErr) {
    console.error("tenant lookup failed:", tErr.message);
    process.exit(1);
  }

  // Idempotent: a second run against an already-deleted workspace is a no-op,
  // not an error, so re-running after a half-finished attempt is safe.
  if (!tenant) {
    console.log(`No tenant ${tenantId}. Nothing to do.`);
    process.exit(0);
  }
  if (tenant.name !== expectName) {
    console.error(
      `REFUSING: --expect-name is ${JSON.stringify(expectName)} but the tenant is named ${JSON.stringify(tenant.name)}.`,
    );
    process.exit(1);
  }
  console.log(
    `tenant ${tenant.id}\n  name    ${tenant.name}\n  slug    ${tenant.slug}\n  created ${tenant.created_at}\n`,
  );

  // -------------------------------------------------------- 2. read and back up
  const backupsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "backups");
  mkdirSync(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(backupsDir, `tenant-${tenantId}-${stamp}.jsonl`);

  const lines = [];
  const tally = [];
  const byTable = new Map();
  let total = 0;
  for (const table of TABLES) {
    const { data, error } = await db.from(table).select("*").eq("tenant_id", tenantId);
    if (error) {
      // A table this script cannot read is a table it cannot back up, and a
      // backup with a hole in it is worse than none — it reads as complete.
      console.error(`REFUSING: could not read ${table}: ${error.message}`);
      process.exit(1);
    }
    const rows = data ?? [];
    byTable.set(table, rows);
    if (rows.length) {
      for (const row of rows) lines.push(JSON.stringify({ table, row }));
      tally.push([table, rows.length]);
      total += rows.length;
    }
  }
  writeFileSync(backupPath, lines.length ? lines.join("\n") + "\n" : "");
  console.log(`backup: ${total} rows across ${tally.length} tables -> ${backupPath}`);
  if (!total) console.log("  (the workspace is empty)");
  for (const [table, n] of tally) {
    console.log(
      `  ${table.padEnd(22)} ${String(n).padStart(6)}${KEPT.has(table) ? "   kept, tenant_id set to null" : ""}`,
    );
  }

  /**
   * What this delete cannot reach. Each entry is something that keeps running,
   * and in two cases keeps being billed, after every row here is gone.
   */
  const orphans = [];
  for (const line of byTable.get("lines") ?? []) {
    orphans.push(
      `the phone line ${line.e164 ?? "(no number)"} — Twilio subaccount ${line.subaccount_sid ?? "—"}, ` +
        `number ${line.number_sid ?? "—"}${line.trunk_sid ? `, trunk ${line.trunk_sid}` : ""}` +
        `${line.messaging_service_sid ? `, messaging service ${line.messaging_service_sid}` : ""}` +
        `${line.brand_sid ? `, and a registered A2P brand` : ""}` +
        ` — plus its line-creds Vault secret. Release the number and close the subaccount first, or move the line to another workspace.` +
        (line.voice_state === "answering" ? "\n      IT IS ANSWERING CALLS RIGHT NOW." : ""),
    );
  }
  for (const b of byTable.get("billing_accounts") ?? []) {
    if (b.stripe_subscription_id || b.stripe_customer_id) {
      orphans.push(
        `a Stripe ${b.status === "trialing" ? "trial" : b.status} — customer ${b.stripe_customer_id ?? "—"}` +
          `${b.stripe_subscription_id ? `, subscription ${b.stripe_subscription_id}` : ""}. Cancel it in Stripe first.`,
      );
    }
  }
  for (const g of byTable.get("google_connections") ?? []) {
    orphans.push(
      `a Google Business Profile grant for ${g.google_email ?? "an account"}, and its google-creds Vault secret. Disconnect it in the product first, which hands the grant back to Google.`,
    );
  }
  for (const m of byTable.get("mailbox_connections") ?? []) {
    if (m.state !== "removed")
      orphans.push(
        `a connected mailbox, ${m.address}: its grant at ${m.provider === "microsoft" ? "Microsoft" : "Google"}, its watch there, and its mailbox-creds Vault secret. Remove it on Connections first, which hands the grant back and drops the secret.`,
      );
  }
  for (const c of byTable.get("tenant_channels") ?? []) {
    if (c.status === "active")
      orphans.push(
        `an active channel binding ${c.external_id ?? "(no id)"} at its provider, and its channel-credentials Vault secret.`,
      );
  }
  // The receptionist's agent and its LLM at Retell (00476): made by a rehearsal before any number, so a workspace with no
  // line can still have one. Its row goes with the cascade; the agent does not.
  for (const a of byTable.get("voice_agents") ?? []) {
    orphans.push(`a Retell agent ${a.agent_id}${a.llm_id ? ` and its LLM ${a.llm_id}` : ""}. Delete them at Retell.`);
  }

  // The workspace's logo (00407) is a file in a public bucket, which no cascade reaches. Its folder is read here, said with
  // the counts, and emptied after the rows are gone; a bucket this database does not have yet reads as no files.
  const { data: logoFiles } = await db.storage.from("workspace-logos").list(tenantId);
  const logos = (logoFiles ?? []).map((f) => `${tenantId}/${f.name}`);
  if (logos.length)
    console.log(
      `  ${"logo files".padEnd(22)} ${String(logos.length).padStart(6)}   removed from workspace-logos after the rows`,
    );

  // Its media (00002) is files in a private bucket, read to the bottom here and emptied after the rows the same way. A
  // folder it cannot read is a delete that would strand what it did not see, so that refuses, as a table does.
  const media = await filesUnder(db.storage.from("media"), tenantId);
  if (media.error) {
    console.error(`REFUSING: could not list media/${tenantId}: ${media.error}`);
    process.exit(1);
  }
  const mediaBytes = media.files.reduce((n, f) => n + f.bytes, 0);
  if (media.files.length)
    console.log(
      `  ${"media files".padEnd(22)} ${String(media.files.length).padStart(6)}   ${megabytes(mediaBytes)}, removed from media after the rows`,
    );

  if (orphans.length) {
    console.log(`\nWOULD BE STRANDED OUTSIDE THE DATABASE (${orphans.length}):`);
    for (const o of orphans) console.log(`  · ${o}`);
  }

  if (!apply) {
    console.log(`\nDry run only. Re-run with --apply to delete ${JSON.stringify(tenant.name)} and everything above.`);
    process.exit(0);
  }

  if (orphans.length && !orphansOk) {
    console.error(
      `\nREFUSING: this workspace still holds ${orphans.length} thing${orphans.length === 1 ? "" : "s"} ` +
        `the delete cannot reach, listed above. Release them first, or pass --orphans-ok to strand them deliberately.`,
    );
    process.exit(1);
  }
  if (orphans.length) {
    console.log(
      `\n--orphans-ok: stranding ${orphans.length} provider-side thing${orphans.length === 1 ? "" : "s"} on purpose.`,
    );
  }

  // ------------------------------------------------------------------ 3. apply
  // events first: no foreign key, so the cascade cannot reach it and the rows
  // would be left pointing at a tenant that no longer exists.
  const { error: eErr } = await db.from("events").delete().eq("tenant_id", tenantId);
  if (eErr) {
    console.error("events delete failed:", eErr.message);
    process.exit(1);
  }

  const { data: gone, error: dErr } = await db.from("tenants").delete().eq("id", tenantId).select("id");
  if (dErr) {
    console.error("tenant delete failed:", dErr.message);
    process.exit(1);
  }
  if (!gone || gone.length !== 1) {
    console.error(`REFUSING TO REPORT SUCCESS: expected 1 tenant row deleted, got ${gone?.length ?? 0}.`);
    process.exit(1);
  }

  if (logos.length) {
    const { error: lErr } = await db.storage.from("workspace-logos").remove(logos);
    console.log(
      lErr
        ? `the logo files could not be removed (${lErr.message}); remove them from workspace-logos by hand: ${logos.join(", ")}`
        : `removed ${logos.length} logo file${logos.length === 1 ? "" : "s"} from workspace-logos`,
    );
  }

  if (media.files.length) {
    const paths = media.files.map((f) => f.path);
    const { removed, failed, error } = await removeAll(db.storage.from("media"), paths);
    console.log(`removed ${removed.length} of ${media.files.length} media files from media`);
    if (failed.length) {
      // A re-run finds no tenant and stops, so what is left here is left for good unless someone takes it.
      console.error(
        `${failed.length} media files could not be removed (${error}); remove what is left under media/${tenantId}/ by hand`,
      );
      process.exitCode = 1;
    }
  }

  const { data: still } = await db.from("tenants").select("id").eq("id", tenantId).maybeSingle();
  console.log(
    `\ndeleted ${JSON.stringify(tenant.name)} (${tenantId}); ${still ? "STILL PRESENT — investigate" : "gone"}.`,
  );
  console.log(`the backup is at ${backupPath}`);
  console.log(
    "note: a Stripe test-mode customer this workspace pointed at is untouched; remove it in Stripe if you want it gone.",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
