import { z } from "zod";
import { WORKSPACE_MARKS } from "@chanlytics/contracts";
import { write, workspace } from "@/server/shared/route";
import { saveSetupChoices } from "@/server/setup/setup";

const Body = z
  .object({
    /** The number's choice (contracts SetupPhoneWant), or null to take it away; absent keeps it. */
    phone: z.record(z.string(), z.unknown()).nullable().optional(),
    whatsapp: z.enum(["same", "own", "later"]).optional(),
    marks: z.array(z.enum(WORKSPACE_MARKS)).max(WORKSPACE_MARKS.length).optional(),
    /** The version the tab read, to refuse a write over a choice another tab made. */
    version: z.number().int().min(0).optional(),
  })
  .strict();

/**
 * PUT /api/v1/setup/choices — what the first run chose for the workspace (decision 0091): the number and how calls
 * reach it, where WhatsApp answers, and the marks that say a step was done. Kept on the workspace (setup_choice_set,
 * 00513), so every member and the back office stand at the same step, and the edge buys the number the choice names
 * once the plan starts. Whoever may set the workspace up: its owner, and the partner who brought it.
 */
export const PUT = write({
  scope: workspace,
  role: "partner",
  rate: "settings",
  input: Body,
  handle: ({ ctx, member, input }) => saveSetupChoices(ctx, member.tenantId, input),
});
