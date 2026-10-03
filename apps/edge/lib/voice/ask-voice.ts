/**
 * Ask, spoken, on the edge: the one thing the dashboard may not do for itself, the agent's conversation token minted
 * with the provider's key (docs/superpowers/specs/2026-10-03-ask-spoken-design.md, §3.2). The voice-session door
 * calls this and holds no provider client of its own (a route file is a door: route-doors). The key and the agent's id
 * are this edge's (lib/env.ts), as every provider's are.
 */
import { env } from "../env.js";
import { mintConversationToken, type ConversationMint } from "../packages/channels.js";

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
