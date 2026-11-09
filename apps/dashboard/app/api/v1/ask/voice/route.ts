import { AppError } from "@chanlytics/contracts";
import { write, workspace } from "@/server/shared/route";
import { env } from "@/server/shared/env";
import { log } from "@/server/shared/log";
import { callEdge, edgeAnswered, edgeReasonOf } from "@/server/shared/edge";
import { readerContext } from "@/server/shared/reader";
import { buildContext } from "@/server/ask/context";
import { createThread, readThread } from "@/server/ask/store";
import { createVoiceSession, tokenExpiry, VOICE_THREAD_TITLE } from "@/server/ask/voice-session";
import { asked, DOOR, MINT_TIMEOUT_MS, refusalOf } from "@/server/ask/doors/voice-request";

export const POST = write({
  scope: workspace,
  role: "viewer",
  rate: "voice",
  handle: async ({ ctx, req, member }) => {
    const secret = env.ASK_VOICE_SECRET;
    if (!secret) throw new AppError("upstream_voice", "Voice is not set up on this deployment.", 503);
    const tenantId = member.tenantId;
    // A body that is not JSON is none: what reads it next refuses.
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const { threadId, scope, language, context, surface } = asked(body, tenantId);

    // The access token this request was verified with (the header says why it is read here and nowhere else).
    const { data } = await ctx.supabase.auth.getSession();
    const accessToken = data.session?.access_token ?? null;
    const expiresAt = accessToken ? tokenExpiry(accessToken) : null;
    if (!accessToken || !expiresAt) throw new AppError("unauthorized", "Sign in again to talk.", 401);

    // A thread named must be this workspace's, before the vendor is asked for anything.
    let thread: { id: string; title: string } | null = null;
    if (threadId) {
      const found = await readThread(ctx, threadId);
      if (!found) throw new AppError("not_found", "That thread does not exist.", 404);
      if (found.tenantId !== tenantId) throw new AppError("not_found", "That thread is not yours.", 404);
      thread = { id: found.thread.id, title: found.thread.title };
    }

    // The page warmed as ask/warm warms it, so the first spoken question finds it read; a page that could not be read
    // is no reason to refuse the conversation.
    if (context) {
      try {
        await buildContext(readerContext(ctx, member, undefined, { keep: true }), context);
      } catch (e) {
        log.error("ask_context_failed", { tenant_id: tenantId, error: e });
      }
    }

    // The agent's token, from the edge that holds the key (door B).
    const answer = await callEdge(
      DOOR,
      { tenant_id: tenantId, user_id: ctx.userId },
      { workspace: tenantId, user: ctx.userId, timeoutMs: MINT_TIMEOUT_MS },
    );
    if (!edgeAnswered(answer)) {
      log.warn("ask_voice_session_refused", {
        tenant_id: tenantId,
        reason: edgeReasonOf(answer),
        status: answer.status,
      });
      throw refusalOf(answer);
    }
    const token = typeof answer.body?.token === "string" ? answer.body.token : "";
    const conversationId = typeof answer.body?.conversation_id === "string" ? answer.body.conversation_id : null;
    if (!token) throw new AppError("upstream_voice", "The voice agent answered no token.");

    // A new thread only once the vendor has said yes: a refused conversation leaves no empty thread behind.
    if (!thread) {
      const created = await createThread(ctx, tenantId, VOICE_THREAD_TITLE, scope);
      thread = { id: created.id, title: created.title };
    }
    const { plain } = await createVoiceSession(ctx, member, secret, {
      threadId: thread.id,
      conversationId,
      accessToken,
      tokenExpiresAt: expiresAt,
      surface,
      scope,
      context,
      language,
    });
    log.info("ask_voice_session", {
      tenant_id: tenantId,
      thread: thread.id,
      conversation_id: conversationId,
      surface,
      language,
    });
    return { session: plain, token, conversation_id: conversationId, thread_id: thread.id, title: thread.title };
  },
});
