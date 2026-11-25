/**
 * Posts that wait. One still waiting for its time, moved to another (Campaigns › Content's post sheet, 00621); the words
 * it goes up with, as its piece's caption changes, are approvals.ts keepPieceWords (00681): the save is the approval of
 * the new words. And the ones that wait for their owner, which Content's Needs you lists: those that stopped, and those
 * a place took and was never seen holding. Apart from posts.ts, which holds the placement's own doors and reads and
 * stands at the width a module may (repo/size).
 */
import { DbFailure, POST_PLACES, postNeverSeen, recordOrEmpty, type TenantId } from "@chanlytics/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types";
import { MEMBER_POST_COLUMNS, type MemberFilePostRow } from "./posts";

type Db = SupabaseClient<Database>;

/** A member's Change time (00621): moved while it waits and its job is untaken, else late with where it stands. */
export async function movePostTime(
  db: Db,
  postId: string,
  when: string,
): Promise<{ fate: "moved" | "late" | "unknown" }> {
  const { data, error } = await db.rpc("post_move", { p_post_id: postId, p_when: when });
  if (error) throw new DbFailure(error, "post move");
  const fate = recordOrEmpty(data).fate;
  return { fate: fate === "moved" || fate === "late" ? fate : "unknown" };
}

/** A member's columns of a post with the file it is of: what a list of posts across pieces reads. */
const MEMBER_FILE_POST_COLUMNS = `${MEMBER_POST_COLUMNS}, file_id` as const;

/**
 * The workspace's posts that stopped (held, or refused), newest first by when they were pressed, under the caller's RLS:
 * Content's Needs you, which keeps those still the newest at their file and place. By posts_tenant_newest.
 */
export async function listPostsStopped(db: Db, tenantId: TenantId, limit: number): Promise<MemberFilePostRow[]> {
  const { data, error } = await db
    .from("posts")
    .select(MEMBER_FILE_POST_COLUMNS)
    .eq("tenant_id", tenantId)
    .in("status", ["held", "failed"])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new DbFailure(error, "posts stopped");
  return data;
}

/** The places whose post is up only once it was seen there (contracts postNeverSeen): every place but Google. */
const PLACES_THAT_ARE_SEEN = POST_PLACES.filter((place) => postNeverSeen({ place, verified_at: null }));

/**
 * The workspace's posts a place took and was never seen holding, newest first, under the caller's RLS: Content's Needs
 * you asks their owner whether each is there, once the read that looks for it has had its time (the caller's to say,
 * by contracts placementStandingOf). Since `since`: an older one still says so on its own piece. By
 * posts_tenant_newest.
 */
export async function listPostsUnseen(
  db: Db,
  tenantId: TenantId,
  unseen: { since: string; limit: number },
): Promise<MemberFilePostRow[]> {
  const { data, error } = await db
    .from("posts")
    .select(MEMBER_FILE_POST_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("status", "published")
    .is("verified_at", null)
    .in("place", PLACES_THAT_ARE_SEEN)
    .gte("created_at", unseen.since)
    .order("created_at", { ascending: false })
    .limit(unseen.limit);
  if (error) throw new DbFailure(error, "posts unseen");
  return data;
}
