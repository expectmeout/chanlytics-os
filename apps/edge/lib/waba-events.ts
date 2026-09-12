/**
 * What Meta says about a number when it is not a message.
 *
 * With management access the webhook also carries the account's own news:
 * a quality rating moving, a messaging limit changing, a template approved,
 * rejected or paused, the account reviewed. These arrive keyed on the WABA
 * (entry.id), not on a phone number, and today nobody would learn of them
 * until sends started failing. They are routed to the workspace by its
 * WABA, kept as events, and the ones that change what the business can do
 * ride the same alert path a failed send already uses.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { mapCategory, mapStatus } from "./meta-templates.js";
import type { Database, Json } from "./workspace/db.js";
import { emitEvent } from "./workspace/db.js";
import { notify, type NotifyTarget } from "./notify.js";
import { parseTenantConfig, WABA_FIELDS as WABA_FIELD_LIST, type NotificationsConfig, type WabaEventKind } from "./workspace/contracts.js";

/** The workspace's escalation addresses, as the receptionist reads them. */
export async function notificationsFor(db: SupabaseClient<Database>, tenantId: string): Promise<NotificationsConfig | null> {
  const { data } = await db.from("tenant_config").select("config").eq("tenant_id", tenantId).maybeSingle();
  return parseTenantConfig(data?.config ?? null)?.notifications ?? null;
}

/** The fields the product handles, from contracts: one event kind each, `channel.<field>`. */
export const WABA_FIELDS = new Set<string>(WABA_FIELD_LIST);

export interface WabaChange {
  field: string;
  value: Record<string, unknown>;
}

interface Routed { tenantId: string; channelId: string; number: string | null }

async function routeByWaba(db: SupabaseClient<Database>, wabaId: string): Promise<Routed | null> {
  const { data, error } = await db
    .from("tenant_channels")
    .select("id, tenant_id, number_e164")
    .eq("kind", "whatsapp")
    .eq("waba_id", wabaId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("waba_route_failed", wabaId, error.message);
    return null;
  }
  return data ? { tenantId: data.tenant_id, channelId: data.id, number: data.number_e164 } : null;
}

/** One line for the owner, per field; null when it is not worth a word. */
export function describeWabaChange(c: WabaChange, number: string | null): { subject: string; body: string; alert: boolean } | null {
  const v = c.value;
  const line = number ? `Your WhatsApp number ${number}` : "Your WhatsApp number";
  switch (c.field) {
    case "phone_number_quality_update": {
      const event = String(v.event ?? "");
      const limit = typeof v.current_limit === "string" ? v.current_limit : null;
      if (event === "FLAGGED") return { subject: "WhatsApp quality rating flagged", body: `${line} has been flagged by WhatsApp. Customers may see delays. Keep replies to what they asked for; the rating recovers on its own when they stop reporting messages.`, alert: true };
      if (event === "UNFLAGGED") return { subject: "WhatsApp quality rating back to normal", body: `${line} is no longer flagged.`, alert: false };
      if (event === "DOWNGRADE") return { subject: "WhatsApp messaging limit lowered", body: `${line} can now start fewer new conversations a day${limit ? ` (${limit.replace(/^TIER_/, "tier ")})` : ""}. Replies to customers who write first are not affected.`, alert: true };
      if (event === "UPGRADE") return { subject: "WhatsApp messaging limit raised", body: `${line} can start more new conversations a day${limit ? ` (${limit.replace(/^TIER_/, "tier ")})` : ""}.`, alert: false };
      return null;
    }
    case "account_update": {
      const event = String(v.event ?? "");
      if (event === "DISABLED_UPDATE" || event === "ACCOUNT_RESTRICTION" || event === "ACCOUNT_VIOLATION") return { subject: "WhatsApp account restricted", body: `WhatsApp reported ${event.toLowerCase().replace(/_/g, " ")} on the account behind ${line.toLowerCase()}. Messaging may stop until it is resolved in Meta Business Manager.`, alert: true };
      if (event === "PARTNER_REMOVED") return { subject: "WhatsApp connection removed", body: `The business removed Chanlytics from the account behind ${line.toLowerCase()}. The receptionist can no longer answer on it until it is connected again.`, alert: true };
      return null;
    }
    case "message_template_status_update": {
      const name = typeof v.message_template_name === "string" ? v.message_template_name : "a template";
      const event = String(v.event ?? "");
      if (event === "REJECTED") return { subject: `Template “${name}” rejected`, body: `WhatsApp rejected the template “${name}”${typeof v.reason === "string" && v.reason !== "NONE" ? ` (${v.reason.toLowerCase().replace(/_/g, " ")})` : ""}. It cannot be sent until it is revised and approved.`, alert: true };
      if (event === "PAUSED" || event === "DISABLED") return { subject: `Template “${name}” ${event.toLowerCase()}`, body: `WhatsApp ${event.toLowerCase()} the template “${name}”. Sends that use it will fail until it is restored.`, alert: true };
      if (event === "APPROVED") return { subject: `Template “${name}” approved`, body: `WhatsApp approved the template “${name}”. It can be sent now — from a broadcast, or from the Inbox outside the 24-hour window.`, alert: true };
      return null;
    }
    case "template_category_update": {
      const name = typeof v.message_template_name === "string" ? v.message_template_name : "a template";
      const to = typeof v.new_category === "string" ? v.new_category.toLowerCase() : "another category";
      return { subject: `Template “${name}” is now ${to}`, body: `Meta moved the template “${name}” to ${to}.${to === "marketing" ? " Sends that use it now need the customer's recorded yes." : ""}`, alert: to === "marketing" };
    }
    case "account_review_update": {
      const decision = String(v.decision ?? "");
      if (decision === "REJECTED") return { subject: "WhatsApp account review rejected", body: `WhatsApp's review of the account behind ${line.toLowerCase()} was rejected. Messaging limits stay where they are until it is appealed.`, alert: true };
      if (decision === "APPROVED") return { subject: "WhatsApp account review approved", body: `WhatsApp approved the account behind ${line.toLowerCase()}.`, alert: false };
      return null;
    }
    default:
      return null;
  }
}

/**
 * Keep the change and, when it matters, tell the workspace. Returns what it
 * did, for the log; never throws — the webhook has already been acknowledged.
 */
const TEMPLATE_STATUS_EVENTS = new Set(["APPROVED", "REJECTED", "PAUSED", "DISABLED", "PENDING_DELETION", "IN_APPEAL"]);

export async function handleWabaChange(
  db: SupabaseClient<Database>,
  wabaId: string,
  change: WabaChange,
  loadNotifications: (tenantId: string) => Promise<NotificationsConfig | null>,
): Promise<"unrouted" | "kept" | "alerted"> {
  const routed = await routeByWaba(db, wabaId);
  if (!routed) {
    console.error("waba_unroutable", JSON.stringify({ waba_id: wabaId, field: change.field }));
    return "unrouted";
  }
  const described = describeWabaChange(change, routed.number);
  await emitEvent(db, routed.tenantId, `channel.${change.field}` as WabaEventKind, "system", "channel", routed.channelId, { waba_id: wabaId, ...change.value } as unknown as Json).catch((e: unknown) => {
    console.error("waba_event_write_failed", e instanceof Error ? e.message : e);
  });
  // The channel row remembers the newest rating, so Settings can show it.
  if (change.field === "phone_number_quality_update" && typeof change.value.current_limit === "string") {
    const { data: row } = await db.from("tenant_channels").select("config").eq("id", routed.channelId).maybeSingle();
    const cfg = (row?.config && typeof row.config === "object" ? row.config : {}) as Record<string, unknown>;
    await db.from("tenant_channels").update({ config: { ...cfg, messaging_limit: change.value.current_limit, quality_event: change.value.event ?? null, quality_at: new Date().toISOString() } as unknown as Json }).eq("id", routed.channelId);
  }
  // The templates table follows Meta's word: a status or category change
  // lands on the row the sync keeps, by name and language. Only the events
  // that change whether a template can be sent move the status; a quality
  // flag on an approved template leaves it approved.
  if (change.field === "message_template_status_update" || change.field === "template_category_update") {
    const name = typeof change.value.message_template_name === "string" ? change.value.message_template_name : null;
    const language = typeof change.value.message_template_language === "string" ? change.value.message_template_language : null;
    if (name && language) {
      if (change.field === "message_template_status_update") {
        const event = String(change.value.event ?? "");
        if (TEMPLATE_STATUS_EVENTS.has(event)) {
          const reason = event === "REJECTED" && typeof change.value.reason === "string" && change.value.reason !== "NONE" ? change.value.reason : null;
          const { error } = await db.from("templates").update({ meta_status: mapStatus(event), rejected_reason: reason })
            .eq("tenant_id", routed.tenantId).eq("channel", "whatsapp").eq("name", name).eq("language", language);
          if (error) console.error("template_status_write_failed", error.message);
        }
      } else {
        const { error } = await db.from("templates").update({ category: mapCategory(typeof change.value.new_category === "string" ? change.value.new_category : null) })
          .eq("tenant_id", routed.tenantId).eq("channel", "whatsapp").eq("name", name).eq("language", language);
        if (error) console.error("template_category_write_failed", error.message);
      }
    }
  }
  if (!described || !described.alert) return "kept";
  const target: NotifyTarget = { tenantId: routed.tenantId, notifications: await loadNotifications(routed.tenantId), isEnvDefault: false };
  await notify(target, { kind: "number", route: "admin/integrations", subject: described.subject, body: described.body });
  return "alerted";
}
