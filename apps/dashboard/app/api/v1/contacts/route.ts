import { withRoute, memberContext } from "@/server/with-route";
import type { PersonRowDto } from "@chanlytics/contracts";

/**
 * GET /api/v1/contacts — everyone who has written to or phoned this workspace.
 *
 * One row per live person (never erased, never merged) with the facts the
 * People surface renders, computed in SQL by `people_list` under the caller's
 * own RLS. The state a person is in is NOT decided here: the view model
 * derives it from these facts, so the rule lives in one tested place.
 *
 * Pilot scale: one call, capped at 1000 rows in the function. Search and
 * paging arrive with volume.
 */
export const GET = withRoute(async (req, ctx) => {
  const { tenantId } = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  const { data, error } = await ctx.supabase.rpc("people_list", { p_tenant_id: tenantId });
  if (error) throw new Error(error.message);
  // The reply mode in force per person — their own row when set, else the
  // workspace's — so the list can say "Held for you" instead of "Answering"
  // for someone the owner asked the receptionist to stay away from.
  const { data: pols, error: polErr } = await ctx.supabase.from("policies")
    .select("subject_type, subject_id, mode").eq("tenant_id", tenantId).eq("class", "reply");
  if (polErr) console.error("people_policies_read_failed", polErr.message);
  const workspaceMode = pols?.find((p) => p.subject_type === null)?.mode ?? null;
  const personMode = new Map((pols ?? []).filter((p) => p.subject_type === "contact").map((p) => [p.subject_id, p.mode]));
  const people = ((data ?? []) as PersonRowDto[]).map((r) => ({
    ...r,
    effective_reply_mode: personMode.get(r.id) ?? workspaceMode,
  }));
  return { people };
});
