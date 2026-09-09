import type { PersonRowDto } from "@chanlytics/contracts";
import type { RouteContext } from "./with-route";

/**
 * Everyone who has written to or phoned a workspace, with the reply mode in
 * force for each — their own row when set, else the workspace's — so a list
 * can say "Held for you" instead of "Answering" for someone the owner asked
 * the receptionist to stay away from.
 *
 * One row per live person (never erased, never merged), computed in SQL by
 * `people_list` under the caller's own RLS. Shared by the People list and the
 * CSV export so the two never disagree about who exists.
 */
export async function listPeople(ctx: Pick<RouteContext, "supabase">, tenantId: string): Promise<PersonRowDto[]> {
  const { data, error } = await ctx.supabase.rpc("people_list", { p_tenant_id: tenantId });
  if (error) throw new Error(error.message);
  const { data: pols, error: polErr } = await ctx.supabase
    .from("policies")
    .select("subject_type, subject_id, mode")
    .eq("tenant_id", tenantId)
    .eq("class", "reply");
  if (polErr) console.error("people_policies_read_failed", polErr.message);
  const workspaceMode = pols?.find((p) => p.subject_type === null)?.mode ?? null;
  const personMode = new Map((pols ?? []).filter((p) => p.subject_type === "contact").map((p) => [p.subject_id, p.mode]));
  return ((data ?? []) as PersonRowDto[]).map((r) => ({
    ...r,
    effective_reply_mode: personMode.get(r.id) ?? workspaceMode,
  }));
}
