/**
 * A person answers a handover a partner set up for them (decision 0016, 00214): accepting it makes them the workspace's
 * owner, declining says no. The account-scoped routes under app/api/v1/handovers declare who may and how often; the
 * verbs here are the call to the database function that checks the caller and the refusals it raises, said on the wire
 * (handover.ts).
 */
import { acceptHandover, declineHandover } from "@chanlytics/db";
import { requireUuid } from "@/server/request-guards";
import { handoverRefusal } from "@/server/workspace/handover";
import type { RouteContext } from "@/server/with-route";
import type { Params } from "@/server/route";

export async function acceptHandoverOf(
  ctx: RouteContext & { params: Params },
): Promise<{ workspace: { id: string; slug: string; name: string } }> {
  const r = await acceptHandover(ctx.supabase, requireUuid(ctx.params.id, "workspace"));
  if (!r.ok) throw handoverRefusal(r);
  return { workspace: r.value };
}

export async function declineHandoverOf(ctx: RouteContext & { params: Params }): Promise<{ declined: true }> {
  const r = await declineHandover(ctx.supabase, requireUuid(ctx.params.id, "workspace"));
  if (!r.ok) throw handoverRefusal(r);
  return { declined: true };
}
