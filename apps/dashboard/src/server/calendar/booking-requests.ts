/**
 * A member answers the booking the receptionist asked for in a thread (decision 0061): Booked it, or Can't. The door
 * decides and writes, with the decision theirs in the same transaction (00443 booking_request_answer): Booked it books the
 * row and resolves the thread's hold; Can't cancels it and leaves the thread waiting on their reply. Booked it answers
 * with the reply it drafts from the row's own words, for the member to send: nothing goes to the customer by itself.
 */
import "server-only";
import {
  AppError,
  BOOKING_REQUEST_REFUSALS,
  BOOKING_REQUEST_WORDS,
  bookingRequestRefusalOf,
  slotLong,
  slotShort,
} from "@chanlytics/contracts";
import { answerBookingRequest, openRequestOfThread } from "@chanlytics/db";
import { dbRefusal, type RouteContext } from "@/server/with-route";
import { log } from "@/server/log";

/** What the door answered: the row as it stands, what became of the thread's hold, the decision, and the reply drafted. */
interface RequestAnswered {
  appointment: { id: string; status: string };
  hold: "resolved" | "reply" | null;
  decision_id: string;
  /** Booked it's reply for the member to send; null for Can't. */
  reply: string | null;
}

export async function answerRequestOf(
  ctx: Pick<RouteContext, "supabase" | "via">,
  conversationId: string,
  booked: boolean,
): Promise<RequestAnswered> {
  const row = await openRequestOfThread(ctx.supabase, conversationId);
  if (!row) throw new AppError("validation", BOOKING_REQUEST_REFUSALS.none);
  const startMs = Date.parse(row.starts_at);
  const { data, error } = await answerBookingRequest(ctx.supabase, {
    appointmentId: row.id,
    booked,
    via: ctx.via ?? null,
    // The line the thread's hold says once it waits on a reply, in the business's clock.
    replyWords: booked ? null : BOOKING_REQUEST_WORDS.cant(slotShort(startMs, row.timezone), row.service),
  });
  if (error) throw dbRefusal(error);
  const r = (data ?? {}) as {
    error?: string;
    appointment?: { id: string; status: string };
    hold?: "resolved" | "reply" | null;
    decision_id?: string;
  };
  if (r.error || !r.appointment) {
    // A refusal the sentences lack, or no row and no error: logged raw before the generic sentence.
    const said = bookingRequestRefusalOf(r.error);
    if (!said) log.error("booking_request_unknown_answer", { appointment: row.id, error: r.error ?? null });
    throw new AppError("validation", said ?? "Could not answer this.");
  }
  if (typeof r.decision_id !== "string")
    throw new Error("booking_request_answer: the door answered without its decision");
  return {
    appointment: r.appointment,
    hold: r.hold ?? null,
    decision_id: r.decision_id,
    reply: booked ? BOOKING_REQUEST_WORDS.booked(slotLong(startMs, row.timezone), row.service) : null,
  };
}
