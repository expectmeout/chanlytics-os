/**
 * A member's Ask threads and their turns (ask_threads, ask_messages), as the dashboard's Ask reads and writes them on
 * the member's own client (decision 0111): row-level security keeps each to its member. Each answer is the database's
 * as it came; the caller says a failure in its words.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../types";
import type { TenantId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;

/** What a turn is read with: its content's fields by name, never the raw turn the model was sent. */
const TURN_COLUMNS =
  "id, role, created_at, v:content->v, answer:content->answer, citations:content->citations, text:content->text, files:content->files, opened:content->opened, followups:content->followups, navigate:content->navigate, proposals:content->proposals, language:content->language, ungrounded:content->ungrounded, tools:content->tools, latency_ms:content->latency_ms, rounds:content->rounds, failed:content->failed, answering:content->answering, shape:content->shape";

/** The member's threads in the workspace, but the mornings' own of the last day (`morningsSince`), newest first. */
export const listAskThreads = async (db: Db, tenantId: TenantId, morningsSince: string, limit: number) =>
  db
    .from("ask_threads")
    .select("id, title, scope, last_at, created_at, ask_mornings(made_at)")
    .eq("tenant_id", tenantId)
    .lt("ask_mornings.made_at", morningsSince)
    .is("ask_mornings", null)
    .order("last_at", { ascending: false })
    .limit(limit);

/** One of the member's threads, with its workspace, or none. */
export const findAskThread = async (db: Db, threadId: string) =>
  db.from("ask_threads").select("id, tenant_id, title, scope, last_at, created_at").eq("id", threadId).maybeSingle();

/** A thread's newest turns, `limit` of them, newest first. */
export const listAskTurns = async (db: Db, threadId: string, limit: number) =>
  db
    .from("ask_messages")
    .select(TURN_COLUMNS)
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

/** These turns as the model was sent them (content.raw). */
export const listAskTurnsRaw = async (db: Db, turnIds: string[]) =>
  db.from("ask_messages").select("id, raw:content->raw").in("id", turnIds);

/** A thread the member begins, back as it is read. */
export const insertAskThread = async (db: Db, row: Database["public"]["Tables"]["ask_threads"]["Insert"]) =>
  db.from("ask_threads").insert(row).select("id, title, scope, last_at, created_at").single();

/** A turn added to a thread, its id and time back. */
export const insertAskTurn = async (db: Db, row: Database["public"]["Tables"]["ask_messages"]["Insert"]) =>
  db.from("ask_messages").insert(row).select("id, created_at").single();

/** A thread changed (its last time, its scope, its title). */
export const patchAskThread = async (
  db: Db,
  threadId: string,
  set: Database["public"]["Tables"]["ask_threads"]["Update"],
) => db.from("ask_threads").update(set).eq("id", threadId);

/** One of the member's turns, whole content, or none. */
export const findAskTurnContent = async (db: Db, turnId: string) =>
  db.from("ask_messages").select("id, content").eq("id", turnId).maybeSingle();

/** One of the member's turns' content written back whole, its id back: none when the turn is not the member's. */
export const saveAskTurnContent = async (db: Db, turnId: string, content: Json) =>
  db.from("ask_messages").update({ content }).eq("id", turnId).select("id");

/** One of the member's threads deleted, its id back: none when it is not the member's. */
export const deleteAskThread = async (db: Db, threadId: string) =>
  db.from("ask_threads").delete().eq("id", threadId).select("id");
