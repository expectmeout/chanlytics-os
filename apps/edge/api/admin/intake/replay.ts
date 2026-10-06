/**
 * POST /api/admin/intake/replay: a kept delivery knocks on its own door again (decision 0032, 00336).
 *
 * The door is the knock (authorizeAdmin: a signed admin token for this door) and the body (readBody);
 * replayProviderEvent in lib/intake/replay.ts is everything after, handed the doors a delivery may come
 * back to, by the path it came to: the same handlers Vercel routes those paths to.
 */
import { readBody } from "../../../lib/admin-door.js";
import { authorizeAdmin } from "../../../lib/admin-auth.js";
import { adminDoor } from "../../../lib/log.js";
import { pg } from "../../../lib/pg.js";
import { replayProviderEvent } from "../../../lib/intake/replay.js";
import { POST as inboundSms } from "../../inbound-sms.js";
import { POST as smsStatus } from "../../sms-status.js";
import { POST as whatsapp } from "../../whatsapp.js";
import { POST as retellWebhook } from "../../retell-webhook.js";
import { POST as retellInbound } from "../../retell-inbound.js";
import { POST as resendWebhook } from "../../resend-webhook.js";
import { POST as stripeWebhook } from "../../stripe-webhook.js";

const DOORS = {
  "/api/inbound-sms": inboundSms,
  "/api/sms-status": smsStatus,
  "/api/whatsapp": whatsapp,
  "/api/retell-webhook": retellWebhook,
  "/api/retell-inbound": retellInbound,
  "/api/resend-webhook": resendWebhook,
  "/api/stripe-webhook": stripeWebhook,
};

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/intake/replay");
  if (!auth.ok) return auth.response;
  return replayProviderEvent(pg(), await readBody(request), DOORS);
});
