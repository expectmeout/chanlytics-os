/**
 * Chanlytics Messaging's WhatsApp Cloud API webhook (app: Chanlytics AI): GET is Meta's verification handshake, POST
 * the signature-validated event receiver.
 *
 * The door names the request (log.ts `door`: the platform's id for the invocation, never the caller's) and calls
 * receiveWhatsappEvent in lib/whatsapp/webhook.ts, which holds everything the request does, in the order the door had
 * it: the signature is checked against the app secret (fail-closed), each change routed by its phone number id or its
 * WABA, and the message path run process-then-200.
 */
import { text } from "../lib/http.js";
import { env } from "../lib/env.js";
import { door } from "../lib/log.js";
import { receiveWhatsappEvent } from "../lib/whatsapp/webhook.js";

export const GET = door(async function GET(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams;
  if (q.get("hub.mode") === "subscribe" && q.get("hub.verify_token") === env.WHATSAPP_VERIFY_TOKEN) {
    return text(200, q.get("hub.challenge") || "");
  }
  return text(403, "verification failed");
});

export const POST = door(receiveWhatsappEvent);
