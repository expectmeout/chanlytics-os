/**
 * A piece's writes from its own screen (the content loop's pass 1b; Campaigns › Content's viewer and its sheets): take
 * it down, and say a post was deleted by hand. Each answers as the typed client answers; the screen says what came of it.
 */
import { api } from "@/bridge/api";

/** Take down (00682): the piece comes down everywhere it is up, and what waits for its time is let go. */
export const takeDownPiece = (fileId: string) => api()("DELETE files/[id]/posts", { params: { id: fileId } });

/** "I deleted it", of a post Chanlytics could not take down: the place is asked whether it is gone. */
export const markDeletedByHand = (fileId: string, postId: string) =>
  api()("PUT files/[id]/posts", { params: { id: fileId }, body: { post_id: postId } });
