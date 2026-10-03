import { z } from "zod";
import { write, workspace } from "@/server/route";
import { endVoiceSession, sessionHashOf, SESSION_ID } from "@/server/ask/voice-session";

/**
 * POST /api/v1/ask/voice/end — the person ended the voice conversation
 * (docs/superpowers/specs/2026-10-03-ask-spoken-design.md, §3.1): the session's row is ended, so the brain door
 * opens it no more. The member's own row (RLS); a row already ended, or gone (the post-call webhook may have ended
 * it first), is not an error: the conversation is over either way. Not counted: an end is never refused.
 */
const Input = z.object({ session: z.string().regex(SESSION_ID) });

export const POST = write({
  scope: workspace,
  role: "viewer",
  rate: null,
  input: Input,
  handle: async ({ ctx, input }) => {
    await endVoiceSession(ctx.supabase, sessionHashOf(input.session), { endedAt: new Date().toISOString() });
    return { ok: true };
  },
});
