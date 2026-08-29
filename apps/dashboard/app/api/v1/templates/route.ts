import { withRoute, memberContext } from "@/server/with-route";

/**
 * GET /api/v1/templates — ONE workspace's approved templates.
 *
 * Scoped explicitly, not by RLS alone. RLS answers "may this caller see this
 * row", and for someone who belongs to two workspaces the answer is yes to
 * both — so this list would have offered another business's templates in the
 * composer, and a send picked from it would have failed the reply route's own
 * tenant check with a confusing "not found".
 *
 * Approved only: Meta rejects anything else at the wire, so offering a pending
 * template is offering a send that cannot happen.
 */
export const GET = withRoute(async (req, ctx) => {
  const { tenantId } = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  const { data, error } = await ctx.supabase
    .from("templates")
    .select("id, channel, name, language, body_preview, variables")
    .eq("tenant_id", tenantId)
    .eq("meta_status", "approved")
    .order("name");
  if (error) throw new Error(error.message);
  return { templates: data ?? [] };
});
