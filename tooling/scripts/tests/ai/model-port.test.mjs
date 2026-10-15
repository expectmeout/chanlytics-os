/**
 * The model port (packages/channels/src/models/anthropic.ts), over a scripted API: the registry's route decides the model, its
 * fallback, its bound and its retries; an answer that never came (a 529, a 5xx, a timeout) is asked once of the
 * fallback; a "not now" is asked again on the same model; a 429 or a 5xx after that is unreachable, never a refusal; a
 * refused request is rejected; and the answer says which model answered and what it cost, in the four kinds of tokens.
 * Fast mode (15 Oct 2026): asked of a model that runs it with its beta, never of one that does not; refused by its own
 * limit or capacity, asked again at standard speed and the model held there a while.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { askModel, streamModel, formatRejected, resetBreakers, resetFastHolds } from "@chanlytics/channels";
import { EFFORT_MESSAGE_BETA, FAST_MODE_BETA, MODELS, MODEL_ROUTES } from "@chanlytics/contracts";
import { scripted, said, status, hang, thrown, streamed } from "./_model-world.mjs";

const KEY = "model-key-for-this-file";
const noWait = { sleep: async () => {} };
const ask = (over = {}) => ({
  purpose: "receptionist",
  body: { system: "Answer.", messages: [{ role: "user", content: "Are you open?" }] },
  ...over,
});

beforeEach(() => {
  resetBreakers();
  resetFastHolds();
});

test("the route's model is asked, with its max tokens, the key and the version, and the answer says what it cost", async () => {
  const api = scripted(said("We open at nine."));
  const r = await askModel(KEY, ask(), { fetch: api.fetch, ...noWait });
  assert.equal(r.outcome, "ok");
  assert.equal(r.text, "We open at nine.");
  assert.equal(r.model, MODEL_ROUTES.receptionist.model);
  assert.equal(r.fellBack, false);
  assert.deepEqual(r.usage, { input: 120, output: 30, cacheRead: 900, cacheWrite: 40 });
  assert.equal(api.calls.length, 1);
  assert.equal(api.calls[0].url, "https://api.anthropic.com/v1/messages");
  assert.equal(api.calls[0].model, MODEL_ROUTES.receptionist.model);
  assert.equal(api.calls[0].body.max_tokens, MODEL_ROUTES.receptionist.maxTokens);
  assert.equal(api.calls[0].headers["x-api-key"], KEY);
  assert.equal(api.calls[0].headers["anthropic-version"], "2023-06-01");
  assert.equal(api.calls[0].headers["anthropic-beta"], undefined);
});

test("a 529 is asked once of the route's fallback model, and the answer names the model that answered", async () => {
  const api = scripted(status(529, "Overloaded"), said("We open at nine."));
  const r = await askModel(KEY, ask(), { fetch: api.fetch, ...noWait });
  assert.equal(r.outcome, "ok");
  assert.equal(r.fellBack, true);
  assert.equal(r.asked, MODEL_ROUTES.receptionist.model);
  assert.equal(r.model, MODEL_ROUTES.receptionist.fallback);
  assert.deepEqual(
    api.calls.map((c) => c.model),
    [MODEL_ROUTES.receptionist.model, MODEL_ROUTES.receptionist.fallback],
  );
});

test("a 5xx on both is unreachable, never a refusal; a timeout is asked of the fallback too", async () => {
  const api = scripted(status(500, "boom"), status(503, "down"));
  const r = await askModel(KEY, ask(), { fetch: api.fetch, ...noWait });
  assert.equal(r.outcome, "unreachable");
  assert.equal(r.status, 503);
  assert.equal(api.calls.length, 2);

  const slow = scripted(hang(), said("Here."));
  const t = await askModel(KEY, ask({ timeoutMs: 30 }), { fetch: slow.fetch, ...noWait });
  assert.equal(t.outcome, "ok");
  assert.equal(t.fellBack, true);
});

test("a 429 is asked again on the same model up to the route's retries, then is unreachable: the model was not heard", async () => {
  const api = scripted(status(429, "rate limited"));
  const r = await askModel(KEY, ask(), { fetch: api.fetch, ...noWait });
  assert.equal(r.outcome, "unreachable");
  assert.equal(r.status, 429);
  // One try and the route's one retry, both on the route's model: a "not now" is no reason to change models.
  assert.equal(api.calls.length, 1 + MODEL_ROUTES.receptionist.retries);
  assert.ok(api.calls.every((c) => c.model === MODEL_ROUTES.receptionist.model));
});

test("a connection that never opened is retried; a refused request is rejected and never asked again anywhere", async () => {
  const api = scripted(thrown("ECONNREFUSED"), said("Here."));
  const r = await askModel(KEY, ask(), { fetch: api.fetch, ...noWait });
  assert.equal(r.outcome, "ok");
  assert.equal(r.fellBack, false);

  const bad = scripted(status(400, "output_config.format: unsupported schema"));
  const b = await askModel(KEY, ask(), { fetch: bad.fetch, ...noWait });
  assert.equal(b.outcome, "rejected");
  assert.equal(bad.calls.length, 1);
  assert.equal(b.error, "output_config.format: unsupported schema");
  assert.ok(formatRejected(b), "a refused format is the caller's to ask again as plain JSON");
  assert.ok(!formatRejected({ outcome: "unreachable", status: 529, error: "Overloaded" }));
});

test("a model the API does not know (a 404: a variable's misspelt name, a retired id) is asked once of the route's fallback, as an answer that never came is, in both forms; unknown on both is the API's refusal", async () => {
  const named = "claude-some-model-9";
  const api = scripted(status(404, `model: ${named}`), said("Here."));
  const r = await askModel(KEY, ask({ purpose: "ask", model: named }), { fetch: api.fetch, ...noWait });
  assert.deepEqual([r.outcome, r.fellBack, r.asked, r.model], ["ok", true, named, MODEL_ROUTES.ask.model]);
  assert.deepEqual(
    api.calls.map((c) => c.model),
    [named, MODEL_ROUTES.ask.model],
    "a name that is neither of the route's falls to the route's own model",
  );
  const flow = scripted(status(404, `model: ${named}`), streamed("Here."));
  const s = await streamModel(KEY, ask({ purpose: "ask", model: named }), { fetch: flow.fetch, ...noWait });
  assert.deepEqual([s.outcome, s.fellBack, s.model], ["ok", true, MODEL_ROUTES.ask.model]);
  const both = scripted(status(404, "model: not found"));
  const b = await askModel(KEY, ask({ purpose: "ask", model: named }), { fetch: both.fetch, ...noWait });
  assert.deepEqual([b.outcome, b.status, both.calls.length], ["rejected", 404, 2]);
});

test("a purpose with no fallback waits instead (the lead judge), and a named model asks that model first", async () => {
  const api = scripted(status(529, "Overloaded"));
  const r = await askModel(KEY, ask({ purpose: "lead_judge" }), { fetch: api.fetch, ...noWait });
  assert.equal(r.outcome, "unreachable");
  assert.equal(api.calls.length, 1);

  // Ask's pair swaps: a deployment on the fallback falls back to the route's model.
  const swap = scripted(status(529), said("Here."));
  const s = await askModel(KEY, ask({ purpose: "ask", model: MODEL_ROUTES.ask.fallback }), {
    fetch: swap.fetch,
    ...noWait,
  });
  assert.equal(s.outcome, "ok");
  assert.deepEqual(
    swap.calls.map((c) => c.model),
    [MODEL_ROUTES.ask.fallback, MODEL_ROUTES.ask.model],
  );
});

test("the fallback is asked only while the deadline leaves room, and betas ride as the header", async () => {
  let clock = 0;
  const api = scripted(status(529), said("late"));
  const r = await askModel(KEY, ask({ deadlineMs: 1_000, betas: ["server-side-fallback-2026-07-01"] }), {
    fetch: async (url, init) => {
      const res = await api.fetch(url, init);
      clock += 900; // the first try took 900 of the 1,000 ms
      return res;
    },
    now: () => clock,
    ...noWait,
  });
  assert.equal(r.outcome, "unreachable");
  assert.equal(api.calls.length, 1, "100 ms left is under the floor a fallback is worth");
  assert.equal(api.calls[0].headers["anthropic-beta"], "server-side-fallback-2026-07-01");
});

test("the streamed form hands the event stream back unread, after a fallback taken before the first byte", async () => {
  const api = scripted(status(529), streamed("Hello"));
  const r = await streamModel(KEY, ask({ purpose: "ask" }), { fetch: api.fetch, ...noWait });
  assert.equal(r.outcome, "ok");
  assert.equal(r.fellBack, true);
  assert.equal(api.calls[0].body.stream, true);
  const text = await new Response(r.body).text();
  assert.match(text, /"text":"Hello"/);

  const down = scripted(status(503), status(503));
  const d = await streamModel(KEY, ask({ purpose: "ask" }), { fetch: down.fetch, ...noWait });
  assert.equal(d.outcome, "unreachable");
});

/* ------------------------------------------------ fast mode ------------------------------------------------ */

/** Ask's round in fast mode, as the gateway hands it to the port. */
const fastAsk = (over = {}) =>
  ask({
    purpose: "ask",
    body: { system: "Answer.", messages: [{ role: "user", content: "Who needs me?" }], speed: "fast" },
    ...over,
  });

test("fast mode is asked of a model that runs it with its beta beside any other, and the answer says it went fast; a model without it is asked at standard speed, no beta", async () => {
  const api = scripted(said("Two people.", { usage: { input_tokens: 10, output_tokens: 5, speed: "fast" } }));
  const r = await askModel(KEY, fastAsk({ betas: ["server-side-fallback-2026-07-01"] }), {
    fetch: api.fetch,
    ...noWait,
  });
  assert.equal(r.outcome, "ok");
  assert.deepEqual([r.speed, r.slowed], ["fast", false]);
  assert.equal(api.calls[0].model, MODELS.OPUS_5_5);
  assert.equal(api.calls[0].body.speed, "fast", "a top-level field of the body");
  assert.equal(api.calls[0].headers["anthropic-beta"], `server-side-fallback-2026-07-01,${FAST_MODE_BETA}`);
  assert.equal(r.usage.speed, "fast", "the API's own word, which the ledger prices by");

  const sonnet = scripted(said("Two people."));
  const s = await askModel(KEY, fastAsk({ model: MODELS.SONNET_5_5, betas: [FAST_MODE_BETA] }), {
    fetch: sonnet.fetch,
    ...noWait,
  });
  assert.equal(s.speed, "standard");
  assert.equal(sonnet.calls[0].body.speed, undefined, "Sonnet 5.5 has no fast mode: the API would refuse it");
  assert.equal(sonnet.calls[0].headers["anthropic-beta"], undefined, "nor its beta");
  assert.equal(s.usage.speed, undefined, "a standard call carries no speed");
});

test("fast mode's own limit (a 429) is no failure: the same model is asked again at standard speed, once, and held there for the next calls; its capacity (a 529) the same, before any fallback", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-15T15:00:00Z") });
  const limit = "This request would exceed your rate limit of 0 fast mode input tokens per minute";
  const api = scripted(status(429, limit), streamed("Two people."));
  const r = await streamModel(KEY, fastAsk(), { fetch: api.fetch, ...noWait });
  assert.equal(r.outcome, "ok");
  assert.deepEqual([r.model, r.fellBack, r.speed, r.slowed], [MODELS.OPUS_5_5, false, "standard", true]);
  assert.deepEqual(
    api.calls.map((c) => [c.model, c.body.speed ?? "standard", c.headers["anthropic-beta"] ?? null]),
    [
      [MODELS.OPUS_5_5, "fast", FAST_MODE_BETA],
      [MODELS.OPUS_5_5, "standard", null],
    ],
    "the same model, without speed or beta: never the fallback for a limit only fast mode has",
  );

  // Held: the next round goes at standard from the start, and pays no refusal.
  const next = scripted(said("Here."));
  const n = await askModel(KEY, fastAsk(), { fetch: next.fetch, ...noWait });
  assert.deepEqual([n.speed, n.slowed], ["standard", false]);
  assert.equal(next.calls.length, 1);
  assert.equal(next.calls[0].body.speed, undefined);

  // Five minutes on, fast is asked again: access granted later starts by itself.
  t.mock.timers.tick(5 * 60_000 + 1);
  const later = scripted(said("Here."));
  const l = await askModel(KEY, fastAsk(), { fetch: later.fetch, ...noWait });
  assert.equal(later.calls[0].body.speed, "fast");
  assert.equal(l.speed, "fast");

  // A 529 at fast is fast mode's capacity: standard on the same model first, the fallback only after that.
  resetFastHolds();
  const busy = scripted(status(529, "Overloaded"), status(529, "Overloaded"), said("From the fallback."));
  const b = await askModel(KEY, fastAsk(), { fetch: busy.fetch, ...noWait });
  assert.equal(b.outcome, "ok");
  assert.deepEqual(
    busy.calls.map((c) => [c.model, c.body.speed ?? "standard"]),
    [
      [MODELS.OPUS_5_5, "fast"],
      [MODELS.OPUS_5_5, "standard"],
      [MODEL_ROUTES.ask.fallback, "standard"],
    ],
    "and the fallback (Sonnet 5, no fast mode) is sent no speed",
  );
  assert.deepEqual([b.fellBack, b.slowed, b.speed], [true, true, "standard"]);
});

test("a fallback is sent only what it takes: Opus 5.5's fast request falls back to Sonnet 5 at standard speed, and a thinking type the fallback refuses is left off", async () => {
  const api = scripted(status(503, "down"), said("Here."));
  const r = await askModel(
    KEY,
    fastAsk({ body: { messages: [{ role: "user", content: "hi" }], speed: "fast", thinking: { type: "adaptive" } } }),
    { fetch: api.fetch, ...noWait },
  );
  assert.equal(r.outcome, "ok");
  assert.equal(api.calls[0].body.speed, "fast");
  assert.deepEqual(api.calls[1].body.thinking, { type: "adaptive" }, "Sonnet 5 takes adaptive");
  assert.equal(api.calls[1].model, MODEL_ROUTES.ask.fallback);
  assert.equal(api.calls[1].body.speed, undefined);
  assert.equal(api.calls[1].headers["anthropic-beta"], undefined);

  // Sonnet 5.5's between_tools, falling back to the route's own model: Opus 5.5 would refuse it, so it thinks as it does.
  const lowest = scripted(status(529), said("Here."));
  const l = await askModel(
    KEY,
    ask({
      purpose: "ask",
      model: MODELS.SONNET_5_5,
      body: { messages: [{ role: "user", content: "hi" }], thinking: { type: "between_tools" } },
    }),
    { fetch: lowest.fetch, ...noWait },
  );
  assert.equal(l.outcome, "ok");
  assert.deepEqual(lowest.calls[0].body.thinking, { type: "between_tools" }, "Sonnet 5.5's own lowest");
  assert.equal(lowest.calls[1].model, MODELS.OPUS_5_5);
  assert.equal(lowest.calls[1].body.thinking, undefined);

  // A model the registry does not list is sent what it was asked.
  const unlisted = scripted(said("Here."));
  await askModel(KEY, fastAsk({ model: "claude-some-model-9" }), { fetch: unlisted.fetch, ...noWait });
  assert.equal(unlisted.calls[0].body.speed, "fast");
});

test("an effort said in the messages goes, with its beta, to a model that takes one; its fallback that takes none (Sonnet 5) is asked at the effort they ended on, the messages without them", async () => {
  const q = { role: "user", content: [{ type: "text", text: "set up my campaigns" }] };
  const raised = { role: "system", content: [], output_config: { effort: "high" } };
  const body = { messages: [q, raised], output_config: { effort: "low", format: { type: "json_schema", schema: {} } } };
  const api = scripted(status(529, "Overloaded"), said("Here."));
  const r = await askModel(KEY, ask({ purpose: "ask", body, betas: [EFFORT_MESSAGE_BETA] }), {
    fetch: api.fetch,
    ...noWait,
  });
  assert.equal(r.outcome, "ok");
  assert.equal(api.calls[0].model, MODELS.OPUS_5_5);
  assert.deepEqual(api.calls[0].body.messages, [q, raised], "Opus 5.5 is sent the message where it stands");
  assert.equal(api.calls[0].body.output_config.effort, "low", "and the request's own effort, as the cache keys it");
  assert.equal(api.calls[0].headers["anthropic-beta"], EFFORT_MESSAGE_BETA);
  assert.equal(api.calls[1].model, MODEL_ROUTES.ask.fallback);
  assert.deepEqual(api.calls[1].body.messages, [q], "Sonnet 5 refuses an effort message: left out");
  assert.deepEqual(
    api.calls[1].body.output_config,
    { effort: "high", format: { type: "json_schema", schema: {} } },
    "asked as hard, as its own effort",
  );
  assert.equal(api.calls[1].headers["anthropic-beta"], undefined, "and without the beta");

  // The beta is the port's to add, named or not, beside fast mode's.
  const unnamed = scripted(said("Here."));
  await askModel(KEY, ask({ purpose: "ask", body: { ...body, speed: "fast" } }), { fetch: unnamed.fetch, ...noWait });
  assert.equal(unnamed.calls[0].headers["anthropic-beta"], `${EFFORT_MESSAGE_BETA},${FAST_MODE_BETA}`);
  // And a request that says none is sent no beta for it.
  const none = scripted(said("Here."));
  await askModel(KEY, ask({ purpose: "ask", betas: [EFFORT_MESSAGE_BETA] }), { fetch: none.fetch, ...noWait });
  assert.equal(none.calls[0].headers["anthropic-beta"], undefined);
});
