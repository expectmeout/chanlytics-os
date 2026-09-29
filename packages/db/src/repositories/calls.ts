/**
 * Calls repository (Slice 3). ingest_call is the atomic gate: identity
 * resolution + upsert + metering in one round trip, idempotent on
 * (tenant_id, retell_call_id) so webhook stages and the history backfill
 * converge on one row.
 */
import type { SchemaSet } from "@chanlytics/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../database.types";
import { IDS_PER_READ } from "./people";
import { dbLog } from "../observe";

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
  contact_id: string | null;
  conversation_id: string | null;
}

export async function ingestCall(
  db: Db,
  tenantId: string,
  n: NormalizedCallInput,
  raw?: unknown,
): Promise<IngestCallResult> {
  const { data, error } = await db.rpc("ingest_call", {
    p_tenant_id: tenantId,
    p_retell_call_id: n.retellCallId,
    p_agent_id: n.agentId,
    p_from_e164: n.fromE164,
    p_from_raw: n.fromRaw,
    p_to_e164: n.toE164,
    p_direction: n.direction,
    p_call_type: n.callType,
    p_status: n.status,
    p_started_at: n.startedAtIso,
    p_ended_at: n.endedAtIso,
    p_duration_ms: n.durationMs,
    p_disconnection: n.disconnectionReason,
    p_sentiment: n.sentiment,
    p_successful: n.callSuccessful,
    p_in_voicemail: n.inVoicemail,
    p_summary: n.summary,
    p_transcript: n.transcript,
    p_transcript_obj: (n.transcriptObject ?? null) as Json,
    // The provider URL is NOT written to the row: calls is in the realtime
    // publication, so every column reaches every member's browser, and the
    // REST layer's care in stripping it was being undone one layer down. A
    // retry asks the provider for a fresh URL by call id.
    p_recording: (n.recordingUrl ? { fetch_state: "pending" } : null) as Json,
    p_public_log_url: n.publicLogUrl,
    p_cost: (n.cost ?? null) as Json,
    p_latency: (n.latency ?? null) as Json,
    p_raw: (raw ?? {}) as Json,
    p_analysis: (n.analysis ?? null) as Json,
  } as never);
  if (error) throw new Error(`ingest_call: ${error.message}`);
  return data as unknown as IngestCallResult;
}

/**
 * Attach the thread note (call_summary message) back to its call row.
 *
 * Row-counted, like every other conditional write here: an UPDATE that RLS
 * excludes or that names a row which is gone reports success and changes
 * nothing, so "the write failed" and "the write did not happen" have to be
 * told apart by counting rows rather than by trusting the absence of an error.
 */
export async function linkCallMessage(db: Db, tenantId: string, callId: string, messageId: string): Promise<void> {
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
 * What these calls' lines showed, by id -- the number (from_e164) and what the line handed over raw (from_raw), which
 * contracts' callerName names a call by -- in one read for a hundred ids or fewer (IDS_PER_READ), under the caller's row
 * security and the workspace's own filter: a call the caller cannot read is not answered. A read that fails THROWS.
 */
export async function callersOf(
  db: Db,
  tenantId: string,
  ids: readonly string[],
): Promise<Array<{ id: string; from_e164: string | null; from_raw: string | null }>> {
  const out: Array<{ id: string; from_e164: string | null; from_raw: string | null }> = [];
  for (let i = 0; i < ids.length; i += IDS_PER_READ) {
    const { data, error } = await db
      .from("calls")
      .select("id, from_e164, from_raw")
      .eq("tenant_id", tenantId)
      .in("id", ids.slice(i, i + IDS_PER_READ));
    if (error) throw new Error(`callersOf: ${error.message}`);
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
  tenantId: string,
  callId: string,
  recording: Record<string, unknown>,
): Promise<void> {
  const { data, error } = await db
    .from("calls")
    .update({ recording: recording as Json })
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
  p: {
    tenantId: string;
    conversationId: string;
    contactId: string | null;
    body: string;
    externalId: string; // call:<retell_call_id> — idempotent across replays
    channelTsIso: string | null;
  },
): Promise<string | null> {
  const { data, error } = await db
    .from("messages")
    .insert({
      tenant_id: p.tenantId,
      conversation_id: p.conversationId,
      contact_id: p.contactId,
      channel: "voice",
      direction: "inbound",
      sender: "system",
      type: "call_summary",
      body: p.body,
      external_id: p.externalId,
      channel_ts: p.channelTsIso,
      status: "received",
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      // Already noted. Message bodies are immutable (P3), so the existing
      // line stands; hand back its id so the call row can still be linked
      // to it (a backfilled call whose link was dropped converges here).
      const { data: prior } = await db
        .from("messages")
        .select("id")
        .eq("tenant_id", p.tenantId)
        .eq("external_id", p.externalId)
        .maybeSingle();
      return prior?.id ?? null;
    }
    dbLog().error("record_call_note_failed", { tenant_id: p.tenantId, error: error.message });
    return null;
  }
  return data.id;
}

/**
 * Claim the one-time post-call side effects (the summary email, the memory
 * note). True for the first caller; false once claimed. Throws on a database
 * error so the webhook answers non-2xx and the provider retries.
 */
export async function claimCallNotification(db: Db, tenantId: string, callId: string): Promise<boolean> {
  const { data, error } = await db
    .from("calls")
    .update({ notified_at: new Date().toISOString() })
    .eq("id", callId)
    .eq("tenant_id", tenantId)
    .is("notified_at", null)
    .select("id");
  if (error) throw new Error(`claim_call_notification: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/**
 * Claim the one start of a call's Live Activity on the workspace's phones (00221). True for the first delivery of its
 * call_started; false once claimed, so a redelivered one starts nothing twice. Throws on a database error.
 */
export async function claimCallActivity(db: Db, tenantId: string, callId: string): Promise<boolean> {
  const { data, error } = await db
    .from("calls")
    .update({ activity_started_at: new Date().toISOString() })
    .eq("id", callId)
    .eq("tenant_id", tenantId)
    .is("activity_started_at", null)
    .select("id");
  if (error) throw new Error(`claim_call_activity: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/** The caller's name as the Live page gives it (their display name, else their WhatsApp name), or null. */
export async function callerNameOf(db: Db, tenantId: string, contactId: string): Promise<string | null> {
  const { data, error } = await db
    .from("contacts")
    .select("display_name, wa_profile_name")
    .eq("tenant_id", tenantId)
    .eq("id", contactId)
    .maybeSingle();
  if (error) throw new Error(`caller_name: ${error.message}`);
  return (data?.display_name || data?.wa_profile_name || "").trim() || null;
}
