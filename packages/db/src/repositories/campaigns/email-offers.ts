/**
 * Offers by email, as the database keeps them (One message, every channel, step 4; migration 00299): the pause the gates
 * set on a workspace's mailbox, the counts they are judged by, the yes a person gives by email, the two ways a person says no
 * (an unsubscribe by link or by reply, and "Stop all messages"), and the count Setup shows. Each is the one place its
 * function is named.
 *
 * Every read tolerates a database 00299 has not reached, so either app may deploy first: the pause reads as none, the count
 * as none kept (null), and a write that needs the function fails by name, which its caller logs and carries on from. Nothing
 * here is how a person is judged: that is contracts' mayMessageFor, which reads what these keep.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { offerPauseOf, type OfferCounts, type OfferPause, type OfferPauseReason } from "@chanlytics/contracts";
import type { Database, Json } from "../../database.types";

type Db = SupabaseClient<Database>;

/**
 * Whether a read failed because a column it names is not there yet (a database before 00299): Postgres's own 42703,
 * "column mailboxes.offers_paused_at does not exist", about one of these columns and no other. PostgREST's "Could not find
 * ... in the schema cache" is not it: that is a cache that has not caught up with a column that IS there, or a fault, and
 * is neither "not paused" nor "no column".
 */
function noColumn(error: { message: string; code?: string } | null | undefined, ...columns: string[]): boolean {
  return !!error && error.code === "42703" && columns.some((c) => error.message.includes(c));
}

/** Whether a call failed because the function it names is not there yet (a database before 00299): PostgREST's PGRST202 or Postgres's 42883, for that function. */
function noFunction(error: { message: string; code?: string } | null | undefined, name: string): boolean {
  return !!error && (error.code === "PGRST202" || error.code === "42883") && error.message.includes(name);
}

/**
 * The pause on a workspace's offers by email: since when and why, or null while they are not paused, the workspace has no
 * mailbox, or the database has no such column (00299, and only that: Postgres's 42703 on those columns). The send door asks
 * it for every offer, so a pause set a moment ago holds the next one. Any other failed read throws, a schema cache that
 * could not find a column among them: "we could not check" is not "not paused".
 */
export async function emailOffersPause(db: Db, tenantId: string): Promise<OfferPause | null> {
  const { data, error } = await db
    .from("mailboxes")
    .select("offers_paused_at, offers_paused_reason")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (noColumn(error, "offers_paused_at", "offers_paused_reason")) return null;
  if (error) throw new Error(`cannot read whether offers by email are paused: ${error.message}`);
  return offerPauseOf(data?.offers_paused_at, data?.offers_paused_reason);
}

/**
 * Pauses a workspace's offers by email, for the reason a gate gave and the counts it judged by (kept on the ledger's
 * mailbox.offers_paused event, which the same call writes). True when this call paused them; false when they were already
 * paused (the first moment and reason stand, and no second event is written) or the workspace has no mailbox. A failed
 * write throws.
 */
export async function pauseEmailOffers(
  db: Db,
  p: { tenantId: string; reason: OfferPauseReason; counts: OfferCounts },
): Promise<boolean> {
  const { data, error } = await db.rpc("pause_email_offers", {
    p_tenant_id: p.tenantId,
    p_reason: p.reason,
    p_counts: {
      complaint_sample: p.counts.complaintSample,
      complaints: p.counts.complaints,
      bounce_sample: p.counts.bounceSample,
      bounces: p.counts.bounces,
    },
  });
  if (error) throw new Error(`cannot pause offers by email: ${error.message}`);
  return data === true;
}

/**
 * What the gates are judged by: of the emails that left from this host, the last 1,000 and the complaints among them, the
 * last 500 and the hard bounces among them (email_offer_counts). `host` is the campaigns domain, so only offers are counted.
 * A failed read throws, and the receipt that asked comes again.
 */
export async function emailOfferCounts(db: Db, p: { tenantId: string; host: string }): Promise<OfferCounts> {
  const { data, error } = await db.rpc("email_offer_counts", { p_tenant_id: p.tenantId, p_host: p.host });
  if (error) throw new Error(`cannot count the offers by email: ${error.message}`);
  const c = (data ?? {}) as Record<string, unknown>;
  const n = (k: string): number => (typeof c[k] === "number" ? c[k] : 0);
  return {
    complaintSample: n("complaint_sample"),
    complaints: n("complaints"),
    bounceSample: n("bounce_sample"),
    bounces: n("bounces"),
  };
}

/**
 * What a yes to offers by email came to: `recorded` (this call wrote it), `unsubscribed` (refused: the person pressed
 * Unsubscribe, and a yes never overwrites that no; only the owner, from the person's page, or a form they sign afresh can
 * change it), or `unchanged` (already their answer, or nobody to write it for).
 */
type OffersYesOutcome = "recorded" | "unsubscribed" | "unchanged";

/**
 * A person's yes to offers by email, in writing (their own message, or a form): opted_in, once, with the channel as evidence
 * (set_email_offers_yes), unless they have unsubscribed, which a yes never undoes. A failed write throws, and the caller logs
 * it: the person has been received, and a yes that has to be repaired is never a reason to fail their message.
 */
export async function setEmailOffersYes(
  db: Db,
  p: {
    tenantId: string;
    contactId: string;
    source: "customer_message" | "form";
    messageId: string | null;
    evidence: Json;
  },
): Promise<OffersYesOutcome> {
  const { data, error } = await db.rpc("set_email_offers_yes", {
    p_tenant_id: p.tenantId,
    p_contact_id: p.contactId,
    p_source: p.source,
    ...(p.messageId ? { p_message_id: p.messageId } : {}),
    p_evidence: p.evidence,
  });
  if (error) throw new Error(`cannot record the yes to offers by email: ${error.message}`);
  const said = (data ?? null) as { changed?: unknown; refused?: unknown } | null;
  if (said?.changed === true) return "recorded";
  return said?.refused === "unsubscribed" ? "unsubscribed" : "unchanged";
}

/** What a person's no to email, by link or by reply, came to. */
export interface Unsubscribed {
  /** The workspace's name, for the page's words; null when it could not be read. */
  business: string | null;
  /** Whether this call changed anything: a repeat does not. */
  changed: boolean;
}

/**
 * A person's no to offers by email (the one door, set_email_marketing: opted_out, from unsubscribe), whichever road it came by: the link's page, the mail client's one click, or a reply that says so.
 * `messageId` is the email it was said on or about; `evidence` says how (the road, and their words). A failed write throws.
 */
export async function setEmailUnsubscribed(
  db: Db,
  p: { tenantId: string; contactId: string; messageId: string | null; evidence: Json },
): Promise<Unsubscribed> {
  const { data, error } = await db.rpc("set_email_marketing", {
    p_tenant_id: p.tenantId,
    p_contact_id: p.contactId,
    p_state: "opted_out",
    p_source: "unsubscribe",
    ...(p.messageId ? { p_message_id: p.messageId } : {}),
    p_evidence: p.evidence,
  });
  if (error) throw new Error(`cannot record the unsubscribe: ${error.message}`);
  const said = (data ?? null) as { business?: unknown; changed?: unknown } | null;
  return { business: typeof said?.business === "string" ? said.business : null, changed: said?.changed === true };
}

/**
 * The unsubscribe page's second, confirmed act: STOP for everything, as ingest_inbound records one, and the unsubscribe from
 * email with it (stop_all_messages). A failed write throws.
 */
export async function stopAllMessages(
  db: Db,
  p: { tenantId: string; contactId: string; messageId: string | null },
): Promise<Unsubscribed> {
  const { data, error } = await db.rpc("stop_all_messages", {
    p_tenant_id: p.tenantId,
    p_contact_id: p.contactId,
    ...(p.messageId ? { p_message_id: p.messageId } : {}),
  });
  if (error) throw new Error(`cannot record that all messages stop: ${error.message}`);
  const said = (data ?? null) as { business?: unknown; changed?: unknown } | null;
  return { business: typeof said?.business === "string" ? said.business : null, changed: said?.changed === true };
}

/**
 * How many people an offer by email would reach (Setup's count; offers_email_reach), under the caller's row security. Null on
 * a database 00299 has not reached (its function is not there), where nothing about offers by email is counted yet. Any
 * other failed read throws.
 */
export async function offersEmailReach(db: Db, tenantId: string): Promise<number | null> {
  const { data, error } = await db.rpc("offers_email_reach", { p_tenant_id: tenantId });
  if (noFunction(error, "offers_email_reach")) return null;
  if (error) throw new Error(`cannot count who an offer by email reaches: ${error.message}`);
  return typeof data === "number" ? data : null;
}
