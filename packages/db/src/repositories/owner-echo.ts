/**
 * The owner's reply from the WhatsApp Business app (an echo): kept as a person's words, the receptionist paused on its
 * thread, and the holds it answers settled when it was typed (00438). Moved from ingest.ts, which keeps the customer's side.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { conversationPatch } from "@chanlytics/contracts";
import type { Database } from "../database.types";
import { emitEvent } from "../events";
import { dbLog } from "../observe";
import { getOrCreateContact } from "./ingest";

type Db = SupabaseClient<Database>;

/** Owner replied from the WhatsApp Business app: persist the echo + pause the bot.
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
    customerPhoneDigits: string;
    body: string | null;
    externalId: string | null;
    pausedUntilIso: string;
    /** The hold reasons a typed reply settles (contracts WAITING_REASONS): its open holds of these are resolved (00438). */
    settles: readonly string[];
  },
): Promise<boolean> {
  const phone = `+${p.customerPhoneDigits.replace(/^\+/, "")}`;
  // Was an .upsert on the PARTIAL unique index, which PostgREST cannot target —
  // so for any customer without an existing contact row this failed, logged,
  // and returned. The owner's reply from the WhatsApp Business app was never
  // recorded and the AI pause never reached Postgres, which is precisely the
  // divergence this function exists to prevent.
  let contact: { id: string };
  try {
    contact = await getOrCreateContact(db, p.tenantId, phone);
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
    channel: "whatsapp",
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

/**
 * The holds a reply from the WhatsApp Business app answers, settled (00438 conversation_echo_settles; the wiring's second
 * audit, S7-5): resolved when it was typed, as a reply from the dashboard resolves the hold it answers, so the customer
 * leaves Needs you and nobody is told "Still waiting" of them. An echo with no id of its own cannot be found again, and
 * settles nothing. False when the door failed, which the webhook answers with a 503: Meta's redelivery finds the echo
 * kept and asks again, and a hold settled already is not settled twice.
 */
async function settleByEcho(
  db: Db,
  p: { tenantId: string; externalId: string | null; settles: readonly string[] },
): Promise<boolean> {
  if (!p.externalId) return true;
  const { error } = await db.rpc("conversation_echo_settles", {
    p_tenant_id: p.tenantId,
    p_external_id: p.externalId,
    p_reasons: [...p.settles],
  });
  if (!error) return true;
  dbLog().error("record_echo_settle_failed", { tenant_id: p.tenantId, error: error.message });
  return false;
}
