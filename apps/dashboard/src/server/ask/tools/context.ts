import "server-only";
import type { z } from "zod";
import { AppError, emptyReadSet, type AskProposal, type AskReadSet, type MembershipRole } from "@chanlytics/contracts";
import type { RouteContext } from "../../with-route";
import { readerContext, type ReaderContext } from "../../readers";

/**
 * What every tool runs in, and the helpers the reads and the acts share.
 *
 * The context, its outcomes and the small helpers (`UUID`, `str`, `json`, `unread`, `unlessNotFound`, `refuse`,
 * `propose`) were written twice, once in each of the two files this directory replaces; they live here once. The
 * definers (`defineRead`, `defineAct`) live here too and not in registry.ts, because the registry imports every
 * family to build the tools array, and a family that imported the registry back would be a cycle.
 */

export interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
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
 * One read tool: its name and description as the model sees them, the zod its input is parsed by before it runs
 * (the JSON schema the model is shown is generated from it, registry.ts toolSchema), the trace line the palette
 * shows while it runs, and the handler, which takes the parsed input.
 */
export interface ReadTool<S extends z.ZodObject = z.ZodObject> {
  name: string;
  description: string;
  input: S;
  label: string;
  run(t: ToolContext, input: z.output<S>): Promise<unknown>;
}

/** One act tool, shaped as a read is; its handler builds a card (a proposal) or refuses in words. */
export interface ActTool<S extends z.ZodObject = z.ZodObject> {
  name: string;
  description: string;
  input: S;
  label: string;
  build(t: ToolContext, input: z.output<S>): Promise<ProposalOutcome>;
}

export function defineRead<S extends z.ZodObject>(tool: ReadTool<S>): ReadTool<S> {
  return tool;
}

export function defineAct<S extends z.ZodObject>(tool: ActTool<S>): ActTool<S> {
  return tool;
}

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

let seq = 0;
const nextId = () => `p-${Date.now().toString(36)}-${(seq++ % 1000).toString(36)}`;

export const refuse = (why: string): ProposalOutcome => ({
  proposal: null,
  result: JSON.stringify({ error: why }),
  isError: true,
});

export const propose = (p: Omit<AskProposal, "id">): ProposalOutcome => {
  const proposal: AskProposal = { id: nextId(), ...p };
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
