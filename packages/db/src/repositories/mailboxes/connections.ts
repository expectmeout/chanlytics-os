/**
 * The mailboxes a business connected to write from (00423, decision 0056): the one place `mailbox_connections` is
 * typed. Members read their workspace's rows on their own client (RLS); the edge writes, as the service role, through
 * these: a connection made or found again (mailbox_connection_connect), its token in Vault (put/get/drop), a guarded
 * change of its state, the clock's reads and its sync's lease. A read or a door that fails throws: "could not check"
 * is not "yes".
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../database.types";

type Db = SupabaseClient<Database>;
export type MailboxConnectionRow = Database["public"]["Tables"]["mailbox_connections"]["Row"];
type Patch = Database["public"]["Tables"]["mailbox_connections"]["Update"];

/** A workspace's mailboxes, removed ones aside, oldest first. */
export async function mailboxConnectionsOf(db: Db, tenantId: string): Promise<MailboxConnectionRow[]> {
  const { data, error } = await db
    .from("mailbox_connections")
    .select("*")
    .eq("tenant_id", tenantId)
    .neq("state", "removed")
    .order("connected_at", { ascending: true });
  if (error) throw new Error(`cannot read the workspace's mailboxes: ${error.message}`);
  return data ?? [];
}

/** One of a workspace's mailboxes, removed or not; null when it is not this workspace's. */
export async function mailboxConnectionOf(db: Db, tenantId: string, id: string): Promise<MailboxConnectionRow | null> {
  const { data, error } = await db
    .from("mailbox_connections")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`cannot read the mailbox: ${error.message}`);
  return data;
}

/** The live mailbox at this address, whichever workspace's: a provider's push names an address, not a workspace. */
export async function liveMailboxByAddress(db: Db, address: string): Promise<MailboxConnectionRow | null> {
  const { data, error } = await db
    .from("mailbox_connections")
    .select("*")
    .eq("address", address.trim().toLowerCase())
    .neq("state", "removed")
    .maybeSingle();
  if (error) throw new Error(`cannot read the mailbox: ${error.message}`);
  return data;
}

/**
 * The mailboxes the clock looks after (connected, paused, held: a signed-out one cannot be read, a removed one is
 * gone), least lately synced first, past the ones it is done with.
 */
export async function mailboxesToTend(
  db: Db,
  limit: number,
  skip: Iterable<string> = [],
): Promise<MailboxConnectionRow[]> {
  let q = db
    .from("mailbox_connections")
    .select("*")
    .in("state", ["connected", "paused", "held"])
    .order("synced_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  const done = [...skip];
  if (done.length) q = q.not("id", "in", `(${done.join(",")})`);
  const { data, error } = await q;
  if (error) throw new Error(`cannot read the mailboxes to tend: ${error.message}`);
  return data ?? [];
}

/** Why a connection was not made, by the door's own word (00423's P0001 hints). */
export type ConnectRefusal = "taken" | "too_many" | "too_many_on_domain";

/**
 * The mailbox's row: made, or the same account's row found again and back to connected (00423
 * mailbox_connection_connect). A refusal the owner causes comes back as its code; anything else throws.
 */
export async function connectMailbox(
  db: Db,
  p: {
    tenantId: string;
    userId: string | null;
    provider: "google" | "microsoft";
    account: string;
    address: string;
    fromName: string;
    scopes: string[];
    customerDomain: boolean;
  },
): Promise<{ ok: true; id: string; made: boolean; state: string } | { ok: false; refused: ConnectRefusal }> {
  const { data, error } = await db.rpc("mailbox_connection_connect", {
    p_tenant_id: p.tenantId,
    p_user_id: p.userId as string,
    p_provider: p.provider,
    p_account: p.account,
    p_address: p.address,
    p_from_name: p.fromName,
    p_scopes: p.scopes,
    p_customer_domain: p.customerDomain,
  });
  if (error) {
    const hint = (error as { hint?: string }).hint ?? "";
    if (hint === "taken" || hint === "too_many" || hint === "too_many_on_domain") return { ok: false, refused: hint };
    throw new Error(`cannot connect the mailbox: ${error.message}`);
  }
  const r = (data ?? {}) as { id?: string; made?: boolean; state?: string };
  if (!r.id) throw new Error("cannot connect the mailbox: no row came back");
  return { ok: true, id: r.id, made: r.made === true, state: String(r.state ?? "connected") };
}

/**
 * A change to one mailbox's row, only from the states named (a stale writer changes nothing and is told so): the
 * row as it now is, or null when it was not in one of them.
 */
export async function patchMailboxConnection(
  db: Db,
  p: { tenantId: string; id: string; from?: readonly string[]; patch: Patch },
): Promise<MailboxConnectionRow | null> {
  let q = db.from("mailbox_connections").update(p.patch).eq("tenant_id", p.tenantId).eq("id", p.id);
  if (p.from?.length) q = q.in("state", [...p.from]);
  const { data, error } = await q.select("*");
  if (error) throw new Error(`cannot change the mailbox: ${error.message}`);
  return data?.[0] ?? null;
}

/* ------------------------------------------------------------------------------------------------ the token */

/** The token, in Vault: a connect writes whatever is there; a refresh names the refresh token it read (00423). */
export async function putMailboxCredentials(
  db: Db,
  p: { id: string; secret: Json; ifRefreshToken?: string | null },
): Promise<"stored" | "changed"> {
  const { error } = await db.rpc("put_mailbox_credentials", {
    p_connection_id: p.id,
    p_secret: p.secret,
    ...(p.ifRefreshToken ? { p_if_refresh_token: p.ifRefreshToken } : {}),
  });
  if (error) {
    // The token changed since it was read (a reconnect stored meanwhile): that one is kept.
    if ((error as { code?: string }).code === "40001") return "changed";
    throw new Error(`cannot store the mailbox's token: ${error.message}`);
  }
  return "stored";
}

export async function getMailboxCredentials(db: Db, id: string): Promise<Json | null> {
  const { data, error } = await db.rpc("get_mailbox_credentials", { p_connection_id: id });
  if (error) throw new Error(`cannot read the mailbox's token: ${error.message}`);
  return data ?? null;
}

export async function dropMailboxCredentials(db: Db, id: string): Promise<boolean> {
  const { data, error } = await db.rpc("drop_mailbox_credentials", { p_connection_id: id });
  if (error) throw new Error(`cannot drop the mailbox's token: ${error.message}`);
  return data === true;
}

/* -------------------------------------------------------------------------------------------- what it sent */

/**
 * What a mailbox's own emails came to since it was counted clean (00424 mailbox_connection_counts, 00466): the
 * mailboxes clock judges its health by them (contracts mailboxHoldOf). A count a database before 00466 does not answer
 * (blocked, said no) reads as none.
 */
export async function mailboxCountsOf(
  db: Db,
  id: string,
  since: string,
): Promise<{
  sent: number;
  bounced: number;
  blocked: number;
  complained: number;
  unsubscribed: number;
  said_no: number;
}> {
  const { data, error } = await db.rpc("mailbox_connection_counts", { p_mailbox_id: id, p_since: since });
  if (error) throw new Error(`cannot count the mailbox's emails: ${error.message}`);
  const c = (data ?? {}) as Record<string, unknown>;
  const n = (k: string): number => Math.max(0, Number(c[k] ?? 0) || 0);
  if (typeof c.sent !== "number") throw new Error("cannot count the mailbox's emails: the database answered no count");
  return {
    sent: n("sent"),
    bounced: n("bounced"),
    blocked: n("blocked"),
    complained: n("complained"),
    unsubscribed: n("unsubscribed"),
    said_no: n("said_no"),
  };
}

/**
 * An email sent from a mailbox, stamped (00424 stamp_email_from_mailbox): the provider's id, the Message-ID a reply
 * cites, the thread the sync reads by, and which mailbox. False when the row was not there.
 */
export async function stampEmailFromMailbox(
  db: Db,
  p: {
    tenantId: string;
    messageId: string;
    providerId: string | null;
    rfcMessageId: string | null;
    threadId: string | null;
    mailboxId: string;
  },
): Promise<boolean> {
  const { data, error } = await db.rpc("stamp_email_from_mailbox", {
    p_tenant_id: p.tenantId,
    p_message_id: p.messageId,
    p_provider_id: p.providerId as string,
    p_rfc_message_id: p.rfcMessageId as string,
    p_thread_id: p.threadId as string,
    p_mailbox_id: p.mailboxId,
  });
  if (error) throw new Error(`cannot stamp the email the mailbox sent: ${error.message}`);
  return data === true;
}

/**
 * The calendar a connected mailbox reads, set on the workspace's settings or taken away (calendar_grant_note, 00478,
 * decision 0073 R20): on as the mailbox connects with its calendar ticked, off as it goes. True when something changed.
 */
export async function noteCalendarGrant(
  db: Db,
  p: { tenantId: string; mailboxId: string; provider: "google" | "microsoft"; on: boolean; by: string | null },
): Promise<boolean> {
  const { data, error } = await db.rpc("calendar_grant_note", {
    p_tenant_id: p.tenantId,
    p_mailbox_id: p.mailboxId,
    p_provider: p.provider,
    p_on: p.on,
    ...(p.by ? { p_by: p.by } : {}),
  });
  if (error) throw new Error(`calendar_grant_note: ${error.message}`);
  return data === true;
}
