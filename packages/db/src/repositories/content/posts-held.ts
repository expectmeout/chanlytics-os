/**
 * The posts Chanlytics calls up at a place, for the daily read of what the place itself holds (the content status
 * review's piece 4): which workspaces are due a read (posts_read_due, the health sweep's question), and one workspace's
 * posts at one place to hold against the place's own list. The service role's. A read that fails THROWS.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DbFailure, heldTenantId, type PostPlace, type TenantId } from "@chanlytics/contracts";
import { tenantDb } from "../../shared/tenant-db";
import type { Database } from "../../types";
import type { PostRow } from "../files/posts";

type Db = SupabaseClient<Database>;

/** The most posts of one workspace at one place a read holds against the place's list: its newest thousand. */
const POSTS_HELD_MAX = 1000;

/** The workspaces due a read of what their places hold, at most `limit` (the health sweep hands each a job). */
export async function listPostsReadDue(db: Db, limit: number): Promise<TenantId[]> {
  const { data, error } = await db.rpc("posts_read_due", { p_limit: limit });
  if (error) throw new DbFailure(error, "posts_read_due");
  return data.map((row) => heldTenantId(row.tenant_id));
}

/**
 * A workspace's posts Chanlytics calls up at one place, that went up in a span, newest first: published, with the
 * place's own id for each, and never a story, which a place's list does not name and which ends by itself in a day.
 */
export async function listPostsHeldAt(
  db: Db,
  tenantId: TenantId,
  at: { place: PostPlace; after: string; upTo: string },
): Promise<PostRow[]> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("posts")
    .select("*")
    .eq("place", at.place)
    .eq("status", "published")
    .neq("kind", "story")
    .not("external_id", "is", null)
    .gt("published_at", at.after)
    .lte("published_at", at.upTo)
    .order("published_at", { ascending: false })
    .limit(POSTS_HELD_MAX);
  if (error) throw new DbFailure(error, "posts held at a place");
  return data;
}
