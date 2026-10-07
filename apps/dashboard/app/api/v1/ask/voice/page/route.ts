import { z } from "zod";
import { AppError, PageContextSchema } from "@chanlytics/contracts";
import { write, workspace } from "@/server/route";
import { readerContext } from "@/server/readers";
import { buildContext } from "@/server/ask/context";
import { moveVoiceContext, sessionHashOf, SESSION_ID } from "@/server/ask/voice-session";

/**
 * POST /api/v1/ask/voice/page — the page under the Line changed while a voice conversation runs
 * (docs/superpowers/specs/2026-10-03-ask-spoken-design.md, §3.1): the session's row keeps the new page's context, so
 * the next spoken turn reads that page, and it is warmed as ask/warm warms it. The session is the member's own row
 * (RLS), named by the id the browser holds; one that is not theirs, or is gone, is a 404. Nothing is sent to the
 * agent: Ask already holds the page. A write in the aggregate bucket, as the warm is.
 */
const Input = z.object({ session: z.string().regex(SESSION_ID), context: PageContextSchema });

export const POST = write({
  scope: workspace,
  role: "viewer",
  rate: "aggregate",
  input: Input,
  handle: async ({ ctx, member, input }) => {
    const moved = await moveVoiceContext(
      ctx.supabase,
      sessionHashOf(input.session),
      input.context,
      input.context.surface ?? null,
    );
    if (!moved) throw new AppError("not_found", "That conversation is not yours or is over.", 404);
    const built = await buildContext(readerContext(ctx, member, undefined, { keep: true }), input.context);
    return { stamp: built.stamp };
  },
});
