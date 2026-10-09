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
 *
 * A partner's notice (account_update: PARTNER_ADDED and its kin) is addressed
 * to the partner's business portfolio and names the customer's account in
 * value.waba_info.waba_id, so it is routed by that (accountOf).
 *
 * Meta's decision on a display name (phone_number_name_update, addressed to
 * the account) is told to the owner when it declines one, and corrects the
 * name's word in the standing the channel keeps, so Connections says it now.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { mapCategory, mapQuality, mapStatus } from "./meta-templates.js";
import type { Database, Json } from "../packages/db.js";
import { emitEvent, keepChannelStanding, setTemplateQuality } from "../packages/db.js";
import { notify, type NotifyTarget } from "../ops/notify.js";
import {
  nameDecisionWords,
  parseTenantConfig,
  samePhone,
  standingAfterNameDecision,
  standingFromConfig,
  WABA_FIELDS as WABA_FIELD_LIST,
  type NotificationsConfig,
  type ServerNotificationKind,
  type WabaEventKind,
} from "../packages/contracts.js";
import { logger, errField, type Logger } from "../log.js";

/** The workspace's escalation addresses, as the receptionist reads them. */
export async function notificationsFor(
  db: SupabaseClient<Database>,
  tenantId: string,
): Promise<NotificationsConfig | null> {
  const { data } = await db.from("tenant_config").select("config").eq("tenant_id", tenantId).maybeSingle();
  return parseTenantConfig(data?.config ?? null)?.notifications ?? null;
}

/** The fields the product handles, from contracts: one event kind each, `channel.<field>`. */
export const WABA_FIELDS = new Set<string>(WABA_FIELD_LIST);

interface WabaChange {
  field: string;
  value: Record<string, unknown>;
}

interface Routed {
  tenantId: string;
  channelId: string;
  number: string | null;
  /** The channel's config as read, where the standing a name decision corrects is held. */
  config: Json;
}

/**
 * The account's number a notice is about. An account may hold two active numbers (connecting a second leaves the first
 * on), and a read that named no order answered with either: a notice about one number's rating or name names it
 * (display_phone_number, its digits with the country's), and is that number's. Any other notice, or one naming a
 * number not on file, is the account's oldest active number, the one every reader that knows no number picks.
 */
async function routeByWaba(db: SupabaseClient<Database>, wabaId: string, named: unknown): Promise<Routed | null> {
  const { data, error } = await db
    .from("tenant_channels")
    .select("id, tenant_id, number_e164, config")
    .eq("kind", "whatsapp")
    .eq("waba_id", wabaId)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) {
    logger().error("waba_route_failed", { waba_id: wabaId, error: error.message });
    return null;
  }
  const digits = typeof named === "string" ? named.replace(/\D/g, "") : "";
  const row = (digits ? data.find((r) => samePhone(`+${digits}`, r.number_e164)) : undefined) ?? data[0];
  return row ? { tenantId: row.tenant_id, channelId: row.id, number: row.number_e164, config: row.config } : null;
}

/** The account a notice is about, and whether the notice named it itself. */
type Account = { waba: string; named: boolean };

/**
 * The WhatsApp account a notice is about. Most are addressed to it: entry.id is its WABA id. A partner's notice (account_update:
 * PARTNER_ADDED and its kin) is addressed to the PARTNER's business portfolio and names the customer's account in
 * value.waba_info.waba_id (Meta, webhooks reference: account_update), so that is the account when it is there. Null when the
 * notice names none and was addressed to none. 6 October: twelve partner notices arrived addressed to the partner's portfolio
 * and every one was dropped as unroutable, since this read entry.id alone.
 */
export function accountOf(entryId: string, value: Record<string, unknown>): Account | null {
  const info = value.waba_info;
  const named = typeof info === "object" && info !== null && "waba_id" in info ? info.waba_id : null;
  if (typeof named === "string" && named.trim()) return { waba: named.trim(), named: true };
  return entryId ? { waba: entryId, named: false } : null;
}

/**
 * A notice about an account no workspace holds. One that named the account itself is a partner's: a sign-up finished at Meta that has
 * not reached Chanlytics (6 October, 12:48: a reload had taken the page's listener with it) or one still on its way, since Meta's
 * notice and Chanlytics' own connect race. That is news and not a fault: said at info, with the account, what the notice was
 * addressed to and the event, and kept nowhere. One addressed to an account we cannot find is an account we should hold: an error.
 */
function unheld(about: Account, entryId: string, change: WabaChange): "unclaimed" | "unrouted" {
  if (!about.named) {
    logger().error("waba_unroutable", { waba_id: about.waba, field: change.field });
    return "unrouted";
  }
  const event = change.value.event;
  logger().info("wa_signup_finished_unclaimed", {
    waba_id: about.waba,
    entry_id: entryId || null,
    account_event: typeof event === "string" ? event : null,
  });
  return "unclaimed";
}

/**
 * One line for the owner, per field; null when it is not worth a word.
 *
 * It says WHICH kind of news it is, and where that news is read, because the
 * change is the only thing that knows. Every alertable field used to be sent
 * as kind "number" — the number's own kind — so a template approval reached
 * the bell in a warning's colour, behind a shield, pointing at Connections.
 */
interface WabaWords {
  subject: string;
  body: string;
  alert: boolean;
  /** The bell's kind; contracts/notifications.ts SERVER_LOOK draws it. */
  kind: ServerNotificationKind;
  /** Where this news is read. */
  route: string;
}

/** The number's own health: Connections, under a shield. Read by what tells an owner of a number's standing too (number-standing.ts). */
export const NUM = { kind: "number" as const, route: "admin/integrations" };
/** A template can be sent now. */
const READY = { kind: "template_ready" as const, route: "messages" };
/** A template cannot be sent, or can no longer be sent freely. */
const BLOCKED = { kind: "template_blocked" as const, route: "messages" };

/**
 * A template moved to another category. Moved to marketing is a restriction, not a failure: it can still be sent, but only to a
 * recorded yes. It reads with the ones it cannot.
 */
function categoryWords(v: Record<string, unknown>): WabaWords {
  const name = typeof v.message_template_name === "string" ? v.message_template_name : "a template";
  const to = typeof v.new_category === "string" ? v.new_category.toLowerCase() : "another category";
  return {
    ...(to === "marketing" ? BLOCKED : READY),
    subject: `Template “${name}” is now ${to}`,
    body: `Meta moved the template “${name}” to ${to}.${to === "marketing" ? " Sends that use it now need the customer's recorded yes." : ""}`,
    alert: to === "marketing",
  };
}

/** Meta's decision on the display name, as the owner's line: contracts says the words, this says where it is read. */
function nameNotice(v: Record<string, unknown>): WabaWords | null {
  const words = nameDecisionWords(v.decision, v.requested_verified_name, v.rejection_reason);
  return words ? { ...NUM, ...words } : null;
}

export function describeWabaChange(c: WabaChange, number: string | null): WabaWords | null {
  const v = c.value;
  const line = number ? `Your WhatsApp number ${number}` : "Your WhatsApp number";
  switch (c.field) {
    case "phone_number_quality_update": {
      const event = String(v.event ?? "");
      const limit = typeof v.current_limit === "string" ? v.current_limit : null;
      if (event === "FLAGGED")
        return {
          ...NUM,
          subject: "WhatsApp quality rating flagged",
          body: `${line} has been flagged by WhatsApp. Customers may see delays. Keep replies to what they asked for; the rating recovers on its own when they stop reporting messages.`,
          alert: true,
        };
      if (event === "UNFLAGGED")
        return {
          ...NUM,
          subject: "WhatsApp quality rating back to normal",
          body: `${line} is no longer flagged.`,
          alert: false,
        };
      if (event === "DOWNGRADE")
        return {
          ...NUM,
          subject: "WhatsApp messaging limit lowered",
          body: `${line} can now start fewer new conversations a day${limit ? ` (${limit.replace(/^TIER_/, "tier ")})` : ""}. Replies to customers who write first are not affected.`,
          alert: true,
        };
      if (event === "UPGRADE")
        return {
          ...NUM,
          subject: "WhatsApp messaging limit raised",
          body: `${line} can start more new conversations a day${limit ? ` (${limit.replace(/^TIER_/, "tier ")})` : ""}.`,
          alert: false,
        };
      return null;
    }
    case "account_update": {
      const event = String(v.event ?? "");
      if (event === "DISABLED_UPDATE" || event === "ACCOUNT_RESTRICTION" || event === "ACCOUNT_VIOLATION")
        return {
          ...NUM,
          subject: "WhatsApp account restricted",
          body: `WhatsApp reported ${event.toLowerCase().replace(/_/g, " ")} on the account behind ${line.toLowerCase()}. Messaging may stop until it is resolved in Meta Business Manager.`,
          alert: true,
        };
      if (event === "PARTNER_REMOVED")
        return {
          ...NUM,
          subject: "WhatsApp connection removed",
          body: `The business removed Chanlytics from the account behind ${line.toLowerCase()}. The receptionist can no longer answer on it until it is connected again.`,
          alert: true,
        };
      return null;
    }
    case "message_template_status_update": {
      const name = typeof v.message_template_name === "string" ? v.message_template_name : "a template";
      const event = String(v.event ?? "");
      if (event === "REJECTED")
        return {
          ...BLOCKED,
          subject: `Template “${name}” rejected`,
          body: `WhatsApp rejected the template “${name}”${typeof v.reason === "string" && v.reason !== "NONE" ? ` (${v.reason.toLowerCase().replace(/_/g, " ")})` : ""}. It cannot be sent until it is revised and approved.`,
          alert: true,
        };
      if (event === "PAUSED" || event === "DISABLED")
        return {
          ...BLOCKED,
          subject: `Template “${name}” ${event.toLowerCase()}`,
          body: `WhatsApp ${event.toLowerCase()} the template “${name}”. Sends that use it will fail until it is restored.`,
          alert: true,
        };
      if (event === "APPROVED")
        return {
          ...READY,
          subject: `Template “${name}” approved`,
          body: `WhatsApp approved the template “${name}”. It can be sent now — from a broadcast, or from the Inbox outside the 24-hour window.`,
          alert: true,
        };
      return null;
    }
    case "template_category_update":
      return categoryWords(v);
    case "phone_number_name_update":
      return nameNotice(v);
    case "account_review_update": {
      const decision = String(v.decision ?? "");
      if (decision === "REJECTED")
        return {
          ...NUM,
          subject: "WhatsApp account review rejected",
          body: `WhatsApp's review of the account behind ${line.toLowerCase()} was rejected. Messaging limits stay where they are until it is appealed.`,
          alert: true,
        };
      if (decision === "APPROVED")
        return {
          ...NUM,
          subject: "WhatsApp account review approved",
          body: `WhatsApp approved the account behind ${line.toLowerCase()}.`,
          alert: false,
        };
      return null;
    }
    default:
      return null;
  }
}

/**
 * A template's quality, as Meta just said it (K9): the row the sync keeps takes the new score, by name and language, as a
 * status or a category change does. The sync still sets it whole; the history is the event kept before this runs. A score
 * outside Meta's four, or a name or language missing, changes nothing; a template with no row yet is left for the next
 * sync. Best effort: a write that fails is on the log and costs the template its new word, never the webhook its answer.
 */
async function applyTemplateQuality(
  db: SupabaseClient<Database>,
  tenantId: string,
  value: Record<string, unknown>,
  L: Logger,
): Promise<void> {
  const quality = mapQuality(value.new_quality_score);
  const name = typeof value.message_template_name === "string" ? value.message_template_name : null;
  const language = typeof value.message_template_language === "string" ? value.message_template_language : null;
  if (!quality || !name || !language) return;
  try {
    await setTemplateQuality(db, { tenantId, name, language, quality });
  } catch (e) {
    L.error("template_quality_write_failed", { error: errField(e) });
  }
}

/**
 * Meta's decision on the display name, applied to the standing the channel keeps through the door the reading keeps it by, so
 * Connections says it now and not at the next read. A number whose standing was never read has nothing to correct: the first read
 * says all of it. The door stamps the moment it kept the standing; the standing's other fields are as old as they were. Best effort:
 * a refusal is a line and costs the row its new word, never the webhook its answer.
 */
async function keepNameDecision(
  db: SupabaseClient<Database>,
  routed: Routed,
  value: Record<string, unknown>,
  L: Logger,
): Promise<void> {
  const cfg = routed.config;
  const kept = standingFromConfig(typeof cfg === "object" && cfg !== null && !Array.isArray(cfg) ? cfg.standing : null);
  const next = kept && standingAfterNameDecision(kept, value.decision, value.requested_verified_name);
  if (!next) return;
  try {
    await keepChannelStanding(db, routed.tenantId, routed.channelId, next);
  } catch (e) {
    L.error("wa_standing_keep_failed", { error: errField(e) });
  }
}

/**
 * Keep the change and, when it matters, tell the workspace. Returns what it
 * did, for the log; never throws — the webhook has already been acknowledged.
 * "unclaimed" is a partner's notice for an account no workspace holds (unheld).
 */
const TEMPLATE_STATUS_EVENTS = new Set(["APPROVED", "REJECTED", "PAUSED", "DISABLED", "PENDING_DELETION", "IN_APPEAL"]);

export async function handleWabaChange(
  db: SupabaseClient<Database>,
  entryId: string,
  change: WabaChange,
  loadNotifications: (tenantId: string) => Promise<NotificationsConfig | null>,
): Promise<"unrouted" | "unclaimed" | "kept" | "alerted"> {
  const about = accountOf(entryId, change.value);
  if (!about) return "unrouted";
  const routed = await routeByWaba(db, about.waba, change.value.display_phone_number);
  if (!routed) return unheld(about, entryId, change);
  const L = logger({ tenant_id: routed.tenantId });
  const described = describeWabaChange(change, routed.number);
  await emitEvent(db, routed.tenantId, `channel.${change.field}` as WabaEventKind, "channel", routed.channelId, {
    waba_id: about.waba,
    ...change.value,
  }).catch((e: unknown) => {
    L.error("waba_event_write_failed", { error: errField(e) });
  });
  // The channel row remembers the newest rating, so Settings can show it.
  if (change.field === "phone_number_quality_update" && typeof change.value.current_limit === "string") {
    const { data: row } = await db
      .from("tenant_channels")
      .select("config")
      .eq("id", routed.channelId)
      .eq("tenant_id", routed.tenantId)
      .maybeSingle();
    const cfg = (row?.config && typeof row.config === "object" ? row.config : {}) as Record<string, unknown>;
    await db
      .from("tenant_channels")
      .update({
        config: {
          ...cfg,
          messaging_limit: change.value.current_limit,
          quality_event: change.value.event ?? null,
          quality_at: new Date().toISOString(),
        } as unknown as Json,
      })
      .eq("id", routed.channelId)
      .eq("tenant_id", routed.tenantId);
  }
  // The templates table follows Meta's word: a status or category change
  // lands on the row the sync keeps, by name and language. Only the events
  // that change whether a template can be sent move the status; a quality
  // flag on an approved template leaves it approved.
  if (change.field === "message_template_status_update" || change.field === "template_category_update") {
    const name = typeof change.value.message_template_name === "string" ? change.value.message_template_name : null;
    const language =
      typeof change.value.message_template_language === "string" ? change.value.message_template_language : null;
    if (name && language) {
      if (change.field === "message_template_status_update") {
        const event = String(change.value.event ?? "");
        if (TEMPLATE_STATUS_EVENTS.has(event)) {
          const reason =
            event === "REJECTED" && typeof change.value.reason === "string" && change.value.reason !== "NONE"
              ? change.value.reason
              : null;
          const { error } = await db
            .from("templates")
            .update({ meta_status: mapStatus(event), rejected_reason: reason })
            .eq("tenant_id", routed.tenantId)
            .eq("channel", "whatsapp")
            .eq("name", name)
            .eq("language", language);
          if (error) L.error("template_status_write_failed", { error: error.message });
        }
      } else {
        const { error } = await db
          .from("templates")
          .update({
            category: mapCategory(typeof change.value.new_category === "string" ? change.value.new_category : null),
          })
          .eq("tenant_id", routed.tenantId)
          .eq("channel", "whatsapp")
          .eq("name", name)
          .eq("language", language);
        if (error) L.error("template_category_write_failed", { error: error.message });
      }
    }
  }
  if (change.field === "message_template_quality_update")
    await applyTemplateQuality(db, routed.tenantId, change.value, L);
  if (change.field === "phone_number_name_update") await keepNameDecision(db, routed, change.value, L);
  if (!described || !described.alert) return "kept";
  const target: NotifyTarget = {
    tenantId: routed.tenantId,
    notifications: await loadNotifications(routed.tenantId),
    isEnvDefault: false,
  };
  await notify(target, {
    kind: described.kind,
    route: described.route,
    subject: described.subject,
    body: described.body,
  });
  return "alerted";
}
