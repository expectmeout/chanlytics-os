import "server-only";
import { z } from "zod";
import {
  AUDIENCE_KINDS,
  AppError,
  BUILTIN_LISTS,
  CONSENT_CHANNELS,
  EVERYONE_LABEL,
  broadcastName,
  cleanParam,
  clockWhen,
  eligibleFor,
  emptyAudienceRefusal,
  parseParamSpec,
  proposalChannelsWords,
  purposeOfTemplate,
  reachSplit,
  type AskedPurpose,
  type CampaignHow,
  type ConsentChannel,
  type ParamSpec,
  type PersonRowVM,
} from "@chanlytics/contracts";
import { campaignHowOf } from "@chanlytics/core";
import { archivedListWords, poolList } from "../../../people/audience";
import { createBroadcastPorts } from "../../../ports/campaign-ports";
import { load } from "../../../readers";
import { audiencePool } from "../../../readers/audience-pool";
import { lists as listsReader } from "../../../readers/lists";
import {
  AUDIENCES_CALL,
  UUID,
  actAction,
  namedChannels,
  propose,
  proposedChannels,
  refuse,
  str,
  whatsappHow,
  type ProposalOutcome,
  type ToolContext,
} from "../context";
import { cardSays } from "./says";

/** The values a proposal fills the template's slots with: typed text once, or one the job fills per person; or the refusal. */
function proposedValues(params: unknown): { specs: ParamSpec[] } | { refusal: string } {
  const specs: ParamSpec[] = [];
  for (const p of Array.isArray(params) ? (params as unknown[]) : []) {
    const spec = parseParamSpec(p);
    if (!spec) return { refusal: "each value is text, or @first_name, @business_name or @booking_link" };
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
 * (texts carry no offers) is refused in the composers' words, before any count.
 */
async function broadcastBy(
  t: ToolContext,
  tpl: { name: string; language: string },
  asked: unknown,
  purpose: AskedPurpose,
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
    return { how: (await campaignHowOf(ports, tpl, channels, purpose)).how, channels, named };
  } catch (e) {
    if (e instanceof AppError) return { refusal: e.message };
    throw e;
  }
}

/**
 * Who a broadcast proposal reaches and what its card says of the channels: the count, the words after it ("on WhatsApp and
 * by email (52 on WhatsApp, 32 by email)", none for a proposal that named no channel) and the channels the card keeps
 * for its commit. Each person is reached once, on the first channel that reaches them (contracts reachSplit).
 */
function broadcastReach(
  rows: PersonRowVM[],
  purpose: AskedPurpose,
  by: { how: CampaignHow; channels: ConsentChannel[]; named: boolean },
): { count: number; says: string; kept: { channels?: ConsentChannel[] } } {
  if (!by.named)
    return { count: eligibleFor(rows, "everyone", null, null, purpose, by.how).length, says: "", kept: {} };
  const split = reachSplit(rows, purpose, by.how);
  return {
    count: split.reached,
    says: ` · ${proposalChannelsWords(by.channels, split.byChannel)}`,
    kept: namedChannels(by),
  };
}

/** What a broadcast proposal takes (broadcastAction's input): the template and the audience, its values, when, and the channels it goes by. */
interface BroadcastProposed {
  template_id: string;
  audience_kind: string;
  audience_id?: string;
  params?: string[];
  scheduled_for?: string;
  name?: string;
  channels?: ConsentChannel[];
}

async function proposeBroadcast(t: ToolContext, input: BroadcastProposed): Promise<ProposalOutcome> {
  const templateId = str(input.template_id, 40);
  const kind = str(input.audience_kind, 10);
  const audienceId = str(input.audience_id, 60) || null;
  if (!UUID.test(templateId)) return refuse(`template_id must be an id ${AUDIENCES_CALL} returned`);
  if (!(AUDIENCE_KINDS as readonly string[]).includes(kind))
    return refuse("audience_kind must be everyone, list or saved");
  if (kind === "list" && !BUILTIN_LISTS.some((l) => l.id === audienceId))
    return refuse(`audience_id must be a People list id, as ${AUDIENCES_CALL} names them`);
  if (kind === "saved" && !(audienceId && UUID.test(audienceId)))
    return refuse(`audience_id must be a saved list id from ${AUDIENCES_CALL}`);
  const given = proposedValues(input.params);
  if ("refusal" in given) return refuse(given.refusal);
  const params = given.specs;
  const { data: tpl } = await t.ctx.supabase
    .from("templates")
    .select("id, name, language, meta_status, category, variables, body_preview")
    .eq("id", templateId)
    .eq("tenant_id", t.tenantId)
    .eq("channel", "whatsapp")
    .maybeSingle();
  if (!tpl || tpl.meta_status !== "approved")
    return refuse(`that template is not approved by WhatsApp; ${AUDIENCES_CALL} names the approved ones`);
  const expected = Array.isArray(tpl.variables) ? tpl.variables.length : 0;
  if (params.length !== expected)
    return refuse(`this template takes ${expected} value${expected === 1 ? "" : "s"}, in order`);

  // The audience, counted the way the route will count it.
  // The pool and the list the route will read, so the count here is the count it enrols: once a turn, so a listing of
  // the audiences before it read the same pool (readers/audience-pool.ts).
  const pool = (await load(t.rc, audiencePool, undefined)).data;
  // Any list, counted the way the send will count it (audience.ts poolList): a built-in or a saved list alike, and
  // one that can't be counted here refused with why. One of the workspace's own is counted from the lists the turn
  // holds (readers/lists.ts, as campaigns.audiences read them), never read again.
  let members: Set<string> | null = null;
  let label = EVERYONE_LABEL;
  if (kind !== "everyone") {
    const kept = kind === "saved" ? (await load(t.rc, listsReader, undefined)).data.lists : undefined;
    const found = await poolList(
      t.ctx,
      t.tenantId,
      pool,
      {
        kind: kind === "list" ? "builtin" : "saved",
        id: audienceId!,
      },
      kept,
    );
    if (!found) return refuse(`no such list; ${AUDIENCES_CALL} names them`);
    if (found.archived) return refuse(archivedListWords(found.label, "send"));
    if ("unknown" in found) return refuse(`${found.label} can't be counted here: ${found.unknown}`);
    members = new Set(found.memberIds);
    label = found.label;
  }
  const rows = members ? pool.rows.filter((r) => members!.has(r.id)) : pool.rows;
  // The same purpose the route will derive, from the same column of the same
  // template row this function already read. An assistant that proposes a
  // broadcast the route then refuses has wasted the operator's approval.
  const purpose = purposeOfTemplate(tpl.category);
  const by = await broadcastBy(t, tpl, input.channels, purpose);
  if ("refusal" in by) return refuse(by.refusal);
  const { count, says, kept } = broadcastReach(rows, purpose, by);
  // In the route's words, which say which cause it is -- nobody said this yes, or the ones who did have no number.
  if (count === 0)
    return refuse(
      `nobody on "${label}" can receive this message: ${emptyAudienceRefusal(purpose, label, rows, by.how)} Say so, and name what to do about it`,
    );
  const when = str(input.scheduled_for, 40) || null;
  // With its offset: a bare date is midnight UTC, the evening before here, and
  // the route refuses it after the person approved the card.
  if (when && (Number.isNaN(Date.parse(when)) || !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(when)))
    return refuse("scheduled_for must be an ISO time with its offset, like 2026-09-20T15:00:00-04:00");
  const said = await cardSays(t, tpl, params, by, 160);
  if ("refusal" in said) return refuse(said.refusal);
  // Named for the business's day and said by its clock, as the route names it and the pages say it.
  const name = str(input.name, 80) || broadcastName(tpl.name, t.timezone, t.now);
  const whenWords = when ? clockWhen(Date.parse(when), t.timezone, t.now.getTime()) : "now";
  return propose({
    kind: "broadcast",
    title: `Broadcast to ${label}`,
    summary: `${count} ${count === 1 ? "person" : "people"} who said yes${says} · “${tpl.name}” · ${whenWords}: ${said.says}`,
    payload: {
      template_id: tpl.id,
      template_name: tpl.name,
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

/** A broadcast, one message sent once: propose_campaign's action broadcast (campaign.ts), once propose_broadcast. */
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
    "Action broadcast takes template_id, one approved WhatsApp template, and proposes sending it to an audience, everyone who said yes or any list campaigns with action audiences names (audience_kind everyone; list for a People list, with its id as audience_id; saved for one of the workspace's own, with its audience_id), with params as the template's values in order (typed text, or @first_name, @business_name or @booking_link to fill per person), an optional scheduled_for as an ISO time with its offset (2026-09-20T15:00:00-04:00, never a bare date), an optional name, and optional channels (whatsapp, sms, email; whatsapp when none is named): each person is reached once, on the first it can, and a channel the workspace cannot send on, or the message has no version for, is refused.",
  build: proposeBroadcast,
});
