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
  ESCALATION_REASONS, ESCALATION_STATES, DECISION_VERBS, DECISION_SUBJECTS,
  ACTOR_TYPES, TEMPLATE_STATUSES, POLICY_CLASSES, POLICY_MODES,
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
  // The LAST set, not the first — a later migration supersedes an earlier one,
  // which is what sqlSet() does everywhere else in this file. find() was
  // indistinguishable from "last" only while jobs.kind had never been widened
  // since 00002. The moment it was, this compared the ORIGINAL constraint to
  // the current enum and failed for a reason that had nothing to do with the
  // change under test — exactly the trap already fixed below for
  // decisions.subject_type.
  const jobs = all.filter((set) => set.includes("blob_thread_erase")).at(-1);
  const channels = all.find((set) => set.includes("whatsapp") && set.includes("voice"));
  assert.deepEqual(jobs, [...JOB_KINDS].sort());
  assert.deepEqual(channels, [...CHANNEL_KINDS].sort());
});

/** All CHECK sets for a column name, content-addressed (columns are shared
 *  across tables — e.g. `channel` on messages vs templates). */
function sqlSets(column) {
  const re = new RegExp(`check \\(${column} in \\(([^)]+)\\)\\)`, "g");
  return [...sql.matchAll(re)].map((m) =>
    m[1].split(",").map((x) => x.trim().replace(/^'|'$/g, "")).sort(),
  );
}
const bySignature = (sets, mustHave, mustNotHave = []) =>
  sets.find((s) => mustHave.every((v) => s.includes(v)) && mustNotHave.every((v) => !s.includes(v)));

test("message enums match messages table CHECKs", () => {
  assert.deepEqual(sqlSet("direction"), [...MESSAGE_DIRECTIONS].sort());
  assert.deepEqual(sqlSet("sender"), [...MESSAGE_SENDERS].sort());
  const typeSets = sqlSets("type");
  assert.deepEqual(bySignature(typeSets, ["call_summary"]), [...MESSAGE_TYPES].sort());
  const channelSets = sqlSets("channel");
  assert.deepEqual(bySignature(channelSets, ["system"]), [...MESSAGE_CHANNELS].sort(), "messages.channel");
  assert.deepEqual(bySignature(channelSets, ["voice"], ["system"]), [...CHANNEL_KINDS].sort(), "templates/channels.channel");
});

test("slice-2 enums match inbox table CHECKs", () => {
  assert.deepEqual(sqlSet("reason"), [...ESCALATION_REASONS].sort());
  assert.deepEqual(sqlSet("verb"), [...DECISION_VERBS].sort());
  // subject_type exists on decisions AND policies (0012) — content-addressed
  const subjSets = sqlSets("subject_type");
  assert.deepEqual(bySignature(subjSets, ["segment"]), ["contact", "segment"], "policies.subject_type");
  // The LAST non-segment set, not the first. Every other assertion here reads
  // the latest migration's CHECK, because a later one supersedes an earlier —
  // that is what sqlSet() does. This line used find(), which was
  // indistinguishable from "last" only while decisions.subject_type had never
  // been widened. The moment it was, this compared the ORIGINAL constraint to
  // the current enum and failed for a reason that had nothing to do with the
  // change under test.
  const decisionSubjects = subjSets.filter((s) => !s.includes("segment")).at(-1);
  assert.deepEqual(decisionSubjects, [...DECISION_SUBJECTS].sort(), "decisions.subject_type");
  assert.deepEqual(sqlSet("actor_type"), [...ACTOR_TYPES].sort());
  assert.deepEqual(sqlSet("meta_status"), [...TEMPLATE_STATUSES].sort());
  const stateSets = sqlSets("state");
  assert.deepEqual(bySignature(stateSets, ["resolved"]), [...ESCALATION_STATES].sort());
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
  // The LAST set containing 'fired', not the first containing 'scheduled' —
  // the same trap already fixed for jobs.kind above, and it sprang the moment
  // jobs.state was widened with 'done' in 00080: find() compared the ORIGINAL
  // 00002 constraint to the current enum. Content-addressed on 'fired' because
  // broadcasts.state also has 'scheduled'.
  assert.deepEqual(stateSets.filter((s) => s.includes("fired")).at(-1), [...JOB_STATES].sort());
  assert.deepEqual(sqlSet("consent"), [...CONSENT_STATES].sort());
  // role exists on memberships AND invitations (0012) — content-addressed
  const roleSets = sqlSets("role");
  // 0001 wrote owner|staff (historical, superseded by 0012) — address the
  // CURRENT set by content, not position.
  assert.deepEqual(bySignature(roleSets, ["owner", "operator"]), [...MEMBERSHIP_ROLES].sort(), "memberships.role");
  assert.deepEqual(bySignature(roleSets, ["operator"], ["owner"]), ["operator", "viewer"], "invitations.role");
});

test("control-plane enums match policies CHECKs (0012)", () => {
  assert.deepEqual(sqlSet("class"), [...POLICY_CLASSES].sort());
  // Content-addressed: billing_accounts.mode (stripe · direct) shares the column name since 00073.
  assert.deepEqual(sqlSets("mode").find((s) => s.includes("veto")), [...POLICY_MODES].sort());
});
