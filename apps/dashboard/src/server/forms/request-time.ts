import "server-only";

/**
 * The time a request asked for on a form, answered (00691; the Forms plan, F3; decision 0061): Booked it or Can't by the
 * chat's own door (calendar/booking-requests.ts answerRequestRow, 00443 booking_request_answer), with the decision the
 * member's. It holds no thread, so it is answered on the request itself, and the reply that tells the person is the
 * request's own reply, drafted for the member to send: nothing reaches them by either press. How it stands is read by
 * readers/forms.ts.
 */
import { AppError } from "@chanlytics/contracts";
import { findBookingRequest } from "@chanlytics/db/calendar";
import { listFormEntryLinks } from "@chanlytics/db/forms";
import { answerRequestRow } from "../calendar/booking-requests";
import { askedVisitOf } from "../readers/forms/forms";
import type { Member } from "../shared/route";
import type { RouteContext } from "../shared/with-route";

/**
 * Booked it or Can't for the time a request asked for (`booked`), as the chat's own request is answered: the reply
 * Booked it drafts from the visit's own words, for the member to send; none for Can't, whose reply offers other times.
 * A request that asked for no time, or whose time was answered or let go already, is refused in a sentence.
 */
export async function answerRequestTime(
  ctx: Pick<RouteContext, "supabase" | "via">,
  member: Member,
  entryId: string,
  booked: boolean,
): Promise<{ reply: string | null }> {
  const appointmentId = askedVisitOf(await listFormEntryLinks(ctx.supabase, member.tenantId, [entryId]));
  const visit = appointmentId ? await findBookingRequest(ctx.supabase, member.tenantId, appointmentId) : null;
  if (!visit) throw new AppError("validation", "This request asked for no time.");
  const answered = await answerRequestRow(
    ctx,
    { id: visit.id, starts_at: visit.startsAt, timezone: visit.timezone, service: visit.service },
    booked,
  );
  return { reply: answered.reply };
}
