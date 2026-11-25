/**
 * The threads as the Inbox and a person's page read them, and the two reads the steer door makes of a held draft (lane 2
 * of the code refinement plan, 25 Nov 2026: the statements those readers wrote themselves, moved here). A list read answers
 * PostgREST's own result, its data and its error, which the reader judges as it did; a read the door needs whole throws.
 *
 * A thread's WhatsApp clock is read through its one accessor, the computed column last_inbound_on_whatsapp (00485, decision
 * 0001 step 5), under the field name the pages read; its Instagram clock is last_inbound_on_instagram (00486), read as
 * last_ig_inbound_at.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DbFailure } from "@chanlytics/contracts";
import type { Database } from "../../types";
import { MESSAGE_COLUMNS } from "./reads";
import type { ContactId, TenantId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;

const THREAD_COLUMNS =
  "id, state, paused_until, snooze_until, set_aside_at, set_aside_why, assignee_user_id, last_wa_inbound_at:last_inbound_on_whatsapp, last_ig_inbound_at:last_inbound_on_instagram, last_message_at, last_inbound_at";
const THREAD_PERSON_COLUMNS =
  "id, display_name, wa_profile_name, phone_e164, email, consent, dnc, marketing_consent, proposal_url, acquired_via, acquired_ref, email_suppressed_at, email_suppressed_reason";
/** A thread as the pages read it, with its person. */
export const CONVERSATION_COLUMNS = `${THREAD_COLUMNS}, contacts (${THREAD_PERSON_COLUMNS})` as const;
/** The same, for a list: only the threads whose person passes what the read asks of `contacts` (PostgREST's inner embed). */
const LISTED_CONVERSATION_COLUMNS = `${THREAD_COLUMNS}, contacts!inner (${THREAD_PERSON_COLUMNS})` as const;

/**
 * The Inbox's threads: those `ids` names (a search's, kept to the listed; or one named by its id, which reads whatever
 * becomes of its person), or the newest `most` listed. `listed` is the filter on `contacts` that keeps whoever is being
 * erased out of a list.
 */
export const listInboxThreads = async (
  db: Db,
  tenantId: TenantId,
  ask: { ids: string[] | null; searched: boolean; listed: string; most: number },
) => {
  const listed = () =>
    db
      .from("conversations")
      .select(LISTED_CONVERSATION_COLUMNS)
      .eq("tenant_id", tenantId)
      .or(ask.listed, { referencedTable: "contacts" });
  if (ask.searched && ask.ids) return listed().in("id", ask.ids);
  if (ask.ids) return db.from("conversations").select(CONVERSATION_COLUMNS).eq("tenant_id", tenantId).in("id", ask.ids);
  return listed().order("last_message_at", { ascending: false, nullsFirst: false }).limit(ask.most);
};

/** Each thread's newest `each` messages, `most` in all, through the thread's own index (newest_messages, 00258). */
export const listNewestMessages = async (
  db: Db,
  tenantId: TenantId,
  threads: { ids: string[]; each: number; most: number },
) => {
  const { data, error } = await db.rpc("newest_messages", {
    p_tenant_id: tenantId,
    p_threads: threads.ids,
    p_each: threads.each,
    p_most: threads.most,
  });
  if (error) throw new DbFailure(error, "newest_messages");
  return data;
};

/** A person's threads, the newest first. */
export const listPersonThreads = async (db: Db, tenantId: TenantId, contactId: ContactId) =>
  db
    .from("conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("contact_id", contactId)
    .order("last_message_at", { ascending: false, nullsFirst: false });

/** One page (`from` to `to`) of these threads' messages, the newest first, the id breaking ties. */
export const pageNewestMessagesOfThreads = async (db: Db, conversationIds: string[], from: number, to: number) =>
  db
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .in("conversation_id", conversationIds)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

/** These threads' holds, the newest first, open or not. */
export const listHoldsOfThreads = async (db: Db, conversationIds: string[]) =>
  db
    .from("escalations")
    .select("id, conversation_id, reason, state, details, created_at, updated_at, resolved_by_user_id")
    .in("conversation_id", conversationIds)
    .order("created_at", { ascending: false });

/** A held draft the steer door may rewrite: the message, of the workspace its token names where it names one. */
export const findDraftToSteer = async (db: Db, messageId: string, workspace: TenantId | null) => {
  const draft = db
    .from("messages")
    .select("id, tenant_id, conversation_id, contact_id, sender, status, meta, channel, sending_at")
    .eq("id", messageId);
  return (workspace ? draft.eq("tenant_id", workspace) : draft).maybeSingle();
};

/** The number of the person a thread is with, or null where it has none; a read that fails throws. */
export async function findThreadPhone(db: Db, tenantId: TenantId, conversationId: string): Promise<string | null> {
  const { data, error } = await db
    .from("conversations")
    .select("id, contacts (phone_e164)")
    .eq("id", conversationId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new DbFailure(error, "the steered draft's thread");
  return data?.contacts.phone_e164 ?? null;
}
