/**
 * The model Ask runs on is a profile (spec 5.11): one list in contracts, a
 * default, and a lookup that never throws. The dashboard picks by environment
 * (server/ask/model.ts); the edge allows the same names (GATEWAY_MODELS).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ASK_MODEL, ASK_MODELS, ASK_MODEL_PROFILES, askModelProfile } from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

test("the profiles: one per name in the list, Opus 5.5 the default, every profile at one effort, no forced tool choice on Opus 5.5, thinking replayed either way", () => {
  assert.deepEqual([...ASK_MODELS], ["claude-opus-5-5", "claude-sonnet-5"]);
  assert.equal(ASK_MODEL, "claude-opus-5-5", "Ruben's decision at approval, 25 Sep 2026");
  for (const id of ASK_MODELS) {
    const p = ASK_MODEL_PROFILES[id];
    assert.equal(p.id, id);
    assert.ok(p.effort === "low" || p.effort === "medium");
    assert.ok(p.thinking === "always" || p.thinking === "adaptive");
  }
  assert.equal(ASK_MODEL_PROFILES["claude-opus-5-5"].forcedToolChoice, false, "any/tool is a 400 on Opus 5.5");
  assert.equal(ASK_MODEL_PROFILES["claude-opus-5-5"].thinking, "always");
  assert.equal(ASK_MODEL_PROFILES["claude-sonnet-5"].thinking, "adaptive");
});

test("the lookup: a name in the list is its profile; unset, empty or unknown is the default, never a throw", () => {
  assert.equal(askModelProfile("claude-sonnet-5").id, "claude-sonnet-5");
  assert.equal(askModelProfile(undefined).id, ASK_MODEL);
  assert.equal(askModelProfile(null).id, ASK_MODEL);
  assert.equal(askModelProfile("").id, ASK_MODEL);
  assert.equal(askModelProfile("claude-9").id, ASK_MODEL);
});

test("the edge allows every profile, and a request that names no model gets the fallback an older dashboard expects, never a refusal", async () => {
  const { GATEWAY_MODELS, GATEWAY_FALLBACK_MODEL, validateGatewayRequest } = await import(
    at("apps/edge/lib/ask-gateway.ts")
  );
  for (const id of ASK_MODELS) assert.ok(GATEWAY_MODELS.includes(id), `${id} allowed on the edge`);
  const ok = validateGatewayRequest({ max_tokens: 100, messages: [{ role: "user", content: "hi" }] });
  assert.ok(ok.ok, "an unnamed model is not refused");
  assert.equal(ok.request.model, GATEWAY_FALLBACK_MODEL, "it gets the edge's fallback, never Ask's default");
  assert.equal(GATEWAY_FALLBACK_MODEL, "claude-sonnet-5", "what every caller ran on before each named its own");
});

test("the dashboard picks by environment: unset is the default, a name in the list is that profile, an unknown name is the default and a warning once", async () => {
  const { askModel } = await import(at("apps/dashboard/src/server/ask/model.ts"));
  const was = process.env.ASK_MODEL;
  const warned = [];
  const warn = console.warn;
  console.warn = (name, rest) => warned.push([name, rest]);
  try {
    delete process.env.ASK_MODEL;
    assert.equal(askModel().id, ASK_MODEL);
    process.env.ASK_MODEL = "claude-sonnet-5";
    assert.equal(askModel().id, "claude-sonnet-5");
    process.env.ASK_MODEL = "claude-9";
    assert.equal(askModel().id, ASK_MODEL);
    askModel();
    assert.equal(warned.filter(([n]) => n === "ask_model_unknown").length, 1, "said once, not on every turn");
  } finally {
    console.warn = warn;
    if (was === undefined) delete process.env.ASK_MODEL;
    else process.env.ASK_MODEL = was;
  }
});

test("the loop asks the profile: the request names its id and its effort, and the turn returns the model it ran on", async () => {
  const { runAskTurn } = await import(at("apps/dashboard/src/server/ask/loop.ts"));
  const { buildProposal } = await import(at("apps/dashboard/src/server/ask/proposals.ts"));
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
  const was = process.env.ASK_MODEL;
  try {
    process.env.ASK_MODEL = "claude-sonnet-5";
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
      { round, snapshot: async () => "", tool: async () => ({ result: "{}", isError: false }), propose: buildProposal },
    );
    assert.equal(r.failed, false, r.failure ?? "");
    assert.equal(r.model, "claude-sonnet-5");
    assert.equal(requests[0].model, "claude-sonnet-5");
    assert.equal(requests[0].output_config.effort, ASK_MODEL_PROFILES["claude-sonnet-5"].effort);
    assert.equal(r.shape.model, "claude-sonnet-5");
    assert.equal(r.shape.effort, ASK_MODEL_PROFILES["claude-sonnet-5"].effort);
  } finally {
    if (was === undefined) delete process.env.ASK_MODEL;
    else process.env.ASK_MODEL = was;
  }
});
