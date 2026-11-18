/**
 * A lead's own greeting, heard with no microphone (decision 0079's amendment of 18 November 2026): one press on its
 * preview, and its AI says the greeting a caller hears. Two halves, each run as it runs:
 *
 *   the door     POST previews/<token>/listen, as Next runs it over a database in memory, the edge's rehearsal door
 *                answered by the test: the same call a person makes, asked for as one nobody speaks on; one at a time a
 *                preview, from every network; a bucket of its own per network, so it uses up none of a network's calls;
 *                counted strictly, as every door that spends is; refused in the call's own words
 *   the join     bridge/rehearse/call.ts startListen, over a call client of the test's own: joined receive-only, so no
 *                microphone is asked for; left once the voice has been quiet a little over a second; by the clock where
 *                the voice cannot be read; told as not played where the browser refuses it or no call was made
 *
 * The edge's half (a minute at the most, the smallest write-up, a listen's row, no call told to the preview) is
 * tests/previews/preview-call.test.mjs's. Made-up businesses only.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { LEAD_PREVIEW_WORDS as W } from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";
import { fakeDb } from "../../_fake-db.mjs";
import { until } from "../../shared/_until.mjs";

const was = { EDGE_URL: process.env.EDGE_URL, EDGE_CALL_SECRET: process.env.EDGE_CALL_SECRET };
Object.assign(process.env, {
  EDGE_URL: "https://edge.example.com",
  EDGE_CALL_SECRET: "edge-secret-for-this-file",
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:1",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "test-only",
});
const realFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = realFetch;
  for (const [k, v] of Object.entries(was)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const { setRateStore, memoryStore, memoryByConfiguration } = await importSrc(
  "apps/dashboard/src/server/shared/rate-limit.ts",
);
const { setServiceClient } = await importSrc("apps/dashboard/src/server/shared/service-db.ts");
const listenDoor = await importSrc("apps/dashboard/app/api/v1/previews/[token]/listen/route.ts");
const callDoor = await importSrc("apps/dashboard/app/api/v1/previews/[token]/call/route.ts");
const { startListen, setCallClient } = await importSrc("apps/dashboard/src/bridge/rehearse/call.ts");

const OURS = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TOKEN = "TokenTokenTokenToken01";
const OTHER_TOKEN = "TokenTokenTokenToken02";
const FUTURE = new Date(Date.now() + 10 * 86_400_000).toISOString();

/* ------------------------------------------------------------------------------------------- the door -- */

/** How the edge's rehearsal door answers: a call made, a minute at the most for a listen. */
const MADE = (maxMs) => [
  200,
  {
    ok: true,
    rehearsal_id: "r-new",
    call: { call_id: "call_new", access_token: "token_new", transport: "gateway", ice_servers: [], expires_at: null },
    max_ms: maxMs,
    allowance: { window: "preview", of_ms: 360_000, left_ms: 300_000, can_call: true, why: null },
    handoff: null,
  },
];
let asked = [];
let edgeAnswers = null;

function world(over = {}) {
  const preview = (id, token) => ({
    id,
    tenant_id: OURS,
    lead_id: `l-${id}`,
    preview_tenant_id: WS,
    token,
    state: "ready",
    ends_at: FUTURE,
    asked_count: 0,
    opened_count: 0,
    turns: [],
    not_right: [],
  });
  setServiceClient(fakeDb({ lead_previews: [{ ...preview("p1", TOKEN), ...over }, preview("p2", OTHER_TOKEN)] }));
}

beforeEach(() => {
  setRateStore(memoryStore());
  asked = [];
  edgeAnswers = (body) => MADE(body.listen ? 60_000 : 180_000);
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    asked.push({ url: String(url), body });
    const [status, answer] = edgeAnswers(body);
    return new Response(JSON.stringify(answer), { status, headers: { "content-type": "application/json" } });
  };
});

const post = (route, { token = TOKEN, site = "same-origin", ip = "203.0.113.7" } = {}) =>
  route.POST(
    new Request(`http://localhost/api/v1/previews/${token}/x`, {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": site, "x-forwarded-for": ip },
      body: "{}",
    }),
    { params: Promise.resolve({ token }) },
  );
const read = async (res) => ({ status: res.status, body: await res.json() });

test("a listen: the preview's own call, asked for as one nobody speaks on, and what the browser joins it with", async () => {
  world({ asked_count: 20 });
  const heard = await read(await post(listenDoor));
  assert.equal(heard.status, 200, JSON.stringify(heard.body));
  assert.deepEqual(heard.body.data, {
    rehearsal_id: "r-new",
    call: { call_id: "call_new", access_token: "token_new", transport: "gateway", ice_servers: [], expires_at: null },
    max_ms: 60_000,
    left_ms: 300_000,
  });
  assert.match(asked[0].url, /\/api\/admin\/rehearsal\/call$/, "the door a call is made at: no second one");
  assert.deepEqual(asked[0].body, { tenant_id: WS, listen: true }, "no person names it; its twenty messages leave it");
  // A call a person makes says nothing of listening: an edge that has never heard the word is asked as it always was.
  await post(callDoor);
  assert.deepEqual(asked[1].body, { tenant_id: WS });
});

test("one at a time a preview, from every network; another preview has its own pace", async () => {
  world();
  assert.equal((await post(listenDoor)).status, 200);
  const again = await post(listenDoor, { ip: "198.51.100.9" });
  const refused = await read(again);
  assert.equal(refused.status, 429, JSON.stringify(refused.body));
  assert.equal(asked.length, 1, "the second is never made");
  const wait = refused.body.error.details.retry_after_s;
  assert.ok(wait >= 1 && wait <= 10, `it lifts in the seconds a greeting takes (${wait})`);
  assert.equal((await post(listenDoor, { token: OTHER_TOKEN })).status, 200);
});

test("hearing the greeting uses up none of a network's six calls, and a press from another site is refused", async () => {
  world();
  assert.equal((await post(listenDoor)).status, 200);
  for (let i = 0; i < 6; i++) assert.equal((await post(callDoor)).status, 200, `call ${i + 1}`);
  assert.equal((await post(callDoor)).status, 429, "the calls' own six are all a network makes");
  assert.equal((await post(listenDoor, { token: OTHER_TOKEN })).status, 200, "and a listen is not one of them");
  assert.equal((await post(listenDoor, { token: OTHER_TOKEN, site: "cross-site" })).status, 403);
});

test("it spends, so it is counted strictly: where the count cannot be shared it is refused before any call is made", async () => {
  setRateStore(memoryByConfiguration(memoryStore(), false));
  world();
  assert.equal((await post(listenDoor)).status, 503);
  assert.equal(asked.length, 0);
});

test("no listen: said in the call's own words, which the page answers with the voice's sample and shows to nobody", async () => {
  world();
  const used = [409, { ok: false, error: "rehearsal_minutes_used", allowance: { window: "preview", why: "used" } }];
  edgeAnswers = () => used;
  const spent = await read(await post(listenDoor));
  assert.deepEqual([spent.status, spent.body.error.message], [409, W.callUsed]);
  edgeAnswers = () => [502, { ok: false, error: "provider_refused" }];
  const away = await read(await post(listenDoor, { token: OTHER_TOKEN }));
  assert.deepEqual([away.status, away.body.error.message], [502, W.callFailed]);
  world({ state: "ended" });
  setRateStore(memoryStore());
  assert.equal((await post(listenDoor)).status, 409, "a preview that has ended is listened to by nobody");
  assert.equal((await post(listenDoor, { token: "TokenTokenTokenNobody1" })).status, 404);
});

/* ------------------------------------------------------------------------------------------- the join -- */

/**
 * A call client of the test's own: it keeps what the join was made with, and its session plays, ends and says how loud
 * its voice is as the test tells it.
 */
function fakeClient({ plays = true } = {}) {
  const joins = [];
  const session = {
    ended: 0,
    level: 0,
    end: async () => {
      session.ended += 1;
    },
    startAudioPlayback: () => (plays ? Promise.resolve() : Promise.reject(new Error("NotAllowedError"))),
    analyzerComponent: { calculateVolume: () => session.level },
  };
  class RetellClient {
    createWebCall(options) {
      joins.push(options);
      return session;
    }
  }
  setCallClient(async () => ({ RetellClient }));
  return { joins, session };
}
after(() => setCallClient(null));
const never = async () => ({ ok: false, message: "never asked" });
/** The clock and the reads' timer, the test's own: a listen is read fifty milliseconds apart. */
const clock = (t) => t.mock.timers.enable({ apis: ["setInterval", "Date"], now: Date.parse("2026-11-18T22:00:00Z") });

test("a voice that never stops is left at a listen's longest", async (t) => {
  clock(t);
  const { joins, session } = fakeClient();
  const done = [];
  await startListen(never, (played) => done.push(played));
  joins[0].hooks.onStatus("live");
  session.level = 0.2;
  t.mock.timers.tick(20_000);
  assert.deepEqual(done, [], "twenty seconds is more than any greeting");
  t.mock.timers.tick(100);
  assert.deepEqual([done, session.ended], [[true], 1]);
});

test("the join asks for no microphone: receive-only, with the voice's level read", async (t) => {
  clock(t);
  const { joins } = fakeClient();
  const done = [];
  const held = await startListen(never, (played) => done.push(played));
  assert.deepEqual(joins[0].audio, { emitRawAudioSamples: true, listener: true });
  assert.equal(joins[0].agent_id, "rehearsal");
  assert.deepEqual(Object.keys(joins[0].hooks).sort(), ["onEnd", "onError", "onStatus"]);
  held.end();
  assert.deepEqual(done, [false], "left before it was live: nothing was played");
});

test("the greeting is heard out, and the page leaves once its voice has been quiet a little over a second", async (t) => {
  clock(t);
  const { joins, session } = fakeClient();
  const done = [];
  await startListen(never, (played) => done.push(played));
  joins[0].hooks.onStatus("live");
  t.mock.timers.tick(800);
  assert.deepEqual(done, [], "the line is quiet before its first word");
  session.level = 0.2;
  t.mock.timers.tick(1_000);
  session.level = 0;
  t.mock.timers.tick(500);
  session.level = 0.2;
  t.mock.timers.tick(2_000);
  assert.deepEqual([done, session.ended], [[], 0], "a pause between two sentences ends nothing");
  session.level = 0;
  t.mock.timers.tick(1_200);
  assert.deepEqual(done, []);
  t.mock.timers.tick(100);
  assert.deepEqual([done, session.ended], [[true], 1], "played, and left");
  // The provider's own word that it ended, after the page left, is told to nobody twice.
  joins[0].hooks.onEnd();
  t.mock.timers.tick(5_000);
  assert.deepEqual([done, session.ended], [[true], 1]);
});

test("a voice that cannot be read plays by the clock", async (t) => {
  clock(t);
  const unread = fakeClient();
  const done = [];
  await startListen(never, (played) => done.push(played));
  unread.joins[0].hooks.onStatus("live");
  t.mock.timers.tick(9_000);
  assert.deepEqual(done, []);
  t.mock.timers.tick(100);
  assert.deepEqual([done, unread.session.ended], [[true], 1]);
});

test("a browser that will not play it is told at once, and the page plays the sample instead", async () => {
  const blocked = fakeClient({ plays: false });
  const told = [];
  await startListen(never, (played) => told.push(played));
  blocked.joins[0].hooks.onStatus("live");
  await until(() => told.length > 0, "the refusal to play is told");
  assert.deepEqual([told, blocked.session.ended], [[false], 1]);
});

test("no call made, a join that fails, or a client that cannot be loaded: not played, said once", async (t) => {
  clock(t);
  const { joins, session } = fakeClient();
  const done = [];
  await startListen(never, (played) => done.push(played));
  joins[0].hooks.onError(new Error("409"));
  joins[0].hooks.onEnd();
  assert.deepEqual([done, session.ended], [[false], 1]);

  setCallClient(async () => {
    throw new Error("the chunk did not load");
  });
  const lost = [];
  assert.equal(await startListen(never, (played) => lost.push(played)), null);
  assert.deepEqual(lost, [false]);
});
