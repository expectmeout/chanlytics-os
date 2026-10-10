/**
 * Email's rows: a workspace's mailbox, taking a received email in, the email a reply answers, and what became of an
 * email sent. Groups, top to bottom:
 *
 *   the mailbox            mailboxById, mailboxFor (a published address, or a reply route: a rotated-out token still
 *                          routes until it is revoked, 00126), mailboxOfTenant (null is a workspace with no email
 *                          line) and stampMailboxReceived (the mailbox's health stamp, which only logs when it fails);
 *                          keepForwardingConfirmation and clearForwardingConfirmation (Gmail's pending confirmation of
 *                          a forward here, 00345: kept by the intake, shown by Settings, let go of by the first notice
 *                          read, packages/jobs/src/booking-read.ts).
 *   taking one in          ingestInboundEmail and sentEmailWithMessageId (how a sent email coming back is known),
 *                          asked by the email_ingest job (packages/jobs/src/handlers.ts); the edge's door finds the
 *                          mailbox with mailboxFor (apps/edge/lib/email/email-ingress.ts).
 *   what a reply answers   lastInboundEmail (the person's latest email on one thread) and answeredReachOutEmail (the
 *                          reach-out email a reply answers), read for the dashboard's reply routes on the member's
 *                          client (apps/dashboard/src/server/ports/core-ports.ts, connections/email.ts).
 *   what became of a sent  the provider's receipts, applied by apps/edge/lib/email/email-receipts.ts: stampEmailSent,
 *   email                  sentEmailOf, recordEmailStatus, stampEmailComplaint, recordEmailNo and suppressEmailOf.
 *                          stampEmailLeftAs is written by core's deliver() after an email leaves.
 *
 * Taking an email in goes through ingest_inbound, the atomic gate every channel uses (one advisory lock per identity,
 * one replay gate on the provider's id), with the sender's address as the identity; it is not recreated to learn a
 * column. An email whose own words are STOP (core email-ingest) carries the opt-out, so it is recorded as a text's is.
 * The two things email needs around it are each idempotent, so a run that dies between them resumes. Before:
 * a person the owner already gave this address to (00125) has never written from it, so the identity is written first
 * and the ingest joins that person instead of making a second. After: a person who arrived by email gets the address
 * on their own row, only when it is empty, so what an owner typed is never overwritten (if another person was given
 * the address in the same moment, the email is kept, the collision is logged and the owner merges them).
 *
 * Receipts arrive at least once and in no order. stampEmailSent and stampEmailLeftAs each merge into the row in one
 * statement, so a stamp beside them is not overwritten; recordEmailStatus lets go a move messages_guard refuses
 * (backwards, or off a terminal state) as a receipt out of order; suppressEmailOf stops the person's address as it is
 * now, and only while it is still the one the email went to (00126). The reads of a thread's emails are scoped to the
 * workspace and the conversation, so a reply cannot be threaded under another workspace's or person's message. A
 * failed read or write throws (the mailbox stamp only logs), so the caller's retry or the provider's redelivery meets
 * it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../database.types";
import { ingestInbound, stoppedNow, type IngestResult } from "./ingest";
import { setEmailOffersYes, setEmailUnsubscribed } from "./campaigns/email-offers";
import { dbLog } from "../observe";

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
  /** The email's own words are STOP: ingest_inbound records the opt-out (consent opted_out, dnc) as it does for a text. */
  optOut?: boolean;
  /**
   * The email's own words are START, from a sender nothing says is forged: ingest_inbound records the yes as it does for a
   * text's START, and the yes covers email (note_yes_on_channel).
   */
  optIn?: boolean;
  /**
   * The email's own words are UNSUBSCRIBE: offers by email end through the one door the unsubscribe link writes through
   * (set_email_marketing), and nothing else does (an unsubscribe is not a STOP). Recorded after the ingest, and a write that
   * fails throws: a no is never lost, and the run that resumes writes it again, which changes nothing twice.
   */
  unsubscribe?: boolean;
  /**
   * The email's own words are YES OFFERS, from a sender nothing says is forged: the yes to offers by email, in their own
   * message (set_email_offers_yes). Best-effort, as WhatsApp's is: they have been received, and a yes that has to be
   * repaired is logged, never a reason to fail their message.
   */
  optInOffers?: boolean;
  /**
   * A person wrote it, from a sender nothing says is forged. An address a hard bounce stopped is then one that works: the
   * stop is lifted, for this address alone. A complaint's stop is the person's no and the provider's is the provider's:
   * neither is lifted here.
   */
  fromThemProven?: boolean;
  /** What they wrote, as the ledger quotes it (at most eighty characters). */
  words?: string | null;
}

export async function ingestInboundEmail(db: Db, p: IngestEmailParams): Promise<IngestResult> {
  // Who has this address is the inbound door's to say (00344: ingest_inbound hands the address to resolve_person, which
  // matches by the email identity, then by the address on a row, keeps the identity, and sets the address on a new
  // person's row). The read and the two writes that did that here until 00344 was on production are gone.

  // A START is a yes, and until 00361 ingest_inbound wrote a yes before it knew the message was one it already held (its
  // replay gate is the message's own insert). An email delivered twice, or a run that resumes, would write the yes again,
  // over a STOP the person has sent since by any wire. So a delivery this workspace already holds says nothing new: the
  // first one wrote its answer in the same transaction that kept the message. After 00361 the door asks this itself;
  // this read leaves once 00361 is on production.
  let optIn = p.optIn ?? false;
  if (optIn) {
    const held = await db
      .from("messages")
      .select("id")
      .eq("tenant_id", p.tenantId)
      .eq("external_id", p.receivedId)
      .limit(1);
    if (held.error)
      throw new Error(`ingest_email: cannot read whether the email is already held: ${held.error.message}`);
    optIn = (held.data ?? []).length === 0;
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
    optOut: p.optOut ?? false,
    optIn,
  });

  // They wrote from the address a hard bounce stopped: it works. Lifted for that address and that reason alone, and
  // only for an email not yet handled, as their answers below are. A write that fails throws: the run that resumes
  // writes it again, which changes nothing twice.
  if (p.fromThemProven && !out.processed) {
    const { error } = await db
      .from("contacts")
      .update({ email_suppressed_at: null, email_suppressed_reason: null })
      .eq("id", out.contact_id)
      .eq("tenant_id", p.tenantId)
      .eq("email", p.address)
      .eq("email_suppressed_reason", "hard_bounce");
    if (error) throw new Error(`ingest_email: cannot lift the bounce from the address: ${error.message}`);
  }

  // Their word about offers by email, in their own message, once their address is on their row (an unsubscribe puts it on
  // the never-again list): a no first, so it is never lost behind a yes. Only for an email not yet handled: a delivery the
  // provider repeats after it was handled must not put back a yes the person has since taken away (a run that died before
  // it finished finds the email unhandled, and writes again what it wrote, which changes nothing twice).
  const evidence = { channel: "email", message_external_id: p.receivedId, words: (p.words ?? "").slice(0, 80) || null };
  if (p.unsubscribe && !out.processed)
    await setEmailUnsubscribed(db, {
      tenantId: p.tenantId,
      contactId: out.contact_id,
      messageId: out.message_id,
      evidence: { ...evidence, via: "reply" },
    });
  if (p.optInOffers && !out.processed && stoppedNow(out)) {
    // The same rule a texted YES OFFERS has (ingest.ts stoppedNow): a yes under a stop is not recorded.
    dbLog().warn("offers_yes_while_stopped", { tenant_id: p.tenantId, contact_id: out.contact_id, channel: "email" });
  } else if (p.optInOffers && !out.processed) {
    try {
      const yes = await setEmailOffersYes(db, {
        tenantId: p.tenantId,
        contactId: out.contact_id,
        source: "customer_message",
        messageId: out.message_id,
        evidence,
      });
      // A yes never undoes an unsubscribe: said, so "I wrote YES OFFERS and nothing happened" has an answer.
      if (yes === "unsubscribed")
        dbLog().warn("email_yes_refused", {
          tenant_id: p.tenantId,
          contact_id: out.contact_id,
          reason: "unsubscribed",
        });
    } catch (e) {
      dbLog().error("email_yes_not_recorded", {
        tenant_id: p.tenantId,
        contact_id: out.contact_id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
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
  if (error) dbLog().error("mailbox_stamp_failed", { mailbox_id: mailboxId, error: error.message });
}

/** A workspace's mailbox; null when it has none, which is a workspace with no email line. */
export async function mailboxOfTenant(db: Db, tenantId: string): Promise<MailboxRow | null> {
  const { data, error } = await db.from("mailboxes").select("*").eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(`mailbox: ${error.message}`);
  return data;
}

/** Gmail's confirmation that it may forward here (00345), kept on the mailbox until the first notice is read. */
export async function keepForwardingConfirmation(
  db: Db,
  mailboxId: string,
  p: { account: string; code: string; link: string | null },
): Promise<void> {
  const { error } = await db
    .from("mailboxes")
    .update({
      forward_confirm_account: p.account,
      forward_confirm_code: p.code,
      forward_confirm_link: p.link,
      forward_confirm_at: new Date().toISOString(),
    })
    .eq("id", mailboxId);
  if (error) throw new Error(`forwarding_confirmation_keep: ${error.message}`);
}

/** The forward confirmed, as the first notice that arrived proves: the code and the link are let go of. */
export async function clearForwardingConfirmation(db: Db, mailboxId: string): Promise<void> {
  const { error } = await db
    .from("mailboxes")
    .update({
      forward_confirm_account: null,
      forward_confirm_code: null,
      forward_confirm_link: null,
      forward_confirm_at: null,
    })
    .eq("id", mailboxId)
    .not("forward_confirm_code", "is", null);
  if (error) throw new Error(`forwarding_confirmation_clear: ${error.message}`);
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
  const e = (data.meta as { email?: Record<string, unknown> } | null)?.email ?? {};
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
 * The subject of the newest email the business sent on one thread, or null when it has sent none: what a second email
 * is filed under when the person has not answered the first (core conversations/reply.ts shapeFirstEmail).
 */
export async function lastOutboundEmailSubject(
  db: Db,
  tenantId: string,
  conversationId: string,
): Promise<string | null> {
  const { data, error } = await db
    .from("messages")
    .select("meta")
    .eq("tenant_id", tenantId)
    .eq("conversation_id", conversationId)
    .eq("channel", "email")
    .eq("direction", "outbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`email: cannot read the last email sent: ${error.message}`);
  const subject = (data?.meta as { email?: { subject?: unknown } } | null)?.email?.subject;
  return typeof subject === "string" && subject.trim() ? subject : null;
}

/** How many of a thread's latest outbound emails are asked which reach-out email a reply answers. */
const ANSWERED_LOOKBACK = 50;

/**
 * The reach-out email a person's reply answers (Reach out Part 5, C15), on one thread of one workspace: the latest one
 * whose Message-ID the reply's References name, else the latest one on the thread. Its From and Reply-To are as its
 * request was frozen. Null when the thread holds no reach-out email that left: every other email reply.
 */
export async function answeredReachOutEmail(
  db: Db,
  p: { tenantId: string; conversationId: string; references: string[] },
): Promise<{ messageId: string; from: string | null; replyTo: string | null } | null> {
  const { data, error } = await db
    .from("messages")
    .select("id, meta, status")
    .eq("tenant_id", p.tenantId)
    .eq("conversation_id", p.conversationId)
    .eq("channel", "email")
    .eq("direction", "outbound")
    .order("created_at", { ascending: false })
    .limit(ANSWERED_LOOKBACK);
  if (error) throw new Error(`email: cannot read the reach-out being answered: ${error.message}`);
  const left = new Set(["sent", "delivered", "read"]);
  const sent = (data ?? []).flatMap((m) => {
    const meta = (m.meta ?? {}) as { source?: unknown; email?: { message_id?: unknown; request?: unknown } };
    if (meta.source !== "reach_out" || !left.has(String(m.status))) return [];
    const req = (meta.email?.request ?? {}) as { from?: unknown; reply_to?: unknown };
    const replyTo = Array.isArray(req.reply_to) && typeof req.reply_to[0] === "string" ? req.reply_to[0] : null;
    return [
      {
        messageId: m.id,
        rfc: typeof meta.email?.message_id === "string" ? meta.email.message_id : null,
        from: typeof req.from === "string" ? req.from : null,
        replyTo,
      },
    ];
  });
  const named = new Set(p.references);
  const hit = sent.find((e) => e.rfc !== null && named.has(e.rfc)) ?? sent[0];
  return hit ? { messageId: hit.messageId, from: hit.from, replyTo: hit.replyTo } : null;
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
 * How a person's email reply left (00226 stamp_email_left_as): by the own domain it was frozen with, or as the
 * mailbox's request and why not by its own. Merged into meta.email in one statement, as stampEmailSent merges the
 * Message-ID. False when there is no such outbound email. A write that fails throws.
 */
export async function stampEmailLeftAs(
  db: Db,
  p: { tenantId: string; messageId: string; leftAs: "own" | "mailbox"; why: string | null },
): Promise<boolean> {
  const { data, error } = await db.rpc("stamp_email_left_as", {
    p_tenant_id: p.tenantId,
    p_message_id: p.messageId,
    p_left_as: p.leftAs,
    p_why: p.why,
  } as never);
  if (error) throw new Error(`stamp_email_left_as: ${error.message}`);
  return data === true;
}

/**
 * An outbound email as a receipt reads it: the request it was frozen with, and the lead a reach-out wrote it for
 * (meta.reach_out.lead_id), so a permanent bounce marks that lead's address (Reach out C11). Null when there is no such
 * row. A read that fails throws; the receipt comes again.
 */
export async function sentEmailOf(
  db: Db,
  p: { tenantId: string; messageId: string },
): Promise<{ request: unknown | null; leadId: string | null } | null> {
  const { data, error } = await db
    .from("messages")
    .select("meta")
    .eq("id", p.messageId)
    .eq("tenant_id", p.tenantId)
    .eq("channel", "email")
    .eq("direction", "outbound")
    .maybeSingle();
  if (error) throw new Error(`sent email request: ${error.message}`);
  if (!data) return null;
  const meta = (data.meta ?? null) as { email?: { request?: unknown }; reach_out?: { lead_id?: unknown } } | null;
  const lead = meta?.reach_out?.lead_id;
  return { request: meta?.email?.request ?? null, leadId: typeof lead === "string" && lead ? lead : null };
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
  });
  if (error) throw new Error(`stamp_email_complaint: ${error.message}`);
  return data === true;
}

/**
 * A complaint on an email, recorded as the person's no (00177): the unsubscribe's own door, source 'complaint', so
 * the address goes on the never-again list and their leads are closed as said no. Answers the person and the From
 * the email left as (its frozen request's), so the caller can hold the domain it came from; a row with no person
 * records nothing, since there is no one to stop.
 */
export async function recordEmailNo(
  db: Db,
  p: { tenantId: string; messageId: string; source: "complaint" },
): Promise<{ contactId: string | null; from: string | null }> {
  const { data, error } = await db
    .from("messages")
    .select("contact_id, meta")
    .eq("id", p.messageId)
    .eq("tenant_id", p.tenantId)
    .eq("channel", "email")
    .eq("direction", "outbound")
    .maybeSingle();
  if (error) throw new Error(`email receipt: cannot read message ${p.messageId}: ${error.message}`);
  const meta = (data?.meta ?? {}) as { email?: { request?: { from?: unknown } } };
  const from = typeof meta.email?.request?.from === "string" ? meta.email.request.from : null;
  const contactId = data?.contact_id ?? null;
  if (!contactId) return { contactId: null, from };
  const r = await db.rpc("set_email_marketing", {
    p_tenant_id: p.tenantId,
    p_contact_id: contactId,
    p_state: "opted_out",
    p_source: p.source,
    p_message_id: p.messageId,
    p_evidence: { channel: "email", via: p.source },
  });
  if (r.error) throw new Error(`email receipt: cannot record the ${p.source} as a no: ${r.error.message}`);
  return { contactId, from };
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
