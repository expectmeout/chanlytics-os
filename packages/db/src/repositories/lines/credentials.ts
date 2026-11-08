/**
 * A line's provider secrets in Vault, through their service-role doors (00066, 00555): read and written. Each answer is
 * the door's as it came; the caller says a failure in its words. Giving them back is dropLineCredentials (lines.ts).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../types";

type Db = SupabaseClient<Database>;

/** The line's provider secrets (get_line_credentials). */
export const getLineCredentials = async (db: Db, lineId: string) =>
  db.rpc("get_line_credentials", { p_line_id: lineId });

/** The line's provider secrets written (put_line_credentials). */
export const putLineCredentials = async (db: Db, lineId: string, secret: Json) =>
  db.rpc("put_line_credentials", { p_line_id: lineId, p_secret: secret });
