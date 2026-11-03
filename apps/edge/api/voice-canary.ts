/**
 * POST /api/voice-canary: the daily canary call (decision 0092). `{ op: "place" }` rings a workspace of ours from
 * the platform's number; `{ op: "verdict", since }` judges what that call left behind.
 *
 * The door is the knock (canaryKeyMatches: the canary's own key, x-canary-key, never a platform token) and the body
 * (readBody); voiceCanary in lib/voice/watch/voice-canary.ts is everything after. It is no admin door: its key opens this door
 * alone, which can ring only a line of ours and read what that call left, as /api/diag's key opens the diagnostic.
 */
import { readBody } from "../lib/admin-door.js";
import { refuse } from "../lib/http.js";
import { door } from "../lib/log.js";
import { canaryKeyMatches, voiceCanary } from "../lib/voice/watch/voice-canary.js";

export const POST = door(async function POST(request: Request): Promise<Response> {
  if (!canaryKeyMatches(request)) return refuse(401, "unauthorized");
  return voiceCanary(await readBody(request));
});
