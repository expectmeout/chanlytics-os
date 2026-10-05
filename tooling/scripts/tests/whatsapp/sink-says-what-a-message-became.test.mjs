/**
 * The receptionist's sink says what a message became, beside marking it processed (the Reports lenses spec, K1). Two
 * doors, each failing alone: a stamp the database refuses never costs the message its processed_at (the deadman
 * sweep reads it), and a processed_at that fails never costs the stamp. The doors are the real ones, stampHandled and
 * markProcessed, over a database in memory whose functions are the migrations' names; processed() resolves whatever
 * either did, as every sink method does.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stampHandled } from "@chanlytics/db";
import { fakeDb } from "../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const { pgSink } = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/whatsapp/persist.ts")).href);

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const M = "11111111-1111-4111-8111-111111111111";
const ing = {
  message_id: M,
  conversation_id: "22222222-2222-4222-8222-222222222222",
  contact_id: "33333333-3333-4333-8333-333333333333",
  is_new: true,
  processed: false,
  state: "open",
  paused_until: null,
};

/** A sink over a database whose two doors record what they were asked, and may refuse. */
function world(refuse = {}) {
  const calls = [];
  const db = fakeDb(
    {},
    {},
    {
      mark_processed: (a) => {
        calls.push(["mark_processed", a]);
        if (refuse.processed) throw new Error(refuse.processed);
        return null;
      },
      message_stamp_handled: (a) => {
        calls.push(["message_stamp_handled", a]);
        if (refuse.stamp) throw new Error(refuse.stamp);
        return null;
      },
    },
  );
  return { sink: pgSink(db, T, ing), calls, db };
}

test("processed(handled, intent) marks the message and says what it became, each through its own door", async () => {
  const w = world();
  await w.sink.processed("ai", "hours");
  assert.deepEqual(w.calls, [
    ["mark_processed", { p_tenant_id: T, p_message_id: M }],
    ["message_stamp_handled", { p_tenant_id: T, p_message_id: M, p_handled: "ai", p_intent: "hours" }],
  ]);
});

test("no intent is no argument, and no outcome is no stamp: a way out with nothing to say still marks the message", async () => {
  const w = world();
  await w.sink.processed("blocked");
  assert.deepEqual(
    w.calls.map((c) => c[0]),
    ["mark_processed", "message_stamp_handled"],
  );
  assert.equal("p_intent" in w.calls[1][1], false);
  const bare = world();
  await bare.sink.processed();
  assert.deepEqual(
    bare.calls.map((c) => c[0]),
    ["mark_processed"],
  );
});

test("a stamp the database refuses costs the message nothing: processed_at was written and processed() resolves", async () => {
  const w = world({ stamp: "connection reset" });
  await assert.doesNotReject(w.sink.processed("handoff", "money"));
  assert.deepEqual(
    w.calls.map((c) => c[0]),
    ["mark_processed", "message_stamp_handled"],
  );
});

test("a processed_at that fails costs the stamp nothing, and nothing is thrown", async () => {
  const w = world({ processed: "connection reset" });
  await assert.doesNotReject(w.sink.processed("ai", "hours"));
  assert.deepEqual(
    w.calls.map((c) => c[0]),
    ["mark_processed", "message_stamp_handled"],
  );
});

test("stampHandled asks the door by its names and throws what the database said", async () => {
  const w = world();
  await stampHandled(w.db, T, M, "held", null);
  assert.deepEqual(w.calls, [["message_stamp_handled", { p_tenant_id: T, p_message_id: M, p_handled: "held" }]]);
  const down = world({ stamp: "connection reset" });
  await assert.rejects(stampHandled(down.db, T, M, "ai", "hours"), /message_stamp_handled: connection reset/);
});

test("noteHandled says what the message became and nothing else: the same door, never processed_at, and a refusal costs nothing", async () => {
  // The way out a failed send leaves unprocessed on purpose (the deadman sweep finishes it) still says it was handed over.
  const w = world();
  await w.sink.noteHandled("handoff", "hours");
  assert.deepEqual(
    w.calls,
    [["message_stamp_handled", { p_tenant_id: T, p_message_id: M, p_handled: "handoff", p_intent: "hours" }]],
    "the stamp's door alone: mark_processed is never called",
  );
  const bare = world();
  await bare.sink.noteHandled("handoff");
  assert.equal("p_intent" in bare.calls[0][1], false, "no intent is no argument");
  const down = world({ stamp: "connection reset" });
  await assert.doesNotReject(down.sink.noteHandled("handoff", null), "a stamp the database refuses is never thrown");
  assert.deepEqual(
    down.calls.map((c) => c[0]),
    ["message_stamp_handled"],
  );
  const off = pgSink(null, null, null);
  await assert.doesNotReject(off.noteHandled("handoff"), "no database: nothing to stamp, nothing thrown");
});
