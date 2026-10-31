import { z } from "zod";
import { write, workspace } from "@/server/route";
import { mailboxHistory } from "@/server/connections/mailbox-connections";

const Body = z.object({ act: z.enum(["stop", "resume", "bring"]) }).strict();

/**
 * POST /api/v1/mailbox-connections/:id/history — { act: "stop" | "resume" | "bring" }
 *
 * The owner's say over what a mailbox brings in (decision 0086), from its row in Connections: Stop what is still coming
 * in, where it stands (what came is kept); Resume it, or Try again after it failed, from where it stopped; or, for a
 * mailbox connected from now on, bring in its last six months. The edge judges each, and answers the mailbox's row.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "settings",
  input: Body,
  handle: async ({ ctx, member, input }) => ({
    mailbox: await mailboxHistory(member.tenantId, ctx.userId, String(ctx.params.id ?? ""), input.act),
  }),
});
