import { read, write } from "@/server/shared/route";
import { sequenceScope } from "@/server/shared/verbs";
import { AGAIN_BODY } from "@/server/campaigns/sequences/bodies";
import { findLeadChainAgain, setLeadChainAgain } from "@/server/campaigns/sequences/lead-chain";

/**
 * GET /api/v1/sequences/:id/again — whether a sequence to leads tries a business that never answered again, after how
 * many days, and who would come back and from when (decision 0120, D6), read as How it runs opens. Any member.
 * POST /api/v1/sequences/:id/again — { days }: try again after 90 to 365 days, or never (null), through the member's own
 * session (00608 reach_out_again_set, which asks that they may approve). Turned on, its words wait for an OK once more.
 * Owner or operator. Both answer what the sheet says.
 */
export const GET = read({
  scope: sequenceScope,
  rate: "aggregate",
  handle: ({ ctx, row }) => findLeadChainAgain(ctx, row),
});

export const POST = write({
  scope: sequenceScope,
  role: "operator",
  rate: "playbook",
  input: AGAIN_BODY,
  handle: ({ ctx, input, row }) => setLeadChainAgain(ctx, row, input.days),
});
