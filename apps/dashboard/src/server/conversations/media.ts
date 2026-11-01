import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { inWorkspace, type Database } from "@chanlytics/db";
import { AppError } from "@chanlytics/contracts";
import { serviceDb } from "../service-db";
import { log } from "@/server/log";

/**
 * Stored media, signed for a member (the attachments of a thread, the recordings of a call). The bucket is private and
 * the signer holds the service role, so nothing in the platform's storage is scoped by RLS here: a path is signed only
 * when it sits under the asking workspace's own id (inWorkspace, the erasure's rule for what it removes, in db's
 * erasure/legs.ts), and the recording's audit row is written on the member's own session.
 */

/** The private bucket every stored file of a workspace is kept in, under its own folder (inWorkspace). */
const mediaBucket = () => serviceDb().storage.from("media");

/**
 * Short-lived signed URL for a private media object (an attachment, a call recording) of this workspace. A path outside
 * it is refused as not found, never signed: the member asked for this workspace's object, and there is none.
 */
export async function signedMediaUrl(tenantId: string, storagePath: string, seconds = 300): Promise<string | null> {
  if (!inWorkspace(tenantId, storagePath)) {
    log.error("signed_media_url_refused", { tenant_id: tenantId });
    throw new AppError("not_found", "This workspace has no such attachment.");
  }
  const { data, error } = await mediaBucket().createSignedUrl(storagePath, seconds);
  if (error) {
    log.error("signed_media_url_failed", { error: error.message });
    return null;
  }
  return data?.signedUrl ?? null;
}

/**
 * Signed URLs for many of this workspace's stored files at once, in the order asked (the owner's copy lists every file a
 * customer sent with one: export-bundle.ts). A path outside the workspace is never signed and answers null, as one the
 * store could not sign does: one bad path must not cost the copy every other link.
 */
export async function signedMediaUrls(
  tenantId: string,
  storagePaths: readonly string[],
  seconds: number,
): Promise<(string | null)[]> {
  const own = storagePaths.filter((p) => inWorkspace(tenantId, p));
  if (own.length < storagePaths.length) log.error("signed_media_url_refused", { tenant_id: tenantId });
  if (!own.length) return storagePaths.map(() => null);
  const { data, error } = await mediaBucket().createSignedUrls(own, seconds);
  if (error) {
    log.error("signed_media_url_failed", { error: error.message });
    return storagePaths.map(() => null);
  }
  const byPath = new Map(data.map((d) => [d.path, d.error ? null : d.signedUrl]));
  return storagePaths.map((p) => byPath.get(p) ?? null);
}

/**
 * Who opened a call's recording goes on the ledger before the recording is signed (00277 recording_opened): an
 * `open_recording` decision as the member, one per member per call per hour, since the thread's player asks again at
 * a seek. A recording is a customer's voice, and who listened is what an audit asks. A row that could not be written
 * refuses the recording rather than serve it unrecorded; a database 00277 has not reached yet serves it, and says so.
 */
export async function recordingOpened(db: SupabaseClient<Database>, callId: string): Promise<void> {
  const { error } = await db.rpc("recording_opened", { p_call_id: callId });
  if (!error) return;
  if (error.code === "PGRST202") {
    log.warn("recording_audit_unavailable", { call_id: callId });
    return;
  }
  log.error("recording_audit_unavailable", { call_id: callId, code: error.code ?? null, error: error.message });
  throw new AppError("internal", "The recording could not be opened just now. Try again in a moment.", 503);
}
