import { write, platform } from "@/server/route";
import { JobRequeueKindSchema } from "@chanlytics/contracts";
import { healthRequeueKind } from "@/server/platform/health";

/**
 * POST /api/v1/platform/jobs/requeue-kind — {kind, since, why}: every job of one kind that failed for good since a
 * moment, run again once each (decision 0089). An outage mended leaves a run of the same failure; this is Run again for
 * all of them, through the one press's own door, so a send, or a job that spoke, is still never run again from here. The
 * Admin log has who, why and how many went.
 */
export const POST = write({
  scope: platform,
  role: null,
  rate: "platform_job_requeue_kind",
  act: "job_requeue_kind",
  input: JobRequeueKindSchema,
  handle: async ({ office, input }) => healthRequeueKind(office, input.kind, input.since, input.why),
});
