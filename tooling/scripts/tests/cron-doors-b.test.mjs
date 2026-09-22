/**
 * Four sweeps that reach a provider, run: POST /api/cron/calls, /google,
 * /lines and /registrations over a database in memory and a captured wire to
 * Retell, Google, Twilio and the mail transport. Until 13 Sep 2026 these four
 * handlers' text was pinned by eight assertions in eight files and no POST of
 * theirs had ever been called.
 *
 * The door once, for all four: no database, a key Vault cannot give, a wrong
 * key. Then each sweep's consequence -- what it asked the provider, what it
 * wrote on the row, who it told:
 *
 *   calls          a call left 'ongoing' is asked about and the provider's word
 *                  is written; a pending recording copy is retried on the
 *                  sweep's budget with a fresh URL, three times, then left;
 *                  recordings past their retention are removed, and a removal
 *                  that fails is a 500 once the other legs have run; a call
 *                  that ended -- or errored -- without an analysis gets its
 *                  line in the thread, once.
 *   google         listings not read for twenty hours, never-read first, forty
 *                  a tick; a read writes the listing, the day (by the workspace's
 *                  own clock), the reviews, and rings the bell; a connected
 *                  profile is synced as the owner with a token refreshed from
 *                  Vault; a refusal stays on its row.
 *   lines          a saga stuck past its deadline is taken and resumed by a
 *                  line_provision job, two a tick, and the platform hears once;
 *                  past three automatic tries the line is handed to a person.
 *   registrations  both waiting states, least recently asked first; the answer
 *                  written to the row, moved or not; a line with no credentials
 *                  written to so it cannot starve the queue; an approved brand's
 *                  campaign filed from this deployment's own pages.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { emptyBusinessRecord, RECORDING_RETENTION_DAYS } from "@chanlytics/contracts";
import { LOW_VOLUME_USECASE } from "@chanlytics/channels";
import { fakeDb } from "./_fake-db.mjs";

// Each test file is its own process, so this is the whole environment. Every
// variable is declared in apps/edge/.env.example except VERCEL_ENV, which the
// platform sets (deleted here, set in one lines case). The dry line provider
// (LINES_DRY_RUN) makes no network calls; the registration sweep needs the
// real one, and sets the master credentials per case. No workspace is the
// environment's own, and the only database is the one handed to setPg.
process.env.RETELL_API_KEY = "retell-key-for-this-file";
process.env.RETELL_FN_SECRET = "fn-secret-for-this-file";
process.env.LINES_DRY_RUN = "1";
process.env.DASHBOARD_ORIGIN = "https://dash.test";
process.env.GOOGLE_PLACES_API_KEY = "places-key-for-this-file";
process.env.GOOGLE_OAUTH_CLIENT_ID = "oauth-client-for-this-file";
process.env.GOOGLE_OAUTH_CLIENT_SECRET = "oauth-secret-for-this-file";
process.env.GOOGLE_OAUTH_REDIRECT_URI = "https://dash.test/api/v1/google/callback";
process.env.RESEND_API_KEY = "re_test_only";
process.env.LEAD_TO = "ops@platform.test";
process.env.LEAD_FROM = "Pager <pager@platform.test>";
for (const k of [
  "VERCEL_ENV",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_PRIMARY_PROFILE_SID",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
])
  delete process.env[k];

/* -------------------------------------------------------------- the wire */

/**
 * Every request any sweep makes, captured and answered by the case's `answer`.
 *
 * Installed BEFORE the handlers are imported, on purpose: lib/google.ts binds
 * `const http = placesFetch()` at module scope, which captures `fetch` as it
 * is at that moment. A wire installed per test would never see a Places call.
 *
 * Each captured call carries `budgetMs`: how long the signal it rode was given.
 * Every bounded fetch in this codebase is `AbortSignal.timeout(ms)`, and the
 * signal itself never says how long, so the static is wrapped and each signal
 * remembers its budget -- which is how a test tells the sweep's twenty seconds
 * from the webhook's six.
 */
const wire = { answer: null, calls: [] };
{
  const realFetch = globalThis.fetch;
  const realTimeout = AbortSignal.timeout;
  const budgets = new WeakMap();
  AbortSignal.timeout = (ms) => {
    const s = realTimeout.call(AbortSignal, ms);
    budgets.set(s, ms);
    return s;
  };
  globalThis.fetch = async (url, init) => {
    const req = {
      url: String(url),
      method: init?.method ?? "GET",
      headers: init?.headers ?? {},
      body: typeof init?.body === "string" ? init.body : null,
      budgetMs: init?.signal ? (budgets.get(init.signal) ?? null) : null,
    };
    wire.calls.push(req);
    if (!wire.answer) throw new Error(`nothing on the wire answers ${req.method} ${req.url}`);
    const a = await wire.answer(req);
    if (a instanceof Response) return a;
    // A 204 carries no body, and Node's Response enforces it.
    const body = a.status === 204 ? null : typeof a.body === "string" ? a.body : JSON.stringify(a.body ?? {});
    return new Response(body, {
      status: a.status ?? 200,
      headers: a.headers ?? { "content-type": "application/json" },
    });
  };
  after(() => {
    globalThis.fetch = realFetch;
    AbortSignal.timeout = realTimeout;
  });
}
/** The wire for one case: `answer` decides, and what was asked is read back. */
function wired(answer) {
  wire.calls = [];
  wire.answer = answer;
  const to = (part) => wire.calls.filter((c) => c.url.includes(part));
  return {
    get calls() {
      return wire.calls;
    },
    to,
    /** What Resend was asked to send, in order. */
    mail: () => to("api.resend.com").map((c) => JSON.parse(c.body)),
  };
}
/** A wire nothing may reach. */
const silent = (why = "this case must not reach a provider") =>
  wired((req) => {
    throw new Error(`${why}: ${req.method} ${req.url}`);
  });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const { SWEEP_COPY_TIMEOUT_MS, RECORDING_MAX_ATTEMPTS } = await import(at("apps/edge/lib/voice/call-recording.ts"));
const SWEEPS = {
  calls: await import(at("apps/edge/api/cron/calls.ts")),
  google: await import(at("apps/edge/api/cron/google.ts")),
  lines: await import(at("apps/edge/api/cron/lines.ts")),
  registrations: await import(at("apps/edge/api/cron/registrations.ts")),
};
after(() => setPg(null));

/* ------------------------------------------------------------- the knock */

const KEY = "sweep-key-for-this-file";
const knock = (sweep, key = KEY) =>
  SWEEPS[sweep].POST(
    new Request(`http://edge/api/cron/${sweep}`, { method: "POST", headers: key == null ? {} : { "x-cron-key": key } }),
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

/* ------------------------------------------------------------- the world */

const NOW = Date.now();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const iso = (ms) => new Date(ms).toISOString();
const ago = (ms) => iso(NOW - ms);
/** Every case its own workspace. */
const tenant = (n) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;
const uuid = (n) => `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, "0")}`;
const tenantRow = (id, over = {}) => ({
  id,
  name: "Harbor Moving",
  slug: "harbor-moving",
  timezone: "America/New_York",
  status: "active",
  ...over,
});
/** YYYY-MM-DD as a clock in `tz` has it -- Intl's own reading, not the helper the code under test calls. */
const dayIn = (tz, at) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);

/**
 * The database the sweep will find, with the bucket beside it. The double
 * models tables; the calls sweep also needs storage.from("media").remove and
 * .upload, so the bucket is two lists here.
 */
function use(tables, rpcs = {}, faults = {}) {
  const db = fakeDb(tables, faults, { get_cron_sweep_key: () => KEY, ...rpcs });
  const bucket = { removed: [], uploads: [] };
  db.storage = {
    from: (name) => ({
      remove: async (paths) => {
        bucket.removed.push(...paths);
        return { data: paths.map((p) => ({ name: p })), error: null };
      },
      upload: async (p, bytes, opts) => {
        bucket.uploads.push({ bucket: name, path: p, bytes: bytes.byteLength, ...opts });
        return { data: { path: p }, error: null };
      },
    }),
  };
  db.bucket = bucket;
  setPg(db);
  return db;
}
const rpcs = (db, name) => db.seen.filter((s) => s.rpc === name);
const updatesOf = (db, table) => db.seen.filter((s) => s.table === table && s.op === "update");

/* ---------------------------------------------------------------- the door */

test("the door, on all four: no database is a 503, a key Vault cannot give is a 503, a wrong or missing key is a 401 — and nothing past the door is read or asked", async () => {
  const net = silent();
  for (const sweep of Object.keys(SWEEPS)) {
    setPg(null);
    assert.deepEqual(
      await answer(await knock(sweep)),
      [503, { ok: false, error: "no_database" }],
      `${sweep}: no database`,
    );

    const empty = use({}, { get_cron_sweep_key: () => null });
    assert.deepEqual(
      await answer(await knock(sweep)),
      [503, { ok: false, error: "key_unavailable" }],
      `${sweep}: no cron_sweep_key in Vault`,
    );
    const refused = use(
      {},
      {
        get_cron_sweep_key: () => {
          throw new Error("permission denied for function get_cron_sweep_key");
        },
      },
    );
    assert.deepEqual(
      await answer(await knock(sweep)),
      [503, { ok: false, error: "key_unavailable" }],
      `${sweep}: Vault refused`,
    );

    const db = use({});
    // No trailing-space case: the Fetch Headers API trims a header's value
    // before any route sees it, so whitespace is never part of what is compared.
    for (const k of [null, "", KEY.slice(0, -1), `${KEY}2`, KEY.toUpperCase(), "other"]) {
      assert.deepEqual(
        await answer(await knock(sweep, k)),
        [401, { ok: false, error: "unauthorized" }],
        `${sweep}: key ${JSON.stringify(k)}`,
      );
    }
    for (const d of [empty, refused, db]) {
      assert.ok(
        d.seen.length > 0 && d.seen.every((s) => s.rpc === "get_cron_sweep_key"),
        `${sweep}: only the key was asked for, no table was read`,
      );
    }
  }
  assert.equal(net.calls.length, 0, "no provider heard any of it");
});

/* ------------------------------------------------------------------ calls */

/** A row as the database holds it: the columns the sweep reads. */
const callRow = (T, id, over = {}) => ({
  id,
  tenant_id: T,
  retell_call_id: `call_${id}`,
  agent_id: "agent_x",
  direction: "inbound",
  call_type: "phone_call",
  status: "ongoing",
  started_at: ago(12 * MIN),
  ended_at: null,
  updated_at: ago(10 * MIN),
  duration_ms: null,
  summary: null,
  in_voicemail: null,
  recording: null,
  conversation_id: null,
  contact_id: null,
  message_id: null,
  ...over,
});
/** The provider's call object, as the live account shapes it. */
const retellCall = (id, over = {}) => ({
  call_id: `call_${id}`,
  agent_id: "agent_x",
  call_type: "phone_call",
  direction: "inbound",
  from_number: "+16465550123",
  to_number: "+13055550100",
  ...over,
});
/**
 * ingest_call, as the double: the upsert writes what the provider reported
 * onto the row and answers the envelope the repository reads. The assertions
 * below are on the ARGUMENTS the sweep handed it -- that is the boundary --
 * and on the rows only where the sweep itself wrote them.
 */
function ingestRpc(tables) {
  return (a) => {
    const row = tables.calls.find((c) => c.tenant_id === a.p_tenant_id && c.retell_call_id === a.p_retell_call_id);
    if (row)
      Object.assign(row, {
        status: a.p_status,
        ended_at: a.p_ended_at,
        duration_ms: a.p_duration_ms,
        summary: a.p_summary,
        updated_at: iso(NOW),
      });
    return {
      call_id: row?.id ?? uuid(999),
      is_new: !row,
      recording_state: row?.recording?.fetch_state ?? null,
      contact_id: null,
      conversation_id: row?.conversation_id ?? null,
    };
  };
}

test("calls: a call left 'ongoing' is asked about once nobody has heard from it for five minutes or it has run past thirty, and the provider's word is what is written — ended closes it, still up keeps it live, unknown leaves it and is counted", async () => {
  const T = tenant(1);
  const tables = {
    calls: [
      callRow(T, "settled", { updated_at: ago(10 * MIN) }),
      // A second call the provider says has ended: two closed against one still
      // up, so no counter can be right by symmetry.
      callRow(T, "settled2", { updated_at: ago(9 * MIN), started_at: ago(15 * MIN) }),
      callRow(T, "overlong", { updated_at: ago(1 * MIN), started_at: ago(40 * MIN) }),
      callRow(T, "gone", { updated_at: ago(8 * MIN) }),
      callRow(T, "young", { updated_at: ago(1 * MIN), started_at: ago(2 * MIN) }),
      callRow(T, "done", { status: "ended", ended_at: ago(3 * MIN), updated_at: ago(3 * MIN), message_id: uuid(1) }),
    ],
    messages: [],
    events: [],
  };
  const db = use(tables, { ingest_call: ingestRpc(tables) });
  const net = wired((req) => {
    if (req.url.endsWith("/v2/get-call/call_settled")) {
      return {
        status: 200,
        body: retellCall("settled", {
          call_status: "ended",
          start_timestamp: NOW - 12 * MIN,
          end_timestamp: NOW - 9 * MIN,
          duration_ms: 3 * MIN,
          disconnection_reason: "user_hangup",
          call_analysis: { call_summary: "Rosa booked a move for Tuesday." },
        }),
      };
    }
    if (req.url.endsWith("/v2/get-call/call_settled2"))
      return {
        status: 200,
        body: retellCall("settled2", {
          call_status: "ended",
          start_timestamp: NOW - 15 * MIN,
          end_timestamp: NOW - 9 * MIN,
          duration_ms: 6 * MIN,
          disconnection_reason: "agent_hangup",
        }),
      };
    if (req.url.endsWith("/v2/get-call/call_overlong"))
      return { status: 200, body: retellCall("overlong", { call_status: "ongoing", start_timestamp: NOW - 40 * MIN }) };
    if (req.url.endsWith("/v2/get-call/call_gone")) return { status: 404, body: { message: "call not found" } };
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });

  const [status, body] = await answer(await knock("calls"));
  assert.equal(status, 200, JSON.stringify(body));
  assert.deepEqual(
    [body.ok, body.candidates, body.closed, body.stillLive, body.unknown],
    [true, 4, 2, 1, 1],
    "two ended, one still up, one the provider does not know: each counter is the provider's word, not the row's place in the queue",
  );
  assert.deepEqual(
    net.calls.map((c) => c.url),
    [
      "https://api.retellai.com/v2/get-call/call_settled",
      "https://api.retellai.com/v2/get-call/call_settled2",
      "https://api.retellai.com/v2/get-call/call_gone",
      "https://api.retellai.com/v2/get-call/call_overlong",
    ],
    "least recently heard from first; a two-minute-old call is not evidence of anything and is never asked about; a call already ended is not either",
  );
  assert.ok(
    net.calls.every((c) => c.headers.Authorization === "Bearer retell-key-for-this-file"),
    "asked as this deployment",
  );

  const ingested = rpcs(db, "ingest_call").map((s) => s.args);
  assert.deepEqual(
    ingested.map((a) => [a.p_retell_call_id, a.p_status, a.p_tenant_id]),
    [
      ["call_settled", "ended", T],
      ["call_settled2", "ended", T],
      ["call_overlong", "ongoing", T],
    ],
    "what the provider reports is re-ingested, under the row's own workspace; a call it has no record of is not guessed at",
  );
  assert.deepEqual(
    [ingested[0].p_summary, ingested[0].p_duration_ms, ingested[0].p_disconnection],
    ["Rosa booked a move for Tuesday.", 3 * MIN, "user_hangup"],
  );
  assert.deepEqual(
    [ingested[1].p_summary, ingested[1].p_duration_ms, ingested[1].p_disconnection],
    [null, 6 * MIN, "agent_hangup"],
    "a call the provider never analysed is still closed with what it does know",
  );
  assert.equal(ingested[0].p_recording, null, "no URL was offered, so no copy is asked for");
  assert.equal(
    tables.calls.find((c) => c.id === "gone").status,
    "ongoing",
    "left as it was: a rising count here means our ids and theirs have diverged",
  );
  assert.equal(tables.calls.find((c) => c.id === "young").status, "ongoing");
  assert.deepEqual(body.recordings, { candidates: 0, stored: 0, retry: 0, failed: 0 });
  assert.deepEqual(body.notes, { candidates: 0, written: 0 }, "the ended call already has its line");
});

test("calls: a copy still pending is retried with a fresh URL from the provider on the sweep's own budget; a copy that times out advances the count and waits for the next tick; after the third it is marked failed and left alone; two a tick", async () => {
  const T = tenant(2);
  const pending = (id, over = {}) =>
    callRow(T, id, {
      status: "ended",
      ended_at: ago(20 * MIN),
      updated_at: ago(10 * MIN),
      recording: { fetch_state: "pending", attempts: 0 },
      ...over,
    });
  // "spent" heads the queue with its count already at the ceiling but its state
  // still 'pending' (the row copyRecording never got to mark, e.g. a process
  // that died between the count and the state write). The sweep's own guard,
  // not copyRecording's 'failed' write, is what has to leave it alone.
  const spentSeed = { fetch_state: "pending", attempts: RECORDING_MAX_ATTEMPTS };
  const tables = {
    calls: [
      pending("spent", { updated_at: ago(11 * MIN), recording: { ...spentSeed } }),
      pending("slow"),
      pending("quick", { updated_at: ago(9 * MIN) }),
      pending("third", { updated_at: ago(8 * MIN) }),
    ],
    messages: [],
    events: [],
  };
  const db = use(tables, { ingest_call: ingestRpc(tables) });
  const net = wired((req) => {
    const m = /\/v2\/get-call\/(call_\w+)$/.exec(req.url);
    if (m)
      return {
        status: 200,
        body: { call_id: m[1], call_status: "ended", recording_url: `https://cdn.retell.test/${m[1]}.wav` },
      };
    // The CDN honours the signal it was given: this recording never arrives in time.
    if (req.url === "https://cdn.retell.test/call_slow.wav")
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    if (req.url.startsWith("https://cdn.retell.test/"))
      return new Response(new Uint8Array([82, 73, 70, 70]), { status: 200, headers: { "content-type": "audio/wav" } });
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
  const rec = (id) => tables.calls.find((c) => c.id === id).recording;
  const neverAskedAboutSpent = () => {
    assert.ok(
      !net.calls.some((c) => c.url.endsWith("/call_spent") || c.url.endsWith("/call_spent.wav")),
      "a row already at the ceiling is skipped before it is counted or asked about",
    );
    assert.deepEqual(rec("spent"), spentSeed, "and not written to");
  };

  // Tick one: the two oldest still owed a try are tried; the third waits for the next tick.
  let [status, body] = await answer(await knock("calls"));
  assert.equal(status, 200, JSON.stringify(body));
  assert.deepEqual(
    body.recordings,
    { candidates: 2, stored: 1, retry: 1, failed: 0 },
    "two a tick: each may wait the whole budget",
  );
  assert.deepEqual(
    net.calls.map((c) => c.url),
    [
      "https://api.retellai.com/v2/get-call/call_slow",
      "https://cdn.retell.test/call_slow.wav",
      "https://api.retellai.com/v2/get-call/call_quick",
      "https://cdn.retell.test/call_quick.wav",
    ],
    "every retry asks the provider for a fresh URL by call id first: none is kept on the row, which every member's browser can read",
  );
  assert.ok(
    net.to("cdn.retell.test").every((c) => c.budgetMs === SWEEP_COPY_TIMEOUT_MS),
    `the sweep's own ${SWEEP_COPY_TIMEOUT_MS} ms, not the webhook's budget`,
  );
  assert.deepEqual(rec("quick"), {
    fetch_state: "stored",
    attempts: 1,
    storage_path: `${T}/calls/quick.wav`,
    mime: "audio/wav",
    bytes: 4,
  });
  assert.deepEqual(
    db.bucket.uploads,
    [{ bucket: "media", path: `${T}/calls/quick.wav`, bytes: 4, contentType: "audio/wav", upsert: true }],
    "into the private bucket, under the workspace",
  );
  assert.equal(rec("slow").fetch_state, "pending", "a timeout is transient until proven otherwise");
  assert.equal(rec("slow").attempts, 1, "and counted");
  assert.match(rec("slow").error, /timeout/i);
  assert.deepEqual(rec("third"), { fetch_state: "pending", attempts: 0 }, "not reached this tick");
  neverAskedAboutSpent();

  // Tick two. (The double has no updated_at trigger, so the five-minute
  // back-off between ticks is not modelled here; in Postgres the settle write
  // moves updated_at and the row waits SETTLE_MS before it is a candidate again.)
  [status, body] = await answer(await knock("calls"));
  assert.deepEqual(body.recordings, { candidates: 2, stored: 1, retry: 1, failed: 0 });
  assert.equal(rec("slow").attempts, 2);
  assert.equal(rec("third").fetch_state, "stored", "the backlog drains");
  neverAskedAboutSpent();

  // Tick three: the third attempt is the last.
  [status, body] = await answer(await knock("calls"));
  assert.deepEqual(body.recordings, { candidates: 1, stored: 0, retry: 0, failed: 1 });
  assert.equal(
    rec("slow").fetch_state,
    "failed",
    "'Recording still processing' is no longer a state a row can stay in for ever",
  );
  assert.equal(rec("slow").attempts, RECORDING_MAX_ATTEMPTS);

  // Tick four: nothing wakes for it.
  const before = net.calls.length;
  [status, body] = await answer(await knock("calls"));
  assert.deepEqual(body.recordings, { candidates: 0, stored: 0, retry: 0, failed: 0 });
  assert.equal(net.calls.length, before, "a copy given up on is not asked about again");
  assert.equal(rec("slow").attempts, RECORDING_MAX_ATTEMPTS, "and left as it is");
  neverAskedAboutSpent();
});

test("calls: a CDN that refuses a recording for good (401, 403, 410) fails the copy at once and is never asked about again; a 404 is a recording not published yet, and waits for the next try", async () => {
  const T = tenant(3);
  const pending = (id, over = {}) =>
    callRow(T, id, {
      status: "ended",
      ended_at: ago(20 * MIN),
      updated_at: ago(10 * MIN),
      recording: { fetch_state: "pending", attempts: 0 },
      ...over,
    });
  const tables = {
    calls: [pending("refused"), pending("unpublished", { updated_at: ago(9 * MIN) })],
    messages: [],
    events: [],
  };
  use(tables, { ingest_call: ingestRpc(tables) });
  const GET_CALL = "https://api.retellai.com/v2/get-call/";
  const net = wired((req) => {
    if (req.url.startsWith(GET_CALL)) {
      const id = req.url.slice(GET_CALL.length);
      return {
        status: 200,
        body: { call_id: id, call_status: "ended", recording_url: "https://cdn.retell.test/" + id + ".wav" },
      };
    }
    // The provider's CDN: one recording refused for good, the other not published yet.
    if (req.url === "https://cdn.retell.test/call_refused.wav") return new Response("Forbidden", { status: 403 });
    if (req.url === "https://cdn.retell.test/call_unpublished.wav") return new Response("Not Found", { status: 404 });
    throw new Error("unexpected " + req.method + " " + req.url);
  });
  const rec = (id) => tables.calls.find((c) => c.id === id).recording;
  const asksAbout = (id) =>
    net.calls.filter((c) => c.url.endsWith("/call_" + id) || c.url.endsWith("/call_" + id + ".wav")).length;

  let [status, body] = await answer(await knock("calls"));
  assert.equal(status, 200, JSON.stringify(body));
  assert.deepEqual(body.recordings, { candidates: 2, stored: 0, retry: 1, failed: 1 });
  assert.equal(
    rec("refused").fetch_state,
    "failed",
    "a refusal is the provider's final word: it will not hand this recording over",
  );
  assert.equal(rec("refused").error, "provider_refused_403");
  assert.equal(rec("unpublished").fetch_state, "pending", "a 404 is a recording the CDN has not published yet");
  assert.equal(rec("unpublished").error, "provider_404");
  assert.equal(rec("unpublished").attempts, 1, "and the try is counted");

  const refusedAsks = asksAbout("refused");
  [status, body] = await answer(await knock("calls"));
  assert.deepEqual(
    body.recordings,
    { candidates: 1, stored: 0, retry: 1, failed: 0 },
    "only the unpublished copy is still owed a try",
  );
  assert.equal(asksAbout("refused"), refusedAsks, "a refused copy is not asked about again");
  assert.equal(rec("unpublished").attempts, 2);
});

test("calls: a recording the provider never hands over is a try like any other, counted on the row, so it ends as couldn't-be-saved instead of processing for ever", async () => {
  // It used to be skipped and left unwritten: the row said "Recording still
  // processing" for good, and since nothing moved its updated_at it stood
  // first in line on every run, two of them holding both of a tick's places.
  const T = tenant(4);
  const pending = (id, attempts, over = {}) =>
    callRow(T, id, {
      status: "ended",
      ended_at: ago(20 * MIN),
      updated_at: ago(10 * MIN),
      recording: { fetch_state: "pending", attempts },
      ...over,
    });
  const tables = {
    calls: [pending("spent", RECORDING_MAX_ATTEMPTS - 1), pending("fresh", 0, { updated_at: ago(9 * MIN) })],
    messages: [],
    events: [],
  };
  use(tables, { ingest_call: ingestRpc(tables) });
  const GET_CALL = "https://api.retellai.com/v2/get-call/";
  const net = wired((req) => {
    // The provider knows the call and has no recording to give.
    if (req.url.startsWith(GET_CALL))
      return { status: 200, body: { call_id: req.url.slice(GET_CALL.length), call_status: "ended" } };
    throw new Error("unexpected " + req.method + " " + req.url);
  });
  const rec = (id) => tables.calls.find((c) => c.id === id).recording;

  let [status, body] = await answer(await knock("calls"));
  assert.equal(status, 200, JSON.stringify(body));
  assert.deepEqual(body.recordings, { candidates: 2, stored: 0, retry: 1, failed: 1 });
  assert.deepEqual(
    rec("spent"),
    { fetch_state: "failed", attempts: RECORDING_MAX_ATTEMPTS, error: "provider_no_url" },
    "the last try spent: it reads as couldn't be saved",
  );
  assert.deepEqual(
    rec("fresh"),
    { fetch_state: "pending", attempts: 1, error: "provider_no_url" },
    "a first miss is counted and waits for the next try",
  );
  assert.equal(net.to("cdn.retell.test").length, 0, "there was nothing to fetch");

  [status, body] = await answer(await knock("calls"));
  assert.deepEqual(
    body.recordings,
    { candidates: 1, stored: 0, retry: 1, failed: 0 },
    "the failed copy is no longer a candidate",
  );
  assert.equal(rec("fresh").attempts, 2);
});

test("calls: recordings past the ninety days the privacy page states are removed from the bucket and the row says so — before the provider is asked, so a deployment without the key still keeps that promise; a call that ended, or errored, without an analysis still gets its line in the customer's thread, once", async () => {
  const T = tenant(3);
  const CONV = uuid(31);
  /** A call whose line is already in the thread (message_id): however long ago it ended, the note leg must pass it by. */
  const stored = (id, days, noteN) =>
    callRow(T, id, {
      status: "ended",
      started_at: iso(NOW - days * DAY),
      ended_at: iso(NOW - days * DAY + 2 * MIN),
      updated_at: iso(NOW - days * DAY),
      conversation_id: CONV,
      message_id: uuid(noteN),
      recording: { fetch_state: "stored", storage_path: `${T}/calls/${id}.wav`, mime: "audio/wav", bytes: 10 },
    });
  const tables = {
    calls: [
      stored("old", RECORDING_RETENTION_DAYS + 1, 32),
      stored("young", RECORDING_RETENTION_DAYS - 1, 33),
      callRow(T, "unnoted", {
        status: "ended",
        started_at: ago(25 * MIN),
        ended_at: ago(20 * MIN),
        updated_at: ago(20 * MIN),
        duration_ms: 125_000,
        in_voicemail: false,
        conversation_id: CONV,
      }),
      // Ended in error, never analysed: still a call the customer took.
      callRow(T, "errored", {
        status: "error",
        direction: "outbound",
        started_at: ago(50 * MIN),
        ended_at: ago(45 * MIN),
        updated_at: ago(45 * MIN),
        duration_ms: 42_000,
        conversation_id: CONV,
      }),
      callRow(T, "recent", {
        status: "ended",
        started_at: ago(8 * MIN),
        ended_at: ago(5 * MIN),
        updated_at: ago(5 * MIN),
        conversation_id: CONV,
      }),
      // A withheld number: no contact, no thread, nowhere for a line to go.
      callRow(T, "orphan", {
        status: "ended",
        started_at: ago(35 * MIN),
        ended_at: ago(30 * MIN),
        updated_at: ago(30 * MIN),
      }),
    ],
    messages: [],
    events: [],
  };
  const db = use(tables, { ingest_call: ingestRpc(tables) });
  const net = silent("nothing here needs the provider");
  const call = (id) => tables.calls.find((c) => c.id === id);

  // Without the key: the purge runs, the reconcile does not, and the answer says which half is missing.
  await withEnv({ RETELL_API_KEY: undefined }, async () => {
    assert.deepEqual(await answer(await knock("calls")), [503, { ok: false, error: "no_provider_credentials" }]);
  });
  assert.deepEqual(
    db.bucket.removed,
    [`${T}/calls/old.wav`],
    "one call to the bucket; the eighty-nine-day-old recording stays",
  );
  const purged = call("old").recording;
  assert.deepEqual(
    [purged.fetch_state, purged.retention_days, purged.mime, "storage_path" in purged, "bytes" in purged],
    ["purged", RECORDING_RETENTION_DAYS, "audio/wav", false, false],
    "the path and the size go with the audio; the marker says under which rule",
  );
  assert.ok(Date.parse(purged.purged_at) >= NOW, "and when");
  assert.equal(call("young").recording.fetch_state, "stored");
  assert.equal(tables.messages.length, 0, "the note leg is past the key check: nothing was written");

  // With the key: the purge finds nothing more, and the never-analysed calls get their line.
  const [status, body] = await answer(await knock("calls"));
  assert.equal(status, 200, JSON.stringify(body));
  assert.deepEqual(body.purge, { candidates: 0, purged: 0, error: null }, "not purged twice");
  assert.deepEqual(
    body.notes,
    { candidates: 2, written: 2 },
    "the two with a thread and no line yet; the two already noted -- in the same thread, ended long ago -- are passed by, and so is the one with no thread",
  );
  assert.equal(tables.messages.length, 2);
  assert.deepEqual(
    tables.messages.map((m) => m.external_id),
    ["call:call_errored", "call:call_unnoted"],
    "the longest-waiting first",
  );
  const noteFor = (id) => tables.messages.find((m) => m.external_id === `call:call_${id}`);
  const note = noteFor("unnoted");
  assert.deepEqual(
    [
      note.tenant_id,
      note.conversation_id,
      note.channel,
      note.direction,
      note.sender,
      note.type,
      note.external_id,
      note.channel_ts,
      note.status,
      note.body,
    ],
    [
      T,
      CONV,
      "voice",
      "inbound",
      "system",
      "call_summary",
      "call:call_unnoted",
      ago(25 * MIN),
      "received",
      "Inbound call · 2 min — No summary available.",
    ],
    "the thread's one line for a call the provider never analysed, idempotent on the call id",
  );
  const errNote = noteFor("errored");
  assert.deepEqual(
    [errNote.conversation_id, errNote.type, errNote.channel_ts, errNote.body],
    [CONV, "call_summary", ago(50 * MIN), "Outbound call · 1 min — No summary available."],
    "a call that ended in error is still a call in the customer's history",
  );
  assert.deepEqual(
    [call("unnoted").message_id, call("errored").message_id],
    [note.id, errNote.id],
    "linked back: the link on the row is what stops a second line",
  );
  assert.deepEqual(
    [call("old").message_id, call("young").message_id],
    [uuid(32), uuid(33)],
    "a call already in the thread keeps the line it has",
  );
  assert.equal(
    call("recent").message_id,
    null,
    "five minutes after ending the webhook still has ten to write it with the summary",
  );
  assert.equal(call("orphan").message_id, null, "no thread, no line");
  assert.equal(net.calls.length, 0, "no ongoing call, no pending copy: the provider was never asked");

  // The tick after: every call with a thread has its line, and none is written twice.
  const [s3, b3] = await answer(await knock("calls"));
  assert.equal(s3, 200);
  assert.deepEqual(b3.notes, { candidates: 0, written: 0 }, "the sweep reads the link on the row, not the thread");
  assert.equal(tables.messages.length, 2);
  assert.equal(net.calls.length, 0);
});

test("calls: a purge the bucket refuses marks nothing and stops no other leg, then the sweep answers 500 in the bucket's own words, where its watcher reads them; the tick that removes the audio answers 200", async () => {
  const T = tenant(4);
  const CONV = uuid(41);
  const old = NOW - (RECORDING_RETENTION_DAYS + 1) * DAY;
  const tables = {
    calls: [
      callRow(T, "old", {
        status: "ended",
        started_at: iso(old),
        ended_at: iso(old + 2 * MIN),
        updated_at: iso(old),
        conversation_id: CONV,
        message_id: uuid(42),
        recording: { fetch_state: "stored", storage_path: `${T}/calls/old.wav`, mime: "audio/wav", bytes: 10 },
      }),
      callRow(T, "unnoted", {
        status: "ended",
        started_at: ago(25 * MIN),
        ended_at: ago(20 * MIN),
        updated_at: ago(20 * MIN),
        duration_ms: 65_000,
        in_voicemail: false,
        conversation_id: CONV,
      }),
    ],
    messages: [],
    events: [],
  };
  const db = use(tables, { ingest_call: ingestRpc(tables) });
  const net = silent("nothing here needs the provider");
  const call = (id) => tables.calls.find((c) => c.id === id);
  let refusing = true;
  const bucketOf = db.storage.from;
  db.storage.from = (name) => {
    const b = bucketOf(name);
    return {
      ...b,
      remove: async (paths) =>
        refusing ? { data: null, error: { message: "the storage service is unavailable" } } : b.remove(paths),
    };
  };

  const res = await knock("calls");
  const text = await res.text();
  const body = JSON.parse(text);
  assert.equal(res.status, 500, text);
  assert.deepEqual(
    [body.ok, body.error, body.purge],
    [false, "purge_failed", { candidates: 1, purged: 0, error: "the storage service is unavailable" }],
    "which leg failed, and why",
  );
  // sweep_health() quotes the first 200 characters of the answer in the platform's mail.
  assert.match(text.slice(0, 200), /the storage service is unavailable/, "the cause is inside what the alert quotes");
  assert.equal(
    call("old").recording.fetch_state,
    "stored",
    "a removal that failed marks nothing, so the row still owes the purge and the clock asks again in five minutes",
  );
  assert.deepEqual(body.notes, { candidates: 1, written: 1 }, "the purge failing stopped no other leg");
  assert.deepEqual(
    tables.messages.map((m) => m.external_id),
    ["call:call_unnoted"],
  );

  refusing = false;
  const [status, again] = await answer(await knock("calls"));
  assert.equal(status, 200, JSON.stringify(again));
  assert.deepEqual(again.purge, { candidates: 1, purged: 1, error: null });
  assert.deepEqual(db.bucket.removed, [`${T}/calls/old.wav`]);
  assert.equal(call("old").recording.fetch_state, "purged");
  assert.equal(net.calls.length, 0, "no ongoing call, no pending copy: the provider was never asked");
});

/* ----------------------------------------------------------------- google */

const listing = (T, n, over = {}) => ({
  tenant_id: T,
  place_id: `ChIJ${String(n).padStart(20, "0")}`,
  name: `Listing ${n}`,
  address: "1 Main St",
  maps_uri: null,
  business_status: "OPERATIONAL",
  rating: 4.5,
  review_count: 10,
  linked_by: null,
  linked_at: ago(30 * DAY),
  checked_at: null,
  check_error: null,
  ...over,
});
/** A place as Places (New) answers it. */
const place = (id, over = {}) => ({
  id,
  displayName: { text: "Harbor Moving", languageCode: "en" },
  formattedAddress: "1 Main St, Brooklyn",
  googleMapsUri: "https://maps.google.com/?cid=1",
  businessStatus: "OPERATIONAL",
  rating: 4.6,
  userRatingCount: 10,
  reviews: [],
  ...over,
});
const placeIdOf = (url) =>
  decodeURIComponent(url.slice("https://places.googleapis.com/v1/places/".length).split("?")[0]);

test("google: without a Places key or an OAuth client the sweep says so and reads no table", async () => {
  const db = use({
    tenants: [tenantRow(tenant(10))],
    google_listings: [listing(tenant(10), 1)],
    google_connections: [],
  });
  const net = silent();
  await withEnv(
    {
      GOOGLE_PLACES_API_KEY: undefined,
      GOOGLE_OAUTH_CLIENT_ID: undefined,
      GOOGLE_OAUTH_CLIENT_SECRET: undefined,
      GOOGLE_OAUTH_REDIRECT_URI: undefined,
    },
    async () => {
      assert.deepEqual(await answer(await knock("google")), [200, { ok: true, skipped: "no_places_key" }]);
    },
  );
  assert.ok(
    db.seen.every((s) => s.rpc === "get_cron_sweep_key"),
    "nothing was read",
  );
  assert.equal(net.calls.length, 0);
});

test("google: listings not read for twenty hours are read again — never read first, then the oldest, forty a tick — and a read writes the rating, the count, the day and the reviews Google shows, ringing the bell for what is new; a refusal stays on its row and moves no stamp", async () => {
  const tenants = [];
  const listings = [];
  const add = (n, over, ws = {}) => {
    const T = tenant(100 + n);
    tenants.push(tenantRow(T, { name: `Workspace ${n}`, ...ws }));
    listings.push(listing(T, n, over));
    return T;
  };
  // The day a read is filed under is the WORKSPACE'S date, read from its own row.
  // These two clocks are twenty-five hours apart and so never on the same date: a
  // sweep that took one zone for everyone could not write both rows right.
  const never = add(0, {}, { timezone: "Pacific/Kiritimati" }); // never read: goes first
  const news = add(1, { checked_at: ago(22 * HOUR) }, { timezone: "Pacific/Pago_Pago" }); // read yesterday; a review since
  const unzoned = add(2, { checked_at: ago(23 * HOUR) }, { timezone: null }); // no zone on its row: the platform's default
  for (let k = 3; k <= 39; k++) add(k, { checked_at: ago((21 + k) * HOUR) }); // 24h .. 60h ago
  const refused = listings[5].tenant_id; // Google refuses this one
  const newest = add(40, { checked_at: ago(21 * HOUR) }); // due, but the most recently read of the due: the forty-first waits
  const fresh = add(41, { checked_at: ago(HOUR) }); // read an hour ago: not due
  const tables = {
    tenants,
    google_listings: listings,
    google_connections: [],
    google_reviews: [],
    google_listing_days: [],
    notifications: [],
    events: [],
  };
  use(tables);
  const rowOf = (T) => tables.google_listings.find((l) => l.tenant_id === T);
  // The order the fixture is due in, taken before the sweep moves any stamp.
  const dueOrder = listings
    .filter((l) => l.checked_at === null || l.checked_at < ago(20 * HOUR))
    .sort((a, b) => (a.checked_at === null ? -1 : b.checked_at === null ? 1 : a.checked_at < b.checked_at ? -1 : 1))
    .map((l) => l.place_id);
  const refusedBefore = { ...rowOf(refused) };
  const net = wired((req) => {
    const id = placeIdOf(req.url);
    if (id === rowOf(refused).place_id && rowOf(refused).check_error === null) {
      return {
        status: 403,
        body: { error: { code: 403, message: "The caller does not have permission", status: "PERMISSION_DENIED" } },
      };
    }
    if (id === rowOf(news).place_id) {
      return {
        status: 200,
        body: place(id, {
          userRatingCount: 11,
          reviews: [
            {
              name: `places/${id}/reviews/r-news`,
              rating: 5,
              authorAttribution: { displayName: "Rosa", uri: "https://maps.google.com/rosa", photoUri: null },
              text: { text: "Careful movers, on time.", languageCode: "en" },
              publishTime: ago(2 * HOUR),
              googleMapsUri: "https://maps.google.com/?r=1",
            },
            {
              name: `places/${id}/reviews/r-old`,
              rating: 4,
              authorAttribution: { displayName: "Ana" },
              text: { text: "Fine.", languageCode: "en" },
              publishTime: ago(300 * DAY),
            },
          ],
        }),
      };
    }
    return { status: 200, body: place(id) };
  });

  const at = new Date();
  const [status, body] = await answer(await knock("google"));
  assert.equal(status, 200, JSON.stringify(body));
  assert.deepEqual(body, {
    ok: true,
    listings_due: 40,
    listings_read: 39,
    profiles_due: 0,
    profiles_synced: 0,
    fresh: 1,
    counted: 1,
    failed: 1,
  });

  // The rotation, from what was asked.
  const asked = net.calls.map((c) => placeIdOf(c.url));
  assert.equal(dueOrder.length, 41, "forty-one are due");
  assert.deepEqual(asked, dueOrder.slice(0, 40), "never read first, then the oldest read; forty of the forty-one");
  assert.equal(asked[0], rowOf(never).place_id);
  assert.equal(dueOrder[40], rowOf(newest).place_id, "the one that waits is the most recently read of the due");
  assert.ok(!asked.includes(rowOf(newest).place_id), "the forty-first waits for the next hour");
  assert.ok(!asked.includes(rowOf(fresh).place_id), "read an hour ago: not due");
  assert.ok(
    net.calls.every(
      (c) =>
        c.method === "GET" &&
        c.headers["X-Goog-Api-Key"] === "places-key-for-this-file" &&
        c.headers["X-Goog-FieldMask"].includes("rating,userRatingCount,reviews"),
    ),
    "the key in a header, the fields asked for by name",
  );

  // What a read writes.
  const first = rowOf(never);
  assert.deepEqual(
    [first.name, first.address, first.rating, first.review_count, first.check_error],
    ["Harbor Moving", "1 Main St, Brooklyn", 4.6, 10, null],
    "the listing says what Google says",
  );
  assert.ok(Date.parse(first.checked_at) >= NOW, "the stamp is the successful read");
  const dayOf = (T) => tables.google_listing_days.filter((d) => d.tenant_id === T).map((d) => d.day);
  assert.deepEqual(
    dayOf(never),
    [dayIn("Pacific/Kiritimati", at)],
    "and the day has its row, by the workspace's own clock",
  );
  assert.deepEqual(dayOf(news), [dayIn("Pacific/Pago_Pago", at)]);
  assert.notEqual(
    dayOf(never)[0],
    dayOf(news)[0],
    "the first and the last clock on Earth: two workspaces read in the same second are on different days",
  );
  assert.deepEqual(
    dayOf(unzoned),
    [dayIn("America/New_York", at)],
    "a workspace with no zone on its row is on the platform's default, New York",
  );
  assert.equal(tables.google_listing_days.length, 39, "one day row per read");
  const bad = rowOf(refused);
  assert.equal(
    bad.check_error,
    "PERMISSION_DENIED: The caller does not have permission",
    "a failed read leaves its words",
  );
  assert.deepEqual(
    [bad.rating, bad.review_count, bad.checked_at],
    [refusedBefore.rating, refusedBefore.review_count, refusedBefore.checked_at],
    "and the last good numbers; the stamp does not move -- it is the news cutoff, the first-sync flag and the due window at once",
  );
  assert.equal(rowOf(newest).checked_at, ago(21 * HOUR), "untouched this tick");
  assert.equal(rowOf(fresh).checked_at, ago(HOUR));

  // The bell rings for the one review written since the last read; the old one shown by relevance is not news.
  assert.deepEqual(
    tables.google_reviews.map((r) => [r.tenant_id, r.review_id, r.origin, r.rating, r.author, r.body]).sort(),
    [
      [news, "r-news", "places", 5, "Rosa", "Careful movers, on time."],
      [news, "r-old", "places", 4, "Ana", "Fine."],
    ].sort(),
    "every review Google showed is on record",
  );
  assert.equal(tables.notifications.length, 1);
  const bell = tables.notifications[0];
  assert.deepEqual(
    [bell.tenant_id, bell.kind, bell.route, bell.subject_type, bell.subject_id],
    [news, "review", "reports", "review", "r-news"],
  );
  assert.match(bell.title, /^New on Google: .+ from Rosa$/);
  assert.match(bell.body, /“Careful movers, on time\.”/);
  assert.deepEqual(
    tables.events.map((e) => [e.tenant_id, e.kind, e.category, e.data]),
    [[news, "google.reviews", "google", { source: "places", fresh: 1, counted: 1, rating: 4.6, review_count: 11 }]],
  );

  // The next hour: the refused listing (its stamp never moved) and the forty-first, oldest first; nothing else is due.
  const [s2, b2] = await answer(await knock("google"));
  assert.equal(s2, 200);
  assert.deepEqual([b2.listings_due, b2.listings_read, b2.failed, b2.fresh, b2.counted], [2, 2, 0, 0, 0]);
  assert.deepEqual(
    net.calls.slice(40).map((c) => placeIdOf(c.url)),
    [rowOf(refused).place_id, rowOf(newest).place_id],
  );
  assert.equal(rowOf(refused).check_error, null, "a read that succeeds clears the words");
  assert.ok(Date.parse(rowOf(refused).checked_at) >= NOW);
  assert.equal(tables.notifications.length, 1, "nothing new: nothing rang");
});

test("google: a connected profile not synced for twenty hours is synced as the owner — the refresh token in Vault traded for an access token that is kept, every review read, the public five making way for the profile's, the stamp moved — and a credential Google rejects is written on the row without stopping the sweep; a profile with no location chosen waits", async () => {
  const [T1, T2, T3] = [tenant(201), tenant(202), tenant(203)];
  const SCOPE = "openid email https://www.googleapis.com/auth/business.manage";
  const conn = (T, over = {}) => ({
    tenant_id: T,
    google_email: "owner@example.com",
    google_sub: "sub-1",
    account_name: "accounts/111",
    account_title: "Harbor",
    location_name: "locations/222",
    location_title: "Harbor Moving",
    scopes: SCOPE.split(" "),
    connected_by: null,
    connected_at: ago(DAY),
    last_synced_at: null,
    sync_error: null,
    ...over,
  });
  const tables = {
    tenants: [tenantRow(T1), tenantRow(T2, { name: "Billing probe" }), tenantRow(T3, { name: "Pending" })],
    google_connections: [
      conn(T1),
      conn(T2, { account_name: "accounts/333", location_name: "locations/444" }),
      conn(T3, { location_name: null, location_title: null }),
    ],
    // Read an hour ago: the places leg leaves it, so what this case sees is the profile's.
    google_listings: [listing(T1, 1, { checked_at: ago(HOUR) })],
    google_reviews: [
      {
        id: uuid(21),
        tenant_id: T1,
        review_id: "p-1",
        origin: "places",
        rating: 5,
        author: "Someone",
        body: "the public copy",
        published_at: ago(10 * DAY),
        first_seen_at: ago(9 * DAY),
        replied_at: null,
        reply_text: null,
      },
    ],
    google_listing_days: [],
    notifications: [],
    events: [],
  };
  const kept = [];
  const db = use(tables, {
    get_google_credentials: ({ p_tenant_id }) =>
      p_tenant_id === T1
        ? { refresh_token: "rt-1", access_token: null, expires_at: null, scope: SCOPE }
        : { refresh_token: "rt-2", access_token: null, expires_at: null, scope: SCOPE },
    put_google_credentials: (a) => {
      kept.push(a);
      return null;
    },
  });
  const net = wired((req) => {
    if (req.url === "https://oauth2.googleapis.com/token") {
      const f = new URLSearchParams(req.body);
      if (f.get("refresh_token") === "rt-1")
        return { status: 200, body: { access_token: "at-1", expires_in: 3600, scope: SCOPE, token_type: "Bearer" } };
      return { status: 400, body: { error: "invalid_grant", error_description: "Token has been expired or revoked." } };
    }
    if (req.url.startsWith("https://mybusiness.googleapis.com/v4/accounts/111/locations/222/reviews?")) {
      return {
        status: 200,
        body: {
          reviews: [
            {
              name: "accounts/111/locations/222/reviews/g-1",
              reviewId: "g-1",
              starRating: "FIVE",
              reviewer: { displayName: "Rosa", profilePhotoUrl: null },
              comment: "Careful movers.",
              createTime: ago(3 * DAY),
              updateTime: ago(3 * DAY),
            },
            {
              name: "accounts/111/locations/222/reviews/g-2",
              reviewId: "g-2",
              starRating: "FOUR",
              reviewer: { isAnonymous: true },
              comment: "Fine.",
              createTime: ago(40 * DAY),
              updateTime: ago(39 * DAY),
              reviewReply: { comment: "Thank you!", updateTime: ago(39 * DAY) },
            },
          ],
          averageRating: 4.6,
          totalReviewCount: 12,
        },
      };
    }
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });

  const at = new Date();
  const [status, body] = await answer(await knock("google"));
  assert.equal(status, 200, JSON.stringify(body));
  assert.deepEqual(
    body,
    {
      ok: true,
      listings_due: 0,
      listings_read: 0,
      profiles_due: 2,
      profiles_synced: 1,
      fresh: 0,
      counted: 0,
      failed: 1,
    },
    "the pending profile is not due; the rejected one fails without throwing",
  );

  assert.deepEqual(
    net.calls.map((c) => [c.method, c.url.split("?")[0]]),
    [
      ["POST", "https://oauth2.googleapis.com/token"],
      ["GET", "https://mybusiness.googleapis.com/v4/accounts/111/locations/222/reviews"],
      ["POST", "https://oauth2.googleapis.com/token"],
    ],
    "a token first, then the reviews as the owner; the second profile never gets past its token",
  );
  const refresh = new URLSearchParams(net.calls[0].body);
  assert.deepEqual(
    [refresh.get("grant_type"), refresh.get("client_id"), refresh.get("client_secret"), refresh.get("refresh_token")],
    ["refresh_token", "oauth-client-for-this-file", "oauth-secret-for-this-file", "rt-1"],
    "the secret alone on the edge",
  );
  assert.deepEqual(
    [net.calls[1].headers.Authorization, net.calls[1].headers["X-GOOG-API-FORMAT-VERSION"]],
    ["Bearer at-1", "2"],
  );
  assert.equal(kept.length, 1, "the fresh access token goes back through the vault door, for next time");
  assert.deepEqual(
    [kept[0].p_tenant_id, kept[0].p_secret.refresh_token, kept[0].p_secret.access_token, kept[0].p_secret.scope],
    [T1, "rt-1", "at-1", SCOPE],
  );
  assert.ok(
    kept[0].p_secret.expires_at >= NOW + 3600_000 && kept[0].p_secret.expires_at <= Date.now() + 3600_000,
    "an hour, as Google said",
  );
  assert.deepEqual(
    rpcs(db, "get_google_credentials").map((s) => s.args.p_tenant_id),
    [T1, T2],
  );

  const c1 = tables.google_connections.find((c) => c.tenant_id === T1);
  assert.ok(Date.parse(c1.last_synced_at) >= NOW, "the stamp is the successful sync");
  assert.equal(c1.sync_error, null);
  assert.deepEqual(
    tables.google_reviews
      .map((r) => [r.tenant_id, r.review_id, r.origin, r.rating, r.author, r.body, r.reply_text])
      .sort(),
    [
      [T1, "g-1", "profile", 5, "Rosa", "Careful movers.", null],
      [T1, "g-2", "profile", 4, null, "Fine.", "Thank you!"],
    ].sort(),
    "the public five are gone -- their ids were the public listing's -- and every review of the profile is on record, replies and anonymity kept",
  );
  const l1 = tables.google_listings.find((l) => l.tenant_id === T1);
  assert.deepEqual([l1.rating, l1.review_count], [4.6, 12], "the rating and the count as the profile reports them");
  assert.deepEqual(
    tables.google_listing_days.map((d) => [d.tenant_id, d.day, d.rating, d.review_count]),
    [[T1, dayIn("America/New_York", at), 4.6, 12]],
    "the profile's numbers, on the workspace's own day",
  );
  assert.equal(tables.notifications.length, 0, "the first sync is history: nothing rings, nothing is answered");
  assert.equal(tables.events.length, 0);

  const c2 = tables.google_connections.find((c) => c.tenant_id === T2);
  assert.equal(
    c2.sync_error,
    "invalid_grant: Token has been expired or revoked.",
    "Google's own words, on the connection the owner can see",
  );
  assert.equal(c2.last_synced_at, null, "a failed sync is not a sync");
  assert.deepEqual(
    tables.google_connections.find((c) => c.tenant_id === T3),
    conn(T3, { location_name: null, location_title: null }),
    "no location chosen: not synced, not touched",
  );

  // The next hour: the synced profile rests; the rejected one is tried again, and fails again on its row.
  const [s2, b2] = await answer(await knock("google"));
  assert.equal(s2, 200);
  assert.deepEqual([b2.profiles_due, b2.profiles_synced, b2.failed], [1, 0, 1]);
  assert.equal(net.calls.length, 4, "one more token request, for the one profile still due");
});

/* ------------------------------------------------------------------ lines */

/** A row as the database holds it: the columns the sweep, the take and the report read. */
const lineRow = (T, id, over = {}) => ({
  id,
  tenant_id: T,
  e164: "+13055550100",
  kind: "chanlytics",
  provider: "dry",
  area_code: 305,
  subaccount_sid: "ACsub0000000000000000000000000000",
  number_sid: "PN0001",
  trunk_sid: null,
  credential_list_sid: null,
  termination_uri: null,
  messaging_service_sid: null,
  retell_agent_id: null,
  credentials_ref: null,
  voice_state: "provisioning",
  sms_state: "none",
  whatsapp_state: "none",
  port_state: "none",
  forwarding_state: "none",
  step: "trunk",
  last_error: null,
  state_since: ago(30 * MIN),
  created_at: ago(DAY),
  updated_at: ago(30 * MIN),
  profile_sid: null,
  a2p_profile_sid: null,
  brand_sid: null,
  campaign_sid: null,
  reg_mock: false,
  reg_sole_prop: false,
  reg_step: null,
  facts: {},
  ...over,
});

test("lines: a tick that cannot provision says so — no line provider, no receptionist key, no function secret — before any line is read", async () => {
  const T = tenant(300);
  const db = use({ tenants: [tenantRow(T)], lines: [lineRow(T, uuid(300))], jobs: [], notifications: [], events: [] });
  const net = silent();
  await withEnv({ LINES_DRY_RUN: undefined }, async () => {
    assert.deepEqual(
      await answer(await knock("lines")),
      [503, { ok: false, error: "no_line_provider" }],
      "nothing to fake with and no credentials",
    );
  });
  await withEnv({ VERCEL_ENV: "production" }, async () => {
    assert.deepEqual(
      await answer(await knock("lines")),
      [503, { ok: false, error: "no_line_provider" }],
      "production never fakes a line",
    );
  });
  await withEnv({ RETELL_API_KEY: undefined }, async () => {
    assert.deepEqual(await answer(await knock("lines")), [503, { ok: false, error: "no_provider_key" }]);
  });
  await withEnv({ RETELL_FN_SECRET: undefined }, async () => {
    assert.deepEqual(await answer(await knock("lines")), [503, { ok: false, error: "no_fn_secret" }]);
  });
  assert.ok(
    db.seen.every((s) => s.rpc === "get_cron_sweep_key"),
    "the lines table was never read: a clean sweep over lines it never looked at is not reported",
  );
  assert.equal(net.calls.length, 0);
});

test("lines: a line 'setting up' past its deadline is taken and resumed by scheduling a line_provision job — two a tick, oldest first — and the platform hears once; one past its three automatic tries is handed to a person: the workspace's bell, the platform's mail, the ledger", async () => {
  const T = tenant(301);
  const worn = uuid(311),
    oldest = uuid(312),
    older = uuid(313),
    old = uuid(314),
    running = uuid(315);
  const tables = {
    tenants: [tenantRow(T, { name: "Northside Movers", slug: "northside-movers" })],
    lines: [
      lineRow(T, worn, { state_since: ago(60 * MIN), facts: { automatic_resumes: 3, trunk_ready: true } }),
      lineRow(T, oldest, { state_since: ago(50 * MIN) }),
      lineRow(T, older, { state_since: ago(40 * MIN), step: "import" }),
      lineRow(T, old, { state_since: ago(30 * MIN) }),
      lineRow(T, running, { state_since: ago(MIN) }),
    ],
    jobs: [],
    notifications: [],
    events: [],
  };
  use(tables);
  const net = wired((req) => {
    if (req.url === "https://api.resend.com/emails") return { status: 200, body: { id: "email-1" } };
    throw new Error(`the dry provider makes no calls: ${req.method} ${req.url}`);
  });
  const row = (id) => tables.lines.find((l) => l.id === id);

  const [status, body] = await answer(await knock("lines"));
  assert.deepEqual(
    [status, body],
    [200, { ok: true, stuck: 2, resumed: 1, failed: 0, gaveUp: 1, skipped: 0, unreadable: 0 }],
  );

  // Handed to a person: `failed` is the state every Retry button already knows what to do with.
  assert.equal(row(worn).voice_state, "failed");
  assert.equal(
    row(worn).last_error,
    "Setting up stopped while connecting the number to the receptionist, and 3 automatic tries did not finish it. Retry picks up where it stopped.",
  );
  assert.equal(row(worn).facts.trunk_ready, true, "every receipt the saga reads survives");
  // Resumed: the take is visible on the row, the try is counted, and the saga runs on the ledger.
  assert.equal(row(oldest).voice_state, "provisioning");
  assert.ok(
    Date.parse(row(oldest).state_since) >= NOW,
    "a fresh clock is the take: the next tick leaves it alone for five minutes",
  );
  assert.equal(row(oldest).facts.automatic_resumes, 1);
  assert.deepEqual(
    tables.jobs.map((j) => [j.tenant_id, j.kind, j.payload]),
    [[T, "line_provision", { line_id: oldest, by: "sweep" }]],
    "the saga is a job on the ledger, not a run inside this tick",
  );
  assert.ok(Date.parse(tables.jobs[0].due_at) >= NOW && Date.parse(tables.jobs[0].due_at) <= Date.now(), "due now");
  for (const id of [older, old, running]) {
    assert.deepEqual(
      [row(id).voice_state, row(id).state_since, row(id).facts],
      ["provisioning", lineRow(T, id, { state_since: row(id).state_since }).state_since, {}],
      `${id === running ? "inside its deadline" : "beyond this tick's two"}: untouched`,
    );
  }
  assert.equal(
    row(running).state_since,
    ago(MIN),
    "a saga genuinely still running is never taken from underneath itself",
  );

  // The bell: the workspace's own row, for the line handed to a person. The platform's alerts have no workspace and so no bell.
  assert.equal(tables.notifications.length, 1);
  const bell = tables.notifications[0];
  assert.deepEqual(
    [bell.tenant_id, bell.kind, bell.route, bell.subject_type, bell.subject_id],
    [T, "alert", "admin/setup", "line", worn],
  );
  assert.equal(bell.title, "Your phone line hit a snag — a person at Chanlytics has it");
  assert.equal(
    bell.body,
    "Setting up +1 (305) 555-0100 stopped while connecting the number to the receptionist. You can retry from Setup; we have been told and will finish it with you if the retry does not.",
  );

  // The mail: the platform, twice -- the line given up on, then the first automatic try.
  const mail = net.mail();
  assert.deepEqual(
    mail.map((m) => [m.subject, m.to, m.from]),
    [
      ["Line failed · Northside Movers", ["ops@platform.test"], "Pager <pager@platform.test>"],
      ["Line stuck · Northside Movers", ["ops@platform.test"], "Pager <pager@platform.test>"],
    ],
  );
  assert.match(
    mail[0].text,
    new RegExp(
      `line ${worn} for \\+13055550100 stopped at step "connecting the number to the receptionist" \\(started by sweep\\)`,
    ),
  );
  assert.match(mail[0].text, /3 automatic tries did not finish it/);
  assert.match(
    mail[0].text,
    new RegExp(`"op": "retry", "tenant_id": "${T}", "line_id": "${worn}"`),
    "and how to pick it up",
  );
  assert.match(
    mail[1].text,
    new RegExp(`line ${oldest} for \\+1 \\(305\\) 555-0100 stopped while connecting the number to the receptionist`),
  );
  assert.match(mail[1].text, /try 1 of 3\. You hear again only if those do not finish it\./);
  assert.ok(
    net.calls.every(
      (c) => c.url === "https://api.resend.com/emails" && c.headers.Authorization === "Bearer re_test_only",
    ),
    "nothing but mail left this tick",
  );

  // The ledger.
  assert.deepEqual(
    tables.events.map((e) => [e.tenant_id, e.kind, e.category, e.subject_type, e.subject_id, e.data]),
    [
      [
        T,
        "line.failed",
        "setup",
        "line",
        worn,
        { step: "trunk", error: row(worn).last_error, provider: "dry", by: "sweep" },
      ],
    ],
  );

  // The next quarter hour drains the rest, two at a time; later tries go to the ledger, not the mailbox.
  const [s2, b2] = await answer(await knock("lines"));
  assert.deepEqual(
    [s2, b2],
    [200, { ok: true, stuck: 2, resumed: 2, failed: 0, gaveUp: 0, skipped: 0, unreadable: 0 }],
    "a backlog drains over successive ticks rather than being half-run and killed again",
  );
  assert.deepEqual(
    tables.jobs.map((j) => j.payload.line_id),
    [oldest, older, old],
    "oldest first",
  );
  assert.deepEqual(
    net
      .mail()
      .slice(2)
      .map((m) => m.subject),
    ["Line stuck · Northside Movers", "Line stuck · Northside Movers"],
    "each line's first try is told once",
  );
  const [s3, b3] = await answer(await knock("lines"));
  assert.deepEqual(
    [s3, b3.stuck],
    [200, 0],
    "every taken line carries a fresh clock, and the running one is still inside its deadline",
  );
  assert.equal(tables.jobs.length, 3);
});

test("lines: a stuck line whose workspace cannot be read is left untouched for the next tick, and when every one is, the sweep answers 503 so its watcher hears a database problem rather than a clean sweep", async () => {
  const T = tenant(302);
  const id = uuid(320);
  const tables = { tenants: [], lines: [lineRow(T, id)], jobs: [], notifications: [], events: [] };
  use(tables);
  const net = silent();
  assert.deepEqual(await answer(await knock("lines")), [503, { ok: false, error: "no_workspace_readable", stuck: 1 }]);
  assert.deepEqual(tables.lines[0], lineRow(T, id), "not taken, not counted, not failed");
  assert.deepEqual([tables.jobs, tables.notifications, tables.events], [[], [], []]);
  assert.equal(net.calls.length, 0);
});

/* ---------------------------------------------------------- registrations */

/** The master account: `lineProviderFromEnv` chooses Twilio over the dry provider the moment both credentials exist; a filing also needs our approved primary profile. */
const FILING = {
  TWILIO_ACCOUNT_SID: "ACmaster0000000000000000000000000",
  TWILIO_AUTH_TOKEN: "master-token",
  TWILIO_PRIMARY_PROFILE_SID: "BUprimary",
};
const SUB = "ACsub0000000000000000000000000000";
const basic = (sid, token) => `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`;
const SUB_AUTH = basic(SUB, "sub-token");
/** The vault, answering the subaccount's token for any line. */
const VAULT = { get_line_credentials: () => ({ auth_token: "sub-token" }) };
/** A line the carriers hold: a brand filed under the workspace's own profiles, no campaign yet. */
const waiting = (T, id, over = {}) =>
  lineRow(T, id, {
    voice_state: "answering",
    step: null,
    trunk_sid: "TK0001",
    messaging_service_sid: "MG0001",
    sms_state: "registering",
    profile_sid: "BUcust",
    a2p_profile_sid: "BUa2p",
    brand_sid: "BN0001",
    campaign_sid: null,
    facts: {
      a2p_business_sid: "ITbiz",
      a2p_representative_sid: "ITrep",
      a2p_address_sid: "ADaddr",
      a2p_document_sid: "RDdoc",
      a2p_primary_assigned: true,
      a2p_profile_submitted: true,
    },
    state_since: ago(3 * DAY),
    updated_at: ago(2 * HOUR),
    ...over,
  });
/** The business on record, complete for the standard registration and named as the workspace is: a filing the pre-flight passes. */
const RECORD = {
  ...emptyBusinessRecord({ websiteUrl: "https://harbormoving.example", email: "ada@example.com" }),
  legal_name: "Harbor Moving LLC",
  about:
    "A moving company in Brooklyn: homes and small offices across New York, packing and storage. Customers book a free estimate and pay per move.",
  trade_name: "Harbor Moving",
  ein: "12-3456789",
  street: "193 Jamaica Ave",
  city: "Brooklyn",
  region: "NY",
  postal_code: "11207",
  country: "US",
  contact_first_name: "Ada",
  contact_last_name: "Lovelace",
  contact_email: "ada@example.com",
  contact_phone: "+19175550123",
  updated_at: ago(3 * DAY),
};
const twilioPath = (url) => url.split("/v1/")[1] ?? url.split("/2010-04-01/")[1] ?? url;

test("registrations: nothing with the carriers is a quiet 200; both waiting states are asked about, least recently asked first, and only lines with a filing; every line asked about is written, moved or not, and the owner hears on the change", async () => {
  const T = tenant(400);
  const quiet = use(
    {
      tenants: [tenantRow(T)],
      lines: [waiting(T, uuid(400), { brand_sid: null })],
      business_records: [],
      notifications: [],
      events: [],
    },
    VAULT,
  );
  const nothing = silent("nothing filed, nothing to ask about");
  await withEnv(FILING, async () => {
    assert.deepEqual(await answer(await knock("registrations")), [200, { ok: true, checked: 0 }]);
  });
  assert.equal(nothing.calls.length, 0);
  assert.equal(rpcs(quiet, "get_line_credentials").length, 0);

  const approved = uuid(401),
    registering = uuid(402),
    unfiled = uuid(403),
    active = uuid(404);
  const tables = {
    tenants: [tenantRow(T)],
    lines: [
      waiting(T, approved, {
        sms_state: "approved",
        brand_sid: "BN0002",
        messaging_service_sid: "MG0002",
        campaign_sid: "QE0001",
        updated_at: ago(HOUR),
      }),
      waiting(T, registering, { updated_at: ago(3 * HOUR) }),
      waiting(T, unfiled, { brand_sid: null, updated_at: ago(5 * HOUR) }),
      waiting(T, active, {
        sms_state: "active",
        brand_sid: "BN0003",
        campaign_sid: "QE0003",
        updated_at: ago(9 * HOUR),
      }),
    ],
    // The business on record, complete: were the sweep to file for the 'approved'
    // line -- whose campaign is already with the carriers -- nothing before the
    // wire would stop it.
    business_records: [{ tenant_id: T, ...RECORD }],
    notifications: [],
    events: [],
  };
  const db = use(tables, VAULT);
  const carrier = wired((req) => {
    if (req.url.endsWith("/BrandRegistrations/BN0001"))
      return { status: 200, body: { status: "IN_PROGRESS", failure_reason: null } };
    if (req.url.endsWith("/BrandRegistrations/BN0002"))
      return { status: 200, body: { status: "APPROVED", failure_reason: null } };
    if (req.url.endsWith("/Services/MG0001/Compliance/Usa2p"))
      return { status: 200, body: { compliance: [], meta: {} } };
    if (req.url.endsWith("/Services/MG0002/Compliance/Usa2p"))
      return {
        status: 200,
        body: { compliance: [{ sid: "QE0001", campaign_status: "VERIFIED", mock: false, errors: [] }], meta: {} },
      };
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
  await withEnv(FILING, async () => {
    assert.deepEqual(await answer(await knock("registrations")), [
      200,
      { ok: true, checked: 2, campaigns_filed: 0, states_moved: 1, unreadable: 0 },
    ]);
  });
  assert.deepEqual(
    carrier.calls.map((c) => [c.method, twilioPath(c.url)]),
    [
      ["GET", "a2p/BrandRegistrations/BN0001"],
      ["GET", "Services/MG0001/Compliance/Usa2p"],
      ["GET", "a2p/BrandRegistrations/BN0002"],
      ["GET", "Services/MG0002/Compliance/Usa2p"],
    ],
    "least recently asked about first; 'approved' is still waiting on the last check, and its campaign, already with the carriers, is not filed again; a line with no brand and a line already active are not asked",
  );
  assert.ok(
    carrier.calls.every((c) => c.headers.Authorization === SUB_AUTH),
    "read as the workspace's own subaccount",
  );

  const row = (id) => tables.lines.find((l) => l.id === id);
  assert.equal(row(approved).sms_state, "active", "a verified campaign IS the permission");
  assert.ok(Date.parse(row(approved).state_since) >= NOW, "the clock restarts on a move");
  assert.equal(row(registering).sms_state, "registering");
  assert.equal(
    row(registering).state_since,
    ago(3 * DAY),
    "no move, no new clock: Setup keeps saying how long the carriers have had it",
  );
  assert.equal(row(registering).last_error, null);
  // Written even so. The sweep reads the least recently asked first, and in
  // Postgres every write moves updated_at -- so a line that was asked about
  // goes to the back of the queue whether or not the carriers had news.
  assert.deepEqual(
    updatesOf(db, "lines").map((u) => u.filters.find(([, col]) => col === "id")[2]),
    [registering, approved],
    "every line asked about is written",
  );
  assert.deepEqual(
    tables.notifications.map((n) => [n.tenant_id, n.kind, n.title, n.route, n.subject_type, n.subject_id]),
    [[T, "number", "Texting is on: +1 (305) 555-0100", "admin/integrations", "line", approved]],
    "told once, on the change",
  );
  assert.deepEqual(
    tables.events.map((e) => [e.tenant_id, e.kind, e.subject_id, e.data.from, e.data.to, e.data.mock]),
    [[T, "line.texting_on", approved, "approved", "active", false]],
  );
});

test("registrations: a line the vault holds no token for is written to (last_error) so it moves down the queue instead of holding the page for ever; a refused token is re-read as the parent and kept; every line unreadable is a 503 for the sweep's watcher, some readable a 200", async () => {
  const T = tenant(401);
  const noToken = uuid(411),
    noSub = uuid(412);
  const tables = {
    tenants: [tenantRow(T)],
    lines: [
      waiting(T, noToken, { updated_at: ago(4 * HOUR) }),
      waiting(T, noSub, { subaccount_sid: null, updated_at: ago(3 * HOUR) }),
    ],
    business_records: [],
    notifications: [],
    events: [],
  };
  const db = use(tables, { get_line_credentials: () => ({}) });
  const nothing = silent("without credentials nothing can be asked");
  await withEnv(FILING, async () => {
    assert.deepEqual(
      await answer(await knock("registrations")),
      [503, { ok: false, error: "no_registration_readable", checked: 2, unreadable: 2 }],
      "the sweep ran and learned nothing: our credentials, not the carriers",
    );
  });
  for (const l of tables.lines) {
    assert.equal(
      l.last_error,
      "could not read the registration: the line has no credentials on file",
      "the reason on the row, and a write that moves it down the queue",
    );
    assert.equal(l.sms_state, "registering", "the state is not guessed at");
    assert.equal(l.state_since, ago(3 * DAY));
  }
  assert.deepEqual(
    updatesOf(db, "lines").map((u) => u.filters.find(([, col]) => col === "id")[2]),
    [noToken, noSub],
  );
  assert.deepEqual(
    rpcs(db, "get_line_credentials").map((s) => s.args),
    [{ p_line_id: noToken }],
    "a line with no subaccount is not asked of the vault at all",
  );
  assert.equal(nothing.calls.length, 0);
  assert.deepEqual([tables.notifications, tables.events], [[], []], "nothing to tell the owner: nothing was learned");

  // A token rotated in the provider's console: our copy answers 401, the
  // platform re-reads it as the parent and writes it back through the one write
  // path, and asks again. A subaccount the parent does not know stays unreadable.
  const rotated = uuid(413),
    dead = uuid(414);
  const healed = {
    tenants: [tenantRow(T)],
    lines: [
      waiting(T, rotated, { updated_at: ago(4 * HOUR) }),
      waiting(T, dead, { subaccount_sid: "ACsub9999999999999999999999999999", updated_at: ago(3 * HOUR) }),
    ],
    business_records: [],
    notifications: [],
    events: [],
  };
  const kept = [];
  use(healed, {
    get_line_credentials: () => ({ auth_token: "stale-token" }),
    put_line_credentials: (a) => {
      kept.push(a);
      return null;
    },
  });
  const MASTER = basic(FILING.TWILIO_ACCOUNT_SID, FILING.TWILIO_AUTH_TOKEN);
  const carrier = wired((req) => {
    if (req.url.startsWith("https://api.twilio.com/2010-04-01/Accounts/")) {
      if (req.headers.Authorization !== MASTER) return { status: 401, body: { code: 20003, message: "Authenticate" } };
      return req.url.endsWith(`/${SUB}.json`)
        ? { status: 200, body: { sid: SUB, auth_token: "fresh-token" } }
        : { status: 404, body: { code: 20404, message: "The requested resource was not found" } };
    }
    if (req.headers.Authorization === basic(SUB, "fresh-token")) {
      if (req.url.endsWith("/BrandRegistrations/BN0001")) return { status: 200, body: { status: "IN_PROGRESS" } };
      if (req.url.endsWith("/Compliance/Usa2p")) return { status: 200, body: { compliance: [], meta: {} } };
    }
    return { status: 401, body: { code: 20003, message: "Authenticate" } };
  });
  await withEnv(FILING, async () => {
    assert.deepEqual(
      await answer(await knock("registrations")),
      [200, { ok: true, checked: 2, campaigns_filed: 0, states_moved: 0, unreadable: 1 }],
      "some readable is a 200: the one that failed carries its reason on the row",
    );
  });
  const who = (c) =>
    c.headers.Authorization === MASTER
      ? "master"
      : c.headers.Authorization === basic(SUB, "stale-token")
        ? "stale"
        : c.headers.Authorization === basic(SUB, "fresh-token")
          ? "fresh"
          : "other";
  assert.deepEqual(
    carrier.calls.map((c) => [twilioPath(c.url), who(c)]),
    [
      ["a2p/BrandRegistrations/BN0001", "stale"],
      ["Services/MG0001/Compliance/Usa2p", "stale"],
      [`Accounts/${SUB}.json`, "master"],
      ["a2p/BrandRegistrations/BN0001", "fresh"],
      ["Services/MG0001/Compliance/Usa2p", "fresh"],
      ["a2p/BrandRegistrations/BN0001", "other"],
      ["Services/MG0001/Compliance/Usa2p", "other"],
      ["Accounts/ACsub9999999999999999999999999999.json", "master"],
    ],
    "one attempt, then heal as the parent, then one more; the unknown subaccount is refused at the parent and not asked again",
  );
  assert.deepEqual(
    kept,
    [{ p_line_id: rotated, p_secret: { auth_token: "fresh-token" } }],
    "the fresh token goes back into the vault, for this line, through the one write path",
  );
  assert.equal(healed.lines[0].last_error, null, "read, and nothing wrong with it");
  assert.equal(
    healed.lines[1].last_error,
    "could not read the registration: the provider refused the platform's credentials (HTTP 404)",
    "a master-credential fault is named as itself, so nobody is sent looking at the subaccount",
  );
});

test("registrations: once the carriers approve the brand, the campaign they were holding is filed by the sweep — as the subaccount, from this deployment's own pages: /b/<slug> as the privacy policy and its /terms, /yes/<slug> in the flow — and the owner hears the brand is through", async () => {
  const T = tenant(402);
  const id = uuid(420);
  const tables = {
    tenants: [tenantRow(T)],
    lines: [waiting(T, id)],
    business_records: [{ tenant_id: T, ...RECORD }],
    notifications: [],
    events: [],
  };
  const db = use(tables, VAULT);
  const carrier = wired((req) => {
    if (req.url.endsWith("/BrandRegistrations/BN0001"))
      return { status: 200, body: { status: "APPROVED", failure_reason: null } };
    if (req.method === "GET" && req.url.endsWith("/Services/MG0001/Compliance/Usa2p"))
      return { status: 200, body: { compliance: [], meta: {} } };
    if (req.method === "POST" && req.url.endsWith("/Services/MG0001/Compliance/Usa2p"))
      return { status: 201, body: { sid: "QE0009", campaign_status: "PENDING" } };
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
  await withEnv(FILING, async () => {
    assert.deepEqual(await answer(await knock("registrations")), [
      200,
      { ok: true, checked: 1, campaigns_filed: 1, states_moved: 1, unreadable: 0 },
    ]);
  });
  assert.deepEqual(
    carrier.calls.map((c) => [c.method, twilioPath(c.url)]),
    [
      ["GET", "a2p/BrandRegistrations/BN0001"],
      ["GET", "Services/MG0001/Compliance/Usa2p"],
      ["POST", "Services/MG0001/Compliance/Usa2p"],
    ],
    "read both, then file the one thing that was waiting",
  );
  assert.ok(
    carrier.calls.every((c) => c.headers.Authorization === SUB_AUTH),
    "read and filed as the workspace's subaccount",
  );
  const filed = new URLSearchParams(carrier.calls[2].body);
  assert.equal(filed.get("BrandRegistrationSid"), "BN0001", "under the brand the carriers approved, not a new one");
  assert.equal(filed.get("UsAppToPersonUsecase"), LOW_VOLUME_USECASE);
  // The same pages as a filing made at the door: this is the one filing that
  // finishes with nobody watching, and 30907 asks that the privacy policy be on
  // the opt-in page's domain and 30919 that it identify the business -- the
  // page we publish for this workspace, not ours.
  assert.equal(filed.get("PrivacyPolicyUrl"), "https://dash.test/b/harbor-moving");
  assert.equal(filed.get("TermsAndConditionsUrl"), "https://dash.test/b/harbor-moving/terms");
  const flow = filed.get("MessageFlow");
  assert.ok(
    flow.includes("(https://dash.test/yes/harbor-moving), public:") &&
      flow.includes("(https://dash.test/yes/harbor-moving/form), public:"),
    "the flow names this workspace's sign-up page and its paper form, whole and delimited",
  );
  assert.ok(
    flow.endsWith("Privacy policy: https://dash.test/b/harbor-moving. Terms: https://dash.test/b/harbor-moving/terms."),
    "linked in the flow too (30908, 30909)",
  );
  assert.ok(
    filed.get("Description").startsWith("About Harbor Moving (Harbor Moving LLC): A moving company in Brooklyn"),
    "what the business does comes first, so a reviewer can tell what kind of business sends (30919, 22 Sep 2026)",
  );
  assert.ok(
    filed.get("Description").includes(" Messages are sent by Harbor Moving (Harbor Moving LLC) to its own customers"),
    "the registered name beside the trade name, so a reviewer matches the campaign to the brand",
  );
  assert.equal(filed.getAll("MessageSamples").length, 4);

  const row = tables.lines[0];
  assert.deepEqual(
    [row.campaign_sid, row.sms_state, row.reg_mock, row.reg_step, row.last_error],
    ["QE0009", "registering", false, null, null],
    "with the carriers again, for the campaign this time; a campaign filed for a real brand is real",
  );
  assert.ok(Date.parse(row.state_since) >= NOW, "a new wait, a new clock");
  assert.deepEqual(
    rpcs(db, "get_line_credentials").map((s) => s.args),
    [{ p_line_id: id }, { p_line_id: id }],
    "the read and the filing each take the subaccount's token from the vault",
  );
  assert.deepEqual(
    tables.notifications.map((n) => [n.tenant_id, n.kind, n.title, n.subject_id]),
    [[T, "number", "Your business is approved by the carriers", id]],
    "the slow half is through; the owner is told once",
  );
  assert.match(tables.notifications[0].body, /^\+1 \(305\) 555-0100 is through the slow half\./);
  assert.deepEqual(
    tables.events.map((e) => [e.kind, e.data.from, e.data.to, e.data.mock]),
    [["line.texting_approved", "registering", "approved", false]],
  );

  // Without our own approved primary profile nothing may be filed; the state the carriers reported still lands on the row.
  const bare = {
    tenants: [tenantRow(T)],
    lines: [waiting(T, uuid(421))],
    business_records: [{ tenant_id: T, ...RECORD }],
    notifications: [],
    events: [],
  };
  use(bare, VAULT);
  const reads = wired((req) => {
    if (req.url.endsWith("/BrandRegistrations/BN0001")) return { status: 200, body: { status: "APPROVED" } };
    if (req.method === "GET" && req.url.endsWith("/Compliance/Usa2p"))
      return { status: 200, body: { compliance: [], meta: {} } };
    throw new Error(`nothing may be filed: ${req.method} ${req.url}`);
  });
  await withEnv({ ...FILING, TWILIO_PRIMARY_PROFILE_SID: undefined }, async () => {
    assert.deepEqual(await answer(await knock("registrations")), [
      200,
      { ok: true, checked: 1, campaigns_filed: 0, states_moved: 1, unreadable: 0 },
    ]);
  });
  assert.equal(reads.calls.filter((c) => c.method === "POST").length, 0);
  assert.deepEqual(
    [bare.lines[0].sms_state, bare.lines[0].campaign_sid],
    ["approved", null],
    "the wait is recorded honestly; the next tick with the profile files it",
  );
});
