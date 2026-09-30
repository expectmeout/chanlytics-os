/**
 * The receptionist drafts (Reach out Part 5, PR 5; decision 0017, the plan's G13, G14 and Task 5.2).
 *
 *   - Contracts: the one token-budget predicate the receptionist and the draft ask; the draft's gates in G14's order;
 *     the lead note (an email, plain paragraphs, no emoji, the chain's signature, one line of thanks for not now).
 *   - Core's readReply over fakes: interested and a question draft an answer, not now a line of thanks, the rest and
 *     a re-read nothing; a gate, a hand-off or a failure is kept as why, never as words; apply, then draft, then claim,
 *     tell and mark, so the notice carries the draft; a job short of time marks it waiting, hands it to a job of its own
 *     and tells without it, and that job drafts and tells nobody; a draft kept is never drafted again.
 *   - The edge's draft port over a database in memory: the runtime loaded from a RoutedChannel built from the mailbox,
 *     the gates asked from the workspace's own rows, the brain handed the workspace's prompt and the lead note and no
 *     holding words, and its tokens written through the one writer.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DRAFT_NEEDS_MS,
  draftRefusal,
  leadReplyNote,
  parseTenantConfigResult,
  resolveSystemPrompt,
  tokenBudgetSpent,
} from "@chanlytics/contracts";
import { readReply } from "../../../../packages/core/src/messages/reply-read.ts";
import { fakeDb } from "../_fake-db.mjs";
import { at, withEnv } from "../_cron-doors-world.mjs";

const { replyDrafter } = await import(at("apps/edge/lib/reach-out/reply-draft.ts"));

/* ------------------------------------------------------------------ contracts -- */

test("the day's token budget is one predicate: off with no cap, spent at the cap and over it", () => {
  assert.equal(tokenBudgetSpent({}, 1_000_000), false, "no cap set");
  assert.equal(tokenBudgetSpent({ max_llm_tokens_day: 0 }, 1_000_000), false, "0 is off");
  assert.equal(tokenBudgetSpent({ max_llm_tokens_day: 5000 }, 4999), false);
  assert.equal(tokenBudgetSpent({ max_llm_tokens_day: 5000 }, 5000), true, "at the cap");
  assert.equal(tokenBudgetSpent({ max_llm_tokens_day: 5000 }, 9000), true, "over it");
});

test("the draft's gates, in G14's order: a receptionist, a workspace that lets it speak, the day's tokens, the spend", () => {
  const open = { receptionist: true, mode: "ask", budgetSpent: false, maySpend: true };
  assert.equal(draftRefusal(open), null);
  assert.equal(draftRefusal({ ...open, mode: "auto" }), null);
  assert.equal(draftRefusal({ ...open, mode: "veto" }), null);
  assert.equal(draftRefusal({ ...open, mode: "never" }), "off");
  assert.equal(draftRefusal({ ...open, budgetSpent: true }), "budget");
  assert.equal(draftRefusal({ ...open, maySpend: false }), "may_not_spend");
  assert.equal(
    draftRefusal({ receptionist: false, mode: "never", budgetSpent: true, maySpend: false }),
    "no_receptionist",
    "the first gate that says no is the reason",
  );
  assert.equal(draftRefusal({ ...open, mode: "never", budgetSpent: true, maySpend: false }), "off");
  assert.equal(draftRefusal({ ...open, budgetSpent: true, maySpend: false }), "budget");
});

test("the lead note says it is an email, its shape, the signature, and for not now one line of thanks", () => {
  const answer = leadReplyNote({
    business: "Brightwater & Co.",
    answered: "Hi,\n\nWe help movers fill quiet weeks.\n\nSam",
    signedBy: "Sam",
    kind: "answer",
  });
  assert.match(answer, /^Brightwater & Co\., a business that wrote back by email to a reach-out/);
  assert.match(answer, /not sent until they do/);
  assert.match(answer, /The reach-out they answered said: "Hi, We help movers fill quiet weeks\. Sam"/);
  assert.match(answer, /plain paragraphs, no emoji, no subject line/);
  assert.match(answer, /End it signed "Sam"\./);
  assert.match(answer, /from the business's own facts/);
  assert.doesNotMatch(answer, /one short line/);

  const thanks = leadReplyNote({ business: "Brightwater & Co.", answered: null, signedBy: null, kind: "thanks" });
  assert.match(thanks, /one short line thanking them, and nothing else/);
  assert.match(thanks, /End it signed with the business's name\./);
  assert.doesNotMatch(thanks, /The reach-out they answered said/);

  const odd = leadReplyNote({ business: "  Brightwater\n\nCo.  ", answered: null, signedBy: null, kind: "answer" });
  assert.match(odd, /^Brightwater Co\., /, "another's words never break the note's lines");
});

/* ------------------------------------------------------------------ the verb -- */

const T = "t1";
const M = "m1";
const NOW = Date.parse("2026-09-29T14:06:00.000Z");
const FACTS = {
  conversationId: "c1",
  claim: "person",
  text: "This sounds useful. Can you send me more details?",
  subject: "Re: A quick question",
  from: "office@example.com",
  receivedAt: NOW - 60_000,
  answered: "We help movers fill quiet weeks.",
  business: "Brightwater & Co.",
  leadAddress: "office@example.com",
  leadWebsite: "example.com",
  signedBy: "Sam",
  tz: "America/New_York",
};
const reading = (intent, summary = "They wrote back") => ({ intent, summary, day: null, refer_to: null });

/** Ports over one kept reading, each call logged by name; the draft's mark kept as the door keeps it. */
function world(over = {}) {
  const log = [];
  const state = { kept: over.kept ?? null };
  const answers = { ask: reading("interested"), draft: { text: "Thanks for writing.\n\nSam" }, ...over.answers };
  const call =
    (name, fn) =>
    async (...args) => {
      log.push([name, ...args]);
      return fn(...args);
    };
  const ports = {
    reply: call("reply", async () => ({ ...FACTS, ...over.facts })),
    reading: call("reading", async () => (state.kept ? { ...state.kept } : null)),
    mayRead: call("mayRead", async () => null),
    ask: call("ask", async () => answers.ask),
    apply: call("apply", async (_t, _m, p) => {
      state.kept = {
        intent: p.reading.intent,
        summary: p.reading.summary || null,
        unread: p.unread,
        rereads: p.reread,
        tell: p.plan.tell,
        told: false,
        undone: false,
        draft: p.plan.draft,
        draftState: "none",
        draftText: null,
      };
      return true;
    }),
    draft: call("draft", async () => {
      if (answers.draft instanceof Error) throw answers.draft;
      return answers.draft;
    }),
    markDraft: call("markDraft", async (_t, _m, mark) => {
      if (!["none", "waiting"].includes(state.kept.draftState)) return false;
      state.kept = {
        ...state.kept,
        draftState: mark.state,
        draftText: mark.state === "written" ? mark.draft : null,
        draftWhy: mark.state === "not_written" ? mark.why : null,
      };
      return true;
    }),
    claimTell: call("claimTell", async () => "claim-1"),
    tell: call("tell", async () => true),
    told: call("told", async () => {
      state.kept = { ...state.kept, told: true };
    }),
    scheduleOnce: call("scheduleOnce", async () => "scheduled"),
    now: () => NOW,
  };
  return {
    ports,
    state,
    ops: () => log.map((l) => l[0]),
    calls: (name) => log.filter((l) => l[0] === name),
  };
}
const run = (w, { stage, deadline = NOW + 40_000 } = {}) =>
  readReply(w.ports, { tenantId: T, messageId: M, stage, tellStaleMs: 30_000, deadline });

test("interested and a question draft an answer, not now a line of thanks, and the notice carries it", async () => {
  for (const intent of ["interested", "question"]) {
    const w = world({ answers: { ask: reading(intent) } });
    assert.equal(await run(w), "told");
    const [, tenant, ask] = w.calls("draft")[0];
    assert.equal(tenant, T);
    assert.equal(ask.conversationId, "c1");
    assert.equal(ask.text, FACTS.text, "their words, the quoted history cut");
    assert.equal(ask.deadline, NOW + 40_000);
    assert.match(ask.note, /from the business's own facts/, intent);
    assert.match(ask.note, /End it signed "Sam"/);
    assert.equal(w.state.kept.draftState, "written");
    assert.equal(w.state.kept.draftText, "Thanks for writing.\n\nSam");
    assert.match(w.calls("tell")[0][2].body, /The receptionist drafted an answer: “Thanks for writing\. Sam”/);
  }
  const later = world({ answers: { ask: { ...reading("not_now"), day: "2027-01-12" } } });
  await run(later);
  assert.match(later.calls("draft")[0][2].note, /one short line thanking them, and nothing else/);
});

test("a no, a wrong person, an away and other draft nothing, and neither does a re-read", async () => {
  for (const intent of ["no", "wrong_person", "other"]) {
    const w = world({ answers: { ask: reading(intent) } });
    await run(w);
    assert.equal(w.calls("draft").length, 0, intent);
    assert.equal(w.calls("markDraft").length, 0, intent);
    assert.equal(w.state.kept.draftState, "none");
  }
  const away = world({ answers: { ask: { ...reading("away"), day: "2026-10-05" } } });
  await run(away);
  assert.equal(away.calls("draft").length, 0);

  // A re-read of a reply the first read could not read: its plan drafts nothing (contracts readingPlan).
  const w = world({
    kept: {
      intent: "other",
      summary: null,
      unread: "model_failed",
      rereads: 0,
      tell: true,
      told: true,
      undone: false,
      draft: null,
      draftState: "none",
      draftText: null,
    },
  });
  await run(w, { stage: "reread-1" });
  assert.equal(w.calls("apply")[0][3].plan.draft, null);
  assert.equal(w.calls("draft").length, 0);
});

test("nothing drafted: the gate's reason, or not_drafted for a hand-off or a failure, and the notice goes on", async () => {
  for (const why of ["no_receptionist", "off", "budget", "may_not_spend", "not_drafted"]) {
    const w = world({ answers: { draft: { why } } });
    assert.equal(await run(w), "told");
    assert.deepEqual(w.calls("markDraft")[0][3], { state: "not_written", why });
    assert.doesNotMatch(w.calls("tell")[0][2].body, /drafted/);
  }
  const threw = world({ answers: { draft: new Error("overloaded") } });
  assert.equal(await run(threw), "told", "a brain that failed never throws the reading away");
  assert.deepEqual(threw.calls("markDraft")[0][3], { state: "not_written", why: "not_drafted" });
  const blank = world({ answers: { draft: { text: "  \n " } } });
  await run(blank);
  assert.deepEqual(blank.calls("markDraft")[0][3], { state: "not_written", why: "not_drafted" });
});

test("the order: apply, then the draft, then claim, tell and mark", async () => {
  const w = world();
  await run(w);
  const ops = w.ops().filter((o) => !["reply", "reading", "mayRead", "ask"].includes(o));
  assert.deepEqual(ops, ["apply", "draft", "markDraft", "claimTell", "tell", "told"]);
});

test("short of time: waiting, a job of its own, and a notice without it; that job drafts and tells nobody", async () => {
  const w = world();
  assert.equal(await run(w, { deadline: NOW + DRAFT_NEEDS_MS - 1 }), "told");
  assert.equal(w.calls("draft").length, 0);
  assert.deepEqual(w.calls("markDraft")[0][3], { state: "waiting" });
  assert.deepEqual(w.calls("scheduleOnce")[0].slice(1), [NOW, { message_id: M, stage: "draft" }]);
  assert.doesNotMatch(w.calls("tell")[0][2].body, /drafted/, "told without it");

  assert.equal(await run(w, { stage: "draft" }), "drafted");
  assert.equal(w.calls("draft").length, 1);
  assert.equal(w.state.kept.draftState, "written");
  assert.equal(w.calls("tell").length, 1, "the draft's job tells nobody");
  assert.equal(w.calls("ask").length, 1, "and reads nothing again");

  // The draft's job run again, or run for a reading undone since: nothing.
  assert.equal(await run(w, { stage: "draft" }), "already_read");
  assert.equal(w.calls("draft").length, 1);
  const undone = world({ kept: { ...w.state.kept, draftState: "waiting", undone: true } });
  assert.equal(await run(undone, { stage: "draft" }), "already_read");
  assert.equal(undone.calls("draft").length, 0);

  // Its own job short of time throws for the ledger's retry, and marks nothing.
  const late = world({ kept: { ...w.state.kept, draftState: "waiting", draftText: null } });
  await assert.rejects(run(late, { stage: "draft", deadline: NOW + 1000 }), /no time left to draft/);
  assert.equal(late.calls("markDraft").length, 0);
});

test("a draft already written is never drafted again, and a retried notice still carries it", async () => {
  const w = world();
  w.ports.tell = async () => false;
  await assert.rejects(run(w), /did not reach its owner/);
  assert.equal(w.calls("draft").length, 1);
  w.ports.tell = async (...args) => {
    w.retold = args;
    return true;
  };
  assert.equal(await run(w), "told");
  assert.equal(w.calls("draft").length, 1, "the retry drafts nothing");
  assert.match(w.retold[1].body, /The receptionist drafted an answer: “Thanks for writing\. Sam”/);
});

/* ------------------------------------------------------------------ the edge's port -- */

const BRAIN = {
  business_name: "Harbor Moving",
  booking_link: "https://book.example/harbor",
  system_prompt: "Answer as the front desk of Harbor Moving: brief and warm, and never guess a price.",
  fallbacks: { greeting: "g", error: "Sorry, one moment.", non_text: "n" },
};
const PARSED = parseTenantConfigResult({ brain: BRAIN });
assert.ok(PARSED.ok);
const TZ = "America/New_York";
const CONV = "cccccccc-cccc-4ccc-8ccc-cccccccccc01";

/** A workspace nobody else in this file uses: the runtime loader caches one for ten minutes. */
let seq = 0;
function edge({
  config = { brain: BRAIN },
  mode = "ask",
  limits = {},
  billing = "active",
  usage = 0,
  mailbox = true,
} = {}) {
  seq += 1;
  const tenant = `dddddddd-dddd-4ddd-8ddd-${String(seq).padStart(12, "0")}`;
  const tables = {
    mailboxes: mailbox
      ? [{ id: `mb-${seq}`, tenant_id: tenant, local_part: "harbor", from_name: "Harbor", reply_token: "tok" }]
      : [],
    tenant_config: [{ tenant_id: tenant, config }],
    policies: [{ tenant_id: tenant, class: "reply", mode, limits, subject_type: null, subject_id: null }],
    tenants: [{ id: tenant, name: "Harbor", timezone: TZ, status: "active" }],
    billing_accounts: [{ tenant_id: tenant, mode: "stripe", status: billing }],
    tenant_channels: [],
    google_listings: [],
    events: usage
      ? [
          {
            id: 1,
            tenant_id: tenant,
            kind: "usage.llm_tokens",
            created_at: new Date(Date.now() - 60_000).toISOString(),
            data: { input_tokens: usage, output_tokens: 0 },
          },
        ]
      : [],
    messages: [
      {
        id: "r1",
        tenant_id: tenant,
        conversation_id: CONV,
        body: "This sounds useful. Can you send me more details?",
        sender: "customer",
        direction: "inbound",
        type: "text",
        status: "received",
        created_at: new Date(Date.now() - 120_000).toISOString(),
        channel_ts: null,
        meta: null,
      },
    ],
  };
  const db = fakeDb(tables, {}, { runtime_stamp: () => "stamp-1" });
  const asked = [];
  const brain = async (...args) => {
    asked.push(args);
    return (
      edge.answer ?? {
        text: "Thank you for writing.\n\nSam",
        escalate: false,
        usage: { input_tokens: 90, output_tokens: 30 },
      }
    );
  };
  return { tenant, tables, asked, draft: replyDrafter(db, { brain }) };
}
const ASK = { conversationId: CONV, text: "Can you send me more details?", note: "Brightwater & Co., a note" };
const KEY = { ANTHROPIC_API_KEY: "model-key-for-this-file" };

test("the edge's port: the workspace's prompt, the thread, the note, no holding words, and its tokens written once", async () => {
  await withEnv(KEY, async () => {
    const w = edge();
    const out = await w.draft(w.tenant, { ...ASK, deadline: Date.now() + 40_000 });
    assert.deepEqual(out, { text: "Thank you for writing.\n\nSam" });
    assert.equal(w.asked.length, 1);
    const [history, text, system, fallback, note, nowNote] = w.asked[0];
    assert.deepEqual(history, [{ role: "user", content: "This sounds useful. Can you send me more details?" }]);
    assert.equal(text, ASK.text);
    assert.equal(
      system.split("\n")[0],
      resolveSystemPrompt(PARSED.config.brain, "whatsapp", TZ, new Date()).split("\n")[0],
    );
    assert.equal(fallback, "", "the holding words are never a draft");
    assert.equal(note, ASK.note);
    assert.ok(nowNote.length > 0);
    const usage = w.tables.events.filter((e) => e.kind === "usage.llm_tokens");
    assert.equal(usage.length, 1, "one usage event, through the one writer");
    assert.equal(usage[0].subject_id, CONV);
    assert.equal(usage[0].data.input_tokens, 90);
    assert.equal(usage[0].data.source, "reach_out_reply_draft");
  });
});

test("the edge's port asks G14's gates from the workspace's own rows, and a hand-off is not drafted", async () => {
  await withEnv(KEY, async () => {
    const ask = { ...ASK, deadline: Date.now() + 40_000 };
    const cases = [
      [{ config: {} }, "no_receptionist"],
      [{ mailbox: false }, "no_receptionist"],
      [{ mode: "never" }, "off"],
      [{ limits: { max_llm_tokens_day: 1000 }, usage: 1000 }, "budget"],
      [{ billing: "canceled" }, "may_not_spend"],
    ];
    for (const [over, why] of cases) {
      const w = edge(over);
      assert.deepEqual(await w.draft(w.tenant, ask), { why }, JSON.stringify(over));
      assert.equal(w.asked.length, 0, `${why}: no brain asked`);
    }
    const under = edge({ limits: { max_llm_tokens_day: 5000 }, usage: 1000 });
    assert.ok("text" in (await under.draft(under.tenant, ask)), "under the cap it drafts");

    edge.answer = {
      text: "Sorry, one moment.",
      escalate: true,
      reason: "human_token",
      usage: { input_tokens: 5, output_tokens: 5 },
    };
    const handed = edge();
    assert.deepEqual(await handed.draft(handed.tenant, ask), { why: "not_drafted" });
    assert.equal(handed.tables.events.length, 1, "a hand-off's tokens are still counted");
    edge.answer = undefined;
  });
  await withEnv({ ANTHROPIC_API_KEY: "" }, async () => {
    const w = edge();
    assert.deepEqual(await w.draft(w.tenant, { ...ASK, deadline: Date.now() + 40_000 }), { why: "no_receptionist" });
  });
});

test("REGRESSION: a price in the model's answer is never a draft, and its tokens are still counted", async () => {
  // Layer two (core layerTwo) reads a draft as it reads the receptionist's own reply, so no draft a person may send as
  // written quotes a price (scorecard row 93). Refused as a hand-off is: not_drafted, and never layer two's holding
  // words in its place.
  await withEnv(KEY, async () => {
    const ask = { ...ASK, deadline: Date.now() + 40_000 };
    for (const text of [
      "It is $450 for a two-bedroom move.\n\nSam",
      "A crew is 45 dollars an hour.\n\nSam",
      "Around 300 usd all in.\n\nSam",
      "Son 90 pesos por hora.\n\nSam",
    ]) {
      edge.answer = { text, escalate: false, usage: { input_tokens: 90, output_tokens: 30 } };
      const w = edge();
      assert.deepEqual(await w.draft(w.tenant, ask), { why: "not_drafted" }, text);
      assert.equal(w.tables.events.filter((e) => e.kind === "usage.llm_tokens").length, 1, "the tokens were spent");
    }
    // The words the brain writes about time, counts and dates carry no price.
    edge.answer = {
      text: "We can be there at 9 on Saturday, with a crew of 3 for 2 hours.\n\nSam",
      escalate: false,
      usage: { input_tokens: 90, output_tokens: 30 },
    };
    const fine = edge();
    assert.deepEqual(await fine.draft(fine.tenant, ask), {
      text: "We can be there at 9 on Saturday, with a crew of 3 for 2 hours.\n\nSam",
    });
    edge.answer = undefined;
  });
});

test("REGRESSION: named money in the model's answer is never a draft, as a price is not, and its tokens are counted", async () => {
  // The money charter (the AI lane's namesMoney, which its body left for this door to wire): a refund, a discount, a
  // deposit or a payment plan is the owner's to offer in their own words, never a draft's, in English or Spanish.
  await withEnv(KEY, async () => {
    const ask = { ...ASK, deadline: Date.now() + 40_000 };
    for (const text of [
      "We can refund the deposit if you change your mind.\n\nSam",
      "I can offer you a discount on the first move.\n\nSam",
      "Podemos ofrecerle un reembolso completo.\n\nSam",
    ]) {
      edge.answer = { text, escalate: false, usage: { input_tokens: 90, output_tokens: 30 } };
      const w = edge();
      assert.deepEqual(await w.draft(w.tenant, ask), { why: "not_drafted" }, text);
      assert.equal(w.tables.events.filter((e) => e.kind === "usage.llm_tokens").length, 1, "the tokens were spent");
    }
    // A draft that names no money is still a draft.
    edge.answer = {
      text: "We can be there at 9 on Saturday, with a free parking spot for the truck.\n\nSam",
      escalate: false,
      usage: { input_tokens: 90, output_tokens: 30 },
    };
    const fine = edge();
    assert.deepEqual(await fine.draft(fine.tenant, ask), {
      text: "We can be there at 9 on Saturday, with a free parking spot for the truck.\n\nSam",
    });
    edge.answer = undefined;
  });
});

test("layer two's price rule alone reaches a draft: a class held for a person does not swap a draft's words", async () => {
  // Autonomy's ask holds what the receptionist itself sends; a draft is sent by nobody but the owner, so a booking or
  // service question is still drafted where those classes are on ask, and its words are the brain's own.
  await withEnv(KEY, async () => {
    edge.answer = {
      text: "Book a time here: https://book.example/harbor\n\nSam",
      escalate: false,
      meta: { intent: "booking" },
      usage: { input_tokens: 90, output_tokens: 30 },
    };
    const w = edge();
    for (const row of w.tables.policies) row.mode = "ask";
    w.tables.policies.push(
      { tenant_id: w.tenant, class: "booking", mode: "ask", limits: {}, subject_type: null, subject_id: null },
      { tenant_id: w.tenant, class: "faq", mode: "ask", limits: {}, subject_type: null, subject_id: null },
    );
    assert.deepEqual(await w.draft(w.tenant, { ...ASK, deadline: Date.now() + 40_000 }), {
      text: "Book a time here: https://book.example/harbor\n\nSam",
    });
    edge.answer = undefined;
  });
});
