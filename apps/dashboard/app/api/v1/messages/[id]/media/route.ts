import { AppError } from "@chanlytics/contracts";
import { withRoute, memberContext } from "@/server/with-route";
import { requireUuid } from "@/server/request-guards";
import { signedMediaUrl } from "@/server/service";

/**
 * GET /api/v1/messages/:id/media — the attachment a customer sent, served.
 *
 * The bytes sit in a private bucket and the row carries only their path; the
 * thread showed "[image attachment]" and nothing could be opened. This
 * answers with a redirect to a five-minute signed URL, so an <img>, <audio>
 * or <video> in the thread can point straight at the route. Membership is
 * checked here and the row is read under the caller's RLS; the signing
 * itself needs the service role, which never leaves the server.
 */
export const GET = withRoute(async (req, ctx) => {
  const id = requireUuid(ctx.params.id, "message");
  const member = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));

  const { data, error } = await ctx.supabase
    .from("messages")
    .select("id, media")
    .eq("id", id)
    .eq("tenant_id", member.tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new AppError("not_found", "Message not found.");

  const media = data.media as { storage_path?: string; fetch_state?: string } | null;
  if (!media?.storage_path || media.fetch_state !== "stored") {
    throw new AppError("not_found", "This message has no stored attachment.");
  }
  const url = await signedMediaUrl(media.storage_path, 300);
  if (!url) throw new Error("could not sign the attachment");
  // A plain Response, not Response.redirect(): that one's headers are
  // immutable and the wrapper still has to stamp the no-store rule on it.
  return new Response(null, { status: 302, headers: { location: url } });
});
