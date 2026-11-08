/**
 * What a dead email intake leaves to settle (packages/jobs settle.ts, decision 0111): the mailbox marked with why its
 * mail stopped, and the thread an email that arrived belongs to, by the provider's id of it. Each answer is the
 * database's as it came.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types";

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

/** A mailbox the workspace opens on its own domain (create_mailbox). */
export const addMailbox = async (
  db: SupabaseClient<Database>,
  args: Database["public"]["Functions"]["create_mailbox"]["Args"],
) => db.rpc("create_mailbox", args);

/** The name a mailbox sends as (rename_mailbox). */
export const setMailboxName = async (db: SupabaseClient<Database>, mailboxId: string, fromName: string) =>
  db.rpc("rename_mailbox", { p_mailbox_id: mailboxId, p_from_name: fromName });
