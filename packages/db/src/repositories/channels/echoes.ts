/**
 * The business's own words on a thread, written from another app than ours: an owner's reply from the WhatsApp Business
 * app (coexistence, decision 0073) or from the Instagram app (decision 0001, step 8), which Meta echoes back. Kept as a
 * person's words, it pauses the receptionist on the thread for the workspace's own hours and settles the holds it
 * answers, once per echo.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { conversationPatch } from "@chanlytics/contracts";
import type { Database } from "../../database.types";
import { emitEvent } from "../../events";
import { dbLog } from "../../observe";
import { settleByEcho } from "../control";
import { getOrCreateContact } from "../ingest";

type Db = SupabaseClient<Database>;

/** Owner replied from the WhatsApp Business app or the Instagram app: persist the echo + pause the bot.
 *  Upserts the contact/conversation — an owner-INITIATED thread (customer never
 *  messaged yet) must still record the message and the pause, or the
 *  receptionist answers over the person who just replied.
 *
 *  True when the echo is kept with its pause, or was already (a redelivery); false when a write the database refused
 *  left either undone, which the door answers with a 503 so Meta sends it again (this answered nothing, and the door
 *  acknowledged echoes it had not kept). A pause that fails takes the kept words back out, so the redelivery pauses. */
export async function recordEchoAndPause(
  db: Db,
  p: {
    tenantId: string;
    /** Who the owner wrote to on WhatsApp: the number's digits, the person found or made by them. */
    customerPhoneDigits?: string;
    /**
     * Who the owner wrote to on a wire with no number (an Instagram DM, decision 0001 step 8): the person's own row,
     * found by their Instagram-scoped id. Takes the place of the digits.
     */
    customerId?: string;
    /** The wire the owner wrote on: the WhatsApp Business app, or the Instagram app. WhatsApp unless said. */
    channel?: "whatsapp" | "instagram";
    body: string | null;
    externalId: string | null;
    pausedUntilIso: string;
    /** The hold reasons a typed reply settles (contracts WAITING_REASONS): its open holds of these are resolved (00438). */
    settles: readonly string[];
  },
): Promise<boolean> {
  // Was an .upsert on the PARTIAL unique index, which PostgREST cannot target —
  // so for any customer without an existing contact row this failed, logged,
  // and returned. The owner's reply from the WhatsApp Business app was never
  // recorded and the AI pause never reached Postgres, which is precisely the
  // divergence this function exists to prevent.
  let contact: { id: string };
  try {
    if (p.customerId) contact = { id: p.customerId };
    else if (p.customerPhoneDigits)
      contact = await getOrCreateContact(db, p.tenantId, `+${p.customerPhoneDigits.replace(/^\+/, "")}`);
    else throw new Error("an echo names neither the number nor the person it was written to");
  } catch (e) {
    dbLog().error("record_echo_contact_failed", {
      tenant_id: p.tenantId,
      error: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
  // The thread, without moving anything on it yet. Meta redelivers a webhook it
  // could not deliver for up to seven days, and this used to pause the thread
  // BEFORE the message insert told it whether the echo was new -- so every
  // redelivery slid `paused_until` forward by another full pause window, muting
  // the receptionist for longer than the owner's setting says, with nothing on
  // any page to explain it. The message is written first now, and its own
  // uniqueness on (tenant_id, external_id) is what says "seen this already".
  const { data: conv, error: verr } = await db
    .from("conversations")
    .upsert({ tenant_id: p.tenantId, contact_id: contact.id }, { onConflict: "tenant_id,contact_id" })
    .select("id")
    .single();
  if (verr || !conv) {
    dbLog().error("record_echo_conv_failed", { tenant_id: p.tenantId, error: verr?.message ?? "no row" });
    return false;
  }
  const { error } = await db.from("messages").insert({
    tenant_id: p.tenantId,
    conversation_id: conv.id,
    contact_id: contact.id,
    channel: p.channel ?? "whatsapp",
    direction: "outbound",
    sender: "human",
    type: "text",
    body: p.body,
    external_id: p.externalId,
    status: "sent",
    meta: { echo: true },
  });
  if (error && error.code !== "23505")
    dbLog().error("record_echo_failed", { tenant_id: p.tenantId, conversation_id: conv.id, error: error.message });
  // An echo we have already stored changes nothing else: the owner spoke once.
  // An echo carrying no id of its own cannot be told apart from its own replay,
  // so it still pauses -- a receptionist talking over the owner is the worse of
  // the two failures, and it is what this function exists to prevent.
  // A redelivery still asks for the settle: the first try may have kept the echo and failed it (settleByEcho).
  if (error?.code === "23505" && p.externalId) return settleByEcho(db, p);
  const { error: perr } = await db
    .from("conversations")
    .update(conversationPatch("owner_echo", { until: p.pausedUntilIso, now: new Date().toISOString() }))
    .eq("id", conv.id)
    .eq("tenant_id", p.tenantId);
  if (perr) {
    // The words kept without their pause would be found by the redelivery and taken for a replay, which pauses
    // nothing: so they are taken back out, and the echo comes again whole. Said with whether that worked.
    const unwound =
      !error && p.externalId
        ? !(await db.from("messages").delete().eq("tenant_id", p.tenantId).eq("external_id", p.externalId)).error
        : null;
    dbLog().error("record_echo_pause_failed", {
      tenant_id: p.tenantId,
      conversation_id: conv.id,
      error: perr.message,
      unwound,
    });
    return false;
  }
  // The receptionist is quiet on this thread because its owner spoke: on the ledger, since nothing on any page said why
  // it stopped answering. Once per echo: a redelivery returned above.
  await emitEvent(db, p.tenantId, "conversation.owner_replied", "conversation", conv.id, { until: p.pausedUntilIso });
  // The pause landed. The words did only when their insert did: one the database refused comes again, and its
  // redelivery writes them (and the pause once more, from its own moment).
  if (error) return false;
  return settleByEcho(db, p);
}
