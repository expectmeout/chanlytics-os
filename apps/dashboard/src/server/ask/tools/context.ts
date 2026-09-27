import "server-only";
import type { z } from "zod";
import {
  AppError,
  PROPOSAL_SPECS,
  emptyReadSet,
  noteRows,
  type AskCitationKind,
  type AskProposal,
  type AskReadSet,
  type MembershipRole,
  type ProposalKindAboveOperator,
} from "@chanlytics/contracts";
import type { RouteContext } from "../../with-route";
import { readerContext, type ReaderContext } from "../../readers";

/**
 * What every tool runs in, and the helpers the reads and the acts share.
 *
 * The context, its outcomes and the small helpers (`UUID`, `str`, `json`, `unread`, `unlessNotFound`, `refuse`,
 * `propose`) were written twice, once in each of the two files this directory replaces; they live here once. The
 * definers (`defineRead`, `defineAct`, `defineActions`) live here too and not in registry.ts, because the registry
 * imports every family to build the tools array, and a family that imported the registry back would be a cycle.
 */

export interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  /** The definition's examples, where it has them (D9): sent beside the schema, dropped once if the API refuses them. */
  input_examples?: Array<Record<string, unknown>>;
}

export interface ToolRun {
  name: string;
  input: Record<string, unknown>;
}

export interface ToolContext {
  ctx: RouteContext;
  tenantId: string;
  role: MembershipRole;
  /** The business's zone: "tomorrow at ten" is its ten, never the server's. */
  timezone: string;
  read: AskReadSet;
  now: Date;
  /**
   * The turn's reader context: every read a tool makes goes through the readers and shares the route's turn cache,
   * which keeps no failure -- the audience pool, the lists, the channels, the templates and the searches among them,
   * each read once a turn by its arguments -- and poolList counts a list of the workspace's own from the lists the turn
   * holds (audience.ts). What still reads the database itself: a proposal's own checks (tools/act, a card's
   * validation).
   */
  rc: ReaderContext;
}

export interface ToolOutcome {
  /** What the model sees. */
  result: string;
  isError: boolean;
  /** For the palette's trace line. */
  label: string;
}

export interface ProposalOutcome {
  proposal: AskProposal | null;
  /** What the model sees. */
  result: string;
  isError: boolean;
}

/**
 * One read as it runs: the zod its fields are parsed by before it runs (the JSON schema the model is shown is generated
 * from it, registry.ts toolSchema), the trace line the palette shows while it runs, and the handler, which takes the
 * parsed input. A tool with no action is one of these; a tool with actions (D11) holds one per action, each what one of
 * the tools before the consolidation was.
 *
 * `examples` (D9): inputs typed by the zod so a wrong one fails to compile, on an input with a shape a sentence does not
 * pin (a day, a window, a list token, a change, a plan), and one on each action of a tool with actions, whose schema
 * cannot say which fields each action takes. They ride as the API's `input_examples`, an action's with its `action`
 * first; ask-registry.test.mjs parses each with the tool's own zod, since the API refuses a request whose example does
 * not fit its schema.
 */
export interface ReadDef<S extends z.ZodObject = z.ZodObject> {
  input: S;
  examples?: z.input<S>[];
  label: string;
  run(t: ToolContext, input: z.output<S>): Promise<unknown>;
}

/**
 * One act as it builds, shaped as a read is, with the kind of card it builds: its spec's `needs` is the least role the
 * tool is offered to (D12). Its handler builds a card (a proposal) or refuses in words.
 */
export interface ActDef<S extends z.ZodObject = z.ZodObject> {
  kind: AskProposal["kind"];
  input: S;
  examples?: z.input<S>[];
  label: string;
  build(t: ToolContext, input: z.output<S>): Promise<ProposalOutcome>;
}

/**
 * One tool as the model is offered it (D11): its name and description, and what it runs, by action, in the order the
 * model reads them. A tool with no action has one definition, under NO_ACTION; a tool with actions takes `action`,
 * required, even with one action today, so an action added later does not change its shape.
 */
export interface Tool<D> {
  name: string;
  description: string;
  actions: Readonly<Record<string, D>>;
}
export type ReadTool = Tool<ReadDef>;
export type ActTool = Tool<ActDef>;

/** The key of a tool's one definition when it takes no action. */
export const NO_ACTION = "";

export function defineRead<S extends z.ZodObject>(tool: { name: string; description: string } & ReadDef<S>): ReadTool {
  const { name, description, ...def } = tool;
  return { name, description, actions: { [NO_ACTION]: def } };
}

export function defineAct<S extends z.ZodObject>(tool: { name: string; description: string } & ActDef<S>): ActTool {
  const { name, description, ...def } = tool;
  return { name, description, actions: { [NO_ACTION]: def } };
}

/** A tool with actions (D11): each action a definition of its own, `readAction` or `actAction`, in the model's order. */
export function defineActions<D>(tool: Tool<D>): Tool<D> {
  return tool;
}

/** One action's definition, typed by its own zod (so its examples and its handler's input are checked against it). */
export const readAction = <S extends z.ZodObject>(def: ReadDef<S>): ReadDef<S> => def;
export const actAction = <S extends z.ZodObject>(def: ActDef<S>): ActDef<S> => def;

/**
 * The read a refusal points to for a template's id, an audience's id or a list's token, said as the model calls it:
 * the tool, and its action (D11). Once `list_audiences`; one spelling for every refusal that names it.
 */
export const AUDIENCES_CALL = "campaigns with action audiences";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const str = (v: unknown, max = 200): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function json(v: unknown): string {
  return JSON.stringify(v);
}

/**
 * A read the page tolerates, tolerated as the page does: null, which the tool says as its own state (never "none"),
 * and one line in the log. The turn's cache keeps no failure, so the next tool that asks reads again.
 */
export const unread =
  (t: ToolContext, tool: string, read: string) =>
  (e: unknown): null => {
    console.error(
      "ask_tool_read_failed",
      JSON.stringify({ tool, read, tenant: t.tenantId, error: e instanceof Error ? e.message : String(e) }),
    );
    return null;
  };

/**
 * A reader's 404 as the tool's own "not here" answer, null; any other failure
 * is still the read failing (runTool says so). A row the workspace does not
 * hold is not a read that failed, and the model must not be told it was.
 */
export function unlessNotFound<T>(read: Promise<T>): Promise<T | null> {
  return read.catch((e: unknown) => {
    if (e instanceof AppError && e.code === "not_found") return null;
    throw e;
  });
}

/**
 * A row a tool returned, into the turn's read set (contracts noteRows) with the route the tool gave the model for it:
 * an answer may cite it, and it opens there. A row a reader returned goes in as the reader gave it (its `rows`).
 */
export function noteRow(
  t: ToolContext,
  kind: Exclude<AskCitationKind, "page">,
  id: string,
  label: string,
  route: string,
): void {
  noteRows(t.read, [{ kind, id, route, label }]);
}

export function newToolContext(
  ctx: RouteContext,
  tenantId: string,
  role: ToolContext["role"],
  timezone: string,
  now = new Date(),
  rc: ReaderContext = readerContext(ctx, { tenantId, role }, now),
): ToolContext {
  return { ctx, tenantId, role, timezone, read: emptyReadSet(), now, rc };
}

/**
 * Who may approve a card of this kind, and what to tell a member who may not, for its tool's description: one whole
 * clause, read from the spec's `needs` (contracts ask-proposals/), the same role the builder refuses below
 * (proposalBelowNeeds), so a description never says a second thing about who may approve. A partner's door is the
 * owner's and the partner's; an owner's is the owner's alone.
 */
export function approvalWords(kind: ProposalKindAboveOperator): string {
  return PROPOSAL_SPECS[kind].needs === "partner"
    ? "Only an owner or a partner can approve it: for anyone else, say so and that one of them can ask"
    : "Only an owner can approve it: for anyone else, say so and that an owner can ask";
}

let seq = 0;
const nextId = () => `p-${Date.now().toString(36)}-${(seq++ % 1000).toString(36)}`;

export const refuse = (why: string): ProposalOutcome => ({
  proposal: null,
  result: JSON.stringify({ error: why }),
  isError: true,
});

/**
 * A card, from what its builder made of the input. The role it needs and its undo's words are its kind's spec's
 * (contracts ask-proposals/), the same spec the palette commits it by, so a builder cannot say a second thing about
 * either (D7). A builder whose kind needs more than an operator refuses a member below it first, in its route's words
 * (`roleAtLeast`, `proposalBelowNeeds`).
 */
export const propose = (p: Omit<AskProposal, "id" | "needs" | "undo">): ProposalOutcome => {
  const spec = PROPOSAL_SPECS[p.kind];
  const proposal: AskProposal = { id: nextId(), ...p, needs: spec.needs, undo: spec.undo?.label(p) ?? null };
  return {
    proposal,
    isError: false,
    result: JSON.stringify({
      proposed: true,
      id: proposal.id,
      card: proposal.title,
      summary: proposal.summary,
      note: "Nothing has happened yet. This is a card the person can approve, edit or dismiss. Say what you proposed; never say it is done.",
    }),
  };
};
