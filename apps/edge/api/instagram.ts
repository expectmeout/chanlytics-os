/**
 * Chanlytics Messaging's Instagram webhook (the Instagram API with Instagram Login, decision 0001 step 8): GET is Meta's
 * verification handshake, POST the signature-validated event receiver.
 *
 * The door names the request (log.ts `door`: the platform's id for the invocation, never the caller's) and calls
 * receiveInstagramEvent in lib/instagram/webhook.ts, which holds everything the request does: the signature is checked
 * against the app's secrets (fail-closed), each item routed by the Instagram account it was written to, a person's DM
 * recorded and answered by its job, the team's own replies from the Instagram app kept and pausing the receptionist.
 */
import { text } from "../lib/http.js";
import { env } from "../lib/env.js";
import { door } from "../lib/log.js";
import { receiveInstagramEvent } from "../lib/instagram/webhook.js";

export const GET = door(function GET(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams;
  const token = env.INSTAGRAM_VERIFY_TOKEN;
  if (token && q.get("hub.mode") === "subscribe" && q.get("hub.verify_token") === token) {
    return Promise.resolve(text(200, q.get("hub.challenge") || ""));
  }
  return Promise.resolve(text(403, "verification failed"));
});

export const POST = door(receiveInstagramEvent);
