/**
 * Gemini's generateContent, the wire (decision 0099, stage B, D8 and D15; Google's "Audio understanding", "Structured output"
 * and "Generate content" pages, read 7 Nov 2026): a video's sound sent inline with what it is asked, and an answer in the JSON
 * shape it was given. Claude cannot hear; this is the ear that writes down what a clip says and how it sounds.
 *
 * generateContent and not the Interactions API, which keeps what it is sent for 55 days by default: a call here is kept by
 * nobody. The key is the edge's alone and is made on a project with billing on, where Google does not use what it is sent to
 * improve its products. A request carries at most 20 MB, the audio's base64 included, so a sound much over 14 MB is not sent:
 * at Stream's audio rate that is past the clip cap. Nothing here knows a row or a workspace.
 */
import { isObjectRecord, recordOrEmpty } from "@chanlytics/contracts";
import { answerObject, fetchFromProvider, type ProviderReply } from "../shared/provider-fetch";
import type { ModelDeps } from "./anthropic";

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";
/** The most of a sound sent inline: its base64 and the rest of the request inside Google's 20 MB. */
export const GEMINI_INLINE_BYTES = 14_000_000;

export interface GeminiAsked {
  model: string;
  system: string;
  prompt: string;
  audio: { bytes: Uint8Array; mime: string };
  /** The answer's JSON shape (responseJsonSchema); null for an answer in words. */
  schema: object | null;
  maxOutputTokens: number;
  timeoutMs: number;
}

export type GeminiAnswer =
  | { ok: true; text: string; json: unknown; input: number; output: number }
  | { ok: false; error: string; retryable: boolean; input: number; output: number };

/** What the answer cost, as Google counts it: the output's thinking is billed as output. */
function geminiUsageOf(j: Record<string, unknown> | null): { input: number; output: number } {
  const u = j && typeof j.usageMetadata === "object" && j.usageMetadata ? recordOrEmpty(j.usageMetadata) : {};
  const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  return { input: n(u.promptTokenCount), output: n(u.candidatesTokenCount) + n(u.thoughtsTokenCount) };
}

/** A call Gemini refused or never answered, in a line: its own words where it gave some, and whether asking again may help. */
function refusedOf(
  reply: ProviderReply,
  answerJson: Record<string, unknown> | null,
): { ok: false; error: string; retryable: boolean } {
  const err = isObjectRecord(answerJson?.error) ? answerJson.error : null;
  const detailText = typeof err?.message === "string" ? `: ${err.message.slice(0, 200)}` : "";
  return {
    ok: false,
    error: reply.error ?? `status ${reply.status}${detailText}`,
    retryable: reply.outcome === "retryable" || reply.outcome === "unknown",
  };
}

/** The first candidate's words, its parts' text joined, and why it stopped. */
function firstCandidateOf(answerJson: Record<string, unknown> | null): { text: string; finish: string | null } {
  const candidates: unknown[] = answerJson && Array.isArray(answerJson.candidates) ? answerJson.candidates : [];
  const first = isObjectRecord(candidates[0]) ? candidates[0] : null;
  const rawParts = isObjectRecord(first?.content) ? first.content.parts : undefined;
  const parts: unknown[] = Array.isArray(rawParts) ? rawParts : [];
  const text = parts
    .map((part) => (isObjectRecord(part) && typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();
  return { text, finish: typeof first?.finishReason === "string" ? first.finishReason : null };
}

/** One question about a sound, answered once: a refusal, a block or an empty answer is said as one, never retried blind. */
export async function askGemini(key: string, request: GeminiAsked, deps: ModelDeps = {}): Promise<GeminiAnswer> {
  if (request.audio.bytes.length > GEMINI_INLINE_BYTES)
    return { ok: false, error: "the sound is too long to send inline", retryable: false, input: 0, output: 0 };
  const body = {
    systemInstruction: { parts: [{ text: request.system }] },
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: request.audio.mime, data: Buffer.from(request.audio.bytes).toString("base64") } },
          { text: request.prompt },
        ],
      },
    ],
    generationConfig: {
      maxOutputTokens: request.maxOutputTokens,
      ...(request.schema ? { responseMimeType: "application/json", responseJsonSchema: request.schema } : {}),
    },
  };
  const reply = await fetchFromProvider(
    "gemini",
    `${GEMINI_URL}/${encodeURIComponent(request.model)}:generateContent`,
    {
      method: "POST",
      headers: { "x-goog-api-key": key, "content-type": "application/json" },
      body: JSON.stringify(body),
      timeoutMs: request.timeoutMs,
    },
    deps,
  );
  const answerJson = answerObject(reply);
  const used = geminiUsageOf(answerJson);
  if (reply.outcome !== "ok") return { ...refusedOf(reply, answerJson), ...used };
  const feedback = answerJson?.promptFeedback as { blockReason?: unknown } | undefined;
  if (typeof feedback?.blockReason === "string")
    return { ok: false, error: `blocked: ${feedback.blockReason}`, retryable: false, ...used };
  const { text, finish } = firstCandidateOf(answerJson);
  if (!text) {
    const reason = finish ?? "no answer";
    return { ok: false, error: `empty: ${reason}`, retryable: reason === "no answer", ...used };
  }
  if (!request.schema) return { ok: true, text, json: null, ...used };
  try {
    return { ok: true, text, json: JSON.parse(text) as unknown, ...used };
  } catch {
    // An answer cut at its length is not JSON: said as a failure, and the step's retries ask again.
    return { ok: false, error: `not json (${finish ?? ""})`, retryable: true, ...used };
  }
}
