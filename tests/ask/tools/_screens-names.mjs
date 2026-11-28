/**
 * AI's tools by the screens' words (Ruben's yes to lane 10's proposal, 26 Nov 2026): the campaigns tool and its cards'
 * propose_campaign (were sequences and propose_sequence), inbox's conversation (was thread), send (was batch) on both,
 * campaign (was sequence) and campaign_id (was sequence_id) where the model names one, propose_conversation (was
 * propose_thread_verb), and ai where a value named the receptionist (a note's `for`, a message's `then`, a reply's
 * `voice`, the report's lens). A card's payload keeps its keys: it is stored, and committed after the deploy.
 *
 * A fixture stays as it was frozen; the tests that hold today's tools and answers to one read it through this, after
 * the taught words (_taught-words.mjs). One table each: a tool's name, its actions, its fields, its values, and the
 * phrases its words said.
 */

/** A tool's name then -> now. */
export const TOOLS_RENAMED = {
  sequences: "campaigns",
  propose_sequence: "propose_campaign",
  propose_thread_verb: "propose_conversation",
};

/** A tool's actions then -> now, by the tool's name now. */
export const ACTIONS_RENAMED = {
  campaigns: { sequence: "campaign", batch: "send" },
  propose_campaign: { batch: "send" },
  inbox: { thread: "conversation" },
};

/** The fields the model names, then -> now, by the tool's name now. */
export const FIELDS_RENAMED = {
  campaigns: { sequence_id: "campaign_id" },
  propose_campaign: { sequence_id: "campaign_id" },
};

/** The values a field takes then -> now, by the tool's name now and the field. */
export const VALUES_RENAMED = {
  propose_person: { for: { receptionist: "ai" }, then: { receptionist: "ai" } },
  propose_reply: { voice: { receptionist: "ai" } },
  report: { lenses: { receptionist: "ai" } },
};

// screen-word: the names and phrases as they were frozen, read and never shown
/** The tools' names and actions in words, then -> now, each in turn: the same rules the rename ran over the code. */
export const NAMES_IN_WORDS = [
  [/\bpropose_sequence\.batch\b/g, "propose_campaign.send"],
  [/\bpropose_sequence\b/g, "propose_campaign"],
  [/\bpropose_thread_verb\b/g, "propose_conversation"],
  [/\bsequences\.sequence\b/g, "campaigns.campaign"],
  [/\bsequences\.batch\b/g, "campaigns.send"],
  [/\bsequences\.(list|moments|lists|messages|sent|journey|cold_emails|edited)\b/g, "campaigns.$1"],
  [/\binbox\.thread\b/g, "inbox.conversation"],
  [/\bsequences with action sequence\b/g, "campaigns with action campaign"],
  [/\bsequences with action batch\b/g, "campaigns with action send"],
  [/\bsequences with action\b/g, "campaigns with action"],
  [/\bpropose_campaign with action batch\b/g, "propose_campaign with action send"],
  [/\binbox with action thread\b/g, "inbox with action conversation"],
  [/\bsequences tool\b/g, "campaigns tool"],
  [/\baction thread\b/g, "action conversation"],
  [/\bAction thread\b/g, "Action conversation"],
  [/\baction batch\b/g, "action send"],
  [/\bAction batch\b/g, "Action send"],
  [/\bAction sequence reads\b/g, "Action campaign reads"],
  ["its sequence_id, name, group,", "its campaign_id, name, group,"],
  [
    "A batch's id, from action sent or a moment's waiting batch.",
    "A send's id, from action sent or a moment's waiting send.",
  ],
  ["and for, who reads it: receptionist, for what", "and for, who reads it: ai, for what"],
  ["or receptionist for its voice,", "or ai for its voice,"],
  ["cold_email, receptionist, people, content;", "cold_email, ai, people, content;"],
  ["AI's lens (receptionist):", "AI's lens (ai):"],
  ["sequence_id must be an id", "campaign_id must be an id"],
  ["for must be receptionist or team", "for must be ai or team"],
];

const said = (text) =>
  NAMES_IN_WORDS.reduce((t, [was, is]) => (typeof was === "string" ? t.replaceAll(was, is) : t.replace(was, is)), text);

/** Every string in a value said today (its keys as they were). */
export const namesInWordsToday = (value) =>
  typeof value === "string"
    ? said(value)
    : Array.isArray(value)
      ? value.map(namesInWordsToday)
      : value && typeof value === "object"
        ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, namesInWordsToday(v)]))
        : value;

const renameKeys = (obj, map) =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [Object.hasOwn(map, k) ? map[k] : k, v]));

/** A call's input as the tool takes it today: its action, its fields and their values. */
export function inputToday(name, input) {
  if (!input || typeof input !== "object") return input;
  const actions = ACTIONS_RENAMED[name] ?? {};
  const fields = FIELDS_RENAMED[name] ?? {};
  const values = VALUES_RENAMED[name] ?? {};
  const out = renameKeys(input, fields);
  if (typeof out.action === "string" && Object.hasOwn(actions, out.action)) out.action = actions[out.action];
  for (const [field, map] of Object.entries(values)) {
    const v = out[field];
    if (typeof v === "string" && Object.hasOwn(map, v)) out[field] = map[v];
    else if (Array.isArray(v)) out[field] = v.map((x) => (Object.hasOwn(map, x) ? map[x] : x));
  }
  return out;
}

/** A name, `tool` or `tool.action`, as the registry records it today. */
export function nameToday(name) {
  const [tool, action] = String(name).split(".");
  const to = TOOLS_RENAMED[tool] ?? tool;
  if (action === undefined) return to;
  return `${to}.${ACTIONS_RENAMED[to]?.[action] ?? action}`;
}

/** A tool's input schema as it is sent today: its fields, its actions and the values each field takes. */
export const schemaToday = (name, schema) => {
  if (!schema || typeof schema !== "object") return schema;
  const fields = FIELDS_RENAMED[name] ?? {};
  const out = { ...schema };
  if (out.properties) {
    const props = renameKeys(out.properties, fields);
    if (props.action?.enum) {
      const actions = ACTIONS_RENAMED[name] ?? {};
      props.action = { ...props.action, enum: props.action.enum.map((a) => actions[a] ?? a) };
    }
    for (const [field, map] of Object.entries(VALUES_RENAMED[name] ?? {})) {
      const p = props[field];
      if (p?.enum) props[field] = { ...p, enum: p.enum.map((v) => map[v] ?? v) };
      if (p?.items?.enum) props[field] = { ...p, items: { ...p.items, enum: p.items.enum.map((v) => map[v] ?? v) } };
    }
    out.properties = props;
  }
  if (Array.isArray(out.required)) out.required = out.required.map((f) => fields[f] ?? f);
  return out;
};

/** A tool as the model was sent it, sent today: its name, its schema, its examples, its words. */
export function toolToday(tool) {
  const name = TOOLS_RENAMED[tool.name] ?? tool.name;
  const out = { ...tool, name };
  if (tool.input_schema) out.input_schema = schemaToday(name, tool.input_schema);
  if (Array.isArray(tool.input_examples)) out.input_examples = tool.input_examples.map((e) => inputToday(name, e));
  return namesInWordsToday(out);
}

/** A role's tools as sent today: each one today's, sorted by name as the registry sorts them, the tool search last. */
export function toolsToday(tools, search = "tool_search_tool_bm25") {
  const now = tools.map(toolToday);
  const searched = now.filter((t) => t.name === search);
  const ours = now.filter((t) => t.name !== search).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return [...ours, ...searched];
}

/**
 * The keys a tool's answer says differently today, by the name (`tool` or `tool.action`) the call is made by now: the
 * report's AI lens and its days, the campaigns' list and the edited cold emails. A card's payload is not among them.
 */
export const RESULT_KEYS_RENAMED = {
  report: [['"receptionist":', '"ai":']],
  "campaigns.list": [
    ['"sequence_id":', '"campaign_id":'],
    ['"sequences":', '"campaigns":'],
  ],
  "campaigns.edited": [['"sequence_id":', '"campaign_id":']],
};

/** A frozen answer's result, a string of JSON, with the keys its tool says today. */
export const resultToday = (name, result) =>
  typeof result === "string"
    ? (RESULT_KEYS_RENAMED[name] ?? []).reduce((said, [was, is]) => said.replaceAll(was, is), result)
    : result;
