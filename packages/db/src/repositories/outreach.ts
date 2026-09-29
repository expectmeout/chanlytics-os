/**
 * What the send door asks of a cold email (00177 outreach_facts): one question, one answer. The one place the door's
 * outreach facts are typed. The service role asks it (the send path runs on the edge); a read that fails throws,
 * because "we could not check" is not "yes".
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../database.types";
import { erasureDigests } from "./people";

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
  /** An automatic out-of-office whose day is still ahead (00226): the chain waits. A database before 00226 says nothing. */
  away: boolean;
  /** Its owner stopped writing to this lead (00241, Reach out Part 6's H10). A database before 00241 says nothing. */
  stopped: boolean;
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
    // Absent before 00226: not away, as it was.
    away: f.away === true,
    // Absent before 00241: not stopped. The stop still holds without it: its planned and held sends are skipped, and
    // the followers leave the lead out, both in SQL.
    stopped: f.stopped === true,
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
  const byHash = new Map([...(await erasureDigests(db, tenantId, asked))].map(([a, h]) => [h, a]));
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
  /** Whether the finder saw that website as its host's root (00237); null when it was not kept, or before 00237. */
  lead_website_root: boolean | null;
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
    lead_website_root: typeof o.lead_website_root === "boolean" ? o.lead_website_root : null,
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
  /** The receptionist's draft (PR 5): its text once written, how far it got, and why there is none. */
  draft: string | null;
  draft_state: string;
  draft_why: string | null;
}

/** The reading kept for this message, if any. A read that fails throws. */
export async function replyReadingOf(
  db: Db,
  p: { tenantId: string; messageId: string },
): Promise<ReplyReadingRow | null> {
  const { data, error } = await db
    .from("reach_out_replies")
    .select("intent, claim, summary, unread, rereads, plan, told_at, undone_at, draft, draft_state, draft_why")
    .eq("tenant_id", p.tenantId)
    .eq("message_id", p.messageId)
    .maybeSingle();
  if (error) throw new Error(`cannot read the reply's reading: ${error.message}`);
  return data ?? null;
}

/**
 * The draft's mark (00222 reach_out_reply_draft): waiting, written with its text, or not written with why. Written only
 * from none or waiting, so a second stage never writes over the first: true when this call wrote it.
 */
export async function markReplyDraft(
  db: Db,
  p: {
    tenantId: string;
    messageId: string;
    state: "waiting" | "written" | "not_written";
    draft: string | null;
    why: string | null;
  },
): Promise<boolean> {
  // The door takes a null draft and a null why (its own left(), case); the generated Args say string for both.
  const { data, error } = await db.rpc("reach_out_reply_draft", {
    p_tenant_id: p.tenantId,
    p_message_id: p.messageId,
    p_state: p.state,
    p_draft: p.draft,
    p_why: p.why,
  } as never);
  if (error) throw new Error(`cannot mark the reply's draft: ${error.message}`);
  return data === true;
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

/** A reading as the dashboard lists it: the row, and the lead, send and step it answers. */
export interface ReplyListRow {
  message_id: string;
  conversation_id: string;
  read_at: string;
  intent: string;
  claim: string;
  summary: string | null;
  named_day: string | null;
  refer_to: string | null;
  unread: string | null;
  rereads: number;
  undone_at: string | null;
  draft: string | null;
  draft_state: string;
  draft_why: string | null;
  /** What the reading did (contracts ReadingPlan, as JSON), and an automatic away's day back. */
  plan: Json;
  until_at: string | null;
  business: string | null;
  /** The step the reply answers (reach_out_sends.playbook_id), and its chain's first step. */
  playbook_id: string | null;
  root_id: string | null;
}

const REPLY_LIST_COLUMNS =
  "message_id, conversation_id, read_at, intent, claim, summary, named_day, refer_to, unread, rereads, undone_at, draft, draft_state, draft_why, plan, until_at, lead_id, send_id";

/**
 * A workspace's readings since a moment, newest first and at most `limit`, on the caller's client (RLS decides): with
 * the business each answers and the step its reach-out email was, read in one batch each.
 */
export async function repliesFor(
  db: Db,
  p: { tenantId: string; since: string; conversationId?: string | null; limit: number },
): Promise<ReplyListRow[]> {
  let q = db.from("reach_out_replies").select(REPLY_LIST_COLUMNS).eq("tenant_id", p.tenantId).gte("read_at", p.since);
  if (p.conversationId) q = q.eq("conversation_id", p.conversationId);
  const { data, error } = await q.order("read_at", { ascending: false }).limit(p.limit);
  if (error) throw new Error(`cannot read the replies: ${error.message}`);
  const rows = data ?? [];
  const ids = (k: "lead_id" | "send_id") => [...new Set(rows.map((r) => r[k]).filter((v): v is string => !!v))];
  const [leads, sends] = await Promise.all([
    ids("lead_id").length
      ? db.from("leads").select("id, business_name").eq("tenant_id", p.tenantId).in("id", ids("lead_id"))
      : Promise.resolve({ data: [], error: null }),
    ids("send_id").length
      ? db
          .from("reach_out_sends")
          .select("id, playbook_id, root_id")
          .eq("tenant_id", p.tenantId)
          .in("id", ids("send_id"))
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (leads.error) throw new Error(`cannot read the replies' leads: ${leads.error.message}`);
  if (sends.error) throw new Error(`cannot read the replies' emails: ${sends.error.message}`);
  const business = new Map((leads.data ?? []).map((l) => [l.id, l.business_name as string | null]));
  const step = new Map((sends.data ?? []).map((s) => [s.id, s]));
  return rows.map(({ lead_id, send_id, ...r }) => ({
    ...r,
    business: (lead_id && business.get(lead_id)) || null,
    playbook_id: (send_id && step.get(send_id)?.playbook_id) || null,
    root_id: (send_id && step.get(send_id)?.root_id) || null,
  }));
}

/** A reading by its message, on the caller's client: the row a member's undo acts on. Null when RLS hides it. */
export async function replyReadingRefOf(db: Db, messageId: string): Promise<{ id: string; tenant_id: string } | null> {
  const { data, error } = await db
    .from("reach_out_replies")
    .select("message_id, tenant_id")
    .eq("message_id", messageId)
    .maybeSingle();
  if (error) throw new Error(`cannot read the reply: ${error.message}`);
  return data ? { id: data.message_id, tenant_id: data.tenant_id } : null;
}

/** Whether the caller may undo this reading (00222 reach_out_reply_undoable): null when they may, else why not. */
export async function replyUndoableOf(db: Db, messageId: string): Promise<string | null> {
  const { data, error } = await db.rpc("reach_out_reply_undoable", { p_message_id: messageId });
  if (error) throw new Error(`cannot ask whether the reply can be undone: ${error.message}`);
  return typeof data === "string" && data ? data : null;
}

/** "Read as no · undo" (00222 reach_out_reply_undo), as the caller. A refusal throws the door's error, its code kept. */
export async function undoReplyReading(db: Db, messageId: string): Promise<Json> {
  const { data, error } = await db.rpc("reach_out_reply_undo", { p_message_id: messageId });
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data;
}

/** A workspace whose 6 PM it is, with the day's reach-out numbers (00241 reach_out_day_due). */
export interface ReachOutDayDue {
  tenant_id: string;
  /** The workspace's own day, "2026-09-28". */
  day: string;
  numbers: { written: number; wrote_back: number; interested: number; said_no: number; bounced: number; held: number };
}

/**
 * The workspaces with a reach-out whose local hour at `now` is 18, not told that day, with a number above zero, at most
 * `limit` (Reach out Part 6, H12). The service role asks it, from the hourly playbooks sweep; a read that fails throws.
 */
export async function reachOutDayDue(db: Db, now: Date, limit: number): Promise<ReachOutDayDue[]> {
  const { data, error } = await db.rpc("reach_out_day_due", { p_now: now.toISOString(), p_limit: limit });
  if (error) throw new Error(`cannot read the day's reach-out numbers: ${error.message}`);
  return (data ?? []).map((r) => {
    const n = (r.numbers && typeof r.numbers === "object" ? r.numbers : {}) as Record<string, unknown>;
    const num = (k: string) => Number(n[k] ?? 0) || 0;
    return {
      tenant_id: r.tenant_id,
      day: r.day,
      numbers: {
        written: num("written"),
        wrote_back: num("wrote_back"),
        interested: num("interested"),
        said_no: num("said_no"),
        bounced: num("bounced"),
        held: num("held"),
      },
    };
  });
}
