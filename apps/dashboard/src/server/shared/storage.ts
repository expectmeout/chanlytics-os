import "server-only";
/**
 * Storage, as the dashboard reaches it: the one place it takes the service role for the buckets. No policy on
 * storage.objects lets a session write (00161, 00407), and the media bucket is private, so a file's bytes are put, read,
 * signed and removed by the server after its route has checked the member, under the workspace's own folder (every
 * caller names a path that starts with the workspace's id, and the media signer refuses one that does not). A caller is
 * handed a bucket, never the client: nothing here reaches a table.
 */
import { WORKSPACE_LOGOS_BUCKET } from "@chanlytics/contracts";
import { signMediaUrl, signMediaUrls } from "@chanlytics/db/channels";
import { filesBucket } from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceDb } from "./service-db";

type Bucket = ReturnType<SupabaseClient<Database>["storage"]["from"]>;

/** The client storage is reached with: the service role's, the only one the buckets take a write from. */
const storageDb = () => serviceDb();

/** The buckets, one of each for each client, so a store held by a bucket (posts' material) lives as long as the client. */
const bucketsOf = new WeakMap<SupabaseClient<Database>, { files: Bucket; logos: Bucket }>();

function buckets(): { files: Bucket; logos: Bucket } {
  const db = storageDb();
  const held = bucketsOf.get(db);
  if (held) return held;
  const made = { files: filesBucket(db), logos: db.storage.from(WORKSPACE_LOGOS_BUCKET) };
  bucketsOf.set(db, made);
  return made;
}

/** The Library's bucket: a workspace's photos, videos' frames and what was made, each under its workspace's folder. */
export const filesStore = (): Bucket => buckets().files;

/** The workspace logos' bucket (00407): public to read, written by the server alone. */
export const logosStore = (): Bucket => buckets().logos;

/** A short-lived link to one private media object (an attachment, a call's recording) the caller proved is the workspace's. */
export const signStoredMedia = (path: string, seconds: number) => signMediaUrl(storageDb(), path, seconds);

/** The same for many, in one ask. */
export const signStoredMediaMany = (paths: string[], seconds: number) => signMediaUrls(storageDb(), paths, seconds);
