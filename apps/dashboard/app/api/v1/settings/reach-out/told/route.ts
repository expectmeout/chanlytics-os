import { ReachOutToldQuerySchema } from "@chanlytics/contracts";
import { read, workspace } from "@/server/shared/route";
import { readerContext } from "@/server/shared/reader";
import { readReachOutTold } from "@/server/drafts/reach-out-told";

/**
 * GET /api/v1/settings/reach-out/told?kind=words|opening — What it's told on Cold email (decision 0113): a cold
 * email's writer's prompt as it would be composed for this workspace now, cut into the parts an owner can name. Nothing
 * is sent to a model. Members read; counted with the other aggregate reads, since the words' read is the drafter's whole.
 */
export const GET = read({
  scope: workspace,
  rate: "aggregate",
  query: ReachOutToldQuerySchema,
  handle: ({ ctx, member, input }) => readReachOutTold(readerContext(ctx, member), input.kind),
});
