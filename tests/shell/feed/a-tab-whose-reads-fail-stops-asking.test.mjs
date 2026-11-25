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
  /** One read of an address through the gate: `{ held }` where it was answered here, else the hand that says what it came to. */
  const read = async (address) => {
    const gate = await trouble.before(address);
    return gate.held === null ? gate.settled : { held: gate.held };
  };
  /** A read that leaves and fails, on an address. */
  const fail = async (address, namedWaitS) => (await read(address))("fault", namedWaitS);
  /** Three reads failing in a row on two addresses: the tab holds its reads. */
  const trip = async () => {
    for (const address of ["GET today", "GET today", "GET calendar"]) await fail(address);
    assert.equal(trouble.waiting(), true);
  };
  return { trouble, pass, read, fail, trip };
}
const leaves = (answer) => typeof answer === "function";

test("one read failing, however often, is not trouble; nor are several with an answer between them", async () => {
  const s = standing();
  for (let i = 0; i < 6; i += 1) await s.fail("GET today");
  assert.equal(s.trouble.waiting(), false, "a route with a fault of its own holds nothing else back");
  (await s.read("GET contacts"))("answered");
  await s.fail("GET calendar");
  await s.fail("GET settings");
  (await s.read("GET contacts"))("answered");
  await s.fail("GET today");
  await s.fail("GET calendar");
  assert.equal(s.trouble.waiting(), false, "the server answered between them");
});

test("three reads failing in a row on two addresses: a read of an address that failed is answered here, with how long is left", async () => {
  const s = standing();
  await s.fail("GET today");
  await s.fail("GET today");
  assert.equal(s.trouble.waiting(), false);
  await s.fail("GET calendar");
  assert.equal(s.trouble.waiting(), true);
  assert.deepEqual(await s.read("GET today"), { held: 5 }, "five seconds, the first wait");
  s.pass(3_000);
  assert.deepEqual(await s.read("GET calendar"), { held: 2 });
});

test("during the wait, a read of an address that has not failed leaves as a witness: answered, the tab is as it was", async () => {
  // Two reads broken by a fault of their own trip the hold as an outage does. A press that opens another page asks an
  // address that has not failed: it must reach the server, and its answer ends the hold for every read.
  const s = standing();
  await s.trip();
  const witness = await s.read("GET contacts");
  assert.ok(leaves(witness), "it leaves at once, four seconds before the wait's end");
  witness("answered");
  assert.equal(s.trouble.waiting(), false, "the server answers: the two broken reads are their own trouble");
  assert.ok(leaves(await s.read("GET today")));
});

test("witnesses that fail too are a couple a wait, and leave the wait as it stands", async () => {
  const s = standing();
  await s.trip();
  (await s.read("GET contacts"))("fault");
  (await s.read("GET settings"))("fault");
  assert.deepEqual(
    await s.read("GET views"),
    { held: 5 },
    "a third address in the same wait is held: two looked already",
  );
  assert.deepEqual(await s.read("GET contacts"), { held: 5 }, "and one that failed as a witness is held with the rest");
  s.pass(5_000);
  assert.ok(leaves(await s.read("GET today")), "the wait ended when it was set to: the witnesses did not move it");
});

test("once the wait is over a few reads look, addresses that have not failed beside the first, and the rest wait on what they say", async () => {
  const s = standing();
  await s.trip();
  s.pass(5_000);
  const first = await s.read("GET today");
  assert.ok(leaves(first), "the first read asked for looks, whatever its address");
  let waited = "waiting";
  const failedBefore = s.read("GET calendar").then((answer) => (waited = answer));
  const second = await s.read("GET contacts");
  const third = await s.read("GET settings");
  assert.ok(leaves(second) && leaves(third), "two addresses that have not failed look beside it");
  let fourth = "waiting";
  const beyond = s.read("GET views").then((answer) => (fourth = answer));
  await Promise.resolve();
  assert.deepEqual([waited, fourth], ["waiting", "waiting"], "an address that failed, and a read past the three, wait");
  first("fault");
  second("fault");
  assert.equal(waited, "waiting", "not until the last look is in");
  third("fault");
  assert.deepEqual(await failedBefore, { held: 10 }, "all failed: held again, and the wait has doubled");
  assert.deepEqual(await beyond, { held: 10 });
});

test("one look answered ends the hold at once, though the page's own read is still failing", async () => {
  const s = standing();
  await s.trip();
  s.pass(5_000);
  const broken = await s.read("GET today");
  const healthy = await s.read("GET contacts");
  let waited = "waiting";
  const other = s.read("GET calendar").then((answer) => (waited = answer));
  healthy("answered");
  assert.equal(s.trouble.waiting(), false);
  assert.ok(leaves(await other), "what waited leaves");
  broken("fault");
  assert.equal(s.trouble.waiting(), false, "and a look still out that fails after it trips nothing by itself");
  assert.equal(waited !== "waiting", true);
});

test("each round of looks that fails doubles the wait, to five minutes; a wait the server names is kept where it is longer", async () => {
  const s = standing();
  await s.trip();
  const waits = [];
  for (let i = 0; i < 8; i += 1) {
    const { held } = await s.read("GET today");
    waits.push(held);
    s.pass(held * 1_000);
    (await s.read("GET today"))("fault");
  }
  assert.deepEqual(waits, [5, 10, 20, 40, 80, 160, 300, 300]);
  s.pass(300_000);
  (await s.read("GET today"))("fault", 900);
  assert.deepEqual(await s.read("GET today"), { held: 900 }, "the server said fifteen minutes");
});

test("an outage costs a tab a handful of requests: twenty-five addresses asked again every second, for five minutes", async () => {
  const s = standing();
  const ADDRESSES = Array.from({ length: 25 }, (_, i) => `GET read-${i}`);
  let sent = 0;
  /** Every address asked, one after another; each read that leaves fails. */
  const askAll = async () => {
    for (const address of ADDRESSES) {
      const answer = await s.read(address);
      if (!leaves(answer)) continue;
      sent += 1;
      answer("fault");
    }
  };
  await askAll();
  assert.equal(sent, 5, "three failed and the tab stopped asking, but for two witnesses: twenty reads never left");
  for (let elapsed = 0; elapsed < 300_000; elapsed += 1_000) {
    s.pass(1_000);
    await askAll();
  }
  assert.ok(sent <= 30, `five minutes of every read asked again each second: ${sent} requests, where 7,500 left`);
  assert.equal(s.trouble.waiting(), true);
});

test("a look that is answered: the reads held back leave two at a time for a while", async () => {
  const s = standing();
  await s.trip();
  s.pass(5_000);
  const look = await s.read("GET today");
  const waiting = [s.read("GET calendar"), s.read("GET calendar"), s.read("GET today"), s.read("GET calendar")];
  look("answered");
  assert.equal(s.trouble.waiting(), false);
  const left = [];
  for (const read of waiting) void read.then((settled) => left.push(settled));
  await until(() => left.length === 2, "two reads left");
  await new Promise((r) => setImmediate(r));
  assert.equal(left.length, 2, "two at a time: every surface held back would have asked in the same instant");
  left[0]("answered");
  await until(() => left.length === 3, "one in, the next leaves");
  left[1]("answered");
  left[2]("answered");
  await until(() => left.length === 4, "and the last");
  left[3]("answered");
  // Ten seconds on, a read leaves in the turn it is asked in, as it always did.
  s.pass(10_000);
  const gate = s.trouble.before("GET views");
  assert.equal(gate instanceof Promise, false, "no turn taken: the tab stands");
  assert.equal(gate.held, null);
});

test("a write answered, or a read that left before the hold and is answered, ends the wait: the server answers", async () => {
  const s = standing();
  const early = await s.read("GET contacts");
  await s.trip();
  early("answered");
  assert.equal(s.trouble.waiting(), false);
  await s.trip();
  s.trouble.answered();
  assert.equal(s.trouble.waiting(), false, "somebody's write went through");
});

test("a person's press ends the wait at once, and a read its caller called off says nothing of the server", async () => {
  const s = standing();
  await s.trip();
  assert.deepEqual(await s.read("GET today"), { held: 5 });
  s.trouble.lookNow();
  const look = await s.read("GET today");
  assert.ok(leaves(look), "the next read looks, with the wait unspent");
  look("called_off");
  const again = await s.read("GET today");
  assert.ok(leaves(again), "called off, the wait stays over: the next read looks");
  again("answered");
  assert.equal(s.trouble.waiting(), false);
  // And where the tab stands, a read called off counts for nothing.
  const fresh = standing();
  for (let i = 0; i < 9; i += 1) (await fresh.read(`GET r${i}`))("called_off");
  assert.equal(fresh.trouble.waiting(), false);
});

test("a route that fails for one question and answers another holds the other back for nothing: its own address is what failed", async () => {
  // Reports over ninety days fails, with its lens beside it: the hold trips. The same route over thirty days is another
  // address, which has not failed: it is the witness, and its answer ends the hold.
  const s = standing();
  const ask = async (address, route) => {
    const gate = await s.trouble.before(address, route);
    return gate.held === null ? gate.settled : { held: gate.held };
  };
  (await ask("reports?period=90d", "GET reports"))("fault");
  (await ask("reports/people?period=90d", "GET reports/people"))("fault");
  (await ask("reports?period=90d", "GET reports"))("fault");
  assert.equal(s.trouble.waiting(), true);
  assert.deepEqual(await ask("reports?period=90d", "GET reports"), { held: 5 }, "what failed is held");
  const other = await ask("reports?period=30d", "GET reports");
  assert.ok(leaves(other), "the same route, another question: it reaches the server");
  other("answered");
  assert.equal(s.trouble.waiting(), false);
});

test("three failures on one route alone are not trouble, however many questions it was asked", async () => {
  const s = standing();
  for (const period of ["7d", "30d", "90d", "month"]) {
    const gate = await s.trouble.before(`reports?period=${period}`, "GET reports");
    gate.settled("fault");
  }
  assert.equal(s.trouble.waiting(), false, "one route failing is that route's fault");
});

test("a page's boot begins standing: what an earlier page left held, and reads waiting on its looks, are let go", async () => {
  const s = standing();
  await s.trip();
  s.pass(5_000);
  const look = await s.read("GET today");
  let waited = "waiting";
  const waiting = s.read("GET calendar").then((answer) => (waited = answer));
  s.trouble.standAgain();
  assert.equal(s.trouble.waiting(), false);
  assert.ok(leaves(await waiting), "what waited on the look leaves");
  look("fault");
  assert.equal(s.trouble.waiting(), false, "and the look of the page before says nothing to this one");
  const gate = s.trouble.before("GET today");
  assert.equal(gate instanceof Promise, false, "a read leaves in the turn it is asked in: nothing is mending");
  assert.equal(waited !== "waiting", true);
});

test("the wait coming due is said, so the runner's own reads look; a wait ended early says nothing", async () => {
  const s = standing();
  let due = 0;
  const stop = s.trouble.onDue(() => (due += 1));
  await s.trip();
  s.pass(4_999);
  assert.equal(due, 0);
  s.pass(1);
  assert.equal(due, 1, "five seconds on");
  (await s.read("GET today"))("fault");
  s.pass(10_000);
  assert.equal(due, 2, "and when the doubled wait comes due");
  (await s.read("GET today"))("answered");
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

test("with every read failing, a pass of twenty-five reads and its retries reach the server eight times", async () => {
  const c = client(() => failed());
  const READS = ["GET views", "GET calls", "GET channels", "GET segments", "GET team"];
  // A pass: twenty-five reads of five addresses, one after another.
  for (let i = 0; i < 25; i += 1) await c.api(READS[i % READS.length], { query: { n: String(i) } });
  assert.equal(c.sent.length, 5, "three failed and the tab stopped asking, but for two witnesses: twenty never left");
  const held = await c.api("GET views");
  assert.equal(held.ok, false);
  assert.equal(held.code, "unavailable");
  assert.equal(held.retryAfterS, 5, "answered here, with how long is left: a surface's own retry waits it out");
  // Each surface's own retries, 0.8 s, 2 s and 10 s later: none reaches the server but the looks.
  c.pass(800);
  for (let i = 0; i < 25; i += 1) await c.api(READS[i % READS.length], { query: { n: String(i) } });
  c.pass(2_000);
  for (let i = 0; i < 25; i += 1) await c.api(READS[i % READS.length], { query: { n: String(i) } });
  assert.equal(c.sent.length, 5);
  c.pass(10_000);
  for (let i = 0; i < 25; i += 1) await c.api(READS[i % READS.length], { query: { n: String(i) } });
  assert.equal(c.sent.length, 8, "three look together once the wait is over, where seventy-five more requests left");
});

test("two reads broken by a fault of their own hold nothing healthy back: a read of another address ends the hold", async () => {
  const BROKEN = new Set(["/api/v1/views", "/api/v1/calls"]);
  const c = client((url) => (BROKEN.has(url.replace(/\?.*$/, "")) ? failed(500) : envelope({})));
  for (const key of ["GET views", "GET calls", "GET views"]) await c.api(key);
  assert.equal(c.api.readsHeld(), true, "tripped, as an outage would");
  const other = await c.api("GET segments");
  assert.equal(other.ok, true, "a press that opens another page is answered by the server");
  assert.equal(c.api.readsHeld(), false);
  assert.equal((await c.api("GET channels")).ok, true);
});

test("the server's own word for how long to wait is kept, and a write is never held", async () => {
  const c = client((_url, init) => (init.method === "GET" ? failed(500, { "retry-after": "15" }) : envelope({})));
  for (const key of ["GET views", "GET calls", "GET channels"]) await c.api(key);
  const held = c.sent.length;
  assert.equal((await c.api("GET views")).retryAfterS, 15, "the server said fifteen seconds");
  assert.equal(c.sent.length, held, "answered here");
  const wrote = await c.api("PUT contacts/[id]/seen", { params: { id: A }, body: { seen: true }, refresh: false });
  assert.ok(
    c.sent.some((s) => s.startsWith("PUT ")),
    "somebody's act leaves whatever the tab's standing",
  );
  assert.equal(wrote.ok, true);
  await c.api("GET segments");
  assert.equal(c.sent.at(-1), "GET /api/v1/segments", "and its answer says the server answers: reads leave again");
});

test("a person's press is never answered here: a read asked right after one ends the wait and reaches the server", async () => {
  const sent = [];
  let pressed = false;
  const api = createApi({
    fetch: async (url, init) => {
      sent.push(`${init.method} ${url.replace(/\?.*$/, "")}`);
      return failed(503);
    },
    workspace: () => A,
    onSignedOut: () => {},
    refresh: async () => {},
    pressed: () => pressed,
  });
  for (const key of ["GET views", "GET calls", "GET views"]) await api(key);
  assert.equal(api.readsHeld(), true);
  await api("GET views");
  assert.equal(sent.length, 3, "a retry nobody pressed is answered here");
  // A page's Retry: the same read, asked by a person.
  pressed = true;
  await api("GET views");
  assert.equal(sent.length, 4, "it reaches the server, the wait unspent");
  pressed = false;
  await api("GET views");
  assert.equal(sent.length, 4, "and the tab holds again once it failed");
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
