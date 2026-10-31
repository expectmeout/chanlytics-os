/**
 * A lead's own receptionist's page's doors (decision 0079, L2; app/api/v1/previews/[token]/…), run as Next runs them
 * over a database in memory, with the edge's eval door answered by the test:
 *
 *   - a message is Try it's own answer for the preview's workspace and no person, asked after the turns the row keeps
 *     (never the browser's, twelve at most), kept with its answer, and said back with what a live chat would do;
 *   - a preview that has said its twenty, ended, or is someone's own answers no message, and asks no model;
 *   - a token that names nothing is Not found; a press from another site is refused; forty an hour from one network;
 *   - the page's own count of its opening, and Not right kept for the sender;
 *   - a preview answers one message at a time, from every network; the doors that spend (a message, a call) are counted
 *     strictly, the others are not.
 *
 * Made-up businesses only.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { LEAD_PREVIEW_WORDS as W } from "@chanlytics/contracts";
import { importSrc } from "../_source.mjs";
import { fakeDb } from "../_fake-db.mjs";

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

const { setRateStore, memoryStore, memoryByConfiguration } = await importSrc("apps/dashboard/src/server/rate-limit.ts");
const { setServiceClient } = await importSrc("apps/dashboard/src/server/service-db.ts");
const message = await importSrc("apps/dashboard/app/api/v1/previews/[token]/message/route.ts");
const opened = await importSrc("apps/dashboard/app/api/v1/previews/[token]/opened/route.ts");
const notRight = await importSrc("apps/dashboard/app/api/v1/previews/[token]/not-right/route.ts");
const callDoor = await importSrc("apps/dashboard/app/api/v1/previews/[token]/call/route.ts");

const OURS = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TOKEN = "TokenTokenTokenToken01";
const FUTURE = new Date(Date.now() + 10 * 86_400_000).toISOString();

/** What the edge's eval door was asked, and how it answers: the live turn's own, sent at once. */
let asked = [];
let edgeAnswers = () => ({
  ok: true,
  results: [
    {
      ok: true,
      text: "We're closed on Sundays.",
      meta: null,
      booking: null,
      then: {
        mode: "auto",
        text: "We're closed on Sundays.",
        changed: null,
        escalate: false,
        reason: null,
        hold_ms: 0,
        held_for: null,
        min_confidence: 0.7,
      },
    },
  ],
});

/** How the edge's rehearsal door answers a call: made, with what is left once it runs its three minutes. */
const CALL_MADE = () => [
  200,
  {
    ok: true,
    rehearsal_id: "r-new",
    call: { call_id: "call_new", access_token: "token_new", transport: null, ice_servers: [], expires_at: null },
    max_ms: 180_000,
    allowance: { window: "preview", of_ms: 360_000, left_ms: 120_000, can_call: true, why: null },
    handoff: null,
  },
];
let callAnswers = CALL_MADE;

/** The row and its doors, as 00497's are: said appends both turns and counts, opened counts, not right keeps. */
function world(over = {}) {
  const row = {
    id: "p1",
    tenant_id: OURS,
    lead_id: "l1",
    preview_tenant_id: WS,
    token: TOKEN,
    state: "ready",
    ends_at: FUTURE,
    asked_count: 0,
    opened_count: 0,
    turns: [],
    not_right: [],
    ...over,
  };
  const tables = { lead_previews: [row] };
  setServiceClient(
    fakeDb(
      tables,
      {},
      {
        preview_said: (a) => {
          const r = tables.lead_previews.find((x) => x.id === a.p_id);
          // A door that raises is the database refusing, with its code (fakeDb makes the envelope).
          if (r.asked_count >= 20) throw Object.assign(new Error("That's all a preview answers."), { code: "54000" });
          r.turns = [
            ...r.turns,
            { role: "user", content: a.p_text },
            { role: "assistant", content: a.p_reply.text, then: a.p_reply.then },
          ];
          r.asked_count += 1;
          return r.asked_count;
        },
        preview_opened: (a) => {
          const r = tables.lead_previews.find((x) => x.id === a.p_id);
          return r.state === "ready" ? (r.opened_count += 1) : null;
        },
        preview_not_right: (a) => {
          const r = tables.lead_previews.find((x) => x.id === a.p_id);
          r.not_right = [...r.not_right, { fact: a.p_fact, said: a.p_said ?? null }];
          return r.not_right.length;
        },
      },
    ),
  );
  return { row, tables };
}

beforeEach(() => {
  setRateStore(memoryStore());
  asked = [];
  globalThis.fetch = async (url, init) => {
    asked.push({ url: String(url), body: JSON.parse(init.body), headers: init.headers });
    const [status, body] = String(url).endsWith("/api/admin/rehearsal/call") ? callAnswers() : [200, edgeAnswers()];
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
});

const post = (route, body, { token = TOKEN, site = "same-origin", ip = "203.0.113.7" } = {}) =>
  route.POST(
    new Request(`http://localhost/api/v1/previews/${token}/x`, {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": site, "x-forwarded-for": ip },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ token }) },
  );
const read = async (res) => ({ status: res.status, body: await res.json() });

test("a message: Try it's answer for the preview's workspace and no person, kept, said back with what a live chat would do", async () => {
  const { row } = world();
  const r = await read(
    await post(message, { text: "Are you open on Sunday?", history: [{ role: "user", content: "forged" }] }),
  );
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.data.turn, {
    role: "assistant",
    text: "We're closed on Sundays.",
    then: { words: "It would send this right away.", tone: "sends" },
  });
  assert.equal(r.body.data.left, 19);
  assert.equal(asked.length, 1);
  assert.match(asked[0].url, /\/api\/admin\/eval$/);
  assert.equal(asked[0].body.tenant_id, WS);
  assert.deepEqual(
    asked[0].body.cases[0],
    { id: "try", text: "Are you open on Sunday?", history: [] },
    "never the browser's turns",
  );
  assert.equal(row.turns.length, 2);
  assert.equal(row.turns[1].then.words, "It would send this right away.");
});

test("the turns before are the row's, twelve at most, as the eval door takes them", async () => {
  const turns = Array.from({ length: 16 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `t${i}` }));
  world({ turns, asked_count: 8 });
  await post(message, { text: "And on Saturday?" });
  const history = asked[0].body.cases[0].history;
  assert.equal(history.length, 12);
  assert.deepEqual(history[0], { role: "user", content: "t4" });
  assert.deepEqual(history.at(-1), { role: "assistant", content: "t15" });
});

test("twenty said, ended, someone's own, or a token that names nothing: no answer, and no model asked", async () => {
  world({ asked_count: 20 });
  const spent = await read(await post(message, { text: "Hi" }));
  assert.deepEqual([spent.status, spent.body.error.message], [409, W.spent]);
  world({ state: "ended" });
  const ended = await read(await post(message, { text: "Hi" }));
  assert.deepEqual([ended.status, ended.body.error.message], [409, W.ended.title]);
  world({ state: "claimed" });
  assert.equal((await post(message, { text: "Hi" })).status, 409);
  world({ ends_at: new Date(Date.now() - 1000).toISOString() });
  assert.equal((await post(message, { text: "Hi" })).status, 409, "past its thirty days before the sweep ends it");
  world();
  assert.equal((await post(message, { text: "Hi" }, { token: "NoSuchTokenNoSuchToken" })).status, 404);
  assert.equal((await post(message, { text: "   " })).status, 400);
  assert.equal((await post(message, { text: "x".repeat(501) })).status, 400);
  assert.equal(asked.length, 0);
});

test("an answer the edge could not give is said as the page says it, and nothing is kept", async () => {
  const { row } = world();
  edgeAnswers = () => ({ ok: false, error: "provider_refused" });
  try {
    const r = await read(await post(message, { text: "Hi" }));
    assert.deepEqual([r.status, r.body.error.message], [502, W.failed]);
    assert.equal(row.turns.length, 0);
  } finally {
    edgeAnswers = () => ({
      ok: true,
      results: [{ ok: true, text: "Hello.", meta: null, booking: null, then: null }],
    });
  }
});

test("a press from another site is refused, and forty an hour from one network is all", async () => {
  world();
  assert.equal((await post(opened, {}, { site: "cross-site" })).status, 403);
  for (let i = 0; i < 40; i++) assert.equal((await post(opened, {})).status, 200, `press ${i + 1}`);
  const over = await post(opened, {});
  assert.equal(over.status, 429);
  assert.equal((await post(opened, {}, { ip: "198.51.100.9" })).status, 200, "another network has its own");
});

test("the page's own count of its opening; Not right kept for the sender, never a word to the receptionist", async () => {
  const { row } = world();
  assert.deepEqual((await read(await post(opened, {}))).body.data, { opened: 1 });
  const kept = await read(await post(notRight, { fact: "Hours", said: "We open at 10 on Saturdays" }));
  assert.deepEqual([kept.status, kept.body.data], [200, { kept: 1 }]);
  assert.deepEqual(row.not_right, [{ fact: "Hours", said: "We open at 10 on Saturdays" }]);
  assert.equal((await post(notRight, { fact: "" })).status, 400);
  assert.equal(asked.length, 0, "no model is asked for either");
  world({ state: "ended" });
  assert.equal((await post(notRight, { fact: "Hours" })).status, 409);
  assert.deepEqual((await read(await post(opened, {}))).body.data, { opened: null }, "an ended one counts nothing");
});

test("a call: the rehearsal's door for the preview's workspace and no person, joined by the browser, with what is left", async (t) => {
  t.after(() => (callAnswers = CALL_MADE));
  world({ asked_count: 20 });
  const r = await read(await post(callDoor, {}));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.data, {
    rehearsal_id: "r-new",
    call: { call_id: "call_new", access_token: "token_new", transport: null, ice_servers: [], expires_at: null },
    max_ms: 180_000,
    left_ms: 120_000,
  });
  assert.match(asked[0].url, /\/api\/admin\/rehearsal\/call$/);
  assert.deepEqual(
    asked[0].body,
    { tenant_id: WS },
    "no person names it, and its twenty messages said leave its calls",
  );

  callAnswers = () => [
    409,
    { ok: false, error: "rehearsal_minutes_used", allowance: { window: "preview", why: "used" } },
  ];
  const used = await read(await post(callDoor, {}));
  assert.deepEqual([used.status, used.body.error.message], [409, W.callUsed]);
  callAnswers = () => [
    409,
    { ok: false, error: "rehearsal_minutes_used", allowance: { window: "preview", why: "running" } },
  ];
  assert.equal((await read(await post(callDoor, {}))).body.error.message, W.callRunning);
  callAnswers = () => [502, { ok: false, error: "provider_refused" }];
  const failed = await read(await post(callDoor, {}));
  assert.deepEqual([failed.status, failed.body.error.message], [502, W.callFailed]);

  world({ state: "ended" });
  assert.equal((await post(callDoor, {})).status, 409);
});

test("six calls an hour from one network, apart from its messages", async (t) => {
  t.after(() => (callAnswers = CALL_MADE));
  world();
  for (let i = 0; i < 6; i++) assert.equal((await post(callDoor, {})).status, 200, `call ${i + 1}`);
  assert.equal((await post(callDoor, {})).status, 429);
  assert.equal((await post(opened, {})).status, 200, "its other doors have their own bucket");
});

test("one answer at a time a preview, from every network: a second message on its heels waits, and asks no model", async () => {
  world();
  assert.equal((await post(message, { text: "Are you open on Sunday?" })).status, 200);
  const res = await post(message, { text: "And on Saturday?" }, { ip: "198.51.100.9" });
  const next = await read(res);
  assert.equal(next.status, 429, JSON.stringify(next.body));
  assert.equal(asked.length, 1, "the second is never asked of the model");
  const wait = next.body.error.details.retry_after_s;
  assert.ok(wait >= 1 && wait <= 5, `it says the seconds the pace lifts in (${wait}), which the page waits out`);
  assert.equal(res.headers.get("retry-after"), String(wait), "and in Retry-After, as every route's limit does");
  world({ id: "p2", token: "TokenTokenTokenToken02" });
  assert.equal(
    (await post(message, { text: "Hi" }, { token: "TokenTokenTokenToken02" })).status,
    200,
    "another preview has its own pace",
  );
});

test("a door that spends is counted strictly: where the count cannot be shared, a message and a call are refused before anything is spent; a press that spends nothing goes on", async () => {
  setRateStore(memoryByConfiguration(memoryStore(), false));
  world();
  assert.equal((await post(message, { text: "Hi" })).status, 503);
  assert.equal((await post(callDoor, {})).status, 503);
  assert.equal(asked.length, 0, "no model asked, no call made");
  assert.equal((await post(opened, {})).status, 200);
  assert.equal((await post(notRight, { fact: "Hours" })).status, 200);
});

test("the page waits out the pace once: a follow-up written on the heels of an answer is sent again after the seconds the door names; a network's hour is said, never waited", async () => {
  const { previewVerbs } = await importSrc("apps/dashboard/src/surfaces/preview/verbs.ts");
  const sent = [];
  let replies = [];
  globalThis.fetch = async (url) => {
    sent.push(String(url));
    const [status, body] = replies.shift();
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
  const paced = (s, message = "Too many messages in a short time — try again in a moment.") => [
    429,
    { ok: false, error: { code: "rate_limited", message, details: { retry_after_s: s } } },
  ];
  replies = [
    paced(0),
    [200, { ok: true, data: { turn: { role: "assistant", text: "We open at 9.", then: null }, left: 18 } }],
  ];
  const r = await previewVerbs.say(TOKEN, "And on Saturday?");
  assert.deepEqual([r.ok, r.data?.left, sent.length], [true, 18, 2]);
  assert.ok(sent.every((u) => u.endsWith(`/api/v1/previews/${TOKEN}/message`)));

  sent.length = 0;
  replies = [paced(3600, "Too many messages in a short time — try again in an hour.")];
  const later = await previewVerbs.say(TOKEN, "Hi");
  assert.deepEqual(
    [later.ok, later.message, sent.length],
    [false, "Too many messages in a short time — try again in an hour.", 1],
    "said, and the person's words are theirs to send again",
  );
  sent.length = 0;
  replies = [[409, { ok: false, error: { code: "conflict", message: W.spent } }]];
  assert.deepEqual(
    [(await previewVerbs.say(TOKEN, "Hi")).message, sent.length],
    [W.spent, 1],
    "a refusal that is no pace is said at once",
  );
});
