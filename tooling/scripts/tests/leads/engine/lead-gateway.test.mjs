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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const { validateGatewayRequest, GATEWAY_PURPOSES, modelPurposeOf } = await import(
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

test("the purposes, and every one may name an output format: the lead purposes answer as records, and Ask's turn in its answer schema (the Line, D3)", () => {
  // `ask_warm` is a turn's head sent ahead of its question (the dashboard's server/ask/warm.ts): Ask's, counted apart.
  assert.deepEqual(
    [...GATEWAY_PURPOSES],
    ["ask", "ask_warm", "lead_draft", "lead_suggest", "list_draft", "person_draft", "sequence_draft", "message_draft"],
  );
  const draft = validateGatewayRequest({ ...base, output_config: { effort: "low", format } }, "lead_draft");
  assert.deepEqual(draft.request.output_config, { effort: "low", format });
  const ask = validateGatewayRequest({ ...base, output_config: { effort: "low", format } }, "ask");
  assert.deepEqual(ask.request.output_config, { effort: "low", format }, "Ask's own turn keeps its format now");
  assert.deepEqual(
    validateGatewayRequest({ ...base, output_config: { effort: "low" } }).request.output_config,
    { effort: "low" },
    "the second argument defaults to ask, so every caller on main still resolves",
  );
});

test("a format that is not a JSON schema is refused; one of any size goes through (#1675: the 8,000-character bound went)", () => {
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
  assert.equal(validateGatewayRequest({ ...base, output_config: { format: big } }, "lead_draft").ok, true);
});

test("a skill's craft call (message_draft): Ask's route's model, at high effort, up to the skills' ceiling, in the ledger as a template's words", async () => {
  const C = await import("@chanlytics/contracts");
  for (const p of C.SKILL_CRAFT_PURPOSES) assert.ok(GATEWAY_PURPOSES.includes(p), `the edge lets ${p} through`);
  const craft = validateGatewayRequest(
    { ...base, model: C.MODEL_ROUTES.ask.model, max_tokens: 20_000, output_config: { effort: "high", format } },
    "message_draft",
  );
  assert.equal(craft.ok, true);
  assert.equal(craft.request.model, C.MODEL_ROUTES.ask.model, "the writer is the model Ask's route asks");
  assert.equal(craft.request.max_tokens, C.SKILL_CRAFT_MAX_TOKENS, "its thinking counts toward a ceiling of its own");
  assert.deepEqual(craft.request.output_config, { effort: "high", format });
  assert.equal(
    validateGatewayRequest({ ...base, max_tokens: 20_000 }, "lead_draft").request.max_tokens,
    2000,
    "the small drafts keep theirs",
  );
  assert.equal(modelPurposeOf("message_draft"), "template_draft", "a purpose the usage ledger's CHECK already holds");
  assert.ok(C.MODEL_PURPOSES.includes(modelPurposeOf("message_draft")));
  assert.equal(validateGatewayRequest({ ...base, model: "claude-unknown-9" }, "message_draft").ok, false);
});
