import { z } from "zod";
import { TODAY_PINS_MAX } from "@chanlytics/contracts";
import { read, workspace } from "@/server/route";
import { load, readerContext } from "@/server/readers";
import { listCounts } from "@/server/readers/audience-pool";

const Query = z.object({
  /** The lists' tokens, comma-separated, as Today's pins keep them (contracts pinTokens): eight at most. */
  lists: z.string().max(800),
});

/**
 * GET /api/v1/people/list-counts?lists=… — each list's count, by its token, for the member asking (the wiring's second audit,
 * R10): Today's pinned lists, which drew People's last count and stood still while a customer wrote, a hold opened or
 * someone new got in touch. The body is its reader's (readers/audience-pool.ts listCounts). A read of everyone in People on the
 * server, so it is held to the aggregates' rate.
 */
export const GET = read({
  scope: workspace,
  rate: "aggregate",
  query: Query,
  handle: async ({ ctx, member, input }) => {
    const tokens = [
      ...new Set(
        (input?.lists ?? "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      ),
    ].slice(0, TODAY_PINS_MAX);
    return (await load(readerContext(ctx, member), listCounts, { tokens })).data;
  },
});
