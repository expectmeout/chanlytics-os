/**
 * A form's reply that never leaves (the whole-system plan of 28 Nov 2026, lane 3, R2.4). A reply is queued for the
 * seconds it can be taken back, and its request reads as sending and has left Needs you. If nothing ever sends it, the
 * request must not stay "sending", or answered, for ever: the deadman's sweep (apps/edge receptionist/unfinished.ts)
 * fails a reply queued over ten minutes with no live job, and by the one rule (form_entries_standing,
 * form_requests_open) the request is then open again, in Needs you, said as a reply that did not reach them. This runs
 * the real sweep over the database in memory the forms' own tests use; the sweep's own cases are
 * tests/cron/cron-deadman-door.test.mjs, and the SQL rule is proved on the database by
 * website/a-site-s-entry-is-the-same-entry-for-good.db.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { at } from "../_cron-doors-world.mjs";
import { A, FORM, formWorld, V1 } from "./_form-requests.mjs";

process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-key-for-this-file";
process.env.SUPABASE_URL ??= "https://db.example.supabase.co";
const { sweepUnfinished } = await import(at("apps/edge/lib/receptionist/unfinished.ts"));
const { logger } = await import(at("apps/edge/lib/shared/log.ts"));

const MIN_MS = 60_000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();

/** A request through the salon's form, and a reply to it still queued since `queuedMs` ago, linked as what answers it. */
async function requestWithReply(w, n, queuedMs) {
  const taken = (
    await w.db.rpc("form_request_take", {
      p_tenant_id: A,
      p_form_id: FORM,
      p_version_id: V1,
      p_ref: crypto.randomUUID(),
      p_answers: { f1name: `Visitor ${n}`, f2mail: `visitor${n}@example.com`, f4want: "A warm, soft blonde." },
      p_reach: { name: `Visitor ${n}`, email: `visitor${n}@example.com`, phone: null },
      p_words: String(n).padStart(64, "0"),
    })
  ).data;
  const message = {
    id: crypto.randomUUID(),
    tenant_id: A,
    conversation_id: `cv-${n}`,
    direction: "outbound",
    sender: "human",
    channel: "email",
    body: "Hi, we'd love to help.",
    status: "queued",
    created_at: ago(queuedMs),
    // The reply says which request it answers; the database links the two in the message's own write (00713).
    meta: { form_entry_id: taken.entry_id },
  };
  w.tables.messages.push(message);
  w.tables.form_entry_links.push({
    id: crypto.randomUUID(),
    tenant_id: A,
    entry_id: taken.entry_id,
    kind: "reply",
    message_id: message.id,
    conversation_id: null,
    appointment_id: null,
    created_by: null,
    created_at: message.created_at,
  });
  return { entryId: taken.entry_id, message };
}

const standingOf = async (w, entryId) =>
  (await w.db.rpc("form_entries_standing", { p_tenant_id: A, p_entry_ids: [entryId] })).data[0];
const openIds = async (w) =>
  (await w.db.rpc("form_requests_open", { p_tenant_id: A })).data.map((line) => [line.id, line.unreached]);
const openCount = async (w) => (await w.db.rpc("form_requests_open_count", { p_tenant_id: A })).data;

test("a reply stuck sending is failed by the sweep, and its request comes back to Needs you as not reached", async () => {
  const w = formWorld({ more: { messages: [], jobs: [], form_entry_links: [] } });
  const stuck = await requestWithReply(w, 1, 15 * MIN_MS);
  const going = await requestWithReply(w, 2, 15 * MIN_MS);
  const fresh = await requestWithReply(w, 3, 1 * MIN_MS);
  // The second one's job is still in hand: the runner will send it.
  w.tables.jobs.push({
    id: crypto.randomUUID(),
    tenant_id: A,
    kind: "outbound_send",
    state: "scheduled",
    payload: { message_id: going.message.id },
  });

  for (const one of [stuck, going, fresh]) assert.equal((await standingOf(w, one.entryId)).standing, "sending");
  assert.deepEqual([await openIds(w), await openCount(w)], [[], 0], "while they go, none waits in Needs you");

  const flagged = [];
  const swept = await sweepUnfinished({
    db: w.db,
    L: logger({ door: "deadman" }),
    upsertEscalation: async (_db, tenantId, conversationId, reason, details) => {
      flagged.push({ tenantId, conversationId, reason, details });
      return "opened";
    },
    markProcessed: async () => {},
    notify: async () => true,
    loadTenantNotifications: async () => null,
    reachesTenant: () => false,
    deadline: Date.now() + MIN_MS,
  });
  assert.equal(swept.orphaned, 1, "the one reply nothing was sending");
  assert.deepEqual(
    [stuck.message.status, stuck.message.error],
    ["failed", { reason: "orphaned", note: "no job was left to send this" }],
  );
  assert.deepEqual(
    flagged.map((f) => [f.conversationId, f.reason]),
    [["cv-1", "send_failed"]],
    "its conversation is flagged for a person",
  );

  const after = await standingOf(w, stuck.entryId);
  assert.deepEqual(
    [after.standing, after.unreached],
    ["open", true],
    "REGRESSION: it must never stay sending, or answered, once its reply is known not to have left",
  );
  assert.deepEqual(
    await openIds(w),
    [[stuck.entryId, true]],
    "back in Needs you, said as a reply that did not reach them",
  );
  assert.equal(await openCount(w), 1, "and in the one count");
  assert.equal((await standingOf(w, going.entryId)).standing, "sending", "one whose job is in hand is left to it");
  assert.equal((await standingOf(w, fresh.entryId)).standing, "sending", "and one inside its ten minutes");
});
