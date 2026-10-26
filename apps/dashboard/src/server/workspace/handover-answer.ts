/**
 * A person answers a handover a partner set up for them (decision 0016, 00214): accepting it makes them the workspace's
 * owner, declining says no. The account-scoped routes under app/api/v1/handovers declare who may and how often; the
 * verbs here are the call to the database function that checks the caller and the refusals it raises, said on the wire
 * (handover.ts), and, once accepted, the owner's address on the workspace's alert list (first-alert.ts).
 */
import { acceptHandover, declineHandover } from "@chanlytics/db";
import { requireUuid } from "@/server/request-guards";
import { giveOwnerAlertAddress } from "@/server/workspace/first-alert";
import { handoverRefusal } from "@/server/workspace/handover";
import type { RouteContext } from "@/server/with-route";
import type { Params } from "@/server/route";

export async function acceptHandoverOf(
  ctx: RouteContext & { params: Params },
): Promise<{ workspace: { id: string; slug: string; name: string } }> {
  const r = await acceptHandover(ctx.supabase, requireUuid(ctx.params.id, "workspace"));
  if (!r.ok) throw handoverRefusal(r);
  // The owner hears from their own workspace, as its creator does from one they make (workspace-create.ts): their
  // address, the session's, which handover_accept has just matched to the one the workspace was handed to, goes on its
  // alert list. Beside any address the partner chose while setting it up, never in its place: the partner's may be
  // their own, and the business is the one a customer needs. Best effort: the workspace is theirs whether or not this
  // lands.
  await giveOwnerAlertAddress(ctx.supabase, r.value.id, ctx.email, ctx.userId);
  return { workspace: r.value };
}

export async function declineHandoverOf(ctx: RouteContext & { params: Params }): Promise<{ declined: true }> {
  const r = await declineHandover(ctx.supabase, requireUuid(ctx.params.id, "workspace"));
  if (!r.ok) throw handoverRefusal(r);
  return { declined: true };
}
