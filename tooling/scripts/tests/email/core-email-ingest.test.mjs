/**
 * One received email, taken in: the verb, run over fakes that record their
 * calls, so what is proved is what it does, in what order, and what it never
 * does -- not the adapter's text.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";

const { ingestEmail, EMAIL_REVIEW_WORDS, EMAIL_BODY_MAX } = await importSrc(
  "packages/core/src/messages/email-ingest.ts",
);

const T = "t1";
const NOW = Date.parse("2026-09-17T12:00:00Z");
const MAILBOX = { id: "mb1", tenant_id: T, address: "bestmovers@mail.chanlytics.com" };
const email = (over = {}) => ({
  id: "rcv_1",
  from: { address: "Ana@Example.com", name: "Ana Reyes" },
  to: [MAILBOX.address],
  cc: [],
  subject: "Quote for Saturday",
  text: "Can you do Saturday at 9?",
  messageId: "<q1@customer.example>",
  inReplyTo: null,
  references: [],
  receivedAt: "2026-09-17T11:59:00Z",
  claim: "person",
  attachments: [],
  ...over,
});

/** Ports that answer what they are told and log every call by name. */
function world(over = {}) {
  const log = [];
  const answers = {
    mailbox: MAILBOX,
    fetch: email(),
    erasedBefore: false,
    ours: false,
    record: { message_id: "m1", conversation_id: "c1", is_new: true, processed: false },
    escalate: "opened",
    tell: undefined,
    markProcessed: undefined,
    received: undefined,
    ...over,
  };
  const ports = { now: () => NOW };
  for (const [name, answer] of Object.entries(answers)) {
    ports[name] = async (...args) => {
      log.push([name, ...args]);
      return typeof answer === "function" ? answer(...args) : answer;
    };
  }
  return { ports, log, ops: () => log.map((l) => l[0]), call: (name) => log.find((l) => l[0] === name) };
}
const run = (w) => ingestEmail(w.ports, { payload: { mailbox_id: "mb1", received_id: "rcv_1" } });

test("an email from a person is kept under their address in one spelling, flagged for a person, told once, and only then marked handled", async () => {
  const w = world();
  assert.equal(await run(w), "kept_for_a_person");
  assert.deepEqual(w.ops(), [
    "mailbox",
    "fetch",
    "ours",
    "erasedBefore",
    "record",
    "escalate",
    "tell",
    "markProcessed",
    "received",
  ]);
  const [, kept] = w.call("record");
  assert.equal(kept.address, "ana@example.com", "normalizeEmail's spelling, which is what a person is stored under");
  assert.equal(kept.receivedId, "rcv_1", "the provider's id is the replay gate, never the sender's own Message-ID");
  assert.equal(kept.body, "Can you do Saturday at 9?");
  assert.equal(kept.channelTs, "2026-09-17T11:59:00Z");
  assert.deepEqual(kept.meta.email, {
    subject: "Quote for Saturday",
    message_id: "<q1@customer.example>",
    in_reply_to: null,
    references: [],
    from: "Ana@Example.com",
    from_name: "Ana Reyes",
    to: [MAILBOX.address],
    cc: [],
    claim: "person",
    attachments: [],
    more_attachments: 0,
    truncated: false,
  });
  assert.deepEqual(w.call("escalate"), ["escalate", T, "c1", "email_review", EMAIL_REVIEW_WORDS.person]);
  assert.deepEqual(w.call("tell")[2], {
    conversationId: "c1",
    from: "ana@example.com",
    fromName: "Ana Reyes",
    subject: "Quote for Saturday",
    preview: "Can you do Saturday at 9?",
    claim: "person",
  });
  assert.deepEqual(w.call("erasedBefore"), ["erasedBefore", T, "ana@example.com", "2026-09-17T11:59:00Z"]);
});

test("a claim decides how LITTLE is done: an automatic reply is kept and never flagged; an automated email is flagged in its own words; a report is not a conversation", async () => {
  const auto = world({ fetch: email({ claim: "auto_reply" }) });
  assert.equal(await run(auto), "kept_quietly");
  assert.deepEqual(
    auto.ops(),
    ["mailbox", "fetch", "ours", "erasedBefore", "record", "markProcessed", "received"],
    "kept, handled, nobody paged: two responders answering each other is a loop",
  );

  const form = world({ fetch: email({ claim: "automated" }) });
  assert.equal(await run(form), "kept_for_a_person");
  assert.equal(form.call("escalate")[4], EMAIL_REVIEW_WORDS.automated);

  const bounce = world({
    fetch: email({ claim: "report", from: { address: "mailer-daemon@mx.example", name: null } }),
  });
  assert.equal(await run(bounce), "not_a_conversation");
  assert.equal(
    bounce.ops().includes("record"),
    false,
    "nothing is kept as a person's words, and nothing here suppresses an address: that is the provider's signed receipt",
  );
});

test("it resumes: a run that died after the row was stored finishes it; a row already handled ends there; a second email on a waiting thread is quiet", async () => {
  const interrupted = world({ record: { message_id: "m1", conversation_id: "c1", is_new: false, processed: false } });
  assert.equal(await run(interrupted), "kept_for_a_person");
  assert.deepEqual(
    interrupted.ops().slice(-4),
    ["escalate", "tell", "markProcessed", "received"],
    "REGRESSION guard: 'seen it, skip it' would have left this email stored and shown to nobody",
  );

  const done = world({ record: { message_id: "m1", conversation_id: "c1", is_new: false, processed: true } });
  assert.equal(await run(done), "already_handled");
  assert.equal(done.ops().includes("escalate"), false);

  const second = world({ escalate: "refreshed" });
  assert.equal(await run(second), "kept_for_a_person");
  assert.equal(second.ops().includes("tell"), false, "told once per hold, not once per email");
});

test("kept and not flagged is an email nobody will be shown: the job fails, the row stays unhandled, and the next try flags it", async () => {
  const w = world({ escalate: "failed" });
  await assert.rejects(run(w), /could not be flagged for a person/);
  assert.equal(w.ops().includes("markProcessed"), false);
});

test("what is not taken in, and why: our own email coming back, an email that belongs to an erasure, one with no sender, one the provider no longer has, a mailbox that is gone", async () => {
  const byId = world({ ours: true });
  assert.equal(await run(byId), "our_own");
  assert.deepEqual(byId.call("ours"), ["ours", T, "<q1@customer.example>"]);
  const bySender = world({
    fetch: email({ from: { address: "BestMovers@mail.chanlytics.com", name: null }, messageId: null }),
  });
  assert.equal(await run(bySender), "our_own");
  assert.equal(bySender.ops().includes("ours"), false, "no Message-ID to look up, and none needed");

  const erased = world({ erasedBefore: true });
  assert.equal(await run(erased), "erased_person");
  assert.equal(
    erased.ops().includes("record"),
    false,
    "received before they asked to be forgotten: taking it in late would make them again",
  );

  for (const from of [null, { address: "not an address", name: null }])
    assert.equal(await run(world({ fetch: email({ from }) })), "no_sender");
  assert.equal(await run(world({ fetch: null })), "gone");
  assert.equal(await run(world({ mailbox: null })), "gone");
  await assert.rejects(ingestEmail(world().ports, { payload: { mailbox_id: "mb1" } }), /received_id are required/);
  await assert.rejects(
    run(
      world({
        fetch: () => {
          throw new Error("resend: 503");
        },
      }),
    ),
    /resend: 503/,
    "could not ask is not gone: the job fails and the ledger tries again",
  );
});

test("a thread keeps a bounded amount of one email's words and attachments, and says when it kept less than there was", async () => {
  const many = Array.from({ length: 8 }, (_, i) => ({
    filename: `f${i}.pdf`,
    contentType: "application/pdf",
    size: 1000,
  }));
  const w = world({ fetch: email({ text: "x".repeat(EMAIL_BODY_MAX + 50), attachments: many }) });
  await run(w);
  const [, kept] = w.call("record");
  assert.equal(kept.body.length, EMAIL_BODY_MAX);
  assert.equal(kept.meta.email.truncated, true);
  assert.equal(kept.meta.email.attachments.length, 5);
  assert.equal(kept.meta.email.more_attachments, 3);
  assert.equal(w.call("tell")[2].preview.length, 280);
});
