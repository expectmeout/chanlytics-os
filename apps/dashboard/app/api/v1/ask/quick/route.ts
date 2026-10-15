import { AppError, ASK_MAX_CHARS, askIntent, quickAnswerOf } from "@chanlytics/contracts";
import { write, workspace } from "@/server/route";
import { requireUuid } from "@/server/request-guards";
import { keepQuickTurn } from "@/server/ask/store";

/**
 * POST /api/v1/ask/quick — a quick answer kept as a turn of a thread (the end-to-end review, 15 October 2026, A1).
 *
 * Body: { text, answer, thread_id? }. The Line answers the short forms of who needs me, did anyone call and what is
 * open without a model (contracts askIntent), from what the page already read, and keeps the turn here once it is
 * drawn: in the thread named (the caller's own, in this workspace; a question that repeats a thread's first resumes it),
 * else a new one. So the next question is asked in that thread and the model reads what was shown, and Earlier lists
 * it. Answers { thread: { id, title } }.
 *
 * As a question is, every member's (the viewer role is the floor), counted as questions, and the person's own under
 * RLS. Only a quick question's answer is kept: the text must be one of the short forms, read again here, and the
 * answer a quick answer's shape (contracts quickAnswerOf), every string cut to its cap and every door a page of the
 * app. It is the answer the person's own page drew for them, in their own thread, so it is kept as drawn.
 */
export const POST = write({
  scope: workspace,
  role: "viewer",
  rate: "ask",
  handle: async ({ ctx, req, member }) => {
    const body = (await req.json().catch(() => null)) as {
      text?: unknown;
      answer?: unknown;
      thread_id?: unknown;
    } | null;
    const text = typeof body?.text === "string" ? body.text.replace(/\s+/g, " ").trim() : "";
    if (!text) throw new AppError("validation", "Ask something.");
    if (text.length > ASK_MAX_CHARS)
      throw new AppError("validation", `Keep a question under ${ASK_MAX_CHARS} characters.`);
    // The kind is the question's, read here; no day or zone decides which of the three a question is.
    const intent = askIntent(text, Date.now(), null);
    if (!intent) throw new AppError("validation", "Only a quick question's answer is kept here.");
    const answer = quickAnswerOf(body?.answer);
    if (!answer) throw new AppError("validation", "That answer is not one the Line draws.");
    const threadId =
      typeof body?.thread_id === "string" && body.thread_id ? requireUuid(body.thread_id, "thread") : null;
    const thread = await keepQuickTurn(ctx, member.tenantId, { text, threadId, answer, quick: intent.kind });
    return { thread };
  },
});
