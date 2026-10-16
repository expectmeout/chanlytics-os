import "server-only";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import {
  AppError,
  PROPOSAL_SPECS,
  STEP_TOKEN,
  channelChoices,
  channelsReady,
  emptyReadSet,
  messageWhyNot,
  noteRows,
  purposeOfTemplate,
  readyForMessage,
  roleAtLeast,
  type AskCitationKind,
  type AskLanguage,
  type AskProposal,
  type AskReadSet,
  type CampaignHow,
  type CampaignMessage,
  type MessageAbout,
  type ConsentChannel,
  type MembershipRole,
  type NumberHealth,
  type PlanLead,
  type ProposalKindAboveOperator,
} from "@chanlytics/contracts";
import { parseChannels, readCampaignMessage, type TemplateValuesPorts } from "@chanlytics/core";
import { recentTouches } from "@chanlytics/db";
import type { RouteContext } from "../../with-route";
import { readerContext, type ReaderContext } from "../../readers";
import { whatsappHealthOf } from "../../campaigns/channels-ready";
import { createBroadcastPorts, templateValuePorts } from "../../ports/campaign-ports";
import { log } from "@/server/log";

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
  /** The input streams as the model writes it, unvalidated by the API (the answer tool, answer.ts). */
  eager_input_streaming?: true;
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
   * each read once a turn by its arguments -- and poolList counts a list of the workspace's own from the lists the turn
   * holds (audience.ts). What still reads the database itself: a proposal's own checks (tools/act, a card's
   * validation).
   */
  rc: ReaderContext;
  /**
   * The step of Ask's plan this tool builds a card for (act/plan.ts), where a plan runs it: a `@step:n` naming an earlier
   * step stands in for an id that step makes (stepNamed). Absent everywhere else, where a token names nothing.
   */
  step?: number;
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
  /** Several cards from one call, in order (a plan's steps, proposeMany): where set, they are the call's cards. */
  proposals?: AskProposal[];
  /** What the model sees. */
  result: string;
  isError: boolean;
  /** A plan's own words for the person (proposeMany): a round that made it answers with them (loop.ts). */
  words?: string;
  /** What a setup's answer leads with where something comes first (contracts journey-plan.ts PlanLead): the round answers with it. */
  lead?: PlanLead;
  /** Why nothing was proposed (refuse), as the model is told it: read by a plan of its step's refusal (act/plan.ts). */
  refusal?: string;
  /**
   * What was asked that the card leaves out because it already reads so ("Win-back is already paused"), as the model is
   * told it: the turn's answer says it (loop.ts), never only the card's count.
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

/** Whose a role's action is, in the words a refusal says it: "an owner's", "an owner's or a partner's". */
export const WHOSE: Record<MembershipRole, string> = {
  owner: "an owner's",
  partner: "an owner's or a partner's",
  operator: "an owner's, a partner's or an operator's",
  viewer: "every member's",
};

/**
 * The read a refusal points to for a template's id, an audience's id or a list's token, said as the model calls it:
 * the tool, and its action (D11). Once `list_audiences`; one spelling for every refusal that names it.
 */
export const AUDIENCES_CALL = "sequences with action lists";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const str = (v: unknown, max = 200): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * A value with every key the model wrote as null left out, all the way down: the flat schemas show every field's keys,
 * and the model sends the ones a value does not take as null. Nothing else is dropped.
 */
export const nullsLeftOut = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(nullsLeftOut)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.entries(v)
            .filter(([, x]) => x !== null)
            .map(([k, x]) => [k, nullsLeftOut(x)]),
        )
      : v;

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
    log.error("ask_tool_read_failed", { tool, read, tenant_id: t.tenantId, error: e });
    return null;
  };

/**
 * Who heard from a campaign or a broadcast from a week ago on, or is due to, as every page and the send read it
 * (packages/db recentTouches, the week's breath): contact id -> the time of every touch of theirs. Null where it could not
 * be read, said in the log by the tool that asked (`unread`), which then counts nothing it would have to count with
 * nobody heard: a card is refused (PLAYBOOK_CARD_REFUSALS.weekUnread), a listing gives no count.
 */
export const touchesThisWeek = (t: ToolContext, tool: string): Promise<Record<string, string[]> | null> =>
  recentTouches(t.ctx.supabase, t.tenantId, t.now).catch(unread(t, tool, "touches"));

/**
 * The channels a proposal is counted by, as the route that commits it reads them: WhatsApp alone, since a proposal names
 * none, the workspace ready on it or not. `health` is the number's (contracts numberHealth), null with none connected,
 * and undefined where it could not be read, which counts as the pages count then: WhatsApp can send, which their number
 * banner judges.
 */
export function whatsappHowOf(
  health: (NumberHealth & { number?: string | null }) | null | undefined,
  about: MessageAbout,
): CampaignHow {
  return {
    channels: ["whatsapp"],
    ready: channelsReady({
      // With the number where the read carried it: offers on a US number are held (contracts whatsapp-offers.ts).
      whatsapp: health === undefined ? { canSend: true, refusal: null } : health,
      textLine: null,
      email: { mailbox: false, domain: false },
    }),
    about,
  };
}

/**
 * The channels a campaign proposal names, read as the composers' routes read them (core parseChannels): WhatsApp alone
 * when it names none, and then `named` is false, so the card says nothing of channels and commits the body it always did.
 * A list that is not WhatsApp, text and email each once is a refusal, in the model's words.
 */
export function proposedChannels(asked: unknown): { channels: ConsentChannel[]; named: boolean } | { refusal: string } {
  const named = asked !== undefined && asked !== null;
  try {
    return { channels: parseChannels(named ? asked : undefined), named };
  } catch (e) {
    return {
      refusal: `channels: ${e instanceof Error ? e.message : String(e)} Name them as whatsapp, sms or email, each once.`,
    };
  }
}

/** The `channels` a card keeps for its commit: the ones the proposal named (`proposedChannels`), and nothing where it named none. */
export const namedChannels = (c: { channels: ConsentChannel[]; named: boolean }): { channels?: ConsentChannel[] } =>
  c.named ? { channels: c.channels } : {};

/** The same, reading the number (channels-ready.ts): one read of its config, said in the log when it fails. */
export async function whatsappHow(t: ToolContext, about: MessageAbout): Promise<CampaignHow> {
  const health = await whatsappHealthOf(t.ctx, t.tenantId).catch((e: unknown) => {
    log.error("ask_tool_read_failed", { tool: "campaigns", read: "number", tenant_id: t.tenantId, error: e });
    return undefined;
  });
  return whatsappHowOf(health, about);
}

/** The rows of a message, whatever their channel: what the route reads a message from (core TemplateValuesPorts.message). */
type MessageRows = Awaited<ReturnType<TemplateValuesPorts["message"]>>;

/**
 * A message a proposal names, with the rows it was read from. The rows carry what a card says of it: each version's words,
 * and the slots' labels and examples (`variables`: the anchor's, which is the WhatsApp row's where there is one).
 */
export interface AskedMessage {
  message: CampaignMessage;
  rows: MessageRows;
  variables: unknown;
}

/**
 * The message a version's id names, read as the routes read it (core readCampaignMessage): any version's id, a message
 * needs no WhatsApp row. What the verb refuses is the tool's refusal in the verb's own sentence, so the model reads what the
 * route would answer.
 */
export async function askedMessage(t: ToolContext, id: string): Promise<AskedMessage | { refusal: string }> {
  const ports = templateValuePorts(t.ctx, t.tenantId);
  let rows: MessageRows = [];
  try {
    const message = await readCampaignMessage(
      {
        message: async (of) => {
          rows = await ports.message(of);
          return rows;
        },
      },
      id,
    );
    return { message, rows, variables: rows.find((r) => r.id === message.anchor.id)?.variables ?? null };
  } catch (e) {
    if (e instanceof AppError) return { refusal: e.message };
    throw e;
  }
}

/**
 * Why a proposal that names no channel is refused when its message has no WhatsApp version to go by: it goes by WhatsApp
 * alone, as a campaign always did, so nothing made before changes. Said in the words contracts has for the version it lacks
 * (messageWhyNot), and with what the message can go by -- the channels it holds that the workspace is ready on and its purpose
 * carries (contracts readyForMessage over the channels the routes read) -- for the model to name. Null where WhatsApp holds it,
 * and the workspace's own reason for WhatsApp stays the proposal's to give.
 */
export async function whatsappAloneRefusal(
  t: ToolContext,
  message: Pick<CampaignMessage, "versions" | "purpose">,
  about: MessageAbout,
): Promise<string | null> {
  const why = messageWhyNot(message, "whatsapp");
  if (why === null) return null;
  const { ready } = await createBroadcastPorts(t.ctx, t.tenantId, { fresh: false }).channels();
  const goes = channelChoices(readyForMessage(ready, message), message.purpose, about)
    .filter((c) => c.ok)
    .map((c) => c.channel);
  return goes.length > 0
    ? `${why} Say so, and name channels among ${goes.join(", ")}`
    : `${why} It can go by no other channel yet: say so`;
}

/**
 * The earlier step of the plan a value names by its token (contracts STEP_TOKEN, `@step:n`), where the tool builds a
 * plan's step (`t.step`) and n is a step before it; else null: a token outside a plan, or naming its own step or a later
 * one, names nothing, and the id it stands in for is refused as any other value that is not one.
 */
export function stepNamed(t: ToolContext, v: string): number | null {
  const m = STEP_TOKEN.exec(v);
  if (!m || t.step === undefined) return null;
  const n = Number(m[1]);
  return n >= 1 && n < t.step ? n : null;
}

/** A message a plan writes is an offer (contracts planOf writes its category marketing). */
const STEP_CATEGORY = "marketing";

/**
 * The message an earlier step of a plan writes, as a campaign card on it judges its channels and its people before it is
 * filed: an offer (its category and the yes it needs, STEP_CATEGORY), with a version on each channel the card goes by,
 * as the plan writes one for each (contracts planOf), so the workspace alone says whether each can send; a card that
 * names none passes every channel, and the composer's own rule picks among them as for any message. Its versions' own
 * standing (WhatsApp's review) is the route's to judge at the press, by then filled with the message the step made
 * (Task 16's commit).
 */
export function stepMessage(
  channels: readonly ConsentChannel[],
): Pick<CampaignMessage, "versions" | "category" | "purpose"> {
  const on = (c: ConsentChannel) => channels.includes(c);
  return {
    category: STEP_CATEGORY,
    purpose: purposeOfTemplate(STEP_CATEGORY),
    versions: {
      whatsapp: on("whatsapp") ? { id: "", status: "approved", hidden: false, blocked: null, reason: null } : null,
      email: on("email") ? { id: "" } : null,
      sms: on("sms") ? { id: "" } : null,
    },
  };
}

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
  return { ctx, tenantId, role, timezone, language: "en", read: emptyReadSet(), now, rc };
}

/**
 * Who may approve a card of this kind, and what to tell a member who may not, for its tool's description: one whole
 * clause, read from the spec's `needs` (contracts ask-proposals/), the same role the builder refuses below
 * (proposalBelowNeeds), so a description never says a second thing about who may approve. A partner's door is the
 * owner's and the partner's; an owner's is the owner's alone. A tool with actions says it in the action's own words
 * (D2), so a role the action is not offered to never reads it.
 */
export function approvalWords(kind: ProposalKindAboveOperator): string {
  return PROPOSAL_SPECS[kind].needs === "partner"
    ? "Only an owner or a partner can approve it: for anyone else, say so and that one of them can ask"
    : "Only an owner can approve it: for anyone else, say so and that an owner can ask";
}

/**
 * A card's id, which is also the key its write is kept under (route.ts onceForKey, `card:<id>`, with no hash of the
 * request): two cards must never share one, or the second's Approve is answered with the first's receipt and changes
 * nothing. It was the millisecond and a counter each server instance started at zero, so two instances proposing in
 * one millisecond for one workspace minted the same id.
 */
const nextId = () => `p-${randomUUID()}`;

export const refuse = (why: string): ProposalOutcome => ({
  proposal: null,
  result: JSON.stringify({ error: why }),
  isError: true,
  refusal: why,
});

/**
 * A card, from what its builder made of the input. The role it needs and its undo's words are its kind's spec's
 * (contracts ask-proposals/), the same spec the palette commits it by, so a builder cannot say a second thing about
 * either (D7). A builder whose kind needs more than an operator refuses a member below it first, in its route's words
 * (`roleAtLeast`, `proposalBelowNeeds`).
 */
export const propose = (p: Omit<AskProposal, "id" | "needs" | "undo" | "made_at">, noted?: string): ProposalOutcome => {
  const spec = PROPOSAL_SPECS[p.kind];
  const proposal: AskProposal = {
    id: nextId(),
    ...p,
    needs: spec.needs,
    undo: spec.undo?.label(p) ?? null,
    // When it was made: a card is approved while it is fresh (contracts askCardLapsed), never days on.
    made_at: new Date().toISOString(),
  };
  return {
    proposal,
    isError: false,
    ...(noted ? { noted } : {}),
    result: JSON.stringify({
      proposed: true,
      id: proposal.id,
      card: proposal.title,
      summary: proposal.summary,
      ...(noted ? { left_out: `${noted}: say so in the answer beside the card` } : {}),
      note: "Nothing has happened yet. This is a card the person can approve, edit or dismiss. Say what you proposed; never say it is done.",
    }),
  };
};

/** The cards one call made, in order, as the loop keeps them: a plan's several (proposeMany), else its one, else none. */
export const cardsOf = (o: ProposalOutcome): AskProposal[] => o.proposals ?? (o.proposal ? [o.proposal] : []);

/**
 * Several cards from one call, in order, each made by `propose` (a plan's steps, act/plan.ts): the loop keeps every one
 * (loop.ts, cardsOf), and the model is told what `said` says of them, the plan's `words`, and that nothing has happened
 * yet, and how a plan's cards are pressed. The words ride with the outcome too, for the round that answers with them.
 */
export const proposeMany = (
  proposals: AskProposal[],
  said: Record<string, unknown>,
  words: string | null,
  lead: PlanLead | null,
): ProposalOutcome => ({
  proposal: null,
  proposals,
  isError: false,
  ...(words ? { words } : {}),
  ...(lead ? { lead } : {}),
  result: JSON.stringify({
    proposed: true,
    ...said,
    ...(lead ? { headline: lead.headline } : {}),
    ...(words ? { words } : {}),
    note: "Nothing has happened yet. These are cards the person approves, edits or dismisses; a plan's steps that send nothing are one press, and each send its own after them. Say what you proposed; never say any of it is done.",
  }),
});
