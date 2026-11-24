/**
 * What the business's own posts did, as a week's patterns compare them (the content loop PRD's 9.4), under the service
 * role: each post that went up to Instagram or Google in the window, its kind, when, its file's length and what its
 * look said it shows, its reach as the place counted it seven days after it went up, and whether any of its numbers
 * then came while it also ran as an ad. core's `contentPatternsOf` works out what they show; nothing is judged here.
 */
import { DbFailure, isOneOf, PLAN_PLACES, POST_KINDS, type PostOutcome, type TenantId } from "@chanlytics/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types";
import { showsOfLook } from "./week-facts";

type Db = SupabaseClient<Database>;

/**
 * The most posts one read compares: 90 days at the cadence's most is about sixty, and past about 200 ids one `.in()`
 * passes the gateway's 8 KiB.
 */
const OUTCOMES_MOST = 150;

/** The posts up since a moment, with what the patterns compare of each, oldest first. */
export async function listPostOutcomes(db: Db, tenantId: TenantId, sinceIso: string): Promise<PostOutcome[]> {
  const { data: posts, error } = await db
    .from("posts")
    .select("id, place, kind, published_at, file_id")
    .eq("tenant_id", tenantId)
    .in("place", [...PLAN_PLACES])
    .gte("published_at", sinceIso)
    .order("published_at", { ascending: true })
    .limit(OUTCOMES_MOST);
  if (error) throw new DbFailure(error, "post outcomes");
  const up = posts.flatMap((post) =>
    post.published_at && isOneOf(PLAN_PLACES, post.place) && isOneOf(POST_KINDS, post.kind)
      ? [{ ...post, at: post.published_at, place: post.place, kind: post.kind }]
      : [],
  );
  if (up.length === 0) return [];
  const fileIds = [...new Set(up.map((post) => post.file_id))];
  const postIds = up.map((post) => post.id);
  const [files, numbers] = await Promise.all([
    db.from("files").select("id, seconds, look").eq("tenant_id", tenantId).in("id", fileIds).limit(fileIds.length),
    db
      .from("post_observations")
      .select("post_id, availability, value, paid_mixed")
      .eq("tenant_id", tenantId)
      .in("post_id", postIds)
      .eq("metric", "reach")
      .eq("step", "7d")
      .limit(postIds.length),
  ]);
  if (files.error) throw new DbFailure(files.error, "post outcomes' files");
  if (numbers.error) throw new DbFailure(numbers.error, "post outcomes' reach");
  const fileOf = new Map(files.data.map((file) => [file.id, file]));
  const reachOf = new Map(numbers.data.map((row) => [row.post_id, row]));
  return up.map((post): PostOutcome => {
    const file = fileOf.get(post.file_id);
    const reach = reachOf.get(post.id);
    return {
      postId: post.id,
      place: post.place,
      kind: post.kind,
      at: post.at,
      seconds: file?.seconds ?? null,
      shows: file ? showsOfLook(file.look) : [],
      paid: reach?.paid_mixed === true,
      reach: reach?.availability === "available" && reach.value !== null ? Number(reach.value) : null,
    };
  });
}
