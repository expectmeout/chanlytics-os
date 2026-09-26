/**
 * The model gateway, run: POST /api/admin/llm over a database in memory and
 * a captured wire where api.anthropic.com would be. Until 13 Sep 2026 its
 * text was pinned by six assertions across two reads in ask.test.mjs and
 * its POST had never been called.
 *
 * The dashboard builds the whole request and runs the tools itself as the
 * signed-in person; this edge spends the key, keeps the count, and forwards
 * the model's event stream as it arrives so the palette shows the first
 * words while the rest is still being written. Ask has a daily budget of its
 * own (ASK_TOKENS_DAY), read from the usage rows once a minute per
 * workspace and refused with 429 when spent -- so an owner asking questions
 * never spends the receptionist's budget, and a spent one costs no model
 * call.
 *
 * The door calls `fetch` itself -- there is no SDK on this path -- so the
 * wire below is the whole of the network, installed for the file. A model
 * key is in the environment only so the door gets past its own check; it
 * travels no further than a captured header. ORDER MATTERS among the budget
 * cases: the count is kept per workspace in a module-level map for a
 * minute, so every case below is its own workspace, and the two that prove
 * the map run in the order written.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { signEdgeToken } from "@chanlytics/channels";
import { ASK_TOKENS_DAY, ASK_MODEL, ASK_MAX_TOKENS } from "@chanlytics/contracts";
import { fakeDb } from "./_fake-db.mjs";

// Each test file is its own process: this is the whole environment. No
// Supabase credentials, so `setPg(null)` really is no database.
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.ANTHROPIC_API_KEY = "model-key-for-this-file";
for (const k of ["DIAG_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];

/* --------------------------------- the wire ------------------------------- */

/** Every request the door makes, captured and answered by the case's `answer` with a Response of its own. */
const wire = { answer: null, calls: [] };
{
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const req = {
      url: String(url),
      method: init?.method ?? "GET",
      headers: init?.headers ?? {},
      body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
      signal: init?.signal ?? null,
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
/** A wire nothing may reach. The door answers a thrown fetch as a 502, so a case that expects a 200 fails in the open. */
const silent = (why = "this case must not reach the model") =>
  wired((req) => {
    throw new Error(`${why}: ${req.method} ${req.url}`);
  });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const {
  GATEWAY_MAX_BODY,
  GATEWAY_MAX_TOKENS,
  GATEWAY_MAX_TOOLS,
  GATEWAY_MAX_MESSAGES,
  ASK_USAGE_KIND,
  GATEWAY_FALLBACK_MODEL,
  validateGatewayRequest,
} = await import(at("apps/edge/lib/ask-gateway.ts"));
const door = await import(at("apps/edge/api/admin/llm.ts"));
after(() => setPg(null));

const AUD = "/api/admin/llm";
const API = "https://api.anthropic.com/v1/messages";
/** Every case its own workspace: the day's count is kept per workspace, in the door's memory, for a minute. */
const T = (n) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;
/** The person asking. */
const U = "11111111-1111-4111-8111-111111111111";
const KEY = "diag-key-for-this-file";
const HOUR = 3_600_000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();

/* ------------------------------- the knock -------------------------------- */

const token = (o = {}) =>
  signEdgeToken(o.secret ?? process.env.EDGE_CALL_SECRET, o.aud ?? AUD, {
    workspace: "workspace" in o ? o.workspace : T(1),
    user: U,
  });
/** A knock about workspace `ws`: the token names it, so the body need not. */
const knock = (ws, body, headers = { "x-edge-token": token({ workspace: ws }) }) =>
  door.POST(
    new Request(`http://edge${AUD}`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
const answer = async (res) => [res.status, await res.json()];

/** Set variables for one call and put every one of them back afterwards; `undefined` unsets. */
async function withEnv(vars, fn) {
  const before = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}
/** The edge before it has the secret: the key decides, and a key holder is about no workspace. */
const keyed = (fn) => withEnv({ EDGE_CALL_SECRET: undefined, DIAG_KEY: KEY }, fn);

/* -------------------------------- the world ------------------------------- */

/** A turn as the dashboard's loop builds it: the stable block cached, one question, the finish tool, the choice left to the model. */
const REQUEST = {
  model: "claude-opus-5",
  max_tokens: 800,
  system: [{ type: "text", text: "You are Ask, the workspace assistant.", cache_control: { type: "ephemeral" } }],
  messages: [{ role: "user", content: "who needs me right now?" }],
  tools: [
    {
      name: "finish",
      description: "Answer.",
      input_schema: {
        type: "object",
        properties: { answer: { type: "string" } },
        required: ["answer"],
        additionalProperties: false,
      },
      strict: true,
    },
  ],
  tool_choice: { type: "auto" },
  temperature: 0.2,
  output_config: { effort: "low" },
};
const turn = (over = {}) => ({ user_id: U, purpose: "ask", request: REQUEST, ...over });
/** A usage row as a past round wrote it: Ask's own kind, so the receptionist's budget never counts it and this door never counts the receptionist's. */
const usage = (ws, input, output, agoMs) => ({
  id: crypto.randomUUID(),
  tenant_id: ws,
  kind: ASK_USAGE_KIND,
  category: "usage",
  subject_type: "user",
  subject_id: U,
  data: {
    input_tokens: input,
    output_tokens: output,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
    model: ASK_MODEL,
    latency_ms: 900,
    stop_reason: "end_turn",
    stream: true,
  },
  created_at: ago(agoMs),
});
function use(tables = { events: [] }, faults = {}) {
  const db = fakeDb(tables, faults);
  setPg(db);
  return db;
}
const counted = (db) => db.seen.filter((q) => q.table === "events" && q.op === "select");

/* -------------------------------- the model ------------------------------- */

/** The API's own event stream for one short answer: the input side and the cache counts on message_start, the output side and the stop reason on message_delta. */
const TURN = [
  {
    type: "message_start",
    message: {
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "claude-opus-5",
      content: [],
      stop_reason: null,
      usage: { input_tokens: 1200, output_tokens: 1, cache_read_input_tokens: 900, cache_creation_input_tokens: 0 },
    },
  },
  { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
  { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: '{"answer": "Two people need you: ' } },
  { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: 'Dani and Rosa."' } },
  { type: "content_block_stop", index: 0 },
  { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 42 } },
  { type: "message_stop" },
];
const sse = (events) => events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
/** The stream as the network delivers it: in chunks that respect no line boundary, so a JSON payload is split mid-way more than once. */
function streamed(text, chunk = 37) {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (let i = 0; i < text.length; i += chunk) controller.enqueue(enc.encode(text.slice(i, i + chunk)));
      controller.close();
    },
  });
}
const model = (events = TURN) =>
  wired(() => new Response(streamed(sse(events)), { status: 200, headers: { "content-type": "text/event-stream" } }));

/* --------------------------------- the door ------------------------------- */

test("the door: a token for another door, a forgery and no credential are 403 -- no falling back from a bad token to a key; a body naming another workspace than the token is refused; without the secret the key decides and the body must name the workspace; nothing is read and the model is not asked", async () => {
  const db = use();
  const net = silent();
  assert.deepEqual(
    await answer(await knock(T(1), turn(), { "x-edge-token": token({ aud: "/api/admin/steer" }) })),
    [403, { ok: false, error: "token_audience" }],
    "a token for steer or whisper opens nothing here",
  );
  assert.deepEqual(await answer(await knock(T(1), turn(), { "x-edge-token": token({ secret: "not-the-secret" }) })), [
    403,
    { ok: false, error: "token_signature" },
  ]);
  assert.deepEqual(await answer(await knock(T(1), turn(), {})), [403, { ok: false }]);
  assert.deepEqual(
    await answer(await knock(T(1), turn(), { "x-edge-token": "garbage", "x-diag-key": KEY })),
    [403, { ok: false, error: "token_malformed" }],
    "the right key beside a bad token: the token decides, and it says no",
  );
  assert.deepEqual(
    await answer(await knock(T(1), turn({ tenant_id: T(2) }))),
    [403, { ok: false, error: "workspace_mismatch" }],
    "a token about one workspace may not spend another's budget",
  );
  const minted = token({ workspace: T(1) });
  await keyed(async () => {
    assert.deepEqual(await answer(await knock(T(1), turn(), { "x-diag-key": "not-the-key" })), [403, { ok: false }]);
    assert.deepEqual(
      await answer(await knock(T(1), turn(), { "x-edge-token": minted })),
      [403, { ok: false }],
      "a token ahead of the secret opens nothing on its own",
    );
    assert.deepEqual(
      await answer(await knock(T(1), turn(), { "x-diag-key": KEY })),
      [400, { ok: false, error: "tenant_id, user_id and a purpose required" }],
      "a key holder is about no workspace: the body must name one",
    );
  });
  assert.equal(db.seen.length, 0, "nothing was read for any of it");
  assert.equal(net.calls.length, 0, "the model heard none of it");
});

test("without a model key on this edge the door says so before the body is even looked at: a 503, no database read, no wire -- the no-model path", async () => {
  const db = use();
  const net = silent();
  await withEnv({ ANTHROPIC_API_KEY: undefined }, async () => {
    assert.deepEqual(await answer(await knock(T(1), turn())), [503, { ok: false, error: "no_model_key" }]);
    assert.deepEqual(
      await answer(await knock(T(1), "not even json")),
      [503, { ok: false, error: "no_model_key" }],
      "before the body is looked at",
    );
  });
  assert.equal(db.seen.length, 0);
  assert.equal(net.calls.length, 0);
});

test("what a request must be before the key is spent: a body under the cap, a person and a purpose the gateway knows, a request the gateway allows -- a known model, one to sixty turns, at most forty tools, a system prompt as a string or blocks -- and a database; none of it reaches the model", async () => {
  const db = use();
  const net = silent();
  const bad = (error) => [400, { ok: false, error }];
  assert.deepEqual(
    await answer(await knock(T(1), "x".repeat(GATEWAY_MAX_BODY + 1))),
    [413, { ok: false, error: "too_large" }],
    "over the cap: refused by size before it is parsed",
  );
  assert.deepEqual(await answer(await knock(T(1), "not json")), bad("tenant_id, user_id and a purpose required"));
  assert.deepEqual(
    await answer(await knock(T(1), turn({ user_id: undefined }))),
    bad("tenant_id, user_id and a purpose required"),
  );
  assert.deepEqual(
    await answer(await knock(T(1), turn({ user_id: "ada" }))),
    bad("tenant_id, user_id and a purpose required"),
  );
  assert.deepEqual(
    await answer(await knock(T(1), turn({ purpose: "receptionist" }))),
    bad("tenant_id, user_id and a purpose required"),
    "the receptionist has its own brain and its own budget; this door is Ask's",
  );
  assert.deepEqual(
    await answer(await knock(T(1), turn({ purpose: "lead_draft", request: { ...REQUEST, model: "gpt-5" } }))),
    bad("unknown model"),
    "a lead purpose is past the gate -- it spends Ask's budget on this door -- and the request itself is what is judged next",
  );
  assert.deepEqual(await answer(await knock(T(1), turn({ request: undefined }))), bad("request required"));
  assert.deepEqual(await answer(await knock(T(1), turn({ request: "who needs me?" }))), bad("request required"));
  assert.deepEqual(
    await answer(await knock(T(1), turn({ request: { ...REQUEST, model: "gpt-5" } }))),
    bad("unknown model"),
    "only the models the loop may name",
  );
  assert.deepEqual(
    await answer(await knock(T(1), turn({ request: { ...REQUEST, messages: [] } }))),
    bad(`messages: 1-${GATEWAY_MAX_MESSAGES} turns`),
  );
  assert.deepEqual(
    await answer(
      await knock(
        T(1),
        turn({
          request: {
            ...REQUEST,
            messages: Array.from({ length: GATEWAY_MAX_MESSAGES + 1 }, () => REQUEST.messages[0]),
          },
        }),
      ),
    ),
    bad(`messages: 1-${GATEWAY_MAX_MESSAGES} turns`),
  );
  assert.deepEqual(
    await answer(
      await knock(
        T(1),
        turn({
          request: {
            ...REQUEST,
            tools: Array.from({ length: GATEWAY_MAX_TOOLS + 1 }, (_, i) => ({ name: `tool_${i}` })),
          },
        }),
      ),
    ),
    bad(`tools: up to ${GATEWAY_MAX_TOOLS}`),
  );
  assert.deepEqual(
    await answer(await knock(T(1), turn({ request: { ...REQUEST, system: 42 } }))),
    bad("system: a string or blocks"),
  );
  assert.equal(db.seen.length, 0, "nothing read for any of it: the count is asked only for a request that is allowed");
  setPg(null);
  assert.deepEqual(
    await answer(await knock(T(1), turn())),
    [503, { ok: false, error: "no_database" }],
    "no database: no count, so no turn",
  );
  assert.equal(net.calls.length, 0, "the model heard none of it");
});

/* --------------------------------- the budget ----------------------------- */

// ORDER MATTERS from here. The door keeps the day's count per workspace in a
// module-level map for a minute (BUDGET_TTL_MS). The two cases that prove the
// map -- a workspace under its budget, then one that has spent it -- each use
// their own workspace and run in the order written; within each, the second
// knock lands inside the minute on purpose, and a later case never reuses a
// workspace an earlier one warmed.

test("under the budget: the day's usage is read once for this workspace and Ask's own kind, the request goes to the model with the key from this edge and stream:true, the event stream is forwarded byte for byte, and when it ends the round's tokens are written as Ask's own usage row; a second knock within the minute trusts the count it kept and is written all the same", async () => {
  const ws = T(1);
  const tables = {
    events: [
      usage(ws, 1_000, 200, 2 * HOUR),
      usage(ws, 3_000, 800, 20 * HOUR),
      usage(ws, 5_000_000, 0, 25 * HOUR),
      usage(T(9), 5_000_000, 0, HOUR),
    ],
  };
  const db = use(tables);
  const net = model();
  const t0 = Date.now();

  const res = await knock(ws, turn());
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "text/event-stream; charset=utf-8");
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(
    res.headers.get("x-accel-buffering"),
    "no",
    "nothing between the model and the palette may hold the first words back",
  );
  assert.equal(await res.text(), sse(TURN), "the API's own stream, forwarded as it came");

  assert.equal(net.calls.length, 1);
  const [req] = net.calls;
  assert.equal(req.url, API);
  assert.equal(req.method, "POST");
  assert.deepEqual(
    req.headers,
    { "content-type": "application/json", "x-api-key": "model-key-for-this-file", "anthropic-version": "2023-06-01" },
    "the key, spent here and nowhere else",
  );
  assert.deepEqual(req.body, { ...REQUEST, stream: true }, "the dashboard's request as validated, streamed");
  assert.ok(req.signal instanceof AbortSignal, "with a timeout: the function has a minute");

  const reads = counted(db);
  assert.equal(reads.length, 1, "the count is read once");
  assert.deepEqual(
    reads[0].filters.map(([op, col]) => [op, col]),
    [
      ["eq", "tenant_id"],
      ["eq", "kind"],
      ["gte", "created_at"],
    ],
    "this workspace, one kind, since a moment",
  );
  assert.deepEqual(
    [reads[0].filters[0][2], reads[0].filters[1][2]],
    [ws, ASK_USAGE_KIND],
    "Ask's own kind: the receptionist's usage.llm_tokens is never counted here, nor this there",
  );
  const since = Date.parse(reads[0].filters[2][2]);
  assert.ok(
    since >= t0 - 24 * HOUR - 5_000 && since <= t0 - 24 * HOUR + 5_000,
    "the last twenty-four hours: the five-million-token row from yesterday is not the day's",
  );

  const written = tables.events.filter((e) => e.tenant_id === ws && Date.parse(e.created_at) >= t0);
  assert.equal(written.length, 1, "one usage row per round");
  const [row] = written;
  assert.deepEqual(
    [row.kind, row.category, row.subject_type, row.subject_id],
    [ASK_USAGE_KIND, "usage", "user", U],
    "Ask's own kind, about the person who asked",
  );
  assert.deepEqual(
    { ...row.data, latency_ms: typeof row.data.latency_ms },
    {
      input_tokens: 1200,
      output_tokens: 42,
      cache_read_input_tokens: 900,
      cache_creation_input_tokens: 0,
      model: "claude-opus-5",
      latency_ms: "number",
      stop_reason: "end_turn",
      stream: true,
      purpose: "ask",
    },
    "the input side and the cache counts from message_start, the output side and the stop reason from message_delta -- read out of a stream chopped mid-payload",
  );

  // Within the minute: the count is the one kept, however many rows landed since.
  tables.events.push(usage(ws, ASK_TOKENS_DAY, 0, 0));
  const again = await knock(ws, turn({ request: { max_tokens: 5000, messages: REQUEST.messages, temperature: 3 } }));
  assert.equal(
    again.status,
    200,
    "spent by the rows, but the minute's count says five thousand: a turn's second round is not refused by its own first",
  );
  await again.text();
  assert.equal(counted(db).length, 1, "not read again inside the minute");
  assert.equal(
    tables.events.filter((e) => e.tenant_id === ws && Date.parse(e.created_at) >= t0).length,
    3,
    "the count itself is written on every round regardless",
  );
  assert.deepEqual(
    net.calls[1].body,
    {
      model: GATEWAY_FALLBACK_MODEL,
      max_tokens: ASK_MAX_TOKENS,
      messages: REQUEST.messages,
      temperature: 1,
      stream: true,
    },
    "no model named is the fallback an older dashboard expects; max_tokens is clamped to Ask's ceiling, temperature to one; nothing the dashboard did not send is added",
  );
});

test("the budget spent: the day's rows add up to the cap, so the knock is refused with 429 before the key is spent -- no request to the model, no row written -- and stays refused within the minute even once the rows are gone: the count kept is the count believed; another workspace is another count", async () => {
  const ws = T(2);
  const tables = { events: [usage(ws, 1_000_000, 400_000, 3 * HOUR), usage(ws, 100_000, 0, 10 * HOUR)] };
  const db = use(tables);
  const net = silent("a spent budget costs no model call");
  assert.deepEqual(
    await answer(await knock(ws, turn())),
    [429, { ok: false, error: "ask_budget", used: ASK_TOKENS_DAY, cap: ASK_TOKENS_DAY }],
    "exactly at the cap is spent",
  );
  assert.equal(net.calls.length, 0);
  assert.equal(tables.events.length, 2, "no usage row for a turn that did not happen");
  assert.equal(ASK_TOKENS_DAY, 1_500_000, "sized for a workspace's day with the snapshot in every round");

  tables.events.length = 0;
  assert.deepEqual(
    await answer(await knock(ws, turn())),
    [429, { ok: false, error: "ask_budget", used: ASK_TOKENS_DAY, cap: ASK_TOKENS_DAY }],
    "within the minute the count kept is believed over the table: a spent budget is still refused",
  );
  assert.equal(counted(db).length, 1, "read once");
  assert.equal(net.calls.length, 0);

  const other = T(3);
  const m = model();
  const res = await knock(other, turn());
  assert.equal(res.status, 200, "another workspace has spent nothing: the count is per workspace");
  await res.text();
  assert.equal(m.calls.length, 1);
  assert.deepEqual(
    counted(db).map((q) => q.filters[0][2]),
    [ws, other],
    "each read once, its own",
  );
});

/* -------------------------------- the model's no --------------------------- */

test("the model's refusal is forwarded as it came -- its status and its body, as JSON -- and a model that cannot be reached is a 502; neither writes a usage row", async () => {
  const ws = T(4);
  const tables = { events: [] };
  use(tables);
  const refused = wired(
    () =>
      new Response(
        JSON.stringify({
          type: "error",
          error: { type: "rate_limit_error", message: "This request would exceed your organization's rate limit." },
        }),
        { status: 429, headers: { "content-type": "application/json" } },
      ),
  );
  const res = await knock(ws, turn());
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("content-type"), "application/json");
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.deepEqual(
    await res.json(),
    {
      type: "error",
      error: { type: "rate_limit_error", message: "This request would exceed your organization's rate limit." },
    },
    "the API's own words: the palette reads the type",
  );
  assert.equal(refused.calls.length, 1);
  assert.equal(tables.events.length, 0, "no tokens were spent, so none are counted");

  const bare = wired(() => new Response("", { status: 400 }));
  assert.deepEqual(
    await answer(await knock(ws, turn())),
    [400, { ok: false, error: "model 400" }],
    "a refusal without a body still says what the status was",
  );
  assert.equal(bare.calls.length, 1);

  const down = wired(() => {
    throw new TypeError("fetch failed");
  });
  assert.deepEqual(await answer(await knock(ws, turn())), [502, { ok: false, error: "model_unreachable" }]);
  assert.equal(down.calls.length, 1);
  assert.equal(tables.events.length, 0);
});

test("a count that cannot be read is zero, never a refusal: the turn goes through, and its row is still written for the next read to count", async () => {
  const ws = T(5);
  const tables = { events: [] };
  use(tables, { "events.select": { message: "permission denied for table events" } });
  const net = model();
  const res = await knock(ws, turn());
  assert.equal(res.status, 200);
  await res.text();
  assert.equal(net.calls.length, 1);
  assert.deepEqual(
    tables.events.map((e) => [e.tenant_id, e.kind, e.data.input_tokens, e.data.output_tokens]),
    [[ws, ASK_USAGE_KIND, 1200, 42]],
  );
});

test("what the Line needs from the gateway: Opus 5.5 is a model Ask may name, Ask's turn may carry its answer format under 8,000 characters, and Ask is clamped to ASK_MAX_TOKENS while the lead purposes keep their ceiling", async () => {
  const ask = (over) => validateGatewayRequest({ ...REQUEST, ...over }, "ask");
  assert.equal(ask({ model: ASK_MODEL }).ok, true, "Ask's default profile is a model the door allows");
  assert.deepEqual(
    ask({ model: "claude-opus-5-9" }),
    { ok: false, error: "unknown model" },
    "and still only the models listed",
  );
  const schema = {
    type: "object",
    properties: { say: { type: "string" } },
    required: ["say"],
    additionalProperties: false,
  };
  const formatted = ask({ output_config: { effort: "low", format: { type: "json_schema", schema } } });
  assert.deepEqual(
    formatted.ok && formatted.request.output_config,
    { effort: "low", format: { type: "json_schema", schema } },
    "Ask's own turn keeps its format now: the answer is structured output (the Line, D3)",
  );
  const refused = { ok: false, error: "output_config.format: a JSON schema under 8,000 characters" };
  const huge = { type: "object", properties: { say: { type: "string", description: "x".repeat(8_001) } } };
  assert.deepEqual(ask({ output_config: { format: { type: "json_schema", schema: huge } } }), refused);
  assert.deepEqual(ask({ output_config: { format: { type: "text" } } }), refused);
  const ceiling = (purpose) => {
    const v = validateGatewayRequest({ ...REQUEST, max_tokens: 9_000 }, purpose);
    return v.ok ? v.request.max_tokens : v.error;
  };
  assert.equal(ceiling("ask"), ASK_MAX_TOKENS, "Ask's ceiling is the number its loop asks for");
  assert.equal(ceiling("lead_draft"), GATEWAY_MAX_TOKENS, "the lead purposes keep theirs");

  // Through the door: the model named and the format reach the model's wire as the dashboard sent them.
  use({ events: [] });
  const net = model();
  const res = await knock(
    T(40),
    turn({
      request: {
        ...REQUEST,
        model: "claude-opus-5-5",
        output_config: { effort: "low", format: { type: "json_schema", schema } },
      },
    }),
  );
  assert.equal(res.status, 200);
  await res.text();
  assert.deepEqual(
    [net.calls[0].body.model, net.calls[0].body.output_config],
    ["claude-opus-5-5", { effort: "low", format: { type: "json_schema", schema } }],
  );
});
