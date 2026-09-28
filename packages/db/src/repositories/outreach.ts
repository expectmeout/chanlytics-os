/**
 * What the send door asks of a cold email (00177 outreach_facts): one question, one answer. The one place the door's
 * outreach facts are typed. The service role asks it (the send path runs on the edge); a read that fails throws,
 * because "we could not check" is not "yes".
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { leadSuppressionHash } from "@chanlytics/contracts";
import type { Database, Json } from "../database.types";

type Db = SupabaseClient<Database>;

export interface OutreachFactsRow {
  /** The lead's stage, the one still being written to first; null when the finder never found this person. */
  lead_stage: string | null;
  /** The address is on the workspace's never-again list (lead_suppressions, email). */
  suppressed: boolean;
  /**
   * The person wrote back, or phoned (00181): a message of their own on any channel, an email from any address that
   * answers or cites one sent to them, or a call they made. An out-of-office is not one.
   */
  wrote_back: boolean;
  /**
   * The From host's row as Connections set it up, with the days it has sent on since it was clean (D15, 00184); null
   * when the workspace owns no such domain.
   */
  domain: { state: string; from_local: string; clean_since: string | null; sent_days: number } | null;
  /** What left from that domain since `since`. */
  sent_since: number;
}

export async function outreachFactsOf(
  db: Db,
  p: {
    tenantId: string;
    contactId: string;
    to: string;
    host: string;
    since: string;
    /** The lead the send is for (a reach-out's always names one): its own stage, not any lead of this person's. */
    leadId?: string | null;
  },
): Promise<OutreachFactsRow> {
  const { data, error } = await db.rpc("outreach_facts", {
    p_tenant_id: p.tenantId,
    p_contact_id: p.contactId,
    p_to: p.to,
    p_host: p.host,
    p_since: p.since,
    // Named only when there is a lead: a database before 00184 knows five arguments, and a sixth it has never heard of
    // would fail every cold send rather than answer as it did.
    ...(p.leadId ? { p_lead_id: p.leadId } : {}),
  } as never);
  if (error) throw new Error(`cannot read the outreach facts: ${error.message}`);
  const f = (data ?? {}) as Partial<OutreachFactsRow>;
  // A database without 00181 answers without it. Read as "never wrote", a business that asked to be left alone would be
  // written to cold: not knowing is a failed read.
  if (typeof f.wrote_back !== "boolean")
    throw new Error("cannot read the outreach facts: the database did not say whether this person wrote back");
  return {
    lead_stage: typeof f.lead_stage === "string" ? f.lead_stage : null,
    suppressed: f.suppressed === true,
    wrote_back: f.wrote_back,
    domain:
      f.domain && typeof f.domain === "object" && typeof f.domain.state === "string"
        ? {
            state: f.domain.state,
            from_local: String(f.domain.from_local ?? ""),
            clean_since: typeof f.domain.clean_since === "string" ? f.domain.clean_since : null,
            // A database before 00184 says nothing of it: no days sent, the ramp's first step.
            sent_days: Math.max(0, Number((f.domain as { sent_days?: unknown }).sent_days ?? 0) || 0),
          }
        : null,
    sent_since: Number(f.sent_since ?? 0) || 0,
  };
}

/**
 * Which of these addresses the workspace's never-again list holds (00220 lead_addresses_suppressed): an address's own
 * row, or its business's own domain after a no (N6). The one predicate the finder asks, as the send door's facts and
 * the audience ask it in SQL. Each answer is the address as it is stored, lower-cased and trimmed. A read that fails
 * throws: "we could not check" is not "no".
 *
 * A database before 00220 has no such door, and no domain row either: there the address's own row is the whole rule,
 * read as the finder read it before (the keyed digest 00140's lead_suppression_hash writes), so the edge may deploy
 * first.
 */
export async function addressesSuppressed(db: Db, tenantId: string, addresses: string[]): Promise<Set<string>> {
  const asked = [...new Set(addresses.map((a) => a.trim().toLowerCase()).filter((a) => a !== ""))];
  if (!asked.length) return new Set();
  const { data, error } = await db.rpc("lead_addresses_suppressed", { p_tenant_id: tenantId, p_addresses: asked });
  if (error && missingDoor(error)) return addressesHeldBefore00220(db, tenantId, asked);
  if (error) throw new Error(`cannot read the never-again list: ${error.message}`);
  return new Set((data ?? []).filter((a): a is string => typeof a === "string"));
}

const missingDoor = (e: { code?: string | null; message: string }): boolean =>
  e.code === "PGRST202" || e.code === "42883" || /could not find the function/i.test(e.message);

/** The list as a database before 00220 holds it for addresses: each one's own email row. */
async function addressesHeldBefore00220(db: Db, tenantId: string, asked: string[]): Promise<Set<string>> {
  const byHash = new Map(
    await Promise.all(asked.map(async (a) => [await leadSuppressionHash(tenantId, a), a] as const)),
  );
  const { data, error } = await db
    .from("lead_suppressions")
    .select("hash")
    .eq("tenant_id", tenantId)
    .eq("kind", "email")
    .in("hash", [...byHash.keys()]);
  if (error) throw new Error(`cannot read the never-again list: ${error.message}`);
  return new Set((data ?? []).flatMap((r) => byHash.get(r.hash) ?? []));
}

/* ---------------------------------------------------------------- a reply to a reach-out, read (00222) */

/** What reach_out_reply_of answers: the reach-out a received email answers, and the reply itself. */
export interface ReachOutReplyOf {
  send_id: string;
  lead_id: string;
  /** The lead's person (leads.contact_id): every step and every consent move lands there (G6). */
  lead_contact_id: string | null;
  /** The address the reach-out wrote to, as stored; the lead's website host. */
  lead_email: string | null;
  lead_website: string | null;
  answered_message_id: string | null;
  /** The first 600 characters of the email it answers. */
  answered_text: string | null;
  business: string;
  chain: string | null;
  signed_by: string | null;
  /** The workspace's zone; null when it has none set. */
  tz: string | null;
  conversation_id: string;
  /** Who wrote: the person the intake kept the message under. */
  contact_id: string | null;
  claim: "person" | "automated" | "auto_reply";
  /** The intake's bare sender address (channels addressOf), never a display-name form. */
  from: string | null;
  subject: string | null;
  text: string | null;
  received_at: string;
}

const textOf = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

/**
 * Whose reply a received email is (00222 reach_out_reply_of): the reach-out email it answers or cites, else the latest
 * one sent to its person, within `days` before it arrived; null when it answers none. A read that fails throws: a reply
 * taken for nobody's would never be read, and a missed no is the one mistake that must not be made.
 *
 * A database before 00222 has no such door, and no reading either: there a reply is nobody's, exactly as before, so
 * the edge may deploy first.
 */
export async function reachOutReplyOf(
  db: Db,
  p: { tenantId: string; messageId: string; days: number },
): Promise<ReachOutReplyOf | null> {
  const { data, error } = await db.rpc("reach_out_reply_of", {
    p_tenant_id: p.tenantId,
    p_message_id: p.messageId,
    p_days: p.days,
  });
  if (error && missingDoor(error)) return null;
  if (error) throw new Error(`cannot read whose reply this is: ${error.message}`);
  const o = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  const sendId = textOf(o?.send_id);
  const leadId = textOf(o?.lead_id);
  const conversationId = textOf(o?.conversation_id);
  const receivedAt = textOf(o?.received_at);
  if (!o || !sendId || !leadId || !conversationId || !receivedAt) return null;
  const claim = o.claim === "auto_reply" || o.claim === "automated" ? o.claim : "person";
  return {
    send_id: sendId,
    lead_id: leadId,
    lead_contact_id: textOf(o.lead_contact_id),
    lead_email: textOf(o.lead_email),
    lead_website: textOf(o.lead_website),
    answered_message_id: textOf(o.answered_message_id),
    answered_text: textOf(o.answered_text),
    business: textOf(o.business) ?? "",
    chain: textOf(o.chain),
    signed_by: textOf(o.signed_by),
    tz: textOf(o.tz),
    conversation_id: conversationId,
    contact_id: textOf(o.contact_id),
    claim,
    from: textOf(o.from),
    subject: textOf(o.subject),
    text: textOf(o.text),
    received_at: receivedAt,
  };
}

/** A reading as the job reads it back: what it was read as, whether it was read, re-read, told and undone. */
export interface ReplyReadingRow {
  intent: string;
  claim: string;
  summary: string | null;
  unread: string | null;
  rereads: number;
  plan: Json;
  told_at: string | null;
  undone_at: string | null;
}

/** The reading kept for this message, if any. A read that fails throws. */
export async function replyReadingOf(
  db: Db,
  p: { tenantId: string; messageId: string },
): Promise<ReplyReadingRow | null> {
  const { data, error } = await db
    .from("reach_out_replies")
    .select("intent, claim, summary, unread, rereads, plan, told_at, undone_at")
    .eq("tenant_id", p.tenantId)
    .eq("message_id", p.messageId)
    .maybeSingle();
  if (error) throw new Error(`cannot read the reply's reading: ${error.message}`);
  return data ?? null;
}

/** One read of the workspace's UTC day, taken if it is under `cap` (00222 reach_out_read_take): true when taken. */
export async function takeReplyRead(db: Db, p: { tenantId: string; cap: number; at: Date }): Promise<boolean> {
  const { data, error } = await db.rpc("reach_out_read_take", {
    p_tenant_id: p.tenantId,
    p_cap: p.cap,
    p_at: p.at.toISOString(),
  });
  if (error) throw new Error(`cannot take the day's read: ${error.message}`);
  return data === true;
}

/**
 * A reading and its plan, applied once (00222 reach_out_reply_apply): true when this call applied it, false when the
 * reading was already kept (or, for a re-read, already read). `reread` is which re-read this is, 0 for the first read.
 */
export async function applyReplyReading(
  db: Db,
  p: { tenantId: string; messageId: string; reading: Json; plan: Json; reread: number; days: number },
): Promise<boolean> {
  const { data, error } = await db.rpc("reach_out_reply_apply", {
    p_tenant_id: p.tenantId,
    p_message_id: p.messageId,
    p_reading: p.reading,
    p_plan: p.plan,
    p_reread: p.reread,
    p_days: p.days,
  });
  if (error) throw new Error(`cannot apply the reply's reading: ${error.message}`);
  const o = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  return o.applied === true;
}

/**
 * The notice's first phase (B2): this call's claim (the moment the row keeps), or null when a live claim holds it or it
 * was told. A claim older than `staleBefore` is claimed again.
 */
export async function claimReplyTell(
  db: Db,
  p: { tenantId: string; messageId: string; staleBefore: Date },
): Promise<string | null> {
  const { data, error } = await db.rpc("reach_out_reply_tell_claim", {
    p_tenant_id: p.tenantId,
    p_message_id: p.messageId,
    p_stale_before: p.staleBefore.toISOString(),
  });
  if (error) throw new Error(`cannot claim the reply's notice: ${error.message}`);
  return typeof data === "string" && data !== "" ? data : null;
}

/**
 * The notice's second phase: marked told, only once the owner was told and only while `claim` still holds it (a re-read
 * that made the reading due a notice again took it back). A write that fails throws.
 */
export async function markReplyTold(db: Db, p: { tenantId: string; messageId: string; claim: string }): Promise<void> {
  const { error } = await db.rpc("reach_out_reply_told", {
    p_tenant_id: p.tenantId,
    p_message_id: p.messageId,
    p_claimed_at: p.claim,
  });
  if (error) throw new Error(`cannot mark the reply's notice told: ${error.message}`);
}
