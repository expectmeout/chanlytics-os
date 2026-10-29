/**
 * Deleting a workspace, to this repo's bar for production-mutating work.
 *
 * The bar is dry-run by default, idempotent, a JSONL backup, and an explicit
 * --apply. An earlier draft of this task named that bar and then prescribed
 * hand-typed SQL guarded by a human reading a name off the screen, which meets
 * none of it — reproducing a failure mode while quoting the rule against it.
 *
 * The table list is the part that rots. A table added with a tenant_id and not
 * added here means a backup with a hole in it, which reads as complete.
 *
 * The files are the part no cascade reaches. A workspace's media folder, its
 * call recordings and its messages' media, is walked to the bottom over a bucket
 * that answers as storage does, and removed a batch at a time.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT, readCode } from "../_source.mjs";

const script = readCode("tooling/scripts/ops/delete-tenant.mjs");
const run = await import(pathToFileURL(path.join(ROOT, "tooling/scripts/ops/delete-tenant.mjs")).href);

/** Every table carrying a tenant_id, read out of the migrations. */
function tablesWithTenantId() {
  const found = new Set();
  const dir = path.join(ROOT, "supabase/migrations");
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith(".sql")) continue;
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    for (const m of sql.matchAll(/create table (?:if not exists )?public\.(\w+)\s*\(([\s\S]*?)\n\);/g)) {
      if (/\btenant_id\b/.test(m[2])) found.add(m[1]);
    }
    // A table renamed keeps its rows under its new name (0060: playbooks became sequence_steps), and one dropped has none.
    for (const m of sql.matchAll(/alter table (?:if exists )?public\.(\w+) rename to (\w+);/g))
      if (found.delete(m[1])) found.add(m[2]);
    for (const m of sql.matchAll(/drop table (?:if exists )?public\.(\w+)[\s;]/g)) found.delete(m[1]);
  }
  return found;
}

test("the script backs up every table that carries a tenant_id", () => {
  const listed = new Set((/const TABLES = \[([\s\S]*?)\];/.exec(script)?.[1] ?? "").matchAll(/"([a-z_]+)"/g));
  const inScript = new Set([...listed].map((m) => m[1]));
  const inSchema = tablesWithTenantId();

  const missing = [...inSchema].filter((t) => !inScript.has(t)).sort();
  assert.deepEqual(missing, [], "a table with a tenant_id that the backup would miss");

  const stale = [...inScript].filter((t) => !inSchema.has(t)).sort();
  assert.deepEqual(stale, [], "a table the script names that no longer carries a tenant_id");
});

test("it meets the bar it cites: dry run, backup, idempotent, --apply", () => {
  assert.ok(script.includes('const apply = process.argv.includes("--apply");'), "apply is opt-in");
  assert.ok(
    script.indexOf("writeFileSync(backupPath") < script.indexOf("if (!apply)"),
    "the backup is written BEFORE the dry-run exit, so --apply cannot outrun it",
  );
  assert.ok(script.includes("Dry run only. Re-run with --apply"), "and says so plainly");
  assert.ok(
    script.includes("No tenant ${tenantId}. Nothing to do.") && script.includes("process.exit(0)"),
    "a second run against an already-deleted workspace is a no-op, not an error",
  );
});

test("it refuses rather than guesses", () => {
  assert.ok(script.includes("tenant.name !== expectName"), "the name has to be given and has to match");
  assert.ok(script.includes("REFUSING: could not read"), "a table it cannot read is a backup with a hole in it");
  assert.ok(
    script.includes("REFUSING TO REPORT SUCCESS: expected 1 tenant row deleted"),
    "and it counts what it deleted rather than assuming",
  );
});

test("the two tables that do not cascade are handled, not discovered afterwards", () => {
  // events carries a tenant_id with NO foreign key, because it is partitioned
  // and a partitioned table cannot reference one. Without this the whole
  // history is left pointing at a tenant that no longer exists.
  const events = readCode("supabase/migrations/00002_conversations.sql");
  const decl = /create table public\.events\s*\(([\s\S]*?)\n\);/.exec(events)?.[1] ?? "";
  assert.match(decl, /tenant_id\s+uuid not null,/, "events still has no foreign key");
  assert.ok(
    script.includes('await db.from("events").delete().eq("tenant_id", tenantId);'),
    "so the script deletes it explicitly",
  );
  assert.ok(
    script.indexOf('from("events").delete()') < script.indexOf('from("tenants").delete()'),
    "and does so BEFORE the tenant, while the rows can still be found",
  );

  // billing_events is ON DELETE SET NULL on purpose: Stripe's dedup ledger has
  // to outlive the workspace or a redelivered event is processed twice.
  const billing = readCode("supabase/migrations/00073_billing.sql");
  assert.ok(billing.includes("tenant_id    uuid references public.tenants (id) on delete set null"));
  // A partner's earnings (0012) are money owed or paid, and outlive the workspace as the ledger does; so do what the
  // Console's staff did there and the request that asked for the delete (00467, decision 0066).
  assert.ok(
    script.includes(
      'const KEPT = new Set(["billing_events", "partner_earnings", "platform_acts", "privacy_requests"]);',
    ),
    "the script says which rows survive",
  );
  // That those two outlive their workspace, its key set null, is run on the stack (console/console.db.test.mjs).
  assert.ok(
    script.includes("kept, tenant_id set to null"),
    "and says so in the tally rather than in a comment nobody reads",
  );
});

test("it refuses to strand what the cascade cannot reach", () => {
  // The cascade is thorough inside Postgres and blind outside it. The very
  // workspace this tool was written to delete turned out to own the product's
  // first real phone line, answering, with two inbound texts on it, a Stripe
  // trial and a live Retell agent. A dry run caught that; the hand-typed
  // DELETE the plan originally proposed would have taken all of it.
  for (const [what, needle] of [
    ["the phone line and its Twilio estate", 'byTable.get("lines")'],
    ["a Stripe customer or subscription", 'byTable.get("billing_accounts")'],
    ["a Google grant", 'byTable.get("google_connections")'],
    ["an active provider binding", 'byTable.get("tenant_channels")'],
    ["a Retell agent made before any number (00476)", 'byTable.get("voice_agents")'],
  ]) {
    assert.ok(script.includes(needle), `${what} must be counted as an orphan`);
  }
  assert.ok(script.includes("WOULD BE STRANDED OUTSIDE THE DATABASE"), "and named, not merely counted");
  assert.ok(script.includes("IT IS ANSWERING CALLS RIGHT NOW"), "a live line says so loudly");
  assert.ok(script.includes("Vault secret"), "the Vault secrets have no foreign key and are named too");
});

test("the refusal comes before anything is deleted", () => {
  // The order is the whole guarantee. A check after the first delete is not a
  // guard, it is a post-mortem.
  const refuse = script.indexOf("REFUSING: this workspace still holds");
  assert.ok(refuse > -1, "an apply that would strand something refuses");
  assert.ok(refuse < script.indexOf('from("events").delete()'), "before the events delete");
  assert.ok(refuse < script.indexOf('from("tenants").delete()'), "and before the tenant delete");
  assert.ok(script.includes("orphans.length && !orphansOk"), "and only --orphans-ok gets past it");
});

test("a dry run reports the orphans and still finishes", () => {
  // Refusing the dry run too would hide the tally, which is the thing that
  // tells you what you are about to lose.
  const report = script.indexOf("WOULD BE STRANDED OUTSIDE THE DATABASE");
  const dryExit = script.indexOf("Dry run only. Re-run with --apply");
  assert.ok(report < dryExit, "the list is printed before the dry run exits");
  assert.ok(
    dryExit < script.indexOf("REFUSING: this workspace still holds"),
    "and the dry run exits 0 rather than refusing",
  );
});

const T = "00000000-0000-4000-8000-0000000000a1";

/**
 * A bucket as storage answers it: list() names one folder's children a page at a time, sorted by name, a subfolder as
 * an entry with no id; a folder nothing was written to lists as empty; remove() answers with what it removed, and a
 * path already gone is simply not among them.
 */
function bucket(objects, faults = {}) {
  const store = new Map(Object.entries(objects));
  const asked = { list: [], remove: [] };
  return {
    store,
    asked,
    list: async (dir, { limit = 100, offset = 0 } = {}) => {
      asked.list.push({ dir, limit, offset });
      if (faults.list?.[dir]) return { data: null, error: { message: faults.list[dir] } };
      const children = new Map();
      for (const [p, size] of store) {
        if (!p.startsWith(`${dir}/`)) continue;
        const [name, ...deeper] = p.slice(dir.length + 1).split("/");
        children.set(
          name,
          deeper.length ? { name, id: null, metadata: null } : { name, id: `o-${p}`, metadata: { size } },
        );
      }
      const page = [...children.values()].sort((a, b) => (a.name < b.name ? -1 : 1)).slice(offset, offset + limit);
      return { data: page, error: null };
    },
    remove: async (paths) => {
      asked.remove.push(paths);
      if (faults.remove?.(paths)) return { data: null, error: { message: "storage said no" } };
      return { data: paths.filter((p) => store.delete(p)).map((name) => ({ name })), error: null };
    },
  };
}

test("a workspace's media is read to the bottom: recordings, each thread's folder, and past a page", async () => {
  const objects = {
    [`${T}/thread-a/message-1.jpg`]: 2_000,
    [`${T}/thread-a/message-2.ogg`]: 3_000,
    [`${T}/thread-b/nested/message-3.pdf`]: 4_000,
    // Another workspace whose id this one's is a prefix of, and one beside it: neither is this workspace's.
    [`${T}0/calls/theirs.wav`]: 9_999,
    [`other/calls/theirs.wav`]: 9_999,
  };
  for (let i = 0; i < 150; i++) objects[`${T}/calls/call-${String(i).padStart(3, "0")}.wav`] = 1_000;
  const b = bucket(objects);

  const { files, error } = await run.filesUnder(b, T);

  assert.equal(error, null);
  assert.deepEqual(
    files.map((f) => f.path).sort(),
    Object.keys(objects)
      .filter((p) => p.startsWith(`${T}/`))
      .sort(),
    "every file under the folder, and nothing beside it",
  );
  assert.equal(
    files.reduce((n, f) => n + f.bytes, 0),
    150 * 1_000 + 2_000 + 3_000 + 4_000,
    "with its size, for the count the dry run says",
  );
  assert.ok(b.asked.list.filter((a) => a.dir === `${T}/calls`).length > 1, "a folder past a page is read page by page");
});

test("a workspace that never stored a file has no media, and that is not an error", async () => {
  assert.deepEqual(await run.filesUnder(bucket({ [`other/calls/x.wav`]: 1 }), T), { files: [], error: null });
});

test("a folder it cannot list is said, never read as empty", async () => {
  const b = bucket({ [`${T}/calls/a.wav`]: 1, [`${T}/thread-a/m.jpg`]: 1 }, { list: { [`${T}/calls`]: "timed out" } });
  const { error } = await run.filesUnder(b, T);
  assert.match(error, /timed out/);
  assert.match(error, /calls/, "naming the folder it could not read");
  // An unread folder would be a delete that strands what it could not see, which is the gap this closes.
  assert.ok(script.includes("REFUSING: could not list media/"), "the script refuses on it");
});

test("the files go a batch at a time, and a batch storage refuses does not stop the rest", async () => {
  const objects = {};
  for (let i = 0; i < 230; i++) objects[`${T}/calls/c${String(i).padStart(3, "0")}.wav`] = 1;
  const b = bucket(objects, { remove: (paths) => paths.includes(`${T}/calls/c150.wav`) });
  const gone = `${T}/calls/already-gone.wav`;
  const paths = [...Object.keys(objects), gone];

  const out = await run.removeAll(b, paths);

  assert.deepEqual(
    b.asked.remove.map((batch) => batch.length),
    [100, 100, 31],
  );
  assert.equal(out.removed.length, 130, "the batches storage took");
  assert.deepEqual(out.failed, b.asked.remove[1], "the batch it refused, by path");
  assert.equal(out.error, "storage said no");
  assert.ok(!out.failed.includes(gone) && !out.removed.includes(gone), "a path already gone is neither");
  assert.equal(b.store.size, 100, "what is left is the refused batch");
});

test("the media is counted in the dry run and removed only after the rows are gone", () => {
  const listed = script.indexOf('filesUnder(db.storage.from("media"), tenantId)');
  assert.ok(listed > -1, "the workspace's own media folder is read");
  assert.ok(listed < script.indexOf("Dry run only. Re-run with --apply"), "before the dry run exits, so it is said");
  const removed = script.indexOf('removeAll(db.storage.from("media")');
  assert.ok(removed > script.indexOf('from("tenants").delete()'), "after the tenant delete");
  assert.ok(removed > script.indexOf("REFUSING TO REPORT SUCCESS"), "and after it is counted as done");
});
