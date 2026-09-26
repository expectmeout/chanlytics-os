import { z } from "zod";
import { write, workspace } from "@/server/route";
import { addSendingDomain } from "@/server/connections/sending-domains";

const Body = z
  .object({
    host: z.string().max(253),
    from_local: z.string().max(64),
    from_name: z.string().max(200),
  })
  .strict();

/**
 * POST /api/v1/sending-domains — { host, from_local, from_name }
 *
 * An owner adds a domain the workspace sends cold email from (Reach out). The edge creates it at the cold mail
 * account and answers with the records to publish; what may be added is contracts' to say (sending-domains.ts) and
 * the door's to enforce, in its own words. The provider's id never reaches here.
 */
export const POST = write({
  scope: workspace,
  role: "owner",
  rate: "settings",
  input: Body,
  handle: async ({ ctx, member, input }) => ({
    domain: await addSendingDomain(member.tenantId, ctx.userId, {
      host: input.host,
      fromLocal: input.from_local,
      fromName: input.from_name,
    }),
  }),
});
