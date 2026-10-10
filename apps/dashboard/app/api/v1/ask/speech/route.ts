import { z } from "zod";
import { AppError, ASK_SPEECH_MAX_CHARS, MIN_MS, SPEECH_PURPOSES } from "@chanlytics/contracts";
import { write, workspace } from "@/server/route";
import { log } from "@/server/log";
import { edgeHeaders, edgeUrl, edgeConfigured, edgeReasonOf, edgeRefusalWords, type EdgeAnswer } from "@/server/edge";

/**
 * POST /api/v1/ask/speech — words read aloud in Ask's one voice, as the signed-in member
 * (docs/superpowers/specs/2026-10-03-ask-spoken-design.md, §3.5 as amended 4 Oct 2026: the one-way speech).
 *
 * Today's Listen and an answer's Read aloud: the browser sends the words it shows (the brief's line, or an answer's
 * say) and plays what comes back. No agent, no microphone, no session row: nobody speaks back. Body: { text,
 * purpose, before? } where purpose is `brief` or `answer`, and `before` is the words read just before these, where a
 * reading is asked for as two clips (its first sentence, then the rest: legacy-bridge/ask/speech.ts), so the vendor
 * reads the second as carrying on from the first. The text is bounded (ASK_SPEECH_MAX_CHARS) and whitespace-folded
 * here; the edge, which holds the vendor's key, bounds it again. The answer is the audio itself, MP3, streamed as the
 * vendor makes it (door E, apps/edge/api/admin/voice/speech.ts), so the browser hears the first word about when the
 * connection is up; the wrapper's envelope is for JSON and a Response passes it by, as the Ask stream's does.
 *
 * A refusal is answered as the voice mint's are: a workspace that may not spend is 402 payment_required with the
 * edge's words; a vendor that could not be reached, or an edge without the key, is 503 upstream_voice. Counted as
 * `speech` (a hundred and twenty an hour a person, two to a reading of more than one sentence): a brief is read a
 * few times a day, an answer once.
 */
const Input = z.object({
  text: z.string().min(1).max(ASK_SPEECH_MAX_CHARS),
  purpose: z.enum(SPEECH_PURPOSES),
  before: z.string().max(ASK_SPEECH_MAX_CHARS).optional(),
});

const DOOR = "/api/admin/voice/speech";
/** The edge's call to the vendor, bounded under the route's own minute: the whole clip streams inside half of it. */
const SPEECH_TIMEOUT_MS = MIN_MS / 2;

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
      : "Ask's voice could not be reached just now. Try again in a moment.",
    503,
    { reason },
  );
}

export const POST = write({
  scope: workspace,
  role: "viewer",
  rate: "speech",
  input: Input,
  handle: async ({ ctx, member, input }) => {
    if (!edgeConfigured()) throw new AppError("upstream_voice", "Voice is not set up on this deployment.", 503);
    const tenantId = member.tenantId;
    const text = input.text.replace(/\s+/g, " ").trim();
    if (!text) throw new AppError("validation", "text: nothing to say", 400);
    const before = input.before?.replace(/\s+/g, " ").trim();
    const body = JSON.stringify({
      tenant_id: tenantId,
      user_id: ctx.userId,
      text,
      purpose: input.purpose,
      ...(before ? { before } : {}),
    });
    const t0 = Date.now();
    let r: Response;
    try {
      r = await fetch(`${edgeUrl()}${DOOR}`, {
        method: "POST",
        headers: edgeHeaders(DOOR, { workspace: tenantId, user: ctx.userId, body }),
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(SPEECH_TIMEOUT_MS),
      });
    } catch (e) {
      const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      log.warn("ask_speech_refused", { tenant_id: tenantId, reason: timedOut ? "edge_timeout" : "edge_unreachable" });
      throw new AppError("upstream_voice", "Ask's voice could not be reached just now. Try again in a moment.", 503);
    }
    if (!r.ok || !r.body) {
      const parsed: unknown = await r.json().catch(() => null);
      const a: EdgeAnswer = {
        status: r.status,
        body:
          parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
            ? (parsed as EdgeAnswer["body"])
            : null,
      };
      log.warn("ask_speech_refused", { tenant_id: tenantId, reason: edgeReasonOf(a), status: r.status });
      throw refusalOf(a);
    }
    log.info("ask_speech", {
      tenant_id: tenantId,
      purpose: input.purpose,
      chars: text.length,
      ttfb_ms: Date.now() - t0,
    });
    return new Response(r.body, {
      status: 200,
      headers: {
        "content-type": r.headers.get("content-type") || "audio/mpeg",
        "cache-control": "private, no-store",
      },
    });
  },
});

export const dynamic = "force-dynamic";
export const maxDuration = 60;
