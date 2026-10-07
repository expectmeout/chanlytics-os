import { z } from "zod";
import { write, workspace } from "@/server/route";
import { readNoticeAgain } from "@/server/calendar/notices";

/**
 * POST /api/v1/calendar/notices/:id/read-again — {}
 *
 * A booking email held for a person, read once more (docs/plans/2026-10-07-bookings-arrive-by-email.md, refinement C):
 * one booking_read scheduled for its delivery, once however many times it is pressed. A notice that is not this
 * workspace's is not found; one already read is refused.
 */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "settings",
  input: z.object({}).strict(),
  handle: ({ ctx, member }) => readNoticeAgain(ctx, member.tenantId, String(ctx.params.id ?? "")),
});
