import "server-only";
import { MEMBERSHIP_ROLES, PROPOSAL_SPECS, type MembershipRole } from "@chanlytics/contracts";
import { NO_ACTION, offeredTo, type ActTool, type ReadTool, type Tool, type ToolDef } from "./context";
import { ACT_DEFS, CORE_TOOLS, READ_DEFS, inputOf, offeredActions, toolSchema } from "./registry";
import { ANSWER_TOOL } from "./answer";

/**
 * What each role is offered (the Phase 4 plan, D2): per tool, the actions the role may use -- a read's own `needs`, or
 * every member; an act's, its card's -- and a tool with none is not offered. The tool is built from those actions
 * alone: its `action` enum in the union's order, its fields, its examples and its description, whose words are the
 * tool's own, then each offered action's, then the tail. So no role reads an action it cannot use, and a tool whose
 * every action reaches a role reads to it exactly as the tool reads whole. Built once per role, when the registry loads.
 */

/**
 * A tool's examples, each action's -- every action's, or the ones a role is offered -- in the actions' order and with
 * its `action` first (D9, D11).
 */
const examplesOf = (t: Tool<{ examples?: unknown[] }>, only?: readonly string[]): Array<Record<string, unknown>> =>
  Object.entries(t.actions)
    .filter(([action]) => !only || only.includes(action))
    .flatMap(([action, d]) =>
      ((d.examples ?? []) as Array<Record<string, unknown>>).map((ex) =>
        action === NO_ACTION ? ex : { action, ...ex },
      ),
    );

/** A tool as this role is offered it, from the actions it may use (D2). */
function defFor(t: ReadTool | ActTool, actions: string[]): ToolDef {
  const withAction = !(NO_ACTION in t.actions);
  const description = withAction
    ? [t.description, ...actions.map((a) => t.actions[a].words), t.tail].filter((s) => !!s).join(" ")
    : t.description;
  const examples = examplesOf(t, actions);
  return {
    name: t.name,
    description,
    input_schema: toolSchema(inputOf(t, actions)),
    // The examples as written, in their order: the same bytes every build, after the schema in the tool's keys.
    ...(examples.length ? { input_examples: examples } : {}),
  };
}

/** Each role's tools, sorted by name, once (D12, per action since D2). */
const OFFER = new Map<MembershipRole, ToolDef[]>(
  MEMBERSHIP_ROLES.map((role) => [
    role,
    [...READ_DEFS, ...ACT_DEFS]
      .map((t) => ({ t, actions: offeredActions(t, role) }))
      .filter((o) => o.actions.length > 0)
      .map((o) => defFor(o.t, o.actions))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
  ]),
);

/**
 * What a role's tools leave out because a role above it approves them, said in its turn's words (prompt.ts turnWords):
 * the operator stress run (15 Oct 2026) heard an operator asking for a lead search told the tool "isn't available", and
 * one asking for the receptionist off for a person given a thread's take-over with no word that it differs, since a role
 * is never offered an action above it (D2). Each card an action makes that the role is not offered, by what it does (its
 * spec's `doing`, the words proposalBelowNeeds says), the owner's apart from the partner's. None for an owner, and none
 * for a viewer, who is offered no card at all (the rules say what to tell one).
 */
export function aboveRoleWords(role: MembershipRole): string | null {
  if (role === "owner" || role === "viewer") return null;
  const above = { owner: new Set<string>(), partner: new Set<string>() };
  for (const t of ACT_DEFS)
    for (const def of Object.values(t.actions)) {
      if (offeredTo(def, role)) continue;
      for (const kind of [def.kind, ...(def.makes ?? [])]) {
        const spec = PROPOSAL_SPECS[kind];
        if (spec.needs !== "operator" && spec.doing) above[spec.needs].add(spec.doing);
      }
    }
  const said = (doings: Set<string>) => [...doings].join(", ");
  const whose = [
    above.owner.size ? `only an owner can ${said(above.owner)}` : "",
    above.partner.size ? `only an owner or the workspace's partner can ${said(above.partner)}` : "",
  ].filter(Boolean);
  if (!whose.length) return null;
  return `Above their role, so no tool of yours proposes it: ${whose.join("; ")}. When they ask for one, say who can do it and that they can ask that person, never that a tool is not available; where something of theirs comes near it, propose that, and say in the answer beside its card who can do what they asked and how this differs (a thread taken over is that one thread, for now).`;
}

/**
 * The server tool that finds a deferred tool by what it is for (the operator, 15 Oct 2026, D11): BM25 over each tool's
 * name, description and its inputs' names and descriptions, in the model's own words. The API runs it and loads the
 * tools it finds into the conversation, after the cached prefix.
 */
const TOOL_SEARCH = { type: "tool_search_tool_bm25_20251119", name: "tool_search_tool_bm25" } as const;

/** A tool as a request carries it: one of Ask's own, deferred or not, or the search tool. */
type ApiTool = (ToolDef & { defer_loading?: true }) | typeof TOOL_SEARCH;

/**
 * The tools as the API takes them, for a person of this role (D12, D2): sorted by name, each built from the actions the
 * role may use -- four prefixes, a viewer's, an operator's, a partner's and an owner's -- each with its three fields
 * and, while `examples`, its examples (D9). With `search` (the operator, D11), every tool outside the core is deferred
 * and found by tool search, which rides last: the deferred tools are out of the cached prefix until one is found, and
 * the core never changes, so the prefix holds. With `answer` (ASK_ANSWER_TOOL), the answer tool first (answer.ts):
 * every role is offered it, it sorts first by its name, and it is never deferred. Everyone of one role gets the same
 * bytes on every round; a turn the API refused for the examples asks without them, and one refused for the search asks
 * with every tool loaded.
 */
export function toApiTools(role: MembershipRole, examples: boolean, search = true, answer = false): ApiTool[] {
  const offered: ApiTool[] = (OFFER.get(role) ?? []).map((d) => ({
    name: d.name,
    description: d.description,
    input_schema: d.input_schema,
    ...(examples && d.input_examples ? { input_examples: d.input_examples } : {}),
    ...(search && !CORE_TOOLS.has(d.name) ? { defer_loading: true as const } : {}),
  }));
  const tools = answer ? [ANSWER_TOOL, ...offered] : offered;
  return search ? [...tools, TOOL_SEARCH] : tools;
}
