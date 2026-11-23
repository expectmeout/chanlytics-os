/**
 * Comments on the business's posts, as Inbox reads and answers them (00696; the content loop PRD's 9.2 and 12.4): the
 * month's comments, one opened, the owner's presses (send their words as the public answer, leave it, answer it after
 * all), and AI asked to write the answer again as the owner says. Each answers as the typed client answers; the screen
 * says what came of it.
 */
import { api } from "@/bridge/api";

/** The comments on the business's posts, newest first, a month back. */
export const readComments = () => api()("GET comments");

/** One comment, with its post and its answer. */
export const readComment = (touchId: string) => api()("GET comments/one", { query: { id: touchId } });

/** The owner's words sent as the business's public answer, once. */
export const sendCommentAnswer = (touchId: string, words: string) =>
  api()("POST comments", { body: { act: "send", touch_id: touchId, words } });

/** Left unanswered (`leave`), or answered after all (`back`). */
export const leaveComment = (touchId: string, act: "leave" | "back") =>
  api()("POST comments", { body: { act, touch_id: touchId } });

/** The answer written again as the owner says: handed back for the box, never kept. */
export const rewriteComment = (touchId: string, words: string, change: string) =>
  api()("POST comments/rewrite", { body: { touch_id: touchId, words, change } });
