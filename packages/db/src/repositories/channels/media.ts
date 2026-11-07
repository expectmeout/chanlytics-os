/**
 * The media bucket, where an attachment a message brought and a call's recording are kept (decision 0111): bytes
 * stored at a path, and paths removed. Each answer is storage's as it came; the caller says a failure in its words.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";

type Db = SupabaseClient<Database>;

/** What stored bytes may be: what the bucket's upload takes. */
type MediaBytes = Parameters<ReturnType<Db["storage"]["from"]>["upload"]>[1];

/** Bytes stored in the media bucket at `path`, over what is there (a redelivery, or a retry, stores the same). */
export const storeMedia = async (db: Db, path: string, bytes: MediaBytes, contentType: string) =>
  db.storage.from("media").upload(path, bytes, { contentType, upsert: true });

/** These paths removed from the media bucket: the objects that went come back. */
export const removeMedia = async (db: Db, paths: string[]) => db.storage.from("media").remove(paths);
