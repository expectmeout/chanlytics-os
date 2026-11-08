/**
 * The adapter between the campaign verbs and this runtime: the tables a
 * person's broadcast, an approval, a cancel and a playbook's check touch. A
 * verb never sees a client, a service module or an environment; it sees
 * these. The session role writes here: it updates a broadcast's `state`
 * (00046) and `scheduled_for` (00119). A broadcast, its people and its job are
 * assembled through one door (00282) that is the service role's alone.
 *
 * Beside the writes, the reads a send is judged by: the message, the booking link and the review link, the audience
 * pool (every person, and a built-in or saved list over it) read once, in the workspace's own zone, the WhatsApp
 * number's health, and who heard from a campaign or a broadcast this week (the week's breath). A release or a cancel
 * puts the broadcast_send job on the ledger, or takes it off (schedule, cancelKindFor), and every act is recorded as a
 * decision: a broadcast's and an approval's in the door's own write, a cancel's after it.
 */
import { AppError, parseTenantConfig } from "@chanlytics/contracts";
import { approveBroadcast, assembleBroadcast } from "@chanlytics/db/jobs";
import {
  recordCampaignMonthSent,
  cancelSequenceBatch,
  holdRecipients,
  listMessageVersionRows,
  getRecentTouches,
  reviewLinkOf,
  isWorkspacePaused,
} from "@chanlytics/db/campaigns";
import type { Json } from "@chanlytics/db/types";
import type {
  ApproveRunPorts,
  AssemblePorts,
  CancelBroadcastPorts,
  CreateBroadcastPorts,
  TemplateValuesPorts,
} from "@chanlytics/core";
import type { RouteContext } from "../shared/with-route";
import { log, requestId } from "../shared/log";
import { recordDecision } from "../shared/verbs";
import { cancelKindFor } from "../shared/jobs";
import { archivedListWords, getAudiencePool, findPoolList, type AudiencePool } from "./audience";
import { getStoredConfig } from "../workspace/config-row";
import { serviceDb } from "../shared/service-db";
import { getTenantFacts } from "../shared/tenant";
import { getChannelsReady, findChannelsReadyOrNull, findWhatsappHealth } from "./channels-ready";
import { jsonCopyOf } from "@chanlytics/db/shared";

export function templateValuePorts(ctx: RouteContext, tenantId: string): TemplateValuesPorts {
  return {
    // The message the version names, as every row the workspace holds of it on any channel (a message needs no WhatsApp row).
    message: (id) => listMessageVersionRows(ctx.supabase, tenantId, { id }),
    bookingLink: async () => {
      // A read that fails is no link, as it always was: the step that needs one says so.
      const config = await getStoredConfig(ctx.supabase, tenantId).catch(() => null);
      return parseTenantConfig(config)?.brain?.booking_link ?? null;
    },
    // The link the workspace's Google listing keeps, read as the member reads the listing (its row policy). A read that
    // fails throws: "Connect your Google listing" would be a wrong thing to tell someone whose listing is there.
    reviewLink: () => reviewLinkOf(ctx.supabase, tenantId),
  };
}

/**
 * The run, its people, its job and its decision, whole: the one SQL door (00282 assemble_broadcast, with its decision
 * since 00381). It puts the send job on the ledger, which no session may, so it is the service role's, called here after
 * the route's role check (the door) and naming the person who asked, whose decision the send is; the function itself
 * asks that every person, the template and the playbook are the workspace's, as the insert policies asked of the
 * session. The decision carries the request's `via` and the undo link it named, as recordDecision's did.
 */
function assemblePorts(ctx: RouteContext, tenantId: string): AssemblePorts {
  return {
    assemble: async (row, recipients, sendAt, decision) => {
      const created = await assembleBroadcast(serviceDb(), {
        tenantId,
        run: {
          name: row.name,
          template_id: row.template_id,
          template_name: row.template_name,
          template_language: row.template_language,
          params: row.params,
          // The list as it was counted rides with the audience (decision 0009, "sends remember"): dropped here, a
          // broadcast forgot the token and the rule it was counted by, while a playbook's run kept them.
          audience: {
            kind: row.audience.kind,
            id: row.audience.id,
            label: row.audience.label,
            ...(row.audience.list
              ? {
                  list: {
                    token: row.audience.list.token,
                    rule: jsonCopyOf(row.audience.list.rule),
                    counted_at: row.audience.list.counted_at,
                  },
                }
              : {}),
          },
          state: row.state,
          scheduled_for: row.scheduled_for,
          recipient_count: row.recipient_count,
          created_by: ctx.userId,
          channels: row.channels,
        },
        recipients: recipients.map((r) => ({ contact_id: r.contact_id, facts: r.facts, channel: r.channel })),
        sendAt,
        decision: decision
          ? {
              actor: decision.by.kind === "user" ? decision.by.userId : null,
              payload: decision.payload,
              via: ctx.via ?? null,
              undoOf: ctx.undoOf ?? null,
            }
          : null,
      });
      // The undo named a decision this database does not hold (a card kept from a stale tab): the run stands without
      // the link, and the log says which link was refused, as recordDecision's does.
      if (created.undoDropped) log.error("decision_undo_of_unknown", { undo_of: ctx.undoOf, verb: "send_broadcast" });
      return { id: created.id, decisionId: created.decisionId };
    },
    // The month's allowance, counted before anyone is enrolled (a function only the service role may call, so it is
    // the route's role check that stands in front of it), and those past it held the moment the run exists (core
    // campaigns/allowance.ts): the send's own check at the wire stays as the backstop. Counted in the month the run opens
    // in (`at`), which a broadcast scheduled ahead may not share with the day it is made.
    monthSent: (channel, at) => recordCampaignMonthSent(serviceDb(), tenantId, channel, at),
    holdRecipients: (broadcastId, contactIds, reason) =>
      holdRecipients(serviceDb(), { tenantId, broadcastId, contactIds, reason }),
  };
}

/**
 * The ports a broadcast is made over. `fresh`: ask the edge what the workspace can send on now, whatever it kept: true for
 * the route that creates one (a send committed on a "ready" the edge has since taken back would enrol people it then holds),
 * false for a read that only proposes (Ask's card before the person approves it), which the route judges again when it
 * runs. Required, so no caller leaves the choice to a default.
 */
export function createBroadcastPorts(
  ctx: RouteContext,
  tenantId: string,
  options: { fresh: boolean },
): CreateBroadcastPorts {
  // The workspace's facts, read once: the zone its people's rows are said in is the zone the send is timed by.
  let facts: ReturnType<typeof getTenantFacts> | null = null;
  const zone = async () => (await (facts ??= getTenantFacts(ctx.supabase, tenantId))).timezone;
  // The pool, read once: a send to a smart list judges its rule over the same people it enrols from.
  let pool: Promise<AudiencePool> | null = null;
  // Counted without the workspace's pause: it changes what is sent, not who can hear the business (channels-ready.ts).
  const readyForPool = () => findChannelsReadyOrNull(ctx, tenantId, { withPause: false });
  const poolAt = async (now: Date) =>
    (pool ??= getAudiencePool(ctx, tenantId, await zone(), now, await readyForPool()));
  return {
    ...templateValuePorts(ctx, tenantId),
    ...assemblePorts(ctx, tenantId),
    timezone: zone,
    // Everyone, not one page of them, with their appointments: the pool the page and the assistant count from.
    people: async (now) => (await poolAt(now)).rows,
    // One list over the pool the send enrols from (audience.ts findPoolList): a built-in or a saved list, every member,
    // not the first thousand, or why it can't be counted.
    // An archived list (00169) is sent to no new broadcast: it is off People's rail.
    list: async (ref, now) => {
      const found = await findPoolList(ctx, tenantId, await poolAt(now), ref);
      if (found?.archived) throw new AppError("validation", archivedListWords(found.label, "send"));
      return found;
    },
    // What the workspace can send on now, channel by channel, and the WhatsApp number's health the day's limit is
    // judged by (campaigns/channels-ready.ts): the rows the composers read, so a tick refused here is one they greyed.
    channels: async () => {
      const [ready, health] = await Promise.all([
        // With the workspace's pause: a broadcast made under one is refused (core readCampaignHowOf), and Ask's card with it.
        getChannelsReady(ctx, tenantId, { fresh: options.fresh, withPause: true }),
        findWhatsappHealth(ctx, tenantId),
      ]);
      return { ready, health };
    },
    // Who heard from a campaign or a broadcast from a week ago on, or is due to, and the time of each: the composer's own
    // read (GET broadcasts/touches' `touched_at`, db getRecentTouches), over the same window (contracts PLAYBOOK_BREATH_MS), so the
    // people the page says a send leaves out and the people the send skips are one number for one moment. A read that
    // fails throws, and the send is refused.
    touches: (now) => getRecentTouches(ctx.supabase, tenantId, now),
  };
}

export function approveRunPorts(ctx: RouteContext, tenantId: string): ApproveRunPorts {
  return {
    timezone: async () => (await getTenantFacts(ctx.supabase, tenantId)).timezone,
    // Under the session's own RLS, as the zone above is: a member reads their own workspace's row.
    paused: () => isWorkspacePaused(ctx.supabase, tenantId),
    // The member's own door, on their own session (00353): the run released, its job written and the approval recorded
    // as theirs together, so no service-role write and no put-back. The job carries the request it was approved in,
    // as every job scheduled while a request is served does (jobs schedule.ts).
    approve: async (id, at, value) => {
      const request = requestId();
      const done = await approveBroadcast(ctx.supabase, {
        tenantId,
        broadcastId: id,
        sendAt: at,
        job: value.job ? (request ? { request_id: request } : {}) : null,
        decision: value.decision,
        via: ctx.via ?? null,
        undoOf: ctx.undoOf ?? null,
      });
      // The undo named a decision this database does not hold (a card kept from a stale tab): the approval stands
      // without the link, and the log says which link was refused, as recordDecision's does.
      if (done?.undoDropped) log.error("decision_undo_of_unknown", { undo_of: ctx.undoOf, verb: "send_broadcast" });
      return done?.decisionId ?? null;
    },
  };
}

export function cancelBroadcastPorts(ctx: RouteContext, tenantId: string): CancelBroadcastPorts {
  return {
    withdraw: (id) => cancelKindFor(tenantId, "broadcast_send", "broadcast_id", id),
    // The batch door (00442 sequence_batch_cancel): members no longer write a batch's row themselves.
    cancel: (id, from) => cancelSequenceBatch(ctx.supabase, { tenantId, batchId: id, from }),
    record: (subject, id, verb, payload) => recordDecision(ctx, tenantId, subject, id, verb, payload),
  };
}
