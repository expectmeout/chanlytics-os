/**
 * The shape of a turn: where the time went and what the model was fed.
 *
 * Phase 0 of Ask Rewired (docs/superpowers/specs/2026-09-25-ask-rewired-design.md, §5.8): the stream parser reads the
 * usage frames, a round keeps its timing and usage, the loop folds them into an AskTurnShape it logs and returns, the
 * route stores it on the turn's row and reads the palette's opened_ms, and the palette's client sends it. Every part is
 * executed here against a scripted model; nothing reaches a network.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "./_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const sse = await import(at("apps/dashboard/src/server/ask/sse.ts"));

test("the parser: message_start is the usage (the input side, the cache counts, the message id); message_delta's stop carries the output side; a start without usage is nothing", () => {
  assert.deepEqual(
    sse.parseFrame(
      'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_01","usage":{"input_tokens":1200,"cache_read_input_tokens":900,"cache_creation_input_tokens":300,"output_tokens":1}}}',
    ),
    { type: "usage", messageId: "msg_01", inputTokens: 1200, cacheReadTokens: 900, cacheCreationTokens: 300 },
  );
  assert.deepEqual(
    sse.parseFrame('data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":42}}'),
    { type: "stop", stopReason: "end_turn", outputTokens: 42 },
  );
  assert.deepEqual(
    sse.parseFrame('data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}'),
    { type: "stop", stopReason: "tool_use", outputTokens: null },
    "a delta without usage still stops; the output side is unknown, never zero",
  );
  assert.equal(sse.parseFrame('data: {"type":"message_start","message":{"id":"msg_02"}}'), null);
});

const { runRound } = await import(at("apps/dashboard/src/server/ask/round.ts"));
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "u1";
const tick = () => new Promise((r) => setTimeout(r, 5));

test("a round keeps its timing (first event, first text, the whole) and its usage (start plus stop), and a scripted or broken stream leaves them honest", async () => {
  async function* stream() {
    await tick();
    yield { type: "usage", messageId: "msg_01", inputTokens: 100, cacheReadTokens: 900, cacheCreationTokens: 0 };
    yield { type: "block_start", index: 0, block: { type: "text" } };
    await tick();
    yield { type: "text", index: 0, text: '{"say": {"headline": "Two' };
    yield { type: "text", index: 0, text: ' wait"}}' };
    yield { type: "block_stop", index: 0 };
    yield { type: "stop", stopReason: "end_turn", outputTokens: 42 };
  }
  const r = await runRound({ tenantId: A, userId: USER, request: {} }, () => {}, stream);
  assert.deepEqual(r.usage, {
    messageId: "msg_01",
    inputTokens: 100,
    cacheReadTokens: 900,
    cacheCreationTokens: 0,
    outputTokens: 42,
  });
  assert.ok(r.timing.firstEventMs >= 0, "the first byte's time");
  assert.ok(r.timing.firstTextMs >= r.timing.firstEventMs, "the first text after the first byte");
  assert.ok(r.timing.totalMs >= r.timing.firstTextMs, "the whole after both");

  async function* silent() {
    yield { type: "block_start", index: 0, block: { type: "tool_use", id: "t1", name: "list_threads" } };
    yield { type: "input_json", index: 0, partial: "{}" };
    yield { type: "block_stop", index: 0 };
    yield { type: "stop", stopReason: "tool_use", outputTokens: null };
  }
  const s = await runRound({ tenantId: A, userId: USER, request: {} }, () => {}, silent);
  assert.equal(s.usage, null, "no usage frame, no usage: never a row of zeros");
  assert.equal(s.timing.firstTextMs, null, "a round that wrote no text has no first text");
  assert.ok(typeof s.timing.firstEventMs === "number");

  async function* nothing() {
    yield { type: "error", message: "gone" };
  }
  const n = await runRound({ tenantId: A, userId: USER, request: {} }, () => {}, nothing);
  assert.deepEqual([n.streamError, n.usage, n.timing.firstTextMs], ["gone", null, null]);
});

test("the cache hit ratio: cache reads over everything the model was fed; nothing fed is null, not zero", async () => {
  const { cacheHitOf } = await import("@chanlytics/contracts");
  assert.equal(cacheHitOf({ input: 100, cache_read: 900, cache_creation: 0, output: 40 }), 0.9);
  assert.equal(cacheHitOf({ input: 0, cache_read: 0, cache_creation: 0, output: 0 }), null);
  assert.equal(cacheHitOf({ input: 100, cache_read: 0, cache_creation: 900, output: 40 }), 0, "a write is not a hit");
});

const { runAskTurn } = await import(at("apps/dashboard/src/server/ask/loop.ts"));
const { buildProposal } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
const { workspaceFacts } = await import(at("apps/dashboard/src/server/ask/prompt.ts"));

const NONE = { kind: "none", id: "", label: "" };
const answerJson = (headline) =>
  JSON.stringify({
    say: { headline, detail: "" },
    show: { figures: [], items: [], breakdown: { label: "", total: 0, parts: [], source: NONE } },
    do: { open: { source: NONE, label: "", now: false }, next: [] },
    language: "en",
  });
const text = (t) => ({ type: "text", id: "", name: "", text: t, json: "" });
const tool = (name, input, id = `t-${name}`) => ({ type: "tool_use", id, name, text: "", json: JSON.stringify(input) });
/** A scripted round with the timing and usage a real one carries. */
const ROUND = (blocks, extra = {}) => ({
  blocks,
  stopReason: "tool_use",
  streamError: null,
  usage: { messageId: "m", inputTokens: 100, cacheReadTokens: 900, cacheCreationTokens: 0, outputTokens: 50 },
  timing: { firstEventMs: 3, firstTextMs: 7, totalMs: 20 },
  ...extra,
});
function scripted(rounds) {
  const requests = [];
  const round = async (c, onText) => {
    requests.push(c.request);
    const r = rounds.shift();
    if (!r) throw new Error("the loop asked for a round the script does not have");
    return typeof r === "function" ? r(c, onText) : r;
  };
  return { round, requests };
}
/** What the loop logged under one event name, parsed. */
async function loggedInfo(event, fn) {
  const lines = [];
  const was = console.log;
  console.log = (s) => {
    try {
      const j = JSON.parse(s);
      if (j.event === event) lines.push(j);
    } catch {
      /* not ours */
    }
  };
  try {
    return { result: await fn(), lines };
  } finally {
    console.log = was;
  }
}
const turnInput = (over = {}) => ({
  ctx: { supabase: fakeDb({}), userId: USER, email: "ada@example.com", params: {} },
  tenantId: A,
  role: "operator",
  facts: workspaceFacts("Harbor", "America/New_York", null, []),
  timezone: "America/New_York",
  personLabel: "ada@example.com (operator)",
  language: "en",
  scope: null,
  surface: "today",
  history: [],
  text: "Who needs me?",
  emit: () => {},
  now: new Date("2026-09-14T14:00:00Z"),
  ...over,
});
/** The ports with the model scripted and every read answered at once, so no fixture is needed. */
const portsOf = (round) => ({
  round,
  shape: async () => "The workspace: Harbor",
  tool: async () => ({ result: JSON.stringify({ threads: [] }), isError: false }),
  propose: buildProposal,
});

test("the loop fills the shape: a read then an answer is two rounds with their times and summed tokens, the tool timed, the first byte and text from round one, the first Say when it streamed, the surface, the scope kind, the follow-up and the palette's opened_ms; logged as ask_turn_shape and returned", async () => {
  const s = scripted([
    ROUND([tool("list_threads", { filter: "recent" })]),
    (c, onText) => {
      const json = answerJson("Nobody is waiting.");
      onText(json);
      return ROUND([text(json)], { stopReason: "end_turn" });
    },
  ]);
  const { result: r, lines } = await loggedInfo("ask_turn_shape", () =>
    runAskTurn(
      turnInput({
        surface: "reports",
        scope: { kind: "call", id: "c1", label: "a call" },
        history: [
          { role: "user", text: "earlier" },
          { role: "assistant", text: "an answer" },
        ],
        openedMs: 4200,
        sinceLastMs: 30_000,
      }),
      portsOf(s.round),
    ),
  );
  assert.equal(r.failed, false, r.failure ?? "");
  const sh = r.shape;
  assert.equal(sh.v, 1);
  assert.deepEqual(
    [sh.surface, sh.scope_kind, sh.follow_up, sh.since_last_ms, sh.opened_ms],
    ["reports", "call", true, 30_000, 4200],
  );
  assert.deepEqual([sh.rounds, sh.rounds_ms], [2, [20, 20]]);
  assert.deepEqual(
    sh.tokens,
    { input: 200, cache_read: 1800, cache_creation: 0, output: 100 },
    "summed over the rounds",
  );
  assert.equal(sh.cache_hit, 0.9);
  assert.equal(sh.cap_hits, 0);
  assert.equal(sh.format, true);
  assert.deepEqual(
    sh.tools_ms.map((t) => t.name),
    ["list_threads"],
  );
  assert.ok(sh.tools_ms[0].ms >= 0);
  assert.ok(sh.first_byte_ms >= 3 && sh.first_byte_ms < 5_000, "round one's first event, from the turn's start");
  assert.ok(
    sh.first_text_ms >= 7 && sh.first_text_ms >= sh.first_byte_ms,
    "round one's first text, from the turn's start",
  );
  assert.ok(typeof sh.first_say_ms === "number" && sh.first_say_ms >= 0, "the Say streamed in round two");
  assert.ok(sh.final_ms >= sh.first_say_ms);
  assert.equal(sh.context_ms >= 0, true);
  assert.deepEqual([sh.cross_page, sh.warm, sh.context_rows, sh.context_chars], [[], "none", null, null]);
  assert.equal(typeof sh.model, "string");
  assert.equal(sh.effort, "low");
  assert.equal(lines.length, 1, "logged once");
  assert.deepEqual([lines[0].tenant, lines[0].rounds, lines[0].cache_hit, lines[0].opened_ms], [A, 2, 0.9, 4200]);
  assert.deepEqual(lines[0].tools, ["list_threads"], "the log keeps the tools list it always had");
});

test("a turn answered without a Say has none; a scripted round without timing or usage leaves the shape honest, not zero", async () => {
  const s = scripted([{ blocks: [text(answerJson("Nobody is waiting."))], stopReason: "end_turn", streamError: null }]);
  const r = await runAskTurn(turnInput(), portsOf(s.round));
  assert.equal(r.failed, false, r.failure ?? "");
  const sh = r.shape;
  assert.deepEqual([sh.first_byte_ms, sh.first_text_ms, sh.first_say_ms], [null, null, null]);
  assert.deepEqual(sh.tokens, { input: 0, cache_read: 0, cache_creation: 0, output: 0 });
  assert.equal(sh.cache_hit, null);
  assert.equal(sh.rounds_ms.length, 1, "a round without timing is still timed by the loop's own clock");
  assert.deepEqual([sh.follow_up, sh.since_last_ms, sh.opened_ms], [false, null, null]);
});

const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const { setAskPorts } = await import(at("apps/dashboard/src/server/ask/loop.ts"));
const askRoute = await import(at("apps/dashboard/app/api/v1/ask/route.ts"));
const { readerCache } = await import(at("apps/dashboard/src/server/readers/index.ts"));
const { runTool } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
beforeEach(() => setRateStore(memoryStore()));
// The workspace's facts are kept across turns in the module: each test starts with none kept.
beforeEach(() => readerCache.clear());

const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const membership = (tenant_id, role, slug, created_at) => ({
  user_id: USER,
  tenant_id,
  role,
  tenants: { slug },
  created_at,
});
const ctxFor = (tables) => ({ supabase: fakeDb(tables, {}), userId: USER, email: "ada@example.com", params: {} });
const post = (body) =>
  new Request(`http://localhost/api/v1/x?workspace=${A}`, { method: "POST", body: JSON.stringify(body) });
const routeTables = () => ({
  memberships: [
    membership(A, "operator", "harbor", "2026-01-01T00:00:00Z"),
    membership(B, "viewer", "bayside", "2026-02-01T00:00:00Z"),
  ],
  tenants: [{ id: A, name: "Harbor", timezone: "America/New_York" }],
  tenant_config: [{ tenant_id: A, config: {}, version: 1 }],
  policies: [],
  ask_threads: [],
  ask_messages: [],
});

test("the route: the shape is stored on the turn's row with the palette's opened_ms; a second question on the thread is a follow-up with the time since the last turn; a bad opened_ms, or one past an hour, is nothing, never a refusal", async () => {
  const tables = routeTables();
  const written = answerJson("Nobody has booked this week yet.");
  setAskPorts({
    round: async (call, onText) => {
      onText(written);
      return ROUND([text(written)], { stopReason: "end_turn" });
    },
    shape: async () => "",
  });
  try {
    const first = await askRoute.POST.run(
      post({ text: "Who booked this week?", surface: "today", opened_ms: 4200 }),
      ctxFor(tables),
    );
    const lines = (await first.text())
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    const threadId = lines[0].id;
    const stored = tables.ask_messages[1].content;
    assert.equal(stored.shape.v, 1, "the shape rides on the turn's row");
    assert.deepEqual([stored.shape.opened_ms, stored.shape.follow_up, stored.shape.since_last_ms], [4200, false, null]);
    assert.equal(stored.shape.rounds, 1);
    assert.equal(stored.shape.cache_hit, 0.9);
    assert.ok(typeof stored.shape.first_say_ms === "number");
    assert.ok(!("shape" in lines[2].message), "the Line's message does not carry it: the row does");

    const again = await askRoute.POST.run(
      post({ text: "And last week?", thread_id: threadId, opened_ms: "soon" }),
      ctxFor(tables),
    );
    await again.text();
    const second = tables.ask_messages[3].content;
    assert.equal(second.shape.follow_up, true);
    assert.ok(
      typeof second.shape.since_last_ms === "number" && second.shape.since_last_ms >= 0,
      "since the previous turn",
    );
    assert.equal(second.shape.opened_ms, null, "a value that is not a number is nothing");

    const late = await askRoute.POST.run(
      post({ text: "And the week before?", thread_id: threadId, opened_ms: 7_200_000 }),
      ctxFor(tables),
    );
    await late.text();
    assert.equal(tables.ask_messages[5].content.shape.opened_ms, null, "past an hour is nothing, not an hour");
  } finally {
    setAskPorts(null);
  }
});

test("since_last_ms is nothing on a thread longer than the read: the read keeps the oldest MESSAGES_CAP rows, so its last is not the previous turn; a short thread keeps the time since its last", async () => {
  const written = answerJson("Nobody has booked this week yet.");
  setAskPorts({
    round: async (call, onText) => {
      onText(written);
      return ROUND([text(written)], { stopReason: "end_turn" });
    },
    shape: async () => "",
  });
  const LONG = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const SHORT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const lastAt = Date.now() - 60_000;
  const tables = routeTables();
  /** A stored thread of `n` rows, a question and its answer in turn, ten minutes apart, the last a minute ago. */
  const seed = (id, n) => {
    tables.ask_threads.push({
      id,
      tenant_id: A,
      user_id: USER,
      title: "Who booked this week?",
      scope: null,
      last_at: new Date(lastAt).toISOString(),
      created_at: new Date(lastAt - n * 600_000).toISOString(),
    });
    for (let i = 0; i < n; i++)
      tables.ask_messages.push({
        id: `${id.slice(0, 8)}-0000-4000-8000-${String(i).padStart(12, "0")}`,
        thread_id: id,
        tenant_id: A,
        user_id: USER,
        role: i % 2 ? "assistant" : "user",
        content: i % 2 ? { v: 2, text: `Answer ${i}.` } : { text: `Question ${i}?` },
        created_at: new Date(lastAt - (n - 1 - i) * 600_000).toISOString(),
      });
  };
  seed(LONG, 60);
  seed(SHORT, 4);
  const shapeOn = (thread) => tables.ask_messages.find((m) => m.thread_id === thread && m.content.shape)?.content.shape;
  try {
    await (await askRoute.POST.run(post({ text: "And last week?", thread_id: LONG }), ctxFor(tables))).text();
    await (await askRoute.POST.run(post({ text: "And last week?", thread_id: SHORT }), ctxFor(tables))).text();
    const long = shapeOn(LONG);
    const short = shapeOn(SHORT);
    assert.ok(long && short, "both turns stored their shape");
    assert.deepEqual(
      [long.follow_up, long.since_last_ms],
      [true, null],
      "sixty rows: the newest may be past the read, so no number",
    );
    assert.equal(short.follow_up, true);
    assert.ok(
      typeof short.since_last_ms === "number" && short.since_last_ms >= 60_000 && short.since_last_ms < 600_000,
      `four rows: the time since the last of them, a minute; got ${short.since_last_ms}`,
    );
  } finally {
    setAskPorts(null);
  }
});

test("the client sends opened_ms with the question when the palette measured one, and nothing when it did not", async () => {
  const { createApi } = await import(at("apps/dashboard/src/client/api.ts"));
  const { askApi } = await import(at("apps/dashboard/src/legacy-bridge/ask/api.ts"));
  const bodies = [];
  const client = createApi({
    fetch: async (_url, init) => {
      bodies.push(JSON.parse(init.body));
      return new Response('{"t":"thread","id":"t1","title":"q"}\n', { status: 200 });
    },
    workspace: () => A,
    onSignedOut() {},
    onChooseWorkspace() {},
    refresh: async () => {},
    now: () => 1_000,
  });
  const api = askApi(client);
  await api.send({ text: "q", threadId: null, scope: null, surface: "today", openedMs: 4200 }, () => {});
  await api.send({ text: "q", threadId: null, scope: null, surface: "today" }, () => {});
  assert.equal(bodies[0].opened_ms, 4200);
  assert.ok(!("opened_ms" in bodies[1]));
});

test("one turn reads the workspace's facts once, on one clock: the route's own read and the tools' reads share the turn cache and its now (tenants, tenant_config, policies each once)", async () => {
  const tables = routeTables();
  const written = answerJson("Hours are nine to five.");
  // The model calls get_settings and list_calls in one round, then answers.
  let rounds = 0;
  // Each read's clock against its readers' clock: a turn keeps one.
  const clocks = [];
  setAskPorts({
    round: async (call, onText) => {
      rounds++;
      if (rounds === 1)
        return ROUND([
          { type: "tool_use", id: "t-get_settings", name: "get_settings", text: "", json: "{}" },
          { type: "tool_use", id: "t-list_calls", name: "list_calls", text: "", json: '{"filter":"recent"}' },
        ]);
      onText(written);
      return ROUND([text(written)], { stopReason: "end_turn" });
    },
    shape: async () => "",
    tool: async (tc, run) => {
      clocks.push(tc.now === tc.rc.now);
      return runTool(tc, run);
    },
  });
  const ctx = ctxFor(tables);
  try {
    const res = await askRoute.POST.run(post({ text: "what are our hours?", surface: "settings" }), ctx);
    await res.text();
    const selects = (table) => ctx.supabase.seen.filter((q) => q.table === table && q.op === "select").length;
    assert.deepEqual(
      [selects("tenant_channels"), selects("calls")],
      [1, 2],
      "both tools ran and read their own rows: get_settings the channels as their page reads them (readers/channels.ts), the last inbound call beside the rows, and list_calls the hundred newest",
    );
    assert.equal(
      selects("tenants"),
      2,
      "name and zone once (facts), sells_by once (sellsBy): the tools re-read neither",
    );
    assert.equal(selects("tenant_config"), 1, "the config once, for the prompt and for get_settings");
    assert.equal(selects("policies"), 1, "the policies once");
    assert.deepEqual(clocks, [true, true], "one clock per turn: each tool's now is its readers' now");
  } finally {
    setAskPorts(null);
  }
});

test("the route takes the page's context: the turn reads it as data before the question (the Phase 2 plan, PR 2.4), a row another workspace holds is absent, and the shape says what rode in; one the schema refuses is no context, said once in the log, never a refused question; a context fills a surface the palette did not name", async () => {
  const written = answerJson("Nobody has booked this week yet.");
  const requests = [];
  setAskPorts({
    round: async (call, onText) => {
      requests.push(call.request);
      onText(written);
      return ROUND([text(written)], { stopReason: "end_turn" });
    },
    shape: async () => "",
  });
  const T1 = "11111111-1111-4111-8111-111111111111";
  const T2 = "22222222-2222-4222-8222-222222222222";
  const context = {
    v: 1,
    surface: "inbox",
    route: `inbox/th-${T1}`,
    view: "needs",
    focus: null,
    rows: [
      { kind: "thread", id: T1 },
      { kind: "thread", id: T2 },
    ],
    askedAt: 1_758_880_000_000,
  };
  const refused = [];
  const was = console.error;
  console.error = (event, json) => {
    if (event === "ask_context_refused") refused.push(JSON.parse(json));
  };
  try {
    const tables = routeTables();
    const ask = async (body) => (await askRoute.POST.run(post(body), ctxFor(tables))).text();
    await ask({ text: "Who is waiting?", surface: "inbox" });
    await ask({ text: "Who is waiting?", surface: "inbox", context });
    const [plain, carried] = tables.ask_messages.filter((m) => m.role === "assistant").map((m) => m.content.shape);
    assert.deepEqual([plain.context_rows, plain.warm], [null, "none"], "no context sent: nothing, never zero");
    // The two threads are no thread of this workspace's Inbox: the server read them again and found none, so the page
    // rides in as its figures alone.
    assert.deepEqual([carried.context_rows, carried.warm], [0, "miss"]);
    const data = (r) => r.messages.at(-1).content.filter((c) => c.type === "search_result");
    assert.deepEqual(data(requests[0]), [], "no page, no data");
    assert.deepEqual(
      data(requests[1]).map((b) => [b.source, !!b.cache_control]),
      [["page://inbox", true]],
      "the page's figures, the context's breakpoint on its last block",
    );
    assert.ok(!JSON.stringify(requests[1]).includes(T2), "a row another workspace holds is named nowhere");
    const system = (r) => JSON.stringify(r.system);
    assert.equal(system(requests[1]), system(requests[0]), "system is the same bytes on any page");

    // A row carrying a fact the tab says about it: the schema refuses the whole context, and the question is answered.
    const bad = { ...context, rows: [{ kind: "thread", id: T1, preview: "hi" }] };
    await ask({ text: "Who is waiting?", surface: "inbox", context: bad });
    const answered = tables.ask_messages.filter((m) => m.role === "assistant");
    assert.equal(answered.length, 3, "answered");
    assert.equal(answered[2].content.shape.context_rows, null);
    assert.deepEqual(data(requests[2]), [], "a refused context rides in not at all");
    assert.equal(refused.length, 1, "said once");
    assert.equal(refused[0].tenant, A);
    assert.equal(refused[0].path, "rows.0");

    // No surface named: the context's fills it.
    await ask({
      text: "Who is waiting?",
      context: { ...context, surface: "pipeline", route: "clients/pipeline", rows: [] },
    });
    const last = tables.ask_messages.filter((m) => m.role === "assistant").at(-1).content.shape;
    assert.equal(last.surface, "pipeline");
  } finally {
    console.error = was;
    setAskPorts(null);
  }
});
