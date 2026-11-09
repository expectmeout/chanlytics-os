/**
 * The calls repository: what a voice call's webhook stages and the calls sweep write to the calls table, the call's
 * note in its customer's thread, and the reads of who a call was from. Callers are the edge's Retell webhook and calls
 * sweep (ingestCall, recordCallNote, linkCallMessage, setCallRecording), the recording copy (setCallRecording), the
 * Live Activity start (claimCallActivity, findCallerName) and the dashboard's message reader (listCallers).
 *   - ingestCall is the one door a call comes in by: the ingest_call function resolves the person, upserts the call and
 *     meters its seconds in one round trip, idempotent on (tenant_id, retell_call_id), so each webhook stage and the
 *     sweep's re-ingest converge on one row. It is forward-only: an event ranking below the row's status writes nothing
 *     and answers skipped.
 *   - linkCallMessage and setCallRecording write to an existing row and count the rows they changed: an UPDATE that RLS
 *     excludes, or that names a row that is gone, reports success, so a write that changed nothing is logged as a noop
 *     and never trusted for the absence of an error.
 *   - claimCallNotification and claimCallActivity are first-caller-wins claims (notified_at, activity_started_at): true
 *     once and false after, so a redelivery repeats neither the post-call summary nor the Live Activity start. A
 *     database error throws, and the webhook turns a failed notification claim into a 503 so the provider redelivers.
 *   - recordCallNote files the call as a call_summary message in the customer's thread, idempotent on its external id
 *     (call:<retell_call_id>), so the receptionist's history holds the call.
 *   - claimGuardCorrection is the same kind of claim for a spoken price's one correction (guard_corrected_at), and
 *     markCallNoticeTold says the owner's notice went out in full (notice_told_at), so the calls sweep can finish one
 *     whose mail was owed (listCallsOwedANotice).
 * The provider's recording URL is never written to a row: every member of the workspace reads every call row they may
 * select, and what the row keeps of the provider's payload is an allowlist (scrub_call_raw, 00530) members may not
 * select at all. The row keeps a fetch state, and a retry asks the provider for a fresh URL by call id.
 */
import { heldContactId, recordOrEmpty, valueAt, DbFailure } from "@chanlytics/contracts";
import { recordOrNull, type SchemaSet } from "@chanlytics/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../types";
import { IDS_PER_READ } from "../people/pages";
import { dbLog } from "../../shared/observe";
import { platformWide, tenantDb } from "../../shared/tenant-db";
import { asJson, jsonCopyOf } from "../../shared/json";
import { readAnswer } from "../../shared/read-json";
import { z } from "zod";
import type { ContactId, TenantId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;

export interface NormalizedCallInput {
  retellCallId: string;
  agentId: string | null;
  direction: "inbound" | "outbound";
  callType: string | null;
  fromE164: string | null;
  fromRaw: string | null;
  toE164: string | null;
  status: SchemaSet<"calls.status">;
  startedAtIso: string | null;
  endedAtIso: string | null;
  durationMs: number | null;
  disconnectionReason: string | null;
  sentiment: string | null;
  callSuccessful: boolean | null;
  inVoicemail: boolean | null;
  summary: string | null;
  transcript: string | null;
  transcriptObject: unknown;
  recordingUrl: string | null;
  publicLogUrl: string | null;
  cost: unknown;
  latency: unknown;
  /** The agent's post-call analysis answers; the door files them as columns. */
  analysis: unknown;
}

export interface IngestCallResult {
  call_id: string;
  is_new: boolean;
  /** 'stored' means audio is already in private storage — skip re-copying. */
  recording_state: string | null;
  /** Copy attempts so far — the bound the sweep and the webhook share. */
  recording_attempts?: number | null;
  /** True when the event ranked below the row's status (a retried
   *  call_started after call_ended): nothing was written, updated_at did
   *  not move. */
  skipped?: boolean;
  contact_id: ContactId | null;
  conversation_id: string | null;
}

/** What ingest_call answers, as IngestCallResult says it. */
const IngestCallAnswer: z.ZodType<IngestCallResult> = z.object({
  call_id: z.string(),
  is_new: z.boolean(),
  recording_state: z.string().nullable(),
  recording_attempts: z.number().nullable().optional(),
  skipped: z.boolean().optional(),
  contact_id: z.string().transform(heldContactId).nullable(),
  conversation_id: z.string().nullable(),
});

export async function ingestCall(
  db: Db,
  tenantId: TenantId,
  callInput: NormalizedCallInput,
  raw?: unknown,
): Promise<IngestCallResult> {
  const { data, error } = await db.rpc("ingest_call", {
    p_tenant_id: tenantId,
    p_retell_call_id: callInput.retellCallId,
    p_agent_id: callInput.agentId,
    p_from_e164: callInput.fromE164,
    p_from_raw: callInput.fromRaw,
    p_to_e164: callInput.toE164,
    p_direction: callInput.direction,
    p_call_type: callInput.callType,
    p_status: callInput.status,
    p_started_at: callInput.startedAtIso,
    p_ended_at: callInput.endedAtIso,
    p_duration_ms: callInput.durationMs,
    p_disconnection: callInput.disconnectionReason,
    p_sentiment: callInput.sentiment,
    p_successful: callInput.callSuccessful,
    p_in_voicemail: callInput.inVoicemail,
    p_summary: callInput.summary,
    p_transcript: callInput.transcript,
    p_transcript_obj: asJson(callInput.transcriptObject ?? null),
    // The provider URL is NOT written to the row: calls is in the realtime
    // publication, so every column reaches every member's browser, and the
    // REST layer's care in stripping it was being undone one layer down. A
    // retry asks the provider for a fresh URL by call id.
    p_recording: asJson(callInput.recordingUrl ? { fetch_state: "pending" } : null),
    p_public_log_url: callInput.publicLogUrl,
    p_cost: asJson(callInput.cost ?? null),
    p_latency: asJson(callInput.latency ?? null),
    p_raw: asJson(raw ?? {}),
    p_analysis: asJson(callInput.analysis ?? null),
  });
  if (error) throw new DbFailure(error, "ingest_call");
  return readAnswer("ingest_call", IngestCallAnswer, data);
}

/**
 * Attach the thread note (call_summary message) back to its call row.
 *
 * Row-counted, like every other conditional write here: an UPDATE that RLS
 * excludes or that names a row which is gone reports success and changes
 * nothing, so "the write failed" and "the write did not happen" have to be
 * told apart by counting rows rather than by trusting the absence of an error.
 */
export async function linkCallMessage(db: Db, tenantId: TenantId, callId: string, messageId: string): Promise<void> {
  const { data, error } = await db
    .from("calls")
    .update({ message_id: messageId })
    .eq("id", callId)
    .eq("tenant_id", tenantId)
    .select("id");
  if (error) dbLog().error("link_call_message_failed", { tenant_id: tenantId, call_id: callId, error: error.message });
  else if (!data || data.length === 0)
    dbLog().error("link_call_message_noop", { tenant_id: tenantId, call_id: callId });
}

/**
 * The settings version a call was composed from (decision 0069, R6), as its metadata carried it from the inbound
 * webhook: written once, on the row the ingest made, so a review judges the call against what it knew. A row already
 * stamped keeps its version; a call with no row yet is stamped on the next delivery's ingest.
 */
export async function stampCallConfigVersion(
  db: Db,
  tenantId: TenantId,
  retellCallId: string,
  version: number,
): Promise<boolean> {
  const { data, error } = await db
    .from("calls")
    .update({ config_version: version })
    .eq("tenant_id", tenantId)
    .eq("retell_call_id", retellCallId)
    .is("config_version", null)
    .select("id");
  if (error) throw new DbFailure(error, "stampCallConfigVersion");
  return (data ?? []).length > 0;
}

/** A call as its review reads it: its words, what it was composed from, the agent, and whose it is. */
export async function callForReview(
  db: Db,
  tenantId: TenantId,
  callId: string,
): Promise<{
  id: string;
  agent_id: string | null;
  config_version: number | null;
  transcript_object: Json | null;
  transcript: string | null;
  created_at: string;
} | null> {
  const { data, error } = await db
    .from("calls")
    .select("id, agent_id, config_version, transcript_object, transcript, created_at")
    .eq("tenant_id", tenantId)
    .eq("id", callId)
    .maybeSingle();
  if (error) throw new DbFailure(error, "callForReview");
  return data ?? null;
}

/**
 * What these calls' lines showed, by id -- the number (from_e164) and what the line handed over raw (from_raw), which
 * contracts' callerName names a call by -- in one read for a hundred ids or fewer (IDS_PER_READ), under the caller's row
 * security and the workspace's own filter: a call the caller cannot read is not answered. A read that fails THROWS.
 */
export async function listCallers(
  db: Db,
  tenantId: TenantId,
  ids: readonly string[],
): Promise<Array<{ id: string; from_e164: string | null; from_raw: string | null }>> {
  const out: Array<{ id: string; from_e164: string | null; from_raw: string | null }> = [];
  for (let i = 0; i < ids.length; i += IDS_PER_READ) {
    const { data, error } = await db
      .from("calls")
      .select("id, from_e164, from_raw")
      .eq("tenant_id", tenantId)
      .in("id", ids.slice(i, i + IDS_PER_READ));
    if (error) throw new DbFailure(error, "listCallers");
    out.push(...(data ?? []));
  }
  return out;
}

/**
 * Post-storage-copy state for the recording (private bucket path).
 *
 * Row-counted, and this is the one where it bites: the audio is already in the
 * bucket by the time this runs. A write that silently changed nothing leaves
 * the row saying `pending`, so the sweep fetches the file again, uploads it
 * again (upsert), three times, and then marks it failed -- and the object it
 * left behind is invisible to the purge, which only looks at rows that say
 * `stored`. A row that did not change is now said out loud.
 */
export async function setCallRecording(
  db: Db,
  tenantId: TenantId,
  callId: string,
  recording: Record<string, unknown>,
): Promise<void> {
  const { data, error } = await db
    .from("calls")
    .update({ recording: jsonCopyOf(recording) })
    .eq("id", callId)
    .eq("tenant_id", tenantId)
    .select("id");
  if (error) dbLog().error("set_call_recording_failed", { tenant_id: tenantId, call_id: callId, error: error.message });
  else if (!data || data.length === 0)
    dbLog().error("set_call_recording_noop", { tenant_id: tenantId, call_id: callId });
}

/** The customer's thread gets the call as a message, so history stays in one place. */
export async function recordCallNote(
  db: Db,
  params: {
    tenantId: TenantId;
    conversationId: string;
    contactId: ContactId | null;
    body: string;
    externalId: string; // call:<retell_call_id> — idempotent across replays
    channelTsIso: string | null;
  },
): Promise<string | null> {
  const { data, error } = await db
    .from("messages")
    .insert({
      tenant_id: params.tenantId,
      conversation_id: params.conversationId,
      contact_id: params.contactId,
      channel: "voice",
      direction: "inbound",
      sender: "system",
      type: "call_summary",
      body: params.body,
      external_id: params.externalId,
      channel_ts: params.channelTsIso,
      status: "received",
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      // Already noted. Message bodies are immutable (P3), so the existing
      // line stands; hand back its id so the call row can still be linked
      // to it (a backfilled call whose link was dropped converges here).
      const { data: prior, error: priorErr } = await db
        .from("messages")
        .select("id")
        .eq("tenant_id", params.tenantId)
        .eq("external_id", params.externalId)
        .maybeSingle();
      if (priorErr) dbLog().error("record_call_note_failed", { tenant_id: params.tenantId, error: priorErr.message });
      return prior?.id ?? null;
    }
    dbLog().error("record_call_note_failed", { tenant_id: params.tenantId, error: error.message });
    return null;
  }
  return data.id;
}

/**
 * Claim the one-time post-call side effects (the summary email, the memory
 * note). True for the first caller; false once claimed. Throws on a database
 * error so the webhook answers non-2xx and the provider retries.
 */
export async function claimCallNotification(db: Db, tenantId: TenantId, callId: string): Promise<boolean> {
  const { data, error } = await db
    .from("calls")
    .update({ notified_at: new Date().toISOString() })
    .eq("id", callId)
    .eq("tenant_id", tenantId)
    .is("notified_at", null)
    .select("id");
  if (error) throw new DbFailure(error, "claim_call_notification");
  return (data?.length ?? 0) > 0;
}

/**
 * Claim the one start of a call's Live Activity on the workspace's phones (00221). True for the first delivery of its
 * call_started; false once claimed, so a redelivered one starts nothing twice. Throws on a database error.
 */
export async function claimCallActivity(db: Db, tenantId: TenantId, callId: string): Promise<boolean> {
  const { data, error } = await db
    .from("calls")
    .update({ activity_started_at: new Date().toISOString() })
    .eq("id", callId)
    .eq("tenant_id", tenantId)
    .is("activity_started_at", null)
    .select("id");
  if (error) throw new DbFailure(error, "claim_call_activity");
  return (data?.length ?? 0) > 0;
}

/** The caller's name as the Live page gives it (their display name, else their WhatsApp name), or null. */
export async function findCallerName(db: Db, tenantId: TenantId, contactId: ContactId): Promise<string | null> {
  const { data, error } = await db
    .from("contacts")
    .select("display_name, wa_profile_name")
    .eq("tenant_id", tenantId)
    .eq("id", contactId)
    .maybeSingle();
  if (error) throw new DbFailure(error, "caller_name");
  return (data?.display_name || data?.wa_profile_name || "").trim() || null;
}

/**
 * Whether the call the provider knows as `retellCallId` is this workspace's: what a live-call door asks before it
 * speaks into, ends or hands over a call for a token's workspace (the dashboard's route proved it under RLS; the edge
 * acts through the service role and proves it again). Null when the read failed: the door answers that, never a yes.
 */
export async function isWorkspaceCall(db: Db, tenantId: TenantId, retellCallId: string): Promise<boolean | null> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("calls")
    .select("id")
    .eq("retell_call_id", retellCallId)
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data !== null;
}

/**
 * The calls whose analysis may have been lost, oldest first, at most `limit` (the calls sweep's settle leg, the wiring's
 * second audit, R11 S11-3): ended or errored, longer than a hang-up (`minMs`), in the customer's thread, its owner never
 * told (no claim on the row), with no summary yet or one that asked for a call back, ended between `toMs` and `fromMs`
 * ago. trigger_call_reconcile (00434) wakes the sweep on the same window. A read that fails throws.
 */
export async function listCallsOwedAnAnalysis(
  db: Db,
  params: { nowMs: number; fromMs: number; toMs: number; minMs: number; limit: number },
): Promise<Array<{ id: string; tenant_id: TenantId; retell_call_id: string }>> {
  const { data, error } = await db
    .from("calls")
    .select("id, tenant_id, retell_call_id")
    .in("status", ["ended", "error"])
    .is("notified_at", null)
    .not("conversation_id", "is", null)
    .gte("duration_ms", params.minMs)
    .lt("ended_at", new Date(params.nowMs - params.fromMs).toISOString())
    .gt("ended_at", new Date(params.nowMs - params.toMs).toISOString())
    .or("summary.is.null,outcome.eq.callback_needed")
    .order("ended_at", { ascending: true })
    .limit(params.limit);
  if (error) throw new DbFailure(error, "cannot read the calls owed an analysis");
  return data ?? [];
}

/**
 * Claim the one correction a spoken price earns on a live call (guard_corrected_at, 00530): true for the first
 * delivery that finds the breach, false once claimed, so a call whose turns land on two instances is corrected once,
 * where an in-memory set corrected it on each. Throws on a database error: the delivery is retried, and the claim
 * still holds the correction to one.
 */
export async function claimGuardCorrection(db: Db, tenantId: TenantId, callId: string): Promise<boolean> {
  const { data, error } = await db
    .from("calls")
    .update({ guard_corrected_at: new Date().toISOString() })
    .eq("id", callId)
    .eq("tenant_id", tenantId)
    .is("guard_corrected_at", null)
    .select("id");
  if (error) throw new DbFailure(error, "claim_guard_correction");
  return (data?.length ?? 0) > 0;
}

/**
 * Say the owner's notice of a call went out in full: the bell, the phones and the mail (notice_told_at, 00530). The
 * claim (notified_at) says the notice is owed and kept; this says it was told. A write that fails is logged: the sweep
 * then asks the notice again, and notifyOnce finds it told and sends nothing twice.
 */
export async function markCallNoticeTold(db: Db, tenantId: TenantId, callId: string): Promise<void> {
  const { error } = await db
    .from("calls")
    .update({ notice_told_at: new Date().toISOString() })
    .eq("id", callId)
    .eq("tenant_id", tenantId)
    .is("notice_told_at", null);
  if (error) dbLog().error("call_notice_mark_failed", { tenant_id: tenantId, call_id: callId, error: error.message });
}

/**
 * The calls whose owner's notice was claimed and not told in full (a mail that failed, a delivery Retell stopped
 * retrying), oldest first, at most `limit`: claimed between `fromMs` and `toMs` ago. The calls sweep asks the provider for
 * each and settles it again, and notifyOnce sends only the mail still owed (decision 0048). trigger_call_reconcile wakes
 * the sweep on the same window (00530). A read that fails throws.
 */
export async function listCallsOwedANotice(
  db: Db,
  params: { nowMs: number; fromMs: number; toMs: number; limit: number },
): Promise<Array<{ id: string; tenant_id: TenantId; retell_call_id: string; status: string }>> {
  const { data, error } = await platformWide(db)
    .from("calls")
    .select("id, tenant_id, retell_call_id, status")
    .not("notified_at", "is", null)
    .is("notice_told_at", null)
    .lt("notified_at", new Date(params.nowMs - params.fromMs).toISOString())
    .gt("notified_at", new Date(params.nowMs - params.toMs).toISOString())
    .order("notified_at", { ascending: true })
    .limit(params.limit);
  if (error) throw new DbFailure(error, "cannot read the calls owed a notice");
  return data ?? [];
}

/** The canary's workspace as the canary needs it: whether it is ours, and the number its receptionist answers. */
export async function findCanaryLine(db: Db, tenantId: TenantId): Promise<{ ours: boolean; e164: string | null }> {
  const t = tenantDb(db, tenantId);
  const [tenant, line] = await Promise.all([
    db.from("tenants").select("ours").eq("id", tenantId).maybeSingle(),
    t.from("lines").select("e164").eq("voice_state", "answering").not("e164", "is", null).limit(1).maybeSingle(),
  ]);
  if (tenant.error) throw new DbFailure(tenant.error, "cannot read the canary's workspace");
  if (line.error) throw new DbFailure(line.error, "cannot read the canary's line");
  return { ours: tenant.data?.ours === true, e164: line.data?.e164 ?? null };
}

/** What the canary's newest call left behind, as voice-canary.ts judges it (judgeCanary). */
export interface CanaryCallFacts {
  call: {
    retell_call_id: string;
    status: string;
    analysed: boolean;
    thread_line: boolean;
    notice_claimed: boolean;
    notice_told: boolean;
    recording: string | null;
    composed: boolean;
    hold_released: boolean;
  } | null;
  /** The voice doors' evidence since the call was placed (webhook.auth): each door's signed and unsigned knocks. */
  doors: Record<string, VoiceDoorKnocks>;
}

/** One voice door's knocks kept since a moment: signed, carrying only the shared secret, neither; the newest's time. */
export interface VoiceDoorKnocks {
  signed: number;
  secret_only: number;
  unsigned: number;
  last_at: string;
}

/**
 * Each voice door's knocks kept since `sinceIso` (`webhook.auth` rows under the platform, decision 0092): the evidence
 * RETELL_DOORS_SIGNED is set on, and the canary's proof that its call was signed. The call webhook's rows name no door:
 * they are "webhook". The newest thousand rows at most. A read that fails throws.
 */
export async function listVoiceDoorKnocks(db: Db, sinceIso: string): Promise<Record<string, VoiceDoorKnocks>> {
  const { data, error } = await platformWide(db)
    .from("events")
    .select("created_at, data")
    .eq("kind", "webhook.auth")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw new DbFailure(error, "cannot read the voice doors' evidence");
  const doors: Record<string, VoiceDoorKnocks> = {};
  for (const r of data ?? []) {
    const d = recordOrEmpty(r.data);
    if (d.provider !== "retell") continue;
    const door = typeof d.door === "string" ? d.door : "webhook";
    const n = (doors[door] ??= { signed: 0, secret_only: 0, unsigned: 0, last_at: r.created_at });
    if (d.sig === true) n.signed += 1;
    else if (d.secret === true) n.secret_only += 1;
    else n.unsigned += 1;
  }
  return doors;
}

/**
 * The canary's newest call from its own number since `sinceIso`, and what it left: its row, its line in the thread, its
 * notice, its audio, the settings it was composed from, the hold it let go; and every voice door's signed knocks since.
 * A read that fails throws.
 */
export async function getCanaryCallFacts(
  db: Db,
  params: { tenantId: TenantId; fromE164: string; sinceIso: string },
): Promise<CanaryCallFacts> {
  const result = tenantDb(db, params.tenantId);
  const { data: row, error } = await result
    .from("calls")
    .select(
      "retell_call_id, status, analysis, outcome, message_id, notified_at, notice_told_at, recording, config_version, conversation_id",
    )
    .eq("from_e164", params.fromE164)
    .gte("created_at", params.sinceIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new DbFailure(error, "cannot read the canary's call");
  const doors = await listVoiceDoorKnocks(db, params.sinceIso);
  if (!row) return { call: null, doors };
  let held = false;
  if (row.conversation_id) {
    const { data: conv, error: convErr } = await result
      .from("conversations")
      .select("control_kind, control_ref")
      .eq("id", row.conversation_id)
      .maybeSingle();
    if (convErr) throw new Error(`cannot read the canary's thread: ${convErr.message}`);
    held = conv?.control_kind === "call" && conv.control_ref === row.retell_call_id;
  }
  const recordingState = valueAt(row.recording, "fetch_state");
  return {
    call: {
      retell_call_id: row.retell_call_id,
      status: row.status,
      analysed: row.analysis !== null || row.outcome !== null,
      thread_line: row.message_id !== null,
      notice_claimed: row.notified_at !== null,
      notice_told: row.notice_told_at !== null,
      recording: typeof recordingState === "string" ? recordingState : null,
      composed: row.config_version !== null,
      hold_released: !held,
    },
    doors,
  };
}

/**
 * The provider's ids of a person's calls, read while their rows still stand: what the erasure asks the voice provider to
 * delete (decision 0036's provider leg, 00530). A read that fails throws: the leg is best effort, and its caller says so.
 */
export async function listRetellCallIds(db: Db, tenantId: TenantId, contactId: ContactId): Promise<string[]> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("calls")
    .select("retell_call_id")
    .eq("contact_id", contactId);
  if (error) throw new DbFailure(error, "cannot read the person's calls");
  return (data ?? []).map((r) => r.retell_call_id);
}

/**
 * The seconds a workspace's calls were metered since `sinceIso` (usage.voice_seconds, written once a call by ingest_call):
 * Settings › Billing's minutes this month (decision 0092). Read as the member, under the events' own row security. A
 * read that fails throws.
 */
export async function callSecondsSince(db: Db, tenantId: TenantId, sinceIso: string): Promise<number> {
  const { data, error } = await db
    .from("events")
    .select("data")
    .eq("tenant_id", tenantId)
    .eq("kind", "usage.voice_seconds")
    .gte("created_at", sinceIso)
    .limit(10000);
  if (error) throw new DbFailure(error, "cannot read the month's call seconds");
  return (data ?? []).reduce((n, r) => {
    const s = recordOrNull(r.data)?.seconds;
    return n + (typeof s === "number" && Number.isFinite(s) ? s : 0);
  }, 0);
}

/** The workspace's newest inbound call that connected: who called, and for how long. */
export const findLastAnsweredCall = async (db: Db, tenantId: TenantId) =>
  db
    .from("calls")
    .select("from_e164, duration_ms")
    .eq("tenant_id", tenantId)
    .eq("direction", "inbound")
    .neq("status", "not_connected")
    .order("started_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
