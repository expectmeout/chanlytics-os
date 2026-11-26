/**
 * The lines door: the knock, status and search, buy, retry and release, and the record.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { LINE_COSTS, twilioUrls } from "@chanlytics/channels/lines";
import { whyCannotSpend, PROVISIONING_DEADLINE_MS } from "@chanlytics/contracts";
import { withoutRequestId } from "../../_log-lines.mjs";
import {
  A,
  B,
  B_LINE,
  FORM,
  LINE,
  NUMBER,
  RECORD,
  SECOND,
  SUB_AUTH,
  TWILIO,
  VAULT,
  answer,
  billing,
  filed,
  knock,
  lineRow,
  rehearsal,
  rejected,
  setPg,
  token,
  unfiled,
  unreachable,
  use,
  wire,
  withEnv,
  world,
  writes,
} from "./_door.mjs";

/* -------------------------------- the door -------------------------------- */

test("the door: a token for another door, a forgery and a bad token beside the right key all get 403 — no falling back; without the secret the key decides", async () => {
  const db = use(world());
  const other = await knock({ op: "status" }, { "x-edge-token": token({ aud: "/api/admin/whisper" }) });
  assert.deepEqual(
    await answer(other),
    [403, { ok: false, error: "token_audience" }],
    "a token for another door opens nothing here",
  );
  const forged = await knock({ op: "status" }, { "x-edge-token": token({ secret: "not-the-secret" }) });
  assert.deepEqual(await answer(forged), [403, { ok: false, error: "token_signature" }]);
  const nobody = await knock({ op: "status" }, {});
  assert.deepEqual(await answer(nobody), [403, { ok: false }]);

  const minted = token();
  await withEnv({ DIAG_KEY: "diag-key-for-this-file" }, async () => {
    // The right key beside a bad token: the token decides, and it says no.
    const both = await knock({ op: "status" }, { "x-edge-token": "garbage", "x-diag-key": "diag-key-for-this-file" });
    assert.deepEqual(
      await answer(both),
      [403, { ok: false, error: "token_malformed" }],
      "there is no falling back from a bad token to the key",
    );
    // The right key alone, on an edge that could have verified a token: this door is the dashboard's, and the key
    // opens it no longer (admin-auth.ts logs the knock as admin_door_key_only).
    const keyOnly = await knock({ op: "status" }, { "x-diag-key": "diag-key-for-this-file" });
    assert.deepEqual(
      await answer(keyOnly),
      [403, { ok: false, error: "token_required" }],
      "the key alone opens no door a token reaches",
    );
    await withEnv({ EDGE_CALL_SECRET: undefined }, async () => {
      // Before the edge has the secret, a token is ignored and the key decides
      // -- so the dashboard may be given the secret before or after the edge.
      const keyed = await knock({ op: "status" }, { "x-diag-key": "diag-key-for-this-file" });
      assert.equal(keyed.status, 200);
      const early = await knock({ op: "status" }, { "x-edge-token": minted, "x-diag-key": "diag-key-for-this-file" });
      assert.equal(early.status, 200, "a token ahead of the secret is not held against the caller");
      const wrong = await knock(
        { op: "status" },
        { "x-edge-token": minted, "x-diag-key": "diag-key-for-this-file-but-longer" },
      );
      assert.deepEqual(
        await answer(wrong),
        [403, { ok: false }],
        "and a token ahead of the secret opens nothing on its own",
      );
    });
  });
  assert.equal(db.seen.length, 0, "nothing was read for any of it: the door refuses before the database");
});

test("the workspace: a token naming one refuses a body naming another; the token's own is acted on with or without a body; a key-holder's body is believed", async () => {
  // B's line has a number of its own: both are retried below, a retry moves a row to provisioning, and one number is
  // live once (lines_e164_live_idx) -- the database would not hold the second take on a shared one.
  const tables = world({
    lines: [
      lineRow({ voice_state: "failed", step: "import" }),
      lineRow({ id: B_LINE, tenant_id: B, voice_state: "failed", step: "trunk", e164: "+13055550101" }),
    ],
  });
  const db = use(tables);
  const crossed = await knock({ op: "retry", tenant_id: B, line_id: B_LINE });
  assert.deepEqual(await answer(crossed), [403, { ok: false, error: "workspace_mismatch" }]);
  assert.equal(db.seen.length, 0, "refused before anything is read");

  // A token about A reaches A's rows and nobody else's, whether or not the body says so.
  const theirs = await knock({ op: "retry", line_id: B_LINE });
  assert.deepEqual(
    await answer(theirs),
    [404, { ok: false, error: "not_found", detail: "no such line" }],
    "B's line does not exist as far as A can see",
  );
  assert.equal(tables.lines[1].voice_state, "failed", "and it was not touched");
  const named = await knock({ op: "retry", tenant_id: A, line_id: LINE, by: "owner" });
  assert.equal(named.status, 202, "the body naming the token's own workspace is fine");
  assert.deepEqual(
    tables.jobs.map((j) => [j.tenant_id, j.payload.line_id]),
    [[A, LINE]],
  );

  // A key holder is about no workspace, so the body's is believed -- which is
  // exactly why the spend rule below is asked on this side of the wire.
  await withEnv({ EDGE_CALL_SECRET: undefined, DIAG_KEY: "diag-key-for-this-file" }, async () => {
    const support = await knock(
      { op: "retry", tenant_id: B, line_id: B_LINE },
      { "x-diag-key": "diag-key-for-this-file" },
    );
    assert.equal(support.status, 202);
    assert.deepEqual(
      withoutRequestId(tables.jobs.at(-1).payload),
      { line_id: B_LINE, by: "support" },
      "unnamed, a retry came from somebody holding the key",
    );
    const nowhere = await knock({ op: "retry", line_id: B_LINE }, { "x-diag-key": "diag-key-for-this-file" });
    assert.deepEqual(await answer(nowhere), [
      400,
      { ok: false, error: "bad_tenant", detail: "tenant_id (a workspace id) is required" },
    ]);
    const nonsense = await knock(
      { op: "retry", tenant_id: "not-a-workspace", line_id: B_LINE },
      { "x-diag-key": "diag-key-for-this-file" },
    );
    assert.equal(nonsense.status, 400);
  });
  // A token about a workspace that does not exist.
  const ghost = await knock(
    { op: "retry", line_id: LINE },
    { "x-edge-token": token({ workspace: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }) },
  );
  assert.deepEqual(await answer(ghost), [404, { ok: false, error: "not_found", detail: "no such workspace" }]);
});

test("the writing ops need the receptionist's provider and a database; status and search need neither; an unknown op is named back", async () => {
  const db = use(world());
  await withEnv({ RETELL_API_KEY: undefined }, async () => {
    assert.deepEqual(await answer(await knock({ op: "buy", number: NUMBER })), [
      503,
      { ok: false, error: "no_provider_key" },
    ]);
    assert.equal((await knock({ op: "status" })).status, 200);
    assert.equal((await knock({ op: "search", area_code: 305 })).status, 200);
  });
  await withEnv({ RETELL_FN_SECRET: undefined }, async () => {
    assert.deepEqual(await answer(await knock({ op: "buy", number: NUMBER })), [
      503,
      { ok: false, error: "no_fn_secret" },
    ]);
  });
  setPg(null);
  assert.deepEqual(await answer(await knock({ op: "buy", number: NUMBER })), [
    503,
    { ok: false, error: "no_database" },
  ]);
  setPg(db);
  assert.equal(db.seen.length, 0);
  const unknown = await knock({ op: "dance" });
  assert.equal(unknown.status, 400);
  const said = await unknown.json();
  assert.equal(said.error, "unknown_op");
  assert.match(
    said.detail,
    /^op must be status, search, buy, retry, release, record, register or registration-status$/,
  );
  const noOp = await knock({});
  assert.equal(noOp.status, 400);
});

/* ----------------------------- status and search -------------------------- */

test("status says whether this deployment can get lines and with which provider; without one the writing ops say what to set", async () => {
  const db = use(world());
  assert.deepEqual(await answer(await knock({ op: "status" })), [
    200,
    { ok: true, ready: true, provider: "dry", costs: LINE_COSTS },
  ]);
  await withEnv({ LINES_DRY_RUN: undefined }, async () => {
    assert.deepEqual(
      await answer(await knock({ op: "status" })),
      [200, { ok: true, ready: false, provider: null, costs: LINE_COSTS }],
      "nothing to fake with and no credentials: Setup keeps 'we set it up with you'",
    );
    const [status, body] = await answer(await knock({ op: "buy", number: NUMBER }));
    assert.equal(status, 503);
    assert.equal(body.error, "no_line_provider");
    assert.match(body.hint, /TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN, or LINES_DRY_RUN=1 outside production/);
  });
  await withEnv({ VERCEL_ENV: "production" }, async () => {
    assert.equal((await (await knock({ op: "status" })).json()).provider, null, "production never fakes a line");
  });
  await withEnv(TWILIO, async () => {
    assert.equal(
      (await (await knock({ op: "status" })).json()).provider,
      "twilio",
      "real credentials win, and asking costs no request",
    );
  });
  assert.equal(db.seen.length, 0, "status reads nothing");
});

test("search validates the area code and answers local numbers with the monthly cost, reading no database", async () => {
  const db = use(world());
  const net = unreachable("the dry provider never reaches the network");
  try {
    for (const bad of [{}, { area_code: "30" }, { area_code: 1305 }, { area_code: "abc" }, { area_code: 199 }]) {
      const [status, body] = await answer(await knock({ op: "search", ...bad }));
      assert.equal(status, 400, JSON.stringify(bad));
      assert.deepEqual([body.error, body.detail], ["bad_request", "area_code must be three digits, like 305"]);
    }
    const [status, body] = await answer(await knock({ op: "search", area_code: "305" }));
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.provider, "dry");
    assert.equal(body.area_code, 305, "a string of three digits is the number it spells");
    assert.equal(body.cost_month_usd, LINE_COSTS.local_number_month_usd);
    assert.equal(body.cost_month_usd, 1.15, "what a number costs Chanlytics a month");
    assert.equal(body.numbers.length, 8, "eight to choose from");
    assert.ok(
      body.numbers.every((n) => n.e164.startsWith("+1305") && n.capabilities.voice && n.capabilities.sms),
      "in the area code asked for, able to call and text",
    );
    assert.deepEqual(Object.keys(body.numbers[0]).sort(), ["capabilities", "e164", "friendly", "locality", "region"]);
    const asNumber = await (await knock({ op: "search", area_code: 917 })).json();
    assert.ok(asNumber.numbers.every((n) => n.e164.startsWith("+1917")));
  } finally {
    net.restore();
  }
  assert.equal(db.seen.length, 0, "a search is a question to the provider, not to the database");
});

/* ----------------------------------- buy ---------------------------------- */

test("buy is refused for a workspace that may not spend, with the reason and where to go, before a row is written", async () => {
  const net = unreachable("a refused purchase must not reach a provider");
  try {
    // A free trial is not among them: the trial covers the number (decision 0090), as a plan does.
    for (const status of ["none", "incomplete", "past_due", "canceled", "unpaid", "paused", "incomplete_expired"]) {
      const tables = world({ billing_accounts: [billing(status)] });
      const db = use(tables);
      const res = await knock({ op: "buy", number: NUMBER });
      assert.equal(res.status, 402, status);
      const body = await res.json();
      assert.deepEqual(
        body,
        { ok: false, error: "payment_required", detail: whyCannotSpend("stripe", status), status },
        status,
      );
      assert.match(body.detail, /Billing|checkout|card/i, `${status}: a refusal names a destination`);
      assert.equal(tables.lines.length, 0, `${status}: no row`);
      assert.equal(tables.jobs.length, 0, `${status}: no saga`);
      assert.deepEqual(writes(db, "lines").length + writes(db, "jobs").length, 0);
    }
    // No billing row at all is 402 too: the fix is a card, not a different account.
    const db = use(world({ billing_accounts: [] }));
    assert.deepEqual(await answer(await knock({ op: "buy", number: NUMBER })), [
      402,
      { ok: false, error: "no_billing_record" },
    ]);
    assert.equal(writes(db, "lines").length, 0);
    // A workspace invoiced by hand is never asked for a card.
    const direct = world({ billing_accounts: [billing("none", "direct")] });
    use(direct);
    assert.equal((await knock({ op: "buy", number: NUMBER })).status, 202, "direct: the question does not apply");
    assert.equal(direct.jobs.length, 1);
  } finally {
    net.restore();
  }
});

test("buy for a workspace that may spend writes a provisioning row and schedules the saga as a line_provision job — it is not run here", async () => {
  const tables = world();
  const db = use(tables);
  const net = unreachable("the door schedules the saga; it does not run it");
  try {
    const bad = await knock({ op: "buy", number: "3055550100" });
    assert.deepEqual(await answer(bad), [
      400,
      { ok: false, error: "bad_request", detail: "number must be E.164, like +13055550100" },
    ]);
    assert.equal(tables.lines.length, 0);

    const startedAt = Date.now();
    const [status, body] = await answer(await knock({ op: "buy", number: NUMBER }));
    assert.equal(status, 202, "accepted, not done");
    assert.equal(body.ok, true);
    assert.equal(body.queued, true);
    assert.equal(body.provider, "dry");
    // What the page sees: the row's public face, and never a SID.
    assert.equal(body.line.e164, NUMBER);
    assert.equal(body.line.voice_state, "provisioning");
    assert.equal(body.line.step, "subaccount");
    assert.equal(body.line.area_code, 305, "read off the number when the body did not say");
    assert.equal(body.line.registered, false);
    assert.ok(!Object.keys(body.line).some((k) => k.endsWith("_sid")), "no provider SID reaches the page");

    const row = tables.lines[0];
    assert.equal(tables.lines.length, 1);
    assert.deepEqual(
      [row.tenant_id, row.kind, row.provider, row.e164, row.voice_state, row.step],
      [A, "chanlytics", "dry", NUMBER, "provisioning", "subaccount"],
    );
    assert.ok(Date.parse(row.state_since) >= startedAt, "the clock the deadline reads starts now");
    assert.equal(row.subaccount_sid, undefined, "nothing was provisioned inline: the receipts are the saga's to write");
    assert.equal(tables.jobs.length, 1);
    const job = tables.jobs[0];
    assert.equal(job.kind, "line_provision");
    assert.equal(job.tenant_id, A);
    assert.deepEqual(withoutRequestId(job.payload), { line_id: row.id, by: "owner" });
    assert.ok(Date.parse(job.due_at) <= Date.now(), "due now: claimed under a lease within seconds");
    const order = db.seen.map((s) => `${s.table}.${s.op}`);
    assert.ok(
      order.indexOf("billing_accounts.select") < order.indexOf("lines.insert"),
      "the spend rule is asked before the row exists",
    );

    // One line per workspace in v1: a second buy is refused while one is live,
    // and a failed one is answered with the row to retry rather than a new purchase.
    const again = await knock({ op: "buy", number: "+13055550101", area_code: 305 });
    const [s2, b2] = await answer(again);
    assert.equal(s2, 409);
    assert.equal(b2.error, "line_exists");
    assert.equal(b2.line.id, row.id);
    row.voice_state = "failed";
    const [s3, b3] = await answer(await knock({ op: "buy", number: "+13055550101" }));
    assert.deepEqual([s3, b3.error, b3.line.id], [409, "line_failed_retry", row.id]);
    assert.equal(tables.lines.length, 1);
    assert.equal(tables.jobs.length, 1, "neither refusal scheduled anything");
  } finally {
    net.restore();
  }

  // The ledger refusing the job is answered as such, with the row it left.
  const broken = world();
  use(broken, {}, { "jobs.insert": { message: "permission denied for table jobs" } });
  const [s4, b4] = await answer(await knock({ op: "buy", number: NUMBER }));
  assert.equal(s4, 503);
  assert.equal(b4.error, "could_not_queue");
  assert.equal(b4.detail, "Could not save that just now. Try again in a moment.");
  assert.equal(b4.line.voice_state, "provisioning", "the row stands; the lines sweep picks it up past the deadline");
});

test("buy: two buys that cross both read no line and both insert; the database keeps one, the loser is answered line_exists with the row that stands, and one saga is queued -- the one purchase", async () => {
  // Two numbers, so it is the workspace's index that decides, not the number's. Both knocks start in the same
  // tick and the fake answers every read in the same number of hops, so they run in lockstep: each reads the
  // workspace's lines before either has written -- the window the door's own read cannot close. Asserted, so a
  // run in which the race did not happen says so instead of proving the read.
  const tables = world();
  const db = use(tables);
  const net = unreachable("the door schedules the saga; it does not run it");
  try {
    const [a, b] = await Promise.all([
      knock({ op: "buy", number: NUMBER }),
      knock({ op: "buy", number: "+13055550101" }),
    ]);
    const onLines = db.seen.filter((s) => s.table === "lines").map((s) => s.op);
    assert.deepEqual(onLines.slice(0, 3), ["select", "select", "insert"], "the race: both read before either wrote");
    assert.equal(onLines.filter((op) => op === "insert").length, 2, "both tried to write; the database decided");
    const answers = await Promise.all([answer(a), answer(b)]);
    const won = answers.filter(([s]) => s === 202);
    const lost = answers.filter(([s]) => s === 409);
    assert.equal(won.length, 1, JSON.stringify(answers));
    assert.equal(lost.length, 1, JSON.stringify(answers));
    assert.equal(tables.lines.length, 1, "one line");
    const row = tables.lines[0];
    assert.equal(won[0][1].line.id, row.id);
    assert.deepEqual(
      [lost[0][1].error, lost[0][1].line.id],
      ["line_exists", row.id],
      "the loser is shown the line that stands",
    );
    assert.equal(tables.jobs.length, 1, "one saga queued: the only path to the carrier, and to a bill");
    assert.deepEqual(withoutRequestId(tables.jobs[0].payload), { line_id: row.id, by: "owner" });
  } finally {
    net.restore();
  }

  // The same number pressed twice: the number's own index refuses the second row, and the answer is the same.
  const twice = world();
  use(twice);
  const [c, d] = await Promise.all([knock({ op: "buy", number: NUMBER }), knock({ op: "buy", number: NUMBER })]);
  const pair = await Promise.all([answer(c), answer(d)]);
  assert.deepEqual(pair.map(([s]) => s).sort(), [202, 409], JSON.stringify(pair));
  assert.equal(pair.find(([s]) => s === 409)[1].error, "line_exists");
  assert.equal(twice.lines.length, 1);
  assert.equal(twice.jobs.length, 1);
});

/* ------------------------------ retry and release ------------------------- */

test("retry resumes only the named row of the named workspace at its own step, records who asked, and refuses a line that cannot be retried in words", async () => {
  const NOW = Date.now();
  const tables = world({
    lines: [
      lineRow({
        voice_state: "failed",
        step: "import",
        last_error: "Retell 422: bad trunk",
        subaccount_sid: "ACsub",
        number_sid: "PN0001",
        trunk_sid: "TK0001",
        facts: { automatic_resumes: 3, trunk_ready: true },
      }),
      lineRow({ id: B_LINE, tenant_id: B, voice_state: "failed", step: "trunk" }),
      lineRow({ id: SECOND, voice_state: "answering" }),
    ],
  });
  const db = use(tables);
  const net = unreachable("a retry is scheduled, never run at the door");
  try {
    assert.deepEqual(await answer(await knock({ op: "retry", line_id: "nope" })), [
      400,
      { ok: false, error: "bad_request" },
    ]);
    assert.deepEqual(await answer(await knock({ op: "retry" })), [
      400,
      { ok: false, error: "bad_request", detail: "line_id is required" },
    ]);
    assert.deepEqual(
      await answer(await knock({ op: "retry", line_id: B_LINE })),
      [404, { ok: false, error: "not_found", detail: "no such line" }],
      "another workspace's row is not ours to resume",
    );

    // The rule is `lineRetryRefusal`: each refusal names the state a person can act on, in `detail` beside its code.
    const [s1, b1] = await answer(await knock({ op: "retry", line_id: SECOND }));
    assert.deepEqual(
      [s1, b1.error, b1.detail, b1.line.id],
      [409, "line_not_retryable", "the line is answering, not failed", SECOND],
    );
    tables.lines.push(
      lineRow({
        id: "44444444-4444-4444-8444-444444444444",
        voice_state: "provisioning",
        step: "trunk",
        state_since: new Date(NOW - 60_000).toISOString(),
      }),
    );
    const [s2, b2] = await answer(await knock({ op: "retry", line_id: "44444444-4444-4444-8444-444444444444" }));
    assert.equal(s2, 409);
    assert.equal(b2.error, "line_not_retryable");
    assert.match(b2.detail, /still setting up/);
    assert.match(b2.detail, /retried automatically after that/, "so nobody sits refreshing");
    tables.lines.push(
      lineRow({
        id: "55555555-5555-4555-8555-555555555555",
        voice_state: "failed",
        step: "number",
        last_error: "reading the line's credentials: permission denied",
      }),
    );
    const [s3, b3] = await answer(await knock({ op: "retry", line_id: "55555555-5555-4555-8555-555555555555" }));
    assert.equal(s3, 409);
    assert.equal(b3.error, "line_not_retryable");
    assert.match(
      b3.detail,
      /keys couldn't be kept/,
      "a retry cannot help until a person restores them, and the button says so",
    );
    assert.equal(tables.jobs.length, 0, "no refusal scheduled anything");

    // One workspace, one line. The rows above were each read for a refusal in words; the database holds a workspace's
    // live rows one at a time (lines_one_live_per_tenant_idx, and lines_e164_live_idx on the number they share), so a
    // take runs with the line it is about as the workspace's only one.
    const alone = (line) => {
      tables.lines = [line, ...tables.lines.filter((l) => l.tenant_id !== A)];
    };
    alone(tables.lines[0]);

    // The failed line, by the owner: taken, cleared, scheduled at its step.
    const [status, body] = await answer(await knock({ op: "retry", line_id: LINE, by: "owner" }));
    assert.equal(status, 202);
    assert.deepEqual([body.ok, body.queued, body.provider], [true, true, "dry"]);
    assert.equal(body.line.voice_state, "provisioning");
    assert.equal(body.line.last_error, null);
    assert.equal(body.line.step, "import", "the page sees it resume where it stopped");
    const row = tables.lines[0];
    assert.equal(row.voice_state, "provisioning", "the take is visible on the row");
    assert.equal(row.last_error, null);
    assert.ok(Date.parse(row.state_since) >= NOW, "with a clock that restarts now");
    assert.deepEqual(
      row.facts,
      { automatic_resumes: 0, trunk_ready: true },
      "a person's Retry clears the automatic count and keeps every receipt",
    );
    assert.deepEqual(
      [row.step, row.number_sid, row.trunk_sid],
      ["import", "PN0001", "TK0001"],
      "nothing is bought or built twice: the saga derives its plan from these",
    );
    assert.deepEqual(
      tables.jobs.map((j) => [j.kind, j.tenant_id, withoutRequestId(j.payload)]),
      [["line_provision", A, { line_id: LINE, by: "owner" }]],
    );
    const claim = writes(db, "lines").find((w) => w.op === "update");
    assert.ok(
      claim.filters.some(([op, col, val]) => op === "eq" && col === "voice_state" && val === "failed"),
      "the take is a compare-and-swap on the state the caller saw",
    );

    // A line the wall killed is retryable past the deadline, and the same take applies.
    const stuck = lineRow({
      id: "66666666-6666-4666-8666-666666666666",
      voice_state: "provisioning",
      step: "trunk",
      state_since: new Date(NOW - PROVISIONING_DEADLINE_MS - 60_000).toISOString(),
    });
    alone(stuck);
    const [s4, b4] = await answer(await knock({ op: "retry", line_id: stuck.id }));
    assert.equal(s4, 202);
    assert.equal(b4.line.step, "trunk");
    assert.equal(tables.jobs.at(-1).payload.by, "support", "unnamed, it came from somebody holding the key");
    const took = writes(db, "lines")
      .filter((w) => w.op === "update")
      .at(-1);
    assert.ok(
      took.filters.some(([op, col]) => op === "lt" && col === "state_since"),
      "taken only if still past the deadline at the moment of the take",
    );
  } finally {
    net.restore();
  }
});

test("release gives the number and the trunk back, switches both routing rows off, forgets the line, and writes the ledger — as the workspace's subaccount", async () => {
  const asked = [];
  const tables = world({
    lines: [
      unfiled({ facts: { channel_id: "ch-voice", sms_channel_id: "ch-sms", trunk_ready: true } }),
      lineRow({ id: B_LINE, tenant_id: B, subaccount_sid: "ACother", number_sid: "PN0099" }),
    ],
    tenant_channels: [
      { id: "ch-voice", tenant_id: A, kind: "voice", status: "active", external_id: "agent_x", number_e164: NUMBER },
      { id: "ch-sms", tenant_id: A, kind: "sms", status: "active", external_id: NUMBER, number_e164: NUMBER },
    ],
  });
  use(tables, {
    ...VAULT,
    get_line_credentials: (args) => {
      asked.push(args);
      return { auth_token: "sub-token" };
    },
  });
  const net = unreachable("the dry provider never reaches the network");
  try {
    assert.deepEqual(await answer(await knock({ op: "release", line_id: B_LINE })), [
      404,
      { ok: false, error: "not_found", detail: "no such line" },
    ]);
    assert.equal(tables.lines.length, 2, "another workspace's number is not ours to give back");

    const [status, body] = await answer(await knock({ op: "release", line_id: LINE }));
    assert.equal(status, 200);
    assert.deepEqual(
      body,
      {
        ok: true,
        released: { number: "PN0001", trunk: "TK0001", channel_disabled: "ch-voice", sms_channel_disabled: "ch-sms" },
      },
      "what came off at the provider, by receipt",
    );
  } finally {
    net.restore();
  }
  assert.deepEqual(asked, [{ p_line_id: LINE }], "the subaccount's token, from the vault, for this line");
  assert.deepEqual(
    tables.lines.map((l) => l.id),
    [B_LINE],
    "the line is forgotten",
  );
  assert.equal(
    tables.tenant_channels.find((c) => c.id === "ch-voice").status,
    "disabled",
    "switched off, never deleted: calls keep their history",
  );
  // The texting row `facts.sms_channel_id` names goes off with it, not active beside a number nobody holds.
  assert.equal(
    tables.tenant_channels.find((c) => c.id === "ch-sms").status,
    "disabled",
    "and the texting row, the same way",
  );
  assert.equal(tables.events.length, 1);
  const ev = tables.events[0];
  assert.deepEqual(
    [ev.tenant_id, ev.kind, ev.category, ev.subject_type, ev.subject_id],
    [A, "line.released", "setup", "line", LINE],
  );
  assert.deepEqual(ev.data, {
    e164: NUMBER,
    provider: "dry",
    number: "PN0001",
    trunk: "TK0001",
    channel_disabled: "ch-voice",
    sms_channel_disabled: "ch-sms",
  });
});

test("release finds a number the row lost the receipt for and gives it back — at the carrier, over the wire; a refused lookup is not 'we do not own it'", async () => {
  // The window is real: `number_sid` is written after the purchase answers, so a saga killed between the two left the
  // number bought and the row silent. This used to skip straight to deleting the row, and we paid for it every month.
  const tables = world({
    lines: [unfiled({ provider: "twilio", voice_state: "failed", step: "number", number_sid: null, trunk_sid: null })],
  });
  use(tables, VAULT);
  const sub = "ACsub0000000000000000000000000000";
  const carrier = wire((req) => {
    if (req.method === "GET" && req.url.startsWith(twilioUrls.incomingNumbers(sub)))
      return { status: 200, body: { incoming_phone_numbers: [{ sid: "PNlost", phone_number: NUMBER }] } };
    if (req.method !== "GET") return { status: 204 };
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
  try {
    await withEnv(TWILIO, async () => {
      assert.deepEqual(
        await answer(await knock({ op: "release", line_id: LINE })),
        [200, { ok: true, released: { number: "PNlost", number_found_by_lookup: true } }],
        "and says so, because it means a saga was killed mid-purchase",
      );
    });
  } finally {
    carrier.restore();
  }
  assert.deepEqual(
    carrier.seen.map((r) => [r.method, r.url]),
    [
      ["GET", `${twilioUrls.incomingNumbers(sub)}?PhoneNumber=%2B13055550100&PageSize=1`],
      ["DELETE", twilioUrls.incomingNumber(sub, "PNlost")],
      ["POST", twilioUrls.subaccount(sub)],
    ],
    "looked up by the number, released by the SID it answered, and the subaccount closed last",
  );
  assert.ok(
    carrier.seen.slice(0, -1).every((r) => r.headers.Authorization === SUB_AUTH),
    "as the workspace's subaccount; only the closing is the master's",
  );
  assert.equal(tables.lines.length, 0);

  // Honestly absent: nothing to release, and the row still goes.
  const none = world({ lines: [unfiled({ provider: "twilio", number_sid: null, trunk_sid: null })] });
  use(none, VAULT);
  const empty = wire(() => ({ status: 200, body: { incoming_phone_numbers: [] } }));
  try {
    await withEnv(TWILIO, async () => {
      assert.deepEqual(await answer(await knock({ op: "release", line_id: LINE })), [200, { ok: true, released: {} }]);
    });
  } finally {
    empty.restore();
  }
  assert.equal(none.lines.length, 0);

  // A lookup the carrier refuses is a provider error, and the row stays: deleting
  // it would be paying for a number with nothing left pointing at it.
  const kept = world({ lines: [unfiled({ provider: "twilio", number_sid: null, trunk_sid: null })] });
  use(kept, VAULT);
  const refused = wire(() => ({ status: 500, body: { code: 20500, message: "internal error" } }));
  try {
    await withEnv(TWILIO, async () => {
      const [status, body] = await answer(await knock({ op: "release", line_id: LINE }));
      assert.equal(status, 502);
      assert.equal(body.error, "provider_refused");
      assert.match(body.detail, /^releasing at the provider: list owned numbers: internal error \(Twilio 20500\)/);
      assert.deepEqual(body.released, {});
    });
  } finally {
    refused.restore();
  }
  assert.equal(kept.lines.length, 1, "the row stands until the carrier answers");
  assert.equal(kept.events.length, 0);
});

test("(A2) release takes the number off Retell first, when the saga imported it there; a refusal there keeps the row and reaches no carrier", async () => {
  const tables = world({ lines: [unfiled({ facts: { retell_imported: true } })] });
  use(tables, VAULT);
  const retell = wire((req) => {
    if (req.method === "DELETE" && req.url === "https://api.retellai.com/delete-phone-number/%2B13055550100")
      return { status: 204 };
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
  try {
    assert.deepEqual(await answer(await knock({ op: "release", line_id: LINE })), [
      200,
      { ok: true, released: { retell_number: NUMBER, number: "PN0001", trunk: "TK0001" } },
    ]);
  } finally {
    retell.restore();
  }
  assert.equal(retell.seen[0].headers.Authorization, "Bearer retell-key-for-this-file");
  assert.equal(tables.lines.length, 0);

  const kept = world({ lines: [unfiled({ facts: { retell_imported: true } })] });
  use(kept, VAULT);
  const down = wire(() => ({ status: 500, body: { message: "down" } }));
  try {
    assert.deepEqual(await answer(await knock({ op: "release", line_id: LINE })), [
      502,
      {
        ok: false,
        error: "provider_refused",
        detail: "releasing at the provider: Retell delete-phone-number: HTTP 500",
        released: {},
      },
    ]);
  } finally {
    down.restore();
  }
  assert.equal(down.seen.length, 1, "no carrier call after Retell refused");
  assert.equal(kept.lines.length, 1, "the row stands");
});

test("record validates the row it is about to write and reports the first problem in the owner's words; a good one is kept once per workspace and the ledger says so", async () => {
  const tables = world();
  const db = use(tables);
  assert.deepEqual(await answer(await knock({ op: "record" })), [
    400,
    { ok: false, error: "bad_request", detail: "record is required" },
  ]);
  assert.deepEqual(await answer(await knock({ op: "record", record: "Harbor Moving" })), [
    400,
    { ok: false, error: "bad_request", detail: "record is required" },
  ]);
  assert.deepEqual(await answer(await knock({ op: "record", record: { ...FORM, legal_name: "" } })), [
    400,
    { ok: false, error: "record_incomplete", detail: "Legal name is needed." },
  ]);
  assert.deepEqual(await answer(await knock({ op: "record", record: { ...FORM, ein: "12345" } })), [
    400,
    { ok: false, error: "record_incomplete", detail: "A tax ID is nine digits, like 12-3456789." },
  ]);
  assert.deepEqual(await answer(await knock({ op: "record", record: { ...FORM, contact_email: "ada" } })), [
    400,
    { ok: false, error: "record_incomplete", detail: "That does not look like an email address." },
  ]);
  assert.deepEqual(
    await answer(await knock({ op: "record", record: { ...FORM, legal_name: "", region: "New York" } })),
    [400, { ok: false, error: "record_incomplete", detail: "Legal name is needed." }],
    "missing before malformed, in the order the form asks",
  );
  assert.deepEqual(await answer(await knock({ op: "record", record: { ...FORM, country: "MX" } })), [
    400,
    {
      ok: false,
      error: "record_incomplete",
      detail: "The phone networks register US and Canadian businesses only.",
    },
  ]);
  assert.equal(writes(db, "business_records").length, 0, "nothing written until it validates");
  assert.equal(tables.events.length, 0);

  const [status, body] = await answer(await knock({ op: "record", record: FORM, path: "standard" }));
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.deepEqual(
    [body.record.legal_name, body.record.path, body.record.sole_proprietor],
    ["Harbor Moving LLC", "standard", false],
  );
  // The first record kept: nothing to compare, nothing filed (the wiring's second audit, X4-3).
  assert.deepEqual(
    [body.record.first, body.record.changed, body.record.filing, body.record.filed_name],
    [true, [], "none", null],
  );
  assert.equal(tables.business_records.length, 1);
  const row = tables.business_records[0];
  assert.equal(row.tenant_id, A);
  assert.equal(row.legal_name, "Harbor Moving LLC", "trimmed");
  assert.equal(row.ein, "12-3456789");
  assert.equal(
    row.industry,
    "PROFESSIONAL_SERVICES",
    "Twilio's enum, not the word typed: 'PROFESSIONAL' is refused at the evaluation",
  );
  assert.deepEqual(
    [row.street_secondary, row.country, row.contact_title, row.contact_job_position],
    [null, "US", "Owner", "Director"],
    "blanks become null or the default the carriers accept",
  );
  assert.equal(row.website_url, "", "no site: the page we publish is filed instead");
  assert.equal(row.contact_phone, "+1 917 555 0123");
  assert.deepEqual(
    tables.events.map((e) => [e.kind, e.category, e.subject_type, e.subject_id, e.data]),
    // Who saved it, as the dashboard's token names them: the ledger said the record changed and never whose hand it was.
    [
      [
        "business.recorded",
        "setup",
        "tenant",
        A,
        { legal_name: "Harbor Moving LLC", path: "standard", by: "u1", changed: null },
      ],
    ],
  );

  // Said twice makes one row.
  const [again, moved] = await answer(
    await knock({ op: "record", record: { ...FORM, city: "Queens" }, path: "standard" }),
  );
  assert.equal(again, 200);
  assert.equal(moved.record.legal_name, "Harbor Moving LLC");
  assert.deepEqual([moved.record.first, moved.record.changed], [false, ["city"]], "what moved, by name");
  assert.deepEqual(tables.events[1].data.changed, ["city"], "and the ledger keeps the names, never the values");
  assert.equal(tables.business_records.length, 1);
  assert.equal(tables.business_records[0].city, "Queens");
  const up = writes(db, "business_records");
  assert.ok(
    up.every((w) => w.op === "upsert" && w.conflict.join() === "tenant_id"),
    "an upsert on the workspace, never a second row",
  );
});

test("record: a save over a filing says what moved and where the filing stands, with the name the carriers hold; a rehearsal is no filing, and a read of the lines that fails still saves and says nothing of one (the wiring's second audit, X4-3)", async () => {
  const stored = { ...RECORD, tenant_id: A };
  const saveOver = async (lines, faults = {}) => {
    const tables = world({ lines, business_records: [{ ...stored }] });
    use(tables, {}, faults);
    const [status, body] = await answer(
      await knock({ op: "record", record: { ...FORM, legal_name: "Harbor Movers LLC" }, path: "standard" }),
    );
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(tables.business_records[0].legal_name, "Harbor Movers LLC", "saved whatever the filing");
    return body.record;
  };
  const named = { ...filed().facts, a2p_filed_name: "Harbor Moving LLC" };
  const onFile = await saveOver([filed({ sms_state: "active", facts: named })]);
  assert.equal(onFile.filing, "on_file");
  assert.equal(onFile.filed_name, "Harbor Moving LLC", "the name the brand was filed under, not the one just typed");
  assert.ok(onFile.changed.includes("legal_name"));
  assert.equal(onFile.first, false);

  assert.equal(
    (await saveOver([filed({ facts: named })])).filing,
    "in_review",
    "approved: the campaign is still theirs",
  );
  assert.equal((await saveOver([rejected()])).filing, "sent_back");
  const rehearsed = await saveOver([rehearsal()]);
  assert.deepEqual([rehearsed.filing, rehearsed.filed_name], ["none", null], "a rehearsal is no filing");
  // A filing that failed: a brand made is a brand the carriers hold; none made, nothing went to them.
  assert.equal((await saveOver([filed({ sms_state: "failed" })])).filing, "on_file");
  assert.equal((await saveOver([unfiled({ sms_state: "failed" })])).filing, "none");
  const unread = await saveOver([filed()], { "lines.select": { message: "lines unreadable" } });
  assert.equal(unread.filing, null, "lines that could not be read say nothing of a filing");
});

test("record: which registration is said, not inferred — a sole proprietor is stored with no tax id and reads back on that path; derived only when the caller did not say", async () => {
  const tables = world({ lines: [lineRow()] });
  use(tables);
  // Asked for the sole-proprietor path with a tax id typed anyway: stored as
  // that path files it, so it reads back on it for ever.
  const [status, body] = await answer(
    await knock({ op: "record", path: "sole_proprietor", record: { ...FORM, ein: "12-3456789" } }),
  );
  assert.equal(status, 200);
  assert.deepEqual([body.record.path, body.record.sole_proprietor], ["sole_proprietor", true]);
  assert.equal(tables.business_records[0].ein, null, "a sole-proprietor record keeps NO tax id");
  assert.equal(tables.events.at(-1).data.path, "sole_proprietor");

  // The one thing that path cannot proceed without is THEIR handset, not ours.
  const [ours, why] = await answer(
    await knock({ op: "record", path: "sole_proprietor", record: { ...FORM, contact_phone: NUMBER } }),
  );
  assert.equal(ours, 400);
  assert.equal(why.error, "sole_proprietor_incomplete");
  assert.match(why.detail, /Use your own handset, not the number Chanlytics answers/);
  assert.deepEqual(
    await answer(await knock({ op: "record", path: "sole_proprietor", record: { ...FORM, contact_phone: "" } })),
    [400, { ok: false, error: "sole_proprietor_incomplete", detail: "Personal mobile is needed." }],
    "in that path's own words",
  );
  // And the standard path's demands are not made of them: no legal form, no tax id.
  const [thin] = await answer(
    await knock({
      op: "record",
      path: "sole_proprietor",
      record: { ...FORM, ein: "", business_type: "", company_type: "" },
    }),
  );
  assert.equal(thin, 200);

  // Derived from the tax id when the caller did not say, or said nonsense.
  const [d1, standard] = await answer(await knock({ op: "record", record: FORM }));
  assert.deepEqual([d1, standard.record.path], [200, "standard"]);
  const [d2, sole] = await answer(await knock({ op: "record", record: { ...FORM, ein: "" }, path: "the-other-one" }));
  assert.deepEqual([d2, sole.record.path], [200, "sole_proprietor"]);
  assert.deepEqual(
    await answer(await knock({ op: "record", record: { ...FORM, ein: "" }, path: "standard" })),
    [400, { ok: false, error: "record_incomplete", detail: "Tax ID (EIN) is needed." }],
    "a caller that says standard is held to it",
  );
});
