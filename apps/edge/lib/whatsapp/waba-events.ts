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
import type { Database, Json } from "@chanlytics/db/types";
import { emitEvent } from "@chanlytics/db/events";
import { keepChannelStanding } from "@chanlytics/db/jobs";
import { patchWhatsAppTemplate, patchWhatsAppTemplateBack, setTemplateQuality } from "@chanlytics/db/campaigns";
import { mendWarnings, notify, type NotifyTarget } from "../shared/alerts/notify.js";
import { syncTemplates } from "./template-admin.js";
import {
  addressOf,
  nameDecisionWords,
  parseTenantConfig,
  samePhone,
  standingAfterNameDecision,
  standingFromConfig,
  refusedWords,
  templateTitle,
  WABA_FIELDS as WABA_FIELD_LIST,
  type NotificationsConfig,
  type ServerNotificationKind,
  type WabaEventKind,
  MESSAGES_ROUTE,
  textOrEmpty,
  DbFailure,
} from "@chanlytics/contracts";
import { logger, errField, type Logger } from "../shared/log.js";
import { findChannelConfig, listNumbersOfWaba, patchChannelRow } from "@chanlytics/db/channels";
import { findConfigRow } from "@chanlytics/db/workspace";
import { jsonCopyOf } from "@chanlytics/db/shared";
import type { TenantId } from "@chanlytics/contracts";

/** The workspace's escalation addresses, as the receptionist reads them. */
export async function findNotifications(
  db: SupabaseClient<Database>,
  tenantId: TenantId,
): Promise<NotificationsConfig | null> {
  const { data, error } = await findConfigRow(db, tenantId);
  // Unread is not "tell nobody": an account's news would be dropped. Thrown, the delivery is tried again.
  if (error) throw new DbFailure(error, "cannot read the workspace's notifications");
  return parseTenantConfig(data?.config ?? null)?.notifications ?? null;
}

/** The fields the product handles, from contracts: one event kind each, `channel.<field>`. */
export const WABA_FIELDS = new Set<string>(WABA_FIELD_LIST);

interface WabaChange {
  field: string;
  value: Record<string, unknown>;
}

interface Routed {
  tenantId: TenantId;
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
  // Meta names its account, not the workspace: the number is found across workspaces by that id, by design.
  const { data, error } = await listNumbersOfWaba(db, wabaId);
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
  /** What it is about, when it is one thing (a template, by its name): the kept row opens it, and says so. */
  about?: { type: string; id: string };
}

/** The number's own health: Connections, under a shield. Read by what tells an owner of a number's standing too (number-standing.ts). */
export const NUM = { kind: "number" as const, route: "admin/integrations" };
/** A template can be sent now. */
const READY = { kind: "template_ready" as const, route: MESSAGES_ROUTE };
/** A template cannot be sent, or can no longer be sent freely. */
const BLOCKED = { kind: "template_blocked" as const, route: MESSAGES_ROUTE };

/**
 * A template notice opens the message it is about, at its home in the Library (campaigns/messages/<name>), and says what
 * it is about (D1-template-marks): it opened the bare Library, at its top, though a message has its own address now. Without
 * a name (an event that carries none) it keeps the Library's door. What it is about is the version, by its name and its
 * language where the event says it (a row per both, 00004): a version approved in one language mends no refusal of
 * another (contracts NOTICE_MENDS; the wiring's second audit, W-channel-team-plus-4).
 */
function aboutTemplate(v: Record<string, unknown>): Partial<Pick<WabaWords, "route" | "about">> {
  const name = typeof v.message_template_name === "string" ? v.message_template_name : null;
  if (!name) return {};
  const language = typeof v.message_template_language === "string" ? v.message_template_language : null;
  return {
    route: addressOf({ kind: "template", name }),
    about: { type: "template", id: language ? `${name}:${language}` : name },
  };
}

/**
 * A template moved to another category. Moved to marketing is a restriction, not a failure: it can still be sent, but only to a
 * recorded yes. It reads with the ones it cannot.
 */
function categoryWords(record: Record<string, unknown>): WabaWords {
  const name = typeof record.message_template_name === "string" ? record.message_template_name : "a template";
  const to = typeof record.new_category === "string" ? record.new_category.toLowerCase() : "another category";
  return {
    ...(to === "marketing" ? BLOCKED : READY),
    ...aboutTemplate(record),
    subject: `Template “${name}” is now ${to}`,
    body: `Meta moved the template “${name}” to ${to}.${to === "marketing" ? " Sends that use it now need the customer's recorded yes." : ""}`,
    alert: to === "marketing",
  };
}

/**
 * A message's status at Meta moved: it asked for a change, is holding the message for a few hours, turned it off, or
 * approved it; null for a status nobody is told of. Said as an owner can act on it (Ruben, 12 Nov 2026: "Template x
 * paused. Sends that use it will fail until it is restored" read as a system error): what happened, whether it mends
 * itself, and the one thing to do. The message is named as the Library names it (templateTitle).
 */
function templateStatusWords(record: Record<string, unknown>): WabaWords | null {
  const title =
    typeof record.message_template_name === "string" ? templateTitle(record.message_template_name) : "a message";
  const door = aboutTemplate(record);
  const event = textOrEmpty(record.event);
  if (event === "REJECTED") {
    const reason = refusedWords(typeof record.reason === "string" ? record.reason : null);
    return {
      ...BLOCKED,
      ...door,
      subject: `WhatsApp asked for a change to “${title}”`,
      body: `${reason ?? "WhatsApp asked for a change to its words. Ask writes new words for you to send back."} Open “${title}” in Messages to send them.`,
      alert: true,
    };
  }
  if (event === "PAUSED")
    return {
      ...BLOCKED,
      ...door,
      subject: `WhatsApp is holding “${title}” for a few hours`,
      body: `Some people who got “${title}” marked it as unwanted, so WhatsApp is holding it for a few hours. It comes back by itself, and what sends it waits until then.`,
      alert: true,
    };
  if (event === "DISABLED")
    return {
      ...BLOCKED,
      ...door,
      subject: `WhatsApp turned “${title}” off`,
      body: `People kept marking “${title}” as unwanted, so WhatsApp turned it off. Write a new message in its place.`,
      alert: true,
    };
  if (event === "APPROVED")
    return {
      ...READY,
      ...door,
      subject: `WhatsApp approved “${title}”`,
      body: `“${title}” can be sent now, from Campaigns, or from the Inbox outside the 24-hour window.`,
      alert: true,
    };
  return null;
}

/** Meta's decision on the display name, as the owner's line: contracts says the words, this says where it is read. */
function nameNotice(v: Record<string, unknown>): WabaWords | null {
  const words = nameDecisionWords(v.decision, v.requested_verified_name, v.rejection_reason);
  return words ? { ...NUM, ...words } : null;
}

export function describeWabaChange(wabaChange: WabaChange, number: string | null): WabaWords | null {
  const value = wabaChange.value;
  const line = number ? `Your WhatsApp number ${number}` : "Your WhatsApp number";
  switch (wabaChange.field) {
    case "phone_number_quality_update": {
      const event = textOrEmpty(value.event);
      const limit = typeof value.current_limit === "string" ? value.current_limit : null;
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
      const event = textOrEmpty(value.event);
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
    case "message_template_status_update":
      return templateStatusWords(value);
    case "template_category_update":
      return categoryWords(value);
    case "phone_number_name_update":
      return nameNotice(value);
    case "account_review_update": {
      const decision = textOrEmpty(value.decision);
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
  tenantId: TenantId,
  value: Record<string, unknown>,
  log: Logger,
): Promise<void> {
  const quality = mapQuality(value.new_quality_score);
  const name = typeof value.message_template_name === "string" ? value.message_template_name : null;
  const language = typeof value.message_template_language === "string" ? value.message_template_language : null;
  if (!quality || !name || !language) return;
  try {
    await setTemplateQuality(db, { tenantId, name, language, quality });
  } catch (e) {
    log.error("template_quality_write_failed", { error: errField(e) });
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
  log: Logger,
): Promise<void> {
  const cfg = routed.config;
  const kept = standingFromConfig(typeof cfg === "object" && cfg !== null && !Array.isArray(cfg) ? cfg.standing : null);
  const next = kept && standingAfterNameDecision(kept, value.decision, value.requested_verified_name);
  if (!next) return;
  try {
    await keepChannelStanding(db, routed.tenantId, routed.channelId, next);
  } catch (e) {
    log.error("wa_standing_keep_failed", { error: errField(e) });
  }
}

/**
 * The newest rating on the channel's row, beside what else its config holds. The write replaces the whole config, so a read
 * that failed writes nothing: over an empty one it would take the number's standing with it. Best effort: a failure is a line
 * and costs the row its new rating, never the webhook its answer.
 */
async function keepRating(
  db: SupabaseClient<Database>,
  routed: Routed,
  value: Record<string, unknown>,
  log: Logger,
): Promise<void> {
  const failed = (step: "read" | "write", error: string) =>
    log.error("channel_quality_row_failed", { channel_id: routed.channelId, step, error });
  const read = await findChannelConfig(db, routed.tenantId, routed.channelId);
  if (read.error) return failed("read", read.error.message);
  const cfg = (read.data?.config && typeof read.data.config === "object" ? read.data.config : {}) as Record<
    string,
    unknown
  >;
  const kept = await patchChannelRow(db, routed.tenantId, routed.channelId, {
    config: jsonCopyOf({
      ...cfg,
      messaging_limit: value.current_limit,
      quality_event: value.event ?? null,
      quality_at: new Date().toISOString(),
    }),
  });
  if (kept.error) failed("write", kept.error.message);
}

/**
 * Keep the change and, when it matters, tell the workspace. Returns what it
 * did, for the log; never throws — the webhook has already been acknowledged.
 * "unclaimed" is a partner's notice for an account no workspace holds (unheld).
 */
const TEMPLATE_STATUS_EVENTS = new Set(["APPROVED", "REJECTED", "PAUSED", "DISABLED", "PENDING_DELETION", "IN_APPEAL"]);

/**
 * How long a status that found no row waits before it looks again: Meta can decide a template before the request that
 * made it has written its row, and the notice would then say "approved" of a row still pending (R11 S11-6).
 */
const TEMPLATE_ROW_WAIT_MS = 2_000;

/**
 * Meta's status on the template's row, by name and language: written, looked for once more after a moment where no row
 * took it, and where none is on file still, the workspace's templates synced from Meta before the notice is told, so the
 * Library says what the bell says. The bell said "Template approved" over a Library that still said pending, and the
 * campaign on it stayed blocked until someone pressed Sync (the wiring's second audit, R11 S11-6).
 */
async function keepTemplateStatus(
  db: SupabaseClient<Database>,
  params: { tenantId: TenantId; waba: string; name: string; language: string; event: string; reason: string | null },
  log: Logger,
): Promise<void> {
  const write = () =>
    patchWhatsAppTemplateBack(
      db,
      params.tenantId,
      { name: params.name, language: params.language },
      { meta_status: mapStatus(params.event), rejected_reason: params.reason },
    );
  let kept = await write();
  if (kept.error || !kept.data?.length) {
    await new Promise((r) => setTimeout(r, TEMPLATE_ROW_WAIT_MS));
    kept = await write();
  }
  if (kept.error) log.error("template_status_write_failed", { error: kept.error.message });
  if (kept.data?.length) return;
  const synced = await syncTemplates(db, params.tenantId, params.waba).catch((e: unknown) => ({
    ok: false as const,
    code: "write_failed" as const,
    detail: e instanceof Error ? e.message : String(e),
  }));
  if (!synced.ok) log.error("template_status_sync_failed", { code: synced.code, error: synced.detail ?? null });
}

export async function handleWabaChange(
  db: SupabaseClient<Database>,
  entryId: string,
  change: WabaChange,
  loadNotifications: (tenantId: TenantId) => Promise<NotificationsConfig | null>,
): Promise<"unrouted" | "unclaimed" | "kept" | "alerted"> {
  const about = accountOf(entryId, change.value);
  if (!about) return "unrouted";
  const routed = await routeByWaba(db, about.waba, change.value.display_phone_number);
  if (!routed) return unheld(about, entryId, change);
  const log = logger({ tenant_id: routed.tenantId });
  const described = describeWabaChange(change, routed.number);
  await emitEvent(db, routed.tenantId, `channel.${change.field}` as WabaEventKind, "channel", routed.channelId, {
    waba_id: about.waba,
    ...change.value,
  }).catch((e: unknown) => {
    log.error("waba_event_write_failed", { error: errField(e) });
  });
  // The channel row remembers the newest rating, so Settings can show it.
  if (change.field === "phone_number_quality_update" && typeof change.value.current_limit === "string") {
    await keepRating(db, routed, change.value, log);
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
        const event = textOrEmpty(change.value.event);
        if (TEMPLATE_STATUS_EVENTS.has(event)) {
          const reason =
            event === "REJECTED" && typeof change.value.reason === "string" && change.value.reason !== "NONE"
              ? change.value.reason
              : null;
          await keepTemplateStatus(
            db,
            { tenantId: routed.tenantId, waba: about.waba, name, language, event, reason },
            log,
          );
        }
      } else {
        const { error } = await patchWhatsAppTemplate(
          db,
          routed.tenantId,
          { name, language },
          { category: mapCategory(typeof change.value.new_category === "string" ? change.value.new_category : null) },
        );
        if (error) log.error("template_category_write_failed", { error: error.message });
      }
    }
  }
  if (change.field === "message_template_quality_update")
    await applyTemplateQuality(db, routed.tenantId, change.value, log);
  if (change.field === "phone_number_name_update") await keepNameDecision(db, routed, change.value, log);
  if (!described) return "kept";
  return tellWabaChange(db, routed, change.field, described, loadNotifications);
}

/**
 * What a change's words do once it is kept: news is told (the bell, the mail), and news told to nobody still mends the
 * warning it answers: "back to normal" closes "flagged", "raised" closes "lowered", "approved" closes "rejected" (contracts
 * NOTICE_MENDS; the wiring's second audit, W-channel-team-plus-4). A number's quality and limit are that number's (an
 * account may hold several): their notices are about its channel, so one number's good news mends only its own warning.
 */
async function tellWabaChange(
  db: SupabaseClient<Database>,
  routed: Routed,
  field: string,
  wabaWords: WabaWords,
  loadNotifications: (tenantId: TenantId) => Promise<NotificationsConfig | null>,
): Promise<"kept" | "alerted"> {
  const described =
    field === "phone_number_quality_update"
      ? { ...wabaWords, about: { type: "channel", id: routed.channelId } }
      : wabaWords;
  if (!described.alert) {
    // Never throws: a close that fails is logged and the warning stays until it is read.
    await mendWarnings(db, {
      tenantId: routed.tenantId,
      by: { kind: described.kind, title: described.subject },
      subject: described.about ?? null,
      keptId: null,
    });
    return "kept";
  }
  const target: NotifyTarget = {
    tenantId: routed.tenantId,
    notifications: await loadNotifications(routed.tenantId),
  };
  await notify(target, {
    kind: described.kind,
    route: described.route,
    ...(described.about ? { about: described.about } : {}),
    subject: described.subject,
    body: described.body,
  });
  return "alerted";
}
