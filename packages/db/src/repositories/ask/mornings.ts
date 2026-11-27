/**
 * A member's morning with Ask (decision 0070, 00470): the day claimed once through ask_morning_write, the thread the
 * turn runs in named on it, how many cards it left with the member's own bell line beside the count, and what Today
 * reads back: the morning's thread and its newest answer, its Say and its cards. Every call runs as the member signed
 * in: the door checks the caller, RLS keeps the reads to their own rows.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../types";
import { recordOrEmpty, type TenantId, DbFailure } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;

/**
 * One act of the morning's door, and what it answered. The answered act carries the bell's line (`bell`): where this
 * call records the count and any card waits, the door tells the member's own bell in the count's transaction (00722).
 */
type AskMorningAct =
  | { act: "claim" }
  | { act: "thread"; threadId: string }
  | { act: "answered"; cards: number; bell: { title: string; body: string } };

interface AskMorningDoor {
  /** claim: whether this call won the day. */
  claimed?: boolean;
  thread_id?: string | null;
  cards?: number | null;
  /** thread: whether the thread was named. */
  named?: boolean;
  /** answered: whether this call recorded the count (once a morning), and with it the member's bell line where any card waits. */
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
    ...(askMorningAct.act === "answered"
      ? { p_cards: askMorningAct.cards, p_bell: { title: askMorningAct.bell.title, body: askMorningAct.bell.body } }
      : {}),
  });
  if (error) throw new DbFailure(error, "ask_morning_write");
  const item = recordOrEmpty(data);
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
  if (error) throw new DbFailure(error, "ask_mornings");
  return data ? { thread_id: data.thread_id ?? null, cards: data.cards ?? null, made_at: data.made_at } : null;
}

/** A morning of the workspace: its day, whether it is the caller's, and its cards by their title, kind and outcome. */
interface AskMorningSeen {
  day: string;
  mine: boolean;
  proposals: Json | null;
}

/**
 * Every member's mornings since a day, newest first, each with its first answer's cards (decision 0087): what AI offered
 * lately, so a morning does not offer again what a teammate has or what was set aside. A morning's own rows are its
 * member's under RLS, so the team's are read through their door as the member signed in (00724 ask_mornings_seen, for a
 * member who may read the workspace), which answers each card by its title, kind and outcome, never its words. A read
 * that fails throws.
 */
export async function askMorningsSeen(db: Db, tenantId: TenantId, since: string): Promise<AskMorningSeen[]> {
  const { data, error } = await db.rpc("ask_mornings_seen", { p_tenant_id: tenantId, p_since: since });
  if (error) throw new DbFailure(error, "ask_mornings_seen");
  return data.map((m) => ({ day: m.day, mine: m.mine === true, proposals: m.proposals ?? null }));
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
  if (error) throw new DbFailure(error, "ask_messages");
  if (!data) return null;
  return {
    id: data.id,
    created_at: data.created_at,
    answer: data.answer ?? null,
    proposals: data.proposals ?? null,
    failed: data.failed === true,
  };
}
