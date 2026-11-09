/** What Ask's voice door reads from a request, and what a refusal from the edge means. */
import { AppError, type AskLanguage, type AskScope, type PageContext, VOICE_IS_OFF } from "@chanlytics/contracts";
import { requireUuid } from "@/server/shared/request-guards";
import { edgeReasonOf, edgeRefusalWords, type EdgeAnswer } from "@/server/shared/edge";
import { contextAsked, SCOPE_KINDS, SURFACES } from "./turn-request";
import type { TenantId } from "@chanlytics/contracts";

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

/** The edge's mint, bounded under the route's own wait: one round trip to the vendor plus the hop. */
export const MINT_TIMEOUT_MS = 15_000;

export const DOOR = "/api/admin/voice/session";

/** What the conversation opens with, as the body says it. */
export interface Asked {
  threadId: string | null;
  scope: AskScope | null;
  language: AskLanguage;
  context: PageContext | null;
  surface: string | null;
}

/** The scope the conversation opens on, in the palette's shape, else none. */
export function scopeAsked(raw: unknown): AskScope | null {
  if (!raw || typeof raw !== "object") return null;
  const askScope = raw as Partial<AskScope>;
  if (
    typeof askScope.kind !== "string" ||
    !SCOPE_KINDS.has(askScope.kind) ||
    typeof askScope.id !== "string" ||
    !askScope.id ||
    typeof askScope.label !== "string"
  )
    return null;
  return { kind: askScope.kind, id: askScope.id.slice(0, 120), label: askScope.label.slice(0, 80) };
}

export function asked(body: Record<string, unknown> | null, tenantId: TenantId): Asked {
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
export function refusalOf(edgeAnswer: EdgeAnswer): AppError {
  if (edgeAnswer.status === 402) {
    return new AppError("payment_required", edgeRefusalWords(edgeAnswer.body) ?? VOICE_IS_OFF, 402);
  }
  const reason = edgeReasonOf(edgeAnswer);
  return new AppError(
    "upstream_voice",
    reason === "no_provider_key"
      ? "Voice is not set up yet."
      : "The voice agent could not be reached just now. Try again in a moment.",
    503,
    { reason },
  );
}
