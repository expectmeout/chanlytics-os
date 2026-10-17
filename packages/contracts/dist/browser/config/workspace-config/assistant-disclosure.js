import { DAY_MS } from "../../shared/time.js";
export const CONVERSATION_UNDER_WAY = "This conversation is already under way.";
export const CONVERSATION_GAP_MS = DAY_MS;
export function disclosureFacts(p, channel, now) {
  if (channel === "voice" || !p.returning || !p.lastTurnAt) return [];
  const at = Date.parse(p.lastTurnAt);
  return Number.isFinite(at) && now.getTime() - at < CONVERSATION_GAP_MS ? [CONVERSATION_UNDER_WAY] : [];
}
