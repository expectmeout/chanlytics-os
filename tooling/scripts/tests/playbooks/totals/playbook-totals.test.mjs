/**
 * A playbook's totals, a run's counts and a message's sends (00362), as the dashboard reads them: contracts' guards and
 * mappings, the fake database's twins of the three functions, and Sent, GET playbooks and Settings' templates saying
 * the same counted by the database as by the fold they replace. Over the database in memory (_fake-db.mjs); the twins
 * are held to SQL in playbook-totals.db.test.mjs, and packages/db's doors in reports/report-repository.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isPlaybookTotalsDto, runCountsOf, templateSendsOf } from "@chanlytics/contracts";

test("isPlaybookTotalsDto takes playbook_totals' answer -- by playbook id, each with its last run, the run that waits or null, and its history -- and nothing else", () => {
  const row = {
    runs: 2,
    sent: 3,
    delivered: 2,
    replied: 1,
    held: 1,
    last_run: { id: "b1", state: "sent", run_for: "2026-09-02", recipient_count: 2 },
    waiting: null,
    history: [
      {
        id: "b1",
        run_for: "2026-09-02",
        state: "sent",
        scheduled_for: "2026-09-02T14:00:00+00:00",
        recipient_count: 2,
        sent: 2,
        held: 0,
        delivered: 1,
        replied: 1,
      },
    ],
  };
  assert.equal(isPlaybookTotalsDto({}), true, "no playbook has run");
  assert.equal(isPlaybookTotalsDto({ p1: row }), true);
  assert.equal(
    isPlaybookTotalsDto({
      p1: { ...row, waiting: { id: "b2", recipient_count: 4, name: "Run 2", run_for: null, trigger: null } },
    }),
    true,
    "a run that waits, with no day and no moment kept",
  );
  for (const [bad, why] of [
    [null, "null"],
    [[], "an array"],
    ["{}", "text"],
    [{ p1: { ...row, runs: "2" } }, "a count as text"],
    [{ p1: { ...row, last_run: null } }, "a playbook in the answer has run"],
    [{ p1: { ...row, history: [{ ...row.history[0], scheduled_for: null }] } }, "a run's time is never empty"],
    [{ p1: { ...row, waiting: { id: "b2" } } }, "a waiting run says its people, its name, its day and its moment"],
    [{ p1: { ...row, lastRun: row.last_run, last_run: undefined } }, "memory's casing is not the database's"],
  ])
    assert.equal(isPlaybookTotalsDto(bad), false, why);
});

test("runCountsOf reads run_counts' answer in the order Sent has always written a run's counts, and templateSendsOf template_sends' in memory's casing; another shape is null", () => {
  const raw = {
    b1: {
      sent_by: { email: 1, sms: 0, whatsapp: 2 },
      replied: 1,
      read: 1,
      delivered: 2,
      failed: 0,
      skipped: 1,
      sent: 3,
      queued: 0,
    },
  };
  const got = runCountsOf(raw);
  assert.deepEqual(got, {
    b1: {
      queued: 0,
      sent: 3,
      skipped: 1,
      failed: 0,
      delivered: 2,
      read: 1,
      replied: 1,
      sent_by: { whatsapp: 2, sms: 0, email: 1 },
    },
  });
  assert.equal(
    JSON.stringify(got.b1),
    '{"queued":0,"sent":3,"skipped":1,"failed":0,"delivered":2,"read":1,"replied":1,"sent_by":{"whatsapp":2,"sms":0,"email":1}}',
    "the fold's key order, whatever order jsonb keeps",
  );
  assert.deepEqual(runCountsOf({}), {});
  for (const bad of [
    null,
    [],
    { b1: { ...raw.b1, sent: "3" } },
    { b1: { ...raw.b1, sent_by: null } },
    { b1: { ...raw.b1, sent_by: { whatsapp: 2 } } },
  ])
    assert.equal(runCountsOf(bad), null, JSON.stringify(bad));
  assert.deepEqual(
    templateSendsOf({
      winback_offer: { count: 3, last_at: "2026-09-17T14:00:00+00:00" },
      never_timed: { count: 1, last_at: null },
    }),
    { winback_offer: { count: 3, lastAt: "2026-09-17T14:00:00+00:00" }, never_timed: { count: 1, lastAt: null } },
  );
  assert.deepEqual(templateSendsOf({}), {});
  for (const bad of [null, [], { x: { count: "3", last_at: null } }, { x: { count: 3 } }])
    assert.equal(templateSendsOf(bad), null, JSON.stringify(bad));
});
