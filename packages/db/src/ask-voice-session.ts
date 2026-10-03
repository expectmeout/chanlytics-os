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
import type { Database, Json } from "./database.types";

type Db = SupabaseClient<Database>;

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
}

/** What the voice route writes: the rest is the door's and the webhook's. */
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
  "id, tenant_id, user_id, thread_id, conversation_id, token_cipher, token_expires_at, surface, scope, context, language, turn_key, turn_started_at, duration_s, created_at, ended_at";

/** The row, as the member (RLS: their own, on a thread of their own in the workspace). */
export async function insertVoiceSession(db: Db, row: NewVoiceSession): Promise<void> {
  const { error } = await db.from("ask_voice_sessions").insert(row);
  if (error) throw new Error(`ask voice session: ${error.message}`);
}

/** The row by its hashed id, or null: on the service role for a provider's call, on the session client for the member's. */
export async function readVoiceSession(db: Db, id: string): Promise<VoiceSessionRow | null> {
  const { data, error } = await db.from("ask_voice_sessions").select(VOICE_SESSION_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`ask voice session: ${error.message}`);
  return data ?? null;
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

/** The conversation over: by the browser (the member's own row), or by the post-call webhook with its minutes. */
export async function endVoiceSession(
  db: Db,
  id: string,
  fields: { endedAt: string; durationS?: number },
): Promise<boolean> {
  const { data, error } = await db
    .from("ask_voice_sessions")
    .update({ ended_at: fields.endedAt, ...(fields.durationS === undefined ? {} : { duration_s: fields.durationS }) })
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
