import { z } from "zod";
import { write, workspace } from "@/server/route";
import { edgeLines } from "@/server/connections/lines";

/** How long the carrier's records have to answer: one lookup. */
const LOOKUP_TIMEOUT_MS = 10_000;

/**
 * POST /api/v1/lines/lookup — {number}: what the number the owner keeps is, by the carrier's own records (decision 0073,
 * R11: Twilio Lookup's line type), so step 4 picks the forwarding card and the WhatsApp warning without asking. A few
 * cents a number, in the lines' search bucket. Nothing is kept; a lookup that cannot be made is none, and the page asks
 * the owner instead, as it always has.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "lines_search",
  input: z.object({ number: z.string().trim().min(7).max(32) }).strict(),
  handle: async ({ input }) => {
    const a = await edgeLines({ op: "lookup", number: input.number }, LOOKUP_TIMEOUT_MS);
    const b = a.body ?? {};
    return { lookup: a.status === 200 && b.ok === true && b.lookup ? b.lookup : null };
  },
});
