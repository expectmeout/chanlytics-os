/**
 * A run that starts closes the row that said it goes unless stopped (the Cold email review, 10 Nov 2026).
 *
 * "Campaign “Movers” sends today 10:30 AM: 12 businesses" asks while the run can still be stopped, and the bell's judge
 * settles it once the run is no longer scheduled (notice-closes.ts judgeRun). That judge runs only in a tab that holds
 * Sent's runs: the phone's icon, the edge's count before a push, Ask and every other tab kept the row asking until the run
 * ended, hours later for a day of cold email. The server now closes it as the run starts, by the judge's own title
 * (contracts RUN_START_ENDS, packages/db closeRunStartNotices), and leaves the check's held emails asking while it sends.
 * Run here on contracts' rule, packages/db's close and the cold email writer's move; the send job's start in
 * broadcasts.test.mjs, and the writer's whole road against the database in reach-out-sender.db.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NOTHING_WAITS_KNOWN,
  RUN_START_ENDS,
  coldBatchGoesNotice,
  heldNoticeWords,
  noticeStillWaits,
  readyRunNotice,
  skippedRunNotice,
  vetoRunNotice,
} from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";
import { closeRunStartNotices } from "../../../packages/db/src/repositories/notices/notifications/feed.ts";
import { runSending } from "../../../packages/db/src/repositories/campaigns/reach-out/emails.ts";

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const RUN = "cccccccc-0000-4000-8000-000000000001";
const NEXT_RUN = "cccccccc-0000-4000-8000-000000000002";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const WHEN = "today 10:30 AM";

/** Every title a run's stop window is told by: a day's cold email, and a customer campaign held for a stop. */
const STOP_TITLES = [coldBatchGoesNotice("Movers", 12, WHEN).subject, vetoRunNotice("Win-back", 4, WHEN).subject];
/** The check's held emails: they still ask while the run sends. */
const HELD_TITLE = heldNoticeWords({ name: "Movers", held: 2, reasons: [] }).subject;
/** A run's other rows, which its decision or its end closes (00461 batch_closes_its_notices), never its start. */
const OTHER_TITLES = [
  HELD_TITLE,
  readyRunNotice("Win-back", 4, null).subject,
  skippedRunNotice("Win-back", 4, null).subject,
  // A cold email run waiting for an OK (apps/edge run-context.ts notifyWaiting).
  "Movers waits for your OK",
];
const endsAtStart = (title) => RUN_START_ENDS.some((r) => r.kind === "playbook" && r.title.test(title));

/* ------------------------------------------------------ in contracts ------------------------------------------------------ */

test("a run's start ends its stop row alone: every title a stop window is told by, and none of the run's other rows", () => {
  for (const title of STOP_TITLES) assert.ok(endsAtStart(title), title);
  for (const title of OTHER_TITLES) assert.ok(!endsAtStart(title), title);
});

test("the server closes only what the bell already settles once a run sends: its held emails still ask", () => {
  const now = Date.now();
  const waits = {
    ...NOTHING_WAITS_KNOWN,
    runs: { readAt: now, held: new Map([[RUN, { state: "sending", held: 2 }]]) },
  };
  const row = (title) => ({ kind: "playbook", about: { type: "broadcast", id: RUN }, title, at: now - HOUR, to: null });
  const closed = [...STOP_TITLES, ...OTHER_TITLES].filter(endsAtStart);
  assert.deepEqual(closed, STOP_TITLES);
  for (const title of closed) assert.equal(noticeStillWaits(row(title), waits), false, `${title}: settled by the bell`);
  assert.equal(noticeStillWaits(row(HELD_TITLE), waits), true, "the held emails ask while the run sends");
});

/* ------------------------------------------------------ in packages/db ----------------------------------------------------- */

let seq = 0;
/** A row the bell kept an hour ago about a run, open. */
const kept = (title, runId, over = {}) => ({
  id: `eeeeeeee-0000-4000-8000-${String(++seq).padStart(12, "0")}`,
  tenant_id: T,
  kind: "playbook",
  title,
  body: "x",
  route: null,
  subject_type: "broadcast",
  subject_id: runId,
  created_at: new Date(Date.now() - HOUR).toISOString(),
  closed_at: null,
  ...over,
});

test("a run's start closes its stop row once: never its held emails, another run's, another workspace's, or one past the bell's window", async () => {
  const earlier = new Date(Date.now() - 2 * HOUR).toISOString();
  const rows = {
    stop: kept(STOP_TITLES[0], RUN),
    held: kept(HELD_TITLE, RUN),
    nextRun: kept(STOP_TITLES[0], NEXT_RUN),
    theirs: kept(STOP_TITLES[0], RUN, { tenant_id: OTHER }),
    closed: kept(STOP_TITLES[1], RUN, { closed_at: earlier }),
    old: kept(STOP_TITLES[1], RUN, { created_at: new Date(Date.now() - 31 * DAY).toISOString() }),
  };
  const list = Object.values(rows);
  const db = fakeDb({ notifications: list });
  const start = () => closeRunStartNotices(db, { tenantId: T, runId: RUN, nowMs: Date.now() });
  assert.equal(await start(), 1);
  const closedAt = (key) => list.find((r) => r.id === rows[key].id).closed_at ?? null;
  assert.ok(closedAt("stop"), "its stop row is closed");
  for (const key of ["held", "nextRun", "theirs", "old"]) assert.equal(closedAt(key), null, `${key} stays open`);
  assert.equal(closedAt("closed"), earlier, "a row closed before keeps when it was");
  assert.equal(await start(), 0, "a second start closes nothing");
});

test("a close that cannot read the bell says so, for its caller to log: it never answers that nothing was open", async () => {
  const db = fakeDb(
    { notifications: [kept(STOP_TITLES[0], RUN)] },
    { "notifications.select": { message: "statement timeout" } },
  );
  await assert.rejects(closeRunStartNotices(db, { tenantId: T, runId: RUN, nowMs: Date.now() }), /statement timeout/);
});

/* ----------------------------------------------- the cold email writer's move ---------------------------------------------- */

test("the cold email writer's move says whether it started the run: its first email's does, every later one's does not", async () => {
  const batches = [{ id: RUN, tenant_id: T, state: "scheduled" }];
  const db = fakeDb({ sequence_batches: batches });
  assert.equal(await runSending(db, { tenantId: T, id: RUN }), true);
  assert.equal(batches[0].state, "sending");
  assert.equal(await runSending(db, { tenantId: T, id: RUN }), false, "a run already sending was not started again");
});
