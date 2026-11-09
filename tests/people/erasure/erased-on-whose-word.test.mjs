/**
 * An erasure a press of many handed the ledger is the hand of whoever pressed (decision 0036, 5 Nov 2026). The job erases
 * on the service role, so the ledger's row is the system's (erase_contact reads the owner from auth.uid(), and the job
 * has none); it keeps who pressed among what its legs did (`legs.by`, jobs erasure.ts), and the activity log reads that
 * as the member who did it. A finish of a press that stopped names nobody, and stays the system's.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { activityRowOfDecision, activityWords } from "@chanlytics/contracts";

const OWNER = "99999999-9999-4999-8999-999999999999";
const row = (payload, over = {}) =>
  activityRowOfDecision({
    id: "d1",
    verb: "erase",
    subject_type: "contact",
    subject_id: "p1",
    actor_type: "system",
    actor_user_id: null,
    payload,
    created_at: "2026-11-05T12:00:00Z",
    ...over,
  });

test("the log says who pressed: the row is the system's, on their word", () => {
  const pressed = row({ counts: {}, legs: { storage: { requested: 0, removed: 0 }, by: OWNER } });
  assert.equal(pressed.actor_user_id, OWNER);
  assert.equal(pressed.actor_type, "user");
  assert.equal(pressed.text, activityWords("erase", {}), "the same sentence as Delete person's");
});

test("a row that names nobody, or no member's id, stays the system's; a member's own press stays theirs", () => {
  const finished = row({ counts: {}, legs: { storage: { requested: 0, removed: 0 } } });
  assert.deepEqual([finished.actor_user_id, finished.actor_type], [null, "system"], "a stopped press's finish");
  const notAnId = row({ legs: { by: "someone" } });
  assert.deepEqual([notAnId.actor_user_id, notAnId.actor_type], [null, "system"], "only a member's id names a member");
  const other = "88888888-8888-4888-8888-888888888888";
  const theirs = row({ legs: { by: other } }, { actor_type: "user", actor_user_id: OWNER });
  assert.deepEqual([theirs.actor_user_id, theirs.actor_type], [OWNER, "user"], "the row's own hand comes first");
});
