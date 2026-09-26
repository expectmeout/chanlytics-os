/**
 * The diagnostic door, run: GET /api/diag over a database in memory and a
 * captured wire to Meta and Retell. Until 13 Sep 2026 its text was pinned by
 * eleven assertions in ten files and its GET had never been called.
 *
 * What is asserted is what the operator reading it sees: the knock (a header,
 * never the query string), an environment report of booleans that carries no
 * value, the probe declining while the store is retired, the clocks
 * sweep_health() names with the backlog beside them, the pager's memory judged
 * (which condition fired and reached nobody), the two number tables' drift,
 * the WhatsApp token's permanence asked of Meta as the app this deployment
 * speaks for, each voice line's live settings and shell read from Retell with
 * nothing but a fingerprint of the key, the two gates that decide who is
 * answered, and the receptionist's last day from its usage events.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  signEdgeToken,
  desiredVoiceShell,
  DEFAULT_FN_URL,
  VOICE_WEBHOOK_EVENTS,
  VOICE_WEBHOOK_TIMEOUT_MS,
  CALL_ANALYSIS_FIELDS,
} from "@chanlytics/channels";
import { fakeDb } from "./_fake-db.mjs";

// The door reads the environment at call time, except META_APP_ID, which it
// reads once at import -- so the app it introspects tokens as is fixed here,
// before the import, and proved on the wire below; the case for the DEFAULT
// app imports a second copy of the door with this unset. Each test file is its
// own process; every variable is declared in apps/edge/.env.example.
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.DIAG_KEY = "diag-key-for-this-file";
process.env.META_APP_ID = "424242424242424";
for (const k of [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ANTHROPIC_API_KEY",
  "WHATSAPP_ACCESS_TOKEN",
  "RESEND_API_KEY",
  "META_APP_SECRET",
  "RETELL_API_KEY",
  "META_ES_CONFIG_ID",
  "WHATSAPP_TEST_ALLOWLIST",
  "EMAIL_DOMAIN",
  "RESEND_WEBHOOK_SECRET",
  "RESEND_COLD_API_KEY",
  "RESEND_COLD_WEBHOOK_SECRET",
])
  delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const { PAGE_WINDOW_MS, pageStates } = await import(at("apps/edge/lib/ops/page-operator.ts"));
const { DEFAULT_META_APP_ID } = await import(at("apps/edge/lib/whatsapp/meta-graph.ts"));
const { GET } = await import(at("apps/edge/api/diag.ts"));
after(() => setPg(null));

const AUD = "/api/diag";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const H = 3_600_000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();

/* ------------------------------- the knock -------------------------------- */

const token = (o = {}) =>
  signEdgeToken(o.secret ?? process.env.EDGE_CALL_SECRET, o.aud ?? AUD, { workspace: null, user: "ops" });
const knock = (headers = { "x-diag-key": process.env.DIAG_KEY }, url = `http://edge${AUD}`) =>
  GET(new Request(url, { headers }));
const answer = async (res) => [res.status, await res.json()];
const read = async () => (await knock()).json();

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

/** One row of sweep_health(): a clock, and whether it is answering. */
const clock = (sweep, healthy) => ({
  sweep,
  healthy,
  detail: healthy ? null : 'the edge answered 503: {"ok":false,"error":"no_provider_credentials"}',
  last_request_at: ago(20 * 60_000),
  status_code: healthy ? 200 : 503,
  scheduled: true,
  alerted_at: null,
});
/** The three functions the door calls, answering agreement unless a case says otherwise. */
const functions = (over = {}) => ({
  sweep_health: () => [clock("jobs", true)],
  jobs_backlog: () => 0,
  number_drift: () => [],
  ...over,
});
/** The database the door will find. */
function use(tables = {}, rpcs = {}, faults = {}) {
  const db = fakeDb({ operator_pages: [], events: [], tenant_channels: [], ...tables }, faults, functions(rpcs));
  setPg(db);
  return db;
}

/** Every request to a provider, captured and answered by `reply`. */
function wire(reply) {
  const seen = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const req = {
      url: String(url),
      method: init?.method ?? "GET",
      headers: init?.headers ?? {},
      body: typeof init?.body === "string" ? init.body : null,
    };
    seen.push(req);
    const a = reply(req) ?? {};
    return new Response(JSON.stringify(a.body ?? {}), { status: a.status ?? 200 });
  };
  return {
    seen,
    restore: () => {
      globalThis.fetch = real;
    },
  };
}
/** A wire nothing may reach. */
const unreachable = (why) =>
  wire(() => {
    throw new Error(why);
  });

/* -------------------------------- the door -------------------------------- */

test("the door: the header alone opens it -- never the query string -- and a token for another door, a forgery beside the right key, or no credential at all are refused before anything is read", async () => {
  const db = use();
  const net = unreachable("a refused request must reach no provider");
  try {
    assert.deepEqual(await answer(await knock({})), [403, { ok: false }]);
    // The WhatsApp verify token used to open this door from the query string:
    // a value Meta also carries in its own verification URL, and one that
    // lands in access logs.
    assert.deepEqual(
      await answer(await knock({}, `http://edge${AUD}?key=${process.env.DIAG_KEY}`)),
      [403, { ok: false }],
      "the key in the query string opens nothing",
    );
    assert.deepEqual(await answer(await knock({ "x-diag-key": "not-the-key" })), [403, { ok: false }]);
    assert.deepEqual(await answer(await knock({ "x-diag-key": `${process.env.DIAG_KEY}-but-longer` })), [
      403,
      { ok: false },
    ]);
    assert.deepEqual(
      await answer(await knock({ "x-edge-token": token({ aud: "/api/admin/lines" }) })),
      [403, { ok: false, error: "token_audience" }],
      "a token for another door",
    );
    assert.deepEqual(
      await answer(
        await knock({ "x-edge-token": token({ secret: "not-the-secret" }), "x-diag-key": process.env.DIAG_KEY }),
      ),
      [403, { ok: false, error: "token_signature" }],
      "there is no falling back from a bad token to the key",
    );
    assert.equal(db.seen.length, 0, "nothing was read for any of it");
  } finally {
    net.restore();
  }
  assert.equal((await knock({ "x-edge-token": token() })).status, 200, "a token minted for this door");
  assert.equal((await knock()).status, 200, "the key, in its header");
});

/* ------------------------------ the environment --------------------------- */

test("the environment report is booleans only and carries no value; the memory is named, and there is only one", async () => {
  use();
  const secrets = {
    ANTHROPIC_API_KEY: "sk-ant-value-nobody-may-see",
    RESEND_API_KEY: "re_value_nobody_may_see",
    SUPABASE_URL: "https://xyz.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-value-nobody-may-see",
    META_APP_SECRET: "meta-secret-value-nobody-may-see",
    // Email's switches (Reach out): the mail domain, and the cold account's key and webhook secret. The platform
    // account's webhook secret is left unset, so one of the four reads false.
    EMAIL_DOMAIN: "mail.value-nobody-may-see.example",
    RESEND_COLD_API_KEY: "re_cold_value_nobody_may_see",
    RESEND_COLD_WEBHOOK_SECRET: "whsec_cold_value_nobody_may_see",
    // The key the unsubscribe links are sealed under, which the dashboard must hold too.
    UNSUBSCRIBE_SECRET: "unsubscribe_value_nobody_may_see",
  };
  const body = await withEnv(secrets, read);
  // Postgres, always. It used to be read off PG_READS and BLOB_SHADOW and
  // could answer "blob" or "none"; there is one memory now, and the only
  // question left about it is whether the credentials below are there.
  assert.equal(body.memory, "postgres");
  assert.equal("store" in body, false, "there is no second store to report a backend for");
  assert.equal("probe" in body, false, "and nothing to write a probe thread into");
  assert.deepEqual(body.env, {
    database: true,
    anthropic: true,
    waToken: false,
    resend: true,
    metaSecret: true,
    retellKey: false,
    diagKey: true,
    emailDomain: true,
    resendWebhook: false,
    resendCold: true,
    resendColdWebhook: true,
    unsubscribe: true,
  });
  const printed = JSON.stringify(body);
  for (const v of Object.values(secrets))
    assert.ok(!printed.includes(v), `${v} is a value; the report carries presence only`);
  assert.ok(!printed.includes(process.env.DIAG_KEY) && !printed.includes(process.env.EDGE_CALL_SECRET));

  // The flags that used to move it are gone, so setting them moves nothing.
  const flipped = await withEnv(
    { PG_READS: "off", BLOB_SHADOW: "on", BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_test_only" },
    read,
  );
  assert.equal(flipped.memory, "postgres", "no env flip changes where the memory is read from");
  assert.deepEqual(Object.keys(flipped.env).sort(), Object.keys(body.env).sort(), "and none of them is reported");
});

/* --------------------------------- the clocks ----------------------------- */

test("the clocks: sweep_health()'s rows are judged and shown with the backlog beside them; a function that cannot be read is an error and the backlog is not asked; no database is said, once per section", async () => {
  const rows = [clock("jobs", true), clock("health", false), clock("deadman", true)];
  use({}, { sweep_health: () => rows, jobs_backlog: () => 7 });
  const body = await read();
  assert.deepEqual(
    body.sweeps,
    { ok: false, detail: rows },
    "one broken clock and the whole answer is not ok, with every row to read",
  );
  assert.equal(body.jobs_backlog, 7, "due work nobody has claimed");

  use({}, { sweep_health: () => [clock("jobs", true)], jobs_backlog: () => "seven" });
  const well = await read();
  assert.equal(well.sweeps.ok, true);
  assert.equal(well.jobs_backlog, null, "a backlog that is not a number is null, not a string somebody compares");

  const broken = use(
    {},
    {
      sweep_health: () => {
        throw new Error("permission denied for schema cron");
      },
    },
  );
  const b = await read();
  assert.deepEqual(b.sweeps, { error: "permission denied for schema cron" });
  assert.equal("jobs_backlog" in b, false, "the backlog is only asked once the clocks answered");
  assert.ok(!broken.seen.some((s) => s.rpc === "jobs_backlog"));

  setPg(null);
  const none = await read();
  const unavailable = { unavailable: "no database client (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" };
  assert.deepEqual(
    [none.sweeps, none.pages, none.numbers, none.brain],
    [unavailable, unavailable, unavailable, null],
    "each section says so for itself; the report still answers",
  );
  assert.equal(
    none.memory,
    "postgres",
    "the memory is still named: what is missing is the credentials to read it with",
  );
});

/* --------------------------------- the pages ------------------------------ */

test("the pager's memory, judged: a condition that fired inside the window and reached nobody is untold; one that was told, or one outside the window, is not; newest first", async () => {
  const rows = [
    // Fired ten minutes ago, never paged: the alarm channel refused or had no address.
    { key: "jobs_backlog", first_at: ago(2 * H), last_at: ago(10 * 60_000), count: 3, alerted_at: null },
    // Fired half an hour ago and paged a minute before that firing: told.
    { key: "no_model_key", first_at: ago(3 * H), last_at: ago(30 * 60_000), count: 2, alerted_at: ago(31 * 60_000) },
    // Fired eight hours ago and never paged: history, not something to act on.
    { key: "send_refused", first_at: ago(9 * H), last_at: ago(8 * H), count: 1, alerted_at: null },
    // Paged seven hours ago, fired again five minutes ago with no page since: untold.
    { key: "tick_failures", first_at: ago(8 * H), last_at: ago(5 * 60_000), count: 4, alerted_at: ago(7 * H) },
  ];
  const db = use({ operator_pages: rows });
  const body = await read();
  assert.deepEqual(body.pages.untold, ["tick_failures", "jobs_backlog"], "the list to act on, newest firing first");
  assert.equal(body.pages.ok, false);
  const byLastAt = [...rows].sort((a, b) => (a.last_at < b.last_at ? 1 : -1));
  assert.deepEqual(
    body.pages.conditions.map((c) => [c.key, c.told, c.recent]),
    pageStates(byLastAt).map((c) => [c.key, c.told, c.recent]),
  );
  assert.deepEqual(
    body.pages.conditions.map((c) => [c.key, c.told, c.recent]),
    [
      ["tick_failures", false, true],
      ["jobs_backlog", false, true],
      ["no_model_key", true, true],
      ["send_refused", false, false],
    ],
  );
  const q = db.seen.find((s) => s.table === "operator_pages");
  assert.deepEqual([q.order, q.desc], ["last_at", true], "read newest first");
  assert.ok(PAGE_WINDOW_MS === 6 * H, "the window this judges by is the pager's own");

  use({ operator_pages: [] });
  assert.deepEqual((await read()).pages, { ok: true, untold: [], conditions: [] }, "nothing has ever fired");
  use({}, {}, { "operator_pages.select": { message: "relation does not exist" } });
  assert.deepEqual((await read()).pages, { error: "relation does not exist" });
});

/* -------------------------------- the numbers ----------------------------- */

test("the two tables that model a number: an empty list is agreement, a row is a number ringing into a workspace nobody can identify, a broken function is an error", async () => {
  use({}, { number_drift: () => [] });
  assert.deepEqual(
    (await read()).numbers,
    { ok: true, drift: [] },
    "a channel row with no line is not drift, so empty means agreement",
  );
  const drift = [{ kind: "line_without_channel", tenant_id: A, detail: "+13055550100 answers but routes nowhere" }];
  use({}, { number_drift: () => drift });
  assert.deepEqual((await read()).numbers, { ok: false, drift });
  use(
    {},
    {
      number_drift: () => {
        throw new Error("function public.number_drift() does not exist");
      },
    },
  );
  assert.deepEqual((await read()).numbers, { error: "function public.number_drift() does not exist" });
});

/* ------------------------------- the WhatsApp gates ----------------------- */

test("the WhatsApp token's permanence is asked of Meta as the app this deployment speaks for -- the id fixed at import -- and neither the token nor the app secret comes back; the two gates that decide who is answered are counted", async () => {
  use();
  const pair = {
    WHATSAPP_ACCESS_TOKEN: "wa-token-value-nobody-may-see",
    META_APP_SECRET: "meta-secret-value-nobody-may-see",
  };
  const meta = wire(() => ({
    body: { data: { is_valid: true, expires_at: 0, type: "SYSTEM_USER", app_id: "424242424242424" } },
  }));
  try {
    const body = await withEnv({ ...pair, WHATSAPP_TEST_ALLOWLIST: "15551230000, 15551230001,, " }, read);
    assert.equal(meta.seen.length, 1);
    const u = new URL(meta.seen[0].url);
    assert.equal(`${u.origin}${u.pathname}`, "https://graph.facebook.com/v25.0/debug_token");
    assert.equal(u.searchParams.get("input_token"), pair.WHATSAPP_ACCESS_TOKEN);
    assert.equal(
      u.searchParams.get("access_token"),
      `424242424242424|${pair.META_APP_SECRET}`,
      "the app id read at import, with the secret, is the app token",
    );
    assert.deepEqual(
      body.waTokenCheck,
      { valid: true, expiresAt: 0, type: "SYSTEM_USER", permanent: true },
      "expires_at=0 is a permanent token",
    );
    const printed = JSON.stringify(body);
    assert.ok(
      !printed.includes(pair.WHATSAPP_ACCESS_TOKEN) && !printed.includes(pair.META_APP_SECRET),
      "presence only",
    );
    assert.deepEqual(
      body.whatsapp,
      { allowlist_numbers: 2, env_fallback_token: true, signup_ready: false },
      "two numbers on the staging allowlist; a token a channel without its own credentials rides; no Embedded Signup configuration",
    );
  } finally {
    meta.restore();
  }

  const temp = wire(() => ({ body: { data: { is_valid: true, expires_at: 1_790_000_000, type: "USER" } } }));
  try {
    const body = await withEnv({ ...pair, META_ES_CONFIG_ID: "es-config-1" }, read);
    assert.deepEqual(
      body.waTokenCheck,
      { valid: true, expiresAt: 1_790_000_000, type: "USER", permanent: false },
      "a temp token expiring mid-App-Review would take the pilot dark with no code change to blame",
    );
    assert.equal(body.whatsapp.signup_ready, true, "the secret and the configuration together");
  } finally {
    temp.restore();
  }

  const down = wire(() => {
    throw new Error("getaddrinfo ENOTFOUND graph.facebook.com");
  });
  try {
    assert.deepEqual(
      (await withEnv(pair, read)).waTokenCheck,
      { error: "getaddrinfo ENOTFOUND graph.facebook.com" },
      "Meta unreachable is a line in the report, not a failed report",
    );
  } finally {
    down.restore();
  }

  const none = unreachable("without the token pair there is nothing to introspect");
  try {
    const body = await read();
    assert.equal(body.waTokenCheck, null);
    assert.deepEqual(body.whatsapp, { allowlist_numbers: 0, env_fallback_token: false, signup_ready: false });
  } finally {
    none.restore();
  }
});

test("the app a deployment that names none introspects its token as: the one live app, the same default Embedded Signup hands the browser -- so the sign-up and the introspection can never be two different apps", async () => {
  use();
  // The id is read ONCE, at import. This is a second copy of the door,
  // imported with the variable unset: the only way to run the fallback a
  // deployment that never set META_APP_ID actually runs on.
  const { GET: defaulted } = await withEnv(
    { META_APP_ID: undefined },
    () => import(`${at("apps/edge/api/diag.ts")}?no-meta-app-id`),
  );
  assert.notEqual(
    DEFAULT_META_APP_ID,
    process.env.META_APP_ID,
    "and the case means something: the default is not the id this file set",
  );
  const pair = {
    WHATSAPP_ACCESS_TOKEN: "wa-token-value-nobody-may-see",
    META_APP_SECRET: "meta-secret-value-nobody-may-see",
  };
  const meta = wire(() => ({
    body: { data: { is_valid: true, expires_at: 0, type: "SYSTEM_USER", app_id: DEFAULT_META_APP_ID } },
  }));
  try {
    const body = await withEnv(pair, async () =>
      (await defaulted(new Request(`http://edge${AUD}`, { headers: { "x-diag-key": process.env.DIAG_KEY } }))).json(),
    );
    assert.equal(meta.seen.length, 1);
    assert.equal(
      new URL(meta.seen[0].url).searchParams.get("access_token"),
      `${DEFAULT_META_APP_ID}|${pair.META_APP_SECRET}`,
      'the default app\'s own token, never an empty app id beside the secret -- Meta answers an app token for app "" with a refusal, and the operator would read it as a dead WhatsApp token',
    );
    assert.deepEqual(body.waTokenCheck, { valid: true, expiresAt: 0, type: "SYSTEM_USER", permanent: true });
  } finally {
    meta.restore();
  }
});

/* -------------------------------- the voice lines ------------------------- */

const KEY = "retell-key-value-nobody-may-see";
/** An agent as get-agent returns it, on the product's settings, its webhook URL still carrying the retired ?key= (provisioned before the signature became the only credential). */
const agentOnShell = (id, llm) => ({
  agent_id: id,
  agent_name: "Harbor Moving front desk",
  version: 2,
  is_published: true,
  response_engine: { type: "retell-llm", llm_id: llm, version: 1 },
  webhook_url: "https://edge.test/api/retell-webhook?key=fn-secret-nobody-may-see",
  webhook_events: [...VOICE_WEBHOOK_EVENTS],
  webhook_timeout_ms: VOICE_WEBHOOK_TIMEOUT_MS,
  opt_in_signed_url: true,
  data_storage_retention_days: 90,
  post_call_analysis_data: CALL_ANALYSIS_FIELDS.map((f) => ({ ...f })),
});
/** The LLM as get-retell-llm returns it: the shell, with the secret header on its tools. */
const llmOnShell = (id) => ({
  llm_id: id,
  version: 1,
  model: "claude-4.5-haiku",
  model_temperature: 0,
  ...desiredVoiceShell(DEFAULT_FN_URL, { "x-fn-secret": "fn-secret-nobody-may-see" }),
});

test("each voice line's agent and shell are read from Retell: the live transcript, the model, drift on both, the webhook URL without its key; an unreadable agent is named; a fingerprint of the held key beside the auth and delivery evidence, never the key", async () => {
  const events = [
    ...[6, 5, 4, 3, 2, 1].map((n) => ({
      id: `auth-${n}`,
      tenant_id: A,
      kind: "webhook.auth",
      created_at: ago(n * 60_000),
      data: { via: n % 2 ? "signature" : "key" },
    })),
    {
      id: "del-1",
      tenant_id: A,
      kind: "webhook.delivery",
      subject_id: "call_1",
      created_at: ago(90_000),
      data: { status: "ongoing", turns: 3 },
    },
    {
      id: "usage-1",
      tenant_id: A,
      kind: "usage.llm_tokens",
      created_at: ago(60_000),
      data: { input_tokens: 10, output_tokens: 2 },
    },
  ];
  const db = use({
    tenant_channels: [
      {
        id: "ch-1",
        tenant_id: A,
        kind: "voice",
        external_id: "agent_ok",
        status: "active",
        number_e164: "+13055550100",
      },
      {
        id: "ch-2",
        tenant_id: B,
        kind: "voice",
        external_id: "agent_gone",
        status: "disabled",
        number_e164: "+13055550101",
      },
      {
        id: "ch-3",
        tenant_id: B,
        kind: "voice",
        external_id: "agent_old",
        status: "active",
        number_e164: "+13055550102",
      },
      {
        id: "ch-4",
        tenant_id: A,
        kind: "whatsapp",
        external_id: "1234567890",
        status: "active",
        number_e164: "+13055550103",
      },
    ],
    events,
  });
  const retell = wire((req) => {
    if (req.url.endsWith("/get-agent/agent_ok")) return { body: agentOnShell("agent_ok", "llm_ok") };
    if (req.url.endsWith("/get-agent/agent_gone")) return { status: 404, body: { message: "no such agent" } };
    // The line that predates the shell: typed by hand in Retell's dashboard, on the provider's default events.
    if (req.url.endsWith("/get-agent/agent_old"))
      return {
        body: {
          ...agentOnShell("agent_old", "llm_old"),
          webhook_events: ["call_started", "call_ended", "call_analyzed"],
          webhook_timeout_ms: 10000,
          opt_in_signed_url: false,
          post_call_analysis_data: [],
        },
      };
    if (req.url.endsWith("/get-retell-llm/llm_ok?version=1")) return { body: llmOnShell("llm_ok") };
    if (req.url.endsWith("/get-retell-llm/llm_old?version=1"))
      return {
        body: {
          llm_id: "llm_old",
          version: 1,
          model: "gpt-4o",
          general_prompt: "You are the receptionist of Harbor Moving. We open 9 to 5.",
          begin_message: "Thanks for calling Harbor Moving!",
          general_tools: [],
        },
      };
    throw new Error(`unexpected request ${req.method} ${req.url}`);
  });
  try {
    const body = await withEnv({ RETELL_API_KEY: KEY }, read);
    assert.deepEqual(
      retell.seen.map((r) => r.url.replace("https://api.retellai.com", "")),
      [
        "/get-agent/agent_ok",
        "/get-retell-llm/llm_ok?version=1",
        "/get-agent/agent_gone",
        "/get-agent/agent_old",
        "/get-retell-llm/llm_old?version=1",
      ],
      "every voice row, disabled included, and each LLM at the version its agent points at",
    );
    assert.ok(retell.seen.every((r) => r.headers.Authorization === `Bearer ${KEY}`));

    const [ok, gone, old] = body.voiceAgents;
    assert.equal(ok.agent_id, "agent_ok");
    assert.equal(ok.channel_status, "active");
    assert.equal(ok.live_transcript, true, "transcript_updated is the setting the Live page depends on");
    assert.equal(ok.model, "claude-4.5-haiku", "which text model the line runs: provisioning parity in one word");
    assert.deepEqual(ok.shell, { converged: true, drift: [] }, "on the product's shell");
    assert.deepEqual(
      ok.agent,
      {
        converged: false,
        drift: [
          "webhook_url still carries the retired query-string key; the signature is the credential and the door no longer reads one",
        ],
      },
      "on the pipeline's settings but for the key its URL still carries: the one thing left for the converger, named",
    );
    assert.ok(!JSON.stringify(ok).includes("fn-secret-nobody-may-see"), "the drift names the key and never prints it");
    assert.equal(ok.webhook_url, "https://edge.test/api/retell-webhook", "the query string never comes out");
    assert.deepEqual(gone, { agent_id: "agent_gone", channel_status: "disabled", error: "unreadable" });
    assert.equal(old.live_transcript, false);
    assert.equal(old.model, "gpt-4o");
    assert.equal(old.shell.converged, false);
    assert.ok(
      old.shell.drift.some((d) => d.startsWith("general_prompt differs")) &&
        old.shell.drift.some((d) => d.startsWith("begin_message is typed in")),
    );
    assert.equal(old.agent.converged, false);
    assert.ok(
      old.agent.drift.some((d) => d.includes("transcript_updated")) &&
        old.agent.drift.some((d) => d.includes("opt_in_signed_url")),
    );

    assert.equal(
      body.retellAuth.key_fingerprint,
      createHash("sha256").update(KEY).digest("hex").slice(0, 12),
      "a fingerprint, to match against the key Retell badges as its signer",
    );
    assert.deepEqual(
      body.retellAuth.recent.map((r) => r.data.via),
      ["signature", "key", "signature", "key", "signature"],
      "the five newest, newest first",
    );
    assert.deepEqual(
      body.retellAuth.deliveries.map((d) => [d.subject_id, d.data.status]),
      [["call_1", "ongoing"]],
    );
    const printed = JSON.stringify(body);
    assert.ok(!printed.includes(KEY), "the key itself never comes out");
    assert.ok(!printed.includes("fn-secret-nobody-may-see"), "nor the secret on the webhook URL or the tool header");
    const reads = db.seen.filter(
      (s) => s.table === "events" && s.filters.some(([, col, val]) => col === "kind" && val.startsWith("webhook.")),
    );
    assert.deepEqual(
      reads.map((r) => [r.filters.find(([, c]) => c === "kind")[2], r.limit, r.desc]),
      [
        ["webhook.auth", 5, true],
        ["webhook.delivery", 20, true],
      ],
    );
  } finally {
    retell.restore();
  }

  const none = unreachable("without a provider key no agent is read");
  try {
    const body = await read();
    assert.equal(body.voiceAgents, null);
    assert.equal("retellAuth" in body, false);
  } finally {
    none.restore();
  }
});

/* --------------------------------- the brain ------------------------------ */

test("the receptionist's last 24 hours, from the usage events every reply writes: how many, how sure, how fast, how many held or handed off; a failed read is an error line", async () => {
  const usage = (n, data, agoMs = n * 60_000) => ({
    id: `u-${n}`,
    tenant_id: A,
    kind: "usage.llm_tokens",
    created_at: ago(agoMs),
    data,
  });
  use({
    events: [
      usage(1, { intent: "hours", confidence: 0.9, latency_ms: 1200, input_tokens: 1000, output_tokens: 80 }),
      usage(2, {
        intent: "pricing",
        confidence: 0.6,
        latency_ms: 1800,
        input_tokens: 1100,
        output_tokens: 60,
        held: "low_confidence",
        escalate: true,
      }),
      usage(3, {
        intent: "booking",
        confidence: 0.75,
        latency_ms: 2400,
        input_tokens: 900,
        output_tokens: 100,
        held: "veto_window",
      }),
      usage(4, { input_tokens: 500, output_tokens: 10 }, 0),
      // Yesterday's, and another kind: neither counts.
      usage(5, { intent: "hours", confidence: 1, latency_ms: 1, input_tokens: 1, output_tokens: 1 }, 25 * H),
      { id: "other", tenant_id: A, kind: "message.received", created_at: ago(60_000), data: { input_tokens: 999 } },
    ],
  });
  assert.deepEqual((await read()).brain, {
    replies: 4,
    with_record: 3,
    avg_confidence: 0.75,
    avg_latency_ms: 1800,
    held_low_confidence: 1,
    held_veto: 1,
    escalated: 1,
    tokens_in: 3500,
    tokens_out: 250,
  });
  use({}, {}, { "events.select": { message: "canceling statement due to statement timeout" } });
  assert.deepEqual((await read()).brain, { error: "canceling statement due to statement timeout" });
});

test("where cold mail's links and replies go (D17), as values: what the edge uses, and a value set and ignored", async () => {
  use();
  const unset = await read();
  assert.deepEqual(unset.coldMail, {
    unsubscribeOrigin: "https://app.chanlytics.com",
    unsubscribeOriginRejected: false,
    coldReplyDomains: [],
    coldReplyDomainRejected: false,
  });
  const set = await withEnv(
    {
      EMAIL_DOMAIN: "mail.chanlytics.com",
      UNSUBSCRIBE_ORIGIN: "https://links.coldmail.example",
      COLD_REPLY_DOMAIN: "Reply.ColdLinks.example",
      COLD_REPLY_DOMAIN_PREVIOUS: "reply-a.coldlinks.example",
    },
    read,
  );
  assert.deepEqual(set.coldMail, {
    unsubscribeOrigin: "https://links.coldmail.example",
    unsubscribeOriginRejected: false,
    coldReplyDomains: ["reply.coldlinks.example", "reply-a.coldlinks.example"],
    coldReplyDomainRejected: false,
  });
  const wrong = await withEnv(
    {
      EMAIL_DOMAIN: "mail.chanlytics.com",
      UNSUBSCRIBE_ORIGIN: "links.coldmail.example",
      COLD_REPLY_DOMAIN: "https://reply.x.example",
    },
    read,
  );
  assert.deepEqual(
    [
      wrong.coldMail.unsubscribeOrigin,
      wrong.coldMail.unsubscribeOriginRejected,
      wrong.coldMail.coldReplyDomains,
      wrong.coldMail.coldReplyDomainRejected,
    ],
    ["https://app.chanlytics.com", true, [], true],
    "set and unreadable: ignored, and said so",
  );
});
