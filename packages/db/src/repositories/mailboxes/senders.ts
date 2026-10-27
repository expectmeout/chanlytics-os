/**
 * The senders of a connected mailbox's mail (00483): what the workspace said of them (mailbox_senders), and what the
 * mailbox left where it was, one row a sender (mailbox_left). The edge's sync and import read the first and note the
 * second as the service role.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MailboxLeftWhy, MailboxSenderVerdict } from "@chanlytics/contracts";
import type { Database } from "../../database.types";
import { dbLog } from "../../observe";

type Db = SupabaseClient<Database>;

/** What the workspace said of its senders, by address or domain (contracts senderVerdictOf reads it). */
export async function mailboxSenderVerdicts(db: Db, tenantId: string): Promise<Map<string, MailboxSenderVerdict>> {
  const { data, error } = await db.from("mailbox_senders").select("sender, verdict").eq("tenant_id", tenantId);
  if (error) throw new Error(`cannot read what the workspace said of its senders: ${error.message}`);
  return new Map((data ?? []).map((r) => [r.sender, r.verdict === "person" ? "person" : "automated"] as const));
}

/**
 * One more email the mailbox left where it was, from one sender (00483 mailbox_left_note). Best effort: the email is
 * left whether or not the line about it is written, so a refusal is logged and answered false, never thrown.
 */
export async function noteMailboxLeft(
  db: Db,
  p: { tenantId: string; address: string; name: string | null; why: MailboxLeftWhy; at: string },
): Promise<boolean> {
  const { error } = await db.rpc("mailbox_left_note", {
    p_tenant_id: p.tenantId,
    p_address: p.address,
    p_name: p.name ?? "",
    p_why: p.why,
    p_at: p.at,
  });
  if (!error) return true;
  dbLog().error("mailbox_left_note_failed", { tenant_id: p.tenantId, why: p.why, error: error.message });
  return false;
}
