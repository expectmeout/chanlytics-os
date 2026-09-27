/**
 * The assistant's tool registry (the Phase 3 plan, PR 3.1): one definition per tool, the schema the model is shown
 * generated from its zod, the input parsed by that zod before the handler runs, dispatch a map.
 *
 * The move was proven as data against the fixture frozen from the two files the registry replaced. PR 3.3 (D9)
 * changed the descriptions on purpose, so the fixture now holds what must NOT move: the names, their order, and every
 * schema's types, required keys, enums and additionalProperties. The words are held by what the docs ask of them:
 * three sentences at least, the sibling named where the plan's table has one, no two alike, and the role an act
 * description names taken from its card's spec. The parse is proven by running the registry over the database in
 * memory and watching what reached it: an input a schema refuses comes back in the zod's words and the handler never
 * runs, a `null` on an optional key is absent, an unknown key is stripped, an unknown tool is refused as it always
 * was. No source text is read here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const {
  toApiTools,
  ACT_TOOL_NAMES,
  READ_DEFS,
  ACT_DEFS,
  toolSchema,
  runTool,
  buildProposal,
  toolLabel,
  newToolContext,
} = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
// The tools as the loop offers them: a viewer the reads; an owner the reads, then the acts.
const READ_TOOLS = toApiTools("viewer", true);
const ACT_TOOLS = toApiTools("owner", true).slice(READ_TOOLS.length);

const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(ROOT, "tooling/scripts/tests/fixtures/ask-tools-0c136563.json"), "utf8"),
);
/** What the loop sends per tool (loop.ts): the three fields, and the examples where a tool carries them. */
const sent = (d) => ({
  name: d.name,
  description: d.description,
  input_schema: d.input_schema,
  ...(d.input_examples ? { input_examples: d.input_examples } : {}),
});
/** A schema without its per-property descriptions: the shape the fixture froze, whatever words a property gains. */
const shapeOf = (node) => {
  if (Array.isArray(node)) return node.map(shapeOf);
  if (!node || typeof node !== "object") return node;
  const out = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === "description") continue;
    out[k] = k === "properties" ? Object.fromEntries(Object.entries(v).map(([p, s]) => [p, shapeOf(s)])) : shapeOf(v);
  }
  return out;
};
/** The pairs the Phase 3 plan's table joins (D11): each description names the other, so the model knows when to prefer it. */
const SIBLINGS = {
  list_threads: "get_thread",
  get_thread: "list_threads",
  search_people: "get_person",
  get_person: "search_people",
  list_calls: "get_call",
  get_call: "list_calls",
  get_calendar: "get_openings",
  get_openings: "get_calendar",
  list_audiences: "list_playbooks",
  list_playbooks: "list_audiences",
  draft_reply: "propose_steer",
  propose_steer: "draft_reply",
  propose_broadcast: "propose_playbook",
  propose_playbook: "propose_broadcast",
};
/** Sentence ends: a full stop, a question mark or an exclamation mark followed by a space or the end. */
const sentences = (s) => (s.match(/[.!?](\s|$)/g) ?? []).length;
/** Each act tool's card kind, so its description's role words are held to the kind's spec (the brief's 3b). */
const KIND_OF = {
  draft_reply: "reply",
  propose_steer: "steer",
  propose_thread_verb: "thread_verb",
  propose_person_mode: "person_mode",
  propose_deal: "deal",
  propose_policy: "policy",
  propose_settings: "settings",
  propose_whisper: "whisper",
  propose_broadcast: "broadcast",
  propose_playbook: "playbook",
  propose_invite: "invite",
  propose_lead_search: "lead_search",
};

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

test("the registry sends a viewer and an operator the tools the fixture froze: the same twenty-six names in the same order, and every schema's types, required keys, enums and additionalProperties unmoved", () => {
  const viewer = READ_TOOLS.map(sent);
  const operator = [...READ_TOOLS, ...ACT_TOOLS].map(sent);
  assert.deepEqual(
    viewer.map((t) => t.name),
    FIXTURE.viewer.map((t) => t.name),
    "a viewer: the fourteen reads, in order",
  );
  assert.deepEqual(
    operator.map((t) => t.name),
    FIXTURE.operator.map((t) => t.name),
    "an operator: the reads, then the twelve acts, in order",
  );
  for (let i = 0; i < FIXTURE.operator.length; i++) {
    const want = FIXTURE.operator[i];
    assert.deepEqual(shapeOf(operator[i].input_schema), shapeOf(want.input_schema), `${want.name}'s schema`);
  }
  assert.deepEqual(
    [...ACT_TOOL_NAMES],
    ACT_TOOLS.map((d) => d.name),
    "the act names the loop tells apart",
  );
});

test("every description is at least three sentences, names its sibling where the plan's table has one, and no two are the same (D9)", () => {
  const all = [...READ_TOOLS, ...ACT_TOOLS];
  for (const t of all) {
    assert.ok(sentences(t.description) >= 3, `${t.name}: ${sentences(t.description)} sentence(s)`);
    const sibling = SIBLINGS[t.name];
    if (sibling) assert.ok(t.description.includes(sibling), `${t.name} names ${sibling}`);
  }
  assert.equal(new Set(all.map((t) => t.description)).size, all.length, "no two descriptions are equal");
  const names = new Set(all.map((t) => t.name));
  for (const [a, b] of Object.entries(SIBLINGS)) assert.ok(names.has(a) && names.has(b), `${a} and ${b} are tools`);
});

test("an act description names who may approve its card as the card's spec says it: an owner or a partner where a partner's route commits, an owner where an owner's does, and no role where an operator's does", async () => {
  const { PROPOSAL_SPECS } = await import("@chanlytics/contracts");
  assert.deepEqual(Object.keys(KIND_OF).sort(), [...ACT_TOOL_NAMES].sort(), "every act tool has its kind here");
  for (const t of ACT_TOOLS) {
    const needs = PROPOSAL_SPECS[KIND_OF[t.name]].needs;
    assert.ok(!/owner-only/i.test(t.description), `${t.name}: the role is said in the spec's words`);
    // The whole clause, head and tail, per `needs`: one derivation in the registry (tools/context.ts approvalWords).
    if (needs === "partner")
      assert.ok(
        t.description.includes(
          "Only an owner or a partner can approve it: for anyone else, say so and that one of them can ask.",
        ),
        `${t.name} needs a partner`,
      );
    else if (needs === "owner")
      assert.ok(
        t.description.includes("Only an owner can approve it: for anyone else, say so and that an owner can ask.") &&
          !/partner/i.test(t.description),
        `${t.name} needs an owner`,
      );
    else assert.ok(!/\b(owners?|partners?)\b/i.test(t.description), `${t.name} needs an operator: no role named`);
  }
});

/** The tools whose inputs have a shape a sentence does not pin (D9), in the registry's order: a list token, a day, a window, a change, a plan. */
const SHAPED = [
  "search_people",
  "get_openings",
  "get_calendar",
  "propose_thread_verb",
  "propose_deal",
  "propose_policy",
  "propose_settings",
  "propose_broadcast",
  "propose_playbook",
  "propose_lead_search",
];

test("input_examples ride on the shaped tools, two or three each, and every one parses with its tool's own zod unchanged, as the registry parses an input; a settings example makes its card, and a lead plan plans", async () => {
  const { ProposeLeadSearchSchema, planLeadSearch } = await import("@chanlytics/contracts");
  const defs = [...READ_DEFS, ...ACT_DEFS];
  const tools = [...READ_TOOLS, ...ACT_TOOLS];
  assert.deepEqual(
    tools.filter((t) => t.input_examples).map((t) => t.name),
    SHAPED,
    "the shaped tools carry examples, and no other",
  );
  for (const name of SHAPED) {
    const def = defs.find((d) => d.name === name);
    const tool = tools.find((t) => t.name === name);
    assert.deepEqual(tool.input_examples, def.examples, `${name}: the examples the definition holds, in its order`);
    assert.ok(def.examples.length >= 2 && def.examples.length <= 3, `${name}: ${def.examples.length} examples`);
    for (const ex of def.examples) {
      // An example the schema refuses would be a 400 on every turn until the retry drops them (D9).
      const r = def.input.safeParse(ex);
      assert.ok(r.success, `${name}: ${JSON.stringify(ex)} ${r.success ? "" : r.error.message}`);
      assert.deepEqual(r.data, ex, `${name}: nothing stripped or defaulted, so the API's own check sees the same`);
    }
  }
  // The settings changes pass the change's own schema too: each makes its card, with nothing read.
  const { supabase, t } = contextFor("owner");
  for (const ex of defs.find((d) => d.name === "propose_settings").examples) {
    const out = await buildProposal(t, "propose_settings", ex);
    assert.equal(out.isError, false, out.result);
    assert.deepEqual(out.proposal.payload.change, ex.change);
  }
  assert.deepEqual(supabase.seen, [], "a settings card reads nothing");
  // The lead plans pass the plan's own schema and the planner: a US search of businesses, with a card to make.
  for (const ex of defs.find((d) => d.name === "propose_lead_search").examples) {
    const planned = planLeadSearch(ProposeLeadSearchSchema.parse(ex));
    assert.ok(planned.ok, `${ex.asked}: ${planned.ok ? "" : planned.refusal.text}`);
  }
});

test("the schemas are deterministic: built twice they are the same bytes, and every tool's is toolSchema of its own zod", () => {
  const build = (defs) =>
    defs.map((d) => ({
      name: d.name,
      description: d.description,
      input_schema: toolSchema(d.input),
      ...(d.examples?.length ? { input_examples: d.examples } : {}),
    }));
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

test("the lead search keeps its order: the owner check comes before the plan's own schema, so a member below a partner with a malformed plan hears the owner words, and an owner the plan's", async () => {
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
  assert.match(JSON.parse(operator.result).error, /^only an owner or the workspace's partner can start a lead search/);
  const owner = await buildProposal(contextFor("owner").t, "propose_lead_search", ask);
  assert.equal(JSON.parse(owner.result).error, "the plan is not complete: count Too small: expected number to be >=1");
  // The partner has `find` (ROLE_PERMS, 0012): past the role check, to the plan's own words, as the owner is.
  const partner = await buildProposal(contextFor("partner").t, "propose_lead_search", ask);
  assert.equal(
    JSON.parse(partner.result).error,
    "the plan is not complete: count Too small: expected number to be >=1",
  );
  // The owner check wins over the plan's semantic schema only: D2 orders every tool's parse before its handler, so an
  // ask malformed at the flat schema hears the zod's words whatever the role; the role check (D7) is the handler's
  // first line, after that parse.
  const flat = await buildProposal(contextFor("operator").t, "propose_lead_search", {
    looking_for: "local_businesses",
  });
  assert.match(JSON.parse(flat.result).error, /^propose_lead_search: country Invalid input/);
});
