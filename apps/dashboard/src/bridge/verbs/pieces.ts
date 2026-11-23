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

/** A post of the piece's one link, made on first ask (00692): it opens a chat carrying the post's code, or its booking page. */
export const makePiecePostLink = (fileId: string, postId: string) =>
  api()("POST files/[id]/link", { params: { id: fileId }, body: { post_id: postId } });

/** "Keep it up" (00689), of a post a place left to its owner to delete: it stays, and nothing more is asked. */
export const keepPostUp = (fileId: string, postId: string) =>
  api()("PUT files/[id]/posts", { params: { id: fileId }, body: { post_id: postId, keep: true } });
