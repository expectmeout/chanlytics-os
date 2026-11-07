import { z } from "zod";
import { ESCALATION_STATES } from "@chanlytics/contracts";
import { read, workspace } from "@/server/shared/route";
import { load, readerContext } from "@/server/shared/reader";
import { escalations } from "@/server/readers/escalations";

const Query = z.object({
  state: z.enum(ESCALATION_STATES).optional(),
});

/** GET /api/v1/escalations?state=open — the workspace's escalations in one state (open by default), newest first. */
export const GET = read({
  scope: workspace,
  query: Query,
  handle: async ({ ctx, member, input }) => {
    const state = input.state ?? "open";
    return (await load(readerContext(ctx, member), escalations, { state })).data;
  },
});
