/**
 * The shape of a turn: where the time went and what the model was fed.
 *
 * Phase 0 of Ask Rewired (docs/superpowers/specs/2026-09-25-ask-rewired-design.md, §5.8): the stream parser reads the
 * usage frames, a round keeps its timing and usage, the loop folds them into an AskTurnShape it logs and returns, the
 * route stores it on the turn's row and reads the palette's opened_ms, and the palette's client sends it. Every part is
 * executed here against a scripted model; nothing reaches a network.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "./_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const sse = await import(at("apps/dashboard/src/server/ask/sse.ts"));

test("the parser: message_start is the usage (the input side, the cache counts, the message id); message_delta's stop carries the output side; a start without usage is nothing", () => {
  assert.deepEqual(
    sse.parseFrame(
      'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_01","usage":{"input_tokens":1200,"cache_read_input_tokens":900,"cache_creation_input_tokens":300,"output_tokens":1}}}',
    ),
    { type: "usage", messageId: "msg_01", inputTokens: 1200, cacheReadTokens: 900, cacheCreationTokens: 300 },
  );
  assert.deepEqual(
    sse.parseFrame('data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":42}}'),
    { type: "stop", stopReason: "end_turn", outputTokens: 42 },
  );
  assert.deepEqual(
    sse.parseFrame('data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}'),
    { type: "stop", stopReason: "tool_use", outputTokens: null },
    "a delta without usage still stops; the output side is unknown, never zero",
  );
  assert.equal(sse.parseFrame('data: {"type":"message_start","message":{"id":"msg_02"}}'), null);
});

const { runRound } = await import(at("apps/dashboard/src/server/ask/round.ts"));
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "u1";
const tick = () => new Promise((r) => setTimeout(r, 5));

test("a round keeps its timing (first event, first text, the whole) and its usage (start plus stop), and a scripted or broken stream leaves them honest", async () => {
  async function* stream() {
    await tick();
    yield { type: "usage", messageId: "msg_01", inputTokens: 100, cacheReadTokens: 900, cacheCreationTokens: 0 };
    yield { type: "block_start", index: 0, block: { type: "text" } };
    await tick();
    yield { type: "text", index: 0, text: '{"say": {"headline": "Two' };
    yield { type: "text", index: 0, text: ' wait"}}' };
    yield { type: "block_stop", index: 0 };
    yield { type: "stop", stopReason: "end_turn", outputTokens: 42 };
  }
  const r = await runRound({ tenantId: A, userId: USER, request: {} }, () => {}, stream);
  assert.deepEqual(r.usage, {
    messageId: "msg_01",
    inputTokens: 100,
    cacheReadTokens: 900,
    cacheCreationTokens: 0,
    outputTokens: 42,
  });
  assert.ok(r.timing.firstEventMs >= 0, "the first byte's time");
  assert.ok(r.timing.firstTextMs >= r.timing.firstEventMs, "the first text after the first byte");
  assert.ok(r.timing.totalMs >= r.timing.firstTextMs, "the whole after both");

  async function* silent() {
    yield { type: "block_start", index: 0, block: { type: "tool_use", id: "t1", name: "list_threads" } };
    yield { type: "input_json", index: 0, partial: "{}" };
    yield { type: "block_stop", index: 0 };
    yield { type: "stop", stopReason: "tool_use", outputTokens: null };
  }
  const s = await runRound({ tenantId: A, userId: USER, request: {} }, () => {}, silent);
  assert.equal(s.usage, null, "no usage frame, no usage: never a row of zeros");
  assert.equal(s.timing.firstTextMs, null, "a round that wrote no text has no first text");
  assert.ok(typeof s.timing.firstEventMs === "number");

  async function* nothing() {
    yield { type: "error", message: "gone" };
  }
  const n = await runRound({ tenantId: A, userId: USER, request: {} }, () => {}, nothing);
  assert.deepEqual([n.streamError, n.usage, n.timing.firstTextMs], ["gone", null, null]);
});

test("the cache hit ratio: cache reads over everything the model was fed; nothing fed is null, not zero", async () => {
  const { cacheHitOf } = await import("@chanlytics/contracts");
  assert.equal(cacheHitOf({ input: 100, cache_read: 900, cache_creation: 0, output: 40 }), 0.9);
  assert.equal(cacheHitOf({ input: 0, cache_read: 0, cache_creation: 0, output: 0 }), null);
  assert.equal(cacheHitOf({ input: 100, cache_read: 0, cache_creation: 900, output: 40 }), 0, "a write is not a hit");
});

const { runAskTurn } = await import(at("apps/dashboard/src/server/ask/loop.ts"));
const { buildProposal } = await import(at("apps/dashboard/src/server/ask/proposals.ts"));
const { workspaceFacts } = await import(at("apps/dashboard/src/server/ask/prompt.ts"));

const NONE = { kind: "none", id: "", label: "" };
const answerJson = (headline) =>
  JSON.stringify({
    say: { headline, detail: "" },
    show: { figures: [], items: [], breakdown: { label: "", total: 0, parts: [], source: NONE } },
    do: { open: { source: NONE, label: "", now: false }, next: [] },
    language: "en",
  });
const text = (t) => ({ type: "text", id: "", name: "", text: t, json: "" });
const tool = (name, input, id = `t-${name}`) => ({ type: "tool_use", id, name, text: "", json: JSON.stringify(input) });
/** A scripted round with the timing and usage a real one carries. */
const ROUND = (blocks, extra = {}) => ({
  blocks,
  stopReason: "tool_use",
  streamError: null,
  usage: { messageId: "m", inputTokens: 100, cacheReadTokens: 900, cacheCreationTokens: 0, outputTokens: 50 },
  timing: { firstEventMs: 3, firstTextMs: 7, totalMs: 20 },
  ...extra,
});
function scripted(rounds) {
  const requests = [];
  const round = async (c, onText) => {
    requests.push(c.request);
    const r = rounds.shift();
    if (!r) throw new Error("the loop asked for a round the script does not have");
    return typeof r === "function" ? r(c, onText) : r;
  };
  return { round, requests };
}
/** What the loop logged under one event name, parsed. */
async function loggedInfo(event, fn) {
  const lines = [];
  const was = console.log;
  console.log = (s) => {
    try {
      const j = JSON.parse(s);
      if (j.event === event) lines.push(j);
    } catch {
      /* not ours */
    }
  };
  try {
    return { result: await fn(), lines };
  } finally {
    console.log = was;
  }
}
const turnInput = (over = {}) => ({
  ctx: { supabase: fakeDb({}), userId: USER, email: "ada@example.com", params: {} },
  tenantId: A,
  role: "operator",
  facts: workspaceFacts("Harbor", "America/New_York", null, []),
  timezone: "America/New_York",
  personLabel: "ada@example.com (operator)",
  language: "en",
  scope: null,
  surface: "today",
  history: [],
  text: "Who needs me?",
  emit: () => {},
  now: new Date("2026-09-14T14:00:00Z"),
  ...over,
});
/** The ports with the model scripted and every read answered at once, so no fixture is needed. */
const portsOf = (round) => ({
  round,
  snapshot: async () => "The day: nothing yet.",
  tool: async () => ({ result: JSON.stringify({ threads: [] }), isError: false }),
  propose: buildProposal,
});

test("the loop fills the shape: a read then an answer is two rounds with their times and summed tokens, the tool timed, the first byte and text from round one, the first Say when it streamed, the surface, the scope kind, the follow-up and the palette's opened_ms; logged as ask_turn_shape and returned", async () => {
  const s = scripted([
    ROUND([tool("list_threads", { filter: "recent" })]),
    (c, onText) => {
      const json = answerJson("Nobody is waiting.");
      onText(json);
      return ROUND([text(json)], { stopReason: "end_turn" });
    },
  ]);
  const { result: r, lines } = await loggedInfo("ask_turn_shape", () =>
    runAskTurn(
      turnInput({
        surface: "reports",
        scope: { kind: "call", id: "c1", label: "a call" },
        history: [
          { role: "user", text: "earlier" },
          { role: "assistant", text: "an answer" },
        ],
        openedMs: 4200,
        sinceLastMs: 30_000,
      }),
      portsOf(s.round),
    ),
  );
  assert.equal(r.failed, false, r.failure ?? "");
  const sh = r.shape;
  assert.equal(sh.v, 1);
  assert.deepEqual(
    [sh.surface, sh.scope_kind, sh.follow_up, sh.since_last_ms, sh.opened_ms],
    ["reports", "call", true, 30_000, 4200],
  );
  assert.deepEqual([sh.rounds, sh.rounds_ms], [2, [20, 20]]);
  assert.deepEqual(
    sh.tokens,
    { input: 200, cache_read: 1800, cache_creation: 0, output: 100 },
    "summed over the rounds",
  );
  assert.equal(sh.cache_hit, 0.9);
  assert.equal(sh.cap_hits, 0);
  assert.equal(sh.format, true);
  assert.deepEqual(
    sh.tools_ms.map((t) => t.name),
    ["list_threads"],
  );
  assert.ok(sh.tools_ms[0].ms >= 0);
  assert.ok(sh.first_byte_ms >= 3 && sh.first_byte_ms < 5_000, "round one's first event, from the turn's start");
  assert.ok(
    sh.first_text_ms >= 7 && sh.first_text_ms >= sh.first_byte_ms,
    "round one's first text, from the turn's start",
  );
  assert.ok(typeof sh.first_say_ms === "number" && sh.first_say_ms >= 0, "the Say streamed in round two");
  assert.ok(sh.final_ms >= sh.first_say_ms);
  assert.equal(sh.snapshot_ms >= 0, true);
  assert.deepEqual(sh.prefetched, []);
  assert.equal(typeof sh.model, "string");
  assert.equal(sh.effort, "low");
  assert.equal(lines.length, 1, "logged once");
  assert.deepEqual([lines[0].tenant, lines[0].rounds, lines[0].cache_hit, lines[0].opened_ms], [A, 2, 0.9, 4200]);
  assert.deepEqual(lines[0].tools, ["list_threads"], "the log keeps the tools list it always had");
});

test("a turn answered without a Say has none; a scripted round without timing or usage leaves the shape honest, not zero", async () => {
  const s = scripted([{ blocks: [text(answerJson("Nobody is waiting."))], stopReason: "end_turn", streamError: null }]);
  const r = await runAskTurn(turnInput(), portsOf(s.round));
  assert.equal(r.failed, false, r.failure ?? "");
  const sh = r.shape;
  assert.deepEqual([sh.first_byte_ms, sh.first_text_ms, sh.first_say_ms], [null, null, null]);
  assert.deepEqual(sh.tokens, { input: 0, cache_read: 0, cache_creation: 0, output: 0 });
  assert.equal(sh.cache_hit, null);
  assert.equal(sh.rounds_ms.length, 1, "a round without timing is still timed by the loop's own clock");
  assert.deepEqual([sh.follow_up, sh.since_last_ms, sh.opened_ms], [false, null, null]);
});
