/**
 * The answer as a tool (ASK_ANSWER_TOOL, 15 Oct 2026): its input streams as it is written, an answer call beside a
 * read is set aside, a cut-off call is no answer, Show draws what has closed, and only the latest answer's cards wait
 * for a yes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ASK_MAX_ROUNDS, emptyReadSet } from "@chanlytics/contracts";
import { ASK_ANSWER_FORMAT, ASK_ANSWER_TEXT_FORMAT } from "../../../apps/dashboard/src/server/ask/answer-format.ts";
import {
  A,
  C1,
  C2,
  NONE,
  NOW,
  ROUND,
  TZ,
  answer,
  answerCall,
  answerJson,
  at,
  ctxFor,
  logged,
  ports,
  runAskTurn,
  scripted,
  seeded,
  shaped,
  stableSystem,
  storedAnswer,
  streamedAnswer,
  threadNow,
  toApiTools,
  tool,
  turn,
  withAnswerTool,
  workspaceFacts,
} from "./_turn.mjs";

test("the answer tool on: every round offers it first with its input streamed, the prompt says to answer through it, and the switch off sends exactly what it did", async () => {
  const facts = workspaceFacts("Harbor", TZ, null, NOW, []);
  await withAnswerTool("on", async () => {
    const s = scripted([
      ROUND([tool("inbox", { action: "list", filter: "recent" })]),
      ROUND([answerCall("Nobody waits.")]),
    ]);
    const r = await runAskTurn(turn(ctxFor()).input, ports(s.round));
    assert.equal(r.failed, false, r.failure ?? "");
    for (const req of s.requests) {
      assert.equal(req.tools[0].name, "answer", "first, as its name sorts");
      assert.equal(req.tools[0].eager_input_streaming, true);
      assert.deepEqual(req.tools[0].input_schema, ASK_ANSWER_FORMAT, "its input is the answer's format");
      assert.deepEqual(req.tools.slice(1), toApiTools("operator", false), "then the role's tools, as they were");
      assert.deepEqual(req.output_config.format.schema, ASK_ANSWER_TEXT_FORMAT, "a text answer still reads");
      assert.ok(req.system[0].text.includes("Every answer is written by calling the answer tool once"));
    }
    assert.equal(JSON.stringify(s.requests[0].tools), JSON.stringify(s.requests[1].tools), "one prefix, every round");
    assert.equal(s.requests[0].system[0].text, stableSystem(facts, true));
  });
  await withAnswerTool("off", async () => {
    const s = scripted([ROUND([answer("Nobody waits.")])]);
    await runAskTurn(turn(ctxFor()).input, ports(s.round));
    assert.deepEqual(s.requests[0].tools, toApiTools("operator", false), "off: no answer tool");
    assert.equal(s.requests[0].system[0].text, stableSystem(facts, false));
    assert.ok(!stableSystem(facts, false).includes("answer tool"), "off: the rules as they were, byte for byte");
  });
});

test("an answer through the tool after a read: its Say streams from the input as it grows, the final is the input normalized, its call is answered as shown, and the shape says so", async () => {
  await withAnswerTool("on", async () => {
    const rosa = { kind: "thread", id: C1, label: "Rosa" };
    const call = answerCall("Rosa asked about Saturday; nobody else is waiting.", {
      say: { detail: "She wrote this morning." },
      show: { items: [{ title: "Rosa", meta: "WhatsApp", line: "Asked about Saturday.", source: rosa }] },
    });
    const s = scripted([ROUND([tool("inbox", { action: "list", filter: "recent" })]), streamedAnswer(call)]);
    const t = turn(ctxFor());
    const r = await runAskTurn(t.input, ports(s.round));
    assert.equal(r.failed, false, r.failure ?? "");
    assert.deepEqual(
      [r.text, r.rounds, r.tools],
      ["Rosa asked about Saturday; nobody else is waiting. She wrote this morning.", 2, ["inbox.list"]],
    );
    assert.deepEqual(
      r.answer.show.items.map((i) => i.source.id),
      [C1],
      "a row the read returned, grounded as ever",
    );
    const says = t.events.filter((e) => e.t === "say");
    assert.ok(says.length >= 4, `the Say streamed: ${says.length} previews`);
    const size = (e) => e.headline.length + e.detail.length;
    assert.ok(
      says.every((e, i) => i === 0 || size(e) >= size(says[i - 1])),
      "each preview grows",
    );
    assert.deepEqual(
      [says.at(-1).headline, says.at(-1).detail],
      [r.answer.say.headline, r.answer.say.detail],
      "the last preview is the final's Say",
    );
    assert.ok(!says.some((e) => /[{}\\"]/.test(e.headline + e.detail)), "no JSON or escape in a preview");
    assert.deepEqual([r.shape.answer_tool, r.shape.answer_in], [true, "tool"]);
    assert.deepEqual(
      r.raw.results.at(-1),
      {
        type: "tool_result",
        tool_use_id: "t-answer",
        content: `<record>\n${JSON.stringify({ shown: true })}\n</record>`,
        is_error: false,
      },
      "the next turn opens with the answer call's result: a tool_use is never left unanswered",
    );
  });
});

test("an answer call beside a read is set aside and told so: never said when the read came first in the round, taken back when it came after; the model answers next round, and a text answer still reads with the tool on", async () => {
  await withAnswerTool("on", async () => {
    // The read written first: the answer's Say is held, so nothing is shown and nothing taken back.
    const settings = tool("workspace", { action: "settings" });
    const held = answerCall("We open at nine.", {}, "t-held");
    const first = scripted([
      async (_c, _onText, onInput) => {
        onInput(held, [settings]);
        return ROUND([settings, held]);
      },
      ROUND([answerCall("Monday 9:00 to 17:00; the other days are not set.")]),
    ]);
    const t1 = turn(ctxFor());
    const r1 = await runAskTurn(t1.input, ports(first.round));
    assert.deepEqual([r1.rounds, r1.failed], [2, false]);
    assert.deepEqual(
      t1.events.filter((e) => e.t === "say").map((e) => e.headline),
      [],
      "the answer beside the read was never said, so never taken back",
    );

    // The answer written first: it was on screen before the read was known, so it is said, then taken back.
    const early = answerCall("We open at nine.", {}, "t-early");
    const s = scripted([
      async (_c, _onText, onInput) => {
        onInput(early, []);
        return ROUND([tool("workspace", { action: "settings" }), early]);
      },
      ROUND([answerCall("Monday 9:00 to 17:00; the other days are not set.")]),
    ]);
    const t = turn(ctxFor());
    const r = await runAskTurn(t.input, ports(s.round));
    assert.deepEqual(
      [r.text, r.rounds, r.tools],
      ["Monday 9:00 to 17:00; the other days are not set.", 2, ["workspace.settings"]],
    );
    assert.deepEqual(
      t.events
        .filter((e) => e.t === "say")
        .map((e) => e.headline)
        .slice(0, 2),
      ["We open at nine.", ""],
      "said as it was written, then taken back",
    );
    const results = s.requests[1].messages.at(-1).content.filter((b) => b.type === "tool_result");
    assert.deepEqual(
      results.map((b) => [b.tool_use_id, b.is_error]),
      [
        ["t-workspace.settings", false],
        ["t-early", true],
      ],
      "every call answered, in the order of the calls",
    );
    assert.match(results[1].content, /not shown: answer again/);
    assert.equal(r.shape.answer_in, "tool");

    const text = scripted([ROUND([answer("Nobody is waiting.")])]);
    const r2 = await runAskTurn(turn(ctxFor()).input, ports(text.round));
    assert.deepEqual(
      [r2.text, r2.failed, r2.shape.answer_in, r2.shape.answer_tool],
      ["Nobody is waiting.", false, "text", true],
    );
  });
});

test("the answer tool on, the last round may still call it: it is told it is the last, and a read it makes anyway is answered before one closing round that may call none", async () => {
  const N = ASK_MAX_ROUNDS;
  const filters = ["recent", "needs_you", "all", "waiting", "snoozed", "done", "held", "new", "old"];
  // `n` reads in a row, each its own call, then what `last` says.
  const reads = (n) =>
    filters.slice(0, n).map((filter, k) => ROUND([tool("inbox", { action: "list", filter }, `t-${k}`)]));
  const autos = (n) => Array.from({ length: n }, () => "auto");
  await withAnswerTool("on", async () => {
    const s = scripted([...reads(N), ROUND([answer("Two threads wait.")])]);
    const r = await runAskTurn(turn(ctxFor()).input, ports(s.round));
    assert.equal(r.failed, false, r.failure ?? "");
    assert.deepEqual(
      s.requests.map((q) => q.tool_choice.type),
      [...autos(N), "none"],
      "the last round keeps its tools; the closing round has none",
    );
    assert.equal(
      s.requests[N - 1].messages.at(-1).content.at(-1).text,
      "This is the last round: answer now through the answer tool, with what you have.",
    );
    assert.deepEqual([r.rounds, r.shape.answer_in], [N + 1, "text"]);

    const answered = scripted([...reads(N - 1), ROUND([answerCall("Two threads wait.")])]);
    const r2 = await runAskTurn(turn(ctxFor()).input, ports(answered.round));
    assert.deepEqual([r2.rounds, r2.shape.answer_in], [N, "tool"], "the last round answered through the tool");
  });
  await withAnswerTool("off", async () => {
    const s = scripted([...reads(N - 1), ROUND([answer("Two threads wait.")])]);
    await runAskTurn(turn(ctxFor()).input, ports(s.round));
    assert.deepEqual(
      s.requests.map((q) => q.tool_choice.type),
      [...autos(N - 1), "none"],
      "off: as it was",
    );
    assert.ok(
      !JSON.stringify(s.requests.at(-1).messages).includes("last round"),
      "off: nothing said of the last round",
    );
  });
});

test("an answer call with a character after its closed object lands as the answer, and the turn logs what it set aside (18 Oct 2026: such turns said they could not shape the answer)", async () => {
  await withAnswerTool("on", async () => {
    const call = answerCall("Two threads wait.");
    const strayed = { ...call, json: call.json + "}" };
    const { result: r, lines } = await logged("ask_answer_tail", () =>
      runAskTurn(turn(ctxFor()).input, ports(scripted([ROUND([strayed])]).round)),
    );
    assert.equal(r.failed, false, r.failure ?? "");
    assert.equal(r.answer.say.headline, "Two threads wait.");
    assert.deepEqual(
      lines.map((l) => JSON.parse(l)),
      [{ chars: 1, tail: "}", stop: "tool_use", tenant_id: A }],
    );
  });
});

test("an answer call cut off, or empty, is no answer: the turn says it could not shape one, never a half answer", async () => {
  await withAnswerTool("on", async () => {
    const cut = { ...answerCall("Two threads wait."), json: '{"say": {"headline": "Two thr' };
    const r = await runAskTurn(
      turn(ctxFor()).input,
      ports(scripted([ROUND([cut], { stopReason: "max_tokens" })]).round),
    );
    assert.deepEqual([r.failed, r.shape.answer_in], [true, null]);
    assert.match(r.failure, /^answer: not JSON/);
    const empty = { ...answerCall("x"), json: "" };
    const r2 = await runAskTurn(turn(ctxFor()).input, ports(scripted([ROUND([empty])]).round));
    assert.deepEqual([r2.failed, r2.failure], [true, "answer: no headline"]);
  });
});

test("Show while it writes (contracts answerSoFar): a figure or a row draws once its object closes, grounded as the final grounds it -- a row not read never draws -- and a brace or a key inside a string is only words", async () => {
  const { answerSoFar, noteRows } = await import("@chanlytics/contracts");
  const read = emptyReadSet();
  noteRows(read, [{ kind: "thread", id: C1, route: `inbox/th-${C1}`, label: "Rosa" }]);
  const rosa = { kind: "thread", id: C1, label: "Rosa" };
  const stranger = { kind: "thread", id: C2, label: "nobody" };
  const json = answerJson("Two threads wait.", {
    show: {
      figures: [{ value: "2", label: 'threads "items": {waiting}', note: "", source: NONE }],
      items: [
        { title: "Rosa", meta: "WhatsApp", line: "Asked about Saturday.", source: rosa },
        { title: "Nobody", meta: "", line: "", source: stranger },
      ],
    },
  });
  const say = { headline: "Two threads wait.", detail: "" };
  const at = (needle) => json.indexOf(needle);
  assert.deepEqual(
    answerSoFar(say, json.slice(0, at('"items"')), read, "en"),
    {
      headline: "Two threads wait.",
      detail: "",
      show: { figures: [{ value: "2", label: 'threads "items": {waiting}', note: "", source: null }], items: [] },
    },
    "the figure, whole, before any row; the words inside its label are words",
  );
  const halfRow = answerSoFar(say, json.slice(0, at('"Asked about')), read, "en");
  assert.deepEqual(halfRow.show.items, [], "a row half written is not drawn");
  const whole = answerSoFar(say, json, read, "en");
  assert.deepEqual(
    whole.show.items.map((i) => [i.title, i.source.to]),
    [["Rosa", `inbox/th-${C1}`]],
    "the row that was read, with its route; the one that was not never draws",
  );
  assert.deepEqual(
    answerSoFar(say, json.slice(0, at('"show"')), read, "en"),
    say,
    "no Show before it begins: Say alone",
  );
  assert.deepEqual(
    answerSoFar({ headline: "Hi there", detail: "One\nTwo" }, "", read, "en"),
    { headline: "Hi there", detail: "One\nTwo" },
    "words with no shape: Say alone, as partialSay or a prose answer drew it (its lines kept)",
  );
});

test("the turn sends Show as it is written: the answer tool's input grows, each say carries the rows closed so far, and the last preview's rows are the final's", async () => {
  await withAnswerTool("on", async () => {
    const rosa = { kind: "thread", id: C1, label: "Rosa" };
    const call = answerCall("Rosa asked about Saturday.", {
      show: { items: [{ title: "Rosa", meta: "WhatsApp", line: "Asked about Saturday.", source: rosa }] },
    });
    const s = scripted([ROUND([tool("inbox", { action: "list", filter: "recent" })]), streamedAnswer(call, 24)]);
    const t = turn(ctxFor());
    const r = await runAskTurn(t.input, ports(s.round));
    assert.equal(r.failed, false, r.failure ?? "");
    const says = t.events.filter((e) => e.t === "say");
    const first = says.findIndex((e) => e.show);
    assert.ok(first > 0, "Say first, then Show once a row closed");
    assert.ok(
      says.slice(0, first).every((e) => !e.show),
      "no Show before its row closed",
    );
    assert.deepEqual(
      says.at(-1).show.items.map((i) => [i.title, i.source.id]),
      r.answer.show.items.map((i) => [i.title, i.source.id]),
      "the last preview's rows are the final's",
    );
  });
});

test("an answer written beside a post drawn for a look is set aside: the model looks first, then answers", async () => {
  const { besideActs } = await import(at("apps/dashboard/src/server/ask/turn-end.ts"));
  let unsaid = 0;
  const r = { refused: false, leftOut: false, planned: null, unsay: () => unsaid++, log: () => {} };
  assert.equal(besideActs("Here is your post", { ...r, looking: true }), "");
  assert.equal(unsaid, 1);
  assert.equal(besideActs("Here is your post", { ...r, looking: false }), "Here is your post");
});

test("REGRESSION (decision 0132): only the latest answer's cards wait for a yes; one further up is out of view, never pressed by a yes and never refused as already above", async () => {
  // "Yes, run the New York City search" pressed a card made an hour and forty minutes up the thread.
  const card = (id, title) => ({ id, kind: "note", needs: "operator", title, summary: "", payload: {}, undo: null });
  const { ctx } = await seeded([
    [{ text: "Find med spas in New York" }, storedAnswer(shaped("Here it is."), [card("p-old", "Find 300 med spas")])],
    [{ text: "Rename the sequence" }, storedAnswer(shaped("Here it is."), [card("p-new", "Rename it")])],
    [{ text: "What did the search find?" }, storedAnswer(shaped("57 so far."))],
  ]);
  const found = await threadNow(ctx, "Yes, run the New York City search");
  assert.deepEqual(
    found.waiting.map((p) => p.id),
    ["p-new"],
    "the latest answer that made cards, never one before it",
  );
});
