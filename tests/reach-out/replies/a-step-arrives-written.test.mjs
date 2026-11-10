/**
 * A step arrives with its note written (decision 0120, D7). A reply read as not now leaves a step to write again on the
 * day they named, and one read as wrong person a step to write to whom they named. The reading's plan now says when the
 * step's note is written (`ahead`): the morning its step is due for a not-now, at once for a wrong person who named an
 * address. The reply's own job hands it to a stage of its own ("ahead"), which writes it only while it is still owed and
 * keeps it with the step; nothing sends it but a person.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { addressNamedIn, leadReplyNote, readingPlan, SECOND_KEY_OFF, stepDayFor } from "@chanlytics/contracts";
import { readReply } from "../../../packages/core/src/messages/reply-read.ts";

const T = "t1";
const M = "m1";
const STEP = "5e0a0000-0000-4000-8000-000000000042";
const TZ = "America/New_York";
/** Tuesday 29 September 2026, 10:05 AM in New York. */
const RECEIVED = Date.parse("2026-09-29T14:05:00.000Z");
const context = (over = {}) => ({
  claim: "person",
  receivedAt: RECEIVED,
  tz: TZ,
  business: "Harbor Dental",
  leadAddress: "office@harbor.example.com",
  leadWebsite: "harbor.example.com",
  replyFrom: "sam@harbor.example.com",
  reread: false,
  readAt: RECEIVED + 60_000,
  ...over,
});
const reading = (over = {}) => ({
  intent: "not_now",
  summary: "Ask again in November",
  day: "2026-11-02",
  referTo: null,
  signer: null,
  ...over,
});

test("a not-now's note is written the morning its step is due, and goes on their own thread", () => {
  const plan = readingPlan(reading(), context());
  assert.equal(plan.step.dueOn, stepDayFor("2026-11-02"));
  // 9:00 AM in New York on the step's day, after the clocks went back: five hours behind UTC.
  assert.deepEqual(plan.ahead, { kind: "again", at: "2026-11-02T14:00:00.000Z", to: null });
  // A day they named on a Saturday is the Monday after, its note too.
  const weekend = readingPlan(reading({ day: "2026-11-07" }), context());
  assert.equal(weekend.step.dueOn, "2026-11-09");
  assert.equal(weekend.ahead.at, "2026-11-09T14:00:00.000Z");
});

test("a wrong person who named an address has a first note to them written at once; one named by name alone, none", () => {
  const named = readingPlan(
    reading({ intent: "wrong_person", day: null, referTo: "Dana Ortiz, dana.ortiz@harbor.example.com." }),
    context(),
  );
  assert.deepEqual(named.ahead, {
    kind: "referral",
    at: new Date(RECEIVED + 60_000).toISOString(),
    to: "dana.ortiz@harbor.example.com",
  });
  const byName = readingPlan(reading({ intent: "wrong_person", day: null, referTo: "our office manager" }), context());
  assert.equal(byName.ahead, null);
  assert.ok(byName.step, "the step stands, for the owner to work out");
  // Naming the address that was written to, or the one that answered, is naming nobody new.
  assert.equal(addressNamedIn("write to office@harbor.example.com", "office@harbor.example.com", null), null);
  assert.equal(addressNamedIn("Sam <SAM@harbor.example.com>", null, "sam@harbor.example.com"), null);
});

test("the other readings write nothing ahead", () => {
  for (const intent of ["interested", "question", "no", "other"])
    assert.equal(readingPlan(reading({ intent, day: null }), context()).ahead, null, intent);
  const away = readingPlan(reading({ intent: "away", day: "2026-10-05" }), context({ claim: "auto_reply" }));
  assert.equal(away.ahead, null);
});

test("the receptionist is asked for the note they asked for, or a first note to whom they named, never an offer", () => {
  const again = leadReplyNote({
    business: "Harbor Dental",
    answered: "A quicker way to answer every call",
    kind: "again",
  });
  assert.match(again, /the day they named has come/);
  assert.match(again, /whether now is a better time/);
  assert.doesNotMatch(again, /Answer what they asked/);
  const referral = leadReplyNote({
    business: "Harbor Dental",
    answered: null,
    kind: "referral",
    referTo: "Dana, dana@harbor.example.com",
  });
  assert.match(referral, /<reply>Dana, dana@harbor\.example\.com<\/reply>/, "their words are fenced");
  assert.match(referral, /not to the business that answered/);
});

/** The job's ports over one kept reading, as the verb's own test keeps them, with the step's note's two. */
function world(over = {}) {
  const log = [];
  const state = { kept: over.kept ?? null, now: over.now ?? RECEIVED + 60_000 };
  const answers = { owed: true, draft: { text: "Hi Sam, you asked me to check back in November." }, ...over.answers };
  const call =
    (name, fn) =>
    async (...args) => {
      log.push([name, ...args]);
      return fn(...args);
    };
  const ports = {
    reply: call("reply", async () => ({
      conversationId: "c1",
      claim: "person",
      text: over.text ?? "Not right now. Ask me again in November.",
      subject: "Re: A quicker way to answer every call",
      from: "sam@harbor.example.com",
      receivedAt: RECEIVED,
      answered: "A quicker way to answer every call",
      business: "Harbor Dental",
      leadAddress: "office@harbor.example.com",
      leadWebsite: "harbor.example.com",
      tz: TZ,
    })),
    reading: call("reading", async () => (state.kept ? { ...state.kept } : null)),
    mayRead: call("mayRead", async () => null),
    ask: call("ask", async () => ({ answer: over.ask, second: SECOND_KEY_OFF })),
    apply: call("apply", async (_t, _m, p) => {
      state.kept = {
        intent: p.reading.intent,
        summary: p.reading.summary || null,
        unread: p.unread,
        rereads: p.reread,
        tell: false,
        told: false,
        undone: false,
        draft: null,
        draftState: "none",
        draftText: null,
        signerOffered: null,
        // What the door keeps of the plan: its note ahead, and the step it made (changed.step).
        ahead: p.plan.ahead,
        stepId: p.plan.step ? STEP : null,
        referTo: p.reading.referTo,
      };
      return true;
    }),
    draft: call("draft", async () => answers.draft),
    markDraft: call("markDraft", async () => true),
    claimTell: call("claimTell", async () => "claim"),
    tell: call("tell", async () => true),
    told: call("told", async () => undefined),
    scheduleOnce: call("scheduleOnce", async () => "scheduled"),
    resolveEscalation: call("resolveEscalation", async () => true),
    archiveConversation: call("archiveConversation", async () => true),
    aheadOwed: call("aheadOwed", async () => answers.owed),
    keepAhead: call("keepAhead", async () => undefined),
    now: () => state.now,
  };
  return { ports, log, state, calls: (name) => log.filter((l) => l[0] === name) };
}
const run = (w, stage, deadline = w.state.now + 40_000) =>
  readReply(w.ports, { tenantId: T, messageId: M, stage, tellStaleMs: 90_000, deadline });
const NOT_NOW = { intent: "not_now", summary: "Ask again in November", day: "2026-11-02", refer_to: null };
const WRONG = {
  intent: "wrong_person",
  summary: "Dana does the buying",
  day: null,
  refer_to: "Dana, dana@harbor.example.com",
};

test("the first read hands the note to its own stage, at the moment the plan names, once", async () => {
  const w = world({ ask: NOT_NOW });
  await run(w);
  const ahead = w.calls("scheduleOnce").filter(([, , p]) => p.stage === "ahead");
  assert.deepEqual(ahead, [
    ["scheduleOnce", Date.parse("2026-11-02T14:00:00.000Z"), { message_id: M, stage: "ahead" }],
  ]);
  assert.equal(w.calls("keepAhead").length, 0, "nothing is written before its day");
});

test("on its day the note is written by the receptionist and kept with its step, on their thread", async () => {
  const w = world({ ask: NOT_NOW });
  await run(w);
  w.state.now = Date.parse("2026-11-02T14:00:05.000Z");
  assert.equal(await run(w, "ahead"), "written");
  const [, tenant, owed] = w.calls("aheadOwed")[0];
  assert.equal(tenant, T);
  assert.deepEqual(owed, { messageId: M, conversationId: "c1", stepId: STEP, receivedAt: RECEIVED });
  const [, , asked] = w.calls("draft").at(-1);
  assert.equal(asked.kind, "again");
  assert.match(asked.note, /the day they named has come/);
  assert.deepEqual(w.calls("keepAhead")[0][2], {
    conversationId: "c1",
    messageId: M,
    stepId: STEP,
    text: "Hi Sam, you asked me to check back in November.",
    subject: "Re: A quicker way to answer every call",
    to: null,
  });
  assert.equal(w.calls("tell").length, 0, "the step is on Today on its day: nobody is told again");
});

test("a wrong person's first note is written at once, to whom they named", async () => {
  const w = world({
    ask: WRONG,
    answers: { draft: { text: "Hi Dana, Sam at Harbor Dental said you're the one to ask." } },
  });
  await run(w);
  const [, at, payload] = w.calls("scheduleOnce").find(([, , p]) => p.stage === "ahead");
  assert.equal(at, w.state.now, "now, as its step is due today");
  assert.deepEqual(payload, { message_id: M, stage: "ahead" });
  assert.equal(await run(w, "ahead"), "written");
  const [, , asked] = w.calls("draft").at(-1);
  assert.equal(asked.kind, "referral");
  assert.match(asked.note, /<reply>Dana, dana@harbor\.example\.com<\/reply>/);
  assert.equal(w.calls("keepAhead")[0][2].to, "dana@harbor.example.com");
});

test("a note no longer owed is not written: the step done, they wrote again, the lead closed", async () => {
  const w = world({ ask: NOT_NOW, answers: { owed: false } });
  await run(w);
  assert.equal(await run(w, "ahead"), "not_owed");
  assert.equal(w.calls("draft").length, 0);
  assert.equal(w.calls("keepAhead").length, 0);
  // Nor one whose reading was undone, or that plans none.
  const undone = world({
    kept: { intent: "not_now", undone: true, ahead: { kind: "again", at: "x", to: null }, stepId: STEP },
  });
  assert.equal(await run(undone, "ahead"), "not_owed");
  const none = world({ kept: { intent: "interested", undone: false, ahead: null, stepId: null } });
  assert.equal(await run(none, "ahead"), "not_owed");
});

test("a note the receptionist would not write leaves the step as it was; one with no time left is tried again", async () => {
  const refused = world({ ask: NOT_NOW, answers: { draft: { why: "budget" } } });
  await run(refused);
  assert.equal(await run(refused, "ahead"), "not_written");
  assert.equal(refused.calls("keepAhead").length, 0);
  const late = world({ ask: NOT_NOW });
  await run(late);
  await assert.rejects(run(late, "ahead", late.state.now + 1_000), /no time left/);
  assert.equal(late.calls("draft").filter(([, , a]) => a.kind === "again").length, 0);
});
