import "server-only";
import { z } from "zod";
import {
  json,
  refuse,
  type ActTool,
  type ProposalOutcome,
  type ReadTool,
  type ToolContext,
  type ToolDef,
  type ToolOutcome,
  type ToolRun,
} from "./context";
import { get_today } from "./read/today";
import { get_thread, list_threads } from "./read/threads";
import { get_person, search_people } from "./read/people";
import { get_call, list_calls } from "./read/calls";
import { get_report } from "./read/report";
import { get_settings } from "./read/settings";
import { get_calendar, get_openings } from "./read/calendar";
import { list_audiences, list_playbooks } from "./read/campaigns";
import { list_lead_searches } from "./read/leads";
import { draft_reply, propose_steer } from "./act/reply";
import { propose_thread_verb } from "./act/thread-verb";
import { propose_person_mode } from "./act/person";
import { propose_deal } from "./act/deal";
import { propose_policy } from "./act/policy";
import { propose_settings } from "./act/settings";
import { propose_whisper } from "./act/whisper";
import { propose_invite } from "./act/invite";
import { propose_broadcast } from "./act/broadcast";
import { propose_playbook } from "./act/playbook";
import { propose_lead_search } from "./act/lead-search";

/**
 * The registry: one definition per tool, in a file of its family; the JSON schema the model is shown generated
 * from the definition's zod; the input parsed by that zod before the handler runs; dispatch a map. What was two
 * files with a switch each (the Phase 3 plan, PR 3.1) -- the same twenty-six tools, names, order and descriptions,
 * and the same schemas, held to a frozen fixture by ask-registry.test.mjs.
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
  get_today,
  list_threads,
  get_thread,
  search_people,
  get_person,
  list_calls,
  get_call,
  get_report,
  get_settings,
  get_openings,
  list_audiences,
  list_playbooks,
  get_calendar,
  list_lead_searches,
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
  draft_reply,
  propose_steer,
  propose_thread_verb,
  propose_person_mode,
  propose_deal,
  propose_policy,
  propose_settings,
  propose_whisper,
  propose_broadcast,
  propose_playbook,
  propose_invite,
  propose_lead_search,
];

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

export function toolSchema(input: z.ZodType): Record<string, unknown> {
  return normalise(z.toJSONSchema(input)) as Record<string, unknown>;
}

const defOf = (t: ReadTool | ActTool): ToolDef => ({
  name: t.name,
  description: t.description,
  input_schema: toolSchema(t.input),
});

export const READ_TOOLS: ToolDef[] = READ_DEFS.map(defOf);
export const ACT_TOOLS: ToolDef[] = ACT_DEFS.map(defOf);
export const ACT_TOOL_NAMES = new Set(ACT_TOOLS.map((t) => t.name));

const READ_BY_NAME = new Map(READ_DEFS.map((t) => [t.name, t]));
const ACT_BY_NAME = new Map(ACT_DEFS.map((t) => [t.name, t]));

export function toolLabel(name: string): string {
  return READ_BY_NAME.get(name)?.label ?? `Running ${name}`;
}

export function proposalLabel(name: string): string {
  return ACT_BY_NAME.get(name)?.label ?? "Preparing a card";
}

/* ------------------------------------------------------------- the parse */

/** Whether a field takes no value at all: `.optional()`, or a default. */
const takesAbsent = (field: z.ZodType): boolean => field.safeParse(undefined).success;

/**
 * A `null` on an optional key is "absent", before the zod sees it. zod's `.optional()` refuses null, and the model
 * does write `"audience_id": null` where the handlers always read null as nothing; a null on a required key stays,
 * and is refused as missing. Walked into a nested shape and an array's items the same way, once here for every tool.
 */
function withoutNulls(schema: z.ZodType, value: unknown): unknown {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodDefault || schema instanceof z.ZodNullable)
    return withoutNulls(schema.unwrap() as z.ZodType, value);
  if (schema instanceof z.ZodArray && Array.isArray(value))
    return value.map((v) => withoutNulls(schema.element as z.ZodType, v));
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
 * The input parsed by the tool's zod (the Phase 3 plan, D2): what passes is what the handler gets, typed; what fails
 * goes back to the model as the zod's own words, `<tool>: <path> <message>; ...`, and the handler never runs.
 */
function parseInput<S extends z.ZodObject>(
  name: string,
  input: S,
  raw: unknown,
): { ok: true; data: z.output<S> } | { ok: false; error: string } {
  const r = input.safeParse(withoutNulls(input, raw));
  if (r.success) return { ok: true, data: r.data };
  const issues = r.error.issues.map((i) => `${i.path.length ? `${i.path.join(".")} ` : ""}${i.message}`).join("; ");
  return { ok: false, error: `${name}: ${issues}` };
}

/* ----------------------------------------------------------- dispatch */

/** Run one read. A tool's own failure is returned to the model as an error result, never thrown. */
export async function runTool(t: ToolContext, run: ToolRun): Promise<ToolOutcome> {
  const label = toolLabel(run.name);
  const tool = READ_BY_NAME.get(run.name);
  if (!tool) return { result: json({ error: `unknown tool ${run.name}` }), isError: true, label };
  try {
    const parsed = parseInput(run.name, tool.input, run.input);
    if (!parsed.ok) return { result: json({ error: parsed.error }), isError: true, label };
    const out = await tool.run(t, parsed.data);
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
      JSON.stringify({ tool: run.name, error: e instanceof Error ? e.message : String(e) }),
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
    const parsed = parseInput(name, tool.input, input);
    if (!parsed.ok) return refuse(parsed.error);
    return await tool.build(t, parsed.data);
  } catch (e) {
    console.error(
      "ask_proposal_failed",
      JSON.stringify({ tool: name, error: e instanceof Error ? e.message : String(e) }),
    );
    return refuse("that could not be checked; say so and suggest the page");
  }
}
