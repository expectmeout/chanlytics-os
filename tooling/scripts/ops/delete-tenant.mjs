/**
 * Delete a workspace and everything in it (prod-script bar): dry-run DEFAULT,
 * a JSONL backup of every row before any apply, idempotent, --apply to execute.
 *
 * A tenant delete cascades through a hundred-odd tables and nothing undoes it, so
 * the guard is not a human reading a name off the screen. --expect-name has to
 * match the tenant's name exactly, the counts are printed before anything is
 * touched, and the backup is written first or the run stops.
 *
 * The backup holds every row, however many. PostgREST answers one read with at most 1,000 rows and says nothing when it
 * stops there, so each table is read a page at a time by its own key until a page comes back empty, and the database's
 * exact count is asked before and after. A read with fewer rows than were counted refuses, on a dry run too
 * (delete-tenant/reads.mjs).
 *
 * Two tables do NOT cascade, and both are handled here rather than discovered
 * afterwards:
 *   - `events` carries a tenant_id with no foreign key at all, because it is
 *     partitioned and a partitioned table cannot reference one. Deleting the
 *     tenant would leave its whole history orphaned, so this deletes it first.
 *   - `billing_events` is ON DELETE SET NULL on purpose: Stripe's dedup ledger
 *     has to outlive the workspace or a redelivered event would be processed
 *     twice. Those rows are backed up and reported, never deleted.
 *   - `anthropic_profiles` is ON DELETE SET NULL too (00544, decision 0097): a row with no workspace is the health sweep's
 *     to delete at Anthropic, and then here, so nothing is left there for a workspace that has gone.
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
 * An apply stops the workspace's work before it deletes anything (delete-tenant/fence.mjs). It sets Stop everything
 * through its own door, withdraws the workspace's queued jobs, and waits until none is running (--wait-minutes, ten
 * unless said; past it the run refuses and names them). Then it reads the workspace AGAIN, and that second read, exact
 * to the row, is the backup the delete goes by: what a job wrote while the first look was being read is in it. A run
 * that refuses after the stop leaves Stop everything on and says so; run it again, or press Resume in the product to
 * keep the workspace.
 *
 * The files are outside Postgres too. The workspace's folder in `media` holds its
 * call recordings (calls/) and its messages' media (a folder per thread), and the
 * 90-day purge finds a recording through its calls row, which this delete removes:
 * a workspace deleted on 28 Oct 2026 left 24 recordings that nothing would take. So
 * the folder is read to the bottom with the counts, and emptied after the rows,
 * as the logo folder is. Its videos at Cloudflare Stream, its pictures' copies at Anthropic and its videos on Chanlytics'
 * own shelf (the archive plan's B2: a private bucket behind the relay, a key that begins with the workspace's id) go the
 * same way.
 *
 * Everything removed outside the database is on a list first (delete-tenant/outside.mjs): a file beside the backup,
 * `<backup>.clean-up.jsonl`, one line for each thing, written before any delete. A removal marks its line. The run ends
 * non-zero while a line is not done and prints what stayed; `--resume <list>` says what is still on a list, and with
 * `--apply` asks again for only that. It refuses while the workspace's row is still there.
 *
 * No statement takes a whole history (delete-tenant/slices.mjs): the service role's statements end at 30 seconds
 * (00283). Past 5,000 rows the events go a month at a time, and the tables that grow with history are emptied by key
 * before the workspace's own delete; a slice that still times out is cut in two. A run that stops between two deletes is
 * safe to run again. Keep every backup of a workspace: a second run's backup does not hold what the first one deleted.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY; and to empty what is outside the database, each for this run:
 *      ANTHROPIC_API_KEY, CLOUDFLARE_ACCOUNT_ID with CLOUDFLARE_STREAM_API_TOKEN, FOOTAGE_RELAY_URL with FOOTAGE_TICKET_KEY
 * Usage:
 *   node tooling/scripts/ops/delete-tenant.mjs --tenant <uuid> --expect-name "<name>"
 *   node tooling/scripts/ops/delete-tenant.mjs --tenant <uuid> --expect-name "<name>" --apply [--wait-minutes <n>]
 *   node tooling/scripts/ops/delete-tenant.mjs --resume <list> [--apply]
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { drain, jobWords, ledgerOf, stop } from "./delete-tenant/fence.mjs";
import {
  cleanUp,
  filesUnder,
  itemWords,
  listOf,
  readList,
  removeAll,
  removeShelved,
  shelfDeleteTicket,
  shelvedOf,
  writeList,
} from "./delete-tenant/outside.mjs";
import { snapshot } from "./delete-tenant/reads.mjs";
import { SLICED_PAST, deleteHistory, emptyFirst } from "./delete-tenant/slices.mjs";
import { strandedOf } from "./delete-tenant/stranded.mjs";
import { EMPTIED_FIRST, KEPT } from "./delete-tenant/tables.mjs";

export { filesUnder, removeAll, removeShelved, shelfDeleteTicket, shelvedOf };

/** How long an apply waits for the workspace's running jobs to end, unless --wait-minutes says. */
const WAIT_MINUTES = 10;
const MINUTE_MS = 60_000;
/** How many times an apply stops, reads and looks again at the ledger before it gives up on a workspace that keeps queueing. */
const FENCE_ROUNDS = 3;
/** The lines of what stayed that a run prints; the list holds the rest. */
const STAYS_SAID = 20;

const megabytes = (bytes) => `${(bytes / 1e6).toFixed(1)} MB`;
const things = (n) => `${n} thing${n === 1 ? "" : "s"}`;
const row = (name, n, note = "") => `  ${name.padEnd(22)} ${String(n).padStart(6)}${note ? `   ${note}` : ""}`;

/** The run ends here, saying why. */
function refuse(message, code = 1) {
  console.error(message);
  process.exit(code);
}

/** What the run was asked: its flags, and the values of those that take one. */
function asked(argv) {
  const value = (name) => {
    const i = argv.indexOf(name);
    return i === -1 ? null : (argv[i + 1] ?? null);
  };
  const wait = value("--wait-minutes");
  return {
    tenantId: value("--tenant"),
    expectName: value("--expect-name"),
    resume: value("--resume"),
    apply: argv.includes("--apply"),
    orphansOk: argv.includes("--orphans-ok"),
    waitMs: (wait === null ? WAIT_MINUTES : Number(wait)) * MINUTE_MS,
  };
}

/** The workspace, by id and by name: the run ends where there is none, or where the name is another's. */
async function workspaceOf(db, tenantId, expectName) {
  const { data: tenant, error } = await db
    .from("tenants")
    .select("id, name, slug, created_at, sending_stopped_at")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) refuse(`tenant lookup failed: ${error.message}`);
  // Idempotent: a second run against an already-deleted workspace is a no-op,
  // not an error, so re-running after a half-finished attempt is safe.
  if (!tenant) {
    console.log(`No tenant ${tenantId}. Nothing to do.`);
    process.exit(0);
  }
  if (tenant.name !== expectName)
    refuse(
      `REFUSING: --expect-name is ${JSON.stringify(expectName)} but the tenant is named ${JSON.stringify(tenant.name)}.`,
    );
  console.log(
    `tenant ${tenant.id}\n  name    ${tenant.name}\n  slug    ${tenant.slug}\n  created ${tenant.created_at}\n`,
  );
  return tenant;
}

/**
 * What the workspace keeps outside the database, as its rows and its folders say: its logo (00407), its files (00551)
 * and its media (00002) in storage, its pictures' copies at Anthropic, its videos at Stream (00556) and on the shelf
 * (00695). A folder that cannot be listed is a delete that would strand what it did not see, so that refuses, as a table
 * does; the logo's bucket alone reads as empty where this database does not have it yet.
 */
async function outsideOf(db, tenantId, rows, tail) {
  const folder = async (bucket) => {
    const read = await filesUnder(db.storage.from(bucket), tenantId);
    if (read.error) refuse(`REFUSING: could not list ${bucket}/${tenantId}: ${read.error}${tail}`);
    return read.files;
  };
  const files = rows.get("files") ?? [];
  return {
    logos: (await filesUnder(db.storage.from("workspace-logos"), tenantId)).files,
    media: await folder("media"),
    kept: await folder("files"),
    copies: files.map((f) => f.claude_copy?.id).filter((id) => typeof id === "string"),
    videos: files.map((f) => f.media_ref).filter((id) => typeof id === "string" && id),
    shelved: shelvedOf(rows.get("file_archive_parts")),
  };
}

/** What would stay at a provider because this run holds no key to remove it: named with the rest of what is stranded. */
function unkeyedOf(outside, env) {
  const out = [];
  if (outside.copies.length && !env.ANTHROPIC_API_KEY)
    out.push(
      `${outside.copies.length} copies of its pictures at Anthropic, which last up to 90 days. Set ANTHROPIC_API_KEY for this run to delete them, or delete them there by the ids in the backup.`,
    );
  // Without Stream's account and token for this run its videos stay there, billed, until deleted by hand.
  if (outside.videos.length && !(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_STREAM_API_TOKEN))
    out.push(
      `${outside.videos.length} videos at Cloudflare Stream, billed by the minute until deleted. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_STREAM_API_TOKEN for this run to delete them, or delete them there by the ids in the backup (files.media_ref).`,
    );
  // Without the relay's address and the ticket's key they stay on the shelf, private and unreachable.
  if (outside.shelved.length && !(env.FOOTAGE_RELAY_URL && env.FOOTAGE_TICKET_KEY))
    out.push(
      `${outside.shelved.length} videos on Chanlytics' own shelf. Set FOOTAGE_RELAY_URL and FOOTAGE_TICKET_KEY for this run to remove them, or remove them there by the keys in the backup (file_archive_parts.shelf_key).`,
    );
  return out;
}

/**
 * The workspace read whole into the backup, with what it keeps outside the database and what the delete would strand.
 * `still`: the delete's own snapshot, exact to the row. `tail` ends a refusal's words (what an apply has already done).
 */
async function read(db, tenant, backupPath, { still = false, tail = "" } = {}) {
  const shot = await snapshot(db, tenant, backupPath, { still });
  if (shot.refusal) refuse(`REFUSING: ${shot.refusal}${tail}`);
  const outside = await outsideOf(db, tenant.id, shot.rows, tail);
  return { shot, outside, orphans: [...strandedOf(shot.rows), ...unkeyedOf(outside, process.env)] };
}

/** The look, said: the backup's counts, what is outside the database, and what an apply would strand. */
function sayLook({ shot, outside, orphans }, backupPath) {
  console.log(`backup: ${shot.total} rows across ${shot.tally.length} tables -> ${backupPath}`);
  if (!shot.total) console.log("  (the workspace is empty)");
  for (const [table, n] of shot.tally) console.log(row(table, n, KEPT.has(table) ? "kept, tenant_id set to null" : ""));
  const bytes = (files) => megabytes(files.reduce((n, f) => n + f.bytes, 0));
  const { logos, kept, media, videos, shelved } = outside;
  if (logos.length) console.log(row("logo files", logos.length, "removed from workspace-logos after the rows"));
  if (kept.length) console.log(row("kept files", kept.length, `${bytes(kept)}, removed from files after the rows`));
  if (media.length) console.log(row("media files", media.length, `${bytes(media)}, removed from media after the rows`));
  if (videos.length) console.log(row("videos at Stream", videos.length, "deleted there after the rows"));
  if (shelved.length) console.log(row("videos on the shelf", shelved.length, "removed there after the rows"));
  if (shot.moved.length)
    console.log(
      `\nwritten to while it was read: ${shot.moved.map(([table]) => table).join(", ")}. This look is not the backup a ` +
        `delete goes by: an apply stops the workspace's work and reads it again.`,
    );
  if (orphans.length) {
    console.log(`\nWOULD BE STRANDED OUTSIDE THE DATABASE (${orphans.length}):`);
    for (const o of orphans) console.log(`  · ${o}`);
  }
}

/**
 * The workspace's work stopped and its rows read again, exact: Stop everything, its queued jobs withdrawn, its running
 * ones waited for, the snapshot the delete goes by, and one more look at the ledger. A job queued while the snapshot was
 * read sends it round again. Answers that snapshot.
 */
async function stopAndRead(db, tenant, backupPath, waitMs) {
  console.log("\nstopping the workspace's work before anything is deleted");
  const stopped = await stop(db, tenant);
  if (stopped.error) refuse(`REFUSING: could not stop the workspace's work: ${stopped.error}`);
  console.log(
    stopped.already ? `  Stop everything was already on (since ${stopped.already})` : "  Stop everything is on",
  );
  let withdrawn = 0;
  const tail = () =>
    `\nStop everything is on for this workspace${withdrawn ? `, and ${withdrawn} of its queued jobs are withdrawn (each is in the backup as it was)` : ""}. ` +
    `Run this again to finish, or press Resume in the product to keep the workspace.`;
  for (let round = 0; round < FENCE_ROUNDS; round++) {
    const drained = await drain(db, tenant.id, waitMs);
    withdrawn += drained.withdrawn;
    if (drained.error) refuse(`REFUSING: could not read the workspace's jobs: ${drained.error}${tail()}`);
    if (drained.withdrawn) console.log(`  withdrew ${drained.withdrawn} queued jobs`);
    if (drained.live)
      refuse(
        `REFUSING: ${drained.live} of this workspace's jobs had not ended after ${waitMs / MINUTE_MS} minutes:\n` +
          drained.jobs.map((job) => `  · ${jobWords(job)}`).join("\n") +
          tail(),
      );
    const last = await read(db, tenant, backupPath, { still: true, tail: tail() });
    const after = await ledgerOf(db, tenant.id);
    if (after.error) refuse(`REFUSING: could not read the workspace's jobs: ${after.error}${tail()}`);
    if (!after.live) {
      console.log("  nothing of this workspace is queued or running");
      return last;
    }
  }
  return refuse(
    `REFUSING: jobs of this workspace were queued again each of the ${FENCE_ROUNDS} times it was read. Something is still handing it work.${tail()}`,
  );
}

/** The rows deleted: the history, the tables that grow with it, then the workspace and what cascades from it. */
async function deleteRows(db, tenant, shot, backupPath) {
  const counts = new Map(shot.tally);
  const kept = `\nNothing outside the database was removed. Run this again to finish, and keep ${backupPath}: a second run's backup will not hold what this one deleted.`;
  // events first: no foreign key, so the cascade cannot reach it and the rows
  // would be left pointing at a tenant that no longer exists.
  const history = await deleteHistory(db, tenant.id, shot.months, counts.get("events") ?? 0);
  if (history.error) refuse(`events delete failed: ${history.error}${kept}`);
  if (history.late)
    console.log(`${history.late} events were written after the backup was read; they went with the rest.`);
  for (const table of EMPTIED_FIRST) {
    if ((counts.get(table) ?? 0) <= SLICED_PAST) continue;
    const error = await emptyFirst(db, tenant.id, table, shot.ends.get(table));
    if (error) refuse(`${table} delete failed: ${error}${kept}`);
    console.log(`emptied ${table} first, ${counts.get(table)} rows a slice at a time`);
  }
  const { data: gone, error } = await db.from("tenants").delete().eq("id", tenant.id).select("id");
  if (error) refuse(`tenant delete failed: ${error.message}${kept}`);
  if (!gone || gone.length !== 1)
    refuse(`REFUSING TO REPORT SUCCESS: expected 1 tenant row deleted, got ${gone?.length ?? 0}.`);
}

/**
 * The list's undone lines asked for, and what happened said. Answers how many stayed; while any does, the run says
 * which, why, and how to ask again.
 */
async function removeOutside(db, list) {
  for (const done of await cleanUp(list, { db })) {
    console.log(`${done.verb} ${done.gone} of ${done.asked} ${done.said} ${done.where}`);
    if (done.why) console.error(`  ${done.asked - done.gone} ${done.said} stayed ${done.where}: ${done.why}`);
  }
  const stays = list.items.filter((item) => !item.done);
  if (!stays.length) return 0;
  console.error(`\n${things(stays.length)} still there outside the database:`);
  for (const item of stays.slice(0, STAYS_SAID)) console.error(`  · ${itemWords(item)}`);
  if (stays.length > STAYS_SAID)
    console.error(`  · and ${stays.length - STAYS_SAID} more, each a line of the list with "done":false`);
  console.error(
    `Ask again for what stayed: node tooling/scripts/ops/delete-tenant.mjs --resume ${list.path} --apply\n` +
      `A video's id at Stream is its row's in the backup (files.media_ref).`,
  );
  return stays.length;
}

/** A list picked up again: what is still on it said, and with --apply asked for. */
async function resume(db, path, apply) {
  const list = readList(path);
  if (list.error) refuse(list.error, 2);
  const { head, items } = list;
  console.log(`clean-up list of ${JSON.stringify(head.name)} (${head.tenant}), written ${head.made_at}`);
  const stays = items.filter((item) => !item.done);
  if (!stays.length) {
    console.log("Nothing on this list is still there.");
    return;
  }
  const { data: still, error } = await db.from("tenants").select("id").eq("id", head.tenant).maybeSingle();
  if (error) refuse(`tenant lookup failed: ${error.message}`);
  if (still)
    refuse(
      `REFUSING: the workspace ${JSON.stringify(head.name)} is still there. What it keeps outside the database goes only once its rows have: finish its delete with --apply first.`,
    );
  if (!apply) {
    console.log(`${things(stays.length)} still there outside the database:`);
    for (const item of stays.slice(0, STAYS_SAID)) console.log(`  · ${itemWords(item)}`);
    if (stays.length > STAYS_SAID) console.log(`  · and ${stays.length - STAYS_SAID} more`);
    console.log("\nDry run only. Re-run with --apply to ask for them again.");
    process.exitCode = 1;
    return;
  }
  if (await removeOutside(db, { path, head, items })) process.exitCode = 1;
  else console.log("\nNothing on this list is still there.");
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) refuse("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required", 2);
  const { tenantId, expectName, resume: list, apply, orphansOk, waitMs } = asked(process.argv);
  const db = createClient(url, key, { auth: { persistSession: false } });
  if (list) return resume(db, list, apply);
  if (!tenantId || !expectName || !(waitMs >= 0))
    refuse(
      'usage: --tenant <uuid> --expect-name "<name>" [--apply] [--wait-minutes <n>], or --resume <list> [--apply]',
      2,
    );

  // ------------------------------------------------------------------ 1. who
  const tenant = await workspaceOf(db, tenantId, expectName);

  // -------------------------------------------------------- 2. read and back up
  const backupsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "backups");
  mkdirSync(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(backupsDir, `tenant-${tenantId}-${stamp}.jsonl`);
  const look = await read(db, tenant, backupPath);
  sayLook(look, backupPath);

  if (!apply) {
    console.log(`\nDry run only. Re-run with --apply to delete ${JSON.stringify(tenant.name)} and everything above.`);
    process.exit(0);
  }
  const strands = (orphans) => {
    if (orphans.length && !orphansOk)
      refuse(
        `\nREFUSING: this workspace still holds ${things(orphans.length)} ` +
          `the delete cannot reach, listed above. Release them first, or pass --orphans-ok to strand them deliberately.`,
      );
  };
  strands(look.orphans);
  if (look.orphans.length)
    console.log(
      `\n--orphans-ok: stranding ${look.orphans.length} provider-side thing${look.orphans.length === 1 ? "" : "s"} on purpose.`,
    );

  // ------------------------------------------- 3. stop its work, and read it again
  const last = await stopAndRead(db, tenant, backupPath, waitMs);
  console.log(
    `backup, read again with its work stopped: ${last.shot.total} rows across ${last.shot.tally.length} tables`,
  );
  if (last.orphans.length > look.orphans.length) {
    console.log(`\nWOULD BE STRANDED OUTSIDE THE DATABASE (${last.orphans.length}):`);
    for (const o of last.orphans) console.log(`  · ${o}`);
    strands(last.orphans);
  }

  // ------------------------------------------- 4. the list of what goes outside
  const { logos, kept, media, copies, videos, shelved } = last.outside;
  const paths = (files) => files.map((f) => f.path);
  const items = listOf({ logos: paths(logos), files: paths(kept), copies, videos, shelved, media: paths(media) });
  const listPath = backupPath.replace(/\.jsonl$/, ".clean-up.jsonl");
  const head = {
    tenant: tenant.id,
    name: tenant.name,
    backup: basename(backupPath),
    made_at: new Date().toISOString(),
  };
  writeList(listPath, head, items);
  console.log(`clean-up list: ${things(items.length)} to remove outside the database -> ${listPath}`);

  // ------------------------------------------------------------------ 5. apply
  await deleteRows(db, tenant, last.shot, backupPath);
  if (await removeOutside(db, { path: listPath, head, items })) process.exitCode = 1;

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
