/**
 * A redelivery stops at the replay gate before the thread's memory is read (core inbound/ingest.ts): Meta sends a
 * message again for days, and each of those visits used to read the whole thread before it was told it had nothing to do.
 * A message a job takes up again (`resume`) still reads it, since it goes on to be answered.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runtime, text, world } from "./_world.mjs";

const onAsk = runtime({ policy: { reply: { mode: "ask", limits: {} } } });

test("a redelivered message reads no memory, and changes nothing", async () => {
  const w = world({ rt: onAsk });
  const m = text("are you open saturday?", "wamid.again");
  await w.run(m);
  assert.equal(w.seen.threadReads, 1, "the first delivery reads the thread once");
  const asked = w.seen.escalations.length;
  await w.run(m);
  assert.equal(w.seen.threadReads, 1, "the redelivery stops before the memory is read");
  assert.equal(w.seen.escalations.length, asked, "and asks nobody a second time");
});

test("a message its job takes up again still reads the memory it answers from", async () => {
  const line = {
    channel: "sms",
    send: async () => ({ ok: true, wamid: "SM1", status: 201 }),
    body: (t) => t,
    held: null,
  };
  const w = world({ rt: onAsk, carrier: line });
  const m = text("are you open saturday?", "SM-job");
  await w.record(m);
  assert.equal(w.seen.threadReads, 0, "the door records it and reads no memory");
  await w.run(m, {}, true);
  assert.equal(w.seen.threadReads, 1, "its job reads the memory before it answers");
  assert.equal(w.seen.escalations.length, 1, "and the message is held for a person, as the mode says");
});
