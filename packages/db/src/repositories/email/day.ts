/**
 * A connected mailbox's day (decision 0056; 00424): what it may still send (mailbox_capacity), the one reading the
 * timetable, the claim and the door share, and the mailboxes with sends due that the reach-out clock claims from
 * (reach_out_due_mailboxes). The service role asks both; a read that fails throws.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";

type Db = SupabaseClient<Database>;

/**
 * What a connected mailbox may still send (00424 mailbox_capacity): the one reading the timetable, the claim and the
 * door share. Its day is contracts' mailboxDailyCap of these.
 */
export interface MailboxCapacity {
  state: string;
  clean_since: string | null;
  /** Its provider's own day used up: it sends again from then. */
  resting_until: string | null;
  daily_cap: number;
  customer_domain: boolean;
  /** The days it sent on since it was clean, within the last 90 (D15). */
  sent_days: number;
  /** What left from it in the rolling day: the door's count. */
  sent_today: number;
  /** What it spends in the rolling day: left, of unknown outcome, queued, claimed. */
  used: number;
  /** When it spends each (ms): those of the rolling day, the waiting ones, and the planned ones ahead. */
  recent: number[];
  last_sent_at: string | null;
}

export async function mailboxCapacityOf(db: Db, mailboxId: string, at: Date): Promise<MailboxCapacity> {
  const { data, error } = await db.rpc("mailbox_capacity", { p_mailbox_id: mailboxId, p_at: at.toISOString() });
  if (error) throw new Error(`cannot read the mailbox's day: ${error.message}`);
  return mailboxCapacityFrom(data);
}

/** The capacity as the database answered it (alone, or inside the door's facts): a count it left out is a failed read. */
export function mailboxCapacityFrom(data: unknown): MailboxCapacity {
  const c = (data ?? {}) as Partial<MailboxCapacity>;
  if (typeof c.used !== "number" || typeof c.sent_days !== "number" || typeof c.daily_cap !== "number")
    throw new Error("cannot read the mailbox's day: the database answered without its counts");
  return {
    state: String(c.state ?? ""),
    clean_since: typeof c.clean_since === "string" ? c.clean_since : null,
    resting_until: typeof c.resting_until === "string" ? c.resting_until : null,
    daily_cap: c.daily_cap,
    customer_domain: c.customer_domain === true,
    sent_days: c.sent_days,
    sent_today: Math.max(0, Number(c.sent_today ?? 0) || 0),
    used: c.used,
    recent: Array.isArray(c.recent) ? c.recent.map(Number).filter(Number.isFinite) : [],
    last_sent_at: typeof c.last_sent_at === "string" ? c.last_sent_at : null,
  };
}

/** A connected mailbox with a send due, and its workspace. */
export interface DueMailbox {
  id: string;
  tenant_id: string;
}

/**
 * The connected, rested mailboxes with sends due in runs that go ahead on running chains, longest waiting first
 * (00424), past the workspaces and mailboxes the caller is done with this tick. The lists ride in the call's body, not
 * its address, so their length is no URL's.
 */
export async function dueMailboxes(
  db: Db,
  at: Date,
  limit: number,
  opts: { tenantId?: string; skipTenants?: Iterable<string>; skipMailboxes?: Iterable<string> } = {},
): Promise<DueMailbox[]> {
  const { data, error } = await db.rpc("reach_out_due_mailboxes", {
    p_at: at.toISOString(),
    p_limit: limit,
    ...(opts.tenantId ? { p_tenant_id: opts.tenantId } : {}),
    p_skip_tenants: [...(opts.skipTenants ?? [])],
    p_skip_mailboxes: [...(opts.skipMailboxes ?? [])],
  });
  if (error) throw new Error(`cannot read the mailboxes with sends due: ${error.message}`);
  return data ?? [];
}
