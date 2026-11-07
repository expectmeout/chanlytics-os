/**
 * Ask says no note to itself (3 Nov 2026): the chart's series and values took the answer's format past what the API will
 * compile, so from #2046 every turn was refused once ("The compiled grammar is too large") and asked again with no
 * format; with none, words beside a call stood as the answer, and an owner who asked for 100 dentists read "I need the
 * lead search proposal tool." over the card.
 *
 * - The format the API compiles leaves the chart to the answer tool, whose input is not compiled.
 * - With the answer tool on, an answer is never text beside a call, whatever became of the format.
 *
 * Executed: the loop over a scripted model and cards made by the real `propose`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
// Read as a module, so a name contracts does not export yet is a failing assertion, not a file that will not load.
const { ASK_ANSWER_FORMAT, ASK_ANSWER_TEXT_FORMAT } =
  await import("../../../apps/dashboard/src/server/ask/answer-format.ts");
const { runAskTurn } = await import(at("apps/dashboard/src/server/ask/loop/loop.ts"));
const { GatewayRefused } = await import(at("apps/dashboard/src/server/shared/model/gateway.ts"));
const { workspaceFacts } = await import(at("apps/dashboard/src/server/ask/prompt/stable-system.ts"));
const { propose } = await import(at("apps/dashboard/src/server/ask/tools/context/context.ts"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ROBIN = "abababab-abab-4aba-8aba-abababababa1";
const TZ = "America/New_York";
const NOW = new Date("2026-10-15T14:00:00Z");
const NOTE = "I need the lead search proposal tool.";
const TOO_LARGE =
  "400 The compiled grammar is too large, which would cause performance issues. Simplify your tool schemas or reduce the number of strict tools.";

const words = (text) => ({ type: "text", id: "", name: "", text, json: "" });
const call = {
  type: "tool_use",
  id: "c-note",
  name: "propose_person",
  text: "",
  json: JSON.stringify({ action: "note", contact_id: ROBIN, body: "Prefers mornings." }),
};
const card = () =>
  propose({
    kind: "note",
    title: "A note on Robin",
    summary: "Prefers mornings",
    payload: { contact_id: ROBIN, body: "Prefers mornings.", team_only: false, who: "Robin" },
  });
const noteBesideCard = (onText) => {
  onText(NOTE);
  return { blocks: [words(NOTE), call], stopReason: "tool_use", streamError: null };
};

async function turnOf(rounds) {
  const events = [];
  const requests = [];
  const result = await runAskTurn(
    {
      ctx: { supabase: fakeDb({}), userId: "u1", email: "ada@example.com", params: {} },
      tenantId: A,
      role: "owner",
      facts: workspaceFacts("Harbor", TZ, null, NOW, []),
      timezone: TZ,
      personLabel: "ada@example.com (owner)",
      language: "en",
      scope: null,
      surface: "today",
      history: [],
      text: "put a note on Robin that they prefer mornings",
      emit: (ev) => events.push(ev),
      now: NOW,
    },
    {
      round: async (c, onText) => {
        requests.push(c.request);
        return rounds.shift()(onText);
      },
      context: async () => null,
      shape: async () => "",
      tool: async () => ({ result: "{}", isError: false }),
      propose: async () => card(),
    },
  );
  return { result, requests, said: events.filter((e) => e.t === "say").map((e) => e.detail || e.headline) };
}

const refused = () => {
  throw new GatewayRefused({ kind: "bad_request", message: TOO_LARGE });
};

test("words beside a card are never the answer, with the format taken", async () => {
  const { result, said } = await turnOf([noteBesideCard]);
  assert.equal(result.answer.say.headline, "One card to review: A note on Robin.");
  assert.ok(!said.includes(NOTE), "nor said while it is written");
});

test("words beside a card are never the answer, with the format refused: the answer tool is how an answer comes", async () => {
  const { result, said, requests } = await turnOf([refused, noteBesideCard]);
  assert.equal(requests[1].output_config.format, undefined, "the same round, asked with no format");
  assert.equal(result.shape.format, false);
  assert.equal(result.answer.say.headline, "One card to review: A note on Robin.");
  assert.ok(!result.text.includes(NOTE), result.text);
  assert.ok(!said.includes(NOTE), "nor said while it is written");
});

test("with no format and no answer tool, words are how Ask answers: only then do they stand beside a card", async () => {
  process.env.ASK_ANSWER_TOOL = "off";
  try {
    const { result } = await turnOf([refused, noteBesideCard]);
    assert.equal(result.text, NOTE);
  } finally {
    delete process.env.ASK_ANSWER_TOOL;
  }
});

test("the format the API compiles leaves the chart to the answer tool", async () => {
  const { requests } = await turnOf([noteBesideCard]);
  const [request] = requests;
  assert.deepEqual(request.output_config.format, { type: "json_schema", schema: ASK_ANSWER_TEXT_FORMAT });
  const written = ASK_ANSWER_TEXT_FORMAT.properties.show;
  assert.equal(written.properties.chart, undefined);
  assert.ok(!written.required.includes("chart"), "and it requires none: a text answer reads with no chart");
  const tool = request.tools.find((t) => t.name === "answer");
  assert.deepEqual(tool.input_schema, ASK_ANSWER_FORMAT, "the tool carries the answer whole");
  assert.ok(tool.input_schema.properties.show.properties.chart.properties.series, "its chart among it");
});

/** Every object and array the schema asks for: what a grammar grows with, as near as a test can see it. */
const nodes = (s) =>
  s && typeof s === "object"
    ? Number(s.type === "object" || s.type === "array") + Object.values(s).reduce((n, v) => n + nodes(v), 0)
    : 0;

test("the format stays under what the API last took: the limit is unpublished, and a refusal is only an error line", () => {
  // Measured 3 Nov 2026: the format the API last compiled held 23, chart and all, and the first it refused 25.
  assert.ok(nodes(ASK_ANSWER_TEXT_FORMAT) <= 23, String(nodes(ASK_ANSWER_TEXT_FORMAT)));
});
