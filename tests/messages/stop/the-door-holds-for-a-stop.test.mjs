/**
 * Stop everything, at the one send door. A workspace whose owner stopped all sending (tenants.sending_stopped_at) sends
 * nothing by itself: the door refuses it as `stopped`, the way it refuses a workspace billing paused. Two things differ
 * from billing's pause, and both are proved here by running the door. The words the rules require (a STOP's
 * confirmation, HELP) still go. And what was going out by itself is HELD, never canceled: its queued row stays queued,
 * so it goes by itself once sending is resumed, unless its time has passed. A reply the receptionist had queued is not
 * held: someone is waiting for it, so it is canceled with its reason and its words are a person's to send.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";
import { withoutColumns } from "../../_schema.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { deliver } = await import(pathToFileURL(path.join(ROOT, "packages/core/dist/index.js")).href);

const WORKSPACE = "t1";
const NOW = Date.parse("2026-11-13T15:00:00.000Z");
const STOPPED_AT = "2026-11-13T14:00:00.000Z";

const stoppedThread = (tenants = {}) => ({
  id: "c1",
  tenant_id: WORKSPACE,
  paused_until: null,
  contacts: { consent: "opted_in", dnc: false, marketing_consent: "opted_in", erased_at: null },
  tenants: { status: "active", sending_stopped_at: STOPPED_AT, ...tenants },
});
const queuedRow = (over = {}) => ({
  id: "m1",
  tenant_id: WORKSPACE,
  conversation_id: "c1",
  status: "queued",
  body: "See you at 3",
  sender: "ai",
  direction: "outbound",
  created_at: "2026-11-13T14:59:00.000Z",
  ...over,
});
const worldOf = (over = {}) => ({ conversations: [stoppedThread()], messages: [], events: [], lines: [], ...over });

/** The door over a world, with a wire that counts what it was handed. */
async function knock(world, send) {
  let handed = 0;
  const wire = { whatsapp: async () => ((handed += 1), { ok: true, wamid: "wamid.1", status: 200 }) };
  const out = await deliver(
    { db: fakeDb(world), wire, now: () => NOW },
    {
      tenantId: WORKSPACE,
      conversationId: "c1",
      contactId: "k1",
      to: "+13475550101",
      channel: "whatsapp",
      sender: "ai",
      purpose: "conversational",
      proactive: false,
      about: "theirs",
      trigger: null,
      body: "See you at 3",
      ...send,
    },
  );
  return { out, handed };
}

test("a stopped workspace sends nothing by itself, and still sends a person's own words and the words the rules require", async () => {
  for (const [label, send, expected] of [
    ["the receptionist answering", { sender: "ai" }, "stopped"],
    ["a campaign's send", { sender: "human", proactive: true }, "stopped"],
    ["a person's own reply", { sender: "human" }, null],
    ["a STOP's confirmation", { sender: "system", kind: "system" }, null],
  ]) {
    const { out, handed } = await knock(worldOf(), send);
    if (expected) {
      assert.equal(out.outcome, "refused", label);
      assert.equal(out.reason, expected, label);
      assert.equal(handed, 0, `${label}: nothing reaches the wire`);
    } else {
      assert.equal(out.outcome, "sent", label);
      assert.equal(handed, 1, label);
    }
  }
});

test("billing's pause is said first: a workspace both paused and stopped is refused as paused", async () => {
  const world = worldOf({ conversations: [stoppedThread({ status: "paused" })] });
  const { out } = await knock(world, { sender: "ai" });
  assert.deepEqual([out.outcome, out.reason], ["refused", "paused"]);
});

test("a reply the receptionist had queued is canceled with its reason, for a person to send: someone is waiting for it", async () => {
  const world = worldOf({ messages: [queuedRow()] });
  const { out, handed } = await knock(world, { sender: "ai", messageId: "m1" });
  assert.deepEqual([out.outcome, out.reason, out.held ?? false], ["refused", "stopped", false]);
  assert.equal(handed, 0);
  assert.equal(world.messages[0].status, "canceled");
  assert.deepEqual(world.messages[0].error, { reason: "stopped" });
  assert.deepEqual(
    world.events.map((e) => [e.kind, e.data.reason]),
    [["message.send_blocked", "stopped"]],
  );
});

test("what was going out by itself is held, never canceled: its row stays queued and nothing is written about it", async () => {
  for (const [label, send] of [
    ["a message a sequence sends one person", { sender: "ai", proactive: true }],
    ["a campaign's email, queued before the door", { sender: "human", proactive: true }],
  ]) {
    const world = worldOf({ messages: [queuedRow({ sender: send.sender })] });
    const { out, handed } = await knock(world, { ...send, messageId: "m1" });
    assert.deepEqual([out.outcome, out.reason, out.held], ["refused", "stopped", true], label);
    assert.equal(handed, 0, label);
    assert.equal(world.messages[0].status, "queued", `${label}: still queued, to go once sending is resumed`);
    assert.equal(world.events.length, 0, `${label}: no event says it was blocked, since it was not`);
  }
});

test("a held send whose time has passed is too late, as it would be with no stop: it is canceled, not held for ever", async () => {
  const world = worldOf({ messages: [queuedRow()] });
  const { out } = await knock(world, { sender: "ai", proactive: true, messageId: "m1", staleAfter: NOW - 1 });
  assert.deepEqual([out.outcome, out.reason], ["refused", "too_late"]);
  assert.equal(world.messages[0].status, "canceled");
});

test("a database the stop's column has not reached reads as not stopped: the wire is read again without it, and the reply goes", async () => {
  await withoutColumns({ tenants: ["sending_stopped_at"] }, async () => {
    const world = worldOf({ conversations: [stoppedThread({ sending_stopped_at: undefined })] });
    const { out, handed } = await knock(world, { sender: "ai" });
    assert.equal(out.outcome, "sent", "the receptionist's reply is never lost to a column that is not there");
    assert.equal(handed, 1);
  });
});
