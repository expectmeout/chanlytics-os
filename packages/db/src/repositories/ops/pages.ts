/**
 * The operator pager's memory (operator_pages, one row a key): when a condition last paged and how often it fired
 * (decision 0111). Platform rows, read by key: no workspace's. Each answer is the database's as it came; the pager says
 * a failure in its words.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types";

type Db = SupabaseClient<Database>;

/** What the pager remembers of a key: when it last paged, and how often it fired. */
export const findOperatorPage = async (db: Db, key: string) =>
  db.from("operator_pages").select("alerted_at, count").eq("key", key).maybeSingle();

/** The pager's memory of a key kept, one row a key. */
export const saveOperatorPage = async (db: Db, row: Database["public"]["Tables"]["operator_pages"]["Insert"]) =>
  db.from("operator_pages").upsert(row, { onConflict: "key" });

/** A key stamped as paged at `at`. */
export const stampOperatorPage = async (db: Db, key: string, at: string) =>
  db.from("operator_pages").update({ alerted_at: at }).eq("key", key);

/** Everything the pager remembers, the latest fired first. */
export const listOperatorPages = async (db: Db) =>
  db.from("operator_pages").select("key, first_at, last_at, count, alerted_at").order("last_at", { ascending: false });

/** The pager's key for a read that stopped at PostgREST's row cap, the table after its colon (db observe.ts atCap). */
export const AT_CAP_PAGE = "db_answer_at_cap";

/**
 * A read of `table` that stopped at the row cap, noted in the pager's memory without a page of its own: its last firing
 * and how often it fired, so Health shows it under what paged us and the health sweep pages it (layer 12). Either app
 * notes it, from inside the request that read; only the edge can send a page.
 */
export async function noteAnswerAtCap(db: Db, table: string, at: string) {
  return noteForThePager(db, `${AT_CAP_PAGE}:${table}`, at);
}

/** The pager's key for a door that refuses signed knocks, the door's path after its colon (the edge's door()). */
export const DOOR_REFUSING_PAGE = "door_refuses";

/**
 * A door that refused three signed knocks in a row with none let in (the edge's door(), lane 8 of the "prove it works"
 * plan), noted in the pager's memory as a read at the cap is: Health shows it, the health sweep pages it. The edge's
 * logger cannot page itself (the pager logs through it).
 */
export async function noteDoorRefusing(db: Db, door: string, at: string) {
  return noteForThePager(db, `${DOOR_REFUSING_PAGE}:${door}`, at);
}

/** A condition fired, noted under its key without a page of its own: its last firing, and how often it fired. */
async function noteForThePager(db: Db, key: string, at: string) {
  const { data, error } = await findOperatorPage(db, key);
  if (error) return { error };
  return saveOperatorPage(db, { key, last_at: at, count: (data?.count ?? 0) + 1 });
}
