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
