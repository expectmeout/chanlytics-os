import { AppError } from "@chanlytics/contracts";
import { read } from "@/server/route";
import { callScope } from "@/server/verbs";
import { signedMediaUrl } from "@/server/service";

/**
 * GET /api/v1/calls/:id/recording — a short-lived signed URL for the copy
 * of the recording the edge stored. The call is the row (callScope): read
 * under RLS, so one the caller cannot see is a 404, and any member of the
 * workspace it lives in may listen.
 */
export const GET = read({
  scope: callScope,
  handle: async ({ row: call }) => {
    const rec = call.recording as { storage_path?: string; fetch_state?: string } | null;
    if (!rec?.storage_path || rec.fetch_state !== "stored") {
      throw new AppError("not_found", "No recording stored for this call yet.");
    }
    const url = await signedMediaUrl(rec.storage_path, 300);
    if (!url) throw new AppError("internal", "Could not prepare the recording.");
    return { url };
  },
});

export const dynamic = "force-dynamic";
