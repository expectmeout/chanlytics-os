/**
 * The one way a call leaves for a provider (channels provider-fetch), executed against a fetch and a clock of the
 * test's own: every call bounded, nothing thrown, four outcomes a caller acts on, a retry only when asking again cannot
 * do the work twice, and a breaker per provider that stops a dead provider costing each caller its whole timeout.
 */
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { breakerOf, providerFetch, resetBreakers } from "@chanlytics/channels";

beforeEach(() => resetBreakers());

/** A provider that answers each call from `answers` in turn (a Response, an Error to throw, or a status). */
function provider(...answers) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const a = answers.length > 1 ? answers.shift() : answers[0];
    if (a instanceof Error) throw a;
    if (typeof a === "number") return new Response(JSON.stringify({ status: a }), { status: a });
    return a;
  };
  return { calls, fetch };
}
const timeout = () => Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
const refusedConnection = () =>
  Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED", message: "connect ECONNREFUSED" } });
const clock = (start = 1_000_000) => {
  let now = start;
  const waits = [];
  return {
    now: () => now,
    sleep: async (ms) => {
      waits.push(ms);
      now += ms;
    },
    pass: (ms) => (now += ms),
    waits,
  };
};

test("an answer is read once and said as one of four outcomes; every call carries a bound", async () => {
  const p = provider(new Response(JSON.stringify({ id: "x1" }), { status: 201, headers: { "retry-after": "3" } }));
  const a = await providerFetch("meta", "https://graph.example.com/x", { method: "POST", timeoutMs: 5_000 }, p);
  assert.deepEqual(
    [a.outcome, a.status, a.json, a.text, a.error, a.tries, a.retryAfterMs],
    ["ok", 201, { id: "x1" }, '{"id":"x1"}', null, 1, 3_000],
  );
  assert.ok(p.calls[0].init.signal instanceof AbortSignal, "a signal rides every call");
  assert.equal(p.calls[0].init.method, "POST");

  const outcomes = {};
  for (const status of [400, 401, 404, 408, 409, 422, 429, 500, 502, 503, 504]) {
    resetBreakers();
    outcomes[status] = (await providerFetch("meta", "u", { timeoutMs: 1 }, provider(status))).outcome;
  }
  assert.deepEqual(outcomes, {
    400: "refused",
    401: "refused",
    404: "refused",
    408: "retryable",
    409: "refused",
    422: "refused",
    429: "retryable",
    500: "unknown",
    502: "unknown",
    503: "retryable",
    504: "unknown",
  });
  const text = await providerFetch(
    "meta",
    "u",
    { timeoutMs: 1 },
    provider(new Response("plain words", { status: 200 })),
  );
  assert.deepEqual([text.json, text.text], [null, "plain words"], "a body that is not JSON is kept as its words");
});

test("no answer is never thrown: a timeout may have been taken, a connection that never opened was not", async () => {
  const t = await providerFetch("twilio", "u", { timeoutMs: 1 }, provider(timeout()));
  assert.deepEqual([t.outcome, t.status, t.error], ["unknown", 0, "timeout"]);
  const never = await providerFetch("twilio", "u", { timeoutMs: 1 }, provider(refusedConnection()));
  assert.deepEqual([never.outcome, never.status], ["retryable", 0]);
  assert.match(never.error, /ECONNREFUSED/);
  const reset = await providerFetch("twilio", "u", { timeoutMs: 1 }, provider(new Error("socket hang up")));
  assert.deepEqual([reset.outcome, reset.error], ["unknown", "socket hang up"], "a dropped connection may have left");
});

test("retry by outcome: a call is asked again only when asking again cannot do the work twice", async () => {
  // Not taken: asked again, after the provider's own wait when it names one.
  const c1 = clock();
  const busy = provider(new Response("", { status: 429, headers: { "retry-after": "1" } }), 200);
  const a = await providerFetch("resend", "u", { timeoutMs: 1_000, tries: 3 }, { ...busy, ...c1 });
  assert.deepEqual([a.outcome, a.tries, busy.calls.length, c1.waits], ["ok", 2, 2, [1_000]]);

  // Maybe taken: a send is never asked again blind; a read is.
  const send = provider(timeout(), 200);
  const s = await providerFetch("meta", "u", { method: "POST", timeoutMs: 1, tries: 3 }, { ...send, ...clock() });
  assert.deepEqual([s.outcome, send.calls.length], ["unknown", 1]);
  const read = provider(timeout(), 200);
  const r = await providerFetch("meta", "u", { timeoutMs: 1, tries: 3, idempotent: true }, { ...read, ...clock() });
  assert.deepEqual([r.outcome, read.calls.length], ["ok", 2]);

  // A refusal is the provider's answer: never asked again.
  const no = provider(422, 200);
  assert.equal(
    (await providerFetch("meta", "u", { timeoutMs: 1, tries: 3 }, { ...no, ...clock() })).outcome,
    "refused",
  );
  assert.equal(no.calls.length, 1);

  // Waits double when the provider names none.
  const c2 = clock();
  const down = provider(503, 503, 200);
  await providerFetch("google", "u", { timeoutMs: 1, tries: 3 }, { ...down, ...c2 });
  assert.deepEqual(c2.waits, [250, 500]);
});

test("a wait longer than a call may take, or past its deadline, hands the answer back for the caller to ask later", async () => {
  const long = provider(new Response("", { status: 429, headers: { "retry-after": "30" } }), 200);
  const a = await providerFetch("resend", "u", { timeoutMs: 1, tries: 3 }, { ...long, ...clock() });
  assert.deepEqual([a.outcome, a.retryAfterMs, long.calls.length], ["retryable", 30_000, 1]);

  const c = clock();
  const slow = provider(503, 200);
  const b = await providerFetch("apify", "u", { timeoutMs: 5_000, tries: 3, deadlineMs: 4_000 }, { ...slow, ...c });
  assert.deepEqual([b.outcome, slow.calls.length, c.waits], ["retryable", 1, []], "no room for another try");
});

test("the breaker: five faults in a row hold a provider's calls, answered retryable without asking; the first after the pause is let through; each provider its own", async () => {
  const c = clock();
  const dead = provider(503);
  for (let i = 0; i < 5; i++) await providerFetch("retell", "u", { timeoutMs: 1 }, { ...dead, ...c });
  assert.equal(dead.calls.length, 5);
  assert.deepEqual(breakerOf("retell", c.now()), { open: true, failures: 5 });
  const held = await providerFetch("retell", "u", { timeoutMs: 1, tries: 3 }, { ...dead, ...c });
  assert.deepEqual([held.outcome, held.status, held.error, held.tries], ["retryable", 0, "breaker_open", 0]);
  assert.ok(held.retryAfterMs > 0 && held.retryAfterMs <= 30_000);
  assert.equal(dead.calls.length, 5, "the provider was not asked");
  assert.equal(breakerOf("meta", c.now()).open, false, "another provider is not held");

  // After the pause one call goes; its answer closes the breaker.
  c.pass(30_000);
  const back = provider(200);
  assert.equal((await providerFetch("retell", "u", { timeoutMs: 1 }, { ...back, ...c })).outcome, "ok");
  assert.deepEqual(breakerOf("retell", c.now()), { open: false, failures: 0 });

  // A refusal, a 408 or a 429 is the provider answering: it never opens the breaker.
  const answering = provider(422);
  for (let i = 0; i < 6; i++) await providerFetch("expo", "u", { timeoutMs: 1 }, { ...answering, ...c });
  const limited = provider(429);
  for (let i = 0; i < 6; i++) await providerFetch("expo", "u", { timeoutMs: 1 }, { ...limited, ...c });
  assert.equal(breakerOf("expo", c.now()).open, false);
});
