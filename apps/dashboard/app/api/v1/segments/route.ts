import { AppError } from "@chanlytics/contracts";
import { withRoute, memberContext, requireRole } from "@/server/with-route";
import { jsonBody } from "@/server/request-guards";
import { takeRate } from "@/server/rate-limit";
import { cleanListName, type SavedListDto } from "@/server/lists";

/**
 * Saved lists: a name and the people on it.
 *
 * GET  /api/v1/segments — every list of ONE workspace with its members' ids.
 *      The ids, not counts: People already holds every row, so the page
 *      filters and counts client-side the way it does for the computed lists,
 *      and an erased person (gone from the rows) never counts.
 * POST /api/v1/segments — { name } makes an empty list. Owner or operator.
 *
 * Scoped explicitly by tenant, not by RLS alone (the templates route's rule):
 * a member of two workspaces must see one workspace's lists at a time.
 */
export const GET = withRoute(async (req, ctx) => {
  const { tenantId } = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  const [{ data: lists, error: lErr }, { data: members, error: mErr }] = await Promise.all([
    ctx.supabase.from("segments").select("id, name").eq("tenant_id", tenantId).order("name"),
    ctx.supabase.from("segment_members").select("segment_id, contact_id").eq("tenant_id", tenantId),
  ]);
  if (lErr) throw new Error(lErr.message);
  if (mErr) throw new Error(mErr.message);
  const byList = new Map<string, string[]>();
  for (const m of members ?? []) {
    const arr = byList.get(m.segment_id) ?? [];
    arr.push(m.contact_id);
    byList.set(m.segment_id, arr);
  }
  const out: SavedListDto[] = (lists ?? []).map((l) => ({ id: l.id, name: l.name, ids: byList.get(l.id) ?? [] }));
  return { lists: out };
});

export const POST = withRoute(async (req, ctx) => {
  const member = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  requireRole(member, "operator");
  takeRate(ctx.userId, "lists");
  const body = (await jsonBody(req)) as { name?: unknown } | null;
  const name = cleanListName(body?.name);
  const { data, error } = await ctx.supabase
    .from("segments")
    .insert({ tenant_id: member.tenantId, name, created_by: ctx.userId })
    .select("id, name")
    .single();
  if (error) {
    if (error.code === "23505") throw new AppError("conflict", "A list with that name already exists.", 409);
    throw new Error(error.message);
  }
  const made: SavedListDto = { id: data.id, name: data.name, ids: [] };
  return made;
});
