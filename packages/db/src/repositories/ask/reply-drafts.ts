/**
 * A thread's drafts (decision 0093, 00475, 00538): one a thread and kind (a reply, or a call's brief), claimed when the hold
 * owes one, kept by the service role's doors until the customer writes again, and read back for every page. The reads
 * that name a tenant run on whichever client is handed them, RLS keeping a member's to their workspace; the claim, the
 * write, the facts a draft is decided by and the sweep's list are the service role's.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  answerWireOf,
  isOptedOutContact,
  REACH_OUT_REPLY_DAYS,
  type MessageDto,
  type SchemaSet,
} from "@chanlytics/contracts";
import type { Database, Json } from "../../types";
import { findReachOutReply } from "../campaigns/reach-out/outreach";

type Db = SupabaseClient<Database>;

/** A kept draft as the table holds it: its words are the caller's to read (contracts ReplyDraftWords). */
export interface ConversationDraftRow {
  conversation_id: string;
  kind: string;
  for_message_id: string | null;
  words: Json;
  made_at: string;
  state: string | null;
  source: string | null;
  rules: number | null;
  used: string[];
  why_failed: string | null;
}

const DRAFT_COLUMNS = "conversation_id, kind, for_message_id, words, made_at, state, source, rules, used, why_failed";

/** How many threads the read of what is set aside names: a line says one and how many more. */
const SET_ASIDE_READ = 50;

/** The workspace's threads set aside (00539), newest first: the Today line's, on the member's own session. */
export async function listConversationsSetAside(db: Db, tenantId: string): Promise<string[]> {
  const { data, error } = await db
    .from("conversations")
    .select("id")
    .eq("tenant_id", tenantId)
    .not("set_aside_at", "is", null)
    .eq("state", "archived")
    .order("set_aside_at", { ascending: false })
    .limit(SET_ASIDE_READ);
  if (error) throw new Error(`conversations: ${error.message}`);
  return (data ?? []).map((r) => r.id);
}

/**
 * The drafts kept on these threads, any kind, in the workspace; or, asked for the newest (`{ newest: n }`), the workspace's
 * newest, newest first, at most n and one more: the caller learns from that one whether these are all there are (a page's
 * read of them with its own first reads, before it knows its rows).
 */
export async function listConversationDrafts(
  db: Db,
  tenantId: string,
  which: readonly string[] | { newest: number },
): Promise<ConversationDraftRow[]> {
  if (Array.isArray(which) && which.length === 0) return [];
  const all = db.from("conversation_drafts").select(DRAFT_COLUMNS).eq("tenant_id", tenantId);
  const { data, error } = await ("newest" in which
    ? all.order("made_at", { ascending: false }).limit(which.newest + 1)
    : all.in("conversation_id", [...which]));
  if (error) throw new Error(`conversation_drafts: ${error.message}`);
  return data ?? [];
}

/**
 * The customer's newest message on a thread, and the open hold's reason and what it left: all a send asks of a thread it could
 * not deliver on (jobs handlers.ts openHold), under the client it is handed.
 */
export async function findThreadDraftFacts(
  db: Db,
  tenantId: string,
  conversationId: string,
): Promise<{ forMessageId: string | null; reason: string | null; details: string | null }> {
  const [msg, hold] = await Promise.all([
    db
      .from("messages")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("conversation_id", conversationId)
      .eq("sender", "customer")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("escalations")
      .select("reason, details")
      .eq("tenant_id", tenantId)
      .eq("conversation_id", conversationId)
      .eq("state", "open")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (msg.error) throw new Error(`messages: ${msg.error.message}`);
  if (hold.error) throw new Error(`escalations: ${hold.error.message}`);
  const details = hold.data?.details;
  return {
    forMessageId: msg.data?.id ?? null,
    reason: hold.data?.reason ?? null,
    details: typeof details === "string" && details.trim() ? details.trim() : null,
  };
}

/** What a draft is decided by and written from (core reply-draft.ts), as the rows say it now. */
export interface ReplyDraftThread {
  contactId: string | null;
  /** The open hold's reason and what it left, or nulls with none. */
  holdReason: string | null;
  holdDetails: string | null;
  /** Their newest message, its words and subject, and the address it came from. */
  forMessageId: string | null;
  theirWords: string | null;
  theirSubject: string | null;
  theirName: string | null;
  theirAddress: string | null;
  /** The wire a reply goes by (contracts answerWireOf); null on a thread with no message at all. */
  wire: "whatsapp" | "sms" | "email" | "instagram" | null;
  clocks: { whatsapp: string | null; instagram: string | null };
  optedOut: boolean;
  setAside: boolean;
  /** The receptionist's own reply is queued on this thread: its countdown is the thread's draft. */
  queuedReply: boolean;
  /** Their newest message answers one of the workspace's reach-outs: its reading says whether a draft is written. */
  reachOutReply: boolean;
  kept: ConversationDraftRow[];
}

/** How many of the thread's newest messages say its wire and whether a reply is queued. */
const FACT_MESSAGES = 12;

/** A row as the wire's rules read it: the fields answerWireOf takes. */
type WireRow = Pick<MessageDto, "type" | "channel" | "direction" | "sender" | "meta">;

/** An email's subject and sender as the intake keeps them on the message (core email-ingest metaOf). */
function emailOf(meta: unknown): { subject: string | null; name: string | null; address: string | null } {
  const email =
    meta && typeof meta === "object" && !Array.isArray(meta) ? (meta as Record<string, unknown>).email : null;
  const e = email && typeof email === "object" && !Array.isArray(email) ? (email as Record<string, unknown>) : {};
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return { subject: text(e.subject), name: text(e.from_name), address: text(e.from) };
}

/**
 * The thread as a draft reads it, or null with no such thread. A failed read throws: "we could not check" is not "nothing
 * is owed".
 */
export async function replyDraftThreadOf(
  db: Db,
  tenantId: string,
  conversationId: string,
): Promise<ReplyDraftThread | null> {
  const conv = await db
    .from("conversations")
    .select("state, contact_id, last_inbound_on_whatsapp, last_inbound_on_instagram, set_aside_at")
    .eq("tenant_id", tenantId)
    .eq("id", conversationId)
    .maybeSingle();
  if (conv.error) throw new Error(`conversations: ${conv.error.message}`);
  if (!conv.data) return null;
  const [messages, hold, person, kept] = await Promise.all([
    db
      .from("messages")
      .select("id, channel, type, sender, direction, status, meta, body")
      .eq("tenant_id", tenantId)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(FACT_MESSAGES),
    db
      .from("escalations")
      .select("reason, details")
      .eq("tenant_id", tenantId)
      .eq("conversation_id", conversationId)
      .eq("state", "open")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    conv.data.contact_id
      ? db
          .from("contacts")
          .select("consent, dnc, email")
          .eq("tenant_id", tenantId)
          .eq("id", conv.data.contact_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    listConversationDrafts(db, tenantId, [conversationId]),
  ]);
  if (messages.error) throw new Error(`messages: ${messages.error.message}`);
  if (hold.error) throw new Error(`escalations: ${hold.error.message}`);
  if (person.error) throw new Error(`contacts: ${person.error.message}`);
  const rows = messages.data ?? [];
  const theirs = rows.find((m) => m.sender === "customer") ?? null;
  const email = theirs ? emailOf(theirs.meta) : { subject: null, name: null, address: null };
  const details = hold.data?.details;
  const wire = rows.length ? answerWireOf([...rows].reverse() as WireRow[]) : null;
  // Only an email can answer a reach-out, and only a hold makes it matter: nobody asks of the rest.
  const reachOutReply =
    !!theirs && !!hold.data && wire === "email"
      ? !!(await findReachOutReply(db, { tenantId, messageId: theirs.id, days: REACH_OUT_REPLY_DAYS }))
      : false;
  return {
    contactId: conv.data.contact_id,
    holdReason: hold.data?.reason ?? null,
    holdDetails: typeof details === "string" && details.trim() ? details.trim() : null,
    forMessageId: theirs?.id ?? null,
    theirWords: theirs?.body ?? null,
    theirSubject: email.subject,
    theirName: email.name,
    theirAddress: email.address ?? person.data?.email ?? null,
    // Oldest first, as a thread holds them. A thread with no row has no wire: a draft has nothing to go by.
    wire,
    clocks: {
      whatsapp: conv.data.last_inbound_on_whatsapp ?? null,
      instagram: conv.data.last_inbound_on_instagram ?? null,
    },
    optedOut: isOptedOutContact(person.data),
    // While it stays archived: a new message that came in anyway reopens it, and it is an ordinary thread again.
    setAside: conv.data.set_aside_at !== null && conv.data.state === "archived",
    queuedReply: rows.some((m) => m.sender === "ai" && m.status === "queued"),
    reachOutReply,
    kept,
  };
}

/** The thread's draft says it is being written (00538 conversation_draft_claim): true when this call took it. */
export async function claimConversationDraft(
  db: Db,
  details: {
    tenantId: string;
    conversationId: string;
    kind: string;
    forMessageId: string | null;
    rules: number;
    source: string;
    again?: boolean;
    staleBefore?: Date;
  },
): Promise<boolean> {
  const { data, error } = await db.rpc("conversation_draft_claim", {
    p_tenant_id: details.tenantId,
    p_conversation_id: details.conversationId,
    p_kind: details.kind,
    // None for a call back nothing was written on: the door reads it as SQL's null.
    p_for_message_id: details.forMessageId,
    p_rules: details.rules,
    p_source: details.source,
    ...(details.again ? { p_again: true } : {}),
    ...(details.staleBefore ? { p_stale_before: details.staleBefore.toISOString() } : {}),
  });
  if (error) throw new Error(`conversation_draft_claim: ${error.message}`);
  return data === true;
}

/**
 * A thread's draft kept (00538 conversation_draft_write), or null where its row was claimed for a newer message since: a
 * slow run writes nothing over it.
 */
export async function writeConversationDraft(
  db: Db,
  details: {
    tenantId: string;
    conversationId: string;
    kind: string;
    forMessageId: string | null;
    state: string;
    words: Json;
    source: string;
    rules: number;
    used?: readonly string[];
    whyFailed?: string | null;
    madeBy?: string | null;
  },
): Promise<ConversationDraftRow | null> {
  const { data, error } = await db.rpc("conversation_draft_write", {
    p_tenant_id: details.tenantId,
    p_conversation_id: details.conversationId,
    p_kind: details.kind,
    // None for a call back nothing was written on: the door reads it as SQL's null.
    p_for_message_id: details.forMessageId,
    p_state: details.state,
    p_words: details.words,
    p_source: details.source,
    p_rules: details.rules,
    p_used: [...(details.used ?? [])],
    ...(details.whyFailed ? { p_why_failed: details.whyFailed } : {}),
    ...(details.madeBy ? { p_made_by: details.madeBy } : {}),
  });
  if (error) throw new Error(`conversation_draft_write: ${error.message}`);
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const item = data as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    conversation_id: text(item.conversation_id) ?? details.conversationId,
    kind: text(item.kind) ?? details.kind,
    for_message_id: text(item.for_message_id),
    words: (item.words ?? {}) as Json,
    made_at: text(item.made_at) ?? new Date().toISOString(),
    state: text(item.state),
    source: text(item.source),
    rules: typeof item.rules === "number" ? item.rules : null,
    used: Array.isArray(item.used) ? item.used.filter((u): u is string => typeof u === "string") : [],
    why_failed: text(item.why_failed),
  };
}

/** A thread's claim let go: its hold was answered before the draft was written, so nothing stands for it. */
export async function dropConversationDraft(
  db: Db,
  details: { tenantId: string; conversationId: string; kind: SchemaSet<"conversation_drafts.kind"> },
): Promise<void> {
  const { error } = await db
    .from("conversation_drafts")
    .delete()
    .eq("tenant_id", details.tenantId)
    .eq("conversation_id", details.conversationId)
    .eq("kind", details.kind)
    .eq("state", "writing");
  if (error) throw new Error(`conversation_drafts: ${error.message}`);
}

/**
 * A claim that will not be written says so (the job's settlement): only a row still saying it is being written, for this
 * message. True when one moved.
 */
export async function recordConversationDraftFailed(
  db: Db,
  details: {
    tenantId: string;
    conversationId: string;
    kind: SchemaSet<"conversation_drafts.kind">;
    forMessageId: string | null;
    whyFailed: string;
  },
): Promise<boolean> {
  const held = db
    .from("conversation_drafts")
    .update({ state: "failed", why_failed: details.whyFailed, made_at: new Date().toISOString() })
    .eq("tenant_id", details.tenantId)
    .eq("conversation_id", details.conversationId)
    .eq("kind", details.kind)
    .eq("state", "writing");
  const { data, error } = await (
    details.forMessageId ? held.eq("for_message_id", details.forMessageId) : held.is("for_message_id", null)
  ).select("id");
  if (error) throw new Error(`conversation_drafts: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/**
 * A thread set aside as not a customer's, whole (00539 conversation_set_aside): the row says so, and its open hold is
 * resolved, so nothing counts it or warns of it. True when the row moved.
 */
export async function setConversationAside(
  db: Db,
  details: { tenantId: string; conversationId: string; why: "pitch" | "notice" },
): Promise<boolean> {
  const { data, error } = await db.rpc("conversation_set_aside", {
    p_tenant_id: details.tenantId,
    p_conversation_id: details.conversationId,
    p_why: details.why,
  });
  if (error) throw new Error(`conversation_set_aside: ${error.message}`);
  return data === true;
}

/** The holds whose draft is owed another look (00538 reply_drafts_due), newest first, across workspaces: the sweep's. */
export async function replyDraftsDue(
  db: Db,
  rules: number,
  limit: number,
): Promise<Array<{ tenantId: string; conversationId: string }>> {
  const { data, error } = await db.rpc("reply_drafts_due", { p_rules: rules, p_limit: limit });
  if (error) throw new Error(`reply_drafts_due: ${error.message}`);
  return (data ?? []).map((r) => ({ tenantId: r.tenant_id, conversationId: r.conversation_id }));
}

/** The thread an escalation is on, or null where it is gone: what escalation.changed names is the hold's own id. */
export async function findConversationOfEscalation(
  db: Db,
  tenantId: string,
  escalationId: string,
): Promise<string | null> {
  const { data, error } = await db
    .from("escalations")
    .select("conversation_id")
    .eq("tenant_id", tenantId)
    .eq("id", escalationId)
    .maybeSingle();
  if (error) throw new Error(`escalations: ${error.message}`);
  return data?.conversation_id ?? null;
}
