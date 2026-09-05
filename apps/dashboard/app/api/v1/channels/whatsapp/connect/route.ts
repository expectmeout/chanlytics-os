import { AppError } from "@chanlytics/contracts";
import { withRoute, memberContext, requireRole } from "@/server/with-route";
import { recordDecision } from "@/server/verbs";
import { connectWhatsApp } from "@/server/service";
import { takeRate } from "@/server/rate-limit";

/**
 * POST /api/v1/channels/whatsapp/connect — the owner's number becomes a
 * channel of the workspace.
 *
 * Body: what Embedded Signup gave the browser — { code, phone_number_id,
 * waba_id }. Owner only, rate-limited with the other settings changes. The
 * edge does the exchange, the registration and the Vault write; this route
 * proves who is asking, keeps the ledger, and says what happened in the
 * owner's words.
 */
const ID = /^\d{6,32}$/;

const SAID: Record<string, string> = {
  preview: "Connecting only works on the production dashboard.",
  number_taken: "That number is already connected to another workspace.",
  exchange_failed: "Meta did not accept the sign-up code. Start the connection again.",
  number_unreadable: "Meta did not let Chanlytics read that number. Check that the number was selected in the sign-up window.",
  waba_unreadable: "Meta did not let Chanlytics read the WhatsApp Business Account. Check that it was shared in the sign-up window.",
  subscribe_failed: "Chanlytics could not subscribe to the account's messages. Try again in a moment.",
  register_failed: "The number could not be registered for messaging. If it is still in use by the WhatsApp app on a phone, remove it there first.",
  credentials_failed: "The connection could not be saved safely, so it was not kept. Try again.",
  channel_write_failed: "The connection could not be saved. Try again.",
  no_app_credentials: "Chanlytics is not set up to connect numbers yet.",
};

export const POST = withRoute(async (req, ctx) => {
  const member = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  requireRole(member, "owner");
  takeRate(ctx.userId, "settings");
  const body = (await req.json().catch(() => null)) as { code?: unknown; phone_number_id?: unknown; waba_id?: unknown } | null;
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  const phoneNumberId = typeof body?.phone_number_id === "string" ? body.phone_number_id.trim() : "";
  const wabaId = typeof body?.waba_id === "string" ? body.waba_id.trim() : "";
  if (!code || code.length > 2000) throw new AppError("validation", "The sign-up code is missing. Start the connection again.");
  if (!ID.test(phoneNumberId) || !ID.test(wabaId)) throw new AppError("validation", "The sign-up window did not hand back a number and an account. Start the connection again.");

  const r = await connectWhatsApp(member.tenantId, ctx.userId, { code, phone_number_id: phoneNumberId, waba_id: wabaId });
  if (!r.ok) {
    const said = SAID[r.reason] ?? `The connection did not complete (${r.reason}).`;
    throw new AppError(r.reason === "number_taken" ? "conflict" : "upstream_meta", said, r.reason === "number_taken" ? 409 : 502);
  }
  const decisionId = await recordDecision(ctx, member.tenantId, "channel", r.channelId, "connect_channel", {
    kind: "whatsapp", phone_number_id: phoneNumberId, waba_id: wabaId, number_e164: r.numberE164, verified_name: r.verifiedName, registration: r.registration,
  });
  return { ok: true, channel_id: r.channelId, number_e164: r.numberE164, verified_name: r.verifiedName, quality_rating: r.qualityRating, decision_id: decisionId };
});
