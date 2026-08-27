/**
 * Job scheduling (Blueprint P4): every deferred action is a jobs row + a
 * signed QStash callback to the CANONICAL fire URL. The jobs-row state is the
 * authoritative idempotency; QStash dedup is only a publish-retry guard.
 * Service-role territory (§8) — never called with a session client.
 */
import { Client } from "@upstash/qstash";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@chanlytics/db";
import type { JobKind } from "@chanlytics/contracts";

export const FIRE_URL = "https://chanlytics-messaging.vercel.app/api/jobs/fire";

export interface ScheduleParams {
  tenantId: string;
  kind: JobKind;
  dueAt: Date;
  payload: Json;
  qstashToken: string;
}

export async function scheduleJob(
  db: SupabaseClient<Database>,
  p: ScheduleParams,
): Promise<{ jobId: string; cancelToken: string }> {
  const { data: job, error } = await db
    .from("jobs")
    .insert({
      tenant_id: p.tenantId,
      kind: p.kind,
      due_at: p.dueAt.toISOString(),
      payload: p.payload,
    })
    .select("id, cancel_token")
    .single();
  if (error || !job) throw new Error(`schedule_job: ${error?.message}`);

  const qstash = new Client({ token: p.qstashToken });
  const res = await qstash.publishJSON({
    url: FIRE_URL,
    body: { job_id: job.id },
    notBefore: Math.ceil(p.dueAt.getTime() / 1000),
    deduplicationId: job.id,
  });
  await db.from("jobs").update({ qstash_id: res.messageId }).eq("id", job.id);
  return { jobId: job.id, cancelToken: job.cancel_token };
}

/** Cancel while still scheduled; the fire gate makes post-claim cancels no-op. */
export async function cancelJob(
  db: SupabaseClient<Database>,
  jobId: string,
  qstashToken?: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("jobs")
    .update({ state: "canceled" })
    .eq("id", jobId)
    .eq("state", "scheduled")
    .select("qstash_id")
    .maybeSingle();
  if (error || !data) return false;
  if (qstashToken && data.qstash_id) {
    try {
      await new Client({ token: qstashToken }).messages.delete(data.qstash_id);
    } catch { /* best effort — the claim gate is the real guard */ }
  }
  return true;
}

/** Cancel every scheduled job of a kind for one subject (e.g. pause_expire on hand-back). */
export async function cancelJobsFor(
  db: SupabaseClient<Database>,
  tenantId: string,
  kind: JobKind,
  payloadKey: string,
  payloadValue: string,
  qstashToken?: string,
): Promise<number> {
  const { data } = await db
    .from("jobs")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("kind", kind)
    .eq("state", "scheduled")
    .eq(`payload->>${payloadKey}`, payloadValue);
  let n = 0;
  for (const j of data ?? []) {
    if (await cancelJob(db, j.id, qstashToken)) n++;
  }
  return n;
}
