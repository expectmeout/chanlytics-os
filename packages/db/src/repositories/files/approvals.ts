/**
 * An approval of a piece's version and its placements (00681; the content loop PRD's 5.3): the member's press that writes it
 * (post_approve, under the member's own session, which asks the settings permission itself), the check the edge makes right
 * before a send (post_as_approved, the service role's), and a new version of a piece (piece_revise).
 */
import {
  DbFailure,
  POST_KINDS,
  isOneOf,
  ownersFactsOf,
  pieceIntentOf,
  recordOrEmpty,
  type AsApproved,
  type PostKind,
  type PostPlace,
} from "@chanlytics/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../types";
import type { TenantId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;

/** What an approval came to (00681 post_approve). */
const APPROVE_FATES = ["approved", "busy", "gone", "not_a_post", "wrong_kind", "late", "changed"] as const;
export type ApproveFate = (typeof APPROVE_FATES)[number];

export interface PostsApproved {
  fate: ApproveFate;
  /** On busy: the one of its kind already on its way. */
  busyPostId: string | null;
  approvalId: string | null;
  posts: { place: PostPlace; kind: PostKind; post_id: string }[];
}

/** The press: the approval and its placements in one write; or why not. */
export async function approvePosts(
  db: Db,
  press: { tenantId: TenantId; fileId: string; approval: Json },
): Promise<PostsApproved> {
  const { data, error } = await db.rpc("post_approve", {
    p_tenant_id: press.tenantId,
    p_file_id: press.fileId,
    p_approval: press.approval,
  });
  if (error) throw new DbFailure(error, "post approve");
  const answer = recordOrEmpty(data);
  if (!isOneOf(APPROVE_FATES, answer.fate)) throw new Error("post approve: no fate answered");
  const posts = Array.isArray(answer.posts) ? answer.posts.map(recordOrEmpty) : [];
  return {
    fate: answer.fate,
    busyPostId: typeof answer.post_id === "string" ? answer.post_id : null,
    approvalId: typeof answer.approval_id === "string" ? answer.approval_id : null,
    posts: posts.flatMap((p) =>
      typeof p.post_id === "string" && (p.place === "instagram" || p.place === "google") && isOneOf(POST_KINDS, p.kind)
        ? [{ place: p.place, kind: p.kind, post_id: p.post_id }]
        : [],
    ),
  };
}

/** Right before a send: whether the placement stands as approved, and the exact bytes to send. */
export async function readPostAsApproved(db: Db, postId: string): Promise<AsApproved> {
  const { data, error } = await db.rpc("post_as_approved", { p_post_id: postId });
  if (error) throw new DbFailure(error, "post as approved");
  const answer = recordOrEmpty(data);
  if (answer.is === "stands" && typeof answer.path === "string")
    return {
      is: "stands",
      path: answer.path,
      intent: pieceIntentOf(answer.intent),
      facts: ownersFactsOf(answer.facts),
    };
  return answer.is === "before" ? { is: "before" } : { is: "changed" };
}

/**
 * New words on a made post or video, saved by a member who may approve (00681 piece_words_keep): the piece's next
 * version, and every placement still waiting for its time goes up with them under a new approval of the same bytes.
 * Answers how many placements took them.
 */
export async function keepPieceWords(
  db: Db,
  words: { tenantId: TenantId; fileId: string; caption: string | null },
): Promise<number> {
  const { data, error } = await db.rpc("piece_words_keep", {
    p_tenant_id: words.tenantId,
    p_file_id: words.fileId,
    p_caption: words.caption ?? "",
  });
  if (error) throw new DbFailure(error, "piece words keep");
  const followed = recordOrEmpty(data).followed;
  return typeof followed === "number" ? followed : 0;
}
