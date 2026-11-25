/**
 * The calls kept off the owner's list, counted (decision 0138): db's countScreenedCalls over the ledger's
 * `call.screened` rows, which Reports' Receptionist lens says in one sentence (receptionist-report.test.mjs holds the
 * words, receptionist-page.test.mjs where they are drawn, ask/readers/ that the route carries them).
 *
 * A row is written where a rule acted: by the inbound door for a call turned away, by the call webhook for a call that
 * asked nobody, by the reply_draft job for a call back set aside as selling. So the count is of what happened, between
 * the window's two instants, in the workspace asked for, a call once however often its row was written.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { SCREENED_REASONS } from "@chanlytics/contracts";
import { countScreenedCalls } from "@chanlytics/db/reports";
import { fakeDb } from "../../_fake-db.mjs";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
/** Thirty days ending 8 Sep 2026 in New York, as contracts' receptionistWindowOf says them. */
const WINDOW = { fromIso: "2026-08-10T04:00:00.000Z", toIso: "2026-09-09T04:00:00.000Z" };

let seq = 0;
const event = (at, data, over = {}) => ({
  id: `e${++seq}`,
  tenant_id: A,
  kind: "call.screened",
  category: "call",
  subject_type: "conversation",
  subject_id: "c1",
  data,
  created_at: at,
  ...over,
});
const count = (events, faults) => countScreenedCalls(fakeDb({ events }, faults), A, WINDOW);

test("a call is counted once, by why: rows that name one call for one reason are that call; a row that names no call is its own", async () => {
  const counted = await count([
    event("2026-09-08T15:00:00Z", { reason: "refused", call_id: "call_a" }),
    // The provider asked again for the same call, and the door refused it again.
    event("2026-09-08T15:00:01Z", { reason: "refused", call_id: "call_a" }),
    event("2026-09-08T15:00:02Z", { reason: "refused", call_id: "call_a" }),
    event("2026-09-07T12:00:00Z", { reason: "toll_free_silent", call_id: "call_b" }),
    event("2026-09-07T12:00:05Z", { reason: "unverified_silent", call_id: "call_c" }),
    // A call back set aside as selling names its thread alone: two of them are two.
    event("2026-09-06T12:00:00Z", { reason: "selling", call_id: null }),
    event("2026-09-05T12:00:00Z", { reason: "selling", call_id: null }),
    event("2026-09-04T12:00:00Z", { reason: "not_a_customer", call_id: "call_d" }),
    event("2026-09-03T12:00:00Z", { reason: "carrier_spam", call_id: "call_e" }),
  ]);
  assert.deepEqual(counted, {
    total: 7,
    by_reason: {
      refused: 1,
      toll_free_silent: 1,
      unverified_silent: 1,
      selling: 2,
      not_a_customer: 1,
      carrier_spam: 1,
    },
  });
  assert.deepEqual(Object.keys(counted.by_reason).sort(), [...SCREENED_REASONS].sort(), "every reason there is");
});

test("only the window's own rows, of this workspace and this kind, with a reason the product knows", async () => {
  const counted = await count([
    event(WINDOW.fromIso, { reason: "refused", call_id: "first-instant" }),
    event("2026-08-10T03:59:59Z", { reason: "refused", call_id: "the-second-before" }),
    event(WINDOW.toIso, { reason: "refused", call_id: "the-day-after" }),
    event("2026-09-08T15:00:00Z", { reason: "refused", call_id: "theirs" }, { tenant_id: B }),
    event("2026-09-08T15:00:00Z", { reason: "refused", call_id: "a-recording" }, { kind: "call.recorded" }),
    event("2026-09-08T15:00:00Z", { reason: "something_new", call_id: "unknown" }),
    event("2026-09-08T15:00:00Z", null),
  ]);
  assert.deepEqual(counted, { total: 1, by_reason: { refused: 1 } });
  assert.deepEqual(await count([]), { total: 0, by_reason: {} }, "none is a zero that was read");
});

test("a window with more rows than one read takes is read to its end; a ledger that cannot be read throws, and never counts none", async () => {
  const many = Array.from({ length: 1001 }, (_, i) =>
    event("2026-09-08T15:00:00Z", { reason: "toll_free_silent", call_id: `call_${i}` }),
  );
  assert.equal((await count(many)).total, 1001);
  await assert.rejects(
    count(many, { "events.select": { message: "connection refused" } }),
    /counting the calls screened/,
  );
});
