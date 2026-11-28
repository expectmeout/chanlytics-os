/**
 * Deleting a workspace, on the replayed stack: the script itself, run as a person runs it, against PostgREST and
 * Postgres (tooling/scripts/ops/delete-tenant.mjs).
 *
 * The suites beside this one run it over a database in memory, which joins nothing and knows no foreign key. What only
 * the real one can say: that every table the script names can be read and counted through PostgREST by its key, a key
 * of two columns and an id with a comma in it included; that Stop everything's door takes the script's call; that the
 * ledger's guard lets a queued job be withdrawn; that a history is deleted by month and the growing tables by key
 * without a key anywhere refusing; and that the workspace's own delete then finds nothing in its way.
 *
 * It makes its own workspace and deletes that one. Skips without a local database.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { ROOT } from "../../../_source.mjs";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes a workspace and deletes it"
      : false;

const SCRIPT = path.join(ROOT, "tooling/scripts/ops/delete-tenant.mjs");
const RUN = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
/** More rows than the script deletes in one statement (5,000), so each table here goes in slices. */
const MANY = 5500;
/** The rows one insert carries. */
const BATCH = 1000;
/** The script's whole run: two reads of every table, a page at a time, then its deletes. */
const RUN_MS = 240_000;

const db = skip ? null : createClient(URL_, KEY, { auth: { persistSession: false } });
const made = [];
const written = [];

const ok = (r, what) => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};
async function insertAll(table, rows) {
  for (let i = 0; i < rows.length; i += BATCH) ok(await db.from(table).insert(rows.slice(i, i + BATCH)), table);
}
async function workspace(label) {
  const [tenant] = ok(
    await db
      .from("tenants")
      .insert({ slug: `leaves-${label}-${RUN}`, name: `Leaves ${label} ${RUN}` })
      .select("id, name"),
    "tenants",
  );
  made.push(tenant.id);
  return tenant;
}
const countOf = async (table, tenantId) =>
  (await db.from(table).select("*", { count: "exact", head: true }).eq("tenant_id", tenantId)).count;

after(async () => {
  if (skip) return;
  for (const id of made) {
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
  for (const file of written) fs.rmSync(file, { force: true });
});

test(
  "the script deletes a workspace with a long history whole: read by key, stopped, sliced, and nobody else's touched",
  { skip, timeout: RUN_MS + 60_000 },
  async () => {
    const leaving = await workspace("goes");
    const staying = await workspace("stays");
    // A history over three months, of a kind nothing subscribes to: read by month, deleted by month.
    const month = (m) => new Date(Date.UTC(2026, m, 5, 12)).toISOString();
    await insertAll(
      "events",
      Array.from({ length: MANY }, (_, i) => ({
        tenant_id: leaving.id,
        kind: "leaves.history",
        created_at: month(2 + (i % 3)),
      })),
    );
    ok(await db.from("events").insert({ tenant_id: staying.id, kind: "leaves.history" }), "their event");
    // Queued jobs, due far ahead: withdrawn by the script, then emptied by key before the workspace's delete.
    await insertAll(
      "jobs",
      Array.from({ length: MANY }, (_, i) => ({
        tenant_id: leaving.id,
        kind: "file_shelve",
        due_at: "2099-01-01T00:00:00Z",
        payload: { file_id: `f-${i}` },
        dedupe_key: `leaves:${RUN}:${i}`,
      })),
    );
    // The intake ledger, read and deleted by two columns; some ids hold what a filter would read as its own.
    const odd = ["a,b", "a b", "(a)", 'a"b', "a.b:c=d"];
    const delivery = (tenantId, i) => ({
      provider: i % 2 ? "meta" : "twilio",
      provider_event_id: `${RUN}-${String(i).padStart(5, "0")}${i < odd.length ? `-${odd[i]}` : ""}`,
      door: "/api/inbound",
      url: "https://edge.example.com/api/inbound",
      tenant_id: tenantId,
      headers: {},
      body: "{}",
    });
    await insertAll(
      "provider_events",
      Array.from({ length: MANY }, (_, i) => delivery(leaving.id, i)),
    );
    ok(await db.from("provider_events").insert(delivery(staying.id, MANY + 1)), "their delivery");
    const before = {
      events: await countOf("events", leaving.id),
      jobs: await countOf("jobs", leaving.id),
      provider_events: await countOf("provider_events", leaving.id),
    };
    assert.deepEqual([before.jobs, before.provider_events], [MANY, MANY]);

    const ran = spawnSync(
      process.execPath,
      [SCRIPT, "--tenant", leaving.id, "--expect-name", leaving.name, "--apply", "--wait-minutes", "1"],
      {
        cwd: ROOT,
        encoding: "utf8",
        timeout: RUN_MS,
        env: { ...process.env, SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: KEY },
      },
    );
    const said = `${ran.stdout}\n${ran.stderr}`;
    const backup = /the backup is at (.+\.jsonl)/.exec(ran.stdout)?.[1]?.trim();
    if (backup) written.push(backup, backup.replace(/\.jsonl$/, ".clean-up.jsonl"));
    assert.equal(ran.status, 0, said);

    // The backup the delete went by: every row, the stop's own event with the history.
    const lines = fs
      .readFileSync(backup, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const backedUp = (table) => lines.filter((line) => line.table === table).map((line) => line.row);
    assert.equal(backedUp("jobs").length, MANY, "every job, past a page");
    assert.ok(
      backedUp("jobs").every((job) => job.state === "canceled"),
      "each withdrawn before the read the delete went by",
    );
    const deliveries = backedUp("provider_events").map((row) => `${row.provider}/${row.provider_event_id}`);
    assert.deepEqual(
      [deliveries.length, new Set(deliveries).size],
      [MANY, MANY],
      "every delivery once, by two columns",
    );
    const history = backedUp("events");
    assert.ok(history.length >= before.events + 1, "the history, and what the stop wrote");
    assert.ok(
      history.some((event) => event.kind === "workspace.sending_stopped"),
      "Stop everything was set through its door",
    );
    assert.equal(new Set(history.map((event) => event.id)).size, history.length, "each event once");
    for (const table of ["jobs", "provider_events"])
      assert.match(ran.stdout, new RegExp(`emptied ${table} first, ${MANY} rows a slice at a time`));

    // The workspace is gone with everything of its own, and the one beside it has all of its.
    assert.deepEqual(ok(await db.from("tenants").select("id").eq("id", leaving.id), "tenants"), []);
    for (const table of ["events", "jobs", "provider_events"]) assert.equal(await countOf(table, leaving.id), 0, table);
    assert.ok((await countOf("events", staying.id)) >= 1, "another workspace's history stands");
    assert.equal(await countOf("provider_events", staying.id), 1, "and its deliveries");
    const [stays] = ok(await db.from("tenants").select("sending_stopped_at").eq("id", staying.id), "tenants");
    assert.equal(stays.sending_stopped_at, null, "and nothing of it was stopped");
  },
);
