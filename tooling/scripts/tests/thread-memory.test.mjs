/**
 * The memory must tell "this thread is new" apart from "I could not read it",
 * because the two lead to opposite behaviour and one of them is a live
 * incident.
 *
 * A blank thread has `pausedUntil: 0`, no history and no replies — so reading
 * a FAILED read as blank makes the receptionist believe nobody has taken the
 * thread over, that it has never spoken to this person, and that it has used
 * none of its daily replies. It then talks over the human handling the
 * conversation and re-greets a customer mid-thread. Reading a NEW thread as
 * unknown is the mirror mistake and just as bad: every first-time customer
 * takes that path, and it would send each of them to a person instead of
 * being greeted.
 *
 * This used to be tested against apps/edge/lib/store.ts, where a missing Blob
 * object came back as `null` and a version that only special-cased the thrown
 * not-found classified every first-time customer as unreadable. The store is
 * gone; Postgres is the only memory, and pgThread is where the distinction
 * lives now. There is no second copy to fall back to, so an unknown thread is
 * handed to a person — which is why this has to be exactly right.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "./_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { pgThread } = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/whatsapp/persist.ts")).href);
const { isThreadUnknown } = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/receptionist/thread.ts")).href);

const T = "11111111-1111-1111-1111-111111111111";
const C = "22222222-2222-2222-2222-222222222222";
const ing = (over = {}) => ({
  message_id: "m1",
  conversation_id: C,
  contact_id: "k1",
  is_new: true,
  paused_until: null,
  ...over,
});
const at = (minutesAgo) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
const row = (over) => ({
  tenant_id: T,
  conversation_id: C,
  direction: "outbound",
  sender: "ai",
  status: "sent",
  type: "text",
  body: "…",
  channel: "whatsapp",
  channel_ts: null,
  meta: {},
  ...over,
});

/** A database whose every read fails — an outage, not an empty conversation. */
const brokenDb = () => ({
  from() {
    const proxy = new Proxy(
      {},
      {
        get: (_t, k) =>
          k === "then" ? (res, rej) => Promise.reject(new Error("connect ECONNREFUSED")).then(res, rej) : () => proxy,
      },
    );
    return proxy;
  },
});

test("a first-time customer is BLANK, not unknown", async () => {
  // No rows in this conversation yet. Every first-time customer takes this
  // path, and answering it "unknown" refuses to greet any of them.
  const t = await pgThread(fakeDb({ messages: [] }), T, ing());
  assert.equal(isThreadUnknown(t), false, "a first-time customer must not be state-unavailable");
  assert.equal(t.pausedUntil, 0, "a blank thread is not paused");
  assert.deepEqual(t.history, []);
  assert.deepEqual(t.replies, []);
  assert.equal(t.repliedBefore, false);
});

test("a conversation with rows comes back as the memory the gates read", async () => {
  const db = fakeDb({
    messages: [
      row({
        id: "u1",
        created_at: at(30),
        direction: "inbound",
        sender: "customer",
        status: "received",
        body: "do you take walk-ins?",
      }),
      row({ id: "a1", created_at: at(29), body: "We open at 9" }),
    ],
  });
  const t = await pgThread(db, T, ing({ paused_until: new Date(Date.parse(at(-60))).toISOString() }));
  assert.equal(isThreadUnknown(t), false);
  assert.deepEqual(
    t.history.map((h) => h.role),
    ["user", "assistant"],
  );
  assert.equal(t.replies.length, 1, "the answer spent one of the day's replies");
  assert.equal(t.repliedBefore, true, "something of ours has reached this person");
  assert.ok(t.pausedUntil > Date.now(), "the pause on the row IS the pause");
});

test("a read that FAILED is unknown, and fails closed", async () => {
  const t = await pgThread(brokenDb(), T, ing());
  assert.equal(isThreadUnknown(t), true, "a database blip must never read as a new customer");
  assert.equal(t.pausedUntil, -1, "the second line of defence: a caller that forgets the check still fails closed");
  assert.deepEqual(t.history, []);
});

test("no database, no workspace and no ingest are each unknown too", async () => {
  for (const [what, args] of [
    ["no database", [null, T, ing()]],
    ["no workspace", [fakeDb({ messages: [] }), null, ing()]],
    ["nothing ingested", [fakeDb({ messages: [] }), T, null]],
  ]) {
    assert.equal(isThreadUnknown(await pgThread(...args)), true, what);
  }
});

test("each unknown is its OWN object — no shared sentinel", async () => {
  // The first version of this exported a module-level object compared by
  // identity. Callers mutate what they are handed (`t.pausedUntil = ...`), so
  // every mutation accumulated on the one shared object and leaked between
  // customers inside a warm lambda.
  const a = await pgThread(null, T, ing());
  const b = await pgThread(null, T, ing());
  assert.notEqual(a, b, "two reads returned the same object");
  a.history.push({ role: "user", content: "poison" });
  a.pausedUntil = 999;
  assert.deepEqual(b.history, [], "mutating one thread's state changed another's");
  assert.equal(b.pausedUntil, -1);
});
