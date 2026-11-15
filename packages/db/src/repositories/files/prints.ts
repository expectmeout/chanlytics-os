/**
 * Files not yet printed (00630, decision 0134 amended): what the backfill prints, across every workspace, a page at a time. A
 * file this business made, a removed one and a video not yet playable are left out. The service role's.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DbFailure } from "@chanlytics/contracts";
import type { Database } from "../../types";

type Db = SupabaseClient<Database>;

/** A page of files with no print, after `after` (an id; null for the first), oldest id first. */
export async function listFilesUnprinted(db: Db, args: { after: string | null; limit: number }) {
  let read = db
    .from("files")
    .select("id, tenant_id, kind, mime, status, source, width, height, seconds, media_status, created_at")
    .is("picture_print", null)
    .is("removed_at", null)
    .neq("source", "made")
    .order("id", { ascending: true })
    .limit(args.limit);
  if (args.after) read = read.gt("id", args.after);
  const { data, error } = await read;
  if (error) throw new DbFailure(error, "files unprinted");
  return data.filter((f) => f.kind !== "video" || f.media_status === "ready");
}
