/**
 * A post on its way to a place (00611, decision 0121): the placement a press writes, and each send of it. A member's doors
 * (begin, pull) ask the settings permission themselves; the edge's (an attempt opened and closed, a placement moved) are the
 * service role's alone, and a move is a compare-and-set, so two runs never both move one post.
 */
import { DbFailure, recordOrEmpty, type PostKind, type PostPlace, type PostStatus } from "@chanlytics/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../types";
import { asJson } from "../../shared/json";
import type { TenantId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;
export type PostRow = Database["public"]["Tables"]["posts"]["Row"];
export type PostAttemptRow = Database["public"]["Tables"]["publish_attempts"]["Row"];

/** What a press came to: the post begun, the one already on its way, or why none could be. */
export type PostBegun = {
  fate: "begun" | "busy" | "gone" | "not_a_post" | "not_yet";
  post_id: string | null;
};

const BEGUN_FATES: readonly PostBegun["fate"][] = ["begun", "busy", "gone", "not_a_post", "not_yet"];

/** A member's press, which is the approval: the placement written, and for Instagram its first job. */
export async function beginPost(
  db: Db,
  post: {
    tenantId: TenantId;
    fileId: string;
    place: PostPlace;
    kind: PostKind;
    caption: string | null;
    when: string | null;
    via: "press" | "card";
  },
): Promise<PostBegun> {
  const { data, error } = await db.rpc("post_begin", {
    p_tenant_id: post.tenantId,
    p_file_id: post.fileId,
    p_place: post.place,
    p_kind: post.kind,
    p_caption: post.caption ?? "",
    ...(post.when ? { p_when: post.when } : {}),
    p_via: post.via,
  });
  if (error) throw new DbFailure(error, "post begin");
  const answer = recordOrEmpty(data);
  const fate = BEGUN_FATES.find((f) => f === answer.fate);
  if (!fate) throw new Error("post begin: no fate answered");
  return { fate, post_id: typeof answer.post_id === "string" ? answer.post_id : null };
}

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

/** The columns a member reads of a post (00611's grant): never its container. */
const MEMBER_POST_COLUMNS =
  "id, place, kind, caption, status, held_reason, permalink, scheduled_for, published_at, error, external_id, created_at";

export type MemberPostRow = Pick<
  PostRow,
  | "id"
  | "place"
  | "kind"
  | "caption"
  | "status"
  | "held_reason"
  | "permalink"
  | "scheduled_for"
  | "published_at"
  | "error"
  | "external_id"
  | "created_at"
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
  "id, file_id, place, kind, caption, status, held_reason, permalink, scheduled_for, published_at, error, external_id, created_at";

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

/** How many of the workspace's posts are up, at any place: Content's tally. */
export async function countPostsOut(db: Db, tenantId: TenantId): Promise<number> {
  const { count, error } = await db
    .from("posts")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("status", "published");
  if (error) throw new DbFailure(error, "posts out");
  return count ?? 0;
}
