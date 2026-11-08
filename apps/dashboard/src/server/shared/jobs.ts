import "server-only";
import { scheduleJob, cancelJobsFor } from "@chanlytics/jobs";
import type { JobKind, TenantId } from "@chanlytics/contracts";
import type { Json } from "@chanlytics/db/types";
import { serviceDb } from "./service-db";

export async function schedule(
  tenantId: TenantId,
  kind: JobKind,
  dueAt: Date,
  payload: Json,
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
