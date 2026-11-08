/**
 * What the activity page reads (decision 0111): the decisions and the events of a workspace, newest first, narrowed by
 * what the member asked, and a person's threads and calls, which narrow both to them. Read on the member's own client.
 * Each answer is the database's as it came.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";

type Db = SupabaseClient<Database>;

/** A narrowing every activity read takes: a window, a cursor it reads through, and the subjects it is about. */
interface Window {
  from?: string;
  to?: string;
  through?: string;
  subjects?: string[];
}

/** The workspace's decisions, newest first, `limit` of them: by `verbs`, by who (a kind of actor or a member), and `window`. */
export const listActivityDecisions = async (
  db: Db,
  tenantId: string,
  narrow: Window & { verbs?: string[]; actorType?: string; actorUserId?: string },
  limit: number,
) => {
  let query = db
    .from("decisions")
    .select("id, verb, subject_type, subject_id, actor_type, actor_user_id, payload, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (narrow.verbs)
    query = narrow.verbs.length === 1 ? query.eq("verb", narrow.verbs[0] ?? "") : query.in("verb", narrow.verbs);
  if (narrow.actorType) query = query.eq("actor_type", narrow.actorType);
  if (narrow.actorUserId) query = query.eq("actor_user_id", narrow.actorUserId);
  if (narrow.from) query = query.gte("created_at", narrow.from);
  if (narrow.to) query = query.lt("created_at", narrow.to);
  // lte, not lt: a row written in the same microsecond as the cursor's is still ahead of it in the order.
  if (narrow.through) query = query.lte("created_at", narrow.through);
  if (narrow.subjects) query = query.in("subject_id", narrow.subjects);
  return query;
};

/**
 * The workspace's events, newest first, `limit` of them: by `kinds`, or every kind but the noise (`noisePrefixes`,
 * `noiseKinds`); with `by`, those whose data names that member; and `window`.
 */
export const listActivityEvents = async (
  db: Db,
  tenantId: string,
  narrow: Window & {
    kinds: string[] | null;
    noisePrefixes: readonly string[];
    noiseKinds: readonly string[];
    by?: string;
  },
  limit: number,
) => {
  let items = db
    .from("events")
    .select("id, kind, category, subject_type, subject_id, data, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (narrow.kinds) {
    items = narrow.kinds.length === 1 ? items.eq("kind", narrow.kinds[0] ?? "") : items.in("kind", narrow.kinds);
  } else {
    for (const p of narrow.noisePrefixes) items = items.not("kind", "like", `${p}%`);
    for (const k of narrow.noiseKinds) items = items.neq("kind", k);
  }
  if (narrow.by) items = items.filter("data->>by", "eq", narrow.by);
  if (narrow.from) items = items.gte("created_at", narrow.from);
  if (narrow.to) items = items.lt("created_at", narrow.to);
  if (narrow.through) items = items.lte("created_at", narrow.through);
  if (narrow.subjects) items = items.in("subject_id", narrow.subjects);
  return items;
};

/** A person's threads' ids. */
export const listThreadIdsOfPerson = async (db: Db, tenantId: string, contactId: string) =>
  db.from("conversations").select("id").eq("tenant_id", tenantId).eq("contact_id", contactId);

/** A person's calls' ids. */
export const listCallIdsOfPerson = async (db: Db, tenantId: string, contactId: string) =>
  db.from("calls").select("id").eq("tenant_id", tenantId).eq("contact_id", contactId);

/** The workspace's numbers over `days` (metrics_summary). */
export const readMetricsSummary = async (db: Db, tenantId: string, days: number) =>
  db.rpc("metrics_summary", { p_tenant_id: tenantId, p_days: days });
