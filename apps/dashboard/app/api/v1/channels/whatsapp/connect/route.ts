import { z } from "zod";
import { AppError } from "@chanlytics/contracts";
import { write, workspace } from "@/server/shared/route";
import { recordDecision } from "@/server/shared/verbs";
import { connectWhatsApp } from "@/server/connections/whatsapp";
import { REASON_WORDS } from "@/server/connections/whatsapp-connect-words";

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
 * the ledger, and says what happened in the owner's words. Nothing is filed as
 * the number arrives: a starter goes to WhatsApp the first time something uses
 * it (the clean list, 14 Nov 2026), never the whole set at once.
 */
const ID = /^\d{6,32}$/;

export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "settings",
  input: z.object({
    code: z.string().nullish(),
    phone_number_id: z.string().nullish(),
    waba_id: z.string().nullish(),
    keep_app: z.boolean().nullish(),
  }),
  handle: async ({ ctx, input, member }) => {
    const code = (input.code ?? "").trim();
    const phoneNumberId = (input.phone_number_id ?? "").trim();
    const wabaId = (input.waba_id ?? "").trim();
    if (!code || code.length > 2000)
      throw new AppError("validation", "The sign-up code is missing. Start the connection again.");
    // An id is Meta's or absent: the browser sends what the sign-up window said, and the edge finds the rest.
    if ((phoneNumberId && !ID.test(phoneNumberId)) || (wabaId && !ID.test(wabaId)))
      throw new AppError(
        "validation",
        "The sign-up window handed back an account or a number Chanlytics cannot read. Start the connection again.",
      );

    const item = await connectWhatsApp(member.tenantId, ctx.userId, {
      code,
      ...(phoneNumberId ? { phone_number_id: phoneNumberId } : {}),
      ...(wabaId ? { waba_id: wabaId } : {}),
      ...(input.keep_app === true ? { keep_app: true as const } : {}),
    });
    if (!item.ok) {
      const sentence = REASON_WORDS[item.reason] ?? `The connection did not complete (${item.reason}).`;
      throw new AppError(
        item.reason === "number_taken" ? "conflict" : "upstream_meta",
        sentence,
        item.reason === "number_taken" ? 409 : 502,
      );
    }
    const decisionId = await recordDecision(ctx, member.tenantId, "channel", item.channelId, "connect_channel", {
      kind: "whatsapp",
      phone_number_id: item.phoneNumberId,
      waba_id: item.wabaId,
      ids_from: item.idsFrom,
      number_e164: item.numberE164,
      verified_name: item.verifiedName,
      registration: item.registration,
      keep_app: input.keep_app === true,
    });
    return {
      ok: true,
      channel_id: item.channelId,
      number_e164: item.numberE164,
      verified_name: item.verifiedName,
      quality_rating: item.qualityRating,
      decision_id: decisionId,
    };
  },
});
