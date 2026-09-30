/**
 * The one way a call leaves for a provider (channels provider-fetch), executed against a fetch and a clock of the
 * test's own: every call bounded, nothing thrown, four outcomes a caller acts on, a retry only when asking again cannot
 * do the work twice, and a breaker per provider that stops a dead provider costing each caller its whole timeout.
 */
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { breakerOf, breakerStates, providerFetch, resetBreakers } from "@chanlytics/channels";
import { fieldsOf, logLineOf } from "../_log-lines.mjs";

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
    // No jitter unless a case asks for it: a wait reads as the doubling's own.
    random: () => 0,
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
    // A gateway's 503 proves nothing about the service behind it: the send may have gone.
    503: "unknown",
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
  const send = provider(new Error("socket hang up"), 200);
  const s = await providerFetch("meta", "u", { method: "POST", timeoutMs: 1, tries: 3 }, { ...send, ...clock() });
  assert.deepEqual([s.outcome, send.calls.length], ["unknown", 1]);
  const read = provider(new Error("socket hang up"), 200);
  const r = await providerFetch("meta", "u", { timeoutMs: 1, tries: 3, idempotent: true }, { ...read, ...clock() });
  assert.deepEqual([r.outcome, read.calls.length], ["ok", 2]);

  // A try that used its whole bound is not tried again, not even a read: the time left is the caller's.
  const hung = provider(timeout(), 200);
  const h = await providerFetch("meta", "u", { timeoutMs: 1, tries: 3, idempotent: true }, { ...hung, ...clock() });
  assert.deepEqual([h.outcome, h.error, hung.calls.length], ["unknown", "timeout", 1]);

  // A refusal is the provider's answer: never asked again.
  const no = provider(422, 200);
  assert.equal(
    (await providerFetch("meta", "u", { timeoutMs: 1, tries: 3 }, { ...no, ...clock() })).outcome,
    "refused",
  );
  assert.equal(no.calls.length, 1);

  // Waits double when the provider names none.
  const c2 = clock();
  const down = provider(429, 429, 200);
  await providerFetch("google", "u", { timeoutMs: 1, tries: 3 }, { ...down, ...c2 });
  assert.deepEqual(c2.waits, [250, 500]);

  // Drawn up to a fifth longer at random, so the callers one outage failed do not all ask again at the same instant.
  const c3 = clock();
  await providerFetch(
    "google",
    "u",
    { timeoutMs: 1, tries: 3 },
    { ...provider(429, 429, 200), ...c3, random: () => 1 },
  );
  assert.deepEqual(c3.waits, [300, 600]);
});

test("a wait longer than a call may take, or past its deadline, hands the answer back for the caller to ask later", async () => {
  const long = provider(new Response("", { status: 429, headers: { "retry-after": "30" } }), 200);
  const a = await providerFetch("resend", "u", { timeoutMs: 1, tries: 3 }, { ...long, ...clock() });
  assert.deepEqual([a.outcome, a.retryAfterMs, long.calls.length], ["retryable", 30_000, 1]);

  const c = clock();
  const slow = provider(429, 200);
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

test("a call that puts words in front of a person is never held by the breaker: it is always made, and only counted", async () => {
  const c = clock();
  const dead = provider(500);
  for (let i = 0; i < 5; i++) await providerFetch("meta", "u", { timeoutMs: 1 }, { ...dead, ...c });
  assert.equal(breakerOf("meta", c.now()).open, true);

  // A read is held; a reply is sent all the same, and its answer is the provider's own.
  const read = await providerFetch("meta", "u", { timeoutMs: 1 }, { ...dead, ...c });
  assert.equal(read.error, "breaker_open");
  const back = provider(200);
  const reply = await providerFetch("meta", "u", { method: "POST", timeoutMs: 1, breaker: "count" }, { ...back, ...c });
  assert.deepEqual([reply.outcome, back.calls.length], ["ok", 1], "the reply went");
  assert.deepEqual(breakerOf("meta", c.now()), { open: false, failures: 0 }, "and its answer closed the breaker");

  // Its faults count as any call's do: five failed sends open the breaker for the reads.
  const failing = provider(502);
  for (let i = 0; i < 5; i++)
    await providerFetch("meta", "u", { method: "POST", timeoutMs: 1, breaker: "count" }, { ...failing, ...c });
  assert.equal(failing.calls.length, 5, "every send was made");
  assert.equal(breakerOf("meta", c.now()).open, true);
});

test("a breaker opens and closes in the log, once each, naming the provider; the states count each opening", async () => {
  const c = clock();
  const dead = provider(503);
  const lines = [];
  const real = { info: console.log, warn: console.warn };
  console.log = (...a) => lines.push(logLineOf(a));
  console.warn = (...a) => lines.push(logLineOf(a));
  try {
    for (let i = 0; i < 5; i++) await providerFetch("retell", "u", { timeoutMs: 1 }, { ...dead, ...c });
    // A sixth fault while it is open is not a second opening, and a held call is not a fault.
    await providerFetch("retell", "u", { timeoutMs: 1 }, { ...dead, ...c });
    assert.deepEqual(
      lines.map((l) => [l.level, l.event, fieldsOf(l)]),
      [["warn", "breaker_open", { provider: "retell", failures: 5, status: 503, error: null, open_ms: 30_000 }]],
      "the opening is one warning: the outage that was silent",
    );
    assert.deepEqual(
      breakerStates(c.now()).find((b) => b.provider === "retell"),
      { provider: "retell", open: true, failures: 5, opened: 1, open_until: new Date(c.now() + 30_000).toISOString() },
    );
    // The pause ends, one call goes and is answered: closed, said once.
    c.pass(30_000);
    lines.length = 0;
    await providerFetch("retell", "u", { timeoutMs: 1 }, { ...provider(200), ...c });
    await providerFetch("retell", "u", { timeoutMs: 1 }, { ...provider(200), ...c });
    assert.deepEqual(
      lines.map((l) => [l.level, l.event, fieldsOf(l)]),
      [["info", "breaker_closed", { provider: "retell", failures: 5 }]],
      "closing is said once, when the first answer comes, and not for every answer after",
    );
  } finally {
    console.log = real.info;
    console.warn = real.warn;
  }
  const after = breakerStates(c.now());
  assert.deepEqual(
    after.find((b) => b.provider === "retell"),
    { provider: "retell", open: false, failures: 0, opened: 1, open_until: null },
    "closed, and the count of the outage kept",
  );
  assert.ok(
    after.filter((b) => b.provider !== "retell").every((b) => !b.open && b.failures === 0 && b.opened === 0),
    "every other provider untouched",
  );
});
