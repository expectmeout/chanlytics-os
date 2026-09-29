import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@chanlytics/db";
import { AppError } from "@chanlytics/contracts";
import { serviceDb } from "../service-db";
import { log } from "@/server/log";

/**
 * Whether a stored object's path is this workspace's own: `<workspace id>/…`, as the edge writes every one (a message's
 * attachment `<tenant>/<conversation>/<message>.<ext>`, a call's recording `<tenant>/calls/<call>.<ext>`), with no
 * empty, `.` or `..` segment. The bucket is private and the signer holds the service role, so the path on the row is
 * the only thing that says whose the object is: a path that names another workspace is never signed, whatever wrote
 * it (00260 stops a member writing one on a message).
 */
export function inWorkspace(tenantId: string, storagePath: string): boolean {
  const parts = storagePath.split("/");
  return parts.length >= 2 && parts[0] === tenantId && parts.every((p) => p !== "" && p !== "." && p !== "..");
}

/**
 * Short-lived signed URL for a private media object (an attachment, a call recording) of this workspace. A path outside
 * it is refused as not found, never signed: the member asked for this workspace's object, and there is none.
 */
export async function signedMediaUrl(tenantId: string, storagePath: string, seconds = 300): Promise<string | null> {
  if (!inWorkspace(tenantId, storagePath)) {
    log.error("signed_media_url_refused", { tenant_id: tenantId });
    throw new AppError("not_found", "This workspace has no such attachment.");
  }
  const { data, error } = await serviceDb().storage.from("media").createSignedUrl(storagePath, seconds);
  if (error) {
    log.error("signed_media_url_failed", { error: error.message });
    return null;
  }
  return data?.signedUrl ?? null;
}

/**
 * Who opened a call's recording goes on the ledger before the recording is signed (00279 recording_opened): an
 * `open_recording` decision as the member, one per member per call per hour, since the thread's player asks again at
 * a seek. A recording is a customer's voice, and who listened is what an audit asks. A row that could not be written
 * refuses the recording rather than serve it unrecorded; a database 00279 has not reached yet serves it, and says so.
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
