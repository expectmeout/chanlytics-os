/**
 * ElevenLabs Agents, the wire (docs/superpowers/specs/2026-10-03-ask-spoken-design.md, §3.2, §3.6): the agent's
 * conversation token for one browser session, minted on the edge where the key lives; the erase of a conversation
 * once its minutes are written; and the post-call webhook's signature. The agent itself is provisioned from code
 * (tooling/scripts/voice/elevenlabs-agent.mjs) and the custom LLM it calls is the dashboard's brain door, which this
 * module knows nothing of. Every call leaves through providerFetch, bounded and never thrown, and comes back as one of
 * the outcomes a door can answer with: `ok`, `rejected` (the vendor said no; asking again gets the same answer) or
 * `unreachable` (no answer, or "not now": a 429 is the vendor's concurrency or rate limit, sources §9).
 */
import { answerObject, providerFetch, type ProviderReply } from "../provider-fetch";

const ELEVENLABS_API = "https://api.elevenlabs.io";
/** One round trip to the vendor, bounded: a mint while a person waits for the first word, or an erase after the call. */
const ELEVENLABS_TIMEOUT_MS = 10_000;
/**
 * A clip's whole transfer, bounded: the fetch's bound ends the body too (provider-fetch `stream`), so this is how
 * long the vendor, the edge, the dashboard and the browser together have for the longest clip (ASK_SPEECH_MAX_CHARS,
 * about 1.6 MB of MP3) on a slow link; under the dashboard route's own thirty seconds.
 */
const ELEVENLABS_SPEECH_TIMEOUT_MS = 25_000;
/** How far a webhook delivery's clock may be from ours, in seconds: the vendor's own window for a replayed delivery. */
export const ELEVENLABS_WEBHOOK_TOLERANCE_S = 30 * 60;
/** The header the post-call webhook's signature rides in: `t=<unix seconds>,v0=<hex>`. */
export const ELEVENLABS_SIGNATURE_HEADER = "elevenlabs-signature";

export interface ElevenLabsConfig {
  apiKey: string;
  agentId: string;
}

type Deps = Parameters<typeof providerFetch>[3];

export type ConversationMint =
  | { outcome: "ok"; token: string; conversationId: string }
  | { outcome: "rejected" | "unreachable"; status: number; error: string };

/** The vendor's words for a refusal, when it gave any (`detail.message`, or `detail` as a string), else the status. */
function vendorWords(a: ProviderReply): string {
  if (a.error) return a.error;
  const j = answerObject(a);
  const detail = j?.detail;
  if (typeof detail === "string") return detail.slice(0, 200);
  const message = detail && typeof detail === "object" ? (detail as { message?: unknown }).message : null;
  return typeof message === "string" ? message.slice(0, 200) : `status ${a.status}`;
}

const notOk = (a: ProviderReply): { outcome: "rejected" | "unreachable"; status: number; error: string } => ({
  outcome: a.outcome === "refused" ? "rejected" : "unreachable",
  status: a.status,
  error: vendorWords(a),
});

/**
 * A WebRTC conversation token for the private agent, good for one conversation started within minutes (sources §2):
 * `GET /v1/convai/conversation/token?agent_id=…` with the key. The answer names the conversation too, which the
 * post-call webhook will name again.
 */
export async function mintConversationToken(cfg: ElevenLabsConfig, deps?: Deps): Promise<ConversationMint> {
  const url = `${ELEVENLABS_API}/v1/convai/conversation/token?agent_id=${encodeURIComponent(cfg.agentId)}`;
  const a = await providerFetch(
    "elevenlabs",
    url,
    { method: "GET", headers: { "xi-api-key": cfg.apiKey }, timeoutMs: ELEVENLABS_TIMEOUT_MS },
    deps,
  );
  if (a.outcome !== "ok") return notOk(a);
  const j = answerObject(a);
  const token = typeof j?.token === "string" ? j.token : "";
  const conversationId = typeof j?.conversation_id === "string" ? j.conversation_id : "";
  if (!token || !conversationId) return { outcome: "rejected", status: a.status, error: "no token in the answer" };
  return { outcome: "ok", token, conversationId };
}

export type SpeechStream =
  | { outcome: "ok"; body: ReadableStream<Uint8Array>; contentType: string }
  | { outcome: "rejected" | "unreachable"; status: number; error: string };

/**
 * Words spoken, as they are made (`POST /v1/text-to-speech/{voice_id}/stream` with the key): the one-way speech, a
 * brief or an answer read aloud, in Ask's one voice. The vendor's own normaliser reads the figures ("3:30", "12%") as
 * the agent's does (`apply_text_normalization: "on"`); MP3 at 44.1 kHz and 128 kb/s is the format every plan may ask
 * for and every browser plays. The body comes back unread, for the door to hand on as it arrives; the vendor's first
 * byte came in 300 to 550 ms on this account (4 Oct 2026, both models, `apply_text_normalization: on` accepted), so a
 * person hears the first word about when the connection is up.
 */
export async function speakText(
  cfg: Pick<ElevenLabsConfig, "apiKey">,
  input: { voiceId: string; modelId: string; text: string },
  deps?: Deps,
): Promise<SpeechStream> {
  const url = `${ELEVENLABS_API}/v1/text-to-speech/${encodeURIComponent(input.voiceId)}/stream?output_format=mp3_44100_128`;
  const a = await providerFetch(
    "elevenlabs",
    url,
    {
      method: "POST",
      headers: { "xi-api-key": cfg.apiKey, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({ text: input.text, model_id: input.modelId, apply_text_normalization: "on" }),
      timeoutMs: ELEVENLABS_SPEECH_TIMEOUT_MS,
      stream: true,
    },
    deps,
  );
  if (a.outcome !== "ok" || !a.body) return notOk(a);
  return { outcome: "ok", body: a.body, contentType: a.headers?.get("content-type") || "audio/mpeg" };
}

/** The vendor's record of a conversation, erased (`DELETE /v1/convai/conversations/{id}`): what door D does once the minutes are written. */
export async function deleteConversation(
  cfg: Pick<ElevenLabsConfig, "apiKey">,
  conversationId: string,
  deps?: Deps,
): Promise<{ outcome: "ok" | "rejected" | "unreachable"; status: number }> {
  const a = await providerFetch(
    "elevenlabs",
    `${ELEVENLABS_API}/v1/convai/conversations/${encodeURIComponent(conversationId)}`,
    {
      method: "DELETE",
      headers: { "xi-api-key": cfg.apiKey },
      timeoutMs: ELEVENLABS_TIMEOUT_MS,
      idempotent: true,
      tries: 2,
    },
    deps,
  );
  return {
    outcome: a.outcome === "ok" ? "ok" : a.outcome === "refused" ? "rejected" : "unreachable",
    status: a.status,
  };
}

const hexOf = (b: ArrayBuffer): string =>
  Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");

/** Constant-time, so a wrong signature says nothing about how wrong it was. */
function sameBytes(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * The signature the vendor computes for one delivery: HMAC-SHA256, keyed with the webhook's secret, over
 * `<timestamp>.<raw body>`, hex, prefixed `v0=`. Web Crypto, like the Resend, Twilio, Meta and Retell verifiers, so
 * it runs on the edge as it is. Exported because a test signs with it.
 */
export async function elevenLabsWebhookSignature(secret: string, timestamp: string, rawBody: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await globalThis.crypto.subtle.sign("HMAC", key, enc.encode(`${timestamp}.${rawBody}`));
  return `v0=${hexOf(sig)}`;
}

/**
 * Is this delivery the vendor's? The header's `t` within the window of now, and its `v0` the signature over the RAW
 * body as it arrived (a re-serialised one signs differently). It proves who sent the event and nothing about the
 * conversation it names: the door matches that to a session row of its own.
 */
export async function verifyElevenLabsWebhook(
  secret: string | undefined,
  signatureHeader: string | null,
  rawBody: string,
  nowMs: number,
): Promise<boolean> {
  if (!secret || !signatureHeader) return false;
  const fields = new Map<string, string>();
  for (const part of signatureHeader.split(",")) {
    const i = part.indexOf("=");
    if (i > 0) fields.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
  }
  const t = fields.get("t") ?? "";
  const ts = Number(t);
  if (!/^\d+$/.test(t) || !Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > ELEVENLABS_WEBHOOK_TOLERANCE_S)
    return false;
  const v0 = fields.get("v0");
  if (!v0) return false;
  return sameBytes(`v0=${v0}`, await elevenLabsWebhookSignature(secret, t, rawBody));
}
