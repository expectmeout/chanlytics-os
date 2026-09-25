/**
 * Email's rows: a workspace's mailbox, taking a received email in, the email a
 * reply answers, and what became of one we sent.
 *
 * Taking an email in goes through `ingest_inbound`, the same atomic gate every
 * channel uses (one advisory lock per identity, one replay gate on the
 * provider's id), with the sender's address as the identity. That function is
 * the hot path for every inbound message in the product and is not recreated
 * to learn a column (ingest.ts says the same of the offers answer). The two
 * things email needs around it are done here, each idempotent, so a run that
 * dies between them resumes cleanly:
 *
 *   before  a person the owner already gave this address to (00125) has never
 *           written from it, so no identity names them yet. The identity is
 *           written first, and the ingest then joins THAT person instead of
 *           making a second one.
 *   after   a person who arrived by email gets the address on their own row,
 *           where replies are addressed from and People shows it. Only an
 *           empty one is filled: what an owner typed is never overwritten.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../database.types";
import { ingestInbound, type IngestResult } from "./ingest";

type Db = SupabaseClient<Database>;
export type MailboxRow = Database["public"]["Tables"]["mailboxes"]["Row"];

export async function mailboxById(db: Db, id: string): Promise<MailboxRow | null> {
  const { data, error } = await db.from("mailboxes").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`mailbox: ${error.message}`);
  return data;
}

/** The mailbox a published address or a reply route names. A rotated-out token still routes until it is revoked (00126). */
export async function mailboxFor(
  db: Db,
  to: { kind: "mailbox"; localPart: string } | { kind: "reply"; token: string },
): Promise<MailboxRow | null> {
  const q = db.from("mailboxes").select("*");
  const { data, error } =
    to.kind === "mailbox"
      ? await q.eq("local_part", to.localPart).maybeSingle()
      : await q.or(`reply_token.eq.${to.token},reply_token_prev.eq.${to.token}`).maybeSingle();
  if (error) throw new Error(`mailbox: ${error.message}`);
  return data;
}

export interface IngestEmailParams {
  tenantId: string;
  /** The sender's address, as normalizeEmail stores it. */
  address: string;
  /** The provider's id for this delivery: the replay gate. Never the sender's own Message-ID, which the sender writes. */
  receivedId: string;
  body: string | null;
  channelTs: string | null;
  meta: Json;
}

export async function ingestInboundEmail(db: Db, p: IngestEmailParams): Promise<IngestResult> {
  const known = await db
    .from("contacts")
    .select("id")
    .eq("tenant_id", p.tenantId)
    .eq("email", p.address)
    .is("erased_at", null)
    .is("merged_into_contact_id", null)
    .maybeSingle();
  if (known.error) throw new Error(`ingest_email: cannot read who has this address: ${known.error.message}`);
  if (known.data) {
    const { error } = await db
      .from("contact_identities")
      .upsert(
        { tenant_id: p.tenantId, contact_id: known.data.id, channel: "email", external_id: p.address },
        { onConflict: "tenant_id,channel,external_id", ignoreDuplicates: true },
      );
    if (error) throw new Error(`ingest_email: cannot name the person this address belongs to: ${error.message}`);
  }

  const out = await ingestInbound(db, {
    tenantId: p.tenantId,
    channel: "email",
    identityExternalId: p.address,
    phoneE164: null,
    waProfileName: null,
    messageExternalId: p.receivedId,
    type: "text",
    body: p.body,
    channelTs: p.channelTs,
    meta: p.meta,
  });

  if (!known.data) {
    const { error } = await db
      .from("contacts")
      .update({ email: p.address })
      .eq("id", out.contact_id)
      .eq("tenant_id", p.tenantId)
      .is("email", null);
    // Somebody else in the workspace was given this address in the same moment:
    // two people now share a sender, and the owner merges them. The product
    // does not guess which one it is, and the email is kept either way.
    if (error && error.code !== "23505")
      throw new Error(`ingest_email: cannot record the person's address: ${error.message}`);
    if (error)
      console.error("ingest_email_address_taken", JSON.stringify({ tenant: p.tenantId, contact: out.contact_id }));
  }
  return out;
}

/** Did this workspace send a message with this Message-ID? How an email that is our own, coming back, is known. */
export async function sentEmailWithMessageId(db: Db, tenantId: string, rfcMessageId: string): Promise<boolean> {
  const { data, error } = await db
    .from("messages")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("channel", "email")
    .eq("direction", "outbound")
    .eq("meta->email->>message_id", rfcMessageId)
    .limit(1);
  if (error) throw new Error(`ingest_email: cannot read the ledger of sent emails: ${error.message}`);
  return (data ?? []).length > 0;
}

export async function stampMailboxReceived(db: Db, mailboxId: string, at: string): Promise<void> {
  const { error } = await db.from("mailboxes").update({ last_received_at: at, last_error: null }).eq("id", mailboxId);
  if (error) console.error("mailbox_stamp_failed", error.message);
}

/** A workspace's mailbox; null when it has none, which is a workspace with no email line. */
export async function mailboxOfTenant(db: Db, tenantId: string): Promise<MailboxRow | null> {
  const { data, error } = await db.from("mailboxes").select("*").eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(`mailbox: ${error.message}`);
  return data;
}

/** The email a reply answers: what the thread stores of the person's latest one. */
export interface InboundEmailFacts {
  messageId: string;
  from: string | null;
  rfcMessageId: string | null;
  references: string[];
  subject: string | null;
}

/**
 * The person's latest email on one thread, read inside that workspace and that
 * conversation and nowhere else: a reply cannot be threaded under another
 * workspace's or another person's message, because no such row can be returned.
 */
export async function lastInboundEmail(
  db: Db,
  tenantId: string,
  conversationId: string,
): Promise<InboundEmailFacts | null> {
  const { data, error } = await db
    .from("messages")
    .select("id, meta")
    .eq("tenant_id", tenantId)
    .eq("conversation_id", conversationId)
    .eq("channel", "email")
    .eq("direction", "inbound")
    .order("channel_ts", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`email: cannot read the email being answered: ${error.message}`);
  if (!data) return null;
  const e = ((data.meta as { email?: Record<string, unknown> } | null)?.email ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
  return {
    messageId: data.id,
    from: str(e.from),
    rfcMessageId: str(e.message_id),
    references: Array.isArray(e.references) ? e.references.filter((r): r is string => typeof r === "string") : [],
    subject: str(e.subject),
  };
}

/**
 * A sent email learns the provider's id and the Message-ID it left with
 * (00128, one statement, so it cannot overwrite a status stamp written beside
 * it), and says where the row stands and which thread it is on. Null when this
 * workspace has no such outbound email: a receipt for a row that is not there.
 */
export async function stampEmailSent(
  db: Db,
  p: { tenantId: string; messageId: string; providerId: string; rfcMessageId: string | null },
): Promise<{ status: string; conversationId: string } | null> {
  const { data, error } = await db.rpc("stamp_email_sent", {
    p_tenant_id: p.tenantId,
    p_message_id: p.messageId,
    p_provider_id: p.providerId,
    p_rfc_message_id: p.rfcMessageId,
  } as never);
  if (error) throw new Error(`stamp_email_sent: ${error.message}`);
  const row = (data as Array<{ status: string; conversation_id: string }> | null)?.[0];
  return row ? { status: row.status, conversationId: row.conversation_id } : null;
}

/**
 * A complaint, stamped once on the row it is about (00176), so the domain it left from answers for it. True when this
 * stamped it; false when it was stamped before or is no such row.
 */
export async function stampEmailComplaint(
  db: Db,
  p: { tenantId: string; messageId: string; at: string },
): Promise<boolean> {
  const { data, error } = await db.rpc("stamp_email_complaint", {
    p_tenant_id: p.tenantId,
    p_message_id: p.messageId,
    p_at: p.at,
  } as never);
  if (error) throw new Error(`stamp_email_complaint: ${error.message}`);
  return data === true;
}

/**
 * Move a sent email to what its receipt says. A move messages_guard refuses
 * (backwards, or off a terminal state) is a receipt arriving out of order, and
 * is let go the way recordStatusByExternalId lets it go; anything else throws.
 */
export async function recordEmailStatus(
  db: Db,
  p: { tenantId: string; messageId: string; status: "delivered" | "failed"; error: Json | null },
): Promise<void> {
  const { error } = await db
    .from("messages")
    .update({ status: p.status, ...(p.error ? { error: p.error } : {}) })
    .eq("id", p.messageId)
    .eq("tenant_id", p.tenantId)
    .eq("channel", "email")
    .eq("direction", "outbound");
  if (error && !/monotone|terminal/.test(error.message))
    throw new Error(`email receipt: cannot move message ${p.messageId}: ${error.message}`);
}

/**
 * The address a sent email went to stops being sent to. It is the person's
 * address NOW that is stopped, and only when it is still the one that email
 * went to: a corrected address is a different address (00126). The person's id
 * when their row changed; null when it was already stopped, or no longer theirs.
 */
export async function suppressEmailOf(
  db: Db,
  p: {
    tenantId: string;
    messageId: string;
    addresses: string[];
    reason: "hard_bounce" | "complaint" | "provider";
    at: string;
  },
): Promise<string | null> {
  if (!p.addresses.length) return null;
  const sent = await db
    .from("messages")
    .select("contact_id")
    .eq("id", p.messageId)
    .eq("tenant_id", p.tenantId)
    .maybeSingle();
  if (sent.error)
    throw new Error(`email receipt: cannot read who message ${p.messageId} went to: ${sent.error.message}`);
  if (!sent.data?.contact_id) return null;
  const { data, error } = await db
    .from("contacts")
    .update({ email_suppressed_at: p.at, email_suppressed_reason: p.reason })
    .eq("id", sent.data.contact_id)
    .eq("tenant_id", p.tenantId)
    .in("email", p.addresses)
    .is("email_suppressed_at", null)
    .select("id");
  if (error) throw new Error(`email receipt: cannot stop sends to the address: ${error.message}`);
  return data?.[0]?.id ?? null;
}
