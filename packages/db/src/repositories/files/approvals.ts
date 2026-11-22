/**
 * An approval of a piece's version and its placements (00690; the content loop PRD's 5.3): the member's press that writes it
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

/** What an approval came to (00690 post_approve). */
export const APPROVE_FATES = [
  "approved",
  "busy",
  "gone",
  "not_a_post",
  "wrong_kind",
  "taken_back",
  "late",
  "changed",
] as const;
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

/** The piece a made file is, newest first (a video's, or a picture's once it was first approved); null for none. */
export async function findPieceOfFile(db: Db, tenantId: TenantId, fileId: string): Promise<string | null> {
  const { data, error } = await db
    .from("pieces")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("file_id", fileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new DbFailure(error, "piece of file");
  return data?.id ?? null;
}

/** A new version of a piece: what was approved before it is voided, and its waiting placements held in words. */
export async function revisePiece(
  db: Db,
  change: { tenantId: TenantId; pieceId: string; revision: Json },
): Promise<{ fate: "revised" | "gone"; revision: number | null; held: number }> {
  const { data, error } = await db.rpc("piece_revise", {
    p_tenant_id: change.tenantId,
    p_piece_id: change.pieceId,
    p_revision: change.revision,
  });
  if (error) throw new DbFailure(error, "piece revise");
  const answer = recordOrEmpty(data);
  return {
    fate: answer.fate === "revised" ? "revised" : "gone",
    revision: typeof answer.revision === "number" ? answer.revision : null,
    held: typeof answer.held === "number" ? answer.held : 0,
  };
}
