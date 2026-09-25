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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
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

test("the edge allows every profile and defaults to the same name, so the loop and the gateway cannot disagree", async () => {
  const { GATEWAY_MODELS, validateGatewayRequest } = await import(at("apps/edge/lib/ask-gateway.ts"));
  for (const id of ASK_MODELS) assert.ok(GATEWAY_MODELS.includes(id), `${id} allowed on the edge`);
  const ok = validateGatewayRequest({ max_tokens: 100, messages: [{ role: "user", content: "hi" }] });
  assert.ok(ok.ok && ok.request.model === ASK_MODEL);
});
