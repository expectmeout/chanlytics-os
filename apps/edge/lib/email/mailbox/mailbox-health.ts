/**
 * A connected mailbox's health, tended by the mailboxes clock (decision 0056, 8):
 *
 *   its own mail   counted hourly since it was last counted clean (00424 mailbox_connection_counts) and judged by the
 *                  one rule (contracts mailboxHoldOf): any complaint, or bounces or noes past 3%, holds it. Held, it
 *                  sends nothing until its owner resumes it; the Activity log says so, and its owner is told once.
 *   its ramp       the days it has sent on (mailbox_capacity's sent_days) kept on its row, for the page's pace.
 *   its rest       a provider's day that has turned over lifted, so the page stops saying it rests.
 *   its domain     SPF, DKIM, DMARC and MX read again once a day, for the row's records.
 *
 * Each is its own small write, so one that fails is logged and the others still land; the next tick tries again.
 */
import { DAY_MS, HOUR_MS, mailboxHoldOf } from "../../packages/contracts.js";
import {
  emitEvent,
  mailboxCapacityOf,
  mailboxCountsOf,
  patchMailboxConnection,
  type Database,
  type MailboxConnectionRow,
} from "../../packages/db.js";
import { readMailboxDns } from "./mailbox-dns.js";
import { tellHeld } from "./mailbox-notices.js";
import { errField, type Logger } from "../../log.js";
import type { SupabaseClient } from "@supabase/supabase-js";

type Db = SupabaseClient<Database>;

/** How often a mailbox's own mail is judged. */
const JUDGE_EVERY_MS = HOUR_MS;
/** How often its domain's records are read again. */
const DNS_EVERY_MS = DAY_MS;

const older = (iso: string | null, everyMs: number, now: number) => !iso || Date.parse(iso) + everyMs <= now;

/** Judge the mailbox's own mail, and hold it when it earned a hold. The row as it stands after. */
async function judge(db: Db, row: MailboxConnectionRow, log: Logger, now: number): Promise<MailboxConnectionRow> {
  const at = new Date(now).toISOString();
  const counts = await mailboxCountsOf(db, row.id, row.counted_since);
  const why = row.state === "held" ? null : mailboxHoldOf(counts);
  if (why) {
    const held = await patchMailboxConnection(db, {
      tenantId: row.tenant_id,
      id: row.id,
      from: ["connected", "paused"],
      patch: { state: "held", held_why: why, held_at: at, judged_at: at },
    });
    if (held) {
      await emitEvent(db, row.tenant_id, "mailbox_connection.held", "mailbox_connection", row.id, {
        address: row.address,
        why,
        ...counts,
      });
      await tellHeld(db, held, why, at, log);
      log.warn("mailbox_held", { mailbox: row.id, why, ...counts });
      return held;
    }
  }
  return (await patchMailboxConnection(db, { tenantId: row.tenant_id, id: row.id, patch: { judged_at: at } })) ?? row;
}

/**
 * Everything the clock keeps of one mailbox that is due now. Never throws: what fails is logged, and waits a tick. Its
 * DNS is read only before `until` (the sweep's line); after it, the read waits for the next tick.
 */
export async function tendMailboxHealth(
  db: Db,
  row: MailboxConnectionRow,
  log: Logger,
  now = Date.now(),
  until = Number.POSITIVE_INFINITY,
): Promise<MailboxConnectionRow> {
  let current = row;
  const step = async (stage: string, run: () => Promise<MailboxConnectionRow | null | void>) => {
    try {
      const after = await run();
      if (after) current = after;
    } catch (e) {
      log.error("mailbox_health_failed", { mailbox: row.id, stage, error: errField(e) });
    }
  };
  const hourly = older(current.judged_at, JUDGE_EVERY_MS, now);
  if (hourly) await step("judge", () => judge(db, current, log, now));

  await step("day", async () => {
    const patch: { sent_days?: number; resting_until?: null } = {};
    if (current.resting_until && Date.parse(current.resting_until) <= now) patch.resting_until = null;
    // The ramp's step moves at most once a day: its count is read with the hourly judgement.
    if (hourly && current.state !== "held") {
      const day = await mailboxCapacityOf(db, current.id, new Date(now));
      if (day.sent_days !== current.sent_days) patch.sent_days = day.sent_days;
    }
    if (Object.keys(patch).length === 0) return null;
    return patchMailboxConnection(db, { tenantId: current.tenant_id, id: current.id, patch });
  });

  if (older(current.dns_checked_at, DNS_EVERY_MS, now) && Date.now() < until)
    await step("dns", async () => {
      const dns = await readMailboxDns(current.host, current.provider === "microsoft" ? "microsoft" : "google");
      return patchMailboxConnection(db, {
        tenantId: current.tenant_id,
        id: current.id,
        patch: { dns, dns_checked_at: new Date(now).toISOString() },
      });
    });
  return current;
}
