/**
 * What the intake opened, the reading closes: the two repository writes behind it (packages/db outreach.ts
 * resolveEscalationByReason and archiveConversation), run over a database in memory. Each is one workspace's, counted
 * (true only when a row changed: an UPDATE that matches nothing does not raise), guarded by what it closes (the open
 * flag of that reason alone; a thread not archived already) and idempotent, and a write that fails throws. The reading
 * that calls them is run in reply-read-door.test.mjs; the verb's order in reply-read-verb.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../_fake-db.mjs";
import { at } from "../_cron-doors-world.mjs";

const { resolveEscalationByReason, archiveConversation } = await import(at("packages/db/src/repositories/outreach.ts"));

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("resolve: the thread's open flag of that reason alone, by the platform, counted, and once", async () => {
  const tables = {
    escalations: [
      { id: "e1", tenant_id: T, conversation_id: "c1", reason: "email_review", state: "open", details: "They wrote" },
      { id: "e2", tenant_id: T, conversation_id: "c2", reason: "send_failed", state: "open", details: "x" },
      {
        id: "e3",
        tenant_id: T,
        conversation_id: "c3",
        reason: "email_review",
        state: "resolved",
        resolved_by_user_id: "u1",
      },
      { id: "e4", tenant_id: OTHER, conversation_id: "c1", reason: "email_review", state: "open", details: "theirs" },
    ],
  };
  const db = fakeDb(tables);
  const [mine, other, theirs, elsewhere] = tables.escalations;
  assert.equal(
    await resolveEscalationByReason(db, { tenantId: T, conversationId: "c1", reason: "email_review" }),
    true,
  );
  assert.equal(mine.state, "resolved");
  assert.equal(mine.resolved_by_user_id ?? null, null, "nobody's: the platform closed it");
  assert.equal(mine.decision_id ?? null, null);
  assert.equal(
    await resolveEscalationByReason(db, { tenantId: T, conversationId: "c1", reason: "email_review" }),
    false,
    "resolved already: nothing changed, and said so",
  );
  assert.equal(
    await resolveEscalationByReason(db, { tenantId: T, conversationId: "c2", reason: "email_review" }),
    false,
    "another reason's flag is not this close's to resolve",
  );
  assert.equal(other.state, "open");
  assert.equal(
    await resolveEscalationByReason(db, { tenantId: T, conversationId: "c3", reason: "email_review" }),
    false,
  );
  assert.equal(theirs.resolved_by_user_id, "u1", "a member's resolve is left as it was");
  assert.equal(elsewhere.state, "open", "another workspace's flag on a thread of the same id is left alone");
  const failing = fakeDb({ escalations: [] }, { "escalations.update": { message: "boom" } });
  await assert.rejects(
    resolveEscalationByReason(failing, { tenantId: T, conversationId: "c1", reason: "email_review" }),
    /cannot resolve the thread's flag: boom/,
  );
});

test("archive: contracts' archive move, whole, unless archived already; one workspace's; counted; a failure throws", async () => {
  const tables = {
    conversations: [
      {
        id: "c1",
        tenant_id: T,
        contact_id: "p1",
        state: "needs_human",
        paused_until: "2026-10-03T00:00:00.000Z",
        assignee_user_id: "u1",
        snooze_until: null,
      },
      { id: "c2", tenant_id: T, contact_id: "p2", state: "archived", paused_until: null, assignee_user_id: null },
      { id: "c9", tenant_id: OTHER, contact_id: "p1", state: "open", paused_until: null, assignee_user_id: null },
    ],
  };
  const db = fakeDb(tables);
  const [mine, done, elsewhere] = tables.conversations;
  assert.equal(await archiveConversation(db, { tenantId: T, conversationId: "c1" }), true);
  assert.deepEqual(
    [mine.state, mine.paused_until, mine.assignee_user_id],
    ["archived", null, null],
    "released completely: the pause and the claim go with the state (conversation-moves.ts archive)",
  );
  assert.equal(await archiveConversation(db, { tenantId: T, conversationId: "c1" }), false, "archived already");
  assert.equal(await archiveConversation(db, { tenantId: T, conversationId: "c2" }), false);
  assert.equal(done.state, "archived");
  assert.equal(await archiveConversation(db, { tenantId: T, conversationId: "c9" }), false, "not this workspace's");
  assert.equal(elsewhere.state, "open");
  const failing = fakeDb({ conversations: [] }, { "conversations.update": { message: "boom" } });
  await assert.rejects(
    archiveConversation(failing, { tenantId: T, conversationId: "c1" }),
    /cannot archive the thread: boom/,
  );
});
