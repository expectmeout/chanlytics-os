/**
 * A workspace's calls as the member's pages and exports read them (decision 0111): one call, a list narrowed by its
 * thread, its state, its ids or the words said, every call a page at a time, and the last call that came in. Read on
 * the member's own client, each naming the workspace. Each answer is the database's as it came.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";

type Db = SupabaseClient<Database>;

/** What a call is read with: the dashboard maps it (toCallDto), and the recording's URL never leaves the server. */
export const CALL_COLUMNS =
  "id, retell_call_id, direction, call_type, status, from_e164, from_raw, to_e164, started_at, ended_at, duration_ms, disconnection_reason, sentiment, call_successful, in_voicemail, summary, wanted, outcome, follow_up, caller_name, analysis, transcript_object, recording, conversation_id, contact_id, message_id, updated_at, contacts (display_name, wa_profile_name, phone_e164, consent, dnc, erasing_since)";

/** One of the workspace's calls, or none. */
export const findCallRow = async (db: Db, tenantId: string, callId: string) =>
  db.from("calls").select(CALL_COLUMNS).eq("tenant_id", tenantId).eq("id", callId).maybeSingle();

/**
 * The workspace's newest calls, `limit` of them, narrowed by any of: the thread they are on, their state, their ids,
 * and a pattern their transcript matches.
 */
export const listCallRows = async (
  db: Db,
  tenantId: string,
  narrow: { conversationId?: string; status?: string; ids?: string[]; transcriptLike?: string },
  limit: number,
) => {
  let query = db
    .from("calls")
    .select(CALL_COLUMNS)
    .eq("tenant_id", tenantId)
    .order("started_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (narrow.conversationId) query = query.eq("conversation_id", narrow.conversationId);
  if (narrow.status) query = query.eq("status", narrow.status);
  if (narrow.ids) query = query.in("id", narrow.ids);
  if (narrow.transcriptLike) query = query.ilike("transcript", narrow.transcriptLike);
  return query;
};

/** One page (`from` to `to`) of the workspace's calls, or one person's, oldest first. */
export const pageCallRows = async (
  db: Db,
  tenantId: string,
  contactId: string | undefined,
  from: number,
  to: number,
) => {
  const all = db.from("calls").select(CALL_COLUMNS).eq("tenant_id", tenantId);
  return (contactId ? all.eq("contact_id", contactId) : all)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .range(from, to);
};

/** When the workspace's newest inbound call started, or none. */
export const findLastCallIn = async (db: Db, tenantId: string) =>
  db
    .from("calls")
    .select("started_at")
    .eq("tenant_id", tenantId)
    .eq("direction", "inbound")
    .order("started_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

/** When the workspace's newest inbound call that connected started, or none: a dial that never connected tests nothing. */
export const findLastConnectedCallIn = async (db: Db, tenantId: string) =>
  db
    .from("calls")
    .select("started_at")
    .eq("tenant_id", tenantId)
    .eq("direction", "inbound")
    .neq("status", "not_connected")
    .order("started_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
