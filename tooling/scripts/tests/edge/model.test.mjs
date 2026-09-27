/**
 * The platform's one JSON-model transport (apps/edge/lib/model.ts, Reach out Part 4 R11), run over a client the test
 * answers: no key asks nothing; the answer is asked for in its schema, with the caller's deadline; an API that refuses
 * the schema's format is asked once more for plain JSON; a refusal or a capped answer is no answer. The note sweep and
 * the reach-out check both ask through it.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { at, withEnv } from "../_cron-doors-world.mjs";

const { askJson, firstJson, setModelClient } = await import(at("apps/edge/lib/model.ts"));
const { askNoteModel } = await import(at("apps/edge/lib/notes/suggest.ts"));
const { askReachOutModel } = await import(at("apps/edge/lib/reach-out/check.ts"));
after(() => setModelClient(null));

const KEY = { ANTHROPIC_API_KEY: "model-key-for-this-file" };
const SCHEMA = { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] };
const ask = (over = {}) => ({
  model: "claude-haiku-4-5-20251001",
  system: "Answer.",
  user: "Is it?",
  schema: SCHEMA,
  maxTokens: 100,
  plainJsonHint: "Answer with only a JSON object.",
  timeoutMs: 8_000,
  maxRetries: 0,
  ...over,
});
/** A client that answers each call with the next of `replies` (an Error is thrown), and remembers each call. */
function client(...replies) {
  const calls = [];
  setModelClient({
    messages: {
      create: async (body, options) => {
        calls.push({ body, options });
        const r = replies.shift();
        if (r instanceof Error) throw r;
        return r;
      },
    },
  });
  return calls;
}
const said = (text, over = {}) => ({
  content: [{ type: "text", text }],
  stop_reason: "end_turn",
  usage: { input_tokens: 12, output_tokens: 3 },
  ...over,
});

test("no key: nothing is asked, and there is no answer", async () => {
  const calls = client(said('{"ok":true}'));
  assert.equal(await withEnv({ ANTHROPIC_API_KEY: undefined }, () => askJson(ask())), null);
  assert.equal(calls.length, 0);
});

test("the answer in its schema, with the caller's deadline and retries, and what it cost", async () => {
  const calls = client(said('Here: {"ok":true}'));
  const signal = new AbortController().signal;
  const out = await withEnv(KEY, () => askJson(ask({ signal })));
  assert.deepEqual(out, { answer: { ok: true }, tokens: { input: 12, output: 3 } });
  assert.deepEqual(calls[0].body.output_config, { format: { type: "json_schema", schema: SCHEMA } });
  assert.deepEqual(
    [calls[0].body.model, calls[0].body.max_tokens, calls[0].body.system, calls[0].body.messages],
    ["claude-haiku-4-5-20251001", 100, "Answer.", [{ role: "user", content: "Is it?" }]],
  );
  assert.deepEqual(calls[0].options, { timeout: 8_000, maxRetries: 0, signal });
});

test("a format the API refuses is asked again once for plain JSON; any other refusal is the caller's to count", async () => {
  const format = Object.assign(new Error("output_config: unsupported"), { status: 400 });
  const calls = client(format, said('{"ok":false}'));
  const out = await withEnv(KEY, () => askJson(ask()));
  assert.deepEqual(out.answer, { ok: false });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.output_config, undefined);
  assert.equal(calls[1].body.system, "Answer.\nAnswer with only a JSON object.");
  client(Object.assign(new Error("overloaded"), { status: 529 }));
  await assert.rejects(
    withEnv(KEY, () => askJson(ask())),
    /overloaded/,
  );
});

test("a refusal, an answer cut at its cap, or no JSON at all is no answer", async () => {
  client(said('{"ok":true}', { stop_reason: "refusal" }));
  assert.equal((await withEnv(KEY, () => askJson(ask()))).answer, null);
  client(said('{"ok":tr', { stop_reason: "max_tokens" }));
  assert.equal((await withEnv(KEY, () => askJson(ask()))).answer, null);
  assert.equal(firstJson("nothing here"), null);
  assert.equal(firstJson("{broken"), null);
});

test("the note sweep and the reach-out check ask through it, each with its own deadline", async () => {
  const calls = client(said('{"worth":false}'), said('{"opening":"x"}'));
  await withEnv(KEY, () => askNoteModel("system", "user"));
  const signal = new AbortController().signal;
  await withEnv(KEY, () => askReachOutModel("system", "user", SCHEMA, 400, signal));
  assert.deepEqual(calls[0].options, { timeout: 20_000, maxRetries: 1 });
  assert.equal(calls[0].body.max_tokens, 300);
  assert.deepEqual(calls[1].options, { timeout: 8_000, maxRetries: 0, signal });
  assert.equal(calls[1].body.max_tokens, 400);
});
