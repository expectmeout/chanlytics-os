import { AppError } from "@chanlytics/contracts";
import { write, workspace } from "@/server/route";
import { recordDecision } from "@/server/verbs";
import { connectWhatsApp } from "@/server/connections/whatsapp";

/**
 * POST /api/v1/channels/whatsapp/connect — the owner's number becomes a
 * channel of the workspace.
 *
 * Body: what Embedded Signup gave the browser — { code } and, where the
 * browser heard them, { phone_number_id, waba_id }; the edge reads an id the
 * browser did not hear from the token's own grant. { keep_app: true } when the
 * business keeps its WhatsApp Business app (coexistence, decision 0073, R12):
 * the number is not registered again, and its contacts and chats are asked
 * for (R21). Owner only, rate-limited
 * with the other settings changes. The edge does the exchange, the
 * registration and the Vault write; this route proves who is asking, keeps
 * the ledger, and says what happened in the owner's words.
 */
const ID = /^\d{6,32}$/;

const SAID: Record<string, string> = {
  preview: "Connecting only works on the production dashboard.",
  number_taken: "That number is already connected to another workspace.",
  channel_read_failed:
    "Chanlytics could not check whether that number is already connected, so nothing was changed. Try again in a moment.",
  exchange_failed: "Meta did not accept the sign-up code. Start the connection again.",
  grant_unreadable: "Meta did not say which WhatsApp account the sign-up granted. Start the connection again.",
  waba_not_granted:
    "The sign-up granted Chanlytics no WhatsApp Business Account. Start it again and share the account when Meta asks.",
  number_missing: "The account has no phone number yet. Start the sign-up again and add the number when Meta asks.",
  number_ambiguous:
    "The account has several numbers and the sign-up window did not say which. Start it again and pick the number to connect.",
  number_unreadable:
    "Meta did not let Chanlytics read that number. Check that the number was selected in the sign-up window.",
  waba_unreadable:
    "Meta did not let Chanlytics read the WhatsApp Business Account. Check that it was shared in the sign-up window.",
  subscribe_failed: "Chanlytics could not subscribe to the account's messages. Try again in a moment.",
  register_failed:
    "The number could not be registered for messaging. If it is still in use by the WhatsApp app on a phone, remove it there first.",
  pin_required:
    "This number has two-step verification on, and Chanlytics cannot register it without that PIN. Turn two-step verification off in WhatsApp Manager, connect again, then turn it back on.",
  credentials_failed: "The connection could not be saved safely, so it was not kept. Try again.",
  channel_write_failed: "The connection could not be saved. Try again.",
  no_app_credentials: "Chanlytics is not set up to connect numbers yet.",
};

export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "settings",
  handle: async ({ ctx, req, member }) => {
    const body = (await req.json().catch(() => null)) as {
      code?: unknown;
      phone_number_id?: unknown;
      waba_id?: unknown;
      keep_app?: unknown;
    } | null;
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    const phoneNumberId = typeof body?.phone_number_id === "string" ? body.phone_number_id.trim() : "";
    const wabaId = typeof body?.waba_id === "string" ? body.waba_id.trim() : "";
    if (!code || code.length > 2000)
      throw new AppError("validation", "The sign-up code is missing. Start the connection again.");
    // An id is Meta's or absent: the browser sends what the sign-up window said, and the edge finds the rest.
    if ((phoneNumberId && !ID.test(phoneNumberId)) || (wabaId && !ID.test(wabaId)))
      throw new AppError(
        "validation",
        "The sign-up window handed back an account or a number Chanlytics cannot read. Start the connection again.",
      );

    const r = await connectWhatsApp(member.tenantId, ctx.userId, {
      code,
      ...(phoneNumberId ? { phone_number_id: phoneNumberId } : {}),
      ...(wabaId ? { waba_id: wabaId } : {}),
      ...(body?.keep_app === true ? { keep_app: true as const } : {}),
    });
    if (!r.ok) {
      const said = SAID[r.reason] ?? `The connection did not complete (${r.reason}).`;
      throw new AppError(
        r.reason === "number_taken" ? "conflict" : "upstream_meta",
        said,
        r.reason === "number_taken" ? 409 : 502,
      );
    }
    const decisionId = await recordDecision(ctx, member.tenantId, "channel", r.channelId, "connect_channel", {
      kind: "whatsapp",
      phone_number_id: r.phoneNumberId,
      waba_id: r.wabaId,
      ids_from: r.idsFrom,
      number_e164: r.numberE164,
      verified_name: r.verifiedName,
      registration: r.registration,
      keep_app: body?.keep_app === true,
    });
    return {
      ok: true,
      channel_id: r.channelId,
      number_e164: r.numberE164,
      verified_name: r.verifiedName,
      quality_rating: r.qualityRating,
      decision_id: decisionId,
    };
  },
});
