/**
 * A person's answer about offers, where the edge reads and records it outside the inbound door: the one row a START's
 * confirmation on WhatsApp reads to say a STOP ended their yes (00323; contracts offersAfterStart), and WhatsApp's
 * report of a no we never heard (Meta's 131050 on a message of ours), and the carrier's of a STOP it tells us late
 * (Twilio's 21610 on a text's status callback). A yes or a no the person texts is the inbound door's (ingest.ts), and a
 * member's is set_marketing_consent's. Nothing here is how a person is judged: that is
 * contracts' mayMessageFor, which reads what these keep.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { CARRIER_CONSENT_SOURCE, WHATSAPP_CONSENT_SOURCE } from "@chanlytics/contracts";
import type { Database } from "../../database.types";

type Db = SupabaseClient<Database>;

/**
 * A no the carrier reported instead of relaying: a text refused with Twilio
 * 21610, the person having replied STOP to the number before we heard (the
 * STOP went to the carrier, or came before the line's webhook pointed here).
 * The number is unreachable whatever our row says (contracts enums.ts, the
 * carriers' words), so the row is brought to agree with the carrier THE WAY
 * ingest_inbound records a STOP it did hear: the three consent columns
 * together, dnc with them, and one contact.consent_changed row -- the carrier
 * as its source, since there is no message of theirs to name -- in one
 * transaction, through the one door a provider's stop is recorded by
 * (record_provider_stop, 00383). It used to be two writes on two requests,
 * and an event that was lost left the history silent and the channels the
 * answer covered (00297's trigger reads the event) stale. A person already
 * opted out, or erased, is left as they are with no second ledger row, and
 * the door answers false. A write that fails THROWS, as the inbound door's does (ingest.ts):
 * the door reports the send as it reports any wire it could not write, rather
 * than a no going unrecorded under a refusal that says it was.
 */
export async function recordCarrierOptOut(
  db: Db,
  p: { tenantId: string; contactId: string; channel: "sms" },
): Promise<boolean> {
  const { data, error } = await db.rpc("record_provider_stop", {
    p_tenant_id: p.tenantId,
    p_contact_id: p.contactId,
    p_purpose: "conversational",
    p_channel: p.channel,
    p_source: CARRIER_CONSENT_SOURCE,
  });
  if (error) throw new Error(`recording the carrier's opt-out for contact ${p.contactId}: ${error.message}`);
  return data === true;
}

/**
 * One person's answer about offers and how it was given (contacts.marketing_consent and its source), or null where
 * there is no such person. Read by the edge when a START arrives on WhatsApp, to say whether a STOP ended their yes to
 * offers (00323; contracts offersAfterStart): one row on the primary key, by the id the ingest answered.
 */
export async function offersAnswerOf(
  db: Db,
  tenantId: string,
  contactId: string,
): Promise<{ marketingConsent: string | null; marketingConsentSource: string | null } | null> {
  const { data, error } = await db
    .from("contacts")
    .select("marketing_consent, marketing_consent_source")
    .eq("tenant_id", tenantId)
    .eq("id", contactId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data
    ? { marketingConsent: data.marketing_consent, marketingConsentSource: data.marketing_consent_source }
    : null;
}

/**
 * WhatsApp's report that a person stopped marketing messages from this business (131050 on a message of ours),
 * recorded as their no to offers: the answer about offers, its source and its time together, and one
 * contact.consent_changed row with the purpose named, WhatsApp as its source and the message Meta refused, in one
 * transaction through the one door a provider's stop is recorded by (record_provider_stop, 00383). The person is the
 * one the message was written to. A person who already said no, or who was erased, is left as they are, with no
 * second ledger row, and the door answers false. `dnc` is not touched: this is a no to offers, and messages about
 * their own visit still reach them. A write that fails THROWS; the receipts door catches it in its own guard, so it
 * never costs the receipt its status.
 */
export async function recordWhatsAppOffersStop(db: Db, p: { tenantId: string; externalId: string }): Promise<boolean> {
  const sent = await db
    .from("messages")
    .select("contact_id")
    .eq("tenant_id", p.tenantId)
    .eq("external_id", p.externalId)
    .maybeSingle();
  if (sent.error) throw new Error(`reading the message WhatsApp refused (${p.externalId}): ${sent.error.message}`);
  const contactId = sent.data?.contact_id;
  if (!contactId) return false;
  const { data, error } = await db.rpc("record_provider_stop", {
    p_tenant_id: p.tenantId,
    p_contact_id: contactId,
    p_purpose: "marketing",
    p_channel: "whatsapp",
    p_source: WHATSAPP_CONSENT_SOURCE,
    p_message_external_id: p.externalId,
  });
  if (error) throw new Error(`recording WhatsApp's stop for contact ${contactId}: ${error.message}`);
  return data === true;
}

/** What a late report of a carrier's STOP came to (recordLateCarrierOptOut): recorded, or why nothing was written. */
export type LateCarrierStop = "recorded" | "already_stopped" | "newer_answer" | "no_person" | "not_our_text";

/**
 * The carrier's STOP, told late: a text Twilio accepted and then reports undelivered with 21610, the person having
 * replied STOP to the number. The send door records the same code when the wire refuses it at once (core deliver.ts,
 * recordCarrierOptOut); this is that record for the message the callback names, so the two cannot come to differ.
 *
 * The person is the one the text was written to, or their thread's where the row names none. Nothing is written for a
 * message that is not a text of ours (a callback names only what we sent), a person who was erased, one already
 * stopped, or one whose answer is NEWER than the text: a report said again after they sent START must not stop them a
 * second time. The outcome says which. A read or a write that fails THROWS: the status door answers 503 and the
 * carrier says it again, and the same report then comes to the same outcome.
 */
export async function recordLateCarrierOptOut(
  db: Db,
  p: { tenantId: string; externalId: string },
): Promise<LateCarrierStop> {
  const sent = await db
    .from("messages")
    .select("contact_id, conversation_id, direction, channel, created_at")
    .eq("tenant_id", p.tenantId)
    .eq("external_id", p.externalId)
    .maybeSingle();
  if (sent.error) throw new Error(`reading the text the carrier refused (${p.externalId}): ${sent.error.message}`);
  const text = sent.data;
  if (!text || text.direction !== "outbound" || text.channel !== "sms") return "not_our_text";
  let contactId = text.contact_id;
  if (!contactId) {
    // A row that names no person: the thread it is in does.
    const thread = await db
      .from("conversations")
      .select("contact_id")
      .eq("id", text.conversation_id)
      .eq("tenant_id", p.tenantId)
      .maybeSingle();
    if (thread.error) throw new Error(`reading the thread of the text the carrier refused: ${thread.error.message}`);
    contactId = thread.data?.contact_id ?? null;
  }
  if (!contactId) return "no_person";
  const who = await db
    .from("contacts")
    .select("consent, consent_updated_at, erased_at")
    .eq("id", contactId)
    .eq("tenant_id", p.tenantId)
    .maybeSingle();
  if (who.error) throw new Error(`reading contact ${contactId} for the carrier's stop: ${who.error.message}`);
  if (!who.data || who.data.erased_at) return "no_person";
  if (who.data.consent === "opted_out") return "already_stopped";
  if (who.data.consent_updated_at && who.data.consent_updated_at > text.created_at) return "newer_answer";
  const wrote = await recordCarrierOptOut(db, { tenantId: p.tenantId, contactId, channel: "sms" });
  return wrote ? "recorded" : "already_stopped";
}
