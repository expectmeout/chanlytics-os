/**
 * An email a mailbox may have sent, found to be settled (decision 0056): a send whose provider call timed out after it
 * may have taken the email is recorded failed with its outcome unknown (core deliver.ts), and no receipt comes from a
 * mailbox to settle it. The edge looks in the mailbox (lib/email/mailbox/mailbox-reconcile.ts) for the ones read here,
 * and settles each through the email repository (email.ts emailFoundSent, emailNeverLeft). Beside them, the mailboxes
 * clock asked to run now, for a push that must answer its provider at once.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { MIN_MS } from "@chanlytics/contracts";
import type { Database } from "../../database.types";

type Db = SupabaseClient<Database>;

/** An email from a mailbox whose send's outcome is unknown: what to look for it by. */
export interface UnknownMailboxEmail {
  id: string;
  tenantId: string;
  /** The address it was written to, and its subject, as its frozen request says them. */
  to: string | null;
  subject: string | null;
  writtenAt: string;
}

/** The most a mailbox's look reads in one tick: each is a provider read or a few. */
const UNKNOWN_PAGE = 10;
/** How many ids one statement names: a request line past the gateway's 8 KiB is refused. */
const IDS_PER_READ = 100;

type UnknownRow = { id: string; tenant_id: string; meta: unknown; created_at: string };

/**
 * The mailbox's reach-out emails whose send's outcome is unknown, written between `since` and `before` (oldest first):
 * one too new is left for its provider to file it under Sent, and one past `since` is the clock's (it fails a day on).
 */
export async function unknownMailboxEmails(
  db: Db,
  mailboxId: string,
  span: { since: Date; before: Date },
): Promise<UnknownMailboxEmail[]> {
  const sends = await db
    .from("sequence_sends")
    .select("message_id")
    .eq("mailbox_id", mailboxId)
    .eq("state", "queued")
    .not("message_id", "is", null)
    .limit(500);
  if (sends.error) throw new Error(`cannot read the mailbox's sends: ${sends.error.message}`);
  const ids = (sends.data ?? []).flatMap((s) => (s.message_id ? [s.message_id] : []));
  const rows: UnknownRow[] = [];
  for (let i = 0; i < ids.length; i += IDS_PER_READ) {
    const { data, error } = await db
      .from("messages")
      .select("id, tenant_id, meta, created_at")
      .in("id", ids.slice(i, i + IDS_PER_READ))
      .eq("status", "failed")
      .eq("error->>outcome", "unknown")
      .gte("created_at", span.since.toISOString())
      .lte("created_at", span.before.toISOString());
    if (error) throw new Error(`cannot read the mailbox's unsettled emails: ${error.message}`);
    rows.push(...(data ?? []));
  }
  return rows
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .slice(0, UNKNOWN_PAGE)
    .map((m) => {
      const request = (m.meta as { email?: { request?: { to?: unknown; subject?: unknown } } } | null)?.email?.request;
      const to = Array.isArray(request?.to) ? request.to.find((a): a is string => typeof a === "string") : null;
      return {
        id: m.id,
        tenantId: m.tenant_id,
        to: to ?? null,
        subject: typeof request?.subject === "string" ? request.subject : null,
        writtenAt: m.created_at,
      };
    });
}

/** How soon after the last time a push may ask the mailboxes clock to run again: a burst of pushes asks once. */
const SWEEP_AGAIN_MS = MIN_MS;
/** How long Postgres waits on the clock's answer (as 00423's trigger_mailboxes_sweep asks). */
const SWEEP_TIMEOUT_MS = 65_000;

/**
 * The mailboxes clock asked to run now (00423's sweep, through request_sweep: Postgres calls the edge on its own), so a
 * push can answer its provider at once and leave the reading to the clock. Not asked again within a minute of the last
 * request. True when it was asked.
 */
export async function requestMailboxesSweep(db: Db, now: Date): Promise<boolean> {
  const last = await db.from("sweep_status").select("requested_at").eq("sweep", "mailboxes").maybeSingle();
  if (last.error) throw new Error(`cannot read the mailboxes clock: ${last.error.message}`);
  const at = last.data?.requested_at ? Date.parse(last.data.requested_at) : Number.NaN;
  if (Number.isFinite(at) && now.getTime() - at < SWEEP_AGAIN_MS) return false;
  const { error } = await db.rpc("request_sweep", {
    p_sweep: "mailboxes",
    p_path: "/api/cron/mailboxes",
    p_timeout_ms: SWEEP_TIMEOUT_MS,
  });
  if (error) throw new Error(`cannot ask the mailboxes clock: ${error.message}`);
  return true;
}
