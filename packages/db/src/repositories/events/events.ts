/** Events: events. */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SHARED_EVENT_VERSIONS,
  type ActivitySubjectType,
  type ContactAddedData,
  type ContactConsentChangedData,
  type PlatformActedData,
  type ScreenedReason,
  type WabaEventKind,
  recordOrEmpty,
  DbFailure,
  entryOf,
} from "@chanlytics/contracts";
import type { Database, Json } from "../../types";
import { dbLog, dbRequestId } from "../../shared/observe";
import { jsonCopyOf } from "../../shared/json";
import type { TenantId } from "@chanlytics/contracts";

export type Db = SupabaseClient<Database>;

/**
 * A JSON object whose keys are open: a provider's own payload, a tally, or a counts function's answer, forwarded as it
 * came. Json's object branch, spelled once for packages/db (reports/series.ts and reach-out-sheet.ts read it).
 */
export type JsonObject = { [key: string]: Json | undefined };

/** A kind that carries nothing but its subject. */
type Nothing = Record<string, never>;

/** Each kind the product writes from TypeScript, and the data it carries: the table's own kinds. */
interface TableData {
  /** Stripe's own news of a trial about to end: never an amount. */
  "billing.trial_ending": { trial_end: string | null };
  "broadcast.sent": JsonObject;
  /** The owner switched what the workspace answers on or off: which (voice, whatsapp, sms), and who. */
  /** A call that asked nobody (decision 0138, contracts voice/screened.ts): why, and the provider's id where it kept a call. */
  "call.screened": { reason: ScreenedReason; call_id: string | null };
  /** A channel connected: a WhatsApp number (its ids and what Meta calls it), or an Instagram account (decision 0001, step 8). */
  "channel.connected":
    | {
        kind: "whatsapp";
        phone_number_id: string;
        waba_id: string;
        number_e164: string | null;
        verified_name: string | null;
        by: string | null;
      }
    | {
        kind: "instagram";
        account_id: string;
        username: string | null;
        by: string | null;
        /** Present where it was connected through Meta (the Meta link); absent through Instagram's own login. */
        login?: "meta";
      };
  /** Three kinds have SQL writers too: their one shape and version are contracts' (workspace/event-data.ts). */
  "contact.added": ContactAddedData;
  "contact.consent_changed": ContactConsentChangedData;
  /** A thread handed to the team: why (an escalation's reason), on the conversation. Once per hold. */
  "escalation.opened": { reason: string };
  /** An automatic reply the receptionist wrote and did not post: it named a price or money (contracts autoReplyHold). */
  "google.reply_held": { review_id: string; why: "price" | "money" };
  "ingest.unreachable_sender": Nothing;
  "ingest.unroutable": { channel: "email" | "voice" | "whatsapp" | "instagram" } & JsonObject;
  "lead.emailed": { by: "reach_out"; send_id: string };
  /** A post put on the Google profile: Google's name for it, which is how it comes down. */
  "file.posted": { file_id: string; post_name: string; search_url: string | null; by: string | null };
  "file.unposted": { file_id: string; post_name: string; by: string | null };
  "message.send_blocked": { reason: string | null } & JsonObject;
  /** `http_status` is the send's own answer: absent when the failure came later, in the provider's receipt (reason "receipt"). */
  "message.send_failed": { http_status?: number; body: string | null; reason: string } & JsonObject;
  "platform.acted": PlatformActedData;
  /** A playbook, or a reach-out's chain, edited: its name, who, and which parts moved (never their words). */
  "playbook.changed": { name: string; by: string; fields: string[] };
  "policy.changed": { class: string; mode: string; fields: string[]; by: string; via?: string };
  "policy.veto_window_skipped": { delay_ms: number; source: string; reason: string };
  /** A rename of the workspace keeps the names it changed from and to (00439, X4-5): the one setting the ledger says in full. */
  "settings.changed": {
    fields: string[];
    by: string;
    version: number | string | null;
    via?: string;
    from?: string;
    to?: string;
  };
  /** A message deleted from the Library, and one sent to WhatsApp for approval: its name, its language, and who. */
  "template.removed": { name: string; language: string; by: string };
  /**
   * `before`: the words WhatsApp had approved that a change sent back replaced (Messages, 12 Nov 2026), so a refusal of the
   * new ones can go back to them; absent where the change was to words not approved, or the message was new.
   */
  "template.submitted": { name: string; language: string; by: string; before?: string };
  "usage.ask_tokens": JsonObject;
  "usage.llm_tokens": Record<string, unknown>;
  "webhook.auth": { provider: "retell" } & JsonObject;
  "webhook.delivery": { provider: "retell" } & JsonObject;
}

/** Meta's account webhooks, one kind per field (contracts WABA_FIELDS): the payload as Meta sent it. */
type WabaData = { waba_id: string } & JsonObject;

/** Every kind this module writes, and its data: the table above, and Meta's family. */
export type EventData = TableData & { [K in WabaEventKind]: WabaData };

export type EmittedKind = keyof EventData;

/** Where each kind files in the ledger, and the version its data is written at. */
const WRITES: { readonly [K in keyof TableData]: { category: string; version: number } } = {
  "billing.trial_ending": { category: "billing", version: 1 },
  "broadcast.sent": { category: "message", version: 1 },
  "call.screened": { category: "call", version: 1 },
  "channel.connected": { category: "system", version: 1 },
  "contact.added": { category: "contact", version: SHARED_EVENT_VERSIONS["contact.added"] },
  "contact.consent_changed": { category: "contact", version: SHARED_EVENT_VERSIONS["contact.consent_changed"] },
  "escalation.opened": { category: "message", version: 1 },
  "google.reply_held": { category: "google", version: 1 },
  "ingest.unreachable_sender": { category: "ingest", version: 1 },
  "ingest.unroutable": { category: "ingest", version: 1 },
  "lead.emailed": { category: "lead", version: 1 },
  "file.posted": { category: "setup", version: 1 },
  "file.unposted": { category: "setup", version: 1 },
  "message.send_blocked": { category: "message", version: 1 },
  "message.send_failed": { category: "message", version: 1 },
  "platform.acted": { category: "platform", version: SHARED_EVENT_VERSIONS["platform.acted"] },
  "playbook.changed": { category: "message", version: 1 },
  "policy.changed": { category: "system", version: 1 },
  "policy.veto_window_skipped": { category: "policy", version: 1 },
  "settings.changed": { category: "system", version: 1 },
  "template.removed": { category: "message", version: 1 },
  "template.submitted": { category: "message", version: 1 },
  "usage.ask_tokens": { category: "usage", version: 1 },
  "usage.llm_tokens": { category: "usage", version: 1 },
  "webhook.auth": { category: "ingest", version: 1 },
  "webhook.delivery": { category: "ingest", version: 1 },
};

/** Meta's family files as the connection it happened to, at its own version. */
const WABA_WRITE = { category: "system", version: 1 };

/**
 * The row a kind writes: its category and version from the table above, never from a caller. What it is about is a
 * row of some table (`subjectType`, `subjectId`), or null for nothing but the workspace.
 */
export function rowOf<K extends EmittedKind>(
  tenantId: TenantId,
  kind: K,
  subjectType: ActivitySubjectType | null,
  subjectId: string | null,
  data: EventData[K],
) {
  const write = entryOf(WRITES, kind) ?? WABA_WRITE;
  // The request this row was written in (00277): the one a person's click, a webhook's delivery or a job's
  // originating request was named. Absent outside one; the column's own default then reads the header the database
  // client sent, which is how a SQL function's rows say it too.
  const requestId = dbRequestId();
  return {
    tenant_id: tenantId,
    kind,
    category: write.category,
    version: write.version,
    subject_type: subjectType,
    subject_id: subjectId,
    data: jsonCopyOf(data),
    ...(requestId ? { request_id: requestId } : {}),
  };
}

/**
 * One event on the ledger, and whether it was written. For a writer whose next step needs the record to exist (the
 * back office records before it acts; a broadcast's tally; a lead's email): it reads the error and says so.
 */
export async function recordEvent<K extends EmittedKind>(
  db: Db,
  tenantId: TenantId,
  kind: K,
  subjectType: ActivitySubjectType | null,
  subjectId: string | null,
  data: EventData[K],
): Promise<{ error: string | null }> {
  const row = rowOf(tenantId, kind, subjectType, subjectId, data);
  let { error } = await db.from("events").insert(row);
  // A database 00277 has not reached has no request_id column (PostgREST: PGRST204): the row is written without the
  // name rather than lost, so the apps and the migration may land in either order.
  if (error?.code === "PGRST204" && "request_id" in row) {
    const { request_id: _name, ...unnamed } = row;
    ({ error } = await db.from("events").insert(unnamed));
  }
  return { error: error?.message ?? null };
}

/** One event on the ledger, best effort: a write that fails is logged by its kind, never thrown. */
export async function emitEvent<K extends EmittedKind>(
  db: Db,
  tenantId: TenantId,
  kind: K,
  subjectType: ActivitySubjectType | null,
  subjectId: string | null,
  data: EventData[K],
): Promise<void> {
  const { error } = await recordEvent(db, tenantId, kind, subjectType, subjectId, data);
  if (error) dbLog().error("emit_event_failed", { tenant_id: tenantId, kind, error });
}

/** A post on Google, as the ledger last said of it: where it is, or null where it never went or came down since. */
export async function findFilePosted(
  db: Db,
  tenantId: TenantId,
  fileId: string,
): Promise<{ name: string; search_url: string | null; at: string } | null> {
  const { data, error } = await db
    .from("events")
    .select("kind, data, created_at")
    .eq("tenant_id", tenantId)
    .in("kind", ["file.posted", "file.unposted"])
    .eq("data->>file_id", fileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new DbFailure(error, "file posted");
  if (data?.kind !== "file.posted") return null;
  const post = recordOrEmpty(data.data);
  if (typeof post.post_name !== "string") return null;
  return {
    name: post.post_name,
    search_url: typeof post.search_url === "string" ? post.search_url : null,
    at: data.created_at,
  };
}

/**
 * What the ledger kept of a message's words: the approved words a change replaced and when that change was sent
 * (WhatsApp takes one a day to an approved message), and Ask's fix for a refusal.
 */
interface WordsKept {
  before: string | null;
  changedAt: string | null;
  fix: { words: string; reason: string } | null;
}

/**
 * For each of `templateIds`, the words the ledger kept (Messages, 12 Nov 2026): the words WhatsApp last approved that a
 * change sent back since replaced (the latest `template.submitted` that kept its `before`), and Ask's latest new words for
 * a refusal (`template.fix_written`), with the refusal they answer. An empty list asks nothing.
 */
export async function listWordsKept(
  db: Db,
  tenantId: TenantId,
  templateIds: string[],
): Promise<Map<string, WordsKept>> {
  if (!templateIds.length) return new Map();
  const { data, error } = await db
    .from("events")
    .select("kind, subject_id, data, created_at")
    .eq("tenant_id", tenantId)
    .in("kind", ["template.submitted", "template.fix_written"])
    .in("subject_id", templateIds)
    .order("created_at", { ascending: false });
  if (error) throw new DbFailure(error, "words kept of refused messages");
  const out = new Map<string, WordsKept>();
  for (const row of data) {
    if (!row.subject_id) continue;
    const kept = out.get(row.subject_id) ?? { before: null, changedAt: null, fix: null };
    const facts = recordOrEmpty(row.data);
    if (row.kind === "template.submitted" && kept.before === null && typeof facts.before === "string") {
      kept.before = facts.before;
      kept.changedAt = row.created_at;
    }
    if (row.kind === "template.fix_written" && kept.fix === null && typeof facts.words === "string")
      kept.fix = { words: facts.words, reason: typeof facts.reason === "string" ? facts.reason : "" };
    out.set(row.subject_id, kept);
  }
  return out;
}

/**
 * Of `subjectIds`, the ones a kind was already written about in this workspace: what a sweep asks before doing again
 * what it once decided not to (a review reply it held). An empty list asks nothing.
 */
export async function getSubjectsWith(
  db: Db,
  tenantId: TenantId,
  kind: EmittedKind,
  subjectIds: string[],
): Promise<Set<string>> {
  if (!subjectIds.length) return new Set();
  const { data, error } = await db
    .from("events")
    .select("subject_id")
    .eq("tenant_id", tenantId)
    .eq("kind", kind)
    .in("subject_id", subjectIds);
  if (error) throw new DbFailure(error, "events");
  return new Set(data.map((r) => r.subject_id).filter((id): id is string => typeof id === "string"));
}
