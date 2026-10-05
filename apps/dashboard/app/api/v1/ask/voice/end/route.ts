import { z } from "zod";
import { ASK_VOICE_TIMING_MAX_MS, isVoiceEndReason } from "@chanlytics/contracts";
import { write, workspace } from "@/server/route";
import { log } from "@/server/log";
import { endVoiceSession, sessionHashOf, SESSION_ID } from "@/server/ask/voice-session";

/**
 * POST /api/v1/ask/voice/end — the voice conversation is over
 * (docs/superpowers/specs/2026-10-03-ask-spoken-design.md, §3.1; §3.5 as amended 4 Oct 2026): the session's row is
 * ended, so the brain door opens it no more, and the row keeps how it went (00300): the browser's word for why, one
 * of a closed set (contracts VOICE_END_REASONS: `button`, Clear pressed; `typed`, a typed question ends the session;
 * `superseded`, another use of the voice replaced it; `navigated`, the Line closed; `vendor`, the far side ended it;
 * `start`, it never came up; `idle`, a minute with nothing asked), and the two timings the browser measured from the
 * press (to the connection, to the first audio heard). The vendor erases its own record once the minutes are written, so this row is the one record of what
 * happened; the voice doctor reads it (docs/runbook.md). The member's own row (RLS); a row already ended, or gone (the
 * post-call webhook may have ended it first), is not an error: the conversation is over either way. Not counted, and
 * never refused for its reason: a word outside the set (an older bundle's "stopped", the vendor's own word) ends the
 * row all the same and is kept on the log line alone, so either app may deploy first. One such word is said on
 * purpose: `died:<how>:<device>`, by the page that loads after one that died under a session (a phone reloading a page
 * it killed; voice.ts `diedWord`), since a page that dies sends no end and the webhook's cannot say why. A `start` is logged as
 * `ask_voice_refused`, the line the design names (§3.5, §5), so a refusal at the vendor (its concurrency limit, a
 * microphone denied) can be read off the log.
 */
const Timing = z.number().int().min(0).max(ASK_VOICE_TIMING_MAX_MS).nullable().optional();
const Input = z.object({
  session: z.string().regex(SESSION_ID),
  reason: z.string().max(80).optional(),
  connect_ms: Timing,
  first_audio_ms: Timing,
});

export const POST = write({
  scope: workspace,
  role: "viewer",
  rate: null,
  input: Input,
  handle: async ({ ctx, member, input }) => {
    const reason = isVoiceEndReason(input.reason) ? input.reason : null;
    await endVoiceSession(ctx.supabase, sessionHashOf(input.session), {
      endedAt: new Date().toISOString(),
      ...(reason ? { endReason: reason } : {}),
      ...(input.connect_ms !== undefined ? { connectMs: input.connect_ms } : {}),
      ...(input.first_audio_ms !== undefined ? { firstAudioMs: input.first_audio_ms } : {}),
    });
    const line = {
      tenant_id: member.tenantId,
      reason,
      // The word as the browser said it, while an older bundle may still say one outside the set.
      said: input.reason ?? null,
      connect_ms: input.connect_ms ?? null,
      first_audio_ms: input.first_audio_ms ?? null,
    };
    if (reason === "start") log.warn("ask_voice_refused", line);
    else log.info("ask_voice_session_end", line);
    return { ok: true };
  },
});
