/**
 * A turn's loop, executed without a model: a read and then the answer, thinking kept whole, the tools each role is
 * offered, words and cards beside a read, Stop, a refusal or the turn's own time said in our words, a format the API
 * refuses asked again, and the questions production paid a second round for answered in one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { until } from "../../shared/_until.mjs";
import {
  CAMPAIGNS as SALON_SENDS,
  NOW as SALON_NOW,
  SERIES as SALON_WINDOW,
  dtoWith as salonLedger,
} from "../../reports/campaigns/_campaign-world.mjs";
import {
  ASK_MAX_ROUNDS,
  ASK_MAX_TOKENS,
  ASK_TURN_BUDGET_MS,
  ASK_MODEL,
  ASK_EFFORT,
  answerForCards,
  toCampaignLensVM,
} from "@chanlytics/contracts";
import { ASK_ANSWER_TEXT_FORMAT } from "../../../apps/dashboard/src/server/ask/answer-format.ts";
import {
  A,
  ACT_TOOLS,
  ACT_TOOL_NAMES,
  ADD_ADA,
  ADD_NOBODY,
  AN_OWNER,
  C1,
  C2,
  GatewayRefused,
  METRICS,
  NOW,
  PAGE,
  READ_TOOLS,
  ROUND,
  RPCS,
  TZ,
  answer,
  answerJson,
  askedOf,
  buildProposal,
  ctxFor,
  cutBy,
  fromRecord,
  functionGone,
  iso,
  logged,
  ports,
  prose,
  runAskTurn,
  runTool,
  saidFigure,
  salonReport,
  salonRpcs,
  scripted,
  tables,
  toApiTools,
  tool,
  turn,
  unreached,
} from "./_turn.mjs";

test("a read, then the answer: the read runs for real, its rows enter the read set, the second round carries the tool result, and the answer names only rows that were read", async () => {
  const ctx = ctxFor();
  const rosa = { kind: "thread", id: C1, label: "Rosa" };
  const s = scripted([
    ROUND([tool("inbox", { action: "list", filter: "recent" })]),
    ROUND([
      answer("Rosa asked about Saturday; nobody else is waiting.", {
        show: {
          items: [
            { title: "Rosa", meta: "WhatsApp", line: "Asked about Saturday.", source: rosa },
            { title: "Nobody", meta: "", line: "", source: { kind: "thread", id: C2, label: "nobody" } },
          ],
        },
        do: { open: { source: rosa, label: "", now: true }, next: ["Reply to Rosa?"] },
      }),
    ]),
  ]);
  const { input, events } = turn(ctx);
  const r = await runAskTurn(input, ports(s.round));
  assert.equal(r.failed, false, r.failure ?? "");
  assert.equal(r.text, "Rosa asked about Saturday; nobody else is waiting.");
  assert.equal(r.answer.form, "structured");
  assert.deepEqual([r.rounds, r.tools], [2, ["inbox.list"]]);
  assert.deepEqual(
    r.answer.show.items.map((i) => [i.source.kind, i.source.id, i.source.to]),
    [["thread", C1, `inbox/th-${C1}`]],
    "the thread the read returned is an item; the one it did not is dropped",
  );
  assert.deepEqual(
    r.answer.do.open,
    { to: `inbox/th-${C1}`, label: "Open the conversation", now: true },
    "one door runs where the answer is drawn: the Open the person asked for keeps its now beside the same row's item",
  );
  assert.deepEqual(r.answer.do.next, ["Reply to Rosa?"]);
  assert.equal(r.ungrounded, false);
  assert.equal(s.requests.length, 2);
  assert.deepEqual(s.requests[0].tool_choice, { type: "auto" });
  assert.deepEqual(
    s.requests[0].output_config,
    { effort: ASK_EFFORT, format: { type: "json_schema", schema: ASK_ANSWER_TEXT_FORMAT } },
    "every round may answer, in the answer's format, at the profile's effort",
  );
  assert.equal(s.requests[0].model, ASK_MODEL);
  assert.ok(
    s.requests[0].system.some((b) => b.text.startsWith("The workspace: Harbor") && b.cache_control),
    "the shape of the workspace rides in system, cached",
  );
  const second = s.requests[1].messages;
  assert.equal(second.at(-2).role, "assistant");
  assert.deepEqual(
    second.at(-1).content.map((c) => [c.type, c.tool_use_id, c.is_error]),
    [["tool_result", "t-inbox.list", false]],
    "the read's result goes back under the call's id",
  );
  assert.ok(
    fromRecord(second.at(-1).content[0].content).threads.some((t) => t.conversation_id === C1),
    "with the rows the fake database holds",
  );
  assert.ok(
    events.some((e) => e.t === "trace"),
    "the palette is told a read is running",
  );
});

test("a model that thinks: its thinking goes back with the tool results exactly as it came, never padded into text, and every round asks for ASK_MAX_TOKENS", async () => {
  const ctx = ctxFor();
  const thought = (signature) => ({ type: "thinking", id: "", name: "", text: "", json: "", thinking: "", signature });
  const hidden = { type: "redacted_thinking", id: "", name: "", text: "", json: "", data: "EmwKAhgB" };
  const s = scripted([
    ROUND([thought("sig-round-1"), hidden, tool("inbox", { action: "list", filter: "recent" })]),
    ROUND([thought("sig-round-2"), answer("Nobody is waiting on you.")]),
  ]);
  const { input } = turn(ctx);
  const r = await runAskTurn(input, ports(s.round));
  assert.equal(r.failed, false, r.failure ?? "");
  assert.equal(r.text, "Nobody is waiting on you.");
  assert.deepEqual(
    s.requests.map((q) => q.max_tokens),
    [ASK_MAX_TOKENS, ASK_MAX_TOKENS],
    "one ceiling, the edge's",
  );
  const replayed = s.requests[1].messages.at(-2);
  assert.equal(replayed.role, "assistant");
  assert.deepEqual(
    replayed.content,
    [
      { type: "thinking", thinking: "", signature: "sig-round-1" },
      { type: "redacted_thinking", data: "EmwKAhgB" },
      { type: "tool_use", id: "t-inbox.list", name: "inbox", input: { action: "list", filter: "recent" } },
    ],
    "the thinking block keeps its empty words and its signature (Opus 5.5 always thinks and refuses a turn whose thinking was changed)",
  );
});

test("each role is offered its tools, sorted by name, the tool search last: a viewer the reads alone, an operator the acts an operator may approve, a partner the lead search too, an owner every action (D11, D12; the Phase 4 plan, D1; the operator, 15 Oct 2026); no tool is strict", async () => {
  const offered = {};
  for (const role of ["viewer", "operator", "partner", "owner"]) {
    const s = scripted([ROUND([answer("Nothing waiting.")])]);
    await runAskTurn(turn(ctxFor(), { role }).input, ports(s.round));
    offered[role] = s.requests[0].tools;
    assert.deepEqual(s.requests[0].tools, toApiTools(role, false), `${role}: the registry's tools for the role`);
  }
  const acts = (role) => offered[role].map((t) => t.name).filter((n) => ACT_TOOL_NAMES.has(n));
  assert.deepEqual(
    offered.viewer.map((t) => t.name),
    READ_TOOLS.map((t) => t.name),
    "a viewer: the nine reads",
  );
  assert.deepEqual(acts("operator"), [
    "press_card",
    "propose_ad",
    "propose_call",
    "propose_deal",
    "propose_follow_up",
    "propose_form",
    "propose_leads",
    "propose_list",
    "propose_people",
    "propose_person",
    "propose_plan",
    "propose_reply",
    "propose_review",
    "propose_campaign",
    "propose_settings",
    "propose_conversation",
    // A fact the person tells Ask to keep (decision 0070).
    "remember",
  ]);
  assert.deepEqual(
    acts("partner").filter((n) => !acts("operator").includes(n)),
    // A video made from the business's clips is a partner's to ask for, as a post is (decision 0122), and photos and videos
    // brought in from a link, as the Library's Keep is, a post taken down (00682), and a week of posts (00706).
    [
      "propose_bring_in",
      "propose_lead_search",
      "propose_piece",
      "propose_post",
      "propose_publish",
      "propose_take_down",
      "propose_week",
    ],
  );
  assert.deepEqual(
    acts("owner").filter((n) => !acts("partner").includes(n)),
    [],
    "an owner's own are actions of the tools a partner has (a person's mode and merge)",
  );
  // A person's note and details are an operator's (PR 4.6), a person's mode and a merge an owner's: one tool, offered
  // per action.
  const personActions = (role) =>
    offered[role].find((t) => t.name === "propose_person")?.input_schema.properties.action.enum ?? null;
  assert.deepEqual(["viewer", "operator", "partner", "owner"].map(personActions), [
    null,
    ["note", "step", "details", "answer", "add", "message"],
    ["note", "step", "details", "answer", "add", "message"],
    ["mode", "note", "step", "details", "answer", "add", "merge", "message"],
  ]);
  const searchLast = (tools) => tools.at(-1)?.name === "tool_search_tool_bm25";
  assert.ok(Object.values(offered).every(searchLast), "every role's tools end in the tool search");
  assert.deepEqual(
    offered.owner.map((t) => t.name),
    [...READ_TOOLS, ...ACT_TOOLS]
      .map((t) => t.name)
      .filter((n) => n !== "tool_search_tool_bm25")
      .sort()
      .concat("tool_search_tool_bm25"),
    "no tool answers: the answer is the round's text; sorted, the acts among the reads",
  );
  assert.ok(
    Object.values(offered)
      .flat()
      .every((t) => t.strict === undefined),
    "REGRESSION: the API refused 26 strict tools, then the act tools' 31 optional parameters (it takes 20 and 24), on every operator turn",
  );
});

test("an answer beside a read is set aside: it was written before its rows, so the model answers next round with them, and its Say is taken back", async () => {
  const early = answerJson("We open at nine.");
  const s = scripted([
    async (_c, onText) => {
      onText(early);
      return ROUND([tool("workspace", { action: "settings" }), prose(early)]);
    },
    ROUND([answer("Monday 9:00 to 17:00; the other days are not set.")]),
  ]);
  const t = turn(ctxFor());
  const { result: r, lines } = await logged("ask_answer_beside_read", () => runAskTurn(t.input, ports(s.round)));
  assert.deepEqual(
    [r.text, r.rounds, r.tools],
    ["Monday 9:00 to 17:00; the other days are not set.", 2, ["workspace.settings"]],
  );
  assert.equal(lines.length, 1);
  assert.deepEqual(
    t.events.filter((e) => e.t === "say").map((e) => e.headline),
    ["We open at nine.", ""],
    "said as it was written, then taken back: the Line shows the read again",
  );
  assert.deepEqual(
    s.requests[1].messages.at(-2).content.map((b) => b.type),
    ["tool_use", "text"],
    "the round goes back whole, in order: nothing earlier is edited",
  );
});

test("an act tool beside the answer stands: the proposal is built for real, the answer is the model's, one round", async () => {
  const s = scripted([
    ROUND([
      tool("propose_settings", { action: "autonomy", class: "reply", mode: "ask" }),
      answer("I proposed asking you first on every reply."),
    ]),
  ]);
  const r = await runAskTurn(turn(ctxFor()).input, ports(s.round));
  assert.deepEqual([r.text, r.rounds, r.failed], ["I proposed asking you first on every reply.", 1, false]);
  assert.deepEqual(
    r.proposals.map((p) => [p.kind, p.title, p.needs]),
    [["policy", "Autonomy: reply", "operator"]],
  );
  assert.deepEqual(r.tools, ["propose_settings.autonomy"]);
  // A proposal counts as a read: its figures are the request, checked against the workspace. With no day read and
  // nothing proposed, a figure is not from the workspace.
  const noDay = {};
  const act = tool("propose_settings", { action: "autonomy", class: "reply", mode: "ask" });
  const proposed = await runAskTurn(
    turn(ctxFor()).input,
    ports(scripted([ROUND([act, answer("I proposed asking you first on 1 kind of reply.")])]).round, noDay),
  );
  assert.equal(proposed.ungrounded, false);
  const bare = await runAskTurn(
    turn(ctxFor()).input,
    ports(scripted([ROUND([answer("You have 3 people waiting.")])]).round, noDay),
  );
  assert.equal(bare.ungrounded, true, "a figure with nothing read behind it");
});

test("a round's reads run at once: the second starts before the first has answered", async () => {
  // Pinned as loop.ts's text (`await Promise.all(`) until 25 Nov 2026; now the reads are held until both have begun.
  let begun = 0;
  let letGo = () => {};
  const held = new Promise((r) => (letGo = r));
  // The page's own first read ("today") goes through the same port before the round, and is let through.
  const slowTool = async (tc, call, ...rest) => {
    if (call?.name === "inbox" || call?.name === "calls") {
      begun += 1;
      await held;
    }
    return runTool(tc, call, ...rest);
  };
  const s = scripted([
    ROUND([tool("inbox", { action: "list", filter: "recent" }), tool("calls", { action: "list" })]),
    ROUND([answer("Nobody is waiting on you.")]),
  ]);
  const running = runAskTurn(turn(ctxFor()).input, ports(s.round, { tool: slowTool }));
  try {
    await until(() => begun === 2, "REGRESSION: the second read waited for the first to answer");
  } finally {
    letGo();
  }
  const r = await running;
  assert.equal(r.failed, false, r.failure ?? "");
  assert.deepEqual(r.tools, ["inbox.list", "calls.list"]);
});

test("an act tool is a proposal, never an action: the loop hands it to the proposal builder and never to a read", async () => {
  // Pinned as loop.ts's text (`notAgain(await ports.propose(...))`) until 25 Nov 2026.
  const read = [];
  const proposed = [];
  const s = scripted([
    ROUND([tool("propose_settings", { action: "autonomy", class: "reply", mode: "ask" })]),
    ROUND([answer("I proposed asking you first on every reply.")]),
  ]);
  const r = await runAskTurn(
    turn(ctxFor()).input,
    ports(s.round, {
      tool: (tc, call, ...rest) => {
        read.push(call?.name);
        return runTool(tc, call, ...rest);
      },
      propose: (tc, name, args, ...rest) => {
        proposed.push(name);
        return buildProposal(tc, name, args, ...rest);
      },
    }),
  );
  assert.deepEqual(proposed, ["propose_settings"], "the act became a card");
  // The page's own first read ("today") is the turn's, before the round; the act is never one.
  assert.ok(!read.includes("propose_settings"), "and nothing was read or done for it");
  assert.deepEqual(
    r.proposals.map((p) => p.kind),
    ["policy"],
  );
});

test("a call whose arguments did not arrive whole is told so, and nothing is read or proposed for it", async () => {
  // Pinned as loop.ts's text (`if (!args) return cutOff(...)`) until 25 Nov 2026: a round cut off mid-argument was
  // told every required field was missing, and the model blamed its own plan.
  const called = [];
  const cut = { ...tool("propose_settings", { action: "autonomy" }), json: '{"action":"autonomy","cla' };
  const s = scripted([ROUND([cut]), ROUND([answer("I'll try that again.")])]);
  const r = await runAskTurn(
    turn(ctxFor()).input,
    ports(s.round, {
      tool: (tc, call, ...rest) => {
        if (call?.name === "propose_settings") called.push("read");
        return runTool(tc, call, ...rest);
      },
      propose: (...args) => {
        called.push("propose");
        return buildProposal(...args);
      },
    }),
  );
  assert.deepEqual(called, [], "a call cut off is neither read nor proposed");
  const result = s.requests[1].messages.at(-1).content.find((c) => c.type === "tool_result");
  assert.equal(result.is_error, true);
  assert.match(
    JSON.stringify(result.content),
    /cut off before its arguments were complete/,
    "the model is told why, so it retries shorter",
  );
  assert.equal(r.failed, false, r.failure ?? "");
});

test("words beside a card are the model thinking aloud, never the answer; an answer beside a card refused goes back with the round, its Say taken back", async () => {
  const refusedInvite = tool("propose_person", ADD_NOBODY);
  const aloud = scripted([
    ROUND([prose("I'll add them now."), refusedInvite]),
    ROUND([answer("That is not an email address; give me one and I will propose adding them.")]),
  ]);
  const r1 = await runAskTurn(turn(ctxFor(), AN_OWNER).input, ports(aloud.round));
  assert.deepEqual(
    [r1.text, r1.rounds, r1.proposals.length],
    ["That is not an email address; give me one and I will propose adding them.", 2, 0],
    "the model hears the refusal and answers; the words beside the card never end the turn",
  );
  const made = scripted([ROUND([prose("Adding Ada."), tool("propose_person", ADD_ADA)])]);
  const r2 = await runAskTurn(turn(ctxFor(), AN_OWNER).input, ports(made.round));
  assert.equal(
    r2.answer.say.headline,
    "Add Ada to People. Nothing happens until you press it.",
    "the card made is the answer",
  );

  const claimed = answerJson("I proposed adding Ada.");
  const back = scripted([
    async (_c, onText) => {
      onText(claimed);
      return ROUND([prose(claimed), refusedInvite]);
    },
    ROUND([answer("That is not an email address.")]),
  ]);
  const t3 = turn(ctxFor(), AN_OWNER);
  const { result: r3, lines } = await logged("ask_answer_beside_refused_card", () =>
    runAskTurn(t3.input, ports(back.round)),
  );
  assert.deepEqual([r3.text, r3.rounds, r3.proposals.length, lines.length], ["That is not an email address.", 2, 0, 1]);
  assert.deepEqual(
    t3.events.filter((e) => e.t === "say").map((e) => e.headline),
    ["I proposed adding Ada.", ""],
    "an answer claiming a card that is not there is taken back",
  );
  assert.equal(
    back.requests[1].messages.at(-1).content[0].is_error,
    true,
    "the refusal goes back to the model with the round",
  );
});

test("an answer beside its cards that claims a write is said as the cards' own sentence, its detail kept, and logged: nothing is done until a person presses a card (the moment spec, A4)", async () => {
  const invite = tool("propose_person", ADD_ADA);
  const claimed = scripted([
    ROUND([prose(answerJson("I've added Ada for you.", { say: { detail: "She is in People now." } })), invite]),
  ]);
  const { result: r, lines } = await logged("ask_answer_claimed_write", () =>
    runAskTurn(turn(ctxFor(), AN_OWNER).input, ports(claimed.round)),
  );
  assert.deepEqual(
    [r.answer.say.headline, r.answer.say.detail, r.proposals.length, lines.length],
    ["Add Ada to People. Nothing happens until you press it.", "She is in People now.", 1, 1],
  );
  assert.deepEqual(JSON.parse(lines[0]), { cards: 1, tenant_id: A });
  const honest = scripted([ROUND([prose(answerJson("One card: Ada, for People.")), invite])]);
  const r2 = await runAskTurn(turn(ctxFor(), AN_OWNER).input, ports(honest.round));
  assert.equal(r2.answer.say.headline, "One card: Ada, for People.", "an answer that claims nothing stands");
  // With no card beside it, an answer is the model's to say: the eval judges it (no_write), the loop leaves it.
  const bare = scripted([ROUND([answer("I paused the win-back.")])]);
  const r3 = await runAskTurn(turn(ctxFor(), AN_OWNER).input, ports(bare.round));
  assert.equal(r3.answer.say.headline, "I paused the win-back.");
});

test("a message card alone asks next for the business's other languages, in the turn's language, and only where the business names them (16 Oct 2026): the other card is a tap away, never assumed", async () => {
  const message = (language) => ({
    id: `p-${language}`,
    kind: "message",
    title: "New message",
    summary: "s",
    payload: { language },
  });
  const asked = async (cards, { language = "en", languages = ["English", "Spanish"] } = {}) => {
    const s = scripted([ROUND(cards.map((_, i) => tool("propose_campaign", { action: "message" }, `t-message-${i}`)))]);
    const queue = [...cards];
    const propose = async () => ({ proposal: queue.shift(), result: "{}", isError: false });
    // Words that ask for a draft, so its round is asked at the draft's effort and never set aside (#1627 DRAFT_CALLS).
    const text = "write a win-back message for people who have not been in since summer";
    const facts = { ...turn(ctxFor()).input.facts, languages };
    const { input } = turn(ctxFor(), { ...AN_OWNER, language, text, facts });
    return runAskTurn(input, ports(s.round, { propose }));
  };
  assert.deepEqual((await asked([message("en_US")])).answer.do.next, ["Can you write it in Spanish too?"]);
  assert.deepEqual((await asked([message("es")], { language: "es" })).answer.do.next, [
    "¿Puedes escribirlo también en inglés?",
  ]);
  assert.deepEqual((await asked([message("en_US"), message("es")])).answer.do.next, []);
  assert.deepEqual((await asked([message("en_US")], { languages: [] })).answer.do.next, []);
});

test("cards alone are the answer: every card made, no second round, the cards said in a sentence; a refused proposal keeps the round and the model must say why", async () => {
  const alone = scripted([ROUND([tool("propose_person", ADD_ADA)])]);
  const { input, events } = turn(ctxFor(), AN_OWNER);
  const r = await runAskTurn(input, ports(alone.round));
  assert.equal(r.rounds, 1);
  assert.equal(r.proposals.length, 1);
  assert.deepEqual(r.answer, answerForCards(r.proposals, "en"));
  assert.equal(r.text, "Add Ada to People. Nothing happens until you press it.");
  assert.ok(
    events.some((e) => e.t === "say" && e.headline === r.answer.say.headline),
    "the cards' sentence is said as the answer",
  );
  assert.equal(r.ungrounded, false, "a proposal is checked against the workspace: it counts as a read");

  const refused = scripted([
    ROUND([tool("propose_person", ADD_NOBODY)]),
    ROUND([answer("That is not an email address; give me one and I will propose adding them.")]),
  ]);
  const r2 = await runAskTurn(turn(ctxFor(), AN_OWNER).input, ports(refused.round));
  assert.deepEqual([r2.rounds, r2.proposals.length, r2.failed], [2, 0, false]);
  const back = refused.requests[1].messages.at(-1).content[0];
  assert.deepEqual([back.type, back.is_error], ["tool_result", true]);
  assert.match(back.content, /missing the @/);
});

test("every refusal of the gateway ends the turn in its sentence, in the person's language, and says why in the result; a request refused is ours, never the question's, and logged on its own name", async () => {
  const cases = [
    [
      { kind: "preview" },
      "AI only answers on the production dashboard.",
      "AI solo responde en el panel de producción.",
    ],
    [
      { kind: "budget", used: 5, cap: 5 },
      "AI has reached its daily limit. Try again tomorrow; the pages still work.",
      "AI llegó a su límite diario. Vuelve mañana; las páginas siguen funcionando.",
    ],
    [{ kind: "no_key" }, "AI is not connected yet.", "AI no está conectado todavía."],
    [
      { kind: "unreachable", message: "ECONNREFUSED" },
      "I couldn't answer just now. Try again in a moment.",
      "No pude llegar al modelo. Inténtalo de nuevo en un momento.",
    ],
    [
      { kind: "bad_request", message: "400 messages: too long" },
      "AI couldn't answer this time. Nothing was wrong with your question. Try again.",
      "Algo falló de nuestro lado, no con tu pregunta. Inténtalo de nuevo.",
    ],
  ];
  for (const [refusal, en, es] of cases) {
    // Our own request refused is said loudly on its own name; every other refusal is the gateway's.
    const event = refusal.kind === "bad_request" ? "ask_request_refused" : "ask_gateway_refused";
    const { result: r, lines } = await logged(event, () =>
      runAskTurn(
        turn(ctxFor()).input,
        ports(async () => {
          throw new GatewayRefused(refusal);
        }),
      ),
    );
    assert.deepEqual(
      lines.map((l) => JSON.parse(l)).map((l) => [l.kind, l.round, l.message]),
      [[refusal.kind, 1, refusal.message]],
      `${refusal.kind} is logged once, as ${event}`,
    );
    assert.deepEqual([r.text, r.failed, r.failure, r.rounds], [en, true, refusal.kind, 1], refusal.kind);
    assert.deepEqual([r.answer.form, r.answer.say.headline], ["structured", en], "the sentence is the headline");
    const r2 = await runAskTurn(
      turn(ctxFor(), { language: "es" }).input,
      ports(async () => {
        throw new GatewayRefused(refusal);
      }),
    );
    assert.equal(r2.text, es, `${refusal.kind} in Spanish`);
  }
});

test("Stop reaches the model: the person's signal cuts the round's stream, no round is asked after it, and the turn ends as stopped, never as a refusal or a dropped connection", async () => {
  const stop = new AbortController();
  const s = scripted([
    async (c, onText) => {
      onText(answerJson("Three people wrote this week.").slice(0, 40));
      stop.abort();
      await cutBy(c.signal);
      return { blocks: [], stopReason: null, streamError: "This operation was aborted" };
    },
  ]);
  const t = turn(ctxFor(), { signal: stop.signal });
  const { result: r, lines } = await logged("ask_gateway_refused", () => runAskTurn(t.input, ports(s.round)));
  assert.deepEqual([r.failed, r.failure, r.rounds, s.requests.length], [true, "stopped", 1, 1]);
  assert.ok(
    t.events.some((e) => e.t === "say" && e.headline.startsWith("Three")),
    "the Say was written before the Stop",
  );
  assert.equal(lines.length, 0, "a Stop is no refusal");
});

test("Stop while a read runs: the next round is never answered, and the turn ends as stopped, not as a model that could not be reached", async () => {
  const stop = new AbortController();
  const s = scripted([
    ROUND([tool("inbox", { action: "list", filter: "recent" })]),
    async (c) => {
      assert.ok(c.signal.aborted, "the round after the Stop is asked with its signal already ended");
      throw unreached();
    },
  ]);
  // The person stops while the model's own read runs (not the page's reads made before the first round).
  const read = async (_tc, run) => {
    if (run.name === "inbox") stop.abort();
    return { result: "{}", isError: false };
  };
  const t = turn(ctxFor(), { signal: stop.signal });
  const { result: r, lines } = await logged("ask_gateway_refused", () =>
    runAskTurn(t.input, ports(s.round, { tool: read })),
  );
  assert.deepEqual([r.failed, r.failure, r.rounds], [true, "stopped", 2]);
  assert.equal(lines.length, 0);
});

test("the turn's own time run out is said as ours, before the stream as within it: never 'could not reach the model' or 'the connection dropped', and never the question's fault", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const ranOut = async (round, language = "en") =>
    runAskTurn(turn(ctxFor(), { language }).input, ports(scripted([round]).round));
  // Before the model answered: the gateway throws for the request its signal ended.
  const before = async (c) => {
    t.mock.timers.tick(ASK_TURN_BUDGET_MS);
    await cutBy(c.signal);
    throw unreached();
  };
  const r = await ranOut(before);
  assert.deepEqual(
    [r.text, r.failed, r.failure],
    ["I ran out of time on that one. Try again, or ask about one thing at a time.", true, "timeout"],
  );
  assert.equal(
    (await ranOut(before, "es")).text,
    "Se me acabó el tiempo con esta. Inténtalo de nuevo, o pregunta por una cosa a la vez.",
  );
  // Within the stream: what it had written is cut, and the time is still what ended it.
  const within = await ranOut(async (c, onText) => {
    onText(answerJson("Three people").slice(0, 30));
    t.mock.timers.tick(ASK_TURN_BUDGET_MS);
    await cutBy(c.signal);
    return { blocks: [prose(answerJson("Three").slice(0, 30))], stopReason: null, streamError: "aborted" };
  });
  assert.deepEqual([within.failed, within.failure], [true, "timeout"]);
});

test("an edge from before the operator's words refuses them as a system message, and a model without one refuses the role: the same round is asked again with the words in the question, ahead of it, said once (ask_words_rejected), and the turn answers -- so either deploy order works (the answer canvas, A3)", async () => {
  for (const message of [
    "messages: a system message carries an effort alone",
    "400 role 'system' is not supported on this model",
  ]) {
    const requests = [];
    const refusals = [message];
    const round = async (c) => {
      requests.push(c.request);
      const refused = refusals.shift();
      if (refused) throw new GatewayRefused({ kind: "bad_request", message: refused });
      return ROUND([answer("Rosa needs you.")]);
    };
    const { result: r, lines } = await logged("ask_words_rejected", () =>
      runAskTurn(turn(ctxFor(), { context: PAGE }).input, ports(round)),
    );
    assert.equal(r.failed, false, r.failure ?? "");
    assert.equal(lines.length, 1, `said once: ${message}`);
    assert.equal(requests.length, 2, "the same round, asked again once");
    assert.equal(requests[0].messages.at(-1).role, "system", "first as the operator's");
    assert.ok(!requests[1].messages.some((m) => m.role === "system"), "then nowhere as a system message");
    const q = requests[1].messages.at(-1);
    assert.deepEqual(
      q.content.map((b) => b.source ?? b.type),
      ["page://today", "text", "text"],
      "the page's data, the turn's words, the question: as before the words were the operator's",
    );
    assert.ok(q.content[1].text.includes("You are speaking with"), "the words, ahead of the question");
    assert.equal(q.content[2].text, "Who needs me?");
    assert.equal(r.raw.question.length, 3, "kept as it was sent: the words in the question");
  }
});

test("a format the API refuses is dropped and the same round asked again: words that come back are prose, JSON is read as JSON, and a second refusal is the turn's", async () => {
  const refusing = async (refusals, reply) => {
    const requests = [];
    const round = async (c) => {
      requests.push(c.request);
      const message = refusals.shift();
      if (message) throw new GatewayRefused({ kind: "bad_request", message });
      return ROUND([reply]);
    };
    const { result, lines } = await logged(
      "ask_format_rejected",
      async () => await runAskTurn(turn(ctxFor()).input, ports(round)),
    );
    return { r: result, requests, formatRejected: lines.length };
  };
  const named = await refusing(
    ["400 output_config.format.schema: too many properties"],
    prose("Nobody is waiting on you.\nSam called once."),
  );
  assert.deepEqual(
    [named.r.answer.form, named.r.text, named.r.failed, named.formatRejected],
    ["prose", "Nobody is waiting on you.\nSam called once.", false, 1],
  );
  assert.deepEqual(named.requests[0].output_config.format, { type: "json_schema", schema: ASK_ANSWER_TEXT_FORMAT });
  assert.deepEqual(named.requests[1].output_config, { effort: ASK_EFFORT }, "the same round, without the format");
  const shaped = await refusing(["400 output_config.format: not supported"], answer("Nobody is waiting on you."));
  assert.deepEqual(
    [shaped.r.answer.form, shaped.r.text],
    ["structured", "Nobody is waiting on you."],
    "the rules still ask for the shape: JSON written without the format is read as JSON, never shown raw",
  );
  const always = await refusing(["400 schema too complex", "400 schema too complex"], answer("Never read."));
  assert.deepEqual(
    [always.r.text, always.r.failed, always.r.failure, always.requests.length],
    ["AI couldn't answer this time. Nothing was wrong with your question. Try again.", true, "bad_request", 2],
    "with nothing left to drop, the refusal is the turn's",
  );
  const other = await refusing(["400 messages: too long"], answer("Never read."));
  assert.deepEqual(
    [other.r.failure, other.requests.length],
    ["bad_request", 1],
    "a refusal of something else is not retried",
  );
});

test("a stream that broke before any block ends the turn; one that broke after the answer arrived still answers; a refusal stop reason is its own sentence", async () => {
  const empty = await runAskTurn(
    turn(ctxFor()).input,
    ports(async () => ROUND([], { streamError: "socket hang up" })),
  );
  assert.deepEqual(
    [empty.text, empty.failed, empty.failure],
    ["The connection dropped before I finished. Try again.", true, "socket hang up"],
  );
  const late = await runAskTurn(
    turn(ctxFor()).input,
    ports(async () => ROUND([answer("Nothing waiting.")], { streamError: "socket hang up" })),
  );
  assert.deepEqual([late.text, late.failed], ["Nothing waiting.", false]);
  const midway = await runAskTurn(
    turn(ctxFor()).input,
    ports(async () =>
      ROUND([prose(answerJson("Two calls were missed.").slice(0, 50))], {
        streamError: "terminated",
        stopReason: null,
      }),
    ),
  );
  assert.deepEqual(
    [midway.text, midway.failed, midway.failure],
    ["The connection dropped before I finished. Try again.", true, "terminated"],
    "an answer cut off by a broken stream says the connection dropped, not that the answer had no shape",
  );
  const refused = await runAskTurn(
    turn(ctxFor()).input,
    ports(async () => ROUND([], { stopReason: "refusal" })),
  );
  assert.deepEqual([refused.text, refused.failed, refused.failure], ["I can't answer that here.", true, "refusal"]);
});

test("the last round may call no tool, so all it can do is answer; a model that reads through every round ends in a stated failure", async () => {
  const s = scripted(Array.from({ length: ASK_MAX_ROUNDS }, () => ROUND([tool("workspace", { action: "settings" })])));
  const r = await runAskTurn(turn(ctxFor()).input, ports(s.round));
  assert.deepEqual(
    [r.text, r.failed, r.failure, r.rounds],
    ["I did not reach an answer. Try again.", true, "rounds_exhausted", ASK_MAX_ROUNDS],
  );
  assert.deepEqual(s.requests.at(-1).tool_choice, { type: "none" }, "the last round may only answer");
  assert.deepEqual(s.requests.at(-2).tool_choice, { type: "auto" });
  assert.equal(r.tools.length, ASK_MAX_ROUNDS, "every read ran");
});

test("an answer that does not shape is a stated failure -- JSON cut off by the cap, or no headline; words where the JSON should be are prose; a round with nothing is its own failure", async () => {
  const one = (blocks, extra, language = "en") =>
    runAskTurn(
      turn(ctxFor(), { language }).input,
      ports(async () => ROUND(blocks, extra)),
    );
  const { result: cut, lines } = await logged("ask_answer_unparsed", () =>
    one([prose(answerJson("Two threads are waiting on you.").slice(0, 60))], { stopReason: "max_tokens" }),
  );
  assert.deepEqual(
    [cut.text, cut.failed, cut.answer.form],
    ["I could not shape the answer. Ask again.", true, "structured"],
  );
  assert.match(cut.failure, /^answer: not JSON/);
  assert.equal(lines.length, 1);
  const headless = await one([answer(" <answer></answer> ")]);
  assert.deepEqual(
    [headless.text, headless.failed, headless.failure],
    ["I could not shape the answer. Ask again.", true, "answer: no headline"],
  );
  assert.equal((await one([answer("")], {}, "es")).text, "No pude dar forma a la respuesta. Pregunta de nuevo.");
  const words = await one([prose("Nothing to read for that.")], { stopReason: "end_turn" });
  assert.deepEqual(
    [words.text, words.failed, words.failure, words.answer.form],
    ["Nothing to read for that.", false, null, "prose"],
  );
  const nothing = await one([], { stopReason: "end_turn" });
  assert.deepEqual(
    [nothing.text, nothing.failed, nothing.failure],
    ["I lost my train of thought. Ask me again.", true, "no_tool_no_text"],
    "a round with nothing in it is our glitch, never an empty read the question asked for",
  );
  assert.equal((await one([], { stopReason: "end_turn" }, "es")).text, "Perdí el hilo. Pregúntamelo de nuevo.");
});

test("Say streams from the answer's JSON as it is written: only what changed, at most every 50ms, never an empty one; the final message is the answer", async () => {
  const full = answerJson("Two threads are waiting on you.", { say: { detail: "Rosa asked about Saturday." } });
  const cut = (s) => full.slice(0, full.indexOf(s) + s.length);
  const s = scripted([
    async (_c, onText) => {
      onText(cut('"headline":"'));
      onText(cut("Two thr"));
      onText(cut("Two thr"));
      await new Promise((r) => setTimeout(r, 60));
      onText(cut("waiting on you."));
      onText(cut("Rosa asked"));
      onText(full);
      return ROUND([prose(full)], { stopReason: "end_turn" });
    },
  ]);
  const { input, events } = turn(ctxFor());
  const r = await runAskTurn(input, ports(s.round));
  assert.deepEqual(
    events.filter((e) => e.t === "say").map((e) => [e.headline, e.detail]),
    [
      ["Two thr", ""],
      ["Two threads are waiting on you.", ""],
    ],
    "an empty Say is not sent, a repeat is not sent, and the next waits its 50ms: the final message has the rest",
  );
  assert.equal(r.answer.say.detail, "Rosa asked about Saturday.");

  const last = JSON.stringify({ language: "en", say: { headline: "Nobody waits.", detail: "" } });
  const late = scripted([
    async (_c, onText) => {
      onText(last.slice(0, 14));
      onText(last);
      return ROUND([prose(answerJson("Nobody waits."))], { stopReason: "end_turn" });
    },
  ]);
  const t2 = turn(ctxFor());
  const { lines } = await logged("ask_say_not_first", () => runAskTurn(t2.input, ports(late.round)));
  assert.equal(lines.length, 1, "logged when the JSON does not start with say");
  assert.deepEqual(
    t2.events.filter((e) => e.t === "say").map((e) => e.headline),
    ["Nobody waits."],
    "Say is read wherever it appears",
  );

  const tagged = scripted([
    async (_c, onText) => {
      onText('{"say":{"headline":"It handled it.</answer><parameter name=\\"cit');
      return ROUND([answer("It handled it.")], { stopReason: "end_turn" });
    },
  ]);
  const t3 = turn(ctxFor());
  await runAskTurn(t3.input, ports(tagged.round));
  assert.deepEqual(
    t3.events.filter((e) => e.t === "say").map((e) => e.headline),
    ["It handled it."],
    "the preview shows nothing past a tag",
  );

  // The detail's lines, as the final keeps them (15 Oct: the preview showed lines the final folded into one): spaces run
  // together within a line, the break kept, and the last preview is the final's words.
  const lined = answerJson("Two steps.", { say: { detail: "Open\tSettings.\nPaste the link." } });
  const t4 = turn(ctxFor());
  const r4 = await runAskTurn(
    t4.input,
    ports(
      scripted([
        async (_c, onText) => {
          onText(lined);
          return ROUND([prose(lined)], { stopReason: "end_turn" });
        },
      ]).round,
    ),
  );
  const previews = t4.events.filter((e) => e.t === "say");
  assert.equal(r4.answer.say.detail, "Open Settings.\nPaste the link.");
  assert.deepEqual([previews.at(-1).headline, previews.at(-1).detail], [r4.answer.say.headline, r4.answer.say.detail]);
});

test("a page's context or a shape that fails costs its block, never the turn; a round that throws something other than a refusal is the turn's stated failure", async () => {
  const s = scripted([ROUND([answer("Nothing waiting.")])]);
  const r = await runAskTurn(
    turn(ctxFor(), { context: PAGE }).input,
    ports(s.round, {
      context: async () => {
        throw new Error("context read timed out");
      },
      shape: async () => {
        throw new Error("shape read timed out");
      },
    }),
  );
  assert.deepEqual([r.text, r.failed], ["Nothing waiting.", false]);
  assert.equal(s.requests[0].system.length, 1, "no shape block: the rules and facts alone");
  assert.ok(
    !JSON.stringify(s.requests[0].messages).includes("search_result"),
    "no page block: the question goes with its words",
  );
  assert.equal(r.shape.warm, "failed");
  const broken = await runAskTurn(
    turn(ctxFor()).input,
    ports(async () => {
      throw new TypeError("blocks is not iterable");
    }),
  );
  assert.deepEqual(
    [broken.text, broken.failed, broken.failure, broken.rounds],
    ["AI couldn't finish answering. Try again.", true, "blocks is not iterable", 0],
  );
});

test("the questions production paid a second round for (the week to 5 Oct 2026) are answered in one: each read the table plans for them runs through its own tool, as the model would have called it, and rides in before the first round", async () => {
  // On Today the day's own read rides in too, after what the question named (the speed plan, A1, 15 Oct 2026).
  for (const [text, surface, reads] of [
    ["Hey how's the business", "calendar", ["today", "report"]],
    ["What do I have tomorrow?", "today", ["calendar.week", "today"]],
    ["Who has a proposal out?", "calendar", ["people.pipeline"]],
    ["Who wrote today?", "today", ["inbox.list", "today"]],
    ["Were there any calls today?", "today", ["calls.list", "today"]],
    ["Who needs me?", "today", ["today"]],
  ]) {
    const s = scripted([ROUND([answer("Here it is.")])]);
    // The day's metrics and the period's series, which the default world leaves unmodelled: a quiet week.
    const rpcs = {
      ...RPCS,
      metrics_summary: () => METRICS,
      report_series: (a) => ({
        timezone: TZ,
        days: a.p_days,
        span_days: a.p_days * 2,
        today: iso(NOW.getTime()).slice(0, 10),
        series: [],
        reasons: {},
        reply_seconds: [],
        sentiments: {},
        voicemail: 0,
      }),
    };
    const r = await runAskTurn(turn(ctxFor(tables(), rpcs), { text, surface }).input, ports(s.round));
    assert.equal(r.failed, false, r.failure ?? text);
    assert.deepEqual(r.tools, reads, `${text}: read ahead, none refused`);
    assert.deepEqual(r.shape.cross_page, reads, text);
    assert.equal(r.rounds, 1, `${text}: one round`);
    const q = askedOf(s.requests[0]).content;
    for (const read of reads)
      assert.ok(
        q.some((b) => b.type === "search_result" && b.source === `read://${read}`),
        `${text}: ${read} rides in as data`,
      );
  }
});

test("report says the Campaigns lens as the page does (C4): the sentence, the five figures, the funnel, the channels, the sources, the window's six parts and what is stuck now, each the one fold's", async () => {
  const said = (await salonReport(salonRpcs())).campaigns;
  assert.deepEqual(Object.keys(said), ["head", "figures", "funnel", "by_channel", "sources", "window", "stuck"]);
  assert.equal(said.head, "240 messages to 180 people over 14 runs; 48 of 180 wrote back (41 the 30 days before).");
  assert.deepEqual(said.figures, [
    { label: "People sent to", value: "180", meta: "240 messages over 14 runs", change: "up from 150" },
    {
      label: "Delivered",
      value: "92%",
      meta: "220 of 240 · each channel's own receipts",
      change: "was 88% the 30 days before",
    },
    {
      label: "Wrote back",
      value: "27%",
      meta: "48 of 180 people within 3 days, 9 sent to in the last 3 days may still answer",
      change: "was 27% the 30 days before",
    },
    { label: "Said yes", value: "14", meta: "after a message of yours, within 3 days", change: "up from 11" },
    { label: "Asked to stop", value: "3", meta: "after a message of yours, within 3 days", change: "up from 2" },
  ]);
  // The people are 180 and the messages 240: the figures say the people, the funnel the messages.
  assert.equal(said.figures[0].value, "180");
  assert.deepEqual(said.funnel, {
    rows: ["Sent: 240", "Delivered: 220", "Read: 31", "Answered: 50"],
    line: "92% were delivered, 26% of WhatsApp's were read and 21% were answered within 3 days, of 240 messages.",
  });
  assert.deepEqual(said.by_channel, [
    { channel: "WhatsApp", sent: 120, delivered: "92%", read: "26%", answered: "25%" },
    { channel: "Text", sent: 70, delivered: "94%", read: null, answered: "17%" },
    { channel: "Email", sent: 50, delivered: "88%", read: null, answered: "16%" },
  ]);
  assert.deepEqual(said.sources, [
    // The page's own word for a source's kind (contracts campaign-report.ts kindLabel), a campaign since decision 19.
    { name: "Win-back", kind: "Campaign", runs: 12, sent: 120, delivered: "92%", answered: "23%" },
    { name: "Spring note", kind: "Sent once", runs: 2, sent: 120, delivered: "92%", answered: "18%" },
  ]);
  // A share of MESSAGES answered is `answered`, as the page's funnel, channels and sources say it; `wrote_back` is people, and
  // only the reach-outs' businesses keep that key: no `wrote_back` among the sends' parts, so one answer never holds two units under one word.
  assert.doesNotMatch(JSON.stringify([said.by_channel, said.sources]), /wrote_back/);
  assert.match(
    JSON.stringify(said.figures.at(2)),
    /Wrote back/,
    "the strip's people are still the people who wrote back",
  );
  assert.deepEqual(said.window, {
    held: {
      rows: ["Asked to stop: 5", "No number: 3", "The provider refused it: 3", "Another reason: 1"],
      line: "12 of the 252 messages planned were held back or couldn't be sent.",
    },
    runs_stopped: {
      rows: ["Canceled: 1", "The workspace was paused: 1", "The texting provider couldn't be reached: 1"],
      // The window's card counts a campaign's and a broadcast's runs; a reach-out's are under Reach-outs (the stuck figure counts them).
      line: "2 runs stopped on a problem and 1 was canceled. Runs to leads are not counted here.",
    },
    failed_sends: {
      rows: [
        "WhatsApp held it back: offers to each person are limited, and offers to US numbers aren't delivered for now: 4",
        "The email bounced: their address didn't accept it: 2",
      ],
      line: "6 messages left and didn't reach them, for the reasons below.",
    },
    by_message: {
      rows: ["Win-back (earlier): 30 of 110 were answered  27%", "Spring note: 18 of 120 were answered  15%"],
      line: "A reply is counted only for messages sent more than 3 days ago, so each has had its time. 10 sent since are not counted yet.",
    },
    send_to_first_reply: {
      rows: [
        "Within 15 minutes: 8",
        "Within an hour: 14",
        "Within 4 hours: 12",
        "Within a day: 11",
        "Within 3 days: 5",
      ],
      line: "The middle one was answered 1h 30m after it was sent, of 50 answered messages.",
    },
    wait_for_your_ok: {
      rows: ["An hour or less: 1", "Up to 4 hours: 1", "Up to a day: 1", "More than a day: 1"],
      line: "4 runs you approved: too few for a middle.",
    },
  });
  assert.deepEqual(said.stuck, [
    {
      label: "Runs waiting for you",
      value: "3",
      meta: "1 past their day (skip those), 2 can still be approved",
      change: null,
    },
    {
      label: "Runs with a problem",
      value: "1",
      meta: "the latest: Spring note, the workspace was paused · a step to leads counts too",
      change: null,
    },
    {
      label: "Replies that need you",
      value: "2",
      meta: "people who answered a campaign in the last 30 days and wait for a person",
      change: null,
    },
    {
      label: "Messages Meta stopped",
      value: "2",
      meta: "Win-back (earlier) paused, Spring note refused",
      change: null,
    },
    {
      label: "Your WhatsApp number",
      value: "Good",
      meta: "Number quality: good · up to 1,000 new conversations a day · checked today",
      change: null,
    },
  ]);
  assert.equal(said.stuck[0].value, "3");
});

test("report says what the Campaigns page shows: the same fold over the same reads, so the sentence, every figure and every part are the page's words", async () => {
  const said = (await salonReport(salonRpcs())).campaigns;
  // The page folds the sends' report and the ledger the route answers (dtoWith: the world's stuck half, judged at its clock);
  // the reach-outs of this world could not be read (no reach_out_report), which the page's reads say as null.
  const page = toCampaignLensVM({ campaigns: SALON_SENDS, ledger: salonLedger(), reachOuts: null }, SALON_NOW);
  assert.equal(said.head, page.head);
  assert.deepEqual(said.figures, page.strip.map(saidFigure));
  assert.deepEqual(said.stuck, page.stuck.map(saidFigure));
  assert.deepEqual(
    [said.funnel.line, said.window.held.line, said.window.by_message.line, said.window.send_to_first_reply.line],
    [page.funnel.line, page.held.line, page.byMessage.line, page.firstReply.line],
  );
  assert.deepEqual(
    said.window.held.rows,
    page.held.rows.map((r) => `${r.label}: ${r.value}`),
  );
  assert.deepEqual(
    said.window.by_message.rows,
    page.byMessage.rows.map((r) => `${r.label}: ${r.display}`),
  );
  // Nothing of the old tool's: no tile with a percentage's change, no yes-and-stop sentence, no separate read line.
  assert.deepEqual(
    ["tiles", "yes_and_stop", "read"].filter((k) => k in said),
    [],
  );
});

test("report says the Campaigns lens where the database does not keep the ledger or what is stuck yet, and where either read fails: window and stuck are null, an error beside them says which of the two could not be read, and the rest stands", async () => {
  const sends = (said) => said.figures.map((f) => f.label);
  const alone = ["Delivered", "Said yes", "Asked to stop"];

  // No campaign_ledger (00405 not applied): the sends alone, what is stuck still said, no failure and no silence either.
  const noLedger = await logged("campaign_ledger_missing", () =>
    salonReport(salonRpcs({ campaign_ledger: functionGone("campaign_ledger(p_days, p_tenant_id)") })),
  );
  assert.deepEqual(noLedger.lines, [JSON.stringify({ tenant_id: A })], "said once in the log, naming the workspace");
  const { campaigns: bare } = noLedger.result;
  assert.deepEqual(Object.keys(bare), ["head", "figures", "funnel", "by_channel", "sources", "window", "stuck"]);
  assert.equal(bare.head, "240 messages over 14 runs, and people wrote back to 50 of them.");
  assert.deepEqual(sends(bare), alone, "the people sent to and who wrote back need the ledger");
  assert.equal(bare.window, null);
  assert.equal(bare.stuck.length, 5, "what is stuck is a read of its own");
  assert.equal(bare.stuck[0].value, "3");
  assert.equal(bare.funnel.rows[0], "Sent: 240");
  assert.equal(bare.sources.length, 2);

  // Neither function: no window and nothing stuck, said as null and not as nothing waiting.
  const neither = await logged("campaign_stuck_missing", () =>
    salonReport(
      salonRpcs({
        campaign_ledger: functionGone("campaign_ledger(p_days, p_tenant_id)"),
        campaign_stuck: functionGone("campaign_stuck(p_tenant_id)"),
      }),
    ),
  );
  assert.equal(neither.result.campaigns.window, null);
  assert.equal(neither.result.campaigns.stuck, null);
  assert.equal("error" in neither.result.campaigns, false, "a function not applied yet is no failure");

  // campaign_stuck alone missing: the window stands, nothing stuck is said.
  const noStuck = await logged("campaign_stuck_missing", () =>
    salonReport(salonRpcs({ campaign_stuck: functionGone("campaign_stuck(p_tenant_id)") })),
  );
  assert.equal(noStuck.result.campaigns.stuck, null);
  assert.deepEqual(Object.keys(noStuck.result.campaigns.window), [
    "held",
    "runs_stopped",
    "failed_sends",
    "by_message",
    "send_to_first_reply",
    "wait_for_your_ok",
  ]);

  // The ledger's read fails: it took what is stuck with it, and the error says so once, in the page's words for it. The
  // sends stand, and the log says the read once, beside the others' failures.
  const down = await logged("ask_tool_read_failed", () =>
    salonReport(
      salonRpcs({
        campaign_ledger: () => {
          throw new Error("canceling statement due to statement timeout");
        },
      }),
    ),
  );
  assert.deepEqual(
    down.lines.map((l) => JSON.parse(l).read).filter((read) => read === "campaign_ledger"),
    ["campaign_ledger"],
    "and said once in the log",
  );
  const lost = down.result.campaigns;
  assert.deepEqual(
    [lost.window, lost.stuck, lost.error],
    [null, null, "who it reached and what is stuck could not be read just now"],
    "never silence, and never nothing waiting",
  );
  assert.deepEqual(sends(lost), alone);
  assert.equal(lost.head, "240 messages over 14 runs, and people wrote back to 50 of them.");
  assert.equal(lost.funnel.rows.length, 4);

  // What is stuck fails alone: the window stands, and the error names the part.
  const stuckDown = await logged("campaign_stuck_failed", () =>
    salonReport(
      salonRpcs({
        campaign_stuck: () => {
          throw new Error("connection refused");
        },
      }),
    ),
  );
  assert.deepEqual(stuckDown.lines.length, 1, "said once in the log");
  const half = stuckDown.result.campaigns;
  assert.deepEqual([half.stuck, half.error], [null, "what is stuck now could not be read just now"]);
  assert.equal(half.window.held.rows.length, 4);
  assert.equal(half.figures[0].value, "180");
});

test("report says the Campaigns lens as an error where the sends could not be read, never as nothing sent, and the report and the other lenses stand", async () => {
  const { campaign_series: _, ...without } = salonRpcs();
  const failed = await salonReport(without);
  assert.deepEqual(failed.campaigns, { error: "the campaign numbers could not be read just now" });
  assert.equal(failed.range, "30 days");
  assert.ok(failed.tiles.length > 0, "the report's own numbers stand");
});

test("report says the window part by part: a count the database did not send leaves its part null -- never an empty mix, never a zero -- and the parts it did send stand", async () => {
  // A database answers the container, and not every leaf is promised (contracts campaigns/lens.ts knownCount): the holds' and the
  // failed sends' totals, the stops' counts, each message's counts and the first replies' n are left out; the approvals' stand.
  const partial = salonRpcs({
    campaign_ledger: (a) => ({
      ...SALON_WINDOW,
      days: a.p_days,
      held: { by_reason: SALON_WINDOW.held.by_reason },
      stopped: { by_failure: SALON_WINDOW.stopped.by_failure },
      failed_sends: { by_code: SALON_WINDOW.failed_sends.by_code },
      by_message: SALON_WINDOW.by_message.map(({ name, language }) => ({ name, language })),
      first_reply: { buckets: SALON_WINDOW.first_reply.buckets },
    }),
  });
  const said = (await salonReport(partial)).campaigns;
  assert.deepEqual(said.window, {
    held: null,
    runs_stopped: null,
    failed_sends: null,
    by_message: null,
    send_to_first_reply: null,
    wait_for_your_ok: {
      rows: ["An hour or less: 1", "Up to 4 hours: 1", "Up to a day: 1", "More than a day: 1"],
      line: "4 runs you approved: too few for a middle.",
    },
  });
  assert.equal("error" in said, false, "a leaf the database left out is no failed read");
  assert.equal(said.figures[0].value, "180", "and what the ledger did send stands");
});

test("report says by_channel only where more than one channel sent: a lone channel is the funnel's own numbers, and none is null", async () => {
  const lone = salonRpcs({
    campaign_series: () => ({
      ...SALON_SENDS,
      by_channel: [{ channel: "whatsapp", sent: 240, delivered: 220, read: 31, replied: 50 }],
    }),
  });
  assert.equal((await salonReport(lone)).campaigns.by_channel, null);
});
