import { z } from "zod";
import { LEAD_PEOPLE_MAX, SPEND_LEADS } from "@chanlytics/contracts";
import { write, workspace } from "@/server/route";
import { requireUuid } from "@/server/request-guards";
import { chooseAddressee } from "@/server/leads/lead-workbench";

const Body = z.object({
  person: z
    .number()
    .int()
    .min(0)
    .max(LEAD_PEOPLE_MAX - 1),
});

/**
 * POST /api/v1/leads/:id/addressee — who a company's reach-out writes to (00430 lead_addressee_choose): one of the people
 * its source named, by their place in its facts, while nothing of a reach-out is planned or written to it. Their address
 * is checked before anything goes, a fraction of a cent, so the owner's (find) and the same billing state a search
 * needs, as Check again's.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "lead_member",
  spend: true,
  spendWords: SPEND_LEADS,
  input: Body,
  handle: ({ ctx, input }) => chooseAddressee(ctx, requireUuid(ctx.params.id, "lead"), input.person),
});
