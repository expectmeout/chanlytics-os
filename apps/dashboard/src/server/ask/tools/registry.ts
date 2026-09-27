import "server-only";
import { z } from "zod";
import { PROPOSAL_SPECS, roleAtLeast, type MembershipRole } from "@chanlytics/contracts";
import {
  NO_ACTION,
  json,
  refuse,
  type ActTool,
  type ProposalOutcome,
  type ReadTool,
  type Tool,
  type ToolContext,
  type ToolDef,
  type ToolOutcome,
  type ToolRun,
} from "./context";
import { todayTool } from "./read/today";
import { inboxTool } from "./read/threads";
import { peopleTool } from "./read/people";
import { callsTool } from "./read/calls";
import { reportTool } from "./read/report";
import { workspaceTool } from "./read/settings";
import { calendarTool } from "./read/calendar";
import { campaignsTool } from "./read/campaigns";
import { leadsTool } from "./read/leads";
import { propose_reply } from "./act/reply";
import { propose_thread_verb } from "./act/thread-verb";
import { propose_person } from "./act/person";
import { propose_deal } from "./act/deal";
import { propose_autonomy } from "./act/policy";
import { propose_settings } from "./act/settings";
import { propose_whisper } from "./act/whisper";
import { propose_team } from "./act/invite";
import { propose_campaign } from "./act/campaign";
import { propose_lead_search } from "./act/lead-search";

/**
 * The registry: one definition per tool, in a file of its family; the JSON schema the model is shown generated
 * from the definition's zod; the input parsed by that zod before the handler runs; dispatch a map. PR 3.1 moved the
 * twenty-six tools here; PR 3.3 wrote their descriptions (D9); PR 3.4 (D11) consolidated them to nineteen, sorted by
 * name: the reads by family under an `action`, the acts by card family, each action what one of the twenty-six was,
 * its handler moved under it unchanged (tooling/evals/tool-names.json names each old tool's new name and action).
 * A role is offered the reads and the acts whose card it may approve (D12).
 */

/**
 * What the assistant may read, and how each read is shaped.
 *
 * Every tool runs on the caller's session client, so RLS decides what it can
 * see exactly as it decides for the pages. Every result is built through the
 * same view-model functions the pages use, then cut down to what an answer
 * needs and capped, so the assistant's "held for you" is the Inbox's "held
 * for you" and a transcript never floods a turn. Each read records the rows
 * it returned in the read set: the only rows a citation may name.
 */
export const READ_DEFS: readonly ReadTool[] = [
  todayTool,
  inboxTool,
  peopleTool,
  callsTool,
  reportTool,
  workspaceTool,
  calendarTool,
  campaignsTool,
  leadsTool,
];

/**
 * What the assistant may propose, and how a proposal is checked.
 *
 * An act tool never acts. It validates what the model asked for against the
 * workspace as the person sees it (the row exists, the draft is still held,
 * the call is still live), and returns a proposal: a card the person may
 * approve. The commit runs later, from the card, through the same route a
 * button would use, which checks the role and the state again. The model is
 * told, in the tool result, that nothing has happened yet.
 */
export const ACT_DEFS: readonly ActTool[] = [
  propose_reply,
  propose_thread_verb,
  propose_person,
  propose_deal,
  propose_autonomy,
  propose_settings,
  propose_whisper,
  propose_campaign,
  propose_team,
  propose_lead_search,
];

/* ----------------------------------------------------------- the actions */

/** Whether a tool takes an action (D11): a tool with none holds its one definition under NO_ACTION. */
const takesAction = (t: Tool<unknown>): boolean => !Object.prototype.hasOwnProperty.call(t.actions, NO_ACTION);

/** The action a call names, as it arrived: a string, where the tool takes an action; else none. */
function actionOf(t: Tool<unknown>, raw: unknown): string | null {
  const a = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>).action : undefined;
  return takesAction(t) && typeof a === "string" ? a : null;
}

/** The definition a call runs: its action's, or the tool's first -- its one, for a tool with no action. */
function defFor<D>(t: Tool<D>, raw: unknown): D {
  const a = actionOf(t, raw);
  return a !== null && Object.prototype.hasOwnProperty.call(t.actions, a) ? t.actions[a] : Object.values(t.actions)[0];
}

/**
 * The zod a tool's input is parsed by (D2): its one definition's, or the union of its actions on `action`, each
 * branch that action's own fields extended by the action literal -- so what each action takes is its own (a field
 * only another action takes is refused by parseInput), and an action's input that could not be extended (one with
 * an object-level refinement) fails when the registry loads, never quietly.
 */
function inputOf(t: Tool<{ input: z.ZodObject }>): z.ZodType {
  if (!takesAction(t)) return t.actions[NO_ACTION].input;
  const branches = Object.entries(t.actions).map(([action, d]) => d.input.extend({ action: z.literal(action) }));
  return z.discriminatedUnion("action", branches as [(typeof branches)[number], ...typeof branches]);
}

/* ------------------------------------------------------------ the schema */

/** The keys of a schema in the one order the hand-written ones had; anything else after them, by name. */
const KEY_ORDER = ["type", "enum", "items", "properties", "required", "additionalProperties"];

/**
 * One JSON schema from one zod, deterministic (the Phase 3 plan, D3): zod's own output with its `$schema` dropped,
 * the safe-integer bounds it puts on every `.int()` dropped, a union of same-typed literals written as `{type, enum}`
 * (and an enum of integers said as `integer`, as the hand-written schema said it), `required: []` written where a
 * shape has no required key (zod omits it), and the keys in one order -- so two calls give the same bytes, and the
 * tools block stays the cache's first prefix.
 */
function normalise(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(normalise);
  if (!node || typeof node !== "object") return node;
  const o: Record<string, unknown> = { ...(node as Record<string, unknown>) };
  delete o.$schema;
  if (o.minimum === Number.MIN_SAFE_INTEGER) delete o.minimum;
  if (o.maximum === Number.MAX_SAFE_INTEGER) delete o.maximum;
  const branches = Array.isArray(o.anyOf) ? (o.anyOf as Array<Record<string, unknown>>) : null;
  if (
    branches &&
    branches.length > 0 &&
    branches.every((b) => "const" in b && Object.keys(b).length === 2) &&
    new Set(branches.map((b) => b.type)).size === 1
  ) {
    o.type = branches[0].type;
    o.enum = branches.map((b) => b.const);
    delete o.anyOf;
  }
  if (o.type === "number" && Array.isArray(o.enum) && o.enum.every((v) => Number.isInteger(v))) o.type = "integer";
  if (o.type === "object" && !("required" in o)) o.required = [];
  const out: Record<string, unknown> = {};
  const place = (k: string) => {
    // A shape's properties keep their own order: it is the order the model reads them in.
    out[k] =
      k === "properties"
        ? Object.fromEntries(Object.entries(o[k] as Record<string, unknown>).map(([p, v]) => [p, normalise(v)]))
        : normalise(o[k]);
  };
  for (const k of KEY_ORDER) if (k in o) place(k);
  for (const k of Object.keys(o).sort()) if (!(k in out)) place(k);
  return out;
}

/**
 * A tool with actions as ONE object schema (D11). zod writes a discriminated union as a root `oneOf` of object
 * branches, with no root `type`; the API's tool takes an object schema, so the branches are laid into one object:
 * `action` an enum of every action in the union's order, then every branch's other properties once each, in the
 * order they first appear, and `action` alone required. What each action requires is said by the description and
 * shown by an example per action; the zod still parses the input per action before the handler runs (D2). A property
 * two actions share must be one shape, or the union is wrong: that throws, naming it, when the registry loads.
 */
function flatten(schema: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(schema.oneOf)) return schema;
  const branches = schema.oneOf as Array<{ properties: Record<string, Record<string, unknown>> }>;
  const properties: Record<string, unknown> = {
    action: { type: "string", enum: branches.map((b) => b.properties.action.const) },
  };
  for (const b of branches)
    for (const [k, v] of Object.entries(b.properties)) {
      if (k === "action") continue;
      if (k in properties && JSON.stringify(properties[k]) !== JSON.stringify(v))
        throw new Error(`ask tools: ${k} is taken by two actions of one tool in two shapes`);
      properties[k] ??= v;
    }
  return { type: "object", properties, required: ["action"], additionalProperties: false };
}

export function toolSchema(input: z.ZodType): Record<string, unknown> {
  return normalise(flatten(z.toJSONSchema(input) as Record<string, unknown>)) as Record<string, unknown>;
}

/** A tool's examples, each action's in the actions' order and with its `action` first (D9, D11). */
const examplesOf = (t: Tool<{ examples?: unknown[] }>): Array<Record<string, unknown>> =>
  Object.entries(t.actions).flatMap(([action, d]) =>
    ((d.examples ?? []) as Array<Record<string, unknown>>).map((ex) => (action === NO_ACTION ? ex : { action, ...ex })),
  );

const defOf = (t: ReadTool | ActTool): ToolDef => {
  const examples = examplesOf(t);
  return {
    name: t.name,
    description: t.description,
    input_schema: toolSchema(INPUTS.get(t.name)!),
    // The examples as written, in their order: the same bytes every build, after the schema in the tool's keys.
    ...(examples.length ? { input_examples: examples } : {}),
  };
};

/** Each tool's zod, built once. */
const INPUTS = new Map<string, z.ZodType>([...READ_DEFS, ...ACT_DEFS].map((t) => [t.name, inputOf(t)]));

/**
 * Who each tool is offered to (D12, amended for the partner, #1151): a read to everyone; an act to a role that may
 * approve its card, its kind's spec's `needs` -- every action of one tool builds a card of one `needs`
 * (ask-registry.test.mjs), so the first action's is the tool's. Sorted by name, once.
 */
const OFFERED: ReadonlyArray<{ needs: MembershipRole | null; def: ToolDef }> = [
  ...READ_DEFS.map((t) => ({ needs: null, def: defOf(t) })),
  ...ACT_DEFS.map((t) => ({ needs: PROPOSAL_SPECS[Object.values(t.actions)[0].kind].needs, def: defOf(t) })),
].sort((a, b) => (a.def.name < b.def.name ? -1 : a.def.name > b.def.name ? 1 : 0));

export const ACT_TOOL_NAMES = new Set(ACT_DEFS.map((t) => t.name));

/**
 * The tools as the API takes them, for a person of this role (D12): sorted by name, the reads, and the acts whose card
 * the role may approve -- four prefixes, a viewer's, an operator's, a partner's and an owner's -- each with its three
 * fields and, while `examples`, its examples (D9). Everyone of one role gets the same bytes on every round, so the tools
 * block stays the cache's first prefix; a turn the API refused for the examples asks without them.
 */
export function toApiTools(role: MembershipRole, examples: boolean): ToolDef[] {
  return OFFERED.filter((o) => o.needs === null || roleAtLeast(role, o.needs)).map(({ def: d }) => ({
    name: d.name,
    description: d.description,
    input_schema: d.input_schema,
    ...(examples && d.input_examples ? { input_examples: d.input_examples } : {}),
  }));
}

const READ_BY_NAME = new Map(READ_DEFS.map((t) => [t.name, t]));
const ACT_BY_NAME = new Map(ACT_DEFS.map((t) => [t.name, t]));

/**
 * The trace line the palette shows for a call, and a read's ToolOutcome.label: its action's -- each old tool's words,
 * kept as its action's -- or, before the call names one, the tool's first action's; a tool the registry does not
 * have is said by its name.
 */
export function toolLabel(name: string, raw?: unknown): string {
  const t = READ_BY_NAME.get(name) ?? ACT_BY_NAME.get(name);
  return t ? defFor<{ label: string }>(t, raw).label : `Running ${name}`;
}

/**
 * The name a turn records for a call (D11): `name.action` where the tool takes an action and the call's arguments name
 * one as a string, else the name. Read from the arguments as they arrived, so a call the zod refuses still records what
 * it tried.
 */
export function calledName(name: string, raw: unknown): string {
  const t = READ_BY_NAME.get(name) ?? ACT_BY_NAME.get(name);
  const a = t ? actionOf(t, raw) : null;
  return a === null ? name : `${name}.${a}`;
}

/* ------------------------------------------------------------- the parse */

/** Whether a field takes no value at all: `.optional()`, or a default. */
const takesAbsent = (field: z.ZodType): boolean => field.safeParse(undefined).success;

/**
 * A `null` on an optional key is "absent", before the zod sees it. zod's `.optional()` refuses null, and the model
 * does write `"audience_id": null` where the handlers always read null as nothing; a null on a required key stays,
 * and is refused as missing. Walked into a nested shape, an array's items and the action a union picks the same way,
 * once here for every tool.
 */
function withoutNulls(schema: z.ZodType, value: unknown): unknown {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodDefault || schema instanceof z.ZodNullable)
    return withoutNulls(schema.unwrap() as z.ZodType, value);
  if (schema instanceof z.ZodArray && Array.isArray(value))
    return value.map((v) => withoutNulls(schema.element as z.ZodType, v));
  if (schema instanceof z.ZodDiscriminatedUnion && value && typeof value === "object" && !Array.isArray(value)) {
    const key = schema.def.discriminator;
    const branch = (schema.options as z.ZodObject[]).find(
      (o) => (o.shape[key] as z.ZodLiteral).value === (value as Record<string, unknown>)[key],
    );
    return branch ? withoutNulls(branch, value) : value;
  }
  if (schema instanceof z.ZodObject && value && typeof value === "object" && !Array.isArray(value)) {
    const shape = schema.shape as Record<string, z.ZodType>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const field = shape[k];
      if (v === null && field && takesAbsent(field)) continue;
      out[k] = field ? withoutNulls(field, v) : v;
    }
    return out;
  }
  return value;
}

/**
 * A call's fields that another of its tool's actions takes and the one it named does not, sorted: the flat schema shows
 * every action's fields at once (D11), so a broadcast asked with a playbook's run_hour or list would be stripped and
 * go out now, to everyone -- a different card from the one asked for. Refused instead, in words; a null is absent, and
 * a key no action takes is stripped as every unknown key is.
 */
function othersFields(tool: Tool<{ input: z.ZodObject }>, action: string, raw: unknown): string[] {
  const own = tool.actions[action].input.shape;
  const others = new Set(
    Object.entries(tool.actions).flatMap(([a, d]) => (a === action ? [] : Object.keys(d.input.shape))),
  );
  return Object.entries(raw as Record<string, unknown>)
    .filter(([k, v]) => k !== "action" && v !== null && !(k in own) && others.has(k))
    .map(([k]) => k)
    .sort();
}

/**
 * The input parsed by the tool's zod (the Phase 3 plan, D2), and the definition it runs (D11): what passes is what
 * the handler gets, typed -- for a tool with actions, its action's definition, and the input without `action`, which
 * is what that action's old tool was given; what fails goes back to the model as the zod's own words,
 * `<tool>: <path> <message>; ...`, or, for a field only another action takes, `<tool>: <fields> not taken by action
 * <action>`, and the handler never runs.
 */
function parseInput<D extends { input: z.ZodObject }>(
  tool: Tool<D>,
  raw: unknown,
): { ok: true; def: D; data: Record<string, unknown> } | { ok: false; error: string } {
  const input = INPUTS.get(tool.name)!;
  const r = input.safeParse(withoutNulls(input, raw));
  if (!r.success) {
    const issues = r.error.issues.map((i) => `${i.path.length ? `${i.path.join(".")} ` : ""}${i.message}`).join("; ");
    return { ok: false, error: `${tool.name}: ${issues}` };
  }
  const data = r.data as Record<string, unknown>;
  if (!takesAction(tool)) return { ok: true, def: tool.actions[NO_ACTION], data };
  const { action, ...rest } = data as { action: string };
  const stray = othersFields(tool, action, raw);
  if (stray.length) return { ok: false, error: `${tool.name}: ${stray.join(", ")} not taken by action ${action}` };
  return { ok: true, def: tool.actions[action], data: rest };
}

/* ----------------------------------------------------------- dispatch */

/** Run one read. A tool's own failure is returned to the model as an error result, never thrown. */
export async function runTool(t: ToolContext, run: ToolRun): Promise<ToolOutcome> {
  const label = toolLabel(run.name, run.input);
  const tool = READ_BY_NAME.get(run.name);
  if (!tool) return { result: json({ error: `unknown tool ${run.name}` }), isError: true, label };
  try {
    const parsed = parseInput(tool, run.input);
    if (!parsed.ok) return { result: json({ error: parsed.error }), isError: true, label };
    const out = await parsed.def.run(t, parsed.data);
    const isError = !!(
      out &&
      typeof out === "object" &&
      "error" in (out as Record<string, unknown>) &&
      Object.keys(out as object).length <= 2
    );
    return { result: json(out), isError, label };
  } catch (e) {
    console.error(
      "ask_tool_failed",
      JSON.stringify({ tool: calledName(run.name, run.input), error: e instanceof Error ? e.message : String(e) }),
    );
    return { result: json({ error: "that read failed; say so and answer with what you have" }), isError: true, label };
  }
}

export async function buildProposal(
  t: ToolContext,
  name: string,
  input: Record<string, unknown>,
): Promise<ProposalOutcome> {
  const tool = ACT_BY_NAME.get(name);
  if (!tool) return refuse(`unknown tool ${name}`);
  try {
    const parsed = parseInput(tool, input);
    if (!parsed.ok) return refuse(parsed.error);
    return await parsed.def.build(t, parsed.data);
  } catch (e) {
    console.error(
      "ask_proposal_failed",
      JSON.stringify({ tool: calledName(name, input), error: e instanceof Error ? e.message : String(e) }),
    );
    return refuse("that could not be checked; say so and suggest the page");
  }
}
