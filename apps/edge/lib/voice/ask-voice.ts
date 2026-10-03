/**
 * Ask, spoken, on the edge (docs/superpowers/specs/2026-10-03-ask-spoken-design.md, §3.2, §3.6): what the two doors
 * call, so each door holds no provider client and no repository of its own (a route file is a door: route-doors).
 * The key, the agent's id and the webhook's secret are this edge's (lib/env.ts), as every provider's are.
 *
 *   - The mint (door B, api/admin/voice/session.ts): the agent's conversation token for one member's conversation,
 *     through the ElevenLabs port.
 *   - The post-call webhook (door D, api/elevenlabs-webhook.ts): whether a delivery is the vendor's, the session row
 *     the conversation names ended with its minutes once, and the vendor's record erased after.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "../env.js";
import {
  deleteConversation,
  mintConversationToken,
  verifyElevenLabsWebhook,
  ELEVENLABS_SIGNATURE_HEADER,
  type ConversationMint,
} from "../packages/channels.js";
import {
  endVoiceSession,
  readVoiceSessionByConversation,
  type Database,
  type VoiceSessionRow,
} from "../packages/db.js";

type Db = SupabaseClient<Database>;

/** Whether this edge holds what a mint needs: the key and the agent. */
export function askVoiceConfigured(): boolean {
  return !!(env.ELEVENLABS_API_KEY && env.ELEVENLABS_AGENT_ID);
}

/** The agent's WebRTC conversation token for one conversation, through the ElevenLabs port; null on an edge without the key. */
export async function mintAskVoiceSession(): Promise<ConversationMint | null> {
  const apiKey = env.ELEVENLABS_API_KEY;
  const agentId = env.ELEVENLABS_AGENT_ID;
  if (!apiKey || !agentId) return null;
  return mintConversationToken({ apiKey, agentId });
}

/** Whether this edge holds the webhook's secret: without it there is no post-call door. */
export const askVoiceWebhookConfigured = (): boolean => !!env.ELEVENLABS_WEBHOOK_SECRET;

/** Whether a post-call delivery is the vendor's: its signature over the raw body, with the secret this edge holds. */
export function askVoiceWebhookSigned(headers: Headers, rawBody: string, nowMs: number): Promise<boolean> {
  return verifyElevenLabsWebhook(
    env.ELEVENLABS_WEBHOOK_SECRET,
    headers.get(ELEVENLABS_SIGNATURE_HEADER),
    rawBody,
    nowMs,
  );
}

export type AskVoiceEnd =
  /** No row names this conversation: another agent's, or one already swept. */
  | { kind: "unknown" }
  /** The minutes were written already: the vendor delivered again. */
  | { kind: "repeated"; row: VoiceSessionRow }
  | { kind: "ended"; row: VoiceSessionRow };

/**
 * The conversation's row ended with its minutes, once however often the vendor delivers; an end the browser wrote
 * first stands. Throws when the database could not be read or written, for the door to answer 503 with.
 */
export async function endAskVoiceConversation(
  db: Db,
  conversationId: string,
  durationS: number,
  nowIso: string,
): Promise<AskVoiceEnd> {
  const row = await readVoiceSessionByConversation(db, conversationId);
  if (!row) return { kind: "unknown" };
  if (row.duration_s !== null) return { kind: "repeated", row };
  await endVoiceSession(db, row.id, { endedAt: row.ended_at ?? nowIso, durationS });
  return { kind: "ended", row };
}

/** The vendor's record erased once the minutes are written (the transcript names customers); null on an edge without the key. */
export async function eraseAskVoiceConversation(
  conversationId: string,
): Promise<Awaited<ReturnType<typeof deleteConversation>> | null> {
  const apiKey = env.ELEVENLABS_API_KEY;
  if (!apiKey) return null;
  return deleteConversation({ apiKey }, conversationId);
}
