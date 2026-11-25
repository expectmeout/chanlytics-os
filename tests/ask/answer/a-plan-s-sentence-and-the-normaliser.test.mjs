/**
 * A plan's one sentence over its card, the v1 fields beside a v2 answer, plain words as one paragraph, next questions
 * not asked again (item 15), and the normaliser grounding the doors in the words (C2).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ASK_ANSWER_CAPS,
  ASK_CAPS,
  answerForCards,
  answerFromV1,
  answerSpoken,
  answerText,
  answerWords,
  claimsWrite,
  emptyReadSet,
  failedAnswer,
  nextNotAsked,
  normalizeAnswer,
  proseAnswer,
  v1FromAnswer,
  answerBlocks,
  answerPlain,
} from "@chanlytics/contracts";
import { BREAKDOWN, CALL, ID, PERSON, UNREAD, read1, reads, runs, threadRef, withShow, written } from "./_answer.mjs";

test("a plan is one card, so the sentence over it counts no steps and no sends: its own first sentence, or that here it is, in English and Spanish; cards of no one plan are counted as cards", () => {
  const stamp = (step, silent, id = "plan-1") => ({
    title: `Step ${step}`,
    kind: silent ? "list" : "broadcast",
    plan: { id, step, of: 6, silent, after: silent ? [] : [1, 2, 3, 4] },
  });
  const six = [1, 2, 3, 4].map((n) => stamp(n, true)).concat([stamp(5, false), stamp(6, false)]);
  const en = answerForCards(six, "en", null);
  assert.deepEqual([en.say.headline, en.say.detail], ["Here is the plan.", ""]);
  const es = answerForCards(six, "es", null);
  assert.deepEqual([es.say.headline, es.say.detail], ["Aquí está el plan.", ""]);
  assert.equal(
    answerForCards(six, "en", "It goes by email. It pauses the other one.").say.headline,
    "It goes by email.",
  );
  // Not one plan's cards: a card of no plan beside it, or two plans, are cards.
  assert.equal(
    answerForCards([...six, { title: "Reply to Nora" }], "en", null).say.headline,
    "7 ready below. Nothing happens until you press them.",
  );
  assert.equal(
    answerForCards([stamp(1, true), stamp(2, false, "plan-2")], "en", null).say.headline,
    "2 ready below. Nothing happens until you press them.",
  );
});

test("REGRESSION: a sentence that counted a plan's sends could count them wrong -- a lead search and the follow-up that waits for it read 'A plan of 2 steps to review: 2 send' (the operator stress run, 15 Oct 2026): it counts nothing now", () => {
  // As act/plan.ts stamps them: the search a send, the follow-up naming its result and so pressed after it.
  const search = {
    title: "Find 100 plumbers",
    kind: "lead_search",
    plan: { id: "p", step: 1, of: 2, silent: false, after: [] },
  };
  const later = {
    title: "Write to the best",
    kind: "follow_up",
    plan: { id: "p", step: 2, of: 2, silent: false, after: [1] },
  };
  const words = "Find 100 plumbers in Austin, then come back with the best.";
  assert.deepEqual(
    [
      answerForCards([search, later], "en", words).say.headline,
      answerForCards([search, later], "es", words).say.headline,
    ],
    [words, words],
  );
});

test("REGRESSION: an answer of cards alone is kept in the language its words are written in -- a question with no hint of English ('find 5,000 nail salons across Texas') was kept as other beside an English answer (the operator stress run, 15 Oct 2026)", () => {
  const card = { title: "Find 1000 nail salons", kind: "lead_search" };
  assert.deepEqual(
    ["other", "en", "es"].map((l) => answerForCards([card], l, null).language),
    ["en", "en", "es"],
  );
});

test("a round that made a plan answers with one sentence, and the card holds the rest: an offer's why, in the language it is said in; a setup's campaigns, unstamped, are counted as cards with the plan's words their detail, cut on a whole word at the detail's cap", () => {
  const stamp = (step, silent) => ({
    title: `Step ${step}`,
    kind: silent ? "playbook_change" : "broadcast",
    plan: { id: "plan-1", step, of: 3, silent, after: silent ? [] : [1, 2] },
  });
  const cards = [stamp(1, true), stamp(2, true), stamp(3, false)];
  const words = "Pauses the month's offer so nobody gets two offers. It goes by email.";
  const why = "More people said yes than you have room for, so it is paced.";
  const plan = answerForCards(cards, "en", words, null, why);
  assert.deepEqual([plan.say.headline, plan.say.detail, plan.language], [why, "", "en"]);
  const es = answerForCards(cards, "es", words, null, "Más gente dijo que sí de la que cabe.");
  assert.deepEqual([es.say.headline, es.say.detail, es.language], ["Más gente dijo que sí de la que cabe.", "", "es"]);
  // No why: the plan's first sentence, and the card says the rest.
  const said = answerForCards(cards, "en", words);
  assert.deepEqual([said.say.headline, said.say.detail], ["Pauses the month's offer so nobody gets two offers.", ""]);
  // A setup's campaigns, unstamped: counted as cards, the plan's words their detail.
  const setup = answerForCards([{ title: "a" }, { title: "b" }, { title: "c" }], "en", "Starts 3 campaigns.");
  assert.deepEqual(
    [setup.say.headline, setup.say.detail],
    ["3 ready below. Nothing happens until you press them.", "Starts 3 campaigns."],
  );
  // Words past the detail's cap end on a whole word, with an ellipsis, within it.
  const long = Array.from({ length: 600 }, (_, i) => `word${i}`).join(" ");
  assert.ok(long.length > ASK_ANSWER_CAPS.detail, "longer than the detail holds");
  const cut = answerForCards([{ title: "a" }, { title: "b" }], "en", long).say.detail;
  assert.ok(cut.length <= ASK_ANSWER_CAPS.detail, `${cut.length}`);
  assert.ok(cut.endsWith("…") && long.startsWith(cut.slice(0, -1)), cut);
  assert.match(cut, /word\d+…$/, "cut after a whole word");
});

test("a turn that could not be answered says why as its headline; words the format could not shape are prose", () => {
  assert.deepEqual(failedAnswer("The answer took too long. Ask again.", "en"), {
    v: 2,
    form: "structured",
    say: { headline: "The answer took too long. Ask again.", detail: "" },
    show: { figures: [], items: [], breakdown: null, list: { style: "bullets", entries: [] } },
    do: { open: null, next: [] },
    language: "en",
  });
  const p = proseAnswer("<answer>Nora is waiting.\nSam called twice.</answer>", "es");
  assert.deepEqual(
    [p.form, p.say.headline, p.say.detail, p.language],
    ["prose", "", "Nora is waiting.\nSam called twice.", "es"],
  );
  assert.equal(answerText(p), "Nora is waiting.\nSam called twice.");
  assert.equal(proseAnswer("x".repeat(3000), "en").say.detail.length, 1500);
});

test("every word an answer says is checked for a figure with no read behind it", () => {
  const words = answerWords(read1(written()).answer);
  for (const s of [
    "Nora and Sam are waiting",
    "Sam's call was missed",
    "up from 1",
    "Asked about",
    "handed over",
    "16",
  ])
    assert.ok(words.includes(s), s);
});

test("the v1 fields a v2 answer is stored beside: its words, each place it rests on once with its route, Open as navigate, next as the follow-ups; read back as the same answer's", () => {
  const a = read1(
    written({
      show: {
        figures: [{ value: "2", label: "waiting", note: "", source: { kind: "thread", id: ID, label: "Nora" } }],
        items: [
          { title: "Nora", meta: "", line: "", source: { kind: "thread", id: ID, label: "Nora" } },
          { title: "Dana", meta: "", line: "", source: { kind: "person", id: PERSON, label: "Dana" } },
        ],
        breakdown: BREAKDOWN,
      },
      do: {
        open: { source: { kind: "call", id: CALL, label: "Sam" }, label: "", now: true },
        next: ["Reply to Nora?"],
      },
    }),
  ).answer;
  const v = v1FromAnswer(a);
  assert.equal(v.text, "Nora and Sam are waiting on you. Nora asked about Saturday; Sam's call was missed.");
  assert.deepEqual(v.citations, [
    { kind: "thread", id: ID, label: "Nora", to: `inbox/th-${ID}` },
    { kind: "person", id: PERSON, label: "Dana", to: `clients/${PERSON}` },
    { kind: "page", id: "reports", label: "Reports", to: "reports" },
  ]);
  assert.deepEqual(v.navigate, { to: `conversations/cv-${CALL}`, label: "Open the call", now: true });
  assert.deepEqual(v.followups, ["Reply to Nora?"]);

  const back = answerFromV1({ ...v, language: a.language });
  assert.equal(answerText(back), v.text);
  assert.deepEqual(
    back.show.items.map((i) => i.source.to),
    [`inbox/th-${ID}`, `clients/${PERSON}`],
  );
  assert.deepEqual(back.do.open, v.navigate);
  assert.deepEqual(back.do.next, v.followups);

  const threads = Array.from({ length: 5 }, (_, i) => `6666666${i}-6666-4666-8666-666666666666`);
  const many = read1(
    withShow({
      items: threads.map((id) => ({ title: "x", meta: "", line: "", source: { kind: "thread", id, label: "x" } })),
      figures: ["today", "live", "calendar"].map((id) => ({
        value: "1",
        label: "",
        note: "",
        source: { kind: "page", id, label: id },
      })),
    }),
    "en",
    reads(...threads.map(threadRef)),
  ).answer;
  assert.equal(v1FromAnswer(many).citations.length, ASK_CAPS.citations);
});

test("a write claimed is one predicate (the moment spec, A4): what the eval judged, the loop now catches; a quote claims nothing", () => {
  for (const said of [
    "I've set up your win-back.",
    "I started the follow-up for you.",
    "I paused it.",
    "I have resumed the offer.",
    "I renamed it to Past clients.",
    "I turned on the reminder.",
    "I've scheduled it for 9am.",
    "He configurado tus campañas.",
    "He pausado la campaña.",
    "I sent it.",
    "Done, it's on.",
    "All set. All done!",
  ])
    assert.equal(claimsWrite(said, { besideCards: true }), true, said);
  for (const said of [
    "Two cards to review: a win-back and a follow-up.",
    "Once you approve it, it starts running.",
    "You connect it under Settings › Business. Once that's done, ask me again and I'll add both.",
    "The quickest fix is to turn Win-back back on. Should I set up the cards to turn Win-back back on?",
    "I changed nothing in your account today: I can't change anything myself, only propose cards for you to approve.",
    "When that's done, the reminder can go.",
    "The card is waiting for your approval.",
    'Here is the reply, ready to approve: "I\'ve set up your visit."',
  ])
    assert.equal(claimsWrite(said, { besideCards: true }), false, said);
});

test("the answer's words read as blocks: headings, nested lists, a table with its number columns set right, and paragraphs a line each", () => {
  const blocks = answerBlocks(
    [
      "### This week",
      "1. Open **Needs you** first.",
      "2. For each one:",
      "  - add the *missing* fact",
      "  - take it over",
      "    - when it needs a person",
      "",
      "| Channel | Booked | Median reply |",
      "|---|---:|---|",
      "| WhatsApp | 18 | 1 min |",
      "| Calls | 9 | 0 min |",
      "",
      "Text books least.",
      "See [the report](reports) for `more`.",
    ].join("\n"),
  );
  assert.deepEqual(
    blocks.map((b) => b.kind),
    ["heading", "list", "table", "text"],
  );
  assert.equal(runs(blocks[0].runs), "This week");
  const list = blocks[1].list;
  assert.equal(list.ordered, true);
  assert.deepEqual(
    list.items.map((it) => runs(it.runs)),
    ["Open **Needs you** first.", "For each one:"],
  );
  const sub = list.items[1].sub;
  assert.equal(sub.ordered, false, "a point nested under a step keeps its own bullet");
  assert.deepEqual(
    sub.items.map((it) => runs(it.runs)),
    ["add the _missing_ fact", "take it over"],
  );
  assert.equal(runs(sub.items[1].sub.items[0].runs), "when it needs a person", "three levels deep");
  const table = blocks[2];
  assert.deepEqual(table.head.map(runs), ["Channel", "Booked", "Median reply"]);
  assert.deepEqual(
    table.rows.map((r) => r.map(runs)),
    [
      ["WhatsApp", "18", "1 min"],
      ["Calls", "9", "0 min"],
    ],
  );
  assert.deepEqual(table.right, [false, true, true], "a column of numbers is set right");
  assert.deepEqual(
    blocks[3].lines.map(runs),
    ["Text books least.", "See the report for more."],
    "a link is its words, never a link (the model never writes a route), and code is its words",
  );
});

test("words with no marks are one paragraph of their lines, as the detail always was; nothing in them is ever markup", () => {
  assert.deepEqual(answerBlocks("Most came in after hours.\nTwo were on Sunday."), [
    { kind: "text", lines: [[{ text: "Most came in after hours." }], [{ text: "Two were on Sunday." }]] },
  ]);
  const odd = answerBlocks("5 * 3 = 15, and 2*4 is 8; a_b_c stays; <b>no</b> tag is drawn");
  assert.equal(odd.length, 1);
  assert.equal(
    odd[0].lines[0].map((r) => r.text).join(""),
    "5 * 3 = 15, and 2*4 is 8; a_b_c stays; <b>no</b> tag is drawn",
    "a star or an underscore inside words is the words; a tag is text, drawn as text",
  );
  assert.ok(!odd[0].lines[0].some((r) => r.bold || r.italic));
  assert.equal(answerBlocks("| a | b |\nno rule under it").length, 1, "a bar line with no rule is a paragraph");
});

test("the formatting read as plain words: Copy keeps bullets and a table's rows, a voice hears phrases with no marks", () => {
  const detail = "### Today\n- answer **Ana**\n  - then Sam\n\n| Channel | Booked |\n|---|---|\n| WhatsApp | 18 |";
  assert.equal(answerPlain(detail), "Today\n• answer Ana\n  • then Sam\nChannel · Booked\nWhatsApp · 18");
  assert.equal(answerPlain(detail, true), "Today\nanswer Ana\nthen Sam\nChannel, Booked\nWhatsApp, 18");
});

test("the detail keeps its formatting and its indents; the headline is one plain sentence; an entry keeps its bold", () => {
  const read = normalizeAnswer(
    JSON.stringify({
      say: { headline: "**Two** need you.", detail: "1. Answer Ana\n  - she waited **3 days**\n2. Then Sam" },
      show: { figures: [], items: [], breakdown: null, list: { style: "bullets", entries: ["- call **Sam** back"] } },
      do: { open: { source: { kind: "none", id: "", label: "" }, label: "", now: false }, next: [] },
      language: "en",
    }),
    emptyReadSet(),
    "en",
  );
  assert.equal(read.ok, true);
  assert.equal(read.answer.say.headline, "Two need you.");
  assert.equal(read.answer.say.detail, "1. Answer Ana\n  - she waited **3 days**\n2. Then Sam");
  assert.deepEqual(read.answer.show.list.entries, ["call **Sam** back"]);
  assert.equal(
    answerText(read.answer),
    "Two need you.\n1. Answer Ana\n  • she waited 3 days\n2. Then Sam\n• call Sam back",
    "Copy's words: a detail that opens with a list starts on its own line, the marks read as plain words",
  );
  assert.equal(
    answerSpoken(read.answer),
    "Two need you. 1. Answer Ana. she waited 3 days. 2. Then Sam. call Sam back.",
  );
});

test("nextNotAsked (the answer canvas, item 15): a next question the thread asked or offered goes, however it is cased or stopped; the rest keep their order", () => {
  assert.deepEqual(
    nextNotAsked(
      ["Who called this week?", "Which list is biggest?", "What about next week?"],
      ["who called this week", "Which list is biggest?!"],
    ),
    ["What about next week?"],
  );
  assert.deepEqual(nextNotAsked(["A?", "B?"], []), ["A?", "B?"]);
});

test("a customer's words quoted and a callout for what comes first (the answer canvas, C2): `>` lines are a quote, an alert's mark makes a callout, amber for what needs them; Copy quotes the words, a voice says them", () => {
  const detail =
    "Riley wrote:\n> Your quote was twice what the website says.\n> Can you explain?\n\n> [!WARNING] Connect a calendar first.\n\n> [!NOTE]\n> Reminders go the day before.";
  assert.deepEqual(answerBlocks(detail), [
    { kind: "text", lines: [[{ text: "Riley wrote:" }]] },
    {
      kind: "quote",
      lines: [[{ text: "Your quote was twice what the website says." }], [{ text: "Can you explain?" }]],
    },
    { kind: "callout", tone: "warn", lines: [[{ text: "Connect a calendar first." }]] },
    { kind: "callout", tone: "note", lines: [[{ text: "Reminders go the day before." }]] },
  ]);
  assert.equal(answerBlocks("> [!CAUTION] **Paused** since Monday")[0].tone, "warn");
  assert.equal(answerBlocks("> [!TIP] Ask me again tomorrow")[0].tone, "note");
  assert.equal(answerBlocks("> [!WARNING]").length, 0, "a mark with no words draws nothing");
  assert.deepEqual(
    answerBlocks("1. Reply to Riley:\n  > The quote was **higher**.")[0].list.items[0].runs,
    [
      { text: "Reply to Riley:" },
      { text: " “" },
      { text: "The quote was ", italic: true },
      { text: "higher", bold: true, italic: true },
      { text: ".", italic: true },
      { text: "”" },
    ],
    "a quote under a step is its words in quotes, never a > drawn",
  );
  assert.equal(
    answerPlain(detail),
    "Riley wrote:\n“Your quote was twice what the website says.”\n“Can you explain?”\nConnect a calendar first.\nReminders go the day before.",
  );
  assert.equal(
    answerPlain(detail, true),
    "Riley wrote:\nYour quote was twice what the website says.\nCan you explain?\nConnect a calendar first.\nReminders go the day before.",
  );
});

test("a door in the words (the answer canvas, C2): only a link the normaliser wrote, `ask:` and a route of the app's own, opens; any other link is its words, and an address elsewhere never opens", () => {
  assert.deepEqual(answerBlocks("1. Reply to [Riley's review](ask:reviews/rv-1)")[0].list.items[0].runs, [
    { text: "Reply to " },
    { text: "Riley's review", to: "reviews/rv-1" },
  ]);
  assert.deepEqual(answerBlocks("See [this](ask:javascript:alert(1))")[0].lines[0][1], { text: "this" });
  assert.deepEqual(answerBlocks("See [this](review:abc)")[0].lines[0], [{ text: "See " }, { text: "this" }]);
  assert.deepEqual(answerBlocks("See [this](https://example.com)")[0].lines[0], [{ text: "See " }, { text: "this" }]);
  assert.deepEqual(answerBlocks("See [this](ask://example.com)")[0].lines[0], [{ text: "See " }, { text: "this" }]);
  assert.equal(answerPlain("Reply to [Riley's review](ask:reviews/rv-1)."), "Reply to Riley's review.");
});

test("the normaliser grounds the doors in the words (the answer canvas, C2): a row this turn read, named as kind:id, by its id or by its route, becomes `ask:` and its route; a row not read, an address and a page no reader names are words alone, each counted dropped", () => {
  const r = read1(
    written({
      say: {
        headline: "Two need you.",
        detail: `1. Reply to [Nora](thread:${ID})\n2. Call [Sam](${CALL}) back\n3. Read [the profile](clients/${PERSON})\n4. Not [this one](thread:${UNREAD})\n5. Not [this](https://example.com) either`,
      },
    }),
  );
  assert.equal(
    r.answer.say.detail,
    `1. Reply to [Nora](ask:inbox/th-${ID})\n2. Call [Sam](ask:conversations/cv-${CALL}) back\n3. Read [the profile](ask:clients/${PERSON})\n4. Not this one\n5. Not this either`,
  );
  assert.ok(r.dropped >= 2, "the row not read and the address are dropped");
  const runs = answerBlocks(r.answer.say.detail)[0].list.items.map((it) => it.runs.find((x) => x.to)?.to ?? null);
  assert.deepEqual(runs, [`inbox/th-${ID}`, `conversations/cv-${CALL}`, `clients/${PERSON}`, null, null]);
  assert.equal(answerText(r.answer).split("\n")[1], "1. Reply to Nora", "Copy and the history read the words alone");
});

test("REGRESSION (the C2 look, 16 Oct): a door or an italic inside bold is read, and steps that go on after a quote between them keep their numbers", () => {
  assert.deepEqual(answerBlocks("**Reply to [Riley](ask:reports/reviews:rv-1)** and *see **this***")[0].lines[0], [
    { text: "Reply to ", bold: true },
    { text: "Riley", to: "reports/reviews:rv-1", bold: true },
    { text: " and " },
    { text: "see ", italic: true },
    { text: "this", bold: true, italic: true },
  ]);
  const blocks = answerBlocks("1. Answer the search\n2. Reply to Riley:\n> The quote was higher.\n3. Thank Morgan");
  assert.deepEqual(
    blocks.map((b) => b.kind),
    ["list", "quote", "list"],
  );
  assert.equal(blocks[0].list.start, undefined, "a list from 1 says nothing of it");
  assert.equal(blocks[2].list.start, 3, "the step after the quote is still 3");
  assert.equal(answerPlain("1. a\n> said\n3. c"), "1. a\n“said”\n3. c");
});

test("REGRESSION (the A1 eval): a headline's second sentence opens the detail as a paragraph of its own above a table, so the table keeps its first row", () => {
  const read = normalizeAnswer(
    JSON.stringify({
      say: {
        headline: "WhatsApp brought the most. Bookings can't be counted yet.",
        detail: "| Channel | People |\n|---|---|\n| WhatsApp | 3 |",
      },
      show: { figures: [], items: [], breakdown: null, list: { style: "bullets", entries: [] } },
      do: { open: { source: { kind: "none", id: "", label: "" }, label: "", now: false }, next: [] },
      language: "en",
    }),
    emptyReadSet(),
    "en",
  );
  assert.equal(read.answer.say.headline, "WhatsApp brought the most.");
  assert.equal(
    read.answer.say.detail,
    "Bookings can't be counted yet.\n\n| Channel | People |\n|---|---|\n| WhatsApp | 3 |",
  );
  assert.deepEqual(
    answerBlocks(read.answer.say.detail).map((b) => b.kind),
    ["text", "table"],
  );
});
