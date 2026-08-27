/**
 * The blueprint's enum-vs-CHECK diff test: every closed set in the SQL
 * migrations must match its contracts enum — three parallel copies of these
 * sets exist (contracts, SQL, repo params), and drift is when, not if.
 * Run: node --test tooling/tests
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import {
  TENANT_STATUSES, MEMBERSHIP_ROLES, CHANNEL_KINDS, CONVERSATION_STATES,
  MESSAGE_CHANNELS, MESSAGE_DIRECTIONS, MESSAGE_SENDERS, MESSAGE_TYPES,
  MESSAGE_STATUSES, CONSENT_STATES, JOB_KINDS, JOB_STATES,
} from "@chanlytics/contracts";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "supabase", "migrations");
const sql = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(join(migrationsDir, f), "utf-8"))
  .join("\n");

/** Latest `column check (column in (...))` set in the migrations. */
function sqlSet(column) {
  const re = new RegExp(`check \\(${column} in \\(([^)]+)\\)\\)`, "g");
  let last = null;
  for (const m of sql.matchAll(re)) last = m[1];
  assert.ok(last, `no CHECK found for column "${column}"`);
  return last.split(",").map((s) => s.trim().replace(/^'|'$/g, "")).sort();
}

test("job kinds match jobs.kind", () => {
  // jobs.kind is the LAST `kind in (...)` in migration order
  const all = [...sql.matchAll(/check \(kind in \(([^)]+)\)\)/g)].map((m) =>
    m[1].split(",").map((s) => s.trim().replace(/^'|'$/g, "")).sort(),
  );
  assert.ok(all.length >= 2, "expected channel-kind and job-kind CHECKs");
  const jobs = all.find((set) => set.includes("media_fetch"));
  const channels = all.find((set) => set.includes("whatsapp") && set.includes("voice"));
  assert.deepEqual(jobs, [...JOB_KINDS].sort());
  assert.deepEqual(channels, [...CHANNEL_KINDS].sort());
});

test("message enums match messages table CHECKs", () => {
  assert.deepEqual(sqlSet("direction"), [...MESSAGE_DIRECTIONS].sort());
  assert.deepEqual(sqlSet("sender"), [...MESSAGE_SENDERS].sort());
  assert.deepEqual(sqlSet("type"), [...MESSAGE_TYPES].sort());
  assert.deepEqual(sqlSet("channel"), [...MESSAGE_CHANNELS].sort());
});

test("status sets match (messages + jobs + tenants + conversations + consent)", () => {
  const statusSets = [...sql.matchAll(/check \(status in \(([^)]+)\)\)/g)].map((m) =>
    m[1].split(",").map((s) => s.trim().replace(/^'|'$/g, "")).sort(),
  );
  const msg = statusSets.find((s) => s.includes("delivered"));
  const tenant = statusSets.find((s) => s.includes("test"));
  assert.deepEqual(msg, [...MESSAGE_STATUSES].sort());
  assert.deepEqual(tenant, [...TENANT_STATUSES].sort());
  const stateSets = [...sql.matchAll(/check \(state in \(([^)]+)\)\)/g)].map((m) =>
    m[1].split(",").map((s) => s.trim().replace(/^'|'$/g, "")).sort(),
  );
  assert.deepEqual(stateSets.find((s) => s.includes("needs_human")), [...CONVERSATION_STATES].sort());
  assert.deepEqual(stateSets.find((s) => s.includes("scheduled")), [...JOB_STATES].sort());
  assert.deepEqual(sqlSet("consent"), [...CONSENT_STATES].sort());
  assert.deepEqual(sqlSet("role"), [...MEMBERSHIP_ROLES].sort());
});
