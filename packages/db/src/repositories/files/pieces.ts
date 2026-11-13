/**
 * A video made from a business's clips (00613, decision 0122): the record of each one asked for, and the machine image a deploy
 * draws on. A member's door (begin) asks the settings permission itself; the job's (the machine kept, the file begun, the
 * ending) are the service role's alone, and each acts only on a video still being made, so two runs never both move one.
 */
import { DbFailure, recordOrEmpty, type PieceFail, type PieceStage, type TenantId } from "@chanlytics/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../types";

type Db = SupabaseClient<Database>;
export type PieceRow = Database["public"]["Tables"]["pieces"]["Row"];

/** What a press came to: the video begun, the one this card already asked for, or too many being made at once. */
export type PieceBegun = { fate: "begun" | "here" | "busy"; piece_id: string | null };

const BEGUN_FATES: readonly PieceBegun["fate"][] = ["begun", "here", "busy"];

/** A member's press: the video's row, and the first step of the job that makes it. Kept once by the card's key. */
export async function beginPiece(
  db: Db,
  piece: { tenantId: TenantId; plan: Json; look: Json; key: string; edition: number },
): Promise<PieceBegun> {
  const { data, error } = await db.rpc("piece_begin", {
    p_tenant_id: piece.tenantId,
    p_plan: piece.plan,
    p_look: piece.look,
    p_key: piece.key,
    p_edition: piece.edition,
  });
  if (error) throw new DbFailure(error, "piece begin");
  const answer = recordOrEmpty(data);
  const fate = BEGUN_FATES.find((f) => f === answer.fate);
  if (!fate) throw new Error("piece begin: no fate answered");
  return { fate, piece_id: typeof answer.piece_id === "string" ? answer.piece_id : null };
}

/** A video's row, for the job that makes it: the service role's read, its machine with it. */
export async function findPieceForWork(db: Db, tenantId: TenantId, id: string): Promise<PieceRow | null> {
  const { data, error } = await db.from("pieces").select("*").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (error) throw new DbFailure(error, "piece read");
  return data;
}

/** The machine a video is being drawn on, kept, or let go with null. Answers whether the video is still being made. */
export async function keepPieceMachine(db: Db, id: string, machine: Json | null): Promise<boolean> {
  const { data, error } = await db.rpc("piece_step", { p_piece_id: id, p_machine: machine ?? null });
  if (error) throw new DbFailure(error, "piece step");
  return data === true;
}

/**
 * What a drawn video's file came to: kept (its row, uploading), here (the same bytes are a file already, and the video is
 * that one), full or minutes (the workspace's files or its video minutes are spent), or ended (the video is no longer being made).
 */
export type PieceFileFate = {
  fate: "kept" | "here" | "full" | "minutes" | "ended";
  file_id: string | null;
  /** The reservation the row holds, where the door was asked again after a lost answer: it may not be this one. */
  media_ref: string | null;
  /** When the file the row holds was begun, where the door was asked again: a run still sending it began it moments ago. */
  begun_at: string | null;
  /** Where the file found already there stands (`here`): ready is the video made, failed the video not made. */
  twin: string | null;
};

const FILE_FATES: readonly PieceFileFate["fate"][] = ["kept", "here", "full", "minutes", "ended"];

/** A drawn video on its way into the video platform, as a file made here. */
export async function beginPieceFile(
  db: Db,
  file: {
    pieceId: string;
    id: string;
    mediaRef: string;
    name: string;
    bytes: number;
    fingerprint: string;
    seconds: number;
  },
): Promise<PieceFileFate> {
  const { data, error } = await db.rpc("piece_file_begin", {
    p_piece_id: file.pieceId,
    p_id: file.id,
    p_media_ref: file.mediaRef,
    p_name: file.name,
    p_bytes: file.bytes,
    p_fingerprint: file.fingerprint,
    p_seconds: file.seconds,
  });
  if (error) throw new DbFailure(error, "piece file begin");
  const answer = recordOrEmpty(data);
  const fate = FILE_FATES.find((f) => f === answer.fate);
  if (!fate) throw new Error("piece file begin: no fate answered");
  return {
    fate,
    file_id: typeof answer.file_id === "string" ? answer.file_id : null,
    media_ref: typeof answer.media_ref === "string" ? answer.media_ref : null,
    begun_at: typeof answer.begun_at === "string" ? answer.begun_at : null,
    twin: typeof answer.twin === "string" ? answer.twin : null,
  };
}

/** Where a video being made stands, said as it changes: waiting for a clip's full-size copy, most of all. Answers whether it changed. */
export async function sayPieceStage(db: Db, id: string, stage: PieceStage): Promise<boolean> {
  const { data, error } = await db.rpc("piece_stage", { p_piece_id: id, p_stage: stage });
  if (error) throw new DbFailure(error, "piece stage");
  return data === true;
}

/** What a member may read of a video asked for: where it stands, and the file it became. */
export type PieceMemberRow = Pick<PieceRow, "id" | "tenant_id" | "status" | "stage" | "failed_why" | "file_id">;

/** A video asked for, under the caller's RLS: null where it is not theirs to see, or went with its file. */
export async function findPiece(db: Db, id: string): Promise<PieceMemberRow | null> {
  const { data, error } = await db
    .from("pieces")
    .select("id, tenant_id, status, stage, failed_why, file_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new DbFailure(error, "piece");
  return data;
}

/**
 * The plan a made video was drawn by, by the file it became, under the caller's RLS: what its words are made again from (the
 * content redesign's stage 2). Null for a file no video of this workspace became. The newest, should a card's try before
 * have named it too.
 */
export async function findPiecePlanOfFile(db: Db, tenantId: TenantId, fileId: string): Promise<Json | null> {
  const { data, error } = await db
    .from("pieces")
    .select("plan")
    .eq("tenant_id", tenantId)
    .eq("file_id", fileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new DbFailure(error, "piece plan of file");
  return data?.plan ?? null;
}

/**
 * A drawn video's bytes have all gone: its file says it is being made ready and its machine is let go, in one step, so from
 * here the platform's word alone ends it. Answers whether the video was still being made.
 */
export async function markPieceSent(db: Db, id: string): Promise<boolean> {
  const { data, error } = await db.rpc("piece_sent", { p_piece_id: id });
  if (error) throw new DbFailure(error, "piece sent");
  return data === true;
}

/**
 * A video that could not be made says why. Answers whether it ended here: one already ended is left as it ended, and one
 * whose bytes all went is left for the platform's word.
 */
export async function endPiece(db: Db, id: string, reason: PieceFail): Promise<boolean> {
  const { data, error } = await db.rpc("piece_end", { p_piece_id: id, p_why: reason });
  if (error) throw new DbFailure(error, "piece end");
  return data === true;
}

/** The machine image on record for an edition of the template, or null where none was built yet. */
export async function findPieceImage(db: Db, edition: number): Promise<{ snapshot_id: string; hash: string } | null> {
  const { data, error } = await db
    .from("piece_images")
    .select("snapshot_id, hash")
    .eq("edition", edition)
    .maybeSingle();
  if (error) throw new DbFailure(error, "piece image read");
  return data;
}

/** An edition's machine image put on record: the script that builds one writes it, and a second build replaces the first. */
export async function keepPieceImage(
  db: Db,
  image: { edition: number; snapshotId: string; hash: string },
): Promise<void> {
  const { error } = await db.from("piece_images").upsert({
    edition: image.edition,
    snapshot_id: image.snapshotId,
    hash: image.hash,
    made_at: new Date().toISOString(),
  });
  if (error) throw new DbFailure(error, "piece image keep");
}

/** What a member reads of a video on the Content page: where it stands and the plan it was pressed with, never its machine. */
export type PieceStandingRow = Pick<
  PieceRow,
  "id" | "status" | "stage" | "failed_why" | "plan" | "file_id" | "created_at"
>;

/**
 * When the workspace's newest video that is being made, or was made, was asked for; null before its first. A video that
 * could not be made stops waiting on the owner once a newer one was begun (the dashboard's readers/content.ts).
 */
export async function findNewestPieceBegun(db: Db, tenantId: TenantId): Promise<string | null> {
  const { data, error } = await db
    .from("pieces")
    .select("created_at")
    .eq("tenant_id", tenantId)
    .in("status", ["making", "made"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new DbFailure(error, "newest piece begun");
  return data?.created_at ?? null;
}

/**
 * The videos being made, and the ones not made since `failedSince`, newest first, under the caller's RLS: Content's "Being
 * made". A workspace makes three at a time (contracts PIECES_MAKING_MAX), so a page reads a handful, by pieces_tenant_newest.
 */
export async function listPiecesStanding(
  db: Db,
  tenantId: TenantId,
  page: { failedSince: string; limit: number },
): Promise<PieceStandingRow[]> {
  const { data, error } = await db
    .from("pieces")
    .select("id, status, stage, failed_why, plan, file_id, created_at")
    .eq("tenant_id", tenantId)
    .or(`status.eq.making,and(status.eq.failed,created_at.gte.${page.failedSince})`)
    .order("created_at", { ascending: false })
    .limit(page.limit);
  if (error) throw new DbFailure(error, "pieces standing");
  return data;
}
