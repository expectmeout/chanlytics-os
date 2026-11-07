/** Context: tool reads. */

import "server-only";
import {
  AppError,
  addressOf,
  STEP_TOKEN,
  channelChoices,
  channelsReady,
  emptyReadSet,
  messageWhyNot,
  noteRows,
  purposeOfTemplate,
  readyForMessage,
  type AskCitationKind,
  type CampaignHow,
  type CampaignMessage,
  type MessageAbout,
  type ConsentChannel,
  type MembershipRole,
  type NumberHealth,
} from "@chanlytics/contracts";
import { parseChannels, readCampaignMessage, type TemplateValuesPorts } from "@chanlytics/core";
import { getRecentTouches } from "@chanlytics/db/campaigns";
import type { RouteContext } from "../../../shared/with-route";
import { readerContext, type ReaderContext } from "../../../shared/reader";
import { findWhatsappHealth } from "../../../campaigns/channels-ready";
import { createBroadcastPorts, templateValuePorts } from "../../../campaigns/ports";
import { log } from "@/server/shared/log";
import { type ToolContext } from "./tool-defs";

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

export const str = (value: unknown, max = 200): string => (typeof value === "string" ? value.trim().slice(0, max) : "");

/**
 * A value with every key the model wrote as null left out, all the way down: the flat schemas show every field's keys,
 * and the model sends the ones a value does not take as null. Nothing else is dropped.
 */
export const nullsLeftOut = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(nullsLeftOut)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .filter(([, x]) => x !== null)
            .map(([k, x]) => [k, nullsLeftOut(x)]),
        )
      : value;

export function json(value: unknown): string {
  return JSON.stringify(value);
}

/**
 * A read the page tolerates, tolerated as the page does: null, which the tool says as its own state (never "none"),
 * and one line in the log. The turn's cache keeps no failure, so the next tool that asks reads again.
 */
export const unread =
  (toolContext: ToolContext, tool: string, read: string) =>
  (e: unknown): null => {
    log.error("ask_tool_read_failed", { tool, read, tenant_id: toolContext.tenantId, error: e });
    return null;
  };

/**
 * Who heard from a campaign or a broadcast from a week ago on, or is due to, as every page and the send read it
 * (packages/db getRecentTouches, the week's breath): contact id -> the time of every touch of theirs. Null where it could not
 * be read, said in the log by the tool that asked (`unread`), which then counts nothing it would have to count with
 * nobody heard: a card is refused (PLAYBOOK_CARD_REFUSALS.weekUnread), a listing gives no count.
 */
export const findTouchesThisWeek = (toolContext: ToolContext, tool: string): Promise<Record<string, string[]> | null> =>
  getRecentTouches(toolContext.ctx.supabase, toolContext.tenantId, toolContext.now).catch(
    unread(toolContext, tool, "touches"),
  );

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
export function proposedChannels(value: unknown): { channels: ConsentChannel[]; named: boolean } | { refusal: string } {
  const named = value !== undefined && value !== null;
  try {
    return { channels: parseChannels(named ? value : undefined), named };
  } catch (e) {
    return {
      refusal: `channels: ${e instanceof Error ? e.message : String(e)} Name them as whatsapp, sms or email, each once.`,
    };
  }
}

/** The `channels` a card keeps for its commit: the ones the proposal named (`proposedChannels`), and nothing where it named none. */
export const namedChannels = (context: {
  channels: ConsentChannel[];
  named: boolean;
}): { channels?: ConsentChannel[] } => (context.named ? { channels: context.channels } : {});

/** The same, reading the number (channels-ready.ts): one read of its config, said in the log when it fails. */
export async function getWhatsappHow(toolContext: ToolContext, about: MessageAbout): Promise<CampaignHow> {
  const health = await findWhatsappHealth(toolContext.ctx, toolContext.tenantId).catch((e: unknown) => {
    log.error("ask_tool_read_failed", { tool: "campaigns", read: "number", tenant_id: toolContext.tenantId, error: e });
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
export async function getAskedMessage(
  toolContext: ToolContext,
  id: string,
): Promise<AskedMessage | { refusal: string }> {
  const ports = templateValuePorts(toolContext.ctx, toolContext.tenantId);
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
export async function findWhatsappAloneRefusal(
  toolContext: ToolContext,
  message: Pick<CampaignMessage, "versions" | "purpose">,
  about: MessageAbout,
): Promise<string | null> {
  const reason = messageWhyNot(message, "whatsapp");
  if (reason === null) return null;
  const { ready } = await createBroadcastPorts(toolContext.ctx, toolContext.tenantId, { fresh: false }).channels();
  const goes = channelChoices(readyForMessage(ready, message), message.purpose, about)
    .filter((c) => c.ok)
    .map((c) => c.channel);
  return goes.length > 0
    ? `${reason} Say so, and name channels among ${goes.join(", ")}`
    : `${reason} It can go by no other channel yet: say so`;
}

/**
 * The earlier step of the plan a value names by its token (contracts STEP_TOKEN, `@step:n`), where the tool builds a
 * plan's step (`t.step`) and n is a step before it; else null: a token outside a plan, or naming its own step or a later
 * one, names nothing, and the id it stands in for is refused as any other value that is not one.
 */
export function stepNamed(toolContext: ToolContext, value: string): number | null {
  const m = STEP_TOKEN.exec(value);
  if (!m || toolContext.step === undefined) return null;
  const n = Number(m[1]);
  return n >= 1 && n < toolContext.step ? n : null;
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
export function readUnlessNotFound<T>(read: Promise<T>): Promise<T | null> {
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
  toolContext: ToolContext,
  kind: Exclude<AskCitationKind, "page">,
  id: string,
  label: string,
  route: string,
): void {
  noteRows(toolContext.read, [{ kind, id, route, label }]);
}

/**
 * The person a row of another kind belongs to (a call's caller, a lead that became one, someone in a sequence), noted
 * beside that row wherever a read hands the model their contact_id, so opening their profile is a row this turn read.
 * Without it the open was dropped as unread while the words still said it (the eval-truth pass, 17 Oct 2026: "Opening
 * Casey Example's profile." opened nothing).
 */
export function notePerson(toolContext: ToolContext, id: string | null | undefined, name: string): void {
  if (id) noteRow(toolContext, "person", id, name, addressOf({ kind: "person", id }));
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
