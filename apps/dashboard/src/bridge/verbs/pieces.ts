/**
 * A piece's writes from its own screen (the content loop's pass 1b; Campaigns › Content's viewer and its sheets): take
 * it down, say a post was deleted by hand, or say it stays up. Each answers as the typed client answers; the screen says
 * what came of it.
 */
import { api } from "@/bridge/api";

/** Take down (00682): the piece comes down everywhere it is up, and what waits for its time is let go. */
export const takeDownPiece = (fileId: string) => api()("DELETE files/[id]/posts", { params: { id: fileId } });

/** "I deleted it", of a post Chanlytics could not take down: the place is asked whether it is gone. */
export const markDeletedByHand = (fileId: string, postId: string) =>
  api()("PUT files/[id]/posts", { params: { id: fileId }, body: { post_id: postId } });

/**
 * "It's there" or "It's not there", of a post its place took and never confirmed: its owner looked, and says which. It
 * is up from now, or it never went up and is posted again.
 */
export const sayPostIsThere = (fileId: string, postId: string, there: boolean) =>
  api()("POST files/[id]/posts", { params: { id: fileId }, body: { post_id: postId, there } });

/**
 * An ad made from the piece, paused from the piece (decision 0050's pause, by its own door): the one press its line
 * offers where the piece's post was removed at its place while the ad runs. The owner's, as every pause is.
 */
export const pausePieceAd = (adId: string, version: number) =>
  api()("POST ads/[id]/pause", { params: { id: adId }, body: { version } });

/** A post of the piece's one link, made on first ask (00699): it opens a chat carrying the post's code, or its booking page. */
export const makePiecePostLink = (fileId: string, postId: string) =>
  api()("POST files/[id]/link", { params: { id: fileId }, body: { post_id: postId } });

/**
 * A made video's version pressed (00708): `approve` sets this version in place of every post of the piece still waiting
 * ("Approve version 2", "Post this one instead"); `again` draws a version that could not be made once more.
 */
export const pressPieceVersion = (fileId: string, to: "approve" | "again") =>
  api()("POST files/[id]/version", { params: { id: fileId }, body: { to } });

/** "Keep it up" (00689), of a post a place left to its owner to delete: it stays, and nothing more is asked. */
export const keepPostUp = (fileId: string, postId: string) =>
  api()("PUT files/[id]/posts", { params: { id: fileId }, body: { post_id: postId, keep: true } });
