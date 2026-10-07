import {
  AppError,
  ASK_SCOPE_KINDS,
  ASK_SURFACES,
  PageContextSchema,
  type AskLanguage,
  type AskScope,
  type PageContext,
} from "@chanlytics/contracts";
import { write, workspace } from "@/server/route";
import { env } from "@/server/env";
import { log } from "@/server/log";
import { requireUuid } from "@/server/request-guards";
import { callEdge, edgeAnswered, edgeReasonOf, edgeRefusalWords, type EdgeAnswer } from "@/server/edge";
import { readerContext } from "@/server/readers";
import { buildContext } from "@/server/ask/context";
import { createThread, readThread } from "@/server/ask/store";
import { createVoiceSession, tokenExpiry, VOICE_THREAD_TITLE } from "@/server/ask/voice-session";

/**
 * POST /api/v1/ask/voice — a voice conversation with Ask begins, as the signed-in member
 * (docs/superpowers/specs/2026-10-03-ask-spoken-design.md, §3.1).
 *
 * Body: { thread_id?, scope?, surface?, context?, language? }, in the shapes the palette already sends. In order: the
 * thread named is read (one that is not this workspace's is a 404, as a typed question's); the page's context, when
 * sent, is warmed as ask/warm warms it; the edge mints the agent's conversation token with the key only it holds
 * (door B, a signed call); a new thread is made when none was named, titled by its first spoken question later; and
 * one row of ask_voice_sessions is written as the member, carrying the access token this request was verified with,
 * sealed (server/ask/voice-session.ts). That token is how the brain door, called by the vendor with no cookie, runs
 * Ask as this member under RLS: this is the one place in the codebase that reads it back (`auth.getSession`) after
 * the wrapper verified the same token (`getClaims`), and voice-routes.test.mjs pins that it is read once. The plain
 * session id goes to the browser once and never to the log. Answers { session, token, conversation_id, thread_id,
 * title }; the token is good for minutes, so the browser connects at once and asks again on a retry.
 *
 * A refusal at the mint is answered as the model gateway's are: a workspace that may not spend is 402
 * payment_required with the edge's words; a vendor that could not be reached, or an edge without the key, is 503
 * upstream_voice.
 */

// The lists are contracts' own, as the typed route reads them.
const SCOPE_KINDS = new Set<string>(ASK_SCOPE_KINDS);
const SURFACES = new Set<string>(ASK_SURFACES);
/** The edge's mint, bounded under the route's own wait: one round trip to the vendor plus the hop. */
const MINT_TIMEOUT_MS = 15_000;
const DOOR = "/api/admin/voice/session";

/** What the conversation opens with, as the body says it. */
interface Asked {
  threadId: string | null;
  scope: AskScope | null;
  language: AskLanguage;
  context: PageContext | null;
  surface: string | null;
}

/** The scope the conversation opens on, in the palette's shape, else none. */
function scopeAsked(raw: unknown): AskScope | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<AskScope>;
  if (
    typeof s.kind !== "string" ||
    !SCOPE_KINDS.has(s.kind) ||
    typeof s.id !== "string" ||
    !s.id ||
    typeof s.label !== "string"
  )
    return null;
  return { kind: s.kind, id: s.id.slice(0, 120), label: s.label.slice(0, 80) };
}

/**
 * The page the conversation opens on (contracts PageContext), read by its one schema; one the schema refuses is no
 * context, said once in the log, never a refused conversation.
 */
function contextAsked(raw: unknown, tenantId: string): PageContext | null {
  if (raw === undefined || raw === null) return null;
  const read = PageContextSchema.safeParse(raw);
  if (read.success) return read.data;
  const issue = read.error.issues[0];
  log.error("ask_context_refused", {
    tenant_id: tenantId,
    path: issue?.path.join(".") ?? "",
    issue: issue?.message ?? "unreadable",
  });
  return null;
}

function asked(body: Record<string, unknown> | null, tenantId: string): Asked {
  const threadId = typeof body?.thread_id === "string" && body.thread_id ? requireUuid(body.thread_id, "thread") : null;
  const context = contextAsked(body?.context, tenantId);
  const surface =
    typeof body?.surface === "string" && SURFACES.has(body.surface) ? body.surface : (context?.surface ?? null);
  return {
    threadId,
    scope: scopeAsked(body?.scope),
    language: body?.language === "es" ? "es" : "en",
    context,
    surface,
  };
}

/** The edge's no, in the words the Line already knows: the gateway's refusals, answered the same way. */
function refusalOf(a: EdgeAnswer): AppError {
  if (a.status === 402) {
    return new AppError(
      "payment_required",
      edgeRefusalWords(a.body) ?? "Voice is off while this workspace is paused or its plan has ended.",
      402,
    );
  }
  const reason = edgeReasonOf(a);
  return new AppError(
    "upstream_voice",
    reason === "no_provider_key"
      ? "Voice is not set up yet."
      : "The voice agent could not be reached just now. Try again in a moment.",
    503,
    { reason },
  );
}

export const POST = write({
  scope: workspace,
  role: "viewer",
  rate: "voice",
  handle: async ({ ctx, req, member }) => {
    const secret = env.ASK_VOICE_SECRET;
    if (!secret) throw new AppError("upstream_voice", "Voice is not set up on this deployment.", 503);
    const tenantId = member.tenantId;
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
    const a = await callEdge(
      DOOR,
      { tenant_id: tenantId, user_id: ctx.userId },
      { workspace: tenantId, user: ctx.userId, timeoutMs: MINT_TIMEOUT_MS },
    );
    if (!edgeAnswered(a)) {
      log.warn("ask_voice_session_refused", { tenant_id: tenantId, reason: edgeReasonOf(a), status: a.status });
      throw refusalOf(a);
    }
    const token = typeof a.body?.token === "string" ? a.body.token : "";
    const conversationId = typeof a.body?.conversation_id === "string" ? a.body.conversation_id : null;
    if (!token) throw new AppError("upstream_voice", "The voice agent answered no token.", 502);

    // A new thread only once the vendor has said yes: a refused conversation leaves no empty thread behind.
    if (!thread) {
      const made = await createThread(ctx, tenantId, VOICE_THREAD_TITLE, scope);
      thread = { id: made.id, title: made.title };
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
