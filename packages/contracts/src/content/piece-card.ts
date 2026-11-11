/**
 * A video asked for, as its card reads it once pressed (decision 0122; the content canvas's "every state a piece can be in"): its
 * own row and, once it is one, its file. Pure, with nothing behind it. A card says only what these say: being made and where
 * that is at, ready, not made, or no longer there. Ready is the moment it can be played, when the bell rings too (Ruben, 11 Nov
 * 2026, "Ready when playable"); the look every file gets comes after, and what it notes is on the video's own page.
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
  return { is: "ready", file: read.file };
}

/**
 * Whether a card asks for its plan's stills: before the press; while its video is being made or was not made, which show the
 * first of them; and for a video that is ready whose own poster did not come, since a poster is cut some seconds after its
 * video can be played and the first still is that video's first frame.
 */
export const pieceWantsStills = (pressed: boolean, stands: PieceStands | null, posterMissed: boolean): boolean =>
  !pressed ||
  (stands !== null && (stands.is === "making" || stands.is === "failed" || (stands.is === "ready" && posterMissed)));

/** Whether a video's card should be read again: while it is being made. */
export const pieceStillMoving = (stands: PieceStands): boolean => stands.is === "making";
