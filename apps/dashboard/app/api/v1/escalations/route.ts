import { z } from "zod";
import { read, workspace } from "@/server/route";
import { load, readerContext } from "@/server/readers";
import { escalations } from "@/server/readers/escalations";

const Query = z.object({
  state: z.string().optional(),
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
