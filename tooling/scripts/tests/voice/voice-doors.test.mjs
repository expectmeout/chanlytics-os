/**
 * The two voice doors, run: POST /api/admin/voice-provision and
 * /api/admin/voice-converge over a database in memory and a captured wire to
 * Retell that remembers what it was asked to create. Until 13 Sep 2026 their
 * text was pinned by twenty-odd assertions in six files and neither POST had
 * ever been called.
 *
 * Provision: a workspace's phone receptionist on a Retell-owned number. The
 * knock, the workspace rule, the plan (a dry run by default, printing exactly
 * what an apply sends and reaching no provider), then the apply in the plan's
 * order -- the LLM that IS the shell, the agent over it, the first version
 * published, a number bought in an area code or an existing one bound, and
 * the row written LAST, once a number answers -- with the workspace's bell
 * and the platform's event; a failed step answers with what was made so far
 * so the next run resumes, and an adopted agent is read from the provider
 * before it is trusted. Nothing that comes back carries a secret.
 *
 * Converge: the agent-level settings the call pipeline depends on, planned
 * from the live agent and applied only when asked -- on a new draft when the
 * version is published, published only when asked -- with each agent as it
 * was before as the backup, its webhook secret stripped. The LLM is never
 * touched here.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  signEdgeToken,
  voiceLlmCreateBody,
  voiceAgentCreateBody,
  voiceNumberCreateBody,
  voiceNumberBindBody,
  voiceEndpoints,
  planVoiceProvision,
  planAgentSettings,
  VOICE_AGENT_DEFAULTS,
  VOICE_LLM_DEFAULTS,
  VOICE_WEBHOOK_EVENTS,
  VOICE_WEBHOOK_TIMEOUT_MS,
  CALL_ANALYSIS_FIELDS,
} from "@chanlytics/channels";
import { formatPhoneDisplay } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";

// The doors read these at call time; each test file is its own process. No
// EDGE_ORIGIN, so the endpoints the provider is told are the shell's own
// default; no DIAG_KEY, so the token is the only way in unless a case says.
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.RETELL_API_KEY = "retell-key-for-this-file";
process.env.RETELL_FN_SECRET = "fn-secret-nobody-may-see";
for (const k of [
  "DIAG_KEY",
  "EDGE_ORIGIN",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "RESEND_API_KEY",
  "LEAD_TO",
  "LEAD_FROM",
])
  delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
/** Where this edge tells the provider its voice tools post (no EDGE_ORIGIN here: the default off production). */
const { edgeFnUrl } = await import(at("apps/edge/lib/dashboard-origin.ts"));
const FN_URL = edgeFnUrl();
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const provision = await import(at("apps/edge/api/admin/voice-provision.ts"));
const converge = await import(at("apps/edge/api/admin/voice-converge.ts"));
after(() => setPg(null));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NUMBER = "+13055550100";
const SECRETS = { fnSecret: process.env.RETELL_FN_SECRET };
const FN_SECRET = process.env.RETELL_FN_SECRET;
const KEY = process.env.RETELL_API_KEY;

/* ------------------------------- the knock -------------------------------- */

const token = (aud, o = {}) =>
  signEdgeToken(o.secret ?? process.env.EDGE_CALL_SECRET, o.aud ?? aud, {
    workspace: "workspace" in o ? o.workspace : A,
    user: "u1",
  });
const knockAt =
  (door, aud) =>
  (body, headers = { "x-edge-token": token(aud) }) =>
    door.POST(
      new Request(`http://edge${aud}`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
const PROVISION = "/api/admin/voice-provision";
const CONVERGE = "/api/admin/voice-converge";
const knock = knockAt(provision, PROVISION);
const knockConverge = knockAt(converge, CONVERGE);
/** The provision door with the body sent as it is, not as JSON. */
const knockRaw = (raw, headers = { "x-edge-token": token(PROVISION) }) =>
  provision.POST(
    new Request(`http://edge${PROVISION}`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: raw,
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

/* -------------------------------- the world ------------------------------- */

const tenants = () => [
  { id: A, name: "Harbor Moving", slug: "harbor-moving", status: "active" },
  { id: B, name: "Billing probe", slug: "billing-probe", status: "active" },
];
const voiceRow = (over = {}) => ({
  id: "ch-voice-a",
  tenant_id: A,
  kind: "voice",
  external_id: "agent_pub",
  number_e164: NUMBER,
  status: "active",
  config: { provider: "retell" },
  created_at: "2026-09-01T00:00:00Z",
  ...over,
});
/** The database the door will find. */
function use(over = {}, faults = {}) {
  const tables = { tenants: tenants(), tenant_channels: [], notifications: [], events: [], ...over };
  const db = fakeDb(tables, faults, {});
  setPg(db);
  return { tables, db };
}
const writes = (db, table) =>
  db.seen.filter((s) => s.table === table && ["insert", "update", "upsert", "delete"].includes(s.op));

/**
 * Retell, as far as these two doors can see it: it remembers what it was
 * asked to create and answers the read-back with it, so the doors' own
 * "does a fresh line plan nothing?" is asked of what was actually sent. A
 * case scripts a failure by URL; anything unexpected throws.
 */
function retell({ agents = {}, llms = {}, fail = [] } = {}) {
  const seen = [];
  const state = { agents: new Map(Object.entries(agents)), llms: new Map(Object.entries(llms)), made: 0 };
  const real = globalThis.fetch;
  const strip = (u) => u.replace("https://api.retellai.com", "");
  const reply = (req) => {
    const p = strip(req.url);
    for (const f of fail)
      if (f.when(p, req)) return { status: f.status, body: f.body ?? { message: `scripted ${f.status}` } };
    const body = req.body ? JSON.parse(req.body) : null;
    let m;
    if (req.method === "POST" && p === "/create-retell-llm") {
      const id = `llm_${++state.made}`;
      state.llms.set(id, { ...body, llm_id: id, version: 0 });
      return { body: state.llms.get(id) };
    }
    if (req.method === "POST" && p === "/create-agent") {
      const id = `agent_${++state.made}`;
      state.agents.set(id, { ...body, agent_id: id, version: 0, is_published: false });
      return { body: state.agents.get(id) };
    }
    if (req.method === "POST" && (m = /^\/publish-agent-version\/(.+)$/.exec(p))) {
      const a = state.agents.get(m[1]);
      if (!a) return { status: 404, body: { message: "no such agent" } };
      Object.assign(a, { is_published: true, version: body.version });
      return { body: {} };
    }
    if (req.method === "POST" && (m = /^\/create-agent-version\/(.+)$/.exec(p))) {
      const a = state.agents.get(m[1]);
      if (!a) return { status: 404, body: { message: "no such agent" } };
      Object.assign(a, { version: body.base_version + 1, is_published: false });
      return { body: { version: a.version } };
    }
    if (req.method === "PATCH" && (m = /^\/update-agent\/(.+)$/.exec(p))) {
      const a = state.agents.get(m[1]);
      if (!a) return { status: 404, body: { message: "no such agent" } };
      Object.assign(a, body);
      return { body: a };
    }
    if (req.method === "POST" && p === "/create-phone-number")
      return { body: { ...body, phone_number: NUMBER, phone_number_type: "retell-twilio" } };
    if (req.method === "PATCH" && (m = /^\/update-phone-number\/(.+)$/.exec(p)))
      return { body: { ...body, phone_number: decodeURIComponent(m[1]), phone_number_type: "retell-twilio" } };
    if (req.method === "GET" && (m = /^\/get-agent\/(.+)$/.exec(p))) {
      const a = state.agents.get(m[1]);
      return a ? { body: a } : { status: 404, body: { message: "no such agent" } };
    }
    if (req.method === "GET" && (m = /^\/get-retell-llm\/([^?]+)(\?version=(\d+))?$/.exec(p))) {
      const l = state.llms.get(m[1]);
      return l ? { body: l } : { status: 404, body: { message: "no such llm" } };
    }
    throw new Error(`the provider was asked something these doors never ask: ${req.method} ${p}`);
  };
  globalThis.fetch = async (url, init) => {
    const req = {
      url: String(url),
      method: init?.method ?? "GET",
      headers: init?.headers ?? {},
      body: typeof init?.body === "string" ? init.body : null,
      rowsAtTheTime: null,
    };
    seen.push(req);
    const a = reply(req);
    return new Response(JSON.stringify(a.body ?? {}), { status: a.status ?? 200 });
  };
  return {
    seen,
    state,
    paths: () => seen.map((r) => `${r.method} ${strip(r.url)}`),
    restore: () => {
      globalThis.fetch = real;
    },
  };
}
/** A wire nothing may reach: a dry run, a refusal and a plan that is nothing must make no call. */
function unreachable(why) {
  const real = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error(why);
  };
  return {
    restore: () => {
      globalThis.fetch = real;
    },
  };
}
/** The whole answer as text: the one place a secret could leak is what comes back. */
const printed = (body) => JSON.stringify(body);

/* ============================== voice-provision ============================ */

test("provision, the door: a token for another door, a forgery and no credential are 403; no provider key, no function secret and no database are each a 503 that names itself; nothing is read or sent", async () => {
  const { db } = use();
  const net = unreachable("a refused run must reach no provider");
  try {
    assert.deepEqual(await answer(await knock({ tenant_id: A }, { "x-edge-token": token(CONVERGE) })), [
      403,
      { ok: false, error: "token_audience" },
    ]);
    assert.deepEqual(
      await answer(await knock({ tenant_id: A }, { "x-edge-token": token(PROVISION, { secret: "not-the-secret" }) })),
      [403, { ok: false, error: "token_signature" }],
    );
    assert.deepEqual(await answer(await knock({ tenant_id: A }, {})), [403, { ok: false }]);
    assert.deepEqual(await answer(await withEnv({ RETELL_API_KEY: undefined }, () => knock({ tenant_id: A }))), [
      503,
      { ok: false, error: "no_provider_key" },
    ]);
    assert.deepEqual(
      await answer(await withEnv({ RETELL_FN_SECRET: undefined }, () => knock({ tenant_id: A }))),
      [503, { ok: false, error: "no_fn_secret" }],
      "without the shared secret the tools it would create could never open the edge",
    );
    setPg(null);
    assert.deepEqual(await answer(await knock({ tenant_id: A })), [503, { ok: false, error: "no_database" }]);
    assert.equal(db.seen.length, 0);
  } finally {
    net.restore();
  }
});

test("provision, the workspace: a token naming one refuses a body naming another; a key-holder must name one; an unknown workspace is 404; the token's own is acted on with no body at all", async () => {
  const { db } = use();
  const net = unreachable("a refused run must reach no provider");
  try {
    assert.deepEqual(await answer(await knock({ tenant_id: B })), [403, { ok: false, error: "workspace_mismatch" }]);
    assert.equal(db.seen.length, 0, "refused before anything is read");
    await withEnv({ EDGE_CALL_SECRET: undefined, DIAG_KEY: "diag-key-for-this-file" }, async () => {
      assert.deepEqual(await answer(await knock({}, { "x-diag-key": "diag-key-for-this-file" })), [
        400,
        { ok: false, error: "bad_tenant", detail: "tenant_id (a workspace id) is required" },
      ]);
      assert.deepEqual(
        await answer(await knock({ tenant_id: "not-a-workspace" }, { "x-diag-key": "diag-key-for-this-file" })),
        [400, { ok: false, error: "bad_tenant", detail: "tenant_id (a workspace id) is required" }],
      );
      const [status, body] = await answer(await knock({ tenant_id: B }, { "x-diag-key": "diag-key-for-this-file" }));
      assert.equal(status, 200, "a key-holder's body is believed");
      assert.equal(body.tenant.slug, "billing-probe");
    });
    assert.deepEqual(
      await answer(
        await knock({}, { "x-edge-token": token(PROVISION, { workspace: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }) }),
      ),
      [404, { ok: false, error: "not_found", detail: "no such workspace" }],
    );
    const [status, body] = await answer(await knockRaw(""));
    assert.equal(status, 200, "no body: the token's workspace, a dry run");
    assert.deepEqual(body.tenant, { id: A, slug: "harbor-moving", name: "Harbor Moving" });
    assert.equal((await knockRaw("not even json")).status, 200, "a body that is not JSON is no body");
    // REPORTED, not fixed here: a body of exactly `null` is valid JSON, so the
    // parse succeeds, `body` becomes null, and the first property read on it
    // throws -- an unhandled exception (a Vercel 500) where a 400 belongs.
    // Only null does this: a JSON string, number, boolean or array all read as
    // undefined and land on the door's own 400. The same
    // `let body = {}; try { body = JSON.parse(...) } catch {}` shape is in the
    // steer, whisper, connect and eval doors, so all five share it.
    await assert.rejects(knockRaw("null"), TypeError);
  } finally {
    net.restore();
  }
});

test("provision, the plan: a dry run by default that prints what an apply would send and reaches no provider; a bad request is the plan's own errors; a workspace with a line plans nothing even when told to apply", async () => {
  const { tables, db } = use();
  const net = unreachable("a dry run makes no call");
  try {
    const [status, body] = await answer(await knock({ tenant_id: A, area_code: "305" }));
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.apply, false, "nothing moves unless asked");
    assert.deepEqual(
      body.plan,
      planVoiceProvision({
        tenant: { id: A, name: "Harbor Moving" },
        channel: null,
        request: { number: null, areaCode: 305, llmId: null, agentId: null },
      }),
      "the plan the apply follows, from the shared package",
    );
    assert.deepEqual(
      body.plan.steps.map((s) => [s.id, s.action]),
      [
        ["llm", "create"],
        ["agent", "create"],
        ["publish", "publish"],
        ["number", "buy"],
        ["channel", "insert"],
        ["notify", "notify"],
      ],
    );
    const ends = voiceEndpoints(FN_URL);
    assert.deepEqual(
      body.preview,
      {
        agent_name: "Harbor Moving front desk",
        nickname: "Harbor Moving · Chanlytics",
        voice_id: VOICE_AGENT_DEFAULTS.voice_id,
        languages: VOICE_AGENT_DEFAULTS.language.length,
        model: VOICE_LLM_DEFAULTS.model,
        retention_days: VOICE_AGENT_DEFAULTS.data_storage_retention_days,
        webhook_url: ends.webhook,
        inbound_webhook_url: ends.inbound,
        tools_url: ends.fn,
      },
      "what the apply would create, and every URL without its query string",
    );
    assert.ok(!printed(body).includes("?") && !printed(body).includes(FN_SECRET), "no secret in a preview");
    assert.equal(writes(db, "tenant_channels").length + writes(db, "notifications").length, 0);

    for (const [req, error] of [
      [{ number: "3055550100" }, "number must be E.164, like +13055550100"],
      [{ area_code: 30 }, "area_code must be three digits, like 305"],
      [{ number: NUMBER, area_code: 305 }, "give a number to bind or an area code to buy in, not both"],
      [{ llm_id: "nope" }, "llm_id does not look like a Retell LLM id"],
      [{ agent_id: "nope" }, "agent_id does not look like a Retell agent id"],
    ]) {
      const [s, b] = await answer(await knock({ tenant_id: A, apply: true, ...req }));
      assert.equal(s, 400, JSON.stringify(req));
      assert.deepEqual([b.ok, b.plan.errors], [false, [error]]);
    }

    tables.tenant_channels.push(voiceRow());
    const [s, b] = await answer(await knock({ tenant_id: A, area_code: 305, apply: true }));
    assert.equal(s, 200);
    assert.deepEqual(
      [b.ok, b.apply, b.plan.nothing, b.plan.steps],
      [true, true, true, []],
      "idempotent: a workspace with a voice row plans nothing",
    );
    assert.match(
      b.plan.reason,
      /^already answering on \+13055550100 \(agent agent_pub\); voice-converge keeps it on the shell$/,
    );
    tables.tenant_channels[0].status = "disabled";
    assert.match(
      (await (await knock({ tenant_id: A, area_code: 305, apply: true })).json()).plan.reason,
      /is disabled .* switch it on in Connections rather than provisioning another/,
    );
  } finally {
    net.restore();
  }
});

test("provision, the apply that buys a number: the LLM that is the shell, the agent over it, the first version published, a local number bought and pinned -- each body the shared package's, the call-start webhook behind the key and the call webhook behind the signature -- then the row LAST, the workspace's bell and the platform's event; the read-back plans nothing; nothing that comes back carries the secret", async () => {
  const { tables } = use();
  const p = retell();
  let rowsWhenBought = null;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith("/create-phone-number")) rowsWhenBought = tables.tenant_channels.length;
    return realFetch(url, init);
  };
  let status, body;
  try {
    [status, body] = await answer(await knock({ tenant_id: A, area_code: 305, apply: true }));
  } finally {
    globalThis.fetch = realFetch;
    p.restore();
  }
  assert.equal(status, 200, printed(body));
  assert.deepEqual(
    p.paths(),
    [
      "POST /create-retell-llm",
      "POST /create-agent",
      "POST /publish-agent-version/agent_2",
      "POST /create-phone-number",
      "GET /get-agent/agent_2",
      "GET /get-retell-llm/llm_1?version=0",
    ],
    "the plan's order, then the read-back at the version the agent points at",
  );
  assert.ok(
    p.seen.every((r) => r.headers.Authorization === `Bearer ${KEY}`),
    "every call behind the provider key",
  );
  const [llm, agent, publish, number] = p.seen.map((r) => (r.body ? JSON.parse(r.body) : null));
  assert.deepEqual(
    llm,
    voiceLlmCreateBody(SECRETS, FN_URL),
    "the shell, byte for byte: placeholders, the four tools with the secret on their header, spoken defaults",
  );
  assert.equal(
    llm.general_tools.find((t) => t.name === "send_booking_link").headers["x-fn-secret"],
    FN_SECRET,
    "the tools can open the edge",
  );
  assert.deepEqual(
    agent,
    voiceAgentCreateBody({ llmId: "llm_1", llmVersion: 0, agentName: "Harbor Moving front desk" }, SECRETS, FN_URL),
    "the product's voice, the webhook with its events, the analysis fields, retention",
  );
  assert.equal(
    agent.webhook_url,
    voiceEndpoints(FN_URL).webhook,
    "the call webhook carries no key: the signature is its credential",
  );
  assert.deepEqual(publish, { version: 0, version_title: "provisioned from the edge" });
  assert.deepEqual(
    number,
    voiceNumberCreateBody(
      { areaCode: 305, agentId: "agent_2", pinned: true, nickname: "Harbor Moving · Chanlytics" },
      SECRETS,
      FN_URL,
    ),
  );
  assert.deepEqual(
    number.inbound_agents,
    [{ agent_id: "agent_2", agent_version: "latest_published", weight: 1 }],
    "pinned to latest_published: a saved draft cannot go live by itself",
  );
  assert.equal(
    rowsWhenBought,
    0,
    "the row is written after the number answers: a row that exists is a line that works",
  );

  // The row: the line exists for the product from here on.
  assert.equal(tables.tenant_channels.length, 1);
  const row = tables.tenant_channels[0];
  assert.deepEqual(
    [row.tenant_id, row.kind, row.external_id, row.number_e164, row.status],
    [A, "voice", "agent_2", NUMBER, "active"],
  );
  const { provisioned_at, ...config } = row.config;
  assert.deepEqual(config, {
    provider: "retell",
    llm_id: "llm_1",
    agent_version: 0,
    pinned: true,
    number_type: "retell-twilio",
    provisioned_by: "voice-provision",
  });
  assert.ok(Number.isFinite(Date.parse(provisioned_at)));
  // The bell and the event.
  const shown = formatPhoneDisplay(NUMBER);
  assert.equal(tables.notifications.length, 1);
  const bell = tables.notifications[0];
  assert.deepEqual(
    [bell.tenant_id, bell.kind, bell.title, bell.route, bell.subject_type, bell.subject_id],
    [A, "number", `Your phone line is ready: ${shown}`, "admin/setup", "setup", row.id],
  );
  assert.ok(
    bell.body.includes(`The receptionist answers calls on ${shown}.`) &&
      bell.body.includes("Setup now reads the line as ready"),
  );
  assert.equal(tables.events.length, 1);
  const ev = tables.events[0];
  assert.deepEqual(
    [ev.tenant_id, ev.kind, ev.category, ev.subject_type, ev.subject_id],
    [A, "voice.provisioned", "setup", "tenant_channel", row.id],
  );
  assert.deepEqual(ev.data, {
    agent_id: "agent_2",
    llm_id: "llm_1",
    number: NUMBER,
    pinned: true,
    bought: true,
    number_type: "retell-twilio",
  });

  // What comes back: every id, the number, and the read-back -- and no secret anywhere in it.
  assert.deepEqual(body.result.llm, { llm_id: "llm_1", version: 0, created: true });
  assert.deepEqual(body.result.agent, { agent_id: "agent_2", version: 0, created: true });
  assert.deepEqual(body.result.publish, { ok: true, version: 0 });
  assert.deepEqual(body.result.number, {
    phone_number: NUMBER,
    bought: true,
    area_code: 305,
    pinned: true,
    type: "retell-twilio",
  });
  assert.deepEqual(body.result.channel, { id: row.id, status: "active" });
  assert.deepEqual(
    body.result.after,
    { agent: [], shell: [], published: true },
    "a freshly provisioned line plans nothing on either converger",
  );
  assert.ok(
    !printed(body).includes(FN_SECRET) && !printed(body).includes("key="),
    "every URL comes back without its query string, and the provider's success body -- which echoes the webhook URL -- is never echoed",
  );
  assert.ok(!printed(body).includes(KEY));
});

test("provision, the apply's legs in order: the receptionist and the number at the provider with nothing written, then the row, the bell and the event, and only then the read-back", async () => {
  for (const [ask, numberCall] of [
    [{ area_code: 305 }, "POST /create-phone-number"],
    [{ number: NUMBER }, "PATCH /update-phone-number/%2B13055550100"],
  ]) {
    const { tables } = use();
    const p = retell();
    const written = [];
    const providerFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      written.push([tables.tenant_channels.length, tables.notifications.length, tables.events.length]);
      return providerFetch(url, init);
    };
    let status;
    try {
      [status] = await answer(await knock({ tenant_id: A, apply: true, ...ask }));
    } finally {
      globalThis.fetch = providerFetch;
      p.restore();
    }
    assert.equal(status, 200);
    assert.deepEqual(
      p.paths().map((call, i) => [call, written[i]]),
      [
        ["POST /create-retell-llm", [0, 0, 0]],
        ["POST /create-agent", [0, 0, 0]],
        ["POST /publish-agent-version/agent_2", [0, 0, 0]],
        [numberCall, [0, 0, 0]],
        ["GET /get-agent/agent_2", [1, 1, 1]],
        ["GET /get-retell-llm/llm_1?version=0", [1, 1, 1]],
      ],
      JSON.stringify(ask),
    );
  }
});

test("provision, the apply that binds an existing number:the number is patched onto the agent, pinned, with the inbound webhook; the event says it was not bought", async () => {
  const { tables } = use();
  const p = retell();
  let status, body;
  try {
    [status, body] = await answer(await knock({ tenant_id: A, number: NUMBER, apply: true }));
  } finally {
    p.restore();
  }
  assert.equal(status, 200, printed(body));
  assert.deepEqual(p.paths(), [
    "POST /create-retell-llm",
    "POST /create-agent",
    "POST /publish-agent-version/agent_2",
    "PATCH /update-phone-number/%2B13055550100",
    "GET /get-agent/agent_2",
    "GET /get-retell-llm/llm_1?version=0",
  ]);
  assert.deepEqual(
    JSON.parse(p.seen[3].body),
    voiceNumberBindBody({ agentId: "agent_2", pinned: true, nickname: "Harbor Moving · Chanlytics" }, SECRETS, FN_URL),
  );
  assert.deepEqual(body.result.number, { phone_number: NUMBER, bound: true, pinned: true, type: "retell-twilio" });
  assert.equal(tables.tenant_channels[0].number_e164, NUMBER);
  assert.equal(tables.events[0].data.bought, false);
  assert.ok(!printed(body).includes(FN_SECRET));
});

test("provision, an apply with no number asked for: the receptionist is made and published, the row is not written, and the answer says how to finish", async () => {
  const { tables, db } = use();
  const p = retell();
  let status, body;
  try {
    [status, body] = await answer(await knock({ tenant_id: A, apply: true }));
  } finally {
    p.restore();
  }
  assert.equal(status, 200);
  assert.deepEqual(p.paths(), ["POST /create-retell-llm", "POST /create-agent", "POST /publish-agent-version/agent_2"]);
  assert.equal(
    body.note,
    "agent ready; no number asked for — re-run with number or area_code, and this agent_id, to finish",
  );
  assert.deepEqual(
    [body.result.llm.llm_id, body.result.agent.agent_id, body.result.publish.ok],
    ["llm_1", "agent_2", true],
  );
  assert.equal(tables.tenant_channels.length, 0, "the row is not written until a number answers");
  assert.equal(
    writes(db, "notifications").length + writes(db, "events").length,
    0,
    "and nobody is told a line is ready",
  );
});

test("provision, a run that fails partway answers with the step, the provider's status and what was made so far; the next run passes the ids back and each is read from the provider before it is trusted", async () => {
  // The agent step refused after the LLM was made.
  const { tables } = use();
  const failing = retell({
    fail: [{ when: (p) => p === "/create-agent", status: 500, body: { message: "internal" } }],
  });
  let status, body;
  try {
    [status, body] = await answer(await knock({ tenant_id: A, area_code: 305, apply: true }));
  } finally {
    failing.restore();
  }
  assert.equal(status, 503, "a provider 5xx is our 503");
  assert.deepEqual(
    [body.error, body.step, body.status, body.detail],
    ["provider_refused", "agent", 500, JSON.stringify({ message: "internal" })],
    "the step, the provider's status, and its body as text",
  );
  assert.deepEqual(
    body.result,
    { llm: { llm_id: "llm_1", version: 0 } },
    "what was made so far rides in the result, so the run can be resumed",
  );
  assert.deepEqual(
    failing.paths(),
    ["POST /create-retell-llm", "POST /create-agent"],
    "no number was bought after a failure",
  );
  assert.equal(tables.tenant_channels.length, 0);

  // Resumed with the LLM: it is read first, then only the agent is created.
  const resumed = retell({ llms: { llm_1: { ...voiceLlmCreateBody(SECRETS, FN_URL), llm_id: "llm_1", version: 0 } } });
  try {
    [status, body] = await answer(await knock({ tenant_id: A, llm_id: "llm_1", area_code: 305, apply: true }));
  } finally {
    resumed.restore();
  }
  assert.equal(status, 200, printed(body));
  assert.deepEqual(resumed.paths().slice(0, 3), [
    "GET /get-retell-llm/llm_1",
    "POST /create-agent",
    "POST /publish-agent-version/agent_1",
  ]);
  assert.deepEqual(body.result.llm, { llm_id: "llm_1", version: 0, created: false }, "reused, not created");
  assert.equal(JSON.parse(resumed.seen[1].body).response_engine.llm_id, "llm_1");

  // Resumed with an agent a previous run left behind, unpublished: adopted, published, bound; the row names its LLM.
  const left = {
    ...voiceAgentCreateBody(
      { llmId: "llm_left", llmVersion: 0, agentName: "Harbor Moving front desk" },
      SECRETS,
      FN_URL,
    ),
    agent_id: "agent_left",
    version: 0,
    is_published: false,
  };
  const adopt = retell({
    agents: { agent_left: left },
    llms: { llm_left: { ...voiceLlmCreateBody(SECRETS, FN_URL), llm_id: "llm_left", version: 0 } },
  });
  const fresh = use();
  try {
    [status, body] = await answer(await knock({ tenant_id: A, agent_id: "agent_left", number: NUMBER, apply: true }));
  } finally {
    adopt.restore();
  }
  assert.equal(status, 200, printed(body));
  assert.deepEqual(
    adopt.paths(),
    [
      "GET /get-agent/agent_left",
      "POST /publish-agent-version/agent_left",
      "PATCH /update-phone-number/%2B13055550100",
      "GET /get-agent/agent_left",
      "GET /get-retell-llm/llm_left?version=0",
    ],
    "read before trusted, published because it was not, bound, read back",
  );
  assert.deepEqual(
    [body.result.llm, body.result.agent],
    [
      { llm_id: "llm_left", version: 0, created: false },
      { agent_id: "agent_left", version: 0, created: false },
    ],
  );
  assert.deepEqual(
    body.plan.steps.slice(0, 2).map((s) => s.action),
    ["skip", "adopt"],
  );
  assert.equal(
    fresh.tables.tenant_channels[0].config.llm_id,
    "llm_left",
    "the row names the LLM the adopted agent brought",
  );
  assert.deepEqual(body.result.after, { agent: [], shell: [], published: true });

  // An agent this key cannot read is not adopted.
  use();
  const blind = retell();
  try {
    [status, body] = await answer(await knock({ tenant_id: A, agent_id: "agent_ghost", number: NUMBER, apply: true }));
  } finally {
    blind.restore();
  }
  assert.equal(status, 502);
  assert.deepEqual(
    [body.error, body.step, body.status, body.detail],
    ["provider_refused", "agent", 404, "agent_ghost is not readable with this key"],
  );
  assert.deepEqual(blind.paths(), ["GET /get-agent/agent_ghost"]);

  // The number step refused, or answered without a number: no row, and the ids to resume with.
  const { tables: t2 } = use();
  const noNumber = retell({
    fail: [{ when: (p) => p === "/create-phone-number", status: 402, body: { message: "insufficient balance" } }],
  });
  try {
    [status, body] = await answer(await knock({ tenant_id: A, area_code: 305, apply: true }));
  } finally {
    noNumber.restore();
  }
  assert.equal(status, 502);
  assert.deepEqual(
    [body.error, body.step, body.status, body.detail],
    ["provider_refused", "number", 402, JSON.stringify({ message: "insufficient balance" })],
  );
  assert.deepEqual(
    [body.result.llm.llm_id, body.result.agent.agent_id, "channel" in body.result],
    ["llm_1", "agent_2", false],
  );
  assert.equal(t2.tenant_channels.length, 0);
  const noAnswer = retell({
    fail: [{ when: (p) => p === "/create-phone-number", status: 200, body: { nickname: "x" } }],
  });
  try {
    [status, body] = await answer(await knock({ tenant_id: A, area_code: 305, apply: true }));
  } finally {
    noAnswer.restore();
  }
  assert.deepEqual(
    [status, body.error, body.step, body.status, body.detail],
    [503, "provider_refused", "number", 502, "the provider answered without a phone number"],
    "an answer with no number in it is the provider's failure, not the caller's",
  );

  // The row refused after the number is bound: the answer says which number is on which agent, so the re-run binds rather than buys.
  use({}, { "tenant_channels.insert": { message: "duplicate key value violates unique constraint" } });
  const bound = retell();
  try {
    [status, body] = await answer(await knock({ tenant_id: A, area_code: 305, apply: true }));
  } finally {
    bound.restore();
  }
  assert.equal(status, 503);
  assert.deepEqual([body.error, body.step], ["write_failed", "channel"], "the row, not the provider, refused");
  assert.equal(
    body.detail,
    `duplicate key value violates unique constraint — the number ${NUMBER} is bound to agent_2; re-run with number and agent_id`,
  );
  assert.ok(!printed(body).includes(FN_SECRET));
});

/* =============================== voice-converge ============================ */

/** An agent as get-agent returns it, on the pipeline's settings, its call webhook bare (the signature is its credential), published at version 3. */
const onSettings = (id, over = {}) => ({
  agent_id: id,
  agent_name: "Harbor Moving front desk",
  version: 3,
  is_published: true,
  response_engine: { type: "retell-llm", llm_id: "llm_pub", version: 1 },
  webhook_url: "https://chanlytics-messaging.vercel.app/api/retell-webhook",
  webhook_events: [...VOICE_WEBHOOK_EVENTS],
  webhook_timeout_ms: VOICE_WEBHOOK_TIMEOUT_MS,
  opt_in_signed_url: true,
  data_storage_retention_days: 90,
  post_call_analysis_data: CALL_ANALYSIS_FIELDS.map((f) => ({ ...f })),
  ...over,
});
/** The same agent as the live one was found: Retell's default events, its default budget, public recording links, no analysis fields, and the retired ?key= still on its call webhook. */
const drifted = (id, over = {}) =>
  onSettings(id, {
    webhook_events: ["call_started", "call_ended", "call_analyzed"],
    webhook_timeout_ms: 10000,
    opt_in_signed_url: false,
    post_call_analysis_data: [],
    webhook_url: `https://chanlytics-messaging.vercel.app/api/retell-webhook?key=${FN_SECRET}`,
    ...over,
  });
const DRIFT_KEYS = [
  "webhook_events",
  "webhook_timeout_ms",
  "opt_in_signed_url",
  "post_call_analysis_data",
  "webhook_url",
];

test("converge, the door: a token for another door, a forgery and no credential are 403; no provider key is a 503; without an agent named the voice rows decide, so no database is a 503 -- with one named, no database is needed", async () => {
  const { db } = use();
  const net = unreachable("a refused run must reach no provider");
  try {
    assert.deepEqual(await answer(await knockConverge({}, { "x-edge-token": token(PROVISION) })), [
      403,
      { ok: false, error: "token_audience" },
    ]);
    assert.deepEqual(
      await answer(await knockConverge({}, { "x-edge-token": token(CONVERGE, { secret: "not-the-secret" }) })),
      [403, { ok: false, error: "token_signature" }],
    );
    assert.deepEqual(await answer(await knockConverge({}, {})), [403, { ok: false }]);
    assert.deepEqual(
      await answer(await withEnv({ RETELL_API_KEY: undefined }, () => knockConverge({ agent_id: "agent_pub" }))),
      [503, { ok: false, error: "no_provider_key" }],
    );
    assert.equal(db.seen.length, 0);
    setPg(null);
    assert.deepEqual(await answer(await knockConverge({})), [503, { ok: false, error: "no_database" }]);
  } finally {
    net.restore();
  }
  const p = retell({ agents: { agent_pub: onSettings("agent_pub") } });
  try {
    const [status, body] = await answer(await knockConverge({ agent_id: "agent_pub" }));
    assert.equal(status, 200, "one agent named: the database is not consulted");
    assert.deepEqual(
      body.agents.map((a) => a.agent_id),
      ["agent_pub"],
    );
  } finally {
    p.restore();
  }
});

test("converge, the dry run: every active voice line's agent is read and planned -- the drift in words, the keys a patch would carry, the agent as it was with its webhook secret stripped -- and nothing is written; an unreadable agent is named", async () => {
  use({
    tenant_channels: [
      voiceRow({ id: "ch-1", external_id: "agent_drifted" }),
      voiceRow({ id: "ch-2", tenant_id: B, external_id: "agent_fine", number_e164: "+13055550101" }),
      voiceRow({ id: "ch-3", tenant_id: B, external_id: "agent_off", status: "disabled" }),
      voiceRow({ id: "ch-4", external_id: "agent_gone", number_e164: "+13055550102" }),
      { id: "ch-5", tenant_id: A, kind: "whatsapp", external_id: "1234567890", status: "active" },
    ],
  });
  const p = retell({ agents: { agent_drifted: drifted("agent_drifted"), agent_fine: onSettings("agent_fine") } });
  let status, body;
  try {
    [status, body] = await answer(await knockConverge({}));
  } finally {
    p.restore();
  }
  assert.equal(status, 200);
  assert.deepEqual(
    p.paths(),
    ["GET /get-agent/agent_drifted", "GET /get-agent/agent_fine", "GET /get-agent/agent_gone"],
    "the active voice rows, read only: a dry run writes nothing",
  );
  assert.deepEqual([body.ok, body.apply, body.publish], [true, false, false]);
  const [d, f, g] = body.agents;
  assert.deepEqual(
    [d.agent_id, d.version, d.is_published, d.applied, d.patch_keys],
    ["agent_drifted", 3, true, false, DRIFT_KEYS],
  );
  assert.deepEqual(
    d.drift,
    planAgentSettings(drifted("agent_drifted")).drift,
    "the same plan the script and the diagnostic use",
  );
  assert.ok(
    d.drift.some((l) => l.includes("transcript_updated")) &&
      d.drift.some((l) => l.includes("opt_in_signed_url off")) &&
      d.drift.some((l) => l.includes("caller_wanted")),
  );
  assert.deepEqual(
    d.before,
    { ...drifted("agent_drifted"), webhook_url: "https://chanlytics-messaging.vercel.app/api/retell-webhook" },
    "the backup: every field, the webhook URL without its query string",
  );
  assert.deepEqual([f.drift, f.patch_keys, f.applied], [[], [], false], "a converged agent plans nothing");
  assert.deepEqual(g, { agent_id: "agent_gone", error: "unreadable" });
  assert.ok(
    !printed(body).includes(FN_SECRET) && !printed(body).includes("key="),
    "the secret Retell lets ride on the webhook URL never comes back",
  );
});

test("converge, the apply: a published version cannot change, so the patch goes on a new draft and a pinned line stays where it was until told to publish; told to, the draft is published and the read-back plans nothing", async () => {
  const p = retell({ agents: { agent_pub: drifted("agent_pub") } });
  let status, body;
  try {
    [status, body] = await answer(await knockConverge({ agent_id: "agent_pub", apply: true }));
  } finally {
    p.restore();
  }
  assert.equal(status, 200);
  assert.deepEqual(
    p.paths(),
    [
      "GET /get-agent/agent_pub",
      "POST /create-agent-version/agent_pub",
      "PATCH /update-agent/agent_pub",
      "GET /get-agent/agent_pub",
    ],
    "read, a draft from the published version, the patch on the draft, read back -- no publish",
  );
  assert.deepEqual(JSON.parse(p.seen[1].body), { base_version: 3 }, "the draft is made from the version that is live");
  assert.deepEqual(
    JSON.parse(p.seen[2].body),
    planAgentSettings(drifted("agent_pub")).agentPatch,
    "exactly the plan's patch, nothing else",
  );
  assert.deepEqual(Object.keys(JSON.parse(p.seen[2].body)), DRIFT_KEYS);
  const [a] = body.agents;
  assert.deepEqual(
    [a.applied, a.draft_version, a.published_version, a.note],
    [true, 4, undefined, "v4 is a draft: a pinned line stays on v3 until it is published"],
  );
  assert.deepEqual(
    a.after,
    { version: 4, is_published: false, drift: [] },
    "the draft holds the settings; the number, pinned to latest_published, does not yet",
  );
  assert.deepEqual(
    a.before.webhook_events,
    ["call_started", "call_ended", "call_analyzed"],
    "the backup is the agent BEFORE the change",
  );

  const q = retell({ agents: { agent_pub: drifted("agent_pub") } });
  try {
    [status, body] = await answer(await knockConverge({ agent_id: "agent_pub", apply: true, publish: true }));
  } finally {
    q.restore();
  }
  assert.deepEqual(q.paths(), [
    "GET /get-agent/agent_pub",
    "POST /create-agent-version/agent_pub",
    "PATCH /update-agent/agent_pub",
    "POST /publish-agent-version/agent_pub",
    "GET /get-agent/agent_pub",
  ]);
  assert.deepEqual(JSON.parse(q.seen[3].body), { version: 4, version_title: "converged from the edge" });
  const [b] = body.agents;
  assert.deepEqual([b.applied, b.draft_version, b.published_version, "note" in b], [true, 4, 4, false]);
  assert.deepEqual(
    b.after,
    { version: 4, is_published: true, drift: [] },
    "published: a number pinned to latest_published follows it",
  );
  assert.equal(body.publish, true);
});

test("converge, the apply on a draft and on a converged agent: an unpublished version takes the patch directly and nothing is published even when asked; a converged agent is not written to at all; the LLM is never touched by any of it", async () => {
  const p = retell({
    agents: {
      agent_draft: drifted("agent_draft", { is_published: false, version: 5 }),
      agent_fine: onSettings("agent_fine"),
    },
  });
  let body;
  try {
    [, body] = await answer(await knockConverge({ agent_id: "agent_draft", apply: true, publish: true }));
    assert.deepEqual(
      p.paths(),
      ["GET /get-agent/agent_draft", "PATCH /update-agent/agent_draft", "GET /get-agent/agent_draft"],
      "no draft is made from a draft, and a draft that was already the latest is not published for it",
    );
    const [a] = body.agents;
    assert.deepEqual(
      [a.applied, "draft_version" in a, "published_version" in a, "note" in a, a.after],
      [true, false, false, false, { version: 5, is_published: false, drift: [] }],
    );
    p.seen.length = 0;
    [, body] = await answer(await knockConverge({ agent_id: "agent_fine", apply: true, publish: true }));
    assert.deepEqual(p.paths(), ["GET /get-agent/agent_fine"], "nothing to change, nothing written");
    assert.deepEqual([body.agents[0].applied, body.agents[0].drift, body.agents[0].patch_keys], [false, [], []]);
  } finally {
    p.restore();
  }
});

test("converge, a provider that refuses: the step that failed is named on that agent with the provider's answer, the others are still planned, and a refusal to publish still reports the patch applied", async () => {
  use({
    tenant_channels: [
      voiceRow({ id: "ch-1", external_id: "agent_a" }),
      voiceRow({ id: "ch-2", tenant_id: B, external_id: "agent_b", number_e164: "+13055550101" }),
    ],
  });
  const p = retell({
    agents: { agent_a: drifted("agent_a"), agent_b: drifted("agent_b") },
    fail: [
      {
        when: (path) => path === "/create-agent-version/agent_a",
        status: 422,
        body: { message: "Cannot update published agent other than version title" },
      },
      { when: (path) => path === "/publish-agent-version/agent_b", status: 500, body: { message: "internal" } },
    ],
  });
  let body;
  try {
    [, body] = await answer(await knockConverge({ apply: true, publish: true }));
  } finally {
    p.restore();
  }
  const [a, b] = body.agents;
  assert.deepEqual(
    [a.applied, a.error],
    [
      false,
      {
        step: "create_version",
        status: 422,
        body: { message: "Cannot update published agent other than version title" },
      },
    ],
  );
  assert.deepEqual(
    [b.applied, b.draft_version, b.error],
    [true, 4, { step: "publish", status: 500, body: { message: "internal" } }],
    "the patch landed on the draft; the publish did not",
  );
  assert.ok(
    !p.paths().some((x) => x.includes("update-agent/agent_a")),
    "no patch on an agent whose draft could not be made",
  );
  assert.ok(!p.paths().some((x) => x.includes("retell-llm")), "the shell and its secret header stay the script's");
});
