/**
 * Calls repository (Slice 3). ingest_call is the atomic gate: identity
 * resolution + upsert + metering in one round trip, idempotent on
 * (tenant_id, retell_call_id) so webhook stages and the history backfill
 * converge on one row.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../database.types";

type Db = SupabaseClient<Database>;

export interface NormalizedCallInput {
  retellCallId: string;
  agentId: string | null;
  direction: "inbound" | "outbound";
  callType: string | null;
  fromE164: string | null;
  fromRaw: string | null;
  toE164: string | null;
  status: "registered" | "ongoing" | "ended" | "error";
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
}

export interface IngestCallResult {
  call_id: string;
  is_new: boolean;
  /** 'stored' means audio is already in private storage — skip re-copying. */
  recording_state: string | null;
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
    p_recording: (n.recordingUrl
      ? { provider_url: n.recordingUrl, fetch_state: "pending" }
      : null) as Json,
    p_public_log_url: n.publicLogUrl,
    p_cost: (n.cost ?? null) as Json,
    p_latency: (n.latency ?? null) as Json,
    p_raw: ((raw ?? {}) as Json),
  } as never);
  if (error) throw new Error(`ingest_call: ${error.message}`);
  return data as unknown as IngestCallResult;
}

/** Attach the thread note (call_summary message) back to its call row. */
export async function linkCallMessage(
  db: Db,
  tenantId: string,
  callId: string,
  messageId: string,
): Promise<void> {
  const { error } = await db
    .from("calls")
    .update({ message_id: messageId })
    .eq("id", callId)
    .eq("tenant_id", tenantId);
  if (error) console.error("link_call_message_failed", error.message);
}

/** Post-storage-copy state for the recording (private bucket path). */
export async function setCallRecording(
  db: Db,
  tenantId: string,
  callId: string,
  recording: Record<string, unknown>,
): Promise<void> {
  const { error } = await db
    .from("calls")
    .update({ recording: recording as Json })
    .eq("id", callId)
    .eq("tenant_id", tenantId);
  if (error) console.error("set_call_recording_failed", error.message);
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
    if (error.code === "23505") return null; // already noted
    console.error("record_call_note_failed", error.message);
    return null;
  }
  return data.id;
}
