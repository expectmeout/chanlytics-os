/**
 * A video asked for, as its card reads it once pressed (decision 0122; the content canvas's "every state a piece can be in"): its
 * own row and, once it is one, its file. Pure, with nothing behind it. A card says only what these say: being made and where
 * that is at, made and being looked at, ready, not made, or no longer there.
 */
import type { FileDto } from "../files/views";
import type { PieceFail, PieceStage, PieceStatus } from "./piece-making";

/** One video asked for, as GET files/video/[id] answers it: where its row stands, and its file once it has one a member may see. */
export interface PieceFollowedDto {
  status: PieceStatus;
  stage: PieceStage;
  failed_why: PieceFail | null;
  file: FileDto | null;
}

/** Where a video stands, as its card draws it. */
export type PieceStands =
  | { is: "making"; stage: PieceStage }
  /** Made, and the look every file gets is still reading it: Ask watches it before the owner does. */
  | { is: "checking"; file: FileDto }
  | { is: "ready"; file: FileDto }
  | { is: "failed"; why: PieceFail }
  /** Made once, and deleted from Files since. */
  | { is: "gone" };

/** Where a video stands, from what was read of it; null reads as gone (its row goes with its file). */
export function pieceStandsOf(read: PieceFollowedDto | null): PieceStands {
  if (!read) return { is: "gone" };
  if (read.status === "failed") return { is: "failed", why: read.failed_why ?? "unknown" };
  if (read.status === "making") return { is: "making", stage: read.stage };
  if (!read.file) return { is: "gone" };
  return read.file.look_status === "waiting" ? { is: "checking", file: read.file } : { is: "ready", file: read.file };
}

/** Whether a video's card should be read again: while it is being made, and while Ask is still looking at it. */
export const pieceStillMoving = (stands: PieceStands): boolean => stands.is === "making" || stands.is === "checking";
