/**
 * A cold turn's history from the thread's rows and the rebuild it freezes; a named row citable without a read; what
 * every round and turn is stamped with; act tools held to the turn's workspace and the consent rule; and what the
 * turn's words carry: the column, a spoken turn, how they like answers.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  ASK_STYLE_MAX,
  ASK_STYLE_PAGE,
  answerText,
  failedAnswer,
  stoppedAnswer,
  proseAnswer,
  v1FromAnswer,
} from "@chanlytics/contracts";
import {
  A,
  C1,
  C2,
  E1,
  K1,
  K2,
  M1,
  NOW,
  P1,
  PAGE,
  ROUND,
  RPCS,
  SINCE,
  SPOKEN_LINE,
  TPL,
  TURN_CHARS,
  TZ,
  USER,
  WHATSAPP_NUMBER,
  answer,
  answerLine,
  answered,
  askTurnText,
  at,
  buildProposal,
  builtWith,
  call,
  cardOf,
  contact,
  conversation,
  ctxFor,
  draft,
  iso,
  itemOf,
  keep,
  logged,
  markersOf,
  message,
  newToolContext,
  nextTurn,
  peopleListRow,
  ports,
  proposing,
  replyCard,
  runAskTurn,
  sameBytes,
  scripted,
  seeded,
  sentAs,
  shaped,
  storedAnswer,
  tables,
  threadNow,
  threadWorld,
  tool,
  turn,
  turnWords,
  unmark,
  wordsLines,
} from "./_turn.mjs";

test("an earlier answer, as a cold turn's history says it (the Phase 5 plan, D4): one line -- the headline, each card with what the person did with it, the rows it named in the answer's order -- each part only when there is one, never a new line, never longer than the history's cut, an id never cut; a turn that failed says so and keeps its cards; words alone are the words as they were", () => {
  const rosa = itemOf("thread", C1, "Rosa", `inbox/th-${C1}`);
  const call = itemOf("call", K1, "Rosa's call", `conversations/cv-${K1}`);
  const two = shaped("Two people need you.", { detail: "Rosa asked first.", items: [rosa, call] });
  assert.equal(
    answerLine(
      answered({ answer: two, ...v1FromAnswer(two), proposals: [cardOf("p-1", "Reply to Rosa")] }),
      TURN_CHARS,
    ),
    `Two people need you. Cards: p-1 · reply · Reply to Rosa · not pressed yet. Rows, in order: 1. thread ${C1} Rosa; 2. call ${K1} Rosa's call.`,
    "the headline, the card, the rows: never the detail",
  );
  // A list's first three entries after the headline, each cut as a part is, so "the second one" can be answered cold.
  const steps = shaped("Connecting a calendar takes four steps.", {
    list: {
      style: "numbers",
      entries: [
        "Open Settings.",
        "Choose Business.",
        `Paste the calendar's link ${"under Calendar ".repeat(5)}`,
        "Save.",
      ],
    },
  });
  assert.equal(
    answerLine(answered({ answer: steps }), TURN_CHARS),
    "Connecting a calendar takes four steps. List (numbers): Open Settings.; Choose Business.; Paste the calendar's link under Calendar under Calendar…; and 1 more.",
  );
  // What the person did with each card, in their words: never "done".
  const cards = [
    cardOf("p-1", "Reply to Rosa", { state: "done", receipt: "Sent to Rosa", at_ms: 1 }),
    cardOf("p-2", "Autonomy: reply", { state: "dismissed", receipt: "Not now", at_ms: 2 }, "policy"),
    cardOf("p-3", "Invite Sam", { state: "failed", receipt: "Sam is already a member", at_ms: 3 }, "invite"),
    cardOf("p-4", "Snooze Rosa", { state: "undone", receipt: "Woken again", at_ms: 4 }, "thread_verb"),
    cardOf("p-5", "Reply to Sam", { state: "done", receipt: "", at_ms: 5 }),
  ];
  assert.equal(
    answerLine(answered({ answer: shaped("Five cards."), proposals: cards }), TURN_CHARS),
    "Five cards. Cards: p-1 · reply · Reply to Rosa · approved: Sent to Rosa; p-2 · policy · Autonomy: reply · dismissed; p-3 · invite · Invite Sam · failed: Sam is already a member; and 2 more.",
    "three cards at most, then how many more",
  );
  assert.equal(
    answerLine(answered({ answer: shaped("Two."), proposals: cards.slice(3) }), TURN_CHARS),
    "Two. Cards: p-4 · thread_verb · Snooze Rosa · undone; p-5 · reply · Reply to Sam · approved.",
    "undone, and approved with no receipt",
  );
  // A v1 answer: its words, and the rows it cited (answerFromV1's items), a page never among them.
  const v1 = answered({
    text: "Rosa called twice.",
    citations: [
      { kind: "page", id: "reports", label: "Reports", to: "reports" },
      { kind: "thread", id: C1, label: "Rosa", to: `inbox/th-${C1}` },
    ],
  });
  assert.equal(answerLine(v1, TURN_CHARS), `Rosa called twice. Rows, in order: 1. thread ${C1} Rosa.`);
  // Words alone, as every answer before the Line was stored: the same bytes the history sent them as.
  for (const text of ["Here is the plan.", "x".repeat(160)]) {
    const plain = answered({ text });
    assert.equal(answerLine(plain, TURN_CHARS), askTurnText(text, null), "words alone, 160 at most: as they were");
  }
  assert.equal(
    answerLine(answered({ text: `${"y".repeat(200)} tail` }), TURN_CHARS),
    `${"y".repeat(159)}…`,
    "longer: the headline's 160, the cut said",
  );
  // Every part is cut as an answer's own parts are (contracts clip): on a whole word, the cut said, within its cap.
  const piano = "Rosa asked about moving the piano on Saturday morning before nine";
  const onWords = (said, whole, cap) => {
    const kept = said.slice(0, -1);
    assert.ok(said.endsWith("…") && said.length <= cap, `${said.length}: ${said}`);
    assert.ok(whole.startsWith(kept) && whole[kept.length] === " ", `a whole word: ${said}`);
  };
  const told = `So ${piano} ${piano} ${piano}`;
  assert.notEqual(told[159], " ", "a cut at the cap would land inside a word");
  onWords(answerLine(answered({ text: told }), TURN_CHARS), told, 160);
  const titled = answerLine(
    answered({ answer: shaped("One."), proposals: [cardOf("p-1", `${piano} and the parking`)] }),
    TURN_CHARS,
  );
  onWords(titled.split(" · ")[2], `${piano} and the parking`, 80);
  // Never a new line: the words of a prose answer, or an old one, run on one line.
  const prosy = answered({ answer: proseAnswer("First, the calls.\n\nThen the threads.", "en") });
  assert.equal(answerLine(prosy, TURN_CHARS), "First, the calls. Then the threads.");
  assert.equal(answerLine(answered({ text: "One.\nTwo." }), TURN_CHARS), "One. Two.");
  // A turn that failed says so first, and keeps the cards it made before it failed.
  const failed = answered({
    failed: true,
    answer: failedAnswer("AI couldn't answer this time. Nothing was wrong with your question. Try again.", "en"),
    proposals: [cardOf("p-1", "Reply to Rosa")],
  });
  assert.equal(
    answerLine(failed, TURN_CHARS),
    "(This turn failed.) AI couldn't answer this time. Nothing was wrong with your question. Try again. Cards: p-1 · reply · Reply to Rosa · not pressed yet.",
  );
  // A turn the person stopped says it was stopped before its answer, and never the half it had written.
  const halfSaid = { headline: "Three people wrote this week.", detail: "Rosa asked about" };
  assert.equal(
    answerLine(answered({ failed: true, answer: stoppedAnswer(halfSaid, "en") }), TURN_CHARS),
    "(This turn failed.) Stopped before the answer was finished.",
  );
  // At the caps: four long cards and five long rows would pass the history's cut; the rows the line has no room for go
  // whole into "and N more", so the cut never lands inside an id.
  const long = (n) => "L".repeat(n);
  const ids = [1, 2, 3, 4, 5].map((i) => `cccccccc-cccc-4ccc-8ccc-00000000000${i}`);
  const full = answered({
    answer: shaped(long(160), { items: ids.map((id) => itemOf("conversation", id, long(60), `conversations/${id}`)) }),
    proposals: [1, 2, 3, 4].map((i) =>
      cardOf(`p-${i}`, long(80), { state: "done", receipt: long(80), at_ms: i }, "person_details"),
    ),
  });
  const line = answerLine(full, TURN_CHARS);
  assert.ok(line.length <= TURN_CHARS, `${line.length} characters`);
  assert.ok(!line.includes("\n"));
  const shown = ids.filter((id) => line.includes(id));
  assert.ok(shown.length >= 1 && shown.length < 5, `some rows, whole: ${shown.length}`);
  assert.ok(line.endsWith(`; and ${5 - shown.length} more.`), line.slice(-40));
  assert.ok(line.includes("; and 1 more. Rows, in order: 1. conversation"), "the fourth card counted, the rows after");
});

test("the history a cold turn is asked with, from the thread's rows (the Phase 5 plan, D4): each question in the person's words as the model has always read them -- a search's answer inside what it answers -- and each answer one line; a question left unanswered joins the next as it did; the last twelve turns, from a question; at most 16,000 characters as sent, the oldest turns dropped whole and the newest kept", async () => {
  const SEARCH = "55555555-5555-4555-8555-555555555551";
  const answering = {
    search_id: SEARCH,
    name: "Pilates studios · Denver",
    question: "Most are franchises. Leave them out?",
    asked: "Pilates studios in Denver",
    leaving_out: ["Franchises"],
  };
  const rosa = itemOf("thread", C1, "Rosa", `inbox/th-${C1}`);
  const { ctx } = await seeded([
    [{ text: "Who called?" }, null],
    [{ text: "And Rosa?" }, storedAnswer(shaped("Rosa called twice.", { items: [rosa] }))],
    [{ text: "Include them", answering }, storedAnswer(shaped("Here is the search with them in."))],
  ]);
  const found = await threadNow(ctx);
  assert.deepEqual(found.history, [
    { role: "user", text: "Who called?" },
    { role: "user", text: "And Rosa?" },
    { role: "assistant", text: `Rosa called twice. Rows, in order: 1. thread ${C1} Rosa.` },
    { role: "user", text: askTurnText("Include them", answering) },
    { role: "assistant", text: "Here is the search with them in." },
  ]);
  const s = sentAs([ROUND([answer("Fine.")])]);
  const r = await runAskTurn(turn(ctx, { text: "And now?", history: found.history }).input, ports(s.round));
  assert.equal(r.shape.replay, "rebuilt");
  assert.deepEqual(
    s.requests[0].messages.slice(0, -2).map((m) => [m.role, m.content]),
    [
      ["user", "Who called?\nAnd Rosa?"],
      ["assistant", `Rosa called twice. Rows, in order: 1. thread ${C1} Rosa.`],
      ["user", askTurnText("Include them", answering)],
      ["assistant", "Here is the search with them in."],
    ],
    "the unanswered question joined into the next, as the words fold always did",
  );

  // Thirteen turns: the newest twelve, from a question.
  const many = await seeded(
    Array.from({ length: 13 }, (_, i) => [{ text: `Question ${i + 1}?` }, storedAnswer(shaped(`Answer ${i + 1}.`))]),
  );
  const twelve = (await threadNow(many.ctx)).history;
  assert.equal(twelve.length, 24);
  assert.deepEqual(
    [twelve[0], twelve.at(-1)],
    [
      { role: "user", text: "Question 2?" },
      { role: "assistant", text: "Answer 13." },
    ],
  );

  // 16,000 characters as sent: a question counts the history's cut for a turn, 1,200 of its 1,500; twelve turns of
  // 1,200 and 160 are 16,320, so the oldest goes, whole -- its question and its answer -- and eleven are 14,960.
  const heavy = await seeded(
    Array.from({ length: 12 }, (_, i) => [
      { text: `${String(i + 1).padStart(2, "0")} ${"q".repeat(1_497)}` },
      { v: 2, text: `${String(i + 1).padStart(2, "0")} ${"a".repeat(157)}` },
    ]),
  );
  const budgeted = (await threadNow(heavy.ctx)).history;
  assert.equal(budgeted.length, 22, "eleven turns");
  assert.ok(budgeted[0].role === "user" && budgeted[0].text.startsWith("02 "), "from the second turn's question");
  assert.ok(budgeted.at(-1).text.startsWith("12 "), "the newest kept");
  const size = budgeted.reduce((n, h) => n + Math.min(h.text.length, TURN_CHARS), 0);
  assert.deepEqual([size, size + 1_360 > 16_000], [14_960, true], "under the bound, and the oldest would pass it");
});

test("a cold follow-up's request (the Phase 5 plan, PR 5.5): turn 1 -- two reads, a card, an answer of two items -- saved ten minutes back is rebuilt as the words fold's pairs, the question in the person's words and the answer one line; the turn says rebuilt, keeps those messages as its base, as sent, and carries the cache's markers where a cold turn does: system's two, the page's last block and the request's last", async () => {
  const { ctx } = threadWorld();
  const rosa = { kind: "thread", id: C1, label: "Rosa" };
  const called = { kind: "call", id: K1, label: "Rosa's call" };
  const t1 = sentAs([
    ROUND([tool("inbox", { action: "list", filter: "recent" }), tool("calls", { action: "list", filter: "recent" })]),
    ROUND([
      draft,
      answer("Two people need you.", {
        say: { detail: "Rosa asked first." },
        show: {
          items: [
            { title: "Rosa", meta: "WhatsApp", line: "Asked about Saturday.", source: rosa },
            { title: "Rosa's call", meta: "Call", line: "Called at noon.", source: called },
          ],
        },
      }),
    ]),
  ]);
  const r1 = await runAskTurn(
    turn(ctx, { context: PAGE }).input,
    ports(t1.round, { propose: proposing(replyCard("p-1", "Rosa")) }),
  );
  assert.equal(r1.failed, false, r1.failure ?? "");
  assert.deepEqual(
    r1.answer.show.items.map((i) => [i.source.kind, i.source.id]),
    [
      ["thread", C1],
      ["call", K1],
    ],
    "both rows read, both items kept",
  );
  await keep(ctx, "Who needs me?", r1, {
    over: { answer: r1.answer, ...v1FromAnswer(r1.answer) },
    created_at: iso(Date.now() - 10 * 60_000),
  });
  const { r, s } = await nextTurn(ctx, [ROUND([answer("Rosa called at noon.")])], {
    context: PAGE,
    text: "And the call?",
  });
  assert.equal(r.failed, false, r.failure ?? "");
  const line = `Two people need you. Cards: p-1 · reply · Reply to Rosa · not pressed yet. Rows, in order: 1. thread ${C1} Rosa; 2. call ${K1} Rosa's call.`;
  const pairs = [
    { role: "user", content: "Who needs me?" },
    { role: "assistant", content: line },
  ];
  sameBytes(unmark(s.requests[0].messages.slice(0, -2)), pairs, "the question as it was asked, the answer one line");
  assert.notEqual(answerText(r1.answer), line, "not the answer's words: its detail is not the line's");
  assert.equal(r.shape.replay, "rebuilt");
  sameBytes(r.raw.base, pairs, "its base: the lines as sent");
  // The request's last block is the turn's words, after the question: "the call", asked on Today, reads the calls'
  // list ahead (cross-page.ts, 5 Oct 2026), so a read rides between the page and the question.
  assert.deepEqual(markersOf(s.requests[0]), ["system.0", "system.1", "messages.2.0", "messages.3.0"]);
});

test("the rebuild is frozen, and knows what it told (the Phase 5 plan, PR 5.5): a cold turn keeps its lines as its base and every outcome they said (`told`); a card approved after it is not in its line, which the next live turn replays as it was sent, and that turn tells the approval once, in its words; the turn after tells it no more; a card the line already called dismissed is never told again", async () => {
  const { setProposalOutcome } = await import(at("apps/dashboard/src/server/ask/store.ts"));
  const { world, ctx } = threadWorld();
  const rosa = { kind: "thread", id: C1, label: "Rosa" };
  const t1 = sentAs([
    ROUND([tool("inbox", { action: "list", filter: "recent" })]),
    ROUND([
      draft,
      draft,
      answer("Rosa needs you.", {
        show: { items: [{ title: "Rosa", meta: "WhatsApp", line: "Asked about Saturday.", source: rosa }] },
      }),
    ]),
  ]);
  const r1 = await runAskTurn(
    turn(ctx).input,
    ports(t1.round, { propose: proposing(replyCard("p-1", "Rosa"), replyCard("p-2", "Sam")) }),
  );
  assert.equal(r1.failed, false, r1.failure ?? "");
  const first = await keep(ctx, "Who needs me?", r1, {
    over: { answer: r1.answer, ...v1FromAnswer(r1.answer) },
    created_at: iso(Date.now() - 10 * 60_000),
  });
  await setProposalOutcome(ctx, first, "p-2", { state: "dismissed", receipt: "Not now", at_ms: 500 });

  // Turn 2, cold: its lines say what they say now, and it keeps them and every outcome they said.
  const t2 = await nextTurn(ctx, [ROUND([answer("Rosa asked about Saturday.")])], { text: "What did Rosa ask?" });
  const line = `Rosa needs you. Cards: p-1 · reply · Reply to Rosa · not pressed yet; p-2 · reply · Reply to Sam · dismissed. Rows, in order: 1. thread ${C1} Rosa.`;
  sameBytes(unmark(t2.s.requests[0].messages.slice(0, -2)), [
    { role: "user", content: "Who needs me?" },
    { role: "assistant", content: line },
  ]);
  assert.equal(t2.r.shape.replay, "rebuilt");
  sameBytes(t2.r.raw.base, unmark(t2.s.requests[0].messages.slice(0, -2)), "its base: the lines as sent");
  assert.deepEqual(t2.r.raw.told, ["p-2:dismissed:500"], "what its lines said of the thread's cards");
  assert.deepEqual(Object.keys(t2.r.raw).slice(-2), ["prefix", "told"], "a rebuild's raw keeps no `after`");
  const second = await keep(ctx, "What did Rosa ask?", t2.r);
  const stored = world.ask_messages.find((m) => m.id === second).content.raw;
  assert.deepEqual([stored.told, "after" in stored], [["p-2:dismissed:500"], false], "the row keeps it, and no link");

  // Rosa's card approved; turn 3 at once goes live over turn 2, whose line still says not pressed yet: it is replayed
  // as it was sent, and turn 3's words tell the approval, once. The dismissal, which the line said, is never told.
  await setProposalOutcome(ctx, first, "p-1", { state: "done", receipt: "Sent to Rosa", at_ms: 1_000 });
  const t3 = await nextTurn(ctx, [ROUND([answer("It went.")])], { text: "Did it go?" });
  assert.equal(t3.r.shape.replay, "live");
  const sent2 = t2.s.requests.at(-1);
  const n = sent2.messages.length;
  sameBytes(unmark(t3.s.requests[0].messages.slice(0, n)), unmark(sent2.messages), "turn 2's request, byte for byte");
  sameBytes(unmark([t3.s.requests[0].messages[n]]), [{ role: "assistant", content: t2.r.raw.final }], "its final");
  assert.equal(t3.s.requests[0].messages.length, n + 3, "then the new question, and its words");
  assert.equal(t3.s.requests[0].messages[1].content, line, "the line as it was made, though the card was approved");
  assert.equal(wordsLines(t3.s.requests[0])[1], `${SINCE} “Reply to Rosa” (p-1) was approved: Sent to Rosa.`);
  assert.deepEqual([t3.r.raw.after, t3.r.raw.told], [second, ["p-1:done:1000"]]);
  await keep(ctx, "Did it go?", t3.r);
  const t4 = await nextTurn(ctx, [ROUND([answer("Yes.")])], { text: "And Sam?" });
  assert.equal(t4.r.shape.replay, "live");
  assert.ok(!wordsLines(t4.s.requests[0]).some((l) => l.startsWith(SINCE)), "told once, never again");
});

test("what a rebuild told is what it read (the Phase 5 plan, PR 5.5): an outcome recorded while the cold turn ran is not in its `told`, so the next live turn tells it; a base kept before this PR, which kept no `told`, tells only its chain's own cards, so the deploy never tells every old outcome at once", async () => {
  const { setProposalOutcome } = await import(at("apps/dashboard/src/server/ask/store.ts"));
  /** Turn 1 with Rosa's card, saved ten minutes back: a thread whose next turn is cold. */
  const aCard = async () => {
    const { world, ctx } = threadWorld();
    const r1 = await runAskTurn(
      turn(ctx).input,
      ports(sentAs([ROUND([draft, answer("A reply to Rosa.")])]).round, {
        propose: proposing(replyCard("p-1", "Rosa")),
      }),
    );
    const first = await keep(ctx, "Who needs me?", r1, { created_at: iso(Date.now() - 10 * 60_000) });
    return { world, ctx, first };
  };

  // Approved after turn 2 read the thread and before it was saved: its lines say not pressed yet, and so does `told`.
  const racing = await aCard();
  const read = await threadNow(racing.ctx, "And?");
  await setProposalOutcome(racing.ctx, racing.first, "p-1", { state: "done", receipt: "Sent to Rosa", at_ms: 1_000 });
  const s2 = sentAs([ROUND([answer("Fine.")])]);
  const r2 = await runAskTurn(
    turn(racing.ctx, { text: "And?", history: read.history, chain: read.chain, told: read.told }).input,
    ports(s2.round),
  );
  assert.deepEqual([r2.shape.replay, r2.raw.told], ["rebuilt", []], "nothing was recorded when it read");
  assert.ok(s2.requests[0].messages[1].content.includes("· not pressed yet"));
  await keep(racing.ctx, "And?", r2);
  const t3 = await nextTurn(racing.ctx, [ROUND([answer("Fine.")])]);
  assert.equal(t3.r.shape.replay, "live");
  assert.equal(wordsLines(t3.s.requests[0])[1], `${SINCE} “Reply to Rosa” (p-1) was approved: Sent to Rosa.`);

  // A words base kept before this PR (no `told`): only the chain's own rows' cards are told -- turn 1's, older than the
  // base, is not, though it was approved and no turn told it.
  const before = await aCard();
  await setProposalOutcome(before.ctx, before.first, "p-1", { state: "done", receipt: "Sent to Rosa", at_ms: 1_000 });
  const cold = await nextTurn(before.ctx, [ROUND([answer("Fine.")])]);
  assert.equal(cold.r.shape.replay, "rebuilt");
  const base = await keep(before.ctx, "And?", cold.r);
  delete before.world.ask_messages.find((m) => m.id === base).content.raw.told;
  const after = await nextTurn(before.ctx, [ROUND([answer("Fine.")])]);
  assert.equal(after.r.shape.replay, "live");
  assert.ok(!wordsLines(after.s.requests[0]).some((l) => l.startsWith(SINCE)), "an old base: its chain's cards only");
});

test("a row an earlier answer in this thread named is citable without a read (the Phase 5 plan, D5): the turn's read set starts with the rows the thread's answers cited, where each opened -- a cold turn and a live one cite turn 1's row, read by nothing this turn, and keep it at the route turn 1 stored, dropping nothing; a figure about it is still unread, and says so; a page's citation and one that opened nowhere are never seeded", async () => {
  const { ctx } = threadWorld();
  const rosa = { kind: "thread", id: C1, label: "Rosa" };
  const naming = (headline) =>
    answer(headline, { show: { items: [{ title: "Rosa", meta: "", line: "", source: rosa }] } });
  const t1 = sentAs([ROUND([tool("inbox", { action: "list", filter: "recent" })]), ROUND([naming("Rosa needs you.")])]);
  const r1 = await runAskTurn(turn(ctx).input, ports(t1.round));
  assert.deepEqual(
    r1.answer.show.items.map((i) => i.source.to),
    [`inbox/th-${C1}`],
  );
  const v1 = v1FromAnswer(r1.answer);
  const DEAL = "dddddddd-dddd-4ddd-8ddd-ddddddddddd5";
  const citations = [
    ...v1.citations,
    { kind: "page", id: "reports", label: "Reports", to: "reports" },
    { kind: "deal", id: DEAL, label: "Rosa's move", to: "" },
  ];
  await keep(ctx, "Who needs me?", r1, {
    over: { answer: r1.answer, ...v1, citations },
    created_at: iso(Date.now() - 10 * 60_000),
  });

  /** The thread's next turn, on no page and reading nothing: what it answered, and every source it dropped. */
  const asking = async (text, headline) => {
    const found = await threadNow(ctx, text);
    const { thread: _thread, scope: _scope, ...earlier } = found;
    const s = sentAs([ROUND([naming(headline)])]);
    const { result: r, lines } = await logged("ask_sources_dropped", () =>
      runAskTurn(turn(ctx, { text, ...earlier }).input, ports(s.round)),
    );
    return { r, lines, found };
  };
  const cold = await asking("How often did Rosa write?", "Rosa wrote 3 times.");
  assert.deepEqual(
    cold.found.cited,
    [{ kind: "thread", id: C1, route: `inbox/th-${C1}`, label: "Rosa" }],
    "Rosa's thread, where turn 1 opened it: never the page, never the deal that opened nowhere",
  );
  assert.equal(cold.r.shape.replay, "rebuilt");
  assert.deepEqual(
    cold.r.answer.show.items.map((i) => [i.source.kind, i.source.id, i.source.to]),
    [["thread", C1, `inbox/th-${C1}`]],
    "cited with no read, at the route turn 1 stored",
  );
  assert.deepEqual(cold.lines, [], "no source dropped");
  assert.deepEqual([cold.r.tools, cold.r.ungrounded], [[], true], "a count about it read nothing: not from the data");

  await keep(ctx, "How often did Rosa write?", cold.r, {
    over: { answer: cold.r.answer, ...v1FromAnswer(cold.r.answer) },
  });
  const live = await asking("Open her thread", "Opening Rosa's thread.");
  assert.equal(live.r.shape.replay, "live");
  assert.deepEqual(
    live.r.answer.show.items.map((i) => i.source.to),
    [`inbox/th-${C1}`],
  );
  assert.deepEqual([live.lines, live.r.ungrounded], [[], false]);
});

test("the row the words point at is said in the turn's words when it is not the scope (the Phase 5 plan, D7): by its name, its kind and its id, after the scope's line -- to open or name without a read only when this turn's read set holds it (the page's refs, the reads made before the model, the rows earlier answers cited), else to read first -- and to read for anything about it; the scope's own row, or none, says nothing", async () => {
  const facts = {
    role: "operator",
    personLabel: "ada",
    scope: null,
    surface: null,
    language: "en",
    timezone: TZ,
    closures: [],
    now: NOW,
  };
  const rosa = { kind: "thread", id: C1, label: "Rosa" };
  const sam = { kind: "person", id: P1, label: "Sam Ortiz" };
  const held = (f) =>
    `Their words point at <record>${f.label}</record> (${f.kind} ${f.id}): open or name it without a read; read it for anything about it.`;
  const unheld = (f) =>
    `Their words point at <record>${f.label}</record> (${f.kind} ${f.id}): read it first, to open or name it and for anything about it.`;
  const linesOf = (over) => turnWords({ ...facts, ...over }).split("\n");
  assert.ok(linesOf({ focus: sam, focusRead: true }).includes(held(sam)), "no scope, the row in the read set");
  assert.ok(linesOf({ focus: sam }).includes(unheld(sam)), "not in the read set: read it first");
  const scoped = linesOf({ scope: rosa, focus: sam, focusRead: true });
  assert.equal(
    scoped[scoped.findIndex((l) => l.startsWith("They are looking at <record>Rosa</record>")) + 1],
    held(sam),
    "after the scope",
  );
  for (const focus of [rosa, null, undefined])
    assert.ok(
      !turnWords({ ...facts, scope: rosa, focus, focusRead: true }).includes("Their words point at"),
      `${focus?.label ?? focus}`,
    );
  assert.ok(
    turnWords({ ...facts, scope: rosa, focus: { ...rosa, kind: "conversation" } }).includes("Their words point at"),
    "the same id as another kind is another row",
  );

  // Through the turn: the page's focus, as the tab sent it, rides in the question's words -- "without a read" only for
  // a row the read set holds by the time the words are made.
  const SAM = "abababab-abab-4aba-8aba-abababababa2";
  const RUN = "e5e5e5e5-e5e5-4e5e-8e5e-e5e5e5e5e5e5";
  const onPage = { kind: "person", id: SAM, label: "Sam Ortiz" };
  const run = { kind: "run", id: RUN, label: "Monday offer" };
  const page = builtWith([
    { kind: "person", id: SAM, route: `clients/${SAM}`, label: "Sam Ortiz" },
    { kind: "broadcast", id: RUN, route: `broadcasts/run:${RUN}`, label: "Monday offer" },
  ]);
  const said = async (focus, over = {}, portsOver = {}) => {
    const s = sentAs([ROUND([answer("Fine.")])]);
    const input = turn(ctxFor(), { context: { ...PAGE, focus }, scope: rosa, ...over }).input;
    await runAskTurn(input, ports(s.round, portsOver));
    return wordsLines(s.requests[0]);
  };
  assert.ok((await said(onPage, {}, { context: async () => page })).includes(held(onPage)), "a row of the page's");
  assert.ok((await said(run, {}, { context: async () => page })).includes(held(run)), "a run: its broadcast's row");
  assert.ok((await said(onPage)).includes(unheld(onPage)), "a row the page's build left out, or none built: read it");
  const cited = [{ kind: "person", id: SAM, route: `clients/${SAM}`, label: "Sam Ortiz" }];
  assert.ok((await said(onPage, { cited })).includes(held(onPage)), "an earlier answer's item (D5)");
  assert.ok(!(await said(rosa)).join("\n").includes("Their words point at"), "the scope's own row");
});

test("every round names the message it follows on, for the cache diagnostics (the Phase 6 plan, D2): a thread's first turn starts with null and each later round names the one before it; the answer keeps its last id, and a live follow-up's first round names it; the shape keeps each round's id, its miss and the first round's hop (D3); none of it is the prefix a replay is matched on", async () => {
  const { world, ctx } = threadWorld();
  const used = (messageId, cacheMiss = null) => ({
    usage: { messageId, cacheMiss, inputTokens: 100, cacheReadTokens: 800, cacheCreationTokens: 0, outputTokens: 20 },
  });
  const t1 = sentAs([
    ROUND([tool("inbox", { action: "search", words: "parking" }, "t-s")], {
      ...used("msg_t1a"),
      timing: { firstEventMs: 3, firstTextMs: null, totalMs: 20, hopMs: 45 },
    }),
    ROUND([answer("Nobody asked about parking.")], used("msg_t1b", "pending")),
  ]);
  const r1 = await runAskTurn(turn(ctx, { text: "Who asked about parking?" }).input, ports(t1.round));
  assert.equal(r1.failed, false, r1.failure ?? "");
  assert.deepEqual(
    t1.requests.map((q) => q.diagnostics),
    [{ previous_message_id: null }, { previous_message_id: "msg_t1a" }],
    "the first round starts a comparison; the second names the first",
  );
  assert.deepEqual(
    [r1.shape.message_ids, r1.shape.cache_miss, r1.shape.hop_ms],
    [["msg_t1a", "msg_t1b"], [null, "pending"], 45],
  );
  const answered = await keep(ctx, "Who asked about parking?", r1);
  assert.equal(
    world.ask_messages.find((m) => m.id === answered).content.raw.id,
    "msg_t1b",
    "the raw keeps its last id",
  );

  const { r, s } = await nextTurn(ctx, [ROUND([answer("Nobody tomorrow either.")], used("msg_t2a"))]);
  assert.equal(r.shape.replay, "live", "a request's diagnostics are never its prefix: the thread still replays");
  assert.deepEqual(s.requests[0].diagnostics, { previous_message_id: "msg_t1b" }, "the previous turn's last message");
  assert.deepEqual(r.shape.message_ids, ["msg_t2a"]);
});

test("a turn is stamped with what it was written from: the model that answered its last round (a fallback's when the edge asked one) and the hash of its system blocks", async () => {
  const { ctx } = threadWorld();
  const used = (messageId, model) => ({
    usage: {
      messageId,
      model,
      cacheMiss: null,
      inputTokens: 100,
      cacheReadTokens: 800,
      cacheCreationTokens: 0,
      outputTokens: 20,
    },
  });
  const s = sentAs([
    ROUND([tool("inbox", { action: "search", words: "parking" }, "t-s")], used("msg_a", "claude-opus-5-5")),
    ROUND([answer("Nobody asked about parking.")], used("msg_b", "claude-sonnet-5")),
  ]);
  const r = await runAskTurn(turn(ctx, { text: "Who asked about parking?" }).input, ports(s.round));
  assert.equal(r.failed, false, r.failure ?? "");
  assert.equal(
    r.shape.answered_by,
    "claude-sonnet-5",
    "the round that came back last named the model that answered it",
  );
  const system = s.requests[0].system.map((b) => b.text).join("\n");
  assert.equal(r.shape.prompt_hash, createHash("sha256").update(system).digest("hex").slice(0, 16));
  assert.match(r.shape.prompt_hash, /^[0-9a-f]{16}$/);
  // A stream that never said its model leaves the stamp null, never a guess.
  const quiet = sentAs([ROUND([answer("Fine.")], used("msg_c", null))]);
  const q = await runAskTurn(turn(threadWorld().ctx, { text: "Anything?" }).input, ports(quiet.round));
  assert.equal(q.shape.answered_by, null);
});

test("the act tools look a row up in the turn's workspace, whatever the session may read: another workspace's conversation, message, call or escalation is not here (defect 26)", async () => {
  // A member of two workspaces reads both through RLS, so the row a model was handed in one is visible from the other:
  // the lookup itself must ask for the turn's workspace. These rows are B's, under ids the model may name in A's turn.
  const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const theirs = { tenant_id: B };
  const T2 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2";
  const t = tables({
    conversations: [conversation(C1), conversation(C2, theirs)],
    messages: [message(M1, C1), message(T2, C2, { ...theirs, sender: "ai", direction: "outbound", status: "queued" })],
    calls: [call(K1), call(K2, { ...theirs, status: "ongoing" })],
    // The only open escalation on A's thread C1 is B's row: it must not be resolved from A.
    escalations: [
      { id: E1, tenant_id: B, conversation_id: C1, state: "open", created_at: iso(NOW.getTime() - 600_000) },
    ],
  });
  const tc = newToolContext(ctxFor(t), A, "owner", TZ, NOW);
  const p = (name, input) => buildProposal(tc, name, input);
  assert.match(
    (await p("propose_conversation", { conversation_id: C2, verb: "snooze" })).result,
    /no such conversation in this workspace/,
  );
  assert.match(
    (await p("propose_conversation", { conversation_id: C1, verb: "resolve" })).result,
    /no open escalation on that conversation/,
    "an escalation of another workspace's is not this conversation's",
  );
  assert.match(
    (await p("propose_reply", { action: "draft", conversation_id: C2, text: "Hello", voice: "you" })).result,
    /no such conversation in this workspace/,
  );
  assert.match(
    (await p("propose_reply", { action: "steer", message_id: T2, instruction: "shorter" })).result,
    /no such message in this workspace/,
  );
  assert.match(
    (await p("propose_call", { action: "whisper", call_id: K2, text: "Offer Friday" })).result,
    /no such call in this workspace/,
  );
  // The same lookups on this workspace's own rows go through, so the refusal above is the workspace's and not a broken read.
  assert.equal((await p("propose_conversation", { conversation_id: C1, verb: "snooze" })).isError, false);
  assert.equal(
    (await p("propose_reply", { action: "draft", conversation_id: C1, text: "Hello", voice: "you" })).isError,
    false,
  );
  // Every one of those lookups asked for the turn's workspace.
  for (const table of ["conversations", "messages", "calls", "escalations"]) {
    const reads = tc.ctx.supabase.seen.filter((q) => q.table === table && q.op === "select");
    assert.ok(reads.length > 0, table);
    assert.ok(
      reads.every((q) => q.filters.some((f) => f[1] === "tenant_id" && f[2] === A)),
      `${table}: every read is scoped`,
    );
  }
});

test("the reply card refuses a person who texted STOP at the draft, by the one consent rule, and lets through one whose consent is not known (defect 32)", async () => {
  const asked = async (consent, dnc = false) => {
    const t = tables({ conversations: [conversation(C1, { contacts: { ...contact, consent, dnc } })] });
    const tc = newToolContext(ctxFor(t), A, "owner", TZ, NOW);
    return buildProposal(tc, "propose_reply", {
      action: "draft",
      conversation_id: C1,
      text: "See you Saturday",
      voice: "you",
    });
  };
  // The state the door writes when they text STOP is consent = opted_out, with the do-not-contact flag untouched.
  assert.match((await asked("opted_out")).result, /Rosa opted out; nothing can be sent to them/);
  assert.match((await asked("opted_in", true)).result, /Rosa opted out/);
  for (const ok of ["opted_in", "unknown", null]) assert.equal((await asked(ok)).isError, false, String(ok));
});

test("a reply card that names a refund, a discount or a payment term carries the price warning, as a price does (the charter, on the card)", async () => {
  const t = tables();
  const tc = newToolContext(ctxFor(t), A, "owner", TZ, NOW);
  const warned = async (text) =>
    (await buildProposal(tc, "propose_reply", { action: "draft", conversation_id: C1, text, voice: "you" })).proposal
      .payload.price_warning;
  assert.equal(await warned("A full colour is $90."), true);
  assert.equal(await warned("Sí, te hacemos un descuento."), true);
  assert.equal(await warned("We can refund the deposit."), true);
  assert.equal(await warned("See you Saturday at ten."), false);
});

test("a thread a teammate holds is said as theirs, never as AI answering; the order is who it waits on, then a teammate, then snoozed, then opted out (defect 16)", async () => {
  const { threadState } = await import(at("apps/dashboard/src/server/ask/thread-state.ts"));
  const row = (over) => ({
    move: { move: "answered", list: "done" },
    takenOver: false,
    claimedByOther: false,
    state: "open",
    optedOut: false,
    ...over,
  });
  const owes = (move) => ({ move: { move, list: "escalated" } });
  const theirs = (move) => ({ move: { move, list: "waiting" } });
  assert.equal(threadState(row({ claimedByOther: true })), "a teammate is answering");
  assert.equal(threadState(row({})), "answering");
  assert.equal(threadState(row({ ...owes("needs_you"), claimedByOther: true })), "needs you");
  assert.equal(threadState(row({ takenOver: true, claimedByOther: true })), "you have it");
  assert.equal(threadState(row({ claimedByOther: true, state: "snoozed" })), "a teammate is answering");
  assert.equal(threadState(row({ state: "snoozed", optedOut: true })), "snoozed");
  assert.equal(threadState(row({ optedOut: true })), "opted out");
  // The rule's own answer (contracts thread-move.ts), so Ask says what the Inbox's tabs say.
  assert.equal(threadState(row(owes("unanswered"))), "needs you", "nobody answered them");
  assert.equal(threadState(row(owes("failed"))), "needs you", "a reply that never left");
  assert.equal(threadState(row(owes("sending"))), "answering", "a reply on its way, which held_draft says");
  assert.equal(threadState(row(theirs("no_reply"))), "waiting on them");
  assert.equal(threadState(row(theirs("sent"))), "waiting on them");
  assert.equal(threadState(row(theirs("replying"))), "answering", "a reply being worked out");
});

test("a broadcast or a playbook proposed on a workspace with no WhatsApp number says so, in the route's words: nobody can be sent it, and the card is not offered over a send the route will refuse (step 3)", async () => {
  const day = 86_400_000;
  const luis = peopleListRow({
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccca2",
    display_name: "Luis Mora",
    phone_e164: "+15555550101",
    marketing_consent: "opted_in",
    marketing_consent_source: "customer_message",
    marketing_consent_updated_at: iso(NOW.getTime() - 20 * day),
  });
  const world = (channels) =>
    tables({
      tenant_channels: channels,
      templates: [
        {
          id: TPL,
          tenant_id: A,
          channel: "whatsapp",
          name: "fall_offer",
          language: "en",
          meta_status: "approved",
          category: "MARKETING",
          variables: [],
          body_preview: "20% off this week.",
          hidden_at: null,
        },
      ],
    });
  const toolContext = (channels) =>
    newToolContext(ctxFor(world(channels), { ...RPCS, people_list: () => [luis] }), A, "owner", TZ, NOW);
  const broadcast = { action: "once", template_id: TPL, audience_kind: "everyone", params: [] };
  // With the number connected the card is offered; with none it is refused in the words the route would refuse in.
  const connected = await buildProposal(toolContext([WHATSAPP_NUMBER]), "propose_campaign", broadcast);
  assert.equal(connected.isError, false, connected.result);
  const none = await buildProposal(toolContext([]), "propose_campaign", broadcast);
  assert.deepEqual([none.proposal, none.isError], [null, true], none.result);
  assert.equal(JSON.parse(none.result).error, "Connect a WhatsApp number first.");
  // A number WhatsApp flagged is refused the same way, in WhatsApp's words.
  const flagged = { ...WHATSAPP_NUMBER, config: { quality_rating: "RED", messaging_limit: "TIER_1K" } };
  const red = await buildProposal(toolContext([flagged]), "propose_campaign", broadcast);
  assert.match(JSON.parse(red.result).error, /WhatsApp flagged this number's quality/);
  // A US number: Meta is not delivering marketing messages on WhatsApp to US numbers (contracts whatsapp-offers.ts), so an
  // offer is refused with that reason, never with a missing yes; a number Meta has stopped is refused in the row's sentence.
  const us = { ...WHATSAPP_NUMBER, number_e164: "+19295550198" };
  const paused = await buildProposal(toolContext([us]), "propose_campaign", broadcast);
  assert.deepEqual([paused.proposal, paused.isError], [null, true], paused.result);
  assert.match(JSON.parse(paused.result).error, /WhatsApp is not delivering offers to US numbers for now/);
  const unpaid = {
    ...WHATSAPP_NUMBER,
    config: { ...WHATSAPP_NUMBER.config, standing: { can_send: "AVAILABLE", has_payment_method: false } },
  };
  const held2 = await buildProposal(toolContext([unpaid]), "propose_campaign", broadcast);
  assert.match(
    JSON.parse(held2.result).error,
    /WhatsApp needs a card on file before it delivers reminders and campaigns/,
  );
  // A playbook is no longer proposed with no number (its runs would hold everyone): no campaign card, as for the broadcast,
  // but a card of the one thing to fix, in the route's words, with Connections for its door (the 30 Oct 2026 review, item 6).
  const playbook = { action: "moment", trigger: "everyone_monthly", template_id: TPL, params: [] };
  const held = await buildProposal(toolContext([]), "propose_campaign", playbook);
  assert.equal(held.isError, false, held.result);
  assert.deepEqual(
    [held.proposal.kind, held.proposal.title, held.proposal.line, held.proposal.payload.door, held.proposal.payload.to],
    [
      "fix",
      "Fix WhatsApp first",
      "Connect a WhatsApp number first. Until then the “The month's offer” campaign would reach no one.",
      "Open Connections",
      "admin/integrations",
    ],
  );
});

test("the column the answer is drawn in rides in the turn's words (18 Oct 2026): its width, a phone or a desk, about the characters a line holds, and that a table wider than three short columns scrolls sideways; a spoken turn and a tab that sent none say nothing of it; through the loop the model reads it", async () => {
  const facts = {
    role: "operator",
    personLabel: "ada",
    scope: null,
    surface: null,
    language: "en",
    timezone: TZ,
    closures: [],
    now: NOW,
  };
  assert.equal(
    turnWords({ ...facts, column: { px: 358, phone: true } })
      .split("\n")
      .at(-1),
    "They read your answer in a column about 358px wide on a phone, about 50 characters to a line. Lists and short paragraphs fit it well; a table wider than three short columns scrolls sideways there, so a wider comparison reads better as a list or a narrower table, unless they ask for a table.",
  );
  assert.match(
    turnWords({ ...facts, column: { px: 408, phone: false } }),
    /a column about 408px wide on a desk, about 60 characters to a line/,
  );
  assert.ok(!turnWords(facts).includes("a column about"), "none sent: no line");
  const listening = turnWords({ ...facts, spoken: true, column: { px: 358, phone: true } }).split("\n");
  assert.ok(!listening.some((l) => l.includes("a column about")), "listening: nothing is drawn, so no column");
  assert.equal(listening.at(-1), SPOKEN_LINE);

  const s = scripted([ROUND([answer("Nobody is waiting.")])]);
  const r = await runAskTurn(turn(ctxFor(), { column: { px: 358, phone: true } }).input, ports(s.round));
  assert.equal(r.failed, false, r.failure ?? "");
  assert.ok(
    JSON.stringify(s.requests[0].messages).includes("a column about 358px wide on a phone"),
    "the model read it",
  );
});

test("a spoken turn (the voice door, spec 2026-10-03 §3.4): the listening line rides last in the turn's words, a typed turn says nothing of it, the model reads it, and the stored shape says which", async () => {
  // Pure: the line, once, last.
  const facts = {
    role: "operator",
    personLabel: "ada",
    scope: null,
    surface: null,
    language: "en",
    timezone: TZ,
    closures: [],
    now: NOW,
  };
  const spokenLines = turnWords({ ...facts, spoken: true }).split("\n");
  assert.equal(spokenLines.at(-1), SPOKEN_LINE, "the listening line is the last");
  assert.ok(!spokenLines.some((l) => /They wrote in/.test(l)), "and no line guesses their language");
  assert.ok(!turnWords(facts).includes(SPOKEN_LINE), "a typed turn carries no such line");
  assert.ok(SPOKEN_LINE.startsWith("They are listening, not reading. Open with a short clause and a comma,"));

  // Through the loop: the words reach the model, and the shape says the turn was spoken.
  const spoken = scripted([ROUND([answer("Nobody is waiting.")])]);
  const r = await runAskTurn(turn(ctxFor(), { spoken: true }).input, ports(spoken.round));
  assert.equal(r.failed, false, r.failure ?? "");
  assert.ok(JSON.stringify(spoken.requests[0].messages).includes(SPOKEN_LINE), "the model read the line");
  assert.equal(r.shape.spoken, true);

  const typed = scripted([ROUND([answer("Nobody is waiting.")])]);
  const r2 = await runAskTurn(turn(ctxFor()).input, ports(typed.round));
  assert.equal(r2.failed, false, r2.failure ?? "");
  assert.ok(!JSON.stringify(typed.requests[0].messages).includes(SPOKEN_LINE), "a typed turn: no line");
  assert.equal(r2.shape.spoken, false);
});

test("how they like answers (the answer canvas, D): their own note rides fenced in the turn's words and reaches the model, what they ask in the conversation first; with none, no line", async () => {
  const facts = {
    role: "operator",
    personLabel: "ada",
    scope: null,
    surface: null,
    language: "en",
    timezone: TZ,
    closures: [],
    now: NOW,
  };
  const note = "Short answers, the numbers in bold, in Spanish";
  const line = turnWords({ ...facts, style: note })
    .split("\n")
    .find((l) => l.startsWith("How they like answers, in their own note (Settings › Profile): "));
  assert.ok(line, "the note's line is in the turn's words");
  assert.ok(line.includes(note), "with their words");
  assert.ok(line.endsWith("Write to it, unless they ask otherwise in this conversation."), line);
  assert.ok(!turnWords(facts).includes("How they like answers"), "no note, no line");
  assert.ok(!turnWords({ ...facts, style: "" }).includes("How they like answers"), "an empty note, no line");

  // Through the loop: the note reaches the model in the turn's words, never in the cached system.
  const s = scripted([ROUND([answer("Nadie espera.")])]);
  const r = await runAskTurn(turn(ctxFor(), { style: note }).input, ports(s.round));
  assert.equal(r.failed, false, r.failure ?? "");
  assert.ok(JSON.stringify(s.requests[0].messages).includes(note), "the model read the note");
  assert.ok(!JSON.stringify(s.requests[0].system ?? "").includes(note), "not in the system, which every member shares");
});

test("AI keeps how they like answers by a card (propose_settings answer_style): their own note and the one it replaces, read from their views; the note they keep already, or none to clear, is refused", async () => {
  const views = (words) =>
    tables({
      memberships: [
        {
          user_id: USER,
          tenant_id: A,
          role: "operator",
          tenants: { slug: "harbor" },
          created_at: "2026-01-01T00:00:00Z",
          views: words == null ? {} : { [ASK_STYLE_PAGE]: { words } },
        },
      ],
    });
  const build = (t, words) =>
    buildProposal(newToolContext(ctxFor(t), A, "operator", TZ, NOW), "propose_settings", {
      action: "answer_style",
      words,
    });

  const kept = await build(views(null), "  Short answers, in Spanish  ");
  assert.equal(kept.isError, false, kept.result);
  assert.equal(kept.proposal.kind, "answer_style");
  assert.equal(kept.proposal.title, "How you like answers");
  assert.equal(kept.proposal.summary, "Kept for your answers from now on: Short answers, in Spanish");
  assert.deepEqual(kept.proposal.payload, { words: "Short answers, in Spanish", previous: "" });

  const changed = await build(views("Bullets"), "Short answers");
  assert.deepEqual(changed.proposal.payload, { words: "Short answers", previous: "Bullets" }, "the undo's note");

  const cleared = await build(views("Bullets"), "");
  assert.equal(cleared.proposal.summary, "Your note cleared: answers as AI writes them");
  assert.deepEqual(cleared.proposal.payload, { words: "", previous: "Bullets" });

  const long = await build(views(null), "x".repeat(ASK_STYLE_MAX + 50));
  assert.equal(long.proposal.payload.words.length, ASK_STYLE_MAX, "a note past the cap is cut to it");

  assert.match(JSON.parse((await build(views("Bullets"), "Bullets")).result).error, /that is already their note/);
  assert.match(JSON.parse((await build(views(null), "")).result).error, /they keep no note to clear/);
});

test("a note on how they like answers is never the whole answer (the answer canvas, D): its card alone sends the round back, and the model answers the rest of what they asked, already that way", async () => {
  const s = scripted([
    ROUND([tool("propose_settings", { action: "answer_style", words: "Two lines at most" })]),
    ROUND([answer("Nobody needs you today.")]),
  ]);
  const r = await runAskTurn(
    turn(ctxFor(), { text: "Every time I ask, two lines at most. Who needs me today?" }).input,
    ports(s.round),
  );
  assert.equal(r.failed, false, r.failure ?? "");
  assert.equal(r.rounds, 2, "the round went back");
  assert.equal(r.answer.say.headline, "Nobody needs you today.", "the model's answer, not the cards' sentence");
  assert.deepEqual(
    r.proposals.map((p) => p.kind),
    ["answer_style"],
  );
  const told = JSON.stringify(s.requests[1].messages);
  assert.ok(told.includes("The note on how they like answers is proposed as its card"), "told to answer the rest");
  assert.ok(!told.includes("Part of what they asked is no card"), "nothing was refused");
});

test("a call's caller opens from the calls list (the eval-truth pass, 17 Oct 2026): the list notes the person beside the call, so opening their profile stands, where it was dropped as unread and the words still said it", async () => {
  const opened = (to) => ({ do: { open: { source: to, label: "", now: true }, next: [] } });
  const s = scripted([
    ROUND([tool("calls", { action: "list" })]),
    ROUND([answer("Opening Rosa's profile.", opened({ kind: "person", id: P1, label: "Rosa" }))]),
  ]);
  const r = await runAskTurn(
    turn(ctxFor(), { text: "Show me the profile of whoever called last." }).input,
    ports(s.round),
  );
  assert.equal(r.failed, false, r.failure ?? "");
  assert.equal(r.answer.do.open?.to, `clients/${P1}`, "the caller's profile opens");
  assert.equal(r.answer.do.open?.now, true);
  // A person no read named is still no door: the list notes only its callers.
  const stranger = scripted([
    ROUND([tool("calls", { action: "list" })]),
    ROUND([
      answer(
        "Opening their profile.",
        opened({ kind: "person", id: "99999999-9999-4999-8999-999999999999", label: "?" }),
      ),
    ]),
  ]);
  const r2 = await runAskTurn(turn(ctxFor()).input, ports(stranger.round));
  assert.equal(r2.answer.do.open, null, "a person not read opens nothing");
});
