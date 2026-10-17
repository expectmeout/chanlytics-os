/**
 * The effort a turn is asked at (server/ask/effort.ts; Ruben, 15 Oct 2026: "for crafting generating big things like
 * campaigns etc we should use the maximum effort level whereas for other things low or medium"), run through the real
 * loop with the model scripted: a draft its question names is asked at the draft's effort by an effort message after
 * the question (contracts ai/effort.ts), the request's own effort and the cache's markers as every other turn's; a
 * question that names none is asked at the turn's own; a draft begun at the turn's own effort is set aside and asked
 * again; a spoken turn is never raised; the next turn of a replayed thread sets the effort back the same way, only
 * appending; and an edge older than the effort messages is asked again without them.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  ASK_DRAFT_EFFORT,
  ASK_DRAFT_MAX_TOKENS,
  ASK_EFFORT,
  ASK_MAX_TOKENS,
  EFFORT_MESSAGE_BETA,
  effortMessage,
} from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
// The gateway's own test below knocks on an edge: this deployment may reach one, the edge's address and secret are set.
process.env.EDGE_PROVIDERS = "live";
process.env.EDGE_URL = "https://edge.example.com";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
delete process.env.ASK_MODEL;
delete process.env.ASK_EFFORT;
delete process.env.ASK_DRAFT_EFFORT;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { runAskTurn } = await import(at("apps/dashboard/src/server/ask/loop.ts"));
const { draftAsked } = await import(at("apps/dashboard/src/server/ask/cross-page.ts"));
const { streamModel } = await import(at("apps/dashboard/src/server/ask/gateway.ts"));
const { workspaceFacts } = await import(at("apps/dashboard/src/server/ask/prompt.ts"));
const { readerCache } = await import(at("apps/dashboard/src/server/readers/index.ts"));
beforeEach(() => readerCache.clear());

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NOW = new Date("2026-09-14T14:00:00Z");
const NONE = { kind: "none", id: "", label: "" };
const answer = (headline) => ({
  type: "text",
  id: "",
  name: "",
  json: "",
  text: JSON.stringify({
    say: { headline, detail: "" },
    show: { figures: [], items: [], breakdown: { label: "", total: 0, parts: [], source: NONE } },
    do: { open: { source: NONE, label: "", now: false }, next: [] },
    language: "en",
  }),
});
const ANSWERED = (headline) => ({ blocks: [answer(headline)], stopReason: "end_turn", streamError: null });
const CALLED = (name, input) => ({
  blocks: [{ type: "tool_use", id: `t-${name}`, name, text: "", json: JSON.stringify(input) }],
  stopReason: "tool_use",
  streamError: null,
});

/** The model, scripted: each request kept as it was sent (its bytes), each round the next of `rounds`. */
function sentAs(rounds) {
  const requests = [];
  const round = async (c) => {
    requests.push(JSON.parse(JSON.stringify(c.request)));
    const r = rounds.shift();
    if (!r) throw new Error("the loop asked for a round the script does not have");
    return r;
  };
  return { round, requests };
}
const turn = (over = {}) => {
  const events = [];
  return {
    events,
    input: {
      ctx: { supabase: fakeDb({}), userId: "u1", email: "ada@example.com", params: {} },
      tenantId: A,
      role: "owner",
      facts: workspaceFacts("Harbor", "America/New_York", null, NOW, []),
      timezone: "America/New_York",
      personLabel: "ada@example.com (owner)",
      language: "en",
      scope: null,
      surface: "campaigns",
      history: [],
      text: "Who needs me?",
      emit: (ev) => events.push(ev),
      now: NOW,
      ...over,
    },
  };
};
const proposed = [];
const ports = (round, over = {}) => ({
  round,
  shape: async () => "The workspace: Harbor · zone America/New_York",
  tool: async () => ({ result: "{}", isError: false }),
  propose: async (...a) => {
    proposed.push(a[1]);
    return { result: JSON.stringify({ error: "not in this test" }), isError: true };
  },
  ...over,
});
beforeEach(() => (proposed.length = 0));
const unmark = (messages) =>
  messages.map((m) =>
    Array.isArray(m.content) ? { ...m, content: m.content.map(({ cache_control: _cc, ...b }) => b) } : m,
  );
/** Every event of a stream, read to its end. */
async function drain(events) {
  for await (const ev of events) void ev;
}
const marked = (m) => Array.isArray(m.content) && m.content.some((b) => b.cache_control);

test("the planner names a draft: a setup, an offer, or a message, a campaign, a sequence or a plan to write, in either language; a question, a read or a change is none", () => {
  for (const q of [
    "Set up my campaigns.",
    "We're a B2B consultancy: calls, then proposals. Set up my campaigns.",
    "Prepara mis campañas.",
    "I want to offer 10% off colour all next month",
    "give everyone 15% off next week",
    "write a win-back for people who haven't been in since summer, in Spanish too",
    "draft the offer email for November",
    "can you write me a follow-up sequence for new leads?",
    "put together a plan for the holidays",
    "escribe un mensaje para los clientes que no vuelven",
    "redacta una campaña de navidad",
  ])
    assert.equal(draftAsked(q), true, q);
  for (const q of [
    "Who needs me?",
    "how did the promotion do?",
    "did you set up my campaigns?",
    "what campaigns are running?",
    "pause the win-back",
    "rename the win-back to Past clients",
    "what am I missing in my campaigns",
    "write back to Ana that we're open",
    "how do I write a good message?",
  ])
    assert.equal(draftAsked(q), false, q);
});

test("a draft its question names is asked at the draft's effort: an effort message after the question, the request's own effort and format as every turn's, a draft's ceiling and the beta, the cache's last marker on the question; the stored turn keeps the message where it stood", async () => {
  const s = sentAs([ANSWERED("Two campaigns to review.")]);
  const { input } = turn({ text: "Set up my campaigns." });
  const r = await runAskTurn(input, ports(s.round));
  assert.equal(r.failed, false, r.failure ?? "");
  assert.equal(ASK_DRAFT_EFFORT, "high");
  const [first] = s.requests;
  assert.deepEqual(first.messages.at(-1), effortMessage(ASK_DRAFT_EFFORT), "said after the question");
  assert.equal(first.messages.at(-2).role, "system", "the turn's words, before it (the answer canvas, A3)");
  assert.equal(first.messages.at(-3).role, "user", "and the question before them");
  assert.equal(first.output_config.effort, ASK_EFFORT, "the request's own effort is every turn's: the cache's key");
  assert.ok(first.output_config.format, "beside the answer's format");
  assert.equal(first.max_tokens, ASK_DRAFT_MAX_TOKENS, "a draft's thinking counts toward its ceiling");
  assert.deepEqual(first.betas, [EFFORT_MESSAGE_BETA]);
  assert.ok(marked(first.messages.at(-2)), "bp4 on the words' block: the effort message has none");
  assert.equal(first.messages.filter(marked).length, 1, "and nowhere else in the messages");
  assert.deepEqual(r.shape.draft, { effort: ASK_DRAFT_EFFORT, by: "question" });
  assert.deepEqual(r.raw.rounds.at(-1), effortMessage(ASK_DRAFT_EFFORT), "kept where it stood, after the question");
  assert.deepEqual(
    r.raw.rounds.map((m) => m.role),
    ["system", "system"],
    "the turn's words, then the effort",
  );
});

test("a question that names no draft is asked at the turn's own effort: no message, Ask's own ceiling, no beta", async () => {
  const s = sentAs([ANSWERED("Nobody is waiting.")]);
  const r = await runAskTurn(turn().input, ports(s.round));
  assert.equal(r.failed, false, r.failure ?? "");
  const [first] = s.requests;
  assert.equal(first.messages.at(-1).role, "system", "the turn's words after the question, nothing after them");
  assert.ok(first.messages.at(-1).content.length > 0, "the words, never an effort message");
  assert.equal(first.max_tokens, ASK_MAX_TOKENS);
  assert.equal(first.betas, undefined);
  assert.equal(r.shape.draft, null);
});

test("a draft its question did not name is found by the round that begins one: its calls are set aside unrun, nothing is traced, and the round is asked again at the draft's effort, the message appended; ASK_DRAFT_EFFORT=off lets the call run at the turn's own", async () => {
  const text = "Get the quiet ones back";
  assert.equal(draftAsked(text), false, "a draft its words do not name");
  const s = sentAs([
    CALLED("propose_plan", { action: "offer", intent: "win back the quiet clients" }),
    ANSWERED("A win-back to review."),
  ]);
  const { input, events } = turn({ text });
  const r = await runAskTurn(input, ports(s.round));
  assert.equal(r.failed, false, r.failure ?? "");
  assert.equal(s.requests.length, 2);
  const [low, raised] = s.requests;
  assert.equal(low.max_tokens, ASK_MAX_TOKENS);
  assert.deepEqual(
    unmark(raised.messages),
    [...unmark(low.messages), effortMessage(ASK_DRAFT_EFFORT)],
    "the same request, one message appended: the cache's prefix holds",
  );
  assert.equal(raised.max_tokens, ASK_DRAFT_MAX_TOKENS);
  assert.deepEqual(raised.betas, [EFFORT_MESSAGE_BETA]);
  assert.ok(marked(raised.messages.at(-2)), "bp4 on the last block before the effort message");
  assert.deepEqual(proposed, [], "the low round's call never ran");
  assert.deepEqual(
    events.filter((e) => e.t === "trace"),
    [],
    "nor was it traced",
  );
  assert.deepEqual(r.shape.draft, { effort: ASK_DRAFT_EFFORT, by: "call" });
  assert.equal(r.shape.rounds_ms.length, 2, "the round set aside is measured as the time it took");

  process.env.ASK_DRAFT_EFFORT = "off";
  try {
    const off = sentAs([CALLED("propose_plan", { action: "offer", intent: "win back" }), ANSWERED("Here.")]);
    const o = await runAskTurn(turn({ text }).input, ports(off.round));
    assert.equal(o.failed, false, o.failure ?? "");
    assert.deepEqual(proposed, ["propose_plan"], "off: the call runs at the turn's own effort");
    assert.ok(
      off.requests.every((q) => q.max_tokens === ASK_MAX_TOKENS && q.betas === undefined),
      "and no round is raised",
    );
    assert.equal(o.shape.draft, null);
    // Off, a draft its question names is asked as every other turn is too.
    const named = sentAs([ANSWERED("Here.")]);
    await runAskTurn(turn({ text: "Set up my campaigns." }).input, ports(named.round));
    assert.ok(named.requests[0].messages.at(-1).content.length > 0, "the words last, no effort message");
  } finally {
    delete process.env.ASK_DRAFT_EFFORT;
  }
});

test("a read before the draft keeps its round: the draft's call after it is set aside, and the round asked again after the read's results", async () => {
  const s = sentAs([
    CALLED("sequences", { action: "moments" }),
    CALLED("propose_sequence", { action: "message", name: "winback" }),
    ANSWERED("A message to review."),
  ]);
  const r = await runAskTurn(turn({ text: "the ones gone quiet since summer" }).input, ports(s.round));
  assert.equal(r.failed, false, r.failure ?? "");
  assert.equal(s.requests.length, 3);
  const [, low, raised] = s.requests;
  assert.deepEqual(unmark(raised.messages), [...unmark(low.messages), effortMessage(ASK_DRAFT_EFFORT)]);
  assert.equal(low.messages.at(-1).role, "user", "the read's results, before the message");
  assert.deepEqual(r.shape.draft, { effort: ASK_DRAFT_EFFORT, by: "call" });
});

test("a spoken turn is never raised: a listener waits on silence", async () => {
  const s = sentAs([ANSWERED("Two campaigns to review.")]);
  const r = await runAskTurn(turn({ text: "Set up my campaigns.", spoken: true }).input, ports(s.round));
  assert.equal(r.failed, false, r.failure ?? "");
  assert.ok(s.requests[0].messages.at(-1).content.length > 0, "the words last, no effort message");
  assert.equal(s.requests[0].max_tokens, ASK_MAX_TOKENS);
  assert.equal(r.shape.draft, null);
});

/** A thread's warm chain as memory.ts chainFrom puts it together from a turn's raw: its question, rounds and final. */
const chainOf = (raw) => ({
  messages: [
    ...(raw.base ?? []),
    { role: "user", content: raw.question },
    ...raw.rounds,
    { role: "assistant", content: raw.final },
  ],
  anchor: raw.question.at(-1),
  results: raw.results,
  model: raw.model,
  prefix: raw.prefix,
  after: "row-1",
  lastId: null,
  since: [],
  readAt: [raw.at],
});

test("the next turn of a replayed draft that is none sets the effort back after its own question, appending, and a draft after it raises it again; the replay keeps the draft's message where it stood", async () => {
  const t1 = sentAs([ANSWERED("Two campaigns to review.")]);
  const r1 = await runAskTurn(turn({ text: "Set up my campaigns." }).input, ports(t1.round));
  assert.equal(r1.failed, false, r1.failure ?? "");

  const t2 = sentAs([ANSWERED("Nobody is waiting.")]);
  const r2 = await runAskTurn(
    turn({ text: "Who needs me?", chain: chainOf(r1.raw), history: [] }).input,
    ports(t2.round),
  );
  assert.equal(r2.failed, false, r2.failure ?? "");
  assert.equal(r2.shape.replay, "live", "the thread replayed as it was sent");
  const sent = unmark(t2.requests[0].messages);
  const sent1 = unmark(t1.requests[0].messages);
  assert.deepEqual(sent.slice(0, sent1.length), sent1, "turn 1's request, its effort message included, byte for byte");
  assert.deepEqual(sent.at(-1), effortMessage(ASK_EFFORT), "set back after the new question");
  assert.deepEqual(
    sent.slice(-3, -1).map((m) => m.role),
    ["user", "system"],
    "after the new question and its words",
  );
  assert.equal(t2.requests[0].max_tokens, ASK_MAX_TOKENS, "the ceiling falls with it");
  assert.deepEqual(t2.requests[0].betas, [EFFORT_MESSAGE_BETA], "the messages still carry effort messages");
  assert.equal(r2.shape.draft, null);

  const t3 = sentAs([ANSWERED("A message to review.")]);
  const r3 = await runAskTurn(
    turn({ text: "write a win-back message for them", chain: chainOf(r2.raw), history: [] }).input,
    ports(t3.round),
  );
  assert.equal(r3.failed, false, r3.failure ?? "");
  assert.deepEqual(unmark(t3.requests[0].messages).at(-1), effortMessage(ASK_DRAFT_EFFORT), "raised again");
  assert.equal(t3.requests[0].max_tokens, ASK_DRAFT_MAX_TOKENS);
});

test("an edge older than the effort messages drops their beta, and the API refuses them: the round is asked again without them, once, at the turn's own effort; any other refusal is the turn's", async () => {
  const q = { role: "user", content: [{ type: "text", text: "Set up my campaigns." }] };
  const call = {
    tenantId: A,
    userId: "u1",
    request: { max_tokens: ASK_DRAFT_MAX_TOKENS, system: [], messages: [q, effortMessage("high")] },
  };
  const bodies = [];
  const was = globalThis.fetch;
  const refusing = (message) => async (_url, init) => {
    bodies.push(JSON.parse(init.body).request);
    if (bodies.length === 1)
      return new Response(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message } }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    return new Response('event: message_stop\ndata: {"type":"message_stop"}\n\n', {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  };
  try {
    globalThis.fetch = refusing("messages.1.output_config: Extra inputs are not permitted");
    await drain(streamModel(call));
    assert.equal(bodies.length, 2);
    assert.deepEqual(bodies[1].messages, [q], "asked again without it");
    assert.equal(bodies[1].max_tokens, ASK_DRAFT_MAX_TOKENS, "the old edge clamps the ceiling itself");

    bodies.length = 0;
    globalThis.fetch = refusing("messages.0.content: something else entirely");
    await assert.rejects(() => drain(streamModel(call)), /gateway refused: bad_request/);
    assert.equal(bodies.length, 1, "another refusal is never asked again");
  } finally {
    globalThis.fetch = was;
  }
});
