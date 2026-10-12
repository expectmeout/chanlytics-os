/**
 * A hold, told in the owner's words (decision 0043, contracts holdNotice): every reason a hold can carry reaches the
 * subject line as words, never as its token; the notice says who, their words, the receptionist's and the hold's own,
 * where to answer and the pause; an erased person is a customer with no words; the platform's copy holds no customer.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ESCALATION_REASONS, holdNotice } from "@chanlytics/contracts";

const facts = (over = {}) => ({
  conversationId: "c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0",
  reason: "stale",
  details: "Message arrived 42 minutes late — too old to answer automatically.",
  who: "Rosa Diaz",
  address: "+13055550142",
  channel: "sms",
  customerWords: "Are you open Sunday?",
  replyWords: null,
  pausedHours: null,
  erased: false,
  ...over,
});

test("every reason a hold can carry reaches the subject line in words, never as its token", () => {
  for (const reason of ESCALATION_REASONS) {
    const { subject } = holdNotice(facts({ reason }));
    const why = subject.split(" — ")[1];
    assert.ok(why && why.length > 8, `${reason} has words (${subject})`);
    assert.ok(!why.includes("_") && why !== reason, `${reason} is never said as its token`);
  }
});

test("the notice: who, their words, the receptionist's, the hold's own, where to answer, the pause", () => {
  const n = holdNotice(facts({ replyWords: "We open at 10 on Sunday.", pausedHours: 24 }));
  assert.deepEqual(
    [n.kind, n.route, n.about],
    [
      "handoff",
      "inbox/th-c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0",
      { type: "conversation", id: "c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0" },
    ],
  );
  assert.equal(n.subject, "Rosa Diaz needs a person — arrived too late to answer automatically");
  assert.equal(
    n.body,
    [
      "They wrote: “Are you open Sunday?”",
      "The receptionist: “We open at 10 on Sunday.”",
      "Message arrived 42 minutes late — too old to answer automatically.",
      "",
      "Text conversation · +1 (305) 555-0142",
      "Reply from the Inbox — the receptionist is paused on this thread for 24h.",
    ].join("\n"),
  );
  assert.equal(
    n.redactedBody,
    "A Text conversation needed a person (arrived too late to answer automatically), and nobody could be told.",
  );
  assert.match(
    holdNotice(facts({ who: null })).subject,
    /^\+1 \(305\) 555-0142 needs a person/,
    "the number stands in for a name",
  );
  assert.match(
    holdNotice(facts({ who: null, address: "rosa@example.com", channel: "email" })).body,
    /Email conversation · rosa@example\.com/,
  );
});

test("someone erased is a customer: no name, no words, no number, no hold's words", () => {
  const n = holdNotice(facts({ erased: true, replyWords: "We open at 10." }));
  assert.equal(n.subject, "A customer needs a person — arrived too late to answer automatically");
  assert.equal(n.body, "Text conversation\nReply from the Inbox.");
});
