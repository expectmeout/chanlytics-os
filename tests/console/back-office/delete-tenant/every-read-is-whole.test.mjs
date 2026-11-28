/**
 * Deleting a workspace, its backup: every row, however many (tooling/scripts/ops/delete-tenant.mjs).
 *
 * The backup read each table in one call. PostgREST answers one call with at most 1,000 rows and says nothing when it
 * stops there, so a workspace with years of history got a backup that ended at its thousandth message and printed a
 * total. These run the script over a database that answers as PostgREST does, with more rows than one answer holds.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT } from "../../../_source.mjs";
import { NAME, OTHER, T, deleteTenant, harbor } from "../_delete-tenant-world.mjs";

const tables = await import(pathToFileURL(path.join(ROOT, "tooling/scripts/ops/delete-tenant/tables.mjs")).href);
const WHO = ["--tenant", T, "--expect-name", NAME];
/** An apply that waits on the ledger for a moment at most: these workspaces have nothing running. */
const APPLY = [...WHO, "--apply", "--wait-minutes", "0.01"];

const pad = (n) => String(n).padStart(5, "0");
/** `count` rows of a table for the workspace, each from `row(i)`. */
const rowsOf = (count, row) => Array.from({ length: count }, (_, i) => ({ tenant_id: T, ...row(i) }));
/** The rows of one table in a backup. */
const backedUp = (run, table) => run.backup.filter((line) => line.table === table).map((line) => line.row);

test("a table past a thousand rows is backed up whole, and the total it prints is what it read", () => {
  const messages = [
    ...rowsOf(2300, (i) => ({ id: `m-${pad(i)}`, body: "hello" })),
    { id: "m-theirs", tenant_id: OTHER, body: "not this workspace's" },
  ];
  const dry = deleteTenant({ tables: harbor({ messages }) }, ...WHO);
  assert.equal(dry.code, 0, dry.said);
  const ids = backedUp(dry, "messages").map((row) => row.id);
  assert.equal(ids.length, 2300, "every message, not the first thousand");
  assert.equal(new Set(ids).size, 2300, "each once");
  assert.ok(!ids.includes("m-theirs"), "and nobody else's");
  assert.match(dry.out, /messages\s+2300\b/, "the count it prints is the count it read");
  assert.match(dry.out, /backup: 2302 rows across 3 tables/);
});

test("a table read by two columns is read past a page of rows that share the first", () => {
  // 1,500 members of one list and 900 of another: a page ends in the middle of the first list.
  const segment_members = [
    ...rowsOf(1500, (i) => ({ segment_id: "s-1", contact_id: `c-${pad(i)}` })),
    ...rowsOf(900, (i) => ({ segment_id: "s-2", contact_id: `c-${pad(i)}` })),
  ];
  const dry = deleteTenant({ tables: harbor({ segment_members }) }, ...WHO);
  assert.equal(dry.code, 0, dry.said);
  const pairs = backedUp(dry, "segment_members").map((row) => `${row.segment_id}/${row.contact_id}`);
  assert.deepEqual(
    [pairs.length, new Set(pairs).size],
    [2400, 2400],
    "every member of both lists, each once: the page after one that ended inside a list starts inside it",
  );
});

test("the history is read month by month, with what is dated outside the workspace's own life", () => {
  const at = (month, i) => `2026-${String(month).padStart(2, "0")}-${String(1 + (i % 27)).padStart(2, "0")}T12:00:00Z`;
  const events = [
    // 1,200 in each of three months: no month fits one answer.
    ...[3, 4, 5].flatMap((month) =>
      rowsOf(1200, (i) => ({ id: `e-${month}-${pad(i)}`, kind: "message.received", created_at: at(month, i) })),
    ),
    // Brought in with a date before the workspace began (2 Jan 2026), and one a clock ahead wrote.
    { id: "e-before", tenant_id: T, kind: "contact.added", created_at: "2019-06-01T00:00:00Z" },
    { id: "e-ahead", tenant_id: T, kind: "contact.added", created_at: "2099-01-01T00:00:00Z" },
    { id: "e-theirs", tenant_id: OTHER, kind: "contact.added", created_at: "2026-03-04T10:00:00Z" },
  ];
  const dry = deleteTenant({ tables: harbor({ events }) }, ...WHO);
  assert.equal(dry.code, 0, dry.said);
  const ids = backedUp(dry, "events").map((row) => row.id);
  assert.deepEqual([ids.length, new Set(ids).size], [3602, 3602]);
  assert.ok(ids.includes("e-before") && ids.includes("e-ahead"), "a row dated outside its life is read too");
  assert.ok(!ids.includes("e-theirs"));
});

test("a read that answers fewer rows than the database counts refuses, on a dry run too", () => {
  const contacts = rowsOf(40, (i) => ({ id: `c-${pad(i)}`, display_name: "Ana" }));
  // The database counts forty and hands back thirty-seven: whatever the cause, the backup would have a hole.
  const short = deleteTenant({ tables: harbor({ contacts }), shortBy: { contacts: 3 } }, ...WHO);
  assert.equal(short.code, 1, "a backup with a hole in it reads as complete");
  assert.match(short.err, /REFUSING: the read of contacts stopped short: 40 rows counted before the read, 37 read/);
  assert.equal(short.backup, null, "and no file is left that could be taken for one");
  const applied = deleteTenant({ tables: harbor({ contacts }), shortBy: { contacts: 3 } }, ...APPLY);
  assert.equal(applied.code, 1);
  assert.deepEqual(
    applied.log.filter((l) => l.endsWith("delete")),
    [],
    "and nothing is deleted",
  );
});

test("a dry run of a workspace still at work says which tables moved under it, and finishes", () => {
  const arrivals = [{ table: "contacts", every: true, row: { id: "a-new", tenant_id: T, display_name: "Late" } }];
  const dry = deleteTenant({ tables: harbor(), arrivals }, ...WHO);
  assert.equal(dry.code, 0, "a row that arrives during a look at a working workspace is no hole");
  assert.match(dry.out, /contacts\s+1\b/);
  assert.match(dry.out, /written to while it was read: contacts/, "said, so nobody takes the look for the backup");
});

test("the delete's own snapshot is exact: a row that arrives during it is read again, into the backup", () => {
  // The apply reads the workspace twice: the look, then the snapshot it deletes by. A person is added while the
  // snapshot reads contacts (the table's third read of rows), with a key behind the page already read.
  const arrivals = [{ table: "contacts", read: 3, row: { id: "a-late", tenant_id: T, display_name: "Late" } }];
  const applied = deleteTenant({ tables: harbor(), arrivals }, ...APPLY);
  assert.equal(applied.code, 0, applied.said);
  assert.deepEqual(
    backedUp(applied, "contacts")
      .map((row) => row.id)
      .sort(),
    ["a-late", "c-1"],
    "the table is read again until its rows and its counts agree, so the row deleted is a row backed up",
  );
});

test("a table that will not hold still stops the delete before it starts", () => {
  const arrivals = [{ table: "contacts", every: true, row: { id: "a-new", tenant_id: T, display_name: "Late" } }];
  const applied = deleteTenant({ tables: harbor(), arrivals }, ...APPLY);
  assert.equal(applied.code, 1);
  assert.match(applied.err, /REFUSING: contacts is still being written to/);
  assert.deepEqual(
    applied.log.filter((l) => l.endsWith("delete")),
    [],
  );
  assert.ok(applied.tables.tenants.some((t) => t.id === T));
});

test("each table is read by its own key, and none by more than two columns", () => {
  // The generated keys are the database's (tooling/scripts/gen/unique-keys.mjs, held to the migrations by CI).
  const generated = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/_unique-keys.generated.json"), "utf8"));
  const primary = Object.fromEntries(
    generated.keys.filter((k) => k.primary).map((k) => [k.table, k.keys.map((part) => part.column)]),
  );
  for (const table of tables.TABLES) {
    assert.deepEqual(
      tables.keyOf(table),
      (primary[table] ?? []).filter((column) => column !== "tenant_id"),
      `${table}: its primary key, the workspace's id left out`,
    );
    assert.ok(tables.keyOf(table).length <= 2, `${table}: a key of three columns needs a third comparison`);
  }
});

/* ------------------------------------------------------------------------- what is removed outside the database -- */

test("1,001 videos are 1,001 removals: at Stream, at Anthropic and on the shelf", () => {
  const file = (i) => `0b0e6c1e-6f0a-4b6e-9d3e-${String(i).padStart(12, "0")}`;
  const world = {
    tables: harbor({
      files: rowsOf(1001, (i) => ({
        id: `f-${pad(i)}`,
        media_ref: `stream-${pad(i)}`,
        claude_copy: { id: `file_${pad(i)}` },
      })),
      file_archive_parts: rowsOf(1001, (i) => ({ id: `p-${pad(i)}`, shelf_key: `${T}/${file(i)}/video` })),
    }),
    env: {
      ANTHROPIC_API_KEY: "sk-test-only",
      CLOUDFLARE_ACCOUNT_ID: "acct-test",
      CLOUDFLARE_STREAM_API_TOKEN: "token-test",
      FOOTAGE_RELAY_URL: "https://relay.example",
      FOOTAGE_TICKET_KEY: "ticket-key-for-this-file",
    },
  };
  const dry = deleteTenant(world, ...WHO);
  assert.match(dry.out, /videos at Stream\s+1001\b/, "the dry run counts every one");
  assert.match(dry.out, /videos on the shelf\s+1001\b/);
  const applied = deleteTenant(world, ...APPLY);
  assert.equal(applied.code, 0, applied.said);
  const removed = (host) => new Set(applied.fetched.filter((f) => f.host === host).map((f) => f.path)).size;
  assert.deepEqual(
    [removed("api.cloudflare.com"), removed("api.anthropic.com"), removed("relay.example")],
    [1001, 1001, 1001],
    "the lists of what to remove come from whole reads: the thousand-and-first is not left billed",
  );
});
