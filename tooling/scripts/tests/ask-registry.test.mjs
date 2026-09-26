/**
 * The assistant's tool registry (the Phase 3 plan, PR 3.1): one definition per tool, the schema the model is shown
 * generated from its zod, the input parsed by that zod before the handler runs, dispatch a map.
 *
 * The move is proven as data: the tools the loop sends a viewer and an operator deep-equal the fixture frozen from
 * the two files the registry replaced, name by name. The parse is proven by running the registry over the database
 * in memory and watching what reached it: an input a schema refuses comes back in the zod's words and the handler
 * never runs, a `null` on an optional key is absent, an unknown key is stripped, an unknown tool is refused as it
 * always was. No source text is read here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "./_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { READ_TOOLS, ACT_TOOLS, ACT_TOOL_NAMES, READ_DEFS, ACT_DEFS, toolSchema, runTool, buildProposal, toolLabel } =
  await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
const { newToolContext } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));

const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(ROOT, "tooling/scripts/tests/fixtures/ask-tools-0c136563.json"), "utf8"),
);
/** What the loop sends per tool (loop.ts): the three fields, nothing else. */
const sent = (d) => ({ name: d.name, description: d.description, input_schema: d.input_schema });

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const C1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const NOW = new Date("2026-09-14T14:00:00Z");
/** A context over an empty workspace in memory: what a tool reads is in `supabase.seen`. */
const contextFor = (role = "operator") => {
  const supabase = fakeDb({ contacts: [], conversations: [], templates: [] }, {}, {});
  return {
    supabase,
    t: newToolContext(
      { supabase, userId: "u1", email: "ada@example.com", params: {} },
      A,
      role,
      "America/New_York",
      NOW,
    ),
  };
};

test("the registry sends a viewer and an operator the tools the two files sent: the same twenty-six, names, order, descriptions and schemas, deep-equal to the fixture", () => {
  const viewer = READ_TOOLS.map(sent);
  const operator = [...READ_TOOLS, ...ACT_TOOLS].map(sent);
  assert.equal(viewer.length, FIXTURE.viewer.length, "a viewer's count");
  assert.equal(operator.length, FIXTURE.operator.length, "an operator's count");
  for (let i = 0; i < FIXTURE.operator.length; i++) {
    const want = FIXTURE.operator[i];
    assert.equal(operator[i].name, want.name, `tool ${i} is ${want.name}`);
    assert.deepEqual(operator[i], want, want.name);
  }
  assert.deepEqual(viewer, FIXTURE.viewer, "a viewer: the fourteen reads");
  assert.deepEqual(operator, FIXTURE.operator, "an operator: the reads, then the twelve acts");
  assert.deepEqual(
    [...ACT_TOOL_NAMES],
    ACT_TOOLS.map((d) => d.name),
    "the act names the loop tells apart",
  );
});

test("the schemas are deterministic: built twice they are the same bytes, and every tool's is toolSchema of its own zod", () => {
  const build = (defs) =>
    defs.map((d) => ({ name: d.name, description: d.description, input_schema: toolSchema(d.input) }));
  assert.equal(JSON.stringify(build(READ_DEFS)), JSON.stringify(build(READ_DEFS)), "the reads, twice");
  assert.equal(JSON.stringify(build(ACT_DEFS)), JSON.stringify(build(ACT_DEFS)), "the acts, twice");
  assert.equal(JSON.stringify(build(READ_DEFS)), JSON.stringify(READ_TOOLS), "and the array the loop holds");
  assert.equal(JSON.stringify(build(ACT_DEFS)), JSON.stringify(ACT_TOOLS));
  for (const d of [...READ_DEFS, ...ACT_DEFS]) {
    const tool = [...READ_TOOLS, ...ACT_TOOLS].find((x) => x.name === d.name);
    assert.deepEqual(tool.input_schema, toolSchema(d.input), d.name);
  }
  // The normaliser's four moves, on the one zod each shows: no $schema anywhere, no safe-integer bounds on an
  // integer, the three periods as an integer enum, and `required: []` where nothing is required.
  const flat = JSON.stringify([...READ_TOOLS, ...ACT_TOOLS]);
  assert.ok(!flat.includes("$schema") && !flat.includes("9007199254740991"));
  assert.deepEqual(READ_TOOLS.find((x) => x.name === "get_report").input_schema.properties.days, {
    type: "integer",
    enum: [7, 30, 90],
  });
  assert.deepEqual(READ_TOOLS.find((x) => x.name === "get_today").input_schema.required, []);
});

test("an input a schema refuses comes back in the zod's words, as an error, and the handler never runs", async () => {
  const { supabase, t } = contextFor();
  const missing = await runTool(t, { name: "get_thread", input: {} });
  assert.deepEqual(missing, {
    result: JSON.stringify({ error: "get_thread: conversation_id Invalid input: expected string, received undefined" }),
    isError: true,
    label: "Reading the conversation",
  });
  const eight = await runTool(t, { name: "get_report", input: { days: 8 } });
  assert.deepEqual(
    [eight.isError, JSON.parse(eight.result).error],
    [true, "get_report: days Invalid option: expected one of 7|30|90"],
    "the schema refuses a period it does not list, and says the three",
  );
  const verb = await buildProposal(t, "propose_thread_verb", { conversation_id: C1, verb: "delete" });
  assert.deepEqual(
    [verb.proposal, verb.isError, JSON.parse(verb.result).error],
    [
      null,
      true,
      'propose_thread_verb: verb Invalid option: expected one of "take_over"|"hand_back"|"snooze"|"wake"|"archive"|"resolve"',
    ],
  );
  const shape = await runTool(t, { name: "get_thread", input: [C1] });
  assert.match(JSON.parse(shape.result).error, /^get_thread: Invalid input: expected object, received array$/);
  assert.deepEqual(supabase.seen, [], "nothing was read: the handler never ran");
});

test("a null on an optional key is absent; a null on a required key is refused; an unknown key is stripped, not refused", async () => {
  const { supabase, t } = contextFor("owner");
  // audience_id: null passes the parse as no audience_id: the handler runs, and refuses the template id itself.
  const nul = await buildProposal(t, "propose_broadcast", {
    template_id: "nope",
    audience_kind: "everyone",
    audience_id: null,
  });
  assert.equal(JSON.parse(nul.result).error, "template_id must be an id list_audiences returned");
  // Nested too: a null inside the change is dropped, and the change becomes a card.
  const nested = await buildProposal(t, "propose_settings", {
    change: { op: "add_closure", date: "2026-12-25", note: null, until: null },
  });
  assert.equal(nested.isError, false, nested.result);
  assert.deepEqual(nested.proposal.payload.change, { op: "add_closure", date: "2026-12-25" });
  // A required key given null stays null, and the zod refuses it by name.
  const required = await runTool(t, { name: "get_thread", input: { conversation_id: null } });
  assert.deepEqual(
    [required.isError, JSON.parse(required.result).error],
    [true, "get_thread: conversation_id Invalid input: expected string, received null"],
  );
  // An extra key is dropped on the way in: the card is made, without it.
  const extra = await buildProposal(t, "propose_invite", { email: "ada@example.com", role: "viewer", extra: 1 });
  assert.equal(extra.isError, false, extra.result);
  assert.deepEqual(extra.proposal.payload, { email: "ada@example.com", role: "viewer" });
  assert.deepEqual(supabase.seen, [], "none of these reached the database");
});

test("an unknown tool is refused as it always was, for a read and for an act", async () => {
  const { t } = contextFor();
  assert.deepEqual(await runTool(t, { name: "teleport", input: {} }), {
    result: JSON.stringify({ error: "unknown tool teleport" }),
    isError: true,
    label: "Running teleport",
  });
  assert.deepEqual(await buildProposal(t, "teleport", {}), {
    proposal: null,
    result: JSON.stringify({ error: "unknown tool teleport" }),
    isError: true,
  });
  assert.equal(toolLabel("list_audiences"), "Reading the lists and templates", "a registered read has its own line");
});

test("the lead search keeps its order: the owner check comes before the plan's own schema, so a non-owner with a malformed plan hears the owner words, and an owner the plan's", async () => {
  const ask = {
    looking_for: "local_businesses",
    country: "US",
    count: 0,
    who: "personal trainers",
    who_one: "personal trainer",
    category_key: "Personal-Trainer",
    terms: ["personal trainers"],
    region: "TX",
    contact: "email",
    criteria: [],
    asked: "find me personal trainers in Texas",
  };
  const operator = await buildProposal(contextFor("operator").t, "propose_lead_search", ask);
  assert.match(JSON.parse(operator.result).error, /^only an owner can start a lead search/);
  const owner = await buildProposal(contextFor("owner").t, "propose_lead_search", ask);
  assert.equal(JSON.parse(owner.result).error, "the plan is not complete: count Too small: expected number to be >=1");
});
