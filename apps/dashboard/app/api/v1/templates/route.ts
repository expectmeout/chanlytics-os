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
 * Approved only by default: Meta rejects anything else at the wire, so
 * offering a pending template is offering a send that cannot happen.
 * `?all=1` is for Settings, which shows every template with its status so
 * the owner can see what is in review, rejected or paused. Both carry the
 * category, because a marketing template may only go to people who said yes.
 */
export const GET = withRoute(async (req, ctx) => {
  const url = new URL(req.url);
  const { tenantId } = await memberContext(ctx, url.searchParams.get("workspace"));
  const all = url.searchParams.get("all") === "1";
  let q = ctx.supabase
    .from("templates")
    .select("id, channel, name, language, body_preview, variables, category, meta_status, quality, rejected_reason, synced_at")
    .eq("tenant_id", tenantId);
  if (!all) q = q.eq("meta_status", "approved");
  const { data, error } = await q.order("name");
  if (error) throw new Error(error.message);
  return { templates: data ?? [] };
});
