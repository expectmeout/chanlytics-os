/**
 * Who is told what a job has to say.
 *
 * A job's news concerns the tenant whose job it is, so the alert is addressed
 * from that tenant's runtime rather than from a hardcoded personal mailbox --
 * fire.ts used to fall back to a literal name and address, which with a second
 * tenant would deliver one business's delivery failure, naming its customer's
 * number, to a different business's owner.
 *
 * It lives here rather than in the runner because there are two places a job
 * can fail: inside the handler, and by never coming back at all. Two copies of
 * "who may be told what" is how the bug above happens twice.
 *
 * This file decides WHO; the job decides WHAT. Every alert a job raised used
 * to leave here as `job_failed`, so a broadcast that ran to completion was
 * counted into Today's "N jobs did not finish" (00141).
 */
import { notify, type NotifyPorts } from "./notify.js";
import { loadTenantNotifications } from "./tenant-runtime.js";
import type { pg } from "./pg.js";
import type { JobNews, JobNewsKind } from "./workspace/contracts.js";

export interface AlertableJob {
  tenant_id: string;
  kind: string;
}

/**
 * What the PLATFORM operator may be told about a workspace we cannot address:
 * the fact, never the words. One line per kind, exhaustive over JobNewsKind so
 * a new kind cannot fall through to a default that calls good news a failure,
 * which is the bug 00141 fixed on the tenant's own side of this function.
 */
const REDACTED: Record<JobNewsKind, (jobKind: string) => string> = {
  job_failed: (k) => `A background job failed for a workspace (kind: ${k}).`,
  broadcast_stopped: (k) => `A broadcast did not go out for a workspace (job kind: ${k}).`,
  broadcast_sent: (k) => `A broadcast finished for a workspace (job kind: ${k}).`,
  handoff: (k) => `A reply could not be delivered for a workspace, and its thread is flagged (job kind: ${k}).`,
};

/** `ports` is notify's own, for a test that runs this seam against a database in memory. */
export function alertFor(db: ReturnType<typeof pg>, job: AlertableJob, ports: NotifyPorts = {}) {
  return async (news: JobNews): Promise<void> => {
    const addressing = db
      ? await loadTenantNotifications(db, job.tenant_id)
      : { notifications: null, isEnvDefault: false };
    await notify(
      { tenantId: job.tenant_id, ...addressing },
      { kind: news.kind, route: news.route, about: news.about ?? null, subject: news.subject, body: news.body, redactedBody: REDACTED[news.kind](job.kind) },
      ports,
    );
  };
}
