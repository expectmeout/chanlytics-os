/**
 * A post on its way to a place (00611, decision 0121): the placement a press writes, and each send of it. A member's doors
 * (begin, pull) ask the settings permission themselves; the edge's (an attempt opened and closed, a placement moved) are the
 * service role's alone, and a move is a compare-and-set, so two runs never both move one post.
 */
import {
  DbFailure,
  POST_PLACES,
  postNeverSeen,
  recordOrEmpty,
  type PostHeldWhy,
  type PostPlace,
  type PostStatus,
} from "@chanlytics/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../types";
import { asJson } from "../../shared/json";
import type { TenantId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;
export type PostRow = Database["public"]["Tables"]["posts"]["Row"];
export type PostAttemptRow = Database["public"]["Tables"]["publish_attempts"]["Row"];

/** A member's Don't post: pulled while nothing has been sent, else late with where it stands. */
export async function pullPost(db: Db, postId: string): Promise<{ fate: "pulled" | "late" | "unknown" }> {
  const { data, error } = await db.rpc("post_pull", { p_post_id: postId });
  if (error) throw new DbFailure(error, "post pull");
  const fate = recordOrEmpty(data).fate;
  return { fate: fate === "pulled" || fate === "late" ? fate : "unknown" };
}

/** One send's row, as it stands: newly opened, or one a run that died had opened, finished or not. */
export interface PostAttempt {
  id: string;
  finished: boolean;
  outcome: string | null;
  containerId: string | null;
  externalId: string | null;
}

/** One send opened, with what is sent (never a token). Opened again, the same row as it stands. */
export async function openPostAttempt(
  db: Db,
  attempt: { postId: string; attemptNo: 1 | 2; step: "container" | "publish" | "reconcile"; request: Json },
): Promise<PostAttempt> {
  const { data, error } = await db.rpc("post_attempt_open", {
    p_post_id: attempt.postId,
    p_attempt_no: attempt.attemptNo,
    p_step: attempt.step,
    p_request: attempt.request,
  });
  if (error) throw new DbFailure(error, "post attempt open");
  const row = recordOrEmpty(data);
  if (typeof row.id !== "string") throw new Error("post attempt open: the post is gone");
  return {
    id: row.id,
    finished: row.finished === true,
    outcome: typeof row.outcome === "string" ? row.outcome : null,
    containerId: typeof row.container_id === "string" ? row.container_id : null,
    externalId: typeof row.external_id === "string" ? row.external_id : null,
  };
}

/** A send's answer kept, and its ids copied to the post. False when it was already finished: the first close stands. */
export async function closePostAttempt(
  db: Db,
  close: {
    attemptId: string;
    outcome: "ok" | "refused" | "no_answer" | "failed";
    httpStatus: number | null;
    /** The platform's body as it came: kept as JSON, cut to 4 KB by the door. */
    answer: unknown;
    containerId?: string | null;
    externalId?: string | null;
    error?: Json | null;
  },
): Promise<boolean> {
  // What was not said is left out, and the door takes it as none.
  const { data, error } = await db.rpc("post_attempt_close", {
    p_attempt_id: close.attemptId,
    p_outcome: close.outcome,
    ...(close.httpStatus !== null ? { p_http_status: close.httpStatus } : {}),
    ...(close.answer !== null && close.answer !== undefined ? { p_answer: asJson(close.answer) } : {}),
    ...(close.containerId ? { p_container_id: close.containerId } : {}),
    ...(close.externalId ? { p_external_id: close.externalId } : {}),
    ...(close.error ? { p_error: close.error } : {}),
  });
  if (error) throw new DbFailure(error, "post attempt close");
  return data === true;
}

/** What a move may carry onto the post. */
export interface PostPatch {
  held_reason?: string;
  /** Why it was held, or let go late, beside its words (contracts POST_HELD_WHYS). */
  held_why?: PostHeldWhy;
  /** The place's own account it went to. */
  account_id?: string | null;
  /** When the place was seen holding it. */
  verified_at?: string | null;
  permalink?: string | null;
  published_at?: string | null;
  external_id?: string | null;
  error?: { code: number | null; subcode: number | null; words: string } | null;
}

/** The post moved from where it stood to where it goes; false when it stood anywhere else. */
export async function movePost(
  db: Db,
  move: { postId: string; from: readonly PostStatus[]; to: PostStatus; patch?: PostPatch },
): Promise<boolean> {
  const patch = Object.fromEntries(Object.entries(move.patch ?? {}).filter(([, v]) => v !== undefined && v !== null));
  const { data, error } = await db.rpc("post_moved", {
    p_post_id: move.postId,
    p_from: [...move.from],
    p_to: move.to,
    p_patch: patch,
  });
  if (error) throw new DbFailure(error, "post moved");
  return data === true;
}

/** A send with no answer: Checking, and its reconcile two minutes on, written together. False when it was not being sent. */
export async function markPostUnanswered(db: Db, postId: string, attempt: 1 | 2): Promise<boolean> {
  const { data, error } = await db.rpc("post_unanswered", { p_post_id: postId, p_attempt: String(attempt) });
  if (error) throw new DbFailure(error, "post unanswered");
  return data === true;
}

/**
 * Google posts a press began and never heard back on (the press's own call died with its function): publishing, and not moved
 * since `before`. For the service role, across workspaces: the files sweep fails each in words, as 00681 post_approve does for
 * the next press of the same file, so it stops saying Posting and waits for the owner. Oldest first, `limit` at most.
 */
export async function listPostsSilent(db: Db, args: { before: string; limit: number }): Promise<{ id: string }[]> {
  const { data, error } = await db
    .from("posts")
    .select("id")
    .eq("place", "google")
    .eq("status", "publishing")
    .lt("updated_at", args.before)
    .order("updated_at", { ascending: true })
    .limit(args.limit);
  if (error) throw new DbFailure(error, "posts silent");
  return data;
}

/**
 * I posted it (00620 post_report), on the member's own session: a made piece its owner put up themselves, with its link or
 * none. Kept as a post at the place `hand`; said again, the same record with the link it now has. Answers kept (new, or the
 * one already there), or why not.
 */
export async function reportPost(
  db: Db,
  post: { tenantId: TenantId; fileId: string; link: string | null },
): Promise<{ fate: "kept" | "gone" | "not_a_post"; post_id: string | null }> {
  const { data, error } = await db.rpc("post_report", {
    p_tenant_id: post.tenantId,
    p_file_id: post.fileId,
    ...(post.link ? { p_link: post.link } : {}),
  });
  if (error) throw new DbFailure(error, "post report");
  const answer = recordOrEmpty(data);
  const fate = answer.fate === "gone" || answer.fate === "not_a_post" ? answer.fate : "kept";
  return { fate, post_id: typeof answer.post_id === "string" ? answer.post_id : null };
}

/** A first attempt that never landed queued for the second and last, with its job, written together. */
export async function queuePostAgain(db: Db, postId: string, from: "preparing" | "checking"): Promise<boolean> {
  const { data, error } = await db.rpc("post_again", { p_post_id: postId, p_from: from });
  if (error) throw new DbFailure(error, "post again");
  return data === true;
}

/** Whether whoever approved a post may still post for the workspace (the settings permission): the recheck's first question. */
export async function mayStillPost(db: Db, tenantId: TenantId, userId: string): Promise<boolean> {
  const { data, error } = await db.rpc("has_permission", {
    p_user: userId,
    p_tenant_id: tenantId,
    p_permission: "settings",
  });
  if (error) throw new DbFailure(error, "may still post");
  return data === true;
}

/** One post as the edge works it, every column: the service role's. */
export async function findPostForWork(db: Db, tenantId: TenantId, postId: string): Promise<PostRow | null> {
  const { data, error } = await db.from("posts").select("*").eq("tenant_id", tenantId).eq("id", postId).maybeSingle();
  if (error) throw new DbFailure(error, "post");
  return data ?? null;
}

/** A file's placement at a place by the platform's own name for the post (Google's), for its take-down; null for none kept. */
export async function findPlacementByName(
  db: Db,
  tenantId: TenantId,
  fileId: string,
  externalId: string,
): Promise<string | null> {
  const { data, error } = await db
    .from("posts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("file_id", fileId)
    .eq("external_id", externalId)
    .maybeSingle();
  if (error) throw new DbFailure(error, "post by name");
  return data?.id ?? null;
}

/**
 * Of these ids a place gave its posts, the ones this workspace's placements already keep: a post found on the account by
 * its time is never one another placement is. The service role's.
 */
export async function listKeptPostIds(
  db: Db,
  tenantId: TenantId,
  place: PostPlace,
  externalIds: readonly string[],
): Promise<string[]> {
  if (externalIds.length === 0) return [];
  const { data, error } = await db
    .from("posts")
    .select("external_id")
    .eq("tenant_id", tenantId)
    .eq("place", place)
    .in("external_id", [...externalIds]);
  if (error) throw new DbFailure(error, "posts kept");
  return data.flatMap((row) => (row.external_id ? [row.external_id] : []));
}

/** A post's sends in order, for the reconcile: what was sent and when. The service role's. */
export async function listPostAttempts(db: Db, tenantId: TenantId, postId: string): Promise<PostAttemptRow[]> {
  const { data, error } = await db
    .from("publish_attempts")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("post_id", postId)
    .order("started_at", { ascending: true });
  if (error) throw new DbFailure(error, "post attempts");
  return data;
}

/** The columns a member reads of a post (00611's grant): never its container. When it last moved says when it came down. */
export const MEMBER_POST_COLUMNS =
  "id, place, kind, caption, status, held_reason, held_why, permalink, scheduled_for, published_at, verified_at, good_until, error, external_id, created_at, updated_at";

export type MemberPostRow = Pick<
  PostRow,
  | "id"
  | "place"
  | "kind"
  | "caption"
  | "status"
  | "held_reason"
  | "held_why"
  | "permalink"
  | "scheduled_for"
  | "published_at"
  | "verified_at"
  | "good_until"
  | "error"
  | "external_id"
  | "created_at"
  | "updated_at"
>;

/** A file's posts, newest first, under the caller's RLS: the sheet's read. Ten is more than a sheet shows. */
export async function listFilePosts(db: Db, tenantId: TenantId, fileId: string): Promise<MemberPostRow[]> {
  const { data, error } = await db
    .from("posts")
    .select(MEMBER_POST_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("file_id", fileId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw new DbFailure(error, "file posts");
  return data;
}

/** The member's columns of a post and the file it is of: what a page of files reads of its posts in one read. */
const MEMBER_FILE_POST_COLUMNS =
  "id, file_id, place, kind, caption, status, held_reason, held_why, permalink, scheduled_for, published_at, verified_at, good_until, error, external_id, created_at, updated_at";

export type MemberFilePostRow = MemberPostRow & Pick<PostRow, "file_id">;

/** The most posts one page of files is read: a page holds 96 files at most, and the newest at each place is what it draws. */
const FILE_POSTS_MAX = 500;

/**
 * The posts of these files, newest first, under the caller's RLS: Content's page, whose tiles say where each stands. The
 * ids are one page's (contracts CONTENT_MAX, 96), well under what one `.in()` holds, by posts_tenant_file.
 */
export async function listPostsOfFiles(
  db: Db,
  tenantId: TenantId,
  fileIds: readonly string[],
): Promise<MemberFilePostRow[]> {
  if (fileIds.length === 0) return [];
  const { data, error } = await db
    .from("posts")
    .select(MEMBER_FILE_POST_COLUMNS)
    .eq("tenant_id", tenantId)
    .in("file_id", [...fileIds])
    .order("created_at", { ascending: false })
    .limit(FILE_POSTS_MAX);
  if (error) throw new DbFailure(error, "posts of files");
  return data;
}

/** The posts a week's slots were made into, by their ids, under the member's session (the Week, 00706). */
export async function listPostsByIds(
  db: Db,
  tenantId: TenantId,
  postIds: readonly string[],
): Promise<MemberFilePostRow[]> {
  if (postIds.length === 0) return [];
  const { data, error } = await db
    .from("posts")
    .select(MEMBER_FILE_POST_COLUMNS)
    .eq("tenant_id", tenantId)
    .in("id", [...postIds])
    // A plan holds at most forty slots, each at most one post.
    .limit(40);
  if (error) throw new DbFailure(error, "posts by ids");
  return data;
}

/**
 * What Posted lists and its count counts, the one filter (the content status review of 24 Nov 2026, C4): posts that
 * went up and were not taken down, so what is up now and the stories that ran their day, which the view marks ended;
 * what a press sent, since a post its owner put up by hand (00620) is read with its piece, whose tile says so; and of
 * pieces still here, since a deleted piece's post can be opened from nowhere, and counted where none was listed. The
 * piece is joined by its key's own name, so a second road between the two tables never makes the join ambiguous.
 */
const POSTED_COLUMNS_WITH_PIECE = "files!posts_file_id_same_workspace!inner(id)";

/** How many posts Posted lists: Content's tally, by listPostsUp's own filter. */
export async function countPostsOut(db: Db, tenantId: TenantId): Promise<number> {
  const { count, error } = await db
    .from("posts")
    .select(`id, ${POSTED_COLUMNS_WITH_PIECE}`, { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("status", "published")
    .neq("place", "hand")
    .not("published_at", "is", null)
    .is("files.removed_at", null);
  if (error) throw new DbFailure(error, "posts out");
  return count ?? 0;
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

/** Where a page of posts ended: the time it is ordered by, and the id, which breaks a tie. */
export type PostCursor = { at: string; id: string };

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

/**
 * The posts of a span of the Calendar (the content redesign's stage 3): those set for a time in it, or up in it, but for one
 * pulled or taken down. Soonest first; a workspace holds a handful a day.
 */
export async function listPostsInSpan(
  db: Db,
  tenantId: TenantId,
  span: { fromIso: string; toIso: string; limit: number },
): Promise<MemberFilePostRow[]> {
  const { fromIso, toIso } = span;
  const { data, error } = await db
    .from("posts")
    .select(MEMBER_FILE_POST_COLUMNS)
    .eq("tenant_id", tenantId)
    .not("status", "in", "(pulled,taken_down)")
    .or(
      `and(scheduled_for.gte.${fromIso},scheduled_for.lt.${toIso}),and(published_at.gte.${fromIso},published_at.lt.${toIso})`,
    )
    .order("scheduled_for", { ascending: true })
    .limit(span.limit);
  if (error) throw new DbFailure(error, "posts in span");
  return data;
}

/**
 * Where a post that waits for its time stands: queued, and in Instagram's last ten minutes preparing (00681 post_approve's job is
 * due then), still waiting for its time as the page says it (contracts postWaitsForItsTime).
 */
const TIMED_STATUSES = ["queued", "preparing"] as const;

/** Posts that wait for their time, past `after`, soonest first: Content's Scheduled. A workspace holds a handful. */
export async function listPostsTimed(
  db: Db,
  tenantId: TenantId,
  after: string,
  page: { limit: number; before?: PostCursor | null },
): Promise<MemberFilePostRow[]> {
  let query = db
    .from("posts")
    .select(MEMBER_FILE_POST_COLUMNS)
    .eq("tenant_id", tenantId)
    .in("status", [...TIMED_STATUSES])
    .gt("scheduled_for", after);
  if (page.before) {
    const { at, id } = page.before;
    query = query.or(`scheduled_for.gt.${at},and(scheduled_for.eq.${at},id.gt.${id})`);
  }
  const { data, error } = await query
    .order("scheduled_for", { ascending: true })
    .order("id", { ascending: true })
    .limit(page.limit);
  if (error) throw new DbFailure(error, "posts timed");
  return data;
}

/** How many posts wait for their time, past `after`: every place's, or one place's where `place` names it. */
export async function countPostsTimed(db: Db, tenantId: TenantId, after: string, place?: PostPlace): Promise<number> {
  const timed = db
    .from("posts")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .in("status", [...TIMED_STATUSES])
    .gt("scheduled_for", after);
  const { count, error } = await (place ? timed.eq("place", place) : timed);
  if (error) throw new DbFailure(error, "posts timed counted");
  return count ?? 0;
}

/**
 * What Posted lists, newest first by when each went up: posts that are up, and the stories that ran their day, of
 * pieces still here (countPostsOut counts the same rows).
 */
export async function listPostsUp(
  db: Db,
  tenantId: TenantId,
  page: { limit: number; before?: PostCursor | null },
): Promise<MemberFilePostRow[]> {
  let query = db
    .from("posts")
    .select(`${MEMBER_FILE_POST_COLUMNS}, ${POSTED_COLUMNS_WITH_PIECE}`)
    .eq("tenant_id", tenantId)
    .eq("status", "published")
    .neq("place", "hand")
    .not("published_at", "is", null)
    .is("files.removed_at", null);
  if (page.before) {
    const { at, id } = page.before;
    query = query.or(`published_at.lt.${at},and(published_at.eq.${at},id.lt.${id})`);
  }
  const { data, error } = await query
    .order("published_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(page.limit);
  if (error) throw new DbFailure(error, "posts up");
  // The piece rode along only to hold the filter: a line reads its file apart.
  return data.map(({ files: _piece, ...post }) => post);
}
