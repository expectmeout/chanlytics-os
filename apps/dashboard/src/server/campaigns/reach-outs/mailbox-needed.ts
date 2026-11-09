/**
 * A new sequence to leads needs a mailbox that sends (Ruben, 9 Nov 2026: sending by hand defeats the purpose). Said here
 * before the make, since the make itself marks a sequence with no connected mailbox as sent by hand (00459). One already
 * sent by hand goes on as it is until the column goes.
 */
import "server-only";
import { AppError, COLD_EMAIL_NEEDS_MAILBOX, NO_SENDING_BY_HAND, type TenantId } from "@chanlytics/contracts";
import { listMailboxConnectionsOf } from "@chanlytics/db/email";
import type { RouteContext } from "@/server/shared/with-route";

export async function refuseWithoutMailbox(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: TenantId,
  ownerSends: boolean | null | undefined,
): Promise<void> {
  if (ownerSends === true) throw new AppError("validation", NO_SENDING_BY_HAND);
  const mailboxes = await listMailboxConnectionsOf(ctx.supabase, tenantId);
  if (!mailboxes.some((m) => m.state === "connected")) throw new AppError("validation", COLD_EMAIL_NEEDS_MAILBOX);
}
