/**
 * The cron door on all four sweeps, and the call recordings' copy: a CDN that refuses for good, a key refused, a call
 * answered 500 every time, and recordings past ninety days removed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { RECORDING_RETENTION_DAYS } from "@chanlytics/contracts";
import {
  DAY,
  GET_CALL_URL,
  HOUR,
  KEY,
  MIN,
  NOW,
  RECORDING_DEFER_LIMIT_MS,
  RECORDING_MAX_ATTEMPTS,
  SWEEPS,
  SWEEP_COPY_TIMEOUT_MS,
  ago,
  answer,
  callRow,
  copyRecording,
  ingestRpc,
  iso,
  knock,
  pendingCopy,
  providerUp,
  retellCall,
  rpcs,
  setPg,
  silent,
  tenant,
  unanalysed,
  updatesOf,
  use,
  uuid,
  wired,
  withEnv,
} from "./_doors-b.mjs";

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
    "two ended, one still up, one the provider does not know: each counter is the provider's word, not the row's place in the list",
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
  assert.deepEqual(body.recordings, { candidates: 0, stored: 0, retry: 0, failed: 0, deferred: 0 });
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
    { candidates: 2, stored: 1, retry: 1, failed: 0, deferred: 0 },
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
  [, body] = await answer(await knock("calls"));
  assert.deepEqual(body.recordings, { candidates: 2, stored: 1, retry: 1, failed: 0, deferred: 0 });
  assert.equal(rec("slow").attempts, 2);
  assert.equal(rec("third").fetch_state, "stored", "the backlog drains");
  neverAskedAboutSpent();

  // Tick three: the third attempt is the last.
  [, body] = await answer(await knock("calls"));
  assert.deepEqual(body.recordings, { candidates: 1, stored: 0, retry: 0, failed: 1, deferred: 0 });
  assert.equal(
    rec("slow").fetch_state,
    "failed",
    "'Recording still processing' is no longer a state a row can stay in for ever",
  );
  assert.equal(rec("slow").attempts, RECORDING_MAX_ATTEMPTS);

  // Tick four: nothing wakes for it.
  const before = net.calls.length;
  [, body] = await answer(await knock("calls"));
  assert.deepEqual(body.recordings, { candidates: 0, stored: 0, retry: 0, failed: 0, deferred: 0 });
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
  assert.deepEqual(body.recordings, { candidates: 2, stored: 0, retry: 1, failed: 1, deferred: 0 });
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
  [, body] = await answer(await knock("calls"));
  assert.deepEqual(
    body.recordings,
    { candidates: 1, stored: 0, retry: 1, failed: 0, deferred: 0 },
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
  assert.deepEqual(body.recordings, { candidates: 2, stored: 0, retry: 1, failed: 1, deferred: 0 });
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

  [, body] = await answer(await knock("calls"));
  assert.deepEqual(
    body.recordings,
    { candidates: 1, stored: 0, retry: 1, failed: 0, deferred: 0 },
    "the failed copy is no longer a candidate",
  );
  assert.equal(rec("fresh").attempts, 2);
});

test("calls: a provider that cannot answer — a 5xx, a rate limit, a read that never returns — spends no try on any row, so an outage never marks a recording failed; the tick stops asking once the provider has said wait, answered a rate limit, or not answered at all; and the sweep still answers 200, because the sweep is not what is broken", async () => {
  const T = tenant(5);
  const tables = {
    calls: [
      // The reconcile leg's row: nobody has heard from it for ten minutes.
      callRow(T, "quiet", { updated_at: ago(10 * MIN) }),
      // Two copies still owed a try, the second on its last: an outage used to spend it.
      pendingCopy(T, "first", 0),
      pendingCopy(T, "last", RECORDING_MAX_ATTEMPTS - 1, { updated_at: ago(9 * MIN) }),
    ],
    messages: [],
    events: [],
  };
  const db = use(tables, { ingest_call: ingestRpc(tables) });
  const rec = (id) => tables.calls.find((c) => c.id === id).recording;
  const asked = (net) => net.calls.map((c) => c.url);
  /** The rows and the writes as they stand, to hold a tick against. */
  const snapshot = () => ({
    rows: structuredClone(tables.calls),
    writes: updatesOf(db, "calls").length,
    ingests: rpcs(db, "ingest_call").length,
  });
  const untouched = (before, net, why) => {
    assert.deepEqual(tables.calls, before.rows, why);
    assert.equal(updatesOf(db, "calls").length, before.writes, "no row written");
    assert.equal(
      rpcs(db, "ingest_call").length,
      before.ingests,
      "nothing re-ingested: an outage is not the provider's word on any call",
    );
    assert.equal(net.to("cdn.retell.test").length, 0, "no copy attempted");
  };

  // A 5xx on every read.
  let before = snapshot();
  let net = wired((req) => {
    if (req.url.startsWith(GET_CALL_URL)) return { status: 503, body: { message: "Service Unavailable" } };
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
  let [status, body] = await answer(await knock("calls"));
  assert.equal(status, 200, JSON.stringify(body));
  assert.deepEqual(
    [body.candidates, body.closed, body.stillLive, body.unknown, body.deferred],
    [1, 0, 0, 0, 1],
    "a call the provider could not answer for is not 'unknown to the provider': it is deferred to the next tick",
  );
  assert.deepEqual(body.recordings, { candidates: 2, stored: 0, retry: 0, failed: 0, deferred: 2 });
  assert.deepEqual(
    asked(net),
    [`${GET_CALL_URL}call_quiet`, `${GET_CALL_URL}call_first`, `${GET_CALL_URL}call_last`],
    "a 5xx that answered may be one row's own, so the next row is still asked",
  );
  assert.equal(
    rpcs(db, "ingest_call").length,
    before.ingests,
    "nothing re-ingested: not the provider's word on any call",
  );
  assert.equal(net.to("cdn.retell.test").length, 0, "no copy attempted");
  assert.equal(tables.calls.find((c) => c.id === "quiet").status, "ongoing", "the call is left as it was");
  // An answered 5xx may be one call's own for ever: the copy rows are written
  // as they are, count unchanged, which in Postgres moves updated_at (00007)
  // and sends them to the back of the queue instead of first every tick.
  assert.deepEqual(rec("first"), { fetch_state: "pending", attempts: 0, error: "provider_503" });
  assert.deepEqual(rec("last"), {
    fetch_state: "pending",
    attempts: RECORDING_MAX_ATTEMPTS - 1,
    error: "provider_503",
  });
  assert.equal(updatesOf(db, "calls").length, before.writes + 2, "written as they are, once each");

  // A rate limit that names its wait.
  before = snapshot();
  net = wired((req) => {
    if (req.url.startsWith(GET_CALL_URL))
      return {
        status: 429,
        body: { message: "Too Many Requests" },
        headers: { "content-type": "application/json", "retry-after": "30" },
      };
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
  [status, body] = await answer(await knock("calls"));
  assert.equal(status, 200, JSON.stringify(body));
  assert.deepEqual(
    [body.deferred, body.recordings],
    [1, { candidates: 2, stored: 0, retry: 0, failed: 0, deferred: 2 }],
  );
  assert.deepEqual(
    asked(net),
    [`${GET_CALL_URL}call_quiet`],
    "the provider said wait: the rest of the tick does not ask",
  );
  untouched(before, net, "a rate limit counts against nothing, and under its hold no row is written");

  // A read that never answers: the wire gives up as the read's own signal would.
  before = snapshot();
  net = wired((req) => {
    if (req.url.startsWith(GET_CALL_URL))
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
  [status, body] = await answer(await knock("calls"));
  assert.equal(status, 200, JSON.stringify(body));
  assert.deepEqual(
    asked(net),
    [`${GET_CALL_URL}call_quiet`],
    "no answer at all: each further ask would cost the whole bound, inside a sixty-second function",
  );
  assert.equal(
    net.calls[0].budgetMs,
    10_000,
    "the adapter's own ten-second bound rides on the read, so a tick cannot hang on the provider",
  );
  assert.deepEqual([body.deferred, body.recordings.deferred], [1, 2]);
  untouched(before, net, "a timeout counts against nothing, and under its hold no row is written");

  // The provider is back: the rows are where the outage found them.
  net = wired(providerUp);
  [status, body] = await answer(await knock("calls"));
  assert.equal(status, 200, JSON.stringify(body));
  assert.deepEqual([body.closed, body.unknown, body.deferred], [1, 0, 0]);
  assert.deepEqual(body.recordings, { candidates: 2, stored: 2, retry: 0, failed: 0, deferred: 0 });
  assert.equal(net.to("cdn.retell.test").length, 2, "both copies were made, on the first tick the provider answered");
  assert.deepEqual(
    [rec("first").fetch_state, rec("first").attempts],
    ["stored", 1],
    "the outage cost the row nothing: this was its first try",
  );
  assert.deepEqual(
    [rec("last").fetch_state, rec("last").attempts],
    ["stored", RECORDING_MAX_ATTEMPTS],
    "and the last try was still there to be spent on a provider that answered",
  );
});

test("calls: a key the provider refuses (401, 403) leaves every row as it was and stops the tick's asking at once, and the sweep answers 503 — the answer sweep_health() reads, so the calls clock is unhealthy and the platform is paged once by the health sweep, never a mail per row from here; the next tick with a working key resumes where it left off", async () => {
  const T = tenant(6);
  const tables = {
    calls: [
      callRow(T, "quiet", { updated_at: ago(10 * MIN) }),
      pendingCopy(T, "first", 0),
      pendingCopy(T, "last", RECORDING_MAX_ATTEMPTS - 1, { updated_at: ago(9 * MIN) }),
    ],
    messages: [],
    events: [],
  };
  const seed = structuredClone(tables.calls);
  const db = use(tables, { ingest_call: ingestRpc(tables) });
  const rec = (id) => tables.calls.find((c) => c.id === id).recording;

  for (const [refused, message] of [
    [401, "Unauthorized"],
    [403, "Forbidden"],
  ]) {
    const net = wired((req) => {
      if (req.url.startsWith(GET_CALL_URL)) return { status: refused, body: { message } };
      throw new Error(`unexpected ${req.method} ${req.url}`);
    });
    const [status, body] = await answer(await knock("calls"));
    assert.equal(status, 503, JSON.stringify(body));
    assert.deepEqual(
      [body.ok, body.error, body.provider_status],
      [false, "provider_unauthorized", refused],
      "the answer names the fault, inside the two hundred characters the health mail quotes",
    );
    assert.deepEqual(
      [body.unknown, body.deferred, body.recordings],
      [0, 1, { candidates: 2, stored: 0, retry: 0, failed: 0, deferred: 2 }],
      "nothing is unknown to the provider, and no try is counted: the provider never looked",
    );
    assert.deepEqual(
      net.calls.map((c) => c.url),
      [`${GET_CALL_URL}call_quiet`],
      "one refusal is the answer for every row: the rest of the tick does not ask",
    );
    assert.deepEqual(
      net.mail(),
      [],
      "the page is the health sweep's, from this answer, once — not this sweep's, per row",
    );
    assert.deepEqual(tables.calls, seed, "a refused key is not the provider's word on any call");
    assert.deepEqual(updatesOf(db, "calls"), []);
    assert.deepEqual(rpcs(db, "ingest_call"), []);
  }

  // The key works again.
  const net = wired(providerUp);
  const [status, body] = await answer(await knock("calls"));
  assert.equal(status, 200, JSON.stringify(body));
  assert.deepEqual([body.closed, body.deferred], [1, 0]);
  assert.deepEqual(body.recordings, { candidates: 2, stored: 2, retry: 0, failed: 0, deferred: 0 });
  assert.equal(rec("last").attempts, RECORDING_MAX_ATTEMPTS, "the last try was kept for a provider that would answer");
  assert.equal(net.to("cdn.retell.test").length, 2, "and both copies were made");
});

test("calls: a recording whose call the provider says it does not have (404) is a try like any other, counted on the row, so it ends as couldn't-be-saved after the third — the provider answered, and that answer will not change", async () => {
  const T = tenant(7);
  const tables = {
    calls: [
      pendingCopy(T, "spent", RECORDING_MAX_ATTEMPTS - 1),
      pendingCopy(T, "fresh", 0, { updated_at: ago(9 * MIN) }),
    ],
    messages: [],
    events: [],
  };
  use(tables, { ingest_call: ingestRpc(tables) });
  const net = wired((req) => {
    if (req.url.startsWith(GET_CALL_URL)) return { status: 404, body: { message: "call not found" } };
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
  const rec = (id) => tables.calls.find((c) => c.id === id).recording;

  let [status, body] = await answer(await knock("calls"));
  assert.equal(status, 200, JSON.stringify(body));
  assert.deepEqual(body.recordings, { candidates: 2, stored: 0, retry: 1, failed: 1, deferred: 0 });
  assert.deepEqual(
    rec("spent"),
    { fetch_state: "failed", attempts: RECORDING_MAX_ATTEMPTS, error: "provider_not_found" },
    "the last try spent on an answer: it reads as couldn't be saved",
  );
  assert.deepEqual(rec("fresh"), { fetch_state: "pending", attempts: 1, error: "provider_not_found" });
  assert.equal(net.to("cdn.retell.test").length, 0, "there was nothing to fetch");

  [, body] = await answer(await knock("calls"));
  assert.deepEqual(
    body.recordings,
    { candidates: 1, stored: 0, retry: 1, failed: 0, deferred: 0 },
    "the failed copy is no longer a candidate; the other is still owed its tries",
  );
  assert.equal(rec("fresh").attempts, 2);
});

test("calls: a copy the recordings CDN cannot serve just now (5xx) or the bucket cannot take (5xx, unreachable) is deferred — the row written as it was, its count unchanged, so the trigger sends it to the back — while a CDN 404 and a bucket 4xx still spend a try", async () => {
  const T = tenant(8);
  const tables = {
    calls: [
      pendingCopy(T, "cdn_down", 1),
      pendingCopy(T, "bucket_down", 1, { updated_at: ago(9 * MIN) }),
      pendingCopy(T, "unpublished", 0, { updated_at: ago(8 * MIN) }),
      pendingCopy(T, "too_big", 0, { updated_at: ago(7 * MIN) }),
    ],
    messages: [],
    events: [],
  };
  const db = use(tables, { ingest_call: ingestRpc(tables) });
  // The bucket: down for one recording, refusing another for its size, taking the rest.
  const realFrom = db.storage.from;
  const storageAnswer = {
    [`${T}/calls/bucket_down.wav`]: { message: "Service Unavailable", status: 503, statusCode: "503" },
    [`${T}/calls/too_big.wav`]: {
      message: "The object exceeded the maximum allowed size",
      status: 413,
      statusCode: "413",
    },
  };
  db.storage.from = (name) => {
    const real = realFrom(name);
    return {
      ...real,
      upload: async (p, bytes, opts) =>
        storageAnswer[p] ? { data: null, error: storageAnswer[p] } : real.upload(p, bytes, opts),
    };
  };
  wired((req) => {
    if (req.url.startsWith(GET_CALL_URL)) {
      const id = req.url.slice(GET_CALL_URL.length);
      return {
        status: 200,
        body: { call_id: id, call_status: "ended", recording_url: `https://cdn.retell.test/${id}.wav` },
      };
    }
    if (req.url === "https://cdn.retell.test/call_cdn_down.wav")
      return new Response("Service Unavailable", { status: 503 });
    if (req.url === "https://cdn.retell.test/call_unpublished.wav") return new Response("Not Found", { status: 404 });
    if (req.url.startsWith("https://cdn.retell.test/"))
      return new Response(new Uint8Array([82, 73, 70, 70]), { status: 200, headers: { "content-type": "audio/wav" } });
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
  const rec = (id) => tables.calls.find((c) => c.id === id).recording;
  const writesTo = (id) =>
    updatesOf(db, "calls").filter((u) => u.filters.some((f) => f[1] === "id" && f[2] === id)).length;

  // Tick one: the two oldest, both deferred.
  let [status, body] = await answer(await knock("calls"));
  assert.equal(status, 200, JSON.stringify(body));
  assert.deepEqual(body.recordings, { candidates: 2, stored: 0, retry: 0, failed: 0, deferred: 2 });
  assert.deepEqual(
    rec("cdn_down"),
    { fetch_state: "pending", attempts: 1, error: "provider_503" },
    "the CDN's 5xx is not its word on the file: no try spent",
  );
  assert.deepEqual(
    rec("bucket_down"),
    { fetch_state: "pending", attempts: 1, error: "storage_503" },
    "nor is the bucket being down",
  );
  assert.deepEqual(
    [writesTo("cdn_down"), writesTo("bucket_down")],
    [1, 1],
    "each written as it was: the write is what moves updated_at (00007) and the row to the back",
  );

  // The double has no updated_at trigger; the stamps move here as 00007's
  // would for the rows the sweep wrote, so the next tick reaches the two behind.
  for (const id of ["cdn_down", "bucket_down"]) tables.calls.find((c) => c.id === id).updated_at = iso(NOW);

  // Tick two: the CDN's word and the bucket's refusal both count.
  [status, body] = await answer(await knock("calls"));
  assert.equal(status, 200, JSON.stringify(body));
  assert.deepEqual(body.recordings, { candidates: 2, stored: 0, retry: 2, failed: 0, deferred: 0 });
  assert.deepEqual(
    rec("unpublished"),
    { fetch_state: "pending", attempts: 1, error: "provider_404" },
    "not published yet is the CDN's word: a try, within the bound",
  );
  assert.deepEqual(
    rec("too_big"),
    { fetch_state: "pending", attempts: 1, error: "storage_413" },
    "a bucket refusing THIS file is a try like any other, so it ends failed instead of returning for ever",
  );
});

test("calls: a call the provider answers 500 on every time is written with its count unchanged, so it goes to the back of the queue instead of standing first every tick and starving the rest", async () => {
  const T = tenant(9);
  const tables = {
    calls: [
      pendingCopy(T, "cursed", 0),
      pendingCopy(T, "second", 0, { updated_at: ago(9 * MIN) }),
      pendingCopy(T, "third", 0, { updated_at: ago(8 * MIN) }),
    ],
    messages: [],
    events: [],
  };
  use(tables, { ingest_call: ingestRpc(tables) });
  const cursedLine = (req) =>
    req.url === `${GET_CALL_URL}call_cursed`
      ? { status: 500, body: { message: "Internal Server Error" } }
      : providerUp(req);
  const rec = (id) => tables.calls.find((c) => c.id === id).recording;

  let net = wired(cursedLine);
  let [status, body] = await answer(await knock("calls"));
  assert.equal(status, 200, JSON.stringify(body));
  assert.deepEqual(body.recordings, { candidates: 2, stored: 1, retry: 0, failed: 0, deferred: 1 });
  assert.deepEqual(
    net.calls.map((c) => c.url),
    [`${GET_CALL_URL}call_cursed`, `${GET_CALL_URL}call_second`, "https://cdn.retell.test/call_second.wav"],
    "first in line, answered 500; the next row is still asked",
  );
  assert.deepEqual(
    rec("cursed"),
    { fetch_state: "pending", attempts: 0, error: "provider_500" },
    "written as it was: no try spent, and the write moves updated_at (00007)",
  );
  assert.equal(rec("second").fetch_state, "stored");

  // The double has no updated_at trigger; the stamp moves here as 00007's
  // would -- kept past the settle window for the test's sake, and behind the
  // row still waiting.
  tables.calls.find((c) => c.id === "cursed").updated_at = ago(6 * MIN);

  net = wired(cursedLine);
  [status, body] = await answer(await knock("calls"));
  assert.equal(status, 200, JSON.stringify(body));
  assert.deepEqual(
    net.calls.map((c) => c.url),
    [`${GET_CALL_URL}call_third`, "https://cdn.retell.test/call_third.wav", `${GET_CALL_URL}call_cursed`],
    "the cursed call no longer holds the first slot: the row behind it is served first",
  );
  assert.deepEqual(body.recordings, { candidates: 2, stored: 1, retry: 0, failed: 0, deferred: 1 });
  assert.deepEqual(
    rec("cursed"),
    { fetch_state: "pending", attempts: 0, error: "provider_500" },
    "and still no try spent",
  );
});

test("calls: an outage holds a copy for two days at most — past RECORDING_DEFER_LIMIT_MS since the call ended, a provider 5xx on the row and a CDN 5xx each spend a try, so a file that can never be fetched ends couldn't-be-saved instead of processing for ever; a provider-wide hold still touches nothing", async () => {
  const T = tenant(10);
  const old = ago(RECORDING_DEFER_LIMIT_MS + HOUR);
  const tables = {
    calls: [
      pendingCopy(T, "cursed", 1, { ended_at: old }),
      pendingCopy(T, "cdn_down", 2, { ended_at: old, updated_at: ago(9 * MIN) }),
      pendingCopy(T, "fresh", 0, { updated_at: ago(8 * MIN) }),
    ],
    messages: [],
    events: [],
  };
  use(tables, { ingest_call: ingestRpc(tables) });
  const rec = (id) => tables.calls.find((c) => c.id === id).recording;
  wired((req) => {
    if (req.url === `${GET_CALL_URL}call_cursed`) return { status: 500, body: { message: "Internal Server Error" } };
    if (req.url === "https://cdn.retell.test/call_cdn_down.wav") return new Response("Bad Gateway", { status: 502 });
    return providerUp(req);
  });
  let [status, body] = await answer(await knock("calls"));
  assert.equal(status, 200, JSON.stringify(body));
  assert.deepEqual(body.recordings, { candidates: 2, stored: 0, retry: 1, failed: 1, deferred: 0 });
  assert.deepEqual(
    rec("cursed"),
    { fetch_state: "pending", attempts: 2, error: "provider_500" },
    "two days on, the provider's 500 on this call is a try",
  );
  assert.deepEqual(
    rec("cdn_down"),
    { fetch_state: "failed", attempts: 3, error: "provider_502" },
    "and a CDN that has not served the file for two days ends it at the third",
  );

  // Inside the two days nothing changed: an outage is still no try.
  for (const id of ["cursed", "cdn_down"]) tables.calls.find((c) => c.id === id).updated_at = iso(NOW);
  wired((req) =>
    req.url === `${GET_CALL_URL}call_fresh`
      ? { status: 503, body: { message: "Service Unavailable" } }
      : providerUp(req),
  );
  [status, body] = await answer(await knock("calls"));
  assert.equal(status, 200, JSON.stringify(body));
  assert.deepEqual(rec("fresh"), { fetch_state: "pending", attempts: 0, error: "provider_503" });

  // A hold (a rate limit) touches no row, however old: the provider is down for everyone, not for this file.
  tables.calls.find((c) => c.id === "cursed").updated_at = ago(10 * MIN);
  tables.calls.find((c) => c.id === "fresh").updated_at = ago(11 * MIN);
  wired(() => ({ status: 429, body: { message: "Too Many Requests" } }));
  [status, body] = await answer(await knock("calls"));
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(rec("cursed").attempts, 2, "a rate limit spends nothing");
});

test("calls: the copy step itself — a CDN connection that fails and a bucket that answers with no status are deferred with the count unchanged, an upload that never answers is the copy's own bound and counts, and once deferrals spend a deferral is a try", async () => {
  const T = tenant(11);
  const tables = { calls: [pendingCopy(T, "c1", 1)], messages: [], events: [] };
  const db = use(tables);
  const rec = () => tables.calls[0].recording;
  const copy = (over = {}) =>
    copyRecording(db, {
      tenantId: T,
      callId: "c1",
      providerUrl: "https://cdn.retell.test/call_c1.wav",
      attempts: rec().attempts,
      timeoutMs: 50,
      ...over,
    });
  const wav = () =>
    new Response(new Uint8Array([82, 73, 70, 70]), { status: 200, headers: { "content-type": "audio/wav" } });
  const realUpload = db.storage.from("media").upload;
  const bucketAnswers = (upload) => {
    db.storage.from = () => ({ upload, remove: async () => ({ data: [], error: null }) });
  };

  // The CDN's connection is refused: no answer, nobody's word on the file.
  wired(() => {
    throw new TypeError("fetch failed");
  });
  assert.equal(await copy(), "deferred");
  assert.deepEqual(rec(), { fetch_state: "pending", attempts: 1, error: "fetch failed" });

  // The bucket answers with an error that carries no status: unreachable, not a refusal of the file.
  wired(wav);
  bucketAnswers(async () => ({ data: null, error: { message: "socket hang up" } }));
  assert.equal(await copy(), "deferred");
  assert.deepEqual(rec(), { fetch_state: "pending", attempts: 1, error: "storage_unreachable" });

  // An upload that never answers is the copy's own bound running out: counted, as the CDN's timeout is.
  bucketAnswers(() => new Promise(() => {}));
  assert.equal(await copy(), "retry");
  assert.equal(rec().attempts, 2);
  assert.equal(rec().error, "storage upload timed out after 50 ms");

  // Past the limit, the same unreachable bucket spends the last try.
  bucketAnswers(async () => ({ data: null, error: { message: "socket hang up" } }));
  assert.equal(await copy({ deferralsSpend: true }), "failed");
  assert.deepEqual(rec(), { fetch_state: "failed", attempts: 3, error: "storage_unreachable" });
  bucketAnswers(realUpload);
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
  const net = unanalysed();
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
  assert.deepEqual(
    net.calls.map((c) => c.url),
    ["https://api.retellai.com/v2/get-call/call_errored", "https://api.retellai.com/v2/get-call/call_unnoted"],
    "no ongoing call and no pending copy; the provider is asked only after the two its owner was never told of, ended past the webhook's ten minutes and inside the two hours, the longest-waiting first (R11 S11-3)",
  );
  assert.deepEqual(
    body.settles,
    { candidates: 2, settled: 0, notYet: 2, unroutable: 0, deferred: 0 },
    "it has analysed neither yet, so neither is settled, and the note leg still writes their lines",
  );

  // The tick after: every call with a thread has its line, and none is written twice.
  const [s3, b3] = await answer(await knock("calls"));
  assert.equal(s3, 200);
  assert.deepEqual(b3.notes, { candidates: 0, written: 0 }, "the sweep reads the link on the row, not the thread");
  assert.equal(tables.messages.length, 2);
  assert.equal(net.calls.length, 4, "and asked again: still inside the two hours, still unanalysed");
});
