import { z } from "zod";
import { write } from "@/server/route";
import { appointmentScope } from "@/server/verbs";
import { markVisitOf } from "@/server/calendar/visits";

/**
 * POST /api/v1/calendar/visits/:id — { status: "kept" | "missed" | "cancelled" }
 *
 * A member says what became of a visit the record keeps (decision 0002 step 8): kept or missed once it has begun,
 * cancelled until it has ended, kept and missed correctable one into the other. The door decides and writes, with the
 * decision in the same transaction (00397 mark_visit); a move it refuses is said in its own sentence. An operator or
 * above, as the answer of 10 October 2026 says; one the caller cannot see is not found.
 */
export const POST = write({
  scope: appointmentScope,
  role: "operator",
  rate: "person_edit",
  input: z.object({ status: z.enum(["kept", "missed", "cancelled"]) }).strict(),
  handle: ({ ctx, row: appointment, input }) => markVisitOf(ctx, appointment.id, input.status),
});
