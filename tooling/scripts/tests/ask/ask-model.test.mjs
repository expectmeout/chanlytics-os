/**
 * The model Ask runs on is whatever its environment names (spec 5.11, opened 5 Oct 2026): any Claude model's id, at the
 * effort the environment names, the registry's default when it names none. The dashboard picks (server/ask/model.ts),
 * the edge lets Ask name any model that reads as one, and a name the API does not know is answered by the route's
 * fallback (model-port.test.mjs), so a misspelt variable never takes Ask down.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  ASK_EFFORT,
  ASK_MODEL,
  MODEL_EFFORTS,
  MODEL_ROUTES,
  askModelProfile,
  priceOf,
  readsAsModel,
} from "@chanlytics/contracts";
import { fieldsOf, logLineOf } from "../_log-lines.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const SONNET_5_5 = "claude-sonnet-5-5";
/** A model no list here has heard of: what trying a new one looks like. */
const UNLISTED = "claude-some-model-9";

/** Set or clear each variable as it was. */
function restore(was) {
  for (const [k, v] of Object.entries(was)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

test("the profile: the name the environment gives, whatever Claude model it is, at low effort unless it names another; the default is the registry's, Opus 5.5", () => {
  assert.equal(ASK_MODEL, MODEL_ROUTES.ask.model);
  assert.equal(ASK_MODEL, "claude-opus-5-5", "Ruben's decision at approval, 25 Sep 2026");
  assert.equal(ASK_EFFORT, "low");
  assert.deepEqual([...MODEL_EFFORTS], ["low", "medium", "high"]);
  // A model the registry has never heard of is run as named: trying one is a variable, never a change to a list.
  for (const id of [SONNET_5_5, "claude-sonnet-5", "claude-haiku-4-5-20251001", UNLISTED])
    assert.deepEqual(askModelProfile(id), { id, effort: "low" }, id);
  assert.deepEqual(askModelProfile(SONNET_5_5, "medium"), { id: SONNET_5_5, effort: "medium" });
  assert.deepEqual(askModelProfile(undefined, "high"), { id: ASK_MODEL, effort: "high" });
  assert.deepEqual(askModelProfile(SONNET_5_5, "maximum"), { id: SONNET_5_5, effort: "low" }, "an effort that is none");
  assert.deepEqual(priceOf(SONNET_5_5), { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 }, "its list price");
  assert.equal(priceOf(UNLISTED), null, "a model with no price is run, and its dollars are not guessed");
});

test("the lookup: unset, empty, or a name that does not read as a model is the default, never a throw", () => {
  for (const none of [undefined, null, "", "  "]) assert.equal(askModelProfile(none).id, ASK_MODEL);
  for (const bad of ["sonnet", "claude sonnet 5", "gpt-9", "claude-", "CLAUDE-OPUS", "claude-x; rm"]) {
    assert.equal(readsAsModel(bad), false, bad);
    assert.equal(askModelProfile(bad).id, ASK_MODEL, bad);
  }
  assert.equal(askModelProfile(" claude-sonnet-5-5 ").id, SONNET_5_5, "a name pasted with a space around it");
  assert.ok(readsAsModel(ASK_MODEL) && readsAsModel(SONNET_5_5));
});

test("the edge lets Ask name any model that reads as one, refuses a name that does not, and holds the small drafts to their own; a request that names no model gets the fallback an older dashboard expects", async () => {
  const { GATEWAY_MODELS, GATEWAY_FALLBACK_MODEL, validateGatewayRequest } = await import(
    at("apps/edge/lib/ask-gateway.ts")
  );
  const body = (model) => ({ model, max_tokens: 100, messages: [{ role: "user", content: "hi" }] });
  for (const id of [ASK_MODEL, MODEL_ROUTES.ask.fallback, SONNET_5_5, UNLISTED]) {
    const v = validateGatewayRequest(body(id), "ask");
    assert.ok(v.ok, `${id} may be asked`);
    assert.equal(v.request.model, id);
  }
  for (const bad of ["gpt-9", "claude sonnet", ""]) {
    const v = validateGatewayRequest(body(bad), "ask");
    assert.deepEqual([v.ok, v.detail], [false, "unknown model"], bad);
  }
  // The drafts' model is the registry's, not a variable's: their list is closed, as it was.
  assert.equal(validateGatewayRequest(body(MODEL_ROUTES.lead_json.model), "lead_draft").ok, true);
  assert.equal(validateGatewayRequest(body(UNLISTED), "lead_draft").ok, false);
  assert.ok(GATEWAY_MODELS.includes(MODEL_ROUTES.lead_json.model));
  // Every effort a profile may carry rides through; another is dropped, never refused.
  for (const effort of MODEL_EFFORTS) {
    const v = validateGatewayRequest({ ...body(SONNET_5_5), output_config: { effort } });
    assert.equal(v.request.output_config.effort, effort);
  }
  const over = validateGatewayRequest({ ...body(SONNET_5_5), output_config: { effort: "max" } });
  assert.equal(over.request.output_config, undefined);
  const ok = validateGatewayRequest({ max_tokens: 100, messages: [{ role: "user", content: "hi" }] });
  assert.ok(ok.ok, "an unnamed model is not refused");
  assert.equal(ok.request.model, GATEWAY_FALLBACK_MODEL, "it gets the edge's fallback, never Ask's default");
  assert.equal(GATEWAY_FALLBACK_MODEL, "claude-sonnet-5", "what every caller ran on before each named its own");
});

test("the dashboard picks by environment: unset is the default, a model's name is that model, ASK_EFFORT its effort; a name or an effort that reads as none runs the default and is said once", async () => {
  const { askModel } = await import(at("apps/dashboard/src/server/ask/model.ts"));
  const was = { ASK_MODEL: process.env.ASK_MODEL, ASK_EFFORT: process.env.ASK_EFFORT };
  const warned = [];
  const warn = console.warn;
  console.warn = (...args) => {
    const line = logLineOf(args);
    if (line) warned.push(line);
  };
  try {
    delete process.env.ASK_MODEL;
    delete process.env.ASK_EFFORT;
    assert.deepEqual(askModel(), { id: ASK_MODEL, effort: "low" });
    process.env.ASK_MODEL = SONNET_5_5;
    assert.deepEqual(askModel(), { id: SONNET_5_5, effort: "low" });
    process.env.ASK_EFFORT = "medium";
    assert.deepEqual(askModel(), { id: SONNET_5_5, effort: "medium" });
    process.env.ASK_MODEL = UNLISTED;
    assert.deepEqual(askModel(), { id: UNLISTED, effort: "medium" });
    assert.equal(warned.filter((l) => l.event === "ask_model_unknown").length, 0, "a model run as named warns nobody");
    process.env.ASK_MODEL = "sonnet five";
    process.env.ASK_EFFORT = "maximum";
    assert.deepEqual(askModel(), { id: ASK_MODEL, effort: "low" });
    askModel();
    const unknown = warned.filter((l) => l.event === "ask_model_unknown");
    assert.equal(unknown.length, 1, "said once, not on every turn");
    assert.equal(unknown[0].level, "warn");
    assert.deepEqual(
      fieldsOf(unknown[0]),
      { name: "sonnet five", effort: "maximum", ran: ASK_MODEL, at: "low" },
      "what was asked for and what is run",
    );
  } finally {
    console.warn = warn;
    restore(was);
  }
});

test("the loop asks the profile: the request names its id and its effort, and the turn returns the model it ran on", async () => {
  const { runAskTurn } = await import(at("apps/dashboard/src/server/ask/loop.ts"));
  const { buildProposal } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
  const { workspaceFacts } = await import(at("apps/dashboard/src/server/ask/prompt.ts"));
  const { fakeDb } = await import("../_fake-db.mjs");
  const written = JSON.stringify({
    say: { headline: "Nobody is waiting.", detail: "" },
    show: {
      figures: [],
      items: [],
      breakdown: { label: "", total: 0, parts: [], source: { kind: "none", id: "", label: "" } },
    },
    do: { open: { source: { kind: "none", id: "", label: "" }, label: "", now: false }, next: [] },
    language: "en",
  });
  const requests = [];
  const round = async (c) => {
    requests.push(c.request);
    return {
      blocks: [{ type: "text", id: "", name: "", text: written, json: "" }],
      stopReason: "end_turn",
      streamError: null,
    };
  };
  const was = { ASK_MODEL: process.env.ASK_MODEL, ASK_EFFORT: process.env.ASK_EFFORT };
  try {
    // A model no list in this repository names, at an effort of its own.
    process.env.ASK_MODEL = UNLISTED;
    process.env.ASK_EFFORT = "medium";
    const r = await runAskTurn(
      {
        ctx: { supabase: fakeDb({}), userId: "u1", email: "ada@example.com", params: {} },
        tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role: "operator",
        facts: workspaceFacts("Harbor", "America/New_York", null, []),
        timezone: "America/New_York",
        personLabel: "ada@example.com (operator)",
        language: "en",
        scope: null,
        surface: "today",
        history: [],
        text: "Who needs me?",
        emit: () => {},
        now: new Date("2026-09-14T14:00:00Z"),
      },
      { round, shape: async () => "", tool: async () => ({ result: "{}", isError: false }), propose: buildProposal },
    );
    assert.equal(r.failed, false, r.failure ?? "");
    assert.equal(r.model, UNLISTED);
    assert.equal(requests[0].model, UNLISTED);
    assert.equal(requests[0].output_config.effort, "medium");
    assert.deepEqual([r.shape.model, r.shape.effort], [UNLISTED, "medium"], "and the stored turn says both");
  } finally {
    restore(was);
  }
});
