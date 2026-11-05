/**
 * A thread's draft, run (decision 0093): each port a fake that records its call, so what is proved is the order and the
 * outcome. Safe to run twice, a sender judged in the order a word outranks a reading, a slow run writing over nothing newer.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";

const core = await importSrc("packages/core/src/conversations/index.ts");
const { askReplyDraft, notACustomer, replyAnyway, rewriteReplyDraft, writeReplyDraft } = core;
const NOW = new Date("2026-11-04T12:00:00Z");
const T = "t1";
const C = "c1";

const thread = (over = {}) => ({
  contactId: "k1",
  holdReason: "email_review",
  holdDetails: null,
  forMessageId: "m1",
  theirWords: "Can you move a sofa on Friday?",
  theirSubject: "A sofa",
  theirName: "Rosa",
  theirAddress: "rosa@example.com",
  wire: "email",
  clocks: { whatsapp: null, instagram: null },
  optedOut: false,
  setAside: false,
  queuedReply: false,
  reachOutReply: false,
  kept: [],
  ...over,
});

function world(over = {}) {
  const log = [];
  const say =
    (name, answer) =>
    async (...args) => {
      log.push([name, ...args]);
      return typeof answer === "function" ? answer(...args) : answer;
    };
  const keptRow = (d) => ({ conversation_id: C, kind: d.kind, for_message_id: d.forMessageId, state: d.state });
  const given = (name, fallback) => (name in over ? over[name] : fallback);
  return {
    log,
    calls: (name) => log.filter((c) => c[0] === name),
    ports: {
      thread: say("thread", given("thread", thread())),
      claim: say("claim", given("claim", true)),
      keep: say("keep", given("keep", keptRow)),
      letGo: say("letGo", undefined),
      scheduleDraft: say("scheduleDraft", "scheduled"),
      setAside: say("setAside", true),
      sender: {
        said: say("said", over.said ?? null),
        talks: say("talks", over.talks ?? false),
        reading: say("reading", over.reading ?? null),
        read: say("read", over.read ?? null),
      },
      write: {
        reply: say(
          "writeReply",
          over.written ?? { text: "Yes, Friday works.", subject: "Re: A sofa", used: ["their email"] },
        ),
        brief: say("writeBrief", over.brief ?? { brief: { opening: "Hi", points: [], avoid: [], ask: "" }, used: [] }),
      },
    },
  };
}
const ask = (w, over = {}) => askReplyDraft(w.ports, { tenantId: T, conversationId: C, now: NOW, ...over });
const write = (w, over = {}) =>
  writeReplyDraft(w.ports, {
    tenantId: T,
    conversationId: C,
    kind: "reply",
    forMessageId: "m1",
    now: NOW,
    deadline: NOW.getTime() + 30_000,
    ...over,
  });

test("owed: the row says it is being written, and the job is asked for its message and this edition", async () => {
  const w = world();
  assert.equal(await ask(w), "asked");
  assert.equal(w.calls("claim")[0][1].forMessageId, "m1");
  const [, tenant, payload] = w.calls("scheduleDraft")[0];
  assert.equal(tenant, T);
  assert.equal(payload.conversation_id, C);
  assert.equal(payload.draft_kind, "reply");
  assert.equal(payload.message_id, "m1");
  assert.equal(typeof payload.rules, "string", "the once-only key reads a payload's strings alone");
});

test("run twice: the claim finds its row, and nothing more is scheduled", async () => {
  const w = world({ claim: false });
  assert.equal(await ask(w), "kept");
  assert.equal(w.calls("scheduleDraft").length, 0);
});

test("not owed, or gone: nothing is claimed", async () => {
  const none = world({ thread: thread({ holdReason: null }) });
  assert.equal(await ask(none), "not_owed");
  assert.equal(none.calls("claim").length, 0);
  const gone = world({ thread: null });
  assert.equal(await ask(gone), "gone");
});

test("the job keeps what was written, with what it was handed", async () => {
  const w = world();
  assert.equal(await write(w), "kept");
  const [, kept] = w.calls("keep")[0];
  assert.equal(kept.state, "ready");
  assert.equal(kept.words.text, "Yes, Friday works.");
  assert.equal(kept.words.subject, "Re: A sofa");
  assert.deepEqual(kept.used, ["their email"]);
});

test("the job run twice: what the first run kept is the answer, and no model is asked again", async () => {
  const { REPLY_DRAFT_RULES } = await import("@chanlytics/contracts");
  const row = { kind: "reply", for_message_id: "m1", rules: REPLY_DRAFT_RULES, state: "ready" };
  const w = world({ thread: thread({ kept: [row] }) });
  assert.equal(await write(w), "kept");
  assert.equal(w.calls("writeReply").length, 0);
  assert.equal(w.calls("keep").length, 0);
  // Still only claimed, or for an older message or edition, it is written.
  for (const kept of [
    { ...row, state: "writing" },
    { ...row, for_message_id: "m0" },
    { ...row, rules: REPLY_DRAFT_RULES - 1 },
  ]) {
    const again = world({ thread: thread({ kept: [kept] }) });
    assert.equal(await write(again), "kept");
    assert.equal(again.calls("writeReply").length, 1, JSON.stringify(kept));
  }
});

test("a hold answered while the job waited drafts nothing, and its claim is let go", async () => {
  const w = world({ thread: thread({ holdReason: null }) });
  assert.equal(await write(w), "not_owed");
  assert.equal(w.calls("writeReply").length, 0);
  assert.equal(w.calls("letGo").length, 1);
});

test("a run for a message that is no longer their newest stops: that message's own job has the row", async () => {
  const w = world({ thread: thread({ forMessageId: "m2" }) });
  assert.equal(await write(w), "older");
  assert.equal(w.calls("writeReply").length, 0);
  assert.equal(w.calls("keep").length, 0);
});

test("a row claimed for a newer message since is left alone: the slow run keeps nothing", async () => {
  const w = world({ keep: null });
  assert.equal(await write(w), "older");
});

test("what the writer refused is kept as why, and is a failure the page can say", async () => {
  const w = world({ written: { why: "budget" } });
  assert.equal(await write(w), "failed");
  const [, kept] = w.calls("keep")[0];
  assert.deepEqual([kept.state, kept.whyFailed], ["failed", "budget"]);
});

test("a sender read as selling to the business: kept as what it is, set aside, and the brain is never asked", async () => {
  const w = world({ reading: { kind: "pitch", about: "A vendor offering ads" } });
  assert.equal(await write(w), "set_aside");
  assert.equal(w.calls("writeReply").length, 0);
  const [, kept] = w.calls("keep")[0];
  assert.deepEqual([kept.state, kept.words.pitch], ["pitch", "A vendor offering ads."]);
  assert.deepEqual(w.calls("setAside")[0].slice(1), [T, C, "pitch"]);
  assert.ok(
    w.log.findIndex((c) => c[0] === "keep") < w.log.findIndex((c) => c[0] === "setAside"),
    "kept first: a set-aside that failed leaves the row saying what it is",
  );
});

test("the order a word outranks a reading: the owner's word, then whether they talk, then a reading, then a read", async () => {
  const person = world({ said: "person", reading: { kind: "pitch", about: "x" } });
  assert.equal(await write(person), "kept", "the owner said a person: a kept reading does not hide them");
  assert.equal(person.calls("reading").length, 0);

  const talks = world({ talks: true, reading: { kind: "pitch", about: "x" } });
  assert.equal(await write(talks), "kept", "someone the business talks with is not read at all");
  assert.equal(talks.calls("read").length, 0);

  const kept = world({ reading: { kind: "person", about: null } });
  assert.equal(await write(kept), "kept");
  assert.equal(kept.calls("read").length, 0, "a sender is read once");

  const fresh = world({ read: { kind: "notice", about: null } });
  assert.equal(await write(fresh), "set_aside");
  assert.equal(fresh.calls("setAside")[0][3], "notice");

  const automated = world({ said: "automated" });
  assert.equal(await write(automated), "set_aside", "the owner's word the other way needs no reading");
  assert.equal(automated.calls("read").length, 0);
});

test("a model that did not answer drafts it as a person's: a draft costs cents, hiding a customer does not", async () => {
  const w = world({ read: null });
  assert.equal(await write(w), "kept");
  assert.equal(w.calls("setAside").length, 0);
});

test("only an email's sender is read: a chat's thread is no pitch of this kind", async () => {
  const w = world({ thread: thread({ wire: "sms" }) });
  assert.equal(await write(w), "kept");
  assert.equal(w.calls("said").length, 0);
});

test("a brief for a call back asks nothing of a sender", async () => {
  const w = world({ thread: thread({ holdReason: "callback", wire: "whatsapp" }) });
  assert.equal(await write(w, { kind: "brief" }), "kept");
  assert.equal(w.calls("said").length, 0);
  assert.equal(w.calls("writeBrief").length, 1);
});

const rewrite = (w, over = {}) =>
  rewriteReplyDraft(w.ports, {
    tenantId: T,
    conversationId: C,
    kind: "reply",
    instruction: "shorter",
    by: "u1",
    now: NOW,
    deadline: NOW.getTime() + 30_000,
    ...over,
  });
const ready = (over = {}) => ({
  conversation_id: C,
  kind: "reply",
  for_message_id: "m1",
  words: { text: "Friday works." },
  state: "ready",
  rules: 5,
  ...over,
});

test("a member's change writes from the kept words, says who, and is said to be a rewrite", async () => {
  const w = world({ thread: thread({ kept: [ready()] }), claim: false });
  const out = await rewrite(w);
  assert.equal(out.done, true);
  const [, , asked] = w.calls("writeReply")[0];
  assert.deepEqual([asked.source, asked.instruction, asked.given], ["rewrite", "shorter", "Friday works."]);
  const [, kept] = w.calls("keep")[0];
  assert.deepEqual([kept.source, kept.madeBy], ["rewrite", "u1"]);
});

test("a change the writer refused leaves the kept words where they were, and says why", async () => {
  const w = world({ thread: thread({ kept: [ready()] }), claim: false, written: { why: "named_money" } });
  assert.deepEqual(await rewrite(w), { done: false, refused: "named_money" });
  assert.equal(w.calls("keep").length, 0);
});

test("Try again asks only of what is owed, takes a failed row, and a draft already written is the answer", async () => {
  const notOwed = world({ thread: thread({ holdReason: null }) });
  assert.deepEqual(await rewrite(notOwed, { instruction: null }), { done: false, refused: "not_owed" });

  const failed = world({ thread: thread({ kept: [ready({ state: "failed" })] }), claim: true });
  assert.equal((await rewrite(failed, { instruction: null })).done, true);
  assert.equal(failed.calls("claim")[0][1].again, true);

  const written = world({ thread: thread({ kept: [ready()] }), claim: false });
  assert.deepEqual(await rewrite(written, { instruction: null }), { done: true, draft: ready() });
  assert.equal(written.calls("writeReply").length, 0, "no model asked for what is already there");
});

test("Not a customer and Reply anyway: a door that moved no row says the thread moved", async () => {
  const conv = { id: C, tenant_id: T };
  const log = [];
  const ports = {
    notACustomer: async (...a) => (log.push(["not", ...a]), { decision_id: "d1" }),
    replyAnyway: async (...a) => (log.push(["anyway", ...a]), { decision_id: "d2" }),
  };
  assert.deepEqual(await notACustomer(ports, { conv, undo: false }), { set_aside: false, decision_id: "d1" });
  assert.deepEqual(await notACustomer(ports, { conv, undo: true }), { set_aside: true, decision_id: "d1" });
  assert.deepEqual(await replyAnyway(ports, { conv }), { reopened: true, decision_id: "d2" });
  assert.deepEqual(log, [
    ["not", T, C, false],
    ["not", T, C, true],
    ["anyway", T, C],
  ]);
  const moved = { notACustomer: async () => null, replyAnyway: async () => null };
  await assert.rejects(notACustomer(moved, { conv, undo: false }), (e) => e.code === "conflict");
  await assert.rejects(replyAnyway(moved, { conv }), (e) => e.code === "conflict");
});

test("the hold's own events ask, by whichever id each names, and any other event asks nothing", async () => {
  const { SUBSCRIBERS } = await importSrc("packages/core/src/subscribers.ts");
  const asked = [];
  const ports = { askReplyDraft: async (tenant, ref) => asked.push([tenant, ref]) };
  const event = (kind, subject_type, subject_id) => ({ tenant_id: T, kind, subject_type, subject_id, data: {} });
  await SUBSCRIBERS.reply_draft(event("escalation.opened", "conversation", C), ports);
  await SUBSCRIBERS.reply_draft(event("escalation.refreshed", "conversation", C), ports);
  await SUBSCRIBERS.reply_draft(event("escalation.changed", "escalation", "e1"), ports);
  await SUBSCRIBERS.reply_draft(event("message.received", "conversation", C), ports);
  assert.deepEqual(asked, [
    [T, { conversationId: C }],
    [T, { conversationId: C }],
    [T, { escalationId: "e1" }],
  ]);
});
