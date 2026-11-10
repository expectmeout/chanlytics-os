/**
 * A sequence to leads needs a mailbox that sends (Ruben, 9 Nov 2026: sending by hand defeats the purpose): to be made, and
 * to be started or turned back on. Said here before the make, in its words; the make refuses the same (00585). One
 * already sent by hand goes on as it is until the column goes, but is not turned back on without a mailbox.
 */
import "server-only";
import {
  AppError,
  COLD_EMAIL_NEEDS_MAILBOX,
  coldEmailCannotSendWhy,
  DbFailure,
  NO_SENDING_BY_HAND,
  type TenantId,
} from "@chanlytics/contracts";
import { findStepRow } from "@chanlytics/db/campaigns";
import { recordEvent } from "@chanlytics/db/events";
import { listMailboxConnectionsOf } from "@chanlytics/db/email";
import { serviceDb } from "@/server/shared/service-db";
import type { RouteContext } from "@/server/shared/with-route";

/**
 * Refused whenever no connected mailbox can send, as the make reads it: the words say which it is (contracts
 * coldEmailCannotSendWhy), and none at all carries `needs: "mailbox"`, which New takes its mailbox off for.
 */
export async function refuseWhenNoMailboxSends(ctx: Pick<RouteContext, "supabase">, tenantId: TenantId): Promise<void> {
  const reason = coldEmailCannotSendWhy(await listMailboxConnectionsOf(ctx.supabase, tenantId));
  if (!reason) return;
  throw reason === COLD_EMAIL_NEEDS_MAILBOX
    ? new AppError("validation", reason, undefined, { needs: "mailbox" })
    : new AppError("validation", reason);
}

/** A new sequence to leads: never sent by hand, and never made with no mailbox that sends. */
export async function refuseWithoutMailbox(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: TenantId,
  ownerSends: boolean | null | undefined,
): Promise<void> {
  if (ownerSends === true) throw new AppError("validation", NO_SENDING_BY_HAND);
  await refuseWhenNoMailboxSends(ctx, tenantId);
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
 * justify the work, and the "We'll tell you when it's ready" the sheet says can be kept. The ask is the whole write, so
 * one the ledger did not keep fails, and the sheet never says told for nothing.
 */
export async function recordProviderWanted(tenantId: TenantId, userId: string, provider: string): Promise<void> {
  const { error } = await recordEvent(
    serviceDb(),
    tenantId,
    "mailbox_connection.provider_wanted",
    "workspace",
    tenantId,
    {
      provider,
      by: userId,
    },
  );
  if (error) throw new DbFailure({ message: error }, "cannot keep which mailbox they use");
}
