import "server-only";
import { z } from "zod";
import {
  AUDIENCE_KINDS,
  AppError,
  BUILTIN_LISTS,
  PLAYBOOK_CARD_REFUSALS,
  allLeftOutWords,
  allowanceBeforeSend,
  breathSplit,
  CONSENT_CHANNELS,
  EVERYONE_LABEL,
  broadcastName,
  cleanParam,
  clockWhen,
  emptyAudienceRefusal,
  enrolFor,
  heardTooWords,
  heardWords,
  leftOutBy,
  nextOpenMoment,
  parseParamSpec,
  proposalChannelsWords,
  sendsWaitWords,
  type AskedPurpose,
  type CampaignHow,
  type CampaignMessage,
  type ConsentChannel,
  type ParamSpec,
  type PersonRowVM,
} from "@chanlytics/contracts";
import { campaignHowOf } from "@chanlytics/core";
import { monthSentOrNull } from "../../../campaigns/month-sent";
import { archivedListWords, poolList } from "../../../people/audience";
import { createBroadcastPorts } from "../../../ports/campaign-ports";
import { load } from "../../../readers";
import { audiencePool } from "../../../readers/audience-pool";
import { lists as listsReader } from "../../../readers/lists";
import {
  AUDIENCES_CALL,
  UUID,
  actAction,
  askedMessage,
  namedChannels,
  propose,
  proposedChannels,
  refuse,
  stepMessage,
  stepNamed,
  str,
  touchesThisWeek,
  whatsappAloneRefusal,
  whatsappHow,
  type AskedMessage,
  type ProposalOutcome,
  type ToolContext,
} from "../context";
import { cardSays, stepSays } from "./says";

/** The values a proposal fills the message's slots with: typed text once, or one the job fills per person; or the refusal. */
function proposedValues(params: unknown): { specs: ParamSpec[] } | { refusal: string } {
  const specs: ParamSpec[] = [];
  for (const p of Array.isArray(params) ? (params as unknown[]) : []) {
    const spec = parseParamSpec(p);
    if (!spec) return { refusal: "each value is text, or @first_name, @business_name, @booking_link or @review_link" };
    if (spec.kind !== "text") {
      specs.push(spec);
      continue;
    }
    const v = cleanParam(spec.value);
    if (v === null)
      return { refusal: "every typed value must be plain text under 1024 characters, without line breaks" };
    specs.push({ kind: "text", value: v });
  }
  return { specs };
}

/**
 * The channels a broadcast proposal goes by, and how the workspace can carry it by them, or the refusal. By WhatsApp when
 * it names no channel, and the workspace ready on it or not: with no number the route refuses, in these words, and a card
 * the route then refuses has wasted the operator's approval. By the channels it names, the route's own rule (core
 * campaignHowOf): a tick the workspace cannot send on, whose message has no version, or that the purpose never carries
 * (texts carry no offers) is refused in the composers' words, before any count. `message` null is one an earlier step of
 * the plan writes, judged by the workspace's channels alone (context.ts stepMessage).
 */
async function broadcastBy(
  t: ToolContext,
  message: Pick<CampaignMessage, "versions"> | null,
  purpose: AskedPurpose,
  asked: unknown,
): Promise<{ how: CampaignHow; channels: ConsentChannel[]; named: boolean } | { refusal: string }> {
  const given = proposedChannels(asked);
  if ("refusal" in given) return given;
  const { channels, named } = given;
  if (!named) {
    // A broadcast is the business's news (contracts MessageAbout, decision D1).
    const how = await whatsappHow(t, "ours");
    return how.ready.whatsapp.ready
      ? { how, channels, named }
      : { refusal: `${how.ready.whatsapp.why ?? "WhatsApp is not ready"}` };
  }
  try {
    const ports = createBroadcastPorts(t.ctx, t.tenantId, { fresh: false });
    return {
      how: (await campaignHowOf(ports, message ?? stepMessage(channels), channels, purpose)).how,
      channels,
      named,
    };
  } catch (e) {
    if (e instanceof AppError) return { refusal: e.message };
    throw e;
  }
}

/**
 * The message a broadcast proposal is made on, from the id the model gave: read as the route reads it (tools/context.ts
 * askedMessage), and, where the proposal names no channel and the message has no WhatsApp version to go by, refused before
 * anyone is counted with what it can go by (whatsappAloneRefusal), or the refusal.
 */
async function broadcastMessage(
  t: ToolContext,
  id: string,
  channels: unknown,
): Promise<AskedMessage | { refusal: string }> {
  const asked = await askedMessage(t, id);
  if ("refusal" in asked) return asked;
  // A broadcast is the business's news (contracts MessageAbout, decision D1).
  const no = channels === undefined || channels === null ? await whatsappAloneRefusal(t, asked.message, "ours") : null;
  return no ? { refusal: no } : asked;
}

/**
 * Who a broadcast proposal sends to and what its card says of the channels: the count, the words after it ("on WhatsApp and
 * by email (52 on WhatsApp, 32 by email)", none for a proposal that named no channel), the channels the card keeps
 * for its commit, how many each channel reaches, and how many are left out. Each person is reached once, on the first
 * channel that reaches them (contracts enrolFor, the route's own), and whoever hears from a campaign or a broadcast within
 * a week of it, either side (`out`: contracts leftOutBy over the composer's read, for the card's own time) is left out, as
 * the route skips them (contracts breathSplit): the count, the split and the month are of who goes.
 */
function broadcastReach(
  rows: PersonRowVM[],
  purpose: AskedPurpose,
  by: { how: CampaignHow; channels: ConsentChannel[]; named: boolean },
  out: ReadonlySet<string>,
): {
  count: number;
  says: string;
  kept: { channels?: ConsentChannel[] };
  byChannel: Record<ConsentChannel, number>;
  leftOut: number;
} {
  const { goes, leftOut } = breathSplit(enrolFor(rows, "everyone", null, null, purpose, by.how), (e) => e.row.id, out);
  const byChannel: Record<ConsentChannel, number> = { whatsapp: 0, sms: 0, email: 0 };
  for (const e of goes) byChannel[e.channel] += 1;
  if (!by.named) return { count: goes.length, says: "", kept: {}, byChannel, leftOut: leftOut.length };
  return {
    count: goes.length,
    says: ` · ${proposalChannelsWords(by.channels, byChannel)}`,
    kept: namedChannels(by),
    byChannel,
    leftOut: leftOut.length,
  };
}

/**
 * Who a broadcast card sends to (broadcastReach), with how many are left out in the composer's words and their separator
 * (" · 1 left out: they hear from you within a week of it"; none where nobody does), or why there is no card: who heard
 * unread (context.ts touchesThisWeek, logged there) is no card, since "nobody heard" would promise a send to people the
 * route then leaves out. Who is left out is judged for the time the card is set for (`sendsAt`, now where it goes at
 * once), either side, as the route judges it (contracts leftOutBy). Nobody it reaches is said in the route's words, which
 * say which cause it is (nobody said this yes, or the ones who did have no number); everyone it reaches being left out is
 * said as the composer says it, and sending to them too is a person's own switch there, never Ask's.
 */
async function broadcastCount(
  t: ToolContext,
  aud: { rows: PersonRowVM[]; label: string; purpose: AskedPurpose },
  by: { how: CampaignHow; channels: ConsentChannel[]; named: boolean },
  sendsAt: Date,
): Promise<(ReturnType<typeof broadcastReach> & { leftOutSaid: string }) | { refusal: string }> {
  const { rows, label, purpose } = aud;
  const touches = await touchesThisWeek(t, "propose_sequence.once");
  if (!touches) return { refusal: PLAYBOOK_CARD_REFUSALS.weekUnread };
  const reach = broadcastReach(rows, purpose, by, leftOutBy(touches, sendsAt.getTime(), t.now.getTime()));
  if (reach.count > 0) {
    const said = heardWords(reach.leftOut, true);
    return { ...reach, leftOutSaid: said ? ` · ${said}` : "" };
  }
  if (reach.leftOut > 0)
    return {
      refusal: `${allLeftOutWords(label, reach.leftOut)} Say so; a person may send it to them anyway from the composer (“${heardTooWords(reach.leftOut)}”)`,
    };
  return {
    refusal: `nobody on "${label}" can receive this message: ${emptyAudienceRefusal(purpose, label, rows, by.how)} Say so, and name what to do about it`,
  };
}

/**
 * What the month's email and text allowance will hold back of a broadcast that goes by them (A7), with its separator:
 * the send screen's own sentence (contracts allowanceBeforeSend), counted against the month the send really goes in, as
 * that screen and the door count it: `goesAt`, the next open moment of the time it is set for (now where it goes at
 * once), so one set for 10 PM on the month's last day goes, and is counted, the next morning (core createBroadcast).
 * Nothing while there is room, where it goes by WhatsApp alone (no count is read), or where the month could not be
 * counted.
 */
async function broadcastHeld(
  t: ToolContext,
  channels: readonly ConsentChannel[],
  byChannel: Record<ConsentChannel, number>,
  purpose: AskedPurpose,
  goesAt: Date,
): Promise<string> {
  if (!channels.some((c) => c !== "whatsapp")) return "";
  const words = allowanceBeforeSend(byChannel, await monthSentOrNull(t.tenantId, goesAt), null, purpose);
  return words ? ` · ${words}` : "";
}

/**
 * When a broadcast card says it goes: now; the time it is set for; or, where that falls outside the sending hours, the
 * moment it really goes and why (contracts sendsWaitWords), as the send screen's note says it (broadcasts/when.tsx).
 */
function goesWords(t: ToolContext, when: string | null, open: { at: Date; moved: boolean }): string {
  if (open.moved) return `${clockWhen(open.at.getTime(), t.timezone, t.now.getTime())} — ${sendsWaitWords()}`;
  return when ? clockWhen(Date.parse(when), t.timezone, t.now.getTime()) : "now";
}

/**
 * When a broadcast proposal is set for, as it was asked: null for now, or an ISO time with its offset, or the refusal. With
 * its offset: a bare date is midnight UTC, the evening before here, and the route refuses it after the person approved
 * the card.
 */
function proposedWhen(asked: unknown): { when: string | null } | { refusal: string } {
  const when = str(asked, 40) || null;
  if (when && (Number.isNaN(Date.parse(when)) || !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(when)))
    return { refusal: "scheduled_for must be an ISO time with its offset, like 2026-09-20T15:00:00-04:00" };
  return { when };
}

/** What a broadcast proposal takes (broadcastAction's input): the message and the audience, its values, when, and the channels it goes by. */
interface BroadcastProposed {
  template_id: string;
  audience_kind: string;
  audience_id?: string;
  params?: string[];
  scheduled_for?: string;
  name?: string;
  channels?: ConsentChannel[];
}

/**
 * Who a broadcast goes to, counted the way the route will count it: the pool and the list the route will read, so the
 * count here is the count it enrols, once a turn, so a listing of the audiences before it read the same pool
 * (readers/audience-pool.ts). Any list is counted the way the send will count it (audience.ts poolList): a built-in or a
 * saved list alike, and one that can't be counted here refused with why. One of the workspace's own is counted from the
 * lists the turn holds (readers/lists.ts, as sequences.lists read them), never read again.
 */
async function broadcastAudience(
  t: ToolContext,
  kind: string,
  audienceId: string | null,
): Promise<{ rows: PersonRowVM[]; label: string } | { refusal: string }> {
  const pool = (await load(t.rc, audiencePool, undefined)).data;
  if (kind === "everyone" || audienceId === null) return { rows: pool.rows, label: EVERYONE_LABEL };
  const kept = kind === "saved" ? (await load(t.rc, listsReader, undefined)).data.lists : undefined;
  const found = await poolList(
    t.ctx,
    t.tenantId,
    pool,
    { kind: kind === "list" ? "builtin" : "saved", id: audienceId },
    kept,
  );
  if (!found) return { refusal: `no such list; ${AUDIENCES_CALL} names them` };
  if (found.archived) return { refusal: archivedListWords(found.label, "send") };
  if ("unknown" in found) return { refusal: `${found.label} can't be counted here: ${found.unknown}` };
  const members = new Set(found.memberIds);
  return { rows: pool.rows.filter((r) => members.has(r.id)), label: found.label };
}

/**
 * The message a broadcast proposal sends, from the id the model gave (broadcastMessage), held to its values; or, for an
 * earlier step of the plan's (`@step:n`, context.ts stepNamed), none yet: its values are the step's to fit, and the yes
 * it needs is the offer's a plan's message is (context.ts stepMessage).
 */
async function sentMessage(
  t: ToolContext,
  named: { templateId: string; step: number | null; channels: unknown },
  params: readonly ParamSpec[],
): Promise<
  | { asked: AskedMessage; purpose: AskedPurpose }
  | { asked: null; step: number; purpose: AskedPurpose }
  | { refusal: string }
> {
  const { templateId, step } = named;
  if (step !== null) return { asked: null, step, purpose: stepMessage([]).purpose };
  // The message the route will read, by any of its versions' ids: the same verb, so the same words.
  const asked = await broadcastMessage(t, templateId, named.channels);
  if ("refusal" in asked) return asked;
  const { slots } = asked.message;
  if (params.length !== slots)
    return { refusal: `this template takes ${slots} value${slots === 1 ? "" : "s"}, in order` };
  // The same purpose the route will derive, from the same message this function already read. An assistant that proposes
  // a broadcast the route then refuses has wasted the operator's approval.
  return { asked, purpose: asked.message.purpose };
}

/**
 * What a broadcast card says of its message: its words quoted (cardSays), or, a step's, which step makes it and the offer
 * its values type (stepSays).
 */
function messageSaid(
  sent: { asked: AskedMessage } | { asked: null; step: number },
  params: readonly ParamSpec[],
  by: { channels: ConsentChannel[]; named: boolean },
): { says: string } | { refusal: string } {
  return sent.asked ? cardSays(sent.asked, params, by, 160) : { says: stepSays(sent.step, params) };
}

async function proposeBroadcast(t: ToolContext, input: BroadcastProposed): Promise<ProposalOutcome> {
  const templateId = str(input.template_id, 40);
  const kind = str(input.audience_kind, 10);
  const audienceId = str(input.audience_id, 60) || null;
  // An earlier step of Ask's plan's message, named by its token (context.ts stepNamed), or an id the reads returned.
  const step = stepNamed(t, templateId);
  if (step === null && !UUID.test(templateId)) return refuse(`template_id must be an id ${AUDIENCES_CALL} returned`);
  if (!(AUDIENCE_KINDS as readonly string[]).includes(kind))
    return refuse("audience_kind must be everyone, list or saved");
  if (kind === "list" && !BUILTIN_LISTS.some((l) => l.id === audienceId))
    return refuse(`audience_id must be a People list id, as ${AUDIENCES_CALL} names them`);
  if (kind === "saved" && !(audienceId && UUID.test(audienceId)))
    return refuse(`audience_id must be a saved list id from ${AUDIENCES_CALL}`);
  const given = proposedValues(input.params);
  if ("refusal" in given) return refuse(given.refusal);
  const params = given.specs;
  const sent = await sentMessage(t, { templateId, step, channels: input.channels }, params);
  if ("refusal" in sent) return refuse(sent.refusal);
  const { asked, purpose } = sent;
  const audience = await broadcastAudience(t, kind, audienceId);
  if ("refusal" in audience) return refuse(audience.refusal);
  const { rows, label } = audience;
  const by = await broadcastBy(t, asked?.message ?? null, purpose, input.channels);
  if ("refusal" in by) return refuse(by.refusal);
  const asWhen = proposedWhen(input.scheduled_for);
  if ("refusal" in asWhen) return refuse(asWhen.refusal);
  const { when } = asWhen;
  const sendsAt = when ? new Date(Date.parse(when)) : t.now;
  // Who is left out is judged for the time it is set for, as the route judges it: within a week of it, either side.
  const reach = await broadcastCount(t, { rows, label, purpose }, by, sendsAt);
  if ("refusal" in reach) return refuse(reach.refusal);
  const { count, says, kept, byChannel, leftOutSaid } = reach;
  // A step's message is not filed yet: the card says which step makes it, and quotes the offer its values type.
  const said = messageSaid(sent, params, by);
  if ("refusal" in said) return refuse(said.refusal);
  // Named for the business's day and said by its clock, as the route names it and the pages say it; a step's message is
  // named by the route once it is filed.
  const name = str(input.name, 80) || (asked ? broadcastName(asked.message.name, t.timezone, t.now) : null);
  // The moment it really goes, once: the month the allowance is counted in, and the time the card says.
  const open = nextOpenMoment(t.timezone, sendsAt);
  const whenWords = goesWords(t, when, open);
  const held = await broadcastHeld(t, by.channels, byChannel, purpose, open.at);
  const what = asked ? `“${asked.message.name}” · ${whenWords}: ${said.says}` : `${said.says} · ${whenWords}`;
  return propose({
    kind: "broadcast",
    title: `Broadcast to ${label}`,
    summary: `${count} ${count === 1 ? "person" : "people"} who said yes${says}${held}${leftOutSaid} · ${what}`,
    payload: {
      template_id: asked ? asked.message.anchor.id : templateId,
      template_name: asked ? asked.message.name : null,
      audience_kind: kind,
      audience_id: audienceId,
      audience_label: label,
      params,
      scheduled_for: when,
      name,
      count,
      ...kept,
    },
  });
}

/** A broadcast, one message sent once: propose_sequence's action once (sequence.ts), once propose_broadcast. */
export const broadcastAction = actAction({
  kind: "broadcast",
  input: z.object({
    template_id: z.string(),
    audience_kind: z.enum(["everyone", "list", "saved"]),
    audience_id: z.string().optional(),
    params: z.array(z.string()).optional(),
    scheduled_for: z.string().optional(),
    name: z.string().optional(),
    channels: z.array(z.enum(CONSENT_CHANNELS)).optional(),
  }),
  examples: [
    {
      template_id: "d4e5f6a7-b8c9-4d0e-9f1a-2b3c4d5e6f70",
      audience_kind: "everyone",
      params: ["@first_name", "20% off until Friday"],
    },
    { template_id: "d4e5f6a7-b8c9-4d0e-9f1a-2b3c4d5e6f70", audience_kind: "list", audience_id: "quiet", params: [] },
    {
      template_id: "d4e5f6a7-b8c9-4d0e-9f1a-2b3c4d5e6f70",
      audience_kind: "saved",
      audience_id: "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b",
      params: ["@first_name"],
      scheduled_for: "2026-10-03T15:00:00-04:00",
      name: "October offer",
    },
  ],
  label: "Preparing a broadcast",
  words:
    "Action once takes template_id, one message (the id of any of its versions, as sequences with action lists lists it), and proposes sending it to an audience, everyone whose yes covers it (a reminder or a confirmation the yes to messages, an offer or news the yes to offers) or any list sequences with action lists names (audience_kind everyone; list for a People list, with its id as audience_id; saved for one of the workspace's own, with its audience_id), with params as the message's values in order (typed text, or @first_name, @business_name, @booking_link or @review_link, the link its Google listing keeps for a review, to fill per person), an optional scheduled_for as an ISO time with its offset (2026-09-20T15:00:00-04:00, never a bare date), an optional name, and optional channels (whatsapp, sms, email; whatsapp when none is named, so for a message that holds email or text name the channels its `channels` in sequences with action lists say it holds): each person is reached once, on the first it can, and a channel the workspace cannot send on, or the message has no version for, is refused.",
  build: proposeBroadcast,
});
