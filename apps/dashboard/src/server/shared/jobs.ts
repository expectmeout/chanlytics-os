import "server-only";
import { scheduleJob, cancelJobsFor } from "@chanlytics/jobs";
import type { JobKind, JobPayload, TenantId } from "@chanlytics/contracts";
import { serviceDb } from "./service-db";

export async function schedule<K extends JobKind>(
  tenantId: TenantId,
  kind: K,
  dueAt: Date,
  payload: JobPayload<K>,
): Promise<{ jobId: string }> {
  const { jobId } = await scheduleJob(serviceDb(), { tenantId, kind, dueAt, payload });
  return { jobId };
}

export async function cancelKindFor(
  tenantId: TenantId,
  kind: JobKind,
  payloadKey: string,
  payloadValue: string,
): Promise<number> {
  return cancelJobsFor(serviceDb(), tenantId, kind, payloadKey, payloadValue);
}
