/**
 * A pause is a person taking the thread: the receptionist's held drafts on
 * it are withdrawn with it, all but the holding message the same handoff
 * queued. The door waives the pause for a queued row on exactly this promise
 * (deliver.test.mjs runs the door); here the promise itself is run.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pauseConversation } from "@chanlytics/db";
import { fakeDb } from "../_fake-db.mjs";

const T = "t1";
const row = (id, over = {}) => ({
  id,
  tenant_id: T,
  conversation_id: "c1",
  status: "queued",
  sender: "ai",
  direction: "outbound",
  body: "x",
  created_at: "2026-09-10T09:59:00.000Z",
  ...over,
});

test("pausing a thread withdraws the receptionist's queued drafts on it, keeps the one this handoff queued, and leaves a person's queued reply and other threads alone", async () => {
  const t = {
    conversations: [{ id: "c1", tenant_id: T, state: "open", paused_until: null }],
    messages: [
      row("stale"),
      row("holding"),
      row("theirs", { sender: "human" }),
      row("elsewhere", { conversation_id: "c2" }),
      row("gone", { status: "sent" }),
    ],
  };
  assert.equal(
    await pauseConversation(fakeDb(t), T, "c1", "2026-09-10T11:00:00.000Z", { keepMessageId: "holding" }),
    true,
  );
  assert.deepEqual(Object.fromEntries(t.messages.map((m) => [m.id, m.status])), {
    stale: "canceled",
    holding: "queued",
    theirs: "queued",
    elsewhere: "queued",
    gone: "sent",
  });
  assert.deepEqual(
    t.messages[0].error,
    { reason: "superseded_by_human" },
    "retired for the reason the door would have given it",
  );
  assert.equal(t.conversations[0].state, "needs_human");
  assert.equal(t.conversations[0].paused_until, "2026-09-10T11:00:00.000Z");
  const all = {
    conversations: [{ id: "c1", tenant_id: T, state: "open", paused_until: null }],
    messages: [row("a"), row("b")],
  };
  assert.equal(await pauseConversation(fakeDb(all), T, "c1", "2026-09-10T11:00:00.000Z"), true);
  assert.deepEqual(
    all.messages.map((m) => m.status),
    ["canceled", "canceled"],
    "a handoff that queued nothing keeps nothing",
  );
});

test("a pause that landed on no row withdraws nothing", async () => {
  const t = { conversations: [], messages: [row("stale")] };
  assert.equal(await pauseConversation(fakeDb(t), T, "c1", "2026-09-10T11:00:00.000Z"), false);
  assert.equal(t.messages[0].status, "queued");
});
