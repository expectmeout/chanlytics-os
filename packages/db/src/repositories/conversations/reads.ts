/**
 * A workspace's threads as the member's pages and exports read them (decision 0111): a thread's messages, newest
 * first or a page at a time, the threads and the consent changes a page at a time, a thread as its export names it,
 * and the holds waiting. Read on the member's own client. Each answer is the database's as it came.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types";

import type { SchemaSet } from "@chanlytics/contracts";
type Db = SupabaseClient<Database>;

/** What a message is read with, where a list of them is mapped (the dashboard's MessageDto). */
export const MESSAGE_COLUMNS =
  "id, conversation_id, direction, sender, type, body, media, meta, status, created_at, channel_ts, channel";

/** What a thread's own messages are read with: a message's columns, with its error. */
export const THREAD_MESSAGE_COLUMNS =
  "id, conversation_id, direction, sender, type, body, media, meta, created_at, status, channel_ts, channel, error";

/** A thread's newest messages, `limit` of them, with `before` only those before it. */
export const listThreadMessages = async (
  db: Db,
  conversationId: string,
  before: string | null | undefined,
  limit: number,
) => {
  const query = db
    .from("messages")
    .select(THREAD_MESSAGE_COLUMNS)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return before ? query.lt("created_at", before) : query;
};

/** One page (`from` to `to`) of a thread's messages, oldest first, as its export writes them. */
export const pageThreadForExport = async (db: Db, conversationId: string, from: number, to: number) =>
  db
    .from("messages")
    .select("id, direction, sender, type, body, media, meta, created_at, status, channel_ts, channel")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .range(from, to);

/** One page (`from` to `to`) of these threads' messages, by thread and oldest first. */
export const pageMessagesOfThreads = async (db: Db, conversationIds: string[], from: number, to: number) =>
  db
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .in("conversation_id", conversationIds)
    .order("conversation_id", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .range(from, to);

/** One of the workspace's threads as its export names it: its person. */
export const findThreadForExport = async (db: Db, tenantId: string, conversationId: string) =>
  db
    .from("conversations")
    .select("id, tenant_id, contacts (id, display_name, wa_profile_name, phone_e164, email)")
    .eq("id", conversationId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

/** One page (`from` to `to`) of the workspace's threads, or one person's, oldest first. */
export const pageThreadRows = async (
  db: Db,
  tenantId: string,
  contactId: string | undefined,
  from: number,
  to: number,
) => {
  const all = db
    .from("conversations")
    .select("id, contact_id, state, created_at, last_message_at, last_inbound_at")
    .eq("tenant_id", tenantId);
  return (contactId ? all.eq("contact_id", contactId) : all)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .range(from, to);
};

/** One page (`from` to `to`) of the workspace's consent changes, or one person's, oldest first. */
export const pageConsentChanges = async (
  db: Db,
  tenantId: string,
  contactId: string | undefined,
  from: number,
  to: number,
) => {
  const all = db
    .from("events")
    .select("id, subject_id, created_at, data")
    .eq("tenant_id", tenantId)
    .eq("kind", "contact.consent_changed");
  return (contactId ? all.eq("subject_id", contactId) : all)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .range(from, to);
};

/** What a hold is read with: its reason and details, its thread, and whether its person is being erased. */
const HOLD_READ_COLUMNS =
  "id, reason, details, state, created_at, conversation_id, conversations (contacts (erasing_since))";

/** The workspace's holds in `state` for any reason but `handBack`'s, newest first, `limit` of them. */
export const listHoldsWaiting = async (
  db: Db,
  tenantId: string,
  state: SchemaSet<"escalations.state">,
  handBack: readonly SchemaSet<"escalations.reason">[],
  limit: number,
) =>
  db
    .from("escalations")
    .select(HOLD_READ_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("state", state)
    .not("reason", "in", `(${handBack.join(",")})`)
    .order("created_at", { ascending: false })
    .limit(limit);

/** The workspace's holds in `state` handed back for one of `handBack`'s reasons, newest first, `limit` of them. */
export const listHoldsHandedBack = async (
  db: Db,
  tenantId: string,
  state: SchemaSet<"escalations.state">,
  handBack: readonly SchemaSet<"escalations.reason">[],
  limit: number,
) =>
  db
    .from("escalations")
    .select(HOLD_READ_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("state", state)
    .in("reason", [...handBack])
    .order("created_at", { ascending: false })
    .limit(limit);

/** A message's workspace, thread and state, or none. */
export const findMessageState = async (db: Db, messageId: string) =>
  db.from("messages").select("id, tenant_id, conversation_id, status").eq("id", messageId).maybeSingle();

/** One of the workspace's messages' media, or none. */
export const findMessageMediaRow = async (db: Db, tenantId: string, messageId: string) =>
  db.from("messages").select("id, media").eq("id", messageId).eq("tenant_id", tenantId).maybeSingle();

/** One of the workspace's messages' meta, or none. */
export const findMessageMeta = async (db: Db, tenantId: string, messageId: string) =>
  db.from("messages").select("meta").eq("id", messageId).eq("tenant_id", tenantId).maybeSingle();

/** A hold resolved by a member, only while open: its id back, none when it was not open. */
export const resolveHold = async (db: Db, escalationId: string, userId: string) =>
  db
    .from("escalations")
    .update({ state: "resolved", resolved_by_user_id: userId })
    .eq("id", escalationId)
    .eq("state", "open")
    .select("id");

/** A hold linked to the decision that resolved it. */
export const linkHoldDecision = async (db: Db, escalationId: string, decisionId: string) =>
  db.from("escalations").update({ decision_id: decisionId }).eq("id", escalationId);

/** The workspace's WhatsApp template of a name and language as a reply sends it, or none. */
export const findTemplateForReply = async (db: Db, tenantId: string, name: string, language: string) =>
  db
    .from("templates")
    .select("name, language, body_preview, meta_status, category, variables")
    .eq("tenant_id", tenantId)
    .eq("channel", "whatsapp")
    .eq("name", name)
    .eq("language", language)
    .maybeSingle();

/** A thread written (a reply's claim on it), its id back: none when the member may not write it. */
export const patchThreadBack = async (
  db: Db,
  conversationId: string,
  set: Database["public"]["Tables"]["conversations"]["Update"],
) => db.from("conversations").update(set).eq("id", conversationId).select("id");

/** A member's reply queued on a thread, its id back. */
export const queueMemberReply = async (db: Db, row: Database["public"]["Tables"]["messages"]["Insert"]) =>
  db.from("messages").insert(row).select("id").single();

/** A snoozed thread woken, only while it is snoozed: its id back, none when it was not. */
export const wakeThreadBack = async (
  db: Db,
  conversationId: string,
  set: Database["public"]["Tables"]["conversations"]["Update"],
) => db.from("conversations").update(set).eq("id", conversationId).eq("state", "snoozed").select("id");
