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
import { resetFastHolds, signEdgeToken } from "@chanlytics/channels";
import {
  ASK_TOKENS_DAY,
  ASK_MODEL,
  ASK_MAX_TOKENS,
  ASK_WARM_MAX_TOKENS,
  FAST_MODE_BETA,
  MODEL_ROUTES,
} from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";
import { fieldsOf, logLineOf } from "../_log-lines.mjs";

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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
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
  askTokensLast24h,
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

const token = (o = {}) => {
  const secret = o.secret ?? process.env.EDGE_CALL_SECRET;
  return (body) =>
    signEdgeToken(secret, o.aud ?? AUD, {
      workspace: "workspace" in o ? o.workspace : T(1),
      user: "user" in o ? o.user : U,
      body,
    });
};
/** The headers a knock sends, each token minted for the body it rides with: the edge refuses a token that names none. */
const minted = (headers, raw) =>
  Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, typeof v === "function" ? v(raw) : v]));
/** A knock about workspace `ws`: the token names it, so the body need not. */
const knock = (ws, body, headers = { "x-edge-token": token({ workspace: ws }) }) =>
  door.POST(
    new Request(`http://edge${AUD}`, {
      method: "POST",
      headers: minted(
        { ...headers, "content-type": "application/json" },
        typeof body === "string" ? body : JSON.stringify(body),
      ),
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
/** How many of the case workspaces the world holds: each is active and billed, so the model may be asked for it. */
const WORKSPACES = 50;
function use(tables = { events: [] }, faults = {}, rpcs = {}) {
  // The gate the port asks before Ask spends the platform's key (mayUseModelFor): the workspace is active and billed.
  const ids = Array.from({ length: WORKSPACES }, (_, i) => T(i + 1));
  tables.tenants ??= ids.map((id) => ({ id, status: "active", left_empty_at: null }));
  tables.billing_accounts ??= ids.map((tenant_id) => ({ tenant_id, mode: "stripe", status: "active" }));
  tables.ai_usage ??= [];
  const db = fakeDb(tables, faults, rpcs);
  setPg(db);
  return db;
}
/** The day's count, asked of the database: one call of ask_tokens_day (00240) per read, never a read of the rows. */
const counted = (db) => db.seen.filter((q) => q.rpc === "ask_tokens_day");

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
      [400, { ok: false, error: "bad_request", detail: "tenant_id, user_id and a purpose required" }],
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
  const bad = (detail) => [400, { ok: false, error: "bad_request", detail }];
  assert.deepEqual(
    await answer(await knock(T(1), "x".repeat(GATEWAY_MAX_BODY + 1))),
    [413, { ok: false, error: "too_large" }],
    "over the cap: refused by size before it is parsed",
  );
  assert.deepEqual(await answer(await knock(T(1), "not json")), bad("tenant_id, user_id and a purpose required"));
  // A token names the person, and the door takes the token's (personFor): a body without one, or claiming another, is
  // the token's. A token that names none (from before they did, or a key) leaves the body's, and that must be a person.
  const nobody = () => ({ "x-edge-token": token({ workspace: T(1), user: null }) });
  assert.deepEqual(
    await answer(await knock(T(1), turn({ user_id: undefined }), nobody())),
    bad("tenant_id, user_id and a purpose required"),
  );
  assert.deepEqual(
    await answer(await knock(T(1), turn({ user_id: "ada" }), nobody())),
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
  assert.deepEqual(reads[0].args, { p_tenant: ws }, "this workspace's day, summed by the database (00240)");
  assert.equal(
    db.seen.filter((q) => q.table === "events" && q.op === "select").length,
    0,
    "no usage row is read: the day is one sum, not a page of rows",
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
      speed: "standard",
    },
    "the input side and the cache counts from message_start, the output side and the stop reason from message_delta -- read out of a stream chopped mid-payload -- and the speed asked, which the stream did not say",
  );
  assert.equal(res.headers.get("x-model-speed"), "standard", "the speed the answering request went at, said back");

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

test("a warm is Ask's own request under a purpose of its own (ask_warm): asked of the model it names by Ask's rule, never past sixty-four tokens whatever it asks for, its usage said as a warm so the day's report and the eval count no round of it, and its dollars Ask's in the ledger", async () => {
  const ws = T(21);
  const tables = { events: [] };
  use(tables);
  const net = model();
  const t0 = Date.now();
  const named = "claude-some-model-9";
  const res = await knock(ws, turn({ purpose: "ask_warm", request: { ...REQUEST, model: named, max_tokens: 4000 } }));
  assert.equal(res.status, 200);
  await res.text();
  assert.equal(ASK_WARM_MAX_TOKENS, 64);
  assert.deepEqual(
    [net.calls[0].body.model, net.calls[0].body.max_tokens],
    [named, ASK_WARM_MAX_TOKENS],
    "any model that reads as one, as Ask's turn may name; the ceiling is the warm's, not Ask's",
  );
  assert.deepEqual(
    net.calls[0].body.system,
    REQUEST.system,
    "the head rides through as a turn's does: it is what is cached",
  );
  const [row] = tables.events.filter((e) => e.tenant_id === ws && Date.parse(e.created_at) >= t0);
  assert.deepEqual([row.kind, row.data.purpose], [ASK_USAGE_KIND, "ask_warm"], "Ask's kind, said as a warm");
  assert.deepEqual(
    tables.ai_usage.map((r) => [r.purpose, r.outcome, r.model_asked]),
    [["ask", "answered", named]],
    "one row of the ledger, Ask's",
  );
  assert.deepEqual(
    validateGatewayRequest({ ...REQUEST, model: "gpt-9" }, "ask_warm"),
    { ok: false, error: "bad_request", detail: "unknown model" },
    "and held to what a turn is held to",
  );
});

test("a round cut short is counted all the same: the dashboard abandoning the answer (its turn's budget) or the model's stream breaking (the try's bound, the network) writes the round's usage row and its ledger row once, with what had been read, before the cut is answered; and the model's stream is let go", async () => {
  // The round was written only when its stream ended cleanly, and a cut stream never does: Ask's day and the ledger
  // lost every round the dashboard abandoned at forty-five seconds, and every one the network broke.
  const enc = new TextEncoder();
  const head = sse(TURN.slice(0, 3)); // message_start, the text's block, its first words; the output side comes last
  for (const [n, cut] of [
    [22, "the dashboard's abort"],
    [23, "the stream breaks"],
  ]) {
    const ws = T(n);
    const tables = { events: [] };
    use(tables);
    let letGo = false;
    let pulls = 0;
    wired(
      () =>
        new Response(
          new ReadableStream({
            pull(c) {
              if (pulls++ === 0) c.enqueue(enc.encode(head));
              else if (cut === "the stream breaks") c.error(new TypeError("terminated"));
              // Otherwise nothing more for now: the model is still writing.
            },
            cancel() {
              letGo = true;
            },
          }),
          { status: 200, headers: { "content-type": "text/event-stream" } },
        ),
    );
    const t0 = Date.now();
    const res = await knock(ws, turn());
    assert.equal(res.status, 200, cut);
    const reader = res.body.getReader();
    assert.equal(new TextDecoder().decode((await reader.read()).value), head, `${cut}: the first words went out`);
    if (cut === "the stream breaks") await assert.rejects(reader.read(), /terminated/, `${cut}: the palette is told`);
    else await reader.cancel(new DOMException("This operation was aborted", "AbortError"));
    const written = tables.events.filter((e) => e.tenant_id === ws && Date.parse(e.created_at) >= t0);
    assert.deepEqual(
      written.map((e) => [
        e.kind,
        e.data.input_tokens,
        e.data.cache_read_input_tokens,
        e.data.output_tokens,
        e.data.stop_reason,
      ]),
      [[ASK_USAGE_KIND, 1200, 900, 0, null]],
      `${cut}: one usage row for Ask's day, with the input side message_start said, written before the cut was answered`,
    );
    assert.deepEqual(
      tables.ai_usage.map((r) => [r.purpose, r.input_tokens, r.cache_read_tokens, r.usd > 0]),
      [["ask", 1200, 900, true]],
      `${cut}: and one row of the ledger, with its dollars`,
    );
    if (cut === "the dashboard's abort") assert.ok(letGo, `${cut}: the model's stream is let go`);
  }
});

test("the budget spent: the day's rows add up to the cap, so the knock is refused with 429 before the key is spent -- no request to the model, no row written -- and stays refused within the minute even once the rows are gone: the count kept is the count believed; another workspace is another count", async () => {
  const ws = T(2);
  const tables = { events: [usage(ws, 2_000_000, 900_000, 3 * HOUR), usage(ws, 100_000, 0, 10 * HOUR)] };
  const db = use(tables);
  const net = silent("a spent budget costs no model call");
  assert.deepEqual(
    await answer(await knock(ws, turn())),
    [429, { ok: false, error: "ask_budget", used: ASK_TOKENS_DAY, cap: ASK_TOKENS_DAY }],
    "exactly at the cap is spent",
  );
  assert.equal(net.calls.length, 0);
  assert.equal(tables.events.length, 2, "no usage row for a turn that did not happen");
  assert.equal(ASK_TOKENS_DAY, 3_000_000, "sized for a workspace's day with its cache writes counted");

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
    counted(db).map((q) => q.args.p_tenant),
    [ws, other],
    "each read once, its own",
  );
});

/* -------------------------------- the model's no --------------------------- */

test("the API's refusal of the request is forwarded in its own shape; a model that gave no answer -- a 429, or none at all after the fallback -- is a 503 model_unreachable, never 'the model refused'; each is one row of the ledger and none is an Ask usage event", async () => {
  const ws = T(4);
  const tables = { events: [] };
  use(tables);
  const refused = wired(
    () =>
      new Response(
        JSON.stringify({
          type: "error",
          error: { type: "invalid_request_error", message: "output_config.format: a schema this model does not take" },
        }),
        { status: 400, headers: { "content-type": "application/json" } },
      ),
  );
  const res = await knock(ws, turn());
  assert.equal(res.status, 400);
  assert.equal(res.headers.get("content-type"), "application/json");
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.deepEqual(
    await res.json(),
    {
      type: "error",
      error: { type: "invalid_request_error", message: "output_config.format: a schema this model does not take" },
    },
    "the API's own words: the palette reads the message to drop what the model would not take",
  );
  assert.equal(refused.calls.length, 1, "asking again anywhere gets the same answer, so the fallback is not asked");
  assert.equal(tables.events.length, 0, "no tokens were spent, so none are counted");

  const bare = wired(() => new Response("", { status: 400 }));
  assert.deepEqual(
    await answer(await knock(ws, turn())),
    [400, { type: "error", error: { type: "invalid_request_error", message: "status 400" } }],
    "a refusal without a body still says what the status was",
  );
  assert.equal(bare.calls.length, 1);

  // A 429 is "not now": no answer came, said as such -- never as the model's refusal.
  const busy = wired(
    () =>
      new Response(JSON.stringify({ type: "error", error: { type: "rate_limit_error", message: "rate limit" } }), {
        status: 429,
        headers: { "content-type": "application/json" },
      }),
  );
  assert.deepEqual(await answer(await knock(ws, turn())), [
    503,
    { ok: false, error: "model_unreachable", detail: "model 429" },
  ]);
  assert.equal(busy.calls.length, 1, "Ask's route asks once: the person is waiting");

  // A connection that drops: asked again on the fallback model once, then said unreachable.
  const down = wired(() => {
    throw new TypeError("fetch failed");
  });
  assert.deepEqual(await answer(await knock(ws, turn())), [
    503,
    { ok: false, error: "model_unreachable", detail: "model timeout" },
  ]);
  assert.deepEqual(
    down.calls.map((c) => c.body.model),
    ["claude-opus-5", MODEL_ROUTES.ask.model],
    "the fallback was asked before the stream began: for a model that is not the route's own, the route's own",
  );
  assert.equal(tables.events.length, 0, "no Ask usage event for a round that never answered");
  assert.deepEqual(
    tables.ai_usage.map((r) => [r.purpose, r.outcome, r.model_asked, r.input_tokens]),
    [
      ["ask", "rejected", "claude-opus-5", 0],
      ["ask", "rejected", "claude-opus-5", 0],
      ["ask", "unreachable", "claude-opus-5", 0],
      ["ask", "unreachable", "claude-opus-5", 0],
    ],
    "the ledger keeps what each did not come to",
  );
});

test("a count that cannot be read holds the turn (503 read_failed): the platform's key is not spent on a day nobody could count, and it is not counted as zero", async () => {
  const ws = T(5);
  const tables = { events: [] };
  use(
    tables,
    {},
    {
      ask_tokens_day: () => {
        throw new Error("permission denied for function ask_tokens_day");
      },
    },
  );
  const net = model();
  assert.deepEqual(await answer(await knock(ws, turn())), [
    503,
    { ok: false, error: "read_failed", detail: "Ask's day could not be counted just now." },
  ]);
  assert.equal(net.calls.length, 0, "nothing reached the model");
  assert.equal(tables.events.length, 0, "and no round was written");
});

test("a day past a thousand turns is counted whole: the database sums the day (00240), so no page of 1,000 rows can cut it, where .limit(2000) once stopped at the thousandth", async () => {
  const ws = T(6);
  const events = Array.from({ length: 1500 }, (_, i) => usage(ws, 100, 10, (i % 600) * 60_000));
  const db = fakeDb({ events }, {}, {}, { maxRows: 1000 });
  assert.equal(
    await askTokensLast24h(db, ws),
    1500 * 110,
    "REGRESSION: the budget counted the first 1,000 turns and let the platform key spend on",
  );
});

test("the line is the cap: a workspace one token under it is served, one at it is refused, with the sum the database gave", async () => {
  const under = T(7);
  const at = T(8);
  const tables = { events: [usage(under, ASK_TOKENS_DAY - 1, 0, HOUR), usage(at, ASK_TOKENS_DAY - 1, 1, HOUR)] };
  use(tables);
  const net = model();
  const ok = await knock(under, turn());
  assert.equal(ok.status, 200, "one token under the cap: the round runs");
  await ok.text();
  const no = await knock(at, turn());
  assert.deepEqual(
    [no.status, await no.json()],
    [429, { ok: false, error: "ask_budget", used: ASK_TOKENS_DAY, cap: ASK_TOKENS_DAY }],
    "at the cap: refused before the key is spent",
  );
  assert.equal(net.calls.length, 1, "only the round under the cap reached the model");
});

test("what a round writes to the cache is counted and what it reads is not (00368): a day spent by warms writing a turn's head is refused, a day of reading the same head is served", async () => {
  const warmed = T(11);
  const read = T(12);
  const HEAD = 30_000;
  const heads = Math.ceil(ASK_TOKENS_DAY / HEAD);
  /** A round of next to nothing but the head, written (a warm) or read. */
  const round = (ws, cache) => {
    const u = usage(ws, 8, 1, HOUR);
    return { ...u, data: { ...u.data, ...cache } };
  };
  use({
    events: [
      ...Array.from({ length: heads }, () => round(warmed, { cache_creation_input_tokens: HEAD, purpose: "ask_warm" })),
      ...Array.from({ length: heads }, () => round(read, { cache_read_input_tokens: HEAD })),
    ],
  });
  const net = model();
  const no = await knock(warmed, turn());
  assert.deepEqual(
    [no.status, (await no.json()).error],
    [429, "ask_budget"],
    "REGRESSION: a warm counted under a hundred tokens, so a day of heads written never spent the budget",
  );
  const ok = await knock(read, turn());
  assert.equal(ok.status, 200, "the same heads read: a cache read is not counted");
  await ok.text();
  assert.equal(net.calls.length, 1, "only the day of reads reached the model");
});

test("the cache diagnostics ride through (the Phase 6 plan, D2): an id the API wrote or null passes; anything else is dropped, never refused; and the answer says in server-timing what this edge took and what the model took to its headers (D3)", async () => {
  const ask = (diagnostics) => validateGatewayRequest({ ...REQUEST, diagnostics }, "ask");
  assert.deepEqual(ask({ previous_message_id: "msg_01AbC-d_9" }).request.diagnostics, {
    previous_message_id: "msg_01AbC-d_9",
  });
  assert.deepEqual(ask({ previous_message_id: null }).request.diagnostics, { previous_message_id: null });
  for (const bad of [{ previous_message_id: "not a message" }, { previous_message_id: 7 }, {}, "msg_01", null]) {
    const v = ask(bad);
    assert.equal(v.ok, true, "diagnostics change nothing the model answers: never a refusal");
    assert.equal("diagnostics" in v.request, false, `dropped: ${JSON.stringify(bad)}`);
  }
  assert.equal("diagnostics" in validateGatewayRequest(REQUEST, "ask").request, false, "none asked, none sent");

  const ws = T(10);
  use({ events: [] });
  const net = model();
  const res = await knock(ws, turn({ request: { ...REQUEST, diagnostics: { previous_message_id: "msg_prev" } } }));
  assert.equal(res.status, 200);
  await res.text();
  assert.deepEqual(net.calls[0].body.diagnostics, { previous_message_id: "msg_prev" }, "sent on to the model");
  const timing = res.headers.get("server-timing");
  assert.match(timing, /^gateway;dur=\d+, model;dur=\d+$/, "both durations, in whole milliseconds");
});

test("what the Line needs from the gateway: Opus 5.5 is a model Ask may name, Ask's turn may carry its answer format under 8,000 characters, and Ask is clamped to ASK_MAX_TOKENS while the lead purposes keep their ceiling", async () => {
  const ask = (over) => validateGatewayRequest({ ...REQUEST, ...over }, "ask");
  assert.equal(ask({ model: ASK_MODEL }).ok, true, "Ask's default profile is a model the door allows");
  assert.deepEqual(
    ask({ model: "gpt-9" }),
    { ok: false, error: "bad_request", detail: "unknown model" },
    "and a name that reads as no Claude model is refused (any that does may be asked: ask-model.test.mjs)",
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
  const refused = { ok: false, error: "bad_request", detail: "output_config.format: a JSON schema" };
  // Any size rides through (Ruben, 17 Oct 2026: the 8,000-character bound protected nothing); a format that is no schema
  // is refused.
  const huge = { type: "object", properties: { say: { type: "string", description: "x".repeat(20_000) } } };
  const big = ask({ output_config: { format: { type: "json_schema", schema: huge } } });
  assert.deepEqual(big.ok && big.request.output_config.format, { type: "json_schema", schema: huge });
  assert.deepEqual(ask({ output_config: { format: { type: "text" } } }), refused);
  const ceiling = (purpose) => {
    // A model every purpose may name: the lead purposes', which Ask may name too.
    const v = validateGatewayRequest({ ...REQUEST, model: MODEL_ROUTES.lead_json.model, max_tokens: 9_000 }, purpose);
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

/* ------------------------------------------------ fast mode and thinking (15 Oct 2026) ------------------------------------------------ */

test("what a request may ask the model beyond its words: fast mode rides through and any other speed is standard; a thinking type of the three passes; a beta must be one the gateway lists; anything else is dropped, never refused, as an effort is", () => {
  const ask = (over) => validateGatewayRequest({ ...REQUEST, model: "claude-opus-5-5", ...over }, "ask");
  assert.equal(ask({ speed: "fast" }).request.speed, "fast");
  for (const other of ["standard", "turbo", 2, null])
    assert.equal("speed" in ask({ speed: other }).request, false, `${JSON.stringify(other)} is standard: none named`);
  assert.equal("speed" in ask({}).request, false);

  for (const type of ["adaptive", "between_tools", "disabled"])
    assert.deepEqual(ask({ thinking: { type } }).request.thinking, { type });
  assert.deepEqual(
    ask({ thinking: { type: "adaptive", budget_tokens: 9_000 } }).request.thinking,
    { type: "adaptive" },
    "the type alone: a budget is a 400 on every model Ask runs",
  );
  for (const bad of [{ type: "enabled" }, "adaptive", {}, null]) {
    const v = ask({ thinking: bad });
    assert.equal(v.ok, true, JSON.stringify(bad));
    assert.equal("thinking" in v.request, false, `dropped: ${JSON.stringify(bad)}`);
  }

  assert.deepEqual(ask({ betas: [FAST_MODE_BETA, FAST_MODE_BETA] }).request.betas, [FAST_MODE_BETA], "each once");
  assert.equal("betas" in ask({ betas: [] }).request, false);
  assert.deepEqual(
    ask({ betas: ["files-api-2025-04-14", FAST_MODE_BETA] }).request.betas,
    [FAST_MODE_BETA],
    "only the betas the gateway lists reach the header",
  );
  for (const bad of [["files-api-2025-04-14"], FAST_MODE_BETA, [7]])
    assert.equal("betas" in ask({ betas: bad }).request, false, `dropped: ${JSON.stringify(bad)}`);
});

/** The stream of a round the API ran in fast mode: its usage says so. */
const FAST_TURN = TURN.map((e) =>
  e.type === "message_start"
    ? { ...e, message: { ...e.message, model: "claude-opus-5-5", usage: { ...e.message.usage, speed: "fast" } } }
    : e,
);

test("a fast round: the door sends speed in the body and fast mode's beta in the header, says the speed back in x-model-speed, and its usage row and ledger dollars are fast mode's, as the API said it ran", async () => {
  resetFastHolds();
  const ws = T(41);
  const tables = { events: [] };
  use(tables);
  const net = model(FAST_TURN);
  const t0 = Date.now();
  const res = await knock(ws, turn({ request: { ...REQUEST, model: "claude-opus-5-5", speed: "fast" } }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("x-model-speed"), "fast");
  await res.text();
  assert.equal(net.calls.length, 1);
  assert.equal(net.calls[0].body.speed, "fast");
  assert.equal(net.calls[0].headers["anthropic-beta"], FAST_MODE_BETA, "the port adds the beta for a fast request");
  const [row] = tables.events.filter((e) => e.tenant_id === ws && Date.parse(e.created_at) >= t0);
  assert.equal(row.data.speed, "fast", "the usage row says the speed, so ask-day prices it at fast mode's rate");
  const [ledger] = tables.ai_usage.filter((r) => r.tenant_id === ws);
  // 1,200 in at $8, 42 out at $40, 900 read from the cache at $0.40, per million.
  assert.equal(ledger.usd, 0.01164, "fast mode's own price, twice the standard 0.00582");
});

test("fast mode's own limit refusing a round (a 429) is no failure: the door's answer is the same model at standard speed, said back as standard and in the log as slowed; the next round goes standard from the start, and its usage is priced at standard", async () => {
  resetFastHolds();
  const ws = T(42);
  const tables = { events: [] };
  use(tables);
  let n = 0;
  const net = wired(() =>
    n++ === 0
      ? new Response(
          JSON.stringify({
            type: "error",
            error: { type: "rate_limit_error", message: "rate limit of 0 fast mode input tokens per minute" },
          }),
          { status: 429, headers: { "content-type": "application/json", "anthropic-fast-input-tokens-limit": "0" } },
        )
      : new Response(streamed(sse(TURN)), { status: 200, headers: { "content-type": "text/event-stream" } }),
  );
  const warned = [];
  const was = console.warn;
  console.warn = (...args) => {
    const line = logLineOf(args);
    if (line) warned.push(line);
  };
  let res;
  try {
    res = await knock(ws, turn({ request: { ...REQUEST, model: "claude-opus-5-5", speed: "fast" } }));
    assert.equal(res.status, 200, "never a failure for fast mode's limit");
    await res.text();
  } finally {
    console.warn = was;
  }
  assert.equal(res.headers.get("x-model-speed"), "standard");
  assert.deepEqual(
    net.calls.map((c) => [c.body.model, c.body.speed ?? "standard", c.headers["anthropic-beta"] ?? null]),
    [
      ["claude-opus-5-5", "fast", FAST_MODE_BETA],
      ["claude-opus-5-5", "standard", null],
    ],
  );
  const slowed = warned.filter((l) => l.event === "ask_gateway_slowed");
  assert.equal(slowed.length, 1);
  assert.deepEqual(fieldsOf(slowed[0]), { tenant_id: ws, model: "claude-opus-5-5", purpose: "ask" });
  const [row] = tables.events.filter((e) => e.tenant_id === ws);
  assert.equal(row.data.speed, "standard");
  assert.equal(
    tables.ai_usage.filter((r) => r.tenant_id === ws).length,
    1,
    "one ledger row: the refusal spent nothing",
  );

  // The next round: held at standard, no refusal paid.
  const next = model();
  const again = await knock(ws, turn({ request: { ...REQUEST, model: "claude-opus-5-5", speed: "fast" } }));
  await again.text();
  assert.equal(next.calls.length, 1);
  assert.equal(next.calls[0].body.speed, undefined);
  assert.equal(again.headers.get("x-model-speed"), "standard");
  resetFastHolds();
});
