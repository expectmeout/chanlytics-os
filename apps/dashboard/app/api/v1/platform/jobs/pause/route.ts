import { write, platform } from "@/server/route";
import { JobKindPauseSchema } from "@chanlytics/contracts";
import { healthPauseKind } from "@/server/platform/health";

/**
 * POST /api/v1/platform/jobs/pause — {kind, paused, why}: a kind of background work paused, so no claim takes it and
 * its work waits where it is, or resumed, so what waited is due at once (decision 0089, 00506). The incident lever, said
 * on Health while it holds and in the Admin log.
 */
export const POST = write({
  scope: platform,
  role: null,
  rate: "platform_job_pause",
  act: "job_kind_pause",
  input: JobKindPauseSchema,
  handle: async ({ office, input }) => healthPauseKind(office, input.kind, input.paused, input.why),
});
