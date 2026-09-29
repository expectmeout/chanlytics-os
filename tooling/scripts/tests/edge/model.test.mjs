/**
 * The platform's one JSON-model transport (apps/edge/lib/model.ts askJson, Reach out Part 4 R11), run over the model
 * port and a scripted API: no key asks nothing; the answer is asked for in its schema, under the purpose's route; an
 * API that refuses the schema's format is asked once more for plain JSON; a refusal or a capped answer is no answer;
 * a call that never gets one is thrown for the caller to count. The note sweep and the reach-out check both ask through
 * it. What each call writes to the usage ledger is model-ledger.test.mjs's.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MODEL_ROUTES } from "@chanlytics/contracts";
import { resetBreakers } from "@chanlytics/channels";
import { at, withEnv } from "../_cron-doors-world.mjs";
import { scripted, said, status, hang } from "../_model-world.mjs";

for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];

const { askJson, firstJson, setModelFetch, ModelUnavailable } = await import(at("apps/edge/lib/model.ts"));
const { askNoteModel } = await import(at("apps/edge/lib/notes.ts"));
const { askReachOutModel } = await import(at("apps/edge/lib/reach-out/check.ts"));
after(() => setModelFetch(null));
beforeEach(() => resetBreakers());

const KEY = { ANTHROPIC_API_KEY: "model-key-for-this-file" };
const SCHEMA = { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] };
const ask = (over = {}) => ({
  purpose: "reach_out_check",
  system: "Answer.",
  user: "Is it?",
  schema: SCHEMA,
  maxTokens: 100,
  plainJsonHint: "Answer with only a JSON object.",
  for: { tenantId: null },
  ...over,
});
/** The port's network: each call answered with the next of `replies`, and remembered. */
function api(...replies) {
  const s = scripted(...replies);
  setModelFetch(s.fetch);
  return s.calls;
}

test("no key: nothing is asked, and there is no answer", async () => {
  const calls = api(said('{"ok":true}'));
  assert.equal(await withEnv({ ANTHROPIC_API_KEY: undefined }, () => askJson(ask())), null);
  assert.equal(calls.length, 0);
});

test("the answer in its schema, under the purpose's route, and what it cost", async () => {
  const calls = api(said('Here: {"ok":true}'));
  const out = await withEnv(KEY, () => askJson(ask()));
  assert.deepEqual(out, { answer: { ok: true }, tokens: { input: 120, output: 30 } });
  assert.deepEqual(calls[0].body.output_config, { format: { type: "json_schema", schema: SCHEMA } });
  assert.deepEqual(
    [calls[0].model, calls[0].body.max_tokens, calls[0].body.system, calls[0].body.messages],
    [MODEL_ROUTES.reach_out_check.model, 100, "Answer.", [{ role: "user", content: "Is it?" }]],
  );
});

test("a call that outlasts the caller's bound is thrown as a timeout, and a caller's own signal ends it too", async () => {
  api(hang());
  await assert.rejects(
    withEnv(KEY, () => askJson(ask({ timeoutMs: 20 }))),
    (e) => e instanceof ModelUnavailable && e.name === "TimeoutError",
  );
  resetBreakers();
  api(hang());
  const stop = new AbortController();
  setTimeout(() => stop.abort(), 20);
  await assert.rejects(
    withEnv(KEY, () => askJson(ask({ signal: stop.signal }))),
    (e) => e instanceof ModelUnavailable,
  );
});

test("a format the API refuses is asked again once for plain JSON; any other failure is the caller's to count", async () => {
  const calls = api(status(400, "output_config: unsupported"), said('{"ok":false}'));
  const out = await withEnv(KEY, () => askJson(ask()));
  assert.deepEqual(out.answer, { ok: false });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.output_config, undefined);
  assert.equal(calls[1].body.system, "Answer.\nAnswer with only a JSON object.");
  api(status(529, "Overloaded"), status(529, "Overloaded"));
  await assert.rejects(
    withEnv(KEY, () => askJson(ask())),
    (e) => e instanceof ModelUnavailable && e.reply.outcome === "unreachable",
  );
});

test("a refusal, an answer cut at its cap, or no JSON at all is no answer", async () => {
  api(said('{"ok":true}', { stop_reason: "refusal" }));
  assert.equal((await withEnv(KEY, () => askJson(ask()))).answer, null);
  api(said('{"ok":tr', { stop_reason: "max_tokens" }));
  assert.equal((await withEnv(KEY, () => askJson(ask()))).answer, null);
  assert.equal(firstJson("nothing here"), null);
  assert.equal(firstJson("{broken"), null);
});

test("the note sweep and the reach-out check ask through it, each under its own route", async () => {
  const calls = api(said('{"worth":false}'), said('{"opening":"x"}'));
  await withEnv(KEY, () => askNoteModel("system", "user", { tenantId: null }));
  const signal = new AbortController().signal;
  await withEnv(KEY, () => askReachOutModel("system", "user", SCHEMA, 400, signal, { tenantId: null }));
  assert.deepEqual(
    calls.map((c) => [c.model, c.body.max_tokens]),
    [
      [MODEL_ROUTES.note_suggest.model, 300],
      [MODEL_ROUTES.reach_out_check.model, 400],
    ],
  );
});
