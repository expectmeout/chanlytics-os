/**
 * What Ask remembers (decision 0070, 00470): the lines of its memory, read under the member's own session and kept,
 * changed and forgotten through its one door (ask_memory_write, by act), the newest days of its journal, and recall over the member's own past
 * turns, the memory and the journal (search_ask). Every call runs as the person signed in: RLS decides what is read, and
 * the door checks the caller's permission itself; its refusals are thrown as they came, with their SQLSTATE (a line the
 * caller may not touch is P0002), for the route to answer.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AskJournalDayDto, AskMemoryLineDto, AskMemorySource } from "@chanlytics/contracts";
import type { Database } from "../../database.types";

type Db = SupabaseClient<Database>;

/** A door's answer: the line, whether it was there already, or the door's refusal in its own word. */
export type AskMemoryDoor = { id: string; text: string; again: boolean } | { refused: string };

const memorySource = (v: unknown): AskMemorySource => (v === "pane" ? "pane" : "ask");

/** The workspace's live lines, newest first, at most `limit`. */
export async function askMemoryLines(db: Db, tenantId: string, limit: number): Promise<AskMemoryLineDto[]> {
  const { data, error } = await db
    .from("ask_memory_lines")
    .select("id, text, source, made_at, updated_at, kept_by, thread_id")
    .eq("tenant_id", tenantId)
    .is("forgotten_at", null)
    .order("made_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`ask_memory_lines: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id,
    text: r.text,
    source: memorySource(r.source),
    made_at: r.made_at,
    updated_at: r.updated_at,
    kept_by: r.kept_by ?? null,
    thread_id: r.thread_id ?? null,
  }));
}

/** The journal's newest written days, newest first, at most `limit`. */
export async function askJournalDays(db: Db, tenantId: string, limit: number): Promise<AskJournalDayDto[]> {
  const { data, error } = await db
    .from("ask_journal_days")
    .select("day, text")
    .eq("tenant_id", tenantId)
    .eq("state", "written")
    .order("day", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`ask_journal_days: ${error.message}`);
  return (data ?? []).flatMap((r) => (r.text ? [{ day: r.day, text: r.text }] : []));
}

/** A door's jsonb answer, read: the line, or its refusal. */
function doorAnswer(fn: string, data: unknown): AskMemoryDoor {
  const d = (data && typeof data === "object" ? data : {}) as { memory?: unknown; again?: unknown; error?: unknown };
  if (typeof d.error === "string") return { refused: d.error };
  const m = (d.memory && typeof d.memory === "object" ? d.memory : {}) as { id?: unknown; text?: unknown };
  if (typeof m.id !== "string") throw new Error(`${fn}: answered no line`);
  return { id: m.id, text: typeof m.text === "string" ? m.text : "", again: d.again === true };
}

/** Keep a line (ask_memory_write, keep): as the person signed in, from a turn of Ask or from the pane. */
export async function keepAskMemory(
  db: Db,
  p: { tenantId: string; text: string; source: AskMemorySource; threadId: string | null },
): Promise<AskMemoryDoor> {
  const { data, error } = await db.rpc("ask_memory_write", {
    p_tenant_id: p.tenantId,
    p_act: "keep",
    p_text: p.text,
    p_source: p.source,
    ...(p.threadId ? { p_thread_id: p.threadId } : {}),
  });
  if (error) throw error;
  return doorAnswer("ask_memory_write keep", data);
}

/** Change a line's words (ask_memory_write, change): the settings permission, a line of this workspace. */
export async function changeAskMemory(
  db: Db,
  p: { tenantId: string; id: string; text: string },
): Promise<AskMemoryDoor> {
  const { data, error } = await db.rpc("ask_memory_write", {
    p_tenant_id: p.tenantId,
    p_act: "change",
    p_id: p.id,
    p_text: p.text,
  });
  if (error) throw error;
  return doorAnswer("ask_memory_write change", data);
}

/** Forget a line (ask_memory_write, forget): the settings permission, or the member who kept it. */
export async function forgetAskMemory(
  db: Db,
  p: { tenantId: string; id: string },
): Promise<{ id: string; text: string; again: boolean }> {
  const { data, error } = await db.rpc("ask_memory_write", { p_tenant_id: p.tenantId, p_act: "forget", p_id: p.id });
  if (error) throw error;
  const answer = doorAnswer("ask_memory_write forget", data);
  if ("refused" in answer) throw new Error(`ask_memory_write forget: ${answer.refused}`);
  return answer;
}

/** One thing recall found. */
export interface AskRecallRow {
  kind: "turn" | "memory" | "journal";
  /** The turn's or the line's id; null for a day of the journal. */
  id: string | null;
  thread_id: string | null;
  at: string;
  snippet: string;
}

/** What the member's own past turns, the memory and the journal say that holds the words (search_ask), newest first. */
export async function searchAsk(db: Db, tenantId: string, words: string, limit: number): Promise<AskRecallRow[]> {
  const { data, error } = await db.rpc("search_ask", { p_tenant: tenantId, p_words: words, p_limit: limit });
  if (error) throw new Error(`search_ask: ${error.message}`);
  return (data ?? []).flatMap((r) =>
    r.kind === "turn" || r.kind === "memory" || r.kind === "journal"
      ? [{ kind: r.kind, id: r.id ?? null, thread_id: r.thread_id ?? null, at: r.at, snippet: r.snippet ?? "" }]
      : [],
  );
}
