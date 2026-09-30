/**
 * The ledger's one writer (events). A kind declares its data's shape, its category and the version its data is
 * written at, once, here. A caller names the kind, the subject and the data, and the compiler holds the data to the
 * kind.
 *
 * It replaced emitEvent's seven loose arguments. Each call spelled its own category, its data was cast to Json
 * wherever it was built, and six writers skipped it for an insert of their own.
 *
 * `version` (00264, events.version) is the version of the kind's data. It is raised when a kind's shape changes, so a
 * reader can tell an old row from a new one. Every kind starts at 1, and the migrations' own inserts are version 1 by
 * the column's default.
 *
 * `request_id` (00277) names the request a row was written in, so the ledger joins the log: a failed write is logged
 * as `emit_event_failed` through the one logger, with the same name.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SHARED_EVENT_VERSIONS,
  type ActivationMilestone,
  type ContactAddedData,
  type ContactConsentChangedData,
  type PlatformActedData,
  type WabaEventKind,
} from "@chanlytics/contracts";
import type { Database, Json } from "./database.types";
import { dbLog, dbRequestId } from "./observe";

type Db = SupabaseClient<Database>;

/** A JSON object whose keys are open: a provider's own payload, or a tally, forwarded as it came. */
type Open = { [key: string]: Json | undefined };
/** A kind that carries nothing but its subject. */
type Nothing = Record<string, never>;

type BillingData = { source: string; status: string; subscription?: string; price_id?: string | null };
type TextingData = { e164: string | null; from: string | null; to: string; mock: boolean };

/** Each kind the product writes from TypeScript, and the data it carries: the table's own kinds. */
interface TableData {
  "billing.paused": BillingData;
  "billing.resumed": BillingData;
  "billing.updated": BillingData;
  "broadcast.sent": Open;
  "business.recorded": { legal_name: string | null; path: string };
  "channel.connected": {
    kind: "whatsapp";
    phone_number_id: string;
    waba_id: string;
    number_e164: string | null;
    verified_name: string | null;
    by: string | null;
  };
  /** Three kinds have SQL writers too: their one shape and version are contracts' (workspace/event-data.ts). */
  "contact.added": ContactAddedData;
  "contact.consent_changed": ContactConsentChangedData;
  "contact.email_suppressed": { reason: string };
  "google.connected": { email: string | null; accounts: number; locations: number; on_maps: number; by: string | null };
  "google.disconnected": { email: string | null; location: string | null; revoked: boolean };
  "google.linked": { place_id: string; name: string | null; by: string | null; read: boolean };
  "google.replied": { review_id: string; chars: number; by?: "receptionist"; usage?: Open | null };
  /** An automatic reply the receptionist wrote and did not post: it named a price or money (contracts autoReplyHold). */
  "google.reply_held": { review_id: string; why: "price" | "money" };
  "google.reviews": {
    source: "places" | "profile";
    fresh: number;
    counted: number;
    rating: number | null;
    review_count: number | null;
  };
  "google.unlinked": { place_id: string; name: string | null; had_profile: boolean };
  "ingest.allowlist_skip": Nothing;
  "ingest.unreachable_sender": Nothing;
  "ingest.unroutable": { channel: "email" | "voice" | "whatsapp" } & Open;
  "lead.emailed": { by: "reach_out"; send_id: string };
  "line.answering": { e164: string | null; provider: string; agent_id: string | null; by: string | null };
  "line.failed": { step: string; error: string; provider: string; by: string | null };
  "line.forwarding_verified": { from: string | null; call_id: string; proof: string };
  "line.released": { e164: string | null; provider: string } & Open;
  "line.texting_approved": TextingData;
  "line.texting_on": TextingData;
  "line.texting_rejected": TextingData;
  "message.send_blocked": { reason: string | null } & Open;
  "message.send_failed": { http_status: number; body: string | null; reason: string } & Open;
  "message.send_raced_cancel": { wamid: string | null };
  "message.sent": { sender: string };
  "platform.acted": PlatformActedData;
  "playbook.run": Record<string, unknown>;
  "policy.changed": { class: string; mode: string; fields: string[]; by: string; via?: string };
  "policy.veto_window_skipped": { delay_ms: number; source: string; reason: string };
  "sending_domain.added": { host: string };
  "sending_domain.held": { host: string } & Open;
  "sending_domain.released": { host: string } & Open;
  "sending_domain.removed": { host: string; why?: string };
  "sending_domain.resumed": { host: string; why?: string; by: string };
  "sending_domain.verified": { host: string } & Open;
  "settings.changed": { fields: string[]; by: string; version: number | string | null; via?: string };
  "usage.ask_tokens": Open;
  "usage.llm_tokens": Record<string, unknown>;
  "voice.provisioned": Open & { agent_id: string; llm_id: string };
  "webhook.auth": { provider: "retell" } & Open;
  "webhook.delivery": { provider: "retell" } & Open;
  /** A workspace reached one of the activation milestones for the first time (contracts ACTIVATION_MILESTONES). */
  "workspace.activated": { milestone: ActivationMilestone; via: string };
}

/** Meta's account webhooks, one kind per field (contracts WABA_FIELDS): the payload as Meta sent it. */
type WabaData = { waba_id: string } & Open;

/** Every kind this module writes, and its data: the table above, and Meta's family. */
export type EventData = TableData & { [K in WabaEventKind]: WabaData };
export type EmittedKind = keyof EventData;

/** Where each kind files in the ledger, and the version its data is written at. */
const WRITES: { readonly [K in keyof TableData]: { category: string; version: number } } = {
  "billing.paused": { category: "billing", version: 1 },
  "billing.resumed": { category: "billing", version: 1 },
  "billing.updated": { category: "billing", version: 1 },
  "broadcast.sent": { category: "message", version: 1 },
  "business.recorded": { category: "setup", version: 1 },
  "channel.connected": { category: "system", version: 1 },
  "contact.added": { category: "contact", version: SHARED_EVENT_VERSIONS["contact.added"] },
  "contact.consent_changed": { category: "contact", version: SHARED_EVENT_VERSIONS["contact.consent_changed"] },
  "contact.email_suppressed": { category: "contact", version: 1 },
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
  "line.answering": { category: "setup", version: 1 },
  "line.failed": { category: "setup", version: 1 },
  "line.forwarding_verified": { category: "setup", version: 1 },
  "line.released": { category: "setup", version: 1 },
  "line.texting_approved": { category: "setup", version: 1 },
  "line.texting_on": { category: "setup", version: 1 },
  "line.texting_rejected": { category: "setup", version: 1 },
  "message.send_blocked": { category: "message", version: 1 },
  "message.send_failed": { category: "message", version: 1 },
  "message.send_raced_cancel": { category: "message", version: 1 },
  "message.sent": { category: "message", version: 1 },
  "platform.acted": { category: "platform", version: SHARED_EVENT_VERSIONS["platform.acted"] },
  "playbook.run": { category: "message", version: 1 },
  "policy.changed": { category: "system", version: 1 },
  "policy.veto_window_skipped": { category: "policy", version: 1 },
  "sending_domain.added": { category: "setup", version: 1 },
  "sending_domain.held": { category: "setup", version: 1 },
  "sending_domain.released": { category: "setup", version: 1 },
  "sending_domain.removed": { category: "setup", version: 1 },
  "sending_domain.resumed": { category: "setup", version: 1 },
  "sending_domain.verified": { category: "setup", version: 1 },
  "settings.changed": { category: "system", version: 1 },
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
function rowOf<K extends EmittedKind>(
  tenantId: string,
  kind: K,
  subjectType: string | null,
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
    data: data as Json,
    ...(requestId ? { request_id: requestId } : {}),
  };
}

/**
 * One event on the ledger, and whether it was written. For a writer whose next step needs the record to exist (the
 * back office records before it acts; a broadcast's tally; a lead's email): it reads the error and says so.
 */
export async function recordEvent<K extends EmittedKind>(
  db: Db,
  tenantId: string,
  kind: K,
  subjectType: string | null,
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
  tenantId: string,
  kind: K,
  subjectType: string | null,
  subjectId: string | null,
  data: EventData[K],
): Promise<void> {
  const { error } = await recordEvent(db, tenantId, kind, subjectType, subjectId, data);
  if (error) dbLog().error("emit_event_failed", { tenant_id: tenantId, kind, error });
}

/**
 * Of `subjectIds`, the ones a kind was already written about in this workspace: what a sweep asks before doing again
 * what it once decided not to (a review reply it held). An empty list asks nothing.
 */
export async function subjectsWith(
  db: Db,
  tenantId: string,
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
  if (error) throw new Error(`events: ${error.message}`);
  return new Set((data ?? []).map((r) => r.subject_id).filter((id): id is string => typeof id === "string"));
}

/**
 * A workspace reached a milestone (the product's analytics: the first line live, the first reply, the first lead
 * search), written once: a milestone already on the ledger writes nothing. Best effort, as emitEvent is; two writers
 * racing may both write, and a funnel counts workspaces, not rows. True when this call wrote it.
 */
export async function recordActivation(
  db: Db,
  tenantId: string,
  milestone: ActivationMilestone,
  via: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("events")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("kind", "workspace.activated")
    .eq("data->>milestone", milestone)
    .limit(1);
  if (error) {
    dbLog().error("activation_read_failed", { tenant_id: tenantId, milestone, error: error.message });
    return false;
  }
  if (data && data.length) return false;
  const w = await recordEvent(db, tenantId, "workspace.activated", "workspace", tenantId, { milestone, via });
  if (w.error) dbLog().error("emit_event_failed", { tenant_id: tenantId, kind: "workspace.activated", error: w.error });
  return !w.error;
}
