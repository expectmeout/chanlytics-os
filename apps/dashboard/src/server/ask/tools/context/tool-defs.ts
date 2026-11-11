/** Context: tool defs. */

import type { Member } from "@/server/shared/route";
import "server-only";
import type { z } from "zod";
import {
  roleAtLeast,
  type AskLanguage,
  type AskProposal,
  type AskReadSet,
  type MembershipRole,
  type AskProposalOutcome,
  type PlanFigure,
  type PlanLead,
  PROPOSAL_SPECS,
} from "@chanlytics/contracts";
import type { RouteContext } from "../../../shared/with-route";
import type { ReaderContext } from "../../../shared/reader";
import type { TenantId } from "@chanlytics/contracts";

/**
 * What every tool runs in, and the helpers the reads and the acts share.
 *
 * The context, its outcomes and the small helpers (`UUID`, `str`, `json`, `unread`, `readUnlessNotFound`, `refuse`,
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
  /** The input streams as the model writes it, unvalidated by the API (the answer tool, answer.ts). */
  eager_input_streaming?: true;
}

export interface ToolRun {
  name: string;
  input: Record<string, unknown>;
}

export interface ToolContext {
  ctx: RouteContext;
  tenantId: TenantId;
  role: MembershipRole;
  /** The business's zone: "tomorrow at ten" is its ten, never the server's. */
  timezone: string;
  /**
   * The language the question was asked in (turn.ts detectLanguage), which a plan's setup words are said in
   * (act/plan.ts); English where a tool runs outside a turn.
   */
  language: AskLanguage;
  read: AskReadSet;
  now: Date;
  /**
   * The turn's reader context: every read a tool makes goes through the readers and shares the route's turn cache,
   * which keeps no failure -- the audience pool, the lists, the channels, the templates and the searches among them,
   * each read once a turn by its arguments -- and findPoolList counts a list of the workspace's own from the lists the turn
   * holds (audience.ts). What still reads the database itself: a proposal's own checks (tools/act, a card's
   * validation).
   */
  rc: ReaderContext;
  /**
   * The step of Ask's plan this tool builds a card for (act/plan.ts), where a plan runs it: a `@step:n` naming an earlier
   * step stands in for an id that step makes (stepNamed). Absent everywhere else, where a token names nothing.
   */
  step?: number;
  /**
   * What the person asked, in their own words (the turn's question), where a turn runs the tool: what a skill's craft
   * call reads beside the card's own draft (ask/skills). Absent outside a turn.
   */
  question?: string;
  /**
   * The member's own words a read of this turn returned (decision 0078 step 2: sequences, action edited, the cold emails
   * they wrote), which a line about how they write may quote besides their question (act/remember.ts). Never anything a
   * customer, a lead's record, a page or Ask wrote. Absent until such a read runs.
   */
  theirs?: string[];
  /** The person's earlier questions in this thread: what a post's words may rest on beside this one (act/post.ts). */
  askedEarlier?: string[];
  /**
   * What a press from the server needs (D18 of the answers canvas): the request whose session it goes under, the member, the
   * cards waiting on this thread by id with the turn each is on, and where to say what it pressed. Absent outside a turn.
   */
  request?: Request;
  member?: Member;
  waitingOn?: ReadonlyMap<string, { card: AskProposal; messageId: string; cards: readonly AskProposal[] }>;
  onPressed?: (r: { messageId: string; proposalId: string; outcome: AskProposalOutcome }) => void;
  /**
   * When the turn's own time runs out (loop.ts budgetOf, a typed turn's or a spoken one's, from its start), where a turn
   * runs the tool: a craft call made inside the turn ends before it. Absent outside a turn.
   */
  endsAt?: number;
}

/** How long the edge has for what a tool asks of it, from what is left of the turn; nothing where no turn runs it. */
export const timeLeftOf = (context: ToolContext): number | undefined =>
  context.endsAt === undefined ? undefined : context.endsAt - Date.now();

/**
 * A picture a read opens, as the request carries it: what it is called, the id only the edge's copy has, and the size the model
 * sees it at, so it can name a box in those pixels (Ask's eyes). The file's own id rides for what the turn remembers it opened
 * (loop.ts), and is never shown to the model.
 */
export interface ToolPicture {
  name: string;
  fileId: string;
  id?: string;
  size?: readonly [number, number];
  /** A piece of a picture: the box cut, in the pixels of the size the whole was shown at. */
  zoom?: { box: readonly [number, number, number, number]; of: readonly [number, number] };
  /** What it is, where it is no file of the library: "The post drawn from x", said in place of "The file x". */
  what?: string;
  /**
   * What is said after the picture, as data beside it: a video's sheet says how its frames are laid out and what was heard of
   * its sound (contracts files/video.ts, files/sound.ts), since Claude sees frames and hears nothing.
   */
  after?: string;
}

/**
 * Where a read's handler says which pictures it opened, beside the words it answers. A symbol, so what the model reads as the
 * result's JSON can never hold an id: the ids go only into the request's image blocks (round.ts resultBlocks).
 */
export const PICTURES = Symbol("pictures");

/** A picture as a question carries it: what the model is told of it, the id of the copy if one could be had, and what follows it. */
export interface AskedPicture {
  said: string;
  fileId: string | null;
  after?: string;
}

/**
 * Each picture as the model reads it, named just before it, and what is said of it after (a video's sheet). An id never serves
 * other bytes, so a replay is what was sent.
 */
export const pictureBlocks = (pictures: readonly AskedPicture[]): unknown[] =>
  pictures.flatMap((p) => [
    { type: "text", text: p.said },
    ...(p.fileId ? [{ type: "image", source: { type: "file", file_id: p.fileId } }] : []),
    ...(p.after ? [{ type: "text", text: p.after }] : []),
  ]);

/** A picture a read opened, as `pictureBlocks` takes it: named, with the pixels it is shown at where the edge said them. */
export const openedPicture = (toolPicture: ToolPicture): AskedPicture => {
  const size = toolPicture.size ? `${toolPicture.size[0]}×${toolPicture.size[1]}` : null;
  const after = toolPicture.after ? { after: toolPicture.after } : {};
  if (toolPicture.zoom) {
    const [x1, y1, x2, y2] = toolPicture.zoom.box;
    const of = `${toolPicture.zoom.of[0]}×${toolPicture.zoom.of[1]}`;
    return {
      said: `${toolPicture.what ?? `The file ${toolPicture.name}`}, its box [${x1}, ${y1}, ${x2}, ${y2}] of ${of}${size ? `, shown at ${size}` : ""}:`,
      fileId: toolPicture.fileId,
      ...after,
    };
  }
  return {
    said: `${toolPicture.what ?? `The file ${toolPicture.name}`}${size ? ` (${size})` : ""}:`,
    fileId: toolPicture.fileId,
    ...after,
  };
};

export interface ToolOutcome {
  /** What the model sees. */
  result: string;
  isError: boolean;
  /** For the palette's trace line. */
  label: string;
  /** What it sees beside those words. */
  pictures?: readonly ToolPicture[];
}

export interface ProposalOutcome {
  proposal: AskProposal | null;
  /** Several cards from one call, in order (a plan's steps, proposeMany): where set, they are the call's cards. */
  proposals?: AskProposal[];
  /** What the model sees. */
  result: string;
  isError: boolean;
  /** A picture the act drew for the model to look at before it makes its card (act/files/post.ts), beside its words. */
  pictures?: readonly ToolPicture[];
  /** A plan's own words for the person (proposeMany): a round that made it answers with them (loop.ts). */
  words?: string;
  /** What a setup's answer leads with where something comes first (contracts journey/plan.ts PlanLead): the round answers with it. */
  lead?: PlanLead;
  /** An offer's one sentence, the reason it has this shape, where the model's round cannot say it (D1 of the answers canvas). */
  why?: string;
  /** The numbers that sentence rests on, as chips the answer draws from here, never from the model. */
  figures?: PlanFigure[];
  /** Why nothing was proposed (refuse), as the model is told it: read by a plan of its step's refusal (act/plan.ts). */
  refusal?: string;
  /**
   * What the card leaves out because it already reads so, or what its change waits on ("Win-back is paused, so none of
   * this runs until it is resumed"), as the model is told it: the turn's answer says it (loop.ts), never only the
   * card's count.
   */
  noted?: string;
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
  /**
   * The least role that may use this read, where one is below it (the Phase 4 plan, D2): the action is offered only to
   * that role and above, and refused in words to anyone else before it runs. Unset: every member.
   */
  needs?: MembershipRole;
  /** An action's own sentences in its tool's description, said to a role it is offered to (D2). */
  words?: string;
  run(t: ToolContext, input: z.output<S>): Promise<unknown>;
}

/**
 * One act as it builds, shaped as a read is, with the kind of card it builds: its spec's `needs` is the least role the
 * action is offered to (D12, per action since Phase 4's D2). Its handler builds a card (a proposal) or refuses in words.
 */
export interface ActDef<S extends z.ZodObject = z.ZodObject> {
  kind: AskProposal["kind"];
  /**
   * The other kinds of card the action makes beside its own, where it makes more than one (a lead search, named people
   * at companies too): what the parity test reads (ask-parity.test.mjs), so a kind is never said to have no hand.
   */
  makes?: readonly AskProposal["kind"][];
  input: S;
  examples?: z.input<S>[];
  label: string;
  /** An action's own sentences in its tool's description, said to a role it is offered to (D2). */
  words?: string;
  build(t: ToolContext, input: z.output<S>): Promise<ProposalOutcome>;
}

/**
 * One tool as the model is offered it (D11): its name and description, and what it runs, by action, in the order the
 * model reads them. A tool with no action has one definition, under NO_ACTION, and its description is said whole; a
 * tool with actions takes `action`, required, even with one action today, so an action added later does not change its
 * shape, and its description is said per role (the Phase 4 plan, D2): `description`, what the tool is, then the words
 * of each action the role is offered, in the actions' order, then `tail`, what holds for every action. A tool whose
 * actions all reach a role reads to it as one description; a tail names no action a role may not be offered.
 */
export interface Tool<D> {
  name: string;
  description: string;
  tail?: string;
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

/**
 * One action's definition, typed by its own zod (so its examples and its handler's input are checked against it), with
 * its own words in the tool's description (D2).
 */
export const readAction = <S extends z.ZodObject>(def: ReadDef<S> & { words: string }): ReadDef<S> => def;

export const actAction = <S extends z.ZodObject>(def: ActDef<S> & { words: string }): ActDef<S> => def;

/**
 * The least role that may use a definition (D2): a read's own `needs`, or every member; an act's, its card kind's spec's
 * (contracts ask-proposals/), the role that may approve the card, which its builder refuses below (proposalBelowNeeds).
 */
export const needsOf = (def: ReadDef | ActDef): MembershipRole =>
  "kind" in def ? PROPOSAL_SPECS[def.kind].needs : (def.needs ?? "viewer");

/**
 * Whether a role may use a definition (D2): the one predicate the registry offers each action by (registry.ts
 * offeredActions), and Ask's plan asks of a step it would make (act/plan.ts: a note for the receptionist).
 */
export const offeredTo = (def: ReadDef | ActDef, role: MembershipRole): boolean => roleAtLeast(role, needsOf(def));
