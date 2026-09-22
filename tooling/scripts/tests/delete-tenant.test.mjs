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
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, readCode } from "./_source.mjs";

const script = readCode("tooling/scripts/delete-tenant.mjs");

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
  assert.ok(script.includes('const KEPT = new Set(["billing_events"]);'), "the script says which rows survive");
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
