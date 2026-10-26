import { z } from "zod";
import { SPEND_REHEARSE } from "@chanlytics/contracts";
import { write, workspace } from "@/server/route";
import { startRehearsal } from "@/server/receptionist/rehearsal";

/**
 * POST /api/v1/receptionist/rehearsals — Settings › How it answers, Rehearse (decision 0069): a call in the browser with
 * the receptionist as it stands, made at the provider, and the token the browser joins it with. Nothing is dialed and
 * nothing is sent; its minutes are free and counted (three a call; ten before the plan starts, sixty in thirty days
 * after). Whoever may change these settings may rehearse them; a workspace that may not spend is refused first, and
 * ten calls an hour a person.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "receptionist_call",
  spend: true,
  spendWords: SPEND_REHEARSE,
  input: z.object({}).strict(),
  handle: ({ ctx, member }) => startRehearsal(member.tenantId, ctx.userId),
});

export const maxDuration = 60;
