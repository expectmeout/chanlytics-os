import "server-only";
import { scheduleJob, cancelJobsFor } from "@chanlytics/jobs";
import type { JobKind } from "@chanlytics/contracts";
import type { Json } from "@chanlytics/db";
import { serviceDb } from "./service-db";

export async function schedule(
  tenantId: string,
  kind: JobKind,
  dueAt: Date,
  payload: Json,
): Promise<{ jobId: string }> {
  const { jobId } = await scheduleJob(serviceDb(), { tenantId, kind, dueAt, payload });
  return { jobId };
}

export async function cancelKindFor(
  tenantId: string,
  kind: JobKind,
  payloadKey: string,
  payloadValue: string,
): Promise<number> {
  return cancelJobsFor(serviceDb(), tenantId, kind, payloadKey, payloadValue);
}
