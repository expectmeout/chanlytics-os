/**
 * A new sequence to leads needs a mailbox that sends (Ruben, 9 Nov 2026: sending by hand defeats the purpose). Said here
 * before the make, since the make itself marks a sequence with no connected mailbox as sent by hand (00459). One already
 * sent by hand goes on as it is until the column goes.
 */
import "server-only";
import {
  AppError,
  COLD_EMAIL_NEEDS_MAILBOX,
  DbFailure,
  NO_SENDING_BY_HAND,
  type TenantId,
} from "@chanlytics/contracts";
import { findStepRow } from "@chanlytics/db/campaigns";
import { emitEvent } from "@chanlytics/db/events";
import { listMailboxConnectionsOf } from "@chanlytics/db/email";
import { serviceDb } from "@/server/shared/service-db";
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

/** An edit can't turn a sequence that sends from a mailbox into one sent by hand. One saved that way before may stay so. */
export async function refuseTurningToHand(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: TenantId,
  rootId: string,
  ownerSends: boolean | null | undefined,
): Promise<void> {
  if (ownerSends !== true) return;
  const { data: root, error } = await findStepRow(ctx.supabase, tenantId, rootId);
  if (error) throw new DbFailure(error, "cannot read who sends a sequence");
  if (root && !root.owner_sends) throw new AppError("validation", NO_SENDING_BY_HAND);
}

/**
 * Which mailbox a workspace that can't connect would use: on the ledger with who asked, so Microsoft is built when the asks
 * justify the work, and the "We'll tell you when it's ready" the sheet says can be kept. Best effort, as an event is.
 */
export function recordProviderWanted(tenantId: TenantId, userId: string, provider: string): Promise<void> {
  return emitEvent(serviceDb(), tenantId, "mailbox_connection.provider_wanted", "workspace", tenantId, {
    provider,
    by: userId,
  });
}
