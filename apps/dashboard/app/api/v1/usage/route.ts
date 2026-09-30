import { z } from "zod";
import { read, workspace } from "@/server/route";
import { load, readerContext } from "@/server/readers";
import { usage } from "@/server/readers/metrics";

const Query = z.object({
  /** YYYY-MM; this month by default. */
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
});

/**
 * GET /api/v1/usage?month=2026-09 — the workspace's metered use for a month, for its owner: every model call the
 * platform made for it (Ask, the drafts, the receptionist's answers, the reads) with its tokens and list-price dollars,
 * each phone call's seconds and each WhatsApp conversation opened (the usage ledger, 00276). Owners only: it is what
 * the workspace costs.
 */
export const GET = read({
  scope: workspace,
  role: "owner",
  rate: "aggregate",
  query: Query,
  handle: async ({ ctx, member, input }) => {
    const month = input.month ?? new Date().toISOString().slice(0, 7);
    return (await load(readerContext(ctx, member), usage, { month })).data;
  },
});
