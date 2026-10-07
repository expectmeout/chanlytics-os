/**
 * A held booking notice, acted on by a person (docs/plans/2026-10-07-bookings-arrive-by-email.md, refinement C): read
 * again, or dismissed. The row is proved the workspace's on the member's client (RLS decides what a member reads);
 * the write that follows is the platform's, on the service role, since members hold no write on the ledger (00345).
 */
import "server-only";
import { AppError } from "@chanlytics/contracts";
import { scheduleJobOnce } from "@chanlytics/jobs";
import { appointmentNoticeById, dismissAppointmentNotice, mailboxOfTenant } from "@chanlytics/db";
import type { RouteContext } from "@/server/with-route";
import { serviceDb } from "@/server/service-db";

/** The held notice this workspace holds under `id`; refused when there is none, or it is not held any more. */
async function heldNotice(ctx: RouteContext, tenantId: string, id: string) {
  const notice = id ? await appointmentNoticeById(ctx.supabase, tenantId, id) : null;
  if (!notice) throw new AppError("not_found", "No such booking email here.", 404);
  if (notice.outcome !== "held") throw new AppError("conflict", "That booking email was already read.", 409);
  return notice;
}

/**
 * One more read of a held notice: the same booking_read, once per delivery (its dedupe key), so pressing twice asks
 * once. The read fetches the email from the provider again; one it no longer has is held again as gone.
 */
export async function readNoticeAgain(
  ctx: RouteContext,
  tenantId: string,
  id: string,
): Promise<{ scheduled: "scheduled" | "already_scheduled" }> {
  const notice = await heldNotice(ctx, tenantId, id);
  const mailbox = await mailboxOfTenant(ctx.supabase, tenantId);
  if (!mailbox) throw new AppError("conflict", "The workspace has no email address to read from.", 409);
  const scheduled = await scheduleJobOnce(serviceDb(), {
    tenantId,
    kind: "booking_read",
    dueAt: new Date(),
    payload: { received_id: notice.notice_id, mailbox_id: mailbox.id, tool: notice.tool },
  });
  return { scheduled };
}

/** A person let a held notice go: it stays on the ledger as dismissed, with why it was held. */
export async function dismissNotice(ctx: RouteContext, tenantId: string, id: string): Promise<{ dismissed: boolean }> {
  await heldNotice(ctx, tenantId, id);
  return { dismissed: await dismissAppointmentNotice(serviceDb(), tenantId, id) };
}
