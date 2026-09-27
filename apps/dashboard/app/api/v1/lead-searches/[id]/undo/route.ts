import { write } from "@/server/route";
import { leadSearchScope, undoSearch } from "@/server/leads/leads";

/**
 * POST /api/v1/lead-searches/:id/undo — the Done strip's Undo (PRD §8.6).
 *
 * Not the same act as `POST lead-operations/:id/undo`, which takes back one
 * recorded operation: this takes back a FINISHED ROUND's untouched leads and
 * gives the month's allowance back with them. The owner's, because it moves
 * what a month is allowed to find; the door refuses a round still running, one
 * finished over a day ago, and a search already removed.
 */
export const POST = write({
  scope: leadSearchScope,
  role: "partner",
  rate: "lead_member",
  handle: ({ ctx, row }) => undoSearch(ctx, row),
});
