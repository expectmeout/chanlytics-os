/**
 * The model port (packages/channels/src/anthropic.ts), over a scripted API: the registry's route decides the model, its
 * fallback, its bound and its retries; an answer that never came (a 529, a 5xx, a timeout) is asked once of the
 * fallback; a "not now" is asked again on the same model; a 429 or a 5xx after that is unreachable, never a refusal; a
 * refused request is rejected; and the answer says which model answered and what it cost, in the four kinds of tokens.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { askModel, streamModel, formatRejected, resetBreakers } from "@chanlytics/channels";
import { MODEL_ROUTES } from "@chanlytics/contracts";
import { scripted, said, status, hang, thrown, streamed } from "../_model-world.mjs";

const KEY = "model-key-for-this-file";
const noWait = { sleep: async () => {} };
const ask = (over = {}) => ({
  purpose: "receptionist",
  body: { system: "Answer.", messages: [{ role: "user", content: "Are you open?" }] },
  ...over,
});

beforeEach(() => resetBreakers());

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
