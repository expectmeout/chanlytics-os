/**
 * The adapter between the campaign verbs and this runtime: the tables a
 * person's broadcast, an approval, a cancel and a playbook's check touch. A
 * verb never sees a client, a service module or an environment; it sees
 * these. The session role writes here: it updates a broadcast's `state`
 * (00046) and `scheduled_for` (00119). A broadcast, its people and its job are
 * assembled through one door (00280) that is the service role's alone.
 */
import { AppError, numberHealth, parseTenantConfig } from "@chanlytics/contracts";
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
 * The run, its people and its job, whole: the one SQL door (00280 assemble_broadcast). It puts the send job on the
 * ledger, which no session may, so it is the service role's, called here after the route's role check (the door) and
 * naming the person who asked; the function itself asks that every person, the template and the playbook are the
 * workspace's, as the insert policies asked of the session.
 */
function assemblePorts(ctx: RouteContext, tenantId: string): AssemblePorts {
  return {
    assemble: async (row, recipients, sendAt) => {
      const { data, error } = await serviceDb().rpc("assemble_broadcast", {
        p_tenant: tenantId,
        p_run: {
          name: row.name,
          template_id: row.template_id,
          template_name: row.template_name,
          template_language: row.template_language,
          params: row.params,
          audience: { kind: row.audience.kind, id: row.audience.id, label: row.audience.label },
          state: row.state,
          scheduled_for: row.scheduled_for,
          recipient_count: row.recipient_count,
          created_by: ctx.userId,
        },
        p_recipients: recipients.map((r) => ({ contact_id: r.contact_id, facts: r.facts })),
        ...(sendAt ? { p_send_at: sendAt.toISOString() } : {}),
      });
      if (error || !data) throw new Error(error?.message ?? "broadcast not created");
      return data;
    },
  };
}

export function createBroadcastPorts(ctx: RouteContext, tenantId: string): CreateBroadcastPorts {
  // The workspace's facts, read once: the zone its people's rows are said in is the zone the send is timed by.
  let facts: ReturnType<typeof tenantFacts> | null = null;
  const zone = async () => (await (facts ??= tenantFacts(ctx.supabase, tenantId))).timezone;
  // The pool, read once: a send to a smart list judges its rule over the same people it enrols from.
  let pool: Promise<AudiencePool> | null = null;
  const poolAt = async (now: Date) => (pool ??= audiencePool(ctx, tenantId, await zone(), now));
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
    number: async () => {
      const { data: ch, error: chErr } = await ctx.supabase
        .from("tenant_channels")
        .select("config")
        .eq("tenant_id", tenantId)
        .eq("kind", "whatsapp")
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (chErr) throw new Error(chErr.message);
      if (!ch) return null;
      const cfg = (ch.config && typeof ch.config === "object" && !Array.isArray(ch.config) ? ch.config : {}) as Record<
        string,
        unknown
      >;
      const s = (k: string) => (typeof cfg[k] === "string" ? cfg[k] : null);
      return numberHealth({ quality: s("quality_rating"), event: s("quality_event"), limit: s("messaging_limit") });
    },
    record: (subject, id, verb, payload) => recordDecision(ctx, tenantId, subject, id, verb, payload),
  };
}

export function approveRunPorts(ctx: RouteContext, tenantId: string): ApproveRunPorts {
  return {
    timezone: async () => (await tenantFacts(ctx.supabase, tenantId)).timezone,
    release: (id, at) =>
      changed(
        ctx.supabase
          .from("broadcasts")
          .update({ state: "scheduled", scheduled_for: at.toISOString() })
          .eq("id", id)
          .eq("state", "pending_approval")
          .select("id"),
      ),
    hold: async (id) => {
      await ctx.supabase.from("broadcasts").update({ state: "pending_approval" }).eq("id", id);
    },
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
