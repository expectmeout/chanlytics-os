/**
 * The intake hands a reach-out's reply to the reading (Reach out Part 5, PR 3; the plan's Task 3.2): core's
 * ingestEmail over fakes that log their calls. A person's reply to a reach-out is kept and flagged in its own words,
 * the reading is scheduled once, and the intake does not tell (the reading does, with what it meant); an automatic
 * reply is read too (it may say no, B1), and neither flagged nor told; an email that answers no reach-out is as it
 * was; and a failed question or a failed schedule throws before the message is marked handled, so the ledger's retry
 * finishes it and finds the reading already scheduled.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";

const { ingestEmail, EMAIL_REVIEW_WORDS } = await importSrc("packages/core/src/messages/email-ingest.ts");

const T = "t1";
const MAILBOX = { id: "mb1", tenant_id: T, address: "harbor@mail.example.com" };
const email = (over = {}) => ({
  id: "rcv_1",
  from: { address: "office@example.com", name: "Brightwater & Co." },
  to: [MAILBOX.address],
  cc: [],
  subject: "Re: A quick question",
  text: "This sounds useful. Can you send me more details?",
  messageId: "<reply-01@example.com>",
  inReplyTo: "<reach-out-0001@owner.example.com>",
  references: ["<reach-out-0001@owner.example.com>"],
  receivedAt: "2026-09-29T14:05:00Z",
  claim: "person",
  attachments: [],
  ...over,
});

function world(over = {}) {
  const log = [];
  const scheduled = new Set();
  const answers = {
    mailbox: MAILBOX,
    fetch: email(),
    erasedBefore: false,
    ours: false,
    record: { message_id: "m1", conversation_id: "c1", is_new: true, processed: false },
    escalate: "opened",
    tell: undefined,
    reachOutReply: true,
    // The ledger's once-per-message index: a second schedule of the same message is already there, not an error.
    readReply: (_t, messageId) => {
      scheduled.add(messageId);
    },
    markProcessed: undefined,
    received: undefined,
    ...over,
  };
  const ports = { now: () => Date.parse("2026-09-29T14:06:00Z") };
  for (const [name, answer] of Object.entries(answers)) {
    ports[name] = async (...args) => {
      log.push([name, ...args]);
      if (answer instanceof Error) throw answer;
      return typeof answer === "function" ? answer(...args) : answer;
    };
  }
  return { ports, log, scheduled, ops: () => log.map((l) => l[0]), call: (n) => log.find((l) => l[0] === n) };
}
const run = (w) => ingestEmail(w.ports, { payload: { mailbox_id: "mb1", received_id: "rcv_1" } });

test("a person's reply to a reach-out is kept, handed to the reading once, flagged in its own words, and not told", async () => {
  const w = world();
  assert.equal(await run(w), "kept_for_the_reading");
  assert.deepEqual(w.ops(), [
    "mailbox",
    "fetch",
    "ours",
    "erasedBefore",
    "record",
    "reachOutReply",
    "readReply",
    "escalate",
    "markProcessed",
    "received",
  ]);
  assert.deepEqual(w.call("reachOutReply"), ["reachOutReply", T, "m1"]);
  assert.deepEqual(w.call("readReply"), ["readReply", T, "m1"]);
  assert.deepEqual(w.call("escalate"), ["escalate", T, "c1", "email_review", EMAIL_REVIEW_WORDS.reach_out]);
  assert.match(EMAIL_REVIEW_WORDS.reach_out, /^They wrote back to your reach-out\. Nothing is sent without you/);
  assert.equal(w.call("tell"), undefined, "the reading tells the owner what it meant: never twice");
});

test("an automatic reply to a reach-out is read (it may say no), and neither flagged nor told", async () => {
  const w = world({ fetch: email({ claim: "auto_reply" }) });
  assert.equal(await run(w), "kept_for_the_reading");
  assert.deepEqual(w.ops(), [
    "mailbox",
    "fetch",
    "ours",
    "erasedBefore",
    "record",
    "reachOutReply",
    "readReply",
    "markProcessed",
    "received",
  ]);
});

test("an automated email answering a reach-out is read too, and flagged as a reply, not as a form", async () => {
  const w = world({ fetch: email({ claim: "automated" }) });
  assert.equal(await run(w), "kept_for_the_reading");
  assert.equal(w.call("escalate")[4], EMAIL_REVIEW_WORDS.reach_out);
  assert.equal(w.call("tell"), undefined);
});

test("an email that answers no reach-out is exactly as before: flagged in its words, told, never read", async () => {
  const w = world({ reachOutReply: false });
  assert.equal(await run(w), "kept_for_a_person");
  assert.equal(w.call("readReply"), undefined);
  assert.equal(w.call("escalate")[4], EMAIL_REVIEW_WORDS.person);
  assert.ok(w.call("tell"), "told as it always was");
});

test("a second intake of the same message finds the reading scheduled and carries on", async () => {
  const w = world({ record: { message_id: "m1", conversation_id: "c1", is_new: false, processed: false } });
  await run(w);
  await run(w);
  assert.deepEqual([...w.scheduled], ["m1"]);
  assert.equal(w.log.filter((l) => l[0] === "markProcessed").length, 2);
});

test("a failed question or a failed schedule throws before the message is marked handled", async () => {
  const unread = world({ reachOutReply: new Error("cannot read whose reply this is: timeout") });
  await assert.rejects(run(unread), /cannot read whose reply/);
  assert.equal(unread.call("markProcessed"), undefined, "the ledger's retry finishes it");
  assert.equal(unread.call("escalate"), undefined);

  const unscheduled = world({ readReply: new Error("schedule_job: the ledger is down") });
  await assert.rejects(run(unscheduled), /schedule_job/);
  assert.equal(unscheduled.call("markProcessed"), undefined);
});

test("a message already handled is not asked about again", async () => {
  const w = world({ record: { message_id: "m1", conversation_id: "c1", is_new: false, processed: true } });
  assert.equal(await run(w), "already_handled");
  assert.equal(w.call("reachOutReply"), undefined);
});
