/**
 * A list that stopped at PostgREST's 1,000-row cap reaches a person (decision 0149, step 7): either app notes the read in
 * the pager's memory as it happens (packages/db ops noteAnswerAtCap, told by db's observer `atCap`), Health reads it there
 * as what paged us, and the edge's health sweep pages each one noted and untold, once per the pager's window
 * (apps/edge/lib/ops/cap-watch.ts). The note and the sweep run here over a database in memory; the hook that tells the app
 * is row-cap.test.mjs's.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { AT_CAP_PAGE, noteAnswerAtCap } from "@chanlytics/db/ops";
import { fakeDb } from "../../_fake-db.mjs";
import { at } from "../../_cron-doors-world.mjs";

const { watchRowCap } = await import(at("apps/edge/lib/ops/cap-watch.ts"));

const NOW = Date.parse("2026-11-25T12:00:00Z");
const HOUR = 3_600_000;
const iso = (ms) => new Date(ms).toISOString();

test("a read at the cap is noted in the pager's memory under its table, and counted each time it is noted", async () => {
  const tables = { operator_pages: [] };
  const db = fakeDb(tables);
  assert.equal((await noteAnswerAtCap(db, "contacts", iso(NOW))).error, null);
  assert.equal((await noteAnswerAtCap(db, "contacts", iso(NOW + HOUR))).error, null);
  assert.equal((await noteAnswerAtCap(db, "sequence_sends", iso(NOW))).error, null);
  const byKey = Object.fromEntries(
    tables.operator_pages.map((r) => [r.key, [r.count, r.last_at, r.alerted_at ?? null]]),
  );
  assert.deepEqual(byKey, {
    [`${AT_CAP_PAGE}:contacts`]: [2, iso(NOW + HOUR), null],
    [`${AT_CAP_PAGE}:sequence_sends`]: [1, iso(NOW), null],
  });
});

test("the sweep pages each table noted inside the window and told of by no page, and none other", async () => {
  const row = (key, lastAgoMs, alertedAgoMs = null) => ({
    key,
    first_at: iso(NOW - 2 * HOUR),
    last_at: iso(NOW - lastAgoMs),
    count: 3,
    alerted_at: alertedAgoMs === null ? null : iso(NOW - alertedAgoMs),
  });
  const db = fakeDb({
    operator_pages: [
      row(`${AT_CAP_PAGE}:contacts`, HOUR), // noted an hour ago, never paged
      row(`${AT_CAP_PAGE}:leads`, HOUR, HOUR / 2), // paged after it was noted: told
      row(`${AT_CAP_PAGE}:notes`, 7 * HOUR), // past the window: history, not news
      row("jobs_backlog", HOUR), // another condition: its own sweep's
    ],
  });
  const paged = [];
  const page = async (ports, key, subject, body) => {
    paged.push({ key, subject, body, now: ports.now() });
    return "sent";
  };
  assert.equal(await watchRowCap(db, { now: NOW, page }), 1);
  assert.equal(paged.length, 1);
  assert.equal(paged[0].key, `${AT_CAP_PAGE}:contacts`);
  assert.equal(paged[0].subject, "A list stopped at 1,000 rows: contacts");
  assert.match(paged[0].body, /came back holding exactly 1,000 rows/);
  assert.equal(paged[0].now, NOW);
});

test("a memory the sweep cannot read pages nothing and says so", async () => {
  const db = fakeDb({ operator_pages: [] }, { "operator_pages.select": { message: "the database is away" } });
  const paged = [];
  assert.equal(await watchRowCap(db, { now: NOW, page: async (_p, key) => paged.push(key) }), 0);
  assert.deepEqual(paged, []);
});
