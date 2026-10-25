import { z } from "zod";
import { write, workspace } from "@/server/route";
import { makeAgent } from "@/server/receptionist/rehearsal";

/**
 * POST /api/v1/receptionist/agent — the first run's Your receptionist, going on to rehearse (decision 0073, R1): the
 * workspace's receptionist made at the voice provider before any number, so the first call in the browser starts at
 * once. Nothing is dialed, bought or charged. Whoever may change these settings may ask; answered `made: false` where the
 * provider is not there, and the owner goes on all the same.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "receptionist_call",
  input: z.object({}).strict(),
  handle: ({ ctx, member }) => makeAgent(member.tenantId, ctx.userId),
});

export const maxDuration = 30;
