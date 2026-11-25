import "server-only";
/**
 * The jobs ledger, as the dashboard writes it: what happens later (a send, a read again), put on `jobs`, which no
 * session may write. The one place the dashboard's routes take the service role for a job, after the route has proved
 * the workspace and the member; a call site names its kind and never holds the service-role client itself.
 */
import { scheduleJob, scheduleJobOnce, cancelJobsFor } from "@chanlytics/jobs";
import type { JobKind, JobPayload, TenantId } from "@chanlytics/contracts";
import { serviceDb } from "../service-db";

/** The ledger's client: the service role's, the only one `jobs` takes a write from. */
const ledgerDb = () => serviceDb();

export async function schedule<K extends JobKind>(
  tenantId: TenantId,
  kind: K,
  dueAt: Date,
  payload: JobPayload<K>,
): Promise<{ jobId: string }> {
  const { jobId } = await scheduleJob(ledgerDb(), { tenantId, kind, dueAt, payload });
  return { jobId };
}

/** A kind the ledger holds at most one of per subject: a second ask for it is answered as already there. */
export async function scheduleOnce<K extends JobKind>(
  tenantId: TenantId,
  kind: K,
  dueAt: Date,
  payload: JobPayload<K>,
): Promise<"scheduled" | "already_scheduled"> {
  return scheduleJobOnce(ledgerDb(), { tenantId, kind, dueAt, payload });
}

export async function cancelKindFor(
  tenantId: TenantId,
  kind: JobKind,
  payloadKey: string,
  payloadValue: string,
): Promise<number> {
  return cancelJobsFor(ledgerDb(), tenantId, kind, payloadKey, payloadValue);
}
