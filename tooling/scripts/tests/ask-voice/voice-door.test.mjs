/**
 * The brain door, run: the custom LLM endpoint ElevenLabs calls (apps/dashboard/src/server/ask/voice-door.ts) over a
 * database in memory, with the Auth server stood in for and the model scripted (setAskPorts). The session's row is
 * written the way the voice route writes it (createVoiceSession), so the token the door opens was sealed by the real
 * cipher. What is proved: the two credentials in front of the body, the spoken refusals (never a status once the row
 * is known), one Ask turn run as the member and streamed in the chat-completions shape the vendor reads (the
 * contract, sources §1), the buffer words while the model is quiet, and one turn however many requests.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.ELEVENLABS_LLM_SECRET = "agent-secret-for-this-file";
process.env.ASK_VOICE_SECRET = "voice-secret-for-this-file";
delete process.env.ASK_MODEL;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { voiceDoor } = await import(at("apps/dashboard/src/server/ask/voice-door.ts"));
const { createVoiceSession } = await import(at("apps/dashboard/src/server/ask/voice-session.ts"));
const { setAskPorts } = await import(at("apps/dashboard/src/server/ask/loop.ts"));
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const { readerCache } = await import(at("apps/dashboard/src/server/readers/index.ts"));

beforeEach(() => setRateStore(memoryStore()));
beforeEach(() => readerCache.clear());
afterEach(() => setAskPorts(null));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const T1 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const SECRET = process.env.ASK_VOICE_SECRET;
const AT = "2026-10-03T12:00:00.000Z";
/** The token's expiry, an hour from the run's own clock: the door compares it with now. */
const LATER = new Date(Date.now() + 3_600_000).toISOString();
const EARLIER = new Date(Date.now() - 3_600_000).toISOString();
const JWT = "header-for-this-file.payload-for-this-file.signature-for-this-file";
const QUESTION = "Who needs me right now?";
const HEADLINE = "Ana needs you, since noon.";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* -------------------------------- the world ------------------------------- */

const membership = { user_id: USER, tenant_id: A, role: "viewer", tenants: { slug: "harbor" }, created_at: AT };
const threadRow = { id: T1, tenant_id: A, user_id: USER, title: "Voice", scope: null, last_at: AT, created_at: AT };

/**
 * A member, their voice thread and one session row written as the voice route writes it; `session` overrides what
 * the route would write, `row` what the door would find later (an end, a claim).
 */
async function world({ session = {}, row = {} } = {}) {
  const tables = {
    memberships: [membership],
    tenants: [{ id: A, name: "Harbor", timezone: "America/New_York" }],
    tenant_config: [{ tenant_id: A, config: {}, version: 1 }],
    policies: [],
    ask_threads: [{ ...threadRow }],
    ask_messages: [],
    ask_voice_sessions: [],
  };
  const db = fakeDb(tables);
  const ctx = { supabase: db, userId: USER, email: "ada@example.com", metadata: {} };
  const { plain } = await createVoiceSession(ctx, { tenantId: A, role: "viewer" }, SECRET, {
    threadId: T1,
    conversationId: "conv_0001",
    accessToken: JWT,
    tokenExpiresAt: LATER,
    surface: "today",
    scope: null,
    context: null,
    language: "en",
    ...session,
  });
  Object.assign(tables.ask_voice_sessions[0], row);
  /** The Auth server stood in for: the token the row sealed opens the member; anything else opens nobody. */
  const verify = async (token) =>
    token === JWT
      ? { supabase: db, claims: { sub: USER, email: "ada@example.com" }, error: null }
      : { supabase: db, claims: null, error: { message: "bad token" } };
  return { tables, db, S: plain, deps: { service: db, verify, pulseMs: 20, pollMs: 5 } };
}

/** The model, scripted: one round that writes the answer as its format, after `waitMs` of silence. */
function model(waitMs = 0, headline = HEADLINE, list = { style: "bullets", entries: [] }) {
  const none = { kind: "none", id: "", label: "" };
  const written = JSON.stringify({
    say: { headline, detail: "" },
    show: { figures: [], items: [], breakdown: { label: "", total: 0, parts: [], source: none }, list },
    do: { open: null, next: [] },
    language: "en",
  });
  const asked = [];
  setAskPorts({
    round: async (call, onText) => {
      // The question's message: the turn's words first (the clock, the person, the spoken register), the question last.
      const q = call.request.messages.at(-1).content;
      asked.push(Array.isArray(q) ? q.at(-1).text : String(q));
      if (waitMs) await sleep(waitMs);
      onText(written);
      return {
        blocks: [{ type: "text", id: "", name: "", text: written, json: "" }],
        stopReason: "end_turn",
        streamError: null,
      };
    },
    shape: async () => "",
  });
  return asked;
}

/* -------------------------------- the knock ------------------------------- */

/** The vendor's request, in the shape the sources quote (§1): the agent's history, the model's name, a user_id label, the extra body. */
const body = (S, over = {}) => ({
  messages: [
    { role: "system", content: "You are the mouth of the workspace assistant." },
    { role: "user", content: QUESTION },
  ],
  model: "custom-llm",
  temperature: 0,
  max_tokens: -1,
  stream: true,
  stream_options: { include_usage: true },
  user_id: "a label the vendor stores and nobody verifies",
  elevenlabs_extra_body: { chanlytics_session: S },
  ...over,
});
const knock = (w, b = body(w.S), headers = { "x-chanlytics-agent": process.env.ELEVENLABS_LLM_SECRET }) =>
  voiceDoor(
    new Request("http://localhost/api/ask/voice/llm/chat/completions", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(b),
    }),
    w.deps,
  );
/** The stream read whole, as frames: each `data:` payload parsed, the last the literal [DONE]. */
async function frames(res) {
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "text/event-stream; charset=utf-8");
  const text = await res.text();
  const out = text
    .split("\n\n")
    .filter(Boolean)
    .map((f) => {
      assert.match(f, /^data: /, `a frame is one data line: ${f}`);
      const d = f.slice("data: ".length);
      return d === "[DONE]" ? d : JSON.parse(d);
    });
  assert.equal(out.at(-1), "[DONE]", "the stream ends with [DONE]");
  return out;
}
/** What the voice would speak: every chunk's content, in order (the stop carries none). */
const spoken = (fs) =>
  fs
    .filter((f) => f !== "[DONE]" && typeof f.choices[0].delta.content === "string")
    .map((f) => f.choices[0].delta.content);

/* --------------------------------- the door ------------------------------- */

test("no secret, or a wrong one, is 401 before the body is read; a session id of the wrong shape, an unknown one, and a token that is not the row's member are 403; nothing is stored", async () => {
  const w = await world();
  model();
  assert.equal((await knock(w, "not even json", {})).status, 401);
  assert.equal((await knock(w, body(w.S), { "x-chanlytics-agent": "not-the-secret" })).status, 401);
  assert.equal((await knock(w, body("short"))).status, 403);
  assert.equal((await knock(w, body(w.S, { elevenlabs_extra_body: {} }))).status, 403);
  assert.equal((await knock(w, body("cd".repeat(32)))).status, 403);
  // The row belongs to another person than the token opens: the row says USER, the Auth server says OTHER.
  const other = {
    ...w,
    deps: { ...w.deps, verify: async () => ({ supabase: w.db, claims: { sub: OTHER }, error: null }) },
  };
  assert.equal((await knock(other)).status, 403);
  assert.equal(w.tables.ask_messages.length, 0, "nothing stored for any of it");
});

test("a row whose token has expired, or that the Auth server refuses, speaks a reconnect and is ended; an ended row says the conversation is gone; nothing is stored", async () => {
  model();
  const expired = await world({ session: { tokenExpiresAt: EARLIER } });
  assert.deepEqual(spoken(await frames(await knock(expired))), ["Let me reconnect."]);
  assert.ok(expired.tables.ask_voice_sessions[0].ended_at, "the row is ended");

  const refused = await world();
  refused.deps.verify = async () => ({
    supabase: refused.db,
    claims: null,
    error: { status: 401, message: "revoked" },
  });
  assert.deepEqual(spoken(await frames(await knock(refused))), ["Let me reconnect."]);
  assert.ok(refused.tables.ask_voice_sessions[0].ended_at);

  const ended = await world({ session: { language: "es" }, row: { ended_at: AT } });
  assert.deepEqual(spoken(await frames(await knock(ended))), [
    "Perdí el hilo de esta conversación. Empieza de nuevo, por favor.",
  ]);
  assert.equal(ended.tables.ask_voice_sessions[0].ended_at, AT, "ended once, as it was");
  for (const w of [expired, refused, ended]) assert.equal(w.tables.ask_messages.length, 0);
});

test("no user message speaks a refusal, never a 400, and nothing is stored; a spent count speaks a line, never a 429", async () => {
  const w = await world();
  model();
  assert.deepEqual(spoken(await frames(await knock(w, body(w.S, { messages: [{ role: "system", content: "x" }] })))), [
    "I did not catch that. Say it again?",
  ]);
  assert.deepEqual(spoken(await frames(await knock(w, body(w.S, { messages: [{ role: "user", content: "   " }] })))), [
    "I did not catch that. Say it again?",
  ]);
  assert.equal(w.tables.ask_messages.length, 0);
  setRateStore({ take: async () => ({ allowed: false, retryAfterS: 30 }) });
  assert.deepEqual(spoken(await frames(await knock(w))), ["Give me a moment before the next question."]);
  assert.equal(w.tables.ask_messages.length, 0);
});

test("silence (the vendor's \"...\" after turn_timeout, or a transcript with no word in it) is answered with the buffer words, which the vendor voices as nothing: the session's mic is muted, so this is the vendor's re-engage and not a person; no turn runs and nothing is stored", async () => {
  const w = await world({ session: { language: "es" } });
  const asked = model();
  for (const content of ["...", "…", " . , ! "]) {
    assert.deepEqual(spoken(await frames(await knock(w, body(w.S, { messages: [{ role: "user", content }] })))), [
      "... ",
    ]);
  }
  assert.deepEqual(asked, [], "the model was not asked");
  assert.equal(w.tables.ask_messages.length, 0);
});

test("a good request: the vendor's body as the sources quote it is accepted, the turn runs as the member, the Say streams as chat-completion chunks then a stop then [DONE], the thread holds the question and the answer with the spoken shape, and the voice thread takes the question as its title", async () => {
  const w = await world();
  const asked = model();
  const fs = await frames(await knock(w));
  for (const f of fs.slice(0, -1)) {
    assert.equal(f.object, "chat.completion.chunk");
    assert.equal(f.choices[0].index, 0);
  }
  assert.deepEqual(spoken(fs), [HEADLINE], "the headline as one chunk: the preview arrived whole");
  assert.equal(fs.at(-2).choices[0].finish_reason, "stop", "then the stop");
  assert.deepEqual(fs.at(-2).choices[0].delta, {});
  assert.deepEqual(asked, [QUESTION], "only the last user message reaches the turn, as the question");
  assert.deepEqual(
    w.tables.ask_messages.map((m) => [m.role, m.thread_id, m.user_id]),
    [
      ["user", T1, USER],
      ["assistant", T1, USER],
    ],
    "one turn stored, as the member",
  );
  const answer = w.tables.ask_messages[1].content;
  assert.equal(answer.answer.say.headline, HEADLINE);
  assert.equal(answer.shape.spoken, true, "the turn knew it was spoken");
  assert.equal(w.tables.ask_threads[0].title, "Who needs me right now?", "the first question titles the voice thread");
});

test("only the last user message is read: earlier turns in the vendor's history change nothing the turn is asked, and a retry carrying the partial answer as an assistant message is the same turn", async () => {
  const w = await world();
  const asked = model();
  const history = [
    { role: "system", content: "x" },
    { role: "user", content: "What did Luis say?" },
    { role: "assistant", content: "Luis asked for Tuesday." },
    { role: "user", content: [{ type: "text", text: QUESTION }] },
    { role: "assistant", content: "Reading today… " },
  ];
  await frames(await knock(w, body(w.S, { messages: history })));
  assert.deepEqual(asked, [QUESTION]);
  assert.equal(w.tables.ask_messages[0].content.text, QUESTION);
});

test("a quiet model is pulsed: while nothing speakable has gone out for pulseMs the vendor's buffer words go out, and none once the answer has", async () => {
  const w = await world();
  model(120);
  const words = spoken(await frames(await knock(w)));
  const first = words.indexOf(HEADLINE);
  assert.ok(first >= 3, `at least three pulses before the headline, saw ${JSON.stringify(words)}`);
  assert.ok(
    words.slice(0, first).every((x) => x === "... "),
    "and nothing but the buffer words before it",
  );
  assert.deepEqual(words.slice(first), [HEADLINE], "none after the answer");
});

test("one turn, however many requests: the same words at the same place, asked twice at once, run the model once and store one turn; the second follows the thread and speaks the first's answer", async () => {
  const w = await world();
  const asked = model(40);
  const [a, b] = await Promise.all([knock(w), knock(w)]);
  const [wa, wb] = [spoken(await frames(a)), spoken(await frames(b))];
  assert.deepEqual(asked, [QUESTION], "the model heard the question once");
  assert.equal(w.tables.ask_messages.length, 2, "one question and one answer stored");
  const said = (ws) => ws.filter((x) => x !== "... ").join("");
  assert.equal(said(wa), HEADLINE);
  assert.equal(said(wb), HEADLINE, "the follower speaks what the owner stored");
});

test("a list is read once the answer lands, after the Say, an entry a sentence and a step with its number; a follower speaks it too", async () => {
  const w = await world();
  model(40, HEADLINE, { style: "numbers", entries: ["Reply to Nora", "Call Sam back"] });
  const [a, b] = await Promise.all([knock(w), knock(w)]);
  const said = (ws) => ws.filter((x) => x !== "... ");
  assert.deepEqual(said(spoken(await frames(a))), [HEADLINE, " 1. Reply to Nora. 2. Call Sam back."]);
  assert.deepEqual(said(spoken(await frames(b))), [`${HEADLINE} 1. Reply to Nora. 2. Call Sam back.`]);
});

test("the same words at another place in the conversation are a new turn", async () => {
  const w = await world();
  const asked = model();
  await frames(await knock(w));
  const again = body(w.S, {
    messages: [
      { role: "system", content: "x" },
      { role: "user", content: QUESTION },
      { role: "assistant", content: HEADLINE },
      { role: "user", content: QUESTION },
    ],
  });
  await frames(await knock(w, again));
  assert.deepEqual(asked, [QUESTION, QUESTION], "asked twice, answered twice");
  assert.equal(w.tables.ask_messages.length, 4);
});

/* ------------------------------ the review's cases ------------------------------ */

test("an Auth server that cannot be asked keeps the row: a retryable error speaks a wait, never a reconnect, and nothing is ended", async () => {
  model();
  const w = await world();
  w.deps.verify = async () => ({
    supabase: w.db,
    claims: null,
    error: { status: 503, name: "AuthRetryableFetchError", message: "fetch failed" },
  });
  assert.deepEqual(spoken(await frames(await knock(w))), ["Give me a moment before the next question."]);
  assert.ok(!w.tables.ask_voice_sessions[0].ended_at, "the row stands");
  assert.equal(w.tables.ask_messages.length, 0);
});

test("a database that cannot be asked for the member speaks a failure and keeps the row: never a status once the row is known", async () => {
  model();
  const w = await world();
  const down = {
    from() {
      throw new Error("database down");
    },
    rpc() {
      throw new Error("database down");
    },
  };
  w.deps.verify = async () => ({ supabase: down, claims: { sub: USER, email: "ada@example.com" }, error: null });
  assert.deepEqual(spoken(await frames(await knock(w))), ["Something went wrong on my side. Try again in a moment."]);
  assert.ok(!w.tables.ask_voice_sessions[0].ended_at, "the row stands");
});

test("the second question, asked twice at once, speaks the second answer in both streams, never the first's", async () => {
  const w = await world();
  model(0, "Ana needs you, since noon.");
  await frames(await knock(w));
  assert.equal(w.tables.ask_messages.length, 2, "the first turn stored");
  const asked = model(40, "Luis needs you at two.");
  const second = body(w.S, {
    messages: [
      { role: "system", content: "x" },
      { role: "user", content: QUESTION },
      { role: "assistant", content: "Ana needs you, since noon." },
      { role: "user", content: "And now?" },
    ],
  });
  const [a, b] = await Promise.all([knock(w, second), knock(w, second)]);
  // The turn runs as the stream is read: both are read before anything is judged.
  const [wa, wb] = [spoken(await frames(a)), spoken(await frames(b))];
  const said = (ws) => ws.filter((x) => x !== "... ").join("");
  assert.deepEqual(asked, ["And now?"], "the second turn ran once");
  assert.equal(said(wa), "Luis needs you at two.");
  assert.equal(said(wb), "Luis needs you at two.", "the follower waits for this turn's answer, never the first's");
  assert.equal(w.tables.ask_messages.length, 4);
});

test("a model slow to its first words hears the door's own, One moment… as a read's label, once, before the answer", async () => {
  const w = await world();
  model(60);
  w.deps.firstWordsMs = 15;
  const words = spoken(await frames(await knock(w)));
  assert.equal(words[0], "One moment… ", `the door's first words, saw ${JSON.stringify(words)}`);
  assert.equal(words.filter((x) => x === "One moment… ").length, 1, "once");
  assert.equal(words.at(-1), HEADLINE);
});

test("more words than a turn takes speak the Line's own line, in the person's language, and nothing is stored", async () => {
  const w = await world({ session: { language: "es" } });
  model();
  const long = "palabra ".repeat(200);
  assert.deepEqual(spoken(await frames(await knock(w, body(w.S, { messages: [{ role: "user", content: long }] })))), [
    "Eso es más de lo que puedo tomar de una vez. Pregúntalo en dos.",
  ]);
  assert.equal(w.tables.ask_messages.length, 0);
});

test("a Say the turn takes back (an answer written beside a read) cannot be unspoken: the real answer is spoken whole after a breath, and it is what is stored", async () => {
  const w = await world();
  Object.assign(w.tables, { conversations: [], messages: [], contacts: [], calls: [] });
  const none = { kind: "none", id: "", label: "" };
  const written = (headline) =>
    JSON.stringify({
      say: { headline, detail: "" },
      show: { figures: [], items: [], breakdown: { label: "", total: 0, parts: [], source: none } },
      do: { open: null, next: [] },
      language: "en",
    });
  const first = written("It is probably Ana.");
  const final = written(HEADLINE);
  let round = 0;
  setAskPorts({
    round: async (_call, onText) => {
      round += 1;
      if (round === 1) {
        onText(first);
        return {
          blocks: [
            { type: "text", id: "", name: "", text: first, json: "" },
            { type: "tool_use", id: "t-inbox.list", name: "inbox", input: { action: "list", filter: "recent" } },
          ],
          stopReason: "tool_use",
          streamError: null,
        };
      }
      onText(final);
      return {
        blocks: [{ type: "text", id: "", name: "", text: final, json: "" }],
        stopReason: "end_turn",
        streamError: null,
      };
    },
    shape: async () => "",
  });
  const words = spoken(await frames(await knock(w))).filter((x) => x !== "... ");
  assert.equal(
    words[0],
    "It is probably Ana.",
    `the first Say, spoken before it was taken back; saw ${JSON.stringify(words)}`,
  );
  const at = words.indexOf(HEADLINE);
  assert.ok(at > 0, `the real answer spoken whole, saw ${JSON.stringify(words)}`);
  assert.equal(words[at - 1], " ", "after a breath");
  assert.equal(w.tables.ask_messages.at(-1).content.answer.say.headline, HEADLINE, "the stored answer is the real one");
});

test("the vendor's own re-engage spends nothing of the person's count: silence and a turn with no words are answered before the count is taken, so a muted session waiting between questions never uses up Ask, and a spent count never speaks its line into the silence", async () => {
  const w = await world();
  model();
  let taken = 0;
  setRateStore({
    take: async () => {
      taken += 1;
      return { allowed: false, retryAfterS: 30 };
    },
  });
  assert.deepEqual(spoken(await frames(await knock(w, body(w.S, { messages: [{ role: "user", content: "..." }] })))), [
    "... ",
  ]);
  assert.deepEqual(spoken(await frames(await knock(w, body(w.S, { messages: [{ role: "system", content: "x" }] })))), [
    "I did not catch that. Say it again?",
  ]);
  assert.equal(taken, 0, "nothing taken for a turn nobody asked");
  assert.deepEqual(spoken(await frames(await knock(w))), ["Give me a moment before the next question."]);
  assert.equal(taken, 1, "a question is counted, as a typed one is");
});
