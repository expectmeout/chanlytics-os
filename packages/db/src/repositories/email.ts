/**
 * Email's rows: a workspace's mailbox, and taking a received email in.
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
export async function mailboxFor(db: Db, to: { kind: "mailbox"; localPart: string } | { kind: "reply"; token: string }): Promise<MailboxRow | null> {
  const q = db.from("mailboxes").select("*");
  const { data, error } = to.kind === "mailbox"
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
  const known = await db.from("contacts").select("id")
    .eq("tenant_id", p.tenantId).eq("email", p.address)
    .is("erased_at", null).is("merged_into_contact_id", null).maybeSingle();
  if (known.error) throw new Error(`ingest_email: cannot read who has this address: ${known.error.message}`);
  if (known.data) {
    const { error } = await db.from("contact_identities")
      .upsert({ tenant_id: p.tenantId, contact_id: known.data.id, channel: "email", external_id: p.address }, { onConflict: "tenant_id,channel,external_id", ignoreDuplicates: true });
    if (error) throw new Error(`ingest_email: cannot name the person this address belongs to: ${error.message}`);
  }

  const out = await ingestInbound(db, {
    tenantId: p.tenantId, channel: "email", identityExternalId: p.address, phoneE164: null, waProfileName: null,
    messageExternalId: p.receivedId, type: "text", body: p.body, channelTs: p.channelTs, meta: p.meta,
  });

  if (!known.data) {
    const { error } = await db.from("contacts").update({ email: p.address })
      .eq("id", out.contact_id).eq("tenant_id", p.tenantId).is("email", null);
    // Somebody else in the workspace was given this address in the same moment:
    // two people now share a sender, and the owner merges them. The product
    // does not guess which one it is, and the email is kept either way.
    if (error && error.code !== "23505") throw new Error(`ingest_email: cannot record the person's address: ${error.message}`);
    if (error) console.error("ingest_email_address_taken", JSON.stringify({ tenant: p.tenantId, contact: out.contact_id }));
  }
  return out;
}

/** Did this workspace send a message with this Message-ID? How an email that is our own, coming back, is known. */
export async function sentEmailWithMessageId(db: Db, tenantId: string, rfcMessageId: string): Promise<boolean> {
  const { data, error } = await db.from("messages").select("id")
    .eq("tenant_id", tenantId).eq("channel", "email").eq("direction", "outbound")
    .eq("meta->email->>message_id", rfcMessageId).limit(1);
  if (error) throw new Error(`ingest_email: cannot read the ledger of sent emails: ${error.message}`);
  return (data ?? []).length > 0;
}

export async function stampMailboxReceived(db: Db, mailboxId: string, at: string): Promise<void> {
  const { error } = await db.from("mailboxes").update({ last_received_at: at, last_error: null }).eq("id", mailboxId);
  if (error) console.error("mailbox_stamp_failed", error.message);
}
