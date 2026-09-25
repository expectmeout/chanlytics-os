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
