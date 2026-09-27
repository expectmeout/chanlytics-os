import "server-only";
import { MEMBERSHIP_ROLES, type MembershipRole } from "@chanlytics/contracts";
import { NO_ACTION, type ActTool, type ReadTool, type Tool, type ToolDef } from "./context";
import { ACT_DEFS, READ_DEFS, inputOf, offeredActions, toolSchema } from "./registry";

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
 * The tools as the API takes them, for a person of this role (D12, D2): sorted by name, each built from the actions the
 * role may use -- four prefixes, a viewer's, an operator's, a partner's and an owner's -- each with its three fields
 * and, while `examples`, its examples (D9). Everyone of one role gets the same bytes on every round, so the tools block
 * stays the cache's first prefix; a turn the API refused for the examples asks without them.
 */
export function toApiTools(role: MembershipRole, examples: boolean): ToolDef[] {
  return (OFFER.get(role) ?? []).map((d) => ({
    name: d.name,
    description: d.description,
    input_schema: d.input_schema,
    ...(examples && d.input_examples ? { input_examples: d.input_examples } : {}),
  }));
}
