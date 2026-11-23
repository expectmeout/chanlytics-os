/**
 * What an owner claims and what their posts are for (00702; the content loop PRD's 5.3): a claim kept or withdrawn and
 * the goals kept as a set (doors on the member's own session, which ask the settings permission themselves), and the
 * claims and goals read, by the member's session or the service role. A file's moments (10.3) are kept here too.
 */
import {
  CONTENT_GOALS,
  DAY_MS,
  DbFailure,
  isOneOf,
  listOrEmpty,
  nonBlankOrNull,
  ownerClaimOf,
  recordOrEmpty,
  type ClaimKind,
  type ClaimSource,
  type ContentGoal,
  type OwnerClaim,
  type TenantId,
} from "@chanlytics/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types";

type Db = SupabaseClient<Database>;

/** A claim kept (owner_claims_keep), as the member: what it is, its words, where it was said, its last day. */
export async function keepClaim(
  db: Db,
  tenantId: TenantId,
  claim: { kind: ClaimKind; text: string; source: ClaimSource; valid_until: string | null },
): Promise<OwnerClaim | null> {
  const { data, error } = await db.rpc("owner_claims_keep", { p_tenant_id: tenantId, p_claim: claim });
  if (error) throw new DbFailure(error, "owner claims keep");
  return ownerClaimOf(data);
}

/** A claim withdrawn (owner_claim_withdraw), as the member. Whether one standing was. */
export async function withdrawClaim(db: Db, tenantId: TenantId, claimId: string): Promise<boolean> {
  const { data, error } = await db.rpc("owner_claim_withdraw", { p_tenant_id: tenantId, p_claim_id: claimId });
  if (error) throw new DbFailure(error, "owner claim withdraw");
  return data === true;
}

/** A workspace's claims not withdrawn, newest first, and those withdrawn in the last 30 days, which a page still says. */
export async function listClaims(db: Db, tenantId: TenantId): Promise<OwnerClaim[]> {
  const { data, error } = await db
    .from("owner_claims")
    .select("id, kind, text, source, valid_until, withdrawn_at, created_at")
    .eq("tenant_id", tenantId)
    .or(`withdrawn_at.is.null,withdrawn_at.gt.${new Date(Date.now() - 30 * DAY_MS).toISOString()}`)
    .order("created_at", { ascending: false })
    // An owner keeps a few dozen claims at most; the newest hundred are every one a page or a check reads.
    .limit(100);
  if (error) throw new DbFailure(error, "owner claims");
  return data.flatMap((row) => {
    const claim = ownerClaimOf(row);
    return claim ? [claim] : [];
  });
}

/** A goal as it stands: what the posts are for, what about, how much. */
export interface GoalKept {
  id: string;
  goal: ContentGoal;
  service: string | null;
  days: string[];
  words: string | null;
  weight: number;
}

const goalOf = (value: unknown): GoalKept | null => {
  const row = recordOrEmpty(value);
  const detail = recordOrEmpty(row.detail);
  const id = nonBlankOrNull(row.id);
  if (!id || !isOneOf(CONTENT_GOALS, row.goal)) return null;
  return {
    id,
    goal: row.goal,
    service: nonBlankOrNull(detail.service),
    days: listOrEmpty(detail.days).filter((d): d is string => typeof d === "string"),
    words: nonBlankOrNull(detail.words),
    weight: typeof row.weight === "number" ? row.weight : 1,
  };
};

/** The goals kept as one set (content_goals_keep), as the member: the set before stops standing. The goals that stand. */
export async function keepGoals(
  db: Db,
  tenantId: TenantId,
  goals: readonly {
    goal: ContentGoal;
    detail: { service?: string; days?: string[]; words?: string };
    weight?: number;
  }[],
): Promise<GoalKept[]> {
  const { data, error } = await db.rpc("content_goals_keep", { p_tenant_id: tenantId, p_goals: [...goals] });
  if (error) throw new DbFailure(error, "content goals keep");
  return listOrEmpty(data).flatMap((row) => {
    const goal = goalOf(row);
    return goal ? [goal] : [];
  });
}

/** The goals that stand, in the order they were said. */
export async function listGoals(db: Db, tenantId: TenantId): Promise<GoalKept[]> {
  const { data, error } = await db
    .from("content_goals")
    .select("id, goal, detail, weight")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .order("created_at", { ascending: true })
    // content_goals_keep keeps at most eight.
    .limit(8);
  if (error) throw new DbFailure(error, "content goals");
  return data.flatMap((row) => {
    const goal = goalOf(row);
    return goal ? [goal] : [];
  });
}

/** One moment of a clip as it is kept. */
export interface MomentKept {
  start_s: number;
  end_s: number;
  shows: string[];
  words: string | null;
  score: number;
  confidence: number;
  model_edition: number;
}

/** A clip's moments as read (file_moments_keep), under the service role; a member's correction stays. How many. */
export async function keepMoments(
  db: Db,
  tenantId: TenantId,
  file: { id: string; moments: readonly MomentKept[] },
): Promise<number> {
  const { data, error } = await db.rpc("file_moments_keep", {
    p_tenant_id: tenantId,
    p_file_id: file.id,
    p_moments: file.moments.map((moment) => ({ ...moment })),
  });
  if (error) throw new DbFailure(error, "file moments keep");
  return typeof data === "number" ? data : 0;
}

/** How many moments each of these files has kept, by file: which a plan still has to read. */
export async function countMoments(
  db: Db,
  tenantId: TenantId,
  fileIds: readonly string[],
): Promise<Map<string, number>> {
  if (fileIds.length === 0) return new Map();
  const { data, error } = await db
    .from("file_moments")
    .select("file_id")
    .eq("tenant_id", tenantId)
    .in("file_id", [...fileIds])
    // At most twelve a file (file_moments_keep), for the few dozen files a week reads.
    .limit(fileIds.length * 12);
  if (error) throw new DbFailure(error, "file moments");
  const counts = new Map<string, number>();
  for (const row of data) counts.set(row.file_id, (counts.get(row.file_id) ?? 0) + 1);
  return counts;
}

/**
 * A clip's best moment, as the week's making reads it: an owner's correction first, then the highest score; null where
 * none is kept. Its start and end, in seconds.
 */
export async function findBestMoment(
  db: Db,
  tenantId: TenantId,
  fileId: string,
): Promise<{ start_s: number; end_s: number } | null> {
  const { data, error } = await db
    .from("file_moments")
    .select("start_s, end_s")
    .eq("tenant_id", tenantId)
    .eq("file_id", fileId)
    .order("corrected_at", { ascending: false, nullsFirst: false })
    .order("score", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new DbFailure(error, "best moment");
  return data;
}
