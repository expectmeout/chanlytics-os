/**
 * Sweeps that reach every tenant, run rather than read.
 *
 * THE DEFECT THIS EXISTS FOR. The calendar and playbook sweeps read every row
 * and then did serial network work inside a sixty-second function. At four
 * tenants that is instant. At four hundred it runs out of tick part way
 * through — and because the order never changed, the same early tenants were
 * served every hour and the ones past the cut-off were NEVER served at all.
 * No error, no alert: a 200 having done a fraction of the job.
 *
 * That is a property no source-scan can check. "Does this loop have a limit"
 * is readable; "does every tenant eventually get served" is only answerable by
 * running the selection over a real ordering, several ticks deep, and looking
 * at who was reached. Which is what these do.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "./_fake-db.mjs";
import { readCode, readRaw } from "./_source.mjs";
import {
  calendarDue,
  playbooksDue,
  reachOutsDue,
  markCalendarChecked,
  noteBacklog,
  CALENDAR_PER_TICK,
  PLAYBOOKS_PER_TICK,
  BACKLOG_TICKS_BEFORE_ALARM,
} from "../../../apps/edge/lib/ops/sweep-rotation.ts";

const NOW = new Date("2026-09-09T18:00:00Z");
const ago = (min) => new Date(NOW.getTime() - min * 60_000).toISOString();

/** N workspaces with a calendar feed, all read an hour ago except where said. */
const configs = (n, over = {}) =>
  Array.from({ length: n }, (_, i) => ({
    tenant_id: `t${String(i).padStart(3, "0")}`,
    config: { calendar: { ical_url: `https://cal.example/${i}.ics` } },
    calendar_checked_at: ago(90 + i),
    ...(over[i] ?? {}),
  }));

test("every tenant is reached: a hundred workspaces, forty a tick, three ticks", async () => {
  // The exact shape that was broken. Under the old code the first N were swept
  // every hour and tenants N+1..100 were never swept once, for ever.
  const rows = configs(100);
  const db = fakeDb({ tenant_config: rows });
  const served = new Set();

  for (let tick = 0; tick < 3; tick++) {
    const page = await calendarDue(db, NOW, CALENDAR_PER_TICK);
    for (const r of page.rows) {
      assert.ok(!served.has(r.tenant_id), `${r.tenant_id} served twice before everyone was served once`);
      served.add(r.tenant_id);
      await markCalendarChecked(db, r.tenant_id, NOW);
    }
  }
  assert.equal(served.size, 100, "three ticks of forty reach all one hundred");
});

test("workspaces with no calendar are not the queue: they never sort first, and they are not a backlog", async () => {
  // THE OTHER WAY THIS SWEEP STOPS REACHING EVERYONE. Every workspace gets a
  // tenant_config row at signup and most never connect a calendar. Those rows
  // have no calendar_checked_at and can never earn one — the stamp is written
  // after a successful READ, and there is nothing to read — so under NULLS
  // FIRST they sort ahead of every real feed for ever. At forty of them the
  // page is entirely feedless every hour: no calendar is read again, and
  // `remaining` never falls to zero, so the sweep also calls itself backlogged,
  // turns red and pages the platform about work that does not exist.
  const feedless = Array.from({ length: 60 }, (_, i) => ({
    tenant_id: `empty${i}`,
    config: {},
    calendar_checked_at: null,
  }));
  const rows = [...feedless, ...configs(3)];
  let ticks = 0;
  const db = fakeDb(
    { tenant_config: rows },
    {},
    { note_sweep_backlog: ({ p_remaining }) => (ticks = p_remaining > 0 ? ticks + 1 : 0) },
  );

  // Three ticks: under the old query each one was forty feedless rows and a
  // standing backlog, and the third called the sweep broken.
  for (let tick = 0; tick < 3; tick++) {
    const page = await calendarDue(db, NOW, CALENDAR_PER_TICK);
    // Oldest first, as always — t002 was read 150 minutes ago, t000 ninety.
    assert.deepEqual(
      page.rows.map((r) => r.tenant_id),
      ["t002", "t001", "t000"],
      "only the workspaces with a feed, and no feedless row ahead of them",
    );
    assert.equal(page.remaining, 0, "and nothing is left behind, so this is not a backlog");
    assert.equal(
      (await noteBacklog(db, "calendar", page.remaining)).alarm,
      false,
      "so the sweep never calls itself broken over work that does not exist",
    );
  }

  // A workspace that connects one joins the queue, at the front, as any
  // never-read row does.
  rows[0].config = { calendar: { ical_url: "https://cal.example/new.ics" } };
  const next = await calendarDue(db, NOW, CALENDAR_PER_TICK);
  assert.equal(next.rows[0].tenant_id, "empty0", "the new feed is read first");
  assert.equal(next.rows.length, 4);
});

test("a workspace that has never been read goes first", async () => {
  // A business that has just pasted its feed must not wait behind four hundred
  // that were read an hour ago — that is the first hour of their product.
  const rows = configs(50);
  rows.push({
    tenant_id: "brand-new",
    config: { calendar: { ical_url: "https://cal.example/new.ics" } },
    calendar_checked_at: null,
  });
  const db = fakeDb({ tenant_config: rows });
  const page = await calendarDue(db, NOW, 5);
  assert.equal(page.rows[0].tenant_id, "brand-new", "never-read sorts ahead of least-recently-read");
});

test("a workspace read this hour is not read again", async () => {
  // Without the age floor a small deployment would re-read the same three
  // feeds every tick and spend the provider's rate limit on nothing.
  const db = fakeDb({
    tenant_config: configs(3, { 0: { calendar_checked_at: ago(5) }, 1: { calendar_checked_at: ago(10) } }),
  });
  const page = await calendarDue(db, NOW, 40);
  assert.deepEqual(
    page.rows.map((r) => r.tenant_id),
    ["t002"],
    "only the one that is actually due",
  );
});

test("the sweep says what it could not reach", async () => {
  const db = fakeDb({ tenant_config: configs(100) });
  const page = await calendarDue(db, NOW, CALENDAR_PER_TICK);
  assert.equal(page.rows.length, 40);
  assert.equal(page.remaining, 60, "a count of the matches, taken before the limit");

  const small = fakeDb({ tenant_config: configs(4) });
  assert.equal((await calendarDue(small, NOW, CALENDAR_PER_TICK)).remaining, 0, "a drained queue reports zero");
});

test("a failed feed leaves the workspace due, so the next tick retries it", async () => {
  // Stamping before the work would silently skip a workspace for an hour
  // because its feed was briefly unreachable.
  const rows = configs(2);
  const db = fakeDb({ tenant_config: rows });
  const page = await calendarDue(db, NOW, 40);
  // Only the first "succeeds".
  await markCalendarChecked(db, page.rows[0].tenant_id, NOW);
  // Ten minutes later, not sixty: past the age floor the one that succeeded
  // would be legitimately due again, and this is asking about the floor.
  const next = await calendarDue(db, new Date(NOW.getTime() + 10 * 60_000), 40);
  assert.ok(
    next.rows.some((r) => r.tenant_id === page.rows[1].tenant_id),
    "the one that failed is still due",
  );
  assert.ok(!next.rows.some((r) => r.tenant_id === page.rows[0].tenant_id), "the one that succeeded is not");
});

/**
 * Fixed-offset zones, so each workspace's wall clock at NOW (18:00Z on the
 * ninth) is known: UTC-7 reads 11:00 on the ninth, UTC+9 reads 03:00 on the
 * tenth.
 */
const DAY = "Etc/GMT+7";
const NIGHT = "Etc/GMT-9";
/** A running daily moment at ten, as its row reads, that has never run. */
const moment = (id, tenant_id, over = {}) => ({
  id,
  tenant_id,
  kind: "moment",
  state: "running",
  run_hour: 10,
  last_run_for: null,
  last_run_at: null,
  created_at: ago(24 * 60),
  ...over,
});

test("the playbooks page is only what is due, by each workspace's own clock, least-recently-run first; a reach-out is on its own page", async () => {
  const tenants = [
    { id: "a", timezone: DAY },
    { id: "b", timezone: DAY },
    { id: "c", timezone: DAY },
    { id: "d", timezone: DAY },
    { id: "e", timezone: DAY },
    { id: "n", timezone: NIGHT },
  ];
  const rows = [
    moment("p1", "a", { last_run_for: "2026-09-08", last_run_at: ago(10) }),
    moment("p2", "b"),
    moment("p3", "c", { last_run_for: "2026-09-08", last_run_at: ago(600) }),
    moment("p4", "d", { state: "paused" }),
    // Ran today by its own clock: not due again.
    moment("p5", "a", { last_run_for: "2026-09-09", last_run_at: ago(60) }),
    // Its hour has not come: eleven is before noon.
    moment("p6", "b", { run_hour: 12 }),
    // Three in the morning by its own clock, though the date has turned there.
    moment("p7", "n"),
    // A reach-out step runs through its own verb (Part 3): never on the moments' page.
    moment("r1", "e", { kind: "reach_out" }),
  ];
  const db = fakeDb({ tenants, playbooks: rows });
  const page = await playbooksDue(db, NOW, PLAYBOOKS_PER_TICK);
  assert.deepEqual(
    page.rows.map((r) => [r.playbook.id, r.timezone]),
    [
      ["p2", DAY],
      ["p3", DAY],
      ["p1", DAY],
    ],
    "never-run first, then oldest, each with the zone it was judged in; paused, run today, before its hour and asleep are not due at all",
  );
  assert.equal(page.remaining, 0, "and what is not due is not left behind either");
  const reach = await reachOutsDue(db, NOW, PLAYBOOKS_PER_TICK);
  assert.deepEqual(
    reach.rows.map((r) => r.playbook.id),
    ["r1"],
    "the reach-out page, judged the same way",
  );
  assert.equal(reach.remaining, 0);
});

test("what the playbooks page leaves behind is due playbooks only: twenty-six due behind a hundred that ran today is one, not seventy-six", async () => {
  const tenants = [{ id: "a", timezone: DAY }];
  const rows = [];
  for (let i = 0; i < 100; i++)
    rows.push(moment(`ran-${i}`, "a", { last_run_for: "2026-09-09", last_run_at: ago(60 + i) }));
  // Due, and each ran yesterday later than the one before, so the page's order is known.
  for (let i = 0; i < PLAYBOOKS_PER_TICK + 1; i++)
    rows.push(
      moment(`due-${String(i).padStart(2, "0")}`, "a", { last_run_for: "2026-09-08", last_run_at: ago(1500 - i) }),
    );
  const db = fakeDb({ tenants, playbooks: rows });
  const page = await playbooksDue(db, NOW, PLAYBOOKS_PER_TICK);
  assert.equal(page.rows.length, PLAYBOOKS_PER_TICK);
  assert.ok(
    page.rows.every((r) => r.playbook.id.startsWith("due-")),
    "the page holds only what is due",
  );
  assert.deepEqual(
    page.rows.map((r) => r.playbook.id).slice(0, 2),
    ["due-00", "due-01"],
    "the least recently run first",
  );
  assert.equal(page.remaining, 1, "the twenty-sixth due one, and none of the hundred");
  // A reach-out page over the same table has nothing: no reach-out is running.
  assert.deepEqual(await reachOutsDue(db, NOW, PLAYBOOKS_PER_TICK), { rows: [], remaining: 0 });
});

test("three consecutive backlogged ticks is a fault; one is a busy hour", async () => {
  let ticks = 0;
  const db = fakeDb(
    {},
    {},
    {
      note_sweep_backlog: ({ p_remaining }) => (ticks = p_remaining > 0 ? ticks + 1 : 0),
    },
  );
  assert.deepEqual(await noteBacklog(db, "calendar", 12), { ticks: 1, alarm: false });
  assert.deepEqual(await noteBacklog(db, "calendar", 9), { ticks: 2, alarm: false });
  assert.deepEqual(await noteBacklog(db, "calendar", 4), { ticks: 3, alarm: true }, "the third in a row is the alarm");
  // Draining resets it: a queue that clears is not a fault, however deep it got.
  assert.deepEqual(await noteBacklog(db, "calendar", 0), { ticks: 0, alarm: false });
  assert.equal(BACKLOG_TICKS_BEFORE_ALARM, 3);
});

test("bookkeeping that fails never fails the sweep", async () => {
  // A sweep that did its work must not report failure because it could not
  // write its own counter.
  const db = fakeDb(
    {},
    {},
    {
      note_sweep_backlog: () => {
        throw new Error("boom");
      },
    },
  );
  const r = await noteBacklog(db, "calendar", 5).catch(() => "threw");
  assert.notEqual(r, "threw", "it swallows its own bookkeeping failure");
});

test("both sweeps are wired to it, and answer 503 on the alarm", () => {
  for (const [file, sweep, cap] of [
    ["calendar", "calendar", "CALENDAR_PER_TICK"],
    ["playbooks", "playbooks", "PLAYBOOKS_PER_TICK"],
  ]) {
    const src = readCode(`apps/edge/api/cron/${file}.ts`);
    assert.ok(src.includes(`${cap}`), `${file}: capped`);
    assert.ok(src.includes(`noteBacklog(db, "${sweep}",`), `${file}: records the backlog`);
    assert.ok(src.includes("if (backlog.alarm) {") && src.includes("json(503"), `${file}: 503 on the alarm`);
    assert.ok(src.includes("remaining: page.remaining"), `${file}: reports what it could not reach`);
    // The old unbounded read must not come back.
    assert.ok(
      !/from\("tenant_config"\)\s*\.select\("tenant_id, config"\)\s*;/.test(src),
      `${file}: no unbounded select`,
    );
  }

  // And something is watching for that 503.
  const watch = readRaw("supabase/migrations/00086_watch_every_sweep.sql");
  assert.ok(
    watch.includes("('calendar',      'calendar-people-sweep'") &&
      watch.includes("('playbooks',     'playbooks-sweep'"),
    "sweep_health judges both, so the 503 reaches a person",
  );
});
