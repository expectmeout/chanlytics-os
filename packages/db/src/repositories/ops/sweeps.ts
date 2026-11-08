/**
 * What the sweeps' doors ask of the database (decision 0111): the key a cron knock carries, and a sweep's backlog
 * noted. Platform doors, of no workspace. Each answer is the database's as it came.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types";

type Db = SupabaseClient<Database>;

/** The key a cron's knock must carry (get_cron_sweep_key). */
export const getCronSweepKey = async (db: Db) => db.rpc("get_cron_sweep_key");

/** What a sweep left for its next tick, noted (note_sweep_backlog). */
export const noteSweepBacklog = async (db: Db, sweep: string, remaining: number) =>
  db.rpc("note_sweep_backlog", { p_sweep: sweep, p_remaining: remaining });
