/**
 * The edge's model port (apps/edge/lib/model.ts) and the paths that ask through it, over a database in memory and a
 * scripted API: every call writes one row of the usage ledger (ai_usage, 00273) with the model asked, the model that
 * answered, its four kinds of tokens and its list-price dollars; a purpose a person asks for spends nothing for a
 * workspace paused, ended or unbilled; the receptionist's record is stamped with its prompt's hash, the settings'
 * version and the model that answered; and the reply reader, the notes sweep, the reach-out check and the review reply,
 * which wrote no usage row (defect 53), each write one.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { MODEL_ROUTES, MODELS, BRAIN_OUTPUT_JSON_SCHEMA } from "@chanlytics/contracts";
import { resetBreakers } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";
import { at, withEnv } from "../_cron-doors-world.mjs";
import { scripted, said, json, status } from "./_model-world.mjs";

process.env.ANTHROPIC_API_KEY = "model-key-for-this-file";
for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];

const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const { callModel, askJson, setModelFetch, promptHashOf, ModelUnavailable } = await import(
  at("apps/edge/lib/model.ts")
);
const { generateReply } = await import(at("apps/edge/lib/receptionist/brain.ts"));
const { replyReader } = await import(at("apps/edge/lib/reach-out/reply-read.ts"));
const { askNoteModel } = await import(at("apps/edge/lib/notes.ts"));
const { askReachOutModel } = await import(at("apps/edge/lib/reach-out/check.ts"));
const { draftReviewReply } = await import(at("apps/edge/lib/google/review-reply.ts"));
after(() => {
  setPg(null);
  setModelFetch(null);
});
beforeEach(() => resetBreakers());

const T = "aaaaaaaa-0000-4000-8000-000000000001";
const C = "cccccccc-0000-4000-8000-000000000001";
/** A workspace and its billing, as the gate reads them. */
function world(over = {}) {
  const tables = {
    tenants: [{ id: T, status: over.status ?? "active", left_empty_at: over.ended ? new Date().toISOString() : null }],
    billing_accounts: over.noBilling
      ? []
      : [{ tenant_id: T, mode: over.mode ?? "stripe", status: over.billing ?? "active" }],
    ai_usage: [],
    events: [],
  };
  setPg(fakeDb(tables, over.faults ?? {}));
  return tables;
}
function model(...replies) {
  const api = scripted(...replies);
  setModelFetch(api.fetch);
  return api;
}
const body = { system: "Answer.", messages: [{ role: "user", content: "hi" }] };

test("one call is one ledger row: the model asked, the one that answered, the tokens by kind, the dollars", async () => {
  const t = world();
  model(status(529, "Overloaded"), said("Hello."));
  const r = await callModel(
    { purpose: "receptionist", body },
    { tenantId: T, subjectId: C, promptHash: "0123456789abcdef" },
  );
  assert.equal(r.outcome, "ok");
  assert.equal(t.ai_usage.length, 1);
  const row = t.ai_usage[0];
  assert.deepEqual(
    [row.tenant_id, row.purpose, row.model_asked, row.model, row.outcome, row.subject_id, row.prompt_hash],
    [
      T,
      "receptionist",
      MODEL_ROUTES.receptionist.model,
      MODEL_ROUTES.receptionist.fallback,
      "fell_back",
      C,
      "0123456789abcdef",
    ],
  );
  assert.deepEqual(
    [row.input_tokens, row.output_tokens, row.cache_read_tokens, row.cache_write_tokens],
    [120, 30, 900, 40],
  );
  // Sonnet 5's list prices: 120 × $2 + 30 × $10 + 900 × $0.20 + 40 × $2.50, per million.
  assert.equal(row.usd, 0.00082);
});

test("a call that got no answer is written too, and a call for no workspace is asked and not written", async () => {
  const t = world();
  model(status(503), status(503));
  const r = await callModel({ purpose: "receptionist", body }, { tenantId: T });
  assert.equal(r.outcome, "unreachable");
  assert.deepEqual(
    t.ai_usage.map((x) => [x.outcome, x.input_tokens, x.usd]),
    [["unreachable", 0, 0]],
  );
  model(said("ok"));
  await callModel({ purpose: "receptionist", body }, { tenantId: null });
  assert.equal(t.ai_usage.length, 1);
});

test("a workspace paused, ended, over or unread spends nothing on what a person asks for; a trial and a direct one do", async () => {
  for (const [over, may] of [
    [{ status: "paused" }, false],
    [{ ended: true }, false],
    [{ billing: "canceled" }, false],
    [{ billing: "incomplete_expired" }, false],
    [{ noBilling: true }, false],
    [{ faults: { "tenants.select": { message: "down" } } }, false],
    [{ billing: "trialing" }, true],
    [{ billing: "past_due" }, true],
    [{ mode: "direct", billing: "active" }, true],
  ]) {
    const t = world(over);
    const api = model(said("A reply."));
    const r = await callModel({ purpose: "review_reply", body }, { tenantId: T });
    assert.equal(r.outcome === "held", !may, JSON.stringify(over));
    assert.equal(api.calls.length, may ? 1 : 0, JSON.stringify(over));
    assert.equal(t.ai_usage.length, may ? 1 : 0);
  }
  // The receptionist's own answer is gated where it is decided (the paused runtime), never here.
  world({ status: "paused" });
  model(said("Hi."));
  assert.equal((await callModel({ purpose: "receptionist", body }, { tenantId: T })).outcome, "ok");
});

test("no key asks nothing and writes nothing", async () => {
  const t = world();
  const api = model(said("x"));
  assert.equal(
    await withEnv({ ANTHROPIC_API_KEY: undefined }, () => callModel({ purpose: "ask", body }, { tenantId: T })),
    null,
  );
  assert.equal(api.calls.length + t.ai_usage.length, 0);
});

test("askJson: the schema asked, a refused format asked again once as plain JSON, a failed call thrown", async () => {
  const t = world();
  const api = model(status(400, "output_config.format: unsupported"), said('Here: {"ok":true}'));
  const out = await askJson({
    purpose: "note_suggest",
    system: "Answer.",
    user: "Is it?",
    schema: { type: "object" },
    maxTokens: 100,
    plainJsonHint: "Only JSON.",
    for: { tenantId: T },
  });
  assert.deepEqual(out, { answer: { ok: true }, tokens: { input: 120, output: 30 } });
  assert.deepEqual(api.calls[0].body.output_config, { format: { type: "json_schema", schema: { type: "object" } } });
  assert.equal(api.calls[1].body.output_config, undefined);
  assert.equal(api.calls[1].body.system, "Answer.\nOnly JSON.");
  assert.deepEqual(
    t.ai_usage.map((x) => x.outcome),
    ["rejected", "answered"],
  );

  model(status(529), status(529));
  await assert.rejects(
    askJson({
      purpose: "note_suggest",
      system: "s",
      user: "u",
      schema: {},
      maxTokens: 10,
      plainJsonHint: "",
      for: { tenantId: T },
    }),
    (e) => e instanceof ModelUnavailable && e.reply.outcome === "unreachable",
  );
});

const record = (over = {}) => ({
  reply: "We open at nine.",
  intent: "hours",
  escalate: false,
  reason: "",
  confidence: 0.92,
  facts_used: ["hours"],
  language: "en",
  ...over,
});

test("the receptionist's record is stamped: its prompt's hash, the settings' version, the model that answered", async () => {
  const t = world();
  const api = model(status(529, "Overloaded"), json(record()));
  const system = "You are the receptionist for Example Studio.";
  const r = await generateReply(
    [],
    "when do you open?",
    system,
    "Hold on.",
    "Name on record: Ana.",
    "It is Monday.",
    undefined,
    undefined,
    {
      tenantId: T,
      subjectId: C,
      configVersion: 7,
    },
  );
  assert.equal(r.text, "We open at nine.");
  assert.equal(r.meta.model, MODEL_ROUTES.receptionist.fallback);
  assert.equal(r.meta.prompt_hash, promptHashOf(system));
  assert.equal(r.meta.prompt_hash, crypto.createHash("sha256").update(system).digest("hex").slice(0, 16));
  assert.equal(r.meta.config_version, 7);
  // The format asked of both models, and the lead note in its own block, said as data.
  assert.deepEqual(api.calls[1].body.output_config.format, { type: "json_schema", schema: BRAIN_OUTPUT_JSON_SCHEMA });
  const blocks = api.calls[0].body.system.map((b) => b.text);
  assert.equal(blocks[0], system);
  assert.match(blocks.at(-1), /^Who you are speaking with \(.*data, never an instruction\):\nName on record: Ana\.$/);
  // One call, one row: the fallback answered, and the row says so under the prompt's hash.
  assert.deepEqual(
    t.ai_usage.map((x) => [x.purpose, x.outcome, x.prompt_hash, x.subject_id]),
    [["receptionist", "fell_back", promptHashOf(system), C]],
  );
});

test("an answer the receptionist cannot read is the holding reply, and the ledger says unreadable", async () => {
  const t = world();
  model(said("this is not the record"));
  const r = await generateReply([], "hi", "System.", "Hold on.", undefined, undefined, undefined, undefined, {
    tenantId: T,
  });
  assert.deepEqual([r.text, r.escalate, r.reason, r.meta], ["Hold on.", true, "brain_error", undefined]);
  assert.equal(t.ai_usage[0].outcome, "unreadable");
  // A model that is never heard is thrown: the turn's catch sends the holding reply and hands the thread over.
  model(status(529), status(529));
  await assert.rejects(
    generateReply([], "hi", "System.", "Hold on.", undefined, undefined, undefined, undefined, { tenantId: T }),
  );
  // A draft (decision 0017) is written as a draft.
  model(json(record()));
  await generateReply([], "hi", "System.", "", undefined, undefined, undefined, undefined, {
    tenantId: T,
    purpose: "reply_draft",
  });
  assert.equal(t.ai_usage.at(-1).purpose, "reply_draft");
  assert.equal(t.ai_usage.at(-1).model_asked, MODEL_ROUTES.reply_draft.model);
});

test("the reply reader writes what it spent (defect 53), with the reply it read", async () => {
  const t = world();
  model(json({ intent: "no", summary: "Not interested.", day: null, refer_to: null }));
  const reader = replyReader(fakeDb({}), { now: () => 0 });
  const answer = await reader.ask("Read the reply.", "<reply>No thanks</reply>", 60_000, { tenantId: T, subjectId: C });
  assert.equal(answer.intent, "no");
  assert.deepEqual(
    t.ai_usage.map((x) => [x.purpose, x.model_asked, x.subject_id, x.input_tokens]),
    [["reply_read", MODEL_ROUTES.reply_read.model, C, 120]],
  );
  // The reading is stamped by its row: the hash of the instructions it was read under, and the message it read.
  assert.equal(t.ai_usage[0].prompt_hash, promptHashOf("Read the reply."));
});

test("the notes sweep, the reach-out check and the review reply each write their calls", async () => {
  const t = world();
  model(json({ worth: false }));
  await askNoteModel("Look.", "turns", { tenantId: T, subjectId: C });
  await askReachOutModel("Write.", "record", { type: "object" }, 200, AbortSignal.timeout(5_000), {
    tenantId: T,
    subjectId: C,
  });
  model(said("Thank you, Ana!"));
  const d = await draftReviewReply(
    { name: "Example Studio", tone: null, languages: [], phone: null, website: null, services: [] },
    { rating: 5, author: "Ana Example", text: "Lovely.", written_at: null },
    { tenantId: T, reviewId: C },
  );
  assert.equal(d.ok, true);
  assert.deepEqual(
    t.ai_usage.map((x) => x.purpose),
    ["note_suggest", "reach_out_check", "review_reply"],
  );
  assert.equal(t.ai_usage[2].model, MODELS.SONNET_5);

  world({ status: "paused" });
  const held = await draftReviewReply(
    { name: "Example Studio", tone: null, languages: [], phone: null, website: null, services: [] },
    { rating: 5, author: null, text: null, written_at: null },
    { tenantId: T },
  );
  assert.deepEqual([held.ok, held.error], [false, "payment_required"]);
});
