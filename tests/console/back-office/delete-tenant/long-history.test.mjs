/**
 * Deleting a workspace with a long history: no statement takes all of it (tooling/scripts/ops/delete-tenant.mjs,
 * delete-tenant/slices.mjs).
 *
 * The service role's statements end at 30 seconds (00283). The history's delete and the workspace's own were one
 * statement each, so a workspace with years behind it timed out and was finished by hand from psql. The database here
 * ends a delete that would take more than a set number of rows, the workspace's with what its cascade reaches, as
 * Postgres ends one past its time: with code 57014, and nothing taken.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT } from "../../../_source.mjs";
import { NAME, OTHER, STOPPED, T, deleteTenant, harbor } from "../_delete-tenant-world.mjs";

const { EMPTIED_FIRST, TABLES } = await import(
  pathToFileURL(path.join(ROOT, "tooling/scripts/ops/delete-tenant/tables.mjs")).href
);
const APPLY = ["--tenant", T, "--expect-name", NAME, "--apply", "--wait-minutes", "0.005"];

const pad = (n) => String(n).padStart(5, "0");
/** `count` events of the workspace in one month of 2026, spread evenly over its first 27 days. */
const eventsIn = (month, count) =>
  Array.from({ length: count }, (_, i) => ({
    id: `e-${month}-${pad(i)}`,
    tenant_id: T,
    kind: "message.received",
    created_at: new Date(Date.UTC(2026, month - 1, 1) + Math.floor((i * 27 * 86_400_000) / count)).toISOString(),
  }));
const theirs = { id: "e-theirs", tenant_id: OTHER, kind: "message.received", created_at: "2026-03-04T10:00:00Z" };
const messagesOf = (count) =>
  Array.from({ length: count }, (_, i) => ({ id: `m-${pad(i)}`, tenant_id: T, body: "hello" }));
const count = (run, line) => run.log.filter((l) => l === line).length;

test("a history past 5,000 rows is deleted a month at a time, where one statement would end at its time", () => {
  const events = [...eventsIn(3, 2000), ...eventsIn(4, 2000), ...eventsIn(5, 2000), theirs];
  // No delete may take more than 2,500 rows: the whole history is 6,000, a month is 2,000.
  const applied = deleteTenant({ tables: harbor({ events }), timeoutPast: 2500 }, ...APPLY);
  assert.equal(applied.code, 0, applied.said);
  assert.deepEqual(
    applied.tables.events.map((e) => e.id),
    ["e-theirs"],
    "every row of the workspace's history is gone, and nobody else's",
  );
  assert.equal(
    count(applied, "events delete"),
    5,
    "a statement for each month that held rows (the three, and this one, which holds the stop's own event), and one for what is left",
  );
  assert.ok(!applied.tables.tenants.some((t) => t.id === T));
});

test("a month that is still too much for one statement is cut in two, and those again", () => {
  const events = [...eventsIn(3, 4500), ...eventsIn(4, 1500), theirs];
  const applied = deleteTenant({ tables: harbor({ events }), timeoutPast: 2500 }, ...APPLY);
  assert.equal(applied.code, 0, applied.said);
  assert.deepEqual(
    applied.tables.events.map((e) => e.id),
    ["e-theirs"],
  );
  assert.ok(count(applied, "events delete") > 4, "March is asked for whole, then in halves, until each part fits");
});

test("the tables that grow with history are emptied by key before the workspace's own delete", () => {
  // 6,000 messages: the workspace's delete would cascade through all of them in one statement. No delete may take
  // more than 5,500 rows; five pages of the backup's read are 5,000.
  const applied = deleteTenant({ tables: harbor({ messages: messagesOf(6000) }), timeoutPast: 5500 }, ...APPLY);
  assert.equal(applied.code, 0, applied.said);
  assert.deepEqual(
    applied.log,
    [...STOPPED, "events delete", "messages delete", "messages delete", "tenants delete"],
    "five pages, then the sixth, then the workspace with little left to cascade through",
  );
  assert.deepEqual(applied.tables.messages, []);
  assert.match(applied.out, /emptied messages first, 6000 rows a slice at a time/);
});

test("a slice by key that is still too much is cut in two", () => {
  const applied = deleteTenant({ tables: harbor({ messages: messagesOf(6000) }), timeoutPast: 2500 }, ...APPLY);
  assert.equal(applied.code, 0, applied.said);
  assert.deepEqual(applied.tables.messages, []);
  assert.ok(count(applied, "messages delete") > 2, "five pages are too many here, so three and two, and so on down");
});

test("a short history goes as it always did: one statement for the events, one for the workspace", () => {
  const events = [...eventsIn(3, 1200), theirs];
  const applied = deleteTenant({ tables: harbor({ events, messages: messagesOf(1200) }) }, ...APPLY);
  assert.equal(applied.code, 0, applied.said);
  assert.deepEqual(applied.log, [...STOPPED, "events delete", "tenants delete"]);
});

test("a delete that fails stops the run before anything outside the database is touched, and says which backup to keep", () => {
  const world = {
    tables: harbor(),
    buckets: { media: { [`${T}/calls/a.wav`]: 1 } },
    faults: { "events.delete": { message: "permission denied for table events" } },
  };
  const failed = deleteTenant(world, ...APPLY);
  assert.equal(failed.code, 1);
  assert.match(failed.err, /events delete failed: permission denied for table events/);
  assert.match(failed.err, /Nothing outside the database was removed\. Run this again to finish, and keep .*\.jsonl/);
  assert.deepEqual(failed.buckets.media, [`${T}/calls/a.wav`]);
  assert.ok(failed.tables.tenants.some((t) => t.id === T));
});

test("each table emptied first is one the cascade deletes anyway, and no key anywhere can refuse its delete", () => {
  // The schema as the migrations build it (supabase/schema.sql, generated and held to them by CI).
  const sql = fs.readFileSync(path.join(ROOT, "supabase/schema.sql"), "utf8");
  const keys = [
    ...sql.matchAll(
      /ALTER TABLE ONLY public\.(\w+)\s+ADD CONSTRAINT \w+ FOREIGN KEY \(([^)]+)\) REFERENCES public\.(\w+)\([^)]+\)([^;]*);/g,
    ),
  ].map(([, from, columns, to, rest]) => ({
    from,
    columns,
    to,
    on: /ON DELETE (CASCADE|SET NULL)/.exec(rest)?.[1] ?? "NO ACTION",
  }));
  assert.ok(keys.length > 200, "the snapshot's keys were read");
  for (const table of EMPTIED_FIRST) {
    assert.ok(TABLES.includes(table), `${table} is one of the workspace's tables, so its rows are in the backup`);
    assert.ok(
      keys.some((k) => k.from === table && k.to === "tenants" && k.columns === "tenant_id" && k.on === "CASCADE"),
      `${table} cascades from tenants: emptying it first takes nothing the workspace's delete would have kept`,
    );
    assert.deepEqual(
      keys.filter((k) => k.to === table && k.on === "NO ACTION").map((k) => `${k.from}(${k.columns})`),
      [],
      `nothing that points at ${table} can refuse a delete of its rows`,
    );
    // A table that points at this one is visited once for each row deleted here, so it is emptied before it.
    for (const k of keys.filter((k) => k.to === table && EMPTIED_FIRST.includes(k.from)))
      assert.ok(EMPTIED_FIRST.indexOf(k.from) < EMPTIED_FIRST.indexOf(table), `${k.from} goes before ${table}`);
  }
});
