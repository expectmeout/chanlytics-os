/**
 * A voice conversation's row (ask_voice_sessions, migration 00287): who is talking, on which thread, and the member's
 * access token sealed by the dashboard, so the brain door ElevenLabs calls, which carries no cookie, runs Ask as that
 * member under RLS (docs/superpowers/specs/2026-10-03-ask-spoken-design.md, §3.1, §3.3). The row is the member's own
 * under RLS: the voice route inserts it, the page route moves its context and the end route ends it, each on the
 * session client. The brain door and the post-call webhook read and claim it on the service role, because the member
 * is known only once the row is read; the id they hold is the sha256 of the value the browser carries, so a read of
 * the table alone opens nothing. The cipher is the dashboard's (server/ask/voice-session.ts): nothing here sees a
 * token.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
// The closed set is contracts' (ask/ask.ts VOICE_END_REASONS): the route takes it from there, the row type reads it
// from here, and 00300's CHECK holds the table to the same words.
import { VOICE_END_REASONS, type VoiceEndReason } from "@chanlytics/contracts";
import type { Database, Json } from "./database.types";

type Db = SupabaseClient<Database>;

export type { VoiceEndReason };

export interface VoiceSessionRow {
  /** The sha256, hex, of the id the browser and the vendor carry. */
  id: string;
  tenant_id: string;
  user_id: string;
  thread_id: string;
  conversation_id: string | null;
  token_cipher: string;
  token_expires_at: string;
  surface: string | null;
  scope: Json | null;
  context: Json | null;
  language: string;
  /** The turn the door is running or last ran, keyed to what was said (the claim, below). */
  turn_key: string | null;
  turn_started_at: string | null;
  duration_s: number | null;
  created_at: string;
  ended_at: string | null;
  /** The browser's word for how it ended (00300); null while it runs, or when the webhook ended it first. */
  end_reason: VoiceEndReason | null;
  /** From the tap to the connection up, and to the first audio heard, as the browser measured them (00300). */
  connect_ms: number | null;
  first_audio_ms: number | null;
}

/** What the voice route writes: the rest is the door's, the webhook's and the end's. */
export type NewVoiceSession = Pick<
  VoiceSessionRow,
  | "id"
  | "tenant_id"
  | "user_id"
  | "thread_id"
  | "conversation_id"
  | "token_cipher"
  | "token_expires_at"
  | "surface"
  | "scope"
  | "context"
  | "language"
>;

const VOICE_SESSION_COLUMNS =
  "id, tenant_id, user_id, thread_id, conversation_id, token_cipher, token_expires_at, surface, scope, context, language, turn_key, turn_started_at, duration_s, created_at, ended_at, end_reason, connect_ms, first_audio_ms";

/** What the table's row type says of the closed-set column: text, which the database's CHECK holds to the set. */
type StoredRow = Omit<VoiceSessionRow, "end_reason"> & { end_reason: string | null };

/** The row as stored, with its closed set read as the set (00300's CHECK holds it; a value outside is read as none). */
function voiceRowOf(r: StoredRow): VoiceSessionRow {
  const ended = (VOICE_END_REASONS as readonly string[]).includes(r.end_reason ?? "")
    ? (r.end_reason as VoiceEndReason)
    : null;
  return { ...r, end_reason: ended };
}

/** The row, as the member (RLS: their own, on a thread of their own in the workspace). */
export async function insertVoiceSession(db: Db, row: NewVoiceSession): Promise<void> {
  const { error } = await db.from("ask_voice_sessions").insert(row);
  if (error) throw new Error(`ask voice session: ${error.message}`);
}

/** The row by its hashed id, or null: on the service role for a provider's call, on the session client for the member's. */
export async function readVoiceSession(db: Db, id: string): Promise<VoiceSessionRow | null> {
  const { data, error } = await db.from("ask_voice_sessions").select(VOICE_SESSION_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`ask voice session: ${error.message}`);
  return data ? voiceRowOf(data) : null;
}

/** The row the vendor's post-call webhook names, by the conversation's id, or null (the service role: a provider's call). */
export async function readVoiceSessionByConversation(db: Db, conversationId: string): Promise<VoiceSessionRow | null> {
  const { data, error } = await db
    .from("ask_voice_sessions")
    .select(VOICE_SESSION_COLUMNS)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`ask voice session by conversation: ${error.message}`);
  return data ? voiceRowOf(data) : null;
}

/**
 * One turn, however many requests (the design, §3.3): the request that moves the row's key to this turn's owns the
 * turn and runs it; one that finds the key already there follows the thread instead. A key left by a turn that began
 * longer ago than `staleMs` (a door that died mid-turn) may be taken again. Service role: the member's grant on the
 * row does not include these two columns.
 */
export async function claimVoiceTurn(
  db: Db,
  id: string,
  turnKey: string,
  now: Date,
  staleMs: number,
): Promise<boolean> {
  const stale = new Date(now.getTime() - staleMs).toISOString();
  const { data, error } = await db
    .from("ask_voice_sessions")
    .update({ turn_key: turnKey, turn_started_at: now.toISOString() })
    .eq("id", id)
    .or(`turn_key.is.null,turn_key.neq.${turnKey},turn_started_at.lt.${stale}`)
    .select("id");
  if (error) throw new Error(`ask voice session claim: ${error.message}`);
  return (data ?? []).length > 0;
}

/**
 * The conversation over: by the browser (the member's own row, with how it went: the reason and its two timings,
 * 00300), or by the post-call webhook with its minutes.
 */
export async function endVoiceSession(
  db: Db,
  id: string,
  fields: {
    endedAt: string;
    durationS?: number;
    endReason?: VoiceEndReason;
    connectMs?: number | null;
    firstAudioMs?: number | null;
  },
): Promise<boolean> {
  const { data, error } = await db
    .from("ask_voice_sessions")
    .update({
      ended_at: fields.endedAt,
      ...(fields.durationS === undefined ? {} : { duration_s: fields.durationS }),
      ...(fields.endReason === undefined ? {} : { end_reason: fields.endReason }),
      ...(fields.connectMs === undefined ? {} : { connect_ms: fields.connectMs }),
      ...(fields.firstAudioMs === undefined ? {} : { first_audio_ms: fields.firstAudioMs }),
    })
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`ask voice session end: ${error.message}`);
  return (data ?? []).length > 0;
}

/** The page under the Line changed: the next spoken turn reads this one (the member's own row). */
export async function moveVoiceSessionContext(
  db: Db,
  id: string,
  fields: { context: Json | null; surface: string | null },
): Promise<boolean> {
  const { data, error } = await db
    .from("ask_voice_sessions")
    .update({ context: fields.context, surface: fields.surface })
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`ask voice session context: ${error.message}`);
  return (data ?? []).length > 0;
}
