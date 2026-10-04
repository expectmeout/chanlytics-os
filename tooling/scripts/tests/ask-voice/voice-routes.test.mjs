/**
 * The voice routes, run through route(): /api/v1/ask/voice (a conversation starts), /voice/page (the page follows)
 * and /voice/end (the person hung up), their `run` called with a database in memory and a captured wire where the
 * edge's voice-session door would be. What is proved: the policy each declares, the row the start writes as the
 * member with the access token sealed inside it (read once, after the wrapper's own verification), the edge asked
 * with a signed token, and the refusals answered in the gateway's words.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.ASK_VOICE_SECRET = "voice-secret-for-this-file";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
delete process.env.EDGE_URL;
delete process.env.DIAG_KEY;

/* --------------------------------- the wire ------------------------------- */

const wire = { answer: null, calls: [] };
{
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const req = {
      url: String(url),
      method: init?.method ?? "GET",
      headers: init?.headers ?? {},
      body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
    };
    wire.calls.push(req);
    if (!wire.answer) throw new Error(`nothing on the wire answers ${req.method} ${req.url}`);
    return wire.answer(req);
  };
  after(() => {
    globalThis.fetch = realFetch;
  });
}
function wired(answer) {
  wire.calls = [];
  wire.answer = answer;
  return {
    get calls() {
      return wire.calls;
    },
  };
}
const silent = () =>
  wired((req) => {
    throw new Error(`this case must not reach the edge: ${req.method} ${req.url}`);
  });
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const { readerCache } = await import(at("apps/dashboard/src/server/readers/index.ts"));
const { clearContextCache } = await import(at("apps/dashboard/src/server/ask/context.ts"));
const { openToken, sessionHashOf } = await import(at("apps/dashboard/src/server/ask/voice-session.ts"));
const voice = await import(at("apps/dashboard/app/api/v1/ask/voice/route.ts"));
const page = await import(at("apps/dashboard/app/api/v1/ask/voice/page/route.ts"));
const end = await import(at("apps/dashboard/app/api/v1/ask/voice/end/route.ts"));

beforeEach(() => setRateStore(memoryStore()));
beforeEach(() => readerCache.clear());
beforeEach(() => clearContextCache());

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const T1 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const C1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const USER = "u1";
const EDGE = "https://chanlytics-messaging.vercel.app/api/admin/voice/session";
const EXP = Math.floor(Date.parse("2026-10-03T13:00:00Z") / 1000);
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
/** The session's access token as the wrapper verified it: a JWT whose payload says when it expires. */
const JWT = `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ sub: USER, exp: EXP })}.signature-for-this-file`;
const S = "ab".repeat(32);

const membership = (tenant_id, role, slug, created_at) => ({
  user_id: USER,
  tenant_id,
  role,
  tenants: { slug },
  created_at,
});
const both = (harbor, bayside) => [
  membership(A, harbor, "harbor", "2026-01-01T00:00:00Z"),
  membership(B, bayside, "bayside", "2026-02-01T00:00:00Z"),
];
/** The route's context: the database in memory, and the Auth client whose one read the start makes, counted. */
const ctxFor = (tables, params = {}) => {
  const db = fakeDb(tables);
  let tokenReads = 0;
  db.auth = {
    getSession: async () => {
      tokenReads++;
      return { data: { session: { access_token: JWT } }, error: null };
    },
  };
  return {
    supabase: db,
    userId: USER,
    email: "ada@example.com",
    params,
    get tokenReads() {
      return tokenReads;
    },
  };
};
const send = (method, body, q = "") =>
  new Request(`http://localhost/api/v1/x${q}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const inA = `?workspace=${A}`;
const inB = `?workspace=${B}`;
async function refused(p, code, status, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    if (status) assert.equal(e.status, status, e.message);
    if (words) assert.ok(e.message.includes(words), `${JSON.stringify(e.message)} should say ${JSON.stringify(words)}`);
    return true;
  });
}
const threadRow = (id, tenant_id, over = {}) => ({
  id,
  tenant_id,
  user_id: USER,
  title: "Who booked this week?",
  scope: null,
  last_at: "2026-09-10T00:00:00Z",
  created_at: "2026-09-10T00:00:00Z",
  ...over,
});
const sessionRow = (over = {}) => ({
  id: sessionHashOf(S),
  tenant_id: A,
  user_id: USER,
  thread_id: T1,
  conversation_id: "conv_0001",
  token_cipher: "sealed-elsewhere",
  token_expires_at: "2026-10-03T13:00:00.000Z",
  surface: "today",
  scope: null,
  context: null,
  language: "en",
  turn_key: null,
  turn_started_at: null,
  duration_s: null,
  created_at: "2026-10-03T12:00:00.000Z",
  ended_at: null,
  ...over,
});
const tablesFor = (over = {}) => ({
  memberships: both("viewer", "operator"),
  ask_threads: [],
  ask_messages: [],
  ask_voice_sessions: [],
  ...over,
});

test("the three declare their policy: a start every member's, counted as voice conversations; the page's move counted with the aggregates; an end never refused", () => {
  assert.deepEqual(voice.POST.policy, {
    kind: "write",
    scope: "workspace",
    role: "viewer",
    rate: "voice",
    spend: false,
  });
  assert.deepEqual(page.POST.policy, {
    kind: "write",
    scope: "workspace",
    role: "viewer",
    rate: "aggregate",
    spend: false,
  });
  assert.deepEqual(end.POST.policy, { kind: "write", scope: "workspace", role: "viewer", rate: null, spend: false });
});

test("a conversation starts: the edge is asked once with a signed token for its door, a thread is made, one row is written as the member with the access token sealed (read once) and dated by its own expiry, and the answer carries the plain id, the agent's token and the conversation's id, never the cipher", async () => {
  const tables = tablesFor();
  const net = wired(() => json(200, { ok: true, token: "eyJ.conversation.token", conversation_id: "conv_0001" }));
  const ctx = ctxFor(tables);
  const out = await voice.POST.run(send("POST", { language: "es", surface: "today" }, inA), ctx);

  assert.match(out.session, /^[0-9a-f]{64}$/);
  assert.equal(out.token, "eyJ.conversation.token");
  assert.equal(out.conversation_id, "conv_0001");
  assert.equal(out.title, "Voice");
  assert.deepEqual(Object.keys(out).sort(), ["conversation_id", "session", "thread_id", "title", "token"]);

  assert.equal(tables.ask_threads.length, 1, "a thread, since none was named");
  assert.deepEqual(
    [tables.ask_threads[0].tenant_id, tables.ask_threads[0].user_id, tables.ask_threads[0].title],
    [A, USER, "Voice"],
  );
  assert.equal(out.thread_id, tables.ask_threads[0].id);

  assert.equal(tables.ask_voice_sessions.length, 1, "one row");
  const row = tables.ask_voice_sessions[0];
  assert.equal(
    row.id,
    createHash("sha256").update(out.session).digest("hex"),
    "keyed by the hash of what the browser holds",
  );
  assert.deepEqual(
    [row.tenant_id, row.user_id, row.thread_id, row.conversation_id, row.surface, row.language, row.scope, row.context],
    [A, USER, out.thread_id, "conv_0001", "today", "es", null, null],
  );
  assert.notEqual(row.token_cipher, JWT, "sealed, never the token itself");
  assert.equal(openToken(row.token_cipher, process.env.ASK_VOICE_SECRET), JWT, "and opened by the secret alone");
  assert.equal(openToken(row.token_cipher, "another-secret"), null);
  assert.equal(row.token_expires_at, new Date(EXP * 1000).toISOString(), "dated by the token's own exp");
  assert.equal(ctx.tokenReads, 1, "the access token is read back once, after the wrapper verified it");
  assert.ok(!JSON.stringify(out).includes(row.token_cipher), "the cipher stays in the row");

  assert.equal(net.calls.length, 1);
  const [call] = net.calls;
  assert.equal(call.url, EDGE);
  assert.equal(call.method, "POST");
  assert.deepEqual(call.body, { tenant_id: A, user_id: USER });
  assert.ok(call.headers["x-edge-token"], "a token minted for the door, the workspace and the person");
  assert.equal("x-diag-key" in call.headers, false, "and no shared key beside it");
});

test("a thread named must exist and be this workspace's, before the edge is asked; the scope and a context the schema refuses are handled as a typed question's", async () => {
  const tables = tablesFor({ ask_threads: [threadRow(T1, A)] });
  const net = silent();
  await refused(voice.POST.run(send("POST", { thread_id: "nope" }, inA), ctxFor(tables)), "not_found", 404);
  await refused(voice.POST.run(send("POST", { thread_id: T1 }, inB), ctxFor(tables)), "not_found", 404, "not yours");
  await refused(
    voice.POST.run(send("POST", { thread_id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd9" }, inA), ctxFor(tables)),
    "not_found",
    404,
    "does not exist",
  );
  assert.equal(net.calls.length, 0);
  assert.equal(tables.ask_voice_sessions.length, 0);

  const kept = wired(() => json(200, { ok: true, token: "tok", conversation_id: "conv_2" }));
  const out = await voice.POST.run(
    send(
      "POST",
      { thread_id: T1, scope: { kind: "person", id: "k1", label: "Rosa" }, context: { not: "a context" } },
      inA,
    ),
    ctxFor(tables),
  );
  assert.equal(out.thread_id, T1, "the thread named is kept");
  assert.equal(out.title, "Who booked this week?");
  assert.equal(tables.ask_threads.length, 1, "and no new one is made");
  assert.deepEqual(tables.ask_voice_sessions[0].scope, { kind: "person", id: "k1", label: "Rosa" });
  assert.equal(tables.ask_voice_sessions[0].context, null, "a context that is not one is none");
  assert.equal(kept.calls.length, 1);
});

test("the edge's no: a workspace that may not spend is 402 in the edge's words; an edge without the key, or one that could not be reached, is 503 upstream_voice; nothing is made for a refusal", async () => {
  const tables = tablesFor();
  wired(() =>
    json(402, {
      ok: false,
      error: "payment_required",
      detail: "Voice is off while this workspace is paused or its plan has ended.",
    }),
  );
  await refused(
    voice.POST.run(send("POST", {}, inA), ctxFor(tables)),
    "payment_required",
    402,
    "Voice is off while this workspace is paused",
  );
  wired(() => json(503, { ok: false, error: "no_provider_key" }));
  await refused(voice.POST.run(send("POST", {}, inA), ctxFor(tables)), "upstream_voice", 503, "not set up yet");
  wired(() => {
    throw new TypeError("fetch failed");
  });
  await refused(voice.POST.run(send("POST", {}, inA), ctxFor(tables)), "upstream_voice", 503, "could not be reached");
  wired(() => json(200, { ok: true }));
  await refused(voice.POST.run(send("POST", {}, inA), ctxFor(tables)), "upstream_voice", 502, "no token");
  assert.deepEqual(
    [tables.ask_threads.length, tables.ask_voice_sessions.length],
    [0, 0],
    "no thread and no row for a refusal",
  );
});

test("the page follows the person: the row keeps the new page's context and surface, and it is warmed; a session that is not one, or is not there, is refused", async () => {
  const tables = tablesFor({
    ask_threads: [threadRow(T1, A)],
    ask_voice_sessions: [sessionRow()],
    tenants: [{ id: A, name: "Harbor", timezone: "America/New_York" }],
    conversations: [
      {
        id: C1,
        tenant_id: A,
        contact_id: null,
        state: "open",
        paused_until: null,
        snooze_until: null,
        assignee_user_id: null,
        last_wa_inbound_at: null,
        last_message_at: "2026-09-10T00:00:00Z",
        contacts: {
          id: "k1",
          display_name: "Rosa",
          wa_profile_name: null,
          phone_e164: null,
          consent: "opted_in",
          dnc: false,
        },
      },
    ],
    messages: [],
    escalations: [],
  });
  const context = {
    v: 1,
    surface: "inbox",
    route: "inbox",
    view: "all",
    focus: null,
    rows: [{ kind: "thread", id: C1 }],
    askedAt: 1,
  };
  const before = Date.now();
  const moved = ctxFor(tables);
  const out = await page.POST.run(send("POST", { session: S, context }, inA), moved);
  assert.deepEqual(Object.keys(out), ["stamp"]);
  assert.ok(out.stamp >= before && out.stamp <= Date.now());
  assert.deepEqual(tables.ask_voice_sessions[0].context, context, "the row keeps the page");
  assert.equal(tables.ask_voice_sessions[0].surface, "inbox");
  assert.ok(
    moved.supabase.seen.some((q) => q.table === "conversations"),
    "and the page was read",
  );

  await refused(page.POST.run(send("POST", { session: "short", context }, inA), ctxFor(tables)), "validation", 400);
  await refused(
    page.POST.run(send("POST", { session: "cd".repeat(32), context }, inA), ctxFor(tables)),
    "not_found",
    404,
    "not yours or is over",
  );
});

test("the end: the member's row is ended, and ending it again, or one already gone, is still ok", async () => {
  const tables = tablesFor({ ask_threads: [threadRow(T1, A)], ask_voice_sessions: [sessionRow()] });
  assert.deepEqual(await end.POST.run(send("POST", { session: S }, inA), ctxFor(tables)), { ok: true });
  assert.ok(tables.ask_voice_sessions[0].ended_at, "ended");
  const first = tables.ask_voice_sessions[0].ended_at;
  assert.deepEqual(await end.POST.run(send("POST", { session: S }, inA), ctxFor(tables)), { ok: true });
  assert.ok(tables.ask_voice_sessions[0].ended_at >= first);
  assert.deepEqual(await end.POST.run(send("POST", { session: "cd".repeat(32) }, inA), ctxFor(tables)), { ok: true });
  await refused(end.POST.run(send("POST", { session: "nope" }, inA), ctxFor(tables)), "validation", 400);
});

test("the end keeps how it went (00300): the reason, one of the row's set, and the two timings from the tap; a word outside the set (an older bundle's, the vendor's) ends the row all the same and keeps no reason, so either app may deploy first; a timing past the conversation's ceiling is refused", async () => {
  const tables = tablesFor({ ask_threads: [threadRow(T1, A)], ask_voice_sessions: [sessionRow()] });
  assert.deepEqual(
    await end.POST.run(
      send("POST", { session: S, reason: "button", connect_ms: 2100, first_audio_ms: 3000 }, inA),
      ctxFor(tables),
    ),
    { ok: true },
  );
  const row = tables.ask_voice_sessions[0];
  assert.ok(row.ended_at);
  assert.equal(row.end_reason, "button");
  assert.equal(row.connect_ms, 2100);
  assert.equal(row.first_audio_ms, 3000);
  // The far side ended it before any audio: the timing says so.
  const again = tablesFor({ ask_threads: [threadRow(T1, A)], ask_voice_sessions: [sessionRow()] });
  await end.POST.run(
    send("POST", { session: S, reason: "vendor", connect_ms: 1800, first_audio_ms: null }, inA),
    ctxFor(again),
  );
  assert.equal(again.ask_voice_sessions[0].end_reason, "vendor");
  assert.equal(again.ask_voice_sessions[0].first_audio_ms, null);
  // An older bundle's word: the row is ended, no reason kept, nothing refused.
  const older = tablesFor({ ask_threads: [threadRow(T1, A)], ask_voice_sessions: [sessionRow()] });
  assert.deepEqual(await end.POST.run(send("POST", { session: S, reason: "stopped" }, inA), ctxFor(older)), {
    ok: true,
  });
  assert.ok(older.ask_voice_sessions[0].ended_at, "ended all the same");
  assert.ok(!older.ask_voice_sessions[0].end_reason, "and no reason outside the set is kept");
  await refused(
    end.POST.run(send("POST", { session: S, connect_ms: 700_000 }, inA), ctxFor(tables)),
    "validation",
    400,
  );
});
