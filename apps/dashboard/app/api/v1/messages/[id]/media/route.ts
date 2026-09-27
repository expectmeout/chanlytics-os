import { AppError } from "@chanlytics/contracts";
import { read, workspace } from "@/server/route";
import { requireUuid } from "@/server/request-guards";
import { signedMediaUrl } from "@/server/conversations/media";

/**
 * GET /api/v1/messages/:id/media — a redirect to a short-lived signed URL
 * for a stored attachment. A member of the named workspace; only an
 * attachment the edge has actually stored; a redirect built by hand, because
 * Response.redirect()'s headers are immutable and the wrapper stamps its own.
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => {
    const id = requireUuid(ctx.params.id, "message");
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
    return new Response(null, { status: 302, headers: { location: url } });
  },
});
