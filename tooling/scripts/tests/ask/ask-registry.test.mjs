/**
 * The assistant's tool registry (the Phase 3 plan): one definition per tool, the schema the model is shown generated
 * from its zod, the input parsed by that zod before the handler runs, dispatch a map.
 *
 * PR 3.1 moved twenty-six tools here (their names, order and schemas frozen in fixtures/ask-tools-0c136563.json); PR
 * 3.4 consolidated them to nineteen (D11), sorted by name, each read family under an `action` and each act by its card
 * family, and offered each role the acts whose card it may approve (D12). What the model is sent is frozen per role in
 * fixtures/ask-tools-3-4.json; the rest is held as structure: the order, the four prefixes, the flattened schema of a
 * tool with actions, each action's fields the old tool's (read against the 3.1 fixture through
 * tooling/evals/tool-names.json), the words each description owes, the examples, and the parse, proven by running the
 * registry over the database in memory and watching what reached it. That every action answers what its old tool
 * answered is ask-tool-names.test.mjs. No source text is read here.
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
  calledName,
  newToolContext,
} = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
const { PROPOSAL_SPECS, roleAtLeast } = await import("@chanlytics/contracts");

const fixture = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, "tooling/scripts/tests/fixtures", name), "utf8"));
/** What the model is sent, per role, frozen from the finished registry. */
const FROZEN = fixture("ask-tools-3-4.json");
/** The twenty-six tools as PR 3.1 froze them: each action's own fields are its old tool's. */
const OLD = fixture("ask-tools-0c136563.json").operator;
/** The rename, old name -> `name.action`: the one table (D13). */
const NAMES = JSON.parse(fs.readFileSync(path.join(ROOT, "tooling/evals/tool-names.json"), "utf8"));

const ROLES = ["viewer", "operator", "partner", "owner"];
/** Every definition, by name: the reads and the acts. */
const DEFS = new Map([...READ_DEFS, ...ACT_DEFS].map((d) => [d.name, d]));
/** A tool's actions, as the model names them; a tool with no action has none. */
const actionsOf = (name) => Object.keys(DEFS.get(name).actions).filter((a) => a !== "");

/** A schema without its per-property descriptions: the shape the 3.1 fixture froze, whatever words a property gains. */
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
/** Sentence ends: a full stop, a question mark or an exclamation mark followed by a space or the end. */
const sentences = (s) => (s.match(/[.!?](\s|$)/g) ?? []).length;

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

const READS = ["calendar", "calls", "campaigns", "inbox", "leads", "people", "report", "today", "workspace"];
/** Each role's tools, sorted by name (D11), the acts a role may approve among the reads (D12, amended for the partner). */
const OFFERED = {
  viewer: READS,
  operator: [
    ...READS.slice(0, 6),
    "propose_autonomy",
    "propose_campaign",
    "propose_deal",
    "propose_reply",
    "propose_thread_verb",
    "propose_whisper",
    ...READS.slice(6),
  ],
  partner: [
    ...READS.slice(0, 6),
    "propose_autonomy",
    "propose_campaign",
    "propose_deal",
    "propose_lead_search",
    "propose_reply",
    "propose_settings",
    "propose_thread_verb",
    "propose_whisper",
    ...READS.slice(6),
  ],
  owner: [
    ...READS.slice(0, 6),
    "propose_autonomy",
    "propose_campaign",
    "propose_deal",
    "propose_lead_search",
    "propose_person",
    "propose_reply",
    "propose_settings",
    "propose_team",
    "propose_thread_verb",
    "propose_whisper",
    ...READS.slice(6),
  ],
};

test("each role is offered its tools, sorted by name, the same bytes every build and the bytes the fixture froze: a viewer the nine reads, an operator six acts more, a partner the settings and the lead search too, an owner all nineteen", () => {
  for (const role of ROLES) {
    const tools = toApiTools(role, true);
    assert.deepEqual(
      tools.map((t) => t.name),
      OFFERED[role],
      `${role}: the names, in order`,
    );
    assert.deepEqual(
      tools.map((t) => t.name),
      [...tools.map((t) => t.name)].sort(),
      `${role}: sorted by name, the acts among the reads`,
    );
    assert.equal(JSON.stringify(tools), JSON.stringify(toApiTools(role, true)), `${role}: built twice, one prefix`);
    assert.deepEqual(tools, FROZEN[role], `${role}: what the model is sent, frozen`);
    assert.deepEqual(
      toApiTools(role, false),
      tools.map(({ input_examples: _, ...t }) => t),
      `${role}: without examples, the same tools less their examples`,
    );
  }
  assert.equal(toApiTools("owner", true).length, 19, "nineteen, under the documented twenty");
  assert.deepEqual(
    [...ACT_TOOL_NAMES].sort(),
    OFFERED.owner.filter((n) => !READS.includes(n)),
    "the act names the loop tells apart",
  );
  // A role that stands lower is offered no tool a higher one is not.
  for (let i = 1; i < ROLES.length; i++)
    for (const t of toApiTools(ROLES[i - 1], true))
      assert.ok(OFFERED[ROLES[i]].includes(t.name), `${t.name}: offered to ${ROLES[i - 1]}, so to ${ROLES[i]}`);
});

test("a role is offered no act above its card's needs, and every action of one tool builds a card of one needs, so the offer is exact", () => {
  for (const d of ACT_DEFS) {
    const needs = new Set(Object.values(d.actions).map((a) => PROPOSAL_SPECS[a.kind].needs));
    assert.equal(needs.size, 1, `${d.name}: one needs across ${[...needs].join(", ")}`);
    const [need] = needs;
    for (const role of ROLES)
      assert.equal(
        toApiTools(role, true).some((t) => t.name === d.name),
        roleAtLeast(role, need),
        `${d.name} (needs ${need}) to ${role}`,
      );
  }
  for (const role of ROLES)
    for (const r of READ_DEFS)
      assert.ok(
        toApiTools(role, true).some((t) => t.name === r.name),
        `${r.name}: a read, offered to ${role}`,
      );
});

test("the rename is a bijection: every old tool is one tool and action of the registry, every action one old tool, and each action takes exactly the fields its old tool took", () => {
  const pairs = Object.values(NAMES);
  const registry = [...DEFS.keys()].flatMap((name) =>
    actionsOf(name).length ? actionsOf(name).map((a) => `${name}.${a}`) : [name],
  );
  assert.deepEqual([...pairs].sort(), [...registry].sort(), "twenty-six old tools, twenty-six actions");
  for (const [old, to] of Object.entries(NAMES)) {
    const [name, action = ""] = to.split(".");
    const def = DEFS.get(name).actions[action];
    const was = OLD.find((t) => t.name === old);
    assert.ok(was, `${old} is in the 3.1 fixture`);
    assert.deepEqual(shapeOf(toolSchema(def.input)), shapeOf(was.input_schema), `${old} -> ${to}: the same fields`);
  }
});

test("a tool with actions is sent as ONE object schema: action an enum of its actions in their order and required alone, every action's other fields once each and in the shape that action gives them; never a root oneOf or anyOf", () => {
  for (const t of toApiTools("owner", true)) {
    const s = t.input_schema;
    assert.equal(s.type, "object", `${t.name}: an object schema`);
    assert.ok(!("oneOf" in s) && !("anyOf" in s) && !("$schema" in s), `${t.name}: no root union`);
    assert.equal(s.additionalProperties, false, t.name);
    const actions = actionsOf(t.name);
    if (!actions.length) {
      assert.ok(!("action" in s.properties), `${t.name} takes no action`);
      assert.deepEqual(s, toolSchema(DEFS.get(t.name).actions[""].input), `${t.name}: toolSchema of its own zod`);
      continue;
    }
    assert.deepEqual(s.properties.action, { type: "string", enum: actions }, `${t.name}: its actions, in order`);
    assert.deepEqual(s.required, ["action"], `${t.name}: action alone required`);
    const fields = {};
    for (const a of actions)
      for (const [k, v] of Object.entries(toolSchema(DEFS.get(t.name).actions[a].input).properties)) {
        if (k in fields) assert.deepEqual(v, fields[k], `${t.name}.${a}: ${k} has the shape another action gave it`);
        fields[k] ??= v;
      }
    assert.deepEqual(s.properties, { action: s.properties.action, ...fields }, `${t.name}: every field once, in order`);
  }
  // The normaliser's moves, on the zod each shows: no $schema anywhere, no safe-integer bounds on an integer, the three
  // periods as an integer enum, and `required: []` where nothing is required.
  const flat = JSON.stringify(toApiTools("owner", true));
  assert.ok(!flat.includes("$schema") && !flat.includes("9007199254740991"));
  const tool = (name) => toApiTools("owner", true).find((x) => x.name === name);
  assert.deepEqual(tool("report").input_schema.properties.days, { type: "integer", enum: [7, 30, 90] });
  assert.deepEqual(tool("today").input_schema.required, []);
});

test("every description is at least three sentences, says what each of its actions takes, names no tool that is gone, and no two are the same; an act's names who may approve its card as the card's spec says it", () => {
  const all = toApiTools("owner", true);
  const gone = Object.keys(NAMES).filter((old) => !DEFS.has(old));
  for (const t of all) {
    assert.ok(sentences(t.description) >= 3, `${t.name}: ${sentences(t.description)} sentence(s)`);
    for (const a of actionsOf(t.name)) assert.ok(t.description.includes(`action ${a}`), `${t.name} says action ${a}`);
    for (const old of gone) assert.ok(!new RegExp(`\\b${old}\\b`).test(t.description), `${t.name} names ${old}`);
  }
  assert.equal(new Set(all.map((t) => t.description)).size, all.length, "no two descriptions are equal");
  for (const d of ACT_DEFS) {
    const t = all.find((x) => x.name === d.name);
    const needs = PROPOSAL_SPECS[Object.values(d.actions)[0].kind].needs;
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

/** The tools with no action whose input has a shape a sentence does not pin (D9): a window, a change, a plan. */
const SHAPED = ["propose_autonomy", "propose_deal", "propose_lead_search", "propose_settings", "propose_thread_verb"];

test("input_examples ride on every action of a tool with actions and on the shaped tools, the action first; every one parses with its tool's zod unchanged, as the registry parses an input; a settings example makes its card, and a lead plan plans", async () => {
  const { ProposeLeadSearchSchema, planLeadSearch } = await import("@chanlytics/contracts");
  const tools = toApiTools("owner", true);
  assert.deepEqual(
    tools.filter((t) => t.input_examples).map((t) => t.name),
    tools.filter((t) => actionsOf(t.name).length || SHAPED.includes(t.name)).map((t) => t.name),
    "a tool with actions and the shaped tools carry examples, and no other",
  );
  for (const t of tools.filter((x) => x.input_examples)) {
    const def = DEFS.get(t.name);
    const actions = actionsOf(t.name);
    const want = (actions.length ? actions : [""]).flatMap((a) =>
      (def.actions[a].examples ?? []).map((ex) => (a ? { action: a, ...ex } : ex)),
    );
    assert.deepEqual(t.input_examples, want, `${t.name}: each action's examples, in its order, the action first`);
    for (const a of actions)
      assert.ok(
        t.input_examples.some((ex) => ex.action === a),
        `${t.name}: an example of action ${a}, since the schema cannot say what it requires`,
      );
    for (const ex of t.input_examples) {
      assert.equal(Object.keys(ex)[0], actions.length ? "action" : Object.keys(ex)[0], `${t.name}: action first`);
      // An example the schema refuses would be a 400 on every turn until the retry drops them (D9).
      const { action = "", ...fields } = actions.length ? ex : { ...ex, action: "" };
      const r = def.actions[action].input.safeParse(actions.length ? fields : ex);
      assert.ok(r.success, `${t.name}: ${JSON.stringify(ex)} ${r.success ? "" : r.error.message}`);
      assert.deepEqual(r.data, actions.length ? fields : ex, `${t.name}: nothing stripped or defaulted`);
    }
  }
  // The settings changes pass the change's own schema too: each makes its card, with nothing read.
  const { supabase, t } = contextFor("owner");
  for (const ex of tools.find((x) => x.name === "propose_settings").input_examples) {
    const out = await buildProposal(t, "propose_settings", ex);
    assert.equal(out.isError, false, out.result);
    assert.deepEqual(out.proposal.payload.change, ex.change);
  }
  assert.deepEqual(supabase.seen, [], "a settings card reads nothing");
  // The lead plans pass the plan's own schema and the planner: a US search of businesses, with a card to make.
  for (const ex of tools.find((x) => x.name === "propose_lead_search").input_examples) {
    const planned = planLeadSearch(ProposeLeadSearchSchema.parse(ex));
    assert.ok(planned.ok, `${ex.asked}: ${planned.ok ? "" : planned.refusal.text}`);
  }
});

test("an input a schema refuses comes back in the zod's words, under the tool's name, as an error, and the handler never runs: a field its action needs, an action it does not have, a value it does not list", async () => {
  const { supabase, t } = contextFor();
  const words = async (name, input) => {
    const out = ACT_TOOL_NAMES.has(name) ? await buildProposal(t, name, input) : await runTool(t, { name, input });
    assert.equal(out.isError, true, `${name} ${JSON.stringify(input)}`);
    return JSON.parse(out.result).error;
  };
  assert.deepEqual(await runTool(t, { name: "inbox", input: { action: "thread" } }), {
    result: JSON.stringify({ error: "inbox: conversation_id Invalid input: expected string, received undefined" }),
    isError: true,
    label: "Reading the conversation",
  });
  assert.equal(
    await words("inbox", { action: "delete" }),
    "inbox: action Invalid discriminator value. Expected 'list' | 'thread'",
  );
  assert.equal(
    await words("inbox", { filter: "held" }),
    "inbox: action Invalid discriminator value. Expected 'list' | 'thread'",
    "an action is required, even where the fields name one",
  );
  assert.equal(await words("report", { days: 8 }), "report: days Invalid option: expected one of 7|30|90");
  assert.equal(
    await words("propose_thread_verb", { conversation_id: C1, verb: "delete" }),
    'propose_thread_verb: verb Invalid option: expected one of "take_over"|"hand_back"|"snooze"|"wake"|"archive"|"resolve"',
  );
  assert.equal(
    await words("propose_campaign", { action: "playbook", trigger: "never" }),
    'propose_campaign: trigger Invalid option: expected one of "quiet_30"|"new_week"|"phoned_only"|"everyone_monthly"|"lapsed"|"saved_list"|"proposal_waiting"',
  );
  assert.equal(
    await words("propose_team", { action: "invite", email: "ada@example.com", role: "owner" }),
    'propose_team: role Invalid option: expected one of "operator"|"viewer"',
  );
  assert.match(await words("inbox", [C1]), /^inbox: Invalid input: expected object, received array$/);
  assert.deepEqual(supabase.seen, [], "nothing was read: the handler never ran");
});

test("a null on an optional key is absent, in an action's fields too; a null on a required key is refused; an unknown key, or another action's field, is stripped, not refused", async () => {
  const { supabase, t } = contextFor("owner");
  // audience_id: null passes the parse as no audience_id: the handler runs, and refuses the template id itself.
  const nul = await buildProposal(t, "propose_campaign", {
    action: "broadcast",
    template_id: "nope",
    audience_kind: "everyone",
    audience_id: null,
  });
  assert.equal(JSON.parse(nul.result).error, "template_id must be an id campaigns with action audiences returned");
  // Nested too: a null inside the change is dropped, and the change becomes a card.
  const nested = await buildProposal(t, "propose_settings", {
    change: { op: "add_closure", date: "2026-12-25", note: null, until: null },
  });
  assert.equal(nested.isError, false, nested.result);
  assert.deepEqual(nested.proposal.payload.change, { op: "add_closure", date: "2026-12-25" });
  // A required key given null stays null, and the zod refuses it by name.
  const required = await runTool(t, { name: "inbox", input: { action: "thread", conversation_id: null } });
  assert.deepEqual(
    [required.isError, JSON.parse(required.result).error],
    [true, "inbox: conversation_id Invalid input: expected string, received null"],
  );
  // An extra key is dropped on the way in, and so is a field of the tool's other action: the card is made without it.
  const extra = await buildProposal(t, "propose_team", {
    action: "invite",
    email: "ada@example.com",
    role: "viewer",
    extra: 1,
  });
  assert.equal(extra.isError, false, extra.result);
  assert.deepEqual(extra.proposal.payload, { email: "ada@example.com", role: "viewer" });
  const other = await buildProposal(t, "propose_campaign", {
    action: "broadcast",
    template_id: "nope",
    audience_kind: "everyone",
    trigger: "quiet_30",
  });
  assert.equal(JSON.parse(other.result).error, "template_id must be an id campaigns with action audiences returned");
  assert.deepEqual(supabase.seen, [], "none of these reached the database");
});

test("an unknown tool is refused as it always was, for a read and for an act, an old name among them; each action's trace line is its old tool's words; a turn records name.action from the arguments as they came", async () => {
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
  assert.equal(
    JSON.parse((await runTool(t, { name: "get_thread", input: {} })).result).error,
    "unknown tool get_thread",
  );
  assert.equal(JSON.parse((await buildProposal(t, "draft_reply", {})).result).error, "unknown tool draft_reply");
  // The words each old tool's trace line said, now its action's: the palette's line while the call runs.
  const LABELS = {
    get_today: "Reading Today",
    list_threads: "Reading the Inbox",
    get_thread: "Reading the conversation",
    search_people: "Looking through People",
    get_person: "Reading the profile",
    list_calls: "Reading the calls",
    get_call: "Reading the call",
    get_report: "Reading Reports",
    get_settings: "Reading Settings",
    get_openings: "Checking the calendar",
    list_audiences: "Reading the lists and templates",
    list_playbooks: "Reading the playbooks",
    get_calendar: "Reading the calendar",
    list_lead_searches: "Reading your searches",
    draft_reply: "Drafting a reply",
    propose_steer: "Preparing a rewrite",
    propose_thread_verb: "Preparing an Inbox action",
    propose_person_mode: "Preparing a receptionist change",
    propose_deal: "Preparing a deal",
    propose_policy: "Preparing an autonomy change",
    propose_settings: "Preparing a settings change",
    propose_whisper: "Preparing a whisper",
    propose_broadcast: "Preparing a broadcast",
    propose_playbook: "Preparing a playbook",
    propose_invite: "Preparing an invitation",
    propose_lead_search: "Planning a search",
  };
  assert.deepEqual(Object.keys(LABELS).sort(), Object.keys(NAMES).sort());
  for (const [old, to] of Object.entries(NAMES)) {
    const [name, action] = to.split(".");
    assert.equal(toolLabel(name, action ? { action } : {}), LABELS[old], `${old} -> ${to}`);
  }
  // Before a call names its action, or with one the tool does not have: the tool's first action's line.
  assert.equal(toolLabel("campaigns"), "Reading the lists and templates");
  assert.equal(toolLabel("campaigns", { action: "broadcasts" }), "Reading the lists and templates");
  assert.equal(toolLabel("teleport", {}), "Running teleport");
  // What a turn records: the action where the tool takes one and the call named one as a string, else the name.
  assert.deepEqual(
    [
      calledName("inbox", { action: "list", filter: "held" }),
      calledName("inbox", { action: "delete" }),
      calledName("inbox", {}),
      calledName("inbox", null),
      calledName("inbox", { action: 3 }),
      calledName("today", { action: "list" }),
      calledName("propose_campaign", { action: "playbook" }),
      calledName("propose_deal", { stage: "won" }),
      calledName("teleport", { action: "x" }),
    ],
    [
      "inbox.list",
      "inbox.delete",
      "inbox",
      "inbox",
      "inbox",
      "today",
      "propose_campaign.playbook",
      "propose_deal",
      "teleport",
    ],
  );
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
