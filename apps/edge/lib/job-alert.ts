/**
 * Who is told when a job does not finish.
 *
 * A job failing concerns the tenant whose job it is, so the alert is addressed
 * from that tenant's runtime rather than from a hardcoded personal mailbox —
 * fire.ts used to fall back to a literal name and address, which with a second
 * tenant would deliver one business's delivery failure, naming its customer's
 * number, to a different business's owner.
 *
 * It lives here rather than in fire.ts because there are now two places a job
 * can fail: inside the handler, and by never coming back at all. Two copies of
 * "who may be told what" is how the bug above happens twice.
 */
import { notify } from "./notify.js";
import { loadTenantNotifications } from "./tenant-runtime.js";
import type { pg } from "./pg.js";

export interface AlertableJob {
  tenant_id: string;
  kind: string;
}

export function alertFor(db: ReturnType<typeof pg>, job: AlertableJob) {
  return async (subject: string, body: string): Promise<void> => {
    const addressing = db
      ? await loadTenantNotifications(db, job.tenant_id)
      : { notifications: null, isEnvDefault: false };
    await notify(
      { tenantId: job.tenant_id, ...addressing },
      { kind: "job_failed", route: "inbox", subject, body, redactedBody: `A background job failed for a workspace (kind: ${job.kind}).` },
    );
  };
}
