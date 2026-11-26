/**
 * The reports' routes; a search's question answered in its thread; the scope each turn's; a thread live and cold
 * across turns (the Phase 5 plan); the raw turn never selected; and the database in memory answering a select as
 * PostgREST does.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ASK_MODEL } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";
import { PLAN } from "../../_lead-fixtures.mjs";
import {
  A,
  B,
  CARD,
  GatewayRefused,
  M1,
  PLANNED,
  SEARCH,
  SIGNATURE,
  T1,
  answered,
  asJsonb,
  ask,
  askWorld,
  askedBlocks,
  at,
  besideACard,
  both,
  ctxFor,
  get,
  inA,
  lastUser,
  leadWorld,
  linesOf,
  longThread,
  nothing,
  prefixOf,
  printed,
  proposals,
  readByPath,
  refused,
  reports,
  send,
  setAskPorts,
  thread,
  threadRow,
  turn,
  unmark,
  waitingSearch,
  wordsOnly,
} from "./_routes.mjs";

test("the reports' Deals section is every workspace's (0008, amended 18 Oct 2026): drawn wherever a deal is on file, whatever the retired answer to how its customers buy said", async () => {
  const contact = "cccccccc-cccc-4ccc-8ccc-cccccccccc01";
  // One page of People, the booking line's: the deals read where each new client came from out of the same rows.
  const rpcs = {
    report_series: (a) => ({ days: a.p_days, tenant: a.p_tenant_id }),
    people_list: () => [{ id: contact, came_from: "lead" }],
  };
  const won = {
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddd01",
    tenant_id: A,
    contact_id: contact,
    stage: "won",
    proposed_at: new Date(Date.now() - 5 * 86_400_000).toISOString(),
    amount_cents: 250_000,
    per: "month",
  };
  const run = async () => {
    const tables = {
      memberships: both("viewer", "viewer"),
      tenants: [{ id: A, slug: "harbor" }],
      tenant_config: [],
      policies: [],
      deals: [won],
    };
    const ctx = ctxFor(tables, {}, rpcs);
    const out = await reports.GET.run(get(inA), ctx);
    return {
      deals: out.deals,
      read: ctx.supabase.seen.some((q) => q.table === "deals"),
      people: ctx.supabase.seen.filter((q) => q.rpc === "people_list").length,
    };
  };
  const on = await run();
  assert.deepEqual([on.deals.any, on.deals.clients, on.deals.monthly_cents], [true, 1, 250_000]);
  assert.deepEqual(on.deals.sources, [{ came_from: "lead", count: 1 }], "the new client's source, from People");
  assert.equal(on.people, 1, "People read once for the whole report, the booking line's read");
  assert.equal(on.read, true, "every workspace's deals are read (0008, amended 18 Oct 2026)");
});

test("an answer to a search's question lands in the thread it was planned in: the thread keeps the owner's words, the model reads which search and what it asked, on that turn and every later one", async () => {
  const tables = leadWorld(
    [threadRow(PLANNED, A, { title: "Pilates studios in Denver, no franchises" })],
    [
      turn(M1, PLANNED, A, "user", { text: "Pilates studios in Denver, no franchises" }),
      {
        ...turn("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2", PLANNED, A, "assistant", { text: "Here is the plan." }),
        created_at: "2026-09-10T00:00:02Z",
      },
    ],
  );
  const requests = wordsOnly();
  try {
    const body = {
      text: "Include the franchise ones too",
      thread_id: PLANNED,
      answering: { search_id: SEARCH },
      surface: "leads",
    };
    const lines = await linesOf(await ask.POST.run(send("POST", body, inA), ctxFor(tables)));
    assert.equal(lines[0].id, PLANNED, "the turn is in the planning thread");
    assert.equal(tables.ask_threads.length, 1, "no new thread");
    const mine = tables.ask_messages[2];
    assert.deepEqual(
      [mine.thread_id, mine.role, mine.content.text],
      [PLANNED, "user", "Include the franchise ones too"],
    );
    assert.deepEqual(
      mine.content.answering,
      {
        search_id: SEARCH,
        name: "Pilates studios · Denver",
        question: "Most of the first 25 are franchises, which I'm leaving out. Is that what you meant?",
        asked: "Pilates studios in Denver, no franchises",
        leaving_out: ["Franchises"],
      },
      "what it answered is stored beside the words, read from the search, never from the client",
    );
    // The thread as the Line reads it back: the owner's words and nothing of the machine's.
    const read = await thread.GET.run(get(inA), ctxFor(tables, { id: PLANNED }));
    assert.equal(read.messages[2].text, "Include the franchise ones too");
    assert.ok(!JSON.stringify(read).includes("search id"), "the context never reaches the page");
    // The model: the planning turns as history, then the answer inside what it answers.
    const said = lastUser(requests[0]);
    assert.ok(
      said.startsWith(
        `On People › Leads, my search for Pilates studios · Denver (search id ${SEARCH}) stopped to ask: “Most of the first 25 are franchises`,
      ),
      said,
    );
    assert.ok(said.includes("I had asked for: “Pilates studios in Denver, no franchises”, leaving out Franchises."));
    assert.ok(said.includes("My answer: Include the franchise ones too."));
    assert.ok(said.includes("propose_lead_search with action find and amends set to that id"));
    assert.deepEqual(
      requests[0].messages.slice(0, 2).map((m) => [m.role, m.content]),
      [
        ["user", "Pilates studios in Denver, no franchises"],
        ["assistant", "Here is the plan."],
      ],
      "the conversation where the search was planned rides in",
    );
    // A later turn in the thread still knows what that answer was about. Asked at once, the thread is warm: the answer's
    // turn is replayed as the model was sent it (the Phase 5 plan, PR 5.4), its words in the question's blocks.
    await linesOf(
      await ask.POST.run(send("POST", { text: "And how many is that?", thread_id: PLANNED }, inA), ctxFor(tables)),
    );
    const textOf = (c) => (typeof c === "string" ? c : c.map((b) => b.text ?? "").join("\n"));
    const replayed = requests[1].messages.map((m) => textOf(m.content));
    assert.ok(
      replayed.some(
        (c) => c.includes(`(search id ${SEARCH})`) && c.includes("My answer: Include the franchise ones too."),
      ),
      "the answer is replayed with what it answered",
    );
    assert.equal(tables.ask_messages.at(-1).content.shape.replay, "live", "replayed, not rebuilt");
    assert.equal(lastUser(requests[1]), "And how many is that?", "a plain turn is only its words");
    assert.equal(
      tables.ask_threads[0].title,
      "Pilates studios in Denver, no franchises",
      "the title stays the planning question's (D9)",
    );
  } finally {
    setAskPorts(null);
  }
});

test("an answer whose thread is not the caller's -- a teammate's, which RLS hides, or another workspace's -- starts one of their own, titled by the search's name; a plain question to such a thread is still refused", async () => {
  const requests = wordsOnly();
  try {
    // RLS answers another person's thread with nothing (00040 ask_threads_own_select), so to the route it is absent.
    for (const [threads, why] of [
      [[], "a thread RLS hides"],
      [[threadRow(PLANNED, B)], "another workspace's thread"],
    ]) {
      const tables = leadWorld(threads);
      const body = { text: "Yes, include them", thread_id: PLANNED, answering: { search_id: SEARCH } };
      const lines = await linesOf(await ask.POST.run(send("POST", body, inA), ctxFor(tables)));
      const made = tables.ask_threads.find((t) => t.tenant_id === A);
      assert.ok(made && made.id !== PLANNED, `${why}: a new conversation`);
      assert.deepEqual(
        [lines[0].id, lines[0].title, made.title],
        [made.id, "Pilates studios · Denver", "Pilates studios · Denver"],
        `${why}: titled by the search's name`,
      );
      assert.deepEqual(
        tables.ask_messages.filter((m) => m.thread_id === made.id && m.role === "user").map((m) => m.content.text),
        ["Yes, include them"],
      );
    }
    assert.ok(lastUser(requests[0]).includes("My answer: Yes, include them."), "the model is told what it answers");
    // A search that keeps no thread (made on the page, or before 00172): the same.
    const bare = leadWorld();
    bare.lead_searches_view = [waitingSearch({ thread_id: null })];
    await linesOf(
      await ask.POST.run(send("POST", { text: "Yes", answering: { search_id: SEARCH } }, inA), ctxFor(bare)),
    );
    assert.deepEqual(
      bare.ask_threads.map((t) => t.title),
      ["Pilates studios · Denver"],
      "never the machine's sentence",
    );
    // Without an answer to make, a thread that is not theirs is what it always was: a 404, nothing saved.
    const plain = leadWorld([threadRow(PLANNED, B)]);
    await refused(
      ask.POST.run(send("POST", { text: "And then?", thread_id: PLANNED }, inA), ctxFor(plain)),
      "not_found",
      404,
      "That conversation is not yours.",
    );
    assert.equal(plain.ask_messages.length, 0);
    // A search that is not this workspace's is refused before anything is saved.
    const away = leadWorld();
    away.lead_searches_view = [waitingSearch({ tenant_id: B })];
    await refused(
      ask.POST.run(send("POST", { text: "Yes", answering: { search_id: SEARCH } }, inA), ctxFor(away)),
      "not_found",
      404,
    );
    assert.deepEqual([away.ask_threads.length, away.ask_messages.length], [0, 0]);
  } finally {
    setAskPorts(null);
  }
});

test("a new search's card carries the thread it was planned in, for the commit to hand the search; a card that answers a search carries none", async () => {
  const tables = leadWorld();
  let n = 0;
  setAskPorts({
    round: async () => ({
      blocks: [{ type: "tool_use", id: `t${++n}`, name: "propose_lead_search", text: "", json: '{"action":"find"}' }],
      stopReason: "tool_use",
      streamError: null,
    }),
    shape: async () => "",
    propose: async () => ({
      proposal: {
        id: `p${n}`,
        kind: "lead_search",
        needs: "owner",
        title: "Find 20 personal trainers",
        summary: "…",
        payload: n === 1 ? { plan: PLAN } : { plan: { ...PLAN, version: 2 }, amends: { search_id: SEARCH } },
        undo: n === 1 ? "Stop the search" : null,
      },
      result: JSON.stringify({ proposed: true }),
      isError: false,
    }),
  });
  try {
    const body = { text: "20 personal trainers in Austin", surface: "leads" };
    const lines = await linesOf(await ask.POST.run(send("POST", body, inA), ctxFor(tables)));
    const made = tables.ask_threads[0].id;
    assert.equal(lines.at(-1).message.proposals[0].payload.thread_id, made, "the card on the stream");
    assert.equal(
      tables.ask_messages[1].content.proposals[0].payload.thread_id,
      made,
      "and as stored, for an approve later",
    );
    const again = { text: "Include them", thread_id: made, answering: { search_id: SEARCH } };
    const answer = (await linesOf(await ask.POST.run(send("POST", again, inA), ctxFor(tables)))).at(-1).message;
    assert.equal("thread_id" in answer.proposals[0].payload, false, "an answer's card starts no search");
  } finally {
    setAskPorts(null);
  }
});

test("a change said to Ask makes the search card again (Ruben, 23 Oct 2026): the turn is told the waiting card's plan whole, the card it makes replaces the one waiting, which is kept set aside, and an idea's mark goes with it", async () => {
  const tables = leadWorld();
  let n = 0;
  const asked = [];
  setAskPorts({
    round: async ({ request }) => {
      asked.push(request);
      return {
        blocks: [{ type: "tool_use", id: `t${++n}`, name: "propose_lead_search", text: "", json: '{"action":"find"}' }],
        stopReason: "tool_use",
        streamError: null,
      };
    },
    shape: async () => "",
    propose: async () => ({
      proposal: {
        id: `p${n}`,
        kind: "lead_search",
        needs: "owner",
        title: `Find ${n === 1 ? 20 : 40} personal trainers`,
        summary: "…",
        payload: { plan: n === 1 ? { ...PLAN, from: "idea" } : { ...PLAN, count: 40 } },
        undo: "Stop the search",
      },
      result: JSON.stringify({ proposed: true }),
      isError: false,
    }),
  });
  try {
    const first = { text: "20 personal trainers in Austin", surface: "leads" };
    await linesOf(await ask.POST.run(send("POST", first, inA), ctxFor(tables)));
    const made = tables.ask_threads[0].id;
    const again = { text: "Make it 40", thread_id: made, surface: "leads" };
    const answer = (await linesOf(await ask.POST.run(send("POST", again, inA), ctxFor(tables)))).at(-1).message;
    const told = JSON.stringify(asked.at(-1).messages);
    assert.ok(told.includes("A search card waits in this conversation for their press"), "the waiting card is told");
    assert.ok(told.includes('\\"terms\\":[\\"personal trainer\\",\\"strength coach\\"]'), "its plan whole");
    assert.equal(answer.proposals[0].payload.plan.from, "idea", "the idea's mark goes with the change");
    const [firstCard] = tables.ask_messages[1].content.proposals;
    assert.deepEqual(
      [firstCard.id, firstCard.outcome?.state, firstCard.outcome?.receipt],
      ["p1", "dismissed", "Changed below."],
      "the card it replaced is kept set aside: one search card in a thread can be pressed",
    );
    assert.equal(tables.ask_messages[3].content.proposals[0].outcome, undefined, "the new one waits");
  } finally {
    setAskPorts(null);
  }
});

test("a thread past thirty turns reads its newest sixty rows (MESSAGES_CAP): GET ask/threads/[id] draws them oldest first, the newest last, a tie in the clock broken by the id; and a follow-up is asked with the newest twelve turns, from a question, never the first", async () => {
  const rows = longThread(70);
  // The newest turn's question and answer in one millisecond: the id puts them in order, the same way every read.
  rows[69].created_at = rows[68].created_at;
  const tables = askWorld([threadRow(T1, A)], rows);
  const read = await thread.GET.run(get(inA), ctxFor(tables, { id: T1 }));
  assert.equal(read.messages.length, 60, "the read's sixty");
  assert.deepEqual(
    [read.messages[0].text, read.messages.at(-2).text, read.messages.at(-1).text],
    ["Question 10?", "Question 68?", "Answer 69."],
    "REGRESSION: a thread past thirty turns reopened on its first thirty and dropped the newest",
  );
  assert.deepEqual(
    read.messages.map((m) => m.text),
    rows.slice(10).map((r) => r.content.text),
    "in the order they were written",
  );
  const requests = wordsOnly();
  try {
    await linesOf(await ask.POST.run(send("POST", { text: "And after that?", thread_id: T1 }, inA), ctxFor(tables)));
    const history = requests[0].messages.slice(0, -2).map((m) => [m.role, m.content]);
    assert.deepEqual(history.at(-1), ["assistant", "Answer 69."], "the model reads the thread up to its newest turn");
    assert.deepEqual(
      history,
      rows.slice(46, 70).map((r) => [r.role, r.content.text]),
      "the newest twelve turns, twenty-four messages from Question 46: twelve turns, counted as turns",
    );
    assert.equal(lastUser(requests[0]), "And after that?");
  } finally {
    setAskPorts(null);
  }
});

test("the scope is each turn's (the Phase 5 plan, D9): a follow-up asked on another row is asked about that row -- the scope line in its words and the row read before the model -- and the thread keeps it; no scope sent is the thread's own, unchanged, and so is one not in the palette's shape; null is none, and clears the thread's", async () => {
  const ROSA = { kind: "person", id: "cccccccc-cccc-4ccc-8ccc-cccccccccc01", label: "Rosa" };
  const NORA = { kind: "person", id: "cccccccc-cccc-4ccc-8ccc-cccccccccc02", label: "Nora" };
  const tables = askWorld();
  // The scope's row is read before the model is asked (cross-page.ts scopedRead): answered at once here.
  const requests = wordsOnly({
    tool: async (tc, run) => ({ result: JSON.stringify({ read: run.input }), isError: false }),
  });
  /** What a turn was asked about: the scope line in its words, and the rows read for it before the model. */
  const aboutOf = (req) => {
    const blocks = askedBlocks(req);
    const words = blocks
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    return {
      line: /They are looking at <record>(.+?)<\/record> \((\w+) ([^)]+)\)/.exec(words)?.slice(1, 4) ?? null,
      read: blocks.filter((b) => b.type === "search_result" && b.source === "read://people.get").map((b) => b.title),
    };
  };
  const about = (s) => ({ line: [s.label, s.kind, s.id], read: [`people {"action":"get","contact_id":"${s.id}"}`] });
  const NONE = { line: null, read: [] };
  const asked = async (body) => linesOf(await ask.POST.run(send("POST", body, inA), ctxFor(tables)));
  try {
    const id = (await asked({ text: "What did she ask for?", scope: ROSA, surface: "people" }))[0].id;
    const stored = () => tables.ask_threads.find((t) => t.id === id).scope;
    assert.deepEqual(
      aboutOf(requests.at(-1)),
      about(ROSA),
      "the first turn: about Rosa, her row read before the model",
    );
    assert.deepEqual(stored(), ROSA, "a new thread is made with its question's scope");
    await asked({ text: "And Nora?", thread_id: id, scope: NORA, surface: "people" });
    assert.deepEqual(
      aboutOf(requests.at(-1)),
      about(NORA),
      "a follow-up asked on Nora's row: about Nora, her row read",
    );
    assert.deepEqual(
      stored(),
      NORA,
      "REGRESSION: the thread kept its first scope, so the next question sent with none was asked about Rosa again",
    );
    for (const [scope, why] of [
      [undefined, "no scope sent"],
      ["Nora", "a scope that is a string"],
      [{ kind: "person", id: "", label: "Nora" }, "a scope with no id"],
      [{ kind: "shelf", id: NORA.id, label: "Nora" }, "a kind the palette never sends"],
    ]) {
      await asked({ text: "And then?", thread_id: id, ...(scope === undefined ? {} : { scope }) });
      assert.deepEqual(aboutOf(requests.at(-1)), about(NORA), `${why}: the thread's own, Nora`);
      assert.deepEqual(stored(), NORA, `${why}: the thread's scope unchanged`);
    }
    await asked({ text: "Anything else?", thread_id: id, scope: null });
    assert.deepEqual(aboutOf(requests.at(-1)), NONE, "null: this turn has none -- no scope line, no row read for it");
    assert.equal(stored(), null, "and the thread's is cleared");
    await asked({ text: "And now?", thread_id: id });
    assert.deepEqual(aboutOf(requests.at(-1)), NONE, "no scope sent after it was cleared: the thread's own, none");
    assert.equal(stored(), null);
    assert.deepEqual(
      tables.ask_messages.filter((m) => m.role === "assistant").map((m) => m.content.shape.scope_kind),
      ["person", "person", "person", "person", "person", "person", null, null],
      "each turn's shape says the scope it ran with",
    );
    // A new thread asked with none is made with none.
    const bare = (await asked({ text: "Who is new this week?", scope: null }))[0].id;
    assert.equal(tables.ask_threads.find((t) => t.id === bare).scope, null);
    assert.deepEqual(aboutOf(requests.at(-1)), NONE);
  } finally {
    setAskPorts(null);
  }
});

test("the turn as the model was sent it rides on the answer's row, at content.raw (the Phase 5 plan, D11): its messages and blocks one JSON string beside its scalars, so they come back the bytes that were sent though jsonb reorders every object's keys; the words history the turn was asked with among them; nowhere else -- not on the stream, not in a log line; a turn that failed keeps none", async () => {
  const tables = askWorld();
  const requests = besideACard();
  try {
    const { value: lines, said } = await printed(async () =>
      linesOf(
        await ask.POST.run(send("POST", { text: "Ask me before every reply", surface: "today" }, inA), asJsonb(tables)),
      ),
    );
    const row = tables.ask_messages[1];
    assert.equal(row.role, "assistant");
    const raw = row.content.raw;
    assert.ok(raw, "the answer's row keeps the turn as it was sent");
    // The trap: what the row keeps as objects comes back in jsonb's order, never the writer's.
    assert.deepEqual(Object.keys(raw), ["at", "model", "blocks", "prefix"], "jsonb's order: shorter keys first");
    assert.deepEqual(Object.keys(row.content.answer), ["v", "do", "say", "form", "show", "language"]);
    assert.deepEqual(Object.keys(lines.at(-1).message.answer), ["v", "form", "say", "show", "do", "language"]);
    // The string comes back as it went.
    const sent = requests[0];
    assert.equal(requests.length, 1);
    const blocks = JSON.parse(raw.blocks);
    assert.deepEqual(Object.keys(blocks), ["base", "question", "rounds", "final", "results"]);
    assert.equal(
      JSON.stringify([...blocks.base, { role: "user", content: blocks.question }, ...blocks.rounds]),
      JSON.stringify(unmark(sent.messages)),
      "read back, the last request's messages, byte for byte, less the cache's markers the request carried",
    );
    assert.ok(!raw.blocks.includes("cache_control"), "the row keeps no marker");
    assert.deepEqual(
      [blocks.base, blocks.rounds.map((m) => m.role)],
      [[], ["system"]],
      "a thread's first turn, one round: the turn's words after the question, nothing more",
    );
    assert.deepEqual(blocks.final, [
      { type: "thinking", thinking: "", signature: SIGNATURE },
      {
        type: "tool_use",
        id: "t-card",
        name: "propose_settings",
        input: { action: "autonomy", class: "reply", mode: "ask" },
      },
      { type: "text", text: answered },
    ]);
    assert.deepEqual(
      blocks.results,
      [
        {
          type: "tool_result",
          tool_use_id: "t-card",
          // As the model is sent it: the tool's own JSON, inside its fence (round.ts resultBlocks).
          content: `<record>\n${JSON.stringify({ proposed: true, id: CARD.id })}\n</record>`,
          is_error: false,
        },
      ],
      "the card's result, which no request carried",
    );
    assert.equal(raw.model, ASK_MODEL);
    assert.equal(raw.prefix, prefixOf(sent), "the prefix the request says");
    assert.ok(Number.isInteger(raw.at) && raw.at <= Date.parse(row.created_at), "the round began before the save");

    assert.equal(lines.at(-1).t, "final");
    assert.deepEqual(
      lines.at(-1).message.proposals.map((p) => p.id),
      [CARD.id],
      "the final line is the answer the Line draws",
    );
    for (const l of lines)
      assert.ok(!JSON.stringify(l).includes('"raw"') && !JSON.stringify(l).includes(SIGNATURE), `${l.t}: no raw`);
    const logged = said.filter((l) => l.includes('"event":"ask_turn'));
    assert.equal(logged.length, 2, "ask_turn_shape and ask_turn");
    for (const l of logged) assert.ok(!l.includes('"raw"') && !l.includes(SIGNATURE), "no log line carries it");

    // A follow-up at once: the thread is warm, so it replays the first turn as the model was sent it (the Phase 5 plan,
    // PR 5.4), the card's result first in its question. Its raw keeps no base -- its history is the chain it replayed --
    // and names the answer it followed.
    const follow = { text: "And the reminders?", thread_id: row.thread_id };
    await linesOf(await ask.POST.run(send("POST", follow, inA), asJsonb(tables)));
    const nextRaw = tables.ask_messages[3].content.raw;
    const next = JSON.parse(nextRaw.blocks);
    assert.deepEqual(Object.keys(next), ["question", "rounds", "final", "results"], "a live turn keeps no base");
    assert.equal(nextRaw.after, row.id, "the answer it followed");
    assert.deepEqual(next.question[0], blocks.results[0], "the card's result opens its question");
    const firstTurn = [...blocks.base, { role: "user", content: blocks.question }, ...blocks.rounds];
    assert.equal(
      JSON.stringify([
        ...firstTurn,
        { role: "assistant", content: blocks.final },
        { role: "user", content: next.question },
        ...next.rounds,
      ]),
      JSON.stringify(unmark(requests[1].messages)),
      "the follow-up's: the first turn as it was sent, its final, then its own, byte for byte",
    );
    assert.equal(tables.ask_messages[3].content.shape.replay, "live");

    // A turn that failed keeps nothing to replay.
    setAskPorts({
      round: async () => {
        throw new GatewayRefused({ kind: "budget", used: 1, cap: 1 });
      },
      shape: async () => "",
    });
    await linesOf(await ask.POST.run(send("POST", { ...follow, text: "And tomorrow?" }, inA), asJsonb(tables)));
    const failed = tables.ask_messages[5].content;
    assert.deepEqual([failed.failed, failed.failure, failed.raw], [true, "budget", null]);
  } finally {
    setAskPorts(null);
  }
});

test("through the route a thread stays live turn after turn (the Phase 5 plan, PR 5.4): a card-ending turn, then a follow-up asked on a page -- its question the card's result, the page's data, the words and the question in one message, after the first turn as it was sent -- then a third that follows the second's link; the raws are read by id, only the chain's; each shape says how its history went", async () => {
  const tables = askWorld();
  const page = {
    blocks: [
      {
        type: "search_result",
        source: "page://today",
        title: "Today",
        content: [{ type: "text", text: "Today: 2 need you" }],
        citations: { enabled: false },
      },
    ],
    refs: [{ kind: "page", id: "today", route: "today", label: "Today" }],
    rows: 0,
    chars: 30,
    stamp: 1,
    failed: false,
    warm: "hit",
  };
  const requests = [];
  setAskPorts({
    round: async (call, onText) => {
      requests.push(JSON.parse(JSON.stringify(call.request)));
      onText(answered);
      const n = requests.length;
      const card = {
        type: "tool_use",
        id: "t-card",
        name: "propose_settings",
        text: "",
        json: '{"action":"autonomy","class":"reply","mode":"ask"}',
      };
      const thought = {
        type: "thinking",
        id: "",
        name: "",
        text: "",
        json: "",
        thinking: "",
        signature: `${SIGNATURE}${n}`,
      };
      return {
        blocks: [thought, ...(n === 1 ? [card] : []), { type: "text", id: "", name: "", text: answered, json: "" }],
        stopReason: "end_turn",
        streamError: null,
      };
    },
    shape: async () => "",
    context: async () => page,
    propose: async () => ({ proposal: CARD, result: JSON.stringify({ proposed: true, id: CARD.id }), isError: false }),
  });
  const onToday = { v: 1, surface: "today", route: "today", view: null, focus: null, rows: [], asked_at: 1 };
  try {
    const [opened] = await linesOf(
      await ask.POST.run(send("POST", { text: "Ask me before every reply" }, inA), asJsonb(tables)),
    );
    const thread_id = opened.id;
    const body = { text: "And the reminders?", thread_id, context: onToday };
    await linesOf(await ask.POST.run(send("POST", body, inA), asJsonb(tables)));
    const third = asJsonb(tables);
    await linesOf(await ask.POST.run(send("POST", { text: "And tomorrow?", thread_id }, inA), third));

    const answers = tables.ask_messages.filter((m) => m.role === "assistant");
    assert.deepEqual(
      answers.map((m) => m.content.shape.replay),
      ["none", "live", "live"],
    );
    assert.deepEqual(
      answers.map((m) => m.content.raw.after ?? null),
      [null, answers[0].id, answers[1].id],
      "each follows the answer before it",
    );
    const [one, two, three] = requests;
    const finalOf = (m) => JSON.parse(m.content.raw.blocks).final;
    assert.equal(
      JSON.stringify(unmark(two.messages.slice(0, one.messages.length))),
      JSON.stringify(unmark(one.messages)),
      "turn 2 begins with turn 1's request, byte for byte",
    );
    assert.deepEqual(two.messages[one.messages.length], { role: "assistant", content: finalOf(answers[0]) });
    assert.deepEqual(
      two.messages.findLast((m) => m.role === "user").content.map((b) => b.tool_use_id ?? b.source ?? b.type),
      ["t-card", "page://today", "text"],
      "the card's result, then the page's data and the question: one message, its words after it",
    );
    assert.equal(
      JSON.stringify(unmark(three.messages.slice(0, two.messages.length))),
      JSON.stringify(unmark(two.messages)),
      "turn 3 begins with turn 2's request, byte for byte",
    );
    assert.deepEqual(three.messages[two.messages.length], { role: "assistant", content: finalOf(answers[1]) });
    assert.deepEqual(
      three.messages.findLast((m) => m.role === "user").content.map((b) => b.type),
      ["text"],
      "turn 2 left no call unanswered: the question alone, its words after it",
    );
    const rawReads = third.supabase.seen.filter((q) => q.table === "ask_messages" && /\braw\b/.test(q.columns ?? ""));
    assert.deepEqual(
      rawReads.map((q) => [q.columns, q.filters]),
      [["id, raw:content->raw", [["in", "id", [answers[1].id, answers[0].id]]]]],
      "one read of the raws, the chain's answers by id",
    );
  } finally {
    setAskPorts(null);
  }
});

test("what happened since, through the route (the Phase 5 plan, D8): a card approved between two turns is said in the next live turn's words, after the clock -- its title, its id, approved, its receipt -- that turn keeps what it told, and the turn after it says it no more", async () => {
  const tables = askWorld();
  const requests = [];
  // A reply's card: its approval sends a reply and leaves system as it was, so the next turn stays live. (An autonomy
  // or a settings card's approval changes system, which carries the policies and the settings: the next turn is cold.)
  const REPLY = {
    id: "p-1",
    kind: "reply",
    needs: "operator",
    title: "Reply to Rosa",
    summary: "We open at nine on Saturday.",
    payload: { conversation_id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1", text: "We open at nine on Saturday." },
    undo: null,
  };
  setAskPorts({
    round: async (call, onText) => {
      requests.push(JSON.parse(JSON.stringify(call.request)));
      onText(answered);
      const draft = {
        type: "tool_use",
        id: "t-card",
        name: "propose_reply",
        text: "",
        json: JSON.stringify({ action: "draft", conversation_id: REPLY.payload.conversation_id, text: REPLY.summary }),
      };
      return {
        blocks: [
          ...(requests.length === 1 ? [draft] : []),
          { type: "text", id: "", name: "", text: answered, json: "" },
        ],
        stopReason: "end_turn",
        streamError: null,
      };
    },
    shape: async () => "",
    propose: async () => ({
      proposal: REPLY,
      result: JSON.stringify({ proposed: true, id: REPLY.id }),
      isError: false,
    }),
  });
  const SINCE = "Since the last answer, the person acted on cards from earlier in this conversation:";
  /** The words of a request's question: the text block that says who is asking, line by line. */
  const wordsOf = (req) =>
    req.messages
      .at(-1)
      .content.find((b) => b.type === "text" && b.text.includes("You are speaking with"))
      .text.split("\n");
  try {
    const [opened] = await linesOf(
      await ask.POST.run(send("POST", { text: "Tell Rosa we open at nine" }, inA), asJsonb(tables)),
    );
    const card = tables.ask_messages.find((m) => m.role === "assistant");
    const outcome = asJsonb(tables, { id: card.id, pid: REPLY.id });
    await proposals.POST.run(send("POST", { state: "done", receipt: "Sent to Rosa", at_ms: 1_000 }), outcome);
    for (const text of ["And the reminders?", "And tomorrow?"])
      await linesOf(await ask.POST.run(send("POST", { text, thread_id: opened.id }, inA), asJsonb(tables)));

    const answers = tables.ask_messages.filter((m) => m.role === "assistant");
    assert.deepEqual(
      answers.map((m) => m.content.shape.replay),
      ["none", "live", "live"],
    );
    assert.equal(
      wordsOf(requests[1])[1],
      `${SINCE} “Reply to Rosa” (p-1) was approved: Sent to Rosa.`,
      "the second turn says it, after the clock",
    );
    assert.deepEqual(answers[1].content.raw.told, ["p-1:done:1000"], "and keeps what it told");
    assert.ok(!wordsOf(requests[2]).some((l) => l.startsWith(SINCE)), "the third turn says it no more");
    assert.deepEqual(answers[2].content.raw.told, []);
    assert.ok(!wordsOf(requests[0]).some((l) => l.startsWith(SINCE)), "a first turn has nothing to say");
  } finally {
    setAskPorts(null);
  }
});

test("a cold follow-up through the route (the Phase 5 plan, PR 5.5): turn 1 -- a card beside an answer naming a row of the page -- gone cold, turn 2 is asked with it as one line and rebuilt, its row keeping the lines as its base and what they told, through jsonb; the card approved, turn 3 at once replays turn 2 as it was sent and tells the approval once", async () => {
  const tables = askWorld();
  const ROSA = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
  const rosa = { kind: "thread", id: ROSA, label: "Rosa" };
  const page = {
    blocks: [
      {
        type: "search_result",
        source: "page://inbox",
        title: "Inbox",
        content: [{ type: "text", text: `Rosa · needs you · route: inbox/th-${ROSA}` }],
        citations: { enabled: false },
      },
    ],
    refs: [
      { kind: "page", id: "inbox", route: "inbox", label: "Inbox" },
      { kind: "thread", id: ROSA, route: `inbox/th-${ROSA}`, label: "Rosa" },
    ],
    rows: 1,
    chars: 40,
    stamp: 1,
    failed: false,
    warm: "hit",
  };
  const REPLY = {
    id: "p-1",
    kind: "reply",
    needs: "operator",
    title: "Reply to Rosa",
    summary: "We open at nine on Saturday.",
    payload: { conversation_id: ROSA, text: "We open at nine on Saturday." },
    undo: null,
  };
  const naming = JSON.stringify({
    say: { headline: "Rosa needs you.", detail: "She asked first." },
    show: {
      figures: [],
      items: [{ title: "Rosa", meta: "WhatsApp", line: "Asked about Saturday.", source: rosa }],
      breakdown: { label: "", total: 0, parts: [], source: nothing },
    },
    do: { open: { source: nothing, label: "", now: false }, next: [] },
    language: "en",
  });
  const requests = [];
  setAskPorts({
    round: async (call, onText) => {
      requests.push(JSON.parse(JSON.stringify(call.request)));
      const first = requests.length === 1;
      const words = first ? naming : answered;
      onText(words);
      const draft = {
        type: "tool_use",
        id: "t-card",
        name: "propose_reply",
        text: "",
        json: JSON.stringify({ action: "draft", conversation_id: ROSA, text: REPLY.summary }),
      };
      return {
        blocks: [...(first ? [draft] : []), { type: "text", id: "", name: "", text: words, json: "" }],
        stopReason: "end_turn",
        streamError: null,
      };
    },
    shape: async () => "",
    context: async () => page,
    propose: async () => ({
      proposal: REPLY,
      result: JSON.stringify({ proposed: true, id: REPLY.id }),
      isError: false,
    }),
  });
  const onInbox = { v: 1, surface: "inbox", route: "inbox", view: null, focus: null, rows: [], asked_at: 1 };
  const SINCE = "Since the last answer, the person acted on cards from earlier in this conversation:";
  const wordsOf = (req) =>
    req.messages
      .at(-1)
      .content.find((b) => b.type === "text" && b.text.includes("You are speaking with"))
      .text.split("\n");
  try {
    const [opened] = await linesOf(
      await ask.POST.run(send("POST", { text: "Who needs me?", context: onInbox }, inA), asJsonb(tables)),
    );
    // Ten minutes go by: turn 1's round began then, and its rows were saved then.
    const tenAgo = Date.now() - 10 * 60_000;
    const [question, first] = tables.ask_messages;
    question.created_at = new Date(tenAgo - 1_000).toISOString();
    first.created_at = new Date(tenAgo).toISOString();
    first.content.raw.at = tenAgo;
    const asked = (text) => ({ text, thread_id: opened.id, context: onInbox });
    await linesOf(await ask.POST.run(send("POST", asked("What did she ask?"), inA), asJsonb(tables)));

    const line = `Rosa needs you. Cards: p-1 · reply · Reply to Rosa · not pressed yet. Rows, in order: 1. thread ${ROSA} Rosa.`;
    assert.deepEqual(
      requests[1].messages.slice(0, -2).map((m) => [m.role, m.content]),
      [
        ["user", "Who needs me?"],
        ["assistant", line],
      ],
      "turn 1's question as it was asked, its answer one line",
    );
    const second = tables.ask_messages[3];
    assert.equal(second.content.shape.replay, "rebuilt");
    assert.deepEqual(Object.keys(second.content.raw), ["at", "told", "model", "blocks", "prefix"], "no link, `told`");
    assert.deepEqual(second.content.raw.told, [], "nothing was recorded on turn 1's card when it read");
    assert.equal(
      JSON.stringify(JSON.parse(second.content.raw.blocks).base),
      JSON.stringify(unmark(requests[1].messages.slice(0, -2))),
      "its base: the lines as sent, byte for byte",
    );

    const outcome = asJsonb(tables, { id: first.id, pid: REPLY.id });
    await proposals.POST.run(send("POST", { state: "done", receipt: "Sent to Rosa", at_ms: 1_000 }), outcome);
    await linesOf(await ask.POST.run(send("POST", asked("Did it go?"), inA), asJsonb(tables)));
    await linesOf(await ask.POST.run(send("POST", asked("And tomorrow?"), inA), asJsonb(tables)));
    const [, , third, fourth] = requests;
    const answers = tables.ask_messages.filter((m) => m.role === "assistant");
    assert.deepEqual(
      answers.map((m) => m.content.shape.replay),
      ["none", "rebuilt", "live", "live"],
    );
    assert.equal(
      JSON.stringify(unmark(third.messages.slice(0, requests[1].messages.length))),
      JSON.stringify(unmark(requests[1].messages)),
      "turn 3 begins with turn 2's request, byte for byte: the line as it was made",
    );
    assert.equal(wordsOf(third)[1], `${SINCE} “Reply to Rosa” (p-1) was approved: Sent to Rosa.`, "told once");
    assert.deepEqual([answers[2].content.raw.after, answers[2].content.raw.told], [answers[1].id, ["p-1:done:1000"]]);
    assert.ok(!wordsOf(fourth).some((l) => l.startsWith(SINCE)), "and never again");
  } finally {
    setAskPorts(null);
  }
});

test("the database in memory keeps a column named jsonb as jsonb keeps it: what is written comes back with every object's keys, at every depth, shortest first, then by their bytes -- a call's input and a card's reordered -- and a string as it went; a column not named keeps the writer's order", async () => {
  // ask_messages.content, named; the same row written where it is not named keeps the writer's order.
  const turn = (content) => ({ id: "b", tenant_id: A, thread_id: "th-1", user_id: "u-1", role: "assistant", content });
  const world = { ask_messages: [] };
  const db = fakeDb(world, {}, {}, { jsonb: ["ask_messages.content"] });
  const input = {
    action: "search",
    words: "parking",
    card: [{ action: "invite", email: "a@example.com", role: "viewer" }],
  };
  await db.from("ask_messages").insert(turn(input));
  const [kept] = world.ask_messages;
  assert.deepEqual(Object.keys(kept.content), ["card", "words", "action"]);
  assert.deepEqual(Object.keys(kept.content.card[0]), ["role", "email", "action"]);
  assert.deepEqual(kept.content, input, "the same values");
  const plain = { ask_messages: [] };
  await fakeDb(plain).from("ask_messages").insert(turn(input));
  assert.deepEqual(
    Object.keys(plain.ask_messages[0].content),
    ["action", "words", "card"],
    "a column not named: the writer's order",
  );
  await db
    .from("ask_messages")
    .update({ content: { action: "search", words: "parking" } })
    .eq("id", "b");
  assert.equal(
    JSON.stringify(world.ask_messages[0].content),
    '{"words":"parking","action":"search"}',
    "an update the same",
  );
  await db
    .from("ask_messages")
    .update({ content: { a: JSON.stringify(input) } })
    .eq("id", "b");
  assert.equal(world.ask_messages[0].content.a, JSON.stringify(input), "a string comes back as it went");
});

test("the Line's reads never select the raw turn (the Phase 5 plan, D11): GET ask/threads/[id] and the history a follow-up is asked with read each key of a turn they read by its JSON path, never the whole content, and answer what the whole rows give, byte for byte; a card's outcome recorded later writes the row back whole, the raw turn beside it", async () => {
  const { toMessageVM, modelTurnOf } = await import(at("apps/dashboard/src/server/ask/store.ts"));
  const { answerLine } = await import(at("apps/dashboard/src/server/ask/prompt/prompt.ts"));
  const raw = {
    at: Date.parse("2026-09-10T00:00:01Z"),
    model: ASK_MODEL,
    prefix: "0".repeat(64),
    blocks: JSON.stringify({
      base: [],
      question: [{ type: "text", text: "Which drafts are held?" }],
      rounds: [],
      final: [{ type: "thinking", thinking: "", signature: SIGNATURE }],
      results: [],
    }),
  };
  // Every key the Line (toMessageVM) and the history (modelTurnOf) read, each away from its default, beside the raw turn.
  const asked = turn(M1, T1, A, "user", {
    text: "Include the franchise ones too",
    answering: {
      search_id: SEARCH,
      name: "Pilates studios · Denver",
      question: "Most of the first 25 are franchises, which I'm leaving out. Is that what you meant?",
      asked: "Pilates studios in Denver, no franchises",
      leaving_out: ["Franchises"],
    },
  });
  const answer = {
    ...turn("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2", T1, A, "assistant", {
      v: 2,
      answer: {
        v: 2,
        form: "structured",
        say: { headline: "Dos borradores esperan.", detail: "Desde el mediodía." },
        show: { figures: [], items: [], breakdown: null },
        do: { open: null, next: [] },
        language: "es",
      },
      text: "Dos borradores esperan.",
      citations: [{ kind: "thread", id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1", label: "Rosa", to: "" }],
      followups: ["¿Y mañana?"],
      navigate: { to: "inbox", label: "Inbox", now: false },
      proposals: [CARD],
      language: "es",
      ungrounded: true,
      tools: ["inbox.list"],
      latency_ms: 1234,
      rounds: 2,
      failed: true,
      failure: "cap",
      model: ASK_MODEL,
      shape: { v: 1 },
      raw,
    }),
    created_at: "2026-09-10T00:00:02Z",
  };
  const tables = askWorld([threadRow(T1, A)], [asked, answer]);
  const whole = [asked, answer].map((r) => structuredClone(r));

  const reader = asJsonb(tables, { id: T1 });
  const read = await thread.GET.run(get(inA), reader);
  assert.equal(
    JSON.stringify(read.messages),
    JSON.stringify(whole.map(toMessageVM)),
    "the thread as the Line draws it: byte for byte what the whole rows give",
  );
  assert.ok(!JSON.stringify(read).includes('"raw"') && !JSON.stringify(read).includes(SIGNATURE), "no raw in its JSON");
  readByPath(reader);

  const requests = wordsOnly();
  try {
    const asker = asJsonb(tables);
    await linesOf(await ask.POST.run(send("POST", { text: "And tomorrow?", thread_id: T1 }, inA), asker));
    // The question in the person's words (modelTurnOf), the answer one line (answerLine, the Phase 5 plan, D4).
    assert.deepEqual(
      requests[0].messages.slice(0, -2).map((m) => [m.role, m.content]),
      whole.map((r) =>
        r.role === "assistant"
          ? ["assistant", answerLine(toMessageVM(r), 1200)]
          : [r.role, modelTurnOf(r).text.slice(0, 1200)],
      ),
      "the history a follow-up is asked with: what the whole rows give",
    );
    assert.equal(
      requests[0].messages[1].content,
      "(This turn failed.) Dos borradores esperan. Cards: p-1 · policy · Autonomy: reply · not pressed yet.",
    );
    assert.ok(requests[0].messages[0].content.includes("Pilates studios · Denver"), "the search an answer answered");
    readByPath(asker);
  } finally {
    setAskPorts(null);
  }

  // A card's outcome, recorded later: the row is read and written back whole, so the raw turn stays beside it.
  const outcome = asJsonb(tables, { id: answer.id, pid: CARD.id });
  const done = await proposals.POST.run(send("POST", { state: "done", receipt: "Set", at_ms: 0 }), outcome);
  assert.equal(done.proposal.outcome.receipt, "Set");
  const row = tables.ask_messages.find((m) => m.id === answer.id);
  assert.equal(row.content.proposals[0].outcome.receipt, "Set");
  assert.deepEqual(row.content.raw, raw, "the raw turn kept");
  assert.equal(row.content.raw.blocks, raw.blocks, "its blocks byte for byte");
  const [write] = outcome.supabase.seen.filter((q) => q.table === "ask_messages" && q.op === "update");
  assert.deepEqual(write.values.content.raw, raw, "written back whole");
});

test("a card kept before 26 Nov 2026 holds its outcome's time as atMs, and the Line reads it as at_ms, as a card kept since says it (store.ts keptOutcome)", async () => {
  const { toMessageVM } = await import(at("apps/dashboard/src/server/ask/store.ts"));
  const kept = (id, outcome) => ({
    id,
    kind: "note",
    outcome: { state: "done", receipt: "Noted on Priya.", ...outcome },
  });
  const row = {
    id: "m-kept",
    role: "assistant",
    created_at: "2026-11-20T10:00:00Z",
    content: { text: "Noted.", proposals: [kept("p-old", { atMs: 1_700 }), kept("p-new", { at_ms: 2_000 })] },
  };
  const [old, fresh] = toMessageVM(row).proposals;
  assert.deepEqual(old.outcome, { state: "done", receipt: "Noted on Priya.", at_ms: 1_700 }, "the old name, gone");
  assert.equal(fresh.outcome.at_ms, 2_000, "the new one as it was kept");
});

test("the database in memory answers a select as PostgREST does: the columns it names and no other, each path under its name, null where the row holds no such key, ->> as text; a column or an embed the table does not have is refused", async () => {
  const db = fakeDb({
    ask_messages: [
      {
        id: "a",
        tenant_id: A,
        thread_id: "th-1",
        user_id: "u-1",
        role: "user",
        content: { x: 1, y: { z: [2] }, n: null },
      },
    ],
  });
  const one = (columns) => db.from("ask_messages").select(columns).eq("id", "a").maybeSingle();
  assert.deepEqual((await one("id, v:content->x, y:content->y, n:content->n, gone:content->w")).data, {
    id: "a",
    v: 1,
    y: { z: [2] },
    n: null,
    gone: null,
  });
  assert.deepEqual((await one("id, content->x")).data, { id: "a", x: 1 }, "a path with no alias is named by its key");
  assert.deepEqual((await one("id, x:content->>x")).data, { id: "a", x: "1" }, "->> answers text");
  assert.deepEqual(
    (await one("id, z:content->y->z")).data,
    { id: "a", z: [2] },
    "a path goes as deep as it is written",
  );
  assert.deepEqual((await one("id")).data, { id: "a" }, "a select with no path answers the columns it names, too");
  assert.equal((await one("id, words")).error.code, "42703");
  assert.equal((await one("id, contacts(id)")).error.code, "PGRST200");
});
