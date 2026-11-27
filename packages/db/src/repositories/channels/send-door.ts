/**
 * What the one send door reads and writes about the message it sends (core deliver.ts, decision 0111): whether a person
 * spoke on the thread after a draft was written, the outbox row settled with its event only while it is still queued, the thread
 * stamped with the send, and a WhatsApp template's category, which decides its purpose. Each answer is the database's
 * as it came; the door says its own failures.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../types";
import { DbFailure, type TenantId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;

/** When a message was written, inside its workspace. */
export const findMessageWrittenAt = async (db: Db, tenantId: TenantId, messageId: string) =>
  db.from("messages").select("created_at").eq("id", messageId).eq("tenant_id", tenantId).maybeSingle();

/** A thread's outbound messages a person wrote after a moment, oldest first, at most `limit`. */
export const listPersonRepliesAfter = async (
  db: Db,
  params: { tenantId: TenantId; conversationId: string; after: string; limit: number },
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
export const stampThreadSent = async (db: Db, params: { tenantId: TenantId; conversationId: string; at: string }) =>
  db
    .from("conversations")
    .update({ last_message_at: params.at })
    .eq("id", params.conversationId)
    .eq("tenant_id", params.tenantId);

/** What the send door says of a settle, written with it: the send's kind and its own words. */
export interface SendTold {
  kind: "sent" | "blocked" | "failed";
  data: Record<string, Json>;
}

/**
 * An outbox row settled only while it is still queued, with its event in the same transaction (00721 message_settle):
 * sent (and a cancel that won the row first said beside it), refused with its reason, or failed. False means a cancel
 * won it first; the event is written either way. Throws when it could not be written.
 */
export async function settleQueuedMessage(
  db: Db,
  params: {
    tenantId: TenantId;
    messageId: string;
    patch: Pick<Database["public"]["Tables"]["messages"]["Update"], "status" | "external_id" | "error">;
    told: SendTold;
  },
): Promise<boolean> {
  const { data, error } = await db.rpc("message_settle", {
    p_tenant_id: params.tenantId,
    p_message_id: params.messageId,
    p_patch: { ...params.patch },
    p_told: { kind: params.told.kind, data: params.told.data },
  });
  if (error) throw new DbFailure(error, `deliver: cannot settle message ${params.messageId}`);
  return data === true;
}

/** An outbox message as the job that sends it reads it, or null where it is gone. */
export const findOutboxMessage = async (db: Db, tenantId: TenantId, messageId: string) =>
  db
    .from("messages")
    .select("id, status, body, template_name, channel, sender, meta")
    .eq("id", messageId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

/** A WhatsApp template's category, by its name and language in the workspace. */
export const findTemplateCategory = async (db: Db, params: { tenantId: TenantId; name: string; language: string }) =>
  db
    .from("templates")
    .select("category")
    .eq("tenant_id", params.tenantId)
    .eq("channel", "whatsapp")
    .eq("name", params.name)
    .eq("language", params.language)
    .maybeSingle();
