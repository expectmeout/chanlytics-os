import "server-only";
import { AppError } from "@chanlytics/contracts";
import { serviceDb } from "../service-db";

/**
 * Whether a stored object's path is this workspace's own: `<workspace id>/…`, as the edge writes every one (a message's
 * attachment `<tenant>/<conversation>/<message>.<ext>`, a call's recording `<tenant>/calls/<call>.<ext>`), with no
 * empty, `.` or `..` segment. The bucket is private and the signer holds the service role, so the path on the row is
 * the only thing that says whose the object is: a path that names another workspace is never signed, whatever wrote
 * it (00246 stops a member writing one on a message).
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
    console.error("signed_media_url_refused", tenantId);
    throw new AppError("not_found", "This workspace has no such attachment.");
  }
  const { data, error } = await serviceDb().storage.from("media").createSignedUrl(storagePath, seconds);
  if (error) {
    console.error("signed_media_url_failed", error.message);
    return null;
  }
  return data?.signedUrl ?? null;
}
