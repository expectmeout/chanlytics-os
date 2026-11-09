import { z } from "zod";
import { write, workspace } from "@/server/shared/route";
import { log } from "@/server/shared/log";

const Body = z.strictObject({
  provider: z.string().trim().min(1, "Say which you use.").max(60, "Keep it under 60 characters."),
});

/**
 * POST /api/v1/settings/reach-out/provider-wanted: which mailbox a workspace that can't connect would use. Only Google
 * Workspace connects today, and this counts who asks for something else (Cold email's "Tell us"), so Microsoft is finished
 * when the count justifies the work. One line of the log; nothing is stored.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "settings",
  input: Body,
  handle: ({ member, input }) => {
    log.info("cold_email_provider_wanted", { tenant_id: member.tenantId, provider: input.provider });
    return { told: true };
  },
});
