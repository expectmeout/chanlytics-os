/**
 * A failure the provider reports after it took the message raises what a send that fails at the wire raises (the 2 Oct
 * 2026 audit, #5): the thread flagged for a person, the owner told, the ledger written, once per message.
 *
 * The verb is core's raiseLateFailure, run over fakes that log their calls. The doors that call it (WhatsApp's receipts,
 * Twilio's status callback) are proved over a database in memory in whatsapp/whatsapp-door.test.mjs and
 * sms/sms-status-door.test.mjs; what is proved here is the rule: whose failure it is, that it says it once, that it says it
 * in the words and the shape the send does, and that a flag that cannot be written tells nobody and throws.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";

const core = await importSrc("packages/core/src/messages/index.ts");

const REENGAGE = { errors: [{ code: 131047, title: "Re-engagement message" }] };

/** A message of ours, as the edge reads it by the provider's id. */
const facts = (over = {}) => ({
  messageId: "m1",
  conversationId: "c1",
  sender: "human",
  direction: "outbound",
  status: "sent",
  meta: {},
  to: "+13475550101",
  ...over,
});

/** The verb's ports, each write logged in order. `flag` is what the thread's flag comes to. */
function ports({ message = facts(), flag = "opened" } = {}) {
  const log = [];
  return {
    log,
    ops: () => log.map((l) => l[0]),
    ports: {
      message: async (id) => {
        log.push(["message", id]);
        return message instanceof Error ? Promise.reject(message) : message;
      },
      escalate: async (...args) => {
        log.push(["escalate", ...args]);
        return flag;
      },
      alert: async (news) => void log.push(["alert", news]),
      noteFailed: async (...args) => void log.push(["noteFailed", ...args]),
    },
  };
}
const late = (p, over = {}) =>
  core.raiseLateFailure(p.ports, { externalId: "wamid.1", channel: "whatsapp", error: REENGAGE, ...over });

test("a reply a person or the receptionist wrote, reported failed after it was taken, flags the thread, tells the owner and writes the ledger, in that order", async () => {
  const p = ports();
  assert.equal(await late(p), "raised");
  assert.deepEqual(p.ops(), ["message", "escalate", "alert", "noteFailed"]);
  const [, conversation, reason, details] = p.log[1];
  assert.deepEqual([conversation, reason], ["c1", "send_failed"]);
  assert.equal(
    details,
    "A reply from your team was accepted for sending but did not reach them. WhatsApp wouldn't send it: more than 24 hours have passed since they last replied, so only a template message can reach them now (WhatsApp error 131047).",
  );
  assert.deepEqual(p.log[2][1], {
    kind: "handoff",
    route: "inbox/th-c1",
    about: { type: "conversation", id: "c1" },
    subject: "Reply delivery failed: +13475550101",
    body: "A reply from your team was accepted for sending, and then the provider reported that it was not delivered. WhatsApp wouldn't send it: more than 24 hours have passed since they last replied, so only a template message can reach them now (WhatsApp error 131047). The thread is flagged in the Inbox.",
  });
  assert.deepEqual(p.log[3], [
    "noteFailed",
    "m1",
    { reason: "receipt", outcome: "refused", body: JSON.stringify(REENGAGE) },
  ]);
});

test("the alert is the shape a send that fails at the wire raises: one function says it, so the two cannot come to say it differently", async () => {
  // The send's own: a queued reply the door could not carry.
  const sent = [];
  await core.sendQueued(
    {
      queued: async () => ({ status: "queued", body: "See you at 3", channel: "whatsapp", sender: "human" }),
      purposeOf: async () => "conversational",
      claim: async () => true,
      release: async () => {},
      deliver: async () => ({
        outcome: "failed",
        reason: "no_credentials",
        status: 503,
        errorBody: "x",
        messageId: "m1",
      }),
      escalate: async (...a) => void sent.push(["escalate", ...a]),
      alert: async (news) => void sent.push(["alert", news]),
      retry: async () => {},
      now: () => Date.parse("2026-10-05T12:00:00Z"),
      random: () => 0,
    },
    {
      tenantId: "t1",
      payload: { message_id: "m1", conversation_id: "c1", to_phone: "+13475550101", body: "See you at 3" },
    },
  );
  const p = ports();
  await late(p);
  const [wireEscalate, wireAlert] = [sent[0], sent[1][1]];
  const [, , lateReason] = p.log[1];
  const lateAlert = p.log[2][1];
  assert.equal(wireEscalate[2], lateReason, "the same reason");
  assert.deepEqual(
    [wireAlert.kind, wireAlert.route, wireAlert.about, wireAlert.subject],
    [lateAlert.kind, lateAlert.route, lateAlert.about, lateAlert.subject],
    "the same kind, the same door to the same thread, the same subject",
  );
});

test("the receptionist's reply is said as the receptionist's", async () => {
  const p = ports({ message: facts({ sender: "ai" }) });
  assert.equal(await late(p), "raised");
  assert.match(p.log[1][3], /^The receptionist's reply was accepted for sending but did not reach them\. /);
  assert.match(p.log[2][1].body, /^The receptionist's reply was accepted for sending, and then/);
});

test("a failure whose row says nothing readable is still raised, in the provider's words that it did not deliver it", async () => {
  const p = ports({ message: facts({ to: null }) });
  assert.equal(await late(p, { error: {} }), "raised");
  assert.match(p.log[1][3], /The provider reported it as not delivered\.$/);
  assert.equal(p.log[2][1].subject, "Reply delivery failed: a customer");
});

test("only a message a person or the receptionist wrote to a customer is news: a campaign's send, a customer's row and a system note are not, and nothing is written for them", async () => {
  for (const [name, over, outcome] of [
    ["a broadcast's send", { meta: { source: "broadcast", broadcast_name: "Spring" } }, "not_a_reply"],
    [
      "a playbook run's send",
      { meta: { source: "broadcast", playbook_id: "p", playbook_name: "Win-back" } },
      "not_a_reply",
    ],
    ["a reach-out's step", { meta: { source: "reach_out" } }, "not_a_reply"],
    ["a system note", { sender: "system" }, "not_a_reply"],
    ["the customer's own message", { sender: "customer", direction: "inbound" }, "not_a_reply"],
    ["an inbound row", { direction: "inbound" }, "not_a_reply"],
  ]) {
    const p = ports({ message: facts(over) });
    assert.equal(await late(p), outcome, name);
    assert.deepEqual(p.ops(), ["message"], `${name}: nothing flagged, told or written`);
  }
  const none = ports({ message: null });
  assert.equal(await late(none), "not_ours", "an id no message of this workspace carries");
  assert.deepEqual(none.ops(), ["message"]);
});

test("once per message: a row already failed or canceled is a receipt seen before and raises nothing", async () => {
  for (const status of ["failed", "canceled"]) {
    const p = ports({ message: facts({ status }) });
    assert.equal(await late(p), "already_over", status);
    assert.deepEqual(p.ops(), ["message"], status);
  }
  for (const status of ["sent", "delivered", "read", "queued"]) {
    const p = ports({ message: facts({ status }) });
    assert.equal(await late(p), "raised", `${status} moves to failed, which is news`);
  }
});

test("a flag that could not be written throws before anyone is told or anything is written, so the receipt's redelivery says it again", async () => {
  const p = ports({ flag: "failed" });
  await assert.rejects(late(p), /could not be flagged/);
  assert.deepEqual(p.ops(), ["message", "escalate"], "no bell for a thread that is not flagged, no ledger row");

  // Every other way a flag lands is a flag: a new hold, or one that changed its reason, is told.
  for (const flag of ["opened", "changed"]) {
    const ok = ports({ flag });
    assert.equal(await late(ok), "raised", flag);
    assert.deepEqual(ok.ops(), ["message", "escalate", "alert", "noteFailed"], flag);
  }
});

test("once per hold: a thread already held for a failed send is brought up to date and rings no second bell", async () => {
  // Meta can send one failed receipt twice in one delivery, and a run of replies to one customer can fail one after
  // another. Each reached the owner as its own email and bell, though the thread was flagged once: the rule every other
  // caller of the flag keeps (jobs escalate.ts) is a notice per hold.
  const again = ports({ flag: "refreshed" });
  assert.equal(await late(again), "raised");
  assert.deepEqual(
    again.ops(),
    ["message", "escalate", "noteFailed"],
    "REGRESSION: a second bell for a hold the owner was already told of",
  );
  assert.match(again.log[1][3], /did not reach them/, "the flag's details say the newest failure");
});

test("a message that cannot be read is the receipt's to say again: the read's own error reaches the door", async () => {
  const p = ports({ message: new Error("messageByExternalId: the database is down") });
  await assert.rejects(late(p), /the database is down/);
  assert.deepEqual(p.ops(), ["message"]);
});

test("a text's receipt is read as Twilio's: the code in its own words, and a status with no code in the carrier's", async () => {
  const p = ports();
  await late(p, { channel: "sms", error: { carrier: "undelivered", code: "30007" } });
  assert.match(p.log[1][3], /The text was filtered as a possible policy violation \(Twilio error 30007\)\.$/);
  const q = ports();
  await late(q, { channel: "sms", error: { carrier: "undelivered" } });
  assert.match(q.log[1][3], /The carrier didn't deliver it\.$/);
});

/* ---------------------------------------------------- the read the edge makes of the message */

test("the message the provider's id names is read in its own workspace, with where it went; none, or a read that fails, is not a guess", async () => {
  const { fakeDb } = await import("../_fake-db.mjs");
  const { messageByExternalId } = await import("@chanlytics/db");
  const T = "aaaaaaaa-0000-4000-8000-0000000000e1";
  const OTHER = "bbbbbbbb-0000-4000-8000-0000000000e1";
  const row = (id, tenant_id, over = {}) => ({
    id,
    tenant_id,
    conversation_id: `cv-${id}`,
    contact_id: null,
    direction: "outbound",
    sender: "human",
    channel: "whatsapp",
    external_id: "wamid.same",
    status: "sent",
    meta: { source: "broadcast" },
    ...over,
  });
  // The person's row rides on the message as the select's embed (the database in memory takes an embed as a fixture seeds it).
  const dana = { phone_e164: "+13475550101", email: "dana@example.com" };
  const tables = {
    messages: [
      row("mine", T, { contact_id: "k1", contacts: dana }),
      row("theirs", OTHER),
      row("mail", T, { external_id: "re_1", channel: "email", contact_id: "k1", contacts: dana }),
      row("alone", T, { external_id: "wamid.alone", contacts: null }),
    ],
  };
  const db = fakeDb(tables);
  assert.deepEqual(await messageByExternalId(db, T, "wamid.same"), {
    messageId: "mine",
    conversationId: "cv-mine",
    direction: "outbound",
    sender: "human",
    status: "sent",
    meta: { source: "broadcast" },
    to: "+13475550101",
  });
  assert.equal((await messageByExternalId(db, T, "re_1")).to, "dana@example.com", "an email went to their address");
  assert.equal((await messageByExternalId(db, T, "wamid.alone")).to, null, "a row naming no person names no one");
  assert.equal(await messageByExternalId(db, T, "wamid.nobody"), null);
  await assert.rejects(
    messageByExternalId(fakeDb(tables, { "messages.select": { message: "down" } }), T, "wamid.same"),
    /messageByExternalId: down/,
  );
});
