/**
 * A hold, told in the owner's words (decision 0043, contracts holdNotice): every reason a hold can carry reaches the
 * subject line as words, never as its token; the notice says who, their words, the receptionist's and the hold's own,
 * where to answer and the pause; an erased person is a customer with no words; the platform's copy holds no customer.
 *
 * And, since decision 0048 (D1-hold-reasons), a reason has ONE vocabulary: the notice says it in the Inbox's words
 * (ESCALATION_REASON_SHORT) and ends with the verb the reason's act names (HOLD_ACT_WORDS: a reply to write, a call to
 * return, or nothing that may be sent), so the mail, the phone and the bell read as the Inbox, Today and People do.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ESCALATION_ACTS,
  ESCALATION_REASONS,
  ESCALATION_REASON_SHORT,
  HOLD_ACT_WORDS,
  holdActOf,
  holdNotice,
} from "@chanlytics/contracts";

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

test("a reason has one vocabulary: the notice says what the Inbox says, and 'nobody picked this up' is not 'has waited two hours for a person'", () => {
  for (const reason of ESCALATION_REASONS) {
    const n = holdNotice(facts({ reason }));
    assert.equal(
      n.subject,
      `Rosa Diaz needs a person — ${ESCALATION_REASON_SHORT[reason]}`,
      `${reason}: the Inbox's clause, not a second map's`,
    );
    assert.ok(
      n.redactedBody.endsWith(`(${ESCALATION_REASON_SHORT[reason]}), and nobody could be told.`),
      n.redactedBody,
    );
  }
  assert.equal(holdNotice(facts({ reason: "deadman" })).subject, "Rosa Diaz needs a person — nobody picked this up");
  assert.equal(holdNotice(facts({ reason: "manual" })).subject, "Rosa Diaz needs a person — flagged by hand");
  assert.equal(
    holdNotice(facts({ reason: "person_hold" })).subject,
    "Rosa Diaz needs a person — you handle this person",
  );
  // A reason the set does not know is a person needed, with no raw token said and no empty parenthesis.
  const odd = holdNotice(facts({ reason: "from_a_newer_deploy" }));
  assert.equal(odd.subject, "Rosa Diaz needs a person");
  assert.equal(odd.redactedBody, "A Text conversation needed a person, and nobody could be told.");
});

test("the reason carries its act: a reply to write, a call to return, or nothing that may be sent; the notice ends with that verb", () => {
  assert.equal(holdActOf("callback"), "call_back");
  assert.equal(holdActOf("opt_out"), "hand_back");
  assert.equal(holdActOf("rate_cap"), "reply");
  assert.equal(
    holdActOf("from_a_newer_deploy"),
    "reply",
    "a reason nobody knows is answered, as a person is needed for it",
  );
  assert.deepEqual(Object.keys(ESCALATION_ACTS).sort(), [...ESCALATION_REASONS].sort(), "every reason has its act");
  for (const reason of ESCALATION_REASONS) {
    const n = holdNotice(facts({ reason }));
    assert.ok(n.body.endsWith(HOLD_ACT_WORDS[holdActOf(reason)].notice), `${reason}: ${n.body}`);
  }
  assert.ok(holdNotice(facts({ reason: "callback" })).body.endsWith("Call them back."));
  assert.ok(holdNotice(facts({ reason: "opt_out" })).body.endsWith("Nothing can be sent to them."));
  // The pause rides after the verb, whichever it is.
  assert.ok(
    holdNotice(facts({ reason: "callback", pausedHours: 2 })).body.endsWith(
      "Call them back — the receptionist is paused on this thread for 2h.",
    ),
  );
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
  assert.equal(n.subject, "Rosa Diaz needs a person — too late for an automatic reply");
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
    "A Text conversation needed a person (too late for an automatic reply), and nobody could be told.",
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
  assert.equal(n.subject, "A customer needs a person — too late for an automatic reply");
  assert.equal(n.body, "Text conversation\nReply from the Inbox.");
});

test("the notice a hold that could not be written is told by (the handler's own, in the edge) says the same words and the same verb as the one read from its rows", async () => {
  const { handoffMessage } = await import("../../../../../apps/edge/lib/whatsapp/alerts.ts");
  const said = (reason, over = {}) =>
    handoffMessage({
      threadId: "13055550100",
      userText: "hi",
      botText: "(no reply sent)",
      reason,
      route: "inbox",
      who: "Rosa Diaz",
      about: null,
      channel: "sms",
      ...over,
    });
  // Each name the handler gives a hold it tells itself, with the reason the hold is written for: the Inbox's clause.
  for (const [why, reason] of [
    ["passed to a human", "human_token"],
    ["non-text message", "non_text"],
    ["state unavailable", "state_unavailable"],
    ["late message", "stale"],
    ["rate cap", "rate_cap"],
    ["budget", "budget"],
    ["wa_send_failed", "send_failed"],
    ["carriers", "carriers"],
    ["paused", "paused"],
  ]) {
    assert.equal(said(why).subject, `Rosa Diaz needs a person — ${ESCALATION_REASON_SHORT[reason]}`, why);
    assert.ok(said(why).body.endsWith(HOLD_ACT_WORDS[holdActOf(reason)].notice), why);
  }
  // A name that is no reason a hold carries is said in the handler's words, and one nobody knows as it came.
  assert.equal(said("location").subject, "Rosa Diaz needs a person — shared a location");
  assert.equal(said("something new").subject, "Rosa Diaz needs a person — something new");
  assert.ok(
    said("passed to a human", { pausedHours: 24 }).body.endsWith(
      "Reply from the Inbox — the receptionist is paused on this thread for 24h.",
    ),
  );
});
