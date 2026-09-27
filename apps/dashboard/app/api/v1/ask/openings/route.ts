import { z } from "zod";
import { read, workspace } from "@/server/route";
import { load, readerContext } from "@/server/readers";
import { openings } from "@/server/readers/openings";

const Query = z.object({
  day: z.string().optional(),
  service: z.string().optional(),
});

/**
 * GET /api/v1/ask/openings?day=&service= — open times, no model.
 *
 * The palette's fast path for "what's open Saturday": the same computation
 * the phone receptionist's availability tool runs, answered from the
 * connected calendar in the business's own zone. Counted with the other
 * aggregate reads. The body is its reader's (readers/openings.ts), which
 * Ask's calendar.openings reads too.
 */
export const GET = read({
  scope: workspace,
  rate: "aggregate",
  query: Query,
  handle: async ({ ctx, member, input }) => {
    const day = (input.day ?? "").trim().slice(0, 20) || null;
    const service = (input.service ?? "").trim().slice(0, 160) || null;
    return (await load(readerContext(ctx, member), openings, { day, service })).data;
  },
});
