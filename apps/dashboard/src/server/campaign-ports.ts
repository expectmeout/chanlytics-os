/**
 * The adapter between the campaign verbs and this runtime: the tables a
 * person's broadcast, an approval, a cancel and a playbook's check touch. A
 * verb never sees a client, a service module or an environment; it sees
 * these. The session role writes here: it may insert a broadcast and its
 * people, and update a broadcast's `state` (00046) and `scheduled_for` (00119).
 */
import { savedListFor, type Json } from "@chanlytics/db";
import { numberHealth, parseTenantConfig } from "@chanlytics/contracts";
import type {
  ApproveRunPorts,
  AssemblePorts,
  CancelBroadcastPorts,
  CreateBroadcastPorts,
  TemplateValuesPorts,
} from "@chanlytics/core";
import type { RouteContext } from "./with-route";
import { changed } from "./core-ports";
import { recordDecision } from "./verbs";
import { cancelKindFor, schedule } from "./service";
import { audiencePool } from "./audience";
import { tenantFacts } from "./tenant";

/** PostgREST takes a payload this size in one statement. */
const INSERT_CHUNK = 500;

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

/** The rows, then the job, as the session role may write them. */
function assemblePorts(ctx: RouteContext, tenantId: string): AssemblePorts {
  return {
    create: async (row) => {
      const { data, error } = await ctx.supabase
        .from("broadcasts")
        .insert({
          tenant_id: tenantId,
          ...row,
          params: row.params as unknown as Json,
          audience: { kind: row.audience.kind, id: row.audience.id, label: row.audience.label },
        })
        .select("id")
        .single();
      if (error || !data) throw new Error(error?.message ?? "broadcast not created");
      return data.id;
    },
    enrol: async (id, rows) => {
      for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
        const chunk = rows.slice(i, i + INSERT_CHUNK).map((r) => ({
          broadcast_id: id,
          contact_id: r.contact_id,
          tenant_id: tenantId,
          ...(r.facts ? { facts: r.facts as unknown as Json } : {}),
        }));
        const { error } = await ctx.supabase.from("broadcast_recipients").insert(chunk);
        if (error) throw new Error(error.message);
      }
    },
    // The session role may update `state` alone on a broadcast, so the reason
    // goes to the person in the error; a playbook's run, written by the edge,
    // carries its reason on the row.
    fail: async (id) => {
      await ctx.supabase.from("broadcasts").update({ state: "failed" }).eq("id", id);
    },
    schedule: async (id, at) => {
      await schedule(tenantId, "broadcast_send", at, { broadcast_id: id });
    },
  };
}

export function createBroadcastPorts(ctx: RouteContext, tenantId: string): CreateBroadcastPorts {
  // The workspace's facts, read once: the zone its people's rows are said in is the zone the send is timed by.
  let facts: ReturnType<typeof tenantFacts> | null = null;
  const zone = async () => (await (facts ??= tenantFacts(ctx.supabase, tenantId))).timezone;
  return {
    ...templateValuePorts(ctx, tenantId),
    ...assemblePorts(ctx, tenantId),
    timezone: zone,
    // Everyone, not one page of them, with their appointments: the pool the page and the assistant count from.
    people: async (now) => (await audiencePool(ctx, tenantId, await zone(), now)).rows,
    // Every member, not the first thousand (lists.ts savedList).
    savedList: async (id) => {
      const seg = await savedListFor(ctx.supabase, tenantId, id);
      return seg ? { name: seg.name, memberIds: seg.ids } : null;
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
      const s = (k: string) => (typeof cfg[k] === "string" ? (cfg[k] as string) : null);
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
