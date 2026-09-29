/**
 * The day's reach-out numbers at 6 PM (Reach out Part 6, H12), the edge's teller run over a database in memory: each
 * workspace the read names gets one line in the bell, of its own kind, about its own day, with the numbers in words and
 * the door to Playbooks, and nothing else is sent; a second tick finds it told; a read that fails tells nobody and says
 * so; a zone with more workspaces than a page is read a page at a time; and the sweep stops at its deadline.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../_fake-db.mjs";

const { tellReachOutDays } = await import("../../../../apps/edge/lib/reach-out/day-numbers.ts");

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const NOW = new Date("2026-09-28T23:05:00.000Z");
const nums = (over = {}) => ({ written: 0, wrote_back: 0, interested: 0, said_no: 0, bounced: 0, held: 0, ...over });

/** A log that keeps its lines. */
const hear = () => {
  const lines = [];
  const at =
    (level) =>
    (event, fields = {}) =>
      lines.push({ level, event, ...fields });
  return { lines, log: { info: at("info"), warn: at("warn"), error: at("error"), child: () => undefined } };
};

/** The read as 00241 answers it: the workspaces due, less those with a line about their day already. */
const world = (due) => {
  const tables = { notifications: [] };
  const db = fakeDb(
    tables,
    {},
    {
      reach_out_day_due: ({ p_limit }) =>
        due
          .filter((d) => !tables.notifications.some((n) => n.tenant_id === d.tenant_id && n.subject_id === d.day))
          .slice(0, p_limit),
    },
  );
  return { tables, db };
};

test("each workspace whose 6 PM it is gets one line in the bell, of its own kind and about its own day", async () => {
  const w = world([
    {
      tenant_id: A,
      day: "2026-09-28",
      numbers: nums({ written: 18, wrote_back: 2, interested: 1, said_no: 1, held: 3 }),
    },
    { tenant_id: B, day: "2026-09-28", numbers: nums({ bounced: 1 }) },
  ]);
  const { lines, log } = hear();
  assert.equal(await tellReachOutDays(w.db, NOW, log, Date.now() + 10_000), 2);
  assert.deepEqual(
    w.tables.notifications.map((n) => [n.tenant_id, n.kind, n.title, n.body, n.route, n.subject_type, n.subject_id]),
    [
      [
        A,
        "reach_out_day",
        "Today's reach-outs",
        "18 written · 2 wrote back, 1 interested · 1 said no · 3 wait for your say.",
        "outbound",
        "reach_out_day",
        "2026-09-28",
      ],
      [B, "reach_out_day", "Today's reach-outs", "1 bounced.", "outbound", "reach_out_day", "2026-09-28"],
    ],
  );
  assert.deepEqual(
    lines.map((l) => [l.event, l.tenant_id]),
    [
      ["reach_out_day_told", A],
      ["reach_out_day_told", B],
    ],
  );
  // The next tick in the same hour finds both told.
  assert.equal(await tellReachOutDays(w.db, NOW, hear().log, Date.now() + 10_000), 0);
  assert.equal(w.tables.notifications.length, 2);
});

test("a read that fails tells nobody, and says so", async () => {
  const db = fakeDb(
    { notifications: [] },
    {},
    {
      reach_out_day_due: () => {
        throw Object.assign(new Error("function reach_out_day_due does not exist"), { code: "42883" });
      },
    },
  );
  const { lines, log } = hear();
  assert.equal(await tellReachOutDays(db, NOW, log, Date.now() + 10_000), 0);
  assert.deepEqual(
    lines.map((l) => [l.level, l.event]),
    [["warn", "reach_out_day_failed"]],
  );
});

test("a zone with more workspaces than a page is read a page at a time, and the deadline stops it", async () => {
  const many = Array.from({ length: 120 }, (_, i) => ({
    tenant_id: `cccccccc-cccc-4ccc-8ccc-${String(i).padStart(12, "0")}`,
    day: "2026-09-28",
    numbers: nums({ written: 1 }),
  }));
  const w = world(many);
  assert.equal(await tellReachOutDays(w.db, NOW, hear().log, Date.now() + 10_000), 120);
  assert.equal(w.db.seen.filter((s) => s.rpc === "reach_out_day_due").length, 3, "50, 50, then the last 20");
  const late = world(many);
  assert.equal(await tellReachOutDays(late.db, NOW, hear().log, Date.now() - 1), 0, "past its deadline, nothing");
});
