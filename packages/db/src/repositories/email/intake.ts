/**
 * What a dead email intake leaves to settle (packages/jobs settle.ts, decision 0111): the mailbox marked with why its
 * mail stopped, and the thread an email that arrived belongs to, by the provider's id of it. Each answer is the
 * database's as it came.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";

type Db = SupabaseClient<Database>;

/** The mailbox marked with why its intake stopped; no row back means it is gone, or not the workspace's. */
export const markMailboxIntakeFailed = async (
  db: Db,
  params: { tenantId: string; mailboxId: string; lastError: string },
) =>
  db
    .from("mailboxes")
    .update({ last_error: params.lastError })
    .eq("id", params.mailboxId)
    .eq("tenant_id", params.tenantId)
    .select("id");

/** The thread an email message belongs to, by the provider's id of it. */
export const findEmailThreadOf = async (db: Db, params: { tenantId: string; externalId: string }) =>
  db
    .from("messages")
    .select("conversation_id")
    .eq("tenant_id", params.tenantId)
    .eq("channel", "email")
    .eq("external_id", params.externalId)
    .maybeSingle();
