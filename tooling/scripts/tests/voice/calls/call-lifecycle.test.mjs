/**
 * A call's lifecycle, as the dashboard will show it.
 *
 * Retell delivers webhook events in order but not blocking, retries a non-2xx
 * up to three times, and names five statuses. These pin what we do with that:
 *
 *   - `not_connected` is its own status, rendered "never connected" and kept
 *     out of every call count;
 *   - a live `transcript_updated` payload becomes the stored turn shape, with
 *     the tool-call items dropped;
 *   - the recording copy is bounded, and a timeout is distinguishable from a
 *     provider refusal;
 *   - a call read tells the provider's answers apart -- found, not found, a
 *     refused key, unavailable with the wait it named -- and is bounded, so
 *     the sweep that reads it can leave a row alone during an outage instead
 *     of counting the outage against it;
 *   - the SQL upsert is forward-only, and the webhook, sweep and diagnostic
 *     carry their halves of the rule (pinned by source, executed against the
 *     live schema in calls.integration.test.mjs).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { normalizeCall, liveTurns, fetchRecording, getCall } from "@chanlytics/channels";
import { toCallVM, toTodayVM, CALL_HEARTBEAT_MS } from "@chanlytics/contracts";
import { readRaw, importSrc } from "../../_source.mjs";

// The workspace's zone: every view model says its times by it (contracts clock.ts).
const ZONE = "America/New_York";

const NOW = new Date("2026-09-04T15:00:00.000Z");
const agoIso = (ms) => new Date(NOW.getTime() - ms).toISOString();

/* ------------------------------- the adapter ------------------------------ */

test("Retell's not_connected is its own status, not 'ended'", () => {
  const n = normalizeCall({ call_id: "c1", call_status: "not_connected", from_number: "+13475550101" });
  assert.equal(n.status, "not_connected");
  // The other four are unchanged, and an unknown value still defaults to ended.
  for (const [given, want] of [
    ["registered", "registered"],
    ["ongoing", "ongoing"],
    ["error", "error"],
    ["ended", "ended"],
    [undefined, "ended"],
    ["something_new", "ended"],
  ]) {
    assert.equal(normalizeCall({ call_id: "c", call_status: given }).status, want, String(given));
  }
});

test("a live transcript keeps the spoken turns and drops the tool calls", () => {
  const items = [
    { role: "agent", content: "Marisa's, this is the booking line." },
    { role: "tool_call_invocation", content: "", tool_call_id: "t1", name: "check_availability" },
    { role: "tool_call_result", content: "{}", tool_call_id: "t1" },
    { role: "user", content: "Do you have Saturday?", words: [{ word: "Do", start: 3.1, end: 3.3 }] },
  ];
  assert.deepEqual(liveTurns(items), [
    { role: "agent", content: "Marisa's, this is the booking line." },
    { role: "user", content: "Do you have Saturday?", words: [{ word: "Do", start: 3.1, end: 3.3 }] },
  ]);
  assert.equal(liveTurns([]), null);
  assert.equal(liveTurns(undefined), null);
  assert.equal(
    liveTurns([{ role: "tool_call_invocation", content: "" }]),
    null,
    "nothing spoken yet is null, so the upsert keeps the row's own",
  );
});

test("the final transcript_object outranks the live turns when both are present", () => {
  const n = normalizeCall({
    call_id: "c1",
    call_status: "ended",
    transcript_object: [{ role: "agent", content: "final" }],
    transcript_with_tool_calls: [{ role: "agent", content: "partial" }],
  });
  assert.deepEqual(n.transcriptObject, [{ role: "agent", content: "final" }]);
  const live = normalizeCall({
    call_id: "c2",
    call_status: "ongoing",
    transcript_with_tool_calls: [{ role: "user", content: "hi" }],
  });
  assert.deepEqual(live.transcriptObject, [{ role: "user", content: "hi" }]);
});

test("the recording fetch is bounded: a stalled provider rejects, a refusal returns null", async () => {
  const server = http.createServer((req, res) => {
    if (req.url === "/refuse") {
      res.statusCode = 404;
      res.end("no");
      return;
    }
    // /stall: never answer
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  try {
    await assert.rejects(
      fetchRecording(`http://127.0.0.1:${port}/stall`, { timeoutMs: 80 }),
      (e) => e.name === "TimeoutError",
    );
    assert.deepEqual(await fetchRecording(`http://127.0.0.1:${port}/refuse`, { timeoutMs: 2000 }), {
      ok: false,
      status: 404,
    });
  } finally {
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
  }
});

test("a call read tells the provider's answers apart — found, not found, a refused key, unavailable with the wait it named — never throws, and a read that never answers is unavailable inside its bound, ten seconds by default", async () => {
  // The wire: one answer per call id, in the shapes the live account sends.
  // A signal never says how long it was given, so the static is wrapped and
  // each signal remembers its budget.
  const realFetch = globalThis.fetch;
  const realTimeout = AbortSignal.timeout;
  const budgets = new WeakMap();
  AbortSignal.timeout = (ms) => {
    const s = realTimeout.call(AbortSignal, ms);
    budgets.set(s, ms);
    return s;
  };
  const found = {
    call_id: "call_found",
    agent_id: "agent_x",
    call_type: "phone_call",
    direction: "inbound",
    from_number: "+16465550123",
    to_number: "+13055550100",
    call_status: "ended",
    recording_url: "https://cdn.retell.test/call_found.wav",
  };
  const soon = new Date(Date.now() + 90_000).toUTCString();
  const html = { "content-type": "text/html" };
  const answers = {
    call_found: () => Response.json(found),
    call_gone: () => Response.json({ message: "call not found" }, { status: 404 }),
    call_rejected: () => Response.json({ message: "invalid request" }, { status: 422 }),
    call_unauthorized: () => Response.json({ message: "Unauthorized" }, { status: 401 }),
    call_forbidden: () => Response.json({ message: "Forbidden" }, { status: 403 }),
    call_limited: () =>
      Response.json({ message: "Too Many Requests" }, { status: 429, headers: { "retry-after": "30" } }),
    call_limited_until: () =>
      Response.json({ message: "Too Many Requests" }, { status: 429, headers: { "retry-after": soon } }),
    call_down: () => new Response("<html>502 Bad Gateway</html>", { status: 502, headers: html }),
    call_broken: () => new Response("<html>ok</html>", { status: 200, headers: html }),
    call_unreachable: () => {
      throw new TypeError("fetch failed");
    },
    // Answers only when the signal it was given gives up. The fallback timer
    // is armed either way: a signal's own timer is unref'd and would let the
    // process end mid-read, and a read that rode with no signal at all is an
    // unbounded wait, reported rather than waited for.
    call_stalled: (init) =>
      new Promise((_, reject) => {
        const unbounded = setTimeout(() => reject(new Error("the read was not bounded: no signal rode with it")), 1000);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(unbounded);
          reject(init.signal.reason);
        });
      }),
  };
  const asked = [];
  globalThis.fetch = async (url, init) => {
    const id = String(url).split("/").pop();
    asked.push({ url: String(url), auth: init?.headers?.Authorization, budgetMs: budgets.get(init?.signal) ?? null });
    return answers[id](init);
  };
  const cfg = { apiKey: "retell-key-for-this-test" };
  try {
    assert.deepEqual(await getCall(cfg, "call_found"), { kind: "found", call: found });
    assert.deepEqual(
      asked,
      [
        {
          url: "https://api.retellai.com/v2/get-call/call_found",
          auth: "Bearer retell-key-for-this-test",
          budgetMs: 10_000,
        },
      ],
      "asked as this deployment, bounded at ten seconds unless the caller says otherwise",
    );
    assert.deepEqual(await getCall(cfg, "call_gone"), { kind: "not_found", status: 404 });
    assert.deepEqual(
      await getCall(cfg, "call_rejected"),
      { kind: "not_found", status: 422 },
      "any other refusal of the request is the same answer: asking again will not change it",
    );
    assert.deepEqual(await getCall(cfg, "call_unauthorized"), { kind: "auth", status: 401 });
    assert.deepEqual(await getCall(cfg, "call_forbidden"), { kind: "auth", status: 403 });
    assert.deepEqual(await getCall(cfg, "call_limited"), { kind: "unavailable", status: 429, retryAfterMs: 30_000 });
    const until = await getCall(cfg, "call_limited_until");
    assert.equal(until.kind, "unavailable");
    assert.ok(
      until.retryAfterMs > 80_000 && until.retryAfterMs <= 90_000,
      `an HTTP-date Retry-After is the wait from now: ${until.retryAfterMs}`,
    );
    assert.deepEqual(await getCall(cfg, "call_down"), { kind: "unavailable", status: 502, retryAfterMs: null });
    assert.deepEqual(
      await getCall(cfg, "call_broken"),
      { kind: "unavailable", status: 200, retryAfterMs: null },
      "a 200 that is not a call is not a call: a proxy's page, not the provider's word",
    );
    assert.deepEqual(
      await getCall(cfg, "call_unreachable"),
      { kind: "unavailable", status: null, retryAfterMs: null },
      "no answer at all is not a refusal",
    );
    assert.deepEqual(
      await getCall(cfg, "call_stalled", { timeoutMs: 50 }),
      { kind: "unavailable", status: null, retryAfterMs: null },
      "a read that never answers is given up on inside its bound, not waited for",
    );
    assert.equal(asked.at(-1).budgetMs, 50, "the caller's bound rode with the read");
  } finally {
    globalThis.fetch = realFetch;
    AbortSignal.timeout = realTimeout;
  }
});

/* ------------------------------ the viewmodel ----------------------------- */

const base = {
  id: "k1",
  retell_call_id: "r1",
  direction: "inbound",
  call_type: "phone_call",
  from_e164: "+13475550101",
  from_raw: null,
  to_e164: "+13055550123",
  started_at: agoIso(120_000),
  ended_at: null,
  duration_ms: null,
  disconnection_reason: null,
  sentiment: null,
  call_successful: null,
  in_voicemail: null,
  summary: null,
  transcript_object: null,
  recording: null,
  conversation_id: null,
  contact_id: null,
  message_id: null,
  contact: null,
};

test("a dial that never connected is 'missed', says so, and claims no recording state", () => {
  const vm = toCallVM({ ...base, status: "not_connected", disconnection_reason: "dial_failed" }, ZONE, NOW);
  assert.equal(vm.outcome, "missed");
  assert.ok(!vm.live);
  assert.match(vm.snippet, /never connected/);
  assert.equal(vm.summary.bullets[0], "Inbound · never connected");
  assert.ok(!vm.summary.bullets.some((b) => /Recording/.test(b)), "no recording line for a call that never happened");
});

test("a recording the copy gave up on is 'failed', not 'still processing' forever", () => {
  const vm = toCallVM(
    { ...base, status: "ended", duration_ms: 65_000, recording: { fetch_state: "failed" } },
    ZONE,
    NOW,
  );
  assert.equal(vm.recordingState, "failed");
  assert.ok(vm.summary.bullets.some((b) => /couldn't be saved/.test(b)));
  assert.equal(vm.recordingUrl, undefined);
  assert.equal(
    toCallVM({ ...base, status: "ended", recording: { fetch_state: "pending" } }, ZONE, NOW).recordingState,
    "pending",
  );
});

test("a live call carries its start as `ts`, which is what the viewer's clock runs from", () => {
  const vm = toCallVM({ ...base, status: "ongoing", updated_at: agoIso(5_000) }, ZONE, NOW);
  assert.equal(vm.live, true);
  assert.equal(vm.ts, NOW.getTime() - 120_000);
  assert.equal(vm.duration, undefined, "no invented duration while the call is up");
});

/* ------------------------------ Today's rows ------------------------------ */

const metrics = (over = {}) => ({
  workspace: { name: "Marisa's Beauty Salon", timezone: "America/New_York", status: "active" },
  channels: [{ kind: "voice", status: "active", number: "+13055550123" }],
  window: {
    days: 1,
    since: "2026-09-04T04:00:00+00:00",
    since_local: "2026-09-04T00:00:00",
    now_local: "2026-09-04T11:00:00",
  },
  now: {
    escalations_open: 0,
    oldest_open_escalation_at: null,
    threads_needing_human: 0,
    threads_snoozed: 0,
    threads_awaiting_reply: 0,
    last_inbound_at: null,
    last_outbound_at: null,
  },
  period: {
    messages_in: 0,
    messages_out_ai: 0,
    messages_out_you: 0,
    conversations_active: 0,
    answered_by_ai: 0,
    answered_by_you: 0,
    unanswered_in_window: 0,
    median_reply_seconds_ai: null,
    send_failures: 0,
    escalations_new: 0,
    escalation_reasons: {},
    calls: 1,
    call_seconds: 0,
    call_sentiments: {},
    calls_voicemail: 0,
    new_contacts: 0,
    ...over,
  },
});

test("Today: a call in progress is a row that says so and opens Live — never 'no summary'", () => {
  const live = { ...base, status: "ongoing", updated_at: agoIso(3_000) };
  const vm = toTodayVM(metrics(), [], [], [live], NOW);
  assert.equal(vm.calls.rows.length, 1);
  assert.equal(vm.calls.rows[0].note, "In progress right now");
  assert.equal(vm.calls.rows[0].to, "live");
});

test("Today: a call that just ended waits for its summary instead of reporting none", () => {
  const justEnded = { ...base, status: "ended", ended_at: agoIso(60_000), duration_ms: 60_000 };
  const vm = toTodayVM(metrics(), [], [], [justEnded], NOW);
  assert.equal(vm.calls.rows[0].note, "Summary on its way from the voice provider");
  const longAgo = { ...base, status: "ended", ended_at: agoIso(CALL_HEARTBEAT_MS * 2), duration_ms: 60_000 };
  assert.equal(toTodayVM(metrics(), [], [], [longAgo], NOW).calls.rows[0].note, "No summary from the voice provider");
});

test("Today: a dial that never connected is not a call worth an ear", () => {
  const missed = { ...base, status: "not_connected" };
  const vm = toTodayVM(metrics(), [], [], [missed], NOW);
  assert.deepEqual(vm.calls.rows, []);
});

/* --------------------------- the halves, by source ------------------------ */

test("the upsert is forward-only and tells the caller when it declined", () => {
  const sql = readRaw("supabase/migrations/00031_call_lifecycle.sql");
  assert.ok(sql.includes("where public.call_status_rank(excluded.status) >= public.call_status_rank(calls.status)"));
  assert.ok(sql.includes("'skipped', true"));
  assert.ok(sql.includes("check (status in ('registered', 'ongoing', 'ended', 'error', 'not_connected'))"));
  // Usage is metered when the duration first becomes known, not only on insert.
  assert.ok(sql.includes("and (not v_had_row or v_prev_duration is null)"));
  // The three readers of call counts all exclude the dial that never connected.
  assert.equal((sql.match(/<> 'not_connected'/g) ?? []).length, 5, "metrics (2), people (1), reports (2)");
});

test("a copy given up on stops waking the edge, and the copy's own bound agrees", async () => {
  // The sweep's half -- pending copies retried on its own budget, the count
  // advanced on a timeout, the third attempt the last -- runs in
  // cron-doors-b.test.mjs. This holds the trigger and the library to one number.
  const sql = readRaw("supabase/migrations/00031_call_lifecycle.sql");
  assert.ok(sql.includes("coalesce((recording->>'attempts')::int, 0) < 3"), "a copy given up on stops waking the edge");
  const { RECORDING_MAX_ATTEMPTS } = await importSrc("apps/edge/lib/voice/call-recording.ts");
  assert.equal(RECORDING_MAX_ATTEMPTS, 3, "the copy gives up at the trigger's own number");
});

test("the Conversations viewer runs a real live call's clock from its start, and no longer offers to 'listen in'", () => {
  const src = readRaw("apps/dashboard/src/legacy/pages/conversations.jsx");
  assert.ok(src.includes("Math.floor((Date.now() - c.ts) / 1000)"));
  assert.ok(!src.includes("Listen in"), "there is no audio to listen to; the button opens Live");
  assert.ok(src.includes('outcome === "missed"'));
});
