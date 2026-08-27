/**
 * Retell custom function: send_booking_link
 * Mid-call, the voice agent calls this to text the caller our Booksy booking link
 * on WhatsApp via the APPROVED booking_link_v1 utility template (no session window needed).
 * Returns a short string the voice agent speaks from.
 */
import { json } from "../lib/http.js";

const BOOKSY = "booksy.com/en-us/1817434_melany-s-beauty-salon_hair-salon_29902_brooklyn";

export async function POST(request: Request): Promise<Response> {
  const raw = await request.text();
  // Retell custom-function calls are authenticated via the shared-secret header
  // configured on the tool (Retell does not HMAC-sign these like webhooks).
  if (request.headers.get("x-fn-secret") !== process.env.RETELL_FN_SECRET) {
    return json(401, { ok: false, error: "bad_secret" });
  }

  let body: { call?: { call_id?: string; from_number?: string }; args?: { phone_number?: string } } = {};
  try { body = JSON.parse(raw); } catch { /* fall through with empty body */ }
  const call = body.call || {};
  const args = body.args || {};
  // caller's number, unless the agent collected a different one
  const target = String(args.phone_number || call.from_number || "").replace(/[^\d]/g, "");
  console.log("retell_fn_send_booking_link", JSON.stringify({ target, call_id: call.call_id }));

  if (!target || target.length < 10) {
    return json(200, { result: "Could not determine a valid phone number. Ask the caller to text the salon on WhatsApp at 646-932-5775 instead." });
  }

  const r = await fetch(`https://graph.facebook.com/v25.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: target,
      type: "template",
      template: {
        name: "booking_link_v1",
        language: { code: "en_US" },
        components: [{
          type: "body",
          parameters: [
            { type: "text", text: "Melany's Beauty Salon" },
            { type: "text", text: BOOKSY },
          ],
        }],
      },
    }),
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error("booking_link_send_failed", r.status, JSON.stringify(out).slice(0, 200));
    return json(200, { result: "The WhatsApp message could not be sent (the number may not have WhatsApp). Tell the caller they can book at booksy dot com, or text the salon's WhatsApp at 646-932-5775." });
  }
  return json(200, { result: "Booking link sent to the caller's WhatsApp successfully. Confirm they should see it momentarily." });
}
