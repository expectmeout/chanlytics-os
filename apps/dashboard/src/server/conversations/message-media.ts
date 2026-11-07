/**
 * A redirect to a short-lived signed URL for a message's stored attachment (GET /api/v1/messages/:id/media): a member
 * of the named workspace, and only an attachment the edge has actually stored; the redirect is built by hand, because
 * Response.redirect()'s headers are immutable and the route's wrapper stamps its own. Signing is media.ts's. The route
 * declares who may.
 */
import { AppError } from "@chanlytics/contracts";
import { requireUuid } from "@/server/shared/request-guards";
import { findSignedMediaUrl } from "@/server/conversations/media";
import type { RouteContext } from "@/server/shared/with-route";
import type { Member, Params } from "@/server/shared/route";
import { findMessageMediaRow } from "@chanlytics/db/conversations";

export async function findMessageMedia(ctx: RouteContext & { params: Params }, member: Member) {
  const id = requireUuid(ctx.params.id, "message");
  const { data, error } = await findMessageMediaRow(ctx.supabase, member.tenantId, id);
  if (error) throw new Error(error.message);
  if (!data) throw new AppError("not_found", "Message not found.");
  const media = data.media as { storage_path?: string; fetch_state?: string } | null;
  if (!media?.storage_path || media.fetch_state !== "stored") {
    throw new AppError("not_found", "This message has no stored attachment.");
  }
  const url = await findSignedMediaUrl(member.tenantId, media.storage_path, 300);
  if (!url) throw new Error("could not sign the attachment");
  return new Response(null, { status: 302, headers: { location: url } });
}
