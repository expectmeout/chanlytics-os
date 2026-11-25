/**
 * A read that failed is asked once more, and not at all while the database is failing (packages/db shared/read-again.ts).
 *
 * PostgREST's client asked a failed read again by itself, three more times over seven seconds. On the night of 24 Nov 2026
 * the database was failing because it was asked too much, and every read it refused came back to it three more times, from
 * every request of every open page. The clients this package makes turn that off, and their transport asks once more, after
 * a pause, where the database is not failing as this process has seen it; while it is, a failed read is its caller's to hear.
 *
 * Run over the rule itself, and through the real service client with a transport that fails: nothing leaves this process.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { askedAgain, databaseFailing, forgetDatabaseFailures } from "../../../packages/db/src/shared/read-again.ts";
import { createServiceClient } from "../../../packages/db/src/shared/service-client.ts";

beforeEach(() => forgetDatabaseFailures());

const READ = { init: undefined, how: "read" };
/** The pauses a run took, in place of waiting them out. */
function pauses() {
  const taken = [];
  return { taken, pause: async (ms) => void taken.push(ms) };
}
/** A send that answers each call with `answer(n)`, and counts them. */
function sending(answer) {
  let sent = 0;
  return { send: async () => answer((sent += 1)), count: () => sent };
}

test("a read that did not arrive is asked once more, after a pause, and the second answer is the caller's", async () => {
  const { taken, pause } = pauses();
  const s = sending((n) => {
    if (n === 1) throw new TypeError("fetch failed");
    return new Response("[]", { status: 200 });
  });
  const answer = await askedAgain(READ, s.send, { pause, chance: () => 0.5 });
  assert.equal(answer.status, 200);
  assert.equal(s.count(), 2, "once more, not three times");
  assert.deepEqual(taken, [750], "after half a second and half as much again by chance");
});

test("an answer of 503 or 520 is asked once more, for the pause it names where it names a short one", async () => {
  for (const status of [503, 520]) {
    forgetDatabaseFailures();
    const { taken, pause } = pauses();
    const s = sending((n) =>
      n === 1
        ? new Response("later", { status, headers: status === 503 ? { "retry-after": "1" } : {} })
        : new Response("[]", { status: 200 }),
    );
    assert.equal((await askedAgain(READ, s.send, { pause, chance: () => 0 })).status, 200, String(status));
    assert.equal(s.count(), 2);
    assert.deepEqual(taken, [status === 503 ? 1000 : 500]);
  }
});

test("the second failure is the caller's: never a third ask", async () => {
  const { pause } = pauses();
  const refused = sending(() => new Response("later", { status: 503 }));
  assert.equal((await askedAgain(READ, refused.send, { pause })).status, 503);
  assert.equal(refused.count(), 2);
  forgetDatabaseFailures();
  const lost = sending(() => {
    throw new TypeError("fetch failed");
  });
  await assert.rejects(askedAgain(READ, lost.send, { pause }), /fetch failed/);
  assert.equal(lost.count(), 2);
});

test("a write, a function's call and any other answer are sent once", async () => {
  const { taken, pause } = pauses();
  for (const how of ["INSERT", "UPDATE", "DELETE", "call", null]) {
    forgetDatabaseFailures();
    const s = sending(() => new Response("later", { status: 503 }));
    assert.equal((await askedAgain({ init: undefined, how }, s.send, { pause })).status, 503);
    assert.equal(s.count(), 1, `${how}: once`);
  }
  for (const status of [500, 502, 504, 429, 404, 403]) {
    forgetDatabaseFailures();
    const s = sending(() => new Response("no", { status }));
    assert.equal((await askedAgain(READ, s.send, { pause })).status, status);
    assert.equal(s.count(), 1, `a ${status} is the caller's to hear`);
  }
  assert.deepEqual(taken, [], "and nothing waited");
});

test("a request given up on is never asked again: the caller's abort, or a bound reached", async () => {
  const { pause } = pauses();
  const mine = new AbortController();
  mine.abort();
  const calledOff = sending(() => {
    throw Object.assign(new Error("aborted"), { name: "AbortError" });
  });
  await assert.rejects(askedAgain({ init: { signal: mine.signal }, how: "read" }, calledOff.send, { pause }));
  assert.equal(calledOff.count(), 1);
  assert.equal(databaseFailing(), false);
  const bound = sending(() => {
    throw Object.assign(new Error("the database did not answer within 40000 ms (timeout)"), { name: "AbortError" });
  });
  await assert.rejects(askedAgain(READ, bound.send, { pause }));
  assert.equal(bound.count(), 1, "another wait of the bound would outlast the function");
});

test("while the database is failing, a failed read is not asked again: three failures in half a minute", async () => {
  const { taken, pause } = pauses();
  let at = 1_000_000;
  const using = { pause, now: () => at, chance: () => 0 };
  const failing = sending(() => new Response("upstream", { status: 503 }));
  // The first failed read is asked once more, and that fails too: two failures.
  await askedAgain(READ, failing.send, using);
  assert.equal(failing.count(), 2);
  assert.equal(databaseFailing(at), false);
  // The third failure: the database is failing, and this read is its caller's to hear at once.
  await askedAgain(READ, failing.send, using);
  assert.equal(failing.count(), 3, "sent once");
  assert.equal(databaseFailing(at), true);
  for (let i = 0; i < 20; i += 1) await askedAgain(READ, failing.send, using);
  assert.equal(failing.count(), 23, "twenty failing reads are twenty calls, where they were eighty");
  assert.equal(taken.length, 1, "one pause, for the one read asked again");
  // Half a minute with nothing failing: a failed read is asked once more again.
  at += 31_000;
  assert.equal(databaseFailing(at), false);
  await askedAgain(READ, failing.send, using);
  assert.equal(failing.count(), 25);
});

test("a caller's own abort is not the database failing; a 5xx, a lost request and a bound reached are", async () => {
  const { pause } = pauses();
  const mine = new AbortController();
  mine.abort();
  for (let i = 0; i < 5; i += 1)
    await askedAgain(
      { init: { signal: mine.signal }, how: "read" },
      async () => {
        throw Object.assign(new Error("aborted"), { name: "AbortError" });
      },
      { pause },
    ).catch(() => undefined);
  assert.equal(databaseFailing(), false, "called off five times: nothing of the database's");
  await askedAgain({ init: undefined, how: "call" }, async () => new Response("no", { status: 500 }), { pause });
  await askedAgain({ init: undefined, how: "INSERT" }, async () => new Response("no", { status: 504 }), { pause });
  await askedAgain(
    READ,
    async () => {
      throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
    },
    { pause },
  ).catch(() => undefined);
  assert.equal(databaseFailing(), true, "three failures, whatever the calls were");
});

test("through the real client: its own three more asks are off, and a failed read reaches the database twice at most", async () => {
  const sent = [];
  const db = createServiceClient({
    url: "http://127.0.0.1:1",
    serviceRoleKey: "test-only",
    fetch: async (input) => {
      sent.push(String(typeof input === "string" ? input : input.url));
      return new Response(JSON.stringify({ message: "upstream" }), { status: 520 });
    },
  });
  const { error } = await db.from("jobs").select("id").limit(1);
  assert.ok(error, "the caller hears the failure");
  assert.equal(sent.length, 2, "the read and one more ask; the client's own retries would have made it four");
  // The database is failing by now (the same process saw three failures): the next failed read is sent once.
  await db.from("jobs").select("id").limit(1);
  assert.equal(sent.length, 3);
  await db.from("jobs").select("id").limit(1);
  assert.equal(sent.length, 4);
});
