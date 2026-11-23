/**
 * A post's numbers as its place gave them (00699; the content loop PRD's 9.1): one read at each step, every number at
 * once, kept by post_observations_keep; the reads that are due, for the health sweep; and the newest of each number per
 * post, for the piece and Reports. A number a place did not give is kept with why, and read back as missing, never zero.
 * A read that fails THROWS.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DbFailure,
  heldTenantId,
  isOneOf,
  METRIC_AVAILABILITY,
  OBSERVE_STEPS,
  POST_METRICS,
  type MetricAvailability,
  type Observation,
  type ObserveStep,
  type TenantId,
} from "@chanlytics/contracts";
import { tenantDb } from "../../shared/tenant-db";
import type { Database } from "../../types";

type Db = SupabaseClient<Database>;

/** The most posts one read of numbers asks about. */
const POSTS_READ_MAX = 200;

/** One read of a post's numbers kept, every number at once (the job's door). Answers the rows written. */
export async function keepPostObservations(
  db: Db,
  read: { tenantId: TenantId; postId: string; step: ObserveStep; rows: readonly Observation[] },
): Promise<number> {
  const { data, error } = await db.rpc("post_observations_keep", {
    p_tenant_id: read.tenantId,
    p_post_id: read.postId,
    p_step: read.step,
    p_rows: read.rows.map((row) => ({ metric: row.metric, availability: row.availability, value: row.value })),
  });
  if (error) throw new DbFailure(error, "post_observations_keep");
  return typeof data === "number" ? data : 0;
}

/** A read that is due: a post up on a place, at a step whose time has come and whose numbers are not kept. */
export interface ObservationDue {
  tenantId: TenantId;
  postId: string;
  step: ObserveStep;
}

/** The reads that are due, oldest first, at most `limit` (the health sweep asks a job for each). */
export async function listObservationsDue(db: Db, limit: number): Promise<ObservationDue[]> {
  const { data, error } = await db.rpc("post_observations_due", { p_limit: limit });
  if (error) throw new DbFailure(error, "post_observations_due");
  return data.flatMap((row) =>
    isOneOf(OBSERVE_STEPS, row.step)
      ? [{ tenantId: heldTenantId(row.tenant_id), postId: row.post_id, step: row.step }]
      : [],
  );
}

/** A post's newest reading of one number: its value where it was there, when it was read, at which step. */
export interface PostNumber extends Observation {
  postId: string;
  step: ObserveStep;
  observedAt: string;
}

/** The newest reading of each number of each of these posts. Posts with no read yet are absent. */
export async function readPostNumbers(db: Db, tenantId: TenantId, postIds: readonly string[]): Promise<PostNumber[]> {
  const ids = [...new Set(postIds)].slice(0, POSTS_READ_MAX);
  if (ids.length === 0) return [];
  const { data, error } = await tenantDb(db, tenantId)
    .from("post_observations")
    .select("post_id, step, metric, availability, value, observed_at")
    .in("post_id", ids)
    .order("observed_at", { ascending: false })
    .limit(ids.length * POST_METRICS.length * OBSERVE_STEPS.length);
  if (error) throw new DbFailure(error, "post_observations");
  const newest = new Map<string, PostNumber>();
  for (const row of data) {
    const key = `${row.post_id}:${row.metric}`;
    if (newest.has(key) || !isOneOf(POST_METRICS, row.metric) || !isOneOf(OBSERVE_STEPS, row.step)) continue;
    const availability: MetricAvailability = isOneOf(METRIC_AVAILABILITY, row.availability)
      ? row.availability
      : "failed";
    newest.set(key, {
      postId: row.post_id,
      step: row.step,
      metric: row.metric,
      availability,
      value: availability === "available" && row.value !== null ? Number(row.value) : null,
      observedAt: row.observed_at,
    });
  }
  return [...newest.values()];
}
