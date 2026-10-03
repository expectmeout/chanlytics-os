import { z } from "zod";
import { write, workspace } from "@/server/route";
import { log } from "@/server/log";
import { endVoiceSession, sessionHashOf, SESSION_ID } from "@/server/ask/voice-session";

/**
 * POST /api/v1/ask/voice/end — the voice conversation is over
 * (docs/superpowers/specs/2026-10-03-ask-spoken-design.md, §3.1): the session's row is ended, so the brain door
 * opens it no more. The member's own row (RLS); a row already ended, or gone (the post-call webhook may have ended
 * it first), is not an error: the conversation is over either way. Not counted: an end is never refused. The reason
 * is the browser's word for how it ended (the person, the agent going, a connection that never came up), on the log
 * line and nowhere else: a connection refused is `ask_voice_refused`, the line the design names (§3.5, §5), so a
 * refusal at the vendor (its concurrency limit, a microphone denied) can be read off the log.
 */
const Input = z.object({ session: z.string().regex(SESSION_ID), reason: z.string().max(80).optional() });

export const POST = write({
  scope: workspace,
  role: "viewer",
  rate: null,
  input: Input,
  handle: async ({ ctx, member, input }) => {
    await endVoiceSession(ctx.supabase, sessionHashOf(input.session), { endedAt: new Date().toISOString() });
    const reason = input.reason ?? null;
    if (reason === "start") log.warn("ask_voice_refused", { tenant_id: member.tenantId, reason });
    else log.info("ask_voice_session_end", { tenant_id: member.tenantId, reason });
    return { ok: true };
  },
});
