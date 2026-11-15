import { z } from "zod";
import { LEAD_NAMED } from "@chanlytics/contracts";
import { write, workspace } from "@/server/shared/route";
import { requireUuid } from "@/server/shared/request-guards";
import { nameLeadFor } from "@/server/leads/named";

const Body = z
  .object({
    business_name: z.string().trim().min(LEAD_NAMED.name.min).max(LEAD_NAMED.name.max).optional(),
    city: z.string().trim().min(1).max(LEAD_NAMED.city.max).optional(),
  })
  .refine((body) => body.business_name !== undefined || body.city !== undefined, {
    message: "Give a name, a city, or both.",
  });

/**
 * POST /api/v1/leads/:id/name — a lead's name, its city, or both, put right by its owner (00631 lead_named): written as
 * typed, so every email to them says it from then on, an email of theirs still waiting has its line written again, and
 * their preview takes the name. The owner's (find), as who a company's sequence writes to is; it spends nothing.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "lead_member",
  input: Body,
  handle: ({ ctx, member, input }) => nameLeadFor(ctx, member.tenantId, requireUuid(ctx.params.id, "lead"), input),
});
