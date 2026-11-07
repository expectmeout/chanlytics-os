/**
 * A workspace's Google reviews (google_reviews), as the edge reads, keeps, answers and lets them go (decision 0111).
 * Each answer is the database's as it came; the caller says a failure in its words.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";
import { tenantDb } from "../../shared/tenant-db";

type Db = SupabaseClient<Database>;
type ReviewInsert = Database["public"]["Tables"]["google_reviews"]["Insert"];
type ReviewUpdate = Database["public"]["Tables"]["google_reviews"]["Update"];

/**
 * The workspace's reviews deleted: all of them, or those of one `origin` (Places' read or the profile's), and of those
 * only the ones last seen before `seenBefore`, or only the review ids in `only`.
 */
export const deleteGoogleReviews = (
  db: Db,
  tenantId: string,
  which: { origin?: "places" | "profile"; seenBefore?: string | null; only?: readonly string[] } = {},
) => {
  let q = db.from("google_reviews").delete().eq("tenant_id", tenantId);
  if (which.origin) q = q.eq("origin", which.origin);
  if (which.seenBefore) q = q.lt("last_seen_at", which.seenBefore);
  if (which.only) q = q.in("review_id", [...which.only]);
  return q;
};

/** One page (`from` to `to`, by review id) of the ids of the workspace's reviews. */
export const pageGoogleReviewIds = (db: Db, tenantId: string, from: number, to: number) =>
  db.from("google_reviews").select("review_id").eq("tenant_id", tenantId).order("review_id").range(from, to);

/** One page (`from` to `to`, by review id) of the workspace's reviews with their replies and where each was read. */
export const pageGoogleReviewReplies = (db: Db, tenantId: string, from: number, to: number) =>
  db
    .from("google_reviews")
    .select("review_id, replied_at, reply_text, origin")
    .eq("tenant_id", tenantId)
    .order("review_id")
    .range(from, to);

/** The workspace's reviews kept, each written over its own row (one a review id). */
export const saveGoogleReviews = (db: Db, tenantId: string, rows: ReviewInsert[]) =>
  tenantDb(db, tenantId).from("google_reviews").upsert(rows, { onConflict: "tenant_id,review_id" });

/** One of the workspace's reviews, as a reply is written for it, or none. */
export const findReviewToAnswer = (db: Db, tenantId: string, rowId: string) =>
  db
    .from("google_reviews")
    .select("id, rating, author, body, published_at")
    .eq("tenant_id", tenantId)
    .eq("id", rowId)
    .maybeSingle();

/** One of the workspace's reviews, as Google knows it (its review id and where it was read), or none. */
export const findReviewOnGoogle = (db: Db, tenantId: string, rowId: string) =>
  db.from("google_reviews").select("id, review_id, origin").eq("tenant_id", tenantId).eq("id", rowId).maybeSingle();

/** One of the workspace's reviews changed. */
export const patchGoogleReview = (db: Db, tenantId: string, rowId: string, set: ReviewUpdate) =>
  db.from("google_reviews").update(set).eq("id", rowId).eq("tenant_id", tenantId);

/**
 * A reply held on one of the workspace's reviews, only while it has none on Google, and with `timed` only while one is
 * timed to post: the ids written back, none when a reply came first.
 */
export const saveHeldReviewReply = (db: Db, tenantId: string, rowId: string, set: ReviewUpdate, timed: boolean) => {
  const q = db.from("google_reviews").update(set).eq("tenant_id", tenantId).eq("id", rowId).is("reply_text", null);
  return (timed ? q.not("posts_at", "is", null) : q).select("id");
};

/** The workspace's newest profile reviews with no reply, `limit` of them. */
export const listUnrepliedProfileReviews = (db: Db, tenantId: string, limit: number) =>
  db
    .from("google_reviews")
    .select("id, review_id, origin, rating, author, body, published_at, reply_text, draft_text, posts_at")
    .eq("tenant_id", tenantId)
    .eq("origin", "profile")
    .is("reply_text", null)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);
