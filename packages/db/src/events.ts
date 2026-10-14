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
  personName,
  SHARED_EVENT_VERSIONS,
  type ActivationMilestone,
  type ActivitySubjectType,
  type ContactAddedData,
  type ContactConsentChangedData,
  type PlatformActedData,
  type WabaEventKind,
} from "@chanlytics/contracts";
import type { Database, Json } from "./database.types";
import { dbLog, dbRequestId } from "./observe";

type Db = SupabaseClient<Database>;

/**
 * A JSON object whose keys are open: a provider's own payload, a tally, or a counts function's answer, forwarded as it
 * came. Json's object branch, spelled once for packages/db (reports/report-series.ts and reach-out-sheet.ts read it).
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
  "ingest.unroutable": { channel: "email" | "voice" | "whatsapp" } & JsonObject;
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
  /** A mailbox the business writes from (00423, decision 0056): its address, never its token. */
  "mailbox_connection.connected": { address: string; provider: string; again: boolean; by: string | null };
  "mailbox_connection.signed_out": { address: string; provider: string };
  "mailbox_connection.held": { address: string; why: string; sent: number; bounced: number; unsubscribed: number };
  "mailbox_connection.resumed": { address: string; why: string | null; by: string };
  "mailbox_connection.paused": { address: string; by: string };
  "mailbox_connection.unpaused": { address: string; by: string };
  "mailbox_connection.removed": { address: string; by: string | null };
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
  "policy.veto_window_skipped": { delay_ms: number; source: string; reason: string };
  "settings.changed": { fields: string[]; by: string; version: number | string | null; via?: string };
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
  "mailbox_connection.connected": { category: "setup", version: 1 },
  "mailbox_connection.signed_out": { category: "setup", version: 1 },
  "mailbox_connection.held": { category: "setup", version: 1 },
  "mailbox_connection.resumed": { category: "setup", version: 1 },
  "mailbox_connection.paused": { category: "setup", version: 1 },
  "mailbox_connection.unpaused": { category: "setup", version: 1 },
  "mailbox_connection.removed": { category: "setup", version: 1 },
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
function rowOf<K extends EmittedKind>(
  tenantId: string,
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
  tenantId: string,
  kind: K,
  subjectType: ActivitySubjectType | null,
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

/* ----------------------------------------------------------- the spine: the relay and a delivery (00334, decision 0032) */

/** The event a delivery is about, as the ledger holds it: what a subscriber is handed. */
export interface DeliveredEvent {
  id: string;
  tenant_id: string;
  kind: string;
  subject_type: string | null;
  subject_id: string | null;
  data: Json;
  created_at: string;
  version: number;
  aggregate_version: number | null;
  causation_id: string | null;
}

/** One delivery row as the relay left it (event_deliveries). */
export interface DeliveryRow {
  state: "scheduled" | "done" | "failed" | "paused";
  attempts: number;
}

/**
 * The first step of every tick (relay_events, 00334): the outbox's events become deliveries and jobs, up to `limit` of
 * them, oldest first and with no cursor. Answers how many events were relayed.
 */
export async function relayEvents(db: Db, limit: number): Promise<number> {
  const { data, error } = await db.rpc("relay_events", { p_limit: limit });
  if (error) throw new Error(`relay_events: ${error.message}`);
  return data ?? 0;
}

/** The event a delivery is about; null when the ledger no longer holds it (the evidence purge, 00115). */
export async function eventOfDelivery(db: Db, tenantId: string, eventId: string): Promise<DeliveredEvent | null> {
  const { data, error } = await db
    .from("events")
    .select("id, tenant_id, kind, subject_type, subject_id, data, created_at, version, aggregate_version, causation_id")
    .eq("tenant_id", tenantId)
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw new Error(`events: ${error.message}`);
  return data;
}

/** Whether a subscription is paused as its delivery runs; one that is gone reads as paused. */
export async function subscriptionPaused(db: Db, kind: string, subscriber: string): Promise<boolean> {
  const { data, error } = await db
    .from("event_subscriptions")
    .select("paused")
    .eq("kind", kind)
    .eq("subscriber", subscriber)
    .maybeSingle();
  if (error) throw new Error(`event_subscriptions: ${error.message}`);
  return data ? data.paused : true;
}

/** The delivery row as it stands; null when the relay never wrote it. */
export async function deliveryOf(
  db: Db,
  tenantId: string,
  eventId: string,
  subscriber: string,
): Promise<DeliveryRow | null> {
  const { data, error } = await db
    .from("event_deliveries")
    .select("state, attempts")
    .eq("tenant_id", tenantId)
    .eq("event_id", eventId)
    .eq("subscriber", subscriber)
    .maybeSingle();
  if (error) throw new Error(`event_deliveries: ${error.message}`);
  return data as DeliveryRow | null;
}

/** The delivery's verdict after a run: done, failed with why, or paused because its subscription was. */
export async function settleDelivery(
  db: Db,
  d: {
    tenantId: string;
    eventId: string;
    subscriber: string;
    state: "done" | "failed" | "paused";
    attempts: number;
    error: string | null;
  },
): Promise<void> {
  const { error } = await db
    .from("event_deliveries")
    .update({ state: d.state, attempts: d.attempts, last_error: d.error })
    .eq("tenant_id", d.tenantId)
    .eq("event_id", d.eventId)
    .eq("subscriber", d.subscriber);
  if (error) throw new Error(`event_deliveries: ${error.message}`);
}

/* ------------------------------------------------ what the ledgers' rows are about ------------------------------------------------ */

/**
 * What the activity log's rows are about (apps/dashboard/src/server/metrics/activity.ts): each subject's name, and
 * whose thread or person it is, so a line can say and open it.
 *
 * A decision or an event names its subject by type and id, and the log printed neither: "Listened to a call's
 * recording" said whose call only behind its Open, and "A message could not be sent" opened nothing. This reads what a
 * page of the log needs, in rounds: the rows that name themselves (a list, a broadcast, a playbook, a lead) and the
 * ones that are a person's (a thread, a call, a deal, a message) or a thread's (an escalation); then an escalation's
 * thread; then every person those and the rows name. A person is named by the one rule (contracts personName).
 *
 * Workspace scope: every statement is filtered by tenant_id, on the member's own client, so row security decides what
 * is read and a subject of another workspace is no subject. Ids go out a hundred to a statement: a page may hold five
 * hundred rows, and five hundred ids in one address is past what the wire carries.
 */

/** A row's subject, as the ledgers name it. */
export interface ActivitySubject {
  type: string;
  id: string;
}

/** What a page's subjects are, each keyed `<type>:<id>`; a subject with no answer is absent from that answer. */
export interface ActivitySubjects {
  /** The name: a person's (their own, their thread's, call's, deal's, message's or escalation's), a list's, a run's, a lead's. */
  names: Record<string, string>;
  /** The thread a message or an escalation is on: its conversation's id. */
  threads: Record<string, string>;
  /** The person a deal is with: their id. */
  people: Record<string, string>;
  /** When a visit starts, as its row holds it (an ISO instant): the day a line about it opens the Calendar on. */
  visits: Record<string, string>;
  /** The name of the Library message a template row is, by `template:<id>`: how its drawer is addressed. A message that is gone, or hidden from the Library, is absent. */
  library: Record<string, string>;
}

/** How many ids one statement names. */
const IDS_PER_READ = 100;

const chunks = (ids: readonly string[]): string[][] => {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += IDS_PER_READ) out.push(ids.slice(i, i + IDS_PER_READ));
  return out;
};

/** Every row of one table whose id is one of `ids`, a hundred ids to a statement; the first error is thrown. */
async function readByIds<R>(
  ids: readonly string[],
  read: (some: string[]) => PromiseLike<{ data: R[] | null; error: { message: string } | null }>,
): Promise<R[]> {
  const answers = await Promise.all(chunks(ids).map((some) => read(some)));
  const out: R[] = [];
  for (const a of answers) {
    if (a.error) throw new Error(a.error.message);
    out.push(...(a.data ?? []));
  }
  return out;
}

/** A row that is a person's, or a thread's: which. */
interface Theirs {
  id: string;
  contact_id?: string | null;
  conversation_id?: string | null;
  /** A visit's own name for who it is with, where no person of the workspace is on it (a booking tool's email). */
  client_name?: string | null;
  /** A visit's start: the row's own instant. */
  starts_at?: string | null;
}

/** The subjects that are a person's or a thread's, read by type: the first round. */
async function theirsOf(
  db: Db,
  tenantId: string,
  idsOf: (type: string) => string[],
): Promise<Record<string, Theirs[]>> {
  const [conversation, call, deal, message, escalation, appointment] = await Promise.all([
    readByIds<Theirs>(idsOf("conversation"), (some) =>
      db.from("conversations").select("id, contact_id").eq("tenant_id", tenantId).in("id", some),
    ),
    readByIds<Theirs>(idsOf("call"), (some) =>
      db.from("calls").select("id, contact_id").eq("tenant_id", tenantId).in("id", some),
    ),
    readByIds<Theirs>(idsOf("deal"), (some) =>
      db.from("deals").select("id, contact_id").eq("tenant_id", tenantId).in("id", some),
    ),
    readByIds<Theirs>(idsOf("message"), (some) =>
      db.from("messages").select("id, contact_id, conversation_id").eq("tenant_id", tenantId).in("id", some),
    ),
    readByIds<Theirs>(idsOf("escalation"), (some) =>
      db.from("escalations").select("id, conversation_id").eq("tenant_id", tenantId).in("id", some),
    ),
    readByIds<Theirs>(idsOf("appointment"), (some) =>
      db.from("appointments").select("id, contact_id, client_name, starts_at").eq("tenant_id", tenantId).in("id", some),
    ),
  ]);
  return { conversation, call, deal, message, escalation, appointment };
}

/** The subjects that name themselves: a list, a broadcast, a playbook, a lead, a search. */
async function ownNames(db: Db, tenantId: string, idsOf: (type: string) => string[]): Promise<Record<string, string>> {
  const [lists, broadcasts, playbooks, leads, searches] = await Promise.all([
    readByIds(idsOf("list"), (some) => db.from("segments").select("id, name").eq("tenant_id", tenantId).in("id", some)),
    readByIds(idsOf("broadcast"), (some) =>
      db.from("broadcasts").select("id, name").eq("tenant_id", tenantId).in("id", some),
    ),
    readByIds(idsOf("playbook"), (some) =>
      db.from("playbooks").select("id, name").eq("tenant_id", tenantId).in("id", some),
    ),
    readByIds(idsOf("lead"), (some) =>
      db.from("leads").select("id, business_name").eq("tenant_id", tenantId).in("id", some),
    ),
    readByIds(idsOf("lead_search"), (some) =>
      db.from("lead_searches").select("id, name").eq("tenant_id", tenantId).in("id", some),
    ),
  ]);
  const names: Record<string, string> = {};
  for (const r of lists) if (r.name) names[`list:${r.id}`] = r.name;
  for (const r of broadcasts) if (r.name) names[`broadcast:${r.id}`] = r.name;
  for (const r of playbooks) if (r.name) names[`playbook:${r.id}`] = r.name;
  for (const r of leads) if (r.business_name) names[`lead:${r.id}`] = r.business_name;
  for (const r of searches) if (r.name) names[`lead_search:${r.id}`] = r.name;
  return names;
}

/** The Library messages the page's template subjects are, by `template:<id>` to their names: the ones that are still there to open. */
async function libraryOf(db: Db, tenantId: string, idsOf: (type: string) => string[]): Promise<Record<string, string>> {
  const rows = await readByIds(idsOf("template"), (some) =>
    db.from("templates").select("id, name").eq("tenant_id", tenantId).is("hidden_at", null).in("id", some),
  );
  return Object.fromEntries(rows.flatMap((r) => (r.name ? [[`template:${r.id}`, r.name]] : [])));
}

/**
 * Every subject of a page of the log: its name, and whose thread or person it is. A subject of a type with no name (a
 * workspace, a channel, a review), one row security hides, and a person with nothing to call them by are absent.
 */
export async function activitySubjects(
  db: Db,
  tenantId: string,
  subjects: readonly ActivitySubject[],
): Promise<ActivitySubjects> {
  const idsOf = (type: string): string[] => [...new Set(subjects.filter((s) => s.type === type).map((s) => s.id))];
  const [names, theirs, library] = await Promise.all([
    ownNames(db, tenantId, idsOf),
    theirsOf(db, tenantId, idsOf),
    libraryOf(db, tenantId, idsOf),
  ]);
  const threads: Record<string, string> = {};
  const people: Record<string, string> = {};
  const visits: Record<string, string> = {};

  // An escalation is a thread's: the thread says whose. Only the threads the first round did not read are asked for.
  const known = new Map((theirs.conversation ?? []).map((c) => [c.id, c.contact_id ?? null]));
  const asked = [
    ...new Set((theirs.escalation ?? []).map((e) => e.conversation_id).filter((id): id is string => !!id)),
  ];
  const more = await readByIds<Theirs>(
    asked.filter((id) => !known.has(id)),
    (some) => db.from("conversations").select("id, contact_id").eq("tenant_id", tenantId).in("id", some),
  );
  for (const c of more) known.set(c.id, c.contact_id ?? null);

  /** The person a subject is, by its key. */
  const personOf = new Map<string, string>();
  for (const id of idsOf("contact")) personOf.set(`contact:${id}`, id);
  for (const [type, rows] of Object.entries(theirs))
    for (const r of rows) {
      const key = `${type}:${r.id}`;
      if (type !== "conversation" && r.conversation_id) threads[key] = r.conversation_id;
      const person = r.contact_id ?? (r.conversation_id ? known.get(r.conversation_id) : null) ?? null;
      if (!person) continue;
      personOf.set(key, person);
      if (type === "deal") people[key] = person;
    }

  const rows = await readByIds([...new Set(personOf.values())], (some) =>
    db
      .from("contacts")
      .select("id, display_name, wa_profile_name, phone_e164, email")
      .eq("tenant_id", tenantId)
      .in("id", some),
  );
  const nameOf = new Map<string, string>();
  for (const p of rows) {
    // A person with none of the four is "Unknown" to the one rule, and a log line gains nothing from saying so.
    if (p.display_name || p.wa_profile_name || p.phone_e164 || p.email) nameOf.set(p.id, personName(p));
  }
  for (const [key, person] of personOf) {
    const name = nameOf.get(person);
    if (name) names[key] = name;
  }
  // A visit nobody of the workspace is on yet is named as its booking said it.
  for (const a of theirs.appointment ?? []) {
    const key = `appointment:${a.id}`;
    if (!names[key] && a.client_name) names[key] = a.client_name;
    // and opens on its day, which only its row knows.
    if (a.starts_at) visits[key] = a.starts_at;
  }
  return { names, threads, people, visits, library };
}
