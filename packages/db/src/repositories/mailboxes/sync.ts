/**
 * A connected mailbox's sync (decision 0056): one at a time (its lease), where it left off (its cursor and watch), and
 * which of the threads that changed hold an email this workspace sent (00422 mailbox_threads_known), so only those are
 * ever fetched. The edge's sync (lib/email/mailbox/mailbox-sync.ts) asks these as the service role.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";
import type { MailboxConnectionRow } from "./connections";

type Db = SupabaseClient<Database>;

/**
 * The mailbox's sync, taken for `leaseMs`: true when this caller has it, false when another (a push and the clock that
 * both reached it) holds it now. The lease lapses by itself, so a sync that died gives it back.
 */
export async function takeMailboxSync(db: Db, id: string, at: Date, leaseMs: number): Promise<boolean> {
  const until = new Date(at.getTime() + leaseMs).toISOString();
  const { data, error } = await db
    .from("mailbox_connections")
    .update({ sync_lease_until: until })
    .eq("id", id)
    .neq("state", "removed")
    .or(`sync_lease_until.is.null,sync_lease_until.lt.${at.toISOString()}`)
    .select("id");
  if (error) throw new Error(`cannot take the mailbox's sync: ${error.message}`);
  return (data ?? []).length > 0;
}

/** Where the sync left off, and the lease given back. A cursor of null keeps the one it had. */
export async function endMailboxSync(
  db: Db,
  p: { id: string; cursor: string | null; at: Date; error?: string | null },
): Promise<void> {
  const { error } = await db
    .from("mailbox_connections")
    .update({
      ...(p.cursor !== null ? { sync_cursor: p.cursor } : {}),
      synced_at: p.at.toISOString(),
      sync_lease_until: null,
      ...(p.error !== undefined ? { last_error: p.error, last_error_at: p.error ? p.at.toISOString() : null } : {}),
    })
    .eq("id", p.id);
  if (error) throw new Error(`cannot end the mailbox's sync: ${error.message}`);
}

/** The watch the provider holds for the mailbox: Graph's subscription id (Gmail has none) and when it lapses. */
export async function keepMailboxWatch(
  db: Db,
  p: { id: string; watchId: string | null; expiresAt: Date; cursor?: string | null },
): Promise<void> {
  const { error } = await db
    .from("mailbox_connections")
    .update({
      watch_id: p.watchId,
      watch_expires_at: p.expiresAt.toISOString(),
      ...(p.cursor ? { sync_cursor: p.cursor } : {}),
    })
    .eq("id", p.id);
  if (error) throw new Error(`cannot keep the mailbox's watch: ${error.message}`);
}

/** One connection by its id, whichever workspace's: a job or a push names it by id alone. */
export async function mailboxConnectionById(db: Db, id: string): Promise<MailboxConnectionRow | null> {
  const { data, error } = await db.from("mailbox_connections").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`cannot read the mailbox: ${error.message}`);
  return data;
}

/** Our outbound email's row by the Message-ID it went under, for a report that quotes one we did not mint. */
export async function sentEmailIdByMessageId(db: Db, tenantId: string, rfcMessageId: string): Promise<string | null> {
  const { data, error } = await db
    .from("messages")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("channel", "email")
    .eq("direction", "outbound")
    .eq("meta->email->>message_id", rfcMessageId)
    .limit(1);
  if (error) throw new Error(`cannot find the email the report is about: ${error.message}`);
  return data?.[0]?.id ?? null;
}

/** Of the provider threads that changed, the ones holding an email this workspace sent (00422). */
export async function knownThreads(db: Db, tenantId: string, threadIds: string[]): Promise<Set<string>> {
  if (threadIds.length === 0) return new Set();
  const { data, error } = await db.rpc("mailbox_threads_known", {
    p_tenant_id: tenantId,
    p_thread_ids: [...new Set(threadIds)],
  });
  if (error) throw new Error(`cannot read which threads are the workspace's: ${error.message}`);
  return new Set(data ?? []);
}
