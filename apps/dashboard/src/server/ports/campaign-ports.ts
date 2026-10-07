/**
 * The adapter between the campaign verbs and this runtime: the tables a
 * person's broadcast, an approval, a cancel and a playbook's check touch. A
 * verb never sees a client, a service module or an environment; it sees
 * these. The session role writes here: it updates a broadcast's `state`
 * (00046) and `scheduled_for` (00119). A broadcast, its people and its job are
 * assembled through one door (00282) that is the service role's alone.
 *
 * Beside the writes, the reads a send is judged by: the template and the booking link, the audience pool (every person,
 * and a built-in or saved list over it) read once, in the workspace's own zone, and the WhatsApp number's health. A
 * release or a cancel puts the broadcast_send job on the ledger, or takes it off (schedule, cancelKindFor), and every
 * act is recorded as a decision.
 */
import { AppError, parseTenantConfig } from "@chanlytics/contracts";
import {
  assembleBroadcast,
  campaignMonthSent,
  holdRecipients,
  ownVersionsFiled,
  workspacePaused,
  type Json,
} from "@chanlytics/db";
import type {
  ApproveRunPorts,
  AssemblePorts,
  CancelBroadcastPorts,
  CreateBroadcastPorts,
  TemplateValuesPorts,
} from "@chanlytics/core";
import type { RouteContext } from "../with-route";
import { changed } from "./core-ports";
import { recordDecision } from "../verbs";
import { cancelKindFor, schedule } from "../jobs";
import { archivedListWords, audiencePool, poolList, type AudiencePool } from "../people/audience";
import { serviceDb } from "../service-db";
import { tenantFacts } from "../tenant";
import { channelsReadyOf, channelsReadyOrNull, whatsappHealthOf } from "../campaigns/channels-ready";

export function templateValuePorts(ctx: RouteContext, tenantId: string): TemplateValuesPorts {
  return {
    template: async (id) => {
      const { data, error } = await ctx.supabase
        .from("templates")
        .select("id, name, language, meta_status, category, variables, body_preview, title")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("channel", "whatsapp")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
    bookingLink: async () => {
      const { data } = await ctx.supabase
        .from("tenant_config")
        .select("config")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      return parseTenantConfig(data?.config ?? null)?.brain?.booking_link ?? null;
    },
  };
}

/**
 * The run, its people and its job, whole: the one SQL door (00282 assemble_broadcast). It puts the send job on the
 * ledger, which no session may, so it is the service role's, called here after the route's role check (the door) and
 * naming the person who asked; the function itself asks that every person, the template and the playbook are the
 * workspace's, as the insert policies asked of the session.
 */
function assemblePorts(ctx: RouteContext, tenantId: string): AssemblePorts {
  return {
    assemble: (row, recipients, sendAt) =>
      assembleBroadcast(serviceDb(), {
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
                    rule: row.audience.list.rule as Json,
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
      }),
    // The month's allowance, counted before anyone is enrolled (a function only the service role may call, so it is
    // the route's role check that stands in front of it), and those past it held the moment the run exists (core
    // campaigns/allowance.ts): the send's own check at the wire stays as the backstop. Counted in the month the run opens
    // in (`at`), which a broadcast scheduled ahead may not share with the day it is made.
    monthSent: (channel, at) => campaignMonthSent(serviceDb(), tenantId, channel, at),
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
export function createBroadcastPorts(ctx: RouteContext, tenantId: string, o: { fresh: boolean }): CreateBroadcastPorts {
  // The workspace's facts, read once: the zone its people's rows are said in is the zone the send is timed by.
  let facts: ReturnType<typeof tenantFacts> | null = null;
  const zone = async () => (await (facts ??= tenantFacts(ctx.supabase, tenantId))).timezone;
  // The pool, read once: a send to a smart list judges its rule over the same people it enrols from.
  let pool: Promise<AudiencePool> | null = null;
  // Counted without the workspace's pause: it changes what is sent, not who can hear the business (channels-ready.ts).
  const readyForPool = () => channelsReadyOrNull(ctx, tenantId, { withPause: false });
  const poolAt = async (now: Date) => (pool ??= audiencePool(ctx, tenantId, await zone(), now, await readyForPool()));
  return {
    ...templateValuePorts(ctx, tenantId),
    ...assemblePorts(ctx, tenantId),
    timezone: zone,
    // Everyone, not one page of them, with their appointments: the pool the page and the assistant count from.
    people: async (now) => (await poolAt(now)).rows,
    // One list over the pool the send enrols from (audience.ts poolList): a built-in or a saved list, every member,
    // not the first thousand, or why it can't be counted.
    // An archived list (00169) is sent to no new broadcast: it is off People's rail.
    list: async (ref, now) => {
      const found = await poolList(ctx, tenantId, await poolAt(now), ref);
      if (found?.archived) throw new AppError("validation", archivedListWords(found.label, "send"));
      return found;
    },
    // What the workspace can send on now, channel by channel, and the WhatsApp number's health the day's limit is
    // judged by (campaigns/channels-ready.ts): the rows the composers read, so a tick refused here is one they greyed.
    channels: async () => {
      const [ready, health] = await Promise.all([
        // With the workspace's pause: a broadcast made under one is refused (core campaignHowOf), and Ask's card with it.
        channelsReadyOf(ctx, tenantId, { fresh: o.fresh, withPause: true }),
        whatsappHealthOf(ctx, tenantId),
      ]);
      return { ready, health };
    },
    // The email and text versions of a message in a language (a templates row of its name and language there).
    versions: async (name, language) =>
      (await ownVersionsFiled(ctx.supabase, tenantId, [name]))
        .filter((v) => v.language === language)
        .map((v) => v.channel),
    record: (subject, id, verb, payload) => recordDecision(ctx, tenantId, subject, id, verb, payload),
  };
}

export function approveRunPorts(ctx: RouteContext, tenantId: string): ApproveRunPorts {
  return {
    timezone: async () => (await tenantFacts(ctx.supabase, tenantId)).timezone,
    // Under the session's own RLS, as the zone above is: a member reads their own workspace's row.
    paused: () => workspacePaused(ctx.supabase, tenantId),
    release: (id, at) =>
      changed(
        ctx.supabase
          .from("broadcasts")
          .update({ state: "scheduled", scheduled_for: at.toISOString() })
          .eq("id", id)
          .eq("state", "pending_approval")
          .select("id"),
      ),
    // Only a run still scheduled is put back, and the verb is told whether it was (a forbidden or failed UPDATE does not
    // raise: it changes no row).
    hold: (id) =>
      changed(
        ctx.supabase
          .from("broadcasts")
          .update({ state: "pending_approval" })
          .eq("id", id)
          .eq("state", "scheduled")
          .select("id"),
      ),
    schedule: async (id, at) => {
      await schedule(tenantId, "broadcast_send", at, { broadcast_id: id });
    },
    record: (subject, id, verb, payload) => recordDecision(ctx, tenantId, subject, id, verb, payload),
  };
}

export function cancelBroadcastPorts(ctx: RouteContext, tenantId: string): CancelBroadcastPorts {
  return {
    withdraw: (id) => cancelKindFor(tenantId, "broadcast_send", "broadcast_id", id),
    cancel: (id, from) =>
      changed(
        ctx.supabase.from("broadcasts").update({ state: "canceled" }).eq("id", id).eq("state", from).select("id"),
      ),
    record: (subject, id, verb, payload) => recordDecision(ctx, tenantId, subject, id, verb, payload),
  };
}
