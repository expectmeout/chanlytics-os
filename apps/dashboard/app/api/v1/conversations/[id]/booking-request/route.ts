import { z } from "zod";
import { write } from "@/server/route";
import { conversationScope } from "@/server/verbs";
import { answerRequestOf } from "@/server/calendar/booking-requests";

/**
 * POST /api/v1/conversations/:id/booking-request — { booked: boolean }
 *
 * A member answers the booking the receptionist asked for in this thread (decision 0061): Booked it books the time and
 * resolves the thread's hold, and answers with the reply it drafts for them to send; Can't cancels it and leaves the
 * thread waiting on their reply. The door decides and writes, with the decision theirs (00443 booking_request_answer).
 * An operator or above, as a visit's word is; a thread the caller cannot see is not found.
 */
export const POST = write({
  scope: conversationScope,
  role: "operator",
  rate: "thread_state",
  input: z.object({ booked: z.boolean() }).strict(),
  handle: ({ ctx, row: conv, input }) => answerRequestOf(ctx, conv.id, input.booked),
});
