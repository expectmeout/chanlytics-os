/**
 * The senders of a connected mailbox's mail (00483): what the workspace said of them (mailbox_senders), and what the
 * mailbox left where it was, one row a sender (mailbox_left). The edge's sync and import read the first and note the
 * second as the service role; a member reads both and says what a sender is on their own session.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  senderVerdictOf,
  type MailboxLeftWhy,
  type MailboxSenderVerdict,
  type MailboxSendersDto,
} from "@chanlytics/contracts";
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

/** How many senders the list under the mailbox says, newest first. */
const LEFT_SHOWN = 200;

/**
 * The list under the mailbox (contracts MailboxSendersDto), on the member's session (RLS): who the mailbox left mail
 * from, newest first, leaving out a sender since said to be a person; and what the workspace said of senders.
 */
export async function mailboxSendersOf(db: Db, tenantId: string): Promise<MailboxSendersDto> {
  const [left, said] = await Promise.all([
    db
      .from("mailbox_left")
      .select("address, name, why, count, first_at, last_at")
      .eq("tenant_id", tenantId)
      .order("last_at", { ascending: false })
      .limit(LEFT_SHOWN),
    db
      .from("mailbox_senders")
      .select("sender, verdict, set_at")
      .eq("tenant_id", tenantId)
      .order("set_at", { ascending: false }),
  ]);
  if (left.error) throw new Error(`cannot read what the mailbox left: ${left.error.message}`);
  if (said.error) throw new Error(`cannot read what the workspace said of its senders: ${said.error.message}`);
  const verdicts = new Map(
    (said.data ?? []).map((r) => [r.sender, r.verdict === "person" ? "person" : "automated"] as const),
  );
  return {
    left: (left.data ?? [])
      .filter((r) => senderVerdictOf(verdicts, r.address) !== "person")
      .map((r) => ({ ...r, why: r.why as MailboxLeftWhy })),
    said: (said.data ?? []).map((r) => ({ ...r, verdict: r.verdict === "person" ? "person" : "automated" })),
  };
}

/**
 * What a member says of a sender, on their own session (00483 mailbox_sender_sort, which judges who may): automated, a
 * person, or taken back (null). Throws with the door's code (42501 not theirs, 22023 not a sender) for the route to say.
 */
export async function sortMailboxSender(
  db: Db,
  p: { tenantId: string; sender: string; verdict: MailboxSenderVerdict | null },
): Promise<void> {
  const { error } = await db.rpc("mailbox_sender_sort", {
    p_tenant_id: p.tenantId,
    p_sender: p.sender,
    // A null verdict takes it back: the door reads it as SQL's null.
    p_verdict: p.verdict as string,
  });
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
}
