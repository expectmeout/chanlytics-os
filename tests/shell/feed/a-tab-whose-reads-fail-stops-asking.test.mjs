/**
 * A tab whose reads fail stops asking, and looks once in a while (client/trouble.ts, client/api.ts; 25 Nov 2026).
 *
 * A read that failed was each surface's own to ask again, and no surface knew of the others: on the night of 24 Nov 2026
 * every open tab answered a database that was failing because it was asked too much by asking it again, on every part of
 * the page at once. Measured on the nightly's own stack before this: 88 requests in the first minute of a load whose
 * reads all fail, and 86 in the minute after a return to such a tab.
 *
 * Run over the rule with a clock, a chance and a timer of the test's own; through the typed client with a fake fetch; and
 * through the rest of a load's one request, which answered a failure by asking every read it carried alone.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { until } from "../../shared/_until.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { troubleOf } = await import(at("apps/dashboard/src/client/trouble.ts"));
const { createApi } = await import(at("apps/dashboard/src/client/api.ts"));
const { restReads } = await import(at("apps/dashboard/src/client/rest-reads.ts"));

/* ------------------------------------------------------------ the rule */

/** A tab's standing over a clock the test moves, with no chance in its waits and a timer the test fires. */
function standing() {
  let now = 1_000_000;
  const timers = [];
  const trouble = troubleOf({
    now: () => now,
    chance: () => 0,
    after: (ms, fn) => {
      const timer = { at: now + ms, fn, on: true };
      timers.push(timer);
      return () => (timer.on = false);
    },
  });
  /** Move the clock on, firing what came due. */
  const pass = (ms) => {
    now += ms;
    for (const timer of timers) if (timer.on && timer.at <= now) ((timer.on = false), timer.fn());
  };
  /** One read through the gate: `null` where it was held here, else the hand that says what it came to. */
  const read = async () => {
    const gate = await trouble.before();
    return gate.held === null ? gate.settled : { held: gate.held };
  };
  /** A read that leaves and fails, on an address. */
  const fail = async (address, namedWaitS) => (await read())("fault", address, namedWaitS);
  return { trouble, pass, read, fail };
}

test("one read failing, however often, is not trouble; nor are several with an answer between them", async () => {
  const s = standing();
  for (let i = 0; i < 6; i += 1) await s.fail("GET today");
  assert.equal(s.trouble.waiting(), false, "a route with a fault of its own holds nothing else back");
  (await s.read())("answered", "GET contacts");
  await s.fail("GET calendar");
  await s.fail("GET settings");
  (await s.read())("answered", "GET contacts");
  await s.fail("GET today");
  await s.fail("GET calendar");
  assert.equal(s.trouble.waiting(), false, "the server answered between them");
});

test("three reads failing in a row on two addresses: reads are answered here, with how long is left", async () => {
  const s = standing();
  await s.fail("GET today");
  await s.fail("GET today");
  assert.equal(s.trouble.waiting(), false);
  await s.fail("GET calendar");
  assert.equal(s.trouble.waiting(), true);
  assert.deepEqual(await s.read(), { held: 5 }, "five seconds, the first wait");
  s.pass(3_000);
  assert.deepEqual(await s.read(), { held: 2 });
});

test("once the wait is over one read leaves to look, and the others wait on what it says", async () => {
  const s = standing();
  for (const address of ["GET today", "GET calendar", "GET settings"]) await s.fail(address);
  s.pass(5_000);
  const look = await s.read();
  assert.equal(typeof look, "function", "the first read asked for is the look");
  let second = "waiting";
  const others = s.read().then((answer) => (second = answer));
  await Promise.resolve();
  assert.equal(second, "waiting", "a read asked while the look is out waits for it");
  look("fault", "GET today");
  assert.deepEqual(await others, { held: 10 }, "it failed: held again, and the wait has doubled");
  assert.equal(s.trouble.waiting(), true);
});

test("each look that fails doubles the wait, to five minutes; a wait the server names is kept where it is longer", async () => {
  const s = standing();
  for (const address of ["GET today", "GET calendar", "GET settings"]) await s.fail(address);
  const waits = [];
  for (let i = 0; i < 8; i += 1) {
    const { held } = await s.read();
    waits.push(held);
    s.pass(held * 1_000);
    (await s.read())("fault", "GET today");
  }
  assert.deepEqual(waits, [5, 10, 20, 40, 80, 160, 300, 300]);
  s.pass(300_000);
  (await s.read())("fault", "GET today", 900);
  assert.deepEqual(await s.read(), { held: 900 }, "the server said fifteen minutes");
});

test("a look that is answered: the tab is as it was, and the reads held back leave two at a time for a while", async () => {
  const s = standing();
  for (const address of ["GET today", "GET calendar", "GET settings"]) await s.fail(address);
  s.pass(5_000);
  const look = await s.read();
  const waiting = [s.read(), s.read(), s.read(), s.read()];
  look("answered", "GET today");
  assert.equal(s.trouble.waiting(), false);
  const left = [];
  for (const [i, read] of waiting.entries()) void read.then((settled) => left.push([i, settled]));
  await until(() => left.length === 2, "two reads left");
  await new Promise((r) => setImmediate(r));
  assert.equal(left.length, 2, "two at a time: every surface held back would have asked in the same instant");
  left[0][1]("answered", "GET calendar");
  await until(() => left.length === 3, "one in, the next leaves");
  left[1][1]("answered", "GET settings");
  left[2][1]("answered", "GET contacts");
  await until(() => left.length === 4, "and the last");
  left[3][1]("answered", "GET views");
  // Ten seconds on, a read leaves in the turn it is asked in, as it always did.
  s.pass(10_000);
  const gate = s.trouble.before();
  assert.equal(gate instanceof Promise, false, "no turn taken: the tab stands");
  assert.equal(gate.held, null);
});

test("a write answered, or a read that left before the hold and is answered, ends the wait: the server answers", async () => {
  const s = standing();
  const early = await s.read();
  for (const address of ["GET today", "GET calendar", "GET settings"]) await s.fail(address);
  assert.equal(s.trouble.waiting(), true);
  early("answered", "GET contacts");
  assert.equal(s.trouble.waiting(), false);
  for (const address of ["GET today", "GET calendar", "GET settings"]) await s.fail(address);
  s.trouble.answered();
  assert.equal(s.trouble.waiting(), false, "somebody's write went through");
});

test("a person's press ends the wait at once, and a read its caller called off says nothing of the server", async () => {
  const s = standing();
  for (const address of ["GET today", "GET calendar", "GET settings"]) await s.fail(address);
  s.trouble.lookNow();
  const look = await s.read();
  assert.equal(typeof look, "function", "the next read is the look, with four seconds of the wait unspent");
  look("called_off", "GET today");
  const again = await s.read();
  assert.equal(typeof again, "function", "called off, the wait stays over: the next read looks");
  again("answered", "GET today");
  assert.equal(s.trouble.waiting(), false);
  // And where the tab stands, a read called off counts for nothing.
  const fresh = standing();
  for (let i = 0; i < 9; i += 1) (await fresh.read())("called_off", `GET r${i}`);
  assert.equal(fresh.trouble.waiting(), false);
});

test("the wait coming due is said, so the runner's own read looks; a wait ended early says nothing", async () => {
  const s = standing();
  let due = 0;
  const stop = s.trouble.onDue(() => (due += 1));
  for (const address of ["GET today", "GET calendar", "GET settings"]) await s.fail(address);
  s.pass(4_999);
  assert.equal(due, 0);
  s.pass(1);
  assert.equal(due, 1, "five seconds on");
  (await s.read())("fault", "GET today");
  s.pass(10_000);
  assert.equal(due, 2, "and when the doubled wait comes due");
  (await s.read())("answered", "GET today");
  s.pass(600_000);
  assert.equal(due, 2, "mended: nothing more is due");
  stop();
});

/* ------------------------------------------------------------ through the client */

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const envelope = (data) =>
  new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { "content-type": "application/json" } });
const failed = (status = 503, headers = {}) =>
  new Response(JSON.stringify({ ok: false, error: { code: "unavailable", message: "Couldn't finish that." } }), {
    status,
    headers,
  });

/** The typed client over a fake fetch, with a clock and a timer of the test's own. */
function client(answer) {
  const sent = [];
  let now = 1_000_000;
  const timers = [];
  const trouble = troubleOf({
    now: () => now,
    chance: () => 0,
    after: (ms, fn) => {
      const timer = { at: now + ms, fn, on: true };
      timers.push(timer);
      return () => (timer.on = false);
    },
  });
  const api = createApi({
    fetch: async (url, init) => {
      sent.push(`${init.method} ${url.replace(/\?.*$/, "")}`);
      return answer(url, init, sent.length);
    },
    workspace: () => A,
    onSignedOut: () => {},
    refresh: async () => {},
    now: () => now,
    trouble,
  });
  const pass = (ms) => {
    now += ms;
    for (const timer of timers) if (timer.on && timer.at <= now) ((timer.on = false), timer.fn());
  };
  return { api, sent, pass };
}

test("a read leaves in the turn it is asked in while the tab stands", () => {
  const c = client(() => envelope({}));
  void c.api("GET views");
  assert.deepEqual(c.sent, ["GET /api/v1/views"], "sent before the caller's next line, as it always was");
});

test("with every read failing, a pass of twenty-five reads and its retries reach the server four times", async () => {
  const c = client(() => failed());
  const READS = ["GET views", "GET calls", "GET channels", "GET segments", "GET team"];
  // A pass: twenty-five reads, in lanes of four as the runner reads them.
  for (let i = 0; i < 25; i += 1) await c.api(READS[i % READS.length], { query: { n: String(i) } });
  assert.equal(c.sent.length, 3, "three failed and the tab stopped asking: the other twenty-two never left");
  const held = await c.api("GET views");
  assert.equal(held.ok, false);
  assert.equal(held.code, "unavailable");
  assert.equal(held.retryAfterS, 5, "answered here, with how long is left: a surface's own retry waits it out");
  // Each surface's own retries, 0.8 s, 2 s and 10 s later: none reaches the server but the one look.
  c.pass(800);
  for (let i = 0; i < 25; i += 1) await c.api(READS[i % READS.length], { query: { n: String(i) } });
  c.pass(2_000);
  for (let i = 0; i < 25; i += 1) await c.api(READS[i % READS.length], { query: { n: String(i) } });
  assert.equal(c.sent.length, 3);
  c.pass(10_000);
  for (let i = 0; i < 25; i += 1) await c.api(READS[i % READS.length], { query: { n: String(i) } });
  assert.equal(c.sent.length, 4, "one look, where seventy-five more requests left");
});

test("the server's own word for how long to wait is kept, and a write is never held", async () => {
  const c = client((_url, init) => (init.method === "GET" ? failed(500, { "retry-after": "15" }) : envelope({})));
  for (const key of ["GET views", "GET calls", "GET channels"]) await c.api(key);
  assert.equal((await c.api("GET segments")).retryAfterS, 15, "the server said fifteen seconds");
  const wrote = await c.api("PUT contacts/[id]/seen", { params: { id: A }, body: { seen: true }, refresh: false });
  assert.ok(
    c.sent.some((s) => s.startsWith("PUT ")),
    "somebody's act leaves whatever the tab's standing",
  );
  assert.equal(wrote.ok, true);
  await c.api("GET segments");
  assert.equal(c.sent.at(-1), "GET /api/v1/segments", "and its answer says the server answers: reads leave again");
});

test("a refusal that is no fault holds nothing back: not there, not allowed, too many at once", async () => {
  for (const status of [400, 403, 404, 409, 429]) {
    const c = client(() => failed(status));
    for (let i = 0; i < 8; i += 1) await c.api(["GET views", "GET calls", "GET channels"][i % 3]);
    assert.equal(c.sent.length, 8, `a ${status} is an answer`);
  }
});

/* ------------------------------------------------------------ the rest of a load, as one request */

const restUrl = (key) => `/api/v1/${key}?workspace=${A}`;
const KEYS = ["calls", "channels", "segments", "team", "policies", "billing", "partner", "google"];
const ndjson = (lines) =>
  new Response(`${lines.join("\n")}\n`, { status: 200, headers: { "content-type": "application/x-ndjson" } });
const lineOf = (k) => JSON.stringify({ k, s: 200, b: { ok: true, data: { k } } });

test("a rest of a load the server could not answer answers every read it carried: none is asked again alone", async () => {
  for (const whole of [() => failed(503), () => failed(500), () => Promise.reject(new TypeError("fetch failed"))]) {
    const asked = [];
    const rest = restReads(async (url) => {
      asked.push(url);
      return whole();
    });
    const answers = rest.ask(KEYS.map(restUrl));
    const settled = await Promise.all(
      KEYS.map((key) =>
        answers.get(restUrl(key)).then(
          (res) => res.status,
          (e) => `rejected: ${e.message}`,
        ),
      ),
    );
    assert.equal(asked.length, 1);
    assert.ok(
      settled.every((status) => typeof status === "number" && status >= 500),
      `each read hears the failure: ${settled.join(" ")}`,
    );
  }
});

test("a rest refused for any other reason, or cut short, still hands its reads back to be asked alone", async () => {
  // A server from before this route, a session ended: each read's own request is refused as it would have been.
  for (const status of [404, 401, 400]) {
    const rest = restReads(async () => failed(status));
    const answers = rest.ask(KEYS.map(restUrl));
    for (const key of KEYS) await assert.rejects(answers.get(restUrl(key)), /not carried/, `${status} ${key}`);
  }
  // Cut short after two lines: those two are answered, the rest are asked alone.
  const rest = restReads(async () => ndjson([lineOf("calls"), lineOf("channels")]));
  const answers = rest.ask(KEYS.map(restUrl));
  assert.equal((await answers.get(restUrl("calls"))).status, 200);
  assert.equal((await answers.get(restUrl("channels"))).status, 200);
  for (const key of KEYS.slice(2)) await assert.rejects(answers.get(restUrl(key)), /not carried/, key);
});

test("through the client: a failed rest of a load is one request and no more, and the tab holds its reads after it", async () => {
  const sent = [];
  const rest = restReads(async (url) => {
    sent.push(`GET ${url.replace(/\?.*$/, "")}`);
    return failed(503);
  });
  const api = createApi({
    fetch: async (url, init) => {
      sent.push(`${init.method} ${url.replace(/\?.*$/, "")}`);
      return failed(503);
    },
    workspace: () => A,
    onSignedOut: () => {},
    refresh: async () => {},
    together: rest,
  });
  const READS = ["GET calls", "GET channels", "GET segments", "GET team", "GET policies", "GET billing"];
  const answers = await Promise.all(api.gather(() => READS.map((key) => api(key))));
  assert.ok(answers.every((r) => !r.ok));
  assert.deepEqual(sent, ["GET /api/v1/open/rest"], "the one request: its six reads were each asked alone before");
  assert.equal(api.readsHeld(), true, "six reads failed on six addresses: the tab holds its reads");
  await api("GET calls");
  assert.equal(sent.length, 1, "and a surface's retry is answered here");
});
