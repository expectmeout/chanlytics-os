/**
 * A person's answer about offers, where the edge reads and records it outside the inbound door: the one row a START's
 * confirmation on WhatsApp reads to say a STOP ended their yes (00323; contracts offersAfterStart), and WhatsApp's
 * report of a no we never heard (Meta's 131050 on a message of ours). A yes or a no the person texts is the inbound
 * door's (ingest.ts), and a member's is set_marketing_consent's. Nothing here is how a person is judged: that is
 * contracts' mayMessageFor, which reads what these keep.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { WHATSAPP_CONSENT_SOURCE } from "@chanlytics/contracts";
import type { Database } from "../../database.types";
import { emitEvent } from "../../events";

type Db = SupabaseClient<Database>;

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
 * contact.consent_changed row with the purpose named, WhatsApp as its source and the message Meta refused. The person
 * is the one the message was written to. A person who already said no, or who was erased, is left as they are, with no
 * second ledger row: the update is guarded and counted. `dnc` is not touched: this is a no to offers, and messages
 * about their own visit still reach them. A write that fails THROWS; the receipts door catches it in its own guard, so
 * it never costs the receipt its status.
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
  const who = await db
    .from("contacts")
    .select("marketing_consent, erased_at")
    .eq("id", contactId)
    .eq("tenant_id", p.tenantId)
    .maybeSingle();
  if (who.error) throw new Error(`reading contact ${contactId} for WhatsApp's stop: ${who.error.message}`);
  if (!who.data || who.data.erased_at || who.data.marketing_consent === "opted_out") return false;
  const { data, error } = await db
    .from("contacts")
    .update({
      marketing_consent: "opted_out",
      marketing_consent_source: WHATSAPP_CONSENT_SOURCE,
      marketing_consent_updated_at: new Date().toISOString(),
    })
    .eq("id", contactId)
    .eq("tenant_id", p.tenantId)
    .neq("marketing_consent", "opted_out")
    .select("id");
  if (error) throw new Error(`recording WhatsApp's stop for contact ${contactId}: ${error.message}`);
  if (!data || data.length === 0) return false;
  await emitEvent(db, p.tenantId, "contact.consent_changed", "contact", contactId, {
    purpose: "marketing",
    consent: "opted_out",
    previous: who.data.marketing_consent,
    source: WHATSAPP_CONSENT_SOURCE,
    channel: "whatsapp",
    message_external_id: p.externalId,
  });
  return true;
}
