/**
 * A made video's versions (00708; the content loop PRD's 5.3 and 11, the version board): a new cut drawn as version n+1 of
 * the same piece, on a drawing row that names its root (`pieces.revises`); its bytes kept as the root's next version and
 * shape; the root moved to it when the new file plays; and a press that sets one version's posts in place of the posts
 * still waiting. Each a door; the reads are what the piece's sheet says of its versions.
 */
import { DbFailure, recordOrEmpty, type RevisionChange, type TenantId } from "@chanlytics/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../types";
import { postsApprovedOf, type PostsApproved } from "./approvals";
import { MEMBER_POST_COLUMNS, type MemberPostRow } from "./posts";

type Db = SupabaseClient<Database>;

/** What a version's press came to: begun (or the one this card asked for), too many drawn, another version drawn now. */
export type PieceVersionBegun = {
  fate: "begun" | "here" | "busy" | "drawing" | "gone" | "not_made";
  piece_id: string | null;
};

const VERSION_FATES: readonly PieceVersionBegun["fate"][] = ["begun", "here", "busy", "drawing", "gone", "not_made"];

/** A member's press: a new version of a made video, drawn as a video is, on a row that names its root. */
export async function beginPieceVersion(
  db: Db,
  version: { tenantId: TenantId; pieceId: string; plan: Json; look: Json; key: string; edition: number },
): Promise<PieceVersionBegun> {
  const { data, error } = await db.rpc("piece_version_begin", {
    p_tenant_id: version.tenantId,
    p_piece_id: version.pieceId,
    p_plan: version.plan,
    p_look: version.look,
    p_key: version.key,
    p_edition: version.edition,
  });
  if (error) throw new DbFailure(error, "piece version begin");
  const answer = recordOrEmpty(data);
  const fate = VERSION_FATES.find((f) => f === answer.fate);
  if (!fate) throw new Error("piece version begin: no fate answered");
  return { fate, piece_id: typeof answer.piece_id === "string" ? answer.piece_id : null };
}

/** The service's, when a version's drawn bytes are kept: its root's version n+1 and its shape. Answers n+1, or null. */
export async function keepPieceVersion(
  db: Db,
  pieceId: string,
  kept: { checksum: string; bytes: number; changed: readonly RevisionChange[] },
): Promise<number | null> {
  const { data, error } = await db.rpc("piece_version_kept", {
    p_piece_id: pieceId,
    p_checksum: kept.checksum,
    p_bytes: kept.bytes,
    p_changed: [...kept.changed],
  });
  if (error) throw new DbFailure(error, "piece version kept");
  return typeof data === "number" ? data : null;
}

/** What a version's file playing came to: its root at that version, and how many waiting approvals stopped standing. */
export interface PieceVersionReady {
  pieceId: string;
  revision: number;
  voided: number;
  again: boolean;
}

/** The service's, when a version's file plays: its root moves to it. Null for a file that is no version. */
export async function readyPieceVersion(db: Db, fileId: string): Promise<PieceVersionReady | null> {
  const { data, error } = await db.rpc("piece_version_ready", { p_file_id: fileId });
  if (error) throw new DbFailure(error, "piece version ready");
  if (data === null) return null;
  const answer = recordOrEmpty(data);
  return typeof answer.piece_id === "string" && typeof answer.revision === "number"
    ? {
        pieceId: answer.piece_id,
        revision: answer.revision,
        voided: typeof answer.voided === "number" ? answer.voided : 0,
        again: answer.again === true,
      }
    : null;
}

/** A member's press: the piece's posts still waiting let go, then this file approved in their place, in one step. */
export async function replacePiecePosts(
  db: Db,
  press: { tenantId: TenantId; fileId: string; approval: Json },
): Promise<PostsApproved> {
  const { data, error } = await db.rpc("piece_posts_replace", {
    p_tenant_id: press.tenantId,
    p_file_id: press.fileId,
    p_approval: press.approval,
  });
  if (error) throw new DbFailure(error, "piece posts replace");
  return postsApprovedOf(data);
}

/** One version of a piece as its sheet lists it: its number, what moved, when, and the file its video is. */
export interface PieceVersionRow {
  n: number;
  changed: string[];
  created_at: string;
  file_id: string | null;
}

/** The most versions a sheet reads: a few a week, and every caption saved is one. */
const VERSIONS_READ = 50;

/** A piece's versions, newest first, each with the file its standing shape is (under the member's RLS). */
export async function listPieceVersions(db: Db, tenantId: TenantId, pieceId: string): Promise<PieceVersionRow[]> {
  const [revisions, shapes] = await Promise.all([
    db
      .from("piece_revisions")
      .select("n, changed, created_at")
      .eq("tenant_id", tenantId)
      .eq("piece_id", pieceId)
      .order("n", { ascending: false })
      .limit(VERSIONS_READ),
    db
      .from("piece_renditions")
      .select("revision, file_id")
      .eq("tenant_id", tenantId)
      .eq("piece_id", pieceId)
      .eq("shape", "9x16")
      .limit(VERSIONS_READ),
  ]);
  if (revisions.error) throw new DbFailure(revisions.error, "piece versions");
  if (shapes.error) throw new DbFailure(shapes.error, "piece versions' shapes");
  return revisions.data.map((r) => {
    // A version's video is the newest shape kept at or before it: a caption's version shows the bytes before it.
    const shape = shapes.data.filter((s) => s.revision <= r.n).sort((a, b) => b.revision - a.revision)[0];
    return { n: r.n, changed: r.changed, created_at: r.created_at, file_id: shape?.file_id ?? null };
  });
}

/** A made video's piece (its root, never a version's drawing row): its id, the version it stands at, its own file. */
export interface VideoPieceRow {
  id: string;
  revision: number;
  file_id: string | null;
}

const ROOT_COLUMNS = "id, revises, revision, file_id";

/** The piece a made video's file is, under the member's RLS: its own, a version's root, or the one it was a version of. */
export async function findPieceOfVideo(db: Db, tenantId: TenantId, fileId: string): Promise<VideoPieceRow | null> {
  const own = await db
    .from("pieces")
    .select(ROOT_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("file_id", fileId)
    .order("created_at", { ascending: false })
    .limit(2);
  if (own.error) throw new DbFailure(own.error, "piece of video");
  const row = own.data.find((p) => !p.revises) ?? own.data[0];
  let rootId = row ? (row.revises ?? row.id) : null;
  if (!rootId) {
    const shape = await db
      .from("piece_renditions")
      .select("piece_id")
      .eq("tenant_id", tenantId)
      .eq("file_id", fileId)
      .limit(1)
      .maybeSingle();
    if (shape.error) throw new DbFailure(shape.error, "piece of video's shape");
    rootId = shape.data?.piece_id ?? null;
  }
  if (!rootId) return null;
  if (row && row.id === rootId) return { id: row.id, revision: row.revision, file_id: row.file_id };
  const root = await db.from("pieces").select(ROOT_COLUMNS).eq("tenant_id", tenantId).eq("id", rootId).maybeSingle();
  if (root.error) throw new DbFailure(root.error, "piece of video's root");
  return root.data ? { id: root.data.id, revision: root.data.revision, file_id: root.data.file_id } : null;
}

/**
 * Of a page of made files, the ones a piece has moved past (an older version) or is still drawing as a new version, and
 * the files whose piece has a new version being drawn now, with the number it will be: Made shows one tile a piece (the
 * version board, cell 6).
 */
export async function readVersionsOfFiles(
  db: Db,
  tenantId: TenantId,
  fileIds: readonly string[],
): Promise<{ behind: Set<string>; drawing: Map<string, number> }> {
  const none = { behind: new Set<string>(), drawing: new Map<string, number>() };
  if (fileIds.length === 0) return none;
  const [rows, shapes] = await Promise.all([
    db
      .from("pieces")
      .select("id, revises, file_id, revision")
      .eq("tenant_id", tenantId)
      .in("file_id", [...fileIds]),
    db
      .from("piece_renditions")
      .select("piece_id, file_id")
      .eq("tenant_id", tenantId)
      .in("file_id", [...fileIds]),
  ]);
  if (rows.error) throw new DbFailure(rows.error, "versions of files");
  if (shapes.error) throw new DbFailure(shapes.error, "versions of files' shapes");
  const roots = rows.data.filter((p) => !p.revises && p.file_id !== null);
  const current = new Set(roots.map((p) => p.file_id));
  const behind = new Set(
    [...rows.data.filter((p) => !!p.revises).map((p) => p.file_id), ...shapes.data.map((s) => s.file_id)].filter(
      (f): f is string => f !== null && !current.has(f),
    ),
  );
  if (roots.length === 0) return { behind, drawing: new Map() };
  const making = await db
    .from("pieces")
    .select("revises")
    .eq("tenant_id", tenantId)
    .eq("status", "making")
    .in(
      "revises",
      roots.map((p) => p.id),
    );
  if (making.error) throw new DbFailure(making.error, "versions being made");
  const drawn = new Set(making.data.map((p) => p.revises));
  return {
    behind,
    drawing: new Map(
      roots.filter((p) => drawn.has(p.id)).flatMap((p) => (p.file_id ? [[p.file_id, p.revision + 1] as const] : [])),
    ),
  };
}

/**
 * A made video's posts at every one of its versions, newest first, each with the version it shows: the sheet's read once a
 * piece has more than one (version 1's posts wait under version 2's file). Posts from before versions are read by file.
 */
export async function listPiecePosts(
  db: Db,
  tenantId: TenantId,
  piece: { id: string; fileId: string },
): Promise<(MemberPostRow & { revision: number | null })[]> {
  const { data, error } = await db
    .from("posts")
    .select(`${MEMBER_POST_COLUMNS}, revision`)
    .eq("tenant_id", tenantId)
    .or(`piece_id.eq.${piece.id},file_id.eq.${piece.fileId}`)
    .order("created_at", { ascending: false })
    // A sheet shows each place's newest few: ten at each version is more than it draws.
    .limit(20);
  if (error) throw new DbFailure(error, "piece posts");
  return data;
}

/** How many posts set to go Today looks through for the one that waits on a version: a workspace holds a handful a day. */
const WAITING_READ = 50;

/**
 * The soonest post set to go whose piece has moved to a newer version since it was approved (00708; the version board,
 * cell 5): it waits for that version's approval. Its piece's own file and the version it stands at, or null.
 */
export async function findPostWaitingOnVersion(
  db: Db,
  tenantId: TenantId,
): Promise<{ fileId: string; n: number; at: string } | null> {
  const posts = await db
    .from("posts")
    .select("piece_id, revision, scheduled_for")
    .eq("tenant_id", tenantId)
    .in("status", ["queued", "preparing", "held"])
    .not("piece_id", "is", null)
    .not("revision", "is", null)
    .order("scheduled_for", { ascending: true })
    .limit(WAITING_READ);
  if (posts.error) throw new DbFailure(posts.error, "posts waiting on a version");
  const pieceIds = [...new Set(posts.data.flatMap((p) => (p.piece_id ? [p.piece_id] : [])))];
  if (pieceIds.length === 0) return null;
  const pieces = await db.from("pieces").select("id, revision, file_id").eq("tenant_id", tenantId).in("id", pieceIds);
  if (pieces.error) throw new DbFailure(pieces.error, "pieces of posts waiting");
  const byId = new Map(pieces.data.map((p) => [p.id, p]));
  for (const post of posts.data) {
    const piece = post.piece_id ? byId.get(post.piece_id) : undefined;
    if (piece?.file_id && post.revision < piece.revision)
      return { fileId: piece.file_id, n: piece.revision, at: post.scheduled_for };
  }
  return null;
}

/** The newest version of this piece being drawn, or that could not be: its drawing row's id, its stage, whether it failed. */
export async function findVersionDrawing(
  db: Db,
  tenantId: TenantId,
  pieceId: string,
): Promise<{ id: string; stage: string; failed: boolean; plan: Json; card_key: string } | null> {
  const { data, error } = await db
    .from("pieces")
    .select("id, stage, status, plan, card_key")
    .eq("tenant_id", tenantId)
    .eq("revises", pieceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new DbFailure(error, "piece version drawing");
  if (!data || data.status === "made") return null;
  return { id: data.id, stage: data.stage, failed: data.status === "failed", plan: data.plan, card_key: data.card_key };
}
