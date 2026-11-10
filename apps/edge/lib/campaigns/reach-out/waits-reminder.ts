/**
 * Cold email that waits for an OK, reminded each morning (decision 0120). A run to leads waiting for its owner has no day
 * to pass, so it waits until answered, and was told once, when it was made. While one waits, its owner gets one line each
 * morning by their own clock (contracts coldWaitsReminderOf: from nine, not after noon, and never on the morning a run
 * began waiting): how many emails wait, in which sequences, since when. The hourly playbooks sweep asks it after its
 * runs, so each workspace's morning is met at its :05.
 *
 * Once a day: the row is kept under a name made of the workspace and its day (onceKeyId), which the bell keeps unique,
 * so the second and third sweeps of a morning write nothing. The bell's row and the phones, no mail: Settings promises
 * no digest by email, and the run's own notice was mailed when it began to wait. The row opens the longest-waiting run
 * and closes with it (contracts notice-closes.ts). A line that could not be kept waits for the next morning: it is a
 * reminder, never the only word of a run.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  coldWaitsNotice,
  coldWaitsReminderKey,
  coldWaitsReminderOf,
  runRoute,
  type TenantId,
} from "@chanlytics/contracts";
import { listWaitingLeadRuns, type WaitingLeadRun } from "@chanlytics/db/campaigns";
import { findNotice } from "@chanlytics/db/notices";
import type { Database } from "@chanlytics/db/types";
import { keepAndPush, onceKeyId } from "../../shared/alerts/notify.js";
import type { Logger } from "../../shared/log.js";

type Db = SupabaseClient<Database>;

/** The waiting runs one sweep reads, longest-waiting first: a workspace beyond them is reminded once those ahead answer. */
const WAITING_RUNS_READ = 500;

/** The waiting runs by workspace, each in the order read (longest-waiting first). */
function byWorkspace(runs: readonly WaitingLeadRun[]): Map<TenantId, WaitingLeadRun[]> {
  const out = new Map<TenantId, WaitingLeadRun[]>();
  for (const run of runs) out.set(run.tenant_id, [...(out.get(run.tenant_id) ?? []), run]);
  return out;
}

/**
 * Writes the morning's line for each workspace with a run to leads that has waited, where it is that business's morning
 * and it was not told today; stops at `deadlineMs`. Answers how many were told.
 */
export async function remindColdEmailWaits(db: Db, now: Date, log: Logger, deadlineMs: number): Promise<number> {
  let runs: WaitingLeadRun[];
  try {
    runs = await listWaitingLeadRuns(db, { limit: WAITING_RUNS_READ });
  } catch (e) {
    log.warn("cold_email_waits_failed", { error: e instanceof Error ? e.message : String(e) });
    return 0;
  }
  let told = 0;
  for (const [tenantId, theirs] of byWorkspace(runs)) {
    if (Date.now() > deadlineMs) break;
    const tz = theirs[0]?.timezone;
    if (!tz) continue;
    const due = coldWaitsReminderOf(theirs, tz, now.getTime());
    const words = due ? coldWaitsNotice(due.runs, tz, now.getTime()) : null;
    if (!due || !words) continue;
    const name = onceKeyId(coldWaitsReminderKey(tenantId, due.day));
    // Told already this morning, by an earlier sweep: nothing more today. A check that fails is said, and the next
    // hour's sweep asks again while it is still morning there.
    const already = await findNotice(db, { tenantId, kind: "playbook", sourceEvent: name }).catch((e: unknown) => {
      log.warn("cold_email_waits_failed", { tenant_id: tenantId, error: e instanceof Error ? e.message : String(e) });
      return "unread" as const;
    });
    if (already) continue;
    const kept = await keepAndPush(
      tenantId,
      {
        kind: "playbook",
        title: words.subject,
        body: words.body,
        // The row opens the run it is about, where its emails are approved, as the run's own notice does.
        route: runRoute(words.runId),
        about: { type: "broadcast", id: words.runId },
        sourceEvent: name,
      },
      db,
    );
    // A row that could not be written is said by the bell's own log; the reminder waits for the next sweep.
    if (!kept) continue;
    told += 1;
    log.info("cold_email_waits_reminded", { tenant_id: tenantId, day: due.day, runs: due.runs.length });
  }
  return told;
}
