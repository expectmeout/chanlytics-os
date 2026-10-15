/**
 * The assistant's tool registry (the Phase 3 plan): one definition per tool, the schema the model is shown generated
 * from its zod, the input parsed by that zod before the handler runs, dispatch a map.
 *
 * PR 3.1 moved twenty-six tools here (their names, order and schemas frozen in fixtures/ask-tools-0c136563.json); PR
 * 3.4 consolidated them to nineteen (D11), sorted by name, each read family under an `action` and each act by its card
 * family, and offered each role the acts whose card it may approve (D12). PR 4.3 (the Phase 4 plan, D2) offers each role
 * the ACTIONS it may use, each tool built per role from them; PR 4.6 gave propose_person a note and a person's details
 * beside its mode, an operator's two beside an owner's one; PR 4.5 gave inbox its search; PR 4.7 added propose_list,
 * an operator's (twenty for an owner), gave propose_campaign a waiting run's approval (run), and made
 * propose_thread_verb's words true for every role; 9 Oct 2026 gave propose_campaign a change in place (change), 10 Oct
 * 2026 a new message written for the Library (message) and 11 Oct 2026 an offer or a whole setup made into its cards
 * (plan), and 11 Oct 2026 gave a list's rule a missed visit (missed_visit, decision 0002); 13 Oct 2026 the connections action
 * names the mailboxes a business connected in place of its sending domains (decision 0056), and propose_lead_search
 * proposes named people at companies too (the people card, 00430). The operator (15 Oct 2026, decision 0062) gave Ask
 * every page's verbs: campaigns and propose_campaign became sequences and propose_sequence, the plan propose_plan,
 * propose_autonomy and propose_whisper actions of propose_settings and propose_call, the invitation the Team page's
 * alone, and the reads (guide, signals) and cards (propose_people, propose_leads, propose_review, propose_follow_up) a
 * member needs to run the business from Ask, found by the API's tool search past the core. What the model is sent is
 * frozen per role in fixtures/ask-tools-operator.json, and the tools the operator did not move read to every role as
 * fixtures/ask-tools-4-7.json froze them (inbox, as PR 4.3 sent it in fixtures/ask-tools-4-3.json, less its search);
 * the rest is held as structure: the order, the four prefixes, the flattened
 * schema of a tool with actions, each action's fields the old tool's (read against the 3.1 fixture through
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
const { MOMENT_TRIGGERS, MOMENTS_RETIRED, PROPOSAL_SPECS, REPORT_PERIOD_IDS, roleAtLeast, startersForTrigger } =
  await import("@chanlytics/contracts");
/**
 * 2 Oct 2026: the two moments no longer offered for a new playbook (contracts MOMENTS_RETIRED) leave the playbook's
 * trigger enum; 11 Oct 2026 (D2 of the marketing manager's spec): the two appointment moments join it, the reminder the
 * day before and the check after, proposed where a calendar is connected (the handler judges that per workspace, as the
 * route does). So a schema frozen before is held to its own less those two and with these two, in the moments' order:
 * the one change to its fields.
 */
const asProposableNow = (schema) => {
  const out = structuredClone(schema);
  const t = out.properties.trigger;
  if (t)
    t.enum = MOMENT_TRIGGERS.filter(
      (m) => (t.enum.includes(m.id) || m.kind === "visit") && !(m.id in MOMENTS_RETIRED),
    ).map((m) => m.id);
  return out;
};

/**
 * 3 Oct 2026 (review item 11, Ask names channels): a broadcast and a playbook take the channels they may go by, one
 * optional property on each, which no schema frozen before it holds: the one change to their fields. A property, not a
 * tool, so the strict-tools cap (twenty) is untouched.
 */
const CHANNELS = { type: "array", items: { type: "string", enum: ["whatsapp", "sms", "email"] } };
/**
 * Less what an action gained since: its channels (3 Oct 2026), and, a new playbook's, its last day (`until`, 11 Oct 2026:
 * Ask's plan ends an offer's campaign with the offer), one optional day the change action already took in that shape,
 * and the moment's starter to file at Approve (`starter`, 12 Oct 2026: the day after's review ask, named by its key).
 */
/**
 * 13 Oct 2026 (the people card, 00430): the lead search proposes named people at companies too. Its places fields are
 * optional (a people ask names none of them; the places schema still refuses a places ask without them), it takes how
 * senior, the industries and the sizes, and looking_for names the people card. Less those, its fields are the 3.1 tool's.
 */
const asPlacesThen = (schema) => {
  const out = structuredClone(schema);
  for (const k of ["seniority", "industries", "company_sizes"]) delete out.properties[k];
  out.properties.looking_for.enum = out.properties.looking_for.enum.filter((v) => v !== "people_at_companies");
  out.required = [
    "looking_for",
    "country",
    "count",
    "who",
    "who_one",
    "category_key",
    "terms",
    "region",
    "contact",
    "criteria",
    "asked",
  ];
  return out;
};
/**
 * The operator (15 Oct 2026): a people search takes a list's rule (all) beside its words, and words are no longer
 * required, since a rule or a list alone is a search. The one change to its fields.
 */
const asSearchThen = (schema) => {
  const out = structuredClone(schema);
  delete out.properties.all;
  out.required = ["query"];
  return out;
};
/**
 * The operator (15 Oct 2026): autonomy's mode is left out for the dial alone, where it was the empty mode. The one change
 * to its fields.
 */
const asModeLeftOut = (schema) => {
  const out = structuredClone(schema);
  out.properties.mode.enum = out.properties.mode.enum.filter((m) => m !== "");
  out.required = out.required.filter((k) => k !== "mode");
  return out;
};
const lessChannels = (schema) => {
  const out = structuredClone(schema);
  delete out.properties.channels;
  delete out.properties.until;
  delete out.properties.starter;
  return out;
};
/**
 * A new playbook's `starter` (12 Oct 2026): one optional key among the starters of the moments it may be proposed on,
 * none the set replaced, in the moments' order.
 */
const STARTER = {
  type: "string",
  enum: [
    ...new Set(
      MOMENT_TRIGGERS.filter((m) => !(m.id in MOMENTS_RETIRED)).flatMap((m) =>
        startersForTrigger(m.id).flatMap((s) => (s.retired ? [] : [s.key])),
      ),
    ),
  ],
};

const fixture = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, "tooling/scripts/tests/fixtures", name), "utf8"));
/** What the model is sent, per role, frozen from the finished registry (the operator, 15 Oct 2026). */
const FROZEN = fixture("ask-tools-operator.json");
/** What PR 4.3 sent, per role: inbox reads the same less the search PR 4.5 gave it. */
const PR_4_3 = fixture("ask-tools-4-3.json");
/**
 * 14 Oct 2026 (the wiring's second audit, R13 X5-2): inbox's needs_you is what waits on you as the Inbox counts it, a hold
 * nobody has taken or a reply counting down that can still be stopped, where it said a thread handed to a person. The one
 * phrase, once; ask-tools-4-7.json says it as sent.
 */
const NEEDS_YOU_LIST_WORDS = [
  "needs_you (handed to a person)",
  "needs_you (what waits on you, as the Inbox counts it: a hold nobody has taken, or a reply counting down that can still be stopped)",
];
/** The tool PR 4.5 gave an action, search: that action's words, fields and example are all that moved in it. */
const SEARCHED = "inbox";
/**
 * The one place an operator's tool names a role: propose_thread_verb says whose a person's treatment is to set -- an
 * owner's, as person_mode's spec needs -- so a role not offered propose_person's mode can say who can (PR 4.7).
 */
const THREAD_POINTER = "how the receptionist treats one person is an owner's to set (propose_person with action mode)";
/** The actions added since the rename (the Phase 4 plan, D1): no old tool was any of them. The eval's one list of them. */
const { ADDED_SINCE: PHASE_4 } = await import(at("tooling/evals/rename-ask-tools.mjs"));
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
/** A schema with no description anywhere in it: its shape. */
const bare = (v) => JSON.parse(JSON.stringify(v, (k, x) => (k === "description" ? undefined : x)));
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

const READS = [
  "calendar",
  "calls",
  "guide",
  "inbox",
  "leads",
  "people",
  "report",
  "sequences",
  "signals",
  "today",
  "workspace",
];
/** The API's own tool search (the operator, D11): offered last, to every role, after the tools sorted by name. */
const SEARCH = "tool_search_tool_bm25";
/** The acts an operator may approve (D12): every card family but the lead search, a partner's. */
const OPERATOR_ACTS = [
  "propose_call",
  "propose_deal",
  "propose_follow_up",
  "propose_leads",
  "propose_list",
  "propose_people",
  "propose_person",
  "propose_plan",
  "propose_reply",
  "propose_review",
  "propose_sequence",
  "propose_settings",
  "propose_thread_verb",
];
/**
 * Each role's tools, sorted by name (D11), the acts a role may approve among the reads (D12, amended for the partner),
 * the tool search last. An owner's own are actions of the tools a partner has (a person's mode and a merge, many
 * people's mode, the activity log), so an owner and a partner are offered the same tools.
 */
const PARTNER_ACTS = [...OPERATOR_ACTS, "propose_lead_search"].sort();
const OFFERED = {
  viewer: [...READS, SEARCH],
  operator: [...READS.slice(0, 6), ...OPERATOR_ACTS, ...READS.slice(6), SEARCH],
  partner: [...READS.slice(0, 6), ...PARTNER_ACTS, ...READS.slice(6), SEARCH],
  owner: [...READS.slice(0, 6), ...PARTNER_ACTS, ...READS.slice(6), SEARCH],
};

test("each role is offered its tools, sorted by name, the tool search last, the same bytes every build and the bytes the fixture froze: a viewer the eleven reads, an operator thirteen acts more, a partner and an owner the lead search too", () => {
  for (const role of ROLES) {
    const tools = toApiTools(role, true);
    assert.deepEqual(
      tools.map((t) => t.name),
      OFFERED[role],
      `${role}: the names, in order`,
    );
    const ours = tools.map((t) => t.name).filter((n) => n !== SEARCH);
    assert.deepEqual(ours, [...ours].sort(), `${role}: sorted by name, the acts among the reads`);
    assert.equal(tools.at(-1).name, SEARCH, `${role}: the tool search last`);
    assert.equal(JSON.stringify(tools), JSON.stringify(toApiTools(role, true)), `${role}: built twice, one prefix`);
    assert.deepEqual(tools, FROZEN[role], `${role}: what the model is sent, frozen`);
    assert.deepEqual(
      toApiTools(role, false),
      tools.map(({ input_examples: _, ...t }) => t),
      `${role}: without examples, the same tools less their examples`,
    );
  }
  // The gateway passes at most forty tools (apps/edge/lib/ask-gateway.ts GATEWAY_MAX_TOOLS).
  for (const role of ROLES) assert.ok(toApiTools(role, true).length <= 40, `${role}: at most the gateway's forty`);
  assert.deepEqual(
    ROLES.map((role) => toApiTools(role, true).length),
    [12, 25, 26, 26],
    "a viewer eleven reads and the search, an operator thirteen acts more, a partner and an owner the lead search too",
  );
  assert.deepEqual(
    [...ACT_TOOL_NAMES].sort(),
    OFFERED.owner.filter((n) => !READS.includes(n) && n !== SEARCH),
    "the act names the loop tells apart",
  );
  // A role that stands lower is offered no tool a higher one is not.
  for (let i = 1; i < ROLES.length; i++)
    for (const t of toApiTools(ROLES[i - 1], true))
      assert.ok(OFFERED[ROLES[i]].includes(t.name), `${t.name}: offered to ${ROLES[i - 1]}, so to ${ROLES[i]}`);
});

/** The least role an action may be used by (D2): a read's own needs, or every member; an act's, its card's. */
const needsOf = (def) => ("kind" in def ? PROPOSAL_SPECS[def.kind].needs : (def.needs ?? "viewer"));
/** The actions of a tool a role may use, in the tool's order; a tool with no action, its one, under "". */
const usable = (name, role) =>
  Object.entries(DEFS.get(name).actions)
    .filter(([, def]) => roleAtLeast(role, needsOf(def)))
    .map(([a]) => a);

test("every role is offered exactly the actions it may use (D2): a tool with none is not offered; one with some is built from them alone -- its action enum, its fields, its examples and its description, which says each of them and names no other", () => {
  for (const role of ROLES) {
    const tools = toApiTools(role, true);
    for (const [name, d] of DEFS) {
      const own = usable(name, role);
      const t = tools.find((x) => x.name === name);
      assert.equal(!!t, own.length > 0, `${name} to ${role}: offered exactly when an action is its`);
      if (!t || !actionsOf(name).length) continue;
      assert.deepEqual(t.input_schema.properties.action.enum, own, `${role} ${name}: its actions, in the tool's order`);
      assert.deepEqual(
        Object.keys(t.input_schema.properties),
        ["action", ...new Set(own.flatMap((a) => Object.keys(d.actions[a].input.shape)))],
        `${role} ${name}: its actions' fields, once each, and no other`,
      );
      assert.ok(
        (t.input_examples ?? []).every((ex) => own.includes(ex.action)),
        `${role} ${name}: examples of its actions alone`,
      );
      assert.equal(
        t.description,
        [d.description, ...own.map((a) => d.actions[a].words), d.tail].filter(Boolean).join(" "),
        `${role} ${name}: the tool's words, its actions' in order, the tail`,
      );
      for (const a of actionsOf(name))
        assert.equal(
          new RegExp(`\\baction ${a}\\b`, "i").test(t.description),
          own.includes(a),
          `${role} ${name}: the description names action ${a} only when it is offered`,
        );
    }
  }
  // Every action has its own words, and a role that stands lower is offered no action a higher one is not.
  for (const [name, d] of DEFS)
    for (const a of actionsOf(name)) assert.ok(d.actions[a].words, `${name}.${a}: its own words`);
  for (let i = 1; i < ROLES.length; i++)
    for (const name of DEFS.keys())
      for (const a of usable(name, ROLES[i - 1]))
        assert.ok(usable(name, ROLES[i]).includes(a), `${name}.${a}: ${ROLES[i - 1]}'s, so ${ROLES[i]}'s`);
});

/**
 * The tools the operator lane (15 Oct 2026, decision 0062) left as PR 4.7 froze them. Every other tool moved on purpose:
 * campaigns and propose_campaign became sequences and propose_sequence (the Sequences page's words and its verbs), the
 * plan its own tool (propose_plan), propose_autonomy and propose_whisper actions of propose_settings and propose_call,
 * the invitation the Team page's alone; leads, people, report, today, propose_person, propose_list, propose_settings,
 * propose_lead_search and propose_reply (a booking the receptionist asked for, answered) gained the actions and the words
 * that let Ask do what their pages do.
 */
const UNMOVED = ["calendar", "calls", "inbox", "propose_deal", "propose_thread_verb", "workspace"];
const PR_4_7 = fixture("ask-tools-4-7.json");

test("the invariant (the operator): calendar, calls, inbox, propose_deal, propose_thread_verb and workspace read to every role byte for byte as PR 4.7 froze them, with their examples and without, less the deferral that the tool search adds outside the core; and every tool PR 4.7 offered a role is offered it still, under its name or the one the rename gave it", () => {
  const bare = ({ input_examples: _, ...t }) => t;
  const undeferred = ({ defer_loading: _, ...t }) => t;
  for (const role of ROLES) {
    const was = new Map(PR_4_7[role].map((t) => [t.name, t]));
    for (const examples of [true, false])
      for (const t of toApiTools(role, examples)) {
        if (!UNMOVED.includes(t.name)) continue;
        const then = examples ? was.get(t.name) : bare(was.get(t.name));
        assert.equal(JSON.stringify(undeferred(t)), JSON.stringify(then), `${role} ${t.name}: PR 4.7's bytes`);
      }
    const now = toApiTools(role, true).map((t) => t.name);
    for (const name of was.keys()) {
      const renamed = Object.entries(NAMES).find(([old]) => old === name || old.startsWith(`${name}.`))?.[1];
      const to = now.includes(name) ? name : renamed?.split(".")[0];
      // The invitation is the Team page's alone (Ruben, 15 Oct 2026).
      if (name !== "propose_team") assert.ok(now.includes(to), `${role} ${name}: still offered as ${to}`);
    }
  }
});

test("PR 4.5 gave inbox one action, search, and moved nothing else it says: less the search's words, its two fields and its one example, inbox reads to every role byte for byte as PR 4.3 sent it (which was PR 3.4's)", () => {
  const d = DEFS.get(SEARCHED);
  for (const role of ROLES) {
    const t = toApiTools(role, true).find((x) => x.name === SEARCHED);
    const was = PR_4_3[role].find((x) => x.name === SEARCHED);
    assert.equal(
      t.description,
      was.description.replace(...NEEDS_YOU_LIST_WORDS).replace(` ${d.tail}`, ` ${d.actions.search.words} ${d.tail}`),
      `${role}: the search's words, between the thread's and the tail, and needs_you as the Inbox counts it`,
    );
    const { words, days, ...rest } = t.input_schema.properties;
    assert.deepEqual([words, days], [{ type: "string" }, { type: "number" }], `${role}: words and days, and no other`);
    assert.deepEqual(rest.action.enum, ["list", "thread", "search"], `${role}: search last`);
    assert.equal(
      JSON.stringify({
        ...t.input_schema,
        properties: { ...rest, action: { type: "string", enum: ["list", "thread"] } },
      }),
      JSON.stringify(was.input_schema),
      `${role}: every other field PR 4.3's, in its order`,
    );
    assert.deepEqual(
      t.input_examples,
      [...was.input_examples, { action: "search", words: "parking", days: 30 }],
      `${role}: one example more`,
    );
  }
});

test("the rename is a bijection: every old tool is one tool and action of the registry, every action but those added since one old tool's or a name Phase 4 gave that the operator renamed, and each action takes exactly the fields its old tool took", () => {
  const OLD_NAMES = new Set(OLD.map((t) => t.name));
  // The 3.1 tools' rows, and the rows of the names a later lane renamed (the operator, 15 Oct 2026: campaigns and
  // propose_campaign to sequences and propose_sequence, propose_autonomy and propose_whisper into actions).
  const firsts = Object.entries(NAMES).flatMap(([old, to]) => (OLD_NAMES.has(old) ? [to] : []));
  const since = Object.entries(NAMES).flatMap(([old, to]) => (OLD_NAMES.has(old) ? [] : [to]));
  const registry = [...DEFS.keys()].flatMap((name) =>
    actionsOf(name).length ? actionsOf(name).map((a) => `${name}.${a}`) : [name],
  );
  assert.deepEqual(
    [...OLD_NAMES].filter((old) => !(old in NAMES)),
    ["propose_invite"],
    "every old tool is an action still but the invitation, the Team page's alone (Ruben, 15 Oct 2026)",
  );
  assert.deepEqual([firsts.length, new Set(firsts).size], [25, 25], "twenty-five old tools, twenty-five actions");
  assert.deepEqual(
    [...new Set([...firsts, ...since])].sort(),
    registry.filter((n) => !PHASE_4.includes(n)).sort(),
    "every action not added since is an old tool's, or a name Phase 4 gave under its new name",
  );
  assert.deepEqual(
    registry.filter((n) => PHASE_4.includes(n)).sort(),
    PHASE_4,
    "and those added since, each an action of a tool that was or a tool of its own",
  );
  assert.ok(
    PHASE_4.every((n) => !firsts.includes(n) && !since.includes(n)),
    "a name added since is no row of the table",
  );
  for (const [old, to] of Object.entries(NAMES)) {
    if (!OLD_NAMES.has(old)) continue;
    const [name, action = ""] = to.split(".");
    const def = DEFS.get(name).actions[action];
    const was = OLD.find((t) => t.name === old);
    assert.ok(was, `${old} is in the 3.1 fixture`);
    // The operator (15 Oct 2026): report reads any window the Reports page reads -- a period by name, days picked or
    // the control's shortcuts -- and the lenses asked, where it took 7, 30 or 90 days.
    if (old === "get_report") {
      assert.deepEqual(Object.keys(toolSchema(def.input).properties), ["period", "from", "to", "shortcut", "lenses"]);
      assert.deepEqual(Object.keys(was.input_schema.properties), ["days"]);
      continue;
    }
    const gainedChannels = old === "propose_broadcast" || old === "propose_playbook";
    const now = toolSchema(def.input);
    assert.deepEqual(
      shapeOf(
        gainedChannels
          ? lessChannels(now)
          : old === "propose_lead_search"
            ? asPlacesThen(now)
            : old === "search_people"
              ? asSearchThen(now)
              : now,
      ),
      shapeOf(
        old === "propose_playbook"
          ? asProposableNow(was.input_schema)
          : old === "propose_policy"
            ? asModeLeftOut(was.input_schema)
            : was.input_schema,
      ),
      `${old} -> ${to}: the same fields`,
    );
    if (gainedChannels)
      assert.deepEqual(shapeOf(toolSchema(def.input).properties.channels), CHANNELS, `${to}: and channels`);
    if (old === "propose_playbook") {
      assert.deepEqual(shapeOf(toolSchema(def.input).properties.until), { type: "string" }, `${to}: and until`);
      assert.deepEqual(shapeOf(toolSchema(def.input).properties.starter), STARTER, `${to}: and starter`);
    } else if (gainedChannels) {
      assert.equal("until" in toolSchema(def.input).properties, false, `${to}: no until`);
      assert.equal("starter" in toolSchema(def.input).properties, false, `${to}: no starter`);
    }
  }
});

test("a tool with actions is sent as ONE object schema: action an enum of its actions in their order and required alone, every action's other fields once each and in the shape that action gives them, said once where the actions say it alike and by action where they do not; never a root oneOf or anyOf", () => {
  // Every tool of ours: the tool search is the API's own, with no schema.
  for (const t of toApiTools("owner", true).filter((x) => !x.type)) {
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
    const said = {};
    for (const a of actions)
      for (const [k, v] of Object.entries(toolSchema(DEFS.get(t.name).actions[a].input).properties)) {
        if (k in fields)
          assert.deepEqual(bare(v), bare(fields[k]), `${t.name}.${a}: ${k} has the shape another action gave it`);
        fields[k] ??= v;
        if (v.description) (said[k] ??= []).push([a, v.description]);
      }
    // The operator (15 Oct 2026): each field explained on itself; one sentence where its actions say it alike, else
    // each action's, named by its action.
    for (const [k, words] of Object.entries(said)) {
      const distinct = [...new Set(words.map(([, w]) => w))];
      fields[k] = {
        ...fields[k],
        description: distinct.length === 1 ? distinct[0] : words.map(([a, w]) => `${a}: ${w}`).join(" "),
      };
    }
    assert.deepEqual(s.properties, { action: s.properties.action, ...fields }, `${t.name}: every field once, in order`);
  }
  // The normaliser's moves, on the zod each shows: no $schema anywhere, no safe-integer bounds on an integer, the three
  // periods as an integer enum, and `required: []` where nothing is required.
  const flat = JSON.stringify(toApiTools("owner", true));
  assert.ok(!flat.includes("$schema") && !flat.includes("9007199254740991"));
  const tool = (name) => toApiTools("owner", true).find((x) => x.name === name);
  assert.deepEqual(bare(tool("report").input_schema.properties.period), {
    type: "string",
    enum: [...REPORT_PERIOD_IDS],
  });
  assert.deepEqual(tool("today").input_schema.required, []);
});

test("every description is at least three sentences, says what each of its actions takes, names no tool that is gone, and no two are the same; an act's names, to each role, who may approve each card it is offered, as the card's spec says it and in that action's own words", () => {
  // Every tool of ours: the tool search is the API's own, with no words of ours.
  const all = toApiTools("owner", true).filter((t) => !t.type);
  const gone = Object.keys(NAMES).filter((old) => !DEFS.has(old));
  for (const t of all) {
    assert.ok(sentences(t.description) >= 3, `${t.name}: ${sentences(t.description)} sentence(s)`);
    for (const a of actionsOf(t.name))
      assert.ok(new RegExp(`\\baction ${a}\\b`, "i").test(t.description), `${t.name} says action ${a}`);
    for (const old of gone) assert.ok(!new RegExp(`\\b${old}\\b`).test(t.description), `${t.name} names ${old}`);
  }
  assert.equal(new Set(all.map((t) => t.description)).size, all.length, "no two descriptions are equal");
  // The whole clause, head and tail, per `needs`: one derivation in the registry (tools/context.ts approvalWords),
  // said per action in the actions' own words (D2), so an action a role is not offered takes its clause with it.
  const CLAUSE = {
    partner: "Only an owner or a partner can approve it: for anyone else, say so and that one of them can ask.",
    owner: "Only an owner can approve it: for anyone else, say so and that an owner can ask.",
  };
  for (const role of ROLES)
    for (const d of ACT_DEFS) {
      const t = toApiTools(role, true).find((x) => x.name === d.name);
      if (!t) continue;
      const needs = usable(d.name, role).map((a) => PROPOSAL_SPECS[d.actions[a].kind].needs);
      assert.ok(!/owner-only/i.test(t.description), `${t.name}: the role is said in the spec's words`);
      for (const n of needs)
        if (n !== "operator") assert.ok(t.description.includes(CLAUSE[n]), `${role} ${t.name}: needs ${n}`);
      if (needs.every((n) => n === "owner")) assert.ok(!/partner/i.test(t.description), `${t.name} needs an owner`);
      if (needs.every((n) => n === "operator"))
        assert.ok(
          !/\b(owners?|partners?)\b/i.test(t.description.replace(THREAD_POINTER, "")),
          `${t.name} needs an operator: no role named, but whose a person's treatment is`,
        );
    }
  for (const d of ACT_DEFS)
    for (const a of actionsOf(d.name)) {
      const n = PROPOSAL_SPECS[d.actions[a].kind].needs;
      if (n !== "operator") assert.ok(d.actions[a].words.includes(CLAUSE[n]), `${d.name}.${a}: its own clause`);
    }
  for (const role of ["operator", "partner", "owner"])
    assert.ok(
      toApiTools(role, true)
        .find((x) => x.name === "propose_thread_verb")
        .description.includes(`, and ${THREAD_POINTER}.`),
      `${role}: propose_thread_verb says whose a person's treatment is`,
    );
  assert.equal(PROPOSAL_SPECS.person_mode.needs, "owner", "the pointer says an owner's, as the mode's spec needs");
});

/**
 * The tools with no action whose input has a shape a sentence does not pin (D9). The operator (15 Oct 2026) made the
 * autonomy, the settings, the list and the lead search actions of tools with actions, whose examples ride as theirs, and
 * gave report a window of days picked and the control's shortcuts.
 */
const SHAPED = ["propose_deal", "propose_thread_verb", "report"];

test("input_examples ride on every action of a tool with actions and on the shaped tools, the action first; every one parses with its tool's zod unchanged, as the registry parses an input; a settings example makes its card, and a lead plan plans", async () => {
  const { ProposeLeadSearchSchema, planLeadSearch } = await import("@chanlytics/contracts");
  // Every tool of ours: the tool search is the API's own.
  const tools = toApiTools("owner", true).filter((t) => !t.type);
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
  // Each role's examples validate against the flattened schema that role is sent (D2): the API refuses one that does
  // not, and a role is sent its own actions' fields alone.
  const fits = (s, v, at) => {
    if (s.enum) assert.ok(s.enum.includes(v), `${at}: ${JSON.stringify(v)} in ${JSON.stringify(s.enum)}`);
    if (s.type === "array") return v.forEach((x, i) => fits(s.items, x, `${at}[${i}]`));
    if (s.type === "object") {
      for (const k of s.required ?? []) assert.ok(k in v, `${at}: ${k} required`);
      // A record (a plan step's input, a view of Leads) names no properties: any key, any value.
      const props = s.properties ?? {};
      for (const [k, x] of Object.entries(v)) {
        assert.ok(k in props || s.additionalProperties !== false, `${at}: ${k} is in the schema`);
        if (props[k]) fits(props[k], x, `${at}.${k}`);
      }
      return;
    }
    const type = s.type === "integer" ? "number" : s.type;
    if (type) assert.equal(typeof v, type, at);
    if (s.type === "integer") assert.ok(Number.isInteger(v), at);
  };
  for (const role of ROLES)
    for (const t of toApiTools(role, true))
      for (const ex of t.input_examples ?? []) fits(t.input_schema, ex, `${role} ${t.name}`);
  // The settings changes pass the change's own schema too: each makes its card, with nothing read.
  const { supabase, t } = contextFor("owner");
  for (const ex of tools
    .find((x) => x.name === "propose_settings")
    .input_examples.filter((x) => x.action === "change")) {
    const out = await buildProposal(t, "propose_settings", ex);
    assert.equal(out.isError, false, out.result);
    assert.deepEqual(out.proposal.payload.change, ex.change);
  }
  assert.deepEqual(supabase.seen, [], "a settings card reads nothing");
  // The lead plans pass the plan's own schema and the planner: a US search of businesses, with a card to make.
  for (const ex of tools.find((x) => x.name === "propose_lead_search").input_examples) {
    if (ex.action !== "find") continue;
    const { action: _, ...plan } = ex;
    const planned = planLeadSearch(ProposeLeadSearchSchema.parse(plan));
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
    "inbox: action Invalid discriminator value. Expected 'list' | 'thread' | 'search'",
  );
  assert.equal(
    await words("inbox", { filter: "held" }),
    "inbox: action Invalid discriminator value. Expected 'list' | 'thread' | 'search'",
    "an action is required, even where the fields name one",
  );
  assert.equal(
    await words("report", { period: "8d" }),
    `report: period Invalid option: expected one of ${REPORT_PERIOD_IDS.map((p) => `"${p}"`).join("|")}`,
  );
  assert.equal(
    await words("propose_thread_verb", { conversation_id: C1, verb: "delete" }),
    'propose_thread_verb: verb Invalid option: expected one of "take_over"|"hand_back"|"snooze"|"wake"|"archive"|"resolve"',
  );
  assert.equal(
    await words("propose_sequence", { action: "moment", trigger: "never" }),
    // 2 Oct 2026: the moments a new playbook may start from; welcome and save our number are no longer among them. 11
    // Oct 2026 (D2): the reminder the day before and the check after an appointment are, where a calendar is connected.
    'propose_sequence: trigger Invalid option: expected one of "quiet_30"|"everyone_monthly"|"visit_tomorrow"|"visited"|"lapsed"|"saved_list"|"proposal_waiting"',
  );
  // An owner's action, asked by an owner: past the role (D2), to the zod.
  const merge = await buildProposal(contextFor("owner").t, "propose_person", { action: "merge", contact_id: C1 });
  assert.equal(
    JSON.parse(merge.result).error,
    "propose_person: other_id Invalid input: expected string, received undefined",
  );
  assert.match(await words("inbox", [C1]), /^inbox: Invalid input: expected object, received array$/);
  assert.deepEqual(supabase.seen, [], "nothing was read: the handler never ran");
});

test("an action the caller's role may not use is refused in words, under the tool's name and before its zod or its handler (D2): the second guard, beside the builder's own role check, which stays", async () => {
  const cases = [];
  for (const role of ROLES)
    for (const [name, d] of DEFS)
      for (const a of actionsOf(name))
        if (!usable(name, role).includes(a)) cases.push([role, name, a, needsOf(d.actions[a])]);
  assert.ok(cases.length > 0, "some action is above some role");
  const WHOSE = {
    owner: "an owner's",
    partner: "an owner's or a partner's",
    operator: "an owner's, a partner's or an operator's",
  };
  for (const [role, name, a, needs] of cases) {
    const { supabase, t } = contextFor(role);
    // Its fields left out: a guard after the zod would answer the zod's words.
    const out = ACT_TOOL_NAMES.has(name)
      ? await buildProposal(t, name, { action: a })
      : await runTool(t, { name, input: { action: a } });
    assert.deepEqual(
      [out.isError, JSON.parse(out.result).error],
      [true, `${name}: action ${a} is ${WHOSE[needs]}`],
      `${role} ${name}.${a}`,
    );
    assert.deepEqual(supabase.seen, [], `${role} ${name}.${a}: nothing read`);
  }
  // A call is parsed as the role's own tool: its errors name only the actions and fields that role was shown -- an
  // operator's workspace never names activity or its filters -- and a tool none of whose actions it may use is
  // refused whole, in words.
  const { supabase: seen, t: op } = contextFor("operator");
  const err = async (name, input) => JSON.parse((await runTool(op, { name, input })).result).error;
  const none = await err("workspace", {});
  assert.equal(
    none,
    "workspace: action Invalid discriminator value. Expected 'settings' | 'connections' | 'notifications'",
  );
  const unknown = await err("workspace", { action: "teleport" });
  assert.ok(!/activity|person|kind|day|cursor/.test(unknown), unknown);
  for (const field of ["person", "kind", "day", "cursor"]) {
    const out = await runTool(op, { name: "workspace", input: { action: "notifications", [field]: "x" } });
    assert.ok(!out.result.includes(field) && !out.result.includes("activity"), `${field}: ${out.result}`);
  }
  assert.ok(
    seen.seen.every((q) => q.table !== "decisions" && q.table !== "events"),
    "an operator's workspace reads no ledger",
  );
  const own = contextFor("owner").t;
  assert.equal(
    JSON.parse((await runTool(own, { name: "workspace", input: { action: "notifications", cursor: "x" } })).result)
      .error,
    "workspace: cursor not taken by action notifications",
    "an owner was shown activity's fields, and hears so",
  );
  for (const [role, name, whose] of [
    ["operator", "propose_lead_search", "an owner's or a partner's"],
    ["viewer", "propose_reply", "an owner's, a partner's or an operator's"],
  ]) {
    const out = await buildProposal(contextFor(role).t, name, {});
    assert.equal(JSON.parse(out.result).error, `${name} is ${whose}`, `${role} ${name}`);
  }
  // The builders' own checks stay: an owner's card's builder, called past the registry, refuses an operator in its
  // route's words.
  const { t } = contextFor("operator");
  const mode = await DEFS.get("propose_person").actions.mode.build(t, { contact_id: C1, mode: "never" });
  assert.match(JSON.parse(mode.result).error, /^only an owner can change how the receptionist treats one person/);
});

test("a null on an optional key is absent, in an action's fields too; a null on a required key is refused; an unknown key is stripped, not refused; a field only another action takes is refused, so a card never quietly becomes another", async () => {
  const { supabase, t } = contextFor("owner");
  // audience_id: null passes the parse as no audience_id: the handler runs, and refuses the template id itself.
  const nul = await buildProposal(t, "propose_sequence", {
    action: "once",
    template_id: "nope",
    audience_kind: "everyone",
    audience_id: null,
  });
  assert.equal(JSON.parse(nul.result).error, "template_id must be an id sequences with action lists returned");
  // Nested too: a null inside the change is dropped, and the change becomes a card.
  const nested = await buildProposal(t, "propose_settings", {
    action: "change",
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
  // An extra key no action takes is dropped on the way in: the card is made without it.
  const extra = await buildProposal(t, "propose_person", {
    action: "add",
    email: "ada@example.com",
    name: "Ada",
    extra: 1,
  });
  assert.equal(extra.isError, false, extra.result);
  assert.deepEqual(extra.proposal.payload, { email: "ada@example.com", name: "Ada" });
  // A field only the tool's other action takes is refused by name, before the handler runs: stripped, the broadcast
  // below would have gone out now, and to everyone, where a playbook's run_hour and list were asked for.
  const other = await buildProposal(t, "propose_sequence", {
    action: "once",
    template_id: "d4e5f6a7-b8c9-4d0e-9f1a-2b3c4d5e6f70",
    audience_kind: "everyone",
    params: [],
    run_hour: 15,
    list: "seg:quiet",
  });
  assert.deepEqual(
    [other.proposal, other.isError, JSON.parse(other.result).error],
    [null, true, "propose_sequence: list, run_hour not taken by action once"],
  );
  const read = await runTool(t, { name: "inbox", input: { action: "list", filter: "held", conversation_id: C1 } });
  assert.deepEqual(
    [read.isError, JSON.parse(read.result).error, read.label],
    [true, "inbox: conversation_id not taken by action list", "Reading the Inbox"],
  );
  // A field both actions take is the one named; a null on another action's field is absent, as any null is.
  const nullOther = await buildProposal(t, "propose_sequence", {
    action: "once",
    template_id: "nope",
    audience_kind: "everyone",
    trigger: null,
    name: "October",
  });
  assert.equal(JSON.parse(nullOther.result).error, "template_id must be an id sequences with action lists returned");
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
    // The refusal as the model is told it, kept beside the result (context.ts refuse): what a plan names its step's by.
    refusal: "unknown tool teleport",
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
    // The operator (15 Oct 2026): the lists a send may go to and the messages it may use, and the moments a sequence
    // starts at, in the Sequences page's words.
    list_audiences: "Reading the lists and messages",
    list_playbooks: "Reading the moments",
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
    propose_playbook: "Preparing a campaign",
    propose_lead_search: "Planning a search",
  };
  const OLD_NAMES = new Set(OLD.map((t) => t.name));
  // The 3.1 tools that are an action still: every one but the invitation, the Team page's alone (Ruben, 15 Oct 2026).
  assert.deepEqual(
    Object.keys(LABELS).sort(),
    Object.keys(NAMES)
      .filter((old) => OLD_NAMES.has(old))
      .sort(),
  );
  for (const [old, to] of Object.entries(NAMES)) {
    if (!OLD_NAMES.has(old)) continue;
    const [name, action] = to.split(".");
    assert.equal(toolLabel(name, action ? { action } : {}), LABELS[old], `${old} -> ${to}`);
  }
  // Before a call names its action, or with one the tool does not have: the tool's first action's line.
  assert.equal(toolLabel("sequences"), "Reading the sequences");
  assert.equal(toolLabel("sequences", { action: "teleport" }), "Reading the sequences");
  assert.equal(
    toolLabel("sequences", { action: "sent" }),
    "Reading what went out",
    "PR 4.3's own, in the page's words",
  );
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
      calledName("propose_sequence", { action: "moment" }),
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
      "propose_sequence.moment",
      "propose_deal",
      "teleport",
    ],
  );
});

test("the lead search keeps its order: the owner check comes before the plan's own schema, so a member below a partner with a malformed plan hears the owner words, and an owner the plan's", async () => {
  const ask = {
    action: "find",
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
  // An operator is refused the action by the registry (D2), before its zod; past the registry, the builder's own check.
  const operator = await buildProposal(contextFor("operator").t, "propose_lead_search", ask);
  assert.equal(JSON.parse(operator.result).error, "propose_lead_search: action find is an owner's or a partner's");
  const { action: _, ...plan } = ask;
  const builder = await DEFS.get("propose_lead_search").actions.find.build(contextFor("operator").t, plan);
  assert.match(JSON.parse(builder.result).error, /^only an owner or the workspace's partner can start a lead search/);
  const owner = await buildProposal(contextFor("owner").t, "propose_lead_search", ask);
  assert.equal(JSON.parse(owner.result).error, "the plan is not complete: count Too small: expected number to be >=1");
  // The partner has `find` (ROLE_PERMS, 0012): past the role check, to the plan's own words, as the owner is.
  const partner = await buildProposal(contextFor("partner").t, "propose_lead_search", ask);
  assert.equal(
    JSON.parse(partner.result).error,
    "the plan is not complete: count Too small: expected number to be >=1",
  );
  // The owner check wins over the plan's semantic schema only: D2 orders every tool's parse before its handler, so an
  // ask malformed at the flat schema hears the zod's words from a role the action is offered; the role check (D7) is
  // the handler's first line, after that parse.
  const flat = await buildProposal(contextFor("partner").t, "propose_lead_search", {
    action: "find",
    looking_for: "local_businesses",
  });
  assert.match(JSON.parse(flat.result).error, /^propose_lead_search: country Invalid input/);
});
