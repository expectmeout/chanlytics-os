/**
 * The model gateway's two new purposes.
 *
 * Until the lead finder there was one thing the key was ever spent on -- an
 * Ask turn -- so the door took the word "ask" and nothing else, and the
 * validator kept only the effort out of `output_config`: a JSON-schema format
 * never reached the model. The draft and the first day's suggestions are
 * answered as records, not as prose, so they need that format; Ask's own turn
 * does not, and must not start getting one by accident.
 *
 * So the validator takes the purpose as its second argument, defaulting to
 * "ask" so every caller on main still resolves, and passes a format through
 * only for the two purposes that are not Ask. Both spend Ask's own daily
 * budget (ASK_USAGE_KIND), which is why they live on this door and not a new
 * one.
 *
 * No key is spent here: this file calls the validator directly.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { validateGatewayRequest, GATEWAY_PURPOSES } = await import(
  pathToFileURL(path.join(ROOT, "apps/edge/lib/ask-gateway.ts")).href
);
const base = { model: "claude-sonnet-5", max_tokens: 600, system: "s", messages: [{ role: "user", content: "hi" }] };
const format = {
  type: "json_schema",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["subject"],
    properties: { subject: { type: "string" } },
  },
};

test("three purposes, and only the two that are not Ask may name an output format", () => {
  assert.deepEqual([...GATEWAY_PURPOSES], ["ask", "lead_draft", "lead_suggest", "list_draft"]);
  const draft = validateGatewayRequest({ ...base, output_config: { effort: "low", format } }, "lead_draft");
  assert.deepEqual(draft.request.output_config, { effort: "low", format });
  const ask = validateGatewayRequest({ ...base, output_config: { effort: "low", format } }, "ask");
  assert.deepEqual(ask.request.output_config, { effort: "low" }, "Ask's own turn is unchanged");
  assert.deepEqual(
    validateGatewayRequest({ ...base, output_config: { effort: "low" } }).request.output_config,
    { effort: "low" },
    "the second argument defaults to ask, so every caller on main still resolves",
  );
});

test("a format that is not a JSON schema, or is too large, is refused", () => {
  assert.equal(
    validateGatewayRequest({ ...base, output_config: { format: { type: "text" } } }, "lead_draft").ok,
    false,
  );
  assert.equal(
    validateGatewayRequest(
      { ...base, output_config: { format: { type: "text", schema: { type: "object" } } } },
      "lead_draft",
    ).ok,
    false,
    "a schema under another type is not a JSON schema",
  );
  const big = { type: "json_schema", schema: { type: "object", description: "x".repeat(9_000) } };
  assert.equal(validateGatewayRequest({ ...base, output_config: { format: big } }, "lead_draft").ok, false);
});
