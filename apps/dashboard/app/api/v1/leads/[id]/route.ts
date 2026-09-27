import { write } from "@/server/route";
import { eraseLead, leadScope } from "@/server/leads/leads";

/**
 * DELETE /api/v1/leads/:id — erase one lead, and never find it again (§0.4).
 *
 * The owner's alone, like erasing a person: an operator who may work a lead
 * must not be able to delete it. The door writes the tombstones before it
 * blanks the row — blanking takes the place, the number and the address away —
 * and the ledger row survives what it destroyed.
 */
export const DELETE = write({
  scope: leadScope,
  role: "owner",
  rate: "erase",
  handle: ({ ctx, row }) => eraseLead(ctx, row),
});
