/**
 * What the one send door reads and writes about the message it sends (core deliver.ts, decision 0111): whether a person
 * spoke on the thread after a draft was written, the outbox row finalized only while it is still queued, the thread
 * stamped with the send, and a WhatsApp template's category, which decides its purpose. Each answer is the database's
 * as it came; the door says its own failures.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";

type Db = SupabaseClient<Database>;

/** When a message was written, inside its workspace. */
export const findMessageWrittenAt = async (db: Db, tenantId: string, messageId: string) =>
  db.from("messages").select("created_at").eq("id", messageId).eq("tenant_id", tenantId).maybeSingle();

/** A thread's outbound messages a person wrote after a moment, oldest first, at most `limit`. */
export const listPersonRepliesAfter = async (
  db: Db,
  params: { tenantId: string; conversationId: string; after: string; limit: number },
) =>
  db
    .from("messages")
    .select("id, meta")
    .eq("conversation_id", params.conversationId)
    .eq("tenant_id", params.tenantId)
    .eq("direction", "outbound")
    .eq("sender", "human")
    .gt("created_at", params.after)
    .order("created_at", { ascending: true })
    .limit(params.limit);

/** The thread's last message stamped with the send. */
export const stampThreadSent = async (db: Db, params: { tenantId: string; conversationId: string; at: string }) =>
  db
    .from("conversations")
    .update({ last_message_at: params.at })
    .eq("id", params.conversationId)
    .eq("tenant_id", params.tenantId);

/** An outbox row finalized only while it is still queued: no row back means a cancel won it first. */
export const finalizeQueuedMessage = async (
  db: Db,
  messageId: string,
  patch: Database["public"]["Tables"]["messages"]["Update"],
) => db.from("messages").update(patch).eq("id", messageId).eq("status", "queued").select("id");

/** An outbox message as the job that sends it reads it, or null where it is gone. */
export const findOutboxMessage = async (db: Db, tenantId: string, messageId: string) =>
  db
    .from("messages")
    .select("id, status, body, template_name, channel, sender, meta")
    .eq("id", messageId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

/** A WhatsApp template's category, by its name and language in the workspace. */
export const findTemplateCategory = async (db: Db, params: { tenantId: string; name: string; language: string }) =>
  db
    .from("templates")
    .select("category")
    .eq("tenant_id", params.tenantId)
    .eq("channel", "whatsapp")
    .eq("name", params.name)
    .eq("language", params.language)
    .maybeSingle();
