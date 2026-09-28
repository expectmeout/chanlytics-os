/**
 * A reply read (Reach out Part 5, PR 3; the plan's Task 3.3): core's readReply, run over fakes that record their calls,
 * so what is proved is what it does and in what order. One reading per message; what may be spent and what a failure
 * does; a reply that could not be read read again, at most three times; each fixture's answer applied with
 * readingPlan's own plan; an automatic reply's no and wrong person applied and told (B1), its away recorded and not
 * told; and the notice in two phases, claim then tell then mark, never the mark before the telling (B2).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readingPlan, parseReplyReading, replyNoticeWords, REPLY_REREADS } from "@chanlytics/contracts";
import { readReply, rereadOf } from "../../../../packages/core/src/messages/reply-read.ts";
import { loadFixtures } from "../../evals/reply-intents.mjs";

const T = "t1";
const M = "m1";
const HOUR = 3_600_000;
const set = loadFixtures();
const RECEIVED = Date.parse("2026-09-29T14:05:00.000Z");
const facts = (over = {}) => ({
  conversationId: "c1",
  claim: "person",
  text: "This sounds useful. Can you send me more details?",
  subject: "Re: A quick question",
  from: "office@example.com",
  receivedAt: RECEIVED,
  answered: set.answered,
  business: set.lead.business,
  leadAddress: set.lead.address,
  leadWebsite: set.lead.website,
  tz: set.lead.tz,
  ...over,
});
const INTERESTED = { intent: "interested", summary: "Wants more details", day: null, refer_to: null };
const NO = { intent: "no", summary: "Asks to be taken off the list", day: null, refer_to: null };

/**
 * Ports over one kept reading. `apply` keeps what the door would (the reading, its plan's tell, a re-read's count) so
 * the verb's read back sees it; every call is logged by name.
 */
function world(over = {}) {
  const log = [];
  const state = { kept: over.kept ?? null, now: over.now ?? RECEIVED + 60_000, claimed: false };
  const answers = {
    reply: facts(over.facts),
    mayRead: null,
    ask: INTERESTED,
    claimTell: "2026-09-29T14:06:00.000001+00:00",
    tell: true,
    ...over.answers,
  };
  const call =
    (name, fn) =>
    async (...args) => {
      log.push([name, ...args]);
      return fn(...args);
    };
  const ports = {
    reply: call("reply", async () => answers.reply),
    reading: call("reading", async () => (state.kept ? { ...state.kept } : null)),
    mayRead: call("mayRead", async () => answers.mayRead),
    ask: call("ask", async () => {
      if (answers.ask instanceof Error) throw answers.ask;
      return answers.ask;
    }),
    apply: call("apply", async (_t, _m, p) => {
      if (answers.apply === false) return false;
      state.kept = {
        intent: p.reading.intent,
        summary: p.reading.summary || null,
        unread: p.unread,
        rereads: p.reread,
        tell: p.plan.tell,
        told: p.plan.tell ? false : (state.kept?.told ?? false),
        undone: false,
        draft: p.plan.draft,
        draftState: state.kept?.draftState ?? "none",
        draftText: state.kept?.draftText ?? null,
      };
      return true;
    }),
    draft: call("draft", async () => answers.draft ?? { why: "no_receptionist" }),
    markDraft: call("markDraft", async (_t, _m, mark) => {
      if (!state.kept || !["none", "waiting"].includes(state.kept.draftState)) return false;
      state.kept = {
        ...state.kept,
        draftState: mark.state,
        draftText: mark.state === "written" ? mark.draft : state.kept.draftText,
      };
      return true;
    }),
    claimTell: call("claimTell", async () => answers.claimTell),
    tell: call("tell", async () => answers.tell),
    told: call("told", async () => {
      state.kept = { ...state.kept, told: true };
    }),
    scheduleOnce: call("scheduleOnce", async () => "scheduled"),
    now: () => state.now,
  };
  return {
    ports,
    log,
    state,
    ops: () => log.map((l) => l[0]),
    calls: (name) => log.filter((l) => l[0] === name),
  };
}
const run = (w, stage, deadline = w.state.now + 40_000) =>
  readReply(w.ports, { tenantId: T, messageId: M, stage, tellStaleMs: 90_000, deadline });

test("a stage is the first read, or one of three re-reads; anything else is a caller's bug", () => {
  assert.equal(rereadOf(undefined), 0);
  assert.equal(rereadOf("read"), 0);
  assert.equal(rereadOf("reread-1"), 1);
  assert.equal(rereadOf("reread-3"), 3);
  assert.throws(() => rereadOf("reread-4"));
  assert.throws(() => rereadOf("draft"));
});

test("a reply that answers no reach-out is nobody's: nothing is read, spent or applied", async () => {
  const w = world({ answers: { reply: null } });
  assert.equal(await run(w), "not_a_reply");
  assert.deepEqual(w.ops(), ["reply"]);
});

test("a reply read: the gate, the model, the plan applied, the draft tried, then claim, tell and mark, in that order", async () => {
  const w = world();
  assert.equal(await run(w), "told");
  assert.deepEqual(w.ops(), [
    "reply",
    "reading",
    "mayRead",
    "ask",
    "apply",
    "reading",
    "draft",
    "markDraft",
    "reading",
    "claimTell",
    "tell",
    "told",
  ]);
  const [, , , applied] = w.calls("apply")[0];
  assert.deepEqual(applied.reading, parseReplyReading(INTERESTED));
  assert.equal(applied.unread, null);
  assert.equal(applied.reread, 0);
  assert.deepEqual(
    applied.plan,
    readingPlan(parseReplyReading(INTERESTED), {
      claim: "person",
      receivedAt: RECEIVED,
      tz: set.lead.tz,
      business: set.lead.business,
      leadAddress: set.lead.address,
      leadWebsite: set.lead.website,
      replyFrom: "office@example.com",
      reread: false,
      readAt: RECEIVED + 60_000,
    }),
  );
  const [system, user] = w.calls("ask")[0].slice(1);
  assert.match(system, /seven intents/);
  assert.match(user, /<reply>/);
  assert.match(user, /2026-09-29 \(Tuesday\)/, "the day it arrived, in the business's zone, with its weekday");
  const [, , notice] = w.calls("tell")[0];
  const words = replyNoticeWords({
    intent: "interested",
    business: set.lead.business,
    summary: "Wants more details",
    quote: "This sounds useful. Can you send me more details?",
    draft: null,
    unread: null,
    automatic: false,
    reread: false,
  });
  assert.deepEqual(notice, {
    conversationId: "c1",
    subject: words.subject,
    body: words.body,
    redacted: words.redacted,
  });
  assert.equal(notice.subject, `${set.lead.business} wrote back · interested`);
  assert.equal(w.calls("claimTell")[0][3], RECEIVED + 60_000 - 90_000, "stale after the job's lease");
});

test("a reply read before asks no model and pays nothing; once told, it tells nobody", async () => {
  const told = world({
    kept: { intent: "interested", summary: "x", unread: null, rereads: 0, tell: true, told: true, undone: false },
  });
  assert.equal(await run(told), "read");
  assert.deepEqual(told.ops(), ["reply", "reading"]);

  const untold = world({
    kept: { intent: "interested", summary: "x", unread: null, rereads: 0, tell: true, told: false, undone: false },
  });
  assert.equal(await run(untold), "told", "a run that died after the apply tells on the next try");
  assert.deepEqual(untold.ops(), ["reply", "reading", "claimTell", "tell", "told"]);
});

test("the spend: no model, a workspace that may not spend, a spent day: other with its why, asked of no model", async () => {
  for (const why of ["no_model", "may_not_spend", "day_spent"]) {
    const w = world({ answers: { mayRead: why } });
    assert.equal(await run(w), "told", why);
    assert.equal(w.calls("ask").length, 0, `${why}: no model is asked`);
    const [, , , applied] = w.calls("apply")[0];
    assert.equal(applied.reading.intent, "other");
    assert.equal(applied.unread, why);
    assert.equal(applied.plan.stops, true, "a person's reply stops the chain, read or not");
    assert.equal(applied.plan.tell, true);
    assert.equal(applied.plan.draft, null);
    assert.equal(w.calls("scheduleOnce").length, 1, `${why}: read again later`);
    assert.match(w.calls("tell")[0][2].body, /could not be read/);
  }
});

test("a model that threw, ran out of time or answered nothing usable is model_failed, and read again in an hour", async () => {
  for (const ask of [new Error("overloaded"), null, { intent: "maybe" }, "not json"]) {
    const w = world({ answers: { ask } });
    await run(w);
    const [, , , applied] = w.calls("apply")[0];
    assert.equal(applied.unread, "model_failed");
    const [, at, payload] = w.calls("scheduleOnce")[0];
    assert.equal(at, RECEIVED + 60_000 + HOUR);
    assert.deepEqual(payload, { message_id: M, stage: "reread-1" });
  }
});

test("read again: a re-read that reads no applies it in place of other and is told again; interested is told nobody", async () => {
  const unread = {
    intent: "other",
    summary: null,
    unread: "model_failed",
    rereads: 0,
    tell: true,
    told: true,
    undone: false,
  };
  const no = world({ kept: unread, answers: { ask: NO }, now: RECEIVED + 2 * HOUR });
  assert.equal(await run(no, "reread-1"), "told");
  const [, , , applied] = no.calls("apply")[0];
  assert.equal(applied.reread, 1);
  assert.equal(applied.plan.saidNo, true);
  assert.equal(applied.plan.tell, true);
  assert.equal(applied.plan.draft, null, "a re-read drafts nothing");
  assert.match(no.calls("tell")[0][2].subject, /said no \(read again later\)$/);

  const yes = world({ kept: unread, answers: { ask: INTERESTED }, now: RECEIVED + 2 * HOUR });
  assert.equal(await run(yes, "reread-1"), "read");
  assert.equal(yes.calls("apply")[0][3].plan.convert, true, "Talking, as the first read would have made them");
  assert.equal(yes.calls("tell").length, 0, "the owner was told they wrote back already");
});

test("a re-read of a reading already read, undone, or at another stage does nothing", async () => {
  const read = { intent: "no", summary: null, unread: null, rereads: 0, tell: true, told: true, undone: false };
  const w = world({ kept: read });
  assert.equal(await run(w, "reread-1"), "already_read");
  assert.deepEqual(w.ops(), ["reply", "reading"]);

  const undone = world({ kept: { ...read, intent: "other", unread: "day_spent", undone: true } });
  assert.equal(await run(undone, "reread-1"), "already_read");

  const ahead = world({ kept: { ...read, intent: "other", unread: "day_spent", rereads: 2 } });
  assert.equal(await run(ahead, "reread-1"), "already_read", "a later re-read has the row");
  assert.equal(ahead.calls("apply").length, 0);
});

test("the last re-read that still cannot read schedules nothing more, and seven days bound them all", async () => {
  const still = {
    intent: "other",
    summary: null,
    unread: "day_spent",
    rereads: REPLY_REREADS - 1,
    tell: true,
    told: true,
    undone: false,
  };
  const w = world({ kept: still, answers: { mayRead: "day_spent" }, now: RECEIVED + 3 * 24 * HOUR });
  assert.equal(await run(w, `reread-${REPLY_REREADS}`), "read");
  assert.equal(w.calls("apply")[0][3].reread, REPLY_REREADS);
  assert.equal(w.calls("scheduleOnce").length, 0, "three re-reads, and no more");

  const late = world({ answers: { mayRead: "day_spent" }, now: RECEIVED + 7 * 24 * HOUR });
  await run(late);
  assert.equal(late.calls("scheduleOnce").length, 0, "past seven days of the reply, nothing is read again");

  const day = world({ answers: { mayRead: "day_spent" } });
  await run(day);
  assert.equal(
    day.calls("scheduleOnce")[0][1],
    Date.parse("2026-09-30T00:00:00.000Z"),
    "the next UTC day's first minute",
  );
});

test("a run that dies after an unread apply schedules its re-read on the next try, once per stage", async () => {
  const kept = {
    intent: "other",
    summary: null,
    unread: "model_failed",
    rereads: 0,
    tell: true,
    told: false,
    undone: false,
  };
  const w = world({ kept });
  assert.equal(await run(w), "told");
  assert.deepEqual(w.ops(), ["reply", "reading", "scheduleOnce", "claimTell", "tell", "told"]);
  assert.deepEqual(w.calls("scheduleOnce")[0][2], { message_id: M, stage: "reread-1" });
});

test("every fixture's answer is applied with readingPlan's own plan; the plan's context comes from the message", async () => {
  for (const r of set.replies) {
    const claim = r.expect.claim;
    const w = world({
      facts: {
        claim,
        text: r.email.text,
        subject: r.email.subject,
        from: r.email.from.address,
        receivedAt: Date.parse(r.email.createdAt),
      },
      answers: { ask: r.answer },
      now: Date.parse(r.email.createdAt) + 60_000,
    });
    await run(w);
    const [, , , applied] = w.calls("apply")[0];
    const want = readingPlan(parseReplyReading(r.answer), {
      claim,
      receivedAt: Date.parse(r.email.createdAt),
      tz: set.lead.tz,
      business: set.lead.business,
      leadAddress: set.lead.address,
      leadWebsite: set.lead.website,
      replyFrom: r.email.from.address,
      reread: false,
      readAt: Date.parse(r.email.createdAt) + 60_000,
    });
    assert.deepEqual(applied.plan, want, r.email.id);
    assert.equal(applied.reading.intent, r.expect.intent, r.email.id);
    // PR 3 has no draft stage: the plan may name one, and nothing here writes it.
    assert.equal(w.calls("tell").length, want.tell ? 1 : 0, `${r.email.id}: told only when its row of G6 tells`);
  }
});

test("an automatic reply (B1): a no and a wrong person are applied and told; an away is recorded and told nobody", async () => {
  const auto = (answer) =>
    world({ facts: { claim: "auto_reply", from: "noreply@example.com" }, answers: { ask: answer } });
  const no = auto(NO);
  assert.equal(await run(no), "told");
  const noPlan = no.calls("apply")[0][3].plan;
  assert.equal(noPlan.saidNo, true);
  assert.equal(noPlan.suppressFrom, "noreply@example.com");
  assert.equal(noPlan.suppressDomain, "example.com");
  assert.equal(noPlan.skipSends, "outreach_wrote_back");
  assert.match(no.calls("tell")[0][2].subject, /automatic reply asks to be taken off your list/);

  const wrong = auto({ intent: "wrong_person", summary: "Has left", day: null, refer_to: "Dana at dana@example.com" });
  assert.equal(await run(wrong), "told");
  assert.equal(wrong.calls("apply")[0][3].plan.step.dueOn, "2026-09-29");

  const away = auto({ intent: "away", summary: "Out until October 5", day: "2026-10-05", refer_to: null });
  assert.equal(await run(away), "read");
  const awayPlan = away.calls("apply")[0][3].plan;
  assert.equal(awayPlan.awayUntil, "2026-10-06T04:00:00.000Z", "recorded: 00222's pause reads it");
  assert.equal(away.calls("tell").length, 0);

  const ack = auto({ intent: "other", summary: "Received", day: null, refer_to: null });
  assert.equal(await run(ack), "read");
  assert.equal(ack.calls("apply")[0][3].plan.stops, false, "an acknowledgement is not writing back");
  assert.equal(ack.calls("tell").length, 0);
});

test("the plan's context is the intake's bare from.address: a display-name form would suppress nothing", async () => {
  const bare = world({ facts: { from: "gerencia@example.com" }, answers: { ask: NO } });
  await run(bare);
  assert.equal(bare.calls("apply")[0][3].plan.suppressFrom, "gerencia@example.com");
  const header = world({ facts: { from: "Gerencia <gerencia@example.com>" }, answers: { ask: NO } });
  await run(header);
  assert.equal(
    header.calls("apply")[0][3].plan.suppressFrom,
    null,
    "which is why the port hands the bare one (reply-read-door.test.mjs proves it does)",
  );
});

test("B2: a claim another run holds tells nobody and throws for a later try; a telling that failed throws before the mark; told only after, by its own claim", async () => {
  // A run that died holding the claim is found here by the next try, inside the lease: "done" would lose the notice.
  const held = world({ answers: { claimTell: null } });
  await assert.rejects(run(held), /another run holds the notice/);
  assert.equal(held.calls("tell").length, 0);
  assert.equal(held.calls("told").length, 0);

  const failed = world({ answers: { tell: false } });
  await assert.rejects(run(failed), /the notice did not reach its owner/);
  assert.equal(failed.calls("told").length, 0, "told is never marked before the owner was told");
  assert.deepEqual(failed.ops().slice(-2), ["claimTell", "tell"]);

  const ok = world();
  await run(ok);
  const order = ok.ops();
  assert.ok(order.indexOf("claimTell") < order.indexOf("tell") && order.indexOf("tell") < order.indexOf("told"));
  assert.equal(ok.calls("told")[0][3], "2026-09-29T14:06:00.000001+00:00", "marked by the claim that told");
});
