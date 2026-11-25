import { z } from "zod";
import { AppError, ASK_SPEECH_MAX_CHARS, SPEECH_PURPOSES } from "@chanlytics/contracts";
import { write, workspace } from "@/server/shared/route";
import { log } from "@/server/shared/log";
import { answerAsItCame, edgeConfigured, edgeReasonOf, streamEdge, type EdgeAnswer } from "@/server/shared/edge";
import { DOOR, refusalOf, SPEECH_TIMEOUT_MS, SPEECH_UNREACHED } from "@/server/ask/doors/speech-request";

/**
 * POST /api/v1/ask/speech — words read aloud in Ask's one voice, as the signed-in member
 * (docs/superpowers/specs/2026-10-03-ask-spoken-design.md, §3.5 as amended 4 Oct 2026: the one-way speech).
 *
 * Today's Listen and an answer's Read aloud: the browser sends the words it shows (the brief's line, or an answer's
 * say) and plays what comes back. No agent, no microphone, no session row: nobody speaks back. Body: { text,
 * purpose, before? } where purpose is `brief` or `answer`, and `before` is the words read just before these, where a
 * reading is asked for as two clips (its first sentence, then the rest: bridge/ask/speech.ts), so the vendor
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
    const t0 = Date.now();
    const answer = await streamEdge(
      DOOR,
      { tenant_id: tenantId, user_id: ctx.userId, text, purpose: input.purpose, ...(before ? { before } : {}) },
      { workspace: tenantId, user: ctx.userId, timeoutMs: SPEECH_TIMEOUT_MS },
    );
    if (answer.status === 0) {
      log.warn("ask_speech_refused", {
        tenant_id: tenantId,
        reason: answer.error === "timeout" ? "edge_timeout" : "edge_unreachable",
      });
      throw new AppError("upstream_voice", SPEECH_UNREACHED, 503);
    }
    if (!answer.body) {
      // An answer that is not JSON is none: its status says the rest.
      const edgeAnswer: EdgeAnswer = { status: answer.status, body: answerAsItCame(DOOR, answer.status, answer.json) };
      log.warn("ask_speech_refused", {
        tenant_id: tenantId,
        reason: edgeReasonOf(edgeAnswer),
        status: answer.status,
      });
      throw refusalOf(edgeAnswer);
    }
    log.info("ask_speech", {
      tenant_id: tenantId,
      purpose: input.purpose,
      chars: text.length,
      ttfb_ms: Date.now() - t0,
    });
    return new Response(answer.body, {
      status: 200,
      headers: {
        "content-type": answer.headers?.get("content-type") || "audio/mpeg",
        "cache-control": "private, no-store",
      },
    });
  },
});

export const maxDuration = 60;
