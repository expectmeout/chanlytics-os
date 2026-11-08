/**
 * A member's morning with Ask (decision 0070, 00470): the day claimed once through ask_morning_write, the thread the
 * turn runs in named on it, how many cards it left (the member's own bell line is the notices' door's), and what Today
 * reads back: the morning's thread and its newest answer, its Say and its cards. Every call runs as the member signed
 * in: the door checks the caller, RLS keeps the reads to their own rows.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../types";
import type { TenantId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;

/** One act of the morning's door, and what it answered. */
type AskMorningAct = { act: "claim" } | { act: "thread"; threadId: string } | { act: "answered"; cards: number };

interface AskMorningDoor {
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
  tenantId: TenantId,
  day: string,
  askMorningAct: AskMorningAct,
): Promise<AskMorningDoor> {
  const { data, error } = await db.rpc("ask_morning_write", {
    p_tenant_id: tenantId,
    p_day: day,
    p_act: askMorningAct.act,
    ...(askMorningAct.act === "thread" ? { p_thread_id: askMorningAct.threadId } : {}),
    ...(askMorningAct.act === "answered" ? { p_cards: askMorningAct.cards } : {}),
  });
  if (error) throw new Error(`ask_morning_write: ${error.message}`);
  const item = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  if (typeof item.error === "string") return { refused: item.error };
  return {
    ...(typeof item.claimed === "boolean" ? { claimed: item.claimed } : {}),
    ...("thread_id" in item ? { thread_id: typeof item.thread_id === "string" ? item.thread_id : null } : {}),
    ...("cards" in item ? { cards: typeof item.cards === "number" ? item.cards : null } : {}),
    ...(typeof item.named === "boolean" ? { named: item.named } : {}),
    ...(typeof item.recorded === "boolean" ? { recorded: item.recorded } : {}),
  };
}

/** The member's morning of a day, as the row keeps it, or null where none was claimed. */
export async function askMorningOf(
  db: Db,
  tenantId: TenantId,
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

/** A morning of the workspace, with the cards its first answer left. */
interface AskMorningSeen {
  user_id: string;
  day: string;
  proposals: Json | null;
}

/** How many mornings a look back reads: two weeks of a large team's. */
const MORNINGS_READ = 120;

/**
 * Every member's mornings since a day, newest first, each with its first answer's cards (decision 0087): what Ask offered
 * lately, so a morning does not offer again what a teammate has or what was set aside. A morning's own rows are its
 * member's under RLS, so this takes the service client and the caller names the workspace. A read that fails throws.
 */
export async function askMorningsSince(db: Db, tenantId: TenantId, since: string): Promise<AskMorningSeen[]> {
  const { data: mornings, error } = await db
    .from("ask_mornings")
    .select("user_id, day, thread_id")
    .eq("tenant_id", tenantId)
    .gte("day", since)
    .not("thread_id", "is", null)
    .order("day", { ascending: false })
    .limit(MORNINGS_READ);
  if (error) throw new Error(`ask_mornings: ${error.message}`);
  const threads = (mornings ?? []).flatMap((m) => (m.thread_id ? [m.thread_id] : []));
  if (threads.length === 0) return [];
  const { data: answers, error: read } = await db
    .from("ask_messages")
    .select("thread_id, proposals:content->proposals")
    .in("thread_id", threads)
    .eq("role", "assistant")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (read) throw new Error(`ask_messages: ${read.message}`);
  // The first answer of each thread: a question asked after the morning, in its thread, is not the morning.
  const first = new Map<string, Json | null>();
  for (const a of answers ?? []) if (!first.has(a.thread_id)) first.set(a.thread_id, a.proposals ?? null);
  return (mornings ?? []).map((m) => ({
    user_id: m.user_id,
    day: m.day,
    proposals: m.thread_id ? (first.get(m.thread_id) ?? null) : null,
  }));
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
