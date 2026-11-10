/** Events: events. */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SHARED_EVENT_VERSIONS,
  type ActivationMilestone,
  type ActivitySubjectType,
  type ContactAddedData,
  type ContactConsentChangedData,
  type PlatformActedData,
  type WabaEventKind,
  recordOrEmpty,
  DbFailure,
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

type BillingData = {
  source: string;
  status: string;
  subscription?: string;
  price_id?: string | null;
  /** The member who asked (a resume, a plan started now); absent where Stripe's own event moved it. */
  by?: string | null;
};

/** A booking tool's email read into the calendar: where it came from, and which tool sent it. */
type BookingData = { source: "booking_email"; tool: string };

/** A member's act on a lead in Needs review: who, and in which search. */
type LeadTriageData = { by: string; search_id: string };

type TextingData = { e164: string | null; from: string | null; to: string; mock: boolean };

/** Each kind the product writes from TypeScript, and the data it carries: the table's own kinds. */
interface TableData {
  "appointment.booked": BookingData;
  "appointment.cancelled": BookingData;
  "appointment.moved": BookingData;
  /** Stripe's own news of a payment, and of a trial about to end: never an amount. */
  "billing.paid": Nothing;
  "billing.payment_failed": Nothing;
  "billing.trial_ending": { trial_end: string | null };
  "billing.paused": BillingData;
  "billing.resumed": BillingData;
  "billing.updated": BillingData;
  "broadcast.sent": JsonObject;
  /** Why the run stopped (a BROADCAST_FAILURES code, with its channel where it names one) and how many it reached first. */
  "broadcast.stopped": { failure: string; sent: number | null };
  // `changed`: the columns a save moved, never their values (contracts changedRecordFields); null on the first save.
  "business.recorded": { legal_name: string | null; path: string; by?: string | null; changed?: string[] | null };
  /** The owner switched what the workspace answers on or off: which (voice, whatsapp, sms), and who. */
  "capability.activated": { capability: string; by: string };
  "capability.deactivated": { capability: string; by: string };
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
  "contact.email_suppressed": { reason: string };
  "contact.kept_apart": { by: string; doubt_id: string };
  /** The owner answered from the WhatsApp Business app: the receptionist is quiet on the thread until then. */
  "conversation.owner_replied": { until: string };
  /** A thread handed to the team: why (an escalation's reason), on the conversation. Once per hold. */
  "escalation.opened": { reason: string };
  "google.connected": { email: string | null; accounts: number; locations: number; on_maps: number; by: string | null };
  "google.disconnected": { email: string | null; location: string | null; revoked: boolean; by?: string | null };
  "google.linked": { place_id: string; name: string | null; by: string | null; read: boolean };
  "google.replied": { review_id: string; chars: number; by?: "receptionist"; usage?: JsonObject | null };
  /** An automatic reply the receptionist wrote and did not post: it named a price or money (contracts autoReplyHold). */
  "google.reply_held": { review_id: string; why: "price" | "money" };
  "google.reviews": {
    source: "places" | "profile";
    fresh: number;
    counted: number;
    rating: number | null;
    review_count: number | null;
  };
  "google.unlinked": { place_id: string; name: string | null; had_profile: boolean; by?: string | null };
  "ingest.allowlist_skip": Nothing;
  "ingest.unreachable_sender": Nothing;
  "ingest.unroutable": { channel: "email" | "voice" | "whatsapp" | "instagram" } & JsonObject;
  "lead.emailed": { by: "reach_out"; send_id: string };
  "lead.excluded": LeadTriageData;
  "lead.kept": LeadTriageData;
  "lead.put_back": LeadTriageData;
  "lead.search_removed": { name: string; kept: number; archived: number; by: string };
  "lead.search_renamed": { name: string; by: string };
  /** A person accepted an invitation: who, and the role they joined at. */
  "member.joined": { by: string; role: string };
  /** A person left by deleting their account: who (an id no row names any more), and how. */
  "member.left": { by: string; how: "account_deleted" | "left"; had_role?: string };
  "line.answering": { e164: string | null; provider: string; agent_id: string | null; by: string | null };
  "line.failed": { step: string; error: string; provider: string; by: string | null };
  /** The number a business keeps, set to forward to its line: its carrier and which calls, never the number. */
  "line.forwarding_set": { carrier: string; mode: string; by: string };
  "line.forwarding_verified": { from: string | null; call_id: string; proof: string };
  "line.released": { e164: string | null; provider: string } & JsonObject;
  "line.texting_approved": TextingData;
  "line.texting_on": TextingData;
  "line.texting_rejected": TextingData;
  /** A workspace that can't connect a mailbox says which it would use (Cold email's Tell us): told when it is built. */
  "mailbox_connection.provider_wanted": { provider: string; by: string };
  /** A mailbox the business writes from (00423, decision 0056): its address, never its token. */
  "mailbox_connection.connected": { address: string; provider: string; again: boolean; by: string | null };
  "mailbox_connection.signed_out": { address: string; provider: string };
  "mailbox_connection.held": { address: string; why: string; sent: number; bounced: number; unsubscribed: number };
  "mailbox_connection.resumed": { address: string; why: string | null; by: string };
  "mailbox_connection.paused": { address: string; by: string };
  "file.added": { file_id: string; source: string; by?: string };
  /** What was said, and by whom: "they agreed" is a word someone gave, on a day. */
  "file.changed": {
    file_id: string;
    by: string;
    said: { name?: string; shows?: string; who_in_it?: string; status?: string };
  };
  "file.kept": { count: number; by: string };
  /** A post put on the Google profile: Google's name for it, which is how it comes down. */
  "file.posted": { file_id: string; post_name: string; search_url: string | null; by: string | null };
  "file.unposted": { file_id: string; post_name: string; by: string | null };
  "file.removed": { file_id: string; by: string };
  "file.set_aside": { count: number };
  "mailbox_connection.unpaused": { address: string; by: string };
  "mailbox_connection.removed": { address: string; by: string | null };
  "mailbox_connection.sender_sorted": {
    kind: "address" | "domain";
    verdict: "automated" | "person" | null;
    by: string;
  };
  "message.send_blocked": { reason: string | null } & JsonObject;
  /** `http_status` is the send's own answer: absent when the failure came later, in the provider's receipt (reason "receipt"). */
  "message.send_failed": { http_status?: number; body: string | null; reason: string } & JsonObject;
  "message.send_raced_cancel": { wamid: string | null };
  "message.sent": { sender: string };
  "platform.acted": PlatformActedData;
  /** A playbook, or a reach-out's chain, edited: its name, who, and which parts moved (never their words). */
  "playbook.changed": { name: string; by: string; fields: string[] };
  "playbook.run": Record<string, unknown>;
  "policy.changed": { class: string; mode: string; fields: string[]; by: string; via?: string };
  "reach_out.lead_stopped": { by: string };
  "reach_out.send_decided": { decision: string; by: string };
  /** A lead's own email typed on their sheet, or the step's words put back (decision 0096): who, never the words. */
  "reach_out.lead_words_changed": { step_id: string; kept: boolean; by: string };
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
  "template.submitted": { name: string; language: string; by: string };
  "usage.ask_tokens": JsonObject;
  "usage.llm_tokens": Record<string, unknown>;
  "voice.provisioned": JsonObject & { agent_id: string; llm_id: string };
  "webhook.auth": { provider: "retell" } & JsonObject;
  "webhook.delivery": { provider: "retell" } & JsonObject;
  /** A workspace reached one of the activation milestones for the first time (contracts ACTIVATION_MILESTONES). */
  "workspace.activated": { milestone: ActivationMilestone; via: string };
}

/** Meta's account webhooks, one kind per field (contracts WABA_FIELDS): the payload as Meta sent it. */
type WabaData = { waba_id: string } & JsonObject;

/** Every kind this module writes, and its data: the table above, and Meta's family. */
export type EventData = TableData & { [K in WabaEventKind]: WabaData };

export type EmittedKind = keyof EventData;

/** Where each kind files in the ledger, and the version its data is written at. */
const WRITES: { readonly [K in keyof TableData]: { category: string; version: number } } = {
  "appointment.booked": { category: "appointment", version: 1 },
  "appointment.cancelled": { category: "appointment", version: 1 },
  "appointment.moved": { category: "appointment", version: 1 },
  "billing.paid": { category: "billing", version: 1 },
  "billing.payment_failed": { category: "billing", version: 1 },
  "billing.trial_ending": { category: "billing", version: 1 },
  "billing.paused": { category: "billing", version: 1 },
  "billing.resumed": { category: "billing", version: 1 },
  "billing.updated": { category: "billing", version: 1 },
  "broadcast.sent": { category: "message", version: 1 },
  "broadcast.stopped": { category: "message", version: 1 },
  "business.recorded": { category: "setup", version: 1 },
  "capability.activated": { category: "setup", version: 1 },
  "capability.deactivated": { category: "setup", version: 1 },
  "channel.connected": { category: "system", version: 1 },
  "contact.added": { category: "contact", version: SHARED_EVENT_VERSIONS["contact.added"] },
  "contact.consent_changed": { category: "contact", version: SHARED_EVENT_VERSIONS["contact.consent_changed"] },
  "contact.email_suppressed": { category: "contact", version: 1 },
  "contact.kept_apart": { category: "contact", version: 1 },
  "conversation.owner_replied": { category: "message", version: 1 },
  "escalation.opened": { category: "message", version: 1 },
  "google.connected": { category: "google", version: 1 },
  "google.disconnected": { category: "google", version: 1 },
  "google.linked": { category: "google", version: 1 },
  "google.replied": { category: "google", version: 1 },
  "google.reply_held": { category: "google", version: 1 },
  "google.reviews": { category: "google", version: 1 },
  "google.unlinked": { category: "google", version: 1 },
  "ingest.allowlist_skip": { category: "ingest", version: 1 },
  "ingest.unreachable_sender": { category: "ingest", version: 1 },
  "ingest.unroutable": { category: "ingest", version: 1 },
  "lead.emailed": { category: "lead", version: 1 },
  "lead.excluded": { category: "lead", version: 1 },
  "lead.kept": { category: "lead", version: 1 },
  "lead.put_back": { category: "lead", version: 1 },
  "lead.search_removed": { category: "lead", version: 1 },
  "lead.search_renamed": { category: "lead", version: 1 },
  "member.joined": { category: "system", version: 1 },
  "member.left": { category: "system", version: 1 },
  "line.answering": { category: "setup", version: 1 },
  "line.failed": { category: "setup", version: 1 },
  "line.forwarding_set": { category: "setup", version: 1 },
  "line.forwarding_verified": { category: "setup", version: 1 },
  "line.released": { category: "setup", version: 1 },
  "line.texting_approved": { category: "setup", version: 1 },
  "line.texting_on": { category: "setup", version: 1 },
  "line.texting_rejected": { category: "setup", version: 1 },
  "mailbox_connection.provider_wanted": { category: "setup", version: 1 },
  "mailbox_connection.connected": { category: "setup", version: 1 },
  "mailbox_connection.signed_out": { category: "setup", version: 1 },
  "mailbox_connection.held": { category: "setup", version: 1 },
  "mailbox_connection.resumed": { category: "setup", version: 1 },
  "mailbox_connection.paused": { category: "setup", version: 1 },
  "file.added": { category: "setup", version: 1 },
  "file.changed": { category: "setup", version: 1 },
  "file.kept": { category: "setup", version: 1 },
  "file.posted": { category: "setup", version: 1 },
  "file.unposted": { category: "setup", version: 1 },
  "file.removed": { category: "setup", version: 1 },
  "file.set_aside": { category: "setup", version: 1 },
  "mailbox_connection.unpaused": { category: "setup", version: 1 },
  "mailbox_connection.removed": { category: "setup", version: 1 },
  "mailbox_connection.sender_sorted": { category: "setup", version: 1 },
  "message.send_blocked": { category: "message", version: 1 },
  "message.send_failed": { category: "message", version: 1 },
  "message.send_raced_cancel": { category: "message", version: 1 },
  "message.sent": { category: "message", version: 1 },
  "platform.acted": { category: "platform", version: SHARED_EVENT_VERSIONS["platform.acted"] },
  "playbook.changed": { category: "message", version: 1 },
  "playbook.run": { category: "message", version: 1 },
  "policy.changed": { category: "system", version: 1 },
  "policy.veto_window_skipped": { category: "policy", version: 1 },
  "reach_out.lead_stopped": { category: "lead", version: 1 },
  "reach_out.send_decided": { category: "lead", version: 1 },
  "reach_out.lead_words_changed": { category: "lead", version: 1 },
  "settings.changed": { category: "system", version: 1 },
  "template.removed": { category: "message", version: 1 },
  "template.submitted": { category: "message", version: 1 },
  "usage.ask_tokens": { category: "usage", version: 1 },
  "usage.llm_tokens": { category: "usage", version: 1 },
  "voice.provisioned": { category: "setup", version: 1 },
  "webhook.auth": { category: "ingest", version: 1 },
  "webhook.delivery": { category: "ingest", version: 1 },
  "workspace.activated": { category: "setup", version: 1 },
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
  const write = kind in WRITES ? WRITES[kind as keyof TableData] : WABA_WRITE;
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
  return new Set((data ?? []).map((r) => r.subject_id).filter((id): id is string => typeof id === "string"));
}
