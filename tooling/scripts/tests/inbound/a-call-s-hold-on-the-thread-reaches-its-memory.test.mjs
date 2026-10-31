/**
 * The thread's live hold (00132: a call in progress on it, or a person who took it over) reaches the receptionist's
 * memory with the rest of the thread's state, as the wire reads it (core deliver-hold.ts HoldFacts): the kind, the
 * call's own ref and until when, or none. The edge's pgThread over db readThreadState, run here over the double, so
 * the inbound path can ask the wire's question before the model is asked (core inbound reply-gates.ts).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const { pgThread } = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/whatsapp/persist.ts")).href);

const T = "11111111-1111-1111-1111-111111111111";
const conversation = (id, over = {}) => ({
  id,
  tenant_id: T,
  contact_id: "k1",
  paused_until: null,
  control_kind: null,
  control_ref: null,
  control_until: null,
  ...over,
});
const ingested = (conversationId) => ({
  message_id: "m1",
  conversation_id: conversationId,
  contact_id: "k1",
  is_new: true,
  consent: "unknown",
  dnc: false,
  paused_until: null,
});

test("a call's hold on the thread rides with its memory, as the wire reads it; a thread nobody holds says none", async () => {
  const until = new Date(Date.now() + 10 * 60_000).toISOString();
  const db = fakeDb({
    conversations: [
      conversation("c-call", { control_kind: "call", control_ref: "call_1", control_until: until }),
      conversation("c-free"),
      // A kind with no end is no hold, as the wire reads the same row (core deliver.ts wireFacts).
      conversation("c-open", { control_kind: "person", control_until: null }),
    ],
    messages: [],
  });
  const holdOn = async (id) => (await pgThread(db, T, ingested(id))).control;
  assert.deepEqual(await holdOn("c-call"), { kind: "call", ref: "call_1", until });
  assert.equal(await holdOn("c-free"), null);
  assert.equal(await holdOn("c-open"), null);
  // The rest of the memory is as it was.
  const whole = await pgThread(db, T, ingested("c-call"));
  assert.deepEqual([whole.history, whole.replies, whole.pausedUntil, whole.textedBefore], [[], [], 0, false]);
  // A thread the database could not produce is unknown, and says no hold it cannot know of.
  const unknown = await pgThread(db, T, null);
  assert.deepEqual([unknown.unknown, unknown.control], [true, null]);
});
