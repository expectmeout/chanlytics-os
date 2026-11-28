/**
 * The door's rules for each service (channels provider-rules, provider-gates, provider-breakers), executed with the
 * service faked: a "too many" however the service says it, honoured for as long as it asks and for whose limit it is;
 * calls at once lowered by it and raised back by answers; a job's later attempt asking each call once; a breaker's
 * pause ending with one call; one workspace's faults holding only that workspace; and each unit of work saying what it
 * spent where (lane 8 of the "prove it works" plan, 28 Nov 2026).
 */
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { breakerOf, breakerStates, fetchFromProvider, resetBreakers } from "@chanlytics/channels/shared";
import { withRequestId } from "@chanlytics/log";
import { fieldsOf, linesOf } from "../../_log-lines.mjs";
import { until } from "../../shared/_until.mjs";

beforeEach(() => resetBreakers());

const W1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const W2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const W3 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";

/** A service that answers each call from `answers` in turn (a Response, an Error to throw, or a status); the last repeats. */
function service(...answers) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const a = answers.length > 1 ? answers.shift() : answers[0];
    if (a instanceof Error) throw a;
    if (typeof a === "number") return new Response(JSON.stringify({ status: a }), { status: a });
    return typeof a === "function" ? a() : a;
  };
  return { calls, fetch };
}
const graphSaid = (code, headers = {}) =>
  new Response(JSON.stringify({ error: { code, message: "limit" } }), { status: 400, headers });
const googleSaid = (status, reason) =>
  new Response(JSON.stringify({ error: { code: status, errors: [{ reason }] } }), { status });
const timeout = () => Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
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
    random: () => 0,
  };
};
const read = (workspace, extra = {}) => ({ timeoutMs: 1_000, workspace, ...extra });

test("Graph's 'too many' in a 400 is named, with whose limit it spent; its outcome stays the status's, as each adapter reads it", async () => {
  const c = clock();
  const answers = {};
  for (const code of [4, 17, 32, 613, 80004, 80007, 130429, 131048, 131056]) {
    resetBreakers();
    const a = await fetchFromProvider("meta", "u", read(W1), { ...service(graphSaid(code)), ...c });
    answers[code] = [a.outcome, a.tooMany];
  }
  assert.deepEqual(answers, {
    4: ["refused", "platform"],
    17: ["refused", "workspace"],
    32: ["refused", "workspace"],
    613: ["refused", "workspace"],
    80004: ["refused", "workspace"],
    80007: ["refused", "workspace"],
    130429: ["refused", "workspace"],
    131048: ["refused", "workspace"],
    131056: ["refused", "call"],
  });
  const plain = await fetchFromProvider("meta", "u", read(W1), { ...service(graphSaid(100)), ...c });
  assert.deepEqual([plain.outcome, plain.tooMany], ["refused", null], "any other code is Meta's no");
});

test("a workspace's 'too many' holds that workspace's calls for the wait the service asked, and nobody else's", async () => {
  const c = clock();
  const usage = { "x-business-use-case-usage": JSON.stringify({ 123: [{ estimated_time_to_regain_access: 2 }] }) };
  const limited = service(graphSaid(80007, usage), 200);
  const first = await fetchFromProvider("meta", "u", read(W1), { ...limited, ...c });
  assert.deepEqual([first.tooMany, first.retryAfterMs], ["workspace", 2 * 60_000], "Graph's own minutes, read");

  const again = await fetchFromProvider("meta", "u", read(W1, { tries: 3 }), { ...limited, ...c });
  assert.deepEqual([again.outcome, again.error, again.tries], ["retryable", "too_many", 0], "held, not asked");
  assert.ok(again.retryAfterMs > 0 && again.retryAfterMs <= 2 * 60_000);
  assert.equal(limited.calls.length, 1, "the service was not asked again inside its wait");

  const other = service(200);
  assert.equal((await fetchFromProvider("meta", "u", read(W2), { ...other, ...c })).outcome, "ok");
  assert.equal(other.calls.length, 1, "another workspace's call went");

  c.pass(2 * 60_000);
  assert.equal((await fetchFromProvider("meta", "u", read(W1), { ...limited, ...c })).outcome, "ok", "and after it");
});

test("the platform's 'too many' (Meta's app, one key's quota) holds everyone's calls; one person written to too often holds nobody", async () => {
  const c = clock();
  const appWait = { "x-business-use-case-usage": JSON.stringify({ 1: [{ estimated_time_to_regain_access: 1 }] }) };
  await fetchFromProvider("meta", "u", read(W1), { ...service(graphSaid(4, appWait)), ...c });
  const someoneElse = service(200);
  const held = await fetchFromProvider("meta", "u", read(W2), { ...someoneElse, ...c });
  assert.deepEqual([held.error, held.retryAfterMs, someoneElse.calls.length], ["too_many", 60_000, 0]);
  // A send to a person waits too: the service would refuse it the same way.
  const send = await fetchFromProvider("meta", "u", read(W2, { method: "POST", breaker: "count" }), {
    ...someoneElse,
    ...c,
  });
  assert.equal(send.error, "too_many");

  resetBreakers();
  const pair = await fetchFromProvider("meta", "u", read(W1), { ...service(graphSaid(131056)), ...c });
  assert.deepEqual([pair.tooMany, pair.retryAfterMs], ["call", null]);
  const next = service(200);
  assert.equal((await fetchFromProvider("meta", "u", read(W1), { ...next, ...c })).outcome, "ok", "nobody held");

  resetBreakers();
  const tenSeconds = new Response("", { status: 429, headers: { "retry-after": "10" } });
  await fetchFromProvider("resend", "u", { timeoutMs: 1_000 }, { ...service(tenSeconds), ...c });
  const mail = service(200);
  assert.equal((await fetchFromProvider("resend", "u", read(W2), { ...mail, ...c })).error, "too_many");
  assert.equal(mail.calls.length, 0, "Resend's limit is the platform's team: every workspace waits");
});

test("Google's 'too many' in a 403 is read by its reason: a user's rate is the workspace's, the project's is everyone's", async () => {
  const c = clock();
  const wait = (r) => {
    r.headers.set("retry-after", "30");
    return r;
  };
  const user = await fetchFromProvider("google", "u", read(W1), {
    ...service(wait(googleSaid(403, "userRateLimitExceeded"))),
    ...c,
  });
  assert.deepEqual([user.status, user.tooMany], [403, "workspace"]);
  assert.equal((await fetchFromProvider("google", "u", read(W2), { ...service(200), ...c })).outcome, "ok");
  assert.equal((await fetchFromProvider("google", "u", read(W1), { ...service(200), ...c })).error, "too_many");

  resetBreakers();
  const project = await fetchFromProvider("google", "u", read(W1), {
    ...service(wait(googleSaid(403, "rateLimitExceeded"))),
    ...c,
  });
  assert.equal(project.tooMany, "platform");
  assert.equal((await fetchFromProvider("google", "u", read(W2), { ...service(200), ...c })).error, "too_many");

  // Google names no wait as a rule: then nothing is held, and the caller's backoff chooses.
  resetBreakers();
  const unsaid = await fetchFromProvider("google", "u", read(W1), {
    ...service(googleSaid(403, "userRateLimitExceeded")),
    ...c,
  });
  assert.deepEqual([unsaid.tooMany, unsaid.retryAfterMs], ["workspace", null]);
  assert.equal((await fetchFromProvider("google", "u", read(W1), { ...service(200), ...c })).outcome, "ok");

  resetBreakers();
  const denied = await fetchFromProvider("google", "u", read(W1), { ...service(googleSaid(403, "forbidden")), ...c });
  assert.deepEqual([denied.outcome, denied.tooMany], ["refused", null], "a 403 for anything else is Google's no");
});

test("a hold that ends within the time a call may wait is waited out, and the call is made", async () => {
  const c = clock();
  const busy = service(new Response("", { status: 429, headers: { "retry-after": "1" } }), 200);
  const first = await fetchFromProvider("resend", "u", { timeoutMs: 1_000 }, { ...busy, ...c });
  assert.equal(first.outcome, "retryable");
  const next = await fetchFromProvider("resend", "u", { timeoutMs: 1_000 }, { ...busy, ...c });
  assert.deepEqual([next.outcome, busy.calls.length, c.waits], ["ok", 2, [1_000]], "it waited the service's second");
});

test("our own apps' 429 is their answer, never a pace: the next call is made", async () => {
  const c = clock();
  const budget = service(new Response(JSON.stringify({ ok: false, error: "ask_budget" }), { status: 429 }), 200);
  const spent = await fetchFromProvider("edge", "u", read(W1, { breaker: "count" }), { ...budget, ...c });
  assert.deepEqual([spent.status, spent.tooMany], [429, null]);
  assert.equal(
    (await fetchFromProvider("edge", "u", read(W1, { breaker: "count" }), { ...budget, ...c })).outcome,
    "ok",
  );
});

/** A service whose answers the case gives by hand, one call at a time, and how many calls have reached it. */
function heldOpen() {
  const waiting = [];
  let reached = 0;
  const fetch = (url) =>
    new Promise((resolve) => {
      reached += 1;
      waiting.push({ url, answer: (status) => resolve(new Response("{}", { status })) });
    });
  return { waiting, fetch, reached: () => reached };
}

test("a 'too many' lowers how many calls run at once, and answers raise it back", async () => {
  // Microsoft's Outlook takes four at once per app per mailbox: the gate opens at four.
  const open = heldOpen();
  const calls = Array.from({ length: 5 }, (_, i) =>
    fetchFromProvider("microsoft", `u${i}`, read(W1, { timeoutMs: 5_000 }), { fetch: open.fetch }),
  );
  await until(() => open.reached() === 4, "four calls out at once");
  assert.equal(open.waiting.length, 4, "four at once; the fifth waits for room");
  open.waiting.shift().answer(200);
  await until(() => open.reached() === 5, "room came: the fifth went");
  for (const w of open.waiting.splice(0)) w.answer(200);
  await Promise.all(calls);

  // A "too many" (with no wait: the hold is short) halves the room to two.
  await fetchFromProvider("microsoft", "u", read(W1), {
    ...service(new Response("", { status: 429, headers: { "retry-after": "0" } })),
  });
  const after = heldOpen();
  const next = Array.from({ length: 3 }, (_, i) =>
    fetchFromProvider("microsoft", `v${i}`, read(W1, { timeoutMs: 5_000 }), { fetch: after.fetch }),
  );
  await until(() => after.reached() === 2, "two calls out after the 'too many'");
  const other = heldOpen();
  const theirs = Array.from({ length: 4 }, (_, i) =>
    fetchFromProvider("microsoft", `x${i}`, read(W2, { timeoutMs: 5_000 }), { fetch: other.fetch }),
  );
  await until(() => other.reached() === 4, "another mailbox's four out: its room is its own");
  assert.equal(after.reached(), 2, "and still two of the first mailbox's, the third waiting for room");
  for (const w of other.waiting.splice(0)) w.answer(200);
  await Promise.all(theirs);
  // Two answers at a room of two raise it to three.
  after.waiting.shift().answer(200);
  await until(() => after.reached() === 3, "the third went in the room the first left");
  after.waiting.shift().answer(200);
  after.waiting.shift().answer(200);
  await Promise.all(next);
  const third = heldOpen();
  const more = Array.from({ length: 4 }, (_, i) =>
    fetchFromProvider("microsoft", `y${i}`, read(W1, { timeoutMs: 5_000 }), { fetch: third.fetch }),
  );
  await until(() => third.reached() === 3, "three calls out");
  assert.equal(third.waiting.length, 3, "raised back by one after a run of answers: the fourth waits");
  third.waiting.shift().answer(200);
  await until(() => third.reached() === 4, "the fourth went in the room the first left");
  for (const w of third.waiting.splice(0)) w.answer(200);
  await Promise.all(more);
});

test("a call that finds no room within the time it may wait is answered 'not now' without leaving", async () => {
  const c = clock();
  const open = heldOpen();
  const running = Array.from({ length: 4 }, (_, i) =>
    fetchFromProvider("microsoft", `u${i}`, read(W1, { timeoutMs: 5_000 }), { fetch: open.fetch }),
  );
  await until(() => open.reached() === 4, "four calls out");
  // The clock's wait passes at once: no room came within it.
  const late = await fetchFromProvider("microsoft", "late", read(W1, { timeoutMs: 5_000 }), { ...open, ...c });
  assert.deepEqual([late.outcome, late.error, late.status], ["retryable", "too_many_at_once", 0]);
  assert.equal(open.reached(), 4, "it never left");
  for (const w of open.waiting.splice(0)) w.answer(200);
  await Promise.all(running);
});

test("tries add up: a job's later attempt asks each call once, so its retries and the call's never multiply", async () => {
  const first = service(503);
  await withRequestId(
    "job-a1",
    () => fetchFromProvider("google", "u", read(W1, { tries: 3, idempotent: true }), { ...first, ...clock() }),
    {
      tenantId: W1,
      purpose: "google_read",
      attempt: 1,
    },
  );
  assert.equal(first.calls.length, 3, "the first attempt takes the call's own tries");
  resetBreakers();
  const later = service(503);
  const a = await withRequestId(
    "job-a2",
    () => fetchFromProvider("google", "u", read(W1, { tries: 3, idempotent: true }), { ...later, ...clock() }),
    { tenantId: W1, purpose: "google_read", attempt: 2 },
  );
  assert.deepEqual([a.outcome, later.calls.length], ["unknown", 1], "a retry of the job asks once");
});

test("a breaker's pause ends with one call: the others wait for its answer, which closes the breaker or opens it again", async () => {
  const c = clock();
  for (let i = 0; i < 5; i++) await fetchFromProvider("retell", "u", { timeoutMs: 1 }, { ...service(503), ...c });
  assert.equal(breakerOf("retell", c.now()).open, true);
  c.pass(30_000);
  assert.equal(breakerOf("retell", c.now()).open, false, "the pause is over by itself");

  const open = heldOpen();
  const probe = fetchFromProvider("retell", "first", { timeoutMs: 5_000 }, { fetch: open.fetch, now: c.now });
  await until(() => open.reached() === 1, "the first call after the pause is out");
  const meanwhile = service(200);
  const second = await fetchFromProvider("retell", "second", { timeoutMs: 1 }, { ...meanwhile, ...c });
  assert.deepEqual([second.error, meanwhile.calls.length], ["breaker_open", 0], "held while the first is out");
  // A reply to a person is never held: it goes beside the first, and is only counted.
  const send = await fetchFromProvider("retell", "send", { timeoutMs: 1, breaker: "count" }, { ...service(503), ...c });
  assert.equal(send.status, 503);
  open.waiting.shift().answer(200);
  assert.equal((await probe).outcome, "ok");
  assert.deepEqual(breakerOf("retell", c.now()), { open: false, failures: 0 }, "its answer closed the breaker");
  assert.equal((await fetchFromProvider("retell", "after", { timeoutMs: 1 }, { ...service(200), ...c })).outcome, "ok");

  // A pause whose one call faults too opens the breaker again at once.
  for (let i = 0; i < 5; i++) await fetchFromProvider("retell", "u", { timeoutMs: 1 }, { ...service(503), ...c });
  c.pass(30_000);
  await fetchFromProvider("retell", "probe", { timeoutMs: 1 }, { ...service(503), ...c });
  const shut = await fetchFromProvider("retell", "u", { timeoutMs: 1 }, { ...service(200), ...c });
  assert.equal(shut.error, "breaker_open", "opened again");
});

test("one workspace's faults hold only that workspace's calls; the provider is held when others fail too", async () => {
  const c = clock();
  const slow = service(timeout());
  for (let i = 0; i < 5; i++) await fetchFromProvider("google", "u", read(W1, { idempotent: true }), { ...slow, ...c });
  const mine = await fetchFromProvider("google", "u", read(W1), { ...service(200), ...c });
  assert.equal(mine.error, "breaker_open", "the workspace's own calls are held");
  const theirs = service(200);
  assert.equal((await fetchFromProvider("google", "u", read(W2), { ...theirs, ...c })).outcome, "ok");
  assert.equal(theirs.calls.length, 1, "another workspace's call is made");
  const google = breakerStates(c.now()).find((b) => b.provider === "google");
  assert.deepEqual([google.open, google.workspaces_held], [false, 1]);

  // Others failing too is the provider's trouble: two faults of others in the row open its breaker for everyone.
  for (let i = 0; i < 5; i++)
    await fetchFromProvider("google", "u", read(W1, { breaker: "count" }), { ...service(503), ...c });
  await fetchFromProvider("google", "u", read(W2), { ...service(503), ...c });
  assert.equal(breakerOf("google", c.now()).open, false, "one other fault is not an outage");
  await fetchFromProvider("google", "u", read(W3), { ...service(503), ...c });
  assert.equal(breakerOf("google", c.now()).open, true);
  const anyone = await fetchFromProvider("google", "u", read(W2), { ...service(200), ...c });
  assert.equal(anyone.error, "breaker_open");
});

test("a workspace's bad sign-in or spent quota opens no breaker, for it or for anyone", async () => {
  const c = clock();
  for (let i = 0; i < 6; i++) await fetchFromProvider("google", "u", read(W1), { ...service(401), ...c });
  for (let i = 0; i < 6; i++) {
    c.pass(10_000);
    await fetchFromProvider("google", "u", read(W1), { ...service(googleSaid(403, "userRateLimitExceeded")), ...c });
  }
  const google = breakerStates(c.now()).find((b) => b.provider === "google");
  assert.deepEqual([google.open, google.failures, google.workspaces_held], [false, 0, 0]);
  c.pass(10_000);
  assert.equal((await fetchFromProvider("google", "u", read(W1), { ...service(200), ...c })).outcome, "ok");
  assert.equal((await fetchFromProvider("google", "u", read(W2), { ...service(200), ...c })).outcome, "ok");
});

test("a call is the workspace's the work being served acts on, when it names none", async () => {
  const c = clock();
  const usage = { "x-business-use-case-usage": JSON.stringify({ 9: [{ estimated_time_to_regain_access: 5 }] }) };
  await withRequestId(
    "rq-w1",
    () => fetchFromProvider("meta", "u", { timeoutMs: 1_000 }, { ...service(graphSaid(80007, usage)), ...c }),
    {
      tenantId: W1,
    },
  );
  const theirs = await withRequestId(
    "rq-w2",
    () => fetchFromProvider("meta", "u", { timeoutMs: 1_000 }, { ...service(200), ...c }),
    { tenantId: W2 },
  );
  assert.equal(theirs.outcome, "ok");
  const mine = await withRequestId(
    "rq-w1b",
    () => fetchFromProvider("meta", "u", { timeoutMs: 1_000 }, { ...service(200), ...c }),
    { tenantId: W1 },
  );
  assert.equal(mine.error, "too_many");
});

test("each unit of work says once, as it ends, what it called out to, whose it was and what for", async () => {
  const c = clock();
  const after =
    (ms, status = 200) =>
    async () => {
      c.pass(ms);
      return new Response("{}", { status });
    };
  const { lines } = await linesOf(() =>
    withRequestId(
      "job-post-1",
      async () => {
        await fetchFromProvider("meta", "u", { timeoutMs: 5_000 }, { ...c, fetch: after(120) });
        await fetchFromProvider("meta", "u", { timeoutMs: 5_000 }, { ...c, fetch: after(80) });
        await fetchFromProvider("cloudflare", "u", { timeoutMs: 5_000 }, { ...c, fetch: after(300) });
        // Our own app is a hop, not a cost: left out.
        await fetchFromProvider("edge", "u", { timeoutMs: 5_000, breaker: "count" }, { ...c, fetch: after(40) });
      },
      { tenantId: W1, purpose: "post_publish", attempt: 1 },
    ),
  );
  assert.deepEqual(
    lines.map((l) => [l.event, l.tenant_id, fieldsOf(l)]),
    [
      [
        "outside_calls",
        W1,
        {
          tenant_id: W1,
          purpose: "post_publish",
          attempt: 1,
          calls: { meta: { n: 2, ms: 200 }, cloudflare: { n: 1, ms: 300 } },
        },
      ],
    ],
  );
  const { lines: none } = await linesOf(() =>
    withRequestId("rq-quiet", async () => {
      await fetchFromProvider("edge", "u", { timeoutMs: 5_000, breaker: "count" }, { ...c, fetch: after(10) });
    }),
  );
  assert.deepEqual(none, [], "work that called nothing outside says nothing");
});

test("a write that got no answer is unknown, never asked again blind, on any attempt", async () => {
  for (const attempt of [1, 3]) {
    const lost = service(timeout(), 200);
    const a = await withRequestId(
      `job-send-${attempt}`,
      () => fetchFromProvider("twilio", "u", { method: "POST", timeoutMs: 1, tries: 3 }, { ...lost, ...clock() }),
      { tenantId: W1, purpose: "send", attempt },
    );
    assert.deepEqual([a.outcome, a.error, lost.calls.length], ["unknown", "timeout", 1]);
    resetBreakers();
  }
});

test("the door's own lines name the service's record of the request, so its support can be asked about that one", async () => {
  const c = clock();
  const slowly = async () => {
    c.pass(3_000);
    return new Response("{}", { status: 200, headers: { "request-id": "req_011CZ0example" } });
  };
  const { lines: slow } = await linesOf(() =>
    fetchFromProvider("anthropic", "u", { timeoutMs: 5_000, breaker: "count" }, { ...c, fetch: slowly }),
  );
  assert.equal(slow.find((l) => l.event === "outside_call_slow")?.provider_request, "req_011CZ0example");

  const down = () =>
    new Response(JSON.stringify({ error: { code: 2, message: "down", fbtrace_id: "AbCdEf123" } }), { status: 500 });
  const { lines: opened } = await linesOf(async () => {
    for (let i = 0; i < 5; i++) await fetchFromProvider("meta", "u", { timeoutMs: 1_000 }, { ...service(down), ...c });
  });
  assert.equal(opened.find((l) => l.event === "breaker_open")?.provider_request, "AbCdEf123", "Meta's trace, read");
});
