/**
 * What the calls sweep and the recordings' upkeep read and write (decision 0111): the calls gone quiet, the ones
 * missing their note, the recordings still to copy and the ones past their retention, each read across workspaces on
 * purpose (platformWide), and a recording marked purged on its own workspace's row. Each answer is the database's as
 * it came; the caller says a failure in its words.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../database.types";
import { platformWide } from "../../shared/tenant-db";

type Db = SupabaseClient<Database>;

/** Recordings stored for calls started before `cutoff`, the oldest first, whichever workspace's. */
export const listRecordingsToPurge = (db: Db, cutoff: string, limit: number) =>
  platformWide(db)
    .from("calls")
    .select("id, tenant_id, recording")
    .filter("recording->>fetch_state", "eq", "stored")
    .lt("started_at", cutoff)
    .order("started_at", { ascending: true })
    .limit(limit);

/** One of the workspace's calls' recording written as purged. */
export const markRecordingPurged = (db: Db, tenantId: string, callId: string, recording: Json) =>
  db.from("calls").update({ recording }).eq("id", callId).eq("tenant_id", tenantId);

/** The agent a provider's call was answered by, whichever workspace's, or none. */
export const findAgentOfCall = (db: Db, retellCallId: string) =>
  platformWide(db).from("calls").select("agent_id").eq("retell_call_id", retellCallId).limit(1).maybeSingle();

/** Calls ended (or missed) before `grace` with a thread and no note on it, the longest waiting first, whichever workspace's. */
export const listCallsWithoutNote = (db: Db, grace: string, limit: number) =>
  platformWide(db)
    .from("calls")
    .select(
      "id, tenant_id, retell_call_id, conversation_id, contact_id, direction, status, duration_ms, in_voicemail, summary, started_at",
    )
    .in("status", ["ended", "error", "not_connected"])
    .is("message_id", null)
    .not("conversation_id", "is", null)
    // A missed call may carry no end: it is judged by when it was made.
    .or(`ended_at.lt.${grace},and(ended_at.is.null,created_at.lt.${grace})`)
    .order("ended_at", { ascending: true, nullsFirst: true })
    .limit(limit);

/** Ended calls whose recording is still to copy, unmoved since `settledBefore`, the oldest first, whichever workspace's. */
export const listRecordingsPending = (db: Db, settledBefore: string, limit: number) =>
  platformWide(db)
    .from("calls")
    .select("id, tenant_id, retell_call_id, recording, ended_at")
    .in("status", ["ended", "error"])
    .filter("recording->>fetch_state", "eq", "pending")
    .lt("updated_at", settledBefore)
    .order("updated_at", { ascending: true })
    .limit(limit);

/**
 * Calls still ongoing that nobody has heard of since `quietBefore`, or that started before `overlongBefore`, the
 * longest unheard first, whichever workspace's.
 */
export const listCallsGoneQuiet = (db: Db, quietBefore: string, overlongBefore: string, limit: number) =>
  platformWide(db)
    .from("calls")
    .select("id, tenant_id, retell_call_id, updated_at")
    .eq("status", "ongoing")
    .or(`updated_at.lt.${quietBefore},started_at.lt.${overlongBefore}`)
    .order("updated_at", { ascending: true })
    .limit(limit);
