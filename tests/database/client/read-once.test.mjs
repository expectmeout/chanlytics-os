/**
 * A request that answers several reads as one asks the database each question once (the plan "Pages that open at once",
 * piece 2). Today's opening answered twenty reads from about seventy-five small readers, and eighteen of its 115 reads of a
 * table asked exactly what another had asked a moment before (measured 23 Nov 2026: the channels' state three times, the
 * mailboxes three, the Google listing twice). Each was a call of its own, and the server's time went on its calls, not on the
 * database's answers.
 *
 * The database client's transport (packages/db shared/observe.ts namedFetch, over read-once.ts) answers a read of PostgREST from the answer
 * the same request already has for it, where the request says it shares its reads (`sharedReads` on the port: the
 * dashboard's GET open). The same read is the same address under the same headers, so another person's token or another
 * page of rows is another read. A function's call is never shared, since some count what they are asked (the limiter's);
 * a write to a table ends what was shared, so a read after it sees it; and an answer that failed is never kept.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { namedFetch, observeDb } from "@chanlytics/db/shared";

/** What this process has seen fail lives on globalThis (packages/db read-again.ts): a test begins with none. */
const forgetDatabaseFailures = () => void (globalThis[Symbol.for("chanlytics.db.failed-at")] = []);

const BASE = "https://db.example.com/rest/v1";

/** The port as a request holds it: `shared` is the request's own store of answers, or null where it shares none. */
function observing(shared) {
  const timed = [];
  const touched = [];
  observeDb({
    log: { info: () => {}, warn: () => {}, error: () => {} },
    requestId: () => "req-1",
    timed: (ms) => timed.push(ms),
    touched: (table, how) => touched.push(`${table} ${how}`),
    sharedReads: () => shared,
  });
  return { timed, touched };
}

/**
 * A transport that counts what it is sent and answers each call with `answer(n, url, init)`. A read that fails is asked
 * once more by the transport (read-again.ts), with no pause here.
 */
function counting(answer = () => new Response('[{"id":1}]', { status: 200, headers: { "content-range": "0-0/*" } })) {
  const sent = [];
  const fetch = namedFetch(
    async (url, init) => {
      sent.push(`${init?.method ?? "GET"} ${String(url).replace(BASE, "")}`);
      return answer(sent.length, url, init);
    },
    { pause: async () => {} },
  );
  return { sent, fetch };
}

test("the same read asked twice in a request that shares is sent once, and each asker reads the whole answer", async () => {
  const { timed } = observing(new Map());
  const { sent, fetch } = counting();
  const [one, two] = await Promise.all([fetch(`${BASE}/lines?select=id`), fetch(`${BASE}/lines?select=id`)]);
  assert.deepEqual(sent, ["GET /lines?select=id"]);
  assert.notEqual(one, two, "each asker has an answer of its own to read");
  assert.equal(await one.text(), '[{"id":1}]');
  assert.equal(await two.text(), '[{"id":1}]');
  assert.deepEqual([two.status, two.ok, two.headers.get("content-range")], [200, true, "0-0/*"]);
  assert.equal(timed.length, 1, "only the call that was sent is counted as the database's time");
});

test("asked again once the first is answered, it is answered from the first", async () => {
  observing(new Map());
  const { sent, fetch } = counting();
  await (await fetch(`${BASE}/tenant_config?select=config`)).text();
  const again = await fetch(`${BASE}/tenant_config?select=config`);
  assert.equal(sent.length, 1);
  assert.equal(await again.text(), '[{"id":1}]');
});

test("a read is told as touched each time it is asked, sent or not", async () => {
  const { touched } = observing(new Map());
  const { fetch } = counting();
  await fetch(`${BASE}/lines?select=id`);
  await fetch(`${BASE}/lines?select=id`);
  assert.deepEqual(touched, ["lines read", "lines read"]);
});

test("another address, another header and another method are other reads", async () => {
  observing(new Map());
  const { sent, fetch } = counting();
  await fetch(`${BASE}/lines?select=id`, { headers: { authorization: "Bearer one" } });
  await fetch(`${BASE}/lines?select=id,kind`, { headers: { authorization: "Bearer one" } });
  await fetch(`${BASE}/lines?select=id`, { headers: { authorization: "Bearer two" } });
  await fetch(`${BASE}/lines?select=id`, { headers: { authorization: "Bearer one", range: "0-9" } });
  await fetch(`${BASE}/lines?select=id`, { method: "HEAD", headers: { authorization: "Bearer one" } });
  await fetch(`${BASE}/lines?select=id`, { headers: { Authorization: "Bearer one" } });
  assert.equal(sent.length, 5, "the last is the first again, its header's name in another case");
});

test("a function's call is never shared: each is sent", async () => {
  observing(new Map());
  const { sent, fetch } = counting(() => new Response("true", { status: 200 }));
  const take = { method: "POST", body: '{"p_bucket":"aggregate"}' };
  await Promise.all([fetch(`${BASE}/rpc/take_rate`, take), fetch(`${BASE}/rpc/take_rate`, take)]);
  assert.deepEqual(sent, ["POST /rpc/take_rate", "POST /rpc/take_rate"]);
});

test("a write to a table ends what was shared: a read after it is sent again", async () => {
  observing(new Map());
  const { sent, fetch } = counting();
  await fetch(`${BASE}/notifications?select=id`);
  await fetch(`${BASE}/notifications`, { method: "PATCH", body: '{"seen":true}' });
  await fetch(`${BASE}/notifications?select=id`);
  assert.deepEqual(sent, ["GET /notifications?select=id", "PATCH /notifications", "GET /notifications?select=id"]);
});

test("a read sent while a write is out is not kept past the write", async () => {
  observing(new Map());
  let landed;
  const written = new Promise((done) => (landed = done));
  const { sent, fetch } = counting(async (_n, _url, init) => {
    if (init?.method === "PATCH") await written;
    return new Response("[]", { status: 200 });
  });
  const write = fetch(`${BASE}/notifications`, { method: "PATCH", body: "{}" });
  await fetch(`${BASE}/notifications?select=id`);
  landed();
  await write;
  await fetch(`${BASE}/notifications?select=id`);
  assert.equal(sent.filter((s) => s.startsWith("GET")).length, 2);
});

test("a read that failed is not kept, and neither is an answer the server could not make", async () => {
  observing(new Map());
  forgetDatabaseFailures();
  const { sent, fetch } = counting((n) => {
    // The read and the once it is asked again (read-again.ts) both fail to arrive.
    if (n <= 2) throw new TypeError("fetch failed");
    if (n === 3) return new Response("upstream", { status: 500 });
    return new Response("[]", { status: 200 });
  });
  await assert.rejects(fetch(`${BASE}/lines?select=id`), /fetch failed/);
  assert.equal((await fetch(`${BASE}/lines?select=id`)).status, 500);
  assert.equal((await fetch(`${BASE}/lines?select=id`)).status, 200);
  assert.equal(sent.length, 4);
});

test("an answer that says to ask again later is not kept: too many at once, or too long, is asked again", async () => {
  for (const status of [429, 408]) {
    observing(new Map());
    const { sent, fetch } = counting((n) =>
      n === 1 ? new Response('{"message":"later"}', { status }) : new Response("[]", { status: 200 }),
    );
    assert.equal((await fetch(`${BASE}/lines?select=id`)).status, status);
    assert.equal((await fetch(`${BASE}/lines?select=id`)).status, 200, `a ${status} is asked again`);
    assert.equal(sent.length, 2);
  }
});

test("a refusal is an answer: the same read is refused the same way, without asking again", async () => {
  observing(new Map());
  const { sent, fetch } = counting(() => new Response('{"code":"42501"}', { status: 403, statusText: "Forbidden" }));
  const [one, two] = [await fetch(`${BASE}/lines?select=id`), await fetch(`${BASE}/lines?select=id`)];
  assert.equal(sent.length, 1);
  assert.deepEqual(
    [two.status, two.statusText, two.ok, await two.text()],
    [403, "Forbidden", false, '{"code":"42501"}'],
  );
  assert.equal(one.status, 403);
});

test("an answer with no body is shared as one", async () => {
  observing(new Map());
  const { sent, fetch } = counting(() => new Response(null, { status: 204 }));
  await fetch(`${BASE}/lines?select=id`);
  const again = await fetch(`${BASE}/lines?select=id`);
  assert.equal(sent.length, 1);
  assert.deepEqual([again.status, await again.text()], [204, ""]);
});

test("a call that may be called off by its own signal is not shared", async () => {
  observing(new Map());
  const { sent, fetch } = counting();
  await fetch(`${BASE}/lines?select=id`, { signal: AbortSignal.timeout(5000) });
  await fetch(`${BASE}/lines?select=id`, { signal: AbortSignal.timeout(5000) });
  assert.equal(sent.length, 2);
});

test("a request that does not say it shares sends every read, as it always did", async () => {
  observing(null);
  const { sent, fetch } = counting();
  const [one] = await Promise.all([fetch(`${BASE}/lines?select=id`), fetch(`${BASE}/lines?select=id`)]);
  assert.equal(sent.length, 2);
  assert.equal(await one.text(), '[{"id":1}]');
});

test("what is not PostgREST's is never shared", async () => {
  observing(new Map());
  const { sent, fetch } = counting();
  await fetch("https://db.example.com/auth/v1/user");
  await fetch("https://db.example.com/auth/v1/user");
  assert.equal(sent.length, 2);
});
