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
