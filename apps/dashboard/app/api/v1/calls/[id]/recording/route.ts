import { AppError } from "@chanlytics/contracts";
import { read } from "@/server/route";
import { callScope } from "@/server/verbs";
import { signedMediaUrl } from "@/server/conversations/media";

/**
 * GET /api/v1/calls/:id/recording — a redirect to a short-lived signed URL for
 * the copy of the recording the edge stored, as a message's attachment is
 * served (messages/[id]/media). The thread's <audio> points straight at this
 * address, so every request it makes -- a seek into audio not loaded yet, a
 * play after a long pause -- is signed afresh: it was JSON holding one link,
 * and a seek five minutes into a listen asked a link that had expired.
 *
 * The call is the row (callScope): read under RLS, so one the caller cannot
 * see is a 404, and any member of the workspace it lives in may listen. A
 * redirect built by hand, because Response.redirect()'s headers are immutable
 * and the wrapper stamps its own.
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
    return new Response(null, { status: 302, headers: { location: url } });
  },
});

export const dynamic = "force-dynamic";
