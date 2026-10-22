/**
 * A member's morning with Ask (decision 0070, 00471): the day claimed once through ask_morning_write, the thread the
 * turn runs in named on it, how many cards it left (the member's own bell line is the notices' door's), and what Today
 * reads back: the morning's thread and its newest answer, its Say and its cards. Every call runs as the member signed
 * in: the door checks the caller, RLS keeps the reads to their own rows.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../database.types";

type Db = SupabaseClient<Database>;

/** One act of the morning's door, and what it answered. */
export type AskMorningAct = { act: "claim" } | { act: "thread"; threadId: string } | { act: "answered"; cards: number };

export interface AskMorningDoor {
  /** claim: whether this call won the day. */
  claimed?: boolean;
  thread_id?: string | null;
  cards?: number | null;
  /** thread: whether the thread was named. */
  named?: boolean;
  /** answered: whether this call recorded the count (once a morning): the caller tells the member's bell when it did. */
  recorded?: boolean;
  /** The door's refusal in its own word (not_acting), when it refused. */
  refused?: string;
}

/** The morning's door (ask_morning_write), by act, for the member signed in. */
export async function askMorningWrite(
  db: Db,
  tenantId: string,
  day: string,
  a: AskMorningAct,
): Promise<AskMorningDoor> {
  const { data, error } = await db.rpc("ask_morning_write", {
    p_tenant_id: tenantId,
    p_day: day,
    p_act: a.act,
    ...(a.act === "thread" ? { p_thread_id: a.threadId } : {}),
    ...(a.act === "answered" ? { p_cards: a.cards } : {}),
  });
  if (error) throw new Error(`ask_morning_write: ${error.message}`);
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  if (typeof d.error === "string") return { refused: d.error };
  return {
    ...(typeof d.claimed === "boolean" ? { claimed: d.claimed } : {}),
    ...("thread_id" in d ? { thread_id: typeof d.thread_id === "string" ? d.thread_id : null } : {}),
    ...("cards" in d ? { cards: typeof d.cards === "number" ? d.cards : null } : {}),
    ...(typeof d.named === "boolean" ? { named: d.named } : {}),
    ...(typeof d.recorded === "boolean" ? { recorded: d.recorded } : {}),
  };
}

/** The member's morning of a day, as the row keeps it, or null where none was claimed. */
export async function askMorningOf(
  db: Db,
  tenantId: string,
  userId: string,
  day: string,
): Promise<{ thread_id: string | null; cards: number | null; made_at: string } | null> {
  const { data, error } = await db
    .from("ask_mornings")
    .select("thread_id, cards, made_at")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("day", day)
    .maybeSingle();
  if (error) throw new Error(`ask_mornings: ${error.message}`);
  return data ? { thread_id: data.thread_id ?? null, cards: data.cards ?? null, made_at: data.made_at } : null;
}

/**
 * A morning's own answer: its thread's first, its id, when it was written, its answer (v2: the Say Today shows) and its
 * cards, read by JSON path so the turn as the model was sent it (content.raw) never leaves the database. The first, so
 * a question the member asks after it in the same thread never stands in for the morning. Null where the thread holds
 * no answer yet (the turn is still running) or is not the caller's (RLS).
 */
export async function askFirstAnswer(
  db: Db,
  threadId: string,
): Promise<{ id: string; created_at: string; answer: Json | null; proposals: Json | null; failed: boolean } | null> {
  const { data, error } = await db
    .from("ask_messages")
    .select("id, created_at, answer:content->answer, proposals:content->proposals, failed:content->failed")
    .eq("thread_id", threadId)
    .eq("role", "assistant")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`ask_messages: ${error.message}`);
  if (!data) return null;
  return {
    id: data.id,
    created_at: data.created_at,
    answer: data.answer ?? null,
    proposals: data.proposals ?? null,
    failed: data.failed === true,
  };
}
