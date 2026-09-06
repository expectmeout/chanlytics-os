/**
 * One memory. BLOB_SHADOW=off retires the Blob thread store: the receptionist
 * neither reads nor writes it, Postgres is the only memory, and a Postgres miss
 * hands the thread to a human instead of falling back to a second copy. Deletes
 * still reach Blob, so erasure keeps working for what is left there.
 *
 * And the job queue says only what it can carry: every declared kind has a
 * handler and a caller.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JOB_KINDS } from "@chanlytics/contracts";
import { readCode, readRaw } from "./_source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "../../..");

/** Every .ts under the given roots (no dist, no node_modules), joined. */
function sourceTree(roots) {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === "dist" || e.name === ".next") continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith(".ts")) out.push(fs.readFileSync(full, "utf8"));
    }
  };
  for (const r of roots) walk(path.join(ROOT, r));
  return out.join("\n");
}

// The module reads its env at import time; this file runs in its own process.
process.env.BLOB_SHADOW = "off";
delete process.env.BLOB_READ_WRITE_TOKEN;
const store = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/store.ts")).href);

test("retired: the store answers unknown, refuses writes, still deletes", async () => {
  assert.equal(store.storeBackend(), "off");
  const ns = store.threadNamespace("tenant-x");
  const t = await store.getThread(ns, "15550001111");
  assert.equal(store.isThreadUnknown(t), true, "a read is a failed read — fail closed, never a blank thread that re-greets");
  assert.equal(t.pausedUntil, -1, "the second line of defence still holds");
  const saved = await store.saveThread(ns, "15550001111", { history: [], seen: [], pausedUntil: 0, replies: [] });
  assert.equal(saved, false, "nothing is written");
  assert.equal(await store.deleteThread(ns, "15550001111"), true, "erasure still answers");
  assert.equal(await store.deleteTenantThreads(ns), 0);
});

test("every caller that used the store as a mirror steps aside when it is retired", () => {
  const wa = readCode("apps/edge/api/whatsapp.ts");
  assert.ok(wa.includes('if (storeBackend() !== "off") {\n                  const echoNs = threadNamespace(tenantId);'), "the echo pause mirror is skipped; Postgres records the pause below it");
  assert.ok(readRaw("apps/edge/api/whatsapp.ts").includes("RETIRED STORE (BLOB_SHADOW=off)"), "the handler contract says so");
  const hook = readCode("apps/edge/api/retell-webhook.ts");
  assert.ok(hook.includes('if (from && storeBackend() !== "off") {'), "the Blob call note is skipped; the call_summary row is the note");
  const pause = readCode("apps/edge/api/admin/pause.ts");
  assert.ok(pause.includes('if (storeBackend() === "off") return json(200, { ok: true, store: "off" });'), "the dashboard's mirror call succeeds with nothing to mirror");
  const diag = readCode("apps/edge/api/diag.ts");
  assert.ok(diag.includes('out.probe = { skipped: "store retired; memory is Postgres" };'), "diag says it plainly instead of probing");
  assert.ok(diag.includes('memory: process.env.PG_READS === "on" ? "postgres" : storeBackend() === "off" ? "none" : "blob",'), "memory reads none when both are off");
  const st = readCode("apps/edge/lib/store.ts");
  assert.ok(st.includes('const STORE_OFF = process.env.BLOB_SHADOW === "off";'));
  assert.ok(st.includes("if (STORE_OFF) return unreadable();"), "a read under the flag is unknown, not blank");
  assert.ok(readRaw("apps/edge/.env.example").includes("BLOB_SHADOW="), "the flag is documented beside the other levers");
  assert.ok(readRaw("README.md").includes("BLOB_SHADOW=off"), "and in the runbook");
});

test("the queue's kinds: each one handled, each one scheduled somewhere, and the CHECK agrees", () => {
  assert.deepEqual([...JOB_KINDS], ["outbound_send", "snooze_wake", "pause_expire", "broadcast_send", "blob_thread_erase"]);
  const handlers = readCode("packages/jobs/src/handlers.ts");
  for (const k of JOB_KINDS) assert.ok(new RegExp(`^\\s*${k}: \\w+,`, "m").test(handlers), `${k} has a handler in the dispatch map`);
  for (const dead of ["veto_fire", "media_fetch", "rollup_daily", "report_weekly"]) assert.ok(!handlers.includes(`${dead}:`), `${dead} is not handled and not declared`);
  // Something schedules each kind: a `schedule(...)` / `scheduleJob(...)` /
  // `ctx.schedule(...)` call, or the draft queue's row, naming it.
  const src = sourceTree(["apps/edge", "apps/dashboard/app", "apps/dashboard/src", "packages/jobs/src"]);
  for (const k of JOB_KINDS) {
    const named = new RegExp(`(schedule(?:Job)?\\([^;]*"${k}"|kind: "${k}")`, "s");
    assert.ok(named.test(src), `${k} is scheduled by something`);
  }
  const mig = readCode("supabase/migrations/00058_job_kinds_truth.sql");
  assert.ok(mig.includes("check (kind in ('outbound_send', 'snooze_wake', 'pause_expire', 'broadcast_send', 'blob_thread_erase'))"));
});
