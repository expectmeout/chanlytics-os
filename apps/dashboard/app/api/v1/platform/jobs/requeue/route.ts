import { write, platform } from "@/server/route";
import { requireUuid } from "@/server/request-guards";
import { platformJobRequeue } from "@/server/platform/platform";

/**
 * POST /api/v1/platform/jobs/requeue — run a failed job of another workspace again.
 *
 * The ledger's dead letters: a job that failed for good (its last try threw, or its kind was unknown for a day) is a
 * row in `failed`, kept ninety days with its error. When the cause is fixed -- a provider's outage over, a key
 * replaced -- support runs it again from here: a fresh row of the same kind and payload, due now, with who asked
 * recorded first. A send to a person is refused (it may have gone); the answer says where it is sent again instead.
 *
 * On the platform scope, with a support ceiling of its own: this is worked down a list of failures after an outage.
 */
export const POST = write({
  scope: platform,
  role: null,
  rate: "platform_job_requeue",
  handle: async ({ ctx, req, office }) => {
    const body = (await req.json().catch(() => ({}))) as { tenant_id?: unknown; job_id?: unknown };
    const tenantId = requireUuid(body.tenant_id, "workspace");
    const jobId = requireUuid(body.job_id, "job");
    return platformJobRequeue(office, ctx, tenantId, jobId);
  },
});
