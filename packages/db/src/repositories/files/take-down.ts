/**
 * A post taken down (00682; the content loop PRD's 5.3 and 8.3): the member's press that begins it and their "I deleted
 * it" (each a door on the member's own session, which asks the settings permission itself), what the take-down job reads
 * and settles under the service role, and the read of a piece's newest take-down for its sheet.
 */
import {
  DbFailure,
  MIN_MS,
  POST_PLACES,
  REMEDIATION_ACTS,
  REMEDIATION_OUTCOMES,
  REMEDIATION_TARGETS,
  isOneOf,
  listOrEmpty,
  recordOrEmpty,
  type PieceTakeDownDto,
  type PostPlace,
  type TakeDownActionDto,
  type TakeDownSettled,
} from "@chanlytics/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types";
import type { TenantId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;
type ActionRow = Database["public"]["Tables"]["remediation_actions"]["Row"];

/** What the press came to: begun, nothing of it was up or waiting, or the file is gone. */
export interface TakeDownBegun {
  fate: "begun" | "nothing" | "gone";
  /** How many posts were asked down at their place, how many still waiting were let go, how many ads were reached. */
  asked: number;
  cancelled: number;
  ads: number;
}

/** A piece comes down everywhere (post_take_down_begin), as the member. */
export async function beginPostTakeDown(db: Db, tenantId: TenantId, fileId: string): Promise<TakeDownBegun> {
  const { data, error } = await db.rpc("post_take_down_begin", { p_tenant_id: tenantId, p_file_id: fileId });
  if (error) throw new DbFailure(error, "post take down begin");
  const answer = recordOrEmpty(data);
  const actions = listOrEmpty(answer.actions).map((one) => recordOrEmpty(one));
  const fate = answer.fate === "begun" ? "begun" : answer.fate === "gone" ? "gone" : "nothing";
  return {
    fate,
    asked: actions.filter((a) => a.act === "take_down").length,
    cancelled: actions.filter((a) => a.act === "cancel").length,
    ads: listOrEmpty(answer.ads).length,
  };
}

/**
 * "I deleted it" (post_take_down_by_hand), as the member: the place is asked whether the post is gone. A post its owner
 * chose to leave up is not asked about (left_up, 00689).
 */
export async function markPostDeletedByHand(
  db: Db,
  tenantId: TenantId,
  postId: string,
): Promise<{ fate: "asking" | "done" | "left_up" | "unknown" }> {
  const { data, error } = await db.rpc("post_take_down_by_hand", { p_tenant_id: tenantId, p_post_id: postId });
  if (error) throw new DbFailure(error, "post take down by hand");
  const fate = recordOrEmpty(data).fate;
  return { fate: fate === "asking" || fate === "done" || fate === "left_up" ? fate : "unknown" };
}

/** What "Keep it up" came to: the post is left up, its place is still being asked, it came down, or it is not up. */
const KEEP_FATES = ["left_up", "asking", "done", "not_up"] as const;

/**
 * "Keep it up" (post_take_down_keep, 00689), as the member: of a post still up whose take-down a place left to its
 * owner, the owner's word that it stays. Nothing is asked of the place.
 */
export async function keepPostUp(
  db: Db,
  tenantId: TenantId,
  postId: string,
): Promise<{ fate: (typeof KEEP_FATES)[number] | "unknown" }> {
  const { data, error } = await db.rpc("post_take_down_keep", { p_tenant_id: tenantId, p_post_id: postId });
  if (error) throw new DbFailure(error, "post take down keep");
  const fate = recordOrEmpty(data).fate;
  return { fate: isOneOf(KEEP_FATES, fate) ? fate : "unknown" };
}

/** One take-down action as its job reads it, under the service role; null where there is none by that id. */
export async function findTakeDownAction(
  db: Db,
  actionId: string,
): Promise<Pick<ActionRow, "id" | "tenant_id" | "target_id" | "outcome" | "started_at"> | null> {
  const { data, error } = await db
    .from("remediation_actions")
    .select("id, tenant_id, target_id, outcome, started_at")
    .eq("id", actionId)
    .eq("target_type", "post")
    .eq("act", "take_down")
    .maybeSingle();
  if (error) throw new DbFailure(error, "take-down action");
  return data;
}

/**
 * Whether a take-down of this post is still asking its place (an action pending), under the service role: a post found
 * gone meanwhile is that take-down's to settle, and its bell's to tell.
 */
export async function isPostTakeDownAsking(db: Db, tenantId: TenantId, postId: string): Promise<boolean> {
  const { data, error } = await db
    .from("remediation_actions")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("target_type", "post")
    .eq("target_id", postId)
    .eq("act", "take_down")
    .eq("outcome", "pending")
    .limit(1);
  if (error) throw new DbFailure(error, "take-down asking");
  return data.length > 0;
}

/** What keeping a place's answer came to: whether this call kept it, the piece and place it was about, and the news. */
export interface TakeDownKept {
  kept: boolean;
  fileId: string | null;
  place: PostPlace | null;
  /** The places the piece came down from, once every one this take-down asked says done; null until then. */
  down: PostPlace[] | null;
}

/** What the place said of one action (post_take_down_settle), under the service role. */
export async function settlePostTakeDown(
  db: Db,
  settled: { actionId: string; outcome: TakeDownSettled; said: string | null },
): Promise<TakeDownKept> {
  const { data, error } = await db.rpc("post_take_down_settle", {
    p_action_id: settled.actionId,
    p_outcome: settled.outcome,
    // The generated argument is a string; the door reads an empty one as none.
    p_said: settled.said ?? "",
  });
  if (error) throw new DbFailure(error, "post take down settle");
  const answer = recordOrEmpty(data);
  const down = listOrEmpty(answer.down);
  return {
    kept: answer.fate === "kept",
    fileId: typeof answer.file_id === "string" ? answer.file_id : null,
    place: isOneOf(POST_PLACES, answer.place) ? answer.place : null,
    // In the order the places are listed everywhere: Instagram, then Google.
    down: down.length > 0 ? POST_PLACES.filter((place) => down.includes(place)) : null,
  };
}

/**
 * A piece's newest take-down as its rows keep it: each action with the id of whoever left its post up, for the reader
 * to name them (the dashboard's posts/take-down.ts reads the roster for it, and knows who is reading).
 */
export interface PieceTakeDownKept extends Omit<PieceTakeDownDto, "actions"> {
  actions: (Omit<TakeDownActionDto, "left_up_by"> & { left_up_by: string | null })[];
}

const actionKeptOf = (row: ActionRow): PieceTakeDownKept["actions"] =>
  isOneOf(REMEDIATION_TARGETS, row.target_type) &&
  isOneOf(REMEDIATION_ACTS, row.act) &&
  isOneOf(REMEDIATION_OUTCOMES, row.outcome)
    ? [
        {
          id: row.id,
          target: row.target_type,
          target_id: row.target_id,
          act: row.act,
          outcome: row.outcome,
          said: row.said,
          started_at: row.started_at,
          finished_at: row.finished_at,
          left_up_by: row.left_up_by,
          name: null,
        },
      ]
    : [];

/** What takes a piece down: the owner's own press, and nothing else (nobody is asked for a yes, so none is taken back). */
const PIECE_CAUSES = ["owner_removed"] as const;

/**
 * The newest take-down that reached a piece, under the caller's RLS: the remediations about the file itself or about a
 * file it was drawn from that hold an action on one of its posts, with the ads' actions the same press started (a
 * remediation of the same cause and subject, begun in the same minute). Null where nothing of it was ever asked down.
 */
export async function findPieceTakeDown(
  db: Db,
  tenantId: TenantId,
  piece: { fileIds: readonly string[]; postIds: readonly string[] },
): Promise<PieceTakeDownKept | null> {
  if (piece.fileIds.length === 0) return null;
  const about = await db
    .from("remediations")
    .select("id, cause, subject_id, created_at, finished_at")
    .eq("tenant_id", tenantId)
    .eq("subject_type", "file")
    .in("subject_id", [...piece.fileIds])
    .in("cause", [...PIECE_CAUSES])
    .order("created_at", { ascending: false })
    .limit(20);
  if (about.error) throw new DbFailure(about.error, "piece take-downs");
  if (about.data.length === 0) return null;
  const actions = await db
    .from("remediation_actions")
    .select("*")
    .eq("tenant_id", tenantId)
    .in(
      "remediation_id",
      about.data.map((r) => r.id),
    );
  if (actions.error) throw new DbFailure(actions.error, "piece take-down actions");
  const ours = new Set(piece.postIds);
  // The newest that reached one of this piece's posts, or, with no post reached, the newest about the piece itself.
  const newest =
    about.data.find((r) => actions.data.some((a) => a.remediation_id === r.id && ours.has(a.target_id))) ??
    about.data.find((r) => r.subject_id === piece.fileIds[0]);
  if (!newest || !isOneOf(PIECE_CAUSES, newest.cause)) return null;
  // What the same press started: the posts' walk and the ads' walk each keep a row, a moment apart.
  const together = about.data.filter(
    (r) =>
      r.cause === newest.cause &&
      r.subject_id === newest.subject_id &&
      Math.abs(Date.parse(r.created_at) - Date.parse(newest.created_at)) < MIN_MS,
  );
  const ids = new Set(together.map((r) => r.id));
  const kept = actions.data
    .filter((a) => ids.has(a.remediation_id) && (a.target_type === "ad" || ours.has(a.target_id)))
    .sort((a, b) => a.started_at.localeCompare(b.started_at))
    .flatMap(actionKeptOf);
  return {
    cause: newest.cause,
    asked_at: newest.created_at,
    finished_at: together.every((r) => r.finished_at)
      ? (together
          .map((r) => r.finished_at)
          .sort()
          .at(-1) ?? null)
      : null,
    actions: kept,
  };
}

/** A take-down still open on a post that is still up: the post, its piece and place, and where its action stands. */
interface TakeDownOpenRow {
  post_id: string;
  file_id: string;
  place: string;
  outcome: string;
  started_at: string;
}

/**
 * The take-downs a workspace still waits on, newest first, under the caller's RLS: each action not done whose post is
 * still up, the newest of each post (00682's index, as 00689 re-made it, reads the few there are). A post that came
 * down since, by a later take-down, is no longer one; nor is a post its owner chose to leave up, whose every ask says
 * left_up and is never read here, however many there are.
 */
export async function listTakeDownsOpen(db: Db, tenantId: TenantId, limit: number): Promise<TakeDownOpenRow[]> {
  const open = await db
    .from("remediation_actions")
    .select("target_id, outcome, started_at")
    .eq("tenant_id", tenantId)
    .eq("act", "take_down")
    .eq("target_type", "post")
    .neq("outcome", "done")
    .neq("outcome", "left_up")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (open.error) throw new DbFailure(open.error, "open take-downs");
  if (open.data.length === 0) return [];
  const up = await db
    .from("posts")
    .select("id, file_id, place")
    .eq("tenant_id", tenantId)
    .eq("status", "published")
    .in("id", [...new Set(open.data.map((a) => a.target_id))]);
  if (up.error) throw new DbFailure(up.error, "open take-downs' posts");
  const posts = new Map(up.data.map((p) => [p.id, p]));
  const named = new Set<string>();
  return open.data.flatMap((action) => {
    const post = posts.get(action.target_id);
    if (!post || named.has(post.id)) return [];
    named.add(post.id);
    return [
      {
        post_id: post.id,
        file_id: post.file_id,
        place: post.place,
        outcome: action.outcome,
        started_at: action.started_at,
      },
    ];
  });
}
