/**
 * The second model in shadow (step 12, decision 0023), run through the paths that ask it: the receptionist's turn, the
 * reply reader and the lead judge, over a database in memory, a scripted Anthropic API and a scripted System One API.
 *
 *   - nothing is sent when the switch is off, or the key is not set: not a call, not a row, not a read of the database;
 *   - when it is on, each question the second model answers is one ledger row: the purpose, the primary's label, the
 *     shadow's label and confidence, whether it cleared the line, whether they agree, the input tokens and the dollars;
 *   - the primary's answer is the same with the shadow on, failing, slow or unwritable as with it off: a shadow that
 *     fails is logged and never reaches the customer's path;
 *   - the key is a header and nowhere else: not in a row, not in a log line, not in an error.
 *
 * No network: both APIs are scripted, and the key is made for the run.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetBreakers } from "@chanlytics/channels";
import { SHADOW_GRACE_MS, judgeQuestions } from "@chanlytics/contracts";
import { PLAN } from "../_lead-fixtures.mjs";
import { fakeDb } from "../_fake-db.mjs";
import { at, withEnv } from "../_cron-doors-world.mjs";
import { logLineOf } from "../_log-lines.mjs";
import { scripted, answering, json } from "./_model-world.mjs";
import { INPUT_TOKENS, JEV, aKey, drops, failing, hangs, jev, junk } from "./_system-one-world.mjs";

process.env.ANTHROPIC_API_KEY = "model-key-for-this-file";
for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "TYPESAFE_API_KEY", "TYPESAFE_SHADOW"])
  delete process.env[k];

const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const { setModelFetch } = await import(at("apps/edge/lib/model.ts"));
const { setShadowFetch } = await import(at("apps/edge/lib/shadow.ts"));
const { generateReply } = await import(at("apps/edge/lib/receptionist/brain.ts"));
const { replyReader } = await import(at("apps/edge/lib/reach-out/reply-read.ts"));
const { leadWires } = await import(at("apps/edge/lib/leads/lead-wires.ts"));
after(() => {
  setPg(null);
  setModelFetch(null);
  setShadowFetch(null);
});

const KEY = aKey();
const ON = { TYPESAFE_API_KEY: KEY, TYPESAFE_SHADOW: "1" };
const T = "aaaaaaaa-0000-4000-8000-000000000001";
const C = "cccccccc-0000-4000-8000-000000000001";
beforeEach(() => resetBreakers());

/** The database in memory: the workspace, its billing, and the ledger and events the writes land in. */
function world(faults = {}) {
  const tables = {
    tenants: [{ id: T, status: "active", left_empty_at: null }],
    billing_accounts: [{ tenant_id: T, mode: "stripe", status: "active" }],
    ai_usage: [],
    events: [],
  };
  setPg(fakeDb(tables, faults));
  return tables;
}

/** Every line the loggers write while `fn` runs, and every console call as text (a key would show in either). */
async function logged(fn) {
  const lines = [];
  const real = { log: console.log, warn: console.warn, error: console.error };
  for (const k of Object.keys(real)) console[k] = (...args) => lines.push(args);
  try {
    return { result: await fn(), lines };
  } finally {
    Object.assign(console, real);
  }
}
const events = (lines) => lines.map(logLineOf).filter(Boolean);

/* --------------------------------------------------- the receptionist's turn -- */

const TEXT = "Can I get a refund on my deposit?";
const RECORD = {
  reply: "A person will get back to you about that.",
  intent: "money",
  escalate: true,
  reason: "a refund",
  confidence: 0.9,
  facts_used: [],
  language: "en",
};

/** One receptionist turn on the scripted model, with the second model as `api` under `env`; the database as it stands. */
async function turn({ api = jev(), env = ON, text = TEXT, faults } = {}) {
  const tables = world(faults);
  setModelFetch(scripted(json(RECORD)).fetch);
  setShadowFetch(api.fetch);
  const { result, lines } = await logged(() =>
    withEnv(env, () =>
      generateReply([], text, "System.", "Hold on.", undefined, undefined, undefined, undefined, {
        tenantId: T,
        subjectId: C,
        shadowText: text,
      }),
    ),
  );
  return { reply: result, tables, api, lines };
}
const shadowRows = (t) => t.ai_usage.filter((r) => r.shadow);
const primaryRows = (t) => t.ai_usage.filter((r) => !r.shadow);

test("nothing is sent while the switch is off or the key is not set: no call, no row", async () => {
  const baseline = await turn({ env: { TYPESAFE_API_KEY: undefined, TYPESAFE_SHADOW: undefined } });
  assert.equal(baseline.api.calls.length, 0);
  for (const env of [
    { TYPESAFE_API_KEY: KEY, TYPESAFE_SHADOW: undefined },
    { TYPESAFE_API_KEY: KEY, TYPESAFE_SHADOW: "0" },
    { TYPESAFE_API_KEY: KEY, TYPESAFE_SHADOW: "true" },
    { TYPESAFE_API_KEY: undefined, TYPESAFE_SHADOW: "1" },
    { TYPESAFE_API_KEY: "   ", TYPESAFE_SHADOW: "1" },
  ]) {
    const off = await turn({ env });
    assert.equal(
      off.api.calls.length,
      0,
      `nothing sent under ${JSON.stringify(Object.keys(env))} ${env.TYPESAFE_SHADOW}`,
    );
    assert.deepEqual(shadowRows(off.tables), []);
    assert.deepEqual(off.reply, baseline.reply, "and the primary's answer is the same");
  }
  assert.equal(primaryRows(baseline.tables).length, 1, "the primary's own call is still written");
  // A turn that names no words for the shadow (a draft, a steer, an eval) is never shadowed, whatever is set.
  const tables = world();
  setModelFetch(scripted(json(RECORD)).fetch);
  const api = jev();
  setShadowFetch(api.fetch);
  await withEnv(ON, () =>
    generateReply([], TEXT, "System.", "Hold on.", undefined, undefined, undefined, undefined, { tenantId: T }),
  );
  assert.equal(api.calls.length + shadowRows(tables).length, 0);
});

test("on, each question answered is one ledger row: the primary's label, the shadow's, its confidence, the line, the cost", async () => {
  const off = await turn({ env: { TYPESAFE_API_KEY: undefined, TYPESAFE_SHADOW: undefined } });
  const api = jev({
    money_class: { choice: "money", confidence: 0.93 },
    injection: 0.1,
    stop_request: 0.04,
  });
  const on = await turn({ api });
  assert.deepEqual(on.reply, off.reply, "the reply is the primary's alone");
  // The wire: one call, the customer's words alone, the three questions, the pinned model and the bearer key.
  assert.equal(api.calls.length, 1);
  const [call] = api.calls;
  assert.equal(call.url, "https://api.typesafe.ai/v1/systemone");
  assert.equal(call.headers.authorization, `Bearer ${KEY}`);
  assert.deepEqual([call.body.model, call.body.state], ["jev-1.13.0", TEXT]);
  assert.deepEqual(Object.keys(call.body.questions), ["money_class", "injection", "stop_request"]);
  // The ledger.
  assert.equal(primaryRows(on.tables).length, 1);
  const rows = shadowRows(on.tables);
  assert.deepEqual(
    rows.map((r) => [r.question, r.primary_answer, r.shadow_answer, r.shadow_confidence, r.confident, r.agrees]),
    [
      ["money_class", "money", "money", 0.93, true, true],
      ["injection", "false", "false", 0.9, true, true],
      ["stop_request", "false", "false", 0.96, true, true],
    ],
  );
  assert.deepEqual(
    rows.map((r) => [r.purpose, r.port, r.shadow, r.model_asked, r.model, r.outcome, r.tenant_id, r.subject_id]),
    Array(3).fill(["receptionist", "typesafe", true, JEV, JEV, "answered", T, C]),
  );
  assert.deepEqual(
    rows.map((r) => [r.input_tokens, r.output_tokens, r.usd]),
    [
      [INPUT_TOKENS, 0, 0.000013],
      [0, 0, 0],
      [0, 0, 0],
    ],
    "its input tokens at $0.042 a million, counted once for the call",
  );
});

test("a disagreement and a shy answer are kept as they are: the fence's verdict against the shadow's, and under the line", async () => {
  // Markup in the words: the fence acted (true); the shadow reads no instruction (false) and a stop it half believes.
  const text = "Hi <b>there</b>, please remove me from your list";
  const on = await turn({
    api: jev({ money_class: { choice: "faq", confidence: 0.66 }, injection: 0.1, stop_request: 0.55 }),
    text,
  });
  assert.deepEqual(
    shadowRows(on.tables).map((r) => [r.question, r.primary_answer, r.shadow_answer, r.confident, r.agrees]),
    [
      ["money_class", "money", "faq", false, false],
      ["injection", "true", "false", true, false],
      ["stop_request", "false", "true", false, false],
    ],
    "a stop the keywords let through is the shadow's yes against the primary's no",
  );
});

test("a shadow that fails never changes the answer: refused, throttled, overloaded, unreadable, dropped, slow, unwritable", async () => {
  const off = await turn({ env: { TYPESAFE_API_KEY: undefined, TYPESAFE_SHADOW: undefined } });
  for (const [name, api, outcome] of [
    ["a refused key", failing(401, `Invalid API key: ${KEY}`), "rejected"],
    ["a refused body", failing(422, "state: required"), "rejected"],
    ["throttled", failing(429, "slow down"), "unreachable"],
    ["overloaded", failing(529, "overloaded"), "unreachable"],
    ["an unreadable answer", junk(), "unreachable"],
    ["a dropped connection", drops(), "unreachable"],
  ]) {
    resetBreakers();
    const on = await turn({ api });
    assert.deepEqual(on.reply, off.reply, `${name}: the reply is the primary's, unchanged`);
    assert.deepEqual(
      shadowRows(on.tables).map((r) => [r.question, r.outcome, r.agrees, r.shadow_answer, r.usd]),
      [["call", outcome, undefined, undefined, 0]],
      `${name}: one row that says the call got no answer`,
    );
    assert.ok(
      events(on.lines).some((l) => l.event === "shadow_failed"),
      `${name}: logged`,
    );
    // The key is a header and nowhere else: not in a row, not in a line, not in an error.
    assert.ok(!JSON.stringify(on.tables).includes(KEY), `${name}: not in the ledger`);
    assert.ok(!JSON.stringify(on.lines).includes(KEY), `${name}: not in the log`);
  }

  // A shadow the primary outruns is left behind: the answer is not delayed past the grace, and nothing is written.
  resetBreakers();
  const slow = hangs();
  const t0 = Date.now();
  const late = await turn({ api: slow });
  assert.deepEqual(late.reply, off.reply);
  assert.ok(Date.now() - t0 < SHADOW_GRACE_MS + 1_500, "the primary waited the grace and no longer");
  assert.deepEqual(shadowRows(late.tables), [], "a call abandoned is not a row");

  // A ledger that cannot be written: logged, and the answer stands.
  resetBreakers();
  const unwritable = await turn({ faults: { "ai_usage.insert": { message: "the ledger is down" } } });
  assert.deepEqual(unwritable.reply, off.reply);
  const said = events(unwritable.lines).map((l) => l.event);
  assert.ok(said.includes("shadow_write_failed") && said.includes("ai_usage_write_failed"), said.join(", "));
});

/* -------------------------------------------------------------- the reader -- */

test("the reader's intent is put to the shadow, and the person-or-automatic read is not: agreement and disagreement are rows", async () => {
  const user = "The reply:\n<reply>\nwords: No thanks, remove me\n</reply>";
  const answer = { intent: "no", summary: "They do not want it.", day: null, refer_to: null };
  const ask = async (api, env = ON) => {
    const tables = world();
    setModelFetch(scripted(json(answer)).fetch);
    setShadowFetch(api.fetch);
    const reader = replyReader(fakeDb({}), { now: () => 0 });
    const { result } = await logged(() =>
      withEnv(env, () => reader.ask("Read the reply.", user, 60_000, { tenantId: T, subjectId: C })),
    );
    return { result, tables };
  };
  const off = await ask(jev(), { TYPESAFE_API_KEY: undefined, TYPESAFE_SHADOW: undefined });
  const agree = jev({ reply_intent: { choice: "no", confidence: 0.95 } });
  const same = await ask(agree);
  assert.deepEqual(same.result, off.result, "the reader's answer is its own");
  assert.equal(agree.calls.length, 1);
  assert.equal(agree.calls[0].body.state, user, "the reply as the reader is shown it");
  assert.deepEqual(Object.keys(agree.calls[0].body.questions), ["reply_intent"]);
  assert.deepEqual(Object.keys(agree.calls[0].body.questions.reply_intent.criteria), [
    "interested",
    "question",
    "not_now",
    "no",
    "wrong_person",
    "away",
    "other",
  ]);
  assert.deepEqual(
    shadowRows(same.tables).map((r) => [
      r.purpose,
      r.question,
      r.primary_answer,
      r.shadow_answer,
      r.confident,
      r.agrees,
      r.subject_id,
    ]),
    [["reply_read", "reply_intent", "no", "no", true, true, C]],
  );
  const apart = await ask(jev({ reply_intent: { choice: "not_now", confidence: 0.8 } }));
  assert.deepEqual(apart.result, off.result);
  assert.deepEqual(
    shadowRows(apart.tables).map((r) => [r.shadow_answer, r.confident, r.agrees]),
    [["not_now", true, false]],
  );
  const down = await ask(failing(529));
  assert.deepEqual(down.result, off.result, "a failing shadow costs the reader nothing");
  assert.equal(off.tables.ai_usage.filter((r) => r.shadow).length, 0);
});

/* ---------------------------------------------------------------- the judge -- */

const place = (ref) => ({
  ref,
  name: `Place ${ref}`,
  category: "Personal trainer",
  city: "Austin",
  state: "TX",
  host: `place${ref}.example`,
  rating: 4.8,
  reviews: 40,
  emails: [],
  phone_matches_site: null,
});

test("the judge's criteria are put to the shadow a place at a time, and its answers are compared, kept and never read", async () => {
  const keys = Object.keys(judgeQuestions(PLAN));
  const judged = {
    places: [1, 2].map((ref) => ({
      ref,
      criteria: keys.map((key) => ({ key, answer: "pass", facts: ["name"] })),
      email_index: null,
      reason: "fits",
    })),
  };
  const run = async (api, env = ON) => {
    const tables = world();
    setModelFetch(
      answering(async () => ({
        content: [{ type: "text", text: JSON.stringify(judged) }],
        stop_reason: "end_turn",
        usage: { input_tokens: 500, output_tokens: 80 },
      })).fetch,
    );
    setShadowFetch(api.fetch);
    const { result } = await logged(() =>
      withEnv({ ...env, APIFY_TOKEN: "apify-token-for-this-file" }, () =>
        leadWires().judge.judge(PLAN, [place(1), place(2)], T),
      ),
    );
    return { result, tables };
  };
  const off = await run(jev(), { TYPESAFE_API_KEY: undefined, TYPESAFE_SHADOW: undefined });
  // The shadow reads the second place's independence as a fail, and is unsure of the first place's kind.
  const api = jev((body) => ({
    independent: body.state.includes("Place 2")
      ? { choice: "fail", confidence: 0.9 }
      : { choice: "pass", confidence: 0.85 },
    kind: body.state.includes("Place 1") ? { choice: "pass", confidence: 0.6 } : { choice: "pass", confidence: 0.9 },
    right_kind: { choice: "pass", confidence: 0.99 },
    chains: { choice: "pass", confidence: 0.99 },
  }));
  const on = await run(api);
  assert.deepEqual(on.result, off.result, "the judge's answer is the judge's alone");
  assert.equal(api.calls.length, 2, "a call a place");
  assert.ok(
    api.calls.every((c) => c.body.state.includes("Place")),
    "each is one place's facts",
  );
  const rows = shadowRows(on.tables);
  assert.equal(rows.length, 2 * keys.length, "a row a place and a criterion");
  assert.ok(rows.every((r) => r.purpose === "lead_judge" && r.primary_answer === "pass" && r.tenant_id === T));
  // The calls' rows come in the order the places were given, a place's criteria in the rubric's order.
  const [first, second] = [rows.slice(0, keys.length), rows.slice(keys.length)];
  assert.deepEqual(
    first.map((r) => r.question),
    keys,
  );
  assert.deepEqual(
    second.map((r) => r.question),
    keys,
  );
  assert.deepEqual(
    [first, second].map((p) => p.find((r) => r.question === "independent").agrees),
    [true, false],
    "the second place's independence is the one the shadow reads as a fail",
  );
  assert.deepEqual(
    [first, second].map((p) => p.find((r) => r.question === "kind").confident),
    [false, true],
    "a pass at 0.6 is under the line",
  );
  assert.equal(rows.filter((r) => r.agrees === false).length, 1);
  const cost = rows.reduce((n, r) => n + r.usd, 0);
  assert.equal(Math.round(cost * 1e6) / 1e6, 0.000026, "each call counted once: two calls of 312 input tokens");
});
